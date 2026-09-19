// ---
// summary: "projects tracked sessions onto one Niri workspace as cards with known visibility"
// read_when:
//   - "changing workspace card membership, card visibility, or focused-card selection"
// ---

import {
  canVerifyTabVisibility,
  placeSessionWindow,
  resolvePiSessionIdentity,
} from "./niri-focus.mjs";
import { projectSessionCards, sessionCardId } from "./session-cards.mjs";
import { parseTerminalTitleBinding } from "./surface-bindings.mjs";
import { canonicalGhosttyTerminalKey } from "./terminal-identity.mjs";

/** @typedef {import("./window-placement.mjs").PlacementOptions} PlacementOptions */
/**
 * @typedef {PlacementOptions & {
 *   env?: NodeJS.ProcessEnv;
 *   readFileSync?: typeof import("node:fs").readFileSync;
 *   existsSync?: typeof import("node:fs").existsSync;
 * }} ResolveOptions
 */

/**
 * Decide whether a placed tab is the one its window is currently showing. A window title naming a
 * different terminal surface, or missing a title this session is known to set, is proof the tab is
 * hidden. Without either signal visibility is unknown, and an unknown tab is never marked hidden:
 * an agent that sets no recognizable title would otherwise look permanently buried.
 * @param {Record<string, unknown>} window
 * @param {Record<string, unknown>} session
 * @param {string} placement
 * @param {ResolveOptions} [options]
 * @returns {"visible" | "hidden" | "unknown"}
 */
export function resolveSurfaceVisibility(window, session, placement, options = {}) {
  if (placement === "title") return "visible";
  // A session that writes its own identity into the terminal title was already matched against
  // every window title. Reaching here means no title matched, so this tab is not the one shown.
  if (canVerifyTabVisibility(session, options)) return "hidden";
  const terminalKey = canonicalGhosttyTerminalKey(session);
  const titled = parseTerminalTitleBinding(window?.title);
  if (titled && terminalKey && titled.terminalKey !== terminalKey) return "hidden";
  return "unknown";
}

/**
 * Project the global broker snapshot onto one exact Niri workspace. Membership requires an exact
 * window placement: a visible title, or a hidden tab attributed through its Ghostty host process.
 * Multiple publisher streams bound to the same terminal are aggregated into one stable card; a
 * window may carry several terminal cards because each tab is its own surface, but a card claimed
 * by distinct windows still fails closed. Only a visible tab in the focused window is "current".
 * @param {Array<Record<string, unknown>>} windows
 * @param {Record<string, unknown>} workspace
 * @param {Array<Record<string, unknown>>} sessions
 * @param {ResolveOptions} [options]
 */
export function resolveWorkspaceView(windows, workspace, sessions, options = {}) {
  if (!Number.isInteger(workspace?.id)) return null;
  /** @type {Array<{cardId: string; session: Record<string, unknown>; window: Record<string, unknown>; placement: string}>} */
  const candidates = [];
  for (const session of sessions) {
    const placed = placeSessionWindow(windows, session, options);
    if (!placed || placed.window.workspace_id !== workspace.id) continue;
    const cardId = sessionCardId(session);
    if (!cardId) continue;
    candidates.push({
      cardId,
      session: { ...session, cardId },
      window: placed.window,
      placement: placed.placement,
    });
  }

  /** @type {Map<unknown, Set<string>>} */
  const cardIdsByWindow = new Map();
  for (const candidate of candidates) {
    const ids = cardIdsByWindow.get(candidate.window.id) ?? new Set();
    ids.add(candidate.cardId);
    cardIdsByWindow.set(candidate.window.id, ids);
  }
  /** @type {Map<unknown, Set<string>>} */
  const allowedCardsByWindow = new Map();
  for (const [windowId, ids] of cardIdsByWindow) {
    const terminalIds = [...ids].filter((cardId) => cardId.startsWith("terminal:"));
    if (terminalIds.length > 0) allowedCardsByWindow.set(windowId, new Set(terminalIds));
    else if (ids.size === 1) allowedCardsByWindow.set(windowId, ids);
  }

  /** @type {Map<string, Array<{session: Record<string, unknown>; window: Record<string, unknown>; placement: string}>>} */
  const groups = new Map();
  for (const candidate of candidates) {
    if (!allowedCardsByWindow.get(candidate.window.id)?.has(candidate.cardId)) continue;
    const group = groups.get(candidate.cardId) ?? [];
    group.push(candidate);
    groups.set(candidate.cardId, group);
  }

  // The number the operator sees in the workspace list, not Niri's internal workspace id.
  const workspaceIdx = Number.isInteger(workspace.idx) ? Number(workspace.idx) : null;
  const projectedSessions = [];
  for (const [cardId, group] of groups) {
    const windowIds = new Set(group.map((candidate) => candidate.window.id));
    if (windowIds.size !== 1) continue;
    const [card] = projectSessionCards(group.map((candidate) => candidate.session));
    if (!card) continue;
    const window = group[0]?.window;
    const placement = group.some((candidate) => candidate.placement === "title")
      ? "title"
      : (group[0]?.placement ?? "title");
    const visibility = resolveSurfaceVisibility(
      window,
      group[0]?.session ?? card,
      placement,
      options,
    );
    projectedSessions.push({
      ...card,
      cardId,
      // A hidden tab has no window of its own, so this is the window hosting it.
      windowId: window?.id,
      workspaceIdx,
      placement,
      // Only a tab proven to sit behind another one is marked hidden.
      surfaceVisible: visibility !== "hidden",
    });
  }
  // The focused window shows exactly one tab. Several candidates mean the compositor cannot tell
  // us which, so nothing is marked current rather than marking the wrong one.
  const focusedCandidates = projectedSessions.filter(
    (session) =>
      session.surfaceVisible &&
      windows.some((window) => window?.id === session.windowId && window?.is_focused === true),
  );
  const focusedCard = focusedCandidates.length === 1 ? focusedCandidates[0] : null;
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
 * @param {ResolveOptions} [options]
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
