import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os, { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifySnapshot } from "../dist/task-session/classify.js";
import { identityFromSnapshot } from "../dist/task-session/installed-identity.js";
import { accountLocator, readSnapshot } from "../dist/task-session/state.js";
import { enabledDescriptor, ownerBundle } from "./fixtures/task-session/producer-owner-bundle.mjs";

const script = fileURLToPath(new URL("../scripts/task-session-provision.mjs", import.meta.url));

/** The installed check refuses an artifact below a symlink, a foreign owner or a shared write bit. */
function ownerSafe(dir) {
  for (let p = dir; ; p = dirname(p)) {
    const s = lstatSync(p, { throwIfNoEntry: false });
    if (!s || s.isSymbolicLink() || ![0, process.getuid()].includes(s.uid) || s.mode & 0o022)
      return false;
    if (p === dirname(p)) return true;
  }
}
/** Owner artifacts go under TMPDIR when the check accepts it there, else under this package. */
const ownerParent = [
  tmpdir(),
  join(fileURLToPath(new URL("../node_modules", import.meta.url)), ".cache"),
].find((dir) => {
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  return ownerSafe(dir);
});
const ownerTest = (name, fn) =>
  test(name, { skip: !ownerParent && "no directory the installed check accepts" }, fn);

const akFixtures =
  "/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/contracts/task-session-deployment-v1.fixtures.json";
const disabledDescriptor = {
  authority: false,
  bindings: null,
  database_locked: false,
  database_opened: false,
  operations: [],
  platform: "linux",
  reason: "not_configured",
  schema: "ak.task-session.descriptor.v1",
  state: "disabled",
  worker_test_support: null,
};

/**
 * A synthetic OS account home, a git checkout in it, and an `ak` stub that owns task 7. A test
 * that installs owner artifacts passes a `parent` with no group- or world-writable ancestor.
 */
function world(t, descriptor = disabledDescriptor, parent = tmpdir()) {
  mkdirSync(parent, { recursive: true });
  const base = mkdtempSync(join(parent, "task5480-provision-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const checkout = join(base, "repo");
  mkdirSync(home);
  mkdirSync(join(checkout, ".git"), { recursive: true });
  const bin = join(base, "bin");
  mkdirSync(bin);
  writeFileSync(join(base, "descriptor.json"), JSON.stringify(descriptor));
  writeFileSync(
    join(bin, "ak"),
    `#!/bin/sh\n[ "$1 $2" = "task-session describe" ] && exec cat ${join(base, "descriptor.json")}\n` +
      `[ "$1 $2 $4 $5" = "task show -F json" ] || exit 64\n` +
      `case "$3" in 7) if [ -f ${join(base, "task-7.json")} ]; then cat ${join(base, "task-7.json")}; ` +
      `else echo '{"id":7,"repo":"${checkout}"}'; fi;; 8) echo '{"id":8,"repo":"/elsewhere"}';; *) exit 1;; esac\n`,
    { mode: 0o755 },
  );
  const loader = join(base, "home-loader.mjs");
  writeFileSync(
    loader,
    `import fs from "node:fs"; import os from "node:os";\n` +
      `import { syncBuiltinESMExports } from "node:module";\n` +
      `const a = os.userInfo(); os.userInfo = () => ({ ...a, homedir: process.env.TEST_HOME });\n` +
      `const env = process.env, { openSync: open, renameSync: move, fsyncSync: sync } = fs;\n` +
      `const { appendFileSync: note, readlinkSync: link } = fs;\n` +
      `const fault = (p) => Object.assign(new Error("injected_fault " + p), { code: "EIO" });\n` +
      // A crash at a chosen moment (SIGKILL just before opening that path), or a failing open or
      // rename of a path containing the given text; and the order of durable effects.
      `fs.openSync = (p, ...r) => {\n` +
      `  if (String(p) === env.TEST_KILL_BEFORE_OPEN) process.kill(process.pid, "SIGKILL");\n` +
      `  if (env.TEST_FAIL_OPEN && String(p).includes(env.TEST_FAIL_OPEN)) throw fault(p);\n` +
      `  return open(p, ...r); };\n` +
      `fs.renameSync = (a, b) => {\n` +
      `  if (env.TEST_FAIL_RENAME && String(b).includes(env.TEST_FAIL_RENAME)) throw fault(b);\n` +
      `  move(a, b); if (env.TEST_EFFECTS) note(env.TEST_EFFECTS, "rename " + a + " " + b + "\\n"); };\n` +
      `fs.fsyncSync = (fd) => { sync(fd);\n` +
      `  if (env.TEST_EFFECTS) note(env.TEST_EFFECTS, "fsync " + link("/proc/self/fd/" + fd) + "\\n"); };\n` +
      `syncBuiltinESMExports();\n`,
  );
  const account = os.userInfo();
  t.mock.method(os, "userInfo", () => ({ ...account, homedir: home }));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const runWith = (env, ...args) =>
    spawnSync(process.execPath, ["--import", loader, script, ...args], {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, TEST_HOME: home, ...env },
    });
  const run = (...args) => runWith({}, ...args);
  return { base, home, checkout, run, runWith, root: join(home, ".local/state/pi-task-sessions") };
}
const mode = (path) => lstatSync(path).mode & 0o777;
const legacyRequest = (checkout, taskIds) => ({
  schema: "pi.task-session.classify-request.v1",
  requestId: "legacy-probe",
  akInstance: "society-v2",
  taskIds,
  cwd: checkout,
});

test("init provisions a private empty namespace that admits nothing", (t) => {
  const w = world(t);
  const out = w.run("init");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).initialized, true);
  const root = join(w.home, ".local/state/pi-task-sessions");
  assert.equal(mode(root), 0o700);
  for (const name of ["profiles", "credentials", "attempts", "model-sources"])
    assert.equal(mode(join(root, name)), 0o700);
  assert.equal(mode(join(root, "namespace.lock")), 0o600);
  assert.equal(mode(join(w.home, ".config/pi-task-sessions/host.json")), 0o600);
  const s = readSnapshot(accountLocator());
  assert.deepEqual([s.domains, s.enrolled, s.attempts], [[], [], []]);
  assert.throws(() => identityFromSnapshot(s), /canonical_instance_unavailable/);
  assert.equal(classifySnapshot(legacyRequest(w.checkout, [7]), s).classification, "unknown");
  const again = w.run("init");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).reason, "already_initialized");
});

