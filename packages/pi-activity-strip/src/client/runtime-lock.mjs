// ---
// summary: "waits on the native runtime flock so stop returns only after the controller exits, and open can name a held lock"
// read_when:
//   - "changing how stop waits for shutdown or how open reports a runtime that failed to start"
// ---

import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { ACTIVITY_STRIP_START_TIMEOUT_MS } from "../common/constants.mjs";

const execFileAsync = promisify(execFile);

/**
 * The exit status `flock` uses for a held lock. It differs from every status the controller or
 * `flock` itself can return, so a held lock is never confused with a failure to check it.
 */
export const RUNTIME_LOCK_CONFLICT_EXIT_CODE = 75;

/** @typedef {import("../common/contracts.ts").BrokerResponse} BrokerResponse */
/** @typedef {{exitCode: number | null | undefined}} ControllerHandle */

/**
 * Take and release the lock once, reporting whether it was held.
 * @param {string} lockPath
 * @param {string[]} mode
 * @returns {Promise<"free" | "held" | {error: string}>}
 */
async function tryRuntimeLock(lockPath, mode) {
  const conflict = String(RUNTIME_LOCK_CONFLICT_EXIT_CODE);
  try {
    await execFileAsync("flock", [...mode, "--conflict-exit-code", conflict, lockPath, "true"]);
    return "free";
  } catch (error) {
    const failure = /** @type {{code?: unknown; message?: string}} */ (error ?? {});
    if (failure.code === RUNTIME_LOCK_CONFLICT_EXIT_CODE) return "held";
    return {
      error: `Could not check the activity-strip runtime lock: ${failure.message ?? String(error)}`,
    };
  }
}

/**
 * Wait until the controller holding the runtime lock has exited. The controller holds the lock for
 * its whole lifetime and closes its broker before it lets go, so a closed broker alone does not
 * prove it is gone. `waited` says whether a runtime was still there.
 * @param {string} lockPath
 * @param {{timeoutMs: number}} options
 * @returns {Promise<{released: boolean; waited?: boolean; error?: string}>}
 */
export async function waitForRuntimeExit(lockPath, { timeoutMs }) {
  const now = await tryRuntimeLock(lockPath, ["--nonblock"]);
  if (now === "free") return { released: true, waited: false };
  if (now !== "held") return { released: false, error: now.error };
  const later = await tryRuntimeLock(lockPath, ["--wait", String(timeoutMs / 1000)]);
  if (later === "free") return { released: true, waited: true };
  if (later === "held") return { released: false, waited: true };
  return { released: false, error: later.error };
}

/**
 * Wait for the controller `open` just spawned under the runtime lock to become ready. A spawn that
 * finds the lock held exits with the conflict status. The wait still continues, because the holder
 * may be a controller another `open` is starting; the held lock is reported only if nothing
 * becomes ready in time.
 * @param {{
 *   controller: ControllerHandle;
 *   getStatus: () => Promise<BrokerResponse | null>;
 *   timeoutMs?: number;
 *   retryMs?: number;
 *   now?: () => number;
 *   sleep?: (ms: number) => Promise<unknown>;
 * }} options
 * @returns {Promise<{ok: true; started: boolean} | {ok: false; reason: "error" | "exited" | "lock-held" | "timeout"; status: BrokerResponse | null; exitCode?: number | null}>}
 */
export async function waitForStartedRuntime({
  controller,
  getStatus,
  timeoutMs = ACTIVITY_STRIP_START_TIMEOUT_MS,
  retryMs = 125,
  now = Date.now,
  sleep = delay,
}) {
  const deadline = now() + timeoutMs;
  while (true) {
    const status = await getStatus();
    if (status?.ok && (!status.runtimeStatus || status.runtimeStatus.state === "ready")) {
      return { ok: true, started: controller.exitCode === undefined };
    }
    if (status?.runtimeStatus?.state === "error") return { ok: false, reason: "error", status };
    const exitCode = controller.exitCode;
    if (exitCode !== undefined && exitCode !== RUNTIME_LOCK_CONFLICT_EXIT_CODE) {
      return { ok: false, reason: "exited", status, exitCode };
    }
    if (now() >= deadline) {
      const reason = exitCode === RUNTIME_LOCK_CONFLICT_EXIT_CODE ? "lock-held" : "timeout";
      return { ok: false, reason, status };
    }
    await sleep(retryMs);
  }
}
