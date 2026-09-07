// ---
// summary: "resolves Pi session identity to exactly one Ghostty Niri window and focuses it fail-closed"
// read_when:
//   - "changing card activation, CLI focus, Ghostty matching, or Niri workspace following"
// ---

import fs from "node:fs";
import path from "node:path";
import { presentGhosttySurface } from "./ghostty-present.mjs";
import { projectSessionCards, sessionCardId } from "./session-cards.mjs";
import { parseTerminalTitleBinding } from "./surface-bindings.mjs";
import {
  appIdForGhosttyFamily,
  canonicalGhosttyTerminalKey,
  normalizeGhosttySurfaceId,
  terminalTitleSegment,
} from "./terminal-identity.mjs";
import { resolveHiddenSurfaceWindow } from "./window-placement.mjs";

const GHOSTTY_APP_IDS = new Set(["com.mitchellh.ghostty", "com.tryinget.ghosttysidequest"]);
const PI_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_PRESENCE_SOURCE = "@tryinget/pi-little-helpers/session-presence";
const SESSION_TITLE_TOKEN_HEX_LENGTH = 32;
const LEGACY_SESSION_TITLE_TOKEN_HEX_LENGTH = 8;
const PRESENT_VERIFY_ATTEMPTS = 4;
const PRESENT_VERIFY_DELAY_MS = 120;

/** @typedef {import("./window-placement.mjs").PlacementOptions} PlacementOptions */
/** @typedef {import("./window-placement.mjs").WindowPlacement} WindowPlacement */
/**
 * @typedef {PlacementOptions & {
 *   env?: NodeJS.ProcessEnv;
 *   readFileSync?: typeof fs.readFileSync;
 *   existsSync?: typeof fs.existsSync;
 * }} ResolveOptions
 */

/**
 * Read one bounded Niri JSON list. Polling callers treat command, timeout,
 * parsing, and payload-shape failures as an empty fail-closed observation.
 * @param {"windows" | "workspaces"} subject
 * @param {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} execFileAsync
 * @param {NodeJS.ProcessEnv} env
 * @param {number} timeout
 */
