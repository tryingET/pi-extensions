// ---
// summary: "proves stop and open observe the native runtime lock, so a restart cannot race the old owner"
// read_when:
//   - "changing how stop waits for shutdown or how open reports a runtime that failed to start"
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  RUNTIME_LOCK_CONFLICT_EXIT_CODE,
  waitForRuntimeExit,
  waitForStartedRuntime,
} from "../src/client/runtime-lock.mjs";
import { holdRuntimeLock } from "./support/runtime-lock-owner.mjs";

const CONFLICT = RUNTIME_LOCK_CONFLICT_EXIT_CODE;

function lockFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-activity-runtime-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, "runtime.lock");
}

test("stop's wait returns at once for a free lock and says it did not wait", async (t) => {
  const lockPath = lockFixture(t);
  assert.deepEqual(await waitForRuntimeExit(lockPath, { timeoutMs: 3000 }), {
    released: true,
    waited: false,
  });
});

test("stop's wait returns once a real owner that is still exiting releases the lock", async (t) => {
  // This is the restart race: the old runtime's broker may already be gone, but it still holds the
  // lock, and a start before it lets go would lose the lock and leave nothing running.
  const lockPath = lockFixture(t);
  const owner = await holdRuntimeLock(lockPath, 400);
  t.after(() => owner.kill());
  assert.deepEqual(await waitForRuntimeExit(lockPath, { timeoutMs: 3000 }), {
    released: true,
    waited: true,
  });
  assert.equal(await owner.exited, 0);
});

test("stop's wait reports a lock still held at its deadline without calling it an error", async (t) => {
  const lockPath = lockFixture(t);
  const owner = await holdRuntimeLock(lockPath, 5000);
  t.after(() => owner.kill());
  assert.deepEqual(await waitForRuntimeExit(lockPath, { timeoutMs: 300 }), {
    released: false,
    waited: true,
  });
});

test("a lock that cannot be checked is an error, not a held lock", async () => {
  const result = await waitForRuntimeExit("/nonexistent-pi-activity-dir/runtime.lock", {
    timeoutMs: 300,
  });
  assert.equal(result.released, false);
  assert.match(result.error ?? "", /runtime lock/);
});

/** A virtual clock plus scripted broker states for one spawned controller. */
function scripted({ states, exitCodes }) {
  let clock = 0;
  const controller = { exitCode: undefined };
  return {
    controller,
    options: {
      controller,
      getStatus: async () => {
        const state = states.length > 1 ? states.shift() : states[0];
        controller.exitCode = exitCodes.length > 1 ? exitCodes.shift() : exitCodes[0];
        return state === "absent" ? null : { ok: true, runtimeStatus: { state } };
      },
      timeoutMs: 5000,
      retryMs: 125,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
  };
}

test("a controller that takes the lock is waited on until it is ready", async () => {
  const run = scripted({ states: ["absent", "starting", "ready"], exitCodes: [undefined] });
  assert.deepEqual(await waitForStartedRuntime(run.options), { ok: true, started: true });
});

test("a controller another open is starting counts as running, not as a failure", async () => {
  const run = scripted({ states: ["absent", "absent", "ready"], exitCodes: [CONFLICT] });
  assert.deepEqual(await waitForStartedRuntime(run.options), { ok: true, started: false });
});

test("a lock held past the deadline by a runtime that never answers is named as held", async () => {
  // This is the restart race without a waiting `stop`: the old runtime still holds the lock.
  const run = scripted({ states: ["absent"], exitCodes: [CONFLICT] });
  const result = await waitForStartedRuntime(run.options);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "lock-held" });
});

test("a controller that exits during startup fails the start with its exit code", async () => {
  const run = scripted({ states: ["absent"], exitCodes: [undefined, 1] });
  const result = await waitForStartedRuntime(run.options);
  assert.deepEqual(
    { ok: result.ok, reason: result.reason, exitCode: result.exitCode },
    { ok: false, reason: "exited", exitCode: 1 },
  );
});

test("a controller that reports an error fails the start with that status", async () => {
  const run = scripted({ states: ["absent", "error"], exitCodes: [undefined] });
  const result = await waitForStartedRuntime(run.options);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "error");
  assert.equal(result.status?.runtimeStatus?.state, "error");
});

test("a controller that never becomes ready times out as itself, not as a held lock", async () => {
  const run = scripted({ states: ["starting"], exitCodes: [undefined] });
  const result = await waitForStartedRuntime(run.options);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "timeout" });
});
