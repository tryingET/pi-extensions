// ---
// summary: "projects publisher snapshots into stable operator-facing terminal cards"
// read_when:
//   - "changing publisher aggregation, card identity, or membership comparison"
// ---

import { isActiveSession } from "./activity-order.mjs";
import { canonicalGhosttyTerminalKey } from "./terminal-identity.mjs";

/** @typedef {import("./contracts.ts").SessionSnapshot} SessionSnapshot */
/** @typedef {Partial<SessionSnapshot> & Record<string, unknown>} SessionLike */

/** @param {SessionLike} session */
export function sessionRecordKey(session) {
  const sessionId = String(session?.sessionId ?? "");
  const publisherId = String(session?.publisherId ?? "");
  return publisherId ? `${sessionId}|${publisherId}` : sessionId;
}

/** @param {SessionLike} session */
export function sessionCardId(session) {
  const terminalKey = canonicalGhosttyTerminalKey(session);
  if (terminalKey) return `terminal:${terminalKey}`;
  const sessionId = String(session?.sessionId ?? "").trim();
  return sessionId ? `session:${sessionId}` : "";
}

/** @param {SessionLike} session */
export function sessionMembershipKey(session) {
  return `${sessionRecordKey(session)}→${sessionCardId(session)}`;
}

/** @param {SessionLike} session */
function attentionRank(session) {
  if (isActiveSession(session)) return 3;
  if (session?.state === "error") return 2;
  if (session?.state === "success") return 1;
  return 0;
}

/** @param {SessionLike} left @param {SessionLike} right */
export function comparePublisherRepresentatives(left, right) {
  const rankDelta = attentionRank(right) - attentionRank(left);
  if (rankDelta) return rankDelta;
  const eventDelta = Number(right?.lastEventAt ?? 0) - Number(left?.lastEventAt ?? 0);
  if (eventDelta) return eventDelta;
  const turnDelta = Number(right?.turnIndex ?? 0) - Number(left?.turnIndex ?? 0);
  if (turnDelta) return turnDelta;
  const startDelta = Number(right?.startedAt ?? 0) - Number(left?.startedAt ?? 0);
  if (startDelta) return startDelta;
  return sessionRecordKey(left).localeCompare(sessionRecordKey(right));
}

/**
 * @param {SessionLike[]} [sessions]
 * @param {Set<string> | null} [allowedCardIds]
 * @returns {Array<SessionLike & {cardId: string; publisherCount: number; publisherIds: string[]; publisherRecordKeys: string[]}>}
 */
export function projectSessionCards(sessions = [], allowedCardIds = null) {
  /** @type {Map<string, SessionLike[]>} */
  const groups = new Map();
  for (const session of sessions) {
    const cardId = sessionCardId(session);
    if (!cardId || (allowedCardIds && !allowedCardIds.has(cardId))) continue;
    const group = groups.get(cardId) ?? [];
    group.push(session);
    groups.set(cardId, group);
  }

  /** @type {Array<SessionLike & {cardId: string; publisherCount: number; publisherIds: string[]; publisherRecordKeys: string[]}>} */
  const cards = [];
  for (const [cardId, group] of groups) {
    const ordered = [...group].sort(comparePublisherRepresentatives);
    const representative = ordered[0];
    if (!representative) continue;
    cards.push({
      ...representative,
      cardId,
      publisherCount: group.length,
      publisherIds: group.map((session) => String(session.publisherId ?? "")).filter(Boolean),
      publisherRecordKeys: group.map(sessionRecordKey),
    });
  }
  return cards;
}

/** @param {SessionLike[]} [left] @param {SessionLike[]} [right] */
export function haveSameRecordMembership(left = [], right = []) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(sessionMembershipKey).sort();
  const rightKeys = right.map(sessionMembershipKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

/** @param {SessionLike[]} [left] @param {SessionLike[]} [right] */
export function haveSameCardMembership(left = [], right = []) {
  const leftKeys = [...new Set(left.map(sessionCardId).filter(Boolean))].sort();
  const rightKeys = [...new Set(right.map(sessionCardId).filter(Boolean))].sort();
  return (
    leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
  );
}
