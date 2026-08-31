// ---
// summary: "watches focused Niri workspace events with a bounded polling fallback"
// read_when:
//   - "changing activity-strip workspace switch latency or Niri event-stream handling"
// ---

/**
 * Trigger focused-workspace reconciliation immediately from Niri's event
 * stream while retaining the slower poll as a fail-closed fallback.
 * @param {{
 *   spawn: typeof import("node:child_process").spawn;
 *   env: NodeJS.ProcessEnv;
 *   onFocusedWorkspace: (workspaceId: number) => void;
 *   onFallback: () => void;
 *   fallbackMs: number;
 *   setIntervalFn?: typeof setInterval;
 *   clearIntervalFn?: typeof clearInterval;
 * }} options
 */
export function createNiriWorkspaceEventWatcher(options) {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let buffer = "";
  let stopped = false;
  /** @type {ReturnType<typeof import("node:child_process").spawn> | null} */
  let child = null;
  /** @type {number | null} */
  let lastFocusedWorkspaceId = null;

  const fallbackTimer = setIntervalFn(() => {
    if (!stopped) options.onFallback();
  }, options.fallbackMs);
  fallbackTimer.unref?.();

  /** @param {unknown} chunk */
  function consume(chunk) {
    if (stopped) return;
    buffer += String(chunk ?? "");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const event = JSON.parse(line);
          const activation = event?.WorkspaceActivated;
          if (
            activation?.focused === true &&
            Number.isInteger(activation.id) &&
            activation.id !== lastFocusedWorkspaceId
          ) {
            lastFocusedWorkspaceId = activation.id;
            options.onFocusedWorkspace(activation.id);
          }
        } catch {
          // A malformed event is ignored; the fallback poll remains authoritative.
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  try {
    child = options.spawn("niri", ["msg", "-j", "event-stream"], {
      env: options.env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout?.on?.("data", consume);
    child.on?.("error", () => {});
  } catch {
    child = null;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(fallbackTimer);
    child?.stdout?.removeListener?.("data", consume);
    child?.kill?.();
    child = null;
  }

  return { stop };
}
