/** Consumer of the workstation projection, not a backend tokenizer or capacity producer. */
export type Capacity = {
  schema: "soma.capacity/v1";
  source_generated_at: number | null;
  expires_at: number | null;
  availability: "available" | "unavailable" | "unknown";
  guaranteed: {
    state: "observed" | "stale" | "unknown" | "contradictory";
    context_window: number | null;
    max_output_tokens: number | null;
    max_tokens: number | null;
  };
};

export const SOMA_ALIASES = new Set([
  "baseline-text",
  "baseline-text-visible",
  "baseline-multimodal",
  "think-small",
]);

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

/** Unknown/malformed proof is descriptive, never defaulted into permission. */
export function capacityAdmission(value: unknown, now = Date.now() / 1000) {
  const c = record(value);
  const g = record(c.guaranteed);
  const deny = (reason: string) => ({ admissible: false as const, reason });
  if (c.schema !== "soma.capacity/v1") return deny("capacity schema missing or unknown");
  if (
    typeof c.availability !== "string" ||
    !["available", "unavailable", "unknown"].includes(c.availability)
  )
    return deny("capacity availability unknown");
  if (g.state !== "observed")
    return deny(`capacity guarantee ${typeof g.state === "string" ? g.state : "unknown"}`);
  if (
    !positive(g.context_window) ||
    g.context_window < 2 ||
    !positive(g.max_output_tokens) ||
    g.max_output_tokens !== g.context_window - 1 ||
    g.max_tokens !== g.max_output_tokens
  )
    return deny("capacity bounds inconsistent");
  if (
    !epoch(now) ||
    !epoch(c.source_generated_at) ||
    !epoch(c.expires_at) ||
    c.source_generated_at > now ||
    c.expires_at <= c.source_generated_at ||
    c.expires_at > c.source_generated_at + 600
  )
    return deny("capacity source proof invalid");
  if (now >= c.expires_at) return deny("capacity source proof expired");
  if (c.availability !== "available") return deny(`capacity ${String(c.availability)}`);
  return {
    admissible: true as const,
    reason: undefined,
    contextWindow: g.context_window,
    maxTokens: g.max_output_tokens,
  };
}

/** Operates on the final JSON body, including any toJSON/async hook effects. */
export function boundCapacityPayload(value: unknown, modelId: string, maximum: number) {
  const payload = record(value);
  if (payload.model !== modelId || !Array.isArray(payload.messages))
    throw new Error("capacity dispatch must retain the exact contract model and messages");
  let reserved = false;
  for (const key of ["max_tokens", "max_completion_tokens"]) {
    if (!(key in payload)) continue;
    reserved = true;
    const requested = payload[key];
    if (!positive(requested))
      throw new Error("capacity output reservation must be a positive safe integer");
    payload[key] = Math.min(requested, maximum);
  }
  if (!reserved) payload.max_tokens = maximum;
  return payload;
}
