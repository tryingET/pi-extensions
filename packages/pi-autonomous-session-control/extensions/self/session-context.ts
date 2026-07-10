import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface SessionScopedContext {
  cwd?: unknown;
  sessionManager?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
}

export interface SessionIntentSnapshot {
  latestUserIntent?: string;
  currentObjective?: string;
  source: "caller_context" | "unavailable";
  boundary: string;
}

export function getContextSessionKey(ctx: SessionScopedContext | undefined): string | undefined {
  const candidates = [
    ctx?.sessionKey,
    ctx?.sessionId,
    getSessionManagerMethod(ctx, "getSessionId"),
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

export function collectSessionIntentSnapshot(
  ctx: SessionScopedContext | undefined,
  callerContext?: Record<string, unknown>,
): SessionIntentSnapshot {
  const callerLatest = normalizeIntentText(callerContext?.latestUserIntent);
  const callerObjective = normalizeIntentText(callerContext?.currentObjective);
  if (callerLatest || callerObjective) {
    return {
      ...(callerLatest ? { latestUserIntent: callerLatest } : {}),
      ...(callerObjective ? { currentObjective: callerObjective } : {}),
      source: "caller_context",
      boundary: SESSION_INTENT_BOUNDARY,
    };
  }

  void ctx;
  return { source: "unavailable", boundary: SESSION_INTENT_BOUNDARY };
}

export function getContextRepoRoot(ctx: SessionScopedContext | undefined): string | undefined {
  const cwd = typeof ctx?.cwd === "string" ? ctx.cwd.trim() : "";
  if (!cwd) {
    return undefined;
  }

  return findRepoRoot(cwd);
}

function getSessionManagerObject(
  ctx: SessionScopedContext | undefined,
): Record<string, unknown> | undefined {
  if (!ctx || typeof ctx.sessionManager !== "object" || ctx.sessionManager === null) {
    return undefined;
  }
  return ctx.sessionManager as Record<string, unknown>;
}

function getSessionManagerField(
  ctx: SessionScopedContext | undefined,
  field: "sessionKey" | "sessionId" | "id",
): unknown {
  const sessionManager = getSessionManagerObject(ctx);
  const value = sessionManager?.[field];
  return typeof value === "string" ? value : undefined;
}

function getSessionManagerMethod(
  ctx: SessionScopedContext | undefined,
  method: "getSessionId",
): unknown {
  const sessionManager = getSessionManagerObject(ctx);
  const value = sessionManager?.[method];
  if (typeof value !== "function") return undefined;

  try {
    const result = value.call(sessionManager);
    return typeof result === "string" ? result : undefined;
  } catch {
    return undefined;
  }
}

const SESSION_INTENT_BOUNDARY =
  "Mirror-only latest-intent cue. Verify with transcript, operator request, git, AK, and owner surfaces before treating it as authority.";

function normalizeIntentText(value: unknown): string | undefined {
  const raw = (typeof value === "string" ? value : "").trim().replace(/\s+/gu, " ");
  if (!raw) return undefined;
  return raw.length > 500 ? `${raw.slice(0, 497)}...` : raw;
}

function findRepoRoot(cwd: string): string {
  const resolvedCwd = resolve(cwd);
  let current = resolvedCwd;

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolvedCwd;
    }
    current = parent;
  }
}
