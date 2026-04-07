import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface SessionScopedContext {
  cwd?: unknown;
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

export function getContextRepoRoot(ctx: SessionScopedContext | undefined): string | undefined {
  const cwd = typeof ctx?.cwd === "string" ? ctx.cwd.trim() : "";
  if (!cwd) {
    return undefined;
  }

  return findRepoRoot(cwd);
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

function findRepoRoot(cwd: string): string {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}
