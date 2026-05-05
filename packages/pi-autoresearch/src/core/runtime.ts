import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CampaignMachineInput,
  CampaignMachineResumeState,
  CampaignMachineStateValue,
} from "../machine/campaign.ts";
import {
  canCampaignMachineStartBoundedRun,
  isCampaignMachineAwaitingOperatorChoice,
  isCampaignMachineTerminalState,
} from "../machine/campaign.ts";
import {
  type CampaignDecision,
  type CampaignSegmentConfig,
  campaignEvents,
  isCampaignDecision,
} from "../machine/events.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionFailureStage,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionOutcome,
  type FinalizeDecisionPacket,
  mapNextHypothesisOutcomeToCampaignDecision,
  type NextHypothesisDecisionOutcome,
  type NextHypothesisDecisionPacket,
  type NextHypothesisDecisionStatus,
  type SetupDecisionOutcome,
  type SetupDecisionPacket,
} from "./decisions.ts";
import {
  AUTORESEARCH_EVENT_LEDGER_FILE,
  type AutoresearchLedgerEventEntry,
  type AutoresearchLedgerReplayIssue,
  appendLedgerEvent,
  createLedgerEventEntry,
  loadAutoresearchLedger,
  projectAutoresearchLedger,
  projectAutoresearchLedgerEntries,
  resolveAutoresearchLedgerPath,
} from "./ledger.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  type LlamacppCampaignProjectionOverallState,
  loadLlamacppCampaignProjectionState,
} from "./llamacppCampaign.ts";
import {
  AUTORESEARCH_OPERATOR_ACTIONS,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  type AutoresearchControlStateV1,
  type AutoresearchOperatorAction,
  type AutoresearchRuntimeSnapshotInput,
  type AutoresearchRuntimeSnapshotStatus,
  deriveAutoresearchControlState,
  formatAutoresearchRuntimeSnapshotReuse,
  loadAutoresearchRuntimeControlState,
  persistAutoresearchRuntimeSnapshot,
} from "./resume.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "./selfHosting.ts";

export const AUTORESEARCH_COMMAND_NAME = "autoresearch";
export const AUTORESEARCH_STATUS_TOOL_NAME = "autoresearch_runtime_status";
export const AUTORESEARCH_RUN_TOOL_NAME = "autoresearch_runtime_run";
export const AUTORESEARCH_CONTROL_TOOL_NAME = "autoresearch_runtime_control";
export const AUTORESEARCH_FINALIZE_TOOL_NAME = "autoresearch_runtime_finalize";
export const AUTORESEARCH_PEER_ASSIST_TOOL_NAME = "autoresearch_runtime_peer_assist";
export const AUTORESEARCH_LOOP_TOOL_NAME = "autoresearch_runtime_loop";
export const AUTORESEARCH_RESUME_APPLY_TOOL_NAME = "autoresearch_runtime_resume_apply";
export const AUTORESEARCH_AUTOPLAN_TOOL_NAME = "autoresearch_runtime_autoplan";
export const AUTORESEARCH_SETUP_TOOL_NAME = "autoresearch_runtime_setup";
export const AUTORESEARCH_CAMPAIGN_START_TOOL_NAME = "autoresearch_campaign_start";
export const AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME = "autoresearch_candidate_bind";
export const AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME = "autoresearch_candidate_decision";
export const AUTORESEARCH_PHASE = "bounded_runtime_kernel" as const;

export const AUTORESEARCH_LOCAL_ARTIFACTS = [
  "autoresearch.jsonl",
  AUTORESEARCH_EVENT_LEDGER_FILE,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  "autoresearch.finalization.json",
  AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE,
  "autoresearch.md",
  "autoresearch.sh",
  "autoresearch.checks.sh",
  "autoresearch.ideas.md",
] as const;

export const AUTORESEARCH_DASHBOARD_EXPORT_FILE = ".autoresearch/autoresearch-dashboard.html";

export const READY_PROMPT_VAULT_TEMPLATES = [
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
] as const;

export const BLOCKED_PROMPT_VAULT_TEMPLATES = ["pi-autoresearch-state-router"] as const;

const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;
const OUTPUT_TAIL_MAX_LINES = 20;
const OUTPUT_TAIL_MAX_BYTES = 4 * 1024;
const COMMAND_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
const DENIED_METRIC_NAMES = new Set(["__proto__", "constructor", "prototype"]);

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

export interface AutoresearchAkEvidencePacket {
  packetKind: "autoresearch.ak_evidence.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  taskId: number;
  checkType: "autoresearch:segment_closeout";
  result: string;
  closeout: AutoresearchSegmentCloseout;
  suggestedToolCall: string;
  adapterBoundary: string;
  evidenceBoundary: string;
}

export interface AutoresearchKnowledgeExportPacket {
  packetKind: "autoresearch.learning.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  suggestedPath: string;
  title: string;
  markdown: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}

export interface AutoresearchCandidateResultPacket {
  packetKind: "autoresearch.candidate_result.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  cwd: string;
  campaign: string | null;
  candidate: AutoresearchCandidateBinding | null;
  candidateRun: AutoresearchSegmentCloseoutRun | null;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  recommendedAction: string;
  resultSummary: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}

export interface AutoresearchAdapterContractEntry {
  packetKind: string;
  adapterContractVersion: number;
  producerAction: string;
  targetKinds: string[];
  requiredFields: string[];
  optionalFields: string[];
  summary: string;
  boundary: string;
}

export interface AutoresearchAdapterContractCatalog {
  packetKind: "autoresearch.adapter_contracts.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  entries: AutoresearchAdapterContractEntry[];
  adapterBoundary: string;
}

export interface AutoresearchAdapterPacketValidationIssue {
  path: string;
  message: string;
}

export interface AutoresearchAdapterPacketValidationResult {
  packetKind: "autoresearch.adapter_validation.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  valid: boolean;
  validatedPacketKind: string | null;
  validatedVersion: number | null;
  issues: AutoresearchAdapterPacketValidationIssue[];
  adapterBoundary: string;
}

export interface AutoresearchSegmentCloseout {
  packetKind: "autoresearch.closeout.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  cwd: string;
  receiptPath: string;
  status: AutoresearchRuntimeStatus;
  campaign: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  timingInterpretation: AutoresearchMetricInterpretation | null;
  empiricalPosture: AutoresearchEmpiricalPosture;
  runs: AutoresearchSegmentCloseoutRun[];
  candidateBindings: AutoresearchCandidateBinding[];
  recommendedAction: string;
  adapterBoundary: string;
  evidenceBoundary: string;
}

export interface AutoresearchDashboardExportResult {
  cwd: string;
  path: string;
  fileUrl: string;
  refreshedAt: number;
  status: AutoresearchRuntimeStatus;
}

export interface AutoresearchResumePlan {
  packetKind: "autoresearch.resume_plan.v1";
  cwd: string;
  campaign: string | null;
  segmentKey: string | null;
  runtimeKey: string | null;
  snapshotReuse: string;
  reusable: boolean;
  machineState: string;
  controlState: string;
  allowedControlActions: string[];
  lastStopReason: string;
  remainingBudget: "operator_required";
  wouldRun: string | null;
  blockingReasons: string[];
  authorityWarnings: string[];
}

export interface AutoresearchResumeApplyPlan {
  packetKind: "autoresearch.resume_apply_plan.v1";
  cwd: string;
  action: "plan_only";
  planReady: boolean;
  executionAuthorized: false;
  executorAvailable: boolean;
  resumePlan: AutoresearchResumePlan;
  requiredOperatorInputs: string[];
  preflightChecks: string[];
  futureExecutorContract: string;
  futureForegroundCall: string | null;
  blockedReasons: string[];
  authorityWarnings: string[];
}

export interface ExecuteAutoresearchResumeApplyInput {
  cwd: string;
  segmentKey: string;
  runtimeKey: string;
  maxIterations: number;
  maxWallClockMinutes: number;
  operatorConfirmation: string;
  description?: string;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchResumeApplyResult {
  cwd: string;
  action: "resume_apply";
  executionAuthorized: true;
  applyPlan: AutoresearchResumeApplyPlan;
  loopResult: ExecuteAutoresearchLoopResult;
  authorityWarnings: string[];
}

export interface AutoresearchRuntimeStatus {
  phase: typeof AUTORESEARCH_PHASE;
  cwd?: string;
  commandName: typeof AUTORESEARCH_COMMAND_NAME;
  toolNames: readonly string[];
  localArtifacts: readonly string[];
  receiptEntryTypes: readonly ["config", "run"];
  readyPromptVaultTemplates: readonly string[];
  blockedPromptVaultTemplates: readonly string[];
  receiptPath?: string;
  hasReceiptLog: boolean;
  hasBenchmarkScript: boolean;
  hasChecksScript: boolean;
  invalidReceiptLines: number;
  currentSegment: AutoresearchSegmentSummary;
  empiricalPosture: AutoresearchEmpiricalPosture;
  runtimeProjection: AutoresearchRuntimeProjection;
  runtimeSnapshot: AutoresearchRuntimeSnapshotStatus;
  control: AutoresearchControlStateV1;
  promptVaultDecisions: AutoresearchPromptVaultDecisionStatus;
  llamacppCampaignProjection: AutoresearchLlamacppCampaignProjectionStatus;
  nextSlices: readonly string[];
}

export interface CommandExecutionSummary {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationSeconds: number;
  stdout: string;
  stderr: string;
  outputTail: string;
}

export interface ExecuteAutoresearchRunLiveDecisionInput {
  runtime: AutoresearchDecisionRuntime;
  goal: string;
  constraints?: readonly string[];
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  ideasBacklog?: readonly string[];
  asiNotes?: readonly string[];
  deadEndMemory?: readonly string[];
  currentCompany?: string;
  model?: string;
}

export interface ExecuteAutoresearchRunInput {
  cwd: string;
  description: string;
  runKind?: AutoresearchRunKind;
  experiment?: AutoresearchExperimentLineageInput;
  name?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  reconfigure?: boolean;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  liveDecision?: ExecuteAutoresearchRunLiveDecisionInput;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchRunResult {
  cwd: string;
  receiptPath: string;
  createdConfig: boolean;
  configReceipt: AutoresearchConfigReceipt;
  runReceipt: AutoresearchRunReceipt;
  benchmark: CommandExecutionSummary;
  checks: CommandExecutionSummary | null;
  parsedMetrics: MetricMap;
  primaryMetricName: string;
  primaryMetric: number;
  decisionSummary: AutoresearchRunDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}

export type AutoresearchAutoplanPlanner = "heuristic" | "dspx_program";
export type AutoresearchSetupAction = "plan" | "apply" | "baseline";
export type AutoresearchCampaignStartSetupMode = "autoplan" | "prompt_vault_setup";
export type AutoresearchCampaignStartRunMode = "plan_only" | "baseline" | "bounded_loop";
export type AutoresearchCandidateLifecycleMode = "worktree";
export type AutoresearchCandidateKeepAction = "preserve_branch" | "plan_review_branch";
export type AutoresearchCandidateDiscardAction =
  | "suggest_cleanup"
  | "delete_worktree_after_confirm";
export type AutoresearchCandidateRewindAction =
  | "reset_worktree_to_base"
  | "recreate_worktree_from_base";

export interface AutoresearchCandidateLifecyclePolicyInput {
  mode?: AutoresearchCandidateLifecycleMode;
  keep?: AutoresearchCandidateKeepAction;
  discard?: AutoresearchCandidateDiscardAction;
  rewind?: AutoresearchCandidateRewindAction;
}

export interface AutoresearchCandidateLifecyclePolicy {
  mode: AutoresearchCandidateLifecycleMode;
  keep: AutoresearchCandidateKeepAction;
  discard: AutoresearchCandidateDiscardAction;
  rewind: AutoresearchCandidateRewindAction;
  authority: "policy_only_no_mutation";
  worktreeRole: string;
  replayFabricRole: string;
  ascRewindRole: string;
}

export const DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY: AutoresearchCandidateLifecyclePolicy =
  {
    mode: "worktree",
    keep: "preserve_branch",
    discard: "suggest_cleanup",
    rewind: "reset_worktree_to_base",
    authority: "policy_only_no_mutation",
    worktreeRole: "primary candidate accept/keep/discard/rewind primitive",
    replayFabricRole: "observer/history/recovery-clue projection only; not the executor",
    ascRewindRole: "live Pi/session recovery only; not candidate accept/discard authority",
  };

export type AutoresearchCandidateDecisionAction =
  | "status"
  | "plan_keep"
  | "plan_discard"
  | "plan_rewind";
export type AutoresearchCandidateLifecycleDecision =
  | "keep"
  | "discard"
  | "rewind"
  | "rebaseline"
  | "collect_more_samples"
  | "finalize"
  | "no_candidate_bound_yet";

export interface BuildAutoresearchCandidateDecisionInput {
  cwd: string;
  action?: AutoresearchCandidateDecisionAction;
  candidatePolicy?: AutoresearchCandidateLifecyclePolicyInput;
}

export interface AutoresearchCandidateDecisionSummary {
  source: AutoresearchCandidateBindingSource | null;
  worktreePath: string | null;
  branch: string | null;
  baseRef: string | null;
  diffSummary: string | null;
  filesChanged: string[];
  label: string;
}

export interface AutoresearchCandidateDecisionConfirmation {
  required: boolean;
  riskLevel: "none" | "review_gate" | "destructive_external";
  exactConfirmationPhrase: string;
  checklist: string[];
  blockedReasons: string[];
  nextHumanAction: string;
}

export interface AutoresearchCandidateDecisionWorkbench {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  candidate: AutoresearchCandidateDecisionSummary | null;
  empirical: {
    classification: AutoresearchEmpiricalPostureClassification;
    empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
    promotionReady: boolean;
    confidence: number | null;
    confidenceNoiseInterpretation: string;
    checksStatus: string;
    baselineDriftRisk: string;
  };
  recommendedDecision: AutoresearchCandidateLifecycleDecision;
  recommendationReason: string;
  confirmation: AutoresearchCandidateDecisionConfirmation;
  exactNextCalls: string[];
  plannedCommands: string[];
  boundaryWarnings: string[];
  status: AutoresearchRuntimeStatus;
  candidateResult: AutoresearchCandidateResultPacket;
}

export type AutoresearchCandidateBindAction = "status" | "plan_run";
export type AutoresearchCandidateBindReadiness = "ready" | "needs_review" | "blocked";

export interface BuildAutoresearchCandidateBindInput {
  cwd: string;
  action?: AutoresearchCandidateBindAction;
  candidateWorktree?: string | null;
  candidateSource?: AutoresearchCandidateBindingSource;
  candidateBranch?: string | null;
  candidateBaseRef?: string | null;
  description?: string | null;
}

export interface AutoresearchCandidateBindInspection {
  candidateWorktree: string;
  exists: boolean;
  isGitWorktree: boolean;
  sameRepository: boolean | null;
  repositoryRoot: string | null;
  branch: string | null;
  head: string | null;
  baseRef: string | null;
  baseRefSource: string | null;
  baseResolved: boolean;
  statusShort: string[];
  filesChanged: string[];
  diffSummary: string;
  readiness: AutoresearchCandidateBindReadiness;
  readinessReasons: string[];
  warnings: string[];
}

export interface AutoresearchCandidateBindPlan {
  cwd: string;
  action: AutoresearchCandidateBindAction;
  candidateSource: AutoresearchCandidateBindingSource;
  description: string;
  inspection: AutoresearchCandidateBindInspection;
  exactNextCalls: string[];
  plannedCommands: string[];
  boundaryWarnings: string[];
  status: AutoresearchRuntimeStatus;
}

export interface AutoresearchSetupConfigInput {
  name: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}

export interface BuildAutoresearchAutoplanInput {
  cwd: string;
  objective: string;
  planner?: AutoresearchAutoplanPlanner;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  benchmarkCommand?: string;
  checksCommand?: string | null;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  metricThreshold?: number;
  materializeDspxIntent?: boolean;
  dspxIntentPath?: string;
  dspxOutdir?: string;
  dspxBehaviorPath?: string;
}

export interface AutoresearchDspxAdvisoryProposal {
  campaignName: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  metricThreshold: number | null;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  risks: string | null;
  nextAction: string | null;
}

export interface AutoresearchMeasurementContract {
  metricName: string;
  generatedBy: string;
  freshness: "run_generated" | "static_existing_artifact";
  causalLink:
    | "benchmark_command_declares_metric"
    | "wraps_current_benchmark_command"
    | "reads_prior_advisory_artifact";
  optimizationAuthority: "baseline_allowed" | "advisory_only";
  reason: string;
}

export interface AutoresearchBenchmarkScriptProposal {
  benchmarkCommand: "bash autoresearch.sh";
  benchmarkScript: string;
  allowOverwriteScripts: false;
  reason: string;
  source: "duration_wrapper" | "dspx_behavior_score";
  measurementContract: AutoresearchMeasurementContract;
}

export interface AutoresearchDspxAdvisory {
  authority: "evidence_only_non_authoritative";
  behaviorPath: string;
  available: boolean;
  status: string | null;
  total: number;
  passed: number;
  failed: number;
  error: number;
  matchedObjective: boolean;
  selectedExampleIndex: number | null;
  proposal: AutoresearchDspxAdvisoryProposal | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
  warnings: string[];
  nextToolCall: string | null;
}

export interface AutoresearchDspxProgramGenPlan {
  enabled: boolean;
  intentPath: string;
  outdir: string;
  command: string;
  materialized: boolean;
  note: string;
}

export interface AutoresearchAutoplanResult {
  cwd: string;
  objective: string;
  planner: AutoresearchAutoplanPlanner;
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  benchmarkScriptPresent: boolean;
  checksScriptPresent: boolean;
  measurementContract: AutoresearchMeasurementContract | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
  packageScripts: Record<string, string>;
  justRecipes: string[];
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  confidence: number;
  risks: string[];
  nextToolCall: string;
  dspxProgramGen: AutoresearchDspxProgramGenPlan | null;
  dspxAdvisory: AutoresearchDspxAdvisory | null;
  status: AutoresearchRuntimeStatus;
}

export interface ExecuteAutoresearchSetupInput extends AutoresearchSetupConfigInput {
  cwd: string;
  action?: AutoresearchSetupAction;
  reconfigure?: boolean;
  description?: string;
  benchmarkScript?: string;
  checksScript?: string | null;
  allowOverwriteScripts?: boolean;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchSetupResult {
  cwd: string;
  action: AutoresearchSetupAction;
  plannedConfig: AutoresearchConfigReceipt;
  appliedConfig: boolean;
  wroteBenchmarkScript: boolean;
  wroteChecksScript: boolean;
  run: ExecuteAutoresearchRunResult | null;
  status: AutoresearchRuntimeStatus;
  nextToolCall: string;
}

export interface ExecuteAutoresearchCampaignStartInput extends BuildAutoresearchAutoplanInput {
  setupMode?: AutoresearchCampaignStartSetupMode;
  runMode?: AutoresearchCampaignStartRunMode;
  maxIterations?: number;
  maxWallClockMinutes?: number;
  description?: string;
  allowOverwriteScripts?: boolean;
  reconfigure?: boolean;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  decisionRuntime?: AutoresearchDecisionRuntime;
  decisionGoal?: string;
  decisionConstraints?: readonly string[];
  decisionFilesInScope?: readonly string[];
  decisionOffLimits?: readonly string[];
  decisionIdeasBacklog?: readonly string[];
  decisionAsiNotes?: readonly string[];
  decisionDeadEndMemory?: readonly string[];
  model?: string;
  stopOn?: readonly (RunStatus | "blocked" | "rebaseline" | "finalize")[];
  peerMode?: AutoresearchLoopPeerMode;
  candidatePolicy?: AutoresearchCandidateLifecyclePolicyInput;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchCampaignStartResult {
  cwd: string;
  objective: string;
  setupMode: AutoresearchCampaignStartSetupMode;
  runMode: AutoresearchCampaignStartRunMode;
  maxIterations: number;
  autoplan: AutoresearchAutoplanResult;
  setupDecision: ExecuteAutoresearchSetupDecisionResult | null;
  setupResult: ExecuteAutoresearchSetupResult | null;
  loopResult: ExecuteAutoresearchLoopResult | null;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  status: AutoresearchRuntimeStatus;
  nextToolCall: string;
  warnings: string[];
}
export type AutoresearchPeerAssistLane = "none" | "scout" | "candidate" | "fork";
export type AutoresearchPeerAssistReportBack = "intercom" | "manual" | "none";
export type AutoresearchLoopPeerMode =
  | "off"
  | "plan"
  | "launch_scout"
  | "launch_candidate"
  | "launch_fork";
export type AutoresearchLoopProgressPhase =
  | "loop_start"
  | "iteration_start"
  | "iteration_complete"
  | "loop_stop"
  | "loop_complete";

export interface BuildAutoresearchPeerAssistInput {
  cwd: string;
  lane?: AutoresearchPeerAssistLane | "auto";
  objective?: string;
  targetFiles?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  reportBack?: AutoresearchPeerAssistReportBack;
  parentPeerTarget?: string;
}

export interface AutoresearchPeerAssistPlan {
  cwd: string;
  lane: AutoresearchPeerAssistLane;
  reason: string;
  objective: string;
  toolName: string | null;
  toolCall: string | null;
  reportBack: AutoresearchPeerAssistReportBack;
  parentPeerTargetRequired: boolean;
  status: AutoresearchRuntimeStatus;
  evidenceWarning: string;
}

export interface AutoresearchLoopPeerHandoff {
  mode: AutoresearchLoopPeerMode;
  requested: boolean;
  status: "not_requested" | "handoff_required" | "unavailable";
  toolName: string | null;
  toolCall: string | null;
  note: string;
}

export interface AutoresearchLoopProgressEvent {
  phase: AutoresearchLoopProgressPhase;
  cwd: string;
  goal: string;
  iteration: number | null;
  maxIterations: number;
  elapsedSeconds: number;
  stopReason?: string;
  runStatus?: RunStatus;
  primaryMetricName?: string;
  primaryMetric?: number;
  bestMetric?: number | null;
  nextHypothesis?: string | null;
  peerLane?: AutoresearchPeerAssistLane;
  message: string;
}

export interface ExecuteAutoresearchLoopInput {
  cwd: string;
  goal: string;
  maxIterations: number;
  maxWallClockMinutes?: number;
  description?: string;
  name?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  reconfigure?: boolean;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  decisionGoal?: string;
  decisionRuntime?: AutoresearchDecisionRuntime;
  decisionConstraints?: readonly string[];
  decisionFilesInScope?: readonly string[];
  decisionOffLimits?: readonly string[];
  decisionIdeasBacklog?: readonly string[];
  decisionAsiNotes?: readonly string[];
  decisionDeadEndMemory?: readonly string[];
  model?: string;
  stopOn?: readonly (RunStatus | "blocked" | "rebaseline" | "finalize")[];
  peerMode?: AutoresearchLoopPeerMode;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchLoopResult {
  cwd: string;
  goal: string;
  requestedIterations: number;
  completedIterations: number;
  stopReason: string;
  elapsedSeconds: number;
  runs: ExecuteAutoresearchRunResult[];
  peerMode: AutoresearchLoopPeerMode;
  peerAssist: AutoresearchPeerAssistPlan;
  peerLaunchHandoff: AutoresearchLoopPeerHandoff;
  status: AutoresearchRuntimeStatus;
}

export interface InspectAutoresearchRuntimeControlResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface SetAutoresearchRuntimeControlInput {
  cwd: string;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt?: number;
}

export interface SetAutoresearchRuntimeControlResult {
  cwd: string;
  decision: AutoresearchOperatorAction;
  previousControl: AutoresearchControlStateV1;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface ExecuteAutoresearchSetupDecisionInput {
  cwd: string;
  packet: SetupDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchSetupDecisionResult {
  cwd: string;
  outcome: SetupDecisionOutcome;
  status: AutoresearchRuntimeStatus;
}

export interface ExecuteAutoresearchFinalizeDecisionInput {
  cwd: string;
  packet: FinalizeDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchFinalizeDecisionResult {
  cwd: string;
  outcome: FinalizeDecisionOutcome;
  status: AutoresearchRuntimeStatus;
}

interface ReceiptLoadResult {
  entries: AutoresearchReceipt[];
  invalidLineCount: number;
}

interface CurrentSegmentView {
  config: AutoresearchConfigReceipt | null;
  runs: AutoresearchRunReceipt[];
}

interface AutoresearchPaths {
  jsonlPath: string;
  benchmarkScriptPath: string;
  checksScriptPath: string;
}

export function parseMetricLines(output: string): MetricMap {
  const metrics: MetricMap = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^METRIC\s+([\w.µ:-]+)=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!match) continue;
    const metricName = match[1];
    if (DENIED_METRIC_NAMES.has(metricName)) continue;
    metrics[metricName] = Number(match[2]);
  }

  return metrics;
}

export function createConfigReceipt(input: {
  name: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  createdAt?: number;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}): AutoresearchConfigReceipt {
  const metricThreshold = normalizeMetricThreshold(input.metricThreshold);
  return {
    type: "config",
    version: 1,
    name: input.name,
    metricName: input.metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction,
    ...(metricThreshold === undefined ? {} : { metricThreshold }),
    createdAt: input.createdAt ?? Date.now(),
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand ?? undefined,
  };
}

export function createRunReceipt(input: {
  status: RunStatus;
  runKind?: AutoresearchRunKind;
  experiment?: AutoresearchExperimentLineageInput;
  empiricalDecisionClass?: AutoresearchEmpiricalDecisionClass;
  metric: number;
  metrics?: MetricMap;
  description: string;
  timestamp?: number;
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
}): AutoresearchRunReceipt {
  return {
    type: "run",
    version: 1,
    status: input.status,
    runKind: input.runKind,
    experiment: normalizeExperimentLineage(input.experiment),
    empiricalDecisionClass: input.empiricalDecisionClass,
    metric: input.metric,
    metrics: { ...(input.metrics ?? {}) },
    description: input.description,
    timestamp: input.timestamp ?? Date.now(),
    commit: input.commit,
    iteration: input.iteration,
    confidence: input.confidence ?? null,
    durationSeconds: input.durationSeconds,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand,
    checksPassed: input.checksPassed,
    checksDurationSeconds: input.checksDurationSeconds,
    decision: input.decision ?? undefined,
  };
}

export function serializeReceipt(entry: AutoresearchReceipt): string {
  return JSON.stringify(entry);
}

export function parseReceiptLine(line: string): AutoresearchReceipt {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Receipt line must decode to an object");
  }
  if (parsed.type === "config") {
    return parseConfigReceipt(parsed);
  }
  if (parsed.type === "run") {
    return parseRunReceipt(parsed);
  }
  throw new Error(`Unsupported receipt type: ${String(parsed.type)}`);
}

export function resolveAutoresearchPaths(cwd: string): AutoresearchPaths {
  return {
    jsonlPath: path.join(cwd, "autoresearch.jsonl"),
    benchmarkScriptPath: path.join(cwd, "autoresearch.sh"),
    checksScriptPath: path.join(cwd, "autoresearch.checks.sh"),
  };
}

export function loadReceiptLog(cwd: string): ReceiptLoadResult {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  if (!existsSync(jsonlPath)) {
    return { entries: [], invalidLineCount: 0 };
  }

  const contents = readFileSync(jsonlPath, "utf8");
  if (contents.trim().length === 0) {
    return { entries: [], invalidLineCount: 0 };
  }

  const entries: AutoresearchReceipt[] = [];
  let invalidLineCount = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      entries.push(parseReceiptLine(line));
    } catch {
      invalidLineCount += 1;
    }
  }

  return { entries, invalidLineCount };
}

export function appendReceipt(cwd: string, entry: AutoresearchReceipt): void {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  mkdirSync(path.dirname(jsonlPath), { recursive: true });
  appendFileSync(jsonlPath, `${serializeReceipt(entry)}\n`, "utf8");
}

export function buildAutoresearchAutoplan(
  input: BuildAutoresearchAutoplanInput,
): AutoresearchAutoplanResult {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (objective.length === 0) throw new Error("objective is required");

  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  const paths = resolveAutoresearchPaths(cwd);
  const packageScripts = readPackageScripts(cwd);
  const justRecipes = readJustRecipes(cwd);
  const metric = inferMetricConfig(input, objective);
  const benchmarkCommand =
    normalizeOptionalString(input.benchmarkCommand) ??
    inferBenchmarkCommand(paths, packageScripts, justRecipes);
  const requestedChecksCommand =
    input.checksCommand !== undefined
      ? normalizeOptionalString(input.checksCommand)
      : inferChecksCommand(paths, packageScripts, justRecipes);
  const duplicateChecksReason = buildDuplicateChecksReason(
    cwd,
    benchmarkCommand,
    requestedChecksCommand,
    packageScripts,
  );
  const checksCommand =
    input.checksCommand === undefined && duplicateChecksReason ? null : requestedChecksCommand;
  const name = slugAutoresearchName(objective, readPackageName(cwd));
  const filesInScope = inferFilesInScope(cwd, input.filesInScope);
  const offLimits = normalizeArray(input.offLimits);
  const constraints = normalizeArray(input.constraints);
  const benchmarkMetricWarning = buildBenchmarkMetricContractWarning(
    benchmarkCommand,
    metric.metricName,
  );
  const config = createConfigReceipt({
    name,
    metricName: metric.metricName,
    metricUnit: metric.metricUnit,
    direction: metric.direction,
    metricThreshold: input.metricThreshold,
    benchmarkCommand: benchmarkCommand ?? undefined,
    checksCommand: checksCommand ?? undefined,
  });
  const dspxProgramGen =
    input.planner === "dspx_program"
      ? buildDspxProgramGenPlan({
          cwd,
          objective,
          filesInScope,
          offLimits,
          constraints,
          config,
          benchmarkCommand,
          checksCommand,
          materialize: input.materializeDspxIntent === true,
          intentPath: input.dspxIntentPath,
          outdir: input.dspxOutdir,
        })
      : null;
  const dspxAdvisory =
    input.planner === "dspx_program" && dspxProgramGen
      ? readDspxAutoplanAdvisory({
          cwd,
          objective,
          behaviorPath: input.dspxBehaviorPath,
          outdir: dspxProgramGen.outdir,
        })
      : null;
  const benchmarkScriptProposal = buildMetricBenchmarkScriptProposal({
    cwd,
    benchmarkCommand,
    metricName: metric.metricName,
    direction: metric.direction,
    benchmarkMetricWarning,
    benchmarkScriptPresent: existsSync(paths.benchmarkScriptPath),
    dspxBehaviorPath: dspxAdvisory?.available ? dspxAdvisory.behaviorPath : null,
    dspxTotal: dspxAdvisory?.total ?? 0,
  });
  const scriptProposalCanDriveBaseline =
    canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
  const measurementContract = buildAutoplanMeasurementContract({
    benchmarkCommand,
    metricName: metric.metricName,
    benchmarkMetricWarning,
    benchmarkScriptProposal,
  });
  const risks = buildAutoplanRisks({
    benchmarkCommand,
    checksCommand,
    metricName: metric.metricName,
    status,
    benchmarkMetricWarning: scriptProposalCanDriveBaseline ? null : benchmarkMetricWarning,
    measurementContractRisk: buildMeasurementContractRisk(benchmarkScriptProposal),
    duplicateChecksReason,
    duplicateChecksOmitted: Boolean(duplicateChecksReason && input.checksCommand === undefined),
  });
  const nextAction: AutoresearchSetupAction =
    benchmarkMetricWarning && !scriptProposalCanDriveBaseline ? "plan" : "baseline";
  const nextToolCall = formatAutoplanSetupToolCall({
    cwd,
    config,
    action: nextAction,
    benchmarkCommand:
      scriptProposalCanDriveBaseline && benchmarkScriptProposal
        ? benchmarkScriptProposal.benchmarkCommand
        : (benchmarkCommand ?? "<benchmark command required>"),
    checksCommand,
    benchmarkScriptProposal: scriptProposalCanDriveBaseline ? benchmarkScriptProposal : null,
  });

  return {
    cwd,
    objective,
    planner: input.planner ?? "heuristic",
    config,
    benchmarkCommand,
    checksCommand,
    benchmarkScriptPresent: existsSync(paths.benchmarkScriptPath),
    checksScriptPresent: existsSync(paths.checksScriptPath),
    measurementContract,
    benchmarkScriptProposal,
    packageScripts,
    justRecipes,
    filesInScope,
    offLimits,
    constraints,
    confidence: benchmarkCommand ? 0.74 : 0.42,
    risks,
    nextToolCall,
    dspxProgramGen,
    dspxAdvisory,
    status,
  };
}

export function formatAutoresearchAutoplanResult(result: AutoresearchAutoplanResult): string {
  return [
    "# PI-AUTORESEARCH AUTOPLAN",
    "",
    `- cwd: ${result.cwd}`,
    `- planner: ${result.planner}`,
    `- objective: ${result.objective}`,
    `- confidence: ${result.confidence.toFixed(2)}`,
    `- campaign: ${result.config.name}`,
    `- metric: ${result.config.metricName} (${result.config.metricUnit || "unitless"}, ${result.config.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.config.metricThreshold ?? null, result.config.metricUnit)}`,
    `- benchmark command: ${result.benchmarkCommand ?? "(missing)"}`,
    `- checks command: ${result.checksCommand ?? "(none)"}`,
    `- current machine state: ${result.status.runtimeProjection.state}`,
    "",
    "## Scope",
    `- files in scope: ${formatTargetFiles(result.filesInScope)}`,
    `- off limits: ${formatTargetFiles(result.offLimits)}`,
    "",
    "## Risks",
    ...(result.risks.length > 0 ? result.risks.map((risk) => `- ${risk}`) : ["- none detected"]),
    ...(result.measurementContract
      ? [
          "",
          "## Measurement contract",
          `- metric: ${result.measurementContract.metricName}`,
          `- authority: ${result.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.measurementContract.freshness}`,
          `- causal link: ${result.measurementContract.causalLink}`,
          `- generated by: ${result.measurementContract.generatedBy}`,
          `- reason: ${result.measurementContract.reason}`,
        ]
      : []),
    ...(result.benchmarkScriptProposal
      ? [
          "",
          canBenchmarkScriptProposalDriveBaseline(result.benchmarkScriptProposal)
            ? "## Benchmark script proposal"
            : "## Advisory metric summary (not baseline authority)",
          `- source: ${result.benchmarkScriptProposal.source}`,
          `- reason: ${result.benchmarkScriptProposal.reason}`,
          `- measurement authority: ${result.benchmarkScriptProposal.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.benchmarkScriptProposal.measurementContract.freshness}`,
          `- causal link: ${result.benchmarkScriptProposal.measurementContract.causalLink}`,
          "```bash",
          result.benchmarkScriptProposal.benchmarkScript.trimEnd(),
          "```",
        ]
      : []),
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
    ...(result.dspxProgramGen
      ? [
          "",
          "## DSPx program-gen handoff",
          `- intent: ${result.dspxProgramGen.intentPath}`,
          `- outdir: ${result.dspxProgramGen.outdir}`,
          `- materialized: ${result.dspxProgramGen.materialized ? "yes" : "no"}`,
          `- command: \`${result.dspxProgramGen.command}\``,
          `- note: ${result.dspxProgramGen.note}`,
        ]
      : []),
    ...(result.dspxAdvisory
      ? [
          "",
          "## DSPx advisory evidence",
          `- authority: ${result.dspxAdvisory.authority}`,
          `- behavior: ${result.dspxAdvisory.behaviorPath}`,
          `- available: ${result.dspxAdvisory.available ? "yes" : "no"}`,
          `- status: ${result.dspxAdvisory.status ?? "unknown"} (${result.dspxAdvisory.passed}/${result.dspxAdvisory.total} passed, failed=${result.dspxAdvisory.failed}, error=${result.dspxAdvisory.error})`,
          `- objective match: ${result.dspxAdvisory.matchedObjective ? "yes" : "no"}`,
          ...(result.dspxAdvisory.proposal
            ? [
                `- proposed campaign: ${result.dspxAdvisory.proposal.campaignName ?? "(missing)"}`,
                `- proposed metric: ${result.dspxAdvisory.proposal.metricName ?? "(missing)"} (${result.dspxAdvisory.proposal.metricUnit || "unitless"}, ${result.dspxAdvisory.proposal.direction ?? "unknown"} is better)`,
                `- proposed benchmark: ${result.dspxAdvisory.proposal.benchmarkCommand ?? "(missing)"}`,
                `- proposed checks: ${result.dspxAdvisory.proposal.checksCommand ?? "(none)"}`,
                `- proposed next action: ${result.dspxAdvisory.proposal.nextAction ?? "(missing)"}`,
              ]
            : ["- proposal: (none)"]),
          ...(result.dspxAdvisory.benchmarkScriptProposal
            ? [
                "",
                canBenchmarkScriptProposalDriveBaseline(result.dspxAdvisory.benchmarkScriptProposal)
                  ? "### DSPx advisory benchmark script proposal"
                  : "### DSPx advisory metric summary (not baseline authority)",
                `- source: ${result.dspxAdvisory.benchmarkScriptProposal.source}`,
                `- reason: ${result.dspxAdvisory.benchmarkScriptProposal.reason}`,
                `- measurement authority: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.optimizationAuthority}`,
                `- freshness: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.freshness}`,
                `- causal link: ${result.dspxAdvisory.benchmarkScriptProposal.measurementContract.causalLink}`,
                "```bash",
                result.dspxAdvisory.benchmarkScriptProposal.benchmarkScript.trimEnd(),
                "```",
              ]
            : []),
          ...(result.dspxAdvisory.nextToolCall
            ? ["", "### DSPx advisory setup call", `\`${result.dspxAdvisory.nextToolCall}\``]
            : []),
          ...(result.dspxAdvisory.warnings.length > 0
            ? [
                "",
                "### DSPx advisory warnings",
                ...result.dspxAdvisory.warnings.map((warning) => `- ${warning}`),
              ]
            : []),
          "",
          "DSPx advisory output is evidence only; use autoresearch_runtime_setup to apply any setup.",
        ]
      : []),
  ].join("\n");
}

export async function executeAutoresearchSetup(
  input: ExecuteAutoresearchSetupInput,
): Promise<ExecuteAutoresearchSetupResult> {
  const cwd = path.resolve(input.cwd);
  const action = input.action ?? "plan";
  const paths = resolveAutoresearchPaths(cwd);
  const plannedConfig = createConfigReceipt(input);
  let wroteBenchmarkScript = false;
  let wroteChecksScript = false;

  if (action === "plan") {
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: false,
      wroteBenchmarkScript: false,
      wroteChecksScript: false,
      run: null,
      status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false }),
      nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "apply"),
    };
  }

  wroteBenchmarkScript = maybeWriteAutoresearchScript({
    path: paths.benchmarkScriptPath,
    content: input.benchmarkScript,
    allowOverwrite: input.allowOverwriteScripts === true,
  });
  wroteChecksScript = maybeWriteAutoresearchScript({
    path: paths.checksScriptPath,
    content: input.checksScript ?? undefined,
    allowOverwrite: input.allowOverwriteScripts === true,
  });

  if (action === "baseline") {
    const run = await executeAutoresearchRun({
      cwd,
      description: input.description?.trim() || `baseline for ${plannedConfig.name}`,
      name: plannedConfig.name,
      metricName: plannedConfig.metricName,
      metricUnit: plannedConfig.metricUnit,
      direction: plannedConfig.direction,
      metricThreshold: plannedConfig.metricThreshold,
      benchmarkCommand: plannedConfig.benchmarkCommand,
      checksCommand: plannedConfig.checksCommand,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      signal: input.signal,
    });
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: run.createdConfig,
      wroteBenchmarkScript,
      wroteChecksScript,
      run,
      status: run.status,
      nextToolCall: `autoresearch_runtime_loop({ cwd: ${JSON.stringify(cwd)}, goal: ${JSON.stringify(input.description ?? plannedConfig.name)}, maxIterations: 3 })`,
    };
  }

  const currentStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  if (currentStatus.currentSegment.configured && input.reconfigure !== true) {
    throw new Error(
      "runtime already has a configured segment; pass reconfigure=true to append a new config receipt",
    );
  }
  const entries = loadReceiptLog(cwd).entries;
  ensureEventLedgerInitializedFromReceipts(cwd, entries);
  appendReceipt(cwd, plannedConfig);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(plannedConfig)),
      plannedConfig.createdAt,
    ),
  );

  return {
    cwd,
    action,
    plannedConfig,
    appliedConfig: true,
    wroteBenchmarkScript,
    wroteChecksScript,
    run: null,
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true }),
    nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "baseline"),
  };
}

