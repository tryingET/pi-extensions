// ---
// summary: "owns Niri native strip remapping, floating conversion, and exact top-edge alignment"
// read_when:
//   - "changing compositor-native activity-strip placement or animation detection"
// ---

import { hasNiriFloatingPosition, isNiriWindowAligned } from "../common/alignment-controller.mjs";
import { resolveActivityStripWindow } from "../common/niri-focus.mjs";

const defaultWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatDelta(value) {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

function readPosition(window) {
  const position = window?.layout?.tile_pos_in_workspace_view;
  if (!Array.isArray(position) || position.length < 2) return null;
  return {
    x: Number(position[0] ?? 0),
    y: Number(position[1] ?? 0),
  };
}

/**
 * @param {{
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<unknown>;
 *   env: NodeJS.ProcessEnv;
 *   timeoutMs: number;
 *   processId: number;
 *   readWindows: () => Promise<Array<Record<string, unknown>>>;
 *   getBrowserWindow: () => import("electron").BrowserWindow | null;
 *   getBounds: () => {x: number; y: number; width: number; height: number};
 *   isNiriSession: () => boolean;
 *   wait?: (milliseconds: number) => Promise<unknown>;
 * }} options
 */
export function createNiriNativeWindowRuntime(options) {
  const wait = options.wait ?? defaultWait;

  function resolveProcessWindow(windows) {
    return resolveActivityStripWindow(
      windows.filter((window) => window?.pid === options.processId),
    );
  }

  async function getProcessWindow() {
    return resolveProcessWindow(await options.readWindows());
  }

  async function moveWindowToWorkspace(stripWindow, workspace) {
    const reference = workspace.name || workspace.idx;
    if (reference == null) return false;
    try {
      await options.execFileAsync(
        "niri",
        [
          "msg",
          "action",
          "move-window-to-workspace",
          "--window-id",
          String(stripWindow.id),
          "--focus",
          "false",
          String(reference),
        ],
        { env: options.env, timeout: options.timeoutMs },
      );
      return true;
    } catch {
      return false;
    }
  }

  async function moveWindowToTop(isCurrent) {
    let animated = false;
    const browserWindow = options.getBrowserWindow();
    if (!isCurrent() || !browserWindow || browserWindow.isDestroyed() || !options.isNiriSession()) {
      return { ok: false, animated };
    }

    let niriWindow = await getProcessWindow();
    if (!isCurrent() || !niriWindow?.id) return { ok: false, animated };
    if (niriWindow.is_floating !== true) {
      try {
        await options.execFileAsync(
          "niri",
          ["msg", "action", "move-window-to-floating", "--id", String(niriWindow.id)],
          { env: options.env },
        );
        animated = true;
      } catch {
        return { ok: false, animated };
      }
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!isCurrent()) return { ok: false, animated };
      const position = readPosition(niriWindow);
      if (hasNiriFloatingPosition(niriWindow) && position) {
        const target = options.getBounds();
        if (isNiriWindowAligned(niriWindow, target)) return { ok: true, animated };
        const deltaX = target.x - position.x;
        const deltaY = target.y - position.y;
        if (Math.abs(deltaX) >= 1 || Math.abs(deltaY) >= 1) {
          try {
            await options.execFileAsync(
              "niri",
              [
                "msg",
                "action",
                "move-floating-window",
                "--id",
                String(niriWindow.id),
                "-x",
                formatDelta(deltaX),
                "-y",
                formatDelta(deltaY),
              ],
              { env: options.env },
            );
            animated = true;
          } catch {
            return { ok: false, animated };
          }
        }
      }
      await wait(60);
      if (!isCurrent()) return { ok: false, animated };
      niriWindow = await getProcessWindow();
      if (!niriWindow?.id) return { ok: false, animated };
    }
    return { ok: false, animated };
  }

  async function alignWindowToTop(isCurrent) {
    const browserWindow = options.getBrowserWindow();
    if (!isCurrent() || !browserWindow || browserWindow.isDestroyed()) {
      return { ok: false, animated: false };
    }
    if (!options.isNiriSession()) {
      browserWindow.setBounds(options.getBounds(), false);
      return { ok: true, animated: false };
    }

    const niriWindow = await getProcessWindow();
    if (!isCurrent()) return { ok: false, animated: false };
    const target = options.getBounds();
    const currentSize = niriWindow?.layout?.window_size;
    const widthMatches = Array.isArray(currentSize) && Number(currentSize[0]) === target.width;
    const heightMatches = Array.isArray(currentSize) && Number(currentSize[1]) === target.height;
    let animated = false;

    if (!widthMatches || !heightMatches) {
      browserWindow.setSize(target.width, target.height, false);
      animated = true;
      await wait(80);
      if (!isCurrent()) return { ok: false, animated };
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await moveWindowToTop(isCurrent);
      animated ||= result.animated;
      if (result.ok) return { ok: true, animated };
      if (!isCurrent()) return { ok: false, animated };
      await wait(60);
    }
    return { ok: false, animated };
  }

  return {
    alignWindowToTop,
    isWindowAligned: (window) => isNiriWindowAligned(window, options.getBounds()),
    moveWindowToWorkspace,
    resolveProcessWindow,
  };
}
