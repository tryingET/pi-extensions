// ---
// summary: "derives card display facts that depend on more than one session field"
// read_when:
//   - "changing stalled-session detection, duplicate label disambiguation, or card label rendering"
// ---

/**
 * A session is stalled when it claims to be mid-activity but no lifecycle
 * event has arrived for longer than the stall threshold. Wedged streams keep
 * heartbeating liveness, so only real event time can expose them.
 * @param {Record<string, unknown>} session
 * @param {number} nowMs
 * @param {number} stallMs
 */
export function isStalledSession(session, nowMs, stallMs) {
  if (!session.agentActive) return false;
  const state = String(session.state ?? "");
  if (state !== "thinking" && state !== "tool" && state !== "waiting") return false;
  const anchor = Number(session.lastEventAt || session.updatedAt || 0);
  return anchor > 0 && nowMs - anchor > stallMs;
}

/**
 * @param {Array<Record<string, unknown>>} sessions
 * @returns {Set<string>}
 */
export function findDuplicateLabels(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const label = String(session.repoLabel || "pi session");
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([label]) => label));
}

/**
 * Two live processes can share one repo label; append a short process suffix
 * so their cards stay distinguishable at a glance.
 * @param {Record<string, unknown>} session
 * @param {Set<string>} duplicateLabels
 */
export function disambiguatedRepoLabel(session, duplicateLabels) {
  const label = String(session.repoLabel || "pi session");
  const processId = Number(session.processId ?? 0);
  return duplicateLabels.has(label) && processId > 0
    ? `${label} · ${String(processId).slice(-4)}`
    : label;
}

/** @param {{hovered?: boolean; activeElement?: boolean; documentFocused?: boolean}} state */
export function shouldRetainExpandedCard({ hovered, activeElement, documentFocused }) {
  return Boolean(hovered || (documentFocused && activeElement));
}
