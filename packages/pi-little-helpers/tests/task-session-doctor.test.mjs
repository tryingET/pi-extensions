import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as core from "../dist/task-session/core.js";
import { accountLocator, readSnapshot } from "../dist/task-session/state.js";

const SECRET = "PRIVATE_SENTINEL_DO_NOT_REPORT";
function given(t) {
  const home = fs.mkdtempSync(join(os.tmpdir(), "ak7390-doctor-"));
  const root = join(home, ".local/state/pi-task-sessions");
  const config = join(home, ".config/pi-task-sessions");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config, { recursive: true, mode: 0o700 });
  const lock = join(root, "namespace.lock");
  fs.writeFileSync(lock, "", { mode: 0o600 });
  const rs = fs.statSync(root),
    ls = fs.statSync(lock);
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "n",
    root,
    uid: process.getuid(),
    rootDev: rs.dev,
    rootIno: rs.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  const domain = {
    akInstance: "synthetic",
    taskId: 1,
    checkout: home,
    commonGit: home,
    sharedEffects: [],
    physical: { checkout: `${rs.dev}:${rs.ino}`, commonGit: `${rs.dev}:${rs.ino}` },
  };
  const state = {
    schema: "pi.task-session.state.v1",
    namespace: "n",
    generation: 7,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [domain],
    attempts: [
      {
        requestId: SECRET,
        semanticDigest: "a".repeat(64),
        attempt: "attempt-1",
        incarnation: "incarnation-1",
        domain,
        hostClosed: false,
        effectsDisposed: false,
        claimResolved: false,
      },
    ],
  };
  const locatorPath = join(config, "host.json"),
    statePath = join(root, "state.json");
  const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  write(locatorPath, locator);
  write(statePath, state);
  fs.mkdirSync(join(root, "credentials"), { mode: 0o700 });
  fs.writeFileSync(join(root, "credentials/secret.json"), SECRET, { mode: 0o600 });
  fs.writeFileSync(join(root, "transcript.jsonl"), SECRET, { mode: 0o600 });
  const account = os.userInfo();
  t.mock.method(os, "userInfo", () => ({ ...account, homedir: home }));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return { home, root, lock, config, locator, state, locatorPath, statePath, write };
}
function whenDoctor() {
  assert.equal(
    typeof core.taskSessionDoctor,
    "function",
    "Given a broken namespace, the public core must expose doctor",
  );
  const fds = () =>
    fs
      .readdirSync("/proc/self/fd")
      .flatMap((fd) => {
        try {
          return [`${fd}:${fs.readlinkSync(`/proc/self/fd/${fd}`)}`];
        } catch {
          return [];
        }
      })
      .sort();
  const before = fds();
  const result = core.taskSessionDoctor();
  assert.deepEqual(fds(), before, "Every diagnostic success/refusal closes all of its FDs");
  return result;
}
function thenNonAuthority(result) {
  assert.equal(result.schema, "pi.task-session.doctor.v1");
  assert.equal(result.authority, false);
  assert.equal(result.admissionAssessed, false);
  assert.equal(result.repairPerformed, false);
  assert.equal(result.continuity, "unverified");
  assert.equal(result.custody, "unverified");
  assert.ok(result.nextActions.length > 0);
  assert.ok(!JSON.stringify(result).includes(SECRET));
}
const has = (r, code) => r.issues.some((x) => x.code === code);

