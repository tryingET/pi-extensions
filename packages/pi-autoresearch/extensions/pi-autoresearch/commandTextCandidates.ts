import {
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchCandidateBindPlan,
  buildAutoresearchCandidateDecisionWorkbench,
  discoverAutoresearchMatrixCampaignArtifacts,
  formatAutoresearchCandidateDecisionWorkbench,
} from "../../src/core/runtime.ts";
import type {
  AutoresearchCandidateBindTriggerMode,
  AutoresearchCandidateDecisionReviewParsedInput,
} from "./commandText.ts";

export function parseAutoresearchOpenCandidateReviewCommand(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "open candidates":
    case "open candidate review":
    case "open candidate reviews":
    case "candidate review posture":
    case "candidate reviews":
    case "review posture":
    case "review candidates":
      return true;
    default:
      return false;
  }
}

export function buildAutoresearchOpenCandidateReviewEditorText(cwd: string): string {
  const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  const posture = summary.openCandidateReview;
  const direction = summary.metricDirection ?? "lower";
  const packetPaths = collectOpenCandidateReviewPacketPaths(summary.cells);
  const reviewCall = buildAutoresearchOpenCandidateReviewCall({
    cwd,
    direction,
    packetPaths,
  });
  const finalizerCall = buildAutoresearchPostFaninFinalizerCall({
    cwd,
    direction,
    packetPaths,
  });
  const cells = summary.cells
    .filter((cell) => cell.packetInventory.length > 0 || cell.selectedPacketPath)
    .slice(0, 12)
    .map(
      (cell) =>
        `- ${cell.cellId}: posture=${cell.posture}; selected=${cell.selectedLaneId ?? "none"}; packets=${cell.packetInventory.length}; next=${cell.nextLegalAction}`,
    );

  return [
    "# PI-AUTORESEARCH OPEN CANDIDATE REVIEW POSTURE",
    "",
    posture.summary,
    "",
    "## Counts",
    `- status: ${posture.status}`,
    `- open review cells: ${posture.openCellCount}`,
    `- selected review cells: ${posture.selectedReviewCellCount}`,
    `- measured/selectable unselected cells: ${posture.unselectedMeasuredCellCount}`,
    `- packet inventory references: ${posture.packetInventoryItemCount}`,
    `- unique exported packets: ${posture.uniqueExportedPacketCount}`,
    `- explicit packet paths in review call: ${packetPaths.length}`,
    `- export visibility blockers: ${summary.exportVisibilityBlockers.value}`,
    "",
    "## Cell inventory sample",
    ...(cells.length > 0 ? cells : ["- none discovered"]),
    "",
    "## Exact owner-review call to prepare",
    "```ts",
    reviewCall,
    "```",
    "",
    "## Explicit candidate-result packet paths",
    ...(packetPaths.length > 0
      ? packetPaths.map((packetPath) => `- ${packetPath}`)
      : ["- none discovered; the owner-review call will rely on default discovery"]),
    "",
    "## If review finds useful candidates",
    "Do not leave useful candidate packets as unresolved inventory. First run the owner-review call above. If that review selects useful lanes, prepare the post-fan-in finalizer/token-request call below. The finalizer still requires validation evidence and the exact finalize_post_fanin owner token before any apply step.",
    "```ts",
    finalizerCall,
    "```",
    "",
    "## Boundary",
    posture.boundary,
    "Do not keep, discard, finalize, merge, reset, or record AK/KES/evidence from packet counts alone. Candidate-result packets are review inventory until the owner-review surface decides.",
  ].join("\n");
}

export function collectOpenCandidateReviewPacketPaths(
  cells: ReturnType<typeof discoverAutoresearchMatrixCampaignArtifacts>["cells"],
): string[] {
  const packetPaths = new Set<string>();
  for (const cell of cells) {
    if (cell.selectedPacketPath) packetPaths.add(cell.selectedPacketPath);
    for (const packetPath of cell.packetInventory) packetPaths.add(packetPath);
  }
  return [...packetPaths].sort((left, right) => left.localeCompare(right));
}

export function buildAutoresearchOpenCandidateReviewCall(input: {
  cwd: string;
  direction: "lower" | "higher";
  packetPaths: string[];
}): string {
  const packetPathProperty = formatAutoresearchCandidateResultPacketPathsProperty(
    input.packetPaths,
  );
  return `autoresearch_live_supervision({\n  action: "review_candidate_wave",\n  taskId: <ak-task-id>,\n  cwd: ${JSON.stringify(input.cwd)},\n  objective: "<candidate-wave-objective>",\n  direction: ${JSON.stringify(input.direction)}${packetPathProperty}\n})`;
}

