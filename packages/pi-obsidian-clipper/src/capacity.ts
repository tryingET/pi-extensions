function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function epoch(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
/** Same schema2 wire as Pi provider; declaration status is not browser revocation. */
export function capacityStatus(value: unknown, now = Date.now() / 1000) {
  const c = record(value),
    g = record(c.guaranteed);
  const sourceGeneratedAt = epoch(c.source_generated_at) ? c.source_generated_at : null;
  const expiresAt = epoch(c.expires_at) ? c.expires_at : null;
  const availability =
    typeof c.availability === "string" && ["available", "unavailable"].includes(c.availability)
      ? c.availability
      : "unknown";
  const state =
    typeof g.state === "string" && ["observed", "stale", "contradictory"].includes(g.state)
      ? g.state
      : "unknown";
  let reason: string | undefined;
  if (c.schema !== "soma.capacity/v1") reason = "capacity schema missing or unknown";
  else if (state !== "observed") reason = `capacity guarantee ${state}`;
  else if (
    !positive(g.context_window) ||
    g.context_window < 2 ||
    !positive(g.max_output_tokens) ||
    g.max_output_tokens !== g.context_window - 1 ||
    g.max_tokens !== g.max_output_tokens
  )
    reason = "capacity bounds inconsistent";
  else if (
    !epoch(now) ||
    sourceGeneratedAt === null ||
    expiresAt === null ||
    sourceGeneratedAt > now ||
    expiresAt <= sourceGeneratedAt ||
    expiresAt > sourceGeneratedAt + 600
  )
    reason = "capacity source proof invalid";
  else if (now >= expiresAt) reason = "capacity source proof expired";
  else if (availability !== "available") reason = `capacity ${availability}`;
  return {
    admissible: reason === undefined,
    reason,
    state,
    availability,
    sourceGeneratedAt,
    expiresAt,
  };
}
