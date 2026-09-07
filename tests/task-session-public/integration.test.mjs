import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { available, digest, json, native, setup, sha, wait } from "./fixture.mjs";

if (!process.env.TASK5480_PUBLIC_PACKET) throw Error("frozen_public_packet_required_no_skip");
const packet = json(process.env.TASK5480_PUBLIC_PACKET),
  loader = join(import.meta.dirname, "client-loader.mjs");
function invoke(f, op, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        loader,
        f.config.usePiProjection
          ? join(import.meta.dirname, "projection-client.mjs")
          : join(f.config.runtime, "dist/task-session/bin.js"),
        op,
        ...(typeof input === "string" ? [input] : []),
      ],
      {
        cwd: f.root,
        env: {
          PATH: "/usr/bin:/bin",
          LANG: "C.UTF-8",
          TMPDIR: f.root,
          TASK5480_FIXTURE_ROOT: f.root,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      try {
        resolve({ code, value: JSON.parse(out), err });
      } catch {
        reject(Error(`invalid_public_cli_output ${code}: ${out} ${err}`));
      }
    });
    child.stdin.end(input && typeof input !== "string" ? JSON.stringify(input) : undefined);
  });
}
const family = (f) =>
  Object.fromEntries(
    readdirSync(f.root)
      .filter((n) => n.startsWith("new-synthetic.db"))
      .sort()
      .map((n) => [n, sha(readFileSync(join(f.root, n)))]),
  );
function lines(path) {
  return existsSync(path)
    ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
    : [];
}
function stopViewer(f) {
  const path = join(f.root, "public-viewer-pid.json");
  if (!existsSync(path)) return;
  const p = json(path);
  try {
    const stat = readFileSync(`/proc/${p.pid}/stat`, "utf8").split(") ")[1].split(" ");
    if (stat[19] === p.start) process.kill(p.pid, "SIGTERM");
  } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "ESRCH") throw e;
  }
}
for (const scenario of ["complete", "alias", "tool"])
  test(`public CLI/owner describe+plan/native admission+SDK+synthetic PTY: ${scenario}`, async (t) => {
    const f = await setup(packet, scenario);
    t.diagnostic(f.root);
    t.after(() => stopViewer(f));
    const ns = readFileSync(join(f.ns, "state.json")),
      db = family(f),
      oracle = native(f.pins, f.root, "--fault-oracle");
    const capability = await invoke(f, "capability");
    assert.equal(capability.code, 0);
    assert.equal(capability.value.admissionAvailable, true, JSON.stringify(capability));
    assert.equal(capability.value.authority, false);
    assert.equal(capability.value.configuration.worker_test_support, false);
    const plan = await invoke(f, "plan", f.request);
    assert.equal(plan.code, 0);
    assert.equal(plan.value.launchable, true, JSON.stringify(plan));
    assert.equal(plan.value.authority, false);
    assert.equal(plan.value.owner.worker.sha256, f.bindings.worker.sha256);
    assert.deepEqual(plan.value.owner.ordinary_binary, f.bindings.ordinary_binary);
    assert.deepEqual(family(f), db);
    assert.deepEqual(readFileSync(join(f.ns, "state.json")), ns);
    assert.deepEqual(readdirSync(join(f.ns, "attempts")), []);
    assert.deepEqual(native(f.pins, f.root, "--fault-oracle"), oracle);
    const launch = await invoke(f, "launch", f.request);
    assert.equal(launch.code, 0, JSON.stringify(launch));
    assert.equal(launch.value.status, "supervisor_started");
    const attempt = launch.value.attempt,
      dir = join(f.ns, "attempts", attempt.attempt, attempt.incarnation);
    await wait(() => existsSync(join(f.root, "public-sends.jsonl")), "actual public host send");
    assert.equal(available(f.lock), true, "provider dispatch only after actual T2 unlock/CLOSED");
    await wait(() => existsSync(join(dir, "host-terminal.json")), "actual public host terminal");
    await wait(() => available(f.lock), "host released its own custody after verified CLOSED");
    const sends = lines(join(f.root, "public-sends.jsonl"));
    assert.equal(sends.length, 2);
    assert.deepEqual(lines(join(f.root, "public-custody.jsonl")), [
      { kind: "ADMISSION_RESULT", available: false, lockBytes: 0 },
      { kind: "T1_PUBLISHED", available: false, lockBytes: 0 },
      { kind: "CLOSED", available: true, lockBytes: 0 },
    ]);
    assert(sends.every((s) => s.account && s.authorization && s.hasObjective));
    assert.equal(sends[1].hasToolResult, true);
    assert(sends.every((s) => s.model === f.config.expectedModel));
    assert.equal(
      readFileSync(join(f.checkout, "src/proof.txt"), "utf8"),
      "task5480 public SDK proof",
    );
    assert.equal(
      json(join(dir, "dispatch.json")).modelResolution.resolved.model,
      f.config.expectedModel,
    );
    const inspection = await invoke(f, "inspect");
    assert.equal(inspection.code, 0);
    assert.equal(inspection.value.attempts.length, 1);
    assert.equal(inspection.value.attempts[0].claimResolved, false);
    assert.equal(native(f.pins, f.root, "--inspect").task.status, "claimed");
    const before = lines(join(f.root, "public-ports.jsonl")).length;
    const replay = await invoke(f, "launch", f.request);
    assert.equal(replay.value.status, "existing");
    assert.equal(lines(join(f.root, "public-ports.jsonl")).length, before);
    unlinkSync(join(f.ns, "producer.json"));
    assert.equal((await invoke(f, "capability")).value.admissionAvailable, false);
    assert.equal(
      (await invoke(f, "inspect")).value.attempts.length,
      1,
      "worker/config loss preserves DB-free history",
    );
    assert.equal((await invoke(f, "launch", f.request)).value.status, "existing");
    assert(existsSync(join(f.root, "public-pty.log")));
  });