export function formatAutoresearchSetupResult(result: ExecuteAutoresearchSetupResult): string {
  return [
    "# PI-AUTORESEARCH SETUP",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- applied config: ${result.appliedConfig ? "yes" : "no"}`,
    `- wrote benchmark script: ${result.wroteBenchmarkScript ? "yes" : "no"}`,
    `- wrote checks script: ${result.wroteChecksScript ? "yes" : "no"}`,
    `- campaign: ${result.plannedConfig.name}`,
    `- metric: ${result.plannedConfig.metricName} (${result.plannedConfig.metricUnit || "unitless"}, ${result.plannedConfig.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.plannedConfig.metricThreshold ?? null, result.plannedConfig.metricUnit)}`,
    `- benchmark command: ${result.plannedConfig.benchmarkCommand ?? "(default/autodetect)"}`,
    `- checks command: ${result.plannedConfig.checksCommand ?? "(none)"}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    result.run
      ? `- baseline: ${result.run.runReceipt.status} ${result.run.primaryMetricName}=${formatMetricValue(result.run.primaryMetric, result.status.currentSegment.metricUnit)}`
      : "- baseline: not run",
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
  ].join("\n");
}

function normalizeAutoresearchCandidateLifecyclePolicy(
  input?: AutoresearchCandidateLifecyclePolicyInput,
): AutoresearchCandidateLifecyclePolicy {
  const mode = input?.mode ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.mode;
  if (mode !== "worktree") throw new Error(`Unsupported candidatePolicy.mode: ${mode}`);

  const keep = input?.keep ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.keep;
  if (keep !== "preserve_branch" && keep !== "plan_review_branch") {
    throw new Error(`Unsupported candidatePolicy.keep: ${keep}`);
  }

  const discard = input?.discard ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.discard;
  if (discard !== "suggest_cleanup" && discard !== "delete_worktree_after_confirm") {
    throw new Error(`Unsupported candidatePolicy.discard: ${discard}`);
  }

  const rewind = input?.rewind ?? DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY.rewind;
  if (rewind !== "reset_worktree_to_base" && rewind !== "recreate_worktree_from_base") {
    throw new Error(`Unsupported candidatePolicy.rewind: ${rewind}`);
  }

  return {
    ...DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY,
    mode,
    keep,
    discard,
    rewind,
  };
}

export async function executeAutoresearchCampaignStart(
  input: ExecuteAutoresearchCampaignStartInput,
): Promise<ExecuteAutoresearchCampaignStartResult> {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (!objective) throw new Error("objective is required for autoresearch_campaign_start");

  const setupMode = input.setupMode ?? "autoplan";
  const runMode = input.runMode ?? "plan_only";
  const maxIterations = input.maxIterations ?? 3;
  if (maxIterations < 1) throw new Error("maxIterations must be at least 1");
  const candidatePolicy = normalizeAutoresearchCandidateLifecyclePolicy(input.candidatePolicy);

  const autoplan = buildAutoresearchAutoplan({
    cwd,
    objective,
    planner: input.planner,
    filesInScope: input.filesInScope,
    offLimits: input.offLimits,
    constraints: input.constraints,
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand,
    metricName: input.metricName,
    metricUnit: input.metricUnit,
    direction: input.direction,
    materializeDspxIntent: input.materializeDspxIntent,
    dspxIntentPath: input.dspxIntentPath,
    dspxOutdir: input.dspxOutdir,
    dspxBehaviorPath: input.dspxBehaviorPath,
  });

  const warnings = [...autoplan.risks];
  let setupDecision: ExecuteAutoresearchSetupDecisionResult | null = null;
  if (setupMode === "prompt_vault_setup") {
    if (!input.decisionRuntime) {
      throw new Error("setupMode=prompt_vault_setup requires a decisionRuntime");
    }
    setupDecision = await requestAutoresearchSetupDecision({
      cwd,
      packet: {
        optimizationObjective: objective,
        repoContext: [
          `runtime_status=${autoplan.status.runtimeProjection.state}`,
          `autoplan_campaign=${autoplan.config.name}`,
          `autoplan_metric=${autoplan.config.metricName}`,
        ],
        filesInScope: autoplan.filesInScope,
        offLimits: autoplan.offLimits,
        benchmarkSurfaces: [
          autoplan.benchmarkCommand ?? "(missing benchmark command)",
          autoplan.checksCommand ? `checks: ${autoplan.checksCommand}` : "checks: none",
        ],
        existingArtifacts: AUTORESEARCH_LOCAL_ARTIFACTS.filter((artifact) =>
          existsSync(path.join(cwd, artifact)),
        ),
        hardConstraints: autoplan.constraints,
        blockers: autoplan.risks,
      },
      runtime: input.decisionRuntime,
      model: input.model,
      signal: input.signal,
    });
  }

  const benchmarkScriptProposal = canBenchmarkScriptProposalDriveBaseline(
    autoplan.benchmarkScriptProposal,
  )
    ? autoplan.benchmarkScriptProposal
    : null;
  const benchmarkCommand = benchmarkScriptProposal?.benchmarkCommand ?? autoplan.benchmarkCommand;

  if (runMode !== "plan_only" && !benchmarkCommand) {
    throw new Error(
      "autoresearch_campaign_start cannot execute because no benchmark command is available; rerun with runMode=plan_only or pass benchmarkCommand.",
    );
  }

  let setupResult: ExecuteAutoresearchSetupResult | null = null;
  let loopResult: ExecuteAutoresearchLoopResult | null = null;

  if (runMode === "baseline") {
    setupResult = await executeAutoresearchSetup({
      cwd,
      action: "baseline",
      name: autoplan.config.name,
      metricName: autoplan.config.metricName,
      metricUnit: autoplan.config.metricUnit,
      direction: autoplan.config.direction,
      metricThreshold: autoplan.config.metricThreshold,
      benchmarkCommand: benchmarkCommand ?? undefined,
      checksCommand: autoplan.checksCommand,
      description: input.description ?? `Baseline for ${objective}`,
      benchmarkScript: benchmarkScriptProposal?.benchmarkScript,
      allowOverwriteScripts: input.allowOverwriteScripts,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      signal: input.signal,
    });
  }

  if (runMode === "bounded_loop") {
    loopResult = await executeAutoresearchLoop({
      cwd,
      goal: objective,
      maxIterations,
      maxWallClockMinutes: input.maxWallClockMinutes,
      description: input.description ?? `Start supervised campaign for ${objective}`,
      name: autoplan.config.name,
      metricName: autoplan.config.metricName,
      metricUnit: autoplan.config.metricUnit,
      direction: autoplan.config.direction,
      metricThreshold: autoplan.config.metricThreshold,
      benchmarkCommand: benchmarkCommand ?? undefined,
      checksCommand: autoplan.checksCommand,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      decisionGoal: input.decisionGoal,
      decisionRuntime: input.decisionRuntime,
      decisionConstraints: input.decisionConstraints ?? autoplan.constraints,
      decisionFilesInScope: input.decisionFilesInScope ?? autoplan.filesInScope,
      decisionOffLimits: input.decisionOffLimits ?? autoplan.offLimits,
      decisionIdeasBacklog: input.decisionIdeasBacklog,
      decisionAsiNotes: input.decisionAsiNotes,
      decisionDeadEndMemory: input.decisionDeadEndMemory,
      model: input.model,
      stopOn: input.stopOn,
      peerMode: input.peerMode,
      signal: input.signal,
      onProgress: input.onProgress,
    });
  }

  const status = loopResult?.status ?? setupResult?.status ?? buildAutoresearchRuntimeStatus(cwd);
  return {
    cwd,
    objective,
    setupMode,
    runMode,
    maxIterations,
    autoplan,
    setupDecision,
    setupResult,
    loopResult,
    candidatePolicy,
    status,
    nextToolCall: formatCampaignStartNextToolCall({
      cwd,
      objective,
      runMode,
      maxIterations,
      setupMode,
      canExecute: Boolean(benchmarkCommand),
      candidatePolicy,
      reconfigure: input.reconfigure === true || autoplan.status.currentSegment.configured,
    }),
    warnings,
  };
}

export function formatAutoresearchCampaignStartResult(
  result: ExecuteAutoresearchCampaignStartResult,
): string {
  const setupDecisionLines = result.setupDecision
    ? [
        "",
        "## Governed setup decision",
        `- status: ${result.setupDecision.outcome.status}`,
        `- template: ${result.setupDecision.outcome.templateName}`,
        `- kind: ${result.setupDecision.outcome.kind}`,
      ]
    : [];
  const executionLines = result.loopResult
    ? [
        "",
        "## Bounded loop",
        `- completed iterations: ${result.loopResult.completedIterations}/${result.loopResult.requestedIterations}`,
        `- stop reason: ${result.loopResult.stopReason}`,
        `- peer lane: ${result.loopResult.peerAssist.lane}`,
      ]
    : result.setupResult
      ? [
          "",
          "## Baseline",
          `- applied config: ${result.setupResult.appliedConfig ? "yes" : "no"}`,
          result.setupResult.run
            ? `- result: ${result.setupResult.run.runReceipt.status} ${result.setupResult.run.primaryMetricName}=${formatMetricValue(result.setupResult.run.primaryMetric, result.setupResult.status.currentSegment.metricUnit)}`
            : "- result: not run",
        ]
      : [];

  return [
    "# PI-AUTORESEARCH CAMPAIGN START",
    "",
    `- cwd: ${result.cwd}`,
    `- objective: ${result.objective}`,
    `- setup mode: ${result.setupMode}`,
    `- run mode: ${result.runMode}`,
    `- campaign: ${result.autoplan.config.name}`,
    `- metric: ${result.autoplan.config.metricName} (${result.autoplan.config.metricUnit || "unitless"}, ${result.autoplan.config.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.autoplan.config.metricThreshold ?? null, result.autoplan.config.metricUnit)}`,
    `- benchmark command: ${result.autoplan.benchmarkCommand ?? "(missing)"}`,
    `- checks command: ${result.autoplan.checksCommand ?? "(none)"}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    "",
    "## Scope",
    `- files in scope: ${formatTargetFiles(result.autoplan.filesInScope)}`,
    `- off limits: ${formatTargetFiles(result.autoplan.offLimits)}`,
    "",
    "## Measurement contract",
    ...(result.autoplan.measurementContract
      ? [
          `- authority: ${result.autoplan.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.autoplan.measurementContract.freshness}`,
          `- causal link: ${result.autoplan.measurementContract.causalLink}`,
          `- reason: ${result.autoplan.measurementContract.reason}`,
        ]
      : ["- unavailable; review benchmark command before execution"]),
    "",
    "## Candidate lifecycle policy",
    `- mode: ${result.candidatePolicy.mode}`,
    `- keep: ${result.candidatePolicy.keep}`,
    `- discard: ${result.candidatePolicy.discard}`,
    `- rewind: ${result.candidatePolicy.rewind}`,
    `- authority: ${result.candidatePolicy.authority}`,
    `- worktree role: ${result.candidatePolicy.worktreeRole}`,
    `- replay-fabric role: ${result.candidatePolicy.replayFabricRole}`,
    `- ASC rewind role: ${result.candidatePolicy.ascRewindRole}`,
    ...setupDecisionLines,
    ...executionLines,
    "",
    "## Warnings / gates",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
    "",
    "## Dashboard",
    formatAutoresearchDashboard(result.status, result.candidatePolicy),
  ].join("\n");
}

function formatCampaignStartNextToolCall(input: {
  cwd: string;
  objective: string;
  runMode: AutoresearchCampaignStartRunMode;
  maxIterations: number;
  setupMode: AutoresearchCampaignStartSetupMode;
  canExecute: boolean;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  reconfigure?: boolean;
}): string {
  const candidatePolicy = JSON.stringify({
    mode: input.candidatePolicy.mode,
    keep: input.candidatePolicy.keep,
    discard: input.candidatePolicy.discard,
    rewind: input.candidatePolicy.rewind,
  });
  if (input.runMode === "plan_only") {
    const nextRunMode = input.canExecute ? "baseline" : "plan_only";
    const reconfigureField =
      input.reconfigure && nextRunMode === "baseline" ? ", reconfigure: true" : "";
    return `autoresearch_campaign_start({ cwd: ${JSON.stringify(input.cwd)}, objective: ${JSON.stringify(input.objective)}, setupMode: ${JSON.stringify(input.setupMode)}, runMode: ${JSON.stringify(nextRunMode)}, maxIterations: ${input.maxIterations}${reconfigureField}, candidatePolicy: ${candidatePolicy} })`;
  }
  if (input.runMode === "baseline") {
    return `autoresearch_campaign_start({ cwd: ${JSON.stringify(input.cwd)}, objective: ${JSON.stringify(input.objective)}, setupMode: ${JSON.stringify(input.setupMode)}, runMode: "bounded_loop", maxIterations: ${input.maxIterations}, candidatePolicy: ${candidatePolicy} })`;
  }
  return `autoresearch_runtime_status({ cwd: ${JSON.stringify(input.cwd)}, action: "closeout" })`;
}

function readPackageScripts(cwd: string): Record<string, string> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return {};
    return Object.fromEntries(
      Object.entries(parsed.scripts).filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      }),
    );
  } catch {
    return {};
  }
}

function readPackageName(cwd: string): string | null {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    if (!isRecord(parsed) || typeof parsed.name !== "string") return null;
    return parsed.name;
  } catch {
    return null;
  }
}

function readJustRecipes(cwd: string): string[] {
  const justfilePath = path.join(cwd, "Justfile");
  if (!existsSync(justfilePath)) return [];
  try {
    return readFileSync(justfilePath, "utf8")
      .split(/\r?\n/)
      .map((line) => /^(?!\s)([A-Za-z0-9_.-]+)\s*:/.exec(line)?.[1])
      .filter((entry): entry is string => Boolean(entry));
  } catch {
    return [];
  }
}

function inferMetricConfig(
  input: Pick<BuildAutoresearchAutoplanInput, "metricName" | "metricUnit" | "direction">,
  objective: string,
): { metricName: string; metricUnit: string; direction: MetricDirection } {
  const lowered = objective.toLowerCase();
  if (input.metricName?.trim()) {
    return {
      metricName: input.metricName.trim(),
      metricUnit: input.metricUnit ?? "",
      direction: input.direction ?? "lower",
    };
  }
  if (/accur|quality|score|pass rate|coverage/.test(lowered)) {
    return { metricName: "score", metricUnit: "", direction: input.direction ?? "higher" };
  }
  return {
    metricName: "total_ms",
    metricUnit: input.metricUnit ?? "ms",
    direction: input.direction ?? "lower",
  };
}

function inferBenchmarkCommand(
  paths: AutoresearchPaths,
  packageScripts: Record<string, string>,
  justRecipes: readonly string[],
): string | null {
  if (existsSync(paths.benchmarkScriptPath)) return "bash autoresearch.sh";
  for (const name of ["bench", "benchmark", "perf", "test:perf", "test:benchmark"]) {
    if (packageScripts[name]) return `npm run ${name}`;
  }
  for (const name of ["bench", "benchmark", "perf"]) {
    if (justRecipes.includes(name)) return `just ${name}`;
  }
  if (packageScripts.test) return "npm test";
  return null;
}

function inferChecksCommand(
  paths: AutoresearchPaths,
  packageScripts: Record<string, string>,
  justRecipes: readonly string[],
): string | null {
  if (existsSync(paths.checksScriptPath)) return "bash autoresearch.checks.sh";
  for (const name of ["check", "quality:ci", "ci", "test"]) {
    if (packageScripts[name]) return `npm run ${name}`;
  }
  for (const name of ["check", "ci", "test"]) {
    if (justRecipes.includes(name)) return `just ${name}`;
  }
  return null;
}

function slugAutoresearchName(objective: string, packageName: string | null): string {
  const source = `${packageName ?? "campaign"}-${objective}`;
  const slug = source
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "autoresearch-campaign";
}

function inferFilesInScope(cwd: string, requested: readonly string[] | undefined): string[] {
  const normalized = normalizeArray(requested);
  if (normalized.length > 0) return normalized;
  return ["src", "tests", "package.json", "Justfile", "autoresearch.sh"].filter((entry) =>
    existsSync(path.join(cwd, entry)),
  );
}

function buildDuplicateChecksReason(
  cwd: string,
  benchmarkCommand: string | null,
  checksCommand: string | null,
  packageScripts: Record<string, string>,
): string | null {
  if (!benchmarkCommand || !checksCommand) return null;
  const benchmark = resolveCommandEquivalenceKey(benchmarkCommand, packageScripts, cwd);
  const checks = resolveCommandEquivalenceKey(checksCommand, packageScripts, cwd);
  if (!benchmark || !checks || benchmark !== checks) return null;
  return `${JSON.stringify(benchmarkCommand)} and ${JSON.stringify(checksCommand)} both resolve to ${benchmark}`;
}

function resolveCommandEquivalenceKey(
  command: string,
  packageScripts: Record<string, string>,
  cwd: string,
  seen: Set<string> = new Set(),
): string | null {
  const normalized = command.trim().toLowerCase().replace(/\s+/g, " ");
  const wrappedCommand = parseAutoresearchWrappedCommand(cwd, normalized);
  if (wrappedCommand)
    return resolveCommandEquivalenceKey(wrappedCommand, packageScripts, cwd, seen);
  const scriptName = parseNpmScriptName(normalized);
  if (!scriptName) return normalized;
  if (seen.has(scriptName)) return `npm-script:${scriptName}`;
  seen.add(scriptName);
  const scriptBody = packageScripts[scriptName]?.trim();
  if (!scriptBody) return `npm-script:${scriptName}`;
  const nestedScriptName = parseNpmScriptName(scriptBody.toLowerCase().replace(/\s+/g, " "));
  if (nestedScriptName) return resolveCommandEquivalenceKey(scriptBody, packageScripts, cwd, seen);
  return `npm-script-body:${scriptBody}`;
}

function parseNpmScriptName(normalizedCommand: string): string | null {
  if (normalizedCommand === "npm test" || normalizedCommand === "npm run test") return "test";
  const match = /^npm run(?:-script)? ([a-z0-9:_-]+)$/u.exec(normalizedCommand);
  return match?.[1] ?? null;
}

function parseAutoresearchWrappedCommand(cwd: string, normalizedCommand: string): string | null {
  if (!/^(?:bash\s+)?(?:\.\/)?autoresearch\.sh$/u.test(normalizedCommand)) return null;
  const scriptPath = resolveAutoresearchPaths(cwd).benchmarkScriptPath;
  if (!existsSync(scriptPath)) return null;
  try {
    for (const rawLine of readFileSync(scriptPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("# autoresearch-wrapped-command-json: ")) {
        try {
          const command = JSON.parse(line.slice("# autoresearch-wrapped-command-json: ".length));
          return typeof command === "string" ? command : null;
        } catch {
          return null;
        }
      }
      if (!line || line.startsWith("#") || line === "set -euo pipefail") continue;
      if (/^(?:start_ms|end_ms)=/u.test(line)) continue;
      if (/^echo\s+["']?METRIC\b/u.test(line)) continue;
      if (/^(?:npm\s+(?:test|run|run-script)\b|just\s+)/u.test(line)) return line;
    }
  } catch {
    return null;
  }
  return null;
}

function buildAutoplanRisks(input: {
  benchmarkCommand: string | null;
  checksCommand: string | null;
  metricName: string;
  status: AutoresearchRuntimeStatus;
  benchmarkMetricWarning?: string | null;
  measurementContractRisk?: string | null;
  duplicateChecksReason?: string | null;
  duplicateChecksOmitted?: boolean;
}): string[] {
  const risks: string[] = [];
  if (!input.benchmarkCommand) {
    risks.push(
      "no benchmark command was detected; provide one or allow a benchmark script to be created",
    );
  }
  if (!input.checksCommand) {
    risks.push(
      input.duplicateChecksOmitted && input.duplicateChecksReason
        ? `checks command omitted because ${input.duplicateChecksReason}`
        : "no checks command was detected; loop safety will rely on benchmark exit status only",
    );
  } else if (input.duplicateChecksReason) {
    risks.push(
      `benchmark and checks commands appear equivalent; setup will run the same gate twice because checksCommand was provided explicitly (${input.duplicateChecksReason})`,
    );
  }
  const metricWarning =
    input.benchmarkMetricWarning === undefined
      ? buildBenchmarkMetricContractWarning(input.benchmarkCommand, input.metricName)
      : input.benchmarkMetricWarning;
  if (metricWarning) risks.push(metricWarning);
  if (input.measurementContractRisk) risks.push(input.measurementContractRisk);
  if (input.status.currentSegment.configured) {
    risks.push(
      "runtime is already configured; setup apply requires reconfigure=true for a new segment",
    );
  }
  return risks;
}

function buildBenchmarkMetricContractWarning(
  benchmarkCommand: string | null,
  metricName: string | null,
): string | null {
  if (!benchmarkCommand || !metricName) return null;
  const command = benchmarkCommand.trim();
  const normalized = command.toLowerCase().replace(/\s+/g, " ");
  const metric = metricName.trim();
  if (!metric) return null;
  if (command.includes("METRIC") || command.includes(metric)) return null;
  if (/\bautoresearch(\.sh|\b)/.test(normalized)) return null;
  if (/\b(bench|benchmark|perf)\b/.test(normalized)) return null;
  const genericCommands = new Set([
    "npm test",
    "npm run test",
    "npm run check",
    "npm run ci",
    "npm run quality:ci",
    "just test",
    "just check",
    "just ci",
  ]);
  if (!genericCommands.has(normalized)) return null;
  return `benchmark command ${JSON.stringify(command)} may not print required METRIC ${metric}=value; provide a benchmark script or explicit benchmarkCommand that emits the metric`;
}

function buildMetricBenchmarkScriptProposal(input: {
  cwd: string;
  benchmarkCommand: string | null;
  metricName: string;
  direction: MetricDirection;
  benchmarkMetricWarning: string | null;
  benchmarkScriptPresent: boolean;
  dspxBehaviorPath?: string | null;
  dspxTotal?: number;
}): AutoresearchBenchmarkScriptProposal | null {
  if (!input.benchmarkMetricWarning || !input.benchmarkCommand) return null;
  if (input.benchmarkScriptPresent) return null;
  if (!isMetricNameScriptSafe(input.metricName)) return null;

  if (isScoreLikeMetricName(input.metricName)) {
    if (!input.dspxBehaviorPath || !input.dspxTotal || input.dspxTotal <= 0) return null;
    return {
      benchmarkCommand: "bash autoresearch.sh",
      benchmarkScript: buildDspxBehaviorScoreBenchmarkScript({
        cwd: input.cwd,
        behaviorPath: input.dspxBehaviorPath,
        metricName: input.metricName,
      }),
      allowOverwriteScripts: false,
      reason:
        "generic benchmark command does not emit the requested score metric; existing DSPx behavior_results.json can be summarized as advisory evidence but cannot drive a baseline unless regenerated during the benchmark",
      source: "dspx_behavior_score",
      measurementContract: {
        metricName: input.metricName,
        generatedBy: "existing DSPx behavior_results.json summary",
        freshness: "static_existing_artifact",
        causalLink: "reads_prior_advisory_artifact",
        optimizationAuthority: "advisory_only",
        reason:
          "the script reads a pre-existing advisory artifact rather than generating fresh evidence during the current benchmark run",
      },
    };
  }

  if (input.direction !== "lower") return null;
  return {
    benchmarkCommand: "bash autoresearch.sh",
    benchmarkScript: buildDurationBenchmarkScript(input.benchmarkCommand, input.metricName),
    allowOverwriteScripts: false,
    reason:
      "generic benchmark command does not emit METRIC output; wrap it with a bounded local duration measurement",
    source: "duration_wrapper",
    measurementContract: {
      metricName: input.metricName,
      generatedBy: `duration wrapper around ${input.benchmarkCommand.trim()}`,
      freshness: "run_generated",
      causalLink: "wraps_current_benchmark_command",
      optimizationAuthority: "baseline_allowed",
      reason:
        "the metric is generated during the current benchmark run by measuring elapsed wall-clock time around the benchmark command",
    },
  };
}

function canBenchmarkScriptProposalDriveBaseline(
  proposal: AutoresearchBenchmarkScriptProposal | null,
): boolean {
  return proposal?.measurementContract.optimizationAuthority === "baseline_allowed";
}

function buildAutoplanMeasurementContract(input: {
  benchmarkCommand: string | null;
  metricName: string;
  benchmarkMetricWarning: string | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
}): AutoresearchMeasurementContract | null {
  if (input.benchmarkScriptProposal) return input.benchmarkScriptProposal.measurementContract;
  if (!input.benchmarkCommand || input.benchmarkMetricWarning) return null;
  return {
    metricName: input.metricName,
    generatedBy: input.benchmarkCommand,
    freshness: "run_generated",
    causalLink: "benchmark_command_declares_metric",
    optimizationAuthority: "baseline_allowed",
    reason:
      "the benchmark command is not classified as a generic non-metric command and is treated as the metric-emitting source for this bounded run",
  };
}

function buildMeasurementContractRisk(
  proposal: AutoresearchBenchmarkScriptProposal | null,
): string | null {
  if (!proposal || canBenchmarkScriptProposalDriveBaseline(proposal)) return null;
  return `measurement contract is ${proposal.measurementContract.optimizationAuthority}: ${proposal.measurementContract.reason}`;
}

function buildDurationBenchmarkScript(benchmarkCommand: string, metricName: string): string {
  const command = benchmarkCommand.trim();
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `# autoresearch-wrapped-command-json: ${JSON.stringify(command)}`,
    "",
    `AUTORESEARCH_BENCHMARK_COMMAND=${shellSingleQuote(command)} node <<'NODE'`,
    'const { spawnSync } = require("node:child_process");',
    "const command = process.env.AUTORESEARCH_BENCHMARK_COMMAND;",
    "if (!command) throw new Error('AUTORESEARCH_BENCHMARK_COMMAND is required');",
    "const startedAt = Date.now();",
    "const result = spawnSync(command, { shell: true, stdio: 'inherit' });",
    "const durationMs = Date.now() - startedAt;",
    "if (result.error) throw result.error;",
    "if (result.signal) process.exit(1);",
    "if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);",
    `console.log(\`METRIC ${metricName}=\${durationMs}\`);`,
    "NODE",
    "",
  ].join("\n");
}

function buildDspxBehaviorScoreBenchmarkScript(input: {
  cwd: string;
  behaviorPath: string;
  metricName: string;
}): string {
  const behaviorPathForScript = formatLocalScriptPath(input.cwd, input.behaviorPath);
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `DSPX_BEHAVIOR_PATH=${shellSingleQuote(behaviorPathForScript)} node <<'NODE'`,
    'const fs = require("node:fs");',
    "const behaviorPath = process.env.DSPX_BEHAVIOR_PATH;",
    "if (!behaviorPath) throw new Error('DSPX_BEHAVIOR_PATH is required');",
    "const payload = JSON.parse(fs.readFileSync(behaviorPath, 'utf8'));",
    "const summary = payload && typeof payload.summary === 'object' && payload.summary ? payload.summary : {};",
    "const examples = Array.isArray(payload?.examples) ? payload.examples : [];",
    "const numeric = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);",
    "let total = numeric(summary.total);",
    "let passed = numeric(summary.passed);",
    "if (total === null || total <= 0) total = examples.length;",
    "if (passed === null) passed = examples.filter((example) => example?.status === 'passed').length;",
    "if (!Number.isFinite(total) || total <= 0) throw new Error('DSPx behavior evidence has no examples to score');",
    "const score = (passed / total) * 100;",
    `console.log(\`METRIC ${input.metricName}=\${score}\`);`,
    "NODE",
    "",
  ].join("\n");
}

function isScoreLikeMetricName(metricName: string): boolean {
  return /(?:score|quality|accuracy|coverage|success|pass(?:ed)?(?:_|-)?rate|percent|pct)/iu.test(
    metricName,
  );
}

function isMetricNameScriptSafe(metricName: string): boolean {
  return /^[\w.µ:-]+$/u.test(metricName) && !DENIED_METRIC_NAMES.has(metricName);
}

function formatLocalScriptPath(cwd: string, targetPath: string): string {
  const absoluteTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath);
  const relative = path.relative(cwd, absoluteTarget);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return absoluteTarget;
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatAutoplanSetupToolCall(input: {
  cwd: string;
  config: AutoresearchConfigReceipt;
  action: AutoresearchSetupAction;
  benchmarkCommand: string;
  checksCommand: string | null;
  benchmarkScriptProposal?: AutoresearchBenchmarkScriptProposal | null;
}): string {
  const scriptFields = input.benchmarkScriptProposal
    ? `, benchmarkScript: ${JSON.stringify(input.benchmarkScriptProposal.benchmarkScript)}, allowOverwriteScripts: false`
    : "";
  const thresholdField =
    input.config.metricThreshold === undefined
      ? ""
      : `, metricThreshold: ${JSON.stringify(input.config.metricThreshold)}`;
  return `autoresearch_runtime_setup({ action: ${JSON.stringify(input.action)}, cwd: ${JSON.stringify(input.cwd)}, name: ${JSON.stringify(input.config.name)}, metricName: ${JSON.stringify(input.config.metricName)}, metricUnit: ${JSON.stringify(input.config.metricUnit)}, direction: ${JSON.stringify(input.config.direction)}${thresholdField}, benchmarkCommand: ${JSON.stringify(input.benchmarkCommand)}, checksCommand: ${input.checksCommand === null ? "null" : JSON.stringify(input.checksCommand)}${scriptFields} })`;
}

function buildDspxProgramGenPlan(input: {
  cwd: string;
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  materialize: boolean;
  intentPath?: string;
  outdir?: string;
}): AutoresearchDspxProgramGenPlan {
  const intentPath = path.resolve(
    input.cwd,
    input.intentPath ?? ".autoresearch/dspx/autosetup-intent.yaml",
  );
  const outdir = path.resolve(
    input.cwd,
    input.outdir ?? ".autoresearch/dspx/generated/autosetup-planner",
  );
  if (input.materialize) {
    mkdirSync(path.dirname(intentPath), { recursive: true });
    writeFileSync(intentPath, renderDspxAutoresearchIntent(input), "utf8");
  }
  return {
    enabled: true,
    intentPath,
    outdir,
    command: `cd ${JSON.stringify(resolveDspxRepoPath())} && just dspx program-gen --intent ${JSON.stringify(intentPath)} --outdir ${JSON.stringify(outdir)}`,
    materialized: input.materialize,
    note: "DSPx program-gen remains a local evidence/program-synthesis handoff; pi-autoresearch still owns setup application, bounded runs, receipts, and stop gates.",
  };
}

