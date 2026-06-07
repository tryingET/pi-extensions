import {
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
} from "./runtime-constants.ts";
import { formatConfidenceValue } from "./runtime-format.ts";
import { buildAutoresearchMetricReadinessReview } from "./runtime-metric-readiness.ts";
import type { AutoresearchCandidateDecisionWorkbench } from "./runtime-model.ts";
import { formatNullableBoolean, formatTargetFiles } from "./runtime-status-format.ts";

export function formatAutoresearchCandidateDecisionWorkbench(
  result: AutoresearchCandidateDecisionWorkbench,
): string {
  const candidateLines = result.candidate
    ? [
        `- candidate source: ${result.candidate.source ?? "(unknown)"}`,
        `- candidate worktree: ${result.candidate.worktreePath ?? "(unknown)"}`,
        `- candidate branch/ref: ${result.candidate.branch ?? "(unknown)"}`,
        `- candidate base ref: ${result.candidate.baseRef ?? "(unknown)"}`,
        `- candidate artifact status: ${result.candidate.artifactStatus}`,
        `- candidate worktree exists: ${formatNullableBoolean(result.candidate.worktreeExists)}`,
        `- candidate branch exists: ${formatNullableBoolean(result.candidate.branchExists)}`,
        `- candidate files changed: ${formatTargetFiles(result.candidate.filesChanged)}`,
        `- candidate diff summary: ${result.candidate.diffSummary ?? "(unknown)"}`,
      ]
    : ["- candidate: no candidate bound yet"];
  const commandLines =
    result.plannedCommands.length > 0
      ? result.plannedCommands.map((command) => `- ${command}`)
      : ["- (none; no worktree mutation is planned for this action)"];

  const metricReadiness =
    result.metricReadiness ?? buildAutoresearchMetricReadinessReview(result.status);

  return [
    "# PI-AUTORESEARCH CANDIDATE DECISION WORKBENCH",
    "",
    "Read-only / plan-only candidate lifecycle surface. It consumes runtime status, closeout, and candidate-result evidence; it does not merge, delete worktrees, rewind worktrees, spawn peers, write AK/KES/evidence, or promote results.",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- recommended lifecycle decision: ${result.recommendedDecision}`,
    `- reason: ${result.recommendationReason}`,
    "",
    "## Candidate summary",
    ...candidateLines,
    "",
    "## Empirical posture",
    `- classification: ${result.empirical.classification}`,
    `- empirical decision: ${result.empirical.empiricalDecisionClass}`,
    `- promotion readiness: ${result.empirical.promotionReady ? "ready" : "not ready"}`,
    `- confidence: ${formatConfidenceValue(result.empirical.confidence)}`,
    `- confidence/noise: ${result.empirical.confidenceNoiseInterpretation}`,
    `- checks status: ${result.empirical.checksStatus}`,
    `- baseline drift risk: ${result.empirical.baselineDriftRisk}`,
    "",
    "## Metric readiness review",
    `- classification: ${metricReadiness.classification}`,
    `- summary: ${metricReadiness.summary}`,
    ...metricReadiness.checklist.map((item) => `- [ ] ${item}`),
    ...(metricReadiness.blockedReasons.length > 0
      ? [
          "",
          "### Metric readiness blockers",
          ...metricReadiness.blockedReasons.map((reason) => `- ${reason}`),
        ]
      : []),
    "",
    "## Candidate lifecycle policy",
    `- mode: ${result.candidatePolicy.mode}`,
    `- keep: ${result.candidatePolicy.keep}`,
    `- discard: ${result.candidatePolicy.discard}`,
    `- rewind: ${result.candidatePolicy.rewind}`,
    `- authority: ${result.candidatePolicy.authority}`,
    "",
    "## Confirmation checklist",
    `- confirmation required: ${result.confirmation.required ? "yes" : "no"}`,
    `- risk level: ${result.confirmation.riskLevel}`,
    `- exact confirmation phrase: ${result.confirmation.exactConfirmationPhrase}`,
    `- next human action: ${result.confirmation.nextHumanAction}`,
    ...result.confirmation.checklist.map((item) => `- [ ] ${item}`),
    ...(result.confirmation.blockedReasons.length > 0
      ? [
          "",
          "### Confirmation blockers",
          ...result.confirmation.blockedReasons.map((reason) => `- ${reason}`),
        ]
      : []),
    "",
    "## Exact next calls",
    ...result.exactNextCalls.map((call) => `- ${call}`),
    "",
    "## Planned commands (not executed)",
    ...commandLines,
    "",
    "## Boundary warnings",
    ...result.boundaryWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function formatAutoresearchCandidateDecisionDashboardSummary(
  result: AutoresearchCandidateDecisionWorkbench,
): string {
  const candidateLabel = result.candidate?.label ?? "no candidate bound yet";
  const metricReadiness =
    result.metricReadiness ?? buildAutoresearchMetricReadinessReview(result.status);
  const nextCall =
    result.exactNextCalls[0] ??
    `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(result.cwd)}, action: "status" })`;
  const bindHint = result.candidate
    ? []
    : [
        `- bind surface: ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${JSON.stringify(result.cwd)}, candidateWorktree: ${JSON.stringify(result.cwd)}, action: "plan_run" })`,
      ];
  return [
    `- candidate: ${candidateLabel}`,
    `- candidate artifact status: ${result.candidate?.artifactStatus ?? "unbound"}`,
    `- recommended decision: ${result.recommendedDecision}`,
    `- reason: ${result.recommendationReason}`,
    `- empirical posture: ${result.empirical.classification}; promotion ready: ${result.empirical.promotionReady ? "yes" : "no"}`,
    `- checks: ${result.empirical.checksStatus}; baseline drift risk: ${result.empirical.baselineDriftRisk}`,
    `- metric readiness: ${metricReadiness.classification}; ${metricReadiness.summary}`,
    ...bindHint,
    `- next surface: ${nextCall}`,
  ].join("\n");
}
