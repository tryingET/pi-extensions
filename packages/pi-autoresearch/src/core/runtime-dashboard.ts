import { buildAutoresearchCandidateDecisionWorkbench } from "./runtime-candidate-decision.ts";
import { formatAutoresearchCandidateDecisionDashboardSummary } from "./runtime-candidate-decision-format.ts";
import {
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
} from "./runtime-constants.ts";
import {
  formatAutoresearchAuthorityHandoffLines,
  formatAutoresearchDashboardMode,
  formatAutoresearchGuidedCandidateJourneyLines,
  formatAutoresearchMatrixCampaignSummaryLines,
  formatAutoresearchSetupGuideLines,
} from "./runtime-dashboard-guidance.ts";
import {
  formatEmpiricalPosture,
  formatLastRun,
  formatMetricInterpretation,
  formatMetricThresholdValue,
  formatMetricValue,
} from "./runtime-format.ts";
import { discoverAutoresearchMatrixCampaignArtifacts } from "./runtime-matrix.ts";
import { buildAutoresearchMetricReadinessReview } from "./runtime-metric-readiness.ts";
import type {
  AutoresearchCandidateLifecyclePolicy,
  AutoresearchRuntimeStatus,
} from "./runtime-model.ts";
import { DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY } from "./runtime-model.ts";
import {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlanFromStatus,
  formatAutoresearchResumeApplyPlanSummaryLines,
  formatAutoresearchResumePlanSummaryLines,
} from "./runtime-resume-plan.ts";

