import type { MetricDirection } from "./runtime-model.ts";

export type { MetricDirection } from "./runtime-model.ts";

export type AutoresearchMatrixCampaignArtifactKind =
  | "autoresearch.matrix_campaign_plan.v1"
  | "autoresearch.matrix_campaign_runner_contract.v1"
  | "autoresearch.matrix_campaign_runner_checkpoint.v1"
  | "autoresearch.matrix_campaign_review.v1"
  | "autoresearch.matrix_campaign_cockpit.v1"
  | "autoresearch.matrix_campaign_operator_followup.v1"
  | "autoresearch.level4_dashboard_observation.v1";

export interface AutoresearchMatrixCampaignArtifactReference {
  kind: AutoresearchMatrixCampaignArtifactKind;
  path: string;
  source: string;
}
export type AutoresearchMatrixCellStage =
  | "planned_not_launched"
  | "awaiting_controller_launch"
  | "awaiting_controller_measurement"
  | "measured_awaiting_owner_review"
  | "owner_review_ready";
export type AutoresearchDashboardOutcomeClass =
  | "improvement"
  | "regression"
  | "correctness_failure"
  | "resource_censored"
  | "inconclusive"
  | "measurement_invalid"
  | "baseline_reference"
  | "threshold_preserved"
  | "threshold_satisfied"
  | "not_evaluated"
  | "progress_count"
  | "unclassified";

export function classifyAutoresearchMatrixCellStage(input: {
  posture: string;
  measuredPacketCount: number;
}): { stage: AutoresearchMatrixCellStage; note: string } {
  if (input.measuredPacketCount > 0)
    return {
      stage: "measured_awaiting_owner_review",
      note: "Valid local measurements; owner review and provenance remain separate.",
    };
  if (input.posture === "measurement_export_unlocked")
    return {
      stage: "awaiting_controller_measurement",
      note: "Controller checkpoint assertion; measurement is not established.",
    };
  if (["locked_until_checkpoint", "managed_candidate_wave_required"].includes(input.posture))
    return {
      stage: "awaiting_controller_launch",
      note: "Prepared only; launch unverified. The controller must verify actual owner execution.",
    };
  return {
    stage: "planned_not_launched",
    note: "No validated measurement or actual launch evidence in this projection.",
  };
}

/** Exact structured classes only. A keep/discard disposition is never an empirical verdict. */
export function classifyAutoresearchDashboardOutcomeClass(input: {
  decision: string | null | undefined;
  status: string | null | undefined;
  source?: AutoresearchDashboardChartPoint["source"] | null;
}): AutoresearchDashboardOutcomeClass {
  const d = input.decision ?? "";
  const s = input.status ?? "";
  if (s === "checks_failed" || d === "checks_failed") return "correctness_failure";
  if (s === "crash" || d === "measurement_invalid") return "measurement_invalid";
  if (d === "resource_censored" || s === "resource_censored") return "resource_censored";
  if (input.source === "matrix_progress") return "progress_count";
  if (["candidate_regression", "threshold_regressed"].includes(d)) return "regression";
  if (d === "candidate_improvement") return "improvement";
  if (d === "threshold_preserved" || d === "threshold_satisfied") return d;
  if (
    [
      "possible_noise",
      "insufficient_samples",
      "candidate_neutral",
      "calibration_signal",
      "baseline_drift",
      "threshold_not_met",
      "inconclusive",
    ].includes(d)
  )
    return "inconclusive";
  if (d === "baseline" || s === "baseline") return "baseline_reference";
  if (!d || d === "not_evaluated") return "not_evaluated";
  return "unclassified";
}