for (const failOnRead of [1, 2]) {
  test(`Given reopened JSON read ${failOnRead} fails / When doctor observes / Then the reached-path failure is sanitized and all FDs close`, (t) => {
    given(t);
    const open = fs.openSync,
      read = fs.readSync;
    let statePin,
      readable,
      starts = 0,
      injected = false;
    t.mock.method(fs, "openSync", (path, flags, ...rest) => {
      const fd = open(path, flags, ...rest);
      if (String(path) === `/proc/self/fd/${statePin}`) {
        assert.equal(
          flags & 0o10000000,
          0,
          "This is the readable reopen, not metadata pin or semantic probe",
        );
        readable = fd;
      }
      if (String(path).endsWith("/state.json")) statePin = fd;
      return fd;
    });
    t.mock.method(fs, "readSync", (...args) => {
      if (args[0] === readable && args[4] === 0 && ++starts === failOnRead) {
        injected = true;
        throw Error(SECRET);
      }
      return read(...args);
    });
    syncBuiltinESMExports();
    const result = whenDoctor(); // independently compares process FD inventory before/after
    thenNonAuthority(result);
    assert.equal(typeof statePin, "number");
    assert.equal(typeof readable, "number");
    assert.notEqual(statePin, readable);
    assert.equal(injected, true);
    assert.equal(starts, failOnRead);
    assert.equal(result.status, failOnRead === 1 ? "incomplete" : "inconsistent");
    assert.equal(result.state, null);
    assert.ok(
      !has(result, "path_only_open_unsupported"),
      "The semantic probe succeeded before this failure",
    );
    assert.ok(has(result, failOnRead === 1 ? "unavailable_or_invalid" : "observation_changed"));
  });
}

for (const failure of ["flag-ignored", "readable-fstat"]) {
  test(`Given unsupported path-only semantics or failed readable identity (${failure}) / When doctor runs / Then refuse before effects and close FDs`, (t) => {
    given(t);
    const open = fs.openSync,
      stat = fs.fstatSync;
    let statePin, readable;
    const leafOpens = [];
    t.mock.method(fs, "openSync", (path, flags, ...rest) => {
      if (String(path).endsWith("/host.json") || String(path).endsWith("/state.json"))
        leafOpens.push(path);
      const fd = open(path, failure === "flag-ignored" ? flags & ~0o10000000 : flags, ...rest);
      if (String(path) === `/proc/self/fd/${statePin}`) readable = fd;
      if (String(path).endsWith("/state.json")) statePin = fd;
      return fd;
    });
    t.mock.method(fs, "fstatSync", (...args) => {
      if (args[0] === readable) throw Error(SECRET);
      return stat(...args);
    });
    syncBuiltinESMExports();
    const result = whenDoctor();
    thenNonAuthority(result);
    assert.equal(result.status, "incomplete");
    assert.equal(result.state, null);
    if (failure === "flag-ignored") {
      assert.deepEqual(leafOpens, []);
      assert.ok(has(result, "path_only_open_unsupported"));
    } else assert.equal(typeof readable, "number");
  });
}

for (const operation of ["fstatSync", "readSync"]) {
  test(`Given a private ${operation} failure / When doctor refuses / Then sanitized output and all FDs closed`, (t) => {
    given(t);
    t.mock.method(fs, operation, () => {
      throw Error(SECRET);
    });
    syncBuiltinESMExports();
    const r = whenDoctor();
    thenNonAuthority(r);
    assert.equal(r.status, "incomplete");
    assert.equal(r.state, null);
  });
}

test("Given equal metadata but different second-read bytes / When doctor rechecks / Then inconsistent, never trusted", (t) => {
  given(t);
  const open = fs.openSync,
    read = fs.readSync;
  let stateFd,
    reads = 0;
  t.mock.method(fs, "openSync", (...args) => {
    const fd = open(...args);
    if (String(args[0]).endsWith("/state.json") || String(args[0]) === `/proc/self/fd/${stateFd}`)
      stateFd = fd;
    return fd;
  });
  t.mock.method(fs, "readSync", (...args) => {
    const n = read(...args);
    if (args[0] === stateFd && args[4] === 0 && n && ++reads === 2) args[1][0] ^= 1;
    return n;
  });
  syncBuiltinESMExports();
  const r = whenDoctor();
  thenNonAuthority(r);
  assert.equal(reads, 2);
  assert.equal(r.status, "inconsistent");
  assert.equal(r.state, null);
});