export function formatAutoresearchDashboard(
  status: AutoresearchRuntimeStatus,
  candidatePolicy: AutoresearchCandidateLifecyclePolicy = DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY,
): string {
  const segment = status.currentSegment;
  const metricLine = segment.configured
    ? `${segment.metricName ?? "(unset)"} (${segment.metricUnit || "unitless"}, ${segment.direction ?? "unset"} is better)`
    : "(not configured)";
  const runLine = segment.configured
    ? `${segment.runCount} total / ${segment.successfulRunCount} successful; last=${formatLastRun(segment.lastRunStatus, segment.lastRunMetric, segment.metricUnit, segment.lastRunKind)}`
    : "0 total / 0 successful";
  const candidateDecision = status.cwd
    ? formatAutoresearchCandidateDecisionDashboardSummary(
        buildAutoresearchCandidateDecisionWorkbench({ cwd: status.cwd, candidatePolicy }),
      )
    : "- candidate: (unavailable without cwd)\n- next surface: provide cwd to autoresearch_candidate_decision";
  const resumePlan = status.cwd ? buildAutoresearchResumePlanFromStatus(status.cwd, status) : null;
  const resumePlanLines = resumePlan
    ? formatAutoresearchResumePlanSummaryLines(resumePlan)
    : ["- resume plan: (unavailable without cwd)"];
  const resumeApplyPlan = status.cwd ? buildAutoresearchResumeApplyPlan(status.cwd) : null;
  const resumeApplyPlanLines = resumeApplyPlan
    ? formatAutoresearchResumeApplyPlanSummaryLines(resumeApplyPlan)
    : ["- resume apply plan: (unavailable without cwd)"];
  const dashboardCwd = status.cwd ?? process.cwd();
  const learningExportCall = `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "learning_export" })`;
  const learningKesAdapterCall =
    'autoresearch_learning_kes_adapter({ action: "plan", packetPath: "<exported-learning-packet>" })';
  const setupGuideLines = formatAutoresearchSetupGuideLines(dashboardCwd);
  const guidedCandidateJourneyLines = formatAutoresearchGuidedCandidateJourneyLines(dashboardCwd);
  const authorityHandoffLines = formatAutoresearchAuthorityHandoffLines(dashboardCwd);
  const matrixSummary = discoverAutoresearchMatrixCampaignArtifacts(dashboardCwd);
  const matrixSummaryLines = formatAutoresearchMatrixCampaignSummaryLines(matrixSummary);
  const dashboardMode = formatAutoresearchDashboardMode(matrixSummary);
  const metricReadiness = buildAutoresearchMetricReadinessReview(status);
  const metricReadinessBlockers =
    metricReadiness.blockedReasons.length > 0 ? metricReadiness.blockedReasons.join("; ") : "none";

  return [
    "# PI-AUTORESEARCH DASHBOARD",
    "",
    "Read-only operator dashboard. It summarizes campaign posture and next legal surfaces without running a benchmark, spawning peers, mutating worktrees, or promoting evidence.",
    "",
    "## Dashboard mode",
    `- mode: ${dashboardMode}`,
    ...(dashboardMode === "matrix_campaign"
      ? [
          "- matrix campaign artifacts are the primary visible-progress source for this cwd.",
          "- local single-segment runtime fields below are auxiliary and may be empty when orchestrator artifacts carry separately identified plans and owner reports, not live campaign truth.",
        ]
      : ["- local runtime receipts are the primary visible-progress source for this cwd."]),
    "",
    ...(dashboardMode === "matrix_campaign"
      ? ["## Matrix campaign progress", ...matrixSummaryLines, ""]
      : []),
    "## Current posture",
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    `- machine state: ${status.runtimeProjection.state}`,
    `- control state: ${status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
    `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
    `- promotion ready: ${status.empiricalPosture.promotionReady ? "yes" : "no"}`,
    `- recommended next: ${status.empiricalPosture.recommendedNextAction}`,
    "",
    `## ${dashboardMode === "matrix_campaign" ? "Local runtime segment snapshot" : "Metric contract"}`,
    `- campaign: ${segment.name ?? "(not configured)"}`,
    `- primary metric: ${metricLine}`,
    `- success threshold: ${formatMetricThresholdValue(segment.metricThreshold, segment.metricUnit)}`,
    `- benchmark command: ${segment.benchmarkCommand ?? "(unset)"}`,
    `- checks command: ${segment.checksCommand ?? "(none)"}`,
    `- runs: ${runLine}`,
    `- baseline: ${formatMetricValue(segment.baselineMetric, segment.metricUnit)}`,
    "- comparison: withheld here; inspect exact measurement identities in /autoresearch export.",
    "- uncertainty: no confidence estimate is inferred from packet counts or lifecycle dispositions.",
    `- timing interpretation: ${formatMetricInterpretation(segment.metricInterpretation, segment.metricUnit)}`,
    "",
    "## Metric readiness / trust",
    `- classification: ${metricReadiness.classification}`,
    `- summary: ${metricReadiness.summary}`,
    `- blockers: ${metricReadinessBlockers}`,
    ...metricReadiness.checklist.map((item) => `- checklist: ${item}`),
    "",
    "## Candidate lifecycle policy",
    `- mode: ${candidatePolicy.mode}`,
    `- keep: ${candidatePolicy.keep}`,
    `- discard: ${candidatePolicy.discard}`,
    `- rewind: ${candidatePolicy.rewind}`,
    `- authority: ${candidatePolicy.authority}`,
    `- worktree role: ${candidatePolicy.worktreeRole}`,
    `- replay-fabric role: ${candidatePolicy.replayFabricRole}`,
    `- ASC rewind role: ${candidatePolicy.ascRewindRole}`,
    "",
    "## Candidate decision",
    candidateDecision,
    "",
    "## Resume plan",
    ...resumePlanLines,
    "",
    "## Resume apply plan-only proposal",
    ...resumeApplyPlanLines,
    "",
    "## Authority handoff",
    ...authorityHandoffLines,
    "",
    "## Learning handoff",
    `- export learning packet: ${learningExportCall}`,
    `- KES adapter plan: ${learningKesAdapterCall}`,
    "- boundary: export is local only; KES/notes/KMS adapters own persistence and promotion.",
    "",
    "## Setup guide",
    ...setupGuideLines,
    "",
    "## Guided candidate journey: bind -> measure -> candidate_result_export",
    ...guidedCandidateJourneyLines,
    "",
    "## Packet inventory before owner review",
    "- /autoresearch export supports measured packet inventory inspection: inventory presence alone is not measurement. Validated measurements, controller reports, and provenance remain separate.",
    "- /autoresearch review is the final owner decision surface after identity and measurement review. export_visibility_blockers=0 or missing=0 is not success or permission.",
    "",
    "## Matrix campaign artifacts",
    ...matrixSummaryLines,
    "",
    "## Next legal surfaces",
    `- start/review: ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, objective: "<bounded objective>", runMode: "plan_only", peerMode: "plan", candidatePolicy: { mode: "worktree", keep: "preserve_branch", discard: "suggest_cleanup", rewind: "reset_worktree_to_base" } })`,
    `- full status: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "status" })`,
    `- resume plan: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "resume_plan" })`,
    `- resume apply plan-only proposal: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "resume_apply_plan" })`,
    ...authorityHandoffLines,
    `- learning export: ${learningExportCall}`,
    `- learning KES adapter plan: ${learningKesAdapterCall}`,
    `- candidate bind: ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, candidateWorktree: ${JSON.stringify(dashboardCwd)}, action: "plan_run" })`,
    `- candidate decision: ${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "status" })`,
    `- control gate: ${AUTORESEARCH_CONTROL_TOOL_NAME}({ cwd: ${JSON.stringify(dashboardCwd)}, action: "status" })`,
    "",
    "## Boundaries",
    "- peers are planned or visibly launched only through explicit peer surfaces.",
    "- worktree cleanup, merge, branch materialization, AK/KES/evidence writes, and durable promotion stay outside this dashboard.",
  ].join("\n");
}

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}
