import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
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

/** A synthetic OS account home, a git checkout in it, and an `ak` stub that owns task 7. */
function world(t) {
  const base = mkdtempSync(join(tmpdir(), "task5480-provision-"));
  const home = join(base, "home");
  const checkout = join(base, "repo");
  mkdirSync(home);
  mkdirSync(join(checkout, ".git"), { recursive: true });
  const bin = join(base, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "ak"),
    `#!/bin/sh\n[ "$1 $2 $4 $5" = "task show -F json" ] || exit 64\n` +
      `case "$3" in 7) echo '{"id":7,"repo":"${checkout}"}';; 8) echo '{"id":8,"repo":"/elsewhere"}';; *) exit 1;; esac\n`,
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
  return { home, checkout, run };
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