function readDspxAutoplanAdvisory(input: {
  cwd: string;
  objective: string;
  outdir: string;
  behaviorPath?: string;
}): AutoresearchDspxAdvisory {
  const behaviorPath = path.resolve(
    input.cwd,
    input.behaviorPath ?? path.join(input.outdir, "behavior_results.json"),
  );
  const missing: AutoresearchDspxAdvisory = {
    authority: "evidence_only_non_authoritative",
    behaviorPath,
    available: false,
    status: null,
    total: 0,
    passed: 0,
    failed: 0,
    error: 0,
    matchedObjective: false,
    selectedExampleIndex: null,
    proposal: null,
    benchmarkScriptProposal: null,
    warnings: ["DSPx behavior_results.json is not present yet; run the program-gen handoff first"],
    nextToolCall: null,
  };
  if (!existsSync(behaviorPath)) return missing;

  try {
    const payload = JSON.parse(readFileSync(behaviorPath, "utf8")) as unknown;
    if (!isRecord(payload)) {
      return {
        ...missing,
        available: true,
        warnings: ["DSPx behavior_results.json is not an object"],
      };
    }
    const summary = isRecord(payload.summary) ? payload.summary : {};
    const examples = Array.isArray(payload.examples) ? payload.examples : [];
    const records = examples.filter(isRecord);
    const exact = records.find((record) => {
      const inputs = isRecord(record.inputs) ? record.inputs : {};
      return stringOrNull(inputs.objective) === input.objective;
    });
    const selected = exact ?? records.find((record) => isRecord(record.observed_outputs)) ?? null;
    const observed =
      selected && isRecord(selected.observed_outputs) ? selected.observed_outputs : null;
    const proposal = observed ? parseDspxAdvisoryProposal(observed) : null;
    const status = stringOrNull(summary.status) ?? stringOrNull(payload.behavior_status);
    const total = numberOrZero(summary.total);
    const passed = numberOrZero(summary.passed);
    const failed = numberOrZero(summary.failed);
    const error = numberOrZero(summary.error);
    const metricWarning = buildBenchmarkMetricContractWarning(
      proposal?.benchmarkCommand ?? null,
      proposal?.metricName ?? null,
    );
    const benchmarkScriptProposal = proposal?.metricName
      ? buildMetricBenchmarkScriptProposal({
          cwd: input.cwd,
          benchmarkCommand: proposal.benchmarkCommand,
          metricName: proposal.metricName,
          direction: proposal.direction ?? "lower",
          benchmarkMetricWarning: metricWarning,
          benchmarkScriptPresent: existsSync(
            resolveAutoresearchPaths(input.cwd).benchmarkScriptPath,
          ),
          dspxBehaviorPath: behaviorPath,
          dspxTotal: total,
        })
      : null;
    const scriptProposalCanDriveBaseline =
      canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
    const warnings: string[] = [];
    if (!exact)
      warnings.push(
        "DSPx behavior evidence does not contain an exact objective match; treat proposal as stale or generic",
      );
    if (status && status !== "passed") warnings.push(`DSPx behavior evidence status is ${status}`);
    if (!proposal) warnings.push("DSPx behavior evidence has no observable setup proposal");
    if (metricWarning && !scriptProposalCanDriveBaseline) warnings.push(metricWarning);
    const measurementContractRisk = buildMeasurementContractRisk(benchmarkScriptProposal);
    if (measurementContractRisk) warnings.push(measurementContractRisk);
    const nextToolCall = proposalToSetupToolCall(input.cwd, proposal, benchmarkScriptProposal);
    return {
      authority: "evidence_only_non_authoritative",
      behaviorPath,
      available: true,
      status,
      total,
      passed,
      failed,
      error,
      matchedObjective: Boolean(exact),
      selectedExampleIndex: selected ? numberOrNull(selected.index) : null,
      proposal,
      benchmarkScriptProposal,
      warnings,
      nextToolCall,
    };
  } catch (error) {
    return {
      ...missing,
      available: true,
      warnings: [`could not parse DSPx behavior evidence: ${formatErrorMessage(error)}`],
    };
  }
}

function parseDspxAdvisoryProposal(
  observed: Record<string, unknown>,
): AutoresearchDspxAdvisoryProposal {
  const direction = stringOrNull(observed.direction);
  return {
    campaignName: stringOrNull(observed.campaign_name),
    metricName: stringOrNull(observed.metric_name),
    metricUnit: stringOrNull(observed.metric_unit) ?? "",
    direction: direction === "lower" || direction === "higher" ? direction : null,
    metricThreshold: numberOrNull(observed.metric_threshold),
    benchmarkCommand: stringOrNull(observed.benchmark_command),
    checksCommand: stringOrNull(observed.checks_command),
    risks: stringOrNull(observed.risks),
    nextAction: stringOrNull(observed.next_action),
  };
}

function proposalToSetupToolCall(
  cwd: string,
  proposal: AutoresearchDspxAdvisoryProposal | null,
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null = null,
): string | null {
  if (
    !proposal?.campaignName ||
    !proposal.metricName ||
    !proposal.direction ||
    !proposal.benchmarkCommand
  ) {
    return null;
  }
  const metricWarning = buildBenchmarkMetricContractWarning(
    proposal.benchmarkCommand,
    proposal.metricName,
  );
  const scriptProposalCanDriveBaseline =
    canBenchmarkScriptProposalDriveBaseline(benchmarkScriptProposal);
  const action: AutoresearchSetupAction =
    metricWarning && !scriptProposalCanDriveBaseline ? "plan" : "baseline";
  return formatAutoplanSetupToolCall({
    cwd,
    config: createConfigReceipt({
      name: proposal.campaignName,
      metricName: proposal.metricName,
      metricUnit: proposal.metricUnit,
      direction: proposal.direction,
      metricThreshold: proposal.metricThreshold ?? undefined,
    }),
    action,
    benchmarkCommand:
      scriptProposalCanDriveBaseline && benchmarkScriptProposal
        ? benchmarkScriptProposal.benchmarkCommand
        : proposal.benchmarkCommand,
    checksCommand: proposal.checksCommand,
    benchmarkScriptProposal: scriptProposalCanDriveBaseline ? benchmarkScriptProposal : null,
  });
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMetricThreshold(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("metricThreshold must be a finite number when present");
}

function renderDspxAutoresearchIntent(input: {
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
}): string {
  const inputFields = [
    ["runtime_status", "current pi-autoresearch state summary"],
    ["repo_summary", "concise repository and script summary"],
    ["objective", "optimization objective"],
    ["constraints", "bounded execution and safety constraints"],
  ] as const;
  const outputFields = [
    ["campaign_name", "proposed campaign or segment name"],
    ["metric_name", "primary metric name"],
    ["metric_unit", "primary metric unit"],
    ["direction", "lower or higher"],
    ["metric_threshold", "optional explicit success threshold for threshold-style metrics"],
    ["benchmark_command", "local command that prints METRIC name=value"],
    ["checks_command", "optional local safety command"],
    ["risks", "bounded setup risks"],
    ["next_action", "exact pi-autoresearch setup or run recommendation"],
  ] as const;
  return [
    "schema_version: program-intent-v2",
    "name: autoresearch_autosetup_planner",
    `objective: ${yamlQuote("Plan a bounded pi-autoresearch campaign setup from repo/runtime context.")}`,
    "task_type: single_module",
    `metric: ${yamlQuote(input.config.metricName)}`,
    "inputs:",
    ...inputFields.map(([name]) => `  - ${name}`),
    "outputs:",
    ...outputFields.map(([name]) => `  - ${name}`),
    "input_fields:",
    ...inputFields.flatMap(([name, desc]) => [`  - name: ${name}`, `    desc: ${yamlQuote(desc)}`]),
    "output_fields:",
    ...outputFields.flatMap(([name, desc]) => [
      `  - name: ${name}`,
      `    desc: ${yamlQuote(desc)}`,
    ]),
    "description: DSPy planner candidate for bounded pi-autoresearch campaign setup.",
    "constraints:",
    "  - bounded local runtime only",
    ...input.constraints.map((constraint) => `  - ${yamlQuote(constraint)}`),
    "topology:",
    "  kind: single_module",
    "signature:",
    "  name: AutoresearchSetupPlanner",
    "  inputs:",
    ...inputFields.map(([name, desc]) => `    - ${yamlQuote(`${name}: ${desc}`)}`),
    "  outputs:",
    ...outputFields.map(([name, desc]) => `    - ${yamlQuote(`${name}: ${desc}`)}`),
    "examples:",
    ...renderDspxAutoresearchExamples(input),
    "metadata:",
    "  authority: evidence_only",
    "  outer_controller: pi-autoresearch",
    "  program_gen_automation: false",
  ].join("\n");
}

function renderDspxAutoresearchExamples(input: {
  objective: string;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
}): string[] {
  const examples = [
    {
      inputs: {
        objective: input.objective,
        constraints: ["bounded local runtime only", ...input.constraints].join("; "),
        repo_summary: `files=${input.filesInScope.join(", ")}; off_limits=${input.offLimits.join(", ")}`,
        runtime_status:
          "segment_unconfigured; no prior receipt log; benchmark/check commands inferred from package scripts or operator overrides",
      },
      outputs: {
        campaign_name: input.config.name,
        metric_name: input.config.metricName,
        metric_unit: input.config.metricUnit,
        direction: input.config.direction,
        benchmark_command: input.benchmarkCommand ?? "<benchmark command required>",
        checks_command: input.checksCommand ?? "",
        risks: "keep setup bounded; do not mutate authority or launch hidden loops",
        next_action: "apply setup through autoresearch_runtime_setup, then run bounded loop",
      },
    },
    {
      inputs: {
        objective: "reduce package test runtime without reducing correctness",
        constraints:
          "bounded local runtime only; no network; do not edit lockfiles; stop on checks_failed or crash",
        repo_summary:
          "package.json scripts: test=vitest run, check=npm run lint && npm run test; files=src, tests, package.json; off_limits=.env,node_modules,dist",
        runtime_status: "segment_unconfigured; autoresearch.sh missing; checks script missing",
      },
      outputs: {
        campaign_name: "package-test-runtime",
        metric_name: "total_ms",
        metric_unit: "ms",
        direction: "lower",
        benchmark_command: "npm test",
        checks_command: "npm run check",
        risks:
          "benchmark may include noisy test startup cost; require repeated bounded runs before interpreting small deltas",
        next_action:
          "call autoresearch_runtime_setup action=baseline with benchmarkCommand npm test and checksCommand npm run check",
      },
    },
    {
      inputs: {
        objective: "improve answer quality score for a local evaluation harness",
        constraints:
          "bounded local runtime only; generated DSPx artifacts are evidence only; Pi remains outer controller",
        repo_summary:
          "autoresearch.sh exists and prints METRIC quality_score=value; package.json scripts: check=npm run quality:ci; files=src/evaluator.ts,evals,autoresearch.sh",
        runtime_status: "ready; existing segment quality-eval has baseline 72; higher is better",
      },
      outputs: {
        campaign_name: "quality-eval-improvement",
        metric_name: "quality_score",
        metric_unit: "",
        direction: "higher",
        benchmark_command: "bash autoresearch.sh",
        checks_command: "npm run quality:ci",
        risks:
          "quality score can overfit local examples; preserve held-out checks and off-limits eval fixtures",
        next_action:
          "if rebaselining, call autoresearch_runtime_setup action=baseline reconfigure=true; otherwise call autoresearch_runtime_loop maxIterations=3",
      },
    },
  ];
  return examples.flatMap((example) => [
    "  - inputs:",
    `      objective: ${yamlQuote(example.inputs.objective)}`,
    `      constraints: ${yamlQuote(example.inputs.constraints)}`,
    `      repo_summary: ${yamlQuote(example.inputs.repo_summary)}`,
    `      runtime_status: ${yamlQuote(example.inputs.runtime_status)}`,
    "    outputs:",
    `      campaign_name: ${yamlQuote(example.outputs.campaign_name)}`,
    `      metric_name: ${yamlQuote(example.outputs.metric_name)}`,
    `      metric_unit: ${yamlQuote(example.outputs.metric_unit)}`,
    `      direction: ${yamlQuote(example.outputs.direction)}`,
    `      benchmark_command: ${yamlQuote(example.outputs.benchmark_command)}`,
    `      checks_command: ${yamlQuote(example.outputs.checks_command)}`,
    `      risks: ${yamlQuote(example.outputs.risks)}`,
    `      next_action: ${yamlQuote(example.outputs.next_action)}`,
  ]);
}

function resolveDspxRepoPath(): string {
  return process.env.DSPX_HOME ?? "/home/tryinget/ai-society/softwareco/owned/dspx";
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function maybeWriteAutoresearchScript(input: {
  path: string;
  content?: string | null;
  allowOverwrite: boolean;
}): boolean {
  const content = input.content?.trim();
  if (!content) return false;
  if (existsSync(input.path) && !input.allowOverwrite) {
    throw new Error(
      `${path.basename(input.path)} already exists; pass allowOverwriteScripts=true to overwrite it`,
    );
  }
  mkdirSync(path.dirname(input.path), { recursive: true });
  writeFileSync(input.path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  chmodSync(input.path, 0o755);
  return true;
}

function formatSetupNextToolCall(
  cwd: string,
  config: AutoresearchConfigReceipt,
  action: AutoresearchSetupAction,
): string {
  const thresholdField =
    config.metricThreshold === undefined
      ? ""
      : `, metricThreshold: ${JSON.stringify(config.metricThreshold)}`;
  return `autoresearch_runtime_setup({ action: ${JSON.stringify(action)}, cwd: ${JSON.stringify(cwd)}, name: ${JSON.stringify(config.name)}, metricName: ${JSON.stringify(config.metricName)}, metricUnit: ${JSON.stringify(config.metricUnit)}, direction: ${JSON.stringify(config.direction)}${thresholdField}, benchmarkCommand: ${JSON.stringify(config.benchmarkCommand ?? "bash autoresearch.sh")}, checksCommand: ${config.checksCommand === undefined ? "undefined" : JSON.stringify(config.checksCommand)} })`;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null) return null;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildAutoresearchRuntimeStatus(
  cwd?: string,
  options: { persistSnapshot?: boolean } = {},
): AutoresearchRuntimeStatus {
  const paths = cwd ? resolveAutoresearchPaths(cwd) : null;
  const { entries, invalidLineCount } = cwd
    ? loadReceiptLog(cwd)
    : { entries: [], invalidLineCount: 0 };
  return buildAutoresearchRuntimeStatusFromEntries(cwd, paths, entries, invalidLineCount, {
    persistSnapshot: options.persistSnapshot ?? false,
  });
}

export function buildAutoresearchAdapterContractCatalog(): AutoresearchAdapterContractCatalog {
  return {
    packetKind: "autoresearch.adapter_contracts.v1",
    adapterContractVersion: 1,
    targetKinds: ["adapter_authoring", "integration", "documentation"],
    adapterBoundary:
      "Adapter contracts are descriptive and non-mutating; downstream adapters still own validation, target identity, plan/apply posture, and persistence.",
    entries: [
      {
        packetKind: "autoresearch.closeout.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "closeout", cwd })',
        targetKinds: ["adapter_source", "evidence", "learning", "task_system", "knowledge_base"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "cwd",
          "receiptPath",
          "campaign",
          "metricName",
          "direction",
          "runCount",
          "successfulRunCount",
          "empiricalDecisionClass",
          "empiricalPosture",
          "runs",
          "candidateBindings",
          "recommendedAction",
          "adapterBoundary",
        ],
        optionalFields: ["status", "timingInterpretation", "baselineMetric", "bestMetric"],
        summary:
          "Structured package-local empirical segment summary for downstream evidence and learning adapters.",
        boundary:
          "Package-local empirical evidence only; adapters must explicitly promote to AK, Beads, KES, notes, or another target owner.",
      },
      {
        packetKind: "autoresearch.ak_evidence.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "ak_evidence", cwd, akTaskId })',
        targetKinds: ["ak", "task_system", "evidence_ledger"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "taskId",
          "checkType",
          "result",
          "closeout",
          "suggestedToolCall",
          "adapterBoundary",
        ],
        optionalFields: ["evidenceBoundary"],
        summary: "Exact-task evidence packet for AK-like evidence ledgers and task systems.",
        boundary:
          "Non-mutating and task-bound; controllers or adapters must write through the target evidence owner surface.",
      },
      {
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "candidate_result", cwd })',
        targetKinds: ["candidate_review", "task_system", "evidence", "issue_tracker"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "cwd",
          "campaign",
          "candidate",
          "candidateRun",
          "empiricalDecisionClass",
          "recommendedAction",
          "resultSummary",
          "closeout",
          "adapterBoundary",
        ],
        optionalFields: [],
        summary:
          "Latest visible-candidate measurement summary for review, task, issue, or evidence adapters.",
        boundary:
          "Non-mutating candidate-result evidence only; candidate lifecycle, review, merge, and promotion remain external owner responsibilities.",
      },
      {
        packetKind: "autoresearch.learning.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "learning", cwd })',
        targetKinds: ["kes", "kms", "knowledge_base", "notes"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "suggestedPath",
          "title",
          "markdown",
          "closeout",
          "adapterBoundary",
        ],
        optionalFields: [],
        summary:
          "Markdown plus structured closeout for KES, notes, KMS, and knowledge-base adapters.",
        boundary:
          "Non-mutating and adapter-ready; learning adapters own persistence, promotion, and external writes.",
      },
    ],
  };
}

export function validateAutoresearchAdapterPacket(
  packet: unknown,
): AutoresearchAdapterPacketValidationResult {
  const issues: AutoresearchAdapterPacketValidationIssue[] = [];
  const adapterBoundary =
    "Adapter packet validation is non-mutating and structural; target adapters remain responsible for target identity, authority checks, and persistence.";

  const addIssue = (pathName: string, message: string) => {
    issues.push({ path: pathName, message });
  };

  if (!isRecord(packet) || Array.isArray(packet)) {
    return {
      packetKind: "autoresearch.adapter_validation.v1",
      adapterContractVersion: 1,
      targetKinds: ["adapter_validation"],
      valid: false,
      validatedPacketKind: null,
      validatedVersion: null,
      issues: [{ path: "$", message: "packet must be an object" }],
      adapterBoundary,
    };
  }

  const packetKind = typeof packet.packetKind === "string" ? packet.packetKind : null;
  const version =
    typeof packet.adapterContractVersion === "number" ? packet.adapterContractVersion : null;
  if (!packetKind) addIssue("packetKind", "packetKind must be a string");
  if (version === null)
    addIssue("adapterContractVersion", "adapterContractVersion must be a number");

  const catalog = buildAutoresearchAdapterContractCatalog();
  const entry = catalog.entries.find((candidate) => candidate.packetKind === packetKind);
  if (packetKind && !entry) {
    addIssue("packetKind", `unsupported packet kind ${packetKind}`);
  }
  if (entry && version !== entry.adapterContractVersion) {
    addIssue(
      "adapterContractVersion",
      `expected adapter contract version ${entry.adapterContractVersion}`,
    );
  }

  if (entry) {
    for (const field of entry.requiredFields) {
      if (packet[field] === undefined) addIssue(field, "required field is missing");
    }
  }

  validateStringArrayField(packet, "targetKinds", addIssue);
  validateStringField(packet, "adapterBoundary", addIssue);

  if (packetKind === "autoresearch.closeout.v1") {
    validateCloseoutPacketFields(packet, "", addIssue);
  } else if (packetKind === "autoresearch.ak_evidence.v1") {
    validatePositiveIntegerField(packet, "taskId", addIssue);
    if (packet.checkType !== "autoresearch:segment_closeout") {
      addIssue("checkType", 'checkType must be "autoresearch:segment_closeout"');
    }
    validateStringField(packet, "result", addIssue);
    validateStringField(packet, "suggestedToolCall", addIssue);
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  } else if (packetKind === "autoresearch.candidate_result.v1") {
    validateStringField(packet, "cwd", addIssue);
    validateStringField(packet, "empiricalDecisionClass", addIssue);
    validateStringField(packet, "recommendedAction", addIssue);
    validateStringField(packet, "resultSummary", addIssue);
    if (
      packet.candidate !== null &&
      (!isRecord(packet.candidate) || Array.isArray(packet.candidate))
    ) {
      addIssue("candidate", "candidate must be an object or null");
    }
    if (
      packet.candidateRun !== null &&
      (!isRecord(packet.candidateRun) || Array.isArray(packet.candidateRun))
    ) {
      addIssue("candidateRun", "candidateRun must be an object or null");
    }
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  } else if (packetKind === "autoresearch.learning.v1") {
    validateStringField(packet, "suggestedPath", addIssue);
    validateStringField(packet, "title", addIssue);
    validateStringField(packet, "markdown", addIssue);
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  }

  return {
    packetKind: "autoresearch.adapter_validation.v1",
    adapterContractVersion: 1,
    targetKinds: ["adapter_validation"],
    valid: issues.length === 0,
    validatedPacketKind: packetKind,
    validatedVersion: version,
    issues,
    adapterBoundary,
  };
}

function validateCloseoutPacketFields(
  packet: Record<string, unknown>,
  prefix: string,
  addIssue: (pathName: string, message: string) => void,
): void {
  if (packet.packetKind !== "autoresearch.closeout.v1") {
    addIssue(`${prefix}packetKind`, 'packetKind must be "autoresearch.closeout.v1"');
  }
  if (packet.adapterContractVersion !== 1) {
    addIssue(`${prefix}adapterContractVersion`, "adapterContractVersion must be 1");
  }
  validateStringArrayField(packet, "targetKinds", addIssue, prefix);
  validateStringField(packet, "cwd", addIssue, prefix);
  validateStringField(packet, "receiptPath", addIssue, prefix);
  validateNumberField(packet, "runCount", addIssue, prefix);
  validateNumberField(packet, "successfulRunCount", addIssue, prefix);
  validateStringField(packet, "empiricalDecisionClass", addIssue, prefix);
  validateEmpiricalPostureField(packet, "empiricalPosture", addIssue, prefix);
  validateArrayField(packet, "runs", addIssue, prefix);
  validateArrayField(packet, "candidateBindings", addIssue, prefix);
  validateStringField(packet, "recommendedAction", addIssue, prefix);
  validateStringField(packet, "adapterBoundary", addIssue, prefix);
}

function validateEmpiricalPostureField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  const value = packet[field];
  const fieldPath = `${prefix}${field}`;
  if (!isRecord(value) || Array.isArray(value)) {
    addIssue(fieldPath, `${field} must be an object`);
    return;
  }
  validateStringField(value, "classification", addIssue, `${fieldPath}.`);
  validateStringField(value, "summary", addIssue, `${fieldPath}.`);
  if (typeof value.promotionReady !== "boolean") {
    addIssue(`${fieldPath}.promotionReady`, "promotionReady must be a boolean");
  }
  validateStringField(value, "recommendedNextAction", addIssue, `${fieldPath}.`);
}

function validateStringField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (typeof packet[field] !== "string") {
    addIssue(`${prefix}${field}`, `${field} must be a string`);
  }
}

function validateNumberField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (typeof packet[field] !== "number" || !Number.isFinite(packet[field])) {
    addIssue(`${prefix}${field}`, `${field} must be a finite number`);
  }
}

function validatePositiveIntegerField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
): void {
  if (!Number.isInteger(packet[field]) || Number(packet[field]) < 1) {
    addIssue(field, `${field} must be a positive integer`);
  }
}

function validateArrayField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (!Array.isArray(packet[field])) {
    addIssue(`${prefix}${field}`, `${field} must be an array`);
  }
}

function validateStringArrayField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  const value = packet[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    addIssue(`${prefix}${field}`, `${field} must be an array of strings`);
  }
}

export function buildAutoresearchCandidateResultPacket(
  cwd: string,
): AutoresearchCandidateResultPacket {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const candidateRun = [...closeout.runs]
    .reverse()
    .find((run) => Boolean(run.experiment?.candidate));
  const candidate = candidateRun?.experiment?.candidate ?? null;
  const candidateLabel =
    candidate?.branch ??
    candidate?.worktreePath ??
    candidate?.diffSummary ??
    "(no candidate binding)";
  const resultSummary = candidate
    ? `Candidate ${candidateLabel} measured as ${closeout.empiricalDecisionClass}; ${closeout.recommendedAction}.`
    : `No visible candidate binding is present; current empirical decision is ${closeout.empiricalDecisionClass}.`;

  return {
    packetKind: "autoresearch.candidate_result.v1",
    adapterContractVersion: 1,
    targetKinds: ["candidate_review", "task_system", "evidence", "issue_tracker"],
    cwd: closeout.cwd,
    campaign: closeout.campaign,
    candidate,
    candidateRun: candidateRun ?? null,
    empiricalDecisionClass: closeout.empiricalDecisionClass,
    recommendedAction: closeout.recommendedAction,
    resultSummary,
    closeout,
    adapterBoundary:
      "Candidate result packet is non-mutating and adapter-ready; candidate lifecycle, review, merge, and promotion remain owned by visible peer/review/task systems.",
  };
}

export function buildAutoresearchCandidateDecisionWorkbench(
  input: BuildAutoresearchCandidateDecisionInput,
): AutoresearchCandidateDecisionWorkbench {
  const cwd = path.resolve(input.cwd);
  const action = input.action ?? "status";
  const candidatePolicy = normalizeAutoresearchCandidateLifecyclePolicy(input.candidatePolicy);
  const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
  const status = candidateResult.closeout.status;
  const candidate = summarizeCandidateForDecision(candidateResult.candidate);
  const candidateRun = candidateResult.candidateRun;
  const confidenceNoiseInterpretation = formatMetricInterpretation(
    status.currentSegment.metricInterpretation,
    status.currentSegment.metricUnit,
  );
  const baselineDriftRisk = describeAutoresearchBaselineDriftRisk(status);
  const checksStatus =
    candidateRun?.checks ?? describeLatestCloseoutChecks(candidateResult.closeout);
  const recommendedDecision = chooseAutoresearchCandidateLifecycleDecision({
    action,
    candidate,
    status,
  });
  const recommendationReason = explainAutoresearchCandidateLifecycleDecision({
    action,
    decision: recommendedDecision,
    status,
    candidate,
  });
  const exactNextCalls = buildAutoresearchCandidateDecisionNextCalls({
    cwd,
    action,
    decision: recommendedDecision,
    candidate,
    status,
  });
  const plannedCommands = buildAutoresearchCandidateDecisionCommandPlan({
    cwd,
    action,
    candidatePolicy,
    candidate,
  });
  const confirmation = buildAutoresearchCandidateDecisionConfirmation({
    action,
    decision: recommendedDecision,
    candidate,
    status,
    plannedCommands,
  });

  return {
    cwd,
    action,
    candidatePolicy,
    candidate,
    empirical: {
      classification: status.empiricalPosture.classification,
      empiricalDecisionClass: candidateResult.empiricalDecisionClass,
      promotionReady: status.empiricalPosture.promotionReady,
      confidence: status.currentSegment.confidence,
      confidenceNoiseInterpretation,
      checksStatus,
      baselineDriftRisk,
    },
    recommendedDecision,
    recommendationReason,
    confirmation,
    exactNextCalls,
    plannedCommands,
    boundaryWarnings: [...AUTORESEARCH_CANDIDATE_DECISION_BOUNDARY_WARNINGS],
    status,
    candidateResult,
  };
}

export function formatAutoresearchCandidateDecisionWorkbench(
  result: AutoresearchCandidateDecisionWorkbench,
): string {
  const candidateLines = result.candidate
    ? [
        `- candidate source: ${result.candidate.source ?? "(unknown)"}`,
        `- candidate worktree: ${result.candidate.worktreePath ?? "(unknown)"}`,
        `- candidate branch/ref: ${result.candidate.branch ?? "(unknown)"}`,
        `- candidate base ref: ${result.candidate.baseRef ?? "(unknown)"}`,
        `- candidate files changed: ${formatTargetFiles(result.candidate.filesChanged)}`,
        `- candidate diff summary: ${result.candidate.diffSummary ?? "(unknown)"}`,
      ]
    : ["- candidate: no candidate bound yet"];
  const commandLines =
    result.plannedCommands.length > 0
      ? result.plannedCommands.map((command) => `- ${command}`)
      : ["- (none; no worktree mutation is planned for this action)"];

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
    `- recommended decision: ${result.recommendedDecision}`,
    `- reason: ${result.recommendationReason}`,
    `- empirical posture: ${result.empirical.classification}; promotion ready: ${result.empirical.promotionReady ? "yes" : "no"}`,
    `- checks: ${result.empirical.checksStatus}; baseline drift risk: ${result.empirical.baselineDriftRisk}`,
    ...bindHint,
    `- next surface: ${nextCall}`,
  ].join("\n");
}

export function buildAutoresearchCandidateBindPlan(
  input: BuildAutoresearchCandidateBindInput,
): AutoresearchCandidateBindPlan {
  const cwd = path.resolve(input.cwd);
  const candidateWorktree = path.resolve(cwd, input.candidateWorktree ?? cwd);
  const candidateSource = input.candidateSource ?? "manual";
  const inspection = inspectAutoresearchCandidateWorktree({
    cwd,
    candidateWorktree,
    candidateBranch: input.candidateBranch,
    candidateBaseRef: input.candidateBaseRef,
  });
  const description =
    stringOrNull(input.description) ??
    `Measure bound candidate ${inspection.branch ?? path.basename(candidateWorktree)}`;
  const exactNextCalls = buildAutoresearchCandidateBindNextCalls({
    cwd,
    description,
    candidateSource,
    inspection,
  });
  const plannedCommands = buildAutoresearchCandidateBindCommandPlan({ cwd, inspection });

  return {
    cwd,
    action: input.action ?? "plan_run",
    candidateSource,
    description,
    inspection,
    exactNextCalls,
    plannedCommands,
    boundaryWarnings: [...AUTORESEARCH_CANDIDATE_BIND_BOUNDARY_WARNINGS],
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false }),
  };
}

