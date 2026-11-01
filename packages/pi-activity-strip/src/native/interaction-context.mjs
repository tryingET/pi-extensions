/** Exact-window ownership cardinality shared by every projection proof.
 * @param {Record<string, unknown>[]} sessions @param {number | null} windowId */
export function visibleCardsForWindow(sessions, windowId) {
  return sessions.filter((card) => card.windowId === windowId && card.surfaceVisible !== false);
}

/** Recheck the same exact agent card/publisher set against a complete cached view.
 * @param {Record<string, unknown>[]} sessions
 * @param {{workspace: Record<string, unknown> | null; sessions: Record<string, unknown>[]} | null} current
 * @param {unknown} workspaceId @param {number | null} windowId */
export function agentSourceMatches(sessions, current, workspaceId, windowId) {
  const established = visibleCardsForWindow(sessions, windowId);
  const owned = visibleCardsForWindow(current?.sessions ?? [], windowId);
  return (
    current?.workspace?.id === workspaceId &&
    established.length === 1 &&
    owned.length === 1 &&
    owned[0]?.cardId === established[0]?.cardId &&
    JSON.stringify(publisherSet(owned[0])) === JSON.stringify(publisherSet(established[0]))
  );
}

/** Layout selection can contradict a retained source but never establish seat focus.
 * Missing fields support older snapshots; an explicit NULL or malformed id fails closed.
 * @param {Record<string, unknown> | null} workspace @param {number | null} sourceId */
export function selectionContradictsSource(workspace, sourceId) {
  return (
    sourceId !== null &&
    Object.hasOwn(workspace ?? {}, "active_window_id") &&
    workspace?.active_window_id !== sourceId
  );
}

/** Publisher order is presentation, never identity. @param {Record<string, unknown> | undefined} card */
export function publisherSet(card) {
  return [
    ...new Set(
      Array.isArray(card?.publisherRecordKeys) ? card.publisherRecordKeys.map(String) : [],
    ),
  ].sort();
}
/** @param {unknown} workspaceId @param {number | null} windowId @param {Record<string, unknown> | undefined} card */
export function sourceIdentity(workspaceId, windowId, card) {
  return JSON.stringify([workspaceId, windowId, card?.cardId, publisherSet(card)]);
}
