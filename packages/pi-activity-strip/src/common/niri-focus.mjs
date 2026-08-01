// ---
// summary: "resolves Pi session identity to exactly one Ghostty Niri window and focuses it fail-closed"
// read_when:
//   - "changing card activation, CLI focus, Ghostty matching, or Niri workspace following"
// ---

import fs from "node:fs";
import path from "node:path";

const GHOSTTY_APP_IDS = new Set(["com.mitchellh.ghostty", "com.tryinget.ghosttysidequest"]);
const PI_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_PRESENCE_SOURCE = "@tryinget/pi-little-helpers/session-presence";
const SESSION_TITLE_TOKEN_HEX_LENGTH = 32;
const LEGACY_SESSION_TITLE_TOKEN_HEX_LENGTH = 8;

/**
 * Resolve the exact Pi identity carried by current telemetry. Sessions that
 * started before the activity-strip upgrade retain a legacy broker id, so use
 * their process-bound session-presence sidecar as the only migration bridge.
 * The sidecar must agree on source, pid, and cwd; otherwise fail closed.
 * @param {string | Record<string, unknown>} session
 * @param {{env?: NodeJS.ProcessEnv; readFileSync?: typeof fs.readFileSync; existsSync?: typeof fs.existsSync}} [options]
 */
export function resolvePiSessionIdentity(session, options = {}) {
  const record =
    session && typeof session === "object" ? session : { sessionId: String(session ?? "") };
  const directId = String(record.sessionId ?? "").trim();
  if (PI_SESSION_ID.test(directId)) return directId;

  const processId = Number(record.processId ?? 0);
  const runtimeDir = String(
    options.env?.XDG_RUNTIME_DIR ?? process.env.XDG_RUNTIME_DIR ?? "",
  ).trim();
  if (!Number.isInteger(processId) || processId <= 0 || !runtimeDir) return null;
  const expectedCwd = String(record.cwd ?? "").trim();
  if (!expectedCwd) return null;
  const existsSync = options.existsSync ?? fs.existsSync;
  if (!existsSync(path.join("/proc", String(processId)))) return null;

  const readFileSync = options.readFileSync ?? fs.readFileSync;
  let presence;
  try {
    const filePath = path.join(runtimeDir, "pi-session-presence", `${processId}.json`);
    presence = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }

  if (!presence || typeof presence !== "object") return null;
  if (presence.source !== SESSION_PRESENCE_SOURCE || Number(presence.pid) !== processId)
    return null;
  if (String(presence.cwd ?? "").trim() !== expectedCwd) return null;
  const presenceId = String(presence.sessionId ?? "").trim();
  return PI_SESSION_ID.test(presenceId) ? presenceId : null;
}

/** @param {string} value @param {number} [hexLength] */
export function shortSessionId(value, hexLength = SESSION_TITLE_TOKEN_HEX_LENGTH) {
  return String(value ?? "")
    .trim()
    .replaceAll("-", "")
    .slice(0, hexLength)
    .toLowerCase();
}

/** @param {Array<Record<string, unknown>>} sessions @param {string} sessionId */
export function resolveSnapshotSession(sessions, sessionId) {
  const requestedId = String(sessionId ?? "");
  const matches = sessions.filter((session) => session?.sessionId === requestedId);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Title matching prefers the full hyphenless 32-hex identity suffix emitted by current Pi session
 * presence. The legacy 8-hex suffix remains a migration fallback only when it is unambiguous. The app id
 * must also identify a known Ghostty build, and ambiguity always returns no match.
 * @param {Array<Record<string, unknown>>} windows
 * @param {string} sessionId
 */
export function resolveExactGhosttyWindow(windows, sessionId) {
  const fullId = String(sessionId ?? "").trim();
  if (!PI_SESSION_ID.test(fullId)) return null;

  /** @param {Record<string, unknown>} window */
  const isKnownGhosttyWindow = (window) =>
    Number.isInteger(window?.id) && GHOSTTY_APP_IDS.has(String(window?.app_id ?? ""));

  /** @param {string} token */
  const matchesForToken = (token) => {
    const suffix = ` · ${token}`;
    return windows.filter(
      (window) => isKnownGhosttyWindow(window) && String(window?.title ?? "").endsWith(suffix),
    );
  };

  const currentToken = shortSessionId(fullId);
  const currentMatches = matchesForToken(currentToken);
  if (currentMatches.length > 0) return currentMatches.length === 1 ? currentMatches[0] : null;

  const legacyToken = shortSessionId(fullId, LEGACY_SESSION_TITLE_TOKEN_HEX_LENGTH);
  const migratedPrefixMatches = windows.filter((window) => {
    if (!isKnownGhosttyWindow(window)) return false;
    const match = String(window?.title ?? "").match(/ · ([0-9a-f]{32})$/i);
    return match?.[1].toLowerCase().startsWith(legacyToken) === true;
  });
  if (migratedPrefixMatches.length > 0) return null;

  const legacyMatches = matchesForToken(legacyToken);
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
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
 * @param {string | Record<string, unknown>} session
 * @param {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} execFileAsync
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{readFileSync?: typeof fs.readFileSync; existsSync?: typeof fs.existsSync}} [options]
 */
export async function focusNiriSession(session, execFileAsync, env = process.env, options = {}) {
  if (!env.NIRI_SOCKET) return { ok: false, error: "Niri is not available; focus did nothing." };
  const sessionId = resolvePiSessionIdentity(session, {
    env,
    readFileSync: options.readFileSync,
    existsSync: options.existsSync,
  });
  if (!sessionId) {
    return {
      ok: false,
      error: "Exact Pi identity is unavailable; reload that Pi tab and try again.",
    };
  }
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
