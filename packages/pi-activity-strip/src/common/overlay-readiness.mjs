// ---
// summary: "distinguishes broker liveness from an explicitly ready native overlay"
// read_when:
//   - "changing startup reuse, waiter success, or CLI status exit semantics"
// ---

/** A pong alone is not overlay readiness or artifact approval.
 * @param {import("./contracts.ts").BrokerResponse | null | undefined} result */
export function isOverlayReady(result) {
  return result?.ok === true && result.runtimeStatus?.state === "ready";
}