export function formatAutoresearchCandidateBindPlan(result: AutoresearchCandidateBindPlan): string {
  return [
    "# PI-AUTORESEARCH CANDIDATE BIND PLAN",
    "",
    "Read-only / plan-only candidate intake surface. It inspects a controller-verified worktree/branch and prepares the exact measurement call; it does not run benchmarks, merge, delete worktrees, reset worktrees, spawn peers, write AK/KES/evidence, or promote results.",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- candidate source: ${result.candidateSource}`,
    `- measurement description: ${result.description}`,
    "",
    "## Candidate inspection",
    `- candidate worktree: ${result.inspection.candidateWorktree}`,
    `- exists: ${result.inspection.exists ? "yes" : "no"}`,
    `- git worktree: ${result.inspection.isGitWorktree ? "yes" : "no"}`,
    `- same repository as cwd: ${formatNullableBoolean(result.inspection.sameRepository)}`,
    `- repository root: ${result.inspection.repositoryRoot ?? "(unknown)"}`,
    `- branch/ref: ${result.inspection.branch ?? "(unknown)"}`,
    `- head: ${result.inspection.head ?? "(unknown)"}`,
    `- base ref: ${result.inspection.baseRef ?? "(not supplied; provide candidateBaseRef for base-relative diffs and rewind plans)"}`,
    `- base ref source: ${result.inspection.baseRefSource ?? "(none)"}`,
    `- base resolved: ${result.inspection.baseResolved ? "yes" : "no"}`,
    `- files changed: ${formatTargetFiles(result.inspection.filesChanged)}`,
    `- diff summary: ${result.inspection.diffSummary}`,
    `- intake readiness: ${result.inspection.readiness}`,
    `- readiness reasons: ${result.inspection.readinessReasons.length > 0 ? result.inspection.readinessReasons.join("; ") : "none"}`,
    "",
    "## Read-only inspection commands",
    ...result.plannedCommands.map((command) => `- ${command}`),
    "",
    "## Exact next calls",
    ...result.exactNextCalls.map((call) => `- ${call}`),
    "",
    "## Warnings",
    ...(result.inspection.warnings.length > 0
      ? result.inspection.warnings.map((warning) => `- ${warning}`)
      : ["- none"]),
    "",
    "## Boundary warnings",
    ...result.boundaryWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function buildAutoresearchKnowledgeExportPacket(
  cwd: string,
): AutoresearchKnowledgeExportPacket {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const title = `Autoresearch learning: ${closeout.campaign ?? "unnamed campaign"}`;
  const suggestedPath = `docs/learnings/${slugAutoresearchName("autoresearch-learning", closeout.campaign)}.md`;
  return {
    packetKind: "autoresearch.learning.v1",
    adapterContractVersion: 1,
    targetKinds: ["kes", "kms", "knowledge_base", "notes"],
    suggestedPath,
    title,
    markdown: renderAutoresearchLearningMarkdown(closeout, title),
    closeout,
    adapterBoundary:
      "Knowledge export packet is non-mutating and adapter-ready; KES/KMS adapters own persistence, promotion, and any external writes.",
  };
}

export function buildAutoresearchAkEvidencePacket(input: {
  cwd: string;
  taskId: number;
}): AutoresearchAkEvidencePacket {
  if (!Number.isInteger(input.taskId) || input.taskId < 1) {
    throw new Error("AK evidence export requires an exact positive integer taskId.");
  }
  const closeout = buildAutoresearchSegmentCloseout(input.cwd);
  const result = renderAutoresearchAkEvidenceResult(closeout);
  const adapterBoundary =
    "AK evidence packet is non-mutating and task-bound; the controller must explicitly call the AK/evidence owner surface to record it.";
  return {
    packetKind: "autoresearch.ak_evidence.v1",
    adapterContractVersion: 1,
    targetKinds: ["ak", "task_system", "evidence_ledger"],
    taskId: input.taskId,
    checkType: "autoresearch:segment_closeout",
    result,
    closeout,
    suggestedToolCall: `evidence_record({ task_id: ${input.taskId}, check_type: "autoresearch:segment_closeout", result: ${JSON.stringify(result)} })`,
    adapterBoundary,
    evidenceBoundary: adapterBoundary,
  };
}

export function buildAutoresearchSegmentCloseout(cwd: string): AutoresearchSegmentCloseout {
  const resolvedCwd = path.resolve(cwd);
  const paths = resolveAutoresearchPaths(resolvedCwd);
  const { entries, invalidLineCount } = loadReceiptLog(resolvedCwd);
  const status = buildAutoresearchRuntimeStatusFromEntries(
    resolvedCwd,
    paths,
    entries,
    invalidLineCount,
    { persistSnapshot: false },
  );
  const currentSegment = getCurrentSegment(entries);
  const successfulRuns = currentSegment.runs.filter(isSuccessfulMetricRun);
  const candidateBindings = currentSegment.runs
    .map((run) => run.experiment?.candidate)
    .filter((binding): binding is AutoresearchCandidateBinding => Boolean(binding));

  const adapterBoundary =
    "Segment closeout is package-local empirical evidence only; promote to AK evidence, KES learning, or another target through an explicit adapter or owner surface.";

  return {
    packetKind: "autoresearch.closeout.v1",
    adapterContractVersion: 1,
    targetKinds: ["adapter_source", "evidence", "learning", "task_system", "knowledge_base"],
    cwd: resolvedCwd,
    receiptPath: paths.jsonlPath,
    status,
    campaign: status.currentSegment.name,
    metricName: status.currentSegment.metricName,
    metricUnit: status.currentSegment.metricUnit,
    direction: status.currentSegment.direction,
    runCount: status.currentSegment.runCount,
    successfulRunCount: status.currentSegment.successfulRunCount,
    baselineMetric: status.currentSegment.baselineMetric,
    bestMetric: status.currentSegment.bestMetric,
    empiricalDecisionClass: status.currentSegment.empiricalDecisionClass,
    timingInterpretation: status.currentSegment.metricInterpretation,
    empiricalPosture: status.empiricalPosture,
    runs: currentSegment.runs.map((run) => ({
      iteration: run.iteration ?? null,
      status: run.status,
      runKind: run.runKind ?? "ordinary",
      empiricalDecisionClass:
        run.empiricalDecisionClass ??
        classifyRunEmpiricalDecision(
          run,
          successfulRuns,
          currentSegment.config,
          status.currentSegment.metricInterpretation,
        ),
      metric: run.metric,
      description: run.description,
      timestamp: run.timestamp,
      checks: describeChecksState(run),
      experiment: run.experiment ?? null,
    })),
    candidateBindings,
    recommendedAction: recommendSegmentCloseoutAction(status.currentSegment.empiricalDecisionClass),
    adapterBoundary,
    evidenceBoundary: adapterBoundary,
  };
}

function formatAutoresearchPeerLaneRecommendations(input: {
  cwd?: string;
  runStatus?: RunStatus | null;
  decisionSummary?: AutoresearchRunDecisionSummary | null;
}): string[] {
  const cwd = input.cwd ?? "/path/to/campaign";
  const failedOrAmbiguous =
    input.runStatus === "crash" ||
    input.runStatus === "checks_failed" ||
    input.runStatus === "discard" ||
    input.decisionSummary?.status === "blocked";
  const targetFiles = input.decisionSummary?.targetFiles ?? [];
  const candidateFiles = targetFiles.length > 0 ? targetFiles : ["<target files>"];

  return [
    "- pi-autoresearch does not auto-spawn visible peers; the controller/operator chooses whether to launch them.",
    failedOrAmbiguous
      ? `- failed/ambiguous run scout: scout_peer_spawn({ objective: "Inspect the latest pi-autoresearch run artifacts under ${cwd} and recommend one bounded next controller action.", cwd: "${cwd}", reportBack: "manual" })`
      : `- optional scout/reviewer: scout_peer_spawn({ objective: "Review the current pi-autoresearch state under ${cwd} and identify one bounded risk or next experiment.", cwd: "${cwd}", reportBack: "manual" })`,
    `- candidate patch lane: candidate_peer_spawn({ objective: "Try one bounded candidate patch for the current pi-autoresearch hypothesis in an isolated worktree; report diff and check evidence only.", cwd: "${cwd}", filesInScope: ${JSON.stringify(candidateFiles)}, reportBack: "manual" })`,
    `- inherited-context lane when intentional: fork_peer_spawn({ objective: "Continue this autoresearch context in a visible peer for operator-guided exploration.", cwd: "${cwd}" })`,
    "- Peer/intercom messages remain communication only; copy verified findings into receipts, ASI, diary, or AK evidence through the controller-owned surfaces before treating them as evidence.",
  ];
}

export function buildAutoresearchPeerAssistPlan(
  input: BuildAutoresearchPeerAssistInput,
): AutoresearchPeerAssistPlan {
  const cwd = path.resolve(input.cwd);
  const status = buildAutoresearchRuntimeStatus(cwd);
  const targetFiles = normalizeArray(input.targetFiles);
  const offLimits = normalizeArray(input.offLimits);
  const constraints = normalizeArray(input.constraints);
  const reportBack = input.reportBack ?? "manual";
  const requestedLane = input.lane ?? "auto";
  const lastRunStatus = status.currentSegment.lastRunStatus;
  const failedOrAmbiguous =
    lastRunStatus === "crash" ||
    lastRunStatus === "checks_failed" ||
    lastRunStatus === "discard" ||
    status.promptVaultDecisions.lastPostRunDecision?.status === "blocked";

  let lane: AutoresearchPeerAssistLane;
  let reason: string;
  if (requestedLane !== "auto") {
    lane = requestedLane;
    reason = `operator requested ${requestedLane} peer lane`;
  } else if (!status.currentSegment.configured) {
    lane = "none";
    reason = "runtime is not configured yet; bootstrap a campaign before peer assist";
  } else if (failedOrAmbiguous) {
    lane = "scout";
    reason =
      "latest run is failed, ambiguous, or blocked; a read-only scout should diagnose before mutation";
  } else if (targetFiles.length > 0) {
    lane = "candidate";
    reason = "target files are available; an isolated candidate worktree can try one bounded patch";
  } else {
    lane = "scout";
    reason =
      "runtime is configured but lacks a scoped candidate target; scout review is the safest next peer lane";
  }

  const baseObjective =
    input.objective?.trim() ||
    (lane === "candidate"
      ? `Try one bounded candidate patch for ${status.currentSegment.name ?? "the current autoresearch campaign"}; report diff and check evidence only.`
      : lane === "fork"
        ? `Continue this autoresearch context visibly for operator-guided exploration under ${cwd}.`
        : lane === "scout"
          ? `Inspect the current pi-autoresearch state under ${cwd} and recommend one bounded next controller action.`
          : "No peer assist is recommended until the runtime is configured.");

  const parentRequired = reportBack === "intercom" && (lane === "scout" || lane === "candidate");
  let toolName: string | null = null;
  let toolCall: string | null = null;
  if (lane === "scout") {
    toolName = "scout_peer_spawn";
    toolCall = `scout_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)}, reportBack: ${JSON.stringify(reportBack)}${input.parentPeerTarget ? `, parentPeerTarget: ${JSON.stringify(input.parentPeerTarget)}` : ""} })`;
  } else if (lane === "candidate") {
    toolName = "candidate_peer_spawn";
    const files = targetFiles.length > 0 ? targetFiles : ["<target files>"];
    toolCall = `candidate_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)}, filesInScope: ${JSON.stringify(files)}, offLimits: ${JSON.stringify(offLimits)}, constraints: ${JSON.stringify(constraints)}, reportBack: ${JSON.stringify(reportBack)}${input.parentPeerTarget ? `, parentPeerTarget: ${JSON.stringify(input.parentPeerTarget)}` : ""} })`;
  } else if (lane === "fork") {
    toolName = "fork_peer_spawn";
    toolCall = `fork_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)} })`;
  }

  return {
    cwd,
    lane,
    reason,
    objective: baseObjective,
    toolName,
    toolCall,
    reportBack,
    parentPeerTargetRequired: parentRequired,
    status,
    evidenceWarning:
      "Peer/intercom messages are communication only; controller verification is required before receipts, ASI, diary, or AK evidence treat them as evidence.",
  };
}

export function formatAutoresearchPeerAssistPlan(plan: AutoresearchPeerAssistPlan): string {
  return [
    "# PI-AUTORESEARCH PEER ASSIST",
    "",
    `- cwd: ${plan.cwd}`,
    `- lane: ${plan.lane}`,
    `- reason: ${plan.reason}`,
    `- objective: ${plan.objective}`,
    `- tool: ${plan.toolName ?? "(none)"}`,
    `- reportBack: ${plan.reportBack}`,
    `- parentPeerTarget required: ${plan.parentPeerTargetRequired ? "yes" : "no"}`,
    `- machine state: ${plan.status.runtimeProjection.state}`,
    `- latest run: ${formatLastRun(plan.status.currentSegment.lastRunStatus, plan.status.currentSegment.lastRunMetric, plan.status.currentSegment.metricUnit, plan.status.currentSegment.lastRunKind)}`,
    "",
    "## Exact suggested call",
    plan.toolCall ? `\`${plan.toolCall}\`` : "- (none)",
    "",
    "## Evidence warning",
    plan.evidenceWarning,
  ].join("\n");
}

export function exportAutoresearchDashboardHtml(input: {
  cwd: string;
  outputPath?: string;
}): AutoresearchDashboardExportResult {
  const cwd = path.resolve(input.cwd);
  const outputPath = path.resolve(cwd, input.outputPath ?? AUTORESEARCH_DASHBOARD_EXPORT_FILE);
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderAutoresearchDashboardHtml(status, closeout), "utf8");
  return {
    cwd,
    path: outputPath,
    fileUrl: pathToFileURL(outputPath).href,
    refreshedAt: Date.now(),
    status,
  };
}

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

  return [
    "# PI-AUTORESEARCH DASHBOARD",
    "",
    "Read-only operator dashboard. It summarizes campaign posture and next legal surfaces without running a benchmark, spawning peers, mutating worktrees, or promoting evidence.",
    "",
    "## Current posture",
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    `- machine state: ${status.runtimeProjection.state}`,
    `- control state: ${status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
    `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
    `- promotion ready: ${status.empiricalPosture.promotionReady ? "yes" : "no"}`,
    `- recommended next: ${status.empiricalPosture.recommendedNextAction}`,
    "",
    "## Metric contract",
    `- campaign: ${segment.name ?? "(not configured)"}`,
    `- primary metric: ${metricLine}`,
    `- success threshold: ${formatMetricThresholdValue(segment.metricThreshold, segment.metricUnit)}`,
    `- benchmark command: ${segment.benchmarkCommand ?? "(unset)"}`,
    `- checks command: ${segment.checksCommand ?? "(none)"}`,
    `- runs: ${runLine}`,
    `- baseline: ${formatMetricValue(segment.baselineMetric, segment.metricUnit)}`,
    `- best: ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`,
    `- confidence: ${formatConfidenceValue(segment.confidence)}`,
    `- timing interpretation: ${formatMetricInterpretation(segment.metricInterpretation, segment.metricUnit)}`,
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
    "## Next legal surfaces",
    `- start/review: ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, objective: "<bounded objective>", runMode: "plan_only", peerMode: "plan", candidatePolicy: { mode: "worktree", keep: "preserve_branch", discard: "suggest_cleanup", rewind: "reset_worktree_to_base" } })`,
    `- full status: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "status" })`,
    `- resume plan: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "resume_plan" })`,
    `- resume apply plan-only proposal: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "resume_apply_plan" })`,
    `- closeout packet: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "closeout" })`,
    `- candidate bind: ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, candidateWorktree: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "plan_run" })`,
    `- candidate decision: ${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "status" })`,
    `- control gate: ${AUTORESEARCH_CONTROL_TOOL_NAME}({ cwd: ${JSON.stringify(status.cwd ?? process.cwd())}, action: "status" })`,
    "",
    "## Boundaries",
    "- peers are planned or visibly launched only through explicit peer surfaces.",
    "- worktree cleanup, merge, branch materialization, AK/KES/evidence writes, and durable promotion stay outside this dashboard.",
  ].join("\n");
}