test("Given device drift with matching inodes / When doctor runs / Then diagnose without rebinding or admission", (t) => {
  const f = given(t);
  f.locator.rootDev++;
  f.locator.lockDev++;
  f.write(f.locatorPath, f.locator);
  const before = fs.readFileSync(f.locatorPath);
  assert.throws(() => readSnapshot(accountLocator()), /namespace_identity_changed/);
  const r = whenDoctor();
  thenNonAuthority(r);
  assert.equal(r.status, "observed");
  assert.equal(r.identity.root.matches, false);
  assert.equal(r.identity.lock.matches, false);
  assert.equal(r.identity.root.expected.dev, String(f.locator.rootDev));
  assert.equal(r.identity.root.observed.dev, String(fs.statSync(f.root).dev));
  assert.ok(has(r, "namespace_identity_changed"));
  assert.ok(r.hypotheses.includes("device_number_change_possible"));
  assert.ok(r.hypotheses.includes("replacement_or_restore_not_excluded"));
  assert.equal(r.state.provenance, "unverified");
  assert.equal(r.state.unresolvedAttempts, 1);
  assert.deepEqual(fs.readFileSync(f.locatorPath), before);
  assert.throws(() => readSnapshot(accountLocator()), /namespace_identity_changed/);
});

test("Given matching observations and unresolved attempts / When diagnosed / Then never certify custody or retire flags", (t) => {
  const f = given(t),
    before = fs.readFileSync(f.statePath);
  const r = whenDoctor();
  thenNonAuthority(r);
  assert.equal(r.identity.root.matches, true);
  assert.equal(r.state.generation, 7);
  assert.equal(r.state.attempts[0].hostClosed, false);
  assert.equal(r.state.attempts[0].effectsDisposed, false);
  assert.equal(r.state.attempts[0].claimResolved, false);
  assert.equal(r.state.unresolvedAttempts, 1);
  assert.deepEqual(fs.readFileSync(f.statePath), before);
});

for (const target of ["root", "lock"]) {
  test(`Given a substituted ${target} / When diagnosed / Then retain mismatch and no continuity claim`, (t) => {
    const f = given(t);
    f.locator[target === "root" ? "rootIno" : "lockIno"]++;
    f.write(f.locatorPath, f.locator);
    const r = whenDoctor();
    thenNonAuthority(r);
    assert.equal(r.identity[target].matches, false);
    assert.ok(!r.hypotheses.includes("device_number_change_possible"));
    assert.ok(has(r, "namespace_identity_changed"));
  });
}

for (const kind of [
  "symlink-root",
  "symlink-parent",
  "symlink-lock",
  "symlink-state",
  "lock-hardlink",
  "mode",
  "hardlink",
  "owner",
]) {
  test(`Given unsafe ${kind} / When doctor runs / Then fail safely without following the unsafe identity`, (t) => {
    const f = given(t);
    if (kind.startsWith("symlink")) {
      const path =
        kind === "symlink-root"
          ? f.root
          : kind === "symlink-parent"
            ? join(f.home, ".local")
            : kind === "symlink-state"
              ? f.statePath
              : f.lock;
      fs.renameSync(path, `${path}-old`);
      fs.symlinkSync(`${path}-old`, path);
    } else if (kind === "mode") fs.chmodSync(f.statePath, 0o644);
    else if (kind === "hardlink") fs.linkSync(f.statePath, join(f.root, "alias"));
    else if (kind === "lock-hardlink") fs.linkSync(f.lock, join(f.root, "lock-alias"));
    else {
      // Model one consistently wrong owner, not contradictory fd/path observations.
      const inode = BigInt(fs.statSync(f.statePath).ino);
      for (const method of ["fstatSync", "lstatSync"]) {
        const original = fs[method];
        t.mock.method(fs, method, (...args) => {
          const s = original(...args);
          if (s.ino === inode) s.uid += 1n;
          return s;
        });
      }
      syncBuiltinESMExports();
    }
    const r = whenDoctor();
    thenNonAuthority(r);
    assert.equal(r.status, "incomplete");
    assert.equal(r.state, null);
    assert.ok(r.issues.length > 0);
  });
}

