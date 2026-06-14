import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";

export function resolveMemoryLifecycleStatus(
  query: SelfQuery | undefined,
  state: SelfState,
): SelfResponse {
  const loadResult = normalizeMemoryLoadResult(query?.context?.memoryLoadResult);
  const counts = {
    patterns: state.learnings.patterns.size,
    semanticPressureAnnotations: state.learnings.ontologyCandidates.size,
    traps: state.traps.traps.size,
    checkpoints: state.checkpoints.length,
    followups: state.followups.length,
    pendingFollowups: state.followups.filter((followup) => !followup.delivered).length,
  };
  const totalScoped =
    counts.patterns +
    counts.semanticPressureAnnotations +
    counts.traps +
    counts.checkpoints +
    counts.followups;
  const reason = loadResult.reason ? `; reason=${loadResult.reason}` : "";

  return {
    understood: true,
    intent: "meta",
    answer: `Self memory lifecycle status (mirror-only): load=${loadResult.status}; loaded=${loadResult.loaded}; discarded=${loadResult.discarded}${reason}; scoped memories=${totalScoped} (patterns=${counts.patterns}, semantic-pressure annotations=${counts.semanticPressureAnnotations}, traps=${counts.traps}, checkpoints=${counts.checkpoints}, followups=${counts.followups}, pending followups=${counts.pendingFollowups}). Persistence is scoped to self memory only and is not AK/KES/evidence/ontology/agent_vent truth.`,
    data: {
      kind: "self.memory_lifecycle_status.v1",
      authority: "mirror_only",
      loadResult,
      counts: { ...counts, totalScoped },
      nonAuthorizations: [
        "Does not authorize AK/KES/evidence writes, ontology promotion, agent_vent records, compaction, peer launch, visible-loop launch, or commits.",
      ],
    },
    suggestions: ["action summary", "What did I learn?", "List traps"],
  };
}

function normalizeMemoryLoadResult(value: unknown): {
  status: "missing" | "invalid" | "loaded" | "unknown";
  loaded: number;
  discarded: number;
  reason?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "unknown", loaded: 0, discarded: 0 };
  }

  const record = value as Record<string, unknown>;
  const rawStatus = typeof record.status === "string" ? record.status : "unknown";
  const status = ["missing", "invalid", "loaded"].includes(rawStatus)
    ? (rawStatus as "missing" | "invalid" | "loaded")
    : "unknown";
  const loaded =
    typeof record.loaded === "number" && Number.isFinite(record.loaded)
      ? Math.max(0, Math.trunc(record.loaded))
      : 0;
  const discarded =
    typeof record.discarded === "number" && Number.isFinite(record.discarded)
      ? Math.max(0, Math.trunc(record.discarded))
      : 0;
  const reason =
    typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : undefined;

  return { status, loaded, discarded, ...(reason ? { reason } : {}) };
}
