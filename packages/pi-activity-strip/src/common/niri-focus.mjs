// ---
// summary: "resolves Pi session identity to exactly one Ghostty Niri window and focuses it fail-closed"
// read_when:
//   - "changing card activation, CLI focus, Ghostty matching, or Niri workspace following"
// ---

const GHOSTTY_APP_IDS = new Set(["com.mitchellh.ghostty", "com.tryinget.ghosttysidequest"]);
const PI_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {string} value */
export function shortSessionId(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 8);
}

/**
 * Title matching is deliberately exact at the identity suffix emitted by Pi's title
 * bridge (" · <first-eight-session-id>"). The app id must also identify a known
 * Ghostty build, and ambiguity always returns no match.
 * @param {Array<Record<string, unknown>>} windows
 * @param {string} sessionId
 */
export function resolveExactGhosttyWindow(windows, sessionId) {
  const fullId = String(sessionId ?? "").trim();
  const token = shortSessionId(fullId);
  if (!PI_SESSION_ID.test(fullId) || token.length !== 8) return null;
  const suffix = ` · ${token}`;
  const matches = windows.filter(
    (window) =>
      Number.isInteger(window?.id) &&
      GHOSTTY_APP_IDS.has(String(window?.app_id ?? "")) &&
      String(window?.title ?? "").endsWith(suffix),
  );
  return matches.length === 1 ? matches[0] : null;
}

/** @param {Array<Record<string, unknown>>} workspaces */
export function resolveFocusedNiriWorkspace(workspaces) {
  const matches = workspaces.filter(
    (workspace) =>
      workspace?.is_focused === true &&
      Number.isInteger(workspace?.id) &&
      (typeof workspace?.name === "string" || Number.isInteger(workspace?.idx)),
  );
  return matches.length === 1 ? matches[0] : null;
}

/** @param {Array<Record<string, unknown>>} windows */
export function resolveActivityStripWindow(windows) {
  const matches = windows.filter(
    (window) => Number.isInteger(window?.id) && window?.title === "Pi Activity Strip",
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Move the unique strip to the focused workspace, then focus it. This command is
 * designed for a compositor key binding and never registers a global hotkey itself.
 * @param {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} execFileAsync
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function focusNiriStrip(execFileAsync, env = process.env) {
  if (!env.NIRI_SOCKET)
    return { ok: false, error: "Niri is not available; strip focus did nothing." };
  try {
    const [{ stdout: windowOutput }, { stdout: workspaceOutput }] = await Promise.all([
      execFileAsync("niri", ["msg", "-j", "windows"], { env }),
      execFileAsync("niri", ["msg", "-j", "workspaces"], { env }),
    ]);
    const windows = JSON.parse(String(windowOutput ?? "[]"));
    const workspaces = JSON.parse(String(workspaceOutput ?? "[]"));
    if (!Array.isArray(windows) || !Array.isArray(workspaces))
      throw new Error("unexpected payload");
    const strip = resolveActivityStripWindow(windows);
    const focusedWorkspace = resolveFocusedNiriWorkspace(workspaces);
    if (!strip || !focusedWorkspace) {
      return {
        ok: false,
        error: "The unique strip or focused workspace was not found; nothing moved.",
      };
    }
    if (strip.workspace_id !== focusedWorkspace.id) {
      await execFileAsync(
        "niri",
        [
          "msg",
          "action",
          "move-window-to-workspace",
          "--window-id",
          String(strip.id),
          "--focus",
          "false",
          String(focusedWorkspace.name || focusedWorkspace.idx),
        ],
        { env },
      );
    }
    await execFileAsync("niri", ["msg", "action", "focus-window", "--id", String(strip.id)], {
      env,
    });
    return { ok: true, windowId: strip.id };
  } catch {
    return {
      ok: false,
      error: "Could not focus the strip through Niri; nothing else was focused.",
    };
  }
}

/**
 * @param {string} sessionId
 * @param {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} execFileAsync
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function focusNiriSession(sessionId, execFileAsync, env = process.env) {
  if (!env.NIRI_SOCKET) return { ok: false, error: "Niri is not available; focus did nothing." };
  let windows;
  try {
    const result = await execFileAsync("niri", ["msg", "-j", "windows"], { env });
    windows = JSON.parse(String(result.stdout ?? "[]"));
  } catch {
    return { ok: false, error: "Could not inspect Niri windows; focus did nothing." };
  }
  if (!Array.isArray(windows)) {
    return { ok: false, error: "Unexpected Niri window data; focus did nothing." };
  }
  const target = resolveExactGhosttyWindow(windows, sessionId);
  if (!target) {
    return {
      ok: false,
      error: "Pi identity did not resolve to exactly one Ghostty window; focus did nothing.",
    };
  }
  try {
    await execFileAsync("niri", ["msg", "action", "focus-window", "--id", String(target.id)], {
      env,
    });
    return { ok: true, windowId: target.id };
  } catch {
    return { ok: false, error: "Niri rejected the exact focus request; focus did nothing." };
  }
}
