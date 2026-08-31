// ---
// summary: "creates broker messages and normalizes and prioritizes session snapshots for transport and display"
// read_when:
//   - "changing message envelopes, session defaults, accepted states, or sort priority"
// ---

import { randomUUID } from "node:crypto";
import { canonicalGhosttyTerminalKey, normalizeGhosttySurfaceId } from "./terminal-identity.mjs";

/** @typedef {import("./contracts.ts").SessionState} SessionState */
/** @typedef {import("./contracts.ts").SessionSnapshot} SessionSnapshot */

/** @type {Set<SessionState>} */
const SESSION_STATES = new Set(["idle", "thinking", "tool", "waiting", "success", "error"]);

const MAX_CLOCK_SKEW_MS = 60_000;

/** @param {unknown} value @param {number} maxLength */
function boundedString(value, maxLength) {
  return String(value ?? "").slice(0, maxLength);
}

/** @param {unknown} value @param {number} fallback @param {number} now */
function finiteTimestamp(value, fallback, now) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= now + MAX_CLOCK_SKEW_MS
    ? timestamp
    : fallback;
}

/** @param {string} type @param {Record<string, unknown>} [payload] */
export function makeMessage(type, payload = {}) {
  return {
    id: randomUUID(),
    type,
    ...payload,
  };
}

/** @param {Partial<SessionSnapshot> | Record<string, unknown>} [session] @returns {SessionSnapshot} */
export function normalizeSessionSnapshot(session = {}) {
  if (!session || typeof session !== "object") session = {};
  const now = Date.now();
  const updatedAt = finiteTimestamp(session.updatedAt, now, now);
  const lastEventAt = finiteTimestamp(session.lastEventAt, updatedAt, now);
  const startedAt = finiteTimestamp(session.startedAt, updatedAt, now);
  const normalizedAgentStartedAt = finiteTimestamp(session.agentStartedAt, 0, now);
  const agentStartedAt =
    session.agentStartedAt == null || !normalizedAgentStartedAt ? null : normalizedAgentStartedAt;
  const rawState = typeof session.state === "string" ? session.state : "idle";
  /** @type {SessionState} */
  const state = SESSION_STATES.has(/** @type {SessionState} */ (rawState))
    ? /** @type {SessionState} */ (rawState)
    : "idle";

  const terminalKey = canonicalGhosttyTerminalKey(session);
  const terminalKind = terminalKey ? "ghostty-surface" : "unbound";
  const terminalFamily = terminalKey ? String(session.terminalFamily) : "";
  const terminalSurfaceId = terminalKey ? normalizeGhosttySurfaceId(session.terminalSurfaceId) : "";
  const rawPublisherSequence = Number(session.publisherSequence ?? 0);
  const publisherSequence =
    Number.isSafeInteger(rawPublisherSequence) && rawPublisherSequence >= 0
      ? rawPublisherSequence
      : 0;
  return {
    sessionId: boundedString(session.sessionId, 256),
    publisherId: boundedString(session.publisherId, 256),
    publisherSequence,
    processId: Number(session.processId ?? 0) || 0,
    terminalKind,
    terminalKey,
    terminalFamily,
    terminalSurfaceId,
    cwd: boundedString(session.cwd, 4096),
    repoLabel: boundedString(session.repoLabel ?? "pi session", 256),
    sessionName: boundedString(session.sessionName, 256),
    phase: boundedString(session.phase ?? "Idle", 512),
    detail: boundedString(session.detail ?? "Ready", 2048),
    assistantPreview: boundedString(session.assistantPreview, 2048),
    toolName: boundedString(session.toolName, 256),
    toolTarget: boundedString(session.toolTarget, 2048),
    state,
    turnIndex: Number(session.turnIndex ?? 0) || 0,
    updatedAt,
    lastEventAt,
    startedAt,
    agentStartedAt,
    agentActive: Boolean(session.agentActive),
    lastPromptPreview: boundedString(session.lastPromptPreview, 2048),
    errorMessage: boundedString(session.errorMessage, 2048),
  };
}

/** @param {SessionSnapshot[]} [sessions] @returns {SessionSnapshot[]} */
export function sortSessions(sessions = []) {
  const stateWeight = new Map([
    ["tool", 0],
    ["thinking", 1],
    ["waiting", 2],
    ["error", 3],
    ["success", 4],
    ["idle", 5],
  ]);

  return [...sessions].sort((left, right) => {
    const leftWeight = stateWeight.get(left.state) ?? 99;
    const rightWeight = stateWeight.get(right.state) ?? 99;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.repoLabel.localeCompare(right.repoLabel);
  });
}