test("enroll binds one AK task to its checkout and protects the checkout", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  const out = w.run("enroll", "--task", "7", "--checkout", w.checkout);
  assert.equal(out.status, 0, out.stderr);
  const s = readSnapshot(accountLocator());
  assert.equal(s.generation, 2);
  assert.equal(s.domains.length, 1);
  assert.deepEqual(s.enrolled, s.domains);
  assert.deepEqual(
    [s.domains[0].taskId, s.domains[0].checkout, s.domains[0].commonGit],
    [7, w.checkout, join(w.checkout, ".git")],
  );
  const identity = identityFromSnapshot(s);
  assert.equal(identity.configured, true);
  assert.equal(identity.akInstance, "society-v2");
  // A legacy launch into the enrolled checkout, for any task, is refused as enrolled.
  assert.equal(classifySnapshot(legacyRequest(w.checkout, [7]), s).classification, "enrolled");
  assert.equal(classifySnapshot(legacyRequest(w.checkout, [99]), s).classification, "enrolled");
});

test("enroll refuses a task AK places elsewhere, a repeat, and unknown arguments", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  const before = readFileSync(join(w.home, ".local/state/pi-task-sessions/state.json"));
  assert.notEqual(w.run("enroll", "--task", "8", "--checkout", w.checkout).status, 0);
  assert.notEqual(w.run("enroll", "--task", "7", "--checkout", w.checkout, "--x", "y").status, 0);
  assert.deepEqual(readFileSync(join(w.home, ".local/state/pi-task-sessions/state.json")), before);
  assert.equal(w.run("enroll", "--task", "7", "--checkout", w.checkout).status, 0);
  assert.notEqual(w.run("enroll", "--task", "7", "--checkout", w.checkout).status, 0);
  assert.equal(readSnapshot(accountLocator()).generation, 2);
});

test("withdraw stops admission and keeps the inventory", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  assert.equal(w.run("enroll", "--task", "7", "--checkout", w.checkout).status, 0);
  assert.equal(w.run("withdraw").status, 0);
  const s = readSnapshot(accountLocator());
  assert.equal(s.withdrawn, true);
  assert.equal(s.enrolled.length, 1);
  assert.throws(() => identityFromSnapshot(s), /canonical_instance_unavailable/);
});

