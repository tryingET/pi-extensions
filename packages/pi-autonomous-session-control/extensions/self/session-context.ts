export interface SessionScopedContext {
  sessionManager?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
}

export function getContextSessionKey(ctx: SessionScopedContext | undefined): string | undefined {
  const candidates = [
    ctx?.sessionKey,
    ctx?.sessionId,
    getSessionManagerField(ctx, "sessionKey"),
    getSessionManagerField(ctx, "sessionId"),
    getSessionManagerField(ctx, "id"),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return undefined;
}

function getSessionManagerField(
  ctx: SessionScopedContext | undefined,
  field: "sessionKey" | "sessionId" | "id",
): unknown {
  if (!ctx || typeof ctx.sessionManager !== "object" || ctx.sessionManager === null) {
    return undefined;
  }

  const value = (ctx.sessionManager as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}
