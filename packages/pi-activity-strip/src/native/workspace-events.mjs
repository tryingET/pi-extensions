// ---
// summary: "watches focused Niri workspace events with a bounded polling fallback"
// read_when:
//   - "changing activity-strip workspace switch latency or Niri event-stream handling"
// ---

/**
 * Trigger focused-workspace reconciliation immediately from Niri's event
 * stream while retaining the slower poll as a fail-closed fallback. Window
 * open/change/close and focus events are forwarded so title changes that reveal
 * a Ghostty tab, or windows moving between workspaces, are seen between polls.
 * Workspace list changes are forwarded too, because reordering or removing a
 * workspace renumbers the focused one without activating anything.
 * @param {{
 *   spawn: typeof import("node:child_process").spawn;
 *   env: NodeJS.ProcessEnv;
 *   onFocusedWorkspace: (workspaceId: number) => void;
 *   onFallback: () => void;
 *   onWindowChanged?: (window: Record<string, unknown>) => void;
 *   onWindowClosed?: (windowId: number) => void;
 *   onWindowsChanged?: (windows: Record<string, unknown>[]) => void;
 *   onWindowFocusChanged?: (windowId: number | null) => void;
 *   onWorkspacesChanged?: () => void;
 *   onFocusInvalidated?: () => void;
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
          if (event && typeof event === "object" && "WorkspacesChanged" in event) {
            const workspaces = event.WorkspacesChanged?.workspaces;
            const valid =
              Array.isArray(workspaces) &&
              workspaces.every(
                (workspace) =>
                  Number.isInteger(workspace?.id) && typeof workspace?.is_focused === "boolean",
              );
            const focused = valid
              ? workspaces.filter((workspace) => workspace.is_focused === true)
              : [];
            if (focused.length !== 1 || !Number.isInteger(focused[0].id))
              options.onFocusInvalidated?.();
            else if (focused[0].id !== lastFocusedWorkspaceId) {
              lastFocusedWorkspaceId = focused[0].id;
              options.onFocusedWorkspace(focused[0].id);
            }
            options.onWorkspacesChanged?.();
          }
          if (event && typeof event === "object" && "WindowsChanged" in event) {
            const windows = event.WindowsChanged?.windows;
            const valid =
              Array.isArray(windows) &&
              windows.every(
                (window) => Number.isInteger(window?.id) && typeof window?.is_focused === "boolean",
              );
            if (valid) options.onWindowsChanged?.(windows);
            const focused = valid ? windows.filter((window) => window.is_focused === true) : null;
            if (focused?.length === 1 && Number.isInteger(focused[0].id))
              options.onWindowFocusChanged?.(focused[0].id);
            else if (focused?.length === 0 && windows.length > 0)
              options.onWindowFocusChanged?.(null);
            else options.onFocusInvalidated?.();
          }
          const changedWindow = event?.WindowOpenedOrChanged?.window;
          if (changedWindow && typeof changedWindow === "object") {
            options.onWindowChanged?.(changedWindow);
          }
          const closedId = event?.WindowClosed?.id;
          if (Number.isInteger(closedId)) options.onWindowClosed?.(closedId);
          if (event && typeof event === "object" && "WindowFocusChanged" in event) {
            const focusedId = event.WindowFocusChanged?.id;
            if (focusedId === null || Number.isInteger(focusedId))
              options.onWindowFocusChanged?.(focusedId);
            else options.onFocusInvalidated?.();
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
    child.on?.("error", () => {
      if (!stopped) options.onFocusInvalidated?.();
    });
    child.on?.("close", () => {
      if (!stopped) options.onFocusInvalidated?.();
    });
  } catch {
    options.onFocusInvalidated?.();
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

/** Keep focus admission on the compositor event path; slow fallback reads must not queue a
 * keyboard grab or override a newer known non-agent event.
 * @param {{
 *   projection: ReturnType<typeof import("./panel-projection.mjs").createNativePanelProjection>;
 *   placement: Pick<ReturnType<typeof import("./placement.mjs").createPlacementRuntime>, "observeWindowEvent" | "observeWindowList" | "forgetWindow" | "resolveCachedWorkspaceView">;
 *   reconcile: () => unknown;
 * }} options
 */
export function createWorkspaceProjectionHandlers({ projection, placement, reconcile }) {
  const invalidate = () => {
    projection.invalidateFocus();
    reconcile();
  };
  return {
    onFocusedWorkspace: invalidate,
    onFallback: reconcile,
    onFocusInvalidated: invalidate,
    /** @param {Record<string, unknown>} window */
    onWindowChanged(window) {
      const changed = placement.observeWindowEvent(window);
      if (changed) projection.invalidateWindowFocus(Number(window.id));
      // Correctness does not depend on the work-scheduling signature or on which window changed.
      const valid = projection.revalidateWindowFocus(placement.resolveCachedWorkspaceView);
      if (changed || !valid) reconcile();
    },
    /** @param {number} windowId */
    onWindowClosed(windowId) {
      projection.invalidateWindowFocus(windowId);
      placement.forgetWindow(windowId);
      projection.revalidateWindowFocus(placement.resolveCachedWorkspaceView);
      reconcile();
    },
    /** @param {Record<string, unknown>[]} windows */
    onWindowsChanged(windows) {
      placement.observeWindowList(windows);
      projection.revalidateWindowFocus(placement.resolveCachedWorkspaceView);
      reconcile();
    },
    /** @param {number | null} windowId */
    onWindowFocusChanged(windowId) {
      projection.publishWindowFocus(windowId, placement.resolveCachedWorkspaceView);
      reconcile();
    },
    onWorkspacesChanged: reconcile,
  };
}