test("unknown arguments are refused before anything is created", (t) => {
  const w = world(t);
  assert.notEqual(w.run("init", "--bogus", "1").status, 0);
  assert.equal(existsSync(join(w.home, ".local/state/pi-task-sessions")), false);
  assert.equal(existsSync(join(w.home, ".config/pi-task-sessions")), false);
});

test("producer refuses while AK publishes no enabled task-session section", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  const out = w.run("producer");
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /producer_not_published/);
  assert.equal(existsSync(join(w.root, "producer.json")), false);
});

test(
  "producer sets aside a publication whose artifacts fail the host's identity check",
  { skip: !existsSync(akFixtures) && "agent-kernel fixtures not present" },
  (t) => {
    const enabled = JSON.parse(readFileSync(akFixtures, "utf8")).descriptor;
    const w = world(t, enabled);
    assert.equal(w.run("init").status, 0);
    const out = w.run("producer");
    assert.notEqual(out.status, 0);
    assert.equal(existsSync(join(w.root, "producer.json")), false);
    assert.equal(
      readdirSync(w.root).filter((n) => n.startsWith("producer.json.rejected-")).length,
      1,
    );
  },
);

/**
 * An initialized namespace that holds an earlier publication, with an owner bundle installed. AK
 * offers bindings whose host is pinned to `hostBuild`, this checkout's build by default. Where the
 * installation itself is sound, the earlier publication passes the installed check exactly when
 * the offered one does not, so a check of the wrong file is caught. `added()` lists the root
 * entries created after that.
 */
function publishedWorld(t, hostBuild) {
  const w = world(t, disabledDescriptor, ownerParent);
  assert.equal(w.run("init").status, 0);
  const installed = ownerBundle(w.home);
  const bindings = hostBuild ? { ...installed, host_build_digest: hostBuild } : installed;
  writeFileSync(join(w.base, "descriptor.json"), JSON.stringify(enabledDescriptor(bindings)));
  const published = join(w.root, "producer.json");
  const earlier = `${JSON.stringify({
    schema: "pi.task-session.producer-binding.v1",
    publication: "owner-approved",
    bindings: {
      ...installed,
      policy_generation: "fixture-0",
      host_build_digest: hostBuild ? installed.host_build_digest : "d".repeat(64),
    },
  })}\n`;
  writeFileSync(published, earlier, { mode: 0o600 });
  const before = new Set(readdirSync(w.root));
  const added = () => readdirSync(w.root).filter((name) => !before.has(name));
  return { ...w, bindings, published, earlier, inode: lstatSync(published).ino, added };
}

for (const [cause, refusal, hostBuild, prepare] of [
  ["a checkout whose build is not the pinned host", "producer_host_build_mismatch", "e".repeat(64)],
  [
    "a missing AK runtime bundle",
    "producer_runtime_unavailable",
    undefined,
    (w) => rmSync(join(w.home, ".local/libexec/agent-kernel/runtime/current")),
  ],
]) {
  ownerTest(`producer refuses ${cause} without changing the earlier publication`, (t) => {
    // Given an earlier publication, and a candidate the installed check refuses
    const w = publishedWorld(t, hostBuild);
    prepare?.(w);
    // When the producer runs
    const out = w.run("producer");
    // Then it refuses, and the earlier publication keeps its bytes and its file
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, new RegExp(refusal));
    assert.equal(readFileSync(w.published, "utf8"), w.earlier);
    assert.equal(lstatSync(w.published).ino, w.inode);
    // And the refused candidate is set aside, with nothing else left in the namespace
    const [aside, ...rest] = w.added();
    assert.deepEqual(rest, []);
    assert.match(aside, /^producer\.json\.rejected-\d+$/);
    assert.equal(
      JSON.parse(readFileSync(join(w.root, aside), "utf8")).bindings.policy_generation,
      "fixture-1",
    );
  });
}

ownerTest("producer refuses a namespace root that is no longer private", (t) => {
  // Given an earlier publication and a namespace root others can now list
  const w = publishedWorld(t);
  chmodSync(w.root, 0o755);
  // When the producer runs
  const out = w.run("producer");
  // Then it refuses before writing anything, and the earlier publication stays
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /private_identity_invalid/);
  assert.equal(readFileSync(w.published, "utf8"), w.earlier);
  assert.deepEqual(w.added(), []);
});

