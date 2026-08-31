// ---
// summary: "resolves Pi session identity to exactly one Ghostty Niri window and focuses it fail-closed"
// read_when:
//   - "changing card activation, CLI focus, Ghostty matching, or Niri workspace following"
// ---

import fs from "node:fs";
import path from "node:path";
import { projectSessionCards, sessionCardId } from "./session-cards.mjs";
import {
  appIdForGhosttyFamily,
  canonicalGhosttyTerminalKey,
  normalizeGhosttySurfaceId,
  terminalTitleSegment,
} from "./terminal-identity.mjs";

const GHOSTTY_APP_IDS = new Set(["com.mitchellh.ghostty", "com.tryinget.ghosttysidequest"]);
const PI_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_PRESENCE_SOURCE = "@tryinget/pi-little-helpers/session-presence";
const SESSION_TITLE_TOKEN_HEX_LENGTH = 32;
const LEGACY_SESSION_TITLE_TOKEN_HEX_LENGTH = 8;

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
 * Project the global broker snapshot onto one exact Niri workspace. Membership
 * requires an exact Ghostty window. Multiple publisher streams bound to the same terminal are
 * aggregated into one stable card; ambiguity between distinct windows still fails closed.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Record<string, unknown>} workspace
 * @param {Array<Record<string, unknown>>} sessions
 * @param {{env?: NodeJS.ProcessEnv; readFileSync?: typeof fs.readFileSync; existsSync?: typeof fs.existsSync}} [options]
 */
export function resolveWorkspaceView(windows, workspace, sessions, options = {}) {
  if (!Number.isInteger(workspace?.id)) return null;
  /** @type {Array<{cardId: string; session: Record<string, unknown>; window: Record<string, unknown>}>} */
  const candidates = [];
  for (const session of sessions) {
    const sessionIdentity = resolvePiSessionIdentity(session, options);
    if (!sessionIdentity) continue;
    const window = resolveExactGhosttyWindow(windows, sessionIdentity, session);
    if (!window || window.workspace_id !== workspace.id) continue;
    const cardId = sessionCardId(session);
    if (!cardId) continue;
    candidates.push({ cardId, session: { ...session, cardId }, window });
  }

  const cardIdsByWindow = new Map();
  for (const candidate of candidates) {
    const ids = cardIdsByWindow.get(candidate.window.id) ?? new Set();
    ids.add(candidate.cardId);
    cardIdsByWindow.set(candidate.window.id, ids);
  }
  const allowedCardByWindow = new Map();
  for (const [windowId, ids] of cardIdsByWindow) {
    const terminalIds = [...ids].filter((cardId) => cardId.startsWith("terminal:"));
    if (terminalIds.length === 1) allowedCardByWindow.set(windowId, terminalIds[0]);
    else if (ids.size === 1) allowedCardByWindow.set(windowId, [...ids][0]);
  }

  /** @type {Map<string, Array<{session: Record<string, unknown>; window: Record<string, unknown>}>>} */
  const groups = new Map();
  for (const candidate of candidates) {
    if (allowedCardByWindow.get(candidate.window.id) !== candidate.cardId) continue;
    const group = groups.get(candidate.cardId) ?? [];
    group.push(candidate);
    groups.set(candidate.cardId, group);
  }

  const projectedSessions = [];
  for (const [cardId, group] of groups) {
    const windowIds = new Set(group.map((candidate) => candidate.window.id));
    if (windowIds.size !== 1) continue;
    const [card] = projectSessionCards(group.map((candidate) => candidate.session));
    if (!card) continue;
    const window = group[0]?.window;
    projectedSessions.push({ ...card, cardId, windowId: window?.id });
  }
  const focusedCard = projectedSessions.find((session) =>
    windows.some((window) => window?.id === session.windowId && window?.is_focused === true),
  );
  return {
    workspace,
    sessions: projectedSessions,
    focusedSessionId: focusedCard ? String(focusedCard.sessionId ?? "") || null : null,
    focusedCardId: focusedCard ? String(focusedCard.cardId ?? "") || null : null,
  };
}

/**
 * Project the global broker snapshot onto the one focused Niri workspace.
 * @param {Array<Record<string, unknown>>} windows
 * @param {Array<Record<string, unknown>>} workspaces
 * @param {Array<Record<string, unknown>>} sessions
 * @param {{env?: NodeJS.ProcessEnv; readFileSync?: typeof fs.readFileSync; existsSync?: typeof fs.existsSync}} [options]
 */
export function resolveFocusedWorkspaceView(windows, workspaces, sessions, options = {}) {
  const workspace = resolveFocusedNiriWorkspace(workspaces);
  return workspace ? resolveWorkspaceView(windows, workspace, sessions, options) : null;
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
  const record = session && typeof session === "object" ? session : {};
  const target = resolveExactGhosttyWindow(windows, sessionId, record);
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
