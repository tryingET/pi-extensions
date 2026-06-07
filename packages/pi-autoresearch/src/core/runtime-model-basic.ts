import type { CampaignMachineResumeState, CampaignMachineStateValue } from "../machine/campaign.ts";
import type { CampaignDecision } from "../machine/events.ts";
import type {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AutoresearchDecisionFailureStage,
  NextHypothesisDecisionStatus,
} from "./decisions.ts";
import type { AutoresearchLedgerReplayIssue } from "./ledger.ts";
import type { LlamacppCampaignProjectionOverallState } from "./llamacppCampaign.ts";

export type MetricDirection = "lower" | "higher";
export type RunStatus = "baseline" | "candidate" | "keep" | "discard" | "crash" | "checks_failed";
export type AutoresearchRunKind = "ordinary" | "calibration";
export type AutoresearchEmpiricalDecisionClass =
  | "not_evaluated"
  | "measurement_invalid"
  | "checks_failed"
  | "baseline"
  | "insufficient_samples"
  | "possible_noise"
  | "calibration_signal"
  | "candidate_improvement"
  | "candidate_regression"
  | "candidate_neutral"
  | "threshold_satisfied"
  | "threshold_preserved"
  | "threshold_regressed"
  | "threshold_not_met"
  | "baseline_drift";
export type MetricMap = Record<string, number>;

export interface AutoresearchRunDecisionSummary {
  kind: "next_hypothesis";
  templateName: typeof AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME;
  status: NextHypothesisDecisionStatus;
  mappedDecision: CampaignDecision;
  blockingReason: string | null;
  failureStage: AutoresearchDecisionFailureStage | null;
  stateRead: string | null;
  nextHypothesis: string | null;
  targetFiles: string[];
  expectedPrimaryEffect: string | null;
  timestamp: number;
}

export type AutoresearchPromptVaultDecisionAvailability =
  | "available_not_yet_used"
  | "available_last_used_successfully"
  | "available_last_used_blocked";

export interface AutoresearchPromptVaultDecisionStatus {
  availability: AutoresearchPromptVaultDecisionAvailability;
  lastPostRunDecision: AutoresearchRunDecisionSummary | null;
}

export type AutoresearchLlamacppCampaignProjectionAvailability =
  | "not_projected"
  | "current"
  | "stale";

export interface AutoresearchLlamacppCampaignProjectionStatus {
  availability: AutoresearchLlamacppCampaignProjectionAvailability;
  projectionPath: string | null;
  manifestPath: string | null;
  campaignId: string | null;
  manifestKey: string | null;
  receiptRootPath: string | null;
  overallState: LlamacppCampaignProjectionOverallState | null;
  staleReason: string | null;
  updatedAt: number | null;
}

export interface AutoresearchConfigReceipt {
  type: "config";
  version: 1;
  name: string;
  metricName: string;
  metricUnit: string;
  direction: MetricDirection;
  metricThreshold?: number;
  createdAt: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}

export type AutoresearchCandidateBindingSource = "candidate_peer_spawn" | "manual";

export interface AutoresearchCandidateBinding {
  source: AutoresearchCandidateBindingSource | null;
  worktreePath: string | null;
  branch: string | null;
  baseRef: string | null;
  diffSummary: string | null;
  filesChanged: string[];
}

export interface AutoresearchCandidateBindingInput {
  source?: AutoresearchCandidateBindingSource | null;
  worktreePath?: string | null;
  branch?: string | null;
  baseRef?: string | null;
  diffSummary?: string | null;
  filesChanged?: readonly string[];
}

export interface AutoresearchExperimentLineage {
  hypothesisId: string | null;
  hypothesis: string | null;
  interventionSummary: string | null;
  expectedPrimaryEffect: string | null;
  targetFiles: string[];
  risk: string | null;
  candidate?: AutoresearchCandidateBinding;
}

export interface AutoresearchExperimentLineageInput {
  hypothesisId?: string | null;
  hypothesis?: string | null;
  interventionSummary?: string | null;
  expectedPrimaryEffect?: string | null;
  targetFiles?: readonly string[];
  risk?: string | null;
  candidate?: AutoresearchCandidateBindingInput | null;
}

export interface AutoresearchRunReceipt {
  type: "run";
  version: 1;
  status: RunStatus;
  runKind?: AutoresearchRunKind;
  experiment?: AutoresearchExperimentLineage;
  empiricalDecisionClass?: AutoresearchEmpiricalDecisionClass;
  metric: number;
  metrics: MetricMap;
  description: string;
  timestamp: number;
  commit?: string;
  iteration?: number;
  confidence?: number | null;
  durationSeconds?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  checksPassed?: boolean | null;
  checksDurationSeconds?: number | null;
  decision?: AutoresearchRunDecisionSummary | null;
}

export type AutoresearchReceipt = AutoresearchConfigReceipt | AutoresearchRunReceipt;

export type AutoresearchMetricInterpretationVerdict =
  | "not_applicable"
  | "insufficient_samples"
  | "possible_noise"
  | "calibration_signal"
  | "baseline_drift"
  | "meaningful_improvement"
  | "regression";

export interface AutoresearchMetricInterpretation {
  verdict: AutoresearchMetricInterpretationVerdict;
  sampleCount: number;
  baselineMetric: number;
  bestMetric: number;
  latestMetric: number;
  minMetric: number;
  medianMetric: number;
  maxMetric: number;
  noiseBand: number;
  bestDelta: number;
  latestDelta: number;
  bestDeltaPercent: number;
  latestDeltaPercent: number;
  reason: string;
}

export type AutoresearchEmpiricalPostureClassification =
  | "unconfigured"
  | "no_runs"
  | "baseline_only"
  | "calibration_only"
  | "under_sampled"
  | "baseline_drift_suspected"
  | "candidate_review_ready"
  | "candidate_regression"
  | "candidate_neutral"
  | "threshold_satisfied"
  | "threshold_preserved"
  | "threshold_regressed"
  | "threshold_not_met"
  | "checks_failed"
  | "measurement_invalid"
  | "inconclusive";

export interface AutoresearchEmpiricalPosture {
  classification: AutoresearchEmpiricalPostureClassification;
  summary: string;
  promotionReady: boolean;
  recommendedNextAction: string;
}

export interface AutoresearchSegmentSummary {
  configured: boolean;
  name: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  metricThreshold: number | null;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  confidence: number | null;
  metricInterpretation: AutoresearchMetricInterpretation | null;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  lastRunStatus: RunStatus | null;
  lastRunKind: AutoresearchRunKind | null;
  lastRunMetric: number | null;
}

export interface AutoresearchRuntimeProjection {
  state: CampaignMachineStateValue;
  resumeState: CampaignMachineResumeState | null;
  blockedReason: string | null;
  completionReason: string | null;
  source: "ledger" | "receipt_fallback";
  ledgerPath?: string;
  hasLedger: boolean;
  invalidLedgerLines: number;
  eventCount: number;
  replayedEventCount: number;
  rejectedEvents: readonly AutoresearchLedgerReplayIssue[];
  syncIssues: readonly string[];
}

export interface AutoresearchSegmentCloseoutRun {
  iteration: number | null;
  status: RunStatus;
  runKind: AutoresearchRunKind;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  metric: number;
  description: string;
  timestamp: number;
  checks: string;
  experiment: AutoresearchExperimentLineage | null;
}