async function readNiriList(subject, execFileAsync, env, timeout) {
  if (!env.NIRI_SOCKET) return [];
  try {
    const { stdout } = await execFileAsync("niri", ["msg", "-j", subject], { env, timeout });
    const payload = JSON.parse(String(stdout ?? "[]"));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

/** @param {Parameters<typeof readNiriList>[1]} execFileAsync @param {NodeJS.ProcessEnv} env @param {number} timeout */
export function readNiriWindows(execFileAsync, env, timeout) {
  return readNiriList("windows", execFileAsync, env, timeout);
}

/** @param {Parameters<typeof readNiriList>[1]} execFileAsync @param {NodeJS.ProcessEnv} env @param {number} timeout */
export function readNiriWorkspaces(execFileAsync, env, timeout) {
  return readNiriList("workspaces", execFileAsync, env, timeout);
}

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

/** @param {Array<Record<string, unknown>>} sessions @param {string} targetId */
export function resolveSnapshotSession(sessions, targetId) {
  const requestedId = String(targetId ?? "");
  const cardMatches = sessions.filter(
    (session) => session?.cardId === requestedId || sessionCardId(session) === requestedId,
  );
  if (cardMatches.length === 1) return cardMatches[0];
  const logicalMatches = sessions.filter((session) => session?.sessionId === requestedId);
  return logicalMatches.length === 1 ? logicalMatches[0] : null;
}

/**
 * Title matching prefers the full hyphenless 32-hex identity suffix emitted by current Pi session
 * presence. The legacy 8-hex suffix remains a migration fallback only when it is unambiguous. The app id
 * must also identify a known Ghostty build, and ambiguity always returns no match.
 * @param {Array<Record<string, unknown>>} windows
 * @param {string} sessionId
 * @param {Record<string, unknown>} [session]
 */
export function resolveExactGhosttyWindow(windows, sessionId, session = {}) {
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
  if (session.terminalKind === "ghostty-surface" && !canonicalGhosttyTerminalKey(session)) {
    return null;
  }
  const surfaceId = normalizeGhosttySurfaceId(session.terminalSurfaceId);
  const titleSegment = terminalTitleSegment(session);
  const expectedAppId = appIdForGhosttyFamily(String(session.terminalFamily ?? ""));
  if (surfaceId && titleSegment && expectedAppId) {
    const surfaceSuffix = ` · ${titleSegment} · ${currentToken}`;
    const surfaceMatches = windows.filter(
      (window) =>
        Number.isInteger(window?.id) &&
        String(window?.app_id ?? "") === expectedAppId &&
        String(window?.title ?? "").endsWith(surfaceSuffix),
    );
    return surfaceMatches.length === 1 ? surfaceMatches[0] : null;
  }
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

/**
 * Place a session on its window. A visible title is exact proof; a bound surface whose tab is
 * hidden behind another tab is placed through its Ghostty host process and remembered window.
 * @param {Array<Record<string, unknown>>} windows
 * @param {string} sessionId
 * @param {Record<string, unknown>} [session]
 * @param {PlacementOptions} [options]
 * @returns {WindowPlacement | null}
 */
export function resolveSessionWindow(windows, sessionId, session = {}, options = {}) {
  const exact = resolveExactGhosttyWindow(windows, sessionId, session);
  if (exact) return { window: exact, placement: "title" };
  return resolveHiddenSurfaceWindow(windows, session, {
    ...options,
    sessionToken: shortSessionId(sessionId),
  });
}

/**
 * A tab occupied by a coding agent other than Pi carries no Pi identity, so it is placed by the
 * exact title the agent put on its own terminal, and otherwise by host containment and window
 * memory. A title claimed by more than one window is ambiguous and places nothing.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Record<string, unknown>} session
 * @param {PlacementOptions} [options]
 * @returns {WindowPlacement | null}
 */
export function resolveAgentSessionWindow(windows, session, options = {}) {
  const titleSuffix = String(session.titleSuffix ?? "").trim();
  if (titleSuffix) {
    const expectedAppId = appIdForGhosttyFamily(String(session.terminalFamily ?? ""));
    const matches = windows.filter(
      (window) =>
        Number.isInteger(window?.id) &&
        String(window?.app_id ?? "") === expectedAppId &&
        String(window?.title ?? "").endsWith(titleSuffix),
    );
    if (matches.length === 1) return { window: matches[0], placement: "title" };
    if (matches.length > 1) return null;
  }
  return resolveHiddenSurfaceWindow(windows, session, options);
}

/**
 * Whether a session could ever be placed by a title. Activation can only confirm that a presented
 * tab became visible for these; for anything else the compositor offers no readable proof.
 * @param {Record<string, unknown>} session
 * @param {ResolveOptions} [options]
 */
export function canVerifyTabVisibility(session, options = {}) {
  if (resolvePiSessionIdentity(session, options)) return true;
  return String(session?.titleSuffix ?? "").trim().length > 0;
}

/**
 * Place any tracked session: a Pi session by its exact Pi identity, an agent tab by its own title.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Record<string, unknown>} session
 * @param {ResolveOptions} [options]
 * @returns {WindowPlacement | null}
 */
export function placeSessionWindow(windows, session, options = {}) {
  const piSessionId = resolvePiSessionIdentity(session, options);
  if (piSessionId) return resolveSessionWindow(windows, piSessionId, session, options);
  return canonicalGhosttyTerminalKey(session)
    ? resolveAgentSessionWindow(windows, session, options)
    : null;
}

/**
 * Resolve the one snapshot session whose exact Ghostty window currently owns
 * compositor focus. Missing, ambiguous, non-Ghostty, and stale identities all
 * fail closed so the renderer never highlights a guessed session.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Array<Record<string, unknown>>} sessions
 * @param {{env?: NodeJS.ProcessEnv; readFileSync?: typeof fs.readFileSync; existsSync?: typeof fs.existsSync}} [options]
 */
export function resolveFocusedSnapshotSessionId(windows, sessions, options = {}) {
  const focusedWindows = windows.filter((window) => window?.is_focused === true);
  if (focusedWindows.length !== 1) return null;
  const focusedWindow = focusedWindows[0];
  const matches = sessions.filter((session) => {
    const sessionId = resolvePiSessionIdentity(session, options);
    if (!sessionId) return false;
    return resolveExactGhosttyWindow(windows, sessionId, session)?.id === focusedWindow.id;
  });
  return matches.length === 1 ? String(matches[0]?.sessionId ?? "") || null : null;
}

/**
 * Focus the exact terminal behind a card. A visible tab needs only compositor focus. A hidden tab
 * is first presented inside its proven Ghostty host process, then its window is focused, and the
 * result counts as success only once the window title proves the tab became visible.
 * @param {string | Record<string, unknown>} session
 * @param {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} execFileAsync
 * @param {NodeJS.ProcessEnv} [env]
 * @param {PlacementOptions & {
 *   readFileSync?: typeof fs.readFileSync;
 *   existsSync?: typeof fs.existsSync;
 *   presentSurface?: typeof presentGhosttySurface;
 *   sleep?: (milliseconds: number) => Promise<void>;
 * }} [options]
 * @returns {Promise<{ok: boolean; error?: string; windowId?: number; presented?: boolean; verified?: boolean}>}
 */
export async function focusNiriSession(session, execFileAsync, env = process.env, options = {}) {
  if (!env.NIRI_SOCKET) return { ok: false, error: "Niri is not available; focus did nothing." };
  const record =
    session && typeof session === "object" ? session : { sessionId: String(session ?? "") };
  const placementOptions = { ...options, env };
  if (!resolvePiSessionIdentity(record, placementOptions) && !canonicalGhosttyTerminalKey(record)) {
    return {
      ok: false,
      error: "Exact Pi identity is unavailable; reload that Pi tab and try again.",
    };
  }
  const readWindows = async () => {
    const result = await execFileAsync("niri", ["msg", "-j", "windows"], { env });
    const windows = JSON.parse(String(result.stdout ?? "[]"));
    if (!Array.isArray(windows)) throw new Error("Unexpected Niri window data");
    return windows;
  };
  let windows;
  try {
    windows = await readWindows();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.message === "Unexpected Niri window data"
          ? "Unexpected Niri window data; focus did nothing."
          : "Could not inspect Niri windows; focus did nothing.",
    };
  }
  const placed = placeSessionWindow(windows, record, placementOptions);
  if (!placed) {
    return {
      ok: false,
      error: "That session did not resolve to exactly one Ghostty window; focus did nothing.",
    };
  }
  const target = placed.window;
  const targetId = Number(target.id);
  const focusWindow = () =>
    execFileAsync("niri", ["msg", "action", "focus-window", "--id", String(targetId)], { env });
  if (placed.placement === "title") {
    try {
      await focusWindow();
      return { ok: true, windowId: targetId };
    } catch {
      return { ok: false, error: "Niri rejected the exact focus request; focus did nothing." };
    }
  }

  const presented = await (options.presentSurface ?? presentGhosttySurface)({
    execFileAsync,
    env,
    hostPid: Number(target.pid),
    terminalFamily: record.terminalFamily,
    surfaceId: record.terminalSurfaceId,
  });
  try {
    await focusWindow();
  } catch {
    return {
      ok: false,
      windowId: targetId,
      presented: false,
      error: presented.ok
        ? "Presented the hidden tab, but Niri rejected the window focus request."
        : "Niri rejected the exact focus request; focus did nothing.",
    };
  }
  if (!presented.ok) {
    return {
      ok: false,
      windowId: targetId,
      presented: false,
      error: `Focused the Ghostty window, but could not present the hidden tab (${presented.error}); select it manually.`,
    };
  }
  if (!canVerifyTabVisibility(record, placementOptions)) {
    // Nothing this session writes is readable from the compositor, so the presented tab cannot be
    // confirmed. The action succeeded; the outcome is reported without claiming proof.
    return { ok: true, windowId: targetId, presented: true, verified: false };
  }
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < PRESENT_VERIFY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(PRESENT_VERIFY_DELAY_MS);
    try {
      const current = await readWindows();
      const confirmed = placeSessionWindow(current, record, placementOptions);
      if (confirmed?.placement === "title" && Number(confirmed.window.id) === targetId) {
        return { ok: true, windowId: targetId, presented: true, verified: true };
      }
    } catch {
      break;
    }
  }
  return {
    ok: false,
    windowId: targetId,
    presented: false,
    error:
      "Focused the Ghostty window, but the hidden tab did not become visible; select it manually.",
  };
}
