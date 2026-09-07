import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
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

// DEP-R1 replacement matrix is additive. Historical 17-per-schema case names/receipts stay intact.
function hostExited(f) {
  const p = json(join(f.root, "public-host-pid.json"));
  try {
    const fields = readFileSync(`/proc/${p.pid}/stat`, "utf8").split(") ")[1].split(" ");
    return fields[19] !== p.start || fields[0] === "Z";
  } catch (e) {
    if (e.code === "ENOENT") return true;
    throw e;
  }
}
function describeOwner(f) {
  return JSON.parse(
    execFileSync(f.bindings.gate_path, ["--", "task-session", "describe"], {
      cwd: f.root,
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      timeout: 15000,
      maxBuffer: 65536,
    }),
  );
}
function recoverOwner(f, request) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "/usr/bin/python3",
      ["-I", "-B", join(import.meta.dirname, "supervisor.py"), f.root, "recover"],
      {
        cwd: f.root,
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let out = "",
      err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("error", reject);
    p.on("exit", (code) => {
      try {
        resolve({ code, value: JSON.parse(out), err });
      } catch {
        reject(Error(`recovery_output ${code}: ${out} ${err}`));
      }
    });
    p.stdin.end(JSON.stringify(request));
  });
}
for (const change of [
  "unchanged-enabled",
  "recovery-only-valid",
  "changed-policy-enabled",
  "same-generation",
  "changed-lock-directory",
  "replaced-lock-inode",
  "replaced-lock-inode-held",
  "operational-timeout-change",
  "metadata-change",
])
  test(`DEP-R1 owner recovery after actual public admission: ${change}`, async (t) => {
    const f = await setup(packet, `withdrawal-${change}`);
    t.diagnostic(f.root);
    t.after(() => stopViewer(f));
    const planned = await invoke(f, "plan", f.request);
    assert.equal(planned.value.launchable, true, JSON.stringify(planned));
    const launched = await invoke(f, "launch", f.request);
    assert.equal(launched.code, 0, JSON.stringify(launched));
    const a = launched.value.attempt,
      dir = join(f.ns, "attempts", a.attempt, a.incarnation);
    await wait(
      () => existsSync(join(dir, "host-terminal.json")) && hostExited(f),
      "closed actual host and completed owned effect",
    );
    assert.equal(
      readFileSync(join(f.checkout, "src/proof.txt"), "utf8"),
      "task5480 public SDK proof",
    );
    assert.equal(lines(join(f.root, "public-sends.jsonl")).length, 2);
    const admission = json(join(dir, "ak-admission.json")),
      historical = json(join(dir, "ak-admission-lock.json")),
      original = describeOwner(f),
      initialLock = lstatSync(f.lock);
    assert.equal(admission.body.outcome, "ADMITTED");
    assert.equal(admission.body.effects, "committed_verified");
    assert.deepEqual(historical.lock_identity, {
      path: f.lock,
      device: initialLock.dev,
      inode: initialLock.ino,
    });
    assert.equal(historical.recovery_invariant_digest, original.bindings.recovery_invariant_digest);
    assert.equal(json(join(dir, "host-closure.json")).future_dispatch_closed, true);
    f.state.durableWrite(
      join(dir, "effect-disposition.json"),
      {
        schema: "pi.task-session.effect-disposition.v1",
        attempt: a.attempt,
        incarnation: a.incarnation,
        started_effects_disposed: true,
        owner_receipt_digest: digest({
          proof: sha(readFileSync(join(f.checkout, "src/proof.txt"))),
          hostExited: true,
          sends: 2,
        }),
      },
      true,
    );
    const before = family(f),
      oracle = native(f.pins, f.root, "--fault-oracle"),
      namespace = readFileSync(join(f.ns, "state.json")),
      history = readFileSync(join(dir, "ak-admission-lock.json"));
    const policy = json(f.policyPath);
    if (change !== "unchanged-enabled") {
      policy.task_session.state = change === "changed-policy-enabled" ? "enabled" : "recovery-only";
      if (change !== "same-generation") policy.task_session.generation = "withdrawal-advanced-2";
      if (change === "changed-lock-directory") {
        const directory = join(f.root, "new-ak-lock-directory");
        mkdirSync(directory, { mode: 0o700 });
        writeFileSync(join(directory, f.lock.split("/").at(-1)), "", { mode: 0o600 });
        policy.admission_gate.lock_directory = directory;
      }
      if (change === "operational-timeout-change") policy.admission_gate.timeout_seconds += 1;
      if (change === "metadata-change")
        policy.synthetic_nonoperational_note = "not exempt from owner invariant";
      writeFileSync(f.policyPath, JSON.stringify(policy));
    }
    if (change === "replaced-lock-inode-held") {
      const holder = spawn(
        "/usr/bin/python3",
        [
          "-I",
          "-B",
          "-c",
          'import fcntl,sys\nf=open(sys.argv[1],"r+b");fcntl.flock(f,fcntl.LOCK_EX);print("held",flush=True);sys.stdin.read()',
          f.lock,
        ],
        { env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, stdio: ["pipe", "pipe", "pipe"] },
      );
      const done = new Promise((r) => holder.once("exit", r));
      t.after(async () => {
        holder.stdin.end();
        await done;
      });
      await new Promise((resolve, reject) => {
        holder.once("error", reject);
        holder.stdout.once("data", (b) =>
          b.toString().trim() === "held" ? resolve() : reject(Error("holder_failed")),
        );
      });
      assert.equal(available(f.lock), false);
    }
    if (["replaced-lock-inode", "replaced-lock-inode-held"].includes(change)) {
      renameSync(f.lock, `${f.lock}.original-owned`);
      writeFileSync(f.lock, "", { mode: 0o600 });
      assert.notEqual(lstatSync(f.lock).ino, initialLock.ino);
    }
    // Owner describes current config successfully: negatives must not stop at pins/permissions.
    const current = describeOwner(f);
    assert.equal(current.state, policy.task_session.state, JSON.stringify(current));
    assert.equal(current.worker_test_support, false);
    assert.equal(current.database_opened, false);
    assert.equal(current.database_locked, false);
    assert.deepEqual(current.bindings.ordinary_binary, original.bindings.ordinary_binary);
    assert.equal(
      current.bindings.recovery_invariant_digest === original.bindings.recovery_invariant_digest,
      !["changed-lock-directory", "metadata-change", "operational-timeout-change"].includes(change),
    );
    // Future fixture publication/profile use opaque current owner facts; preserved admission is untouched.
    f.state.durableWrite(join(f.ns, "producer.json"), {
      schema: "pi.task-session.producer-binding.v1",
      publication: "owner-approved",
      bindings: current.bindings,
    });
    const future = {
      ...f.pin,
      producer: { ...f.pin.producer, policyDigest: current.bindings.policy_sha256 },
    };
    if (!existsSync(join(f.ns, "profiles", `${digest(future)}.json`)))
      f.state.durableWrite(join(f.ns, "profiles", `${digest(future)}.json`), future, true);
    const capability = await invoke(f, "capability");
    assert.deepEqual(capability.value.configuration.bindings, current.bindings);
    assert.equal(capability.value.admissionAvailable, current.state === "enabled");
    const catalog = await invoke(f, "profiles"),
      profile = catalog.value.profiles.find((p) => p.profile === digest(future));
    assert.equal(profile.validation, "profile_preflight_passed");
    assert.equal(profile.policyDigest, current.bindings.policy_sha256);
    const nativeBefore = lines(join(f.root, "public-native-starts.jsonl")).length;
    const request = {
      schema: "ak.task-session.recovery.v1",
      attempt: a.attempt,
      incarnation: a.incarnation,
      claim: admission.body.claim,
    };
    const result = await recoverOwner(f, request),
      valid = ["unchanged-enabled", "recovery-only-valid"].includes(change);
    if (valid) {
      assert.equal(result.code, 0, JSON.stringify(result));
      assert.equal(result.value.result.outcome, "RECOVERED");
      assert.equal(lines(join(f.root, "public-native-starts.jsonl")).length, nativeBefore + 1);
      assert.equal(native(f.pins, f.root, "--inspect").task.status, "pending");
    } else {
      assert.equal(result.code, 78, JSON.stringify(result));
      assert.equal(result.value.ok, false);
      const intended = {
        "changed-policy-enabled": "changed policy requires recovery-only",
        "same-generation": "policy epoch not advanced",
        "changed-lock-directory": "recovery owner binding changed",
        "metadata-change": "recovery owner binding changed",
        "operational-timeout-change": "recovery owner binding changed",
        "replaced-lock-inode-held": "historical lock identity changed",
        "replaced-lock-inode": "historical lock identity changed",
      };
      assert.equal(
        result.value.reason,
        intended[change],
        "negative must reach the owner invariant/epoch/original-lock gate, not a pin or permission shortcut",
      );
      assert.equal(existsSync(join(dir, "ak-recovery-started.json")), false);
      assert.equal(lines(join(f.root, "public-native-starts.jsonl")).length, nativeBefore);
      assert.deepEqual(family(f), before);
      assert.deepEqual(native(f.pins, f.root, "--fault-oracle"), oracle);
    }
    assert.deepEqual(readFileSync(join(dir, "ak-admission-lock.json")), history);
    assert.deepEqual(readFileSync(join(f.ns, "state.json")), namespace);
    assert.equal((await invoke(f, "inspect")).value.attempts[0].claimResolved, false);
    t.diagnostic(
      JSON.stringify({
        change,
        valid,
        result: result.value,
        admissionLock: historical.lock_identity,
      }),
    );
  });
