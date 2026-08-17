/**
summary: "Best-effort adapter to pi-telemetry's metadata-only compaction quality emitters."
read_when:
  - "Changing compaction quality/recall observability or session identity handling."
*/
import path from "node:path";

export function compactionSessionId(ctx) {
  for (const method of ["getSessionFile", "getSessionPath"]) {
    try {
      const value = ctx?.sessionManager?.[method]?.();
      if (typeof value === "string" && value.trim()) return path.basename(value.trim());
    } catch {
      // Keep telemetry best-effort.
    }
  }
  return undefined;
}

async function telemetryModule(deps = {}) {
  if (deps.telemetry) return deps.telemetry;
  return import("@tryinget/pi-telemetry/emit");
}

export async function recordCompactionQuality(input, ctx, deps = {}) {
  try {
    const telemetry = await telemetryModule(deps);
    await telemetry.recordCompactionQualityTelemetry?.({
      ...input,
      sessionId: input.sessionId ?? compactionSessionId(ctx),
    });
  } catch {
    // Observability must never alter compaction behavior.
  }
}

export async function recordCompactionRecall(input, ctx, deps = {}) {
  try {
    const telemetry = await telemetryModule(deps);
    await telemetry.recordCompactionRecallTelemetry?.({
      ...input,
      sessionId: input.sessionId ?? compactionSessionId(ctx),
    });
  } catch {
    // Observability must never alter recall behavior.
  }
}
