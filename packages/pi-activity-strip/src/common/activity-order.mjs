// ---
// summary: "provides deterministic monitoring-first strip ordering while preserving operator-defined order"
// read_when:
//   - "changing activity grouping, calm-cadence reconciliation, or manual card order"
// ---

const ACTIVE_STATES = new Set(["thinking", "tool", "waiting"]);

/** @param {{cardId?: string; sessionId?: string}} session */
export function activityCardKey(session) {
  return String(session?.cardId ?? session?.sessionId ?? "");
}

/** @param {{ state?: string; agentActive?: boolean }} session */
export function isActiveSession(session) {
  return Boolean(session?.agentActive || ACTIVE_STATES.has(String(session?.state ?? "")));
}

/** @param {{ state?: string; toolName?: string; toolTarget?: string }} session */
export function isMonitoringSession(session) {
  return Boolean(
    session?.state === "success" &&
      !String(session?.toolName ?? "").trim() &&
      !String(session?.toolTarget ?? "").trim(),
  );
}

/**
 * Reconcile at the calm clock: green settled/monitoring cards first, then active cards,
 * then other inactive cards. Preserve previous/manual order inside each group and append
 * new cards deterministically.
 * @param {Array<{ sessionId: string; cardId?: string; state?: string; agentActive?: boolean; toolName?: string; toolTarget?: string; updatedAt?: number }>} sessions
 * @param {string[]} previousOrder
 * @param {{ regroup?: boolean }} [options]
 */
export function reconcileActivityOrder(sessions, previousOrder = [], { regroup = true } = {}) {
  const byId = new Map(sessions.map((session) => [activityCardKey(session), session]));
  const surviving = previousOrder.filter((id) => byId.has(id));
  const known = new Set(surviving);
  for (const session of sessions) {
    const id = activityCardKey(session);
    if (!id || known.has(id)) continue;
    surviving.push(id);
    known.add(id);
  }
  if (!regroup) return surviving;

  const priorIndex = new Map(surviving.map((id, index) => [id, index]));
  const ordered = [...sessions].sort((left, right) => {
    const leftPriority = isMonitoringSession(left) ? 2 : isActiveSession(left) ? 1 : 0;
    const rightPriority = isMonitoringSession(right) ? 2 : isActiveSession(right) ? 1 : 0;
    const groupDelta = rightPriority - leftPriority;
    if (groupDelta) return groupDelta;
    const leftPrior = priorIndex.get(activityCardKey(left));
    const rightPrior = priorIndex.get(activityCardKey(right));
    if (leftPrior != null || rightPrior != null) {
      return (leftPrior ?? Number.MAX_SAFE_INTEGER) - (rightPrior ?? Number.MAX_SAFE_INTEGER);
    }
    const updateDelta = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
    if (updateDelta) return updateDelta;
    return activityCardKey(left).localeCompare(activityCardKey(right));
  });
  return ordered.map(activityCardKey).filter((id) => byId.has(id));
}

/** @param {string[]} order @param {string} sessionId @param {-1 | 1} delta */
export function moveOrderItem(order, sessionId, delta) {
  const next = [...order];
  const from = next.indexOf(sessionId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
