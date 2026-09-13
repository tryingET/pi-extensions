import { createHash } from "node:crypto";
import type { ResearchObservatoryModel } from "./runtime-dashboard-model.ts";
import type { DashboardAttempt } from "./runtime-matrix-model.ts";

/** View-only identities. These are not owner schemas or experiment relationships. */
export interface AtlasFact {
  values: string[];
  complete: boolean;
}
export interface AtlasNode {
  id: string;
  campaign: string;
  campaignLabel: string;
  kind: "experiment" | "local receipts" | "unresolved reports";
  label: string;
  hypothesis: string | null;
  prediction: string | null;
  rejection: string | null;
  scenario: string | null;
  sources: string[];
  lanes: { label: string; attempts: DashboardAttempt[]; note: string }[];
  facts: Record<string, AtlasFact>;
}
export type Contribution = "signal" | "against" | "unknown";
export function contribution(a: DashboardAttempt): Contribution {
  if (!a.schemaValid || !a.lineageValid || a.packetBinding === "quarantined") return "unknown";
  if (["regression", "correctness_failure"].includes(a.outcome)) return "against";
  if (
    a.validMeasurement &&
    ["improvement", "baseline_reference", "threshold_preserved", "threshold_satisfied"].includes(
      a.outcome,
    )
  )
    return "signal";
  return "unknown";
}
export function atlasId(parts: unknown[]): string {
  return `atlas-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function fact(values: (string | null)[]): AtlasFact {
  return {
    values: [...new Set(values.filter((v): v is string => v !== null))],
    complete: values.length > 0 && values.every((v) => v !== null),
  };
}
function facts(node: AtlasNode): AtlasNode["facts"] {
  // Preserve excluded occurrences as unknown, rather than filtering them away and
  // accidentally declaring the remaining subset complete. Source inspection is unchanged.
  const attempts = node.lanes
    .flatMap((l) => (l.attempts.length ? l.attempts : [null]))
    .map((a) =>
      node.kind === "experiment" &&
      a &&
      a.packetBinding === "matched" &&
      a.schemaValid &&
      a.lineageValid &&
      a.validMeasurement
        ? a
        : null,
    );
  const fileSets = attempts.map((a) => {
    if (!a) return null;
    const candidate = record(record(record(a.raw).experiment).candidate);
    return Array.isArray(candidate.filesChanged) &&
      candidate.filesChanged.every((f) => typeof f === "string")
      ? (candidate.filesChanged as string[])
      : null;
  });
  return {
    Hypothesis: fact([node.hypothesis]),
    Scenario: fact([node.scenario]),
    Subject: fact(attempts.map((a) => a?.identity.subject ?? null)),
    Base: fact(attempts.map((a) => a?.identity.base ?? null)),
    "Changed files": {
      values: [...new Set(fileSets.flatMap((files) => files ?? []))],
      complete: fileSets.length > 0 && fileSets.every((files) => files !== null),
    },
  };
}
export function buildAtlasNodes(model: ResearchObservatoryModel): AtlasNode[] {
  const nodes: AtlasNode[] = [];
  const seen = new Map<string, number>();
  for (const campaign of model.matrix.campaigns) {
    for (const cell of campaign.cells) {
      const key = JSON.stringify([campaign.key, cell.cellId]);
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      nodes.push({
        id: atlasId([campaign.key, cell.cellId, occurrence]),
        campaign: campaign.key,
        campaignLabel: `${campaign.taskId ? `AK${campaign.taskId}` : "Task unresolved"} · ${campaign.objective ?? "Objective not specified"}`,
        kind: "experiment",
        label: cell.cellId,
        hypothesis: cell.hypothesis,
        prediction: cell.prediction,
        rejection: cell.rejectionCriteria,
        scenario: cell.scenario,
        sources: cell.sources,
        lanes: cell.lanes.map((lane) => ({
          label: lane.laneId,
          note: lane.segmentIdentity
            ? `Reported segment: ${lane.segmentIdentity.name}. ${lane.reportedState}`
            : lane.reportedState,
          attempts: lane.attempts,
        })),
        facts: {},
      });
    }
  }
  for (const [kind, attempts] of [
    ["local receipts", model.runtimeAttempts],
    ["unresolved reports", model.matrix.unresolvedPackets],
  ] as const) {
    if (!attempts.length) continue;
    nodes.push({
      id: atlasId([kind, model.cwd]),
      campaign: atlasId(["source collection", kind, model.cwd]),
      campaignLabel:
        kind === "local receipts"
          ? "Local runtime · separate scope"
          : "Identity unresolved · isolated source collection",
      kind,
      label: kind,
      hypothesis: null,
      prediction: null,
      rejection: null,
      scenario: null,
      sources: [...new Set(attempts.flatMap((a) => a.sources))],
      lanes: [
        {
          label: "Source reports (not a planned lane)",
          note: "No matrix campaign membership inferred.",
          attempts,
        },
      ],
      facts: {},
    });
  }
  for (const node of nodes) node.facts = facts(node);
  return nodes;
}
export function atlasAttemptId(node: AtlasNode, lane: number, attempt: number): string {
  // Occurrence identity retains even duplicate or quarantined reports.
  return atlasId([
    node.id,
    node.lanes[lane].label,
    lane,
    node.lanes[lane].attempts[attempt].id,
    attempt,
  ]);
}
