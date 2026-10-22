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