for (const kind of [
  "missing",
  "withdrawn",
  "wrong-root",
  "schema",
  "malformed",
  "duplicate",
  "oversized",
]) {
  test(`Given ${kind} configuration / When doctor runs / Then report bounded unavailable evidence without initialization`, (t) => {
    const f = given(t);
    if (kind === "missing") fs.renameSync(f.locatorPath, `${f.locatorPath}.old`);
    if (kind === "withdrawn") {
      f.state.withdrawn = true;
      f.write(f.statePath, f.state);
    }
    if (kind === "wrong-root") {
      f.locator.root = "/not-authorized";
      f.write(f.locatorPath, f.locator);
    }
    if (kind === "schema") {
      f.state.schema = "future";
      f.write(f.statePath, f.state);
    }
    if (kind === "malformed") fs.writeFileSync(f.statePath, `{"${SECRET}":`);
    if (kind === "duplicate") fs.writeFileSync(f.statePath, '{"schema":"a","schema":"b"}');
    if (kind === "oversized") fs.writeFileSync(f.statePath, Buffer.alloc(1048577, "x"));
    const r = whenDoctor();
    thenNonAuthority(r);
    assert.ok(r.issues.length > 0);
    if (kind === "withdrawn") assert.equal(r.state.withdrawn, true);
    if (["schema", "malformed", "duplicate", "oversized"].includes(kind))
      assert.equal(r.state, null);
    if (kind === "missing") assert.equal(fs.existsSync(f.locatorPath), false);
  });
}

for (const target of ["locator", "state", "lock", "root", "ancestor"]) {
  test(`Given a racing ${target} change / When observing / Then discard the incoherent state without retry`, (t) => {
    const f = given(t),
      originalOpen = fs.openSync,
      originalRead = fs.readSync;
    let stateFd,
      changed = false;
    t.mock.method(fs, "openSync", (...args) => {
      const fd = originalOpen(...args);
      if (String(args[0]).endsWith("/state.json") || String(args[0]) === `/proc/self/fd/${stateFd}`)
        stateFd = fd;
      return fd;
    });
    t.mock.method(fs, "readSync", (...args) => {
      const n = originalRead(...args);
      if (args[0] === stateFd && n && !changed) {
        changed = true;
        if (target === "locator") {
          f.locator.rootDev++;
          f.write(f.locatorPath, f.locator);
        }
        if (target === "state") {
          f.state.generation++;
          f.write(f.statePath, f.state);
        }
        if (target === "lock") {
          fs.renameSync(f.lock, `${f.lock}.old`);
          fs.writeFileSync(f.lock, "", { mode: 0o600 });
        }
        if (target === "root") {
          fs.renameSync(f.root, `${f.root}.old`);
          fs.mkdirSync(f.root, { mode: 0o700 });
        }
        if (target === "ancestor") {
          fs.renameSync(join(f.home, ".local"), join(f.home, ".local-old"));
          fs.mkdirSync(join(f.home, ".local/state/pi-task-sessions"), {
            recursive: true,
            mode: 0o700,
          });
        }
      }
      return n;
    });
    syncBuiltinESMExports();
    const r = whenDoctor();
    thenNonAuthority(r);
    assert.equal(changed, true);
    assert.equal(r.status, "inconsistent");
    assert.equal(r.state, null);
    assert.ok(has(r, "observation_changed"));
  });
}

