// ---
// summary: "polls read-only ak CLI output and hands parsed claims to the card projection"
// read_when:
//   - "changing AK polling cadence, fail-closed behavior, or the ak CLI read surface"
// ---

import {
  claimIsLive,
  parseAkClaimList,
  parseAkDeferredList,
  summarizeAkTasks,
} from "../common/ak-tasks.mjs";

/** AK state changes are rare; a calm clock keeps the ribbon cheap. */
export const AK_TASK_REFRESH_MS = 15_000;
const AK_EXEC_TIMEOUT_MS = 8000;
const AK_EXEC_MAX_BUFFER = 4 * 1024 * 1024;

/**
 * The strip reads AK strictly through the read-only CLI (`ak task list` / `ak task deferred`);
 * it never opens the society database and never writes. Any failure (missing binary, non-zero
 * exit, malformed output) fails closed: chips are dropped rather than guessed.
 * @param {{
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>;
 *   env?: NodeJS.ProcessEnv;
 *   now?: () => number;
 *   runtimeStatus: import("../common/contracts.ts").ActivityStripRuntimeStatus;
 *   onChange: (state: {claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]}) => void;
 * }} options
 */
export function createAkTaskRuntime({
  execFileAsync,
  env = process.env,
  now = Date.now,
  runtimeStatus,
  onChange,
}) {
  const disabled = env.PI_ACTIVITY_STRIP_AK_TASKS === "0";
  const akBinary = env.PI_ACTIVITY_STRIP_AK_BIN?.trim() || "ak";
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  let inFlight = false;

  runtimeStatus.akTaskState = disabled ? "disabled" : (runtimeStatus.akTaskState ?? "pending");
  runtimeStatus.akTaskError = runtimeStatus.akTaskError ?? null;
  runtimeStatus.akTaskClaimCount = runtimeStatus.akTaskClaimCount ?? 0;
  runtimeStatus.akTaskDeferredCount = runtimeStatus.akTaskDeferredCount ?? 0;
  runtimeStatus.akTaskOrphanCount = runtimeStatus.akTaskOrphanCount ?? 0;
  runtimeStatus.akTaskRenderedCount = runtimeStatus.akTaskRenderedCount ?? 0;

  /**
   * @param {string[]} args
   * @returns {Promise<string>}
   */
  async function readCli(args) {
    const { stdout } = await execFileAsync(akBinary, args, {
      timeout: AK_EXEC_TIMEOUT_MS,
      maxBuffer: AK_EXEC_MAX_BUFFER,
    });
    return String(stdout ?? "");
  }

  /**
   * @param {string} error
   */
  function failClosed(error) {
    runtimeStatus.akTaskState = "unavailable";
    runtimeStatus.akTaskError = error;
    runtimeStatus.akTaskClaimCount = 0;
    runtimeStatus.akTaskDeferredCount = 0;
    onChange({ claims: [], deferred: [] });
  }

  async function refresh() {
    if (disabled || inFlight) return false;
    inFlight = true;
    try {
      const [claimRaw, deferredRaw] = await Promise.all([
        readCli(["task", "list", "--status", "claimed", "--format", "json", "--all", "--verbose"]),
        readCli(["task", "deferred", "--format", "json", "--all"]),
      ]);
      const claims = parseAkClaimList(claimRaw);
      const deferred = parseAkDeferredList(deferredRaw);
      if (!claims.ok) {
        failClosed(claims.error);
        return false;
      }
      if (!deferred.ok) {
        failClosed(deferred.error);
        return false;
      }
      runtimeStatus.akTaskState = "ok";
      runtimeStatus.akTaskError = null;
      runtimeStatus.akTaskClaimCount = claims.claims.filter((claim) =>
        claimIsLive(claim, now()),
      ).length;
      runtimeStatus.akTaskDeferredCount = deferred.deferred.length;
      onChange({ claims: claims.claims, deferred: deferred.deferred });
      return true;
    } catch (error) {
      failClosed(`ak CLI unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      inFlight = false;
    }
  }

  return {
    refresh,
    get disabled() {
      return disabled;
    },
    start() {
      if (disabled || timer) return;
      void refresh();
      timer = setInterval(() => void refresh(), AK_TASK_REFRESH_MS);
      timer.unref?.();
    },
  };
}

/**
 * Wire the AK read loop into the card projection: parsed claims become chips, and orphaned
 * custody is counted against every live session so a claim is only orphaned when no live
 * session anywhere still holds it.
 * @param {{
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>;
 *   env?: NodeJS.ProcessEnv;
 *   runtimeStatus: import("../common/contracts.ts").ActivityStripRuntimeStatus;
 *   projection: {
 *     setAkTasks: (state: {claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]} | null) => void;
 *     getRawSessions: () => Array<Record<string, unknown>>;
 *   };
 * }} options
 */
export function startAkTaskProjection({
  execFileAsync,
  env = process.env,
  runtimeStatus,
  projection,
}) {
  const runtime = createAkTaskRuntime({
    execFileAsync,
    env,
    runtimeStatus,
    onChange: (state) => {
      projection.setAkTasks(state);
      const summary = summarizeAkTasks({
        claims: state.claims,
        deferred: state.deferred,
        liveSessionIds: new Set(
          projection
            .getRawSessions()
            .map((session) => String(session.sessionId ?? ""))
            .filter(Boolean),
        ),
        nowMs: Date.now(),
      });
      runtimeStatus.akTaskOrphanCount = summary.orphanedClaimCount;
    },
  });
  runtime.start();
  return runtime;
}
