// These are static/oracle-unit checks, explicitly NOT native integration passes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { claimEffects, exchange } from "./oracles.mjs";
import { canonical, digest, head, json } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(here));
const ak = "/home/tryinget/ai-society/softwareco/owned/agent-kernel";
const read = (path) => readFileSync(path, "utf8");

test("static: all root harness JavaScript parses without loading the SDK or AK", () => {
  for (const file of [
    ...readdirSync(here)
      .filter((p) => p.endsWith(".mjs"))
      .map((p) => join(here, p)),
    ...readdirSync(join(root, "scripts"))
      .filter((n) => n.startsWith("task-session-native") && n.endsWith(".mjs"))
      .map((n) => join(root, "scripts", n)),
  ]) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});
test("static: test supervisor syntax without pycache or producer execution", () => {
  const result = spawnSync(
    "/usr/bin/python3",
    [
      "-B",
      "-c",
      'import sys; compile(open(sys.argv[1]).read(),sys.argv[1],"exec")',
      join(here, "supervisor.py"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});
test("static: current AK fixture includes actual production worker/identity and bounded synthetic API", () => {
  const source = read(join(ak, "crates/ak-cli/tests/task_session_native_process.rs"));
  for (const name of ["task_session", "task_session_identity"])
    assert(source.includes(`#[path = "../src/${name}.rs"]`));
  assert(source.includes('task_session::run_owner_private(path, &root.join("policy.json"))'));
  for (const name of [
    "--initialize",
    "--inspect",
    "--drift",
    "--reassign",
    "native-exit-after-result",
    "new-synthetic.db",
    "task5479-native-process-",
  ])
    assert(source.includes(name), name);
  assert(!read(join(here, "fixture.mjs")).includes("synthetic-native-worker.py"));
  assert(!read(join(here, "supervisor.py")).includes("class Supervisor"));
});
test("static: actual producer wire definitions match emitted Pi consumer (not readiness)", () => {
  const producer = json(join(ak, "docs/project/contracts/task-session-protocol-v1.json"));
  const consumer = json(
    join(root, "packages/pi-little-helpers/dist/task-session/task-session-protocol-v1.json"),
  );
  assert.deepEqual(consumer.$defs, producer.$defs);
  assert.deepEqual(consumer.allOf, producer.allOf);
});
test("static: public producer fence and host fence remain in source", () => {
  const adapter = read(
    join(root, "packages/pi-society-orchestrator/src/runtime/task-session-adapter.ts"),
  );
  assert.match(adapter, /integrationReady: false/);
  assert.match(adapter, /function requireTaskSessionProducer\(\): never/);
  const host = read(join(root, "packages/pi-little-helpers/src/task-session/host-entry.ts"));
  assert(host.indexOf("native().adoptCustody()") < host.indexOf('import("./startup.js")'));
  assert(host.includes("requireTaskSessionProducer();"));
});
test("static: artifact absence stops freeze before any synthetic DB or SDK operation", () => {
  const receipt = join(ak, "docs/project/contracts/task-session-verification-v1.json");
  const output = join(process.env.TMPDIR, `task5513-must-not-freeze-${process.pid}.json`);
  const absent = join(process.env.TMPDIR, `task5513-no-artifact-${process.pid}`);
  assert(!existsSync(absent));
  assert(!existsSync(output));
  const result = spawnSync(
    process.execPath,
    [
      join(root, "scripts/task-session-native-integration.mjs"),
      "freeze",
      ak,
      receipt,
      absent,
      absent,
      head(root),
      output,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 78);
  assert.match(result.stderr, /PENDING_ARTIFACT/);
  assert(!existsSync(output));
});
test("oracle-unit: canonical digest agrees with independent Python, not runtime serializer", () => {
  const value = { z: [false, null, 17], a: { text: "synthetic λ", b: true } };
  const result = spawnSync(
    "/usr/bin/python3",
    [
      "-B",
      "-c",
      'import json,hashlib,sys; print(hashlib.sha256(json.dumps(json.load(sys.stdin),sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest())',
    ],
    { input: JSON.stringify(value), encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), digest(value));
  assert.equal(canonical({ b: 2, a: 1 }), '{"a":1,"b":2}');
});
test("oracle-unit: independent exchange oracle rejects binding/order/replay and effect drift", () => {
  // Pure oracle inputs, never executed as a worker/admission fixture.
  const before = {
    task: {
      id: 1,
      repo: "/synthetic",
      title: "literal",
      status: "pending",
      entity_version: 1,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
    },
    families: { tasks: [{ title: "literal", status: "pending" }], schema: [{ name: "tasks" }] },
  };
  const after = structuredClone(before);
  Object.assign(after.task, {
    status: "claimed",
    entity_version: 2,
    claimed_by: "test",
    claimed_at: "t0",
    lease_expires_at: "lease",
  });
  after.families.tasks[0].status = "claimed";
  const claim = {
    task_id: 1,
    repo: "/synthetic",
    version: 2,
    claimed_by: "test",
    claimed_at: "t0",
    lease_expires_at: "lease",
  };
  claimEffects(before, after, claim);
  const binding = { attempt: "oracle-only" };
  const prepared = { kind: "PREPARED", binding };
  const admission = {
    kind: "ADMISSION_RESULT",
    binding,
    body: { effects: "committed_verified", readback_digest: digest(after) },
  };
  const t1 = {
    kind: "T1_PUBLISHED",
    binding,
    body: { outcome: "ADMITTED", admission_digest: digest(admission) },
  };
  const closed = { kind: "CLOSED", binding, body: { outcome: "ADMITTED", t1_digest: digest(t1) } };
  const events = [prepared, admission, t1, closed].map((value, i) => ({
    event: i % 2 ? "receive" : "send",
    value,
  }));
  events.push({ event: "fetch" });
  exchange(events, admission, t1, after);
  assert.throws(() => exchange([events.at(-1), ...events.slice(0, -1)], admission, t1, after));
  assert.throws(() => exchange([...events, events[3]], admission, t1, after));
  assert.throws(() => exchange(events, admission, { ...t1, binding: { attempt: "wrong" } }, after));
  for (const mutate of [
    (v) => {
      v.task.title = "unexpected";
    },
    (v) => {
      v.families.schema.push({ name: "extra" });
    },
  ]) {
    const drift = structuredClone(after);
    mutate(drift);
    assert.throws(() => claimEffects(before, drift, claim));
  }
});