test("Given private data and effect traps / When core doctor runs / Then no writers, process or network effects and no private body output", (t) => {
  given(t);
  const calls = [];
  for (const name of ["writeFileSync", "renameSync", "mkdirSync", "unlinkSync", "chmodSync"])
    t.mock.method(fs, name, () => {
      calls.push(name);
      throw Error(SECRET);
    });
  for (const name of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"])
    t.mock.method(cp, name, () => {
      calls.push(name);
      throw Error(SECRET);
    });
  t.mock.method(globalThis, "fetch", () => {
    calls.push("fetch");
    throw Error(SECRET);
  });
  const open = fs.openSync;
  t.mock.method(fs, "openSync", (path, flags, ...rest) => {
    assert.equal(
      flags &
        (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC),
      0,
    );
    assert.ok(!String(path).includes("credentials") && !String(path).includes("transcript"));
    return open(path, flags, ...rest);
  });
  syncBuiltinESMExports();
  const result = whenDoctor();
  thenNonAuthority(result);
  assert.equal(result.status, "observed");
  assert.equal(result.state.unresolvedAttempts, 1);
  assert.deepEqual(calls, []);
});

test("Given many retained attempts / When doctor runs / Then bound output and disclose omissions without losing unresolved count", (t) => {
  const f = given(t),
    a = f.state.attempts[0];
  f.state.attempts = Array.from({ length: 100 }, (_, i) => ({
    ...a,
    requestId: `r${i}`,
    attempt: `a${i}`,
  }));
  f.write(f.statePath, f.state);
  const r = whenDoctor();
  thenNonAuthority(r);
  assert.equal(r.state.attemptCount, 100);
  assert.equal(r.state.unresolvedAttempts, 100);
  assert.equal(r.state.attempts.length, 32);
  assert.equal(r.state.omittedAttempts, 68);
  assert.ok(JSON.stringify(r).length < 16000);
});

test("Given the emitted public CLI and isolated account / When doctor or extra options run / Then same diagnostics or strict refusal", (t) => {
  const f = given(t);
  f.locator.rootDev++;
  f.write(f.locatorPath, f.locator);
  const run = (...args) =>
    cp.spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/task-session/profile-public-loader.mjs",
        "./dist/task-session/bin.js",
        ...args,
      ],
      { encoding: "utf8", env: { ...process.env, TEST_PROFILE_HOME: f.home } },
    );
  const child = run("doctor");
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const r = JSON.parse(child.stdout);
  thenNonAuthority(r);
  assert.ok(has(r, "namespace_identity_changed"));
  const bad = run("doctor", "--repair");
  assert.equal(bad.status, 2);
  assert.equal(JSON.parse(bad.stdout).reason, "unsupported_or_duplicate_options");
});

// A real FIFO is an effect oracle: opening it for reading can release a blocked writer
// even if fstat rejects the object immediately afterwards. Never exercise a live device.
for (const substitution of ["already-fifo", "before-leaf-open", "after-metadata-pin"]) {
  test(`Given a blocked FIFO writer (${substitution}) / When doctor observes / Then the writer stays blocked`, async (t) => {
    const f = given(t),
      fifo = join(f.root, "fifo"),
      marker = join(f.root, "writer-ran");
    assert.equal(cp.spawnSync("/usr/bin/mkfifo", ["-m", "600", fifo]).status, 0);
    const child = cp.spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import fs from "node:fs"; const fd=fs.openSync(process.argv[1],fs.constants.O_WRONLY); fs.writeFileSync(process.argv[2],"unblocked"); fs.closeSync(fd);',
        fifo,
        marker,
      ],
      { stdio: "ignore" },
    );
    const exited = new Promise((resolve) => child.once("exit", resolve));
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await exited;
    });
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waiting = () => {
      try {
        return fs.readFileSync(`/proc/${child.pid}/wchan`, "utf8").trim() === "wait_for_partner";
      } catch {
        return false;
      }
    };
    const deadline = Date.now() + 5000;
    while (!waiting() && Date.now() < deadline && child.exitCode === null) await delay(10);
    assert.ok(
      waiting(),
      "Owned writer must actually be blocked in FIFO open before the observation",
    );
    const inode = BigInt(fs.statSync(f.statePath).ino);
    let substituted = false;
    const replace = () => {
      if (substituted) return;
      substituted = true;
      fs.renameSync(f.statePath, `${f.statePath}.old`);
      fs.renameSync(fifo, f.statePath);
    };
    if (substitution === "already-fifo") replace();
    if (substitution === "before-leaf-open") {
      const open = fs.openSync;
      t.mock.method(fs, "openSync", (...args) => {
        if (String(args[0]).endsWith("/state.json")) replace();
        return open(...args);
      });
    }
    if (substitution === "after-metadata-pin") {
      const stat = fs.fstatSync;
      t.mock.method(fs, "fstatSync", (...args) => {
        const value = stat(...args);
        if (value.ino === inode) replace();
        return value;
      });
    }
    syncBuiltinESMExports();
    const result = whenDoctor();
    thenNonAuthority(result);
    assert.equal(substituted, true);
    await delay(150);
    assert.equal(
      fs.existsSync(marker),
      false,
      "Diagnostic observation must not release a FIFO writer",
    );
    assert.ok(waiting(), "Writer remains blocked until owned test cleanup, not doctor");
    assert.equal(result.state, null);
  });
}