export interface DashboardMeasurementIdentity {
  metricName: string | null;
  metricUnit: string | null;
  direction: MetricDirection | null;
  scenario: string | null;
  subject: string | null;
  base: string | null;
  evaluator: string | null;
}
export interface DashboardAttempt {
  id: string;
  sources: string[];
  timestamp: number | null;
  iteration: number | null;
  description: string;
  hypothesis: string | null;
  prediction: string | null;
  disposition: string;
  decision: string | null;
  outcome: AutoresearchDashboardOutcomeClass;
  metric: number | null;
  checks: string | null;
  schemaValid: boolean;
  lineageValid: boolean;
  packetBinding: "matched" | "quarantined" | "not_required";
  validMeasurement: boolean;
  verificationReport: string;
  provenance: "local_unauthenticated_projection";
  identity: DashboardMeasurementIdentity;
  comparisonKey: string | null;
  comparisonWithheld: string[];
  issues: string[];
  raw: unknown;
}
export interface DashboardLane {
  laneId: string;
  segmentIdentity: {
    name: string;
    hypothesisId: string;
    hypothesis: string | null;
    source: string;
    observedSegmentLabels: string[];
  } | null;
  objective: string | null;
  promptTitle: string | null;
  promptMarkdown: string | null;
  expectedPacketPaths: string[];
  historyPacketPaths: string[];
  reportedState: string;
  verificationReport: string;
  attempts: DashboardAttempt[];
  missingMeasurementPaths: string[];
}
export interface AutoresearchMatrixCampaignCellSummary {
  campaignKey: string;
  cellId: string;
  scenario: string | null;
  hypothesis: string | null;
  prediction: string | null;
  rejectionCriteria: string | null;
  objective: string | null;
  sources: string[];
  lanes: DashboardLane[];
  issues: string[];
  posture: string;
  stage: AutoresearchMatrixCellStage;
  stageNote: string;
  /** Controller assertion, never inventory coverage. */
  laneProgress: string;
  selectedLaneId: string | null;
  selectedPacketPath: string | null;
  candidatePacketDirectory: string | null;
  packetInventory: string[];
  measuredPacketCount: number;
  /** Compatibility fields deliberately null: no newest-mtime winner. */
  latestOutcomeClass: AutoresearchDashboardOutcomeClass | null;
  latestOutcomeLabel: string | null;
  latestMetric: number | null;
  nextLegalAction: string;
}
export interface DashboardCampaign {
  key: string;
  taskId: number | null;
  cwd: string;
  objective: string | null;
  identityResolved: boolean;
  declaredLevel: "Level 1/2 artifacts" | "Level 4 observation" | "unresolved";
  execution: "unverified" | "not_executed_by_orchestrator";
  observedAt: string | null;
  sourcePaths: string[];
  reportedPosture: string | null;
  controllerCompletedActionCount: number | null;
  controllerCompletedCellCount: number;
  nextActor: string;
  nextAction: string;
  cells: AutoresearchMatrixCampaignCellSummary[];
  issues: string[];
  ownerReports: unknown[];
}
export interface DashboardComparisonGroup {
  key: string;
  campaignKey: string;
  identity: DashboardMeasurementIdentity;
  attempts: DashboardAttempt[];
}
export interface AutoresearchDashboardChartPoint {
  iteration: number | null;
  label: string;
  status: string;
  runKind: string;
  decision: string;
  metric: number;
  description: string;
  source: "runtime_receipt" | "matrix_closeout" | "matrix_candidate_result" | "matrix_progress";
}
export interface AutoresearchMatrixCampaignDashboardChart {
  kind: "autoresearch.matrix_campaign_dashboard_chart.v1";
  mode: "metric" | "cell_progress" | "empty";
  metricName: string;
  metricUnit: string;
  direction: MetricDirection;
  sourceDescription: string;
  emptyMessage: string;
  points: AutoresearchDashboardChartPoint[];
}
export interface AutoresearchOpenCandidateReviewPosture {
  kind: "autoresearch.open_candidate_review_posture.v1";
  status: "owner_review_required" | "no_open_candidate_review";
  openCellCount: number;
  selectedReviewCellCount: number;
  unselectedMeasuredCellCount: number;
  packetInventoryItemCount: number;
  uniqueExportedPacketCount: number;
  summary: string;
  nextLegalAction: string;
  boundary: string;
}
export interface AutoresearchMatrixCampaignArtifactSummary {
  kind: "autoresearch.matrix_campaign_artifact_summary.v1";
  cwd: string;
  artifactRoots: string[];
  artifacts: AutoresearchMatrixCampaignArtifactReference[];
  campaigns: DashboardCampaign[];
  comparisonGroups: DashboardComparisonGroup[];
  unresolvedPackets: DashboardAttempt[];
  campaignCount: number;
  cellCount: number;
  /** Controller-reported counts, not observed effects. */
  completedCellCount: number;
  selectedCellCount: number;
  candidateLaneCount: number;
  exportedPacketCount: number;
  openCandidateReview: AutoresearchOpenCandidateReviewPosture;
  metricName: string | null;
  metricDirection: MetricDirection | null;
  metricTarget: number | null;
  latestArtifactPath: string | null;
  cells: AutoresearchMatrixCampaignCellSummary[];
  /** Deprecated aggregate chart: always empty. Consume comparisonGroups instead. */
  chart: AutoresearchMatrixCampaignDashboardChart;
  nextLegalActions: string[];
  observedMeasurementCount: number;
  coverageGapLaneCount: number;
  exportVisibilityBlockers: {
    name: "export_visibility_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    blockers: string[];
  };
  boundary: string;
}