function renderAutoresearchDashboardHtml(
  status: AutoresearchRuntimeStatus,
  closeout: AutoresearchSegmentCloseout,
): string {
  const segment = status.currentSegment;
  const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd: closeout.cwd });
  const candidateDecisionLabel = candidateDecision.candidate?.label ?? "no candidate bound yet";
  const resumePlan = buildAutoresearchResumePlanFromStatus(closeout.cwd, status);
  const resumePlanBlockers =
    resumePlan.blockingReasons.length > 0 ? resumePlan.blockingReasons.join("; ") : "none";
  const resumeApplyPlan = buildAutoresearchResumeApplyPlan(closeout.cwd);
  const resumeApplyPlanBlockers =
    resumeApplyPlan.blockedReasons.length > 0 ? resumeApplyPlan.blockedReasons.join("; ") : "none";
  const generatedAt = new Date().toLocaleString();
  const metricUnit = closeout.metricUnit || segment.metricUnit || "";
  const metricName = closeout.metricName ?? segment.metricName ?? "metric";
  const baselineMetric = closeout.baselineMetric ?? segment.baselineMetric;
  const bestMetric = closeout.bestMetric ?? segment.bestMetric;
  const direction = closeout.direction ?? segment.direction;
  const improvement = computeAutoresearchDashboardImprovement({
    baseline: baselineMetric,
    best: bestMetric,
    direction,
  });
  const rows = closeout.runs.slice(-80);
  const tableRows = rows
    .slice()
    .reverse()
    .map((run) => {
      const statusClass = cssClassToken(run.status);
      const decisionClass = cssClassToken(run.empiricalDecisionClass);
      return `<tr${run.metric === bestMetric && bestMetric !== null ? ` class="best-row"` : ""}><td class="mono">${escapeHtml(String(run.iteration ?? "-"))}</td><td><span class="status ${statusClass}">${escapeHtml(run.status)}</span></td><td>${escapeHtml(run.runKind)}</td><td class="mono metric-cell">${escapeHtml(formatAutoresearchDashboardNumber(run.metric, metricUnit))}</td><td><span class="decision ${decisionClass}">${escapeHtml(run.empiricalDecisionClass)}</span></td><td>${escapeHtml(run.description)}</td></tr>`;
    })
    .join("\n");
  const chartData = rows.map((run) => ({
    iteration: run.iteration,
    status: run.status,
    runKind: run.runKind,
    decision: run.empiricalDecisionClass,
    metric: run.metric,
    description: run.description,
  }));
  const shareSvg = renderAutoresearchDashboardShareSvg({
    metricName,
    posture: status.empiricalPosture.classification,
    improvement: improvement.label,
    baseline: formatAutoresearchDashboardNumber(baselineMetric, metricUnit),
    best: formatAutoresearchDashboardNumber(bestMetric, metricUnit),
    recommendedNext: status.empiricalPosture.recommendedNextAction,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="2" />
<title>pi-autoresearch dashboard</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0d1117;
  --panel: #161b22;
  --panel-2: #11161c;
  --text: #c9d1d9;
  --muted: #8b949e;
  --line: #30363d;
  --good: #3fb950;
  --bad: #f85149;
  --accent: #58a6ff;
  --warn: #d29922;
  --purple: #bc8cff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: radial-gradient(circle at top left, rgba(88,166,255,.12), transparent 34rem), var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.title { margin: 0; font-size: 24px; color: #fff; letter-spacing: -.02em; }
.meta { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.badge { border: 1px solid var(--line); background: rgba(22,27,34,.72); border-radius: 999px; color: var(--muted); font-size: 12px; padding: 5px 9px; }
.badge.good { color: var(--good); border-color: rgba(63,185,80,.42); background: rgba(63,185,80,.1); }
.badge.warn { color: var(--warn); border-color: rgba(210,153,34,.38); background: rgba(210,153,34,.1); }
.share-btn { background: #21262d; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.share-btn:hover { background: #30363d; }
.cards { margin-top: 16px; display: grid; gap: 10px; grid-template-columns: minmax(240px, 2.2fr) minmax(220px, 1.8fr) minmax(120px, .8fr) minmax(120px, .8fr); }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.22); }
.card-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.card-value { margin-top: 8px; font-size: 24px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.card-value.good { color: var(--good); }
.card-value.bad { color: var(--bad); }
.card-value.warn { color: var(--warn); }
.card-copy { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.chart-panel, .table-panel { margin-top: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.chart-panel { padding: 10px; }
.chart-head { display: flex; justify-content: space-between; gap: 12px; padding: 4px 4px 10px; color: var(--muted); font-size: 12px; }
.chart-wrap { height: 300px; position: relative; }
canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
.chart-tooltip { position: absolute; pointer-events: none; opacity: 0; background: rgba(20,20,20,.95); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 10px 12px; min-width: 190px; box-shadow: 0 8px 28px rgba(0,0,0,.45); transform: translateY(4px); transition: opacity .15s ease, transform .15s ease; z-index: 4; }
.chart-tooltip.visible { opacity: 1; transform: translateY(0); }
.chart-tooltip .tt-run { font-size: 10px; color: rgba(255,255,255,.45); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 4px; font-weight: 600; }
.chart-tooltip .tt-metric { font-size: 18px; color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.chart-tooltip .tt-status { display: inline-block; margin-top: 6px; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 600; color: var(--accent); background: rgba(88,166,255,.15); }
.chart-tooltip .tt-desc { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.62); font-size: 11px; line-height: 1.35; }
.chart-crosshair { position: absolute; top: 0; width: 1px; background: rgba(255,255,255,.15); pointer-events: none; opacity: 0; transition: opacity .12s ease; z-index: 3; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th { position: sticky; top: 0; text-align: left; background: var(--panel-2); color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
tbody td { border-bottom: 1px solid #222a33; padding: 10px; vertical-align: top; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.metric-cell { color: #fff; }
.status, .decision { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; display: inline-block; background: rgba(88,166,255,.12); color: var(--accent); }
.status.baseline, .decision.baseline { color: var(--muted); background: rgba(139,148,158,.12); }
.status.keep, .status.candidate, .decision.candidate_improvement, .decision.threshold_satisfied, .decision.threshold_preserved, .decision.default_promotion_candidate { color: var(--good); background: rgba(63,185,80,.15); }
.status.discard, .decision.candidate_regression, .decision.threshold_regressed { color: #ff9b95; background: rgba(248,81,73,.15); }
.status.crash, .status.blocked { color: var(--bad); background: rgba(248,81,73,.25); }
.status.checks_failed, .decision.candidate_neutral { color: var(--warn); background: rgba(210,153,34,.18); }
.best-row { background: rgba(63,185,80,.08); }
.best-row td { border-bottom-color: rgba(63,185,80,.22); }
.footer { margin-top: 14px; color: var(--muted); font-size: 13px; line-height: 1.55; }
code { color: #a5d6ff; }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(140px, 1fr)); } .header { flex-direction: column; } }
@media (max-width: 560px) { .cards { grid-template-columns: 1fr; } .page { padding: 16px; } }
</style>
</head>
<body>
<div class="page" id="capture-root">
  <div class="header">
    <div>
      <h1 class="title">🔬 pi-autoresearch live dashboard${segment.name ? `: ${escapeHtml(segment.name)}` : ""}</h1>
      <div class="meta">Auto-refreshes every 2s while Pi rewrites this file. Generated ${escapeHtml(generatedAt)}.</div>
      <div class="badge-row">
        <span class="badge">machine: ${escapeHtml(status.runtimeProjection.state)}</span>
        <span class="badge ${status.empiricalPosture.promotionReady ? "good" : "warn"}">promotion: ${status.empiricalPosture.promotionReady ? "ready" : "not ready"}</span>
        <span class="badge">posture: ${escapeHtml(status.empiricalPosture.classification)}</span>
        <span class="badge">cwd: ${escapeHtml(path.basename(closeout.cwd))}</span>
      </div>
    </div>
    <button class="share-btn" id="share-btn" type="button">Export as image ↓</button>
  </div>

  <div class="cards">
    <section class="card"><div class="card-label">Baseline → Best</div><div class="card-value">${escapeHtml(formatAutoresearchDashboardNumber(baselineMetric, metricUnit))} → ${escapeHtml(formatAutoresearchDashboardNumber(bestMetric, metricUnit))}</div></section>
    <section class="card"><div class="card-label">Improvement</div><div class="card-value ${improvement.className}">${escapeHtml(improvement.label)}</div></section>
    <section class="card"><div class="card-label">Runs</div><div class="card-value">${closeout.runCount}</div></section>
    <section class="card"><div class="card-label">Confidence</div><div class="card-value ${segment.confidence !== null && segment.confidence < 1 ? "warn" : ""}">${escapeHtml(segment.confidence === null ? "—" : `${segment.confidence.toFixed(1)}×`)}</div></section>
  </div>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Recommended next</div>
    <div class="card-value" style="font-size:18px; font-family:inherit">${escapeHtml(status.empiricalPosture.recommendedNextAction)}</div>
    <div class="card-copy">${escapeHtml(status.empiricalPosture.summary)}</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Candidate decision</div>
    <div class="card-value" style="font-size:18px">${escapeHtml(candidateDecision.recommendedDecision)}</div>
    <div class="card-copy">${escapeHtml(candidateDecisionLabel)} — ${escapeHtml(candidateDecision.recommendationReason)}</div>
    <div class="card-copy"><code>${escapeHtml(candidateDecision.exactNextCalls[0] ?? `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "status" })`)}</code></div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Resume plan</div>
    <div class="card-value ${resumePlan.reusable ? "good" : "warn"}" style="font-size:18px">${resumePlan.reusable ? "reusable foreground plan" : "blocked until reviewed"}</div>
    <div class="card-copy">${escapeHtml(resumePlan.packetKind)} · snapshot=${escapeHtml(resumePlan.snapshotReuse)} · control=${escapeHtml(resumePlan.controlState)} · blockers=${escapeHtml(resumePlanBlockers)}</div>
    <div class="card-copy"><code>${escapeHtml(resumePlan.wouldRun ?? `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "resume_plan" })`)}</code></div>
    <div class="card-copy">Read-only: no benchmark run, resume_apply, daemon, peer launch, candidate mutation, or external evidence/learning write.</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Resume apply plan-only proposal</div>
    <div class="card-value ${resumeApplyPlan.planReady ? "warn" : "bad"}" style="font-size:18px">${resumeApplyPlan.planReady ? "proposal ready, execution not authorized" : "proposal blocked"}</div>
    <div class="card-copy">${escapeHtml(resumeApplyPlan.packetKind)} · execution authorized=${resumeApplyPlan.executionAuthorized ? "yes" : "no"} · blockers=${escapeHtml(resumeApplyPlanBlockers)}</div>
    <div class="card-copy"><code>${escapeHtml(resumeApplyPlan.futureForegroundCall ?? `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "resume_apply_plan" })`)}</code></div>
    <div class="card-copy">Plan-only: execution is not authorized here; use autoresearch_runtime_resume_apply only with exact foreground confirmation and explicit budgets.</div>
  </section>

  <div class="cards">
    <section class="card"><div class="card-label">Campaign</div><div class="card-value" style="font-size:16px">${escapeHtml(segment.name ?? "unconfigured")}</div></section>
    <section class="card"><div class="card-label">Metric</div><div class="card-value" style="font-size:16px">★ ${escapeHtml(metricName)} ${escapeHtml(direction ?? "")} ${metricUnit ? `(${escapeHtml(metricUnit)})` : ""}</div></section>
    <section class="card"><div class="card-label">Success threshold</div><div class="card-value" style="font-size:16px">${escapeHtml(formatMetricThresholdValue(segment.metricThreshold, metricUnit))}</div></section>
    <section class="card"><div class="card-label">Benchmark</div><div class="card-value" style="font-size:14px"><code>${escapeHtml(segment.benchmarkCommand ?? "(unset)")}</code></div></section>
    <section class="card"><div class="card-label">Checks</div><div class="card-value" style="font-size:14px"><code>${escapeHtml(segment.checksCommand ?? "(none)")}</code></div></section>
  </div>

  <section class="chart-panel">
    <div class="chart-head"><span>Metric trajectory</span><span class="mono">${escapeHtml(metricName)} / ${escapeHtml(direction ?? "direction unset")}</span></div>
    <div class="chart-wrap">
      <canvas id="metric-chart" aria-label="Autoresearch metric trajectory"></canvas>
      <div class="chart-crosshair" id="chart-crosshair"></div>
      <div class="chart-tooltip" id="chart-tooltip"></div>
    </div>
  </section>

  <section class="table-panel">
    <table><thead><tr><th>#</th><th>Status</th><th>Kind</th><th>★ ${escapeHtml(metricName)}</th><th>Decision</th><th>Description</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6" class="muted">No runs recorded yet.</td></tr>`}</tbody></table>
  </section>

  <section class="card footer">
    <strong>Boundary:</strong> Browser export is read-only. It does not run benchmarks, spawn peers, mutate worktrees, write AK/KES evidence, or promote candidates.<br />
    <strong>Candidate policy:</strong> mode=worktree; keep=preserve_branch; discard=suggest_cleanup; rewind=reset_worktree_to_base. Replay Fabric observes history; ASC rewind is live session recovery.
  </section>
</div>
<script>
const DASHBOARD_DATA = ${escapeScriptJson(JSON.stringify({ rows: chartData, metricUnit, metricName, direction }))};
const DASHBOARD_SHARE_SVG = ${escapeScriptJson(JSON.stringify(shareSvg))};
const canvas = document.getElementById('metric-chart');
const tooltip = document.getElementById('chart-tooltip');
const crosshair = document.getElementById('chart-crosshair');
function colorForStatus(status) {
  if (status === 'keep' || status === 'candidate') return '#3fb950';
  if (status === 'discard' || status === 'crash' || status === 'blocked') return '#f85149';
  if (status === 'checks_failed') return '#d29922';
  return '#58a6ff';
}
function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const body = Math.abs(n) >= 100 ? n.toFixed(0) : Number.isInteger(n) ? String(n) : n.toFixed(2);
  return body + (DASHBOARD_DATA.metricUnit || '');
}
function drawChart() {
  if (!canvas) return;
  const rows = DASHBOARD_DATA.rows || [];
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const pad = { left: 44, right: 16, top: 18, bottom: 34 };
  const plotW = Math.max(1, w - pad.left - pad.right);
  const plotH = Math.max(1, h - pad.top - pad.bottom);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#8b949e';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }
  if (rows.length === 0) {
    ctx.fillText('No metric data yet', pad.left, pad.top + 24);
    return;
  }
  const values = rows.map(r => Number(r.metric)).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const points = rows.map((row, i) => {
    const x = pad.left + (rows.length === 1 ? plotW / 2 : (plotW * i) / (rows.length - 1));
    const y = pad.top + plotH - ((Number(row.metric) - min) / (max - min)) * plotH;
    return { ...row, x, y };
  });
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();
  for (const p of points) {
    ctx.beginPath();
    ctx.fillStyle = colorForStatus(p.status);
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#8b949e';
  ctx.fillText(formatMetric(max), 6, pad.top + 4);
  ctx.fillText(formatMetric(min), 6, pad.top + plotH);
  canvas._points = points;
}
canvas?.addEventListener('mousemove', (event) => {
  const points = canvas._points || [];
  if (points.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  let nearest = points[0];
  for (const p of points) if (Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p;
  crosshair.style.left = nearest.x + 'px';
  crosshair.style.height = rect.height + 'px';
  crosshair.style.opacity = '1';
  tooltip.classList.add('visible');
  tooltip.style.left = Math.min(rect.width - 220, nearest.x + 12) + 'px';
  tooltip.style.top = Math.max(8, nearest.y - 24) + 'px';
  tooltip.innerHTML = '<div class="tt-run">run ' + (nearest.iteration ?? '—') + ' / ' + nearest.runKind + '</div><div class="tt-metric">' + formatMetric(nearest.metric) + '</div><span class="tt-status">' + nearest.status + '</span><div class="tt-desc">' + (nearest.description || '') + '</div>';
});
canvas?.addEventListener('mouseleave', () => { tooltip.classList.remove('visible'); crosshair.style.opacity = '0'; });
window.addEventListener('resize', drawChart);
drawChart();
document.getElementById('share-btn')?.addEventListener('click', async () => {
  try {
    const blob = new Blob([DASHBOARD_SHARE_SVG], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pi-autoresearch-share-card.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.warn('share export failed', error);
  }
});
</script>
</body>
</html>\n`;
}

function computeAutoresearchDashboardImprovement(input: {
  baseline: number | null;
  best: number | null;
  direction: MetricDirection | null;
}): { label: string; className: string } {
  if (input.baseline === null || input.best === null || input.baseline === 0) {
    return { label: "—", className: "" };
  }
  const rawPercent = ((input.best - input.baseline) / input.baseline) * 100;
  const improved = input.direction ? isBetter(input.best, input.baseline, input.direction) : false;
  const signed = rawPercent > 0 ? `+${rawPercent.toFixed(1)}%` : `${rawPercent.toFixed(1)}%`;
  return { label: signed, className: improved ? "good" : rawPercent === 0 ? "warn" : "bad" };
}

function formatAutoresearchDashboardNumber(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted =
    Math.abs(value) >= 100
      ? value.toFixed(0)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);
  return `${formatted}${unit}`;
}

function cssClassToken(value: string): string {
  return value.replace(/[^a-z0-9_-]/giu, "_").toLowerCase();
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function renderAutoresearchDashboardShareSvg(input: {
  metricName: string;
  posture: string;
  improvement: string;
  baseline: string;
  best: string;
  recommendedNext: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1117"/><circle cx="1020" cy="-40" r="280" fill="#58a6ff" opacity="0.16"/><text x="48" y="82" fill="#fff" font-size="34" font-family="system-ui">pi-autoresearch</text><text x="48" y="132" fill="#8b949e" font-size="18" font-family="system-ui">${escapeHtml(input.metricName)} · ${escapeHtml(input.posture)}</text><text x="48" y="240" fill="#3fb950" font-size="64" font-family="monospace">${escapeHtml(input.improvement)}</text><text x="48" y="310" fill="#c9d1d9" font-size="24" font-family="monospace">${escapeHtml(input.baseline)} → ${escapeHtml(input.best)}</text><text x="48" y="550" fill="#58a6ff" font-size="18" font-family="system-ui">${escapeHtml(input.recommendedNext).slice(0, 120)}</text></svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAutoresearchResumePlan(cwd: string): AutoresearchResumePlan {
  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  return buildAutoresearchResumePlanFromStatus(path.resolve(cwd), status);
}

function buildAutoresearchResumePlanFromStatus(
  cwd: string,
  status: AutoresearchRuntimeStatus,
): AutoresearchResumePlan {
  const resolvedCwd = path.resolve(cwd);
  const blockingReasons: string[] = [];
  if (!status.currentSegment.configured) {
    blockingReasons.push("no configured segment exists to resume");
  }
  if (status.runtimeSnapshot.reuse !== "reused") {
    blockingReasons.push(`runtime snapshot is not reusable: ${status.runtimeSnapshot.reuse}`);
  }
  if (status.runtimeProjection.state !== "ready") {
    blockingReasons.push(`machine state is ${status.runtimeProjection.state}, not ready`);
  }
  if (status.control.kind === "awaiting_operator") {
    blockingReasons.push(
      `awaiting explicit operator control: ${formatAllowedActions(status.control.allowedActions)}`,
    );
  }
  if (["stop", "rebaseline", "finalize"].includes(status.control.kind)) {
    blockingReasons.push(`operator control state is ${status.control.kind}`);
  }
  const reusable = blockingReasons.length === 0;
  const goal = status.currentSegment.name ?? "<campaign-goal>";
  return {
    packetKind: "autoresearch.resume_plan.v1",
    cwd: resolvedCwd,
    campaign: status.currentSegment.name,
    segmentKey: status.runtimeSnapshot.segmentKey,
    runtimeKey: status.runtimeSnapshot.runtimeKey,
    snapshotReuse: status.runtimeSnapshot.reuse,
    reusable,
    machineState: status.runtimeProjection.state,
    controlState: status.control.kind,
    allowedControlActions: [...status.control.allowedActions],
    lastStopReason: status.control.reason ?? status.runtimeProjection.blockedReason ?? "(none)",
    remainingBudget: "operator_required",
    wouldRun: reusable
      ? `autoresearch_runtime_loop({ cwd: ${JSON.stringify(resolvedCwd)}, goal: ${JSON.stringify(goal)}, maxIterations: <explicit>, maxWallClockMinutes: <explicit> })`
      : null,
    blockingReasons,
    authorityWarnings: [
      "resume_plan is read-only and does not run benchmarks",
      "resume_apply must be a foreground operator-approved action if implemented later",
      "no hidden daemon, background restart, peer launch, candidate lifecycle mutation, or external evidence/learning write is authorized",
    ],
  };
}

export function formatAutoresearchResumePlan(plan: AutoresearchResumePlan): string {
  return [
    "# PI-AUTORESEARCH RESUME PLAN",
    "",
    "Read-only longer-campaign continuation plan. It does not run benchmarks, resume a loop, launch peers, mutate worktrees, or write external evidence.",
    "",
    `- packet kind: ${plan.packetKind}`,
    `- cwd: ${plan.cwd}`,
    `- campaign: ${plan.campaign ?? "(none)"}`,
    `- segment key: ${plan.segmentKey ?? "(none)"}`,
    `- runtime key: ${plan.runtimeKey ?? "(none)"}`,
    `- snapshot reuse: ${plan.snapshotReuse}`,
    `- reusable: ${plan.reusable ? "yes" : "no"}`,
    `- machine state: ${plan.machineState}`,
    `- control state: ${plan.controlState}`,
    `- allowed control actions: ${plan.allowedControlActions.join(", ") || "(none)"}`,
    `- last stop/control reason: ${plan.lastStopReason}`,
    `- remaining budget: ${plan.remainingBudget}`,
    `- would run: ${plan.wouldRun ?? "(blocked)"}`,
    "",
    "## Blocking reasons",
    ...(plan.blockingReasons.length > 0
      ? plan.blockingReasons.map((reason) => `- ${reason}`)
      : ["- (none)"]),
    "",
    "## Authority warnings",
    ...plan.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

function formatAutoresearchResumePlanSummaryLines(plan: AutoresearchResumePlan): string[] {
  return [
    `- packet kind: ${plan.packetKind}`,
    `- reusable: ${plan.reusable ? "yes" : "no"}`,
    `- snapshot reuse: ${plan.snapshotReuse}`,
    `- machine/control: ${plan.machineState} / ${plan.controlState}`,
    `- last stop/control reason: ${plan.lastStopReason}`,
    `- would run: ${plan.wouldRun ?? "(blocked)"}`,
    `- blocking reasons: ${plan.blockingReasons.length > 0 ? plan.blockingReasons.join("; ") : "(none)"}`,
    "- boundary: resume_plan is read-only; no benchmark run, resume_apply, daemon, peer launch, candidate mutation, or external evidence/learning write is authorized.",
  ];
}

export function buildAutoresearchResumeApplyPlan(cwd: string): AutoresearchResumeApplyPlan {
  const resumePlan = buildAutoresearchResumePlan(cwd);
  const blockedReasons = [...resumePlan.blockingReasons];
  if (!resumePlan.reusable) {
    blockedReasons.unshift(
      "resume_plan is not reusable; inspect and resolve resume-plan blockers first",
    );
  }
  const planReady = resumePlan.reusable && blockedReasons.length === 0;
  const futureExecutorContract =
    "A callable foreground resume executor exists as autoresearch_runtime_resume_apply. It must run only in the active tool call, require exact segmentKey/runtimeKey, explicit maxIterations, explicit maxWallClockMinutes, and operatorConfirmation=RUN FOREGROUND RESUME, then re-check the same snapshot/runtime/control gates immediately before execution while preserving external AK/KES/Prompt Vault/candidate authority seams.";
  const futureForegroundCall = planReady
    ? `${AUTORESEARCH_RESUME_APPLY_TOOL_NAME}({ cwd: ${JSON.stringify(resumePlan.cwd)}, segmentKey: ${JSON.stringify(resumePlan.segmentKey)}, runtimeKey: ${JSON.stringify(resumePlan.runtimeKey)}, maxIterations: <explicit>, maxWallClockMinutes: <explicit>, operatorConfirmation: "RUN FOREGROUND RESUME" })`
    : null;

  return {
    packetKind: "autoresearch.resume_apply_plan.v1",
    cwd: resumePlan.cwd,
    action: "plan_only",
    planReady,
    executionAuthorized: false,
    executorAvailable: true,
    resumePlan,
    requiredOperatorInputs: [
      "explicit maxIterations",
      "explicit maxWallClockMinutes",
      "fresh operator confirmation immediately before the foreground executor",
      "controller verification that no external AK/KES/notes/issue/candidate mutation is implied",
    ],
    preflightChecks: [
      "rebuild resume_plan and require snapshotReuse=reused",
      "require machineState=ready",
      "require no awaiting_operator, stop, rebaseline, or finalize control gate",
      "require explicit foreground budgets before any run",
      "stop if Prompt Vault, checks, or posture gates request blocked/rebaseline/finalize",
    ],
    futureExecutorContract,
    futureForegroundCall,
    blockedReasons,
    authorityWarnings: [
      "resume_apply_plan is read-only and authorizes no benchmark run by itself",
      "autoresearch_runtime_resume_apply is the only callable executor and still requires exact explicit foreground confirmation",
      "no daemon, background restart, peer launch, candidate lifecycle mutation, package-local promotion, or external evidence/learning write is authorized",
    ],
  };
}

export function formatAutoresearchResumeApplyPlan(plan: AutoresearchResumeApplyPlan): string {
  return [
    "# PI-AUTORESEARCH RESUME APPLY PLAN",
    "",
    "Plan-only proposal for the explicit foreground resume executor. This surface itself does not run benchmarks, resume a loop, launch peers, mutate worktrees, or write external evidence.",
    "",
    `- packet kind: ${plan.packetKind}`,
    `- action: ${plan.action}`,
    `- cwd: ${plan.cwd}`,
    `- plan ready: ${plan.planReady ? "yes" : "no"}`,
    `- execution authorized: ${plan.executionAuthorized ? "yes" : "no"}`,
    `- executor available: ${plan.executorAvailable ? "yes" : "no"}`,
    `- foreground apply call: ${plan.futureForegroundCall ?? "(blocked)"}`,
    `- executor contract: ${plan.futureExecutorContract}`,
    "",
    "## Resume plan summary",
    ...formatAutoresearchResumePlanSummaryLines(plan.resumePlan),
    "",
    "## Required operator inputs",
    ...plan.requiredOperatorInputs.map((input) => `- ${input}`),
    "",
    "## Preflight checks",
    ...plan.preflightChecks.map((check) => `- ${check}`),
    "",
    "## Blocked reasons",
    ...(plan.blockedReasons.length > 0
      ? plan.blockedReasons.map((reason) => `- ${reason}`)
      : ["- (none)"]),
    "",
    "## Authority warnings",
    ...plan.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

function formatAutoresearchResumeApplyPlanSummaryLines(
  plan: AutoresearchResumeApplyPlan,
): string[] {
  return [
    `- packet kind: ${plan.packetKind}`,
    `- plan ready: ${plan.planReady ? "yes" : "no"}`,
    `- execution authorized: ${plan.executionAuthorized ? "yes" : "no"}`,
    `- executor available: ${plan.executorAvailable ? "yes" : "no"}`,
    `- foreground apply call: ${plan.futureForegroundCall ?? "(blocked)"}`,
    `- blocked reasons: ${plan.blockedReasons.length > 0 ? plan.blockedReasons.join("; ") : "(none)"}`,
    "- boundary: resume_apply_plan is read-only; only autoresearch_runtime_resume_apply may run, and only with exact foreground confirmation.",
  ];
}

export async function executeAutoresearchResumeApply(
  input: ExecuteAutoresearchResumeApplyInput,
): Promise<ExecuteAutoresearchResumeApplyResult> {
  const cwd = path.resolve(input.cwd);
  if (input.operatorConfirmation !== "RUN FOREGROUND RESUME") {
    throw new Error('operatorConfirmation must exactly equal "RUN FOREGROUND RESUME"');
  }
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (!Number.isFinite(input.maxWallClockMinutes) || input.maxWallClockMinutes <= 0) {
    throw new Error("maxWallClockMinutes must be a positive number");
  }

  const applyPlan = buildAutoresearchResumeApplyPlan(cwd);
  if (!applyPlan.planReady) {
    throw new Error(
      `resume_apply is blocked: ${applyPlan.blockedReasons.join("; ") || "plan is not ready"}`,
    );
  }
  if (applyPlan.resumePlan.segmentKey !== input.segmentKey) {
    throw new Error("segmentKey does not match the current reusable resume plan");
  }
  if (applyPlan.resumePlan.runtimeKey !== input.runtimeKey) {
    throw new Error("runtimeKey does not match the current reusable resume plan");
  }

  const loopResult = await executeAutoresearchLoop({
    cwd,
    goal: applyPlan.resumePlan.campaign ?? "resume-apply",
    maxIterations: input.maxIterations,
    maxWallClockMinutes: input.maxWallClockMinutes,
    description:
      input.description ??
      `foreground resume for ${applyPlan.resumePlan.campaign ?? "current autoresearch campaign"}`,
    timeoutSeconds: input.timeoutSeconds,
    checksTimeoutSeconds: input.checksTimeoutSeconds,
    postureCommand: input.postureCommand,
    postureTimeoutSeconds: input.postureTimeoutSeconds,
    peerMode: "off",
    signal: input.signal,
    onProgress: input.onProgress,
  });

  return {
    cwd,
    action: "resume_apply",
    executionAuthorized: true,
    applyPlan,
    loopResult,
    authorityWarnings: [
      "resume_apply ran only inside this foreground tool call with explicit budgets and exact operator confirmation",
      "no daemon, background restart, peer launch, candidate lifecycle mutation, package-local promotion, or external evidence/learning write was authorized",
    ],
  };
}

export function formatAutoresearchResumeApplyResult(
  result: ExecuteAutoresearchResumeApplyResult,
): string {
  return [
    "# PI-AUTORESEARCH RESUME APPLY",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- execution authorized: ${result.executionAuthorized ? "yes" : "no"}`,
    `- completed iterations: ${result.loopResult.completedIterations}/${result.loopResult.requestedIterations}`,
    `- stop reason: ${result.loopResult.stopReason}`,
    `- elapsed: ${result.loopResult.elapsedSeconds.toFixed(2)}s`,
    `- final machine state: ${result.loopResult.status.runtimeProjection.state}`,
    "",
    "## Applied plan",
    ...formatAutoresearchResumeApplyPlanSummaryLines(result.applyPlan),
    "",
    "## Loop result",
    ...formatAutoresearchLoopResult(result.loopResult).split("\n"),
    "",
    "## Authority warnings",
    ...result.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function formatAutoresearchStatusText(status: AutoresearchRuntimeStatus): string {
  const currentSegmentLines = status.currentSegment.configured
    ? [
        `- configured campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
        `- primary metric: ${status.currentSegment.metricName ?? "(unset)"} (${status.currentSegment.metricUnit || "unitless"}, ${status.currentSegment.direction ?? "unset"} is better)`,
        `- success threshold: ${formatMetricThresholdValue(status.currentSegment.metricThreshold, status.currentSegment.metricUnit)}`,
        `- benchmark command: ${status.currentSegment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${status.currentSegment.runCount} total / ${status.currentSegment.successfulRunCount} successful`,
        `- baseline metric: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
        `- best metric: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(status.currentSegment.confidence)}`,
        `- empirical decision: ${status.currentSegment.empiricalDecisionClass}`,
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
        `- timing interpretation: ${formatMetricInterpretation(status.currentSegment.metricInterpretation, status.currentSegment.metricUnit)}`,
        `- last run: ${formatLastRun(status.currentSegment.lastRunStatus, status.currentSegment.lastRunMetric, status.currentSegment.metricUnit, status.currentSegment.lastRunKind)}`,
      ]
    : [
        "- configured campaign: no",
        "- current-segment runs: 0 total / 0 successful",
        "- baseline metric: (n/a)",
        "- best metric: (n/a)",
        "- confidence: (n/a)",
        "- empirical decision: not_evaluated",
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
        "- last run: (none)",
      ];

  const projection = status.runtimeProjection;

  return [
    "# PI-AUTORESEARCH STATUS",
    "",
    `- phase: ${status.phase}`,
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    status.receiptPath ? `- receipt log: ${status.receiptPath}` : "- receipt log: (unresolved)",
    projection.ledgerPath
      ? `- event ledger: ${projection.ledgerPath}`
      : "- event ledger: (unresolved)",
    status.runtimeSnapshot.path
      ? `- runtime snapshot: ${status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- local artifacts: ${status.localArtifacts.join(", ")}`,
    `- receipt entry types: ${status.receiptEntryTypes.join(", ")}`,
    `- benchmark script present: ${status.hasBenchmarkScript ? "yes" : "no"}`,
    `- checks script present: ${status.hasChecksScript ? "yes" : "no"}`,
    `- invalid receipt lines: ${status.invalidReceiptLines}`,
    `- machine state: ${projection.state}`,
    `- machine resume state: ${projection.resumeState ?? "(none)"}`,
    `- machine blocked reason: ${projection.blockedReason ?? "(none)"}`,
    `- machine completion reason: ${projection.completionReason ?? "(none)"}`,
    `- machine projection source: ${projection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
    `- control reason: ${status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(status.control.selectedAt)}`,
    `- event ledger present: ${projection.hasLedger ? "yes" : "no"}`,
    `- invalid ledger lines: ${projection.invalidLedgerLines}`,
    `- ledger replay: ${projection.replayedEventCount}/${projection.eventCount} events accepted`,
    `- ledger replay issues: ${projection.rejectedEvents.length}`,
    `- projection sync issues: ${projection.syncIssues.length}`,
    `- live Prompt Vault decisions: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `- last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    `- manifest campaign projection: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- manifest campaign projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest campaign: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- projection stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    ...currentSegmentLines,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${formatNextSlices(status.nextSlices)}`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
  ].join("\n");
}

export function formatAutoresearchAdapterContractCatalog(
  catalog: AutoresearchAdapterContractCatalog,
): string {
  const entries = catalog.entries.flatMap((entry) => [
    `- ${entry.packetKind}`,
    `  - version: ${entry.adapterContractVersion}`,
    `  - producer: ${entry.producerAction}`,
    `  - targets: ${entry.targetKinds.join(", ")}`,
    `  - required fields: ${entry.requiredFields.join(", ")}`,
    `  - optional fields: ${entry.optionalFields.length > 0 ? entry.optionalFields.join(", ") : "(none)"}`,
    `  - summary: ${entry.summary}`,
    `  - boundary: ${entry.boundary}`,
  ]);

  return [
    "# PI-AUTORESEARCH ADAPTER CONTRACT CATALOG",
    "",
    `- packet kind: ${catalog.packetKind}`,
    `- adapter contract version: ${catalog.adapterContractVersion}`,
    `- target kinds: ${catalog.targetKinds.join(", ")}`,
    `- adapter boundary: ${catalog.adapterBoundary}`,
    "",
    "## Packet contracts",
    ...entries,
  ].join("\n");
}

export function formatAutoresearchCandidateResultPacket(
  packet: AutoresearchCandidateResultPacket,
): string {
  const candidateLines = packet.candidate
    ? formatCandidateBindingLines(packet.candidate)
    : ["- candidate: (none)"];
  const runLine = packet.candidateRun
    ? `- candidate run: iteration ${packet.candidateRun.iteration ?? "?"}; empirical ${packet.candidateRun.empiricalDecisionClass}; metric ${formatMetricValue(packet.candidateRun.metric, packet.closeout.metricUnit)}`
    : "- candidate run: (none)";

  return [
    "# PI-AUTORESEARCH CANDIDATE RESULT PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- cwd: ${packet.cwd}`,
    `- campaign: ${packet.campaign ?? "(unnamed)"}`,
    `- empirical decision: ${packet.empiricalDecisionClass}`,
    `- recommended action: ${packet.recommendedAction}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    "",
    "## Result summary",
    packet.resultSummary,
    "",
    "## Candidate",
    ...candidateLines,
    "",
    "## Candidate run",
    runLine,
  ].join("\n");
}

export function formatAutoresearchAdapterPacketValidationResult(
  result: AutoresearchAdapterPacketValidationResult,
): string {
  const issueLines = result.issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    "# PI-AUTORESEARCH ADAPTER PACKET VALIDATION",
    "",
    `- packet kind: ${result.packetKind}`,
    `- adapter contract version: ${result.adapterContractVersion}`,
    `- target kinds: ${result.targetKinds.join(", ")}`,
    `- valid: ${result.valid ? "yes" : "no"}`,
    `- validated packet kind: ${result.validatedPacketKind ?? "(unknown)"}`,
    `- validated version: ${result.validatedVersion ?? "(unknown)"}`,
    `- adapter boundary: ${result.adapterBoundary}`,
    "",
    "## Issues",
    ...(issueLines.length > 0 ? issueLines : ["- (none)"]),
  ].join("\n");
}

export function formatAutoresearchKnowledgeExportPacket(
  packet: AutoresearchKnowledgeExportPacket,
): string {
  return [
    "# PI-AUTORESEARCH KNOWLEDGE EXPORT PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- suggested path: ${packet.suggestedPath}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    "",
    "## Markdown",
    packet.markdown,
  ].join("\n");
}

export function formatAutoresearchAkEvidencePacket(packet: AutoresearchAkEvidencePacket): string {
  return [
    "# PI-AUTORESEARCH AK EVIDENCE PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- task id: ${packet.taskId}`,
    `- check type: ${packet.checkType}`,
    `- campaign: ${packet.closeout.campaign ?? "(unnamed)"}`,
    `- empirical decision: ${packet.closeout.empiricalDecisionClass}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    `- evidence boundary: ${packet.evidenceBoundary}`,
    "",
    "## Result",
    packet.result,
    "",
    "## Suggested explicit controller call",
    `\`${packet.suggestedToolCall}\``,
  ].join("\n");
}

export function formatAutoresearchSegmentCloseout(closeout: AutoresearchSegmentCloseout): string {
  const metricUnit = closeout.metricUnit;
  const runLines = closeout.runs.map((run) => {
    const experimentLabel = run.experiment
      ? ` | hypothesis ${formatExperimentLabel(run.experiment)}`
      : "";
    const candidateLabel = run.experiment?.candidate?.branch
      ? ` | candidate ${run.experiment.candidate.branch}`
      : "";
    return `- iteration ${run.iteration ?? "?"}: ${run.status}/${run.runKind} | empirical ${run.empiricalDecisionClass} | metric ${formatMetricValue(run.metric, metricUnit)} | checks ${run.checks}${experimentLabel}${candidateLabel} | ${run.description}`;
  });
  const candidateLines = closeout.candidateBindings.flatMap((binding, index) => [
    `- candidate ${index + 1}:`,
    ...formatCandidateBindingLines(binding).map((line) => `  ${line}`),
  ]);

  return [
    "# PI-AUTORESEARCH SEGMENT CLOSEOUT",
    "",
    `- packet kind: ${closeout.packetKind}`,
    `- adapter contract version: ${closeout.adapterContractVersion}`,
    `- target kinds: ${closeout.targetKinds.join(", ")}`,
    `- cwd: ${closeout.cwd}`,
    `- receipt log: ${closeout.receiptPath}`,
    `- campaign: ${closeout.campaign ?? "(unnamed)"}`,
    `- metric: ${closeout.metricName ?? "(unset)"} (${metricUnit || "unitless"}, ${closeout.direction ?? "unset"} is better)`,
    `- runs: ${closeout.runCount} total / ${closeout.successfulRunCount} successful`,
    `- baseline: ${formatMetricValue(closeout.baselineMetric, metricUnit)}`,
    `- best: ${formatMetricValue(closeout.bestMetric, metricUnit)}`,
    `- empirical decision: ${closeout.empiricalDecisionClass}`,
    `- empirical posture: ${formatEmpiricalPosture(closeout.empiricalPosture)}`,
    `- timing interpretation: ${formatMetricInterpretation(closeout.timingInterpretation, metricUnit)}`,
    `- recommended action: ${closeout.recommendedAction}`,
    `- adapter boundary: ${closeout.adapterBoundary}`,
    `- evidence boundary: ${closeout.evidenceBoundary}`,
    "",
    "## Runs",
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
    "",
    "## Candidate bindings",
    ...(candidateLines.length > 0 ? candidateLines : ["- (none)"]),
  ].join("\n");
}

export function buildAutoresearchHelpText(status: AutoresearchRuntimeStatus): string {
  const segment = status.currentSegment;
  const projection = status.runtimeProjection;
  const configurationBlock = segment.configured
    ? [
        "## Current bounded runtime",
        `- campaign: ${segment.name ?? "(unnamed)"}`,
        `- metric: ${segment.metricName ?? "(unset)"} (${segment.metricUnit || "unitless"}, ${segment.direction ?? "unset"} is better)`,
        `- benchmark command: ${segment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${segment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${segment.runCount} total / ${segment.successfulRunCount} successful`,
        `- baseline: ${formatMetricValue(segment.baselineMetric, segment.metricUnit)}`,
        `- best: ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(segment.confidence)}`,
        `- machine state: ${projection.state}`,
        `- machine resume state: ${projection.resumeState ?? "(none)"}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        `- replayed events: ${projection.replayedEventCount}/${projection.eventCount}`,
      ]
    : [
        "## Current bounded runtime",
        "- no config receipt yet",
        `- machine state: ${projection.state}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        "- use autoresearch_runtime_run with name + metricName to bootstrap the first local segment",
      ];

  return [
    "# /autoresearch",
    "",
    "The bounded runtime kernel is available through the /autoresearch <objective> front door, local benchmark/check execution, machine projection, append-only receipt/event logging, governed Prompt Vault decision requests, bounded loop execution, posture-gated runs, peer-assist planning/launch handoff, bounded finalization orchestration, one bounded supervised self-hosting public seam, and manifest-driven llama.cpp campaign planning/fork preparation/stage binding plus package-local campaign receipt/status projection, exact-task AK-binding snapshot derivation, one-step campaign-local advancement, and one dedicated public manifest campaign-control seam.",
    "This package now owns bounded finalization planning, approval, local branch materialization, one public `autoresearch_self_hosting_run` seam for controller/candidate/evaluator/promotion orchestration under the supervised self-hosting contract, checked manifest-driven branch/lane planning, one exact 41/42/43 stage-binding surface, one projection-only llama.cpp campaign status artifact, one non-mutating AK-ready manifest-campaign binding helper, one bounded one-step campaign-local advance helper, one dedicated public `autoresearch_llamacpp_campaign_control` seam for current status plus one-step public advancement with optional exact-task AK context, and a bounded in-call autoresearch loop. The technical `autoresearch_llamacpp_campaign` tool remains available below that public seam for raw matrix/fork/stage actions; the current package still does not own hidden daemonized self-improvement, direct AK mutation policy, automatic controller rotation, whole-campaign execution, automatic visible peer spawning, or remote review choreography.",
    "",
    "## Available surfaces",
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    `- use ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME} as the supervised campaign front door from one bounded objective; plan first, then optionally bootstrap a baseline or bounded loop`,
    "- use autoresearch_runtime_status to inspect the current bounded runtime state",
    `- use ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME} to inspect a candidate worktree/branch and prepare the exact measurement call without running or mutating anything`,
    `- use ${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME} to inspect or plan candidate keep/discard/rewind decisions without mutating worktrees or promoting`,
    "- use autoresearch_runtime_status with action=setup or action=finalize to request governed setup/finalize packets",
    "- use autoresearch_runtime_control to inspect or set continue / rebaseline / finalize / stop operator intent",
    "- use autoresearch_runtime_finalize to inspect, plan, approve, and materialize a bounded finalization workflow",
    "- use autoresearch_runtime_run to execute one bounded local run and optionally request a governed post-run next-hypothesis decision with decisionGoal; postureCommand can fail closed before benchmark execution",
    `- use ${AUTORESEARCH_AUTOPLAN_TOOL_NAME} to inspect the repo/problem space and propose bounded campaign setup; planner=dspx_program can materialize a DSPx program-gen handoff intent`,
    `- use ${AUTORESEARCH_SETUP_TOOL_NAME} to plan/apply a config receipt or bootstrap a baseline run without needing a slash-command wizard`,
    `- use ${AUTORESEARCH_PEER_ASSIST_TOOL_NAME} to plan one canonical visible peer lane without launching it`,
    `- use ${AUTORESEARCH_LOOP_TOOL_NAME} to execute a bounded in-call loop with maxIterations, optional wall-clock/posture gates, live progress updates, and optional explicit peer-launch handoff`,
    `- use ${AUTORESEARCH_SELF_HOSTING_TOOL_NAME} for the public supervised self-hosting seam: inspect controller/candidate/evaluator state, prepare the candidate worktree, run one bounded self-hosting wave, use action=start_and_watch for in-call progress updates, and optionally plan/apply promotion or rollback records without package-local self-promotion`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} for the public manifest campaign-control seam: current status, optional exact-task AK context, and one-step public advance without raw stage/build inputs`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} for lower-level technical manifest work such as branch/lane matrix planning, fork preparation, raw stage binding, exact AK-ready snapshots, or technical one-step advancement`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
    "",
    ...configurationBlock,
    "",
    "## Local artifact plan",
    ...status.localArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Manifest campaign projection",
    `- availability: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    `- refresh path: use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with the current manifestPath to create or refresh the projection artifact`,
    "",
    "## Prompt Vault alignment",
    "Ready now:",
    ...status.readyPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    `Live post-run decision state: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `Last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    "",
    "Blocked until governed router vocabulary expands:",
    ...status.blockedPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "## Next bounded slices",
    ...(status.nextSlices.length > 0
      ? status.nextSlices.map((slice) => `- ${slice}`)
      : ["- none currently committed in product-posture"]),
  ].join("\n");
}

export function formatAutoresearchRunResult(result: ExecuteAutoresearchRunResult): string {
  const metricUnit = result.status.currentSegment.metricUnit;
  const metrics = Object.entries(result.parsedMetrics)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `- ${name}=${value}`);

  const checksSummary = result.checks
    ? [
        `- checks: ${result.checks.command}`,
        `- checks exit: ${formatExit(result.checks.exitCode, result.checks.timedOut)} in ${result.checks.durationSeconds.toFixed(2)}s`,
      ]
    : ["- checks: (not run)"];
  const decisionSummary = result.decisionSummary
    ? [
        `- live post-run decision: ${result.decisionSummary.status} -> ${result.decisionSummary.mappedDecision}`,
        result.decisionSummary.blockingReason
          ? `- decision block: ${result.decisionSummary.blockingReason}`
          : `- next hypothesis: ${result.decisionSummary.nextHypothesis ?? "(none)"}`,
        `- decision target files: ${formatTargetFiles(result.decisionSummary.targetFiles)}`,
      ]
    : ["- live post-run decision: not requested; preserved bounded iterate bridge"];

  return [
    "# PI-AUTORESEARCH RUN",
    "",
    `- cwd: ${result.cwd}`,
    `- receipt log: ${result.receiptPath}`,
    `- event ledger: ${result.status.runtimeProjection.ledgerPath ?? "(unresolved)"}`,
    result.status.runtimeSnapshot.path
      ? `- runtime snapshot: ${result.status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- created config: ${result.createdConfig ? "yes" : "no"}`,
    `- run status: ${result.runReceipt.status}`,
    `- run kind: ${result.runReceipt.runKind ?? "ordinary"}`,
    `- empirical decision: ${result.runReceipt.empiricalDecisionClass ?? result.status.currentSegment.empiricalDecisionClass}`,
    ...formatExperimentLineageLines(result.runReceipt.experiment),
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- control state: ${result.status.control.kind} (${formatAllowedActions(result.status.control.allowedActions)})`,
    `- ledger replay: ${result.status.runtimeProjection.replayedEventCount}/${result.status.runtimeProjection.eventCount} events accepted`,
    `- primary metric: ${result.primaryMetricName}=${formatMetricValue(result.primaryMetric, metricUnit)}`,
    `- benchmark: ${result.benchmark.command}`,
    `- benchmark exit: ${formatExit(result.benchmark.exitCode, result.benchmark.timedOut)} in ${result.benchmark.durationSeconds.toFixed(2)}s`,
    ...checksSummary,
    ...decisionSummary,
    `- current baseline: ${formatMetricValue(result.status.currentSegment.baselineMetric, metricUnit)}`,
    `- current best: ${formatMetricValue(result.status.currentSegment.bestMetric, metricUnit)}`,
    `- confidence: ${formatConfidenceValue(result.status.currentSegment.confidence)}`,
    `- segment empirical decision: ${result.status.currentSegment.empiricalDecisionClass}`,
    `- timing interpretation: ${formatMetricInterpretation(result.status.currentSegment.metricInterpretation, metricUnit)}`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({
      cwd: result.cwd,
      runStatus: result.runReceipt.status,
      decisionSummary: result.decisionSummary,
    }),
    "",
    "## Parsed metrics",
    ...(metrics.length > 0 ? metrics : ["- (none)"]),
    "",
    "## Output tail",
    result.benchmark.outputTail.length > 0 ? result.benchmark.outputTail : "(no output)",
    ...(result.checks && result.checks.outputTail.length > 0
      ? ["", "## Checks output tail", result.checks.outputTail]
      : []),
  ].join("\n");
}

export async function requestAutoresearchSetupDecision(
  input: ExecuteAutoresearchSetupDecisionInput,
): Promise<ExecuteAutoresearchSetupDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runSetup(enrichSetupDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

export async function requestAutoresearchFinalizeDecision(
  input: ExecuteAutoresearchFinalizeDecisionInput,
): Promise<ExecuteAutoresearchFinalizeDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runFinalize(enrichFinalizeDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

export function formatAutoresearchDecisionResult(
  result: ExecuteAutoresearchSetupDecisionResult | ExecuteAutoresearchFinalizeDecisionResult,
): string {
  const outcome = result.outcome;
  if (outcome.kind === "setup") {
    if (isDecisionErrorOutcome(outcome)) {
      return [
        "# PI-AUTORESEARCH DECISION",
        "",
        `- cwd: ${result.cwd}`,
        `- kind: ${outcome.kind}`,
        `- template: ${outcome.templateName}`,
        `- status: ${outcome.status}`,
        `- blocking reason: ${outcome.blockingReason}`,
        `- failure stage: ${outcome.failureStage}`,
        `- lawful owner route: ${outcome.lawfulOwnerRoute}`,
        `- missing binding action: ${outcome.missingBindingAction}`,
        "- recovery steps:",
        ...outcome.recoverySteps.map((step) => `  - ${step}`),
        `- machine state: ${result.status.runtimeProjection.state}`,
      ].join("\n");
    }

    return [
      "# PI-AUTORESEARCH DECISION",
      "",
      `- cwd: ${result.cwd}`,
      `- kind: ${outcome.kind}`,
      `- template: ${outcome.templateName}`,
      `- status: ${outcome.status}`,
      `- goal: ${outcome.goal}`,
      `- primary metric: ${outcome.primaryMetric.name} (${outcome.primaryMetric.unit || "unitless"}, ${outcome.primaryMetric.direction} is better)`,
      `- benchmark command: ${outcome.benchmarkCommand}`,
      `- files in scope: ${formatTargetFiles(outcome.filesInScope)}`,
      ...(outcome.status === "blocked"
        ? [`- blocking reason: ${formatSetupBlockingReason(outcome)}`]
        : []),
      `- machine state: ${result.status.runtimeProjection.state}`,
    ].join("\n");
  }

  if (isDecisionErrorOutcome(outcome)) {
    return [
      "# PI-AUTORESEARCH DECISION",
      "",
      `- cwd: ${result.cwd}`,
      `- kind: ${outcome.kind}`,
      `- template: ${outcome.templateName}`,
      `- status: ${outcome.status}`,
      `- blocking reason: ${outcome.blockingReason}`,
      `- failure stage: ${outcome.failureStage}`,
      `- lawful owner route: ${outcome.lawfulOwnerRoute}`,
      `- missing binding action: ${outcome.missingBindingAction}`,
      "- recovery steps:",
      ...outcome.recoverySteps.map((step) => `  - ${step}`),
      `- machine state: ${result.status.runtimeProjection.state}`,
    ].join("\n");
  }

  return [
    "# PI-AUTORESEARCH DECISION",
    "",
    `- cwd: ${result.cwd}`,
    `- kind: ${outcome.kind}`,
    `- template: ${outcome.templateName}`,
    `- status: ${outcome.status}`,
    `- base ref: ${outcome.baseRef}`,
    `- trunk ref: ${outcome.trunkRef}`,
    `- overall result: ${outcome.overallResult}`,
    `- proposed groups: ${outcome.proposedGroups.length}`,
    `- grouped files: ${formatTargetFiles(outcome.proposedGroups.flatMap((group) => group.files))}`,
    ...(outcome.status === "blocked"
      ? [`- blocking reason: ${formatFinalizeBlockingReason(outcome)}`]
      : []),
    `- machine state: ${result.status.runtimeProjection.state}`,
  ].join("\n");
}

export function inspectAutoresearchRuntimeControl(
  cwd: string,
): InspectAutoresearchRuntimeControlResult {
  const resolvedCwd = path.resolve(cwd);
  const loadResult = loadReceiptLog(resolvedCwd);
  ensureEventLedgerInitializedFromReceipts(resolvedCwd, [...loadResult.entries]);
  const status = buildAutoresearchRuntimeStatus(resolvedCwd, { persistSnapshot: false });
  return {
    cwd: resolvedCwd,
    status,
    nextStep: describeAutoresearchControlNextStep(status),
  };
}

export function setAutoresearchRuntimeControl(
  input: SetAutoresearchRuntimeControlInput,
): SetAutoresearchRuntimeControlResult {
  const cwd = path.resolve(input.cwd);
  if (!isAutoresearchOperatorAction(input.decision)) {
    throw new Error(`Unsupported autoresearch control decision: ${String(input.decision)}`);
  }

  const current = inspectAutoresearchRuntimeControl(cwd);
  assertAutoresearchControlActionAllowed(current.status, input.decision);

  const selectedAt = input.selectedAt ?? Date.now();
  const control = createExplicitAutoresearchControlState({
    status: current.status,
    decision: input.decision,
    reason: input.reason,
    selectedAt,
  });

  persistAutoresearchRuntimeSnapshot({
    cwd,
    current: createRuntimeSnapshotInput(
      cwd,
      current.status.currentSegment,
      current.status.runtimeProjection,
      current.status.promptVaultDecisions,
    ),
    control,
    updatedAt: selectedAt,
  });

  const next = inspectAutoresearchRuntimeControl(cwd);
  return {
    cwd,
    decision: input.decision,
    previousControl: cloneAutoresearchControlState(current.status.control),
    status: next.status,
    nextStep: next.nextStep,
  };
}

export function formatAutoresearchControlResult(
  result: InspectAutoresearchRuntimeControlResult | SetAutoresearchRuntimeControlResult,
): string {
  const actionLine = "decision" in result ? `- action: set ${result.decision}` : "- action: status";
  const resumePlan = buildAutoresearchResumePlanFromStatus(result.cwd, result.status);
  const resumeApplyPlan = buildAutoresearchResumeApplyPlan(result.cwd);

  return [
    "# PI-AUTORESEARCH CONTROL",
    "",
    `- cwd: ${result.cwd}`,
    actionLine,
    ...("decision" in result ? [`- previous control: ${result.previousControl.kind}`] : []),
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${result.status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${result.status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(result.status.control.allowedActions)}`,
    `- control reason: ${result.status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(result.status.control.selectedAt)}`,
    `- next step: ${result.nextStep}`,
    "",
    "## Resume plan",
    ...formatAutoresearchResumePlanSummaryLines(resumePlan),
    "",
    "## Resume apply plan-only proposal",
    ...formatAutoresearchResumeApplyPlanSummaryLines(resumeApplyPlan),
  ].join("\n");
}

export async function executeAutoresearchRun(
  input: ExecuteAutoresearchRunInput,
): Promise<ExecuteAutoresearchRunResult> {
  const cwd = path.resolve(input.cwd);
  const description = input.description.trim();
  if (description.length === 0) {
    throw new Error("description is required");
  }
  if (input.liveDecision && input.liveDecision.goal.trim().length === 0) {
    throw new Error(
      "liveDecision.goal is required when governed post-run Prompt Vault decisions are enabled",
    );
  }

  const paths = resolveAutoresearchPaths(cwd);
  const loadResult = loadReceiptLog(cwd);
  const entries = [...loadResult.entries];
  ensureEventLedgerInitializedFromReceipts(cwd, entries);

  let currentSegment = getCurrentSegment(entries);
  let config = currentSegment.config;
  let createdConfig = false;

  if (!config || input.reconfigure) {
    const initialConfig = createConfigFromInput(input, paths);
    entries.push(initialConfig);
    config = initialConfig;
    currentSegment = getCurrentSegment(entries);
    createdConfig = true;
  }

  if (!config) {
    throw new Error("Could not resolve a config receipt for this run");
  }

  const benchmarkCommand =
    input.benchmarkCommand ?? config.benchmarkCommand ?? defaultBenchmarkCommand(paths);
  if (!benchmarkCommand) {
    throw new Error(
      "No benchmark command available. Create autoresearch.sh or pass benchmarkCommand when bootstrapping the runtime.",
    );
  }

  const checksCommand = resolveChecksCommand(input.checksCommand, config.checksCommand, paths);

  if (input.postureCommand?.trim()) {
    await assertAutoresearchPostureReady({
      cwd,
      command: input.postureCommand,
      timeoutSeconds: input.postureTimeoutSeconds ?? 15,
      signal: input.signal,
    });
  }
  ensureMachineReadyForBoundedRun(cwd, {
    allowBootstrapConfig: createdConfig,
    allowRebaselineReconfigure: input.reconfigure === true,
  });

  if (createdConfig) {
    appendReceipt(cwd, config);
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
        config.createdAt,
      ),
    );
  }
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.startRun({
        description,
        benchmarkCommand,
        checksCommand,
      }),
    ),
  );

  const benchmark = await runShellCommand({
    command: benchmarkCommand,
    cwd,
    timeoutSeconds: input.timeoutSeconds ?? DEFAULT_BENCHMARK_TIMEOUT_SECONDS,
    signal: input.signal,
  });

  const parsedMetrics = parseMetricLines(joinOutput(benchmark));
  const metricName = config.metricName;
  const hasPrimaryMetric = hasOwn(parsedMetrics, metricName);
  const benchmarkSucceeded = benchmark.exitCode === 0 && !benchmark.timedOut;
  const metricContractFailed = benchmarkSucceeded && !hasPrimaryMetric;
  const primaryMetric = hasPrimaryMetric ? parsedMetrics[metricName] : 0;

  if (benchmarkSucceeded && !metricContractFailed) {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.benchmarkSucceeded({
          metric: primaryMetric,
          requiresChecks: checksCommand !== null,
        }),
      ),
    );
  } else {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.benchmarkFailed(describeBenchmarkFailure(benchmark, metricContractFailed)),
      ),
    );
  }

  let checks: CommandExecutionSummary | null = null;
  let checksPassed: boolean | null = null;
  if (benchmarkSucceeded && !metricContractFailed && checksCommand) {
    checks = await runShellCommand({
      command: checksCommand,
      cwd,
      timeoutSeconds: input.checksTimeoutSeconds ?? DEFAULT_CHECKS_TIMEOUT_SECONDS,
      signal: input.signal,
    });
    checksPassed = checks.exitCode === 0 && !checks.timedOut;
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        checksPassed
          ? campaignEvents.checksSucceeded()
          : campaignEvents.checksFailed("checks command failed or timed out"),
      ),
    );
  }

  const status = determineRunStatus({
    currentSegment,
    benchmarkSucceeded,
    metricContractFailed,
    checksPassed,
  });
  const runKind = input.runKind ?? "ordinary";
  const runReceipt = createRunReceipt({
    status,
    runKind: runKind === "ordinary" ? undefined : runKind,
    experiment: input.experiment,
    metric: primaryMetric,
    metrics: parsedMetrics,
    description: decorateRunDescription(
      description,
      benchmarkSucceeded,
      metricContractFailed,
      checksPassed,
    ),
    timestamp: Date.now(),
    iteration: currentSegment.runs.length + 1,
    durationSeconds: benchmark.durationSeconds,
    exitCode: benchmark.exitCode,
    timedOut: benchmark.timedOut,
    benchmarkCommand,
    checksCommand,
    checksPassed,
    checksDurationSeconds: checks?.durationSeconds ?? null,
  });

  const nextEntries = [...entries, runReceipt];
  const nextStatus = buildAutoresearchRuntimeStatusFromEntries(
    cwd,
    paths,
    nextEntries,
    loadResult.invalidLineCount,
    { persistSnapshot: false },
  );
  runReceipt.confidence = nextStatus.currentSegment.confidence;
  runReceipt.empiricalDecisionClass = nextStatus.currentSegment.empiricalDecisionClass;

  const decisionSummary = input.liveDecision
    ? await runAutoresearchPostRunDecision({
        cwd,
        entries: nextEntries,
        status: nextStatus,
        runReceipt,
        liveDecision: input.liveDecision,
        signal: input.signal,
      })
    : null;
  if (decisionSummary) {
    runReceipt.decision = decisionSummary;
  }

  appendReceipt(cwd, runReceipt);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({
        status: runReceipt.status,
        metric: runReceipt.metric,
      }),
      runReceipt.timestamp,
    ),
  );
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.decideNextAction(
        decisionSummary?.mappedDecision ?? "iterate",
        decisionSummary
          ? formatRunDecisionLedgerReason(decisionSummary)
          : "bounded runtime run completed",
      ),
      runReceipt.timestamp,
    ),
  );

  return {
    cwd,
    receiptPath: paths.jsonlPath,
    createdConfig,
    configReceipt: config,
    runReceipt,
    benchmark,
    checks,
    parsedMetrics,
    primaryMetricName: metricName,
    primaryMetric,
    decisionSummary,
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true }),
  };
}

export async function executeAutoresearchLoop(
  input: ExecuteAutoresearchLoopInput,
): Promise<ExecuteAutoresearchLoopResult> {
  const cwd = path.resolve(input.cwd);
  const goal = input.goal.trim();
  if (goal.length === 0) throw new Error("goal is required");
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }

  const startedAt = Date.now();
  const stopOn = new Set(
    input.stopOn ?? ["blocked", "rebaseline", "finalize", "crash", "checks_failed"],
  );
  const peerMode = input.peerMode ?? "plan";
  const runs: ExecuteAutoresearchRunResult[] = [];
  let stopReason = "maxIterations reached";

  emitAutoresearchLoopProgress(input, {
    phase: "loop_start",
    cwd,
    goal,
    iteration: null,
    maxIterations: input.maxIterations,
    elapsedSeconds: 0,
    message: `Starting bounded autoresearch loop for ${goal} with maxIterations=${input.maxIterations}.`,
  });

  for (let index = 0; index < input.maxIterations; index += 1) {
    input.signal?.throwIfAborted();
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (
      input.maxWallClockMinutes !== undefined &&
      Date.now() - startedAt >= input.maxWallClockMinutes * 60_000
    ) {
      stopReason = "maxWallClockMinutes reached";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }

    const statusBefore = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
    if (statusBefore.control.kind === "awaiting_operator") {
      stopReason = `awaiting operator control: ${formatAllowedActions(statusBefore.control.allowedActions)}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (["stop", "rebaseline", "finalize"].includes(statusBefore.control.kind)) {
      stopReason = `control state ${statusBefore.control.kind}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    const canBootstrapFirstSegment =
      index === 0 &&
      statusBefore.runtimeProjection.state === "segment_unconfigured" &&
      Boolean(input.name?.trim()) &&
      Boolean(input.metricName?.trim());
    if (
      !canBootstrapFirstSegment &&
      !canCampaignMachineStartBoundedRun(statusBefore.runtimeProjection.state)
    ) {
      stopReason = `machine state ${statusBefore.runtimeProjection.state}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }

    const previousDecision = runs.at(-1)?.decisionSummary;
    const description =
      index === 0
        ? input.description?.trim() || `loop baseline/iteration for ${goal}`
        : previousDecision?.nextHypothesis?.trim() || `loop iteration ${index + 1} for ${goal}`;

    emitAutoresearchLoopProgress(input, {
      phase: "iteration_start",
      cwd,
      goal,
      iteration: index + 1,
      maxIterations: input.maxIterations,
      elapsedSeconds,
      nextHypothesis: previousDecision?.nextHypothesis ?? null,
      message: `Starting autoresearch loop iteration ${index + 1}/${input.maxIterations}: ${description}`,
    });

    let run: ExecuteAutoresearchRunResult;
    try {
      run = await executeAutoresearchRun({
        cwd,
        description,
        name: index === 0 ? input.name : undefined,
        metricName: index === 0 ? input.metricName : undefined,
        metricUnit: index === 0 ? input.metricUnit : undefined,
        direction: index === 0 ? input.direction : undefined,
        metricThreshold: index === 0 ? input.metricThreshold : undefined,
        benchmarkCommand: input.benchmarkCommand,
        checksCommand: input.checksCommand,
        timeoutSeconds: input.timeoutSeconds,
        checksTimeoutSeconds: input.checksTimeoutSeconds,
        reconfigure: index === 0 ? input.reconfigure : false,
        postureCommand: input.postureCommand,
        postureTimeoutSeconds: input.postureTimeoutSeconds,
        liveDecision:
          input.decisionRuntime && (input.decisionGoal ?? goal).trim().length > 0
            ? {
                runtime: input.decisionRuntime,
                goal: input.decisionGoal ?? goal,
                constraints: input.decisionConstraints,
                filesInScope: input.decisionFilesInScope,
                offLimits: input.decisionOffLimits,
                ideasBacklog: input.decisionIdeasBacklog,
                asiNotes: input.decisionAsiNotes,
                deadEndMemory: input.decisionDeadEndMemory,
                model: input.model,
              }
            : undefined,
        signal: input.signal,
      });
    } catch (error) {
      stopReason = `run execution stopped: ${formatErrorMessage(error)}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    runs.push(run);

    emitAutoresearchLoopProgress(input, {
      phase: "iteration_complete",
      cwd,
      goal,
      iteration: index + 1,
      maxIterations: input.maxIterations,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      runStatus: run.runReceipt.status,
      primaryMetricName: run.primaryMetricName,
      primaryMetric: run.primaryMetric,
      bestMetric: run.status.currentSegment.bestMetric,
      nextHypothesis: run.decisionSummary?.nextHypothesis ?? null,
      message: `Completed autoresearch loop iteration ${index + 1}/${input.maxIterations}: ${run.runReceipt.status} ${run.primaryMetricName}=${formatMetricValue(run.primaryMetric, run.status.currentSegment.metricUnit)}.`,
    });

    if (stopOn.has(run.runReceipt.status)) {
      stopReason = `stopOn run status ${run.runReceipt.status}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "block" && stopOn.has("blocked")) {
      stopReason = run.decisionSummary.blockingReason ?? "governed decision blocked";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "rebaseline" && stopOn.has("rebaseline")) {
      stopReason = "governed decision requested rebaseline";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "finalize" && stopOn.has("finalize")) {
      stopReason = "governed decision requested finalize";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
  }

  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const peerAssist = buildAutoresearchPeerAssistPlan(
    buildLoopPeerAssistInput(input, cwd, goal, peerMode),
  );
  const peerLaunchHandoff = buildLoopPeerHandoff(peerMode, peerAssist);
  const result: ExecuteAutoresearchLoopResult = {
    cwd,
    goal,
    requestedIterations: input.maxIterations,
    completedIterations: runs.length,
    stopReason,
    elapsedSeconds,
    runs,
    peerMode,
    peerAssist,
    peerLaunchHandoff,
    status,
  };

  emitAutoresearchLoopProgress(input, {
    phase: "loop_complete",
    cwd,
    goal,
    iteration: null,
    maxIterations: input.maxIterations,
    elapsedSeconds,
    stopReason,
    bestMetric: status.currentSegment.bestMetric,
    peerLane: peerAssist.lane,
    message: `Completed bounded autoresearch loop after ${runs.length}/${input.maxIterations} iterations: ${stopReason}.`,
  });

  return result;
}

export function formatAutoresearchLoopResult(result: ExecuteAutoresearchLoopResult): string {
  const runLines = result.runs.map(
    (run, index) =>
      `- #${index + 1}: ${run.runReceipt.status} ${run.primaryMetricName}=${formatMetricValue(run.primaryMetric, result.status.currentSegment.metricUnit)}${run.decisionSummary ? ` decision=${run.decisionSummary.mappedDecision}` : ""}`,
  );
  const lastDecision = result.runs.at(-1)?.decisionSummary;
  return [
    "# PI-AUTORESEARCH LOOP",
    "",
    `- cwd: ${result.cwd}`,
    `- goal: ${result.goal}`,
    `- completed iterations: ${result.completedIterations}/${result.requestedIterations}`,
    `- elapsed: ${result.elapsedSeconds.toFixed(2)}s`,
    `- stop reason: ${result.stopReason}`,
    `- final machine state: ${result.status.runtimeProjection.state}`,
    `- current best: ${formatMetricValue(result.status.currentSegment.bestMetric, result.status.currentSegment.metricUnit)}`,
    `- last hypothesis: ${lastDecision?.nextHypothesis ?? "(none)"}`,
    "",
    "## Runs",
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
    "",
    "## Peer assist plan",
    `- peer mode: ${result.peerMode}`,
    `- lane: ${result.peerAssist.lane}`,
    `- reason: ${result.peerAssist.reason}`,
    `- tool: ${result.peerAssist.toolName ?? "(none)"}`,
    result.peerAssist.toolCall ? `- call: ${result.peerAssist.toolCall}` : "- call: (none)",
    `- launch handoff: ${result.peerLaunchHandoff.status}`,
    `- launch note: ${result.peerLaunchHandoff.note}`,
    "",
    "## Final dashboard",
    formatAutoresearchDashboard(result.status),
  ].join("\n");
}

function buildLoopPeerAssistInput(
  input: ExecuteAutoresearchLoopInput,
  cwd: string,
  goal: string,
  peerMode: AutoresearchLoopPeerMode,
): BuildAutoresearchPeerAssistInput {
  const lane = peerModeToPeerAssistLane(peerMode);
  return {
    cwd,
    lane,
    objective: `Review loop outcome for ${goal} and recommend one bounded next controller action.`,
    targetFiles: input.decisionFilesInScope,
    offLimits: input.decisionOffLimits,
    constraints: input.decisionConstraints,
    reportBack: "manual",
  };
}

function peerModeToPeerAssistLane(
  peerMode: AutoresearchLoopPeerMode,
): AutoresearchPeerAssistLane | "auto" {
  if (peerMode === "off") return "none";
  if (peerMode === "launch_scout") return "scout";
  if (peerMode === "launch_candidate") return "candidate";
  if (peerMode === "launch_fork") return "fork";
  return "auto";
}

function buildLoopPeerHandoff(
  peerMode: AutoresearchLoopPeerMode,
  peerAssist: AutoresearchPeerAssistPlan,
): AutoresearchLoopPeerHandoff {
  const requested = peerMode.startsWith("launch_");
  if (!requested) {
    return {
      mode: peerMode,
      requested: false,
      status: "not_requested",
      toolName: peerAssist.toolName,
      toolCall: peerAssist.toolCall,
      note:
        peerMode === "off"
          ? "Peer assist was disabled for this loop."
          : "Peer assist was planned only; no visible peer was launched by pi-autoresearch.",
    };
  }
  if (!peerAssist.toolName || !peerAssist.toolCall) {
    return {
      mode: peerMode,
      requested: true,
      status: "unavailable",
      toolName: null,
      toolCall: null,
      note: "Explicit peer launch was requested, but no canonical peer tool call is available.",
    };
  }
  return {
    mode: peerMode,
    requested: true,
    status: "handoff_required",
    toolName: peerAssist.toolName,
    toolCall: peerAssist.toolCall,
    note: "Explicit peer launch requested: dispatch the canonical visible peer tool call separately; peer/intercom output remains communication until controller verification.",
  };
}

function emitAutoresearchLoopStop(
  input: ExecuteAutoresearchLoopInput,
  cwd: string,
  goal: string,
  startedAt: number,
  stopReason: string,
): void {
  emitAutoresearchLoopProgress(input, {
    phase: "loop_stop",
    cwd,
    goal,
    iteration: null,
    maxIterations: input.maxIterations,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    stopReason,
    message: `Stopping bounded autoresearch loop: ${stopReason}.`,
  });
}

function emitAutoresearchLoopProgress(
  input: ExecuteAutoresearchLoopInput,
  event: AutoresearchLoopProgressEvent,
): void {
  input.onProgress?.(event);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function assertAutoresearchPostureReady(input: {
  cwd: string;
  command: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<void> {
  const posture = await runShellCommand(input);
  if (posture.exitCode !== 0 || posture.timedOut) {
    throw new Error(
      `Autoresearch posture gate failed: command exited ${formatExit(posture.exitCode, posture.timedOut)}; ${posture.outputTail}`,
    );
  }
  const gate = evaluateAutoresearchPostureOutput(joinOutput(posture));
  if (!gate.ready) {
    throw new Error(`Autoresearch posture gate blocked: ${gate.reason}`);
  }
}

function evaluateAutoresearchPostureOutput(output: string): { ready: boolean; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    return { ready: true, reason: "posture output was not JSON; treated as advisory" };
  }
  if (!value || typeof value !== "object") return { ready: true, reason: "posture ok" };
  const record = value as Record<string, unknown>;
  if (record.reconcileRecommended === true) {
    return { ready: false, reason: "reconcileRecommended=true" };
  }
  if (record.ready === false) {
    return { ready: false, reason: "ready=false" };
  }
  if (record.result === "blocked" || record.result === "unsafe") {
    return { ready: false, reason: `result=${String(record.result)}` };
  }
  if (typeof record.recommendedCommand === "string" && record.recommendedCommand.trim()) {
    return { ready: false, reason: `recommended command: ${record.recommendedCommand.trim()}` };
  }
  return { ready: true, reason: "posture ok" };
}

async function runAutoresearchPostRunDecision(input: {
  cwd: string;
  entries: AutoresearchReceipt[];
  status: AutoresearchRuntimeStatus;
  runReceipt: AutoresearchRunReceipt;
  liveDecision: ExecuteAutoresearchRunLiveDecisionInput;
  signal?: AbortSignal;
}): Promise<AutoresearchRunDecisionSummary> {
  const outcome = await input.liveDecision.runtime.runNextHypothesis(
    buildRuntimeNextHypothesisPacket(input),
    {
      cwd: input.cwd,
      currentCompany: input.liveDecision.currentCompany,
      model: input.liveDecision.model,
      signal: input.signal,
    },
  );
  return buildRunDecisionSummary(outcome, input.runReceipt.timestamp);
}

function buildRuntimeNextHypothesisPacket(input: {
  entries: AutoresearchReceipt[];
  status: AutoresearchRuntimeStatus;
  runReceipt: AutoresearchRunReceipt;
  liveDecision: ExecuteAutoresearchRunLiveDecisionInput;
}): NextHypothesisDecisionPacket {
  const currentSegmentView = getCurrentSegment(input.entries);
  const successfulRuns = currentSegmentView.runs.filter(isSuccessfulMetricRun);
  const recentRuns = currentSegmentView.runs.slice(-5);
  const metricUnit = input.status.currentSegment.metricUnit;
  const metricName = input.status.currentSegment.metricName ?? "(unset)";
  const direction = input.status.currentSegment.direction ?? "lower";

  return {
    goal: input.liveDecision.goal.trim(),
    constraints: [
      ...normalizeArray(input.liveDecision.constraints),
      "bounded local runtime only",
      "fail closed if the governed Prompt Vault decision cannot be prepared, executed, or parsed",
    ],
    segmentSummary: [
      `campaign: ${input.status.currentSegment.name ?? "(unnamed)"}`,
      `metric: ${metricName} (${metricUnit || "unitless"}, ${direction} is better)`,
      `run count: ${input.status.currentSegment.runCount}`,
      `successful runs: ${input.status.currentSegment.successfulRunCount}`,
      `baseline: ${formatMetricValue(input.status.currentSegment.baselineMetric, metricUnit)}`,
      `best: ${formatMetricValue(input.status.currentSegment.bestMetric, metricUnit)}`,
      `last run: ${formatLastRun(input.status.currentSegment.lastRunStatus, input.status.currentSegment.lastRunMetric, metricUnit, input.status.currentSegment.lastRunKind)}`,
    ],
    baselineHistory: [
      successfulRuns.length > 0
        ? `baseline ${metricName}=${formatMetricValue(successfulRuns[0]?.metric ?? null, metricUnit)}`
        : "no successful baseline yet",
      successfulRuns.length > 0
        ? `best ${metricName}=${formatMetricValue(input.status.currentSegment.bestMetric, metricUnit)}`
        : "best metric unavailable",
    ],
    recentRunHistory: recentRuns.map((run) => formatRunHistoryLine(run, metricUnit)),
    checksStatus: [
      `checks command: ${input.status.currentSegment.checksCommand ?? "(none)"}`,
      `latest checks: ${describeChecksState(input.runReceipt)}`,
    ],
    confidenceSignals: [
      `confidence: ${formatConfidenceValue(input.status.currentSegment.confidence)}`,
      `latest run receipt status: ${input.runReceipt.status}`,
    ],
    asiNotes: normalizeArray(input.liveDecision.asiNotes),
    deadEndMemory: normalizeArray(input.liveDecision.deadEndMemory),
    filesInScope: normalizeArray(input.liveDecision.filesInScope),
    offLimits: normalizeArray(input.liveDecision.offLimits),
    ideasBacklog: normalizeArray(input.liveDecision.ideasBacklog),
  };
}

function buildRunDecisionSummary(
  outcome: NextHypothesisDecisionOutcome,
  timestamp: number,
): AutoresearchRunDecisionSummary {
  if (isDecisionErrorOutcome(outcome)) {
    return {
      kind: "next_hypothesis",
      templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
      status: "blocked",
      mappedDecision: "block",
      blockingReason: outcome.blockingReason,
      failureStage: outcome.failureStage,
      stateRead: null,
      nextHypothesis: null,
      targetFiles: [],
      expectedPrimaryEffect: null,
      timestamp,
    };
  }

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: outcome.status,
    mappedDecision: mapNextHypothesisOutcomeToCampaignDecision(outcome),
    blockingReason:
      outcome.status === "blocked"
        ? (normalizeInlineReason(outcome.nextHypothesis) ??
          normalizeInlineReason(outcome.stateRead))
        : null,
    failureStage: null,
    stateRead: outcome.stateRead,
    nextHypothesis: outcome.nextHypothesis,
    targetFiles: [...outcome.targetFiles],
    expectedPrimaryEffect: outcome.expectedPrimaryEffect,
    timestamp,
  };
}

function formatRunDecisionLedgerReason(summary: AutoresearchRunDecisionSummary): string {
  if (summary.blockingReason) {
    return `Prompt Vault next_hypothesis blocked: ${summary.blockingReason}`;
  }

  return `Prompt Vault next_hypothesis -> ${summary.status}: ${summary.nextHypothesis ?? summary.stateRead ?? "decision recorded"}`;
}

function buildPromptVaultDecisionStatus(
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchPromptVaultDecisionStatus {
  const lastPostRunDecision = findLastPostRunDecision(runs);
  return {
    availability:
      lastPostRunDecision === null
        ? "available_not_yet_used"
        : lastPostRunDecision.status === "blocked"
          ? "available_last_used_blocked"
          : "available_last_used_successfully",
    lastPostRunDecision,
  };
}

function buildAutoresearchLlamacppCampaignProjectionStatus(
  cwd: string | undefined,
): AutoresearchLlamacppCampaignProjectionStatus {
  if (!cwd) {
    return {
      availability: "not_projected",
      projectionPath: null,
      manifestPath: null,
      campaignId: null,
      manifestKey: null,
      receiptRootPath: null,
      overallState: null,
      staleReason: null,
      updatedAt: null,
    };
  }

  const projectionState = loadLlamacppCampaignProjectionState({ cwd });
  return {
    availability: projectionState.availability,
    projectionPath: projectionState.path,
    manifestPath: projectionState.projection?.manifest.path ?? null,
    campaignId: projectionState.projection?.manifest.campaignId ?? null,
    manifestKey: projectionState.projection?.manifest.manifestKey ?? null,
    receiptRootPath: projectionState.projection?.manifest.receiptRootPath ?? null,
    overallState: projectionState.projection?.status.overallState ?? null,
    staleReason: projectionState.staleReason,
    updatedAt: projectionState.projection?.updatedAt ?? null,
  };
}

function findLastPostRunDecision(
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchRunDecisionSummary | null {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const decision = runs[index]?.decision;
    if (decision) {
      return decision;
    }
  }

  return null;
}

function enrichSetupDecisionPacket(cwd: string, packet: SetupDecisionPacket): SetupDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const repoContext =
    packet.repoContext.length > 0
      ? [...packet.repoContext]
      : [
          `cwd: ${cwd}`,
          `phase: ${AUTORESEARCH_PHASE}`,
          `machine state: ${status.runtimeProjection.state}`,
        ];
  const benchmarkSurfaces =
    packet.benchmarkSurfaces.length > 0
      ? [...packet.benchmarkSurfaces]
      : [
          status.currentSegment.benchmarkCommand
            ? `benchmark command: ${status.currentSegment.benchmarkCommand}`
            : "benchmark command: (unset)",
          `checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        ];
  const existingArtifacts =
    packet.existingArtifacts.length > 0
      ? [...packet.existingArtifacts]
      : AUTORESEARCH_LOCAL_ARTIFACTS.filter((artifact) => existsSync(path.join(cwd, artifact)));

  return {
    ...packet,
    repoContext,
    benchmarkSurfaces,
    existingArtifacts,
  };
}

function enrichFinalizeDecisionPacket(
  cwd: string,
  packet: FinalizeDecisionPacket,
): FinalizeDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  return {
    ...packet,
    campaignContext:
      packet.campaignContext.length > 0
        ? [...packet.campaignContext]
        : [
            `campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
            `machine state: ${status.runtimeProjection.state}`,
            `baseline: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
            `best: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
          ],
  };
}

function createConfigFromInput(
  input: ExecuteAutoresearchRunInput,
  paths: AutoresearchPaths,
): AutoresearchConfigReceipt {
  const name = input.name?.trim();
  const metricName = input.metricName?.trim();
  if (!name) {
    throw new Error("name is required when bootstrapping or reconfiguring the bounded runtime");
  }
  if (!metricName) {
    throw new Error(
      "metricName is required when bootstrapping or reconfiguring the bounded runtime",
    );
  }

  const benchmarkCommand = input.benchmarkCommand ?? defaultBenchmarkCommand(paths);
  if (!benchmarkCommand) {
    throw new Error(
      "benchmarkCommand is required when no config receipt exists and autoresearch.sh is missing",
    );
  }

  const checksCommand = resolveChecksCommand(input.checksCommand, undefined, paths);
  return createConfigReceipt({
    name,
    metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction ?? "lower",
    metricThreshold: input.metricThreshold,
    benchmarkCommand,
    checksCommand,
  });
}

function resolveChecksCommand(
  requestedChecksCommand: string | null | undefined,
  configuredChecksCommand: string | null | undefined,
  paths: AutoresearchPaths,
): string | null {
  if (requestedChecksCommand === null) return null;
  return requestedChecksCommand ?? configuredChecksCommand ?? defaultChecksCommand(paths);
}

function defaultBenchmarkCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.benchmarkScriptPath) ? "bash autoresearch.sh" : null;
}

function defaultChecksCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.checksScriptPath) ? "bash autoresearch.checks.sh" : null;
}

function determineRunStatus(input: {
  currentSegment: CurrentSegmentView;
  benchmarkSucceeded: boolean;
  metricContractFailed: boolean;
  checksPassed: boolean | null;
}): RunStatus {
  if (!input.benchmarkSucceeded || input.metricContractFailed) {
    return "crash";
  }
  if (input.checksPassed === false) {
    return "checks_failed";
  }
  const hasSuccessfulRun = input.currentSegment.runs.some(isSuccessfulMetricRun);
  return hasSuccessfulRun ? "candidate" : "baseline";
}

function decorateRunDescription(
  description: string,
  benchmarkSucceeded: boolean,
  metricContractFailed: boolean,
  checksPassed: boolean | null,
): string {
  if (!benchmarkSucceeded) {
    return `${description} (benchmark failed or timed out)`;
  }
  if (metricContractFailed) {
    return `${description} (primary metric missing)`;
  }
  if (checksPassed === false) {
    return `${description} (checks failed)`;
  }
  return description;
}

function reconstructOriginalRunDescription(description: string): string {
  return description
    .replace(/ \(benchmark failed or timed out\)$/u, "")
    .replace(/ \(primary metric missing\)$/u, "")
    .replace(/ \(checks failed\)$/u, "");
}

function commandOutputBytes(stdout: string, stderr: string): number {
  return Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
}

function appendCommandOutputChunk(current: string, chunk: string): string {
  const combined = `${current}${chunk}`;
  if (Buffer.byteLength(combined, "utf8") <= COMMAND_OUTPUT_MAX_BYTES) {
    return combined;
  }
  return combined.slice(-COMMAND_OUTPUT_MAX_BYTES);
}

async function runShellCommand(input: {
  command: string;
  cwd: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<CommandExecutionSummary> {
  input.signal?.throwIfAborted();
  const startedAt = Date.now();

  return await new Promise<CommandExecutionSummary>((resolve, reject) => {
    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let outputLimitExceeded = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    const terminate = (signal: NodeJS.Signals) => {
      killTree(child.pid, signal);
    };

    const requestTermination = (mode: "timeout" | "abort" | "output_limit") => {
      if (mode === "timeout") {
        timedOut = true;
      } else if (mode === "abort") {
        aborted = true;
      } else {
        outputLimitExceeded = true;
      }
      terminate("SIGTERM");
      killTimer = setTimeout(() => {
        terminate("SIGKILL");
      }, 250);
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(new Error(`Command aborted: ${input.command}`));
        return;
      }
      const boundedStderr = outputLimitExceeded
        ? `${stderr}\nCommand output exceeded ${COMMAND_OUTPUT_MAX_BYTES} bytes and was terminated.`
        : stderr;
      resolve({
        command: input.command,
        exitCode,
        timedOut,
        aborted,
        durationSeconds: (Date.now() - startedAt) / 1000,
        stdout,
        stderr: boundedStderr,
        outputTail: tailText(joinOutput({ stdout, stderr: boundedStderr })),
      });
    };

    const onAbort = () => {
      requestTermination("abort");
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = appendCommandOutputChunk(stdout, chunk);
      if (commandOutputBytes(stdout, stderr) > COMMAND_OUTPUT_MAX_BYTES) {
        requestTermination("output_limit");
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = appendCommandOutputChunk(stderr, chunk);
      if (commandOutputBytes(stdout, stderr) > COMMAND_OUTPUT_MAX_BYTES) {
        requestTermination("output_limit");
      }
    });

    child.on("error", (error) => {
      stderr += error instanceof Error ? error.message : String(error);
      finish(null);
    });

    child.on("close", (code) => {
      finish(code);
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      requestTermination("timeout");
    }, Math.max(1, input.timeoutSeconds) * 1000);
  });
}

function buildAutoresearchRuntimeStatusFromEntries(
  cwd: string | undefined,
  paths: AutoresearchPaths | null,
  entries: AutoresearchReceipt[],
  invalidLineCount: number,
  options: { persistSnapshot?: boolean } = {},
): AutoresearchRuntimeStatus {
  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const empiricalPosture = buildAutoresearchEmpiricalPosture(
    currentSegment,
    currentSegmentView.runs,
  );
  const promptVaultDecisions = buildPromptVaultDecisionStatus(currentSegmentView.runs);
  const runtimeProjection = buildRuntimeProjection(
    cwd,
    currentSegment,
    promptVaultDecisions.lastPostRunDecision,
  );
  const defaultControl = deriveAutoresearchControlState({
    machineState: runtimeProjection.state,
    blockedReason: runtimeProjection.blockedReason,
    completionReason: runtimeProjection.completionReason,
  });
  const llamacppCampaignProjection = buildAutoresearchLlamacppCampaignProjectionStatus(cwd);
  const snapshotInput =
    cwd !== undefined
      ? createRuntimeSnapshotInput(cwd, currentSegment, runtimeProjection, promptVaultDecisions)
      : null;
  const loadedControl =
    cwd !== undefined && snapshotInput
      ? loadAutoresearchRuntimeControlState({ cwd, current: snapshotInput })
      : null;

  if (options.persistSnapshot !== false && cwd && snapshotInput && existsSync(cwd)) {
    persistAutoresearchRuntimeSnapshot({
      cwd,
      current: snapshotInput,
      control: loadedControl?.control ?? defaultControl,
    });
  }

  return {
    phase: AUTORESEARCH_PHASE,
    cwd,
    commandName: AUTORESEARCH_COMMAND_NAME,
    toolNames: [
      AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
      AUTORESEARCH_STATUS_TOOL_NAME,
      AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
      AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
      AUTORESEARCH_RUN_TOOL_NAME,
      AUTORESEARCH_CONTROL_TOOL_NAME,
      AUTORESEARCH_FINALIZE_TOOL_NAME,
      AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
      AUTORESEARCH_LOOP_TOOL_NAME,
      AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
      AUTORESEARCH_AUTOPLAN_TOOL_NAME,
      AUTORESEARCH_SETUP_TOOL_NAME,
      AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
      AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
      AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
    ],
    localArtifacts: [...AUTORESEARCH_LOCAL_ARTIFACTS],
    receiptEntryTypes: ["config", "run"],
    readyPromptVaultTemplates: [...READY_PROMPT_VAULT_TEMPLATES],
    blockedPromptVaultTemplates: [...BLOCKED_PROMPT_VAULT_TEMPLATES],
    receiptPath: paths?.jsonlPath,
    hasReceiptLog: paths ? existsSync(paths.jsonlPath) : false,
    hasBenchmarkScript: paths ? existsSync(paths.benchmarkScriptPath) : false,
    hasChecksScript: paths ? existsSync(paths.checksScriptPath) : false,
    invalidReceiptLines: invalidLineCount,
    currentSegment,
    empiricalPosture,
    runtimeProjection,
    runtimeSnapshot: loadedControl?.snapshotStatus ?? {
      exists: false,
      reuse: "unavailable",
      discardedReason: null,
      segmentKey: null,
      runtimeKey: null,
    },
    control: loadedControl?.control ?? defaultControl,
    promptVaultDecisions,
    llamacppCampaignProjection,
    nextSlices: [],
  };
}

function buildRuntimeProjection(
  cwd: string | undefined,
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
): AutoresearchRuntimeProjection {
  if (!cwd) {
    return createReceiptFallbackProjection(currentSegment, lastPostRunDecision);
  }

  const loadResult = loadAutoresearchLedger(cwd);
  const hasLedger = existsSync(resolveAutoresearchLedgerPath(cwd));
  if (hasLedger || loadResult.invalidLineCount > 0 || loadResult.entries.length > 0) {
    const projection = projectAutoresearchLedger(cwd);
    if (projectionMatchesCurrentSegment(projection, currentSegment)) {
      return {
        state: projection.state,
        resumeState: projection.context.resumeState,
        blockedReason: projection.context.blockedReason,
        completionReason: projection.context.completionReason,
        source: "ledger",
        ledgerPath: projection.ledgerPath,
        hasLedger: projection.hasLedger,
        invalidLedgerLines: projection.invalidLineCount,
        eventCount: projection.eventCount,
        replayedEventCount: projection.replayedEventCount,
        rejectedEvents: projection.rejectedEvents,
        syncIssues: [],
      };
    }

    const fallback = createReceiptFallbackProjection(
      currentSegment,
      lastPostRunDecision,
      projection.ledgerPath,
    );
    return {
      ...fallback,
      hasLedger: projection.hasLedger,
      invalidLedgerLines: projection.invalidLineCount,
      eventCount: projection.eventCount,
      replayedEventCount: projection.replayedEventCount,
      rejectedEvents: projection.rejectedEvents,
      syncIssues: [describeRuntimeProjectionSyncIssue(projection, currentSegment)],
    };
  }

  return createReceiptFallbackProjection(
    currentSegment,
    lastPostRunDecision,
    resolveAutoresearchLedgerPath(cwd),
  );
}

function createRuntimeSnapshotInput(
  cwd: string,
  currentSegment: AutoresearchSegmentSummary,
  runtimeProjection: AutoresearchRuntimeProjection,
  promptVaultDecisions: AutoresearchPromptVaultDecisionStatus,
): AutoresearchRuntimeSnapshotInput {
  return {
    cwd,
    phase: AUTORESEARCH_PHASE,
    projectionSource: runtimeProjection.source,
    machine: {
      state: runtimeProjection.state,
      resumeState: runtimeProjection.resumeState,
      blockedReason: runtimeProjection.blockedReason,
      completionReason: runtimeProjection.completionReason,
    },
    segment: {
      name: currentSegment.name,
      metricName: currentSegment.metricName,
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction,
      metricThreshold: currentSegment.metricThreshold,
      benchmarkCommand: currentSegment.benchmarkCommand,
      checksCommand: currentSegment.checksCommand,
      runCount: currentSegment.runCount,
      successfulRunCount: currentSegment.successfulRunCount,
      baselineMetric: currentSegment.baselineMetric,
      bestMetric: currentSegment.bestMetric,
      lastRunStatus: currentSegment.lastRunStatus,
      lastRunMetric: currentSegment.lastRunMetric,
    },
    decision: {
      availability: promptVaultDecisions.availability,
      lastPostRunDecision: promptVaultDecisions.lastPostRunDecision,
    },
  };
}

function createReceiptFallbackProjection(
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
  ledgerPath?: string,
): AutoresearchRuntimeProjection {
  const projection = projectAutoresearchLedgerEntries(
    [],
    createFallbackMachineInput(currentSegment, lastPostRunDecision),
  );
  return {
    state: projection.state,
    resumeState: projection.context.resumeState,
    blockedReason: projection.context.blockedReason,
    completionReason: projection.context.completionReason,
    source: "receipt_fallback",
    ledgerPath,
    hasLedger: false,
    invalidLedgerLines: 0,
    eventCount: projection.eventCount,
    replayedEventCount: projection.replayedEventCount,
    rejectedEvents: projection.rejectedEvents,
    syncIssues: ledgerPath ? ["event ledger missing or stale; projected from receipt log"] : [],
  };
}

function projectionMatchesCurrentSegment(
  projection: ReturnType<typeof projectAutoresearchLedger>,
  currentSegment: AutoresearchSegmentSummary,
): boolean {
  if (currentSegment.configured !== (projection.context.segment !== null)) {
    return false;
  }
  if (!currentSegment.configured) {
    return projection.context.runCount === 0;
  }

  return (
    projection.context.segment?.name === currentSegment.name &&
    projection.context.segment?.metricName === currentSegment.metricName &&
    projection.context.segment?.metricUnit === currentSegment.metricUnit &&
    projection.context.segment?.direction === currentSegment.direction &&
    (projection.context.segment?.metricThreshold ?? null) === currentSegment.metricThreshold &&
    projection.context.segment?.benchmarkCommand === currentSegment.benchmarkCommand &&
    projection.context.segment?.checksCommand === currentSegment.checksCommand &&
    projection.context.runCount === currentSegment.runCount &&
    projection.context.successfulRunCount === currentSegment.successfulRunCount &&
    projection.context.baselineMetric === currentSegment.baselineMetric &&
    projection.context.bestMetric === currentSegment.bestMetric &&
    projection.context.lastRunStatus === currentSegment.lastRunStatus &&
    projection.context.lastRunMetric === currentSegment.lastRunMetric
  );
}

function describeRuntimeProjectionSyncIssue(
  projection: ReturnType<typeof projectAutoresearchLedger>,
  currentSegment: AutoresearchSegmentSummary,
): string {
  return [
    `ledger state ${projection.state}`,
    `ledger run count ${projection.context.runCount}`,
    `receipt run count ${currentSegment.runCount}`,
  ].join("; ");
}

function createFallbackMachineInput(
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
): CampaignMachineInput | undefined {
  if (!currentSegment.configured) {
    return undefined;
  }

  return {
    segment: {
      name: currentSegment.name ?? "(unnamed)",
      metricName: currentSegment.metricName ?? "(unset)",
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction ?? "lower",
      metricThreshold: currentSegment.metricThreshold,
      benchmarkCommand: currentSegment.benchmarkCommand ?? "",
      checksCommand: currentSegment.checksCommand,
    },
    runCount: currentSegment.runCount,
    successfulRunCount: currentSegment.successfulRunCount,
    baselineMetric: currentSegment.baselineMetric,
    bestMetric: currentSegment.bestMetric,
    lastRunStatus: currentSegment.lastRunStatus,
    lastRunMetric: currentSegment.lastRunMetric,
    awaitingDecision: false,
    blockedReason:
      lastPostRunDecision?.mappedDecision === "block"
        ? (lastPostRunDecision.blockingReason ?? "campaign blocked pending operator action")
        : null,
    resumeState:
      lastPostRunDecision?.mappedDecision === "rebaseline"
        ? "rebaseline_needed"
        : lastPostRunDecision?.mappedDecision === "finalize"
          ? "finalize_candidate"
          : null,
  };
}

function ensureEventLedgerInitializedFromReceipts(
  cwd: string,
  entries: AutoresearchReceipt[],
): void {
  if (entries.length === 0) {
    return;
  }

  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const reconstructedEntries = reconstructLedgerEntriesForCurrentSegment(currentSegmentView);
  const loadResult = loadAutoresearchLedger(cwd);
  if (loadResult.entries.length === 0 && loadResult.invalidLineCount === 0) {
    appendLedgerEntries(cwd, reconstructedEntries);
    return;
  }

  const projection = projectAutoresearchLedger(cwd);
  if (!projectionMatchesCurrentSegment(projection, currentSegment)) {
    appendLedgerEntries(cwd, reconstructedEntries);
  }
}

function appendLedgerEntries(cwd: string, entries: AutoresearchLedgerEventEntry[]): void {
  for (const entry of entries) {
    appendLedgerEvent(cwd, entry);
  }
}

function reconstructLedgerEntriesForCurrentSegment(
  currentSegment: CurrentSegmentView,
): AutoresearchLedgerEventEntry[] {
  if (!currentSegment.config) {
    return [];
  }

  const config = currentSegment.config;
  return [
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
      config.createdAt,
    ),
    ...currentSegment.runs.flatMap((run) => reconstructLedgerEntriesForRun(run, config)),
  ];
}

function reconstructLedgerEntriesForRun(
  run: AutoresearchRunReceipt,
  config: AutoresearchConfigReceipt,
): AutoresearchLedgerEventEntry[] {
  const benchmarkCommand =
    run.benchmarkCommand ?? config.benchmarkCommand ?? "bash autoresearch.sh";
  const checksCommand = run.checksCommand ?? config.checksCommand ?? null;
  const entries: AutoresearchLedgerEventEntry[] = [
    createLedgerEventEntry(
      campaignEvents.startRun({
        description: reconstructOriginalRunDescription(run.description),
        benchmarkCommand,
        checksCommand,
      }),
      run.timestamp,
    ),
  ];

  if (run.status === "crash") {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkFailed("reconstructed crash receipt"),
        run.timestamp,
      ),
    );
  } else {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkSucceeded({
          metric: run.metric,
          requiresChecks: checksCommand !== null,
        }),
        run.timestamp,
      ),
    );

    if (checksCommand !== null) {
      entries.push(
        createLedgerEventEntry(
          run.status === "checks_failed" || run.checksPassed === false
            ? campaignEvents.checksFailed("reconstructed checks failure receipt")
            : campaignEvents.checksSucceeded(),
          run.timestamp,
        ),
      );
    }
  }

  entries.push(
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({
        status: run.status,
        metric: run.metric,
      }),
      run.timestamp,
    ),
    createLedgerEventEntry(
      campaignEvents.decideNextAction(
        run.decision?.mappedDecision ?? "iterate",
        run.decision
          ? formatRunDecisionLedgerReason(run.decision)
          : "reconstructed from receipt history",
      ),
      run.timestamp,
    ),
  );

  return entries;
}

function ensureMachineReadyForBoundedRun(
  cwd: string,
  options: { allowBootstrapConfig?: boolean; allowRebaselineReconfigure?: boolean } = {},
): void {
  let status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });

  if (status.control.kind === "continue") {
    consumeAutoresearchContinueControl(cwd, status);
    status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  }

  if (status.control.kind === "awaiting_operator") {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state awaiting_operator requires one of: ${formatAllowedActions(status.control.allowedActions)}`,
    );
  }

  if (status.control.kind === "rebaseline" && options.allowRebaselineReconfigure === true) {
    return;
  }

  if (
    status.control.kind === "rebaseline" ||
    status.control.kind === "finalize" ||
    status.control.kind === "stop"
  ) {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state ${status.control.kind} is selected`,
    );
  }

  if (!canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
    if (
      options.allowBootstrapConfig === true &&
      status.runtimeProjection.state === "segment_unconfigured"
    ) {
      return;
    }
    throw new Error(
      `Cannot start a bounded autoresearch run while the machine is in state ${status.runtimeProjection.state}`,
    );
  }
}

function consumeAutoresearchContinueControl(cwd: string, status: AutoresearchRuntimeStatus): void {
  switch (status.runtimeProjection.state) {
    case "awaiting_decision":
      appendLedgerEvent(
        cwd,
        createLedgerEventEntry(
          campaignEvents.decideNextAction(
            "iterate",
            "operator selected continue through autoresearch_runtime_control",
          ),
        ),
      );
      return;
    case "finalize_candidate":
      appendLedgerEvent(cwd, createLedgerEventEntry(campaignEvents.rejectFinalize()));
      return;
    default:
      return;
  }
}

function createCampaignSegmentConfigFromReceipt(
  receipt: AutoresearchConfigReceipt,
): CampaignSegmentConfig {
  return {
    name: receipt.name,
    metricName: receipt.metricName,
    metricUnit: receipt.metricUnit,
    direction: receipt.direction,
    ...(receipt.metricThreshold === undefined ? {} : { metricThreshold: receipt.metricThreshold }),
    benchmarkCommand: receipt.benchmarkCommand ?? "bash autoresearch.sh",
    checksCommand: receipt.checksCommand ?? null,
  };
}

function describeBenchmarkFailure(
  benchmark: CommandExecutionSummary,
  metricContractFailed: boolean,
): string {
  if (metricContractFailed) {
    return "primary metric missing from benchmark output";
  }
  if (benchmark.timedOut) {
    return "benchmark timed out";
  }
  if (benchmark.exitCode === null) {
    return "benchmark ended with a signal or process error";
  }
  return `benchmark exited with code ${benchmark.exitCode}`;
}

function summarizeCurrentSegment(currentSegment: CurrentSegmentView): AutoresearchSegmentSummary {
  const successfulRuns = currentSegment.runs.filter(isSuccessfulMetricRun);
  const optimizationRuns = successfulRuns.filter(
    (run) => (run.runKind ?? "ordinary") !== "calibration",
  );
  const baselineMetric = successfulRuns[0]?.metric ?? null;
  const metricInterpretation = currentSegment.config
    ? interpretMetricNoise(successfulRuns, currentSegment.config)
    : null;
  let bestMetric = optimizationRuns[0]?.metric ?? baselineMetric;

  if (currentSegment.config) {
    for (const run of optimizationRuns) {
      if (
        bestMetric === null ||
        isBetter(run.metric, bestMetric, currentSegment.config.direction)
      ) {
        bestMetric = run.metric;
      }
    }
  }

  return {
    configured: currentSegment.config !== null,
    name: currentSegment.config?.name ?? null,
    metricName: currentSegment.config?.metricName ?? null,
    metricUnit: currentSegment.config?.metricUnit ?? "",
    direction: currentSegment.config?.direction ?? null,
    metricThreshold: currentSegment.config?.metricThreshold ?? null,
    benchmarkCommand: currentSegment.config?.benchmarkCommand ?? null,
    checksCommand: currentSegment.config?.checksCommand ?? null,
    runCount: currentSegment.runs.length,
    successfulRunCount: successfulRuns.length,
    baselineMetric,
    bestMetric,
    confidence:
      currentSegment.config && optimizationRuns.length > 0
        ? computeConfidence(optimizationRuns, currentSegment.config.direction)
        : null,
    metricInterpretation,
    empiricalDecisionClass: classifyLatestEmpiricalDecision(
      currentSegment.runs,
      successfulRuns,
      currentSegment.config,
      metricInterpretation,
    ),
    lastRunStatus: currentSegment.runs.at(-1)?.status ?? null,
    lastRunKind: currentSegment.runs.at(-1)?.runKind ?? null,
    lastRunMetric: currentSegment.runs.at(-1)?.metric ?? null,
  };
}

function buildAutoresearchEmpiricalPosture(
  segment: AutoresearchSegmentSummary,
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchEmpiricalPosture {
  const ordinaryCandidateRuns = runs.filter(
    (run) =>
      run.status === "candidate" &&
      (run.runKind ?? "ordinary") !== "calibration" &&
      isSuccessfulMetricRun(run),
  );
  const calibrationRuns = runs.filter(
    (run) => (run.runKind ?? "ordinary") === "calibration" && isSuccessfulMetricRun(run),
  );
  if (!segment.configured) {
    return {
      classification: "unconfigured",
      summary: `no campaign configured yet`,
      promotionReady: false,
      recommendedNextAction: "configure a bounded segment before collecting evidence",
    };
  }

  if (segment.runCount === 0) {
    return {
      classification: "no_runs",
      summary: `configured but no baseline or run evidence exists yet`,
      promotionReady: false,
      recommendedNextAction: "run a baseline before interpreting candidate evidence",
    };
  }

  if (segment.empiricalDecisionClass === "measurement_invalid") {
    return {
      classification: "measurement_invalid",
      summary: `measurement is invalid; no promotion-ready evidence exists`,
      promotionReady: false,
      recommendedNextAction: "fix the benchmark or metric contract before another optimization run",
    };
  }

  if (segment.empiricalDecisionClass === "checks_failed") {
    return {
      classification: "checks_failed",
      summary: `checks failed; candidate evidence is blocked`,
      promotionReady: false,
      recommendedNextAction:
        "diagnose the check failure before promotion or another optimization claim",
    };
  }

  if (segment.successfulRunCount === 0 || segment.baselineMetric === null) {
    return {
      classification: "measurement_invalid",
      summary: `no successful metric baseline is available`,
      promotionReady: false,
      recommendedNextAction: "collect a successful baseline metric before interpreting the segment",
    };
  }

  if (ordinaryCandidateRuns.length === 0) {
    if (calibrationRuns.length > 0 || segment.empiricalDecisionClass === "calibration_signal") {
      return {
        classification: "calibration_only",
        summary: `calibration-only; no ordinary candidate evidence yet`,
        promotionReady: false,
        recommendedNextAction: "run an ordinary candidate before claiming improvement",
      };
    }
    return {
      classification: "baseline_only",
      summary: `baseline-only; no candidate evidence yet`,
      promotionReady: false,
      recommendedNextAction: "collect calibration samples or bind one ordinary candidate run",
    };
  }

  if (segment.empiricalDecisionClass === "baseline_drift") {
    return {
      classification: "baseline_drift_suspected",
      summary: `baseline drift suspected; candidate result is not promotion-ready`,
      promotionReady: false,
      recommendedNextAction: "rebaseline or collect more candidate samples before promotion",
    };
  }

  if (segment.empiricalDecisionClass === "insufficient_samples") {
    return {
      classification: "under_sampled",
      summary: `under-sampled; candidate result is not promotion-ready`,
      promotionReady: false,
      recommendedNextAction: "collect enough successful samples to separate effect from noise",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_improvement") {
    return {
      classification: "candidate_review_ready",
      summary: `ordinary candidate evidence exists and is review-ready`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_satisfied") {
    return {
      classification: "threshold_satisfied",
      summary: `candidate satisfies the primary threshold-style success condition`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote threshold-satisfied evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_preserved") {
    return {
      classification: "threshold_preserved",
      summary: `candidate preserves the primary threshold-style success condition`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote threshold-preserved evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_regressed") {
    return {
      classification: "threshold_regressed",
      summary: `candidate regressed the primary threshold-style success condition`,
      promotionReady: false,
      recommendedNextAction: "discard or revise the candidate before another measured run",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_regression") {
    return {
      classification: "candidate_regression",
      summary: `candidate regression; do not promote this result`,
      promotionReady: false,
      recommendedNextAction: "discard or revise the candidate before another measured run",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_neutral") {
    return {
      classification: "candidate_neutral",
      summary: `candidate appears neutral on the primary metric`,
      promotionReady: false,
      recommendedNextAction:
        "promote only with separate non-metric justification; otherwise try another candidate",
    };
  }

  return {
    classification: "inconclusive",
    summary: `result is inconclusive; no promotion-ready candidate evidence yet`,
    promotionReady: false,
    recommendedNextAction:
      "collect more samples, rebaseline, or bind a clearer candidate hypothesis",
  };
}

function getCurrentSegment(entries: AutoresearchReceipt[]): CurrentSegmentView {
  let config: AutoresearchConfigReceipt | null = null;
  let runs: AutoresearchRunReceipt[] = [];

  for (const entry of entries) {
    if (entry.type === "config") {
      config = entry;
      runs = [];
      continue;
    }
    if (config) {
      runs.push(entry);
    }
  }

  return { config, runs };
}

function parseConfigReceipt(value: Record<string, unknown>): AutoresearchConfigReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported config receipt version: ${String(value.version)}`);
  }
  if (value.direction !== "lower" && value.direction !== "higher") {
    throw new Error(`Invalid metric direction: ${String(value.direction)}`);
  }
  if (typeof value.name !== "string" || typeof value.metricName !== "string") {
    throw new Error("Config receipt requires string name and metricName fields");
  }
  const metricThreshold = normalizeMetricThreshold(value.metricThreshold);
  return {
    type: "config",
    version: 1,
    name: value.name,
    metricName: value.metricName,
    metricUnit: typeof value.metricUnit === "string" ? value.metricUnit : "",
    direction: value.direction,
    ...(metricThreshold === undefined ? {} : { metricThreshold }),
    createdAt: coerceNumber(value.createdAt, "createdAt"),
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
  };
}

function parseRunReceipt(value: Record<string, unknown>): AutoresearchRunReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported run receipt version: ${String(value.version)}`);
  }
  if (!isRunStatus(value.status)) {
    throw new Error(`Invalid run status: ${String(value.status)}`);
  }
  if (typeof value.description !== "string") {
    throw new Error("Run receipt requires a string description field");
  }
  return {
    type: "run",
    version: 1,
    status: value.status,
    runKind: isAutoresearchRunKind(value.runKind) ? value.runKind : undefined,
    experiment: parseExperimentLineage(value.experiment),
    empiricalDecisionClass: isAutoresearchEmpiricalDecisionClass(value.empiricalDecisionClass)
      ? value.empiricalDecisionClass
      : undefined,
    metric: coerceNumber(value.metric, "metric"),
    metrics: parseMetricMap(value.metrics),
    description: value.description,
    timestamp: coerceNumber(value.timestamp, "timestamp"),
    commit: typeof value.commit === "string" ? value.commit : undefined,
    iteration: typeof value.iteration === "number" ? value.iteration : undefined,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? value.confidence
        : value.confidence === null
          ? null
          : null,
    durationSeconds:
      typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds)
        ? value.durationSeconds
        : undefined,
    exitCode:
      typeof value.exitCode === "number" && Number.isFinite(value.exitCode)
        ? value.exitCode
        : value.exitCode === null
          ? null
          : undefined,
    timedOut: typeof value.timedOut === "boolean" ? value.timedOut : undefined,
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
    checksPassed:
      typeof value.checksPassed === "boolean"
        ? value.checksPassed
        : value.checksPassed === null
          ? null
          : undefined,
    checksDurationSeconds:
      typeof value.checksDurationSeconds === "number" &&
      Number.isFinite(value.checksDurationSeconds)
        ? value.checksDurationSeconds
        : value.checksDurationSeconds === null
          ? null
          : undefined,
    decision: parseRunDecisionSummary(value.decision),
  };
}

function parseRunDecisionSummary(value: unknown): AutoresearchRunDecisionSummary | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Run receipt decision summary must be an object.");
  }
  if (value.kind !== "next_hypothesis") {
    throw new Error(`Unsupported run receipt decision kind: ${String(value.kind)}`);
  }
  if (value.templateName !== AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME) {
    throw new Error(`Unexpected run receipt decision template: ${String(value.templateName)}`);
  }
  if (!isNextHypothesisDecisionStatus(value.status)) {
    throw new Error(`Invalid run receipt decision status: ${String(value.status)}`);
  }
  if (typeof value.mappedDecision !== "string" || !isCampaignDecision(value.mappedDecision)) {
    throw new Error(`Invalid run receipt mapped decision: ${String(value.mappedDecision)}`);
  }
  if (
    value.failureStage !== undefined &&
    value.failureStage !== null &&
    !isDecisionFailureStage(value.failureStage)
  ) {
    throw new Error(`Invalid run receipt decision failure stage: ${String(value.failureStage)}`);
  }

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: value.status,
    mappedDecision: value.mappedDecision,
    blockingReason:
      typeof value.blockingReason === "string"
        ? value.blockingReason
        : value.blockingReason === null
          ? null
          : null,
    failureStage:
      value.failureStage === null || value.failureStage === undefined ? null : value.failureStage,
    stateRead: typeof value.stateRead === "string" ? value.stateRead : null,
    nextHypothesis: typeof value.nextHypothesis === "string" ? value.nextHypothesis : null,
    targetFiles: parseStringArray(value.targetFiles),
    expectedPrimaryEffect:
      typeof value.expectedPrimaryEffect === "string" ? value.expectedPrimaryEffect : null,
    timestamp: coerceNumber(value.timestamp, "decision.timestamp"),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function isNextHypothesisDecisionStatus(value: unknown): value is NextHypothesisDecisionStatus {
  return (
    value === "ready" ||
    value === "rebaseline_needed" ||
    value === "finalize_candidate" ||
    value === "blocked"
  );
}

function isDecisionFailureStage(value: unknown): value is AutoresearchDecisionFailureStage {
  return value === "prompt_plane" || value === "executor" || value === "parse";
}

function parseMetricMap(value: unknown): MetricMap {
  if (!isRecord(value)) return {};
  const metrics: MetricMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DENIED_METRIC_NAMES.has(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) {
      metrics[key] = entry;
    }
  }
  return metrics;
}

function formatPromptVaultDecisionAvailability(
  value: AutoresearchPromptVaultDecisionAvailability,
): string {
  switch (value) {
    case "available_not_yet_used":
      return "available (not used yet)";
    case "available_last_used_successfully":
      return "available (last used successfully)";
    case "available_last_used_blocked":
      return "available (last use blocked)";
  }
}

function formatLastPostRunDecision(value: AutoresearchRunDecisionSummary | null): string {
  if (!value) {
    return "(none)";
  }

  const summary =
    value.blockingReason ?? value.nextHypothesis ?? value.stateRead ?? "decision recorded";
  return `${value.status} -> ${value.mappedDecision} (${summary})`;
}

function formatLlamacppCampaignProjectionAvailability(
  value: AutoresearchLlamacppCampaignProjectionAvailability,
): string {
  switch (value) {
    case "current":
      return "current";
    case "stale":
      return "stale";
    default:
      return "not projected";
  }
}

function formatLlamacppCampaignProjectionLabel(
  value: AutoresearchLlamacppCampaignProjectionStatus,
): string {
  if (!value.campaignId && !value.manifestPath) {
    return "(none)";
  }
  if (!value.campaignId) {
    return value.manifestPath ?? "(none)";
  }
  if (!value.manifestPath) {
    return value.campaignId;
  }
  return `${value.campaignId} (${value.manifestPath})`;
}

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}

function formatNextSlices(slices: readonly string[]): string {
  return slices.length > 0 ? slices.join(", ") : "(none currently committed)";
}

function isAutoresearchOperatorAction(value: string): value is AutoresearchOperatorAction {
  return AUTORESEARCH_OPERATOR_ACTIONS.includes(value as AutoresearchOperatorAction);
}

function assertAutoresearchControlActionAllowed(
  status: AutoresearchRuntimeStatus,
  decision: AutoresearchOperatorAction,
): void {
  if (status.control.allowedActions.includes(decision)) {
    return;
  }

  throw new Error(
    `Cannot set autoresearch control to ${decision} while the machine is in state ${status.runtimeProjection.state}; allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
  );
}

function createExplicitAutoresearchControlState(input: {
  status: AutoresearchRuntimeStatus;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt: number;
}): AutoresearchControlStateV1 {
  return {
    kind: input.decision,
    allowedActions: [...input.status.control.allowedActions],
    reason:
      normalizeInlineReason(input.reason ?? null) ??
      defaultAutoresearchControlReason(input.decision, input.status),
    selectedAt: input.selectedAt,
  };
}

function defaultAutoresearchControlReason(
  decision: AutoresearchOperatorAction,
  status: AutoresearchRuntimeStatus,
): string {
  switch (decision) {
    case "continue":
      return canCampaignMachineStartBoundedRun(status.runtimeProjection.state)
        ? "operator approved another bounded runtime iteration"
        : "operator approved continuing from a control-gated runtime posture";
    case "rebaseline":
      return "operator requested rebaseline work before another ordinary bounded run";
    case "finalize":
      return "operator selected finalization as the next bounded control-plane phase";
    case "stop":
      return "operator halted package-local autoresearch progression";
  }
}

function describeAutoresearchControlNextStep(status: AutoresearchRuntimeStatus): string {
  switch (status.control.kind) {
    case "continue":
      if (status.runtimeProjection.state === "finalize_candidate") {
        return "Run autoresearch_runtime_run to consume continue, reject finalization for now, and start another bounded iteration.";
      }
      if (status.runtimeProjection.state === "awaiting_decision") {
        return "Run autoresearch_runtime_run to consume continue and advance the machine back into a runnable bounded posture.";
      }
      return "Run autoresearch_runtime_run to start the next bounded iteration; continue will be consumed once the run starts.";
    case "rebaseline":
      return "Use autoresearch_runtime_run with reconfigure=true (plus name + metricName when required) before another ordinary bounded run.";
    case "finalize":
      return "Use autoresearch_runtime_status with action=finalize for the governed packet or wait for the later finalization slice; ordinary bounded runs stay blocked.";
    case "stop":
      return "No further bounded runs will start until autoresearch_runtime_control changes the control state.";
    case "awaiting_operator":
      return `Use ${AUTORESEARCH_CONTROL_TOOL_NAME} with action=set to choose one of: ${formatAllowedActions(status.control.allowedActions)}.`;
    case "none":
      if (canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
        return "Run autoresearch_runtime_run for the next bounded iteration, or set stop to hold the package-local runtime.";
      }
      if (status.runtimeProjection.state === "segment_unconfigured") {
        return "Bootstrap the bounded runtime with autoresearch_runtime_run using name + metricName, or set stop to hold it idle.";
      }
      if (isCampaignMachineTerminalState(status.runtimeProjection.state)) {
        return "The bounded runtime is complete; no further control action is required in this workstream.";
      }
      if (isCampaignMachineAwaitingOperatorChoice(status.runtimeProjection.state)) {
        return `Choose a lawful control action with ${AUTORESEARCH_CONTROL_TOOL_NAME}: ${formatAllowedActions(status.control.allowedActions)}.`;
      }
      return "Wait for the current bounded runtime transition to settle before issuing another operator control change.";
  }
}

function cloneAutoresearchControlState(
  control: AutoresearchControlStateV1,
): AutoresearchControlStateV1 {
  return {
    kind: control.kind,
    allowedActions: [...control.allowedActions],
    reason: control.reason,
    selectedAt: control.selectedAt,
  };
}

function formatTargetFiles(files: readonly string[]): string {
  return files.length > 0 ? files.join(", ") : "(none)";
}

function renderAutoresearchLearningMarkdown(
  closeout: AutoresearchSegmentCloseout,
  title: string,
): string {
  const metricUnit = closeout.metricUnit;
  return [
    `# ${title}`,
    "",
    "## Summary",
    `- campaign: ${closeout.campaign ?? "(unnamed)"}`,
    `- metric: ${closeout.metricName ?? "(unset)"} (${metricUnit || "unitless"}, ${closeout.direction ?? "unset"} is better)`,
    `- runs: ${closeout.runCount} total / ${closeout.successfulRunCount} successful`,
    `- baseline: ${formatMetricValue(closeout.baselineMetric, metricUnit)}`,
    `- best: ${formatMetricValue(closeout.bestMetric, metricUnit)}`,
    `- empirical decision: ${closeout.empiricalDecisionClass}`,
    `- recommended action: ${closeout.recommendedAction}`,
    "",
    "## Timing interpretation",
    formatMetricInterpretation(closeout.timingInterpretation, metricUnit),
    "",
    "## What was learned",
    `- Current empirical meaning: ${closeout.empiricalDecisionClass}.`,
    `- This packet is learning material, not canonical AK evidence or ontology truth.`,
    "",
    "## Candidate bindings",
    ...(closeout.candidateBindings.length > 0
      ? closeout.candidateBindings.flatMap((binding, index) => [
          `- candidate ${index + 1}`,
          ...formatCandidateBindingLines(binding).map((line) => `  ${line}`),
        ])
      : ["- (none)"]),
    "",
    "## Receipt references",
    `- receipt log: ${closeout.receiptPath}`,
  ].join("\n");
}

function renderAutoresearchAkEvidenceResult(closeout: AutoresearchSegmentCloseout): string {
  return [
    `pi-autoresearch segment closeout for ${closeout.campaign ?? "(unnamed campaign)"}`,
    `metric=${closeout.metricName ?? "(unset)"} ${closeout.metricUnit || "unitless"}; direction=${closeout.direction ?? "unset"}`,
    `runs=${closeout.runCount} total/${closeout.successfulRunCount} successful; baseline=${formatMetricValue(closeout.baselineMetric, closeout.metricUnit)}; best=${formatMetricValue(closeout.bestMetric, closeout.metricUnit)}`,
    `empirical_decision=${closeout.empiricalDecisionClass}`,
    `empirical_posture=${closeout.empiricalPosture.classification}; promotion_ready=${closeout.empiricalPosture.promotionReady ? "yes" : "no"}; ${closeout.empiricalPosture.summary}`,
    `timing_interpretation=${formatMetricInterpretation(closeout.timingInterpretation, closeout.metricUnit)}`,
    `recommended_action=${closeout.recommendedAction}`,
    closeout.candidateBindings.length > 0
      ? `candidate_bindings=${closeout.candidateBindings
          .map((binding) => binding.branch ?? binding.worktreePath ?? binding.source ?? "candidate")
          .join(", ")}`
      : "candidate_bindings=(none)",
    `receipt_log=${closeout.receiptPath}`,
  ].join("\n");
}

function recommendSegmentCloseoutAction(decisionClass: AutoresearchEmpiricalDecisionClass): string {
  switch (decisionClass) {
    case "candidate_improvement":
    case "threshold_satisfied":
    case "threshold_preserved":
      return "verify or finalize the candidate through explicit review/evidence promotion";
    case "candidate_regression":
    case "threshold_regressed":
    case "checks_failed":
    case "measurement_invalid":
      return "discard the candidate or diagnose the measurement/check failure before another optimization run";
    case "calibration_signal":
    case "insufficient_samples":
    case "possible_noise":
      return "collect more evidence or rebaseline before treating the segment as an improvement";
    case "baseline_drift":
      return "investigate environment drift and consider an explicit rebaseline";
    case "candidate_neutral":
      return "treat as neutral; keep only if there is a non-metric reason and record that separately";
    case "baseline":
      return "run a scoped candidate or calibration sample before finalizing";
    case "not_evaluated":
      return "configure and run a bounded segment before closeout";
  }
}

const AUTORESEARCH_CANDIDATE_DECISION_BOUNDARY_WARNINGS = [
  "worktree lifecycle is the candidate keep/discard/rewind primitive; this workbench only plans commands",
  "Replay Fabric is observer/history/recovery-clue only and does not accept, discard, or rewind candidates",
  "ASC rewind is live Pi/session recovery only, not candidate lifecycle authority",
  "durable promotion belongs to external owner surfaces such as AK/KES/adapters after explicit review",
  "this surface does not merge, delete worktrees, reset worktrees, spawn peers, write evidence, or promote",
] as const;

const AUTORESEARCH_CANDIDATE_BIND_BOUNDARY_WARNINGS = [
  "candidate bind is intake only; it prepares measurement metadata and does not execute the benchmark",
  "controller verification remains required for candidate source, base ref, diff summary, and changed files",
  "worktree lifecycle remains the keep/discard/rewind primitive; bind does not merge, delete, reset, or promote",
  "durable promotion and evidence writes remain external owner-surface actions after explicit review",
] as const;

function buildAutoresearchCandidateDecisionConfirmation(input: {
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
  plannedCommands: readonly string[];
}): AutoresearchCandidateDecisionConfirmation {
  const required = input.action !== "status";
  const lifecycleVerb = input.action.replace(/^plan_/u, "");
  const candidateLabel = input.candidate?.label ?? "unbound-candidate";
  const riskLevel: AutoresearchCandidateDecisionConfirmation["riskLevel"] = !required
    ? "none"
    : input.action === "plan_keep"
      ? "review_gate"
      : "destructive_external";
  const blockedReasons: string[] = [];
  if (required && !input.candidate) {
    blockedReasons.push("no controller-verified candidate is bound in the current segment");
  }
  if (input.action === "plan_keep" && !input.status.empiricalPosture.promotionReady) {
    blockedReasons.push("requested keep, but empirical posture is not promotion-ready");
  }
  if (
    required &&
    input.decision !== "keep" &&
    input.decision !== "discard" &&
    input.decision !== "rewind" &&
    input.decision !== "finalize"
  ) {
    blockedReasons.push(
      `recommended decision is ${input.decision}; collect more evidence or rebaseline before applying lifecycle commands`,
    );
  }

  const checklist = required
    ? [
        `candidate binding reviewed: ${candidateLabel}`,
        `empirical posture reviewed: ${input.status.empiricalPosture.classification}; promotion ready=${input.status.empiricalPosture.promotionReady ? "yes" : "no"}`,
        `metric threshold reviewed: ${describeMetricThresholdCaveat(input.status.currentSegment)}`,
        `planned command count reviewed: ${input.plannedCommands.length}`,
        "planned commands are copied/applied outside pi-autoresearch only after operator approval",
        "durable evidence, learning, merge, promotion, and rollback remain owner-routed external actions",
      ]
    : [
        "status inspection only; no lifecycle command is being planned",
        `metric threshold posture: ${describeMetricThresholdCaveat(input.status.currentSegment)}`,
        "use keep/discard/rewind only after reviewing candidate binding and empirical posture",
      ];

  return {
    required,
    riskLevel,
    exactConfirmationPhrase: required
      ? `confirm autoresearch ${lifecycleVerb} ${candidateLabel}`
      : "(none; status inspection only)",
    checklist,
    blockedReasons,
    nextHumanAction:
      blockedReasons.length > 0
        ? "resolve confirmation blockers before applying any external lifecycle command"
        : required
          ? "read the checklist, type or copy the exact confirmation phrase into the external review surface, then apply only the selected external commands"
          : "inspect status and choose keep/discard/rewind only if the candidate binding and empirical posture warrant it",
  };
}

function describeMetricThresholdCaveat(segment: AutoresearchSegmentSummary): string {
  if (segment.metricThreshold === null) {
    return "no explicit threshold set; zero-target blocker/failure metric-name inference may still apply";
  }
  const operator = segment.direction === "higher" ? ">=" : "<=";
  return `explicit success threshold ${operator}${formatMetricValue(segment.metricThreshold, segment.metricUnit)}; external promotion still requires owner-routed review`;
}

function summarizeCandidateForDecision(
  binding: AutoresearchCandidateBinding | null,
): AutoresearchCandidateDecisionSummary | null {
  if (!binding) return null;
  const label =
    binding.branch ??
    binding.worktreePath ??
    binding.diffSummary ??
    binding.source ??
    "bound candidate";
  return {
    source: binding.source,
    worktreePath: binding.worktreePath,
    branch: binding.branch,
    baseRef: binding.baseRef,
    diffSummary: binding.diffSummary,
    filesChanged: [...binding.filesChanged],
    label,
  };
}

function chooseAutoresearchCandidateLifecycleDecision(input: {
  action: AutoresearchCandidateDecisionAction;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}): AutoresearchCandidateLifecycleDecision {
  if (!input.candidate) return "no_candidate_bound_yet";
  if (input.action === "plan_discard") return "discard";
  if (input.action === "plan_rewind") return "rewind";
  if (input.action === "plan_keep") return "keep";
  if (
    input.status.runtimeProjection.state === "finalize_candidate" ||
    input.status.control.kind === "finalize"
  ) {
    return "finalize";
  }

  const posture = input.status.empiricalPosture.classification;
  const decision = input.status.currentSegment.empiricalDecisionClass;
  if (posture === "baseline_drift_suspected" || decision === "baseline_drift") return "rebaseline";
  if (
    decision === "candidate_regression" ||
    decision === "threshold_regressed" ||
    decision === "checks_failed" ||
    decision === "measurement_invalid"
  ) {
    return "discard";
  }
  if (decision === "candidate_neutral") return "rewind";
  if (
    decision === "candidate_improvement" ||
    decision === "threshold_satisfied" ||
    decision === "threshold_preserved"
  ) {
    return input.status.empiricalPosture.promotionReady ? "keep" : "collect_more_samples";
  }
  if (posture === "candidate_review_ready") return "keep";
  return "collect_more_samples";
}

function explainAutoresearchCandidateLifecycleDecision(input: {
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  status: AutoresearchRuntimeStatus;
  candidate: AutoresearchCandidateDecisionSummary | null;
}): string {
  if (!input.candidate) {
    return "No controller-verified candidate binding exists in the current segment; bind a candidate before keep/discard/rewind decisions.";
  }
  if (input.action === "plan_keep") {
    return input.status.empiricalPosture.promotionReady
      ? "Requested keep plan and empirical posture is promotion-ready; preserve the worktree/branch and plan finalization externally."
      : "Requested keep plan is shown read-only, but empirical posture is not promotion-ready; collect more samples or rebaseline before durable promotion.";
  }
  if (input.action === "plan_discard") {
    return "Requested discard plan; cleanup remains operator-confirmed and receipts stay available for review.";
  }
  if (input.action === "plan_rewind") {
    return "Requested rewind plan; reset/recreate commands are proposed only and must be applied explicitly by the operator.";
  }
  switch (input.decision) {
    case "keep":
      return "Candidate evidence is promising enough for a keep/review path; no merge or promotion is automatic.";
    case "discard":
      return "Candidate evidence is invalid, failing, or regressive; discard or diagnose before another optimization run.";
    case "rewind":
      return "Candidate is neutral or not useful enough to keep; rewind the worktree only after explicit operator confirmation.";
    case "rebaseline":
      return "Baseline drift is suspected; rebaseline before deciding whether this candidate is a true improvement.";
    case "collect_more_samples":
      return "Candidate evidence exists but is under-sampled, noisy, calibration-only, or inconclusive.";
    case "finalize":
      return "Candidate can move toward finalization through the explicit finalization owner surface.";
    case "no_candidate_bound_yet":
      return "No candidate binding exists yet.";
  }
}

function buildAutoresearchCandidateDecisionNextCalls(input: {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}): string[] {
  const cwdLiteral = JSON.stringify(input.cwd);
  const calls = [
    `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "candidate_result" })`,
  ];
  if (!input.candidate) {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${cwdLiteral}, candidateWorktree: "<worktree>", candidateBaseRef: "<base-ref>", action: "plan_run" })`,
    );
    return calls;
  }
  if (input.decision === "keep") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_keep" })`,
    );
    calls.push(`${AUTORESEARCH_FINALIZE_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan" })`);
  } else if (input.decision === "finalize") {
    calls.push(`${AUTORESEARCH_FINALIZE_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan" })`);
  } else if (input.decision === "discard") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_discard" })`,
    );
  } else if (input.decision === "rewind") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_rewind" })`,
    );
  } else if (input.decision === "rebaseline") {
    calls.push(
      `${AUTORESEARCH_RUN_TOOL_NAME}({ cwd: ${cwdLiteral}, description: "Rebaseline before candidate decision", reconfigure: true, name: ${JSON.stringify(input.status.currentSegment.name ?? "<campaign>")}, metricName: ${JSON.stringify(input.status.currentSegment.metricName ?? "<metric>")} })`,
    );
  } else if (input.decision === "collect_more_samples") {
    calls.push(
      `${AUTORESEARCH_RUN_TOOL_NAME}({ cwd: ${cwdLiteral}, description: "Collect another ordinary candidate sample" })`,
    );
  }
  calls.push(`${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "closeout" })`);
  return calls;
}

