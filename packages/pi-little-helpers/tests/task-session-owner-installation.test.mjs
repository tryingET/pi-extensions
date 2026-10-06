import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, symlinkSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ownerInstallation } from "../dist/task-session/producer.js";

function accountHome(t) {
  const account = os.userInfo(),
    home = mkdtempSync(join(tmpdir(), "task5480-owner-installation-"));
  t.mock.method(os, "userInfo", () => ({ ...account, homedir: home }));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return home;
}

test("owner installation is the published AK runtime bundle, not a working checkout", (t) => {
  const home = accountHome(t),
    runtime = join(home, ".local/libexec/agent-kernel/runtime");
  // A working checkout at the old fixed path is not the owner installation.
  mkdirSync(join(home, "ai-society/softwareco/owned/agent-kernel/scripts"), { recursive: true });
  assert.throws(() => ownerInstallation(), /producer_runtime_unavailable/);
  mkdirSync(join(runtime, "c0ffee/scripts"), { recursive: true });
  symlinkSync("c0ffee", join(runtime, "current"));
  const installation = ownerInstallation();
  assert.equal(installation.root, realpathSync(join(runtime, "c0ffee")));
  assert.equal(installation.host, join(home, ".local/libexec/pi-task-sessions/host-v1"));
});

test("an AK rotation moves the owner installation to the new bundle", (t) => {
  const home = accountHome(t),
    runtime = join(home, ".local/libexec/agent-kernel/runtime");
  for (const commit of ["old", "new"]) mkdirSync(join(runtime, commit), { recursive: true });
  symlinkSync("old", join(runtime, "current"));
  assert.equal(ownerInstallation().root, realpathSync(join(runtime, "old")));
  // Activation replaces `current` atomically, as ak-runtime-publish does.
  symlinkSync("new", join(runtime, "next"));
  renameSync(join(runtime, "next"), join(runtime, "current"));
  assert.equal(ownerInstallation().root, realpathSync(join(runtime, "new")));
});