export function buildAutoresearchPostFaninFinalizerCall(input: {
  cwd: string;
  direction: "lower" | "higher";
  packetPaths: string[];
}): string {
  const packetPathProperty = formatAutoresearchCandidateResultPacketPathsProperty(
    input.packetPaths,
  );
  return `autoresearch_live_supervision({\n  action: "post_fanin_finalizer",\n  taskId: <ak-task-id>,\n  cwd: ${JSON.stringify(input.cwd)},\n  objective: "<candidate-wave-objective>",\n  sourceReview: "review_candidate_wave",\n  direction: ${JSON.stringify(input.direction)}${packetPathProperty},\n  validation: { status: "missing", summary: "Run required validation before applying selected useful candidates." }\n})`;
}

export function formatAutoresearchCandidateResultPacketPathsProperty(
  packetPaths: string[],
): string {
  const formattedPacketPaths = packetPaths
    .map((packetPath) => `    ${JSON.stringify(packetPath)}`)
    .join(",\n");
  return formattedPacketPaths
    ? `,\n  candidateResultPacketPaths: [\n${formattedPacketPaths}\n  ]`
    : "";
}

export function parseAutoresearchCandidateIntegrationCommand(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "integrate candidates":
    case "integrate candidate":
    case "candidate integration":
    case "candidate integrate":
    case "integrate useful candidates":
    case "apply useful candidates":
    case "post fanin":
    case "post-fanin":
    case "post fanin finalizer":
    case "post-fanin finalizer":
      return true;
    default:
      return false;
  }
}

export function buildAutoresearchCandidateIntegrationEditorText(cwd: string): string {
  const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  const direction = summary.metricDirection ?? "lower";
  const packetPaths = collectOpenCandidateReviewPacketPaths(summary.cells);
  return [
    "# PI-AUTORESEARCH USEFUL CANDIDATE INTEGRATION HANDOFF",
    "",
    "Outstanding candidates should be integrated when owner review finds them useful. This handoff keeps that closeout path explicit without treating packet counts as promotion authority.",
    "",
    "## Current review inventory",
    summary.openCandidateReview.summary,
    `- explicit packet paths in review/finalizer calls: ${packetPaths.length}`,
    `- export visibility blockers: ${summary.exportVisibilityBlockers.value}`,
    "",
    "## Step 1 — owner review decides usefulness",
    "```ts",
    buildAutoresearchOpenCandidateReviewCall({ cwd, direction, packetPaths }),
    "```",
    "",
    "## Step 2 — request post-fan-in finalizer token for useful selections",
    "```ts",
    buildAutoresearchPostFaninFinalizerCall({ cwd, direction, packetPaths }),
    "```",
    "",
    "## Boundary",
    "This is a read-only handoff. It does not merge, apply patches, reset/delete worktrees, record AK/KES/evidence, or promote candidates. Finalizer apply remains withheld until the owner-review packet selects useful lanes and the exact finalize_post_fanin authorization token is supplied.",
  ].join("\n");
}

export function parseAutoresearchCandidateNextCommand(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "next":
    case "candidate next":
    case "decision next":
    case "what next":
      return true;
    default:
      return false;
  }
}

export function parseAutoresearchCandidateMeasureCommand(
  value: string,
  cwd: string,
): { candidateWorktree: string } | null {
  return parseAutoresearchCandidatePathCommand(value, cwd, "measure");
}

export function parseAutoresearchCandidateBindCommand(
  value: string,
  cwd: string,
): { candidateWorktree: string } | null {
  return parseAutoresearchCandidatePathCommand(value, cwd, "bind");
}

export function parseAutoresearchCandidatePathCommand(
  value: string,
  cwd: string,
  verb: "bind" | "measure",
): { candidateWorktree: string } | null {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (lower === verb || lower === `${verb} current` || lower === `candidate ${verb} current`) {
    return { candidateWorktree: cwd };
  }
  if (lower === `candidate ${verb}`) return { candidateWorktree: cwd };
  const bindPrefix = lower.startsWith(`${verb} `) ? `${verb} ` : null;
  const candidateBindPrefix = lower.startsWith(`candidate ${verb} `) ? `candidate ${verb} ` : null;
  const prefix = bindPrefix ?? candidateBindPrefix;
  if (!prefix) return null;
  const worktree = normalized.slice(prefix.length).trim();
  if (!worktree || worktree.toLowerCase() === "current") return { candidateWorktree: cwd };
  return { candidateWorktree: worktree };
}

export function buildAutoresearchCandidateBindEditorCall(
  cwd: string,
  candidateWorktree: string,
): string {
  return `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({\n  cwd: ${JSON.stringify(cwd)},\n  action: "plan_run",\n  candidateSource: "manual",\n  candidateWorktree: ${JSON.stringify(candidateWorktree)},\n  description: "Measure bound candidate"\n})`;
}

