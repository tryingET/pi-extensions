// AUTHORED, NOT EXECUTED. Real scratch-file write/rename/read I/O + injected failures.
// This is a raw-JSON publication proxy, NOT atomicWriteStateRecord, OS fsync fault,
// power-loss, full MutationSession, recovery executor, or process-liveness proof.
// Requires separate admission + an existing owned PI_HOST_COMPAT_CLEARANCE_FIXTURE_DIR.
// No subprocesses, package managers, lifecycle imports or cleanup. Retain every fixture.
import assert from "node:assert/strict";
import { closeSync, fsyncSync, lstatSync, mkdtempSync, openSync, readFileSync,
  realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertClearancePublication, assertRecoveryChildReconciled, clearRecordedChild } from "./child-clearance.mjs";
import { finishMutationCommand } from "./mutation-completion.mjs";

const modes = ["before-write", "before-rename", "after-rename", "fence-before", "fence-after"];
for (const mode of modes) for (const ok of [true, false]) {
  test(`real rename I/O / injected ${mode}, exit ${ok ? 0 : 7}: visible prior child and admission refusal`, () => {
    const base = process.env.PI_HOST_COMPAT_CLEARANCE_FIXTURE_DIR;
    assert.ok(typeof base === "string" && path.isAbsolute(base) && base !== "/tmp" && !base.startsWith("/tmp/"));
    assert.equal(realpathSync(base), base);
    assert.ok(lstatSync(base).isDirectory() && !lstatSync(base).isSymbolicLink());
    const directory = mkdtempSync(path.join(base, "child-clearance-"));
    const file = path.join(directory, "journal.json");
    const candidate = path.join(directory, "candidate.json");
    const prior = { effect: "explicit-restore-host", targetIndex: 0, identity: {
      platform: "linux", uid: 1000, pid: 101, processGroupId: 101,
      machineId: "a".repeat(32), bootId: "11111111-1111-4111-8111-111111111111",
      startTimeTicks: "12345", pidNamespace: { dev: "1", ino: "2", link: "pid:[2]" },
    } };
    const payload = { phase: "recovery-restore-command-intent", child: structuredClone(prior) };
    writeFileSync(file, JSON.stringify(payload), { flag: "wx", mode: 0o600 });
    const before = readFileSync(file); const fence = lstatSync(file, { bigint: true });
    let calls = 0; let dependentRestoration = false;
    const persist = () => {
      calls++;
      const current = lstatSync(file, { bigint: true });
      if (current.dev !== fence.dev || current.ino !== fence.ino || mode === "fence-before" || calls > 1) {
        throw Error("publication fence failed");
      }
      assertClearancePublication(JSON.parse(readFileSync(file, "utf8")), payload);
      if (mode === "before-write") throw Error("injected before write");
      writeFileSync(candidate, JSON.stringify(payload), { flag: "wx", mode: 0o600 });
      const fd = openSync(candidate, "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
      if (mode === "before-rename") throw Error("injected before rename");
      renameSync(candidate, file); // actual atomic replacement, NOT a callback-only disk model
      if (mode === "after-rename") throw Error("injected at directory fsync/readback boundary");
      const after = lstatSync(file, { bigint: true });
      assert.notEqual(after.ino, fence.ino);
      throw Error("injected post-publication fence failure");
    };
    assert.throws(() => {
      finishMutationCommand({ ok, exitCode: ok ? 0 : 7, signal: null }, {
        verify() {}, // identity validation proxy: no lifecycle or SDK is executed
        clear: () => clearRecordedChild(payload, persist),
        hold(reason, effectMayBeActive) { payload.completionHold = { reason, effectMayBeActive }; persist(); },
        reason: "restoration-completion-unverified",
      });
      dependentRestoration = true;
    }, /publication fence failed/);
    assert.equal(dependentRestoration, false); assert.equal(calls, 2);
    const visible = JSON.parse(readFileSync(file, "utf8"));
    if (["after-rename", "fence-after"].includes(mode)) {
      assert.equal(visible.child, null);
      assert.deepEqual(visible.childClearanceAttempts, [prior]);
      assert.notEqual(lstatSync(file, { bigint: true }).ino, fence.ino);
    } else {
      assert.deepEqual(readFileSync(file), before);
      assert.deepEqual(visible.child, prior);
      assert.equal("childClearanceAttempts" in visible, false);
    }
    assert.equal("completionHold" in visible, false); // a failed hold did NOT reach this file
    assert.deepEqual(payload.child, prior); // memory restoration is separately asserted
    assert.throws(() => assertRecoveryChildReconciled(visible), /automatic and explicit recovery refused/);
  });
}
