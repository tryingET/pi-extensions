/** Optional private-v2 observation. Never authorization, query text or a wall-clock countdown.
 * @param {unknown} input */
export function normalizeKeyboardObservation(input) {
  if (!input || typeof input !== "object") return null;
  const event = /** @type {Record<string, unknown>} */ (input);
  const { protocol, type, request, origin, reason, nativeMs, deadlineMs, captured } = event;
  const safe = (/** @type {unknown} */ value) => Number.isSafeInteger(value) && Number(value) >= 0;
  if (
    protocol !== 2 ||
    type !== "keyboard-observation" ||
    !safe(request) ||
    Number(request) === 0 ||
    !safe(nativeMs) ||
    captured !== true ||
    typeof reason !== "string" ||
    !["acquired", "activity", "idle-expired", "source-revoked"].includes(reason)
  )
    return null;
  if (origin === "hover") {
    if (
      !safe(deadlineMs) ||
      (reason === "idle-expired" && Number(nativeMs) < Number(deadlineMs)) ||
      (["acquired", "activity"].includes(reason) && Number(nativeMs) >= Number(deadlineMs))
    )
      return null;
  } else if (origin !== "explicit" || deadlineMs !== null || reason === "idle-expired") return null;
  return {
    request: Number(request),
    origin: /** @type {"hover" | "explicit"} */ (origin),
    reason: /** @type {"acquired" | "activity" | "idle-expired" | "source-revoked"} */ (reason),
    nativeMs: Number(nativeMs),
    deadlineMs: deadlineMs === null ? null : Number(deadlineMs),
    captured: true,
  };
}