export function buildAutoresearchCandidateBindOrMeasureEditorCall(
  cwd: string,
  candidateWorktree: string,
  mode: AutoresearchCandidateBindTriggerMode,
): string {
  return mode === "measure"
    ? buildAutoresearchCandidateMeasureEditorCall(cwd, candidateWorktree)
    : buildAutoresearchCandidateBindEditorCall(cwd, candidateWorktree);
}

export function buildAutoresearchCandidateMeasureEditorCall(
  cwd: string,
  candidateWorktree: string,
): string {
  const plan = buildAutoresearchCandidateBindPlan({
    cwd,
    action: "plan_run",
    candidateSource: "manual",
    candidateWorktree,
    description: "Measure bound candidate",
  });
  if (plan.inspection.readiness !== "ready") {
    return buildAutoresearchCandidateBindEditorCall(cwd, candidateWorktree);
  }
  return plan.exactNextCalls[0] ?? buildAutoresearchCandidateBindEditorCall(cwd, candidateWorktree);
}

export function buildAutoresearchCandidateNextEditorCall(cwd: string): string {
  const matrixSummary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  if (matrixSummary.openCandidateReview.status === "owner_review_required") {
    return buildAutoresearchOpenCandidateReviewEditorText(cwd);
  }

  const decision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
  switch (decision.recommendedDecision) {
    case "no_candidate_bound_yet":
      return buildAutoresearchCandidateBindEditorCall(cwd, cwd);
    case "keep":
      return buildAutoresearchCandidateDecisionEditorCall(cwd, "plan_keep");
    case "discard":
      return buildAutoresearchCandidateDecisionEditorCall(cwd, "plan_discard");
    case "rewind":
      return buildAutoresearchCandidateDecisionEditorCall(cwd, "plan_rewind");
    case "finalize":
    case "rebaseline":
    case "collect_more_samples":
    case "rebind_candidate":
      return selectAutoresearchActionableNextCall(decision.exactNextCalls);
  }
}

export function selectAutoresearchActionableNextCall(calls: string[]): string {
  return (
    calls.find((call) => !call.startsWith(`${AUTORESEARCH_STATUS_TOOL_NAME}(`)) ??
    calls[0] ??
    `${AUTORESEARCH_STATUS_TOOL_NAME}({ action: "dashboard" })`
  );
}

export function parseAutoresearchCandidateDecisionReviewCommand(
  value: string,
): AutoresearchCandidateDecisionReviewParsedInput | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "review" ||
    normalized === "candidate review" ||
    normalized === "decision review" ||
    normalized === "confirm" ||
    normalized === "candidate confirm"
  ) {
    return { directAction: null };
  }
  for (const prefix of ["review ", "candidate review ", "decision review ", "confirm "]) {
    if (normalized.startsWith(prefix)) {
      const directAction = parseAutoresearchCandidateDecisionCommand(
        normalized.slice(prefix.length),
      );
      return directAction ? { directAction } : null;
    }
  }
  return null;
}

export function parseAutoresearchCandidateDecisionCommand(
  value: string,
): "status" | "plan_keep" | "plan_discard" | "plan_rewind" | null {
  switch (value.toLowerCase()) {
    case "candidate":
    case "decision":
    case "candidate status":
    case "candidate decision":
      return "status";
    case "keep":
    case "candidate keep":
    case "plan keep":
    case "plan_keep":
      return "plan_keep";
    case "discard":
    case "candidate discard":
    case "plan discard":
    case "plan_discard":
      return "plan_discard";
    case "rewind":
    case "candidate rewind":
    case "plan rewind":
    case "plan_rewind":
      return "plan_rewind";
    default:
      return null;
  }
}

export function buildAutoresearchCandidateDecisionEditorCall(
  cwd: string,
  action: "status" | "plan_keep" | "plan_discard" | "plan_rewind",
): string {
  const toolCall = `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({\n  cwd: ${JSON.stringify(cwd)},\n  action: ${JSON.stringify(action)},\n  candidatePolicy: {\n    mode: "worktree",\n    keep: "preserve_branch",\n    discard: "suggest_cleanup",\n    rewind: "reset_worktree_to_base"\n  }\n})`;
  let review =
    "Candidate decision review unavailable; send the exact tool call below to build a fresh plan.";
  try {
    review = formatAutoresearchCandidateDecisionWorkbench(
      buildAutoresearchCandidateDecisionWorkbench({ cwd, action }),
    );
  } catch (error) {
    review = `Candidate decision review unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
  return [
    "# PI-AUTORESEARCH CANDIDATE DECISION CONFIRMATION",
    "",
    "Review this checklist only after measured packet inventory is complete in /autoresearch export (export_visibility_blockers=0). The tool call remains plan-only and precedes any external worktree, merge, evidence, promotion, or rollback action.",
    "",
    review,
    "",
    "## Exact plan-only tool call",
    "```ts",
    toolCall,
    "```",
  ].join("\n");
}