function buildAutoresearchCandidateDecisionCommandPlan(input: {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  candidate: AutoresearchCandidateDecisionSummary | null;
}): string[] {
  const candidate = input.candidate;
  if (!candidate) return [];
  const worktree = candidate.worktreePath;
  const baseRef = candidate.baseRef;
  if (input.action === "plan_keep") {
    return worktree
      ? [`git -C ${shellSingleQuote(worktree)} status --short # read-only pre-review check`]
      : [];
  }
  if (input.action === "plan_discard") {
    const commands: string[] = [];
    if (worktree) {
      commands.push(
        `git -C ${shellSingleQuote(input.cwd)} worktree remove ${shellSingleQuote(worktree)} # plan only; run only after explicit operator confirmation`,
      );
    }
    if (candidate.branch) {
      commands.push(
        `git -C ${shellSingleQuote(input.cwd)} branch -D ${shellSingleQuote(candidate.branch)} # plan only; only after receipts/review no longer need the branch`,
      );
    }
    if (commands.length === 0 && input.candidatePolicy.discard === "suggest_cleanup") {
      commands.push("# no worktree/branch known; inspect candidate_result before cleanup");
    }
    return commands;
  }
  if (input.action === "plan_rewind") {
    if (input.candidatePolicy.rewind === "reset_worktree_to_base") {
      return worktree && baseRef
        ? [
            `git -C ${shellSingleQuote(worktree)} reset --hard ${shellSingleQuote(baseRef)} # plan only; destructive if applied`,
          ]
        : [
            "# rewind requires a candidate worktree path and base ref before a reset command can be planned",
          ];
    }
    return worktree && baseRef
      ? [
          `git -C ${shellSingleQuote(input.cwd)} worktree remove ${shellSingleQuote(worktree)} # plan only; run only after explicit confirmation`,
          `git -C ${shellSingleQuote(input.cwd)} worktree add ${shellSingleQuote(worktree)} ${shellSingleQuote(baseRef)} # plan only; recreates candidate worktree from base`,
        ]
      : [
          "# recreate rewind requires a candidate worktree path and base ref before commands can be planned",
        ];
  }
  return [];
}