ownerTest("producer reports the refusal even when setting the candidate aside fails", (t) => {
  // Given a candidate the installed check refuses, and a rename aside that fails
  const w = publishedWorld(t, "e".repeat(64));
  // When the producer runs
  const out = w.runWith({ TEST_FAIL_RENAME: ".rejected-" }, "producer");
  // Then it reports the refusal and the failure to set the candidate aside, and the earlier
  // publication stays
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /producer_host_build_mismatch/);
  assert.match(out.stderr, /injected_fault \S+\.rejected-\d+/);
  assert.equal(readFileSync(w.published, "utf8"), w.earlier);
  // And the candidate stays staged where no host reads it
  const [staged, ...rest] = w.added();
  assert.deepEqual(rest, []);
  assert.match(staged, /^\.producer-candidate-/);
});

ownerTest("a candidate that cannot be written leaves the namespace as it was", (t) => {
  // Given an earlier publication, and a candidate file that cannot be created
  const w = publishedWorld(t);
  // When the producer runs
  const out = w.runWith({ TEST_FAIL_OPEN: "/.publish-" }, "producer");
  // Then it fails, the earlier publication stays, and no empty staging directory is left
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /injected_fault/);
  assert.equal(readFileSync(w.published, "utf8"), w.earlier);
  assert.deepEqual(w.added(), []);
});

ownerTest("a producer killed during its installed check leaves the earlier publication", (t) => {
  // Given an earlier publication and an installation the check would accept
  const w = publishedWorld(t);
  // When the producer is killed just before it opens the installed host
  const host = join(w.home, ".local/libexec/pi-task-sessions/host-v1");
  const out = w.runWith({ TEST_KILL_BEFORE_OPEN: host }, "producer");
  // Then the earlier publication is still the one in place
  assert.equal(out.signal, "SIGKILL");
  assert.equal(readFileSync(w.published, "utf8"), w.earlier);
  assert.equal(lstatSync(w.published).ino, w.inode);
  // And the only leftover is the staged candidate, which no host reads
  const [staged, ...rest] = w.added();
  assert.deepEqual(rest, []);
  assert.match(staged, /^\.producer-candidate-/);
  const candidate = JSON.parse(readFileSync(join(w.root, staged, "producer.json"), "utf8"));
  assert.equal(candidate.bindings.policy_generation, "fixture-1");
});

ownerTest("producer replaces the earlier publication once the installed check passes", (t) => {
  // Given an earlier publication and an installation the check accepts
  const w = publishedWorld(t);
  // When the producer runs
  const effects = join(w.base, "effects.log");
  const out = w.runWith({ TEST_EFFECTS: effects }, "producer");
  // Then the checked candidate is the publication, private, and nothing else is left
  assert.equal(out.status, 0, out.stderr);
  // And the publication is the staged, checked candidate, moved in and made durable before the
  // producer reports it
  const [moved, synced] = readFileSync(effects, "utf8").trim().split("\n").slice(-2);
  const staged = join(w.root, ".producer-candidate-");
  assert.ok(moved.startsWith(`rename ${staged}`), moved);
  assert.ok(moved.endsWith(`/producer.json ${w.published}`), moved);
  assert.equal(synced, `fsync ${w.root}`);
  assert.equal(JSON.parse(out.stdout).host_build_digest, w.bindings.host_build_digest);
  assert.equal(
    JSON.parse(readFileSync(w.published, "utf8")).bindings.policy_generation,
    "fixture-1",
  );
  assert.equal(mode(w.published), 0o600);
  assert.deepEqual(w.added(), []);
});

test("profile refuses before any producer publication and writes nothing", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  const out = w.run("profile", "--task", "7", "--model", "gpt-6.1-sol", "--reasoning", "high");
  assert.notEqual(out.status, 0);
  assert.deepEqual(readdirSync(join(w.root, "profiles")), []);
  assert.deepEqual(readdirSync(join(w.root, "credentials")), []);
});

