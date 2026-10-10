import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifySnapshot } from "../dist/task-session/classify.js";
import { identityFromSnapshot } from "../dist/task-session/installed-identity.js";
import { accountLocator, readSnapshot } from "../dist/task-session/state.js";

const script = fileURLToPath(new URL("../scripts/task-session-provision.mjs", import.meta.url));

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

/** A synthetic OS account home, a git checkout in it, and an `ak` stub that owns task 7. */
function world(t, descriptor = disabledDescriptor) {
  const base = mkdtempSync(join(tmpdir(), "task5480-provision-"));
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
    `import os from "node:os"; import { syncBuiltinESMExports } from "node:module";\n` +
      `const a = os.userInfo(); os.userInfo = () => ({ ...a, homedir: process.env.TEST_HOME });\n` +
      `syncBuiltinESMExports();\n`,
  );
  const account = os.userInfo();
  t.mock.method(os, "userInfo", () => ({ ...account, homedir: home }));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const run = (...args) =>
    spawnSync(process.execPath, ["--import", loader, script, ...args], {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, TEST_HOME: home },
    });
  return { base, home, checkout, run, root: join(home, ".local/state/pi-task-sessions") };
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

test("profile refuses before any producer publication and writes nothing", (t) => {
  const w = world(t);
  assert.equal(w.run("init").status, 0);
  const out = w.run("profile", "--task", "7", "--model", "gpt-5.5", "--reasoning", "high");
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