function inspectAutoresearchCandidateWorktree(input: {
  cwd: string;
  candidateWorktree: string;
  candidateBranch?: string | null;
  candidateBaseRef?: string | null;
}): AutoresearchCandidateBindInspection {
  const warnings: string[] = [];
  const exists = existsSync(input.candidateWorktree);
  if (!exists) {
    warnings.push(
      "candidate worktree path does not exist; create/select a worktree before measurement",
    );
    return {
      candidateWorktree: input.candidateWorktree,
      exists,
      isGitWorktree: false,
      sameRepository: null,
      repositoryRoot: null,
      branch: stringOrNull(input.candidateBranch),
      head: null,
      baseRef: stringOrNull(input.candidateBaseRef),
      baseRefSource: stringOrNull(input.candidateBaseRef) ? "supplied" : null,
      baseResolved: false,
      statusShort: [],
      filesChanged: [],
      diffSummary: "candidate worktree is unavailable",
      readiness: "blocked",
      readinessReasons: ["candidate worktree path does not exist"],
      warnings,
    };
  }

  const inside = runGitForCandidateBind(input.candidateWorktree, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  const isGitWorktree = inside.ok && inside.stdout.trim() === "true";
  if (!isGitWorktree) {
    warnings.push("candidate path exists but is not a git worktree");
  }

  const repositoryRoot = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["rev-parse", "--show-toplevel"]).stdout,
      )
    : null;
  const cwdCommonDir = runGitForCandidateBind(input.cwd, ["rev-parse", "--git-common-dir"]);
  const candidateCommonDir = runGitForCandidateBind(input.candidateWorktree, [
    "rev-parse",
    "--git-common-dir",
  ]);
  const sameRepository =
    cwdCommonDir.ok && candidateCommonDir.ok
      ? path.resolve(input.cwd, cwdCommonDir.stdout.trim()) ===
        path.resolve(input.candidateWorktree, candidateCommonDir.stdout.trim())
      : null;
  if (sameRepository === false) {
    warnings.push("candidate worktree does not appear to belong to the same git repository as cwd");
  }

  const detectedBranch = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["branch", "--show-current"]).stdout,
      )
    : null;
  const head = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["rev-parse", "--short", "HEAD"]).stdout,
      )
    : null;
  const suppliedBaseRef = stringOrNull(input.candidateBaseRef);
  const inferredBaseRef = suppliedBaseRef
    ? null
    : inferAutoresearchCandidateBindBaseRef(input.candidateWorktree);
  const baseRef = suppliedBaseRef ?? inferredBaseRef?.baseRef ?? null;
  const baseRefSource = suppliedBaseRef ? "supplied" : (inferredBaseRef?.source ?? null);
  const baseCheck = baseRef
    ? runGitForCandidateBind(input.candidateWorktree, [
        "rev-parse",
        "--verify",
        `${baseRef}^{commit}`,
      ])
    : null;
  const baseResolved = Boolean(baseCheck?.ok);
  if (suppliedBaseRef && !baseResolved) {
    warnings.push(
      `candidateBaseRef ${JSON.stringify(suppliedBaseRef)} did not resolve in the candidate worktree`,
    );
  }
  if (!suppliedBaseRef && inferredBaseRef) {
    warnings.push(
      `candidateBaseRef was inferred from ${inferredBaseRef.source}; verify before destructive rewind planning`,
    );
  }
  if (!baseRef) {
    warnings.push(
      "candidateBaseRef was not supplied and could not be inferred; diff summary falls back to working-tree status and rewind plans cannot be complete",
    );
  }

  const statusShort = isGitWorktree
    ? splitNonEmptyStatusLines(
        runGitForCandidateBind(input.candidateWorktree, [
          "status",
          "--short",
          "--untracked-files=all",
        ]).stdout,
      )
    : [];
  const filesChanged = isGitWorktree
    ? deriveCandidateBindFilesChanged({
        worktree: input.candidateWorktree,
        baseRef,
        baseResolved,
        statusShort,
      })
    : [];
  const diffSummary = isGitWorktree
    ? deriveCandidateBindDiffSummary({
        worktree: input.candidateWorktree,
        baseRef,
        baseResolved,
        statusShort,
        filesChanged,
      })
    : "candidate path is not a git worktree";
  const branch = stringOrNull(input.candidateBranch) ?? detectedBranch;
  const readiness = deriveAutoresearchCandidateBindReadiness({
    cwd: input.cwd,
    candidateWorktree: input.candidateWorktree,
    exists,
    isGitWorktree,
    sameRepository,
    branch,
    baseResolved,
    filesChanged,
  });

  return {
    candidateWorktree: input.candidateWorktree,
    exists,
    isGitWorktree,
    sameRepository,
    repositoryRoot,
    branch,
    head,
    baseRef,
    baseRefSource,
    baseResolved,
    statusShort,
    filesChanged,
    diffSummary,
    readiness: readiness.readiness,
    readinessReasons: readiness.reasons,
    warnings,
  };
}