/** One reserved attempt for enrolled task 7, as launch leaves it before native admission. */
function reservedAttempt(w, attempt = "retire-attempt-1") {
  const statePath = join(w.root, "state.json");
  const s = JSON.parse(readFileSync(statePath, "utf8"));
  s.attempts.push({
    requestId: `request-${attempt}`,
    semanticDigest: "a".repeat(64),
    attempt,
    incarnation: "incarnation-1",
    domain: structuredClone(s.domains[0]),
    hostClosed: false,
    effectsDisposed: false,
    claimResolved: false,
  });
  writeFileSync(statePath, JSON.stringify(s));
  const dir = join(w.root, "attempts", attempt, "incarnation-1");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return { attempt, dir };
}
const enrolledWorld = (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  assert.equal(w.run("enroll", "--task", "7", "--checkout", w.checkout).status, 0);
  return w;
};
const receipts = ["--host-closure", "viewer killed by the transport timeout", "--effects", "none"];

// AK5482 canary A: a failed launch retained its attempt and nothing could retire it, so the
// attempt kept its whole checkout occupied. Retirement sets all three flags only on evidence.
test("retire records a never-admitted attempt with a receipt and frees its checkout", (t) => {
  const w = enrolledWorld(t);
  const { attempt, dir } = reservedAttempt(w);
  const before = readSnapshot(accountLocator()).generation;
  const out = w.run("retire", "--attempt", attempt, ...receipts);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).claim, "never_admitted");
  const s = readSnapshot(accountLocator());
  assert.equal(s.generation, before + 1);
  const a = s.attempts.find((x) => x.attempt === attempt);
  assert.deepEqual([a.hostClosed, a.effectsDisposed, a.claimResolved], [true, true, true]);
  const [receipt] = readdirSync(dir).filter((n) => n.startsWith("retirement-"));
  const r = JSON.parse(readFileSync(join(dir, receipt), "utf8"));
  assert.equal(r.hostClosure, "viewer killed by the transport timeout");
  assert.equal(r.effectDisposition, "none");
  const again = w.run("retire", "--attempt", attempt, ...receipts);
  assert.match(again.stderr, /attempt_already_retired/);
});

test("retire refuses without receipts, for an unknown attempt, and while a process names it", (t) => {
  const w = enrolledWorld(t);
  const { attempt } = reservedAttempt(w);
  assert.match(w.run("retire", "--attempt", attempt).stderr, /retirement_statement_missing/);
  assert.match(
    w.run("retire", "--attempt", attempt, "--host-closure", " ", "--effects", "none").stderr,
    /retirement_statement_missing/,
  );
  assert.match(w.run("retire", "--attempt", "missing", ...receipts).stderr, /attempt_unknown/);
  const viewer = spawn("/bin/sh", ["-c", "sleep 30; :", attempt], { stdio: "ignore" });
  t.after(() => viewer.kill());
  const busy = w.run("retire", "--attempt", attempt, ...receipts);
  assert.match(busy.stderr, /host_still_running/);
  assert.equal(readSnapshot(accountLocator()).attempts[0].hostClosed, false);
});

test("retire keeps an admitted claim until AK no longer shows its claimant", (t) => {
  const w = enrolledWorld(t);
  const { attempt, dir } = reservedAttempt(w);
  writeFileSync(join(dir, "ak-admission-lock.json"), "{}");
  writeFileSync(
    join(dir, "ak-admission.json"),
    JSON.stringify({
      kind: "ADMISSION_RESULT",
      body: { outcome: "ADMITTED", claim: { claimed_by: "pi-task-x" } },
    }),
  );
  const task7 = (claimedBy) =>
    writeFileSync(
      join(w.base, "task-7.json"),
      JSON.stringify({ id: 7, repo: w.checkout, claimed_by: claimedBy }),
    );
  task7("pi-task-x");
  assert.match(w.run("retire", "--attempt", attempt, ...receipts).stderr, /claim_unresolved/);
  task7(null);
  const out = w.run("retire", "--attempt", attempt, ...receipts);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).claim, "recovered");
});

test("retire refuses an attempt whose native admission began without a recorded result", (t) => {
  const w = enrolledWorld(t);
  const { attempt, dir } = reservedAttempt(w);
  writeFileSync(join(dir, "ak-admission-lock.json"), "{}");
  writeFileSync(
    join(w.base, "task-7.json"),
    JSON.stringify({ id: 7, repo: w.checkout, claimed_by: "someone" }),
  );
  assert.match(w.run("retire", "--attempt", attempt, ...receipts).stderr, /claim_indeterminate/);
});