test("DEP-R1 public capability/owner describe never stat DB or lock domain", async (t) => {
  const f = await setup(packet, "descriptor-no-stat");
  t.diagnostic(f.root);
  assert.equal((await invoke(f, "plan", f.request)).value.launchable, true);
  const db = f.config.databasePath,
    policy = json(f.policyPath),
    lockdir = policy.admission_gate.lock_directory,
    backup = `${lockdir}-owned-stranded`,
    mode = lstatSync(db).mode;
  renameSync(lockdir, backup);
  chmodSync(db, 0);
  try {
    const trace = join(f.root, "owner-describe-file-syscalls.log");
    const current = JSON.parse(
      execFileSync(
        "/usr/bin/strace",
        [
          "-f",
          "-e",
          "trace=%file",
          "-o",
          trace,
          f.bindings.gate_path,
          "--",
          "task-session",
          "describe",
        ],
        {
          cwd: f.root,
          env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
          timeout: 15000,
          maxBuffer: 65536,
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    );
    const syscalls = readFileSync(trace, "utf8");
    assert.equal(syscalls.includes(db), false, "owner describe must not open/stat database family");
    assert.equal(
      syscalls.includes(lockdir),
      false,
      "owner describe must not open/stat lock domain",
    );
    assert.equal(current.state, "enabled", JSON.stringify(current));
    assert.equal(current.database_opened, false);
    assert.equal(current.database_locked, false);
    assert.equal((await invoke(f, "capability")).value.admissionAvailable, true);
  } finally {
    chmodSync(db, mode & 0o777);
    renameSync(backup, lockdir);
  }
  assert.equal((await invoke(f, "plan", f.request)).value.launchable, true);
  assert.deepEqual(readdirSync(join(f.ns, "attempts")), []);
});

for (const field of ["generation", "reason"])
  test(`DEP-R2 published owner codec/JS fixtures: ${field}`, async () => {
    const fixturePath = join(
      packet.sourceRoot,
      "docs/project/contracts/task-session-deployment-v1.fixtures.json",
    );
    assert.equal(sha(readFileSync(fixturePath)), packet.ownerFixtureSha256);
    const corpus = json(fixturePath),
      cases = corpus.token_pattern_cases[field],
      documents = cases.map(({ value }) => {
        const d = structuredClone(corpus.descriptor);
        if (field === "reason") d.reason = value;
        else d.bindings.policy_generation = value;
        return d;
      });
    const actualPython = JSON.parse(
      execFileSync(
        "/usr/bin/python3",
        [
          "-I",
          "-B",
          "-c",
          `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location("owner_codec",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
schema=json.load(open(sys.argv[2]));values=json.load(sys.stdin);result=[]
for value in values:
 try:m.validate(m.parse(m.canonical(value)),schema,schema);result.append(True)
 except Exception:result.append(False)
print(json.dumps(result))`,
          join(packet.workerRoot, "scripts/ak-task-session-supervisor.py"),
          join(packet.workerRoot, "docs/project/contracts/task-session-deployment-v1.json"),
        ],
        {
          input: JSON.stringify(documents),
          env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
          timeout: 15000,
          maxBuffer: 65536,
        },
      ),
    );
    const { interpretTaskSessionDescriptor } = await import(
      join(packet.runtimeRoot, "dist/task-session/producer-adapter.js")
    );
    const actualJS = documents.map((d) => {
        try {
          interpretTaskSessionDescriptor(d);
          return true;
        } catch {
          return false;
        }
      }),
      expected = cases.map((c) => c.valid);
    assert.deepEqual(actualPython, expected);
    assert.deepEqual(actualJS, actualPython);
  });
