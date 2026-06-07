import type {
  FinalizeDecisionPacket,
  NextHypothesisDecisionPacket,
  SetupDecisionPacket,
} from "./decisions-model.ts";

export function buildSetupDecisionContext(packet: SetupDecisionPacket): string {
  const objective = requirePacketText(packet.optimizationObjective, "optimizationObjective");

  return buildPacketDocument("PI-AUTORESEARCH SETUP PACKET", [
    ["Optimization objective", objective],
    ["Current repo/runtime context", formatMarkdownList(packet.repoContext)],
    ["File scope", formatMarkdownList(packet.filesInScope)],
    ["Off-limits", formatMarkdownList(packet.offLimits)],
    ["Benchmark and profiling surfaces", formatMarkdownList(packet.benchmarkSurfaces)],
    ["Existing autoresearch artifacts", formatMarkdownList(packet.existingArtifacts)],
    ["Hard constraints", formatMarkdownList(packet.hardConstraints)],
    ["Known blockers", formatMarkdownList(packet.blockers ?? [])],
    ["AK task scope reference", formatAkTaskReference(packet.akTask ?? null)],
  ]);
}

export function buildNextHypothesisDecisionContext(packet: NextHypothesisDecisionPacket): string {
  const goal = requirePacketText(packet.goal, "goal");

  return buildPacketDocument("PI-AUTORESEARCH NEXT HYPOTHESIS PACKET", [
    ["Campaign goal", goal],
    ["Constraints", formatMarkdownList(packet.constraints)],
    ["Current segment summary", formatMarkdownList(packet.segmentSummary)],
    ["Baseline and best-run history", formatMarkdownList(packet.baselineHistory)],
    ["Recent run history", formatMarkdownList(packet.recentRunHistory)],
    ["Checks status", formatMarkdownList(packet.checksStatus)],
    ["Confidence and noise signals", formatMarkdownList(packet.confidenceSignals)],
    ["ASI notes", formatMarkdownList(packet.asiNotes)],
    ["Dead-end memory", formatMarkdownList(packet.deadEndMemory)],
    ["Files in scope", formatMarkdownList(packet.filesInScope)],
    ["Off-limits", formatMarkdownList(packet.offLimits)],
    ["Ideas backlog", formatMarkdownList(packet.ideasBacklog)],
  ]);
}

export function buildFinalizeDecisionContext(packet: FinalizeDecisionPacket): string {
  return buildPacketDocument("PI-AUTORESEARCH FINALIZE PACKET", [
    ["Kept runs", formatMarkdownList(packet.keptRuns)],
    ["Campaign context", formatMarkdownList(packet.campaignContext)],
    ["Merge base", normalizeOptionalPacketText(packet.mergeBase)],
    ["Target trunk", normalizeOptionalPacketText(packet.trunkTarget)],
    ["Commit summaries", formatMarkdownList(packet.commitSummaries)],
    ["Dependency notes", formatMarkdownList(packet.dependencyNotes)],
    ["Ideas to leave out of final branches", formatMarkdownList(packet.ideasToLeaveOut)],
  ]);
}

function buildPacketDocument(
  title: string,
  sections: ReadonlyArray<readonly [heading: string, body: string]>,
): string {
  const lines = [`# ${title}`, ""];

  for (const [heading, body] of sections) {
    lines.push(`## ${heading}`);
    lines.push(body.trim() || "- none");
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatMarkdownList(values: readonly string[]): string {
  if (values.length === 0) {
    return "- none";
  }

  return values
    .map((value) => normalizeListItem(value))
    .filter(Boolean)
    .map((value) => `- ${value}`)
    .join("\n");
}

function formatAkTaskReference(
  task: {
    id?: number;
    scopeSummary?: readonly string[];
    allowedPaths?: readonly string[];
    requiredPaths?: readonly string[];
  } | null,
): string {
  if (!task) {
    return "- none";
  }

  const lines = [
    typeof task.id === "number" && Number.isFinite(task.id) ? `- task id: ${task.id}` : null,
    ...formatNestedList("scope summary", task.scopeSummary ?? []),
    ...formatNestedList("allowed paths", task.allowedPaths ?? []),
    ...formatNestedList("required paths", task.requiredPaths ?? []),
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : "- none";
}

function formatNestedList(label: string, values: readonly string[]): string[] {
  const items = values.map((value) => normalizeListItem(value)).filter(Boolean);
  return [`- ${label}:`, ...(items.length > 0 ? items.map((item) => `  - ${item}`) : ["  - none"])];
}

function normalizeOptionalPacketText(value: string | null): string {
  return asNonEmptyString(value) ?? "- none";
}

function requirePacketText(value: string, field: string): string {
  const normalized = asNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${field} is required for decision packet construction.`);
  }
  return normalized;
}

function normalizeListItem(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean)
    .join(" | ");
}

function normalizeInlineText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