for (const fault of [
  "missing-publication",
  "not-published",
  "disabled",
  "recovery-only",
  "profile-worker",
  "policy-bytes",
  "closure-bytes",
  "unsupported-protocol",
  "worker-missing",
  "gate-bytes",
  "public-override",
  "builtin-max",
  "owner-off-null",
])
  test(`public refusal before launch effects: ${fault}`, async (t) => {
    const f = await setup(packet, fault);
    t.diagnostic(f.root);
    const ns = readFileSync(join(f.ns, "state.json")),
      db = family(f);
    const baseline = await invoke(f, "plan", f.request);
    assert.equal(baseline.value.launchable, true, JSON.stringify(baseline));
    writeFileSync(join(f.root, "public-ports.jsonl"), "");
    const publication = json(join(f.ns, "producer.json"));
    if (fault === "public-override") f.request.executable = "/bin/sh";
    if (fault === "gate-bytes") {
      chmodSync(f.bindings.gate_path, 0o700);
      writeFileSync(
        f.bindings.gate_path,
        `#!/bin/sh\ntouch ${join(f.root, "forbidden-gate-marker")}\n`,
      );
    }
    if (fault === "builtin-max") {
      f.pin.reasoning = f.request.reasoning = "max";
      f.request.profile = digest(f.pin);
      f.state.durableWrite(join(f.ns, "profiles", `${f.request.profile}.json`), f.pin, true);
    }
    if (fault === "owner-off-null") {
      const { loadOwnerModel } = await import(
        join(f.config.runtime, "dist/task-session/model-source.js")
      );
      const source = json(join(f.ns, "model-sources", `${f.pin.modelSourceDigest}.json`));
      const model = structuredClone(
        loadOwnerModel(f.locator, f.pin.modelSourceDigest, source.requested).model,
      );
      source.metadata.thinkingLevelMap = model.thinkingLevelMap = Object.fromEntries(
        ["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((k) => [k, null]),
      );
      f.pin.reasoning = f.request.reasoning = "off";
      f.pin.modelSourceDigest = digest(source);
      f.pin.modelDigest = sha(JSON.stringify(model));
      f.request.profile = digest(f.pin);
      f.state.durableWrite(
        join(f.ns, "model-sources", `${f.pin.modelSourceDigest}.json`),
        source,
        true,
      );
      f.state.durableWrite(join(f.ns, "profiles", `${f.request.profile}.json`), f.pin, true);
    }
    if (fault === "missing-publication") unlinkSync(join(f.ns, "producer.json"));
    if (fault === "not-published") {
      publication.publication = "draft";
      writeFileSync(join(f.ns, "producer.json"), JSON.stringify(publication));
    }
    if (["disabled", "recovery-only"].includes(fault)) {
      const p = json(f.policyPath);
      p.task_session.state = fault;
      writeFileSync(f.policyPath, JSON.stringify(p));
      publication.bindings.policy_sha256 = sha(readFileSync(f.policyPath));
      writeFileSync(join(f.ns, "producer.json"), JSON.stringify(publication));
      f.pin.producer.policyDigest = publication.bindings.policy_sha256;
    }
    if (fault === "profile-worker") f.pin.producer.akBinaryDigest = "0".repeat(64);
    if (fault === "policy-bytes")
      writeFileSync(f.policyPath, `${readFileSync(f.policyPath, "utf8")}\n`);
    if (fault === "closure-bytes") {
      const path = join(f.owner, "scripts/ak-task-session-binding.py");
      chmodSync(path, 0o600);
      writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    }
    if (fault === "unsupported-protocol") {
      publication.bindings.protocol_sha256 = "0".repeat(64);
      writeFileSync(join(f.ns, "producer.json"), JSON.stringify(publication));
    }
    if (fault === "worker-missing") {
      publication.bindings.worker.path = join(f.root, "absent-worker");
      writeFileSync(join(f.ns, "producer.json"), JSON.stringify(publication));
    }
    if (["disabled", "recovery-only", "profile-worker"].includes(fault)) {
      f.request.profile = digest(f.pin);
      f.state.durableWrite(join(f.ns, "profiles", `${f.request.profile}.json`), f.pin, true);
    }
    const result = await invoke(f, "launch", f.request);
    assert.equal(result.code, 2);
    assert.equal(result.value.schema, "pi.task-session.error.v1");
    assert.deepEqual(readFileSync(join(f.ns, "state.json")), ns);
    assert.deepEqual(readdirSync(join(f.ns, "attempts")), []);
    assert.deepEqual(family(f), db);
    assert.equal(existsSync(join(f.root, "public-sends.jsonl")), false);
    assert.equal(existsSync(join(f.root, "forbidden-gate-marker")), false);
    const ports = lines(join(f.root, "public-ports.jsonl"));
    if (
      [
        "public-override",
        "builtin-max",
        "owner-off-null",
        "profile-worker",
        "gate-bytes",
        "closure-bytes",
        "worker-missing",
        "unsupported-protocol",
        "missing-publication",
        "not-published",
      ].includes(fault)
    )
      assert.equal(ports.length, 0, JSON.stringify(ports));
    assert(ports.every((p) => p.operation === "execFile" && p.args[2] === "describe"));
  });

test("public stop after actual native CLOSED and first send blocks tools/second send without releasing claim", async (t) => {
  const f = await setup(packet, "stop");
  t.diagnostic(f.root);
  t.after(() => {
    writeFileSync(join(f.root, "public-stop-issued"), "cleanup");
    stopViewer(f);
  });
  const launch = await invoke(f, "launch", f.request);
  assert.equal(launch.code, 0, JSON.stringify(launch));
  await wait(() => existsSync(join(f.root, "public-sends.jsonl")), "first send");
  const stop = await invoke(f, "stop", f.request.requestId);
  assert.equal(stop.code, 0, JSON.stringify(stop));
  writeFileSync(join(f.root, "public-stop-issued"), "issued");
  const a = launch.value.attempt;
  await wait(
    () => existsSync(join(f.ns, "attempts", a.attempt, a.incarnation, "host-terminal.json")),
    "stop terminal",
  );
  assert.equal(lines(join(f.root, "public-sends.jsonl")).length, 1);
  assert.equal(existsSync(join(f.checkout, "src/proof.txt")), false);
  assert.equal(native(f.pins, f.root, "--inspect").task.status, "claimed");
  assert.equal((await invoke(f, "inspect")).value.attempts[0].claimResolved, false);
});
