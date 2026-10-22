// Negative controls for the lifecycle instruments, not additional production launch behavior.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { launchDetachedGhosttyWindow } from "../extensions/sidequestDetachedWindow.ts";
import {
  assertLaunchWhileAlive,
  createObserverContext,
  ownLaunchProcesses,
  withDeadman,
} from "./launch-oracle-harness.mjs";

test("liveness oracle rejects a valid handshake inspected only after child exit", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-late-oracle-"));
  const owned = ownLaunchProcesses();
  try {
    const result = await launchDetachedGhosttyWindow({
      command: process.execPath,
      cwd: process.cwd(),
      scratchRoot,
      startupTimeoutMs: 500,
      buildArgs: ({ path, token }) => [
        "-e",
        'require("node:fs").writeFileSync(process.argv[1], process.argv[2] + "\\n")',
        path,
        token,
      ],
      spawnProcess: owned.spawnProcess,
    });
    assert.equal(result.ok, true, "command admission alone can outlive the child");
    await withDeadman(owned.children[0].closed, "short-lived child close");
    await assert.rejects(
      assertLaunchWhileAlive(result, owned.children[0].child),
      /handshake must settle while the owned child is alive/,
    );
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    await owned.dispose();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("observer oracle rejects absent completion instead of treating silence as success", async () => {
  const { observerSettled, notifications } = createObserverContext({ cwd: "/repo" });
  // A short *negative-control* deadman, not an operation timeout or success condition.
  await assert.rejects(observerSettled(1), /test deadman: observer completion notification/);
  assert.deepEqual(notifications, []);
});

test("observer oracle remains pending until the lifecycle callback", async () => {
  const { ctx, observerSettled, notifications } = createObserverContext({ cwd: "/repo" });
  let completed = false;
  const settlement = observerSettled().then(() => {
    completed = true;
  });
  try {
    await Promise.resolve();
    assert.equal(completed, false);
  } finally {
    ctx.ui.notify("ASC observer startup unconfirmed; no renderer ACK", "warning");
    await settlement;
  }
  assert.equal(completed, true);
  assert.equal(notifications.length, 1);
});

test("owned process cleanup closes a live child even on an assertion failure", async () => {
  const owned = ownLaunchProcesses();
  await assert.rejects(async () => {
    try {
      owned.spawnProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        detached: true,
        stdio: "ignore",
      });
      assert.fail("injected assertion failure");
    } finally {
      await owned.dispose();
    }
  }, /injected assertion failure/);
  const { child } = owned.children[0];
  assert.equal(child.signalCode, "SIGKILL");
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
});
