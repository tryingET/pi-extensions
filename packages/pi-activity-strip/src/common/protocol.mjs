import { randomUUID } from "node:crypto";

const SESSION_STATES = new Set(["idle", "thinking", "tool", "waiting", "success", "error"]);

export function makeMessage(type, payload = {}) {
  return {
    id: randomUUID(),
    type,
    ...payload,
  };
}

export function normalizeSessionSnapshot(session = {}) {
  const now = Date.now();
  const updatedAt = Number(session.updatedAt ?? now) || now;
  const startedAt = Number(session.startedAt ?? updatedAt) || updatedAt;
  const agentStartedAt =
    session.agentStartedAt == null ? null : Number(session.agentStartedAt) || null;
  const state = SESSION_STATES.has(session.state) ? session.state : "idle";

  return {
    sessionId: String(session.sessionId ?? ""),
    processId: Number(session.processId ?? 0) || 0,
    cwd: String(session.cwd ?? ""),
    repoLabel: String(session.repoLabel ?? "pi session"),
    sessionName: String(session.sessionName ?? ""),
    phase: String(session.phase ?? "Idle"),
    detail: String(session.detail ?? "Ready"),
    assistantPreview: String(session.assistantPreview ?? ""),
    toolName: String(session.toolName ?? ""),
    toolTarget: String(session.toolTarget ?? ""),
    state,
    turnIndex: Number(session.turnIndex ?? 0) || 0,
    updatedAt,
    startedAt,
    agentStartedAt,
    agentActive: Boolean(session.agentActive),
    lastPromptPreview: String(session.lastPromptPreview ?? ""),
    errorMessage: String(session.errorMessage ?? ""),
  };
}

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
