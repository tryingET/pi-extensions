/** Numeric hover jumps remain bounded by the admitted directory, rechecked AFTER the IPC read.
 * Explicit/manual ownership alone may request an existing unlisted window.
 * @param {{
 * isNiriSession: () => boolean;
 * readWindows: () => Promise<Record<string, unknown>[]>;
 * isAdmittedWindow: (id: number, windows: Record<string, unknown>[]) => boolean;
 * focusWindow: (id: number) => Promise<unknown>;
 * reconcile: () => void;
 * }} options
 */
export function createWindowJump({
  isNiriSession,
  readWindows,
  isAdmittedWindow,
  focusWindow,
  reconcile,
}) {
  /** @param {number} windowId @param {boolean} [allowUnlisted] @param {(windows: Record<string, unknown>[]) => boolean} [isCurrent] */
  return async function jumpToWindow(windowId, allowUnlisted = false, isCurrent = () => true) {
    if (!isNiriSession()) return { ok: false, error: "Niri is not available; nothing moved." };
    if (!Number.isInteger(windowId) || windowId < 0)
      return { ok: false, error: "Not a window number; nothing moved." };
    let windows;
    try {
      windows = await readWindows();
    } catch {
      return { ok: false, error: "Could not read Niri windows; nothing moved." };
    }
    if (!isCurrent(windows))
      return { ok: false, error: "Keyboard context was revoked; nothing moved." };
    if (!allowUnlisted && !isAdmittedWindow(windowId, windows))
      return { ok: false, error: "Window is not in the admitted agent directory; nothing moved." };
    if (!windows.some((window) => window?.id === windowId))
      return { ok: false, error: `No window #${windowId}; nothing moved.` };
    try {
      await focusWindow(windowId);
    } catch {
      return { ok: false, error: `Niri refused to focus #${windowId}; nothing moved.` };
    }
    reconcile();
    return { ok: true };
  };
}