function deriveAutoresearchCandidateBindReadiness(input: {
  cwd: string;
  candidateWorktree: string;
  exists: boolean;
  isGitWorktree: boolean;
  sameRepository: boolean | null;
  branch: string | null;
  baseResolved: boolean;
  filesChanged: string[];
}): { readiness: AutoresearchCandidateBindReadiness; reasons: string[] } {
  const blockedReasons: string[] = [];
  const reviewReasons: string[] = [];
  if (!input.exists) blockedReasons.push("candidate worktree path does not exist");
  if (!input.isGitWorktree) blockedReasons.push("candidate path is not a git worktree");
  if (input.sameRepository === false) {
    blockedReasons.push("candidate worktree is not in the same git repository as cwd");
  }
  if (blockedReasons.length > 0) return { readiness: "blocked", reasons: blockedReasons };

  if (!input.baseResolved) {
    reviewReasons.push("base ref is missing or unresolved; verify before measurement/rewind");
  }
  if (input.filesChanged.length === 0) {
    reviewReasons.push("no candidate files were detected relative to the selected base/status");
  }
  if (input.branch === "main" || input.branch === "master") {
    reviewReasons.push(
      "candidate appears to be on a trunk branch; prefer an isolated candidate branch/worktree",
    );
  }
  if (path.resolve(input.cwd) === path.resolve(input.candidateWorktree)) {
    reviewReasons.push(
      "candidate worktree is the controller cwd; prefer an isolated candidate worktree when possible",
    );
  }
  if (input.filesChanged.length > 25) {
    reviewReasons.push("candidate touches many files; verify scope before measurement");
  }

  return reviewReasons.length > 0
    ? { readiness: "needs_review", reasons: reviewReasons }
    : { readiness: "ready", reasons: [] };
}

function buildAutoresearchCandidateBindNextCalls(input: {
  cwd: string;
  description: string;
  candidateSource: AutoresearchCandidateBindingSource;
  inspection: AutoresearchCandidateBindInspection;
}): string[] {
  const decisionStatusCall = `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(input.cwd)}, action: "status" })`;
  if (input.inspection.readiness !== "ready") {
    const reviewFields = [
      `cwd: ${JSON.stringify(input.cwd)}`,
      `action: "plan_run"`,
      `candidateSource: ${JSON.stringify(input.candidateSource)}`,
      `candidateWorktree: ${JSON.stringify(input.inspection.candidateWorktree)}`,
      `description: ${JSON.stringify(input.description)}`,
    ];
    if (input.inspection.branch) {
      reviewFields.push(`candidateBranch: ${JSON.stringify(input.inspection.branch)}`);
    }
    if (input.inspection.baseRef) {
      reviewFields.push(`candidateBaseRef: ${JSON.stringify(input.inspection.baseRef)}`);
    }
    return [
      `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ ${reviewFields.join(", ")} })`,
      decisionStatusCall,
    ];
  }

  const runFields = [
    `cwd: ${JSON.stringify(input.cwd)}`,
    `description: ${JSON.stringify(input.description)}`,
    `candidateSource: ${JSON.stringify(input.candidateSource)}`,
    `candidateWorktree: ${JSON.stringify(input.inspection.candidateWorktree)}`,
    `candidateBaseRef: ${JSON.stringify(input.inspection.baseRef)}`,
    `candidateDiffSummary: ${JSON.stringify(input.inspection.diffSummary)}`,
    `candidateFilesChanged: ${JSON.stringify(input.inspection.filesChanged)}`,
  ];
  if (input.inspection.branch) {
    runFields.splice(4, 0, `candidateBranch: ${JSON.stringify(input.inspection.branch)}`);
  }
  return [`${AUTORESEARCH_RUN_TOOL_NAME}({ ${runFields.join(", ")} })`, decisionStatusCall];
}

function buildAutoresearchCandidateBindCommandPlan(input: {
  cwd: string;
  inspection: AutoresearchCandidateBindInspection;
}): string[] {
  const worktree = input.inspection.candidateWorktree;
  const commands = [
    `git -C ${shellSingleQuote(worktree)} status --short --untracked-files=all # read-only candidate preflight`,
  ];
  if (input.inspection.baseRef) {
    commands.push(
      `git -C ${shellSingleQuote(worktree)} diff --stat --compact-summary ${shellSingleQuote(input.inspection.baseRef)}...HEAD # read-only base-relative summary`,
    );
    commands.push(
      `git -C ${shellSingleQuote(worktree)} diff --name-only ${shellSingleQuote(input.inspection.baseRef)}...HEAD # read-only candidate files`,
    );
  } else {
    commands.push(
      `git -C ${shellSingleQuote(input.cwd)} worktree list --porcelain # read-only; choose candidate worktree and base ref`,
    );
  }
  return commands;
}

function inferAutoresearchCandidateBindBaseRef(
  worktree: string,
): { baseRef: string; source: string } | null {
  const upstream = nullIfEmpty(
    runGitForCandidateBind(worktree, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]).stdout,
  );
  const candidates = uniqueStrings(
    [upstream, "origin/main", "main", "origin/master", "master"].filter(isNonEmptyString),
  );
  for (const candidate of candidates) {
    const refCheck = runGitForCandidateBind(worktree, [
      "rev-parse",
      "--verify",
      `${candidate}^{commit}`,
    ]);
    if (!refCheck.ok) continue;
    const mergeBase = nullIfEmpty(
      runGitForCandidateBind(worktree, ["merge-base", "HEAD", candidate]).stdout,
    );
    if (mergeBase) return { baseRef: mergeBase, source: `merge-base(HEAD, ${candidate})` };
  }
  return null;
}

function deriveCandidateBindFilesChanged(input: {
  worktree: string;
  baseRef: string | null;
  baseResolved: boolean;
  statusShort: string[];
}): string[] {
  if (input.baseRef && input.baseResolved) {
    const baseFiles = splitNonEmptyLines(
      runGitForCandidateBind(input.worktree, ["diff", "--name-only", `${input.baseRef}...HEAD`])
        .stdout,
    );
    const statusFiles = input.statusShort.map(parseGitStatusPath).filter(isNonEmptyString);
    return filterAutoresearchLocalArtifactPaths(uniqueStrings([...baseFiles, ...statusFiles]));
  }
  return filterAutoresearchLocalArtifactPaths(
    uniqueStrings(input.statusShort.map(parseGitStatusPath).filter(isNonEmptyString)),
  );
}

function deriveCandidateBindDiffSummary(input: {
  worktree: string;
  baseRef: string | null;
  baseResolved: boolean;
  statusShort: string[];
  filesChanged: string[];
}): string {
  if (input.baseRef && input.baseResolved) {
    const summary = splitNonEmptyLines(
      runGitForCandidateBind(input.worktree, [
        "diff",
        "--stat",
        "--compact-summary",
        `${input.baseRef}...HEAD`,
      ]).stdout,
    ).join("; ");
    return (
      summary ||
      `base-relative diff is empty; ${input.statusShort.length} working-tree status line(s)`
    );
  }
  return `${input.filesChanged.length} changed path(s) from working-tree status; provide candidateBaseRef for base-relative diff summary`;
}

function runGitForCandidateBind(
  cwd: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function filterAutoresearchLocalArtifactPaths(files: string[]): string[] {
  return files.filter((file) => !isAutoresearchLocalArtifactPath(file));
}

function isAutoresearchLocalArtifactPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.startsWith(".autoresearch/")) return true;
  return AUTORESEARCH_LOCAL_ARTIFACTS.some(
    (artifact) => normalized === artifact || normalized.startsWith(`${artifact}/`),
  );
}

function parseGitStatusPath(line: string): string | null {
  const raw = line.length >= 3 ? line.slice(3).trim() : line.trim();
  if (!raw) return null;
  const renameMarker = " -> ";
  return raw.includes(renameMarker)
    ? raw.slice(raw.lastIndexOf(renameMarker) + renameMarker.length)
    : raw;
}

function splitNonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(isNonEmptyString);
}

function splitNonEmptyStatusLines(value: string): string[] {
  return value.split(/\r?\n/u).filter((line) => line.trim().length > 0);
}

function isNonEmptyString(value: string | null): value is string {
  return Boolean(value && value.trim().length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes" : "no";
}

function describeAutoresearchBaselineDriftRisk(status: AutoresearchRuntimeStatus): string {
  if (
    status.empiricalPosture.classification === "baseline_drift_suspected" ||
    status.currentSegment.metricInterpretation?.verdict === "baseline_drift"
  ) {
    return "suspected; rebaseline before candidate promotion";
  }
  if (
    status.currentSegment.metricInterpretation?.verdict === "possible_noise" ||
    status.currentSegment.metricInterpretation?.verdict === "insufficient_samples"
  ) {
    return "possible; collect more samples before overclaiming";
  }
  if (!status.currentSegment.configured || status.currentSegment.runCount === 0) {
    return "unknown; no measured segment yet";
  }
  return "not currently indicated by runtime posture";
}

function describeLatestCloseoutChecks(closeout: AutoresearchSegmentCloseout): string {
  return closeout.runs.at(-1)?.checks ?? "not run";
}

function normalizeCandidateBinding(
  input: AutoresearchCandidateBindingInput | null | undefined,
): AutoresearchCandidateBinding | undefined {
  if (!input) return undefined;
  const binding: AutoresearchCandidateBinding = {
    source: isAutoresearchCandidateBindingSource(input.source) ? input.source : null,
    worktreePath: stringOrNull(input.worktreePath),
    branch: stringOrNull(input.branch),
    baseRef: stringOrNull(input.baseRef),
    diffSummary: stringOrNull(input.diffSummary),
    filesChanged: normalizeArray(input.filesChanged),
  };
  return binding.source ||
    binding.worktreePath ||
    binding.branch ||
    binding.baseRef ||
    binding.diffSummary ||
    binding.filesChanged.length > 0
    ? binding
    : undefined;
}

function parseCandidateBinding(value: unknown): AutoresearchCandidateBinding | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeCandidateBinding({
    source: isAutoresearchCandidateBindingSource(value.source) ? value.source : null,
    worktreePath: value.worktreePath === null ? null : stringOrNull(value.worktreePath),
    branch: value.branch === null ? null : stringOrNull(value.branch),
    baseRef: value.baseRef === null ? null : stringOrNull(value.baseRef),
    diffSummary: value.diffSummary === null ? null : stringOrNull(value.diffSummary),
    filesChanged: parseStringArray(value.filesChanged),
  });
}

function isAutoresearchCandidateBindingSource(
  value: unknown,
): value is AutoresearchCandidateBindingSource {
  return value === "candidate_peer_spawn" || value === "manual";
}

function formatCandidateBindingLines(
  binding: AutoresearchCandidateBinding | undefined,
): Array<string | null> {
  if (!binding) return [];
  return [
    binding.source ? `- candidate source: ${binding.source}` : null,
    binding.worktreePath ? `- candidate worktree: ${binding.worktreePath}` : null,
    binding.branch ? `- candidate branch: ${binding.branch}` : null,
    binding.baseRef ? `- candidate base ref: ${binding.baseRef}` : null,
    binding.diffSummary ? `- candidate diff summary: ${binding.diffSummary}` : null,
    binding.filesChanged.length > 0
      ? `- candidate files changed: ${formatTargetFiles(binding.filesChanged)}`
      : null,
  ];
}

function normalizeExperimentLineage(
  input: AutoresearchExperimentLineageInput | null | undefined,
): AutoresearchExperimentLineage | undefined {
  if (!input) return undefined;
  const candidate = normalizeCandidateBinding(input.candidate);
  const lineage: AutoresearchExperimentLineage = {
    hypothesisId: stringOrNull(input.hypothesisId),
    hypothesis: stringOrNull(input.hypothesis),
    interventionSummary: stringOrNull(input.interventionSummary),
    expectedPrimaryEffect: stringOrNull(input.expectedPrimaryEffect),
    targetFiles: normalizeArray(input.targetFiles),
    risk: stringOrNull(input.risk),
    ...(candidate ? { candidate } : {}),
  };
  return lineage.hypothesisId ||
    lineage.hypothesis ||
    lineage.interventionSummary ||
    lineage.expectedPrimaryEffect ||
    lineage.targetFiles.length > 0 ||
    lineage.risk ||
    lineage.candidate
    ? lineage
    : undefined;
}

function parseExperimentLineage(value: unknown): AutoresearchExperimentLineage | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeExperimentLineage({
    hypothesisId: value.hypothesisId === null ? null : stringOrNull(value.hypothesisId),
    hypothesis: value.hypothesis === null ? null : stringOrNull(value.hypothesis),
    interventionSummary:
      value.interventionSummary === null ? null : stringOrNull(value.interventionSummary),
    expectedPrimaryEffect:
      value.expectedPrimaryEffect === null ? null : stringOrNull(value.expectedPrimaryEffect),
    targetFiles: parseStringArray(value.targetFiles),
    risk: value.risk === null ? null : stringOrNull(value.risk),
    candidate: parseCandidateBinding(value.candidate),
  });
}

function formatExperimentLabel(experiment: AutoresearchExperimentLineage): string {
  return (
    experiment.hypothesisId ??
    experiment.hypothesis ??
    experiment.interventionSummary ??
    experiment.expectedPrimaryEffect ??
    "(unlabeled)"
  );
}

function formatExperimentLineageLines(
  experiment: AutoresearchExperimentLineage | undefined,
): string[] {
  if (!experiment) return [];
  return [
    experiment.hypothesisId ? `- hypothesis id: ${experiment.hypothesisId}` : null,
    experiment.hypothesis ? `- hypothesis: ${experiment.hypothesis}` : null,
    experiment.interventionSummary ? `- intervention: ${experiment.interventionSummary}` : null,
    experiment.expectedPrimaryEffect
      ? `- expected primary effect: ${experiment.expectedPrimaryEffect}`
      : null,
    experiment.targetFiles.length > 0
      ? `- experiment target files: ${formatTargetFiles(experiment.targetFiles)}`
      : null,
    experiment.risk ? `- experiment risk: ${experiment.risk}` : null,
    ...formatCandidateBindingLines(experiment.candidate),
  ].filter((line): line is string => line !== null);
}

function describeChecksState(run: AutoresearchRunReceipt): string {
  if (run.checksCommand === null || run.checksCommand === undefined) {
    return "not run";
  }
  if (run.checksPassed === true) {
    return "passed";
  }
  if (run.checksPassed === false) {
    return "failed";
  }
  return "not recorded";
}

function formatRunHistoryLine(run: AutoresearchRunReceipt, metricUnit: string): string {
  return [
    `iteration ${run.iteration ?? "?"}`,
    run.status,
    run.experiment ? `hypothesis ${formatExperimentLabel(run.experiment)}` : null,
    run.empiricalDecisionClass ? `empirical ${run.empiricalDecisionClass}` : null,
    `metric ${formatMetricValue(run.metric, metricUnit)}`,
    run.decision ? `decision ${run.decision.status}` : null,
    run.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function normalizeArray(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeInlineReason(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function formatSetupBlockingReason(outcome: SetupDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return outcome.missingInformation.join("; ") || "setup decision blocked";
}

function formatFinalizeBlockingReason(outcome: FinalizeDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return normalizeInlineReason(outcome.overallResult) ?? "finalize decision blocked";
}

function isDecisionErrorOutcome(
  outcome: SetupDecisionOutcome | NextHypothesisDecisionOutcome | FinalizeDecisionOutcome,
): outcome is
  | Extract<SetupDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<NextHypothesisDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<FinalizeDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }> {
  return "failureStage" in outcome;
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Receipt field ${field} must be a finite number`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === "baseline" ||
    value === "candidate" ||
    value === "keep" ||
    value === "discard" ||
    value === "crash" ||
    value === "checks_failed"
  );
}

function isAutoresearchRunKind(value: unknown): value is AutoresearchRunKind {
  return value === "ordinary" || value === "calibration";
}

function isAutoresearchEmpiricalDecisionClass(
  value: unknown,
): value is AutoresearchEmpiricalDecisionClass {
  return (
    value === "not_evaluated" ||
    value === "measurement_invalid" ||
    value === "checks_failed" ||
    value === "baseline" ||
    value === "insufficient_samples" ||
    value === "possible_noise" ||
    value === "calibration_signal" ||
    value === "candidate_improvement" ||
    value === "candidate_regression" ||
    value === "candidate_neutral" ||
    value === "threshold_satisfied" ||
    value === "threshold_preserved" ||
    value === "threshold_regressed" ||
    value === "baseline_drift"
  );
}

function isSuccessfulMetricRun(run: AutoresearchRunReceipt): boolean {
  return (
    run.status !== "crash" &&
    run.status !== "checks_failed" &&
    typeof run.metric === "number" &&
    Number.isFinite(run.metric)
  );
}

function isBetter(current: number, best: number, direction: MetricDirection): boolean {
  return direction === "lower" ? current < best : current > best;
}

function classifyLatestEmpiricalDecision(
  runs: AutoresearchRunReceipt[],
  successfulRuns: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt | null,
  metricInterpretation: AutoresearchMetricInterpretation | null,
): AutoresearchEmpiricalDecisionClass {
  const latestRun = runs.at(-1);
  if (!latestRun) return "not_evaluated";
  return classifyRunEmpiricalDecision(latestRun, successfulRuns, config, metricInterpretation);
}

function classifyRunEmpiricalDecision(
  run: AutoresearchRunReceipt,
  successfulRuns: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt | null,
  metricInterpretation: AutoresearchMetricInterpretation | null,
): AutoresearchEmpiricalDecisionClass {
  if (run.status === "checks_failed") return "checks_failed";
  if (run.status === "crash") return "measurement_invalid";
  if (!isSuccessfulMetricRun(run)) return "measurement_invalid";
  if (run.status === "baseline" || successfulRuns[0] === run) return "baseline";
  if (!config) return "not_evaluated";

  const baselineMetric = successfulRuns[0]?.metric;
  if (baselineMetric === undefined) return "not_evaluated";

  const delta = directionalDelta(baselineMetric, run.metric, config.direction);
  const runKind = run.runKind ?? "ordinary";

  if (isDurationMetric(config.metricName, config.metricUnit)) {
    if (!metricInterpretation || metricInterpretation.sampleCount < 3) {
      return "insufficient_samples";
    }
    if (delta >= metricInterpretation.noiseBand) {
      if (runKind === "calibration") return "calibration_signal";
      return metricInterpretation.verdict === "baseline_drift"
        ? "baseline_drift"
        : "candidate_improvement";
    }
    if (delta <= -metricInterpretation.noiseBand) {
      return runKind === "calibration" ? "baseline_drift" : "candidate_regression";
    }
    return "possible_noise";
  }

  if (runKind === "calibration") return "possible_noise";
  const threshold = resolveMetricThreshold(config);
  if (threshold !== null) {
    const baselineSatisfied = satisfiesMetricThreshold(baselineMetric, threshold, config.direction);
    const runSatisfied = satisfiesMetricThreshold(run.metric, threshold, config.direction);
    if (runSatisfied && !baselineSatisfied) return "threshold_satisfied";
    if (runSatisfied && baselineSatisfied) return "threshold_preserved";
    if (!runSatisfied && baselineSatisfied) return "threshold_regressed";
  }
  if (isBetter(run.metric, baselineMetric, config.direction)) return "candidate_improvement";
  if (run.metric === baselineMetric) return "candidate_neutral";
  return "candidate_regression";
}

function resolveMetricThreshold(config: AutoresearchConfigReceipt): number | null {
  if (typeof config.metricThreshold === "number" && Number.isFinite(config.metricThreshold)) {
    return config.metricThreshold;
  }
  return isZeroThresholdMetric(config.metricName, config.metricUnit, config.direction) ? 0 : null;
}

function satisfiesMetricThreshold(
  value: number,
  threshold: number,
  direction: MetricDirection,
): boolean {
  return direction === "lower" ? value <= threshold : value >= threshold;
}

function isZeroThresholdMetric(
  metricName: string,
  metricUnit: string,
  direction: MetricDirection,
): boolean {
  if (direction !== "lower") return false;
  if (/^(?:ms|s|sec|secs|seconds|milliseconds)$/iu.test(metricUnit)) return false;
  return /(?:^|[_:-])(?:blockers?|failures?|violations?|errors?|unresolved|remaining|regressions?)(?:$|[_:-])/iu.test(
    metricName,
  );
}

function interpretMetricNoise(
  runs: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt,
): AutoresearchMetricInterpretation | null {
  if (!isDurationMetric(config.metricName, config.metricUnit)) return null;
  if (runs.length === 0) return null;

  const values = runs.map((run) => run.metric);
  const baselineMetric = values[0];
  const bestMetric = selectBestMetric(values, config.direction);
  const latestMetric = values.at(-1) ?? baselineMetric;
  const minMetric = Math.min(...values);
  const maxMetric = Math.max(...values);
  const medianMetric = sortedMedian(values);
  const deviations = values.map((value) => Math.abs(value - medianMetric));
  const mad = sortedMedian(deviations);
  const noiseBand = Math.max(Math.abs(baselineMetric) * 0.05, mad * 2, 1);
  const bestDelta = directionalDelta(baselineMetric, bestMetric, config.direction);
  const latestDelta = directionalDelta(baselineMetric, latestMetric, config.direction);
  const bestDeltaPercent = percentDelta(bestDelta, baselineMetric);
  const latestDeltaPercent = percentDelta(latestDelta, baselineMetric);

  if (values.length < 3) {
    return {
      verdict: "insufficient_samples",
      sampleCount: values.length,
      baselineMetric,
      bestMetric,
      latestMetric,
      minMetric,
      medianMetric,
      maxMetric,
      noiseBand,
      bestDelta,
      latestDelta,
      bestDeltaPercent,
      latestDeltaPercent,
      reason:
        "duration metrics need at least 3 successful samples before small deltas are meaningful",
    };
  }

  const bestRun = selectBestRun(runs, config.direction);
  const bestRunKind = bestRun?.runKind ?? "ordinary";
  const baselineDrift = detectBaselineDrift(runs, config.direction, baselineMetric, noiseBand);
  let verdict: AutoresearchMetricInterpretationVerdict = "possible_noise";
  let reason = "best timing delta is within the current noise band";
  if (latestDelta < -noiseBand) {
    verdict = "regression";
    reason = "latest timing sample is worse than baseline beyond the current noise band";
  } else if (baselineDrift) {
    verdict = "baseline_drift";
    reason =
      "calibration samples explain the apparent baseline improvement; treat candidate gains as baseline drift unless the candidate beats calibration beyond the noise band";
  } else if (bestDelta >= noiseBand && bestRunKind === "calibration") {
    verdict = "calibration_signal";
    reason =
      "best timing sample is calibration-only evidence beyond the current noise band; do not treat it as a candidate improvement";
  } else if (bestDelta >= noiseBand) {
    verdict = "meaningful_improvement";
    reason = "best timing sample improves on baseline beyond the current noise band";
  }

  return {
    verdict,
    sampleCount: values.length,
    baselineMetric,
    bestMetric,
    latestMetric,
    minMetric,
    medianMetric,
    maxMetric,
    noiseBand,
    bestDelta,
    latestDelta,
    bestDeltaPercent,
    latestDeltaPercent,
    reason,
  };
}

function isDurationMetric(metricName: string, metricUnit: string): boolean {
  return (
    /(?:^|[_:-])(?:ms|millis|milliseconds|seconds|secs|duration|runtime|latency|time)$/iu.test(
      metricName,
    ) || /^(?:ms|s|sec|secs|seconds|milliseconds)$/iu.test(metricUnit)
  );
}

function selectBestMetric(values: number[], direction: MetricDirection): number {
  return values.reduce((best, value) => (isBetter(value, best, direction) ? value : best));
}

function selectBestRun(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
): AutoresearchRunReceipt | null {
  return runs.reduce<AutoresearchRunReceipt | null>(
    (best, run) => (best === null || isBetter(run.metric, best.metric, direction) ? run : best),
    null,
  );
}

function detectBaselineDrift(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
  baselineMetric: number,
  noiseBand: number,
): boolean {
  const calibrationRuns = runs.filter((run) => (run.runKind ?? "ordinary") === "calibration");
  if (calibrationRuns.length < 2) return false;

  const candidateRuns = runs.filter(
    (run) =>
      run.status === "candidate" &&
      (run.runKind ?? "ordinary") !== "calibration" &&
      isSuccessfulMetricRun(run),
  );
  if (candidateRuns.length === 0) return false;

  const bestCalibration = selectBestRun(calibrationRuns, direction);
  const bestCandidate = selectBestRun(candidateRuns, direction);
  if (!bestCalibration || !bestCandidate) return false;

  const calibrationDelta = directionalDelta(baselineMetric, bestCalibration.metric, direction);
  if (calibrationDelta < noiseBand) return false;

  const candidateBeyondCalibration = directionalDelta(
    bestCalibration.metric,
    bestCandidate.metric,
    direction,
  );
  return candidateBeyondCalibration < noiseBand;
}

function directionalDelta(baseline: number, current: number, direction: MetricDirection): number {
  return direction === "lower" ? baseline - current : current - baseline;
}

function percentDelta(delta: number, baseline: number): number {
  return baseline === 0 ? 0 : (delta / Math.abs(baseline)) * 100;
}

function computeConfidence(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
): number | null {
  if (runs.length < 3) return null;

  const values = runs.map((run) => run.metric);
  const baseline = runs[0]?.metric;
  if (baseline === undefined) return null;

  let best = baseline;
  for (const value of values) {
    if (isBetter(value, best, direction)) {
      best = value;
    }
  }
  if (best === baseline) return null;

  const median = sortedMedian(values);
  const deviations = values.map((value) => Math.abs(value - median));
  const mad = sortedMedian(deviations);
  if (mad === 0) return null;

  return Math.abs(best - baseline) / mad;
}

function sortedMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function tailText(text: string): string {
  const lines = text.split(/\r?\n/).slice(-OUTPUT_TAIL_MAX_LINES).join("\n");
  const bytes = Buffer.from(lines, "utf8");
  if (bytes.length <= OUTPUT_TAIL_MAX_BYTES) {
    return lines.trim();
  }
  return bytes
    .subarray(bytes.length - OUTPUT_TAIL_MAX_BYTES)
    .toString("utf8")
    .trim();
}

function killTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

function joinOutput(output: { stdout: string; stderr: string }): string {
  return [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "(n/a)";
  return `${value}${unit}`;
}

function formatMetricThresholdValue(value: number | null, unit: string): string {
  return value === null
    ? "(not set; zero-target blocker inference may apply)"
    : formatMetricValue(value, unit);
}

function formatConfidenceValue(value: number | null): string {
  if (value === null) return "(n/a)";
  return `${value.toFixed(2)}x`;
}

function formatEmpiricalPosture(posture: AutoresearchEmpiricalPosture): string {
  return `${posture.classification}; promotion_ready=${posture.promotionReady ? "yes" : "no"}; ${posture.summary}; next=${posture.recommendedNextAction}`;
}

function formatMetricInterpretation(
  interpretation: AutoresearchMetricInterpretation | null,
  unit: string,
): string {
  if (!interpretation) return "(n/a)";
  return `${interpretation.verdict}; samples=${interpretation.sampleCount}; noise_band=±${formatMetricValue(roundMetric(interpretation.noiseBand), unit)}; best_delta=${formatSignedMetric(interpretation.bestDelta, unit)} (${interpretation.bestDeltaPercent.toFixed(1)}%); latest_delta=${formatSignedMetric(interpretation.latestDelta, unit)} (${interpretation.latestDeltaPercent.toFixed(1)}%); ${interpretation.reason}`;
}

function formatSignedMetric(value: number, unit: string): string {
  const rounded = roundMetric(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}${unit}`;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatLastRun(
  status: RunStatus | null,
  metric: number | null,
  unit: string,
  runKind?: AutoresearchRunKind | null,
): string {
  if (!status) return "(none)";
  const kindSuffix = runKind && runKind !== "ordinary" ? ` (${runKind})` : "";
  return `${status}${kindSuffix} @ ${formatMetricValue(metric, unit)}`;
}

function formatExit(exitCode: number | null, timedOut: boolean): string {
  if (timedOut) return "timeout";
  if (exitCode === null) return "signal/error";
  return `exit ${exitCode}`;
}

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "(none)";
  }
  return new Date(value).toISOString();
}

function hasOwn(record: MetricMap, key: string): boolean {
  return Object.hasOwn(record, key);
}
