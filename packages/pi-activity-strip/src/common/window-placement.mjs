// ---
// summary: "places bound Pi terminal surfaces onto Niri windows, including tabs hidden behind another tab"
// read_when:
//   - "changing how hidden Ghostty tabs are attributed to windows, workspaces, or activation targets"
// ---

import { sessionBindingKey } from "./surface-bindings.mjs";
import { appIdForGhosttyFamily, canonicalGhosttyTerminalKey } from "./terminal-identity.mjs";

/** @typedef {"title" | "host" | "binding"} SurfacePlacement */
/** @typedef {{window: Record<string, unknown>; placement: SurfacePlacement}} WindowPlacement */
/**
 * @typedef {{
 *   resolveHostPid?: (session: Record<string, unknown>) => number;
 *   lookupBinding?: (bindingKey: string) => {windowId: number; windowPid: number} | null;
 * }} PlacementOptions
 */

/**
 * Place a bound surface whose title is not visible in any window. A surface can only live inside
 * a window of its own Ghostty process, so a single host window is an exact placement. Several host
 * windows require the window that last displayed this surface; without that memory the surface
 * stays unplaced rather than guessed.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Record<string, unknown>} session
 * @param {PlacementOptions & {sessionToken?: string}} [options]
 * @returns {WindowPlacement | null}
 */
export function resolveHiddenSurfaceWindow(windows, session, options = {}) {
  const terminalKey = canonicalGhosttyTerminalKey(session);
  if (!terminalKey) return null;
  const hostPid = Number(options.resolveHostPid?.(session) ?? 0);
  if (!Number.isInteger(hostPid) || hostPid <= 0) return null;
  const appId = appIdForGhosttyFamily(String(session.terminalFamily ?? ""));
  const hostWindows = windows.filter(
    (window) =>
      Number.isInteger(window?.id) &&
      window.pid === hostPid &&
      String(window.app_id ?? "") === appId,
  );
  if (hostWindows.length === 1) return { window: hostWindows[0], placement: "host" };
  if (hostWindows.length === 0) return null;
  for (const key of [terminalKey, sessionBindingKey(options.sessionToken)].filter(Boolean)) {
    const binding = options.lookupBinding?.(key);
    if (!binding) continue;
    const remembered = hostWindows.find(
      (window) => window.id === binding.windowId && window.pid === binding.windowPid,
    );
    if (remembered) return { window: remembered, placement: "binding" };
  }
  return null;
}

/** @param {SurfacePlacement | undefined} placement */
export function describePlacement(placement) {
  if (placement === "host") return "hidden tab inside its Ghostty process's only window";
  if (placement === "binding") return "hidden tab in the window that last displayed it";
  return "visible tab";
}
