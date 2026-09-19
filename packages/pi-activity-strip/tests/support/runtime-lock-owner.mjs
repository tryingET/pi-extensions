// ---
// summary: "test helper that holds a runtime lock through a real flock owner, as the controller does"
// read_when:
//   - "writing tests that need a live or exiting runtime-lock owner"
// ---

import { spawn, spawnSync } from "node:child_process";

/** @param {string} lockPath */
function isHeld(lockPath) {
  return spawnSync("flock", ["--nonblock", lockPath, "true"], { stdio: "ignore" }).status === 1;
}

/**
 * Hold `lockPath` through `flock` for `holdMs`, resolving once the lock is actually held. With
 * `--no-fork` the lock holder is the spawned process itself, so `kill` releases the lock.
 * @param {string} lockPath
 * @param {number} holdMs
 */
export async function holdRuntimeLock(lockPath, holdMs) {
  const script = `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${holdMs});`;
  const child = spawn("flock", ["--no-fork", lockPath, process.execPath, "-e", script], {
    stdio: "ignore",
  });
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  const startedAt = Date.now();
  while (!isHeld(lockPath)) {
    if (Date.now() - startedAt > 5000) {
      child.kill();
      throw new Error(`the test lock owner never took ${lockPath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { exited, kill: () => child.kill() };
}
