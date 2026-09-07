import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getModel } from "@earendil-works/pi-ai/compat";
import { readObservation } from "../dist/task-session/bridge.js";
import { installedHostBuild } from "../dist/task-session/build-identity.js";
import { encodeFrame, FrameDecoder } from "../dist/task-session/channel.js";
import { bytesDigest, digest, parseJson } from "../dist/task-session/json.js";
import { launchReserved } from "../dist/task-session/launch.js";
import { loadHostProfile, loadProfile } from "../dist/task-session/profile.js";
import { durableWrite, physicalIdentity, readSnapshot } from "../dist/task-session/state.js";

const fixture = (name) =>
  fileURLToPath(new URL(`./fixtures/task-session/${name}`, import.meta.url));
const wait = async (predicate) => {
  const end = Date.now() + 12000;
  while (!predicate()) {
    if (Date.now() > end) throw Error("synthetic_wait_timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};
function baselineFor(repo) {
  return {
    task: {
      id: 1,
      repo,
      title: "synthetic",
      description: null,
      status: "pending",
      priority: 1,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      depends_on: [],
      evidence: null,
      result: null,
      created_at: new Date().toISOString(),
      completed_at: null,
      scope: { allowed_paths: ["**"], required_paths: [], forbidden_paths: [] },
      entity_version: 1,
    },
    families: Object.fromEntries(
      [
        "tasks",
        "task_done_contracts",
        "task_guardrails",
        "task_reconciliation_packets",
        "task_deferrals",
        "fcos_task_metadata",
        "repos",
        "dependencies",
        "decision_task_links",
        "decisions",
        "evidence",
        "schema",
        "migrations",
      ].map((k) => [k, []]),
    ),
    effective_deferral: false,
    lease_expired: false,
  };
}
function setup(stop = false) {
  const root = mkdtempSync(join(tmpdir(), "task5480-e2e-")),
    checkout = join(root, "checkout");
  mkdirSync(checkout);
  mkdirSync(join(checkout, ".git"));
  for (const dir of ["profiles", "credentials", "attempts", "agent"])
    mkdirSync(join(root, dir), { mode: 0o700 });
  const lock = join(root, "namespace.lock");
  writeFileSync(lock, "", { mode: 0o600 });
  const rs = lstatSync(root),
    ls = lstatSync(lock);
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "synthetic",
    root,
    uid: process.getuid(),
    rootDev: rs.dev,
    rootIno: rs.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  const domain = {
    akInstance: "synthetic-ak",
    taskId: 1,
    checkout,
    commonGit: join(checkout, ".git"),
    sharedEffects: [],
    physical: {
      checkout: physicalIdentity(checkout),
      commonGit: physicalIdentity(join(checkout, ".git")),
    },
  };
  durableWrite(join(root, "state.json"), {
    schema: "pi.task-session.state.v1",
    namespace: "synthetic",
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [domain],
    attempts: [],
  });
  const credential = {
    type: "oauth",
    access: `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-account" } })).toString("base64url")}.synthetic`,
    refresh: "synthetic",
    expires: Date.now() + 3600000,
  };
  const cd = digest(credential);
  durableWrite(join(root, "credentials", `${cd}.json`), credential, true);
  const pin = {
    schema: "pi.task-session.profile.v1",
    provider: "openai-codex",
    model: "gpt-5.4",
    reasoning: "high",
    account: "synthetic-account",
    modelDigest: bytesDigest(JSON.stringify(getModel("openai-codex", "gpt-5.4"))),
    credentialDigest: cd,
    agentDir: join(root, "agent"),
    runSeconds: 30,
    producer: {
      executable: realpathSync("/usr/bin/true"),
      entrypointDigest: bytesDigest(readFileSync("/usr/bin/true")),
      akBinaryDigest: bytesDigest(readFileSync("/usr/bin/true")),
      policyDigest: "a".repeat(64),
      databaseIdentity: "b".repeat(64),
      hostBuildDigest: installedHostBuild(),
    },
  };
  const reference = digest(pin);
  durableWrite(join(root, "profiles", `${reference}.json`), pin, true);
  const request = {
    schema: "pi.task-session.request.v1",
    requestId: "synthetic-request",
    akInstance: "synthetic-ak",
    taskId: 1,
    cwd: checkout,
    provider: pin.provider,
    model: pin.model,
    reasoning: pin.reasoning,
    account: pin.account,
    profile: reference,
    objective: "write synthetic evidence",
    context: [],
    placement: "window",
  };
  writeFileSync(join(root, "fixture.json"), JSON.stringify({ locator, checkout, stop }));
  return { root, checkout, locator, request, pin };
}
test("provisioned content-addressed profile and credential load is exact and read-only", async () => {
  const f = setup();
  assert.equal((await loadHostProfile(f.locator, f.request.profile)).credential.type, "oauth");
  assert.throws(() => loadProfile(f.locator, "../escape"));
  const path = join(f.root, "credentials", `${f.pin.credentialDigest}.json`);
  writeFileSync(path, "{}");
  await assert.rejects(loadHostProfile(f.locator, f.request.profile));
  assert.equal(readSnapshot(f.locator).attempts.length, 0);
});
for (const defect of [
  "model-digest",
  "account",
  "lifetime",
  "missing-credential",
  "lifetime-during-plan",
]) {
  test(`I03 ${defect}: pre-reservation refusal without spawn`, async (t) => {
    const f = setup(),
      pin = structuredClone(f.pin);
    if (defect === "model-digest") pin.modelDigest = "0".repeat(64);
    if (defect === "missing-credential") pin.credentialDigest = "0".repeat(64);
    if (defect === "account" || defect === "lifetime") {
      const c = parseJson(
        readFileSync(join(f.root, "credentials", `${pin.credentialDigest}.json`)),
      );
      if (defect === "account")
        c.access = `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "wrong-account" } })).toString("base64url")}.synthetic`;
      else c.expires = Date.now() + 1000;
      pin.credentialDigest = digest(c);
      durableWrite(join(f.root, "credentials", `${pin.credentialDigest}.json`), c, true);
    }
    const reference = digest(pin);
    if (reference !== f.request.profile)
      durableWrite(join(f.root, "profiles", `${reference}.json`), pin, true);
    const before = readFileSync(join(f.root, "state.json"));
    const calls = { plan: 0, viewer: 0, supervisor: 0, network: 0 };
    t.mock.method(globalThis, "fetch", () => {
      calls.network++;
      throw Error("unexpected_network");
    });
    await assert.rejects(
      launchReserved({ ...f.request, profile: reference }, f.locator, {
        plan: async () => {
          calls.plan++;
          if (defect !== "lifetime-during-plan") throw Error("unexpected_plan");
          const now = Date.now;
          t.mock.method(Date, "now", () => now() + 3600000);
          const baseline = baselineFor(f.checkout);
          return {
            protocol: "ak.task-session.baseline.v1",
            evaluated_at: new Date().toISOString(),
            baseline_digest: digest(baseline),
            baseline,
          };
        },
        openViewer: async () => {
          calls.viewer++;
          return { ok: true };
        },
        supervise: async () => {
          calls.supervisor++;
        },
      }),
      defect === "model-digest"
        ? /model_pin_mismatch/
        : defect === "missing-credential"
          ? /ENOENT/
          : /auth_refresh_required_or_account_mismatch/,
    );
    t.mock.restoreAll();
    assert.deepEqual(calls, {
      plan: defect === "lifetime-during-plan" ? 1 : 0,
      viewer: 0,
      supervisor: 0,
      network: 0,
    });
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.equal(readSnapshot(f.locator).attempts.length, 0);
    const { readdirSync } = await import("node:fs");
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  });
}
for (const scenario of [
  "complete",
  "real-tui",
  "stop",
  "topology-after-send",
  "lost-supervisor",
  "wrong-binding",
  "post-closed-write-failure",
  "denied-accounting",
  "expired-startup",
  "malformed-bootstrap",
  "profile-binding",
])
  test(`real private startup/bridge processes: ${scenario}`, async () => {
    const f = setup(scenario === "stop"),
      lock = join(f.root, "ak.lock");
    writeFileSync(lock, "", { mode: 0o600 });
    const binary = join(f.root, "synthetic-supervisor");
    assert.equal(
      spawnSync("/usr/bin/cc", [
        "-Wall",
        "-Wextra",
        "-Werror",
        "-o",
        binary,
        fixture("startup-supervisor.c"),
      ]).status,
      0,
    );
    if (scenario === "topology-after-send") {
      const cfg = JSON.parse(readFileSync(join(f.root, "fixture.json"), "utf8"));
      cfg.topologyDrift = true;
      writeFileSync(join(f.root, "fixture.json"), JSON.stringify(cfg));
    }
    let viewer, supervisor;
    let attempt;
    try {
      await launchReserved(f.request, f.locator, {
        plan: async () => {
          const baseline = baselineFor(f.checkout);
          return {
            protocol: "ak.task-session.baseline.v1",
            evaluated_at: new Date().toISOString(),
            baseline_digest: digest(baseline),
            baseline,
          };
        },
        openViewer: async (id) => {
          if (scenario === "real-tui") {
            viewer = spawn(
              "/usr/bin/python3",
              [
                fixture("pty-viewer.py"),
                process.execPath,
                fixture("startup-real-tui.mjs"),
                f.root,
                id,
              ],
              { stdio: "ignore" },
            );
            return { ok: true };
          }
          viewer = spawn(process.execPath, [fixture("startup-viewer.mjs"), f.root, id], {
            stdio: ["ignore", "ignore", "pipe"],
          });
          return { ok: true };
        },
        supervise: async (input) => {
          attempt = input.attempt;
          supervisor = spawn(
            binary,
            [lock, process.execPath, fixture("startup-host.mjs"), f.root],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          supervisor.stderr.on("data", (d) => process.stderr.write(d));
          const decoder = new FrameDecoder(),
            frames = [];
          supervisor.stdout.on("data", (chunk) => frames.push(...decoder.push(chunk)));
          const deadline = Date.now() + 10000;
          const seed = {
            schema: "pi.task-session.host-bootstrap.v1",
            attempt: attempt.attempt,
            incarnation: attempt.incarnation,
            startupDeadline: deadline,
            actor: `pi-task-${attempt.incarnation}`,
            leaseSeconds: 30,
            baselineDigest: input.baselineDigest,
            ...Object.fromEntries(
              Object.entries(f.pin.producer).filter(
                ([k]) => k !== "executable" && k !== "entrypointDigest",
              ),
            ),
          };
          if (scenario === "expired-startup") seed.startupDeadline = Date.now() - 1;
          if (scenario === "malformed-bootstrap") seed.exec = "/bin/sh";
          if (scenario === "profile-binding") seed.policyDigest = "0".repeat(64);
          supervisor.stdin.write(encodeFrame(seed));
          await wait(() => frames.length || existsSync(join(f.root, "host-result.json")));
          if (["expired-startup", "malformed-bootstrap", "profile-binding"].includes(scenario)) {
            assert.equal(frames.length, 0);
            supervisor.stdin.end();
            return;
          }
          assert.ok(
            frames.length,
            `host constructed PREPARED: ${existsSync(join(f.root, "host-result.json")) ? readFileSync(join(f.root, "host-result.json"), "utf8") : ""}`,
          );
          const prepared = frames.shift();
          assert.equal(prepared.kind, "PREPARED");
          assert.equal(existsSync(join(f.root, "send.json")), false);
          assert.notEqual(spawnSync("/usr/bin/flock", ["-n", lock, "/bin/true"]).status, 0);
          if (scenario === "lost-supervisor") {
            supervisor.stdin.end();
            return;
          }
          const admission = {
            protocol: "ak.task-session.v1",
            kind: "ADMISSION_RESULT",
            binding: { ...prepared.binding },
            body: {
              outcome: "ADMITTED",
              baseline_digest: seed.baselineDigest,
              readback_digest: "d".repeat(64),
              claim: {
                task_id: 1,
                repo: f.checkout,
                version: 2,
                claimed_by: seed.actor,
                claimed_at: new Date().toISOString(),
                lease_expires_at: new Date(Date.now() + 30000).toISOString(),
              },
              effects: "committed_verified",
              reason: "native_claim_verified",
              accounting: {
                task_version_before: 1,
                task_version_after: 2,
                restored_evidence_attachments_preserved: true,
                expired_deferrals: [],
                governance_receipt_ids: ["1"],
                event_ids: ["1"],
              },
            },
          };
          if (scenario === "denied-accounting") admission.body.accounting = null;
          if (scenario === "wrong-binding") admission.binding.incarnation = "wrong";
          supervisor.stdin.write(encodeFrame(admission));
          await wait(() => frames.length || existsSync(join(f.root, "host-result.json")));
          if (scenario === "wrong-binding" || scenario === "denied-accounting") {
            assert.equal(frames.length, 0);
            supervisor.stdin.end();
            return;
          }
          const t1 = frames.shift(),
            dir = join(f.root, "attempts", attempt.attempt, attempt.incarnation);
          assert.deepEqual(
            parseJson(readFileSync(join(dir, "t1.json"))),
            t1,
            "independent durable T1 readback",
          );
          assert.equal(existsSync(join(f.root, "send.json")), false);
          if (scenario === "post-closed-write-failure")
            mkdirSync(join(dir, "dispatch.json"), { mode: 0o700 });
          supervisor.stdin.write(
            encodeFrame({
              protocol: "ak.task-session.v1",
              kind: "CLOSED",
              binding: prepared.binding,
              body: { outcome: t1.body.outcome, t1_digest: digest(t1) },
            }),
          );
        },
      });
      await wait(() => existsSync(join(f.root, "host-result.json")));
      const result = JSON.parse(readFileSync(join(f.root, "host-result.json"), "utf8"));
      if (scenario === "complete" || scenario === "real-tui") {
        assert.equal(result.sends, 2);
        assert.equal(readFileSync(join(f.checkout, "proof.txt"), "utf8"), "synthetic e2e");
        assert.ok(
          readObservation(f.locator, attempt.attempt).events.some((e) => e.type === "tool_end"),
        );
      } else {
        assert.equal(result.sends, ["stop", "topology-after-send"].includes(scenario) ? 1 : 0);
        assert.equal(existsSync(join(f.checkout, "proof.txt")), false);
      }
      if (!result.closedVerified)
        assert.notEqual(
          spawnSync("/usr/bin/flock", ["-n", lock, "/bin/true"]).status,
          0,
          "host retains OFD after supervisor loss",
        );
      assert.equal(readFileSync(lock).length, 0, "SDK stdio cannot corrupt the AK lock file");
      if (scenario === "real-tui")
        assert.match(readFileSync(join(f.root, "tty-output"), "utf8"), /RESERVED|active/);
      const state = readSnapshot(f.locator);
      assert.equal(state.attempts.length, 1);
      assert.equal(state.attempts[0].claimResolved, false);
      assert.equal(state.attempts[0].effectsDisposed, false);
      assert.equal(state.attempts[0].hostClosed, false);
      let effects = 0;
      const repeat = () =>
        launchReserved(f.request, f.locator, {
          openViewer: async () => {
            effects++;
            return { ok: true };
          },
          supervise: async () => {
            effects++;
          },
        });
      if (scenario === "topology-after-send")
        await assert.rejects(repeat, /domain_git_topology_changed/);
      else assert.equal((await repeat()).status, "existing");
      assert.equal(effects, 0);
    } finally {
      writeFileSync(join(f.root, "fixture-release"), "release owned synthetic holder");
      writeFileSync(join(f.root, "viewer-action"), "q");
      supervisor?.stdin.end();
      if (viewer) await wait(() => viewer.exitCode !== null);
      if (supervisor) await wait(() => supervisor.exitCode !== null);
    }
  });

test("actual AK supervisor source and Pi startup exchange, scripted native worker (not G1)", async () => {
  const { encodeTaskSessionStartup } = await import("../dist/task-session/producer-adapter.js");
  const f = setup(),
    db = join(f.root, "synthetic.db"),
    locks = join(f.root, "ak-locks");
  assert.equal(
    bytesDigest(readFileSync(fixture("ak-supervisor.py"))),
    readFileSync(fixture("ak-supervisor.sha256"), "utf8").trim(),
  );
  mkdirSync(locks, { mode: 0o700 });
  writeFileSync(db, "synthetic-not-a-live-database", { mode: 0o600 });
  const stat = lstatSync(db);
  const lock = join(locks, `db-${bytesDigest(db)}.lock`);
  writeFileSync(lock, "", { mode: 0o600 });
  const worker = join(f.root, "native-worker");
  writeFileSync(worker, readFileSync(fixture("synthetic-native-worker.py")), { mode: 0o700 });
  const host = join(f.root, "host");
  writeFileSync(
    host,
    `#!/usr/bin/python3\nimport os\nos.execv(${JSON.stringify(process.execPath)},${JSON.stringify([process.execPath, fixture("startup-host.mjs"), f.root])})\n`,
    { mode: 0o700 },
  );
  const protocol = readFileSync(
    new URL("../dist/task-session/task-session-protocol-v1.json", import.meta.url),
  );
  writeFileSync(join(f.root, "protocol.json"), protocol, { mode: 0o600 });
  const policy = {
    schema_version: 1,
    status: "normal",
    operator_entrypoint: { kind: "exclusive_runtime_gate" },
    admission_gate: {
      protocol: "flock_exclusive_v1",
      gates_reads_and_writes: true,
      lock_identity: "sha256_of_canonical_database_path",
      location_kind: "stable_home_state",
      lock_directory: locks,
    },
    approved_binary: { path: worker, sha256: bytesDigest(readFileSync(worker)) },
    database: { path: db },
    task_session: {
      bulk_recovery_suspended: true,
      host_sha256: bytesDigest(readFileSync(host)),
      host_build_digest: installedHostBuild(),
      protocol_sha256: bytesDigest(protocol),
      supervisor_sha256: bytesDigest(readFileSync(fixture("ak-supervisor.py"))),
    },
  };
  const policyBytes = JSON.stringify(policy);
  writeFileSync(join(f.root, "policy.json"), policyBytes, { mode: 0o600 });
  f.pin.producer.akBinaryDigest = policy.approved_binary.sha256;
  f.pin.producer.policyDigest = bytesDigest(policyBytes);
  f.pin.producer.databaseIdentity = digest({ path: db, device: stat.dev, inode: stat.ino });
  f.request.profile = digest(f.pin);
  durableWrite(join(f.root, "profiles", `${f.request.profile}.json`), f.pin, true);
  let viewer, attempt;
  try {
    await launchReserved(f.request, f.locator, {
      plan: async () => {
        const baseline = baselineFor(f.root);
        return {
          protocol: "ak.task-session.baseline.v1",
          evaluated_at: new Date().toISOString(),
          baseline_digest: digest(baseline),
          baseline,
        };
      },
      openViewer: async (id) => {
        viewer = spawn(process.execPath, [fixture("startup-viewer.mjs"), f.root, id], {
          stdio: "ignore",
        });
        return { ok: true };
      },
      supervise: async (input) => {
        attempt = input.attempt;
        await new Promise((resolve, reject) => {
          const child = spawn("/usr/bin/python3", [fixture("run-owner-supervisor.py"), f.root], {
            stdio: ["pipe", "pipe", "pipe"],
          });
          let out = "",
            err = "";
          child.stdout.on("data", (d) => (out += d));
          child.stderr.on("data", (d) => (err += d));
          child.once("error", reject);
          child.once("exit", (code) => {
            try {
              assert.equal(code, 0, err);
              assert.equal(JSON.parse(out).outcome, "ADMITTED");
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          child.stdin.end(JSON.stringify(encodeTaskSessionStartup(input)));
        });
      },
    });
    await wait(() => existsSync(join(f.root, "host-result.json")));
    assert.equal(JSON.parse(readFileSync(join(f.root, "host-result.json"), "utf8")).sends, 2);
    assert.equal(readFileSync(join(f.checkout, "proof.txt"), "utf8"), "synthetic e2e");
    const dir = join(f.root, "attempts", attempt.attempt, attempt.incarnation);
    assert.ok(existsSync(join(dir, "ak-admission.json")));
    assert.ok(existsSync(join(dir, "dispatch.json")));
    assert.equal(readFileSync(db, "utf8"), "synthetic-not-a-live-database");
  } finally {
    writeFileSync(join(f.root, "fixture-release"), "owned fixture only");
    writeFileSync(join(f.root, "viewer-action"), "q");
    if (viewer) await wait(() => viewer.exitCode !== null);
  }
});
