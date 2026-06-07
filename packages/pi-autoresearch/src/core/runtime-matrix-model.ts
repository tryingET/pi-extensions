import type { MetricDirection } from "./runtime.ts";

export type { MetricDirection } from "./runtime.ts";

export type AutoresearchMatrixCampaignArtifactKind =
  | "autoresearch.matrix_campaign_plan.v1"
  | "autoresearch.matrix_campaign_runner_contract.v1"
  | "autoresearch.matrix_campaign_runner_checkpoint.v1"
  | "autoresearch.matrix_campaign_review.v1"
  | "autoresearch.matrix_campaign_cockpit.v1"
  | "autoresearch.matrix_campaign_operator_followup.v1";

export interface AutoresearchMatrixCampaignArtifactReference {
  kind: AutoresearchMatrixCampaignArtifactKind;
  path: string;
  source: string;
}

export interface AutoresearchMatrixCampaignCellSummary {
  cellId: string;
  scenario: string | null;
  hypothesis: string | null;
  posture: string;
  laneProgress: string;
  selectedLaneId: string | null;
  selectedPacketPath: string | null;
  candidatePacketDirectory: string | null;
  packetInventory: string[];
  nextLegalAction: string;
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
  campaignCount: number;
  cellCount: number;
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
  chart: AutoresearchMatrixCampaignDashboardChart;
  nextLegalActions: string[];
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
