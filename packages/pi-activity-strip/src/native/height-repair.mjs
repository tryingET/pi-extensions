// ---
// summary: "restores tiled windows stranded at the wrong height when the ribbon's exclusive zone appears or disappears"
// read_when:
//   - "changing height repair, its evidence rules, or its safety bounds"
// ---

export const HEIGHT_REPAIR_SETTLE_MS = 300;
export const HEIGHT_REPAIR_MAX_PER_TRANSITION = 48;

/** @typedef {{id?: unknown; is_floating?: unknown; layout?: {window_size?: number[]}}} NiriWindow */
/** @typedef {{id: number; height: number}} StaleWindow */

/** @param {NiriWindow} window */
function tiledHeight(window) {
  if (window?.is_floating === true) return 0;
  const height = Number(window?.layout?.window_size?.[1] ?? 0);
  return Number.isFinite(height) && height > 0 ? height : 0;
}

/** @param {NiriWindow[]} windows */
function heightsById(windows) {
  /** @type {Map<number, number>} */
  const heights = new Map();
  for (const window of windows ?? []) {
    if (!Number.isInteger(window?.id)) continue;
    const height = tiledHeight(window);
    if (height > 0) heights.set(Number(window.id), height);
  }
  return heights;
}

/**
 * Decide which windows the compositor left behind. Changing the exclusive zone changes the output
 * working area, so every window whose height is automatic moves. A window that did not move while
 * others did is only treated as stale when it still sits at a height those movers just vacated:
 * that is positive evidence of the old working area, so a deliberately chosen height of any other
 * value is never touched.
 * @param {NiriWindow[]} before
 * @param {NiriWindow[]} after
 * @returns {StaleWindow[]}
 */
export function findStaleWindows(before, after) {
  const previous = heightsById(before);
  const current = heightsById(after);
  /** @type {Set<number>} */
  const vacated = new Set();
  for (const [id, height] of current) {
    const wasHeight = previous.get(id);
    if (wasHeight !== undefined && wasHeight !== height) vacated.add(wasHeight);
  }
  if (vacated.size === 0) return [];

  /** @type {StaleWindow[]} */
  const stale = [];
  for (const [id, height] of current) {
    const wasHeight = previous.get(id);
    if (wasHeight === undefined || wasHeight !== height) continue;
    if (vacated.has(height)) stale.push({ id, height });
  }
  return stale.sort((left, right) => left.id - right.id);
}

/**
 * @param {{
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>;
 *   env?: NodeJS.ProcessEnv;
 *   runtimeStatus: import("../common/contracts.ts").ActivityStripRuntimeStatus;
 *   readWindows: () => Promise<NiriWindow[]>;
 *   sleep?: (milliseconds: number) => Promise<void>;
 *   settleMs?: number;
 * }} options
 */
export function createHeightRepair({
  execFileAsync,
  env = process.env,
  runtimeStatus,
  readWindows,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  settleMs = HEIGHT_REPAIR_SETTLE_MS,
}) {
  const enabled = env.PI_ACTIVITY_STRIP_HEIGHT_REPAIR !== "0";
  /** @type {NiriWindow[]} */
  let lastWindows = [];
  /** Windows already reset at a given height, so one pass can never loop on one window. */
  /** @type {Set<string>} */
  const repaired = new Set();
  let inFlight = false;
  runtimeStatus.heightRepairState = enabled ? "enabled" : "disabled";
  runtimeStatus.heightRepairCount = 0;
  runtimeStatus.lastHeightRepairAt = 0;

  /** @param {NiriWindow[]} windows */
  function observe(windows) {
    if (!Array.isArray(windows) || windows.length === 0) return;
    // A window seen at a height other than the one it was reset at has moved since, so a future
    // stranding there is a new event and must not be suppressed by the earlier repair.
    for (const window of windows) {
      if (!Number.isInteger(window?.id)) continue;
      const height = tiledHeight(window);
      if (height <= 0) continue;
      for (const key of repaired) {
        const [id, at] = key.split(":");
        if (Number(id) === Number(window.id) && Number(at) !== height) repaired.delete(key);
      }
    }
    lastWindows = windows;
  }

  /**
   * Run after the panel reports that it applied a visibility change, which is the only moment the
   * exclusive zone changes. One pass at a time; a pass never retries a window it already reset.
   */
  async function repairAfterZoneChange() {
    if (!enabled || inFlight) return [];
    const before = lastWindows;
    if (before.length === 0) return [];
    inFlight = true;
    try {
      await sleep(settleMs);
      const after = await readWindows();
      if (after.length === 0) return [];
      lastWindows = after;
      const stale = findStaleWindows(before, after).filter(
        (window) => !repaired.has(`${window.id}:${window.height}`),
      );
      const bounded = stale.slice(0, HEIGHT_REPAIR_MAX_PER_TRANSITION);
      /** @type {number[]} */
      const applied = [];
      for (const window of bounded) {
        try {
          await execFileAsync(
            "niri",
            ["msg", "action", "reset-window-height", "--id", String(window.id)],
            { env },
          );
          repaired.add(`${window.id}:${window.height}`);
          applied.push(window.id);
        } catch {
          // A window that closed mid-pass, or a rejected action, is left to the next transition.
        }
      }
      if (applied.length > 0) {
        runtimeStatus.heightRepairCount =
          Number(runtimeStatus.heightRepairCount ?? 0) + applied.length;
        runtimeStatus.lastHeightRepairAt = Date.now();
      }
      return applied;
    } finally {
      inFlight = false;
    }
  }

  return { observe, repairAfterZoneChange, enabled };
}
