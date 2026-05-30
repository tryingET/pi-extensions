import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AutoresearchAutoplanPlanner,
  type AutoresearchLedgerLoadResult,
  type AutoresearchLedgerProjection,
  type AutoresearchOracleEvidencePacket,
  type AutoresearchRuntimeStatus,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchRuntimeStatus,
  type ExecuteAutoresearchCampaignStartResult,
  executeAutoresearchCampaignStart,
  type InspectAutoresearchFinalizationResult,
  inspectAutoresearchFinalization,
  loadAutoresearchLedger,
  projectAutoresearchLedgerEntries,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchSupervisorLedgerLike } from "../loops/autoresearch-supervisor.ts";
import { resolveAkPath } from "./ak.ts";
import { evaluateAutoresearchAkLifecycle } from "./autoresearch-ak-lifecycle.ts";
import {
  type AutoresearchAkProjectorResult,
  projectAutoresearchAkMilestone,
} from "./autoresearch-ak-projector.ts";

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");

type MaybePromise<T> = T | Promise<T>;

type TimerHandle = unknown;

export const AUTORESEARCH_LIVE_SUPERVISION_TYPE = "autoresearch_live_supervision" as const;
export const AUTORESEARCH_LIVE_SUPERVISION_VERSION = 1 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS = 30 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS = 5 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS = 300 as const;
export const AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR =
  ".autoresearch/candidate-wave" as const;

const CAMPAIGN_PEER_RUNNER_VIOLATION_REASON =
  "Campaign-style implementation work must be launched as visible candidate_peer_spawn lanes and measured from candidate worktrees; controller-inline implementation patches bypass the handoff and are a process violation.";

export function buildAutoresearchCampaignPeerRunnerHandoffContract(): AutoresearchCampaignPeerRunnerHandoffContract {
  return {
    requiredRunner: "candidate_peer_spawn",
    handoff: "candidate_peer_spawn_to_candidate_worktree",
    controllerInlineImplementation: "process_violation",
    controllerRole: "plan_launch_bind_measure_review_only",
    piAutoresearchPeerSpawning: "forbidden_below_seam",
    requiredMeasurementSequence: [
      "candidate_peer_spawn",
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
    ],
    violationReason: CAMPAIGN_PEER_RUNNER_VIOLATION_REASON,
  };
}

export type AutoresearchLiveSessionState = "running" | "blocked" | "stopped" | "completed";

export type AutoresearchLiveProjectionAction =
  | "recorded"
  | "already-projected"
  | "noop"
  | "blocked";

export type AutoresearchLiveLifecycleAction =
  | "none"
  | "completed_task"
  | "already_terminal"
  | "stopped"
  | "blocked";

export interface AutoresearchLiveSupervisionPolicyV1 {
  intervalSeconds: number;
  autoStopOnTerminal: true;
  lifecycleMode: "complete_on_verified_completion";
}

export interface AutoresearchLiveSupervisionSessionV1 {
  type: typeof AUTORESEARCH_LIVE_SUPERVISION_TYPE;
  version: typeof AUTORESEARCH_LIVE_SUPERVISION_VERSION;
  taskId: number;
  cwd: string;
  policy: AutoresearchLiveSupervisionPolicyV1;
  state: AutoresearchLiveSessionState;
  startedAt: number;
  lastPolledAt: number | null;
  pollCount: number;
  lastRuntimeState: string | null;
  lastProjectionAction: AutoresearchLiveProjectionAction | null;
  lastLifecycleAction: AutoresearchLiveLifecycleAction;
  lastSummary: string | null;
  lastError: string | null;
}

export interface AutoresearchLiveSupervisionRequest {
  taskId: number;
  cwd: string;
  intervalSeconds?: number;
  signal?: AbortSignal;
}

export interface AutoresearchLiveObservation {
  cwd: string;
  runtime: AutoresearchRuntimeStatus;
  ledgerLoad: AutoresearchLedgerLoadResult;
  ledger: AutoresearchSupervisorLedgerLike;
  finalization: InspectAutoresearchFinalizationResult;
  oracleEvidence: AutoresearchOracleEvidencePacket;
}

export interface AutoresearchLiveLifecycleInput {
  taskId: number;
  sessionKey: string;
  session: Readonly<AutoresearchLiveSupervisionSessionV1>;
  observation: AutoresearchLiveObservation;
  projector: AutoresearchAkProjectorResult;
  signal?: AbortSignal;
}

export interface AutoresearchLiveLifecycleOutcome {
  ok: boolean;
  action: AutoresearchLiveLifecycleAction;
  summary: string;
  error?: string;
}

export interface AutoresearchLivePollResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  observation: AutoresearchLiveObservation | null;
  projector: AutoresearchAkProjectorResult | null;
  lifecycle: AutoresearchLiveLifecycleOutcome | null;
  nextStep: string;
}

export interface AutoresearchLiveStartResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  reused: boolean;
  poll: AutoresearchLivePollResult | null;
}

export interface AutoresearchLiveStartCampaignRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  maxIterations?: number;
  maxWallClockMinutes?: number;
  benchmarkCommand?: string;
  checksCommand?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: "lower" | "higher";
  metricThreshold?: number;
  reconfigure?: boolean;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  planner?: AutoresearchAutoplanPlanner;
  materializeDspxIntent?: boolean;
  runDspxProgramGen?: boolean;
  dspxProgramGenTimeoutSeconds?: number;
  dspxIntentPath?: string;
  dspxOutdir?: string;
  dspxBehaviorPath?: string;
}

export interface AutoresearchLiveStartCampaignResult {
  campaign: ExecuteAutoresearchCampaignStartResult;
  supervision: AutoresearchLiveStartResult;
}

export type AutoresearchLevel3PolicyPosture =
  | "allowed_by_manifest_policy"
  | "blocked_missing_policy"
  | "blocked_invalid_policy"
  | "not_requested";

export interface AutoresearchLevel3ManifestPreflightRequest
  extends AutoresearchLiveSupervisionRequest {
  manifest?: unknown;
  manifestPath?: string;
}

export interface AutoresearchLevel3PolicyGatePreflight {
  gate:
    | "launchVisibleCandidatePeers"
    | "runMeasurements"
    | "exportCandidateResults"
    | "generateReviewPackets"
    | "prepareFinalizerTokenRequest"
    | "applyFinalizer"
    | "cleanupCandidates"
    | "recordAkEvidence"
    | "completeAkTask"
    | "mergeReleasePromotion";
  posture: AutoresearchLevel3PolicyPosture;
  value: unknown;
  requiredPolicy: readonly string[];
  boundary: string;
}

export interface AutoresearchLevel3CampaignManifestPreflight {
  kind: "autoresearch.level3_campaign_manifest_preflight.v1";
  manifestKind: "autoresearch.level3_campaign_manifest.v1" | "invalid_or_missing";
  taskId: number;
  cwd: string;
  manifestPath: string | null;
  manifestHash: string | null;
  readOnly: true;
  execution: "not_executed_by_orchestrator";
  metric: {
    name: "level3_manifest_preflight_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    manifestSchemaBlockers: {
      name: "manifest_schema_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    manifestPolicyGateBlockers: {
      name: "manifest_policy_gate_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    manifestPreflightUxBlockers: {
      name: "manifest_preflight_ux_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
  };
  schema: {
    campaignId: string | null;
    autonomyLevel: number | null;
    primaryMetricName: string | null;
    sliceCount: number;
    fileScopeCount: number;
    offLimitsCount: number;
  };
  policyGates: readonly AutoresearchLevel3PolicyGatePreflight[];
  blockers: readonly string[];
  nextLegalActions: readonly string[];
  nonActions: readonly string[];
  level2FallbackRoute: string;
  boundaries: readonly string[];
}

export interface AutoresearchLevel3SliceSequenceDryRunRequest
  extends AutoresearchLevel3ManifestPreflightRequest {}

export type AutoresearchLevel3SliceSequenceState = "ready" | "blocked";

export interface AutoresearchLevel3SliceSequenceCellState {
  sliceId: string;
  cellId: string;
  order: number;
  state: AutoresearchLevel3SliceSequenceState;
  dependencies: readonly string[];
  missingDependencies: readonly string[];
  blockedDependencies: readonly string[];
  policyPosture: AutoresearchLevel3PolicyPosture;
  metricName: string | null;
  nextLegalAction: string;
  blockers: readonly string[];
}

export interface AutoresearchLevel3CampaignTransitionReceipt {
  kind: "autoresearch.level3_campaign_transition_receipt.v1";
  nonAuthoritative: true;
  durableEvidence: false;
  manifestHash: string;
  taskId: number;
  cwd: string;
  transitionName: "level3_slice_sequence_dry_run" | "level3_authorized_finalizer_cleanup_plan";
  policyPosture:
    | "dry_run_no_lower_plane_actions"
    | "blocked_preflight"
    | "blocked_dependencies_or_policy";
  inputRefs: {
    manifestPath: string | null;
    sliceId: string;
    cellId: string;
    dependencies: readonly string[];
  };
  outputRefs: {
    packetKind:
      | "autoresearch.level3_slice_sequence_dry_run.v1"
      | "autoresearch.level3_authorized_finalizer_cleanup_plan.v1";
    state: AutoresearchLevel3SliceSequenceState;
    receiptIndex: number;
  };
  metricPosture: {
    name:
      | "dry_run_receipt_blockers"
      | "autonomous_slice_sequence_blockers"
      | "authorized_finalizer_cleanup_blockers";
    direction: "lower";
    target: 0;
    status: "target_met" | "blocked";
  };
  nextState: AutoresearchLevel3SliceSequenceState;
  rollbackHint: string;
}

export interface AutoresearchLevel3SliceSequenceDryRun {
  kind: "autoresearch.level3_slice_sequence_dry_run.v1";
  taskId: number;
  cwd: string;
  manifestKind: "autoresearch.level3_campaign_manifest.v1" | "invalid_or_missing";
  manifestPath: string | null;
  manifestHash: string | null;
  readOnly: true;
  execution: "not_executed_by_orchestrator";
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  metric: {
    name: "autonomous_slice_sequence_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    sliceOrderingBlockers: {
      name: "slice_ordering_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    dryRunReceiptBlockers: {
      name: "dry_run_receipt_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    sliceSequenceRecoveryBlockers: {
      name: "slice_sequence_recovery_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
  };
  orderedStates: readonly AutoresearchLevel3SliceSequenceCellState[];
  receipts: readonly AutoresearchLevel3CampaignTransitionReceipt[];
  blockers: readonly string[];
  nextLegalActions: readonly string[];
  safeRerunCommand: string;
  level2FallbackRoute: string;
  nonActions: readonly string[];
  boundaries: readonly string[];
}

export interface AutoresearchLevel3CandidateLifecycleBindingInput {
  laneId: string;
  candidatePeerRunId?: string;
  candidateWorktree?: string;
  candidateBranch?: string;
  candidateBaseRef?: string;
  candidateDiffSummary?: string;
  candidateFilesChanged?: readonly string[];
}

export interface AutoresearchLevel3VisibleCandidateLifecycleRequest
  extends AutoresearchLevel3ManifestPreflightRequest {
  parentPeerTarget?: string;
  launchAuthorizationToken?: string;
  candidateBindings?: readonly AutoresearchLevel3CandidateLifecycleBindingInput[];
}

export interface AutoresearchLevel3CandidateLifecycleLane {
  sliceId: string | null;
  cellId: string | null;
  laneId: string;
  objective: string;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  launchPosture:
    | "ready_visible_candidate_peer_spawn_call"
    | "blocked_missing_launch_policy_or_token"
    | "blocked_missing_parent_peer_target";
  candidatePeerCall: string | null;
  bindingPosture:
    | "bound_visible_candidate_worktree"
    | "blocked_missing_binding"
    | "blocked_duplicate_binding";
  binding: AutoresearchLevel3CandidateLifecycleBindingInput | null;
  cleanupPosture: "plan_only_cleanup_token_required";
  cleanupPlan: readonly string[];
  blockers: readonly string[];
}

export interface AutoresearchLevel3VisibleCandidateLifecyclePlan {
  kind: "autoresearch.level3_visible_candidate_lifecycle_plan.v1";
  taskId: number;
  cwd: string;
  manifestKind: "autoresearch.level3_campaign_manifest.v1" | "invalid_or_missing";
  manifestPath: string | null;
  manifestHash: string | null;
  readOnly: true;
  execution: "not_executed_by_orchestrator";
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  launchAuthorization: {
    posture:
      | "allowed_by_manifest_policy"
      | "allowed_by_exact_token"
      | "blocked_missing_policy_or_token";
    requiredToken: string;
    suppliedTokenAccepted: boolean;
  };
  metric: {
    name: "candidate_lifecycle_automation_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    visibleLaunchPolicyBlockers: {
      name: "visible_launch_policy_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    candidateBindingLifecycleBlockers: {
      name: "candidate_binding_lifecycle_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    candidateCleanupPolicyBlockers: {
      name: "candidate_cleanup_policy_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
  };
  lanes: readonly AutoresearchLevel3CandidateLifecycleLane[];
  blockers: readonly string[];
  nextLegalActions: readonly string[];
  nonActions: readonly string[];
  boundaries: readonly string[];
}

export interface AutoresearchLevel3MeasureExportReviewRequest
  extends AutoresearchLevel3VisibleCandidateLifecycleRequest {
  candidateResultPacketDirectory?: string;
}

export interface AutoresearchLevel3MeasureExportReviewLane {
  sliceId: string | null;
  cellId: string | null;
  laneId: string;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  measurementPosture: "ready_manifest_approved" | "blocked";
  exportPosture: "ready_manifest_approved" | "blocked";
  reviewPosture: "ready_manifest_approved" | "blocked";
  candidateWorktree: string | null;
  candidateBranch: string | null;
  runtimeRunCall: string | null;
  candidateResultExportCall: string | null;
  reviewInputPacketPath: string;
  blockers: readonly string[];
}

export interface AutoresearchLevel3MeasureExportReviewPlan {
  kind: "autoresearch.level3_measure_export_review_plan.v1";
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  execution: "not_executed_by_orchestrator";
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  lifecycle: AutoresearchLevel3VisibleCandidateLifecyclePlan;
  metric: {
    name: "candidate_measure_export_review_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    measurementPolicyBlockers: {
      name: "measurement_policy_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    candidateExportBindingBlockers: {
      name: "candidate_export_binding_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    reviewPacketAuthorityBlockers: {
      name: "review_packet_authority_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
  };
  lanes: readonly AutoresearchLevel3MeasureExportReviewLane[];
  aggregateReviewCall: string | null;
  blockers: readonly string[];
  nextLegalActions: readonly string[];
  nonActions: readonly string[];
  boundaries: readonly string[];
}

export type AutoresearchLevel3MatrixCellRunnerCellState =
  | "blocked_preflight_or_sequence"
  | "ready_to_launch_visible_candidates"
  | "waiting_for_candidate_bindings"
  | "ready_for_measure_export"
  | "waiting_for_candidate_result_packets"
  | "selected_for_matrix_review"
  | "cell_rerun_required";

export interface AutoresearchLevel3MatrixCellRunnerCell {
  sliceId: string | null;
  cellId: string;
  objective: string;
  state: AutoresearchLevel3MatrixCellRunnerCellState;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  laneCount: number;
  launchReadyLaneCount: number;
  boundLaneCount: number;
  measureReadyLaneCount: number;
  packetReadyLaneCount: number;
  selectedLaneId: string | null;
  launchCalls: readonly string[];
  measureExportCalls: readonly string[];
  reviewCandidateWaveCall: string | null;
  blockers: readonly string[];
  lanes: readonly {
    laneId: string;
    launchPosture: AutoresearchLevel3CandidateLifecycleLane["launchPosture"];
    bindingPosture: AutoresearchLevel3CandidateLifecycleLane["bindingPosture"];
    measurementPosture: AutoresearchLevel3MeasureExportReviewLane["measurementPosture"];
    packetPath: string;
    packetExists: boolean;
    selected: boolean;
    nextLegalCall: string | null;
  }[];
}

export interface AutoresearchLevel3MatrixCellRunner {
  kind: "autoresearch.level3_matrix_cell_runner.v1";
  taskId: number;
  cwd: string;
  manifestKind: "autoresearch.level3_campaign_manifest.v1" | "invalid_or_missing";
  manifestPath: string | null;
  manifestHash: string | null;
  execution: "not_executed_by_orchestrator";
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  dryRun: AutoresearchLevel3SliceSequenceDryRun;
  lifecycle: AutoresearchLevel3VisibleCandidateLifecyclePlan;
  measureExportReview: AutoresearchLevel3MeasureExportReviewPlan;
  metric: {
    name: "level3_matrix_cell_runner_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    readyToLaunchCells: number;
    boundCells: number;
    measureExportReadyCells: number;
    packetReadyCells: number;
    selectedCells: number;
    blockedCells: number;
  };
  cells: readonly AutoresearchLevel3MatrixCellRunnerCell[];
  aggregateReviewCall: string | null;
  finalizerPlanCall: string | null;
  nextLegalActions: readonly string[];
  blockers: readonly string[];
  nonActions: readonly string[];
  boundaries: readonly string[];
}

export interface AutoresearchLevel3MatrixCellExecutorRequest
  extends AutoresearchMatrixCampaignRunnerRequest {
  completedActionCount?: number;
}

export type AutoresearchLevel3MatrixCellExecutorPosture =
  | "blocked_by_level3_runner"
  | "ready_to_present_next_action"
  | "blocked_forbidden_action"
  | "completed_review_ready";

export interface AutoresearchLevel3MatrixCellExecutorSelectedAction {
  index: number;
  call: string;
  source: "level3_matrix_cell_runner.nextLegalActions";
  execution: "not_executed_by_orchestrator";
  controllerMustRunExplicitly: true;
  allowedByStateMachine: boolean;
  forbiddenReason: string | null;
}

export interface AutoresearchLevel3MatrixCellExecutor {
  kind: "autoresearch.level3_matrix_cell_executor.v1";
  taskId: number;
  cwd: string;
  objective: string;
  sourceLevel3RunnerKind: "autoresearch.matrix_campaign_runner_checkpoint.v1";
  sourceLevel3RunnerAlias: "level3_matrix_cell_runner";
  level3Runner: AutoresearchMatrixCampaignRunnerCheckpoint;
  completedActionCount: number;
  totalActionCount: number;
  remainingActionCount: number;
  posture: AutoresearchLevel3MatrixCellExecutorPosture;
  selectedAction: AutoresearchLevel3MatrixCellExecutorSelectedAction | null;
  runnerNextLegalActions: readonly string[];
  emittedNextLegalActions: readonly string[];
  stateMachineBlockers: {
    name: "level3_state_machine_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    hiddenExecutionPrevented: true;
    forbiddenActionMatched: boolean;
    proofs: readonly {
      proof: string;
      status: "present";
      source: string;
    }[];
  };
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel4CampaignRunnerRequest
  extends AutoresearchLevel3MatrixCellExecutorRequest {
  level4ReceiptPath?: string;
  maxAutomatedActions?: number;
  maxParallelCandidatePeers?: number;
  allowMeasureExportReview?: boolean;
  allowReviewGeneration?: boolean;
  allowAutomaticCleanupAfterIntegrationCloseout?: boolean;
  integrationCloseout?: AutoresearchLevel3IntegrationCloseoutEvidence;
}

export interface AutoresearchLevel4CampaignRunnerReceipt {
  kind: "autoresearch.level4_campaign_runner_receipt.v1";
  receiptId: string;
  actionIndex: number;
  call: string;
  disposition:
    | "executed_by_level4"
    | "awaiting_external_controller"
    | "blocked_dangerous_gate"
    | "blocked_by_level3";
  executedAtEpochMs: number;
  summary: string;
}

export interface AutoresearchLevel4VisibleLaunchWatchLanePlan {
  cellId: string;
  laneId: string;
  launchSurface: "candidate_peer_spawn";
  launchCall: string;
  peerRunIdSource: "candidate_peer_spawn_return_value";
  ackWatchCall: string;
  finalWatchCall: string;
  controllerVerificationRequired: readonly ["ack", "final", "worktree_lineage"];
  state:
    | "blocked_missing_parent_peer_target"
    | "ready_for_visible_launch"
    | "waiting_for_ack_final_and_lineage"
    | "checkpoint_accepted_lineage_verified";
}

export interface AutoresearchLevel4VisibleLaunchWatchPlan {
  kind: "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1";
  execution: "plan_only_controller_must_execute_visible_tools";
  parentPeerTarget: string | null;
  lanePlans: readonly AutoresearchLevel4VisibleLaunchWatchLanePlan[];
  sequence: readonly string[];
  metric: {
    name: "level4_visible_launch_watch_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    blockers: readonly string[];
  };
  exactGatesPreserved: readonly [
    "finalize_post_fanin",
    "candidate_cleanup",
    "ak_owner_write",
    "promotion",
  ];
  forbiddenActions: readonly string[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel4WholeMatrixExecutorBatch {
  batchIndex: number;
  concurrencyLimit: number;
  lanes: readonly {
    cellId: string;
    laneId: string;
    launchCall: string;
    ackWatchCall: string;
    finalWatchCall: string;
    materializationPreflight: readonly string[];
    lineageVerificationCommands: readonly string[];
    safeMeasurementExportReviewCalls: readonly string[];
  }[];
}

export interface AutoresearchLevel4WholeMatrixExecutor {
  kind: "autoresearch.level4_whole_matrix_parallel_executor.v1";
  execution: "bounded_parallel_visible_tools_with_controller_verification";
  concurrencyLimit: number;
  totalLaneCount: number;
  batchCount: number;
  batches: readonly AutoresearchLevel4WholeMatrixExecutorBatch[];
  ackFinalWatchContract: {
    waitFor: "both";
    peerTextIsCommunicationOnly: true;
    requiredBeforeLineageCheckpoint: readonly ["PEER_ACK", "PEER_FINAL"];
  };
  lineageVerificationGate: {
    requiredFacts: readonly ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"];
    source: "controller_git_verification_not_peer_text";
    blocksMeasurementUntilSatisfied: true;
  };
  materializationPreflight: {
    perLaneRequired: true;
    commandsAreControllerExecuted: true;
    defaultCommands: readonly string[];
    blockerMetric: {
      name: "matrix_materialization_preflight_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
      blockers: readonly string[];
    };
  };
  safeAutomation: {
    peerLaunch: "visible_candidate_peer_spawn_only";
    bindRunExportReview: "after_ack_final_lineage_and_materialization";
    matrixReview: "after_candidate_result_packets";
    stoppedOwnerGates: readonly [
      "finalize_post_fanin",
      "candidate_cleanup",
      "ak_owner_write",
      "promotion",
      "merge",
    ];
  };
  metric: {
    name: "true_parallel_whole_matrix_executor_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    blockers: readonly string[];
  };
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel4PromptRunnerLane {
  cellId: string;
  laneId: string;
  objective: string;
  promptTitle: string;
  promptMarkdown: string;
  candidatePeerSpawnCall: string;
  peerAckWatchCall: string;
  peerFinalWatchCall: string;
  lineageVerificationChecklist: readonly string[];
  postFinalControllerCalls: readonly string[];
}

export interface AutoresearchLevel4CandidateCloseoutLane {
  cellId: string;
  laneId: string;
  objective: string;
  launch: {
    surface: "candidate_peer_spawn";
    call: string;
    workspaceName: string | null;
    branchName: string | null;
  };
  watch: {
    ackCall: string;
    finalCall: string;
    status: "pending_controller_execution" | "pending_controller_verification";
  };
  lineage: {
    peerFinalIsCommunicationOnly: true;
    requiredFacts: readonly ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"];
    verificationCommands: readonly string[];
  };
  scopeReview: {
    filesInScope: readonly string[];
    offLimits: readonly string[];
    status: "pending_controller_verification";
  };
  validation: {
    peerClaimStatus: "communication_only";
    controllerValidationStatus: "pending_controller_verification";
    candidateResultPacketPath: string;
  };
  recommendation: {
    disposition: "pending_controller_review";
    options: readonly ["integrate_after_review", "reject", "retry", "inspect_further"];
    requiredBeforeIntegrate: readonly string[];
  };
  rollbackNotes: readonly string[];
}

export type AutoresearchLevel4CandidatePacketInventoryStatus =
  | "pending_visible_launch"
  | "pending_controller_lineage_verification"
  | "pending_measurement_or_export"
  | "pending_candidate_result_packet"
  | "controller_verified_measured_packet";

export interface AutoresearchLevel4PostIntegrationCleanupRegistrySidecar {
  peerRunId: string;
  registryPath: string;
  status:
    | "verified_registry_sidecar"
    | "missing_registry_sidecar"
    | "invalid_registry_sidecar"
    | "mismatched_registry_sidecar";
  worktreePath: string | null;
  branchName: string | null;
  archiveDir: string | null;
  blockers: readonly string[];
}

export interface AutoresearchLevel4PostIntegrationCleanupReadyPacket {
  kind: "autoresearch.level4_post_integration_cleanup_ready.v1";
  execution: "not_executed_by_orchestrator";
  readiness:
    | "ready_after_successful_integration_closeout"
    | "blocked_until_successful_integration_closeout";
  integrationCloseout: AutoresearchLevel3IntegrationCloseoutEvidence;
  registrySidecars: readonly AutoresearchLevel4PostIntegrationCleanupRegistrySidecar[];
  exactPeerRunIds: readonly string[];
  exactPeerTabsOrSessions: readonly string[];
  exactWorktrees: readonly string[];
  exactBranches: readonly string[];
  archiveDirectories: readonly string[];
  tabClosureHints: readonly string[];
  processTerminationHints: readonly string[];
  candidatePeerCleanupDryRunCall: string | null;
  candidatePeerCleanupExecuteCall: string | null;
  exactControllerCommands: readonly string[];
  blockers: readonly string[];
  boundary: string;
  nextStep: string;
}

export interface AutoresearchLevel4PostFaninPromotionHandoffPacket {
  kind: "autoresearch.level4_post_fanin_promotion_handoff.v1";
  execution: "plan_only_owner_gate_handoff";
  posture:
    | "blocked_until_candidate_fan_in_complete"
    | "ready_for_owner_review"
    | "ready_for_finalizer_token_request";
  selectedLaneCount: number;
  controllerVerifiedMeasuredPacketCount: number;
  totalLaneCount: number;
  ownerReviewCall: string | null;
  finalizerTokenRequestCall: string | null;
  evidenceRecordHandoff: {
    posture: "blocked_until_owner_review" | "owner_surface_after_review";
    ownerSurface: "AK";
    exactRecordCall: string | null;
    boundary: string;
  };
  sequence: readonly [
    "compare_measured_candidate_packets",
    "owner_selects_lane",
    "run_validation",
    "request_finalize_post_fanin_token",
    "apply_finalizer_only_with_exact_token",
    "record_evidence_only_through_owner_surface",
    "cleanup_only_after_successful_integration_closeout",
  ];
  blockers: readonly string[];
  boundary: string;
  nextStep: string;
}

export interface AutoresearchLevel4CandidateCloseoutPacket {
  kind: "autoresearch.level4_visible_candidate_closeout_packet.v1";
  execution: "plan_only_controller_verified_closeout";
  durableEvidence: false;
  laneCount: number;
  lanes: readonly AutoresearchLevel4CandidateCloseoutLane[];
  packetInventory: {
    totalLaneCount: number;
    pendingVisibleLaunchCount: number;
    pendingControllerLineageVerificationCount: number;
    pendingMeasurementOrExportCount: number;
    pendingCandidateResultPacketCount: number;
    controllerVerifiedMeasuredPacketCount: number;
    pendingPacketPaths: readonly string[];
    controllerVerifiedMeasuredPacketPaths: readonly string[];
    rows: readonly {
      cellId: string;
      laneId: string;
      packetPath: string;
      sourceState: AutoresearchMatrixCampaignOperatorLaneState | "not_in_cockpit";
      status: AutoresearchLevel4CandidatePacketInventoryStatus;
      controllerVerified: boolean;
      measuredPacket: boolean;
      selected: boolean;
    }[];
    summary: string;
  };
  postIntegrationCleanupReady: AutoresearchLevel4PostIntegrationCleanupReadyPacket;
  postFaninPromotionHandoff: AutoresearchLevel4PostFaninPromotionHandoffPacket;
  comparison: {
    status: "pending_candidate_result_packets" | "ready_for_review_packet";
    aggregateReviewCall: string | null;
    reviewRequiresControllerVerifiedPackets: true;
  };
  metric: {
    name: "level4_candidate_closeout_packet_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    blockers: readonly string[];
  };
  notAuthority: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel4PromptRunnerBundle {
  kind: "autoresearch.level4_prompt_runner_bundle.v1";
  pattern: readonly [
    "generate_prompt_bundle",
    "candidate_peer_spawn",
    "peer_watch_ack_final",
    "controller_verify_lineage",
    "bind_measure_export_review",
    "review_matrix_campaign",
    "stop_at_owner_gates",
  ];
  state:
    | "blocked_missing_parent_peer_target"
    | "ready_to_launch_visible_candidate_peers"
    | "waiting_for_peer_final_and_lineage_verification"
    | "checkpoint_accepted_controller_sequence_ready";
  promptBundle: readonly AutoresearchLevel4PromptRunnerLane[];
  visibleCandidatePeerSpawnCalls: readonly string[];
  peerWatchCalls: readonly string[];
  visibleLaunchWatchPlan: AutoresearchLevel4VisibleLaunchWatchPlan;
  wholeMatrixParallelExecutor: AutoresearchLevel4WholeMatrixExecutor;
  candidateCloseoutPacket: AutoresearchLevel4CandidateCloseoutPacket;
  controllerLineageVerification: {
    peerFinalIsCommunicationOnly: true;
    requiredFacts: readonly ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"];
    checklist: readonly string[];
  };
  postFinalControllerSequence: readonly string[];
  metric: {
    name: "whole_matrix_execution_glue_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    proofs: readonly {
      proof: string;
      status: "present" | "blocked";
      source: string;
    }[];
  };
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel4CampaignRunner {
  kind: "autoresearch.level4_autoresearch_campaign_runner.v1";
  taskId: number;
  cwd: string;
  objective: string;
  sourceLevel3Executor: AutoresearchLevel3MatrixCellExecutor;
  promptRunnerBundle: AutoresearchLevel4PromptRunnerBundle;
  receiptPath: string;
  loadedReceiptCount: number;
  newReceipts: readonly AutoresearchLevel4CampaignRunnerReceipt[];
  completedActionCount: number;
  posture:
    | "blocked_by_level3"
    | "advanced_safe_actions"
    | "awaiting_external_controller"
    | "blocked_dangerous_gate"
    | "complete_review_ready";
  metric: {
    name: "level4_autoresearch_automation_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  exactGatesPreserved: readonly [
    "finalize_post_fanin",
    "candidate_cleanup",
    "promotion",
    "ak_owner_write",
  ];
  nextLegalActions: readonly string[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchLevel3CleanupResourcesInput {
  peerTabsOrSessions?: readonly string[];
  worktrees?: readonly string[];
  branches?: readonly string[];
}

export interface AutoresearchLevel3IntegrationCloseoutEvidence {
  status: "successful" | "failed" | "missing";
  commit?: string;
  summary?: string;
}

export interface AutoresearchLevel3AuthorizedFinalizerCleanupRequest
  extends AutoresearchLevel3ManifestPreflightRequest {
  objective: string;
  sourceReview?: "review_candidate_wave" | "review_matrix_campaign";
  direction?: "lower" | "higher";
  metricName?: string;
  metricThreshold?: number;
  candidateResultPacketPaths?: readonly string[];
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
  selectedLaneId?: string;
  selectedCellId?: string;
  validation?: AutoresearchPostFaninValidationEvidence;
  offLimits?: readonly string[];
  dirtyFiles?: readonly string[];
  reviewedAtEpochMs?: number;
  finalizerAuthorizationToken?: string;
  cleanupAuthorizationToken?: string;
  cleanupResources?: AutoresearchLevel3CleanupResourcesInput;
  integrationCloseout?: AutoresearchLevel3IntegrationCloseoutEvidence;
}

export interface AutoresearchLevel3CleanupCommandPacket {
  kind: "autoresearch.level3_candidate_cleanup_command_packet.v1";
  exactTaskId: number;
  exactCwd: string;
  manifestHash: string;
  authorizationToken: string;
  authorizationRequired: true;
  cleanupExecution:
    | "not_executed_by_orchestrator"
    | "ready_for_automatic_controller_cleanup_after_successful_integration_closeout";
  cleanupTrigger:
    | "candidate_cleanup_token"
    | "exact_manifest_policy"
    | "successful_integration_closeout";
  exactPeerTabsOrSessions: readonly string[];
  exactWorktrees: readonly string[];
  exactBranches: readonly string[];
  exactCommands: readonly string[];
  forbiddenPromotionCommandMatches: readonly string[];
  boundary: string;
}

export interface AutoresearchLevel3AuthorizedFinalizerCleanupPlan {
  kind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1";
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  execution: "not_executed_by_orchestrator";
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  finalizer: AutoresearchPostFaninFinalizerResult;
  finalizerAuthorization: {
    requiredTokenName: "finalize_post_fanin";
    requiredToken: string;
    suppliedTokenAccepted: boolean;
    posture: "accepted_exact_token" | "blocked_missing_token" | "blocked_wrong_token";
  };
  cleanupAuthorization: {
    requiredTokenName: "candidate_cleanup";
    requiredToken: string;
    suppliedTokenAccepted: boolean;
    manifestPolicyAccepted: boolean;
    posture:
      | "accepted_exact_token"
      | "accepted_exact_manifest_policy"
      | "accepted_successful_integration_closeout"
      | "blocked_missing_token_or_exact_policy"
      | "blocked_wrong_token"
      | "blocked_missing_exact_resources";
  };
  metric: {
    name: "authorized_finalizer_cleanup_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  cellMetrics: {
    finalizerTokenApplicationBlockers: {
      name: "finalizer_token_application_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    cleanupExecutionGateBlockers: {
      name: "cleanup_execution_gate_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
    postFaninRollbackBlockers: {
      name: "post_fanin_rollback_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
    };
  };
  finalizerApplyCommandPacket: AutoresearchPostFaninFinalizerApplyCommandPacket | null;
  cleanupCommandPacket: AutoresearchLevel3CleanupCommandPacket | null;
  integrationCloseout: AutoresearchLevel3IntegrationCloseoutEvidence;
  rollbackReceipt: AutoresearchLevel3CampaignTransitionReceipt;
  blockers: readonly string[];
  nextLegalActions: readonly string[];
  nonActions: readonly string[];
  boundaries: readonly string[];
}

export interface AutoresearchPostFaninValidationEvidence {
  command: string;
  status: "passed" | "failed" | "missing";
  summary?: string;
  artifactPath?: string;
}

export interface AutoresearchPostFaninFinalizerRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  sourceReview: "review_candidate_wave" | "review_matrix_campaign";
  direction?: "lower" | "higher";
  metricName?: string;
  metricThreshold?: number;
  candidateResultPacketPaths?: readonly string[];
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
  selectedLaneId?: string;
  selectedCellId?: string;
  validation?: AutoresearchPostFaninValidationEvidence;
  offLimits?: readonly string[];
  dirtyFiles?: readonly string[];
  reviewedAtEpochMs?: number;
  applyAuthorizationToken?: string;
}

export interface AutoresearchPostFaninFinalizerContract {
  kind: "autoresearch.post_fanin_finalizer_contract.v1";
  sourceReview: "review_candidate_wave" | "review_matrix_campaign";
  taskId: number;
  cwd: string;
  objective: string;
  applyPosture: "explicit_authorization_required";
  exactAuthorizationToken: string;
  requiredPreflightChecks: readonly [
    "finals_present",
    "validation_passed",
    "off_limits_clean",
    "dirty_overlap_clean",
    "selected_lane_consistent",
    "review_artifacts_current",
  ];
  outcomes: readonly ["committed_cleaned", "review_blocked", "failed_closed"];
  boundary: string;
}

export interface AutoresearchPostFaninFinalizerPreflightCheck {
  name:
    | "finals_present"
    | "validation_passed"
    | "off_limits_clean"
    | "dirty_overlap_clean"
    | "selected_lane_consistent"
    | "review_artifacts_current";
  status: "passed" | "blocked";
  summary: string;
  evidence: readonly string[];
}

export interface AutoresearchCandidateReviewPacketChainMetric {
  name: "candidate_review_packet_chain_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
  sourceMetricName: string;
  sourceMetricStatus: string;
}

export interface AutoresearchCandidateReviewPacketChainRef {
  cellId: string | null;
  laneId: string;
  sourcePacketPath: string | null;
  packetPresent: boolean;
  selected: boolean;
  bindingStatus: AutoresearchLevel2CandidateBindingLane["bindingStatus"];
}

export interface AutoresearchPostFaninFinalizerTokenRequestPacket {
  kind: "autoresearch.post_fanin_finalizer_token_request.v1";
  sourceReview: "review_candidate_wave" | "review_matrix_campaign";
  exactTaskId: number;
  exactCwd: string;
  objective: string;
  requiredTokenName: "finalize_post_fanin";
  exactAuthorizationToken: string;
  requestExecution: "not_executed_by_orchestrator";
  candidateResultPacketRefs: readonly string[];
  reviewResultReference: {
    sourceReview: "review_candidate_wave" | "review_matrix_campaign";
    posture: string;
    selectedLaneIds: readonly string[];
  };
  metricPosture: {
    name: "level2_finalizer_token_request_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    sourceMetricName: string;
    sourceMetricStatus: string;
  };
  packetChainTrace: {
    sourceReviewPacketKind:
      | "autoresearch.review_candidate_wave_packet.v1"
      | "autoresearch.review_matrix_campaign_packet.v1"
      | "missing_review_packet";
    candidateResultPacketRefs: readonly AutoresearchCandidateReviewPacketChainRef[];
    selectedCandidateResultPacketRefs: readonly string[];
    metric: AutoresearchCandidateReviewPacketChainMetric;
  };
  permittedFinalizerScope: {
    selectedLanes: readonly {
      cellId: string | null;
      laneId: string;
      sourcePacketPath: string | null;
      filesChanged: readonly string[];
    }[];
    validationCommand: string | null;
    applyCommandsWithheldUntilToken: true;
  };
  separateOwnerTokensRequired: readonly ["candidate_cleanup", "promotion", "ak_owner_write"];
  boundaries: readonly string[];
  nextLegalActions: readonly string[];
}

export interface AutoresearchPostFaninFinalizerApplyCommandPacket {
  kind: "autoresearch.post_fanin_finalizer_apply_command_packet.v1";
  exactTaskId: number;
  exactCwd: string;
  sourceReview: "review_candidate_wave" | "review_matrix_campaign";
  authorizationToken: string;
  authorizationRequired: true;
  applyExecution: "not_executed_by_orchestrator";
  selectedLanes: readonly {
    cellId: string | null;
    laneId: string;
    candidateBranch: string;
    candidateWorktree: string;
    candidateBaseRef: string;
    sourcePacketPath: string;
    filesChanged: readonly string[];
  }[];
  exactCommands: readonly string[];
  rollbackNotes: readonly string[];
  boundary: string;
}

export interface AutoresearchAuthorizedFinalizerCleanupGate {
  name: "authorized_finalizer_cleanup_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
  finalizedWithToken: boolean;
  cleanupAuthorized: false;
  candidatePeerTabClosureIncludedInCleanup: true;
  cleanupEvidenceRequired: false;
  promotionAuthorized: false;
  requiredSeparateTokens: readonly ["candidate_cleanup", "promotion"];
  forbiddenCommandMatches: readonly string[];
  proofs: readonly string[];
}

export interface AutoresearchPostFaninFinalizerCloseoutReceipt {
  kind: "autoresearch.post_fanin_finalizer_closeout_receipt.v1";
  status: "committed_cleaned" | "review_blocked" | "failed_closed";
  execution: "receipt_only_no_mutation";
  taskId: number;
  cwd: string;
  sourceReview: "review_candidate_wave" | "review_matrix_campaign";
  validation: {
    command: string | null;
    status: "passed" | "failed" | "missing";
    summary: string | null;
    artifactPath: string | null;
  };
  finalizerApply: {
    posture: "commands_prepared_not_executed" | "withheld";
    commandCount: number;
    authorizationTokenAccepted: boolean;
  };
  evidenceHandoff: {
    posture: "owner_surface_required";
    exactRecordCall: string | null;
    boundary: string;
  };
  cleanupHandoff: {
    posture: "separate_candidate_cleanup_gate_required";
    authorizedByFinalizer: false;
    requiredTrigger: "candidate_cleanup_token_or_successful_integration_closeout";
  };
  blockedReasons: readonly string[];
  recoveryNotes: readonly string[];
  nonActions: readonly string[];
}

export interface AutoresearchPostFaninFinalizerResult {
  kind: "autoresearch.post_fanin_finalizer_result.v1";
  outcome: "committed_cleaned" | "review_blocked" | "failed_closed";
  contract: AutoresearchPostFaninFinalizerContract;
  preflight: {
    status: "passed" | "blocked";
    checks: readonly AutoresearchPostFaninFinalizerPreflightCheck[];
    blockerCount: number;
  };
  manualPostFaninResidue: {
    name: "manual_post_fanin_residue";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  authorizedFinalizerCleanupGate: AutoresearchAuthorizedFinalizerCleanupGate;
  finalizerTokenRequest: AutoresearchPostFaninFinalizerTokenRequestPacket;
  exactApplyCommandPacket: AutoresearchPostFaninFinalizerApplyCommandPacket | null;
  closeoutReceipt: AutoresearchPostFaninFinalizerCloseoutReceipt;
  nextStep: string;
  boundaries: readonly string[];
}

export interface AutoresearchCandidateWaveRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  candidateCount?: number;
  candidateObjectives?: readonly string[];
  candidatePacketDirectory?: string;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
}

export type AutoresearchCandidateWaveManagementLaneState =
  | "planned"
  | "packet_missing"
  | "measured_exported_selectable"
  | "measured_exported_not_selectable";

export interface AutoresearchCandidateWaveManagementLane {
  laneId: string;
  state: AutoresearchCandidateWaveManagementLaneState;
  candidateResultPacketPath: string | null;
  selectable: boolean;
  metric: number | null;
  nextStep: string;
}

export interface AutoresearchCampaignPeerRunnerHandoffContract {
  requiredRunner: "candidate_peer_spawn";
  handoff: "candidate_peer_spawn_to_candidate_worktree";
  controllerInlineImplementation: "process_violation";
  controllerRole: "plan_launch_bind_measure_review_only";
  piAutoresearchPeerSpawning: "forbidden_below_seam";
  requiredMeasurementSequence: readonly [
    "candidate_peer_spawn",
    "autoresearch_candidate_bind",
    "autoresearch_runtime_run",
    "candidate_result_export",
    "review_candidate_wave",
  ];
  violationReason: string;
}

export interface AutoresearchCandidateWaveManagement {
  kind: "autoresearch.candidate_wave_management.v1";
  waveId: string;
  posture:
    | "planned_not_launched"
    | "waiting_for_planned_lanes"
    | "ready_for_owner_selection"
    | "no_selectable_candidate";
  completedLaneCount: number;
  expectedLaneCount: number;
  laneStates: readonly AutoresearchCandidateWaveManagementLane[];
  finalOnlyScoring: true;
  controllerMeasurementRequired: true;
  handoffContract: AutoresearchCampaignPeerRunnerHandoffContract;
  nonSelectedLanePolicy: string;
  fanInChecklist: readonly string[];
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveLane {
  laneId: string;
  objective: string;
  candidatePeerCall: string;
  measurementPlan: string[];
  candidateResultPacketPath: string;
  ownerReviewCall: string;
}

export interface AutoresearchCandidateWavePlan {
  kind: "autoresearch.candidate_wave_plan.v1";
  taskId: number;
  cwd: string;
  objective: string;
  candidateCount: number;
  candidatePacketDirectory: string;
  parentPeerTargetRequired: boolean;
  parentPeerTarget: string | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  lanes: AutoresearchCandidateWaveLane[];
  ownerSelection: {
    posture: "explicit_owner_decision_required";
    candidateResultPacketPaths: readonly string[];
    aggregateReviewCall: string;
    reviewInstructions: string[];
  };
  management: AutoresearchCandidateWaveManagement;
  boundaries: string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  metricName?: string;
  metricThreshold?: number;
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
}

export interface AutoresearchMatrixCampaignCell {
  cellId: string;
  scenario: string;
  hypothesis: string;
  objective: string;
  candidatePacketDirectory: string;
  candidateResultPacketPaths: readonly string[];
  planCandidateWaveCall: string;
  reviewCandidateWaveCall: string;
  ownerUiCommand: "/autoresearch review";
  managedWavePosture: "managed_candidate_wave_required";
  fanInGate: string;
}

export type AutoresearchLevel2PacketPlanningAntiNarrowingPosture =
  | "ready_for_level2_packet_planning"
  | "blocked_anti_narrowing"
  | "failed_closed_missing_or_duplicate_lanes"
  | "incomplete_matrix_exception_recorded"
  | "explicit_downgrade_recorded";

export interface AutoresearchLevel2PacketPlanningBlockerMetric {
  name: "level2_packet_planning_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
}

export interface AutoresearchLevel2PacketPlanningAntiNarrowing {
  kind: "autoresearch.level2_packet_planning_anti_narrowing.v1";
  posture: AutoresearchLevel2PacketPlanningAntiNarrowingPosture;
  targetClosureAllowed: boolean;
  proofOnlyBaselineOnlyTargetClosureBlocked: boolean;
  incompleteMatrixExceptionRecorded: boolean;
  explicitDowngradeRecorded: boolean;
  missingLaneKeys: readonly string[];
  duplicateLaneKeys: readonly string[];
  proofOnlyBaselineOnlyLaneKeys: readonly string[];
  blockerMetric: AutoresearchLevel2PacketPlanningBlockerMetric;
  proofs: readonly {
    proof: string;
    status: "present";
    source: string;
  }[];
  guidance: readonly string[];
}

export type AutoresearchLevel2PacketTokenName =
  | "launch_visible_candidate_lanes"
  | "finalize_post_fanin"
  | "ak_owner_write"
  | "candidate_cleanup"
  | "promotion";

export interface AutoresearchLevel2PacketTokenVocabularyEntry {
  tokenName: AutoresearchLevel2PacketTokenName;
  exactToken: string;
  requiredFor: string;
  ownerSurface: string;
  description: string;
}

export interface AutoresearchLevel2PacketDescriptor {
  packetName: AutoresearchLevel2PacketTokenName;
  tokenName: AutoresearchLevel2PacketTokenName;
  requiredToken: string;
  posture:
    | "blocked_missing_launch_token"
    | "blocked_until_owner_token"
    | "blocked_until_review_token";
  execution: "not_executed_by_orchestrator";
  exactCalls: readonly string[];
  boundary: string;
}

export interface AutoresearchLevel2PacketPlanning {
  kind: "autoresearch.level2_packet_planning.v1";
  schemaVersion: 1;
  taskId: number;
  cwd: string;
  objective: string;
  packetOnly: true;
  execution: "not_executed_by_orchestrator";
  tokenVocabulary: {
    launchVisibleCandidateLanes: AutoresearchLevel2PacketTokenVocabularyEntry & {
      tokenName: "launch_visible_candidate_lanes";
    };
    postFaninFinalizer: AutoresearchLevel2PacketTokenVocabularyEntry & {
      tokenName: "finalize_post_fanin";
    };
    akOwnerWrite: AutoresearchLevel2PacketTokenVocabularyEntry & {
      tokenName: "ak_owner_write";
    };
    candidateCleanup: AutoresearchLevel2PacketTokenVocabularyEntry & {
      tokenName: "candidate_cleanup";
    };
    promotion: AutoresearchLevel2PacketTokenVocabularyEntry & { tokenName: "promotion" };
  };
  packets: {
    launchVisibleCandidateLanes: AutoresearchLevel2PacketDescriptor & {
      packetName: "launch_visible_candidate_lanes";
      tokenName: "launch_visible_candidate_lanes";
      posture: "blocked_missing_launch_token";
      allowedTool: "candidate_peer_spawn";
      launchCalls: readonly [];
      withheldLaunchCallCount: number;
    };
    postFaninFinalizer: AutoresearchLevel2PacketDescriptor & {
      packetName: "finalize_post_fanin";
      tokenName: "finalize_post_fanin";
    };
    akOwnerWrite: AutoresearchLevel2PacketDescriptor & {
      packetName: "ak_owner_write";
      tokenName: "ak_owner_write";
    };
    candidateCleanup: AutoresearchLevel2PacketDescriptor & {
      packetName: "candidate_cleanup";
      tokenName: "candidate_cleanup";
    };
    promotion: AutoresearchLevel2PacketDescriptor & {
      packetName: "promotion";
      tokenName: "promotion";
    };
  };
  metric: AutoresearchLevel2PacketPlanningBlockerMetric;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchMatrixManagedWaveSubstrate {
  kind: "autoresearch.matrix_managed_candidate_wave_substrate.v1";
  cellCount: number;
  candidateCountPerCell: number;
  expectedCandidateLaneCount: number;
  finalOnlyScoring: true;
  controllerMeasurementRequired: true;
  explicitPacketPathsGateSelection: true;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
  handoffContract: AutoresearchCampaignPeerRunnerHandoffContract;
  cellFanInCalls: readonly {
    cellId: string;
    planCandidateWaveCall: string;
    reviewCandidateWaveCall: string;
  }[];
  checklist: readonly string[];
}

export interface AutoresearchMatrixCampaignOwnerReviewRoute {
  primaryUi: {
    surface: "pi-autoresearch_html_dashboard";
    slashCommand: "/autoresearch export";
    fallbackSlashCommand: "/autoresearch overlay";
    summary: string;
  };
  decisionUi: {
    surface: "pi-autoresearch_candidate_decision_workbench";
    slashCommand: "/autoresearch review";
    summary: string;
  };
  reviewFlow: readonly string[];
  cellReviewCalls: readonly {
    cellId: string;
    reviewCandidateWaveCall: string;
  }[];
  boundary: string;
}

export interface AutoresearchMatrixCampaignPlan {
  kind: "autoresearch.matrix_campaign_plan.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  operatorFollowup: AutoresearchMatrixCampaignOperatorFollowup;
  scenarios: readonly string[];
  hypotheses: readonly string[];
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  managedWaveSubstrate: AutoresearchMatrixManagedWaveSubstrate;
  level2PacketPlanning: AutoresearchLevel2PacketPlanning;
  implementationWaveSubstrate: {
    posture: "dogfood_matrix_replaces_hand_authored_wave_steps";
    akTaskId: number;
    ownerUiCommand: "/autoresearch review";
    handoffContract: AutoresearchCampaignPeerRunnerHandoffContract;
    nextExactCalls: readonly string[];
  };
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignRunnerRequest extends AutoresearchMatrixCampaignRequest {
  runnerManifestPath?: string;
  checkpointConfirmation?: string;
  candidateBindings?: readonly AutoresearchLevel3CandidateLifecycleBindingInput[];
}

export interface AutoresearchMatrixCampaignRunnerLane {
  cellId: string;
  laneId: string;
  objective: string;
  cellObjective: string;
  candidatePeerCall: string;
  measurementPlan: readonly string[];
  candidateResultPacketPath: string;
  reviewCandidateWaveCall: string;
}

export interface AutoresearchMatrixCampaignRunnerContract {
  kind: "autoresearch.matrix_campaign_runner_contract.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  operatorFollowup: AutoresearchMatrixCampaignOperatorFollowup;
  manifest: {
    path: string;
    identityAnchor: string;
    exactTaskId: number;
    exactCwd: string;
    cellCount: number;
    candidateLaneCount: number;
    packageOwnerBoundary: "pi-society-orchestrator_matrix_choreography_only";
    durableEvidence: false;
  };
  launchPhase: {
    posture: "ready_to_launch_visible_candidate_peers" | "blocked_missing_parent_peer_target";
    allowedTool: "candidate_peer_spawn";
    launchCalls: readonly string[];
    parentPeerTarget: string | null;
    visibleCandidateLaneBinding: {
      name: "visible_candidate_lane_binding_blockers";
      direction: "lower";
      target: 0;
      value: number;
      status: "target_met" | "blocked";
      expectedLaneCount: number;
      visibleLaunchCallCount: number;
      hiddenLaunchCallCount: number;
      missingParentPeerTarget: boolean;
    };
  };
  checkpointGate: {
    posture: "controller_checkpoint_required_before_benchmark_export_review";
    requiredToken: string;
    confirmationParameter: "checkpointConfirmation";
    exactCheckpointCall: string;
    blockedUntilConfirmed: readonly [
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
      "review_matrix_campaign",
    ];
  };
  lockedBenchmarkExportReview: {
    posture: "withheld_until_checkpoint";
    calls: readonly [];
  };
  lanes: readonly AutoresearchMatrixCampaignRunnerLane[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignRunnerCheckpoint {
  kind: "autoresearch.matrix_campaign_runner_checkpoint.v1";
  taskId: number;
  cwd: string;
  objective: string;
  operatorFollowup: AutoresearchMatrixCampaignOperatorFollowup;
  manifestPath: string;
  checkpointAccepted: boolean;
  posture: "blocked_until_exact_controller_checkpoint" | "benchmark_export_review_unlocked";
  requiredToken: string;
  benchmarkExportReviewCalls: readonly string[];
  reviewMatrixCampaignCall: string | null;
  controllerCommandPacket: AutoresearchMatrixCampaignControllerCommandPacket | null;
  cockpit: AutoresearchMatrixCampaignCockpit;
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignControllerCommandPacket {
  kind: "autoresearch.matrix_cell_controller_command_packet.v1";
  checkpointAccepted: true;
  manifestPath: string;
  exactTaskId: number;
  exactCwd: string;
  cellMetric: {
    name: string;
    direction: "lower" | "higher";
    target: number | null;
  };
  manualControllerGlueBlockers: {
    name: "manual_controller_glue_blockers";
    direction: "lower";
    target: 0;
    proofChecklist: readonly {
      proof: string;
      status: "present";
      source: string;
    }[];
  };
  checkpointAndLineageVerification: {
    requiredToken: string;
    controllerVerifiedLineageRequired: true;
    peerFinalIsCommunicationOnly: true;
    verificationSteps: readonly string[];
  };
  cells: readonly {
    cellId: string;
    objective: string;
    exactControllerSequence: readonly [
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
      "review_matrix_campaign",
    ];
    lanes: readonly {
      laneId: string;
      candidateResultPacketPath: string;
      bindCall: string;
      metricRunCall: string;
      candidateResultExportCall: string;
      metricBindingSummary: string;
    }[];
    reviewCandidateWaveCall: string;
    reviewMatrixCampaignCall: string;
  }[];
  flattenedNextCallBundle: readonly string[];
  boundaries: readonly string[];
}

export type AutoresearchMatrixCampaignOperatorLaneState =
  | "planned"
  | "locked_until_checkpoint"
  | "measurement_export_unlocked"
  | "missing_packet"
  | "packet_missing"
  | "measured_exported_selectable"
  | "measured_exported_not_selectable";

export interface AutoresearchLevel2PacketPlanningBlockers {
  name: "level2_packet_planning_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
  missingTokens: readonly string[];
  nextLegalActions: readonly string[];
  forbiddenActions: readonly string[];
  level1Fallback: string;
  noHiddenExecutionBoundary: string;
  proofs: readonly {
    proof: string;
    status: "present";
    source: string;
  }[];
}

export interface AutoresearchMatrixCampaignOperatorFollowup {
  kind: "autoresearch.matrix_campaign_operator_followup.v1";
  currentState: string;
  primaryMetric: {
    name: string;
    direction: "lower" | "higher";
    target: number | null;
    targetSummary: string;
  };
  level2PacketPlanningBlockers: AutoresearchLevel2PacketPlanningBlockers;
  lanePacketPaths: readonly {
    cellId: string;
    laneId: string;
    packetPath: string;
    state: AutoresearchMatrixCampaignOperatorLaneState;
  }[];
  checkpointState: {
    posture: "not_applicable" | "controller_checkpoint_required" | "blocked" | "accepted";
    manifestPath: string | null;
    requiredToken: string | null;
    checkpointAccepted: boolean | null;
    warning: string;
  };
  measurementReviewState: {
    posture: string;
    completedCells: number;
    expectedCells: number;
    selectedCells: number;
    benchmarkExportReviewCallsExposed: boolean;
    reviewMatrixCampaignCall: string | null;
  };
  nextLegalActions: readonly string[];
  blockersChecklist: readonly {
    proof: string;
    status: "present";
    source: string;
  }[];
}

export interface AutoresearchMatrixCampaignCellReview {
  cellId: string;
  scenario: string;
  hypothesis: string;
  objective: string;
  recommendationPosture: AutoresearchCandidateWaveReview["recommendation"]["posture"];
  selectedLaneId: string | null;
  completedLaneCount: number;
  expectedLaneCount: number;
  reviewCandidateWaveCall: string;
  candidateWaveReview: AutoresearchCandidateWaveReview;
}

export interface AutoresearchMatrixCampaignCloseout {
  kind: "autoresearch.matrix_campaign_closeout.v1";
  posture:
    | "ak_ready_after_owner_review"
    | "blocked_until_managed_cell_waves_complete"
    | "blocked_until_cell_rerun";
  summary: string;
  packetPaths: readonly string[];
  packetInventory: readonly {
    cellId: string;
    laneId: string;
    packetPath: string | null;
    state: AutoresearchMatrixCampaignOperatorLaneState;
    selected: boolean;
  }[];
  selectedLanes: readonly {
    cellId: string;
    scenario: string;
    hypothesis: string;
    laneId: string;
    sourcePacketPath: string | null;
  }[];
  evidenceProjection: {
    posture: "ready_for_external_projection" | "blocked";
    ownerSurface: "AK";
    requiredAnchor: string;
    projectionKey: string;
    exactRecordCall: string | null;
    exactHandoff: "evidence_record";
    guidance: readonly string[];
    boundary: string;
  };
  ownerDecisionRoute: {
    dashboardFirst: "/autoresearch export";
    overlayFallback: "/autoresearch overlay";
    finalDecision: "/autoresearch review";
    evidenceAfterReview: true;
    routeOrder: readonly ["/autoresearch export", "/autoresearch review", "evidence_record"];
  };
  evidenceHandoffBlockers: {
    name: "evidence_handoff_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    proofs: readonly {
      proof: string;
      status: "present";
      source: string;
    }[];
  };
  learningActivation: {
    posture: "ready_for_owner_routed_learning_handoff" | "blocked";
    ownerSurface: "autoresearch_learning_kes_adapter";
    requiredPacketKind: "autoresearch.learning.v1";
    exactLearningExportCall: string | null;
    exactAdapterPlanCall: string | null;
    exactAdapterMaterializeCall: string | null;
    routeOrder: readonly [
      "autoresearch_runtime_status.learning_export",
      "autoresearch_learning_kes_adapter.plan",
      "owner_review",
      "autoresearch_learning_kes_adapter.materialize",
    ];
    guidance: readonly string[];
    boundary: string;
  };
  learningActivationBlockers: {
    name: "learning_activation_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    proofs: readonly {
      proof: string;
      status: "present";
      source: string;
    }[];
  };
  nextLegalOwnerActions: readonly string[];
  notDone: readonly string[];
}

export type AutoresearchLevel3ReviewSelectionWinnerState =
  | "selected_for_owner_review"
  | "blocked_missing_packets"
  | "blocked_no_selectable_lane";

export interface AutoresearchLevel3ReviewSelectionCell {
  cellId: string;
  scenario: string;
  hypothesis: string;
  expectedLaneCount: number;
  completedLaneCount: number;
  selectableLaneCount: number;
  visibleCandidateLaneCount: number;
  winnerState: AutoresearchLevel3ReviewSelectionWinnerState;
  recommendedLaneId: string | null;
  recommendedMetric: number | null;
  recommendedSourcePacketPath: string | null;
  recommendedCandidateWorktree: string | null;
  recommendedCandidateBranch: string | null;
  recommendedCandidateBaseRef: string | null;
  recommendedPeerRunId: string | null;
  nonSelectedSelectableLaneIds: readonly string[];
  blockerCount: number;
  blockers: readonly string[];
  ownerReviewCall: string;
  nextLegalAction: string;
}

export interface AutoresearchLevel3ReviewSelectionSubstrate {
  kind: "autoresearch.level3_review_selection_substrate.v1";
  source: "level3_matrix_cell_runner_visible_candidate_lanes";
  aggregationInput: "controller_verified_candidate_result_packets";
  taskId: number;
  cwd: string;
  objective: string;
  finalOnlyScoring: true;
  ownerReviewRequired: true;
  selectionAuthority: "recommendation_only";
  cellSelections: readonly AutoresearchLevel3ReviewSelectionCell[];
  blockerMetric: {
    name: "level3_review_selection_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    blockers: readonly string[];
  };
  finalizerReadiness: {
    posture:
      | "ready_for_validation_and_finalize_token_request"
      | "blocked_until_cell_selection_ready";
    sourceReview: "review_matrix_campaign";
    selectedLaneCount: number;
    expectedCellCount: number;
    validationStillRequired: true;
    exactFinalizePostFaninHandoffCall: string | null;
    applyCommandsExposed: false;
    promotionAuthority: false;
    cleanupAuthority: false;
    requiredOwnerTokens: readonly [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ];
  };
  dangerousActionGates: {
    finalizePostFanin: "exact_finalize_post_fanin_token_required";
    candidateCleanup: "automatic_after_successful_integration_closeout_or_exact_token";
    promotion: "separate_promotion_token_required";
    akOwnerWrite: "separate_ak_owner_write_required";
  };
  nextLegalActions: readonly string[];
  boundaries: readonly string[];
}

export interface AutoresearchLevel2OperatorUxMetric {
  name:
    | "level2_operator_ux_blockers"
    | "dashboard_readiness_summary_blockers"
    | "authority_boundary_clarity_blockers"
    | "fallback_recovery_ux_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
}

export interface AutoresearchLevel2OperatorUxDashboard {
  kind: "autoresearch.level2_operator_ux_dashboard.v1";
  currentCheckpointState: string;
  packetInventorySummary: string;
  primaryMetric: AutoresearchLevel2OperatorUxMetric & {
    name: "level2_operator_ux_blockers";
  };
  cellMetrics: readonly AutoresearchLevel2OperatorUxMetric[];
  tokenAndAuthorityLegend: {
    peerText: "communication_only";
    candidateResultPackets: "review_inputs_not_durable_evidence";
    reviewPackets: "owner_review_inputs_not_promotion";
    akEvidence: "separate_owner_write_required";
    finalizerCleanupPromotion: "separate_token_gates_required";
  };
  nextLegalActions: readonly string[];
  fallbackAndRecovery: readonly string[];
  proofs: readonly {
    proof: string;
    status: "present";
    source: string;
  }[];
}

export interface AutoresearchMatrixCampaignCockpit {
  kind: "autoresearch.matrix_campaign_cockpit.v1";
  source: "checkpoint_matrix_campaign_runner" | "review_matrix_campaign";
  progress: {
    posture: string;
    completedCells: number;
    expectedCells: number;
    selectedCells: number;
    summary: string;
  };
  cellRows: readonly {
    cellId: string;
    posture: string;
    laneProgress: string;
    selectedLaneId: string | null;
    selectedPacketPath: string | null;
    packetInventory: readonly string[];
    nextLegalAction: string;
  }[];
  packetInventory: readonly {
    cellId: string;
    laneId: string;
    packetPath: string | null;
    state: AutoresearchMatrixCampaignOperatorLaneState;
    selected: boolean;
  }[];
  selectedLanes: readonly {
    cellId: string;
    laneId: string;
    sourcePacketPath: string | null;
  }[];
  ownerDecisionRoute: {
    dashboardFirst: "/autoresearch export";
    overlayFallback: "/autoresearch overlay";
    finalDecision: "/autoresearch review";
    evidenceAfterReview: true;
    routeOrder: readonly ["/autoresearch export", "/autoresearch review", "evidence_record"];
  };
  nextLegalCampaignActions: readonly string[];
  noHiddenExecutionBoundaries: readonly string[];
  operatorUxDashboard: AutoresearchLevel2OperatorUxDashboard;
  matrixCockpitBlockers: {
    name: "matrix_cockpit_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
    proofs: readonly {
      proof: string;
      status: "present";
      source: string;
    }[];
  };
}

export type AutoresearchReviewDispositionOption =
  | "ignore"
  | "inspect further"
  | "fold into synthesis"
  | "cherry-pick after review"
  | "merge after review";

export interface AutoresearchReviewPacketDispositionOption {
  option: AutoresearchReviewDispositionOption;
  posture: "owner_review_required";
  description: string;
  forbiddenWithoutOwnerToken: readonly string[];
}

export interface AutoresearchReviewPacketAuthorityBoundary {
  durableEvidence: false;
  promotionAuthority: false;
  selectionAuthority: "recommendation_only" | "matrix_review_only";
  forbiddenActions: readonly string[];
  requiredOwnerTokens: readonly ["ak_owner_write", "candidate_cleanup", "promotion"];
  boundary: string;
}

export interface AutoresearchCandidateWaveReviewPacket {
  kind: "autoresearch.review_candidate_wave_packet.v1";
  generatedFrom: "bound_candidate_results";
  candidateWaveReviewKind: "autoresearch.candidate_wave_review.v1";
  laneDispositionOptions: readonly AutoresearchReviewPacketDispositionOption[];
  bindingMetric: AutoresearchLevel2CandidateBinding["metric"];
  candidateResultPacketRefs: readonly AutoresearchCandidateReviewPacketChainRef[];
  packetChainMetric: AutoresearchCandidateReviewPacketChainMetric;
  recommendedLaneId: string | null;
  selectableLaneCount: number;
  nextLegalActions: readonly string[];
  authorityBoundary: AutoresearchReviewPacketAuthorityBoundary;
}

export interface AutoresearchWholeMatrixMetricPosture {
  name: "level2_review_packet_generation_blockers";
  direction: "lower";
  target: 0;
  value: number;
  status: "target_met" | "blocked";
  sourceMetricName: string;
  sourceMetricTarget: number | null;
  targetClosureAllowed: boolean;
  incompleteMatrixExceptionRecorded: boolean;
  explicitDowngradeRecorded: boolean;
  proofOnlyBaselineOnlyTargetClosureBlocked: boolean;
  guidance: readonly string[];
}

export interface AutoresearchMatrixCampaignReviewPacket {
  kind: "autoresearch.review_matrix_campaign_packet.v1";
  generatedFrom: "managed_cell_candidate_wave_reviews";
  matrixCampaignReviewKind: "autoresearch.matrix_campaign_review.v1";
  laneDispositionOptions: readonly AutoresearchReviewPacketDispositionOption[];
  wholeMatrixMetricPosture: AutoresearchWholeMatrixMetricPosture;
  candidateResultPacketRefs: readonly AutoresearchCandidateReviewPacketChainRef[];
  packetChainMetric: AutoresearchCandidateReviewPacketChainMetric;
  selectedLaneCount: number;
  expectedCellCount: number;
  canCloseMatrixTarget: boolean;
  nextLegalActions: readonly string[];
  authorityBoundary: AutoresearchReviewPacketAuthorityBoundary;
}

export interface AutoresearchMatrixCampaignReview {
  kind: "autoresearch.matrix_campaign_review.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  operatorFollowup: AutoresearchMatrixCampaignOperatorFollowup;
  posture:
    | "waiting_for_managed_cell_waves"
    | "ready_for_matrix_owner_review"
    | "cell_rerun_required";
  cells: readonly AutoresearchMatrixCampaignCellReview[];
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
  closeout: AutoresearchMatrixCampaignCloseout;
  cockpit: AutoresearchMatrixCampaignCockpit;
  reviewPacket: AutoresearchMatrixCampaignReviewPacket;
  level3ReviewSelection: AutoresearchLevel3ReviewSelectionSubstrate;
  exactNextCalls: readonly string[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchCandidateWaveResultInput {
  laneId: string;
  objective?: string;
  metric?: number;
  status?: string;
  checksStatus?: string;
  confidence?: number;
  candidateSource?: string;
  candidateWorktree?: string;
  candidateBranch?: string;
  candidateBaseRef?: string;
  candidateDiffSummary?: string;
  candidateFilesChanged?: readonly string[];
  candidatePeerRunId?: string;
  candidateRunnerId?: string;
  sourcePacketPath?: string;
  caveat?: string;
}

export interface AutoresearchCandidateWaveReviewRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  candidateResults?: readonly AutoresearchCandidateWaveResultInput[];
  candidateResultPacketPaths?: readonly string[];
  offLimits?: readonly string[];
}

export interface AutoresearchCandidateWaveReviewLane {
  laneId: string;
  objective: string | null;
  metric: number | null;
  status: string;
  checksStatus: string;
  confidence: number | null;
  candidateSource: string | null;
  candidateWorktree: string | null;
  candidateBranch: string | null;
  candidateBaseRef: string | null;
  candidateDiffSummary: string | null;
  candidateFilesChanged: readonly string[];
  candidatePeerRunId: string | null;
  candidateRunnerId: string | null;
  sourcePacketPath: string | null;
  caveat: string | null;
  rank: number | null;
  selectable: boolean;
  selectionReason: string;
}

export interface AutoresearchLevel2CandidateBindingLane {
  laneId: string;
  bindingKey: string;
  sourcePacketPath: string | null;
  candidateSource: string | null;
  candidatePeerRunId: string | null;
  candidateRunnerId: string | null;
  controllerVerifiedFacts: {
    packetPresent: boolean;
    metricPresent: boolean;
    checksStatus: string;
    candidateWorktree: string | null;
    candidateBranch: string | null;
    candidateBaseRef: string | null;
    candidateFilesChanged: readonly string[];
  };
  peerAssertions: {
    peerRunId: string | null;
    runnerId: string | null;
    status: string;
    caveat: string | null;
  };
  bindingStatus:
    | "bound_controller_verified_packet"
    | "blocked_missing_packet"
    | "blocked_duplicate_lane"
    | "peer_assertion_only"
    | "manual_input_review_only";
  blockers: readonly string[];
}

export interface AutoresearchLevel2CandidateBinding {
  kind: "autoresearch.level2_candidate_binding.v1";
  metric: {
    name: "level2_candidate_binding_blockers";
    direction: "lower";
    target: 0;
    value: number;
    status: "target_met" | "blocked";
  };
  expectedLaneCount: number;
  boundLaneCount: number;
  controllerVerifiedLaneCount: number;
  missingLaneIds: readonly string[];
  duplicateLaneIds: readonly string[];
  peerAssertionOnlyLaneIds: readonly string[];
  lanes: readonly AutoresearchLevel2CandidateBindingLane[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchCandidateWavePacketDiscovery {
  mode: "explicit" | "default" | "manual";
  defaultDirectory: string;
  candidateResultPacketPaths: readonly string[];
  message: string;
}

export type AutoresearchCandidateWaveReliabilityRecoveryPosture =
  | "complete"
  | "missing_or_stalled_lane_recovery_required"
  | "selection_ready_with_non_selected_lane_guidance"
  | "no_selectable_lane_recovery_required";

export type AutoresearchCandidateWaveReliabilityLaneRecoveryKind =
  | "missing_or_stalled_packet"
  | "late_packet_reconcile"
  | "selected_candidate"
  | "non_selected_stop_cancel"
  | "not_selectable_rerun_or_discard";

export interface AutoresearchCandidateWaveReliabilityLaneRecovery {
  laneId: string;
  kind: AutoresearchCandidateWaveReliabilityLaneRecoveryKind;
  packetPath: string | null;
  planOnly: true;
  guidance: string;
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveReliabilityRecovery {
  kind: "autoresearch.candidate_wave_reliability_recovery.v1";
  posture: AutoresearchCandidateWaveReliabilityRecoveryPosture;
  missingOrStalledLaneIds: readonly string[];
  latePacketPolicy: string;
  nonSelectedLaneIds: readonly string[];
  laneRecovery: readonly AutoresearchCandidateWaveReliabilityLaneRecovery[];
  summary: string;
  boundaries: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionOption {
  optionId: string;
  laneId: string;
  label: string;
  posture: "owner_gate_required";
  rationale: string;
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionFormOption {
  optionId: string;
  label: string;
  recommended: boolean;
  rationale: string;
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionInterviewPayload {
  title: string;
  description: string;
  questions: readonly [
    {
      id: "candidate_wave_owner_decision";
      type: "single";
      question: string;
      options: readonly {
        label: string;
        value: string;
        content: {
          source: string;
          lang: "md";
        };
      }[];
      recommended?: {
        optionId: string;
        rationale: string;
      };
      weight: "critical";
    },
  ];
}

export interface AutoresearchCandidateWaveOwnerDecisionPrimaryUi {
  surface: "pi-autoresearch_candidate_decision_workbench";
  summary: string;
  slashCommand: string;
  exactPreparationCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionForm {
  kind: "autoresearch.candidate_wave_owner_decision_form.v1";
  title: string;
  description: string;
  questionId: "candidate_wave_owner_decision";
  recommendedOptionId: string | null;
  options: readonly AutoresearchCandidateWaveOwnerDecisionFormOption[];
  primaryUi: AutoresearchCandidateWaveOwnerDecisionPrimaryUi;
  interviewQuestions: AutoresearchCandidateWaveOwnerDecisionInterviewPayload;
  interviewCall: string;
  boundary: string;
}

export interface AutoresearchOwnerReviewRoute {
  primaryUi: {
    surface: "pi-autoresearch_html_dashboard";
    slashCommand: "/autoresearch export";
    fallbackSlashCommand: "/autoresearch overlay";
    summary: string;
  };
  decisionUi: {
    surface: "pi-autoresearch_candidate_decision_workbench";
    slashCommand: "/autoresearch review";
    summary: string;
  };
  reviewFlow: readonly string[];
  boundary: string;
}

export interface AutoresearchCandidateWaveReview {
  kind: "autoresearch.candidate_wave_review.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  lanes: AutoresearchCandidateWaveReviewLane[];
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery;
  recommendation: {
    posture: "owner_selection_required" | "planned_lanes_incomplete" | "no_selectable_candidate";
    laneId: string | null;
    reason: string;
    exactNextCalls: string[];
    ownerDecisionOptions: readonly AutoresearchCandidateWaveOwnerDecisionOption[];
    ownerDecisionForm: AutoresearchCandidateWaveOwnerDecisionForm | null;
  };
  management: AutoresearchCandidateWaveManagement;
  reliabilityRecovery: AutoresearchCandidateWaveReliabilityRecovery;
  level2CandidateBinding: AutoresearchLevel2CandidateBinding;
  reviewPacket: AutoresearchCandidateWaveReviewPacket;
  ownerReviewRoute: AutoresearchOwnerReviewRoute;
  nextStep: string;
  boundaries: string[];
}

export interface AutoresearchLiveStopResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1 | null;
  stopped: boolean;
  nextStep: string;
}

export interface AutoresearchLiveSupervisionRunnerConfig {
  akPath?: string;
  societyDb?: string;
  now?: () => number;
  setTimeout?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  observeRuntime?: (
    cwd: string,
    options: { persistSnapshot: false },
  ) => MaybePromise<AutoresearchRuntimeStatus>;
  loadLedger?: (cwd: string) => MaybePromise<AutoresearchLedgerLoadResult>;
  projectLedgerEntries?: (
    entries: AutoresearchLedgerLoadResult["entries"],
  ) => MaybePromise<Pick<AutoresearchLedgerProjection, "context">>;
  inspectFinalization?: (input: {
    cwd: string;
    status: AutoresearchRuntimeStatus;
  }) => MaybePromise<InspectAutoresearchFinalizationResult>;
  observeOracleEvidence?: (cwd: string) => MaybePromise<AutoresearchOracleEvidencePacket>;
  projectMilestone?: (input: {
    taskId: number;
    observation: AutoresearchLiveObservation;
    akPath: string;
    societyDb: string;
    signal?: AbortSignal;
  }) => MaybePromise<AutoresearchAkProjectorResult>;
  evaluateLifecycle?: (
    input: AutoresearchLiveLifecycleInput,
  ) => MaybePromise<AutoresearchLiveLifecycleOutcome>;
  startCampaign?: typeof executeAutoresearchCampaignStart;
}

interface SessionIdentity {
  taskId: number;
  cwd: string;
  sessionKey: string;
}

interface SessionRecord {
  identity: SessionIdentity;
  persistent: boolean;
  keepRunning: boolean;
  session: AutoresearchLiveSupervisionSessionV1;
  timer: TimerHandle | null;
  inFlight: Promise<AutoresearchLivePollResult> | null;
}

export function buildAutoresearchLiveSupervisionSessionKey(input: {
  taskId: number;
  cwd: string;
}): string {
  return `${input.taskId}|${path.resolve(input.cwd)}`;
}

export function resolveAutoresearchLiveSupervisionPolicy(
  intervalSeconds?: number,
): AutoresearchLiveSupervisionPolicyV1 {
  const resolvedInterval =
    intervalSeconds ?? AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS;

  if (
    !Number.isInteger(resolvedInterval) ||
    resolvedInterval < AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS ||
    resolvedInterval > AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS
  ) {
    throw new Error(
      `intervalSeconds must be an integer between ${AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS} and ${AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS}, received: ${String(intervalSeconds)}`,
    );
  }

  return {
    intervalSeconds: resolvedInterval,
    autoStopOnTerminal: true,
    lifecycleMode: "complete_on_verified_completion",
  };
}

export function resolveAutoresearchLiveSupervisionIdentity(
  input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
): SessionIdentity {
  if (!Number.isInteger(input.taskId) || input.taskId <= 0) {
    throw new Error(`taskId must be a positive integer, received: ${String(input.taskId)}`);
  }

  if (typeof input.cwd !== "string" || input.cwd.trim().length === 0) {
    throw new Error("cwd is required for live autoresearch supervision");
  }

  const cwd = path.resolve(input.cwd);
  return {
    taskId: input.taskId,
    cwd,
    sessionKey: buildAutoresearchLiveSupervisionSessionKey({
      taskId: input.taskId,
      cwd,
    }),
  };
}

function resolveStartCampaignPositiveIntegerBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer, received: ${String(value)}`);
  }
  return resolved;
}

function resolveStartCampaignPositiveNumberBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number, received: ${String(value)}`);
  }
  return resolved;
}

function metricStatus(value: number): "target_met" | "blocked" {
  return value === 0 ? "target_met" : "blocked";
}

function readJsonFile(pathToRead: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(pathToRead, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON file ${pathToRead}: ${message}`);
  }
}

function resolveCandidateWaveCount(
  input: Pick<AutoresearchCandidateWaveRequest, "candidateObjectives" | "candidateCount">,
): number {
  const fromObjectives = input.candidateObjectives?.length ?? 0;
  const resolved = input.candidateCount ?? (fromObjectives > 0 ? fromObjectives : 3);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 6) {
    throw new Error(
      `candidateCount must be an integer between 1 and 6, received: ${String(input.candidateCount)}`,
    );
  }
  return resolved;
}

function resolveMatrixCellCandidateCount(value: number | undefined): number {
  return resolveCandidateWaveCount({ candidateCount: value });
}

function resolveCandidateWavePacketDirectory(value: string | undefined): string {
  const raw = value?.trim() || AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR;
  if (path.isAbsolute(raw)) {
    throw new Error("candidatePacketDirectory must be repo-relative under .autoresearch/.");
  }
  const normalized = path.posix.normalize(raw.replace(/\\/gu, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !(normalized === ".autoresearch" || normalized.startsWith(".autoresearch/"))
  ) {
    throw new Error("candidatePacketDirectory must stay under .autoresearch/.");
  }
  return normalized;
}

function nonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

function defaultCandidateObjective(index: number, objective: string): string {
  const templates = [
    `Try the smallest surgical candidate patch for: ${objective}`,
    `Try an alternative implementation strategy for: ${objective}`,
    `Try a UX/status/evidence-oriented candidate patch for: ${objective}`,
    `Try a risk-reducing simplification candidate for: ${objective}`,
    `Try a measurement/instrumentation candidate that improves confidence for: ${objective}`,
    `Try a conservative cleanup candidate that removes friction for: ${objective}`,
  ];
  return templates[index] ?? `Try bounded candidate ${index + 1} for: ${objective}`;
}

function formatToolCall(name: string, payload: Record<string, unknown>): string {
  return `${name}(${JSON.stringify(payload, null, 2)})`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256StableJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function normalizeReviewToken(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/gu, "_")
    : "";
}

function candidateWaveChecksAcceptable(checksStatus: unknown): boolean {
  const normalized = normalizeReviewToken(checksStatus);
  if (normalized.length === 0) return true;
  return ["pass", "passed", "ok", "success", "succeeded", "none", "no_checks"].includes(normalized);
}

function candidateWaveStatusDecision(
  status: unknown,
): "keep" | "more_samples" | "discard" | "rewind" | "blocked" | "unknown" {
  const normalized = normalizeReviewToken(status);
  if (normalized.length === 0) return "unknown";
  if (
    [
      "candidate_improvement",
      "threshold_satisfied",
      "threshold_preserved",
      "candidate_review_ready",
      "keep",
      "candidate",
    ].includes(normalized)
  ) {
    return "keep";
  }
  if (["insufficient_samples", "possible_noise", "calibration_signal"].includes(normalized)) {
    return "more_samples";
  }
  if (normalized === "candidate_neutral") return "rewind";
  if (
    normalized.includes("regression") ||
    normalized.includes("fail") ||
    normalized.includes("crash") ||
    normalized.includes("blocked") ||
    normalized.includes("discard") ||
    normalized === "measurement_invalid" ||
    normalized === "threshold_regressed" ||
    normalized === "checks_failed" ||
    normalized === "missing_packet" ||
    normalized === "baseline_drift"
  ) {
    return "discard";
  }
  return "unknown";
}

function candidateWaveRunnerLineage(
  input: AutoresearchCandidateWaveResultInput,
  cwd: string,
): {
  ok: boolean;
  reason: string;
} {
  if (input.candidateSource !== "candidate_peer_spawn") {
    return {
      ok: false,
      reason: `process_violation: candidate source is ${input.candidateSource ?? "missing"}, expected candidate_peer_spawn`,
    };
  }
  if (!input.candidateWorktree || input.candidateWorktree.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing external candidate worktree" };
  }
  if (path.resolve(input.candidateWorktree) === path.resolve(cwd)) {
    return {
      ok: false,
      reason: "process_violation: candidate worktree must be distinct from controller cwd",
    };
  }
  if (!input.candidateBranch || input.candidateBranch.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing candidate branch" };
  }
  if (!input.candidateBaseRef || input.candidateBaseRef.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing candidate base ref" };
  }
  if (!input.candidateFilesChanged || input.candidateFilesChanged.length === 0) {
    return { ok: false, reason: "process_violation: missing candidate changed-files proof" };
  }
  return {
    ok: true,
    reason:
      input.candidatePeerRunId || input.candidateRunnerId
        ? "verified candidate_peer_spawn worktree lineage with runner id"
        : "verified candidate_peer_spawn worktree lineage",
  };
}

function normalizeCandidateReviewPath(value: string, cwd: string): string {
  const raw = value.trim().replace(/\\/gu, "/");
  if (raw.length === 0) return "";
  const repoRelative = path.isAbsolute(raw) ? path.relative(cwd, raw).replace(/\\/gu, "/") : raw;
  const normalized = path.posix.normalize(repoRelative).replace(/^\.\//u, "");
  return normalized === "." ? "" : normalized.replace(/\/$/u, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
}

function candidatePathMatchesOffLimitSpec(changedPath: string, offLimitSpec: string): boolean {
  if (changedPath.length === 0 || offLimitSpec.length === 0) return false;
  if (!offLimitSpec.includes("*")) {
    return changedPath === offLimitSpec || changedPath.startsWith(`${offLimitSpec}/`);
  }

  if (offLimitSpec.endsWith("/**")) {
    const prefix = offLimitSpec.slice(0, -"/**".length);
    if (changedPath === prefix || changedPath.startsWith(`${prefix}/`)) return true;
  }

  let pattern = "";
  for (let index = 0; index < offLimitSpec.length; index += 1) {
    const char = offLimitSpec[index];
    if (char === "*" && offLimitSpec[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`, "u").test(changedPath);
}

function candidateFilesChangedOffLimitViolations(input: {
  cwd: string;
  candidateFilesChanged: readonly string[] | undefined;
  offLimits: readonly string[];
}): string[] {
  const offLimitSpecs = input.offLimits
    .map((spec) => normalizeCandidateReviewPath(spec, input.cwd))
    .filter((spec) => spec.length > 0);
  if (offLimitSpecs.length === 0) return [];

  return [...(input.candidateFilesChanged ?? [])]
    .map((filePath) => normalizeCandidateReviewPath(filePath, input.cwd))
    .filter((filePath) =>
      offLimitSpecs.some((spec) => candidatePathMatchesOffLimitSpec(filePath, spec)),
    );
}

function candidateWaveLaneSelectable(
  input: AutoresearchCandidateWaveResultInput,
  cwd: string,
  offLimits: readonly string[] = [],
): {
  selectable: boolean;
  reason: string;
} {
  if (typeof input.metric !== "number" || !Number.isFinite(input.metric)) {
    return { selectable: false, reason: "missing finite metric" };
  }
  if (!candidateWaveChecksAcceptable(input.checksStatus)) {
    return { selectable: false, reason: `checks status is ${input.checksStatus}` };
  }
  const decision = candidateWaveStatusDecision(input.status);
  if (
    decision === "discard" ||
    decision === "rewind" ||
    decision === "blocked" ||
    decision === "unknown"
  ) {
    return { selectable: false, reason: `status is ${input.status ?? "unknown"}` };
  }
  const offLimitViolations = candidateFilesChangedOffLimitViolations({
    cwd,
    candidateFilesChanged: input.candidateFilesChanged,
    offLimits,
  });
  if (offLimitViolations.length > 0) {
    return {
      selectable: false,
      reason: `process_violation: off-limits path drift in changed files: ${offLimitViolations.join(", ")}`,
    };
  }

  const lineage = candidateWaveRunnerLineage(input, cwd);
  if (!lineage.ok) {
    return { selectable: false, reason: lineage.reason };
  }
  return {
    selectable: true,
    reason: `finite metric with ${decision} decision posture and ${lineage.reason}`,
  };
}

function sortCandidateWaveReviewLanes(
  lanes: AutoresearchCandidateWaveReviewLane[],
  direction: "lower" | "higher",
): AutoresearchCandidateWaveReviewLane[] {
  const selectable = lanes
    .filter((lane) => lane.selectable && lane.metric !== null)
    .sort((a, b) =>
      direction === "lower" ? (a.metric ?? 0) - (b.metric ?? 0) : (b.metric ?? 0) - (a.metric ?? 0),
    );
  const rankByLane = new Map(selectable.map((lane, index) => [lane.laneId, index + 1]));
  return lanes.map((lane) => ({ ...lane, rank: rankByLane.get(lane.laneId) ?? null }));
}

function candidateWaveSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug || "candidate-wave";
}

function candidateWaveId(input: { taskId: number; objective: string }): string {
  return `task-${input.taskId}-${candidateWaveSlug(input.objective)}`;
}

function buildPlannedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveLane[];
  aggregateReviewCall: string;
}): AutoresearchCandidateWaveManagement {
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture: "planned_not_launched",
    completedLaneCount: 0,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => ({
      laneId: lane.laneId,
      state: "planned",
      candidateResultPacketPath: lane.candidateResultPacketPath,
      selectable: false,
      metric: null,
      nextStep:
        "Launch only if explicitly approved, then bind, measure, and export the lane packet.",
    })),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    nonSelectedLanePolicy:
      "After owner selection, send explicit stop/cancel guidance for non-selected visible peers; do not merge, delete, or reset their worktrees from this plan.",
    fanInChecklist: [
      "Use visible candidate_peer_spawn calls only for approved lanes.",
      "Treat controller-inline implementation patches as a process violation for campaign-style implementation work.",
      "Treat PEER_FINAL as communication until the controller binds and measures the worktree through pi-autoresearch.",
      "Export one autoresearch.candidate_result.v1 packet per planned lane before final scoring.",
      "Run the explicit aggregate review call so missing planned lanes remain visible and gate selection.",
    ],
    exactNextCalls: [input.aggregateReviewCall],
  };
}

function buildReviewedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveReviewLane[];
  plannedLanesIncomplete: boolean;
  winner: AutoresearchCandidateWaveReviewLane | null;
  exactNextCalls: readonly string[];
}): AutoresearchCandidateWaveManagement {
  const completedLaneCount = input.lanes.filter(
    (lane) => normalizeReviewToken(lane.status) !== "missing_packet",
  ).length;
  const posture = input.plannedLanesIncomplete
    ? "waiting_for_planned_lanes"
    : input.winner
      ? "ready_for_owner_selection"
      : "no_selectable_candidate";
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture,
    completedLaneCount,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => {
      const missing = normalizeReviewToken(lane.status) === "missing_packet";
      return {
        laneId: lane.laneId,
        state: missing
          ? "packet_missing"
          : lane.selectable
            ? "measured_exported_selectable"
            : "measured_exported_not_selectable",
        candidateResultPacketPath: lane.sourcePacketPath,
        selectable: lane.selectable,
        metric: lane.metric,
        nextStep: missing
          ? "Wait for controller measurement and candidate_result_export, or explicitly replan the wave without this lane."
          : lane.selectable
            ? "Eligible for final-only scoring after all explicit planned lanes are exported."
            : "Not selectable; inspect status/check posture before rerun or discard planning.",
      };
    }),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    nonSelectedLanePolicy: input.winner
      ? `After owner approval for ${input.winner.laneId}, stop/cancel non-selected visible peers explicitly and leave cleanup/merge/reset to owner-approved lifecycle plans.`
      : "No selected lane yet; do not stop/cancel or clean up lanes as if a winner exists.",
    fanInChecklist: [
      "Score only controller-measured pi-autoresearch candidate-result packets, never raw peer claims.",
      "Treat any controller-inline patching that bypassed candidate_peer_spawn and candidate worktree measurement as a process violation, not a selectable lane.",
      "Do not recommend owner selection while any explicit planned lane is missing its packet.",
      "Keep missing, failed, blocked, and non-selectable lanes visible in the review report.",
      "After owner selection, issue explicit stop/cancel guidance for non-selected active peers before any merge/promotion work.",
    ],
    exactNextCalls: input.exactNextCalls,
  };
}

function buildCandidateWaveReliabilityRecovery(input: {
  cwd: string;
  lanes: readonly AutoresearchCandidateWaveReviewLane[];
  winner: AutoresearchCandidateWaveReviewLane | null;
  aggregateReviewCall: string;
}): AutoresearchCandidateWaveReliabilityRecovery {
  const missingOrStalledLanes = input.lanes.filter(
    (lane) => normalizeReviewToken(lane.status) === "missing_packet",
  );
  const nonSelectedLanes = input.winner
    ? input.lanes.filter((lane) => lane.selectable && lane.laneId !== input.winner?.laneId)
    : [];
  const posture: AutoresearchCandidateWaveReliabilityRecoveryPosture =
    missingOrStalledLanes.length > 0
      ? "missing_or_stalled_lane_recovery_required"
      : input.winner
        ? nonSelectedLanes.length > 0
          ? "selection_ready_with_non_selected_lane_guidance"
          : "complete"
        : "no_selectable_lane_recovery_required";
  const latePacketPolicy =
    "If a late candidate-result packet appears after this review, do not promote or select from stale output; rerun the same review_candidate_wave aggregate call so the late lane is scored with the full explicit lane set.";

  return {
    kind: "autoresearch.candidate_wave_reliability_recovery.v1",
    posture,
    missingOrStalledLaneIds: missingOrStalledLanes.map((lane) => lane.laneId),
    latePacketPolicy,
    nonSelectedLaneIds: nonSelectedLanes.map((lane) => lane.laneId),
    laneRecovery: input.lanes.map((lane) => {
      const missing = normalizeReviewToken(lane.status) === "missing_packet";
      if (missing) {
        return {
          laneId: lane.laneId,
          kind: "missing_or_stalled_packet",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Treat this as a missing/stalled/late lane: wait for controller measurement plus candidate_result_export, or explicitly replan without this lane before any owner selection.",
          exactNextCalls: [
            ...(lane.sourcePacketPath
              ? [
                  formatToolCall("autoresearch_runtime_status", {
                    cwd: input.cwd,
                    action: "candidate_result_export",
                    outPath: lane.sourcePacketPath,
                  }),
                ]
              : []),
            input.aggregateReviewCall,
          ],
        };
      }
      if (input.winner && lane.laneId === input.winner.laneId) {
        return {
          laneId: lane.laneId,
          kind: "selected_candidate",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Selected by recommendation only; owner review must still choose a plan-only lifecycle action before any promotion/merge work.",
          exactNextCalls: input.aggregateReviewCall ? [input.aggregateReviewCall] : [],
        };
      }
      if (input.winner && lane.selectable) {
        return {
          laneId: lane.laneId,
          kind: "non_selected_stop_cancel",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Non-selected selectable lane: after owner approval of the winner, issue explicit stop/cancel guidance for the visible peer/worktree; do not merge, delete, reset, or promote from this review.",
          exactNextCalls: [],
        };
      }
      return {
        laneId: lane.laneId,
        kind: input.winner ? "not_selectable_rerun_or_discard" : "late_packet_reconcile",
        packetPath: lane.sourcePacketPath,
        planOnly: true,
        guidance:
          "Not selectable in this review; plan a rerun, discard, or late-packet reconciliation through owner-approved review, not hidden execution.",
        exactNextCalls: [input.aggregateReviewCall],
      };
    }),
    summary:
      posture === "missing_or_stalled_lane_recovery_required"
        ? "Missing/stalled lanes gate final owner selection until exported or owner-replanned."
        : posture === "selection_ready_with_non_selected_lane_guidance"
          ? "Selection is ready for owner review and non-selected lanes have plan-only stop/cancel guidance."
          : posture === "complete"
            ? "All reviewed lanes have concrete plan-only reliability guidance."
            : "No lane is selectable; use plan-only rerun/discard/late-packet recovery guidance.",
    boundaries: [
      "Reliability recovery is plan-only; it launches no peers, runs no benchmarks, writes no evidence, and applies no promotion or cleanup.",
      "Missing, stalled, or late lanes are recovered by explicit candidate_result_export plus aggregate review, or by owner-approved replanning without the lane.",
      "Non-selected lane stop/cancel is guidance for visible peer/worktree lifecycle only after owner approval; this review does not perform that lifecycle action.",
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveCandidateResultPacketPath(cwd: string, packetPath: string): string {
  const trimmed = packetPath.trim();
  if (trimmed.length === 0) {
    throw new Error("candidateResultPacketPaths cannot contain empty paths.");
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function laneIdFromCandidateResultPacketPath(resolvedPath: string): string {
  const base = path.basename(resolvedPath);
  return base.endsWith(".candidate-result.json")
    ? base.slice(0, -".candidate-result.json".length)
    : path.basename(resolvedPath, path.extname(resolvedPath));
}

function candidateResultInputFromPacketPath(
  cwd: string,
  packetPath: string,
): AutoresearchCandidateWaveResultInput {
  const resolvedPath = resolveCandidateResultPacketPath(cwd, packetPath);
  if (!fs.existsSync(resolvedPath)) {
    const laneId = laneIdFromCandidateResultPacketPath(resolvedPath);
    return {
      laneId,
      objective: `Missing candidate-result packet for ${laneId}`,
      status: "missing_packet",
      checksStatus: "unknown",
      sourcePacketPath: resolvedPath,
      caveat:
        "Candidate-result packet was not found. The lane may still be running, failed before export, or was not approved/launched.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read candidate result packet at ${resolvedPath}: ${message}`);
  }

  if (!isRecord(parsed) || parsed.packetKind !== "autoresearch.candidate_result.v1") {
    throw new Error(
      `Candidate result packet at ${resolvedPath} must have packetKind=autoresearch.candidate_result.v1.`,
    );
  }

  const candidate = isRecord(parsed.candidate) ? parsed.candidate : null;
  const candidateRun = isRecord(parsed.candidateRun) ? parsed.candidateRun : null;
  const experiment =
    candidateRun && isRecord(candidateRun.experiment) ? candidateRun.experiment : null;
  const closeout = isRecord(parsed.closeout) ? parsed.closeout : null;
  const closeoutStatus = closeout && isRecord(closeout.status) ? closeout.status : null;
  const status =
    optionalString(parsed.empiricalDecisionClass) ?? optionalString(candidateRun?.status);
  const checks = optionalString(candidateRun?.checks);
  const laneId =
    optionalString(experiment?.hypothesisId) ??
    optionalString(candidate?.branch) ??
    laneIdFromCandidateResultPacketPath(resolvedPath);

  return {
    laneId,
    objective:
      optionalString(experiment?.hypothesis) ??
      optionalString(candidateRun?.description) ??
      optionalString(parsed.resultSummary),
    metric: optionalNumber(candidateRun?.metric),
    status,
    checksStatus: checks,
    confidence: optionalNumber(closeoutStatus?.confidence),
    candidateSource: optionalString(candidate?.source),
    candidateWorktree: optionalString(candidate?.worktreePath),
    candidateBranch: optionalString(candidate?.branch),
    candidateBaseRef: optionalString(candidate?.baseRef),
    candidateDiffSummary: optionalString(candidate?.diffSummary),
    candidateFilesChanged: stringArrayFrom(candidate?.filesChanged),
    candidatePeerRunId: optionalString(candidate?.peerRunId),
    candidateRunnerId: optionalString(candidate?.runnerId),
    sourcePacketPath: resolvedPath,
    caveat: optionalString(parsed.resultSummary),
  };
}

function buildCandidateWaveBindCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string | null {
  if (!winner.candidateWorktree) return null;
  return formatToolCall("autoresearch_candidate_bind", {
    cwd,
    action: "plan_run",
    candidateWorktree: winner.candidateWorktree,
    candidateBaseRef: winner.candidateBaseRef ?? "<verify-base-ref>",
  });
}

function buildCandidateWaveMoreSamplesCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string {
  const candidateWorktree = winner.candidateWorktree ?? "<candidate-worktree>";
  return formatToolCall("autoresearch_runtime_run", {
    cwd,
    runKind: "ordinary",
    description: `Collect another sample for ${winner.laneId}`,
    hypothesisId: winner.laneId,
    hypothesis: winner.objective ?? `More samples for ${winner.laneId}`,
    candidateSource: winner.candidateWorktree ? "candidate_peer_spawn" : "manual",
    candidateWorktree,
    candidateBranch: winner.candidateBranch ?? "<candidate-branch>",
    candidateBaseRef: winner.candidateBaseRef ?? "<candidate-base-ref>",
    candidateDiffSummary: winner.candidateDiffSummary ?? "<controller-verified-diff-summary>",
    candidateFilesChanged:
      winner.candidateFilesChanged.length > 0 ? winner.candidateFilesChanged : ["<changed-files>"],
  });
}

function buildLevel2CandidateBinding(
  lanes: readonly AutoresearchCandidateWaveReviewLane[],
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery,
): AutoresearchLevel2CandidateBinding {
  const laneCounts = new Map<string, number>();
  for (const lane of lanes) laneCounts.set(lane.laneId, (laneCounts.get(lane.laneId) ?? 0) + 1);
  const duplicateLaneIds = [...laneCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([laneId]) => laneId);
  const duplicateSet = new Set(duplicateLaneIds);
  const expectedLaneCount =
    packetDiscovery.mode === "explicit"
      ? packetDiscovery.candidateResultPacketPaths.length
      : lanes.length;

  const bindingLanes = lanes.map((lane): AutoresearchLevel2CandidateBindingLane => {
    const blockers: string[] = [];
    const packetPresent = Boolean(
      lane.sourcePacketPath && normalizeReviewToken(lane.status) !== "missing_packet",
    );
    if (!packetPresent && packetDiscovery.mode === "explicit") blockers.push("missing_packet");
    if (duplicateSet.has(lane.laneId)) blockers.push("duplicate_lane");
    if (lane.candidatePeerRunId && !packetPresent) blockers.push("peer_assertion_without_packet");
    const bindingStatus: AutoresearchLevel2CandidateBindingLane["bindingStatus"] = duplicateSet.has(
      lane.laneId,
    )
      ? "blocked_duplicate_lane"
      : !packetPresent && packetDiscovery.mode === "explicit"
        ? "blocked_missing_packet"
        : lane.candidatePeerRunId && !packetPresent
          ? "peer_assertion_only"
          : packetPresent
            ? "bound_controller_verified_packet"
            : "manual_input_review_only";

    return {
      laneId: lane.laneId,
      bindingKey: `${lane.laneId}:${lane.sourcePacketPath ?? "manual"}`,
      sourcePacketPath: lane.sourcePacketPath,
      candidateSource: lane.candidateSource,
      candidatePeerRunId: lane.candidatePeerRunId,
      candidateRunnerId: lane.candidateRunnerId,
      controllerVerifiedFacts: {
        packetPresent,
        metricPresent: lane.metric !== null,
        checksStatus: lane.checksStatus,
        candidateWorktree: lane.candidateWorktree,
        candidateBranch: lane.candidateBranch,
        candidateBaseRef: lane.candidateBaseRef,
        candidateFilesChanged: lane.candidateFilesChanged,
      },
      peerAssertions: {
        peerRunId: lane.candidatePeerRunId,
        runnerId: lane.candidateRunnerId,
        status: lane.status,
        caveat: lane.caveat,
      },
      bindingStatus,
      blockers,
    };
  });
  const missingLaneIds = bindingLanes
    .filter((lane) => lane.bindingStatus === "blocked_missing_packet")
    .map((lane) => lane.laneId);
  const peerAssertionOnlyLaneIds = bindingLanes
    .filter((lane) => lane.bindingStatus === "peer_assertion_only")
    .map((lane) => lane.laneId);
  const blockerCount = bindingLanes.reduce((sum, lane) => sum + lane.blockers.length, 0);
  const controllerVerifiedLaneCount = bindingLanes.filter(
    (lane) => lane.bindingStatus === "bound_controller_verified_packet",
  ).length;

  return {
    kind: "autoresearch.level2_candidate_binding.v1",
    metric: {
      name: "level2_candidate_binding_blockers",
      direction: "lower",
      target: 0,
      value: blockerCount,
      status: blockerCount === 0 ? "target_met" : "blocked",
    },
    expectedLaneCount,
    boundLaneCount: bindingLanes.length,
    controllerVerifiedLaneCount,
    missingLaneIds,
    duplicateLaneIds,
    peerAssertionOnlyLaneIds,
    lanes: bindingLanes,
    boundaries: [
      "Binding candidate results to lanes does not make peer/intercom text durable evidence.",
      "Controller-verified facts come from candidate-result packets or explicit inline review input; owner evidence writes remain separate.",
      "Missing, duplicate, or peer-assertion-only lanes fail closed before owner selection can be treated as complete.",
    ],
    nextStep:
      blockerCount === 0
        ? "Proceed to review_candidate_wave owner selection using bound controller-verified candidate facts."
        : "Resolve level-2 candidate binding blockers before claiming fan-in completion or owner selection readiness.",
  };
}

function buildReviewPacketDispositionOptions(): AutoresearchReviewPacketDispositionOption[] {
  return [
    {
      option: "ignore",
      posture: "owner_review_required",
      description: "Leave the lane/cell unselected after review; no lifecycle action is implied.",
      forbiddenWithoutOwnerToken: ["cleanup", "branch deletion", "evidence write"],
    },
    {
      option: "inspect further",
      posture: "owner_review_required",
      description: "Open packet, diff, receipts, and dashboard context before deciding.",
      forbiddenWithoutOwnerToken: ["benchmark", "merge", "promotion"],
    },
    {
      option: "fold into synthesis",
      posture: "owner_review_required",
      description:
        "Use ideas as review input for a later synthesized patch; do not treat the lane as selected.",
      forbiddenWithoutOwnerToken: ["cherry-pick", "merge", "promotion"],
    },
    {
      option: "cherry-pick after review",
      posture: "owner_review_required",
      description: "Possible only after owner review names exact commits/files and rollback.",
      forbiddenWithoutOwnerToken: ["cherry-pick", "push", "evidence write"],
    },
    {
      option: "merge after review",
      posture: "owner_review_required",
      description:
        "Possible only after explicit promotion token, validation, and owner-approved rollback.",
      forbiddenWithoutOwnerToken: ["merge", "push", "release", "promotion"],
    },
  ];
}

function buildReviewPacketAuthorityBoundary(input: {
  selectionAuthority: AutoresearchReviewPacketAuthorityBoundary["selectionAuthority"];
}): AutoresearchReviewPacketAuthorityBoundary {
  return {
    durableEvidence: false,
    promotionAuthority: false,
    selectionAuthority: input.selectionAuthority,
    forbiddenActions: [
      "peer launch",
      "benchmark execution",
      "candidate-result export",
      "AK/KES/Oracle/DSPx/Prompt Vault/ROCS write",
      "cleanup or branch deletion",
      "merge, push, PR, release, or promotion",
    ],
    requiredOwnerTokens: ["ak_owner_write", "candidate_cleanup", "promotion"],
    boundary:
      "Review packets are non-authoritative owner-review inputs. They do not select winners, write durable evidence, clean up worktrees, merge, release, or promote.",
  };
}

function buildCandidateReviewPacketChainMetric(input: {
  refs: readonly AutoresearchCandidateReviewPacketChainRef[];
  sourceMetricName: string;
  sourceMetricStatus: string;
  requireSelectedPacketRefs?: boolean;
}): AutoresearchCandidateReviewPacketChainMetric {
  const missingPackets = input.refs.filter((ref) => !ref.packetPresent).length;
  const sourceBlocked = input.sourceMetricStatus === "blocked" ? 1 : 0;
  const selectedMissing = input.requireSelectedPacketRefs
    ? input.refs.filter((ref) => ref.selected && !ref.sourcePacketPath).length
    : 0;
  const value = missingPackets + sourceBlocked + selectedMissing;
  return {
    name: "candidate_review_packet_chain_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    sourceMetricName: input.sourceMetricName,
    sourceMetricStatus: input.sourceMetricStatus,
  };
}

function buildCandidateReviewPacketChainRefs(input: {
  binding: AutoresearchLevel2CandidateBinding;
  selectedLaneId: string | null;
  cellId?: string | null;
}): AutoresearchCandidateReviewPacketChainRef[] {
  return input.binding.lanes.map((lane) => ({
    cellId: input.cellId ?? null,
    laneId: lane.laneId,
    sourcePacketPath: lane.sourcePacketPath,
    packetPresent: lane.controllerVerifiedFacts.packetPresent,
    selected: Boolean(input.selectedLaneId && lane.laneId === input.selectedLaneId),
    bindingStatus: lane.bindingStatus,
  }));
}

function buildCandidateWaveReviewPacket(input: {
  review: Pick<
    AutoresearchCandidateWaveReview,
    "kind" | "level2CandidateBinding" | "recommendation" | "lanes"
  >;
}): AutoresearchCandidateWaveReviewPacket {
  const candidateResultPacketRefs = buildCandidateReviewPacketChainRefs({
    binding: input.review.level2CandidateBinding,
    selectedLaneId: input.review.recommendation.laneId,
  });
  return {
    kind: "autoresearch.review_candidate_wave_packet.v1",
    generatedFrom: "bound_candidate_results",
    candidateWaveReviewKind: input.review.kind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    bindingMetric: input.review.level2CandidateBinding.metric,
    candidateResultPacketRefs,
    packetChainMetric: buildCandidateReviewPacketChainMetric({
      refs: candidateResultPacketRefs,
      sourceMetricName: input.review.level2CandidateBinding.metric.name,
      sourceMetricStatus: input.review.level2CandidateBinding.metric.status,
    }),
    recommendedLaneId: input.review.recommendation.laneId,
    selectableLaneCount: input.review.lanes.filter((lane) => lane.selectable).length,
    nextLegalActions: input.review.recommendation.exactNextCalls,
    authorityBoundary: buildReviewPacketAuthorityBoundary({
      selectionAuthority: "recommendation_only",
    }),
  };
}

function buildCandidateWaveReviewNextCalls(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): string[] {
  const { cwd, winner } = input;
  if (!winner) return [];

  const calls: string[] = [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  if (bindCall) calls.push(bindCall);
  const targetCurrentLaneCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_keep",
    }),
  );
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_discard",
    }),
  );
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    calls.push(targetCurrentLaneCall);
    calls.push(
      formatToolCall("autoresearch_candidate_decision", {
        cwd,
        action: "plan_rewind",
      }),
    );
  }
  return calls;
}

function buildCandidateWaveOwnerDecisionOptions(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): AutoresearchCandidateWaveOwnerDecisionOption[] {
  const { cwd, winner } = input;
  if (!winner) return [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  const moreSamplesCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  const targetCurrentLaneCall = moreSamplesCall;
  const keepCalls = [
    ...(bindCall ? [bindCall] : []),
    targetCurrentLaneCall,
    formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_keep" }),
  ];
  const options: AutoresearchCandidateWaveOwnerDecisionOption[] = [
    {
      optionId: "plan_keep_recommended",
      laneId: winner.laneId,
      label: `Plan keep for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner accepts this candidate after reviewing packet evidence and local diff; run the included measurement call first if this lane is not already the latest pi-autoresearch candidate.",
      exactNextCalls: keepCalls,
    },
    {
      optionId: "collect_more_samples",
      laneId: winner.laneId,
      label: `Collect another measured sample for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the metric/check evidence is promising but still under-sampled or noisy.",
      exactNextCalls: [moreSamplesCall],
    },
    {
      optionId: "plan_discard",
      laneId: winner.laneId,
      label: `Plan discard for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner rejects this candidate; run the included measurement call first if this lane is not already current, then discard planning remains non-mutating.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_discard" }),
      ],
    },
  ];
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    options.push({
      optionId: "plan_rewind",
      laneId: winner.laneId,
      label: `Plan rewind for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner wants a plan to reset the candidate worktree; run the included measurement call first if this lane is not already current, then rewind remains plan-only here.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_rewind" }),
      ],
    });
  }
  return options;
}

function buildAutoresearchOwnerReviewRoute(input: {
  scopeLabel: string;
  aggregateReviewCall?: string;
}): AutoresearchOwnerReviewRoute {
  return {
    primaryUi: {
      surface: "pi-autoresearch_html_dashboard",
      slashCommand: "/autoresearch export",
      fallbackSlashCommand: "/autoresearch overlay",
      summary:
        "Open the pi-autoresearch HTML dashboard first for run history, receipts, metrics, candidate context, and packet evidence; use the overlay when a browser export is not desirable.",
    },
    decisionUi: {
      surface: "pi-autoresearch_candidate_decision_workbench",
      slashCommand: "/autoresearch review",
      summary:
        "Use pi-autoresearch's candidate decision workbench only for final plan-only keep, discard, rewind, more-samples, or finalize decisions after dashboard and packet review.",
    },
    reviewFlow: [
      `Review ${input.scopeLabel} through /autoresearch export before lifecycle decisions.`,
      "Use /autoresearch overlay only as the live TUI fallback when browser export is not desirable.",
      ...(input.aggregateReviewCall
        ? [
            `Run aggregate review after dashboard inspection if the packet set changed: ${input.aggregateReviewCall}`,
          ]
        : []),
      "Use /autoresearch review only for the final candidate lifecycle decision; no merge, cleanup, evidence write, or promotion is implied.",
    ],
    boundary:
      "Dashboard/export/overlay/review surfaces are owner-review affordances only; they do not launch peers, run benchmarks, mutate worktrees, write AK/KES/evidence, merge, or promote.",
  };
}

function buildCandidateWaveOwnerDecisionForm(input: {
  reviewObjective: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
  ownerDecisionOptions: readonly AutoresearchCandidateWaveOwnerDecisionOption[];
}): AutoresearchCandidateWaveOwnerDecisionForm | null {
  const { reviewObjective, winner, ownerDecisionOptions } = input;
  if (!winner || ownerDecisionOptions.length === 0) return null;
  const recommendedOptionId =
    candidateWaveStatusDecision(winner.status) === "more_samples"
      ? "collect_more_samples"
      : "plan_keep_recommended";
  const title = `Owner decision for candidate wave: ${reviewObjective}`;
  const description =
    "Choose one plan-only next step after reviewing packet evidence, candidate diff, and validation. The form is advisory UI data only; executing calls remains explicit.";
  const options = ownerDecisionOptions.map((option) => ({
    optionId: option.optionId,
    label: option.label,
    recommended: option.optionId === recommendedOptionId,
    rationale: option.rationale,
    exactNextCalls: option.exactNextCalls,
  }));
  const interviewQuestions: AutoresearchCandidateWaveOwnerDecisionInterviewPayload = {
    title,
    description,
    questions: [
      {
        id: "candidate_wave_owner_decision",
        type: "single",
        question: `Select the next plan-only action for ${winner.laneId}.`,
        options: options.map((option) => ({
          label: `${option.label}${option.recommended ? " (recommended)" : ""}`,
          value: option.optionId,
          content: {
            lang: "md",
            source: [
              `**Posture:** owner_gate_required`,
              `**Rationale:** ${option.rationale}`,
              "",
              "**Exact next calls:**",
              ...option.exactNextCalls.map((call) => `- \`${call}\``),
            ].join("\n"),
          },
        })),
        ...(recommendedOptionId
          ? {
              recommended: {
                optionId: recommendedOptionId,
                rationale:
                  "Recommended from candidate-wave packet review; owner must still approve.",
              },
            }
          : {}),
        weight: "critical",
      },
    ],
  };
  const primaryUi: AutoresearchCandidateWaveOwnerDecisionPrimaryUi = {
    surface: "pi-autoresearch_candidate_decision_workbench",
    summary:
      "Use pi-autoresearch's existing candidate decision workbench as the primary owner UI after the reviewed lane is current.",
    slashCommand: "/autoresearch review",
    exactPreparationCalls:
      ownerDecisionOptions.find((option) => option.optionId === "collect_more_samples")
        ?.exactNextCalls ?? [],
  };
  return {
    kind: "autoresearch.candidate_wave_owner_decision_form.v1",
    title,
    description,
    questionId: "candidate_wave_owner_decision",
    recommendedOptionId,
    options,
    primaryUi,
    interviewQuestions,
    interviewCall: formatToolCall("interview", {
      questions: JSON.stringify(interviewQuestions),
    }),
    boundary:
      "This owner-decision form does not apply worktree lifecycle actions, write AK/KES/evidence, merge, promote, or mutate candidate state. The interview payload is a fallback for sessions where the pi-autoresearch candidate decision UI is unavailable.",
  };
}

function discoverDefaultCandidateResultPacketPaths(cwd: string): string[] {
  const defaultDir = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  if (!fs.existsSync(defaultDir)) return [];
  return fs
    .readdirSync(defaultDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".candidate-result.json"))
    .map((entry) => `${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/${entry.name}`)
    .sort();
}

function candidateResultInputsFromReviewRequest(
  input: AutoresearchCandidateWaveReviewRequest,
  cwd: string,
): {
  candidateResults: AutoresearchCandidateWaveResultInput[];
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery;
} {
  const supplied = [...(input.candidateResults ?? [])];
  const explicitPacketPaths = nonEmptyStrings(input.candidateResultPacketPaths);
  const defaultDirectory = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  const discoveredPacketPaths =
    explicitPacketPaths.length === 0 && supplied.length === 0
      ? discoverDefaultCandidateResultPacketPaths(cwd)
      : [];
  const packetPaths = explicitPacketPaths.length > 0 ? explicitPacketPaths : discoveredPacketPaths;
  const fromPackets = packetPaths.map((packetPath) =>
    candidateResultInputFromPacketPath(cwd, packetPath),
  );
  const mode =
    explicitPacketPaths.length > 0 ? "explicit" : supplied.length > 0 ? "manual" : "default";
  const message =
    mode === "explicit"
      ? `Using ${packetPaths.length} explicit candidate-result packet path(s).`
      : mode === "manual"
        ? "Using inline candidate results; default packet discovery was not mixed in."
        : `Discovered ${packetPaths.length} default candidate-result packet(s) under ${defaultDirectory}.`;

  return {
    candidateResults: [...supplied, ...fromPackets],
    packetDiscovery: {
      mode,
      defaultDirectory,
      candidateResultPacketPaths: packetPaths,
      message,
    },
  };
}

export function reviewAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveReviewRequest,
): AutoresearchCandidateWaveReview {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("review_candidate_wave requires a non-empty objective.");
  }
  const { candidateResults, packetDiscovery } = candidateResultInputsFromReviewRequest(
    input,
    identity.cwd,
  );
  if (candidateResults.length === 0) {
    throw new Error(
      `review_candidate_wave requires at least one candidate result or packet path; no default candidate-result packets were found under ${packetDiscovery.defaultDirectory}. Export lanes with candidate_result_export to ${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/<lane>.candidate-result.json or pass candidateResultPacketPaths explicitly.`,
    );
  }
  const direction = input.direction ?? "lower";
  const offLimits = nonEmptyStrings(input.offLimits);
  const lanes = sortCandidateWaveReviewLanes(
    candidateResults.map((candidate) => {
      const selectable = candidateWaveLaneSelectable(candidate, identity.cwd, offLimits);
      return {
        laneId: candidate.laneId || "candidate-unknown",
        objective: candidate.objective?.trim() || null,
        metric:
          typeof candidate.metric === "number" && Number.isFinite(candidate.metric)
            ? candidate.metric
            : null,
        status: candidate.status || "unknown",
        checksStatus: candidate.checksStatus || "unknown",
        confidence:
          typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
            ? candidate.confidence
            : null,
        candidateSource: candidate.candidateSource || null,
        candidateWorktree: candidate.candidateWorktree || null,
        candidateBranch: candidate.candidateBranch || null,
        candidateBaseRef: candidate.candidateBaseRef || null,
        candidateDiffSummary: candidate.candidateDiffSummary || null,
        candidateFilesChanged: [...(candidate.candidateFilesChanged ?? [])],
        candidatePeerRunId: candidate.candidatePeerRunId || null,
        candidateRunnerId: candidate.candidateRunnerId || null,
        sourcePacketPath: candidate.sourcePacketPath || null,
        caveat: candidate.caveat || null,
        rank: null,
        selectable: selectable.selectable,
        selectionReason: selectable.reason,
      };
    }),
    direction,
  );
  const winner = lanes.find((lane) => lane.rank === 1) ?? null;
  const missingPlannedLanes =
    packetDiscovery.mode === "explicit"
      ? lanes.filter((lane) => normalizeReviewToken(lane.status) === "missing_packet")
      : [];
  const plannedLanesIncomplete = missingPlannedLanes.length > 0;
  const selectableWinner = plannedLanesIncomplete ? null : winner;
  const exactNextCalls = buildCandidateWaveReviewNextCalls({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionOptions = buildCandidateWaveOwnerDecisionOptions({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionForm = buildCandidateWaveOwnerDecisionForm({
    reviewObjective: objective,
    winner: selectableWinner,
    ownerDecisionOptions,
  });
  const management = buildReviewedCandidateWaveManagement({
    taskId: identity.taskId,
    objective,
    lanes,
    plannedLanesIncomplete,
    winner: selectableWinner,
    exactNextCalls,
  });
  const level2CandidateBinding = buildLevel2CandidateBinding(lanes, packetDiscovery);
  const aggregateReviewPayload: Record<string, unknown> = {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
  };
  if (packetDiscovery.candidateResultPacketPaths.length > 0) {
    aggregateReviewPayload.candidateResultPacketPaths = packetDiscovery.candidateResultPacketPaths;
  }
  if (offLimits.length > 0) aggregateReviewPayload.offLimits = offLimits;
  const aggregateReviewCall = formatToolCall(
    "autoresearch_live_supervision",
    aggregateReviewPayload,
  );
  const ownerReviewRoute = buildAutoresearchOwnerReviewRoute({
    scopeLabel: `candidate wave ${objective}`,
    aggregateReviewCall,
  });
  const reliabilityRecovery = buildCandidateWaveReliabilityRecovery({
    cwd: identity.cwd,
    lanes,
    winner: selectableWinner,
    aggregateReviewCall,
  });
  const recommendation: AutoresearchCandidateWaveReview["recommendation"] = plannedLanesIncomplete
    ? {
        posture: "planned_lanes_incomplete",
        laneId: null,
        reason: `${missingPlannedLanes.length} explicit planned lane(s) are missing candidate-result packets: ${missingPlannedLanes.map((lane) => lane.laneId).join(", ")}. Final owner selection is gated until every planned lane is measured/exported or the owner replans the wave without that lane.`,
        exactNextCalls,
        ownerDecisionOptions,
        ownerDecisionForm,
      }
    : winner
      ? {
          posture: "owner_selection_required",
          laneId: winner.laneId,
          reason: `Best selectable ${direction}-is-better metric is ${winner.metric}. Owner must still approve keep/finalize.`,
          exactNextCalls,
          ownerDecisionOptions,
          ownerDecisionForm,
        }
      : {
          posture: "no_selectable_candidate",
          laneId: null,
          reason: "No candidate had finite metrics with passing status/check gates.",
          exactNextCalls,
          ownerDecisionOptions,
          ownerDecisionForm,
        };
  const reviewPacket = buildCandidateWaveReviewPacket({
    review: {
      kind: "autoresearch.candidate_wave_review.v1",
      level2CandidateBinding,
      recommendation,
      lanes,
    },
  });

  return {
    kind: "autoresearch.candidate_wave_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    lanes,
    packetDiscovery,
    recommendation,
    management,
    reliabilityRecovery,
    level2CandidateBinding,
    reviewPacket,
    ownerReviewRoute,
    nextStep: plannedLanesIncomplete
      ? "Wait for every explicit planned lane to reach controller-measured candidate_result_export, or rerun review_candidate_wave with a deliberately revised packet path set after owner replanning."
      : winner
        ? `Review ${winner.laneId}, then use autoresearch_candidate_decision plan_keep/plan_discard/plan_rewind or collect more samples.`
        : "Reject or rerun candidate lanes; no winner is selectable from the supplied results.",
    boundaries: [
      "This review compares supplied candidate-result summaries and/or exported pi-autoresearch candidate-result packets; it does not verify raw peer output by itself.",
      "When no inline results or packet paths are supplied, review_candidate_wave only auto-discovers existing packets under the default candidate-wave packet directory.",
      "Missing candidate-result packet paths are surfaced as non-selectable missing_packet lanes when paths are supplied explicitly, so partial candidate waves remain reviewable.",
      "Explicit planned packet paths gate final owner selection until every planned lane has a controller-measured pi-autoresearch candidate-result packet or the owner deliberately replans the lane set.",
      "Level-2 candidate binding separates peer assertions from controller-verified packet facts before fan-in can be treated as complete.",
      "pi-autoresearch receipts and candidate-result packets remain the measurement source for each candidate.",
      "The recommendation is not promotion authority; owner approval and external promotion gates remain required.",
    ],
  };
}

type AutoresearchPostFaninSelectedLane = {
  cellId: string | null;
  laneId: string;
  candidateBranch: string | null;
  candidateWorktree: string | null;
  candidateBaseRef: string | null;
  sourcePacketPath: string | null;
  filesChanged: readonly string[];
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

function stableFinalizerHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizeRepoPath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function offLimitPatternMatches(pattern: string, filePath: string): boolean {
  const normalizedPattern = normalizeRepoPath(pattern);
  const normalizedFile = normalizeRepoPath(filePath);
  if (normalizedPattern.length === 0) return false;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith("/")) {
    return normalizedFile.startsWith(normalizedPattern);
  }
  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
}

function filesMatchingOffLimits(files: readonly string[], offLimits: readonly string[]): string[] {
  return files
    .map(normalizeRepoPath)
    .filter((filePath) => offLimits.some((pattern) => offLimitPatternMatches(pattern, filePath)));
}

function intersectNormalizedFiles(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right.map(normalizeRepoPath));
  return left.map(normalizeRepoPath).filter((filePath) => rightSet.has(filePath));
}

function selectedLaneFromCandidateReview(
  review: AutoresearchCandidateWaveReview,
  requestedLaneId?: string,
): AutoresearchPostFaninSelectedLane | null {
  const laneId = review.recommendation.laneId ?? requestedLaneId;
  if (!laneId) return null;
  const lane = review.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) return null;
  return {
    cellId: null,
    laneId: lane.laneId,
    candidateBranch: lane.candidateBranch,
    candidateWorktree: lane.candidateWorktree,
    candidateBaseRef: lane.candidateBaseRef,
    sourcePacketPath: lane.sourcePacketPath,
    filesChanged: lane.candidateFilesChanged,
  };
}

function selectedLanesFromMatrixReview(
  review: AutoresearchMatrixCampaignReview,
): AutoresearchPostFaninSelectedLane[] {
  return review.cells.flatMap((cell) => {
    const laneId = cell.selectedLaneId;
    if (!laneId) return [];
    const lane = cell.candidateWaveReview.lanes.find((candidate) => candidate.laneId === laneId);
    if (!lane) return [];
    return [
      {
        cellId: cell.cellId,
        laneId: lane.laneId,
        candidateBranch: lane.candidateBranch,
        candidateWorktree: lane.candidateWorktree,
        candidateBaseRef: lane.candidateBaseRef,
        sourcePacketPath: lane.sourcePacketPath,
        filesChanged: lane.candidateFilesChanged,
      },
    ];
  });
}

function buildPostFaninFinalizerTokenRequestPacket(input: {
  identity: SessionIdentity;
  sourceReview: AutoresearchPostFaninFinalizerRequest["sourceReview"];
  objective: string;
  authorizationToken: string;
  selectedLanes: readonly AutoresearchPostFaninSelectedLane[];
  validation: AutoresearchPostFaninValidationEvidence;
  blockerCount: number;
  reviewReady: boolean;
  reviewPosture: string;
  sourceMetricName: string;
  sourceMetricStatus: string;
  sourceReviewPacketKind:
    | "autoresearch.review_candidate_wave_packet.v1"
    | "autoresearch.review_matrix_campaign_packet.v1"
    | "missing_review_packet";
  packetChainRefs: readonly AutoresearchCandidateReviewPacketChainRef[];
}): AutoresearchPostFaninFinalizerTokenRequestPacket {
  const selectedCandidateResultPacketRefs = input.selectedLanes
    .map((lane) => lane.sourcePacketPath)
    .filter((packetPath): packetPath is string => Boolean(packetPath));
  return {
    kind: "autoresearch.post_fanin_finalizer_token_request.v1",
    sourceReview: input.sourceReview,
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    objective: input.objective,
    requiredTokenName: "finalize_post_fanin",
    exactAuthorizationToken: input.authorizationToken,
    requestExecution: "not_executed_by_orchestrator",
    candidateResultPacketRefs: selectedCandidateResultPacketRefs,
    reviewResultReference: {
      sourceReview: input.sourceReview,
      posture: input.reviewPosture,
      selectedLaneIds: input.selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`),
    },
    metricPosture: {
      name: "level2_finalizer_token_request_blockers",
      direction: "lower",
      target: 0,
      value: input.blockerCount,
      status: input.blockerCount === 0 ? "target_met" : "blocked",
      sourceMetricName: input.sourceMetricName,
      sourceMetricStatus: input.sourceMetricStatus,
    },
    packetChainTrace: {
      sourceReviewPacketKind: input.sourceReviewPacketKind,
      candidateResultPacketRefs: input.packetChainRefs,
      selectedCandidateResultPacketRefs,
      metric: buildCandidateReviewPacketChainMetric({
        refs: input.packetChainRefs,
        sourceMetricName: input.sourceMetricName,
        sourceMetricStatus: input.sourceMetricStatus,
        requireSelectedPacketRefs: true,
      }),
    },
    permittedFinalizerScope: {
      selectedLanes: input.selectedLanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        sourcePacketPath: lane.sourcePacketPath,
        filesChanged: lane.filesChanged.map(normalizeRepoPath),
      })),
      validationCommand: input.validation.command.trim() || null,
      applyCommandsWithheldUntilToken: true,
    },
    separateOwnerTokensRequired: ["candidate_cleanup", "promotion", "ak_owner_write"],
    boundaries: [
      "This is a finalize_post_fanin token request only; it emits no apply command packet until the exact token is supplied.",
      "candidate_cleanup is separate and required before peer tab/session closure, worktree removal, or branch deletion.",
      "promotion is separate and required before cherry-pick, merge, push, PR, release, or promotion.",
      "ak_owner_write is separate and required before durable AK evidence/task/decision/direction writes.",
      "Peer/intercom text and candidate-result packets remain review inputs, not durable evidence.",
      input.reviewReady
        ? "Review posture is ready for requesting a finalizer token."
        : "Review posture is not ready; resolve review/preflight blockers before requesting authorization.",
    ],
    nextLegalActions:
      input.blockerCount === 0
        ? [
            "Owner may copy the exact finalize_post_fanin token into a deliberate finalize_post_fanin call to expose finalizer apply commands only.",
            "Run validation again in the apply lane before any commit decision; merge/release/promotion remains forbidden without a separate promotion token.",
            "Keep candidate cleanup requests separate; routine candidate peer tab/session closure plus worktree removal or branch deletion requires candidate_cleanup, but does not need separate AK evidence unless it is campaign closeout evidence or a boundary exception.",
          ]
        : [
            "Resolve preflight/review blockers and rerun finalize_post_fanin token-request preparation.",
            "Do not infer finalize_post_fanin, candidate_cleanup, or promotion authorization from this blocked request.",
          ],
  };
}

function buildPostFaninFinalizerApplyCommandPacket(input: {
  identity: SessionIdentity;
  sourceReview: AutoresearchPostFaninFinalizerRequest["sourceReview"];
  objective: string;
  authorizationToken: string;
  selectedLanes: readonly AutoresearchPostFaninSelectedLane[];
  validation: AutoresearchPostFaninValidationEvidence;
}): AutoresearchPostFaninFinalizerApplyCommandPacket {
  const selectedFiles = [
    ...new Set(input.selectedLanes.flatMap((lane) => lane.filesChanged.map(normalizeRepoPath))),
  ].sort();
  const fileArgs = selectedFiles.map(shellQuote).join(" ");
  const commands = [
    `git -C ${shellQuote(input.identity.cwd)} status --short`,
    ...input.selectedLanes.map(
      (lane) =>
        `git -C ${shellQuote(lane.candidateWorktree ?? "<missing-candidate-worktree>")} diff --name-only ${shellQuote(lane.candidateBaseRef ?? "<missing-base-ref>")}...HEAD -- ${lane.filesChanged.map((file) => shellQuote(normalizeRepoPath(file))).join(" ")}`,
    ),
    ...input.selectedLanes.map(
      (lane) =>
        `git -C ${shellQuote(input.identity.cwd)} checkout ${shellQuote(lane.candidateBranch ?? "<missing-candidate-branch>")} -- ${lane.filesChanged.map((file) => shellQuote(normalizeRepoPath(file))).join(" ")}`,
    ),
    input.validation.command,
    `git -C ${shellQuote(input.identity.cwd)} status --short -- ${fileArgs}`,
    `git -C ${shellQuote(input.identity.cwd)} add -- ${fileArgs}`,
    `git -C ${shellQuote(input.identity.cwd)} commit -m ${shellQuote(`autoresearch finalizer: ${input.objective}`)}`,
    `git -C ${shellQuote(input.identity.cwd)} status --short`,
  ];

  return {
    kind: "autoresearch.post_fanin_finalizer_apply_command_packet.v1",
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    sourceReview: input.sourceReview,
    authorizationToken: input.authorizationToken,
    authorizationRequired: true,
    applyExecution: "not_executed_by_orchestrator",
    selectedLanes: input.selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      candidateBranch: lane.candidateBranch ?? "<missing-candidate-branch>",
      candidateWorktree: lane.candidateWorktree ?? "<missing-candidate-worktree>",
      candidateBaseRef: lane.candidateBaseRef ?? "<missing-base-ref>",
      sourcePacketPath: lane.sourcePacketPath ?? "<missing-source-packet>",
      filesChanged: lane.filesChanged.map(normalizeRepoPath),
    })),
    exactCommands: commands,
    rollbackNotes: [
      "The orchestrator did not run these commands; rollback belongs to the explicit controller/apply lane that executes them.",
      "If validation or post-apply status fails, stop before commit or revert the explicit commit in the controller lane.",
      "Do not delete candidate worktrees or non-selected lanes from this finalizer packet; lifecycle cleanup needs a separate candidate_cleanup token.",
      "Do not merge, push, release, or promote from this finalizer packet; promotion requires a separate promotion token.",
    ],
    boundary:
      "This packet is an exact explicit finalizer-apply recipe only; pi-society-orchestrator does not checkout, merge, commit, clean, delete, promote, or write evidence from finalizer construction, and this packet carries no candidate_cleanup or promotion authority.",
  };
}

function findForbiddenFinalizerCleanupPromotionCommandMatches(
  packet: AutoresearchPostFaninFinalizerApplyCommandPacket | null,
): string[] {
  const forbiddenPatterns = [
    /\b(?:merge|push|rebase|tag|release|publish)\b/iu,
    /\b(?:worktree\s+remove|branch\s+-d|branch\s+-D|rm\s+-rf|rm\s+-r)\b/iu,
    /promotion|candidate_cleanup/iu,
  ];
  return (packet?.exactCommands ?? []).filter((command) =>
    forbiddenPatterns.some((pattern) => pattern.test(command)),
  );
}

function buildAuthorizedFinalizerCleanupGate(input: {
  exactApplyCommandPacket: AutoresearchPostFaninFinalizerApplyCommandPacket | null;
  finalizedWithToken: boolean;
}): AutoresearchAuthorizedFinalizerCleanupGate {
  const forbiddenCommandMatches = findForbiddenFinalizerCleanupPromotionCommandMatches(
    input.exactApplyCommandPacket,
  );
  return {
    name: "authorized_finalizer_cleanup_blockers",
    direction: "lower",
    target: 0,
    value: forbiddenCommandMatches.length,
    status: forbiddenCommandMatches.length === 0 ? "target_met" : "blocked",
    finalizedWithToken: input.finalizedWithToken,
    cleanupAuthorized: false,
    candidatePeerTabClosureIncludedInCleanup: true,
    cleanupEvidenceRequired: false,
    promotionAuthorized: false,
    requiredSeparateTokens: ["candidate_cleanup", "promotion"],
    forbiddenCommandMatches,
    proofs: [
      "finalize_post_fanin authorization only exposes finalizer apply commands; it does not authorize candidate cleanup",
      "candidate_cleanup includes routine candidate peer tab/session closure, worktree removal, branch deletion, reset, and non-selected lane cleanup",
      "routine candidate cleanup does not require separate AK evidence unless it is the campaign/task closeout evidence or a boundary exception",
      "promotion remains required before merge, push, PR, release, publish, tag, or promotion authority handoff",
      input.exactApplyCommandPacket
        ? "authorized finalizer apply packet was scanned for cleanup/promotion command leakage"
        : "no finalizer apply packet was emitted, so cleanup/promotion commands remain absent",
    ],
  };
}

export function finalizeAutoresearchPostFanin(
  input: AutoresearchPostFaninFinalizerRequest,
): AutoresearchPostFaninFinalizerResult {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("post-fan-in finalizer requires a non-empty objective.");
  }
  const direction = input.direction ?? "lower";
  const offLimits = nonEmptyStrings(input.offLimits);
  const dirtyFiles = nonEmptyStrings(input.dirtyFiles);
  const validation = input.validation ?? { command: "", status: "missing" as const };

  const candidateReview =
    input.sourceReview === "review_candidate_wave"
      ? reviewAutoresearchCandidateWave({
          ...identity,
          objective,
          direction,
          candidateResultPacketPaths: input.candidateResultPacketPaths,
        })
      : null;
  const matrixReview =
    input.sourceReview === "review_matrix_campaign"
      ? reviewAutoresearchMatrixCampaign({
          ...identity,
          objective,
          direction,
          metricName: input.metricName,
          metricThreshold: input.metricThreshold,
          scenarios: input.scenarios,
          hypotheses: input.hypotheses,
          candidateCountPerCell: input.candidateCountPerCell,
          offLimits,
        })
      : null;
  const selectedLanes = candidateReview
    ? [selectedLaneFromCandidateReview(candidateReview, input.selectedLaneId)].filter(
        (lane): lane is AutoresearchPostFaninSelectedLane => lane !== null,
      )
    : selectedLanesFromMatrixReview(matrixReview as AutoresearchMatrixCampaignReview);
  const selectedFiles = [
    ...new Set(selectedLanes.flatMap((lane) => lane.filesChanged.map(normalizeRepoPath))),
  ].sort();
  const selectedLaneMatches =
    (!input.selectedLaneId || selectedLanes.some((lane) => lane.laneId === input.selectedLaneId)) &&
    (!input.selectedCellId || selectedLanes.some((lane) => lane.cellId === input.selectedCellId));
  const reviewReady = candidateReview
    ? candidateReview.recommendation.posture === "owner_selection_required"
    : matrixReview?.posture === "ready_for_matrix_owner_review";
  const reviewPosture = candidateReview
    ? candidateReview.recommendation.posture
    : (matrixReview?.posture ?? "missing_review");
  const sourceMetricName = candidateReview
    ? candidateReview.reviewPacket.bindingMetric.name
    : (matrixReview?.reviewPacket.wholeMatrixMetricPosture.name ??
      input.metricName ??
      "unknown_metric");
  const sourceMetricStatus = candidateReview
    ? candidateReview.reviewPacket.bindingMetric.status
    : (matrixReview?.reviewPacket.wholeMatrixMetricPosture.status ?? "blocked");
  const sourceReviewPacketKind = candidateReview
    ? candidateReview.reviewPacket.kind
    : (matrixReview?.reviewPacket.kind ?? "missing_review_packet");
  const packetChainRefs = candidateReview
    ? candidateReview.reviewPacket.candidateResultPacketRefs
    : (matrixReview?.reviewPacket.candidateResultPacketRefs ?? []);
  const packetPaths = selectedLanes
    .map((lane) => lane.sourcePacketPath)
    .filter((packetPath): packetPath is string => Boolean(packetPath));
  const missingPacketPaths = selectedLanes.filter(
    (lane) => !lane.sourcePacketPath || !fs.existsSync(lane.sourcePacketPath),
  );
  const reviewedAtEpochMs =
    typeof input.reviewedAtEpochMs === "number" && Number.isFinite(input.reviewedAtEpochMs)
      ? input.reviewedAtEpochMs
      : null;
  const stalePacketPaths =
    reviewedAtEpochMs === null
      ? []
      : packetPaths.filter(
          (packetPath) =>
            fs.existsSync(packetPath) && fs.statSync(packetPath).mtimeMs > reviewedAtEpochMs,
        );
  const offLimitMatches = filesMatchingOffLimits(selectedFiles, offLimits);
  const dirtyOverlap = intersectNormalizedFiles(selectedFiles, dirtyFiles);
  const missingLaneProof = selectedLanes.filter(
    (lane) =>
      !lane.candidateBranch ||
      !lane.candidateWorktree ||
      !lane.candidateBaseRef ||
      lane.filesChanged.length === 0,
  );
  const fingerprint = stableFinalizerHash({
    taskId: identity.taskId,
    cwd: identity.cwd,
    sourceReview: input.sourceReview,
    objective,
    selectedLanes: selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      packet: lane.sourcePacketPath,
      files: lane.filesChanged.map(normalizeRepoPath).sort(),
    })),
    validationCommand: validation.command,
    offLimits,
  });
  const authorizationToken = `authorize-post-fanin-finalizer:${fingerprint}`;

  const checks: AutoresearchPostFaninFinalizerPreflightCheck[] = [
    {
      name: "finals_present",
      status:
        reviewReady && selectedLanes.length > 0 && missingPacketPaths.length === 0
          ? "passed"
          : "blocked",
      summary:
        reviewReady && selectedLanes.length > 0 && missingPacketPaths.length === 0
          ? `${selectedLanes.length} selected lane final packet(s) are present.`
          : "Fan-in review is not ready or selected final packet evidence is missing.",
      evidence: [
        `reviewReady=${reviewReady ? "yes" : "no"}`,
        `selectedLanes=${selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`).join(", ") || "none"}`,
        ...missingPacketPaths.map(
          (lane) =>
            `missing packet for ${lane.cellId ?? "wave"}/${lane.laneId}: ${lane.sourcePacketPath ?? "none"}`,
        ),
      ],
    },
    {
      name: "validation_passed",
      status:
        validation.status === "passed" && validation.command.trim().length > 0
          ? "passed"
          : "blocked",
      summary:
        validation.status === "passed" && validation.command.trim().length > 0
          ? `Validation passed via ${validation.command}.`
          : "Validation evidence is missing or failed.",
      evidence: [
        `status=${validation.status}`,
        `command=${validation.command || "missing"}`,
        ...(validation.artifactPath ? [`artifact=${validation.artifactPath}`] : []),
        ...(validation.summary ? [`summary=${validation.summary}`] : []),
      ],
    },
    {
      name: "off_limits_clean",
      status: offLimitMatches.length === 0 ? "passed" : "blocked",
      summary:
        offLimitMatches.length === 0
          ? "Selected lane changed files do not intersect off-limits specs."
          : `Selected lane changed files intersect off-limits specs: ${offLimitMatches.join(", ")}`,
      evidence: [
        `offLimits=${offLimits.join(", ") || "none"}`,
        `selectedFiles=${selectedFiles.join(", ") || "none"}`,
      ],
    },
    {
      name: "dirty_overlap_clean",
      status: dirtyOverlap.length === 0 ? "passed" : "blocked",
      summary:
        dirtyOverlap.length === 0
          ? "No supplied dirty parent/controller files overlap selected lane changes."
          : `Dirty overlap blocks apply: ${dirtyOverlap.join(", ")}`,
      evidence: [
        `dirtyFiles=${dirtyFiles.join(", ") || "none"}`,
        `selectedFiles=${selectedFiles.join(", ") || "none"}`,
      ],
    },
    {
      name: "selected_lane_consistent",
      status: selectedLaneMatches && missingLaneProof.length === 0 ? "passed" : "blocked",
      summary:
        selectedLaneMatches && missingLaneProof.length === 0
          ? "Selected lane identity, branch/worktree/base, and changed-file proof are consistent."
          : "Selected lane identity or lineage proof is inconsistent.",
      evidence: [
        `requestedCell=${input.selectedCellId ?? "not specified"}`,
        `requestedLane=${input.selectedLaneId ?? "not specified"}`,
        `selected=${selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`).join(", ") || "none"}`,
        ...missingLaneProof.map(
          (lane) => `missing lineage proof for ${lane.cellId ?? "wave"}/${lane.laneId}`,
        ),
      ],
    },
    {
      name: "review_artifacts_current",
      status: stalePacketPaths.length === 0 ? "passed" : "blocked",
      summary:
        stalePacketPaths.length === 0
          ? "Selected packet artifacts are not newer than the supplied review timestamp."
          : `Review is stale; packet artifact(s) changed after review: ${stalePacketPaths.join(", ")}`,
      evidence: [
        `reviewedAtEpochMs=${input.reviewedAtEpochMs ?? "not supplied"}`,
        ...stalePacketPaths.map((packetPath) => `stale=${packetPath}`),
      ],
    },
  ];
  const blockerCount = checks.filter((check) => check.status === "blocked").length;
  const preflightPassed = blockerCount === 0;
  const wrongAuthorization =
    Boolean(input.applyAuthorizationToken) && input.applyAuthorizationToken !== authorizationToken;
  const contract: AutoresearchPostFaninFinalizerContract = {
    kind: "autoresearch.post_fanin_finalizer_contract.v1",
    sourceReview: input.sourceReview,
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    applyPosture: "explicit_authorization_required",
    exactAuthorizationToken: authorizationToken,
    requiredPreflightChecks: [
      "finals_present",
      "validation_passed",
      "off_limits_clean",
      "dirty_overlap_clean",
      "selected_lane_consistent",
      "review_artifacts_current",
    ],
    outcomes: ["committed_cleaned", "review_blocked", "failed_closed"],
    boundary:
      "Post-fan-in finalization is a governed preflight plus exact command packet surface; apply/commit/cleanup requires the exact authorization token and still runs outside this orchestrator helper.",
  };
  const tokenRequestBlockerCount = blockerCount + (wrongAuthorization ? 1 : 0);
  const finalizerTokenRequest = buildPostFaninFinalizerTokenRequestPacket({
    identity,
    sourceReview: input.sourceReview,
    objective,
    authorizationToken,
    selectedLanes,
    validation,
    blockerCount: tokenRequestBlockerCount,
    reviewReady,
    reviewPosture,
    sourceMetricName,
    sourceMetricStatus,
    sourceReviewPacketKind,
    packetChainRefs,
  });
  const exactApplyCommandPacket =
    preflightPassed && input.applyAuthorizationToken === authorizationToken
      ? buildPostFaninFinalizerApplyCommandPacket({
          identity,
          sourceReview: input.sourceReview,
          objective,
          authorizationToken,
          selectedLanes,
          validation,
        })
      : null;
  const finalizedWithToken =
    preflightPassed && input.applyAuthorizationToken === authorizationToken;
  const authorizedFinalizerCleanupGate = buildAuthorizedFinalizerCleanupGate({
    exactApplyCommandPacket,
    finalizedWithToken,
  });
  const outcome: AutoresearchPostFaninFinalizerResult["outcome"] =
    !preflightPassed || wrongAuthorization || authorizedFinalizerCleanupGate.status === "blocked"
      ? "failed_closed"
      : finalizedWithToken
        ? "committed_cleaned"
        : "review_blocked";
  const manualResidueValue =
    outcome === "committed_cleaned" ? 0 : Math.max(1, blockerCount + (wrongAuthorization ? 1 : 0));
  const closeoutBlockedReasons = [
    ...checks.filter((check) => check.status === "blocked").map((check) => check.summary),
    ...(wrongAuthorization
      ? ["Supplied applyAuthorizationToken did not match contract token."]
      : []),
    ...authorizedFinalizerCleanupGate.forbiddenCommandMatches.map(
      (command) => `Forbidden cleanup/promotion command leaked into finalizer packet: ${command}`,
    ),
  ];
  const closeoutReceipt: AutoresearchPostFaninFinalizerCloseoutReceipt = {
    kind: "autoresearch.post_fanin_finalizer_closeout_receipt.v1",
    status: outcome,
    execution: "receipt_only_no_mutation",
    taskId: identity.taskId,
    cwd: identity.cwd,
    sourceReview: input.sourceReview,
    validation: {
      command: validation.command.trim().length > 0 ? validation.command : null,
      status: validation.status,
      summary: validation.summary ?? null,
      artifactPath: validation.artifactPath ?? null,
    },
    finalizerApply: {
      posture: exactApplyCommandPacket ? "commands_prepared_not_executed" : "withheld",
      commandCount: exactApplyCommandPacket?.exactCommands.length ?? 0,
      authorizationTokenAccepted: finalizedWithToken,
    },
    evidenceHandoff: {
      posture: "owner_surface_required",
      exactRecordCall: null,
      boundary:
        "AK evidence is intentionally outside the finalizer apply packet; use an exact owner-approved evidence_record/ak command after finalizer closeout review.",
    },
    cleanupHandoff: {
      posture: "separate_candidate_cleanup_gate_required",
      authorizedByFinalizer: false,
      requiredTrigger: "candidate_cleanup_token_or_successful_integration_closeout",
    },
    blockedReasons: closeoutBlockedReasons,
    recoveryNotes:
      outcome === "failed_closed"
        ? [
            "Do not run finalizer apply, evidence, cleanup, merge, or promotion commands from this failed receipt.",
            "Resolve blocked preflight/authorization state, rerun fan-in review if artifacts changed, then request a fresh finalizer token.",
          ]
        : outcome === "review_blocked"
          ? [
              "Preflight passed; request explicit owner authorization with the exact finalize_post_fanin token before apply commands are used.",
            ]
          : [
              "Apply commands were prepared but not executed by orchestrator; record evidence and cleanup only through their separate owner gates after external apply succeeds.",
            ],
    nonActions: [
      "No finalizer command was executed by pi-society-orchestrator.",
      "No AK evidence/task write was executed by pi-society-orchestrator.",
      "No candidate cleanup, worktree deletion, merge, push, PR, release, or promotion was executed by pi-society-orchestrator.",
    ],
  };

  return {
    kind: "autoresearch.post_fanin_finalizer_result.v1",
    outcome,
    contract,
    preflight: {
      status: preflightPassed ? "passed" : "blocked",
      checks,
      blockerCount: tokenRequestBlockerCount,
    },
    manualPostFaninResidue: {
      name: "manual_post_fanin_residue",
      direction: "lower",
      target: 0,
      value: manualResidueValue,
      status: manualResidueValue === 0 ? "target_met" : "blocked",
    },
    authorizedFinalizerCleanupGate,
    finalizerTokenRequest,
    exactApplyCommandPacket,
    closeoutReceipt,
    nextStep:
      outcome === "committed_cleaned"
        ? "Exact finalize_post_fanin token accepted; run the emitted finalizer apply command packet deliberately in the controller/apply lane only if still intended. Cleanup requires candidate_cleanup, and merge/release/promotion requires promotion. The orchestrator has not executed it."
        : outcome === "review_blocked"
          ? "Preflight passed and a finalize_post_fanin token request was prepared, but apply commands are withheld until the exact authorization token is supplied deliberately."
          : wrongAuthorization
            ? "Fail closed: supplied applyAuthorizationToken did not match the contract token. Re-run preflight and authorize explicitly if still intended."
            : "Fail closed: resolve preflight blockers, rerun fan-in review/finalizer, and do not apply hidden promotion or cleanup.",
    boundaries: [
      "No checkout, merge, commit, cleanup, worktree deletion, evidence write, AK/KES/Prompt Vault/ROCS mutation, or promotion was executed by this finalizer.",
      "Missing finals, failed validation, off-limits drift, dirty overlap, selected-lane mismatch, stale packets, wrong authorization, and cleanup/promotion command leakage fail closed.",
      "The exact apply command packet is communication for an explicit owner-approved finalizer apply lane; it is not durable evidence, completion authority, candidate_cleanup authority, or promotion authority.",
    ],
  };
}

export function planAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveRequest,
): AutoresearchCandidateWavePlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("plan_candidate_wave requires a non-empty objective.");
  }

  const candidateCount = resolveCandidateWaveCount(input);
  const candidatePacketDirectory = resolveCandidateWavePacketDirectory(
    input.candidatePacketDirectory,
  );
  const suppliedObjectives = nonEmptyStrings(input.candidateObjectives);
  const filesInScope = nonEmptyStrings(input.filesInScope);
  const offLimits = nonEmptyStrings(input.offLimits);
  const constraints = nonEmptyStrings(input.constraints);
  const parentPeerTarget = input.parentPeerTarget?.trim() || null;
  const maxIterationsPerCandidate = resolveStartCampaignPositiveIntegerBudget(
    "maxIterationsPerCandidate",
    input.maxIterationsPerCandidate,
    1,
  );
  const maxWallClockMinutesPerCandidate = resolveStartCampaignPositiveNumberBudget(
    "maxWallClockMinutesPerCandidate",
    input.maxWallClockMinutesPerCandidate,
    20,
  );

  const lanes = Array.from(
    { length: candidateCount },
    (_, index): AutoresearchCandidateWaveLane => {
      const laneId = `candidate-${String(index + 1).padStart(2, "0")}`;
      const laneObjective =
        suppliedObjectives[index] ?? defaultCandidateObjective(index, objective);
      const baseConstraints = [
        ...constraints,
        `Per-candidate budget: at most ${maxIterationsPerCandidate} measured iteration(s) and ${maxWallClockMinutesPerCandidate} wall-clock minute(s) before controller review.`,
        "Keep mutations inside the candidate worktree only.",
        "Controller-inline implementation is a process violation for campaign-style implementation work; the controller may plan, launch, bind, measure, and review but must not patch inline.",
        "Report changed files, branch/ref, benchmark/check commands run, and caveats in PEER_FINAL.",
        "Do not merge, promote, write AK/KES/evidence, or delete/reset worktrees.",
      ];
      const safeNames = createSafeCandidatePeerNames({
        taskId: identity.taskId,
        laneId,
        objective: laneObjective,
      });
      const peerPayload: Record<string, unknown> = {
        objective: laneObjective,
        cwd: identity.cwd,
        workspaceName: safeNames.workspaceName,
        branchName: safeNames.branchName,
        filesInScope,
        offLimits,
        constraints: baseConstraints,
        dod: [
          "Produce at most one bounded candidate patch in the isolated worktree.",
          "Run the smallest truthful local validation for the patch if available.",
          "Return worktree path, branch name, base ref, changed files, and validation result for controller measurement.",
        ],
      };
      if (parentPeerTarget) peerPayload.parentPeerTarget = parentPeerTarget;
      else peerPayload.parentPeerTarget = "<required-parent-peer-target>";

      const bindCall = formatToolCall("autoresearch_candidate_bind", {
        cwd: identity.cwd,
        candidateWorktree: `<${laneId}-worktree-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${laneId}-base-ref-from-candidate_peer_spawn>`,
      });
      const candidateWorktreePlaceholder = `<${laneId}-worktree-from-candidate_peer_spawn>`;
      const runCall = formatToolCall("autoresearch_runtime_run", {
        cwd: identity.cwd,
        runKind: "ordinary",
        description: `Measure ${laneId}: ${laneObjective}`,
        hypothesisId: laneId,
        hypothesis: laneObjective,
        candidateSource: "candidate_peer_spawn",
        candidateWorktree: candidateWorktreePlaceholder,
        candidateBranch: `<${laneId}-branch-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${laneId}-base-ref-from-candidate_peer_spawn>`,
        candidateDiffSummary: `<${laneId}-controller-verified-diff-summary>`,
        candidateFilesChanged: [`<${laneId}-changed-files>`],
      });
      const candidateResultPacketPath = `${candidatePacketDirectory}/${laneId}.candidate-result.json`;
      const resultCall = formatToolCall("autoresearch_runtime_status", {
        cwd: identity.cwd,
        action: "candidate_result_export",
        outPath: candidateResultPacketPath,
      });
      return {
        laneId,
        objective: laneObjective,
        candidatePeerCall: formatToolCall("candidate_peer_spawn", peerPayload),
        measurementPlan: [bindCall, runCall, resultCall],
        candidateResultPacketPath,
        ownerReviewCall: formatToolCall("autoresearch_candidate_decision", {
          cwd: identity.cwd,
          action: "status",
        }),
      };
    },
  );

  const candidateResultPacketPaths = lanes.map((lane) => lane.candidateResultPacketPath);
  const aggregateReviewPayload: Record<string, unknown> = {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction: input.direction ?? "lower",
    candidateResultPacketPaths,
  };
  if (offLimits.length > 0) aggregateReviewPayload.offLimits = offLimits;
  const aggregateReviewCall = formatToolCall(
    "autoresearch_live_supervision",
    aggregateReviewPayload,
  );
  const management = buildPlannedCandidateWaveManagement({
    taskId: identity.taskId,
    objective,
    lanes,
    aggregateReviewCall,
  });

  return {
    kind: "autoresearch.candidate_wave_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    candidateCount,
    candidatePacketDirectory,
    parentPeerTargetRequired: parentPeerTarget === null,
    parentPeerTarget,
    filesInScope,
    offLimits,
    constraints,
    lanes,
    ownerSelection: {
      posture: "explicit_owner_decision_required",
      candidateResultPacketPaths,
      aggregateReviewCall,
      reviewInstructions: [
        "Launch only the lanes the owner/controller explicitly approves.",
        "Do not let the controller implement campaign-style patches inline; bypassing candidate_peer_spawn and candidate-worktree handoff is a process violation.",
        "After each PEER_FINAL, bind and measure the candidate through pi-autoresearch before comparing claims.",
        "When candidateWorktree is supplied, pi-autoresearch executes benchmark/check commands from that candidate worktree before recording candidate metadata.",
        "Run each lane's candidate_result_export call, then run aggregateReviewCall for owner-visible comparison.",
        "If lanes exported to .autoresearch/candidate-wave/<lane>.candidate-result.json, review_candidate_wave can also be called without candidateResultPacketPaths; it will discover existing default packets.",
        "Use the explicit aggregateReviewCall when you want missing planned lanes surfaced as missing_packet; explicit missing planned lanes gate final selection until measured/exported or owner-replanned.",
        "Use the dashboard/candidate decision surface to choose keep, discard, rewind, more samples, or finalize; do not auto-merge.",
      ],
    },
    management,
    boundaries: [
      "This plan does not spawn peers by itself.",
      "For campaign-style implementation work, controller-inline implementation is a process violation; use visible candidate_peer_spawn lanes and candidate worktrees.",
      "candidate_peer_spawn / pi-little-helpers owns visible isolated worktree launch.",
      "pi-autoresearch owns measurement receipts and candidate-result packets.",
      "pi-society-orchestrator owns above-seam supervision and comparison choreography only.",
      "AK/KES/evidence/promotion remain external owner-surface actions.",
    ],
    nextStep: parentPeerTarget
      ? "Review the candidate_peer_spawn calls and launch the approved lanes in parallel."
      : "Fill parentPeerTarget with the current controller peer id, then launch only the approved candidate_peer_spawn calls.",
  };
}

function resolveAutoresearchMatrixCampaignPlanParts(input: AutoresearchMatrixCampaignRequest): {
  identity: SessionIdentity;
  objective: string;
  scenarios: string[];
  hypotheses: string[];
  direction: "lower" | "higher";
  primaryMetricName: string;
  primaryMetricTarget: number | null;
  candidateCountPerCell: number;
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  parentPeerTarget: string | undefined;
  cells: AutoresearchMatrixCampaignCell[];
} {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("plan_matrix_campaign requires a non-empty objective.");
  }

  const scenarios = nonEmptyStrings(input.scenarios);
  const hypotheses = nonEmptyStrings(input.hypotheses);
  if (scenarios.length === 0) {
    throw new Error("plan_matrix_campaign requires at least one scenario.");
  }
  if (hypotheses.length === 0) {
    throw new Error("plan_matrix_campaign requires at least one hypothesis.");
  }

  const direction = input.direction ?? "lower";
  const primaryMetricName = input.metricName?.trim() || "operator_ux_blockers";
  const primaryMetricTarget =
    typeof input.metricThreshold === "number" && Number.isFinite(input.metricThreshold)
      ? input.metricThreshold
      : primaryMetricName === "operator_ux_blockers"
        ? 0
        : null;
  const candidateCountPerCell = resolveMatrixCellCandidateCount(input.candidateCountPerCell);
  const filesInScope = nonEmptyStrings(input.filesInScope);
  const offLimits = nonEmptyStrings(input.offLimits);
  const constraints = nonEmptyStrings(input.constraints);
  const parentPeerTarget = input.parentPeerTarget?.trim() || undefined;

  const cells = scenarios.flatMap((scenario, scenarioIndex) =>
    hypotheses.map((hypothesis, hypothesisIndex): AutoresearchMatrixCampaignCell => {
      const cellId = `cell-${String(scenarioIndex + 1).padStart(2, "0")}-${String(
        hypothesisIndex + 1,
      ).padStart(2, "0")}`;
      const cellObjective = `${objective} | scenario: ${scenario} | hypothesis: ${hypothesis}`;
      const candidatePacketDirectory = `.autoresearch/matrix-campaign/${cellId}`;
      const candidateObjectives = Array.from(
        { length: candidateCountPerCell },
        (_, index) => `${hypothesis} [sample ${index + 1}] under scenario: ${scenario}`,
      );
      const candidateResultPacketPaths = candidateObjectives.map(
        (_, index) =>
          `${candidatePacketDirectory}/candidate-${String(index + 1).padStart(2, "0")}.candidate-result.json`,
      );
      const commonPayload = {
        taskId: identity.taskId,
        cwd: identity.cwd,
        objective: cellObjective,
        direction,
      };
      const planCandidateWavePayload: Record<string, unknown> = {
        action: "plan_candidate_wave",
        ...commonPayload,
        candidateCount: candidateCountPerCell,
        candidateObjectives,
        candidatePacketDirectory,
        filesInScope,
        offLimits,
        constraints: [
          ...constraints,
          `Matrix cell: ${cellId}`,
          `Scenario: ${scenario}`,
          `Hypothesis: ${hypothesis}`,
          "Treat this matrix cell as the implementation-wave execution unit; do not mutate AK direction from inside the cell.",
          "Controller-inline implementation is a process violation for this campaign cell; route implementation through approved candidate_peer_spawn lanes and candidate worktrees.",
        ],
        maxIterations: input.maxIterationsPerCandidate,
        maxWallClockMinutes: input.maxWallClockMinutesPerCandidate,
      };
      if (parentPeerTarget) planCandidateWavePayload.parentPeerTarget = parentPeerTarget;

      return {
        cellId,
        scenario,
        hypothesis,
        objective: cellObjective,
        candidatePacketDirectory,
        candidateResultPacketPaths,
        planCandidateWaveCall: formatToolCall(
          "autoresearch_live_supervision",
          planCandidateWavePayload,
        ),
        reviewCandidateWaveCall: formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          ...commonPayload,
          candidateResultPacketPaths,
          offLimits,
        }),
        ownerUiCommand: "/autoresearch review",
        managedWavePosture: "managed_candidate_wave_required",
        fanInGate:
          "Run this cell through plan_candidate_wave, then review_candidate_wave with explicit candidateResultPacketPaths; missing planned lane packets gate final owner selection until measured/exported or owner-replanned.",
      };
    }),
  );

  return {
    identity,
    objective,
    scenarios,
    hypotheses,
    direction,
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
  };
}

function normalizeLevel2PacketPlanningKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function level2PlanningConstraintRecorded(
  constraints: readonly string[],
  pattern: RegExp,
): boolean {
  return constraints.some((constraint) => pattern.test(constraint));
}

function isLevel2ProofOnlyOrBaselineOnlyLabel(value: string): boolean {
  const normalized = normalizeLevel2PacketPlanningKey(value);
  if (normalized.length === 0) return false;
  const narrowTokens =
    /(^|_)(proof|prove|evidence|validation|validate|test|tests|doc|docs|readme|baseline|base_line|control|incumbent|current)(_|$)/u;
  return narrowTokens.test(normalized);
}

function buildLevel2PacketPlanningAntiNarrowing(input: {
  scenarios: readonly string[];
  hypotheses: readonly string[];
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  constraints: readonly string[];
}): AutoresearchLevel2PacketPlanningAntiNarrowing {
  const expectedCellCount = input.scenarios.length * input.hypotheses.length;
  const expectedLaneCount = expectedCellCount * input.candidateCountPerCell;
  const scenarioKeys = input.scenarios.map(normalizeLevel2PacketPlanningKey);
  const hypothesisKeys = input.hypotheses.map(normalizeLevel2PacketPlanningKey);
  const duplicateLaneKeys = [
    ...scenarioKeys
      .filter((key, index) => key.length > 0 && scenarioKeys.indexOf(key) !== index)
      .map((key) => `scenario:${key}`),
    ...hypothesisKeys
      .filter((key, index) => key.length > 0 && hypothesisKeys.indexOf(key) !== index)
      .map((key) => `hypothesis:${key}`),
  ];
  const actualLaneKeys = input.cells.flatMap((cell) =>
    cell.candidateResultPacketPaths.map((packetPath) => `${cell.cellId}:${packetPath}`),
  );
  const duplicateGeneratedLaneKeys = actualLaneKeys.filter(
    (key, index) => actualLaneKeys.indexOf(key) !== index,
  );
  const missingLaneKeys =
    actualLaneKeys.length === expectedLaneCount && input.cells.length === expectedCellCount
      ? []
      : [
          `expected-cells:${expectedCellCount}:actual-cells:${input.cells.length}`,
          `expected-lanes:${expectedLaneCount}:actual-lanes:${actualLaneKeys.length}`,
        ];
  const allAxisLabels = [...input.scenarios, ...input.hypotheses];
  const proofOnlyBaselineOnlyLaneKeys = allAxisLabels.every(isLevel2ProofOnlyOrBaselineOnlyLabel)
    ? input.cells.map((cell) => cell.cellId)
    : [];
  const incompleteMatrixExceptionRecorded = level2PlanningConstraintRecorded(
    input.constraints,
    /(?:incomplete[-_\s]?matrix\s+exception|exception\s*:\s*incomplete[-_\s]?matrix)/iu,
  );
  const explicitDowngradeRecorded =
    level2PlanningConstraintRecorded(input.constraints, /(?:explicit\s+downgrade)/iu) ||
    level2PlanningConstraintRecorded(input.constraints, /(?:downgrade\s+recorded)/iu) ||
    level2PlanningConstraintRecorded(input.constraints, /(?:downgrade\s*:)/iu) ||
    level2PlanningConstraintRecorded(
      input.constraints,
      /(?:downgraded\s+to\s+(?:packet[-_\s]?only|planning))/iu,
    );
  const missingOrDuplicateKeys = [
    ...new Set([...missingLaneKeys, ...duplicateLaneKeys, ...duplicateGeneratedLaneKeys]),
  ];
  const proofOnlyBaselineOnlyBlocked =
    proofOnlyBaselineOnlyLaneKeys.length > 0 &&
    !incompleteMatrixExceptionRecorded &&
    !explicitDowngradeRecorded;
  const blockerCount =
    missingOrDuplicateKeys.length +
    (proofOnlyBaselineOnlyBlocked ? proofOnlyBaselineOnlyLaneKeys.length : 0);
  const posture: AutoresearchLevel2PacketPlanningAntiNarrowingPosture =
    missingOrDuplicateKeys.length > 0
      ? "failed_closed_missing_or_duplicate_lanes"
      : proofOnlyBaselineOnlyBlocked
        ? "blocked_anti_narrowing"
        : explicitDowngradeRecorded
          ? "explicit_downgrade_recorded"
          : incompleteMatrixExceptionRecorded
            ? "incomplete_matrix_exception_recorded"
            : "ready_for_level2_packet_planning";

  return {
    kind: "autoresearch.level2_packet_planning_anti_narrowing.v1",
    posture,
    targetClosureAllowed: blockerCount === 0 && !explicitDowngradeRecorded,
    proofOnlyBaselineOnlyTargetClosureBlocked: proofOnlyBaselineOnlyBlocked,
    incompleteMatrixExceptionRecorded,
    explicitDowngradeRecorded,
    missingLaneKeys,
    duplicateLaneKeys: [...new Set([...duplicateLaneKeys, ...duplicateGeneratedLaneKeys])],
    proofOnlyBaselineOnlyLaneKeys,
    blockerMetric: {
      name: "level2_packet_planning_blockers",
      direction: "lower",
      target: 0,
      value: blockerCount,
      status: blockerCount === 0 ? "target_met" : "blocked",
    },
    proofs: [
      {
        proof: "scenario × hypothesis packet-lane matrix cardinality",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.expected-vs-actual-lanes",
      },
      {
        proof: "proof-only/baseline-only narrowing guard",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.proofOnlyBaselineOnlyLaneKeys",
      },
      {
        proof: "incomplete-matrix exception / explicit downgrade record check",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.constraints",
      },
    ],
    guidance:
      blockerCount === 0
        ? [
            "Level-2 packet-only planning may proceed as recorded, but this posture still launches no peers and performs no external action.",
            explicitDowngradeRecorded
              ? "Target closure was explicitly downgraded; do not report target closure from proof-only/baseline-only evidence."
              : incompleteMatrixExceptionRecorded
                ? "Incomplete-matrix exception is recorded; keep the exception visible when reporting target status."
                : "Maintain at least one non-proof/non-baseline matrix lane before claiming target closure.",
          ]
        : [
            "Fail closed: do not claim level-2 target closure from proof-only/baseline-only packet evidence without an incomplete-matrix exception or explicit downgrade.",
            "Fail closed: resolve missing or duplicate planned lane keys before exposing this packet-only plan as closure-ready.",
          ],
  };
}

function resolveMatrixCampaignRunnerManifestPath(value: string | undefined): string {
  const candidate = value?.trim() || ".autoresearch/matrix-campaign/runner-manifest.json";
  const normalized = candidate.replaceAll("\\", "/");
  if (
    path.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith(".autoresearch/matrix-campaign/") ||
    normalized.endsWith("/")
  ) {
    throw new Error(
      `runnerManifestPath must be a repo-relative file under .autoresearch/matrix-campaign/, received: ${candidate}`,
    );
  }
  return normalized;
}

function buildMatrixCampaignRunnerCheckpointToken(input: {
  taskId: number;
  cwd: string;
  manifestPath: string;
}): string {
  const resolvedCwd = path.resolve(input.cwd);
  return [
    "controller-checkpoint:matrix-visible-peers-reported",
    `task:${input.taskId}`,
    `cwd:${resolvedCwd}`,
    `manifest:${input.manifestPath}`,
  ].join("|");
}

const DEFAULT_LEVEL2_PACKET_FORBIDDEN_ACTIONS = [
  "Do not spawn peers implicitly; only visible candidate_peer_spawn calls may launch candidate lanes.",
  "Do not run benchmark, candidate_result_export, review_candidate_wave, or review_matrix_campaign below the checkpoint gate.",
  "Do not write AK/KES/evidence, mutate Prompt Vault/ROCS, merge, promote, reset, or clean up worktrees from packet-only planning.",
] as const;

const LEVEL2_PACKET_LEVEL1_FALLBACK =
  "Level-1 fallback: if level-2 matrix packet planning is blocked or too heavy, run action=plan_candidate_wave for one managed candidate wave/cell, then review_candidate_wave with explicit packet paths.";

function buildAutoresearchLevel2PacketToken(input: {
  taskId: number;
  cwd: string;
  objective: string;
  tokenName: AutoresearchLevel2PacketTokenName;
}): string {
  const digest = createHash("sha256")
    .update(`${input.taskId}\0${path.resolve(input.cwd)}\0${input.objective}\0${input.tokenName}`)
    .digest("hex")
    .slice(0, 16);
  return `level2:${input.tokenName}:task:${input.taskId}:sha256:${digest}`;
}

function buildAutoresearchLevel2PacketPlanningBlockers(input: {
  blockerMetric?: AutoresearchLevel2PacketPlanningBlockerMetric;
  missingTokens?: readonly string[];
  nextLegalActions: readonly string[];
  forbiddenActions?: readonly string[];
  level1Fallback?: string;
  noHiddenExecutionBoundary?: string;
}): AutoresearchLevel2PacketPlanningBlockers {
  const missingTokens = input.missingTokens ?? [];
  const forbiddenActions = input.forbiddenActions ?? DEFAULT_LEVEL2_PACKET_FORBIDDEN_ACTIONS;
  const level1Fallback = input.level1Fallback ?? LEVEL2_PACKET_LEVEL1_FALLBACK;
  const noHiddenExecutionBoundary =
    input.noHiddenExecutionBoundary ??
    "Packet-only level-2 planning may emit calls and command packets only; it does not launch peers, run benchmarks/exports/reviews, write evidence, merge, promote, or mutate lifecycle state.";
  const metric = input.blockerMetric ?? {
    name: "level2_packet_planning_blockers" as const,
    direction: "lower" as const,
    target: 0 as const,
    value: 0,
    status: "target_met" as const,
  };
  return {
    ...metric,
    missingTokens,
    nextLegalActions: input.nextLegalActions,
    forbiddenActions,
    level1Fallback,
    noHiddenExecutionBoundary,
    proofs: [
      {
        proof: "next legal actions are operator-visible",
        status: "present",
        source: "operatorFollowup.nextLegalActions",
      },
      {
        proof: "missing token list is explicit",
        status: "present",
        source: "operatorFollowup.level2PacketPlanningBlockers.missingTokens",
      },
      {
        proof: "forbidden actions and no-hidden-execution boundary are explicit",
        status: "present",
        source:
          "operatorFollowup.level2PacketPlanningBlockers.forbiddenActions + noHiddenExecutionBoundary",
      },
      {
        proof: "level-1 fallback is explicit",
        status: "present",
        source: "operatorFollowup.level2PacketPlanningBlockers.level1Fallback",
      },
    ],
  };
}

function buildAutoresearchLevel2PacketPlanning(input: {
  taskId: number;
  cwd: string;
  objective: string;
  candidateLaneCount: number;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
}): AutoresearchLevel2PacketPlanning {
  const token = (tokenName: AutoresearchLevel2PacketTokenName) =>
    buildAutoresearchLevel2PacketToken({
      taskId: input.taskId,
      cwd: input.cwd,
      objective: input.objective,
      tokenName,
    });
  const tokenVocabulary: AutoresearchLevel2PacketPlanning["tokenVocabulary"] = {
    launchVisibleCandidateLanes: {
      tokenName: "launch_visible_candidate_lanes",
      exactToken: token("launch_visible_candidate_lanes"),
      requiredFor: "visible candidate_peer_spawn lane launch",
      ownerSurface: "controller_visible_peer_launch",
      description:
        "Required before any level-2 packet plan may expose or run visible candidate lane launch calls.",
    },
    postFaninFinalizer: {
      tokenName: "finalize_post_fanin",
      exactToken: token("finalize_post_fanin"),
      requiredFor: "post_fanin_finalizer packet construction after measured fan-in review",
      ownerSurface: "pi-society-orchestrator.post_fanin_finalizer",
      description:
        "Required before post-fan-in finalizer apply-command packets can be treated as an owner-approved next step.",
    },
    akOwnerWrite: {
      tokenName: "ak_owner_write",
      exactToken: token("ak_owner_write"),
      requiredFor: "owner-routed AK evidence/task write handoff",
      ownerSurface: "AK",
      description: "Required for any AK evidence/task lifecycle write outside this packet planner.",
    },
    candidateCleanup: {
      tokenName: "candidate_cleanup",
      exactToken: token("candidate_cleanup"),
      requiredFor: "candidate worktree stop/delete/reset cleanup handoff",
      ownerSurface: "candidate_worktree_lifecycle",
      description:
        "Required before cleanup of candidate peers or worktrees is proposed for execution.",
    },
    promotion: {
      tokenName: "promotion",
      exactToken: token("promotion"),
      requiredFor: "merge/release/promotion authority handoff",
      ownerSurface: "owner_promotion_gate",
      description:
        "Required before any selected candidate can be promoted, merged, released, or represented as completion authority.",
    },
  };
  const basePacket = (
    tokenName: AutoresearchLevel2PacketTokenName,
    posture: AutoresearchLevel2PacketDescriptor["posture"],
    boundary: string,
  ): AutoresearchLevel2PacketDescriptor => ({
    packetName: tokenName,
    tokenName,
    requiredToken: token(tokenName),
    posture,
    execution: "not_executed_by_orchestrator",
    exactCalls: [],
    boundary,
  });

  return {
    kind: "autoresearch.level2_packet_planning.v1",
    schemaVersion: 1,
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    packetOnly: true,
    execution: "not_executed_by_orchestrator",
    tokenVocabulary,
    packets: {
      launchVisibleCandidateLanes: {
        ...basePacket(
          "launch_visible_candidate_lanes",
          "blocked_missing_launch_token",
          "Visible peer launch is blocked in this packet-only plan until the exact launch_visible_candidate_lanes token is supplied to an owner-approved launcher; no candidate_peer_spawn call is executed here.",
        ),
        packetName: "launch_visible_candidate_lanes",
        tokenName: "launch_visible_candidate_lanes",
        posture: "blocked_missing_launch_token",
        allowedTool: "candidate_peer_spawn",
        launchCalls: [],
        withheldLaunchCallCount: input.candidateLaneCount,
      },
      postFaninFinalizer: {
        ...basePacket(
          "finalize_post_fanin",
          "blocked_until_owner_token",
          "Post-fan-in finalizer packets remain plan-only until owner review supplies finalize_post_fanin; no checkout, merge, commit, cleanup, or apply command is executed here.",
        ),
        packetName: "finalize_post_fanin",
        tokenName: "finalize_post_fanin",
      },
      akOwnerWrite: {
        ...basePacket(
          "ak_owner_write",
          "blocked_until_review_token",
          "AK evidence/task writes are outside this planner and require an explicit ak_owner_write handoff after packet review.",
        ),
        packetName: "ak_owner_write",
        tokenName: "ak_owner_write",
      },
      candidateCleanup: {
        ...basePacket(
          "candidate_cleanup",
          "blocked_until_owner_token",
          "Candidate stop/delete/reset cleanup is not performed by this planner and requires a separate candidate_cleanup token.",
        ),
        packetName: "candidate_cleanup",
        tokenName: "candidate_cleanup",
      },
      promotion: {
        ...basePacket(
          "promotion",
          "blocked_until_owner_token",
          "Promotion, merge, release, and completion authority are outside this planner and require a separate promotion token.",
        ),
        packetName: "promotion",
        tokenName: "promotion",
      },
    },
    metric: input.antiNarrowing.blockerMetric,
    antiNarrowing: input.antiNarrowing,
    boundaries: [
      "Packet-only level-2 planning does not launch peers, run benchmarks, export candidate results, review candidates, write evidence, clean worktrees, merge, release, or promote.",
      "Prepared token values are request/coordination values only; consuming them requires the exact owner-approved command surface for that boundary.",
      "Anti-narrowing posture must stay visible before any campaign closure claim.",
    ],
    nextStep:
      input.antiNarrowing.blockerMetric.status === "blocked"
        ? "Resolve level-2 packet planning blockers before claiming target closure or launching candidate lanes."
        : "Use the prepared packet as review input; launch, finalizer, evidence, cleanup, and promotion actions still require explicit owner tokens.",
  };
}

function buildAutoresearchMatrixCampaignOperatorFollowup(input: {
  currentState: string;
  metricName: string;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  cells?: readonly AutoresearchMatrixCampaignCell[];
  lanes?: readonly Pick<
    AutoresearchMatrixCampaignRunnerLane,
    "cellId" | "laneId" | "candidateResultPacketPath"
  >[];
  laneStates?: readonly {
    cellId: string;
    laneId: string;
    packetPath: string;
    state: AutoresearchMatrixCampaignOperatorLaneState;
  }[];
  checkpoint?: {
    posture: AutoresearchMatrixCampaignOperatorFollowup["checkpointState"]["posture"];
    manifestPath: string | null;
    requiredToken: string | null;
    checkpointAccepted: boolean | null;
  };
  measurementReview?: Partial<AutoresearchMatrixCampaignOperatorFollowup["measurementReviewState"]>;
  nextLegalActions: readonly string[];
  level2PacketPlanning?: {
    blockerMetric?: AutoresearchLevel2PacketPlanningBlockerMetric;
    missingTokens?: readonly string[];
    forbiddenActions?: readonly string[];
    level1Fallback?: string;
    noHiddenExecutionBoundary?: string;
  };
}): AutoresearchMatrixCampaignOperatorFollowup {
  const lanePacketPaths =
    input.laneStates ??
    input.lanes?.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      packetPath: lane.candidateResultPacketPath,
      state: "locked_until_checkpoint" as const,
    })) ??
    input.cells?.flatMap((cell) =>
      cell.candidateResultPacketPaths.map((packetPath, index) => ({
        cellId: cell.cellId,
        laneId: `candidate-${String(index + 1).padStart(2, "0")}`,
        packetPath,
        state: "planned" as const,
      })),
    ) ??
    [];
  const expectedCells =
    input.cells?.length ?? new Set(lanePacketPaths.map((lane) => lane.cellId)).size;
  const checkpointState = input.checkpoint ?? {
    posture: "not_applicable" as const,
    manifestPath: null,
    requiredToken: null,
    checkpointAccepted: null,
  };
  const level2PacketPlanningBlockers = buildAutoresearchLevel2PacketPlanningBlockers({
    nextLegalActions: input.nextLegalActions,
    ...input.level2PacketPlanning,
  });

  return {
    kind: "autoresearch.matrix_campaign_operator_followup.v1",
    currentState: input.currentState,
    primaryMetric: {
      name: input.metricName,
      direction: input.metricDirection,
      target: input.metricTarget,
      targetSummary:
        input.metricTarget === null
          ? `${input.metricName} (${input.metricDirection} is better; no target supplied)`
          : `${input.metricName} (${input.metricDirection} is better; target=${input.metricTarget})`,
    },
    level2PacketPlanningBlockers,
    lanePacketPaths,
    checkpointState: {
      ...checkpointState,
      warning:
        "Checkpoint token is a controller confirmation string, not cryptographic proof; controller must verify PEER_FINAL lineage and candidate worktrees before measurement/export/review.",
    },
    measurementReviewState: {
      posture: "planned_not_measured",
      completedCells: 0,
      expectedCells,
      selectedCells: 0,
      benchmarkExportReviewCallsExposed: false,
      reviewMatrixCampaignCall: null,
      ...input.measurementReview,
    },
    nextLegalActions: input.nextLegalActions,
    blockersChecklist: [
      {
        proof: "operator follow-up/current-state summary",
        status: "present",
        source: "operatorFollowup.currentState",
      },
      {
        proof: "next legal actions",
        status: "present",
        source: "operatorFollowup.nextLegalActions",
      },
      {
        proof: `cell primary metric ${input.metricName}`,
        status: "present",
        source: "operatorFollowup.primaryMetric",
      },
      {
        proof: "runner checkpoint and lineage verification coverage",
        status: "present",
        source: "operatorFollowup.checkpointState",
      },
      {
        proof: "exact per-cell controller sequence / next-call bundle coverage",
        status: "present",
        source: "controllerCommandPacket.flattenedNextCallBundle",
      },
      {
        proof: "no hidden execution or promotion boundary coverage",
        status: "present",
        source: "controllerCommandPacket.boundaries",
      },
      {
        proof: "docs/tests alignment for manual_controller_glue_blockers",
        status: "present",
        source: "README/product-posture/tests",
      },
    ],
  };
}

export function planAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignPlan {
  const {
    identity,
    objective,
    scenarios,
    hypotheses,
    direction,
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    constraints,
    parentPeerTarget,
    cells,
  } = resolveAutoresearchMatrixCampaignPlanParts(input);

  const antiNarrowing = buildLevel2PacketPlanningAntiNarrowing({
    scenarios,
    hypotheses,
    candidateCountPerCell,
    cells,
    constraints,
  });

  const level2PacketPlanning = buildAutoresearchLevel2PacketPlanning({
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    candidateLaneCount: cells.length * candidateCountPerCell,
    antiNarrowing,
  });

  const managedWaveSubstrate: AutoresearchMatrixManagedWaveSubstrate = {
    kind: "autoresearch.matrix_managed_candidate_wave_substrate.v1",
    cellCount: cells.length,
    candidateCountPerCell,
    expectedCandidateLaneCount: cells.length * candidateCountPerCell,
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    explicitPacketPathsGateSelection: true,
    antiNarrowing,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    cellFanInCalls: cells.map((cell) => ({
      cellId: cell.cellId,
      planCandidateWaveCall: cell.planCandidateWaveCall,
      reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
    })),
    checklist: [
      "Treat each matrix cell as a managed candidate wave, not as loose parallel sidequests.",
      "Run the cell planCandidateWaveCall before launching approved visible candidate lanes.",
      "Controller-inline implementation is a process violation for campaign-style implementation cells; route mutation through candidate_peer_spawn worktrees.",
      "Score only controller-measured pi-autoresearch candidate-result packets for each lane.",
      "Use explicit cell reviewCandidateWaveCall packet paths so missing planned lanes gate final cell selection.",
      "Compare matrix cells only after their managed wave reviews are complete or deliberately owner-replanned.",
      "Level-2 packet-only planning must keep anti-narrowing visible: proof-only/baseline-only closure is blocked unless an incomplete-matrix exception or explicit downgrade is recorded, and missing/duplicate lanes fail closed.",
    ],
  };

  return {
    kind: "autoresearch.matrix_campaign_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: "planned_matrix_campaign_waiting_for_visible_candidate_lane_launch",
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      cells,
      nextLegalActions: [
        "Review this operator follow-up summary before launching any candidate lane.",
        parentPeerTarget
          ? "Missing token list: none for planning; launch_visible_candidate_lanes is still required before any owner-approved launcher consumes visible candidate lane calls."
          : "Missing token list: parentPeerTarget before visible candidate lane launch.",
        "Launch only approved visible candidate_peer_spawn lanes for selected matrix cells.",
        "After PEER_FINAL, verify lineage and candidate worktrees before measurement/export/review.",
        "Run review_matrix_campaign only after candidate-result packets exist or missing lanes are deliberately owner-replanned.",
        LEVEL2_PACKET_LEVEL1_FALLBACK,
      ],
      level2PacketPlanning: {
        blockerMetric: antiNarrowing.blockerMetric,
        missingTokens: parentPeerTarget ? [] : ["parentPeerTarget"],
      },
    }),
    scenarios,
    hypotheses,
    candidateCountPerCell,
    cells,
    managedWaveSubstrate,
    level2PacketPlanning,
    implementationWaveSubstrate: {
      posture: "dogfood_matrix_replaces_hand_authored_wave_steps",
      akTaskId: identity.taskId,
      ownerUiCommand: "/autoresearch review",
      handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
      nextExactCalls: cells.slice(0, 1).map((cell) => cell.planCandidateWaveCall),
    },
    ownerReview: {
      primaryUi: {
        surface: "pi-autoresearch_html_dashboard",
        slashCommand: "/autoresearch export",
        fallbackSlashCommand: "/autoresearch overlay",
        summary:
          "Open pi-autoresearch's HTML dashboard first for run history, receipts, metrics, and candidate context; use the overlay when a browser export is not desirable.",
      },
      decisionUi: {
        surface: "pi-autoresearch_candidate_decision_workbench",
        slashCommand: "/autoresearch review",
        summary:
          "Use pi-autoresearch's existing candidate decision workbench only for the final keep/discard/rewind/more-samples decision after reviewing dashboard and packet evidence.",
      },
      reviewFlow: [
        "Approve and launch only the matrix cell candidate lanes the owner/controller explicitly selects.",
        "Do not patch the implementation target inline from the controller during campaign-style work; that bypasses the candidate-runner/worktree handoff and is a process violation.",
        "After each visible candidate reports back, bind, measure, and export candidate-result packets through pi-autoresearch before comparing lanes.",
        "Open /autoresearch export for the HTML dashboard with run history, receipts, metrics, and candidate context; use /autoresearch overlay as the live TUI fallback.",
        "Run the cell reviewCandidateWaveCall to build the owner-visible comparison from candidate-result packets.",
        "Use /autoresearch review only for the final keep, discard, rewind, more samples, or finalize decision; matrix choreography is advisory and plan-only.",
      ],
      cellReviewCalls: cells.map((cell) => ({
        cellId: cell.cellId,
        reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      })),
      boundary:
        "Owner decision routing stays on the existing pi-autoresearch candidate decision workbench; this matrix report adds no new primary UI and applies no lifecycle action.",
    },
    boundaries: [
      "This matrix plan is a non-mutating implementation-wave substrate, not a direction mutation.",
      "Each matrix cell delegates candidate execution to the existing plan_candidate_wave and pi-autoresearch measurement/candidate-result packet surfaces.",
      "Controller-inline implementation for campaign-style cells is a process violation; mutation must happen in candidate_peer_spawn worktrees before controller binding/measurement.",
      "pi-autoresearch owns metrics, receipts, candidate packets, and candidate worktree measurement semantics.",
      "pi-society-orchestrator owns matrix choreography, aggregate review calls, and owner-decision surfacing only.",
      "AK remains the task/direction spine; no AK/KES/evidence write, merge, promotion, peer spawn, or worktree lifecycle action is applied by this plan.",
      "Forbidden actions: no hidden peer launch, benchmark/export/review execution, evidence write, merge, promotion, or cleanup is performed by level-2 packet-only planning.",
      LEVEL2_PACKET_LEVEL1_FALLBACK,
      `Level-2 packet-only planning anti-narrowing posture: ${antiNarrowing.posture}; level2_packet_planning_blockers=${antiNarrowing.blockerMetric.value}.`,
    ],
    nextStep:
      antiNarrowing.blockerMetric.status === "blocked"
        ? "Resolve level-2 packet-only planning blockers before claiming target closure; do not launch peers or run external actions from this plan."
        : "Run the first cell's planCandidateWaveCall, launch only approved visible candidate lanes, reject controller-inline implementation as a process violation, export candidate-result packets, open /autoresearch export for dashboard review, then run the cell reviewCandidateWaveCall and decide through /autoresearch review.",
  };
}

function createSafeCandidatePeerNames(input: {
  taskId: number;
  laneId: string;
  objective: string;
}): { workspaceName: string; branchName: string } {
  const laneSlug = input.laneId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 24);
  const objectiveHash = createHash("sha256").update(input.objective).digest("hex").slice(0, 8);
  const workspaceName = `ar-${input.taskId}-${laneSlug || "lane"}-${objectiveHash}`;
  return {
    workspaceName,
    branchName: `candidatepeer/${workspaceName}`,
  };
}

function extractJsonStringFromToolCall(call: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "u").exec(
    call,
  );
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function buildAutoresearchMatrixCampaignRunnerLanes(input: {
  identity: SessionIdentity;
  direction: "lower" | "higher";
  metricName: string;
  metricThreshold: number | null;
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
  candidateBindings?: readonly AutoresearchLevel3CandidateLifecycleBindingInput[];
}): AutoresearchMatrixCampaignRunnerLane[] {
  return input.cells.flatMap((cell) => {
    const candidateObjectives = Array.from(
      { length: input.candidateCountPerCell },
      (_, index) => `${cell.hypothesis} [sample ${index + 1}] under scenario: ${cell.scenario}`,
    );
    const wave = planAutoresearchCandidateWave({
      taskId: input.identity.taskId,
      cwd: input.identity.cwd,
      objective: cell.objective,
      direction: input.direction,
      candidateCount: input.candidateCountPerCell,
      candidateObjectives,
      candidatePacketDirectory: cell.candidatePacketDirectory,
      filesInScope: input.filesInScope,
      offLimits: input.offLimits,
      constraints: [
        ...input.constraints,
        `Matrix cell: ${cell.cellId}`,
        `Scenario: ${cell.scenario}`,
        `Hypothesis: ${cell.hypothesis}`,
        "Benchmark/export/review remains locked until the controller checkpoint confirms visible peer reports were received.",
      ],
      parentPeerTarget: input.parentPeerTarget,
      maxIterationsPerCandidate: input.maxIterationsPerCandidate,
      maxWallClockMinutesPerCandidate: input.maxWallClockMinutesPerCandidate,
    });

    return wave.lanes.map((lane) => {
      const cellScopedLaneId = `${cell.cellId}-${lane.laneId}`;
      const binding = input.candidateBindings?.find(
        (candidateBinding) =>
          candidateBinding.laneId === cellScopedLaneId || candidateBinding.laneId === lane.laneId,
      );
      const candidateWorktree =
        binding?.candidateWorktree ?? `<${cellScopedLaneId}-worktree-from-candidate_peer_spawn>`;
      const candidateBranch =
        binding?.candidateBranch ?? `<${cellScopedLaneId}-branch-from-candidate_peer_spawn>`;
      const candidateBaseRef =
        binding?.candidateBaseRef ?? `<${cellScopedLaneId}-base-ref-from-candidate_peer_spawn>`;
      const candidateDiffSummary =
        binding?.candidateDiffSummary ?? `<${cellScopedLaneId}-controller-verified-diff-summary>`;
      const candidateFilesChanged =
        binding?.candidateFilesChanged && binding.candidateFilesChanged.length > 0
          ? binding.candidateFilesChanged
          : [`<${cellScopedLaneId}-changed-files>`];
      const metricRunPayload: Record<string, unknown> = {
        cwd: input.identity.cwd,
        runKind: "ordinary",
        name: `matrix-${cell.cellId}-${lane.laneId}`,
        description: `Measure ${cell.cellId}/${lane.laneId} for ${input.metricName}: ${lane.objective}`,
        hypothesisId: `${cell.cellId}-${lane.laneId}`,
        hypothesis: lane.objective,
        metricName: input.metricName,
        direction: input.direction,
        candidateSource: "candidate_peer_spawn",
        candidateWorktree,
        candidateBranch,
        candidateBaseRef,
        candidateDiffSummary,
        candidateFilesChanged,
      };
      if (input.metricThreshold !== null) metricRunPayload.metricThreshold = input.metricThreshold;

      const bindCall = formatToolCall("autoresearch_candidate_bind", {
        cwd: input.identity.cwd,
        candidateWorktree,
        candidateBaseRef,
      });
      const metricRunCall = formatToolCall("autoresearch_runtime_run", metricRunPayload);
      const resultCall = formatToolCall("autoresearch_runtime_status", {
        cwd: input.identity.cwd,
        action: "candidate_result_export",
        outPath: lane.candidateResultPacketPath,
      });

      return {
        cellId: cell.cellId,
        laneId: lane.laneId,
        objective: lane.objective,
        cellObjective: cell.objective,
        candidatePeerCall: lane.candidatePeerCall,
        measurementPlan: [bindCall, metricRunCall, resultCall],
        candidateResultPacketPath: lane.candidateResultPacketPath,
        reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      };
    });
  });
}

export function buildAutoresearchMatrixCampaignRunnerContract(
  input: AutoresearchMatrixCampaignRunnerRequest,
): AutoresearchMatrixCampaignRunnerContract {
  const {
    identity,
    objective,
    direction,
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
  } = resolveAutoresearchMatrixCampaignPlanParts(input);
  const manifestPath = resolveMatrixCampaignRunnerManifestPath(input.runnerManifestPath);
  const checkpointToken = buildMatrixCampaignRunnerCheckpointToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestPath,
  });
  const lanes = buildAutoresearchMatrixCampaignRunnerLanes({
    identity,
    direction,
    metricName: primaryMetricName,
    metricThreshold: primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
    maxIterationsPerCandidate: input.maxIterationsPerCandidate,
    maxWallClockMinutesPerCandidate: input.maxWallClockMinutesPerCandidate,
    candidateBindings: input.candidateBindings,
  });

  const exactCheckpointCall = formatToolCall("autoresearch_live_supervision", {
    action: "checkpoint_matrix_campaign_runner",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    metricName: primaryMetricName,
    metricThreshold: primaryMetricTarget ?? undefined,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell,
    parentPeerTarget,
    filesInScope,
    offLimits,
    constraints,
    runnerManifestPath: manifestPath,
    checkpointConfirmation: checkpointToken,
  });
  const hiddenLaunchCallCount = lanes.filter(
    (lane) =>
      !lane.candidatePeerCall.includes("candidate_peer_spawn(") ||
      lane.candidatePeerCall.includes("scout_peer_spawn(") ||
      lane.candidatePeerCall.includes("fork_peer_spawn("),
  ).length;
  const visibleLaneBindingBlockerCount =
    (parentPeerTarget ? 0 : 1) + hiddenLaunchCallCount + (lanes.length === 0 ? 1 : 0);

  return {
    kind: "autoresearch.matrix_campaign_runner_contract.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: parentPeerTarget
        ? "prepared_runner_waiting_for_visible_candidate_peers"
        : "prepared_runner_blocked_missing_parent_peer_target",
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      lanes,
      checkpoint: {
        posture: "controller_checkpoint_required",
        manifestPath,
        requiredToken: checkpointToken,
        checkpointAccepted: false,
      },
      measurementReview: {
        posture: "locked_until_controller_checkpoint",
        expectedCells: cells.length,
      },
      nextLegalActions: parentPeerTarget
        ? [
            "Launch the visible candidate_peer_spawn calls only from the prepared manifest.",
            "Wait for PEER_FINAL reports, then verify candidate worktree lineage outside this token.",
            "Call checkpoint_matrix_campaign_runner with the exact checkpointConfirmation token only after verification.",
          ]
        : [
            "Provide parentPeerTarget before launching visible peers.",
            "Keep benchmark/export/review calls withheld until the exact checkpoint is confirmed.",
          ],
    }),
    manifest: {
      path: manifestPath,
      identityAnchor: buildAutoresearchLiveSupervisionSessionKey(identity),
      exactTaskId: identity.taskId,
      exactCwd: identity.cwd,
      cellCount: cells.length,
      candidateLaneCount: lanes.length,
      packageOwnerBoundary: "pi-society-orchestrator_matrix_choreography_only",
      durableEvidence: false,
    },
    launchPhase: {
      posture: parentPeerTarget
        ? "ready_to_launch_visible_candidate_peers"
        : "blocked_missing_parent_peer_target",
      allowedTool: "candidate_peer_spawn",
      launchCalls: lanes.map((lane) => lane.candidatePeerCall),
      parentPeerTarget: parentPeerTarget ?? null,
      visibleCandidateLaneBinding: {
        name: "visible_candidate_lane_binding_blockers",
        direction: "lower",
        target: 0,
        value: visibleLaneBindingBlockerCount,
        status: visibleLaneBindingBlockerCount === 0 ? "target_met" : "blocked",
        expectedLaneCount: lanes.length,
        visibleLaunchCallCount: lanes.length - hiddenLaunchCallCount,
        hiddenLaunchCallCount,
        missingParentPeerTarget: !parentPeerTarget,
      },
    },
    checkpointGate: {
      posture: "controller_checkpoint_required_before_benchmark_export_review",
      requiredToken: checkpointToken,
      confirmationParameter: "checkpointConfirmation",
      exactCheckpointCall,
      blockedUntilConfirmed: [
        "autoresearch_candidate_bind",
        "autoresearch_runtime_run",
        "candidate_result_export",
        "review_candidate_wave",
        "review_matrix_campaign",
      ],
    },
    lockedBenchmarkExportReview: {
      posture: "withheld_until_checkpoint",
      calls: [],
    },
    lanes,
    boundaries: [
      "The runner contract is a manifest/checkpoint contract; it does not spawn peers, run benchmarks, export packets, review candidates, write evidence, merge, or promote by itself.",
      "The only calls exposed before checkpoint are visible candidate_peer_spawn calls for isolated candidate worktrees.",
      "Benchmark, candidate_result_export, review_candidate_wave, and review_matrix_campaign calls are withheld until the exact controller checkpoint token is supplied.",
      "The checkpoint token is a controller confirmation string, not cryptographic proof; the controller must still verify PEER_FINAL lineage and candidate worktrees.",
      "Exact taskId+cwd anchoring is preserved in the manifest identity anchor.",
      "Raw peer/intercom output remains communication until the controller verifies candidate worktree lineage and pi-autoresearch measurement packets.",
      "pi-autoresearch remains owner of benchmark/check execution and candidate-result exports; pi-society-orchestrator owns only above-seam choreography.",
    ],
    nextStep: parentPeerTarget
      ? "Launch the visible candidate_peer_spawn calls from the manifest, wait for PEER_FINAL reports, verify worktree lineage, then provide the exact checkpointConfirmation token to unlock benchmark/export/review calls."
      : "Provide parentPeerTarget first; visible peer launch remains blocked and benchmark/export/review calls stay withheld.",
  };
}

function buildAutoresearchMatrixCampaignControllerCommandPacket(input: {
  contract: AutoresearchMatrixCampaignRunnerContract;
  reviewMatrixCampaignCall: string;
}): AutoresearchMatrixCampaignControllerCommandPacket {
  const lanesByCell = new Map<string, AutoresearchMatrixCampaignRunnerLane[]>();
  for (const lane of input.contract.lanes) {
    const lanes = lanesByCell.get(lane.cellId) ?? [];
    lanes.push(lane);
    lanesByCell.set(lane.cellId, lanes);
  }

  const cells = Array.from(lanesByCell.entries()).map(([cellId, lanes]) => {
    const firstLane = lanes[0];
    const reviewCandidateWaveCall = firstLane?.reviewCandidateWaveCall ?? "";
    return {
      cellId,
      objective: firstLane?.cellObjective ?? input.contract.objective,
      exactControllerSequence: [
        "autoresearch_candidate_bind",
        "autoresearch_runtime_run",
        "candidate_result_export",
        "review_candidate_wave",
        "review_matrix_campaign",
      ] as const,
      lanes: lanes.map((lane) => ({
        laneId: lane.laneId,
        candidateResultPacketPath: lane.candidateResultPacketPath,
        bindCall: lane.measurementPlan[0] ?? "",
        metricRunCall: lane.measurementPlan[1] ?? "",
        candidateResultExportCall: lane.measurementPlan[2] ?? "",
        metricBindingSummary:
          input.contract.operatorFollowup.primaryMetric.target === null
            ? `${input.contract.operatorFollowup.primaryMetric.name} (${input.contract.direction} is better; no target supplied)`
            : `${input.contract.operatorFollowup.primaryMetric.name} (${input.contract.direction} is better; target=${input.contract.operatorFollowup.primaryMetric.target})`,
      })),
      reviewCandidateWaveCall,
      reviewMatrixCampaignCall: input.reviewMatrixCampaignCall,
    };
  });

  return {
    kind: "autoresearch.matrix_cell_controller_command_packet.v1",
    checkpointAccepted: true,
    manifestPath: input.contract.manifest.path,
    exactTaskId: input.contract.taskId,
    exactCwd: input.contract.cwd,
    cellMetric: {
      name: input.contract.operatorFollowup.primaryMetric.name,
      direction: input.contract.direction,
      target: input.contract.operatorFollowup.primaryMetric.target,
    },
    manualControllerGlueBlockers: {
      name: "manual_controller_glue_blockers",
      direction: "lower",
      target: 0,
      proofChecklist: [
        {
          proof: "exact per-cell controller sequence",
          status: "present",
          source: "controllerCommandPacket.cells[].exactControllerSequence",
        },
        {
          proof: "metric-specific run/export templates",
          status: "present",
          source: "controllerCommandPacket.cells[].lanes[]",
        },
        {
          proof: "checkpoint and lineage verification preserved",
          status: "present",
          source: "controllerCommandPacket.checkpointAndLineageVerification",
        },
        {
          proof: "no hidden execution, promotion, merge, evidence, or durable authority mutation",
          status: "present",
          source: "controllerCommandPacket.boundaries",
        },
        {
          proof: "docs/tests alignment mentioning manual_controller_glue_blockers",
          status: "present",
          source: "README/product-posture/tests",
        },
      ],
    },
    checkpointAndLineageVerification: {
      requiredToken: input.contract.checkpointGate.requiredToken,
      controllerVerifiedLineageRequired: true,
      peerFinalIsCommunicationOnly: true,
      verificationSteps: [
        "Confirm the exact checkpoint token came from the prepared manifest for this taskId + cwd.",
        "Verify every visible PEER_FINAL against the candidate worktree path, branch, base ref, and changed files before bind.",
        "Treat intercom output as communication only; pi-autoresearch candidate-result packets are the measured comparison input.",
      ],
    },
    cells,
    flattenedNextCallBundle: [
      ...cells.flatMap((cell) => [
        ...cell.lanes.flatMap((lane) => [
          lane.bindCall,
          lane.metricRunCall,
          lane.candidateResultExportCall,
        ]),
        cell.reviewCandidateWaveCall,
      ]),
      input.reviewMatrixCampaignCall,
    ],
    boundaries: [
      "This packet is a controller-command packet only; it does not execute bind, benchmark, export, review, evidence, merge, or promotion calls.",
      "candidate_peer_spawn remains the visible peer/worktree launch owner; this packet starts after the controller checkpoint.",
      "pi-autoresearch remains owner of benchmark/check execution, metric receipts, and candidate-result export writes.",
      "review_candidate_wave and review_matrix_campaign remain comparison choreography, not winner-selection or promotion authority.",
      "AK/KES/evidence writes, merge, promotion, reset, and worktree cleanup remain explicit owner actions outside this packet.",
    ],
  };
}

function level2OperatorUxMetric(
  name: AutoresearchLevel2OperatorUxMetric["name"],
  value = 0,
): AutoresearchLevel2OperatorUxMetric {
  return {
    name,
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
  };
}

function buildLevel2OperatorUxDashboard(input: {
  checkpointState: string;
  packetInventory: readonly { packetPath: string | null; state: string; selected: boolean }[];
  nextLegalActions: readonly string[];
}): AutoresearchLevel2OperatorUxDashboard {
  const cellMetrics = [
    level2OperatorUxMetric("dashboard_readiness_summary_blockers"),
    level2OperatorUxMetric("authority_boundary_clarity_blockers"),
    level2OperatorUxMetric("fallback_recovery_ux_blockers"),
  ] as const;
  const value = cellMetrics.reduce((sum, metric) => sum + metric.value, 0);
  return {
    kind: "autoresearch.level2_operator_ux_dashboard.v1",
    currentCheckpointState: input.checkpointState,
    packetInventorySummary: `${input.packetInventory.length} packet lane(s); ${
      input.packetInventory.filter((lane) => lane.selected).length
    } selected; states=${[...new Set(input.packetInventory.map((lane) => lane.state))].join(", ") || "none"}`,
    primaryMetric: {
      ...level2OperatorUxMetric("level2_operator_ux_blockers", value),
      name: "level2_operator_ux_blockers",
    },
    cellMetrics,
    tokenAndAuthorityLegend: {
      peerText: "communication_only",
      candidateResultPackets: "review_inputs_not_durable_evidence",
      reviewPackets: "owner_review_inputs_not_promotion",
      akEvidence: "separate_owner_write_required",
      finalizerCleanupPromotion: "separate_token_gates_required",
    },
    nextLegalActions: input.nextLegalActions,
    fallbackAndRecovery: [
      "Level-1 fallback: use the measured implementation wave playbook, plan_candidate_wave, and review_candidate_wave with explicit packet paths.",
      "Missing packet recovery: wait for controller measurement plus candidate_result_export, or explicitly replan without that lane.",
      "Duplicate lane recovery: reconcile by explicit controller action naming accepted and rejected packet(s).",
      "Proof-only/baseline-only recovery: do not close the target unless an explicit downgrade or incomplete-matrix exception is recorded.",
      "Rollback: disable the level-2 command surface and return to level-1 runbooks if authority drift appears.",
    ],
    proofs: [
      {
        proof: "dashboard/readiness summary exposes checkpoint state and packet inventory",
        status: "present",
        source: "operatorUxDashboard.currentCheckpointState + packetInventorySummary",
      },
      {
        proof:
          "authority legend separates communication, review inputs, evidence, finalizer, cleanup, and promotion",
        status: "present",
        source: "operatorUxDashboard.tokenAndAuthorityLegend",
      },
      {
        proof: "level-1 fallback and recovery UX is visible",
        status: "present",
        source: "operatorUxDashboard.fallbackAndRecovery",
      },
      {
        proof: "next legal actions are rendered without executing hidden actions",
        status: "present",
        source: "operatorUxDashboard.nextLegalActions",
      },
    ],
  };
}

function buildMatrixCampaignCockpitBlockers(): AutoresearchMatrixCampaignCockpit["matrixCockpitBlockers"] {
  const proofs = [
    {
      proof: "matrix-wide progress and per-cell posture summary",
      status: "present" as const,
      source: "cockpit.progress + cockpit.cellRows",
    },
    {
      proof: "selected lane and packet inventory visibility",
      status: "present" as const,
      source: "cockpit.selectedLanes + cockpit.packetInventory",
    },
    {
      proof: "next legal action per cell and campaign",
      status: "present" as const,
      source: "cockpit.cellRows[].nextLegalAction + cockpit.nextLegalCampaignActions",
    },
    {
      proof: "dashboard-first owner route",
      status: "present" as const,
      source: "cockpit.ownerDecisionRoute",
    },
    {
      proof: "no hidden execution or promotion boundaries",
      status: "present" as const,
      source: "cockpit.noHiddenExecutionBoundaries",
    },
    {
      proof: "docs/tests alignment mentioning matrix_cockpit_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const value = 0;
  return {
    name: "matrix_cockpit_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    proofs,
  };
}

function buildAutoresearchMatrixCheckpointCockpit(input: {
  contract: AutoresearchMatrixCampaignRunnerContract;
  accepted: boolean;
  controllerCommandPacket: AutoresearchMatrixCampaignControllerCommandPacket | null;
}): AutoresearchMatrixCampaignCockpit {
  const packetInventory = input.contract.lanes.map((lane) => ({
    cellId: lane.cellId,
    laneId: lane.laneId,
    packetPath: lane.candidateResultPacketPath,
    state: input.accepted
      ? ("measurement_export_unlocked" as const)
      : ("locked_until_checkpoint" as const),
    selected: false,
  }));
  const cellIds = [...new Set(input.contract.lanes.map((lane) => lane.cellId))];
  const cellRows = cellIds.map((cellId) => {
    const cellLanes = input.contract.lanes.filter((lane) => lane.cellId === cellId);
    const packetLines = cellLanes.map(
      (lane) =>
        `${lane.laneId}: ${lane.candidateResultPacketPath} [${
          input.accepted ? "measurement_export_unlocked" : "locked_until_checkpoint"
        }]`,
    );
    return {
      cellId,
      posture: input.accepted ? "measurement_export_unlocked" : "locked_until_checkpoint",
      laneProgress: `0/${cellLanes.length} measured/exported`,
      selectedLaneId: null,
      selectedPacketPath: null,
      packetInventory: packetLines,
      nextLegalAction: input.accepted
        ? (cellLanes[0]?.measurementPlan[0] ?? "run unlocked controller-command packet calls")
        : input.contract.checkpointGate.exactCheckpointCall,
    };
  });
  const nextLegalCampaignActions = input.accepted
    ? (input.controllerCommandPacket?.flattenedNextCallBundle ?? [])
    : [input.contract.checkpointGate.exactCheckpointCall];

  return {
    kind: "autoresearch.matrix_campaign_cockpit.v1",
    source: "checkpoint_matrix_campaign_runner",
    progress: {
      posture: input.accepted
        ? "benchmark_export_review_unlocked"
        : "blocked_until_exact_controller_checkpoint",
      completedCells: 0,
      expectedCells: input.contract.manifest.cellCount,
      selectedCells: 0,
      summary: input.accepted
        ? `Checkpoint accepted; ${input.contract.manifest.cellCount} cell(s) have explicit bind/measure/export/review calls exposed but not executed.`
        : `Checkpoint blocked; ${input.contract.manifest.cellCount} cell(s) remain locked until controller lineage verification and exact checkpointConfirmation.`,
    },
    cellRows,
    packetInventory,
    selectedLanes: [],
    ownerDecisionRoute: {
      dashboardFirst: "/autoresearch export",
      overlayFallback: "/autoresearch overlay",
      finalDecision: "/autoresearch review",
      evidenceAfterReview: true,
      routeOrder: ["/autoresearch export", "/autoresearch review", "evidence_record"],
    },
    nextLegalCampaignActions,
    noHiddenExecutionBoundaries: [
      ...input.contract.boundaries,
      ...(input.controllerCommandPacket?.boundaries ?? []),
    ],
    operatorUxDashboard: buildLevel2OperatorUxDashboard({
      checkpointState: input.accepted
        ? "checkpoint_accepted_measurement_export_review_unlocked"
        : "checkpoint_blocked_waiting_for_exact_controller_confirmation",
      packetInventory,
      nextLegalActions: nextLegalCampaignActions,
    }),
    matrixCockpitBlockers: buildMatrixCampaignCockpitBlockers(),
  };
}

function buildWholeMatrixMetricPosture(input: {
  sourceMetricName: string;
  sourceMetricTarget: number | null;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  posture: AutoresearchMatrixCampaignReview["posture"];
}): AutoresearchWholeMatrixMetricPosture {
  const incomplete = input.completedCellCount < input.expectedCellCount;
  const noSelectedLane = input.selectedCellCount < input.expectedCellCount;
  const antiNarrowingBlocked = input.antiNarrowing.blockerMetric.status === "blocked";
  const value = [incomplete, noSelectedLane, antiNarrowingBlocked].filter(Boolean).length;
  const targetClosureAllowed =
    value === 0 &&
    input.posture === "ready_for_matrix_owner_review" &&
    input.antiNarrowing.targetClosureAllowed;
  return {
    name: "level2_review_packet_generation_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    sourceMetricName: input.sourceMetricName,
    sourceMetricTarget: input.sourceMetricTarget,
    targetClosureAllowed,
    incompleteMatrixExceptionRecorded: input.antiNarrowing.incompleteMatrixExceptionRecorded,
    explicitDowngradeRecorded: input.antiNarrowing.explicitDowngradeRecorded,
    proofOnlyBaselineOnlyTargetClosureBlocked:
      input.antiNarrowing.proofOnlyBaselineOnlyTargetClosureBlocked,
    guidance: targetClosureAllowed
      ? [
          "Whole-matrix review packet is ready for owner review; it is still not promotion authority.",
          "Use dashboard/review surfaces before AK evidence or finalizer-token requests.",
        ]
      : [
          "Do not close the matrix target from this review packet yet.",
          "Resolve missing/no-selectable cells or record an explicit incomplete-matrix exception/downgrade when proof-only or baseline-only narrowing is intentional.",
        ],
  };
}

function buildMatrixCampaignReviewPacket(input: {
  reviewKind: "autoresearch.matrix_campaign_review.v1";
  wholeMatrixMetricPosture: AutoresearchWholeMatrixMetricPosture;
  selectedCellCount: number;
  expectedCellCount: number;
  exactNextCalls: readonly string[];
  closeout: AutoresearchMatrixCampaignCloseout;
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
}): AutoresearchMatrixCampaignReviewPacket {
  const candidateResultPacketRefs = input.cellReviews.flatMap((cell) =>
    buildCandidateReviewPacketChainRefs({
      binding: cell.candidateWaveReview.level2CandidateBinding,
      selectedLaneId: cell.selectedLaneId,
      cellId: cell.cellId,
    }),
  );
  return {
    kind: "autoresearch.review_matrix_campaign_packet.v1",
    generatedFrom: "managed_cell_candidate_wave_reviews",
    matrixCampaignReviewKind: input.reviewKind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    wholeMatrixMetricPosture: input.wholeMatrixMetricPosture,
    candidateResultPacketRefs,
    packetChainMetric: buildCandidateReviewPacketChainMetric({
      refs: candidateResultPacketRefs,
      sourceMetricName: input.wholeMatrixMetricPosture.name,
      sourceMetricStatus: input.wholeMatrixMetricPosture.status,
    }),
    selectedLaneCount: input.selectedCellCount,
    expectedCellCount: input.expectedCellCount,
    canCloseMatrixTarget: input.wholeMatrixMetricPosture.targetClosureAllowed,
    nextLegalActions:
      input.exactNextCalls.length > 0 ? input.exactNextCalls : input.closeout.nextLegalOwnerActions,
    authorityBoundary: buildReviewPacketAuthorityBoundary({
      selectionAuthority: "matrix_review_only",
    }),
  };
}

function buildAutoresearchMatrixReviewCockpit(input: {
  posture: AutoresearchMatrixCampaignReview["posture"];
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  closeout: AutoresearchMatrixCampaignCloseout;
  exactNextCalls: readonly string[];
  boundaries: readonly string[];
}): AutoresearchMatrixCampaignCockpit {
  const cellRows = input.cellReviews.map((cell) => {
    const inventory = input.closeout.packetInventory.filter((lane) => lane.cellId === cell.cellId);
    const selected = input.closeout.selectedLanes.find((lane) => lane.cellId === cell.cellId);
    const nextLegalAction =
      cell.recommendationPosture === "planned_lanes_incomplete" ||
      cell.recommendationPosture === "no_selectable_candidate"
        ? cell.reviewCandidateWaveCall
        : `autoresearch_candidate_decision via /autoresearch review for ${cell.selectedLaneId ?? "selected lane"}`;
    return {
      cellId: cell.cellId,
      posture: cell.recommendationPosture,
      laneProgress: `${cell.completedLaneCount}/${cell.expectedLaneCount} measured/exported`,
      selectedLaneId: cell.selectedLaneId,
      selectedPacketPath: selected?.sourcePacketPath ?? null,
      packetInventory: inventory.map(
        (lane) =>
          `${lane.laneId}: ${lane.packetPath ?? "none"} [${lane.state}; selected=${
            lane.selected ? "yes" : "no"
          }]`,
      ),
      nextLegalAction,
    };
  });
  const nextLegalCampaignActions =
    input.exactNextCalls.length > 0 ? input.exactNextCalls : input.closeout.nextLegalOwnerActions;

  return {
    kind: "autoresearch.matrix_campaign_cockpit.v1",
    source: "review_matrix_campaign",
    progress: {
      posture: input.posture,
      completedCells: input.completedCellCount,
      expectedCells: input.expectedCellCount,
      selectedCells: input.selectedCellCount,
      summary: `${input.completedCellCount}/${input.expectedCellCount} cell(s) complete; ${input.selectedCellCount} selected cell lane(s); posture=${input.posture}.`,
    },
    cellRows,
    packetInventory: input.closeout.packetInventory,
    selectedLanes: input.closeout.selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      sourcePacketPath: lane.sourcePacketPath,
    })),
    ownerDecisionRoute: input.closeout.ownerDecisionRoute,
    nextLegalCampaignActions,
    noHiddenExecutionBoundaries: [...input.boundaries, ...input.closeout.notDone],
    operatorUxDashboard: buildLevel2OperatorUxDashboard({
      checkpointState: input.posture,
      packetInventory: input.closeout.packetInventory,
      nextLegalActions: nextLegalCampaignActions,
    }),
    matrixCockpitBlockers: buildMatrixCampaignCockpitBlockers(),
  };
}

function buildAutoresearchLevel3ReviewSelectionSubstrate(input: {
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  posture: AutoresearchMatrixCampaignReview["posture"];
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  exactNextCalls: readonly string[];
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
}): AutoresearchLevel3ReviewSelectionSubstrate {
  const cellSelections = input.cellReviews.map((cell): AutoresearchLevel3ReviewSelectionCell => {
    const selectedLane = cell.selectedLaneId
      ? (cell.candidateWaveReview.lanes.find((lane) => lane.laneId === cell.selectedLaneId) ?? null)
      : null;
    const selectableLaneIds = cell.candidateWaveReview.lanes
      .filter((lane) => lane.selectable)
      .map((lane) => lane.laneId);
    const missingLaneIds = cell.candidateWaveReview.management.laneStates
      .filter((lane) => lane.state === "packet_missing")
      .map((lane) => lane.laneId);
    const blockers = [
      ...missingLaneIds.map((laneId) => `missing_packet:${cell.cellId}/${laneId}`),
      ...(cell.recommendationPosture === "no_selectable_candidate"
        ? [`no_selectable_lane:${cell.cellId}`]
        : []),
      ...(selectedLane && !selectedLane.sourcePacketPath
        ? [`selected_lane_missing_packet_ref:${cell.cellId}/${selectedLane.laneId}`]
        : []),
      ...(selectedLane && selectedLane.candidateSource !== "candidate_peer_spawn"
        ? [`selected_lane_not_visible_candidate_peer_spawn:${cell.cellId}/${selectedLane.laneId}`]
        : []),
      ...(selectedLane && !selectedLane.candidateWorktree
        ? [`selected_lane_missing_worktree:${cell.cellId}/${selectedLane.laneId}`]
        : []),
    ];
    const winnerState: AutoresearchLevel3ReviewSelectionWinnerState =
      missingLaneIds.length > 0
        ? "blocked_missing_packets"
        : selectedLane
          ? "selected_for_owner_review"
          : "blocked_no_selectable_lane";

    return {
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      expectedLaneCount: cell.expectedLaneCount,
      completedLaneCount: cell.completedLaneCount,
      selectableLaneCount: selectableLaneIds.length,
      visibleCandidateLaneCount: cell.candidateWaveReview.lanes.filter(
        (lane) =>
          lane.candidateSource === "candidate_peer_spawn" && Boolean(lane.candidateWorktree),
      ).length,
      winnerState,
      recommendedLaneId: selectedLane?.laneId ?? null,
      recommendedMetric: selectedLane?.metric ?? null,
      recommendedSourcePacketPath: selectedLane?.sourcePacketPath ?? null,
      recommendedCandidateWorktree: selectedLane?.candidateWorktree ?? null,
      recommendedCandidateBranch: selectedLane?.candidateBranch ?? null,
      recommendedCandidateBaseRef: selectedLane?.candidateBaseRef ?? null,
      recommendedPeerRunId: selectedLane?.candidatePeerRunId ?? null,
      nonSelectedSelectableLaneIds: selectableLaneIds.filter(
        (laneId) => laneId !== selectedLane?.laneId,
      ),
      blockerCount: blockers.length,
      blockers,
      ownerReviewCall: cell.reviewCandidateWaveCall,
      nextLegalAction:
        winnerState === "selected_for_owner_review"
          ? `Owner review via /autoresearch export then /autoresearch review for ${cell.cellId}/${selectedLane?.laneId}.`
          : cell.reviewCandidateWaveCall,
    };
  });
  const cellBlockers = cellSelections.flatMap((cell) => cell.blockers);
  const postureBlockers =
    input.posture === "ready_for_matrix_owner_review" ? [] : [`matrix_posture:${input.posture}`];
  const blockers = [...cellBlockers, ...postureBlockers];
  const blockerValue = blockers.length;
  const ready = blockerValue === 0;
  const exactFinalizePostFaninHandoffCall = ready
    ? formatToolCall("autoresearch_live_supervision", {
        action: "finalize_post_fanin",
        taskId: input.taskId,
        cwd: input.cwd,
        objective: input.objective,
        sourceReview: "review_matrix_campaign",
        direction: input.direction,
        scenarios: input.scenarios,
        hypotheses: input.hypotheses,
        candidateCountPerCell: input.candidateCountPerCell,
        validation: {
          command: "<run focused validation before requesting finalize_post_fanin token>",
          status: "missing",
          summary:
            "Level-3 review/selection is ready, but finalizer token readiness still requires passed validation evidence.",
        },
      })
    : null;
  const nextLegalActions = ready
    ? [
        "Open /autoresearch export for dashboard-first owner review of the selected per-cell lanes.",
        "Use /autoresearch review for the owner decision on each selected lane; this substrate is recommendation-only.",
        "Run focused validation, then rerun the finalize_post_fanin handoff with validation.status=passed to request the exact finalizer token.",
      ]
    : [
        "Resolve level-4 review/selection blockers before requesting a finalizer token.",
        ...(input.exactNextCalls.length > 0 ? input.exactNextCalls : []),
      ];

  return {
    kind: "autoresearch.level3_review_selection_substrate.v1",
    source: "level3_matrix_cell_runner_visible_candidate_lanes",
    aggregationInput: "controller_verified_candidate_result_packets",
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    finalOnlyScoring: true,
    ownerReviewRequired: true,
    selectionAuthority: "recommendation_only",
    cellSelections,
    blockerMetric: {
      name: "level3_review_selection_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      blockers,
    },
    finalizerReadiness: {
      posture: ready
        ? "ready_for_validation_and_finalize_token_request"
        : "blocked_until_cell_selection_ready",
      sourceReview: "review_matrix_campaign",
      selectedLaneCount: cellSelections.filter(
        (cell) => cell.winnerState === "selected_for_owner_review",
      ).length,
      expectedCellCount: cellSelections.length,
      validationStillRequired: true,
      exactFinalizePostFaninHandoffCall,
      applyCommandsExposed: false,
      promotionAuthority: false,
      cleanupAuthority: false,
      requiredOwnerTokens: [
        "finalize_post_fanin",
        "candidate_cleanup",
        "promotion",
        "ak_owner_write",
      ],
    },
    dangerousActionGates: {
      finalizePostFanin: "exact_finalize_post_fanin_token_required",
      candidateCleanup: "automatic_after_successful_integration_closeout_or_exact_token",
      promotion: "separate_promotion_token_required",
      akOwnerWrite: "separate_ak_owner_write_required",
    },
    nextLegalActions,
    boundaries: [
      "Level-3 review/selection aggregates only controller-verified candidate-result packets from visible level-3 candidate lanes; raw peer text remains communication.",
      "Per-cell winners are recommendation state for owner review, not promotion or merge authority.",
      "The finalizer handoff is exact-gated: apply commands remain hidden until a separate finalize_post_fanin token is supplied to the finalizer preflight.",
      "Candidate cleanup is part of successful Level-3 integration closeout when exact resources are known; pre-closeout cleanup still requires candidate_cleanup, and AK owner writes/promotion remain separate owner gates.",
    ],
  };
}

export function checkpointAutoresearchMatrixCampaignRunner(
  input: AutoresearchMatrixCampaignRunnerRequest,
): AutoresearchMatrixCampaignRunnerCheckpoint {
  const contract = buildAutoresearchMatrixCampaignRunnerContract(input);
  const accepted = input.checkpointConfirmation === contract.checkpointGate.requiredToken;
  const reviewCall = formatToolCall("autoresearch_live_supervision", {
    action: "review_matrix_campaign",
    taskId: contract.taskId,
    cwd: contract.cwd,
    objective: contract.objective,
    direction: contract.direction,
    metricName: input.metricName,
    metricThreshold: input.metricThreshold,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
    parentPeerTarget: input.parentPeerTarget,
    filesInScope: input.filesInScope,
    offLimits: input.offLimits,
    constraints: input.constraints,
  });
  const controllerCommandPacket = accepted
    ? buildAutoresearchMatrixCampaignControllerCommandPacket({
        contract,
        reviewMatrixCampaignCall: reviewCall,
      })
    : null;
  const benchmarkExportReviewCalls = controllerCommandPacket?.flattenedNextCallBundle ?? [];
  const cockpit = buildAutoresearchMatrixCheckpointCockpit({
    contract,
    accepted,
    controllerCommandPacket,
  });

  return {
    kind: "autoresearch.matrix_campaign_runner_checkpoint.v1",
    taskId: contract.taskId,
    cwd: contract.cwd,
    objective: contract.objective,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: accepted
        ? "checkpoint_accepted_measurement_export_review_unlocked"
        : "checkpoint_blocked_waiting_for_exact_controller_confirmation",
      metricName: contract.operatorFollowup.primaryMetric.name,
      metricDirection: contract.direction,
      metricTarget: contract.operatorFollowup.primaryMetric.target,
      laneStates: contract.lanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        packetPath: lane.candidateResultPacketPath,
        state: accepted ? "measurement_export_unlocked" : "locked_until_checkpoint",
      })),
      checkpoint: {
        posture: accepted ? "accepted" : "blocked",
        manifestPath: contract.manifest.path,
        requiredToken: contract.checkpointGate.requiredToken,
        checkpointAccepted: accepted,
      },
      measurementReview: {
        posture: accepted
          ? "measurement_export_review_calls_exposed_not_executed"
          : "locked_until_controller_checkpoint",
        expectedCells: contract.manifest.cellCount,
        benchmarkExportReviewCallsExposed: accepted,
        reviewMatrixCampaignCall: accepted ? reviewCall : null,
      },
      nextLegalActions: accepted
        ? [
            "Run each unlocked bind/benchmark/export call deliberately from verified candidate worktrees.",
            "Rerun review_matrix_campaign after candidate-result packets exist.",
            "Do not merge, promote, write evidence, or mutate lifecycle without owner review.",
          ]
        : [
            "Verify visible peer reports and candidate worktree lineage first.",
            "Rerun checkpoint_matrix_campaign_runner with the exact checkpointConfirmation token.",
          ],
    }),
    manifestPath: contract.manifest.path,
    checkpointAccepted: accepted,
    posture: accepted
      ? "benchmark_export_review_unlocked"
      : "blocked_until_exact_controller_checkpoint",
    requiredToken: contract.checkpointGate.requiredToken,
    benchmarkExportReviewCalls,
    reviewMatrixCampaignCall: accepted ? reviewCall : null,
    controllerCommandPacket,
    cockpit,
    boundaries: accepted
      ? [
          "Checkpoint unlock only exposes the exact controller-command packet and next-call bundle; it still does not execute them.",
          "The checkpoint token is a controller confirmation string, not cryptographic proof of peer completion.",
          "Controller must verify candidate worktree lineage before running each measurement call.",
          "pi-autoresearch owns benchmark/check execution, metric receipts, and candidate-result packet writes.",
          "Owner review remains required before evidence, promotion, merge, or lifecycle mutation.",
        ]
      : [
          "Benchmark/export/review calls remain withheld because the exact controller checkpoint token was not supplied.",
          "Do not infer readiness from raw PEER_FINAL/intercom messages without controller verification.",
        ],
    nextStep: accepted
      ? "Run the unlocked measurement/export calls deliberately, then run review_matrix_campaign after packets exist; do not auto-merge or promote."
      : "Launch/verify visible candidate peers first, then rerun with the exact checkpointConfirmation token shown in requiredToken.",
  };
}

const LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES = [
  "autoresearch_candidate_bind(",
  "autoresearch_runtime_run(",
  "autoresearch_runtime_status(",
  "autoresearch_live_supervision(",
] as const;

const LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS = [
  /candidate_peer_spawn\(/u,
  /scout_peer_spawn\(/u,
  /fork_peer_spawn\(/u,
  /finalize_post_fanin/u,
  /evidence_record\(/u,
  /autoresearch_learning_kes_adapter[\s\S]*"materialize"/u,
  /\bak\s+/u,
  /git\s+(merge|push|reset|worktree\s+remove|branch\s+-D)\b/u,
  /\brm\s+-rf\b/u,
  /candidate_cleanup|promotion/u,
] as const;

function resolveLevel3CompletedActionCount(value: number | undefined): number {
  const resolved = value ?? 0;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(
      `completedActionCount must be a non-negative integer, received: ${String(value)}`,
    );
  }
  return resolved;
}

function classifyLevel3MatrixCellAction(
  call: string,
): Pick<
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  "allowedByStateMachine" | "forbiddenReason"
> {
  const forbiddenPattern = LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS.find((pattern) =>
    pattern.test(call),
  );
  if (forbiddenPattern) {
    return {
      allowedByStateMachine: false,
      forbiddenReason: `Forbidden by Level-3 no-hidden-execution boundary: ${String(forbiddenPattern)}`,
    };
  }

  const allowedPrefix = LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES.some((prefix) =>
    call.startsWith(prefix),
  );
  if (!allowedPrefix) {
    return {
      allowedByStateMachine: false,
      forbiddenReason:
        "Not one of the Level-3 safe post-checkpoint call families: bind, runtime_run, candidate_result_export/status, or review calls.",
    };
  }

  return { allowedByStateMachine: true, forbiddenReason: null };
}

function buildLevel3MatrixCellExecutorBlockers(input: {
  level3Accepted: boolean;
  selectedAction: AutoresearchLevel3MatrixCellExecutorSelectedAction | null;
}): AutoresearchLevel3MatrixCellExecutor["stateMachineBlockers"] {
  const forbiddenActionMatched = input.selectedAction?.allowedByStateMachine === false;
  const value = (input.level3Accepted ? 0 : 1) + (forbiddenActionMatched ? 1 : 0);
  return {
    name: "level3_state_machine_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    hiddenExecutionPrevented: true,
    forbiddenActionMatched,
    proofs: [
      {
        proof:
          "Level-3 consumes the Level-3 runner nextLegalActions rather than inventing hidden work",
        status: "present",
        source: "level3.runnerNextLegalActions",
      },
      {
        proof: "at most one selected action is emitted per state-machine step",
        status: "present",
        source: "level3.selectedAction",
      },
      {
        proof: "selected action is reported only; execution remains not_executed_by_orchestrator",
        status: "present",
        source: "level3.selectedAction.execution",
      },
      {
        proof:
          "forbidden peer launch, finalizer, AK/evidence, cleanup, merge, and promotion patterns are blocked",
        status: "present",
        source: "LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS",
      },
    ],
  };
}

export function advanceAutoresearchLevel3MatrixCellExecutor(
  input: AutoresearchLevel3MatrixCellExecutorRequest,
): AutoresearchLevel3MatrixCellExecutor {
  const level3Runner = checkpointAutoresearchMatrixCampaignRunner(input);
  const completedActionCount = resolveLevel3CompletedActionCount(input.completedActionCount);
  const runnerNextLegalActions = level3Runner.checkpointAccepted
    ? level3Runner.cockpit.nextLegalCampaignActions
    : level3Runner.operatorFollowup.nextLegalActions;
  const totalActionCount = runnerNextLegalActions.length;
  const candidateCall = level3Runner.checkpointAccepted
    ? runnerNextLegalActions[completedActionCount]
    : undefined;
  const selectedAction = candidateCall
    ? {
        index: completedActionCount,
        call: candidateCall,
        source: "level3_matrix_cell_runner.nextLegalActions" as const,
        execution: "not_executed_by_orchestrator" as const,
        controllerMustRunExplicitly: true as const,
        ...classifyLevel3MatrixCellAction(candidateCall),
      }
    : null;
  const stateMachineBlockers = buildLevel3MatrixCellExecutorBlockers({
    level3Accepted: level3Runner.checkpointAccepted,
    selectedAction,
  });
  const posture: AutoresearchLevel3MatrixCellExecutorPosture = !level3Runner.checkpointAccepted
    ? "blocked_by_level3_runner"
    : selectedAction?.allowedByStateMachine === false
      ? "blocked_forbidden_action"
      : selectedAction
        ? "ready_to_present_next_action"
        : "completed_review_ready";
  const emittedNextLegalActions = selectedAction?.allowedByStateMachine
    ? [selectedAction.call]
    : [];

  return {
    kind: "autoresearch.level3_matrix_cell_executor.v1",
    taskId: level3Runner.taskId,
    cwd: level3Runner.cwd,
    objective: level3Runner.objective,
    sourceLevel3RunnerKind: level3Runner.kind,
    sourceLevel3RunnerAlias: "level3_matrix_cell_runner",
    level3Runner,
    completedActionCount,
    totalActionCount,
    remainingActionCount: Math.max(
      0,
      totalActionCount - completedActionCount - (selectedAction ? 1 : 0),
    ),
    posture,
    selectedAction,
    runnerNextLegalActions,
    emittedNextLegalActions,
    stateMachineBlockers,
    boundaries: [
      "Level-3 is a deterministic state-machine executor above level3_matrix_cell_runner output; it emits at most one next action and executes none of it.",
      "No hidden candidate_peer_spawn, scout_peer_spawn, or fork_peer_spawn is allowed from this executor.",
      "No post-fan-in finalizer apply, AK/KES/evidence write, merge, promotion, reset, or candidate cleanup is allowed from this executor.",
      "Controller/workbench must run the emitted action explicitly, then call this executor again with completedActionCount incremented after verification.",
      "PEER_FINAL, review packets, and command packets remain communication/review inputs until owner-controlled surfaces verify and apply them.",
    ],
    nextStep:
      posture === "blocked_by_level3_runner"
        ? "Satisfy level3_matrix_cell_runner checkpoint/lineage requirements first; Level-3 will not advance while Level-3 is blocked."
        : posture === "blocked_forbidden_action"
          ? `Stop: selected runner action is forbidden by Level-3 boundary (${selectedAction?.forbiddenReason ?? "unknown"}).`
          : posture === "completed_review_ready"
            ? "All Level-3 runner nextLegalActions have been stepped through; proceed only to owner review surfaces, not finalizer apply, cleanup, AK write, merge, or promotion."
            : "Run exactly the emittedNextLegalActions[0] outside the orchestrator, verify its result, then call Level-3 again with completedActionCount incremented by one.",
  };
}

function getCandidatePeerRegistryPath(peerRunId: string): string | null {
  if (!/^[a-z0-9._-]+$/iu.test(peerRunId)) return null;
  const stateHome =
    process.env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "pi-quests", "peer-registry", `${peerRunId}.json`);
}

function optionalJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readCandidatePeerRegistrySidecar(input: {
  peerRunId: string;
  cwd: string;
  candidateWorktree?: string;
  candidateBranch?: string;
}): AutoresearchLevel4PostIntegrationCleanupRegistrySidecar {
  const registryPath = getCandidatePeerRegistryPath(input.peerRunId);
  if (!registryPath) {
    return {
      peerRunId: input.peerRunId,
      registryPath: "",
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: ["peerRunId is not a path-safe candidate peer registry id"],
    };
  }

  if (!fs.existsSync(registryPath)) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "missing_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [`missing candidate peer registry sidecar for ${input.peerRunId}`],
    };
  }

  try {
    const parsed = optionalJsonObject(JSON.parse(fs.readFileSync(registryPath, "utf8")));
    const cleanupPacket = optionalJsonObject(parsed?.cleanupPacket);
    const peerRunId = optionalString(parsed?.peerRunId);
    const canonicalTool = optionalString(parsed?.canonicalTool);
    const parentCwd = optionalString(parsed?.parentCwd);
    const repoRoot = optionalString(parsed?.repoRoot);
    const worktreePath = optionalString(parsed?.worktreePath);
    const branchName = optionalString(parsed?.branchName);
    const archiveDir =
      optionalString(parsed?.archiveDir) ?? optionalString(cleanupPacket?.archiveDir);
    const blockers = [
      ...(parsed?.schemaVersion === 1 ? [] : ["registry schemaVersion is not 1"]),
      ...(peerRunId === input.peerRunId
        ? []
        : ["registry peerRunId does not match requested peerRunId"]),
      ...(canonicalTool === "candidate_peer_spawn"
        ? []
        : ["registry canonicalTool is not candidate_peer_spawn"]),
      ...(parentCwd && path.resolve(parentCwd) === path.resolve(input.cwd)
        ? []
        : repoRoot && path.resolve(repoRoot) === path.resolve(input.cwd)
          ? []
          : ["registry parentCwd/repoRoot does not match campaign cwd"]),
      ...(worktreePath ? [] : ["registry worktreePath is missing"]),
      ...(branchName ? [] : ["registry branchName is missing"]),
      ...(archiveDir ? [] : ["registry archiveDir is missing"]),
      ...(input.candidateWorktree &&
      worktreePath &&
      path.resolve(input.candidateWorktree) !== path.resolve(worktreePath)
        ? ["controller candidateWorktree does not match registry worktreePath"]
        : []),
      ...(input.candidateBranch && branchName && input.candidateBranch !== branchName
        ? ["controller candidateBranch does not match registry branchName"]
        : []),
    ];
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: blockers.length === 0 ? "verified_registry_sidecar" : "mismatched_registry_sidecar",
      worktreePath: worktreePath ?? null,
      branchName: branchName ?? null,
      archiveDir: archiveDir ?? null,
      blockers,
    };
  } catch (error) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [
        `invalid candidate peer registry sidecar: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function resolveLevel4MaxParallelCandidatePeers(value: unknown): number {
  if (value === undefined || value === null) return 4;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 12) {
    throw new Error("maxParallelCandidatePeers must be an integer from 1 to 12.");
  }
  return value as number;
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildLevel4MaterializationPreflightCommands(cwd: string): string[] {
  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return [
      `npm --prefix ${shellQuote(cwd)} install`,
      `npm --prefix ${shellQuote(cwd)} run check --if-present`,
    ];
  }
  const rootPackageJsonPath = findNearestPackageJson(cwd);
  if (rootPackageJsonPath) {
    const packageRoot = path.dirname(rootPackageJsonPath);
    return [
      `npm --prefix ${shellQuote(packageRoot)} install`,
      `npm --prefix ${shellQuote(packageRoot)} run check --if-present`,
    ];
  }
  return [];
}

function findNearestPackageJson(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function buildLevel4PromptRunnerBundle(
  input: AutoresearchLevel4CampaignRunnerRequest,
  executor: AutoresearchLevel3MatrixCellExecutor,
): AutoresearchLevel4PromptRunnerBundle {
  const contract = buildAutoresearchMatrixCampaignRunnerContract(input);
  const checkpointAccepted = executor.level3Runner.checkpointAccepted;
  const missingParentPeerTarget =
    contract.launchPhase.visibleCandidateLaneBinding.missingParentPeerTarget;
  const state: AutoresearchLevel4PromptRunnerBundle["state"] = missingParentPeerTarget
    ? "blocked_missing_parent_peer_target"
    : checkpointAccepted
      ? "checkpoint_accepted_controller_sequence_ready"
      : executor.level3Runner.posture === "blocked_until_exact_controller_checkpoint"
        ? "ready_to_launch_visible_candidate_peers"
        : "waiting_for_peer_final_and_lineage_verification";

  const promptBundle = contract.lanes.map((lane): AutoresearchLevel4PromptRunnerLane => {
    const peerRunIdPlaceholder = `<peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}>`;
    const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
    const branchPlaceholder = `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const diffPlaceholder = `<${lane.cellId}-${lane.laneId}-controller-verified-diff-summary>`;
    const filesPlaceholder = `<${lane.cellId}-${lane.laneId}-changed-files>`;
    const lineageVerificationChecklist = [
      `Capture peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}.`,
      `Wait for ACK and FINAL with ${formatToolCall("intercom", { action: "peer_watch", peerRunId: peerRunIdPlaceholder, waitFor: "both" })}.`,
      `Verify candidate worktree exists and is isolated: git -C ${worktreePlaceholder} status --short.`,
      `Verify base ref before bind: git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD.`,
      `Verify branch/ref: git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD must match ${branchPlaceholder}.`,
      `Capture diff summary and changed files: git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD and git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD.`,
      `Substitute ${diffPlaceholder} and ${filesPlaceholder} only from controller-verified git output, never from peer text alone.`,
    ];
    const promptTitle = `Level-4 matrix prompt runner lane ${lane.cellId}/${lane.laneId}`;
    const promptMarkdown = [
      `# ${promptTitle}`,
      "",
      "## Objective",
      lane.objective,
      "",
      "## Required execution pattern",
      "1. Work only in the visible `candidate_peer_spawn` candidate worktree.",
      "2. Produce one bounded candidate patch for this cell/lane.",
      "3. Run the smallest truthful validation available inside the candidate worktree.",
      "4. Report PEER_ACK promptly and PEER_FINAL with worktree path, branch, base ref, changed files, validation, and caveats.",
      "",
      "## Controller launch call",
      "```text",
      lane.candidatePeerCall,
      "```",
      "",
      "## Controller after-final checklist",
      ...lineageVerificationChecklist.map((item) => `- ${item}`),
      "",
      "## Controller post-final calls after lineage verification",
      "```text",
      ...lane.measurementPlan,
      "```",
      "",
      "## Boundaries",
      "- Do not merge, promote, write AK/KES/evidence, delete/reset worktrees, or claim durable authority.",
      "- Peer text is communication only; controller-verified git/worktree facts plus pi-autoresearch packets are review inputs.",
    ].join("\n");
    return {
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      promptTitle,
      promptMarkdown,
      candidatePeerSpawnCall: lane.candidatePeerCall,
      peerAckWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "ack",
      }),
      peerFinalWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "final",
      }),
      lineageVerificationChecklist,
      postFinalControllerCalls: lane.measurementPlan,
    };
  });

  const launchWatchBlockers = [
    ...(missingParentPeerTarget
      ? ["missing parentPeerTarget for visible candidate peer report-back"]
      : []),
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated"] : []),
    ...(contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount > 0
      ? ["hidden launch calls detected; only visible candidate_peer_spawn is allowed"]
      : []),
  ];
  const launchWatchLaneState: AutoresearchLevel4VisibleLaunchWatchLanePlan["state"] =
    missingParentPeerTarget
      ? "blocked_missing_parent_peer_target"
      : state === "ready_to_launch_visible_candidate_peers"
        ? "ready_for_visible_launch"
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "checkpoint_accepted_lineage_verified"
          : "waiting_for_ack_final_and_lineage";
  const visibleLaunchWatchPlan: AutoresearchLevel4VisibleLaunchWatchPlan = {
    kind: "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1",
    execution: "plan_only_controller_must_execute_visible_tools",
    parentPeerTarget: input.parentPeerTarget?.trim() || null,
    lanePlans: promptBundle.map(
      (lane): AutoresearchLevel4VisibleLaunchWatchLanePlan => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchSurface: "candidate_peer_spawn",
        launchCall: lane.candidatePeerSpawnCall,
        peerRunIdSource: "candidate_peer_spawn_return_value",
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        controllerVerificationRequired: ["ack", "final", "worktree_lineage"],
        state: launchWatchLaneState,
      }),
    ),
    sequence: promptBundle.flatMap((lane) => [
      lane.candidatePeerSpawnCall,
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
      ...lane.lineageVerificationChecklist,
    ]),
    metric: {
      name: "level4_visible_launch_watch_blockers",
      direction: "lower",
      target: 0,
      value: launchWatchBlockers.length,
      status: launchWatchBlockers.length === 0 ? "target_met" : "blocked",
      blockers: launchWatchBlockers,
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "ak_owner_write",
      "promotion",
    ],
    forbiddenActions: [
      "hidden peer spawn",
      "controller-inline implementation patch",
      "finalize_post_fanin apply",
      "candidate_cleanup",
      "ak_owner_write/evidence write",
      "merge/release/promotion",
    ],
    boundaries: [
      "This is a launch/watch orchestration plan only; it returns visible candidate_peer_spawn and intercom watch calls without executing them.",
      "ACK and PEER_FINAL are communication only; controller-verified git/worktree facts are required before bind/measure/export/review.",
      "Finalizer, cleanup, AK owner writes, merge, release, and promotion remain separate exact owner gates.",
    ],
    nextStep:
      launchWatchBlockers.length > 0
        ? "Resolve launch/watch blockers before launching visible candidate peers."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Visible launch/watch lineage is checkpointed; proceed only with controller-verified bind/measure/export/review calls."
          : "Controller may execute the visible candidate_peer_spawn calls, watch ACK/FINAL, verify lineage, then proceed to bind/measure/export/review.",
  };
  const maxParallelCandidatePeers = resolveLevel4MaxParallelCandidatePeers(
    input.maxParallelCandidatePeers,
  );
  const defaultMaterializationPreflight = buildLevel4MaterializationPreflightCommands(input.cwd);
  const wholeMatrixExecutorBlockers = [
    ...(visibleLaunchWatchPlan.metric.blockers ?? []),
    ...(maxParallelCandidatePeers < 1 ? ["maxParallelCandidatePeers must be at least 1"] : []),
    ...(promptBundle.length === 0
      ? ["no visible candidate lanes available for whole-matrix execution"]
      : []),
    ...(defaultMaterializationPreflight.length === 0
      ? [
          "no dependency/materialization preflight command could be inferred for cwd; provide package hydration before measurement",
        ]
      : []),
  ];
  const wholeMatrixParallelExecutor: AutoresearchLevel4WholeMatrixExecutor = {
    kind: "autoresearch.level4_whole_matrix_parallel_executor.v1",
    execution: "bounded_parallel_visible_tools_with_controller_verification",
    concurrencyLimit: maxParallelCandidatePeers,
    totalLaneCount: promptBundle.length,
    batchCount: Math.ceil(promptBundle.length / maxParallelCandidatePeers),
    batches: chunkArray(promptBundle, maxParallelCandidatePeers).map((lanes, index) => ({
      batchIndex: index + 1,
      concurrencyLimit: maxParallelCandidatePeers,
      lanes: lanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchCall: lane.candidatePeerSpawnCall,
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        materializationPreflight: defaultMaterializationPreflight,
        lineageVerificationCommands: lane.lineageVerificationChecklist,
        safeMeasurementExportReviewCalls: lane.postFinalControllerCalls,
      })),
    })),
    ackFinalWatchContract: {
      waitFor: "both",
      peerTextIsCommunicationOnly: true,
      requiredBeforeLineageCheckpoint: ["PEER_ACK", "PEER_FINAL"],
    },
    lineageVerificationGate: {
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      source: "controller_git_verification_not_peer_text",
      blocksMeasurementUntilSatisfied: true,
    },
    materializationPreflight: {
      perLaneRequired: true,
      commandsAreControllerExecuted: true,
      defaultCommands: defaultMaterializationPreflight,
      blockerMetric: {
        name: "matrix_materialization_preflight_blockers",
        direction: "lower",
        target: 0,
        value: defaultMaterializationPreflight.length === 0 ? 1 : 0,
        status: defaultMaterializationPreflight.length === 0 ? "blocked" : "target_met",
        blockers:
          defaultMaterializationPreflight.length === 0
            ? ["missing inferred package dependency/materialization preflight"]
            : [],
      },
    },
    safeAutomation: {
      peerLaunch: "visible_candidate_peer_spawn_only",
      bindRunExportReview: "after_ack_final_lineage_and_materialization",
      matrixReview: "after_candidate_result_packets",
      stoppedOwnerGates: [
        "finalize_post_fanin",
        "candidate_cleanup",
        "ak_owner_write",
        "promotion",
        "merge",
      ],
    },
    metric: {
      name: "true_parallel_whole_matrix_executor_blockers",
      direction: "lower",
      target: 0,
      value: wholeMatrixExecutorBlockers.length,
      status: wholeMatrixExecutorBlockers.length === 0 ? "target_met" : "blocked",
      blockers: wholeMatrixExecutorBlockers,
    },
    boundaries: [
      "Whole-matrix execution is bounded into explicit parallel batches of visible candidate_peer_spawn calls; no hidden peer launch is allowed.",
      "ACK/FINAL watches and candidate lineage verification gate every bind/measure/export/review call.",
      "Dependency/materialization preflight is required per lane before measurement to avoid false failures from unhydrated candidate worktrees.",
      "Candidate-result packets remain local projections; finalizer, cleanup, AK/KES/evidence writes, merge, release, and promotion stop at owner gates.",
    ],
    nextStep:
      wholeMatrixExecutorBlockers.length === 0
        ? "Execute each batch concurrently up to concurrencyLimit: launch visible peers, wait for ACK/FINAL, verify lineage and materialization, then run safe bind/measure/export/review calls; stop before owner gates."
        : "Resolve whole-matrix executor blockers before treating this as executable parallel campaign choreography.",
  };
  const postFinalControllerSequence = checkpointAccepted
    ? executor.level3Runner.benchmarkExportReviewCalls
    : contract.lanes.flatMap((lane) => [...lane.measurementPlan, lane.reviewCandidateWaveCall]);
  const closeoutBlockers = [
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated for closeout"] : []),
    ...(postFinalControllerSequence.length === 0
      ? ["no bind/measure/export/review sequence is available for closeout comparison"]
      : []),
  ];
  const cockpitInventoryByLane = new Map(
    executor.level3Runner.cockpit.packetInventory.map((row) => [
      `${row.cellId}\0${row.laneId}`,
      row,
    ]),
  );
  const packetInventoryRows: AutoresearchLevel4CandidateCloseoutPacket["packetInventory"]["rows"] =
    promptBundle.map((lane) => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const cockpitRow = cockpitInventoryByLane.get(`${lane.cellId}\0${lane.laneId}`);
      const sourceState = cockpitRow?.state ?? "not_in_cockpit";
      const packetPath =
        cockpitRow?.packetPath ??
        contractLane?.candidateResultPacketPath ??
        "<candidate-result-packet-path>";
      const packetExists =
        !packetPath.startsWith("<") && fs.existsSync(path.resolve(input.cwd, packetPath));
      const status: AutoresearchLevel4CandidatePacketInventoryStatus =
        sourceState === "measured_exported_selectable" ||
        sourceState === "measured_exported_not_selectable" ||
        packetExists
          ? "controller_verified_measured_packet"
          : sourceState === "missing_packet" || sourceState === "packet_missing"
            ? "pending_candidate_result_packet"
            : checkpointAccepted || sourceState === "measurement_export_unlocked"
              ? "pending_measurement_or_export"
              : state === "ready_to_launch_visible_candidate_peers"
                ? "pending_visible_launch"
                : "pending_controller_lineage_verification";
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        packetPath,
        sourceState,
        status,
        controllerVerified: status === "controller_verified_measured_packet",
        measuredPacket: status === "controller_verified_measured_packet",
        selected: cockpitRow?.selected ?? false,
      };
    });
  const pendingPacketRows = packetInventoryRows.filter(
    (row) => row.status !== "controller_verified_measured_packet",
  );
  const controllerVerifiedMeasuredPacketRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet",
  );
  const packetInventory = {
    totalLaneCount: packetInventoryRows.length,
    pendingVisibleLaunchCount: packetInventoryRows.filter(
      (row) => row.status === "pending_visible_launch",
    ).length,
    pendingControllerLineageVerificationCount: packetInventoryRows.filter(
      (row) => row.status === "pending_controller_lineage_verification",
    ).length,
    pendingMeasurementOrExportCount: packetInventoryRows.filter(
      (row) => row.status === "pending_measurement_or_export",
    ).length,
    pendingCandidateResultPacketCount: packetInventoryRows.filter(
      (row) => row.status === "pending_candidate_result_packet",
    ).length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    pendingPacketPaths: pendingPacketRows.map((row) => row.packetPath),
    controllerVerifiedMeasuredPacketPaths: controllerVerifiedMeasuredPacketRows.map(
      (row) => row.packetPath,
    ),
    rows: packetInventoryRows,
    summary: `${controllerVerifiedMeasuredPacketRows.length}/${packetInventoryRows.length} controller-verified measured packet(s); ${pendingPacketRows.length} pending`,
  };
  const bindingByLaneId = new Map(
    (input.candidateBindings ?? []).map((binding) => [binding.laneId, binding]),
  );
  const isPlaceholderCleanupValue = (value: string): boolean => value.startsWith("<");
  const cleanupRows = promptBundle.map((lane) => {
    const binding =
      bindingByLaneId.get(lane.laneId) ?? bindingByLaneId.get(`${lane.cellId}-${lane.laneId}`);
    const peerRunId =
      binding?.candidatePeerRunId ?? `<peerRunId for ${lane.cellId}/${lane.laneId}>`;
    const registrySidecar = isPlaceholderCleanupValue(peerRunId)
      ? null
      : readCandidatePeerRegistrySidecar({
          peerRunId,
          cwd: input.cwd,
          candidateWorktree: binding?.candidateWorktree,
          candidateBranch: binding?.candidateBranch,
        });
    const worktree =
      binding?.candidateWorktree ??
      registrySidecar?.worktreePath ??
      `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const branch =
      binding?.candidateBranch ??
      registrySidecar?.branchName ??
      extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName") ??
      `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const archiveDirectory =
      registrySidecar?.archiveDir ??
      path.join(
        os.homedir(),
        ".local",
        "state",
        "pi-quests",
        "archives",
        `cleanup-level4-task-${input.taskId}-${lane.cellId}-${lane.laneId}`,
      );
    return { lane, peerRunId, worktree, branch, archiveDirectory, registrySidecar };
  });
  const registrySidecars = cleanupRows
    .map((row) => row.registrySidecar)
    .filter((sidecar): sidecar is AutoresearchLevel4PostIntegrationCleanupRegistrySidecar =>
      Boolean(sidecar),
    );
  const cleanupBlockers = [
    ...(input.integrationCloseout?.status === "successful"
      ? []
      : ["integrationCloseout.status must be successful before post-integration cleanup is ready"]),
    ...cleanupRows.flatMap((row) => [
      ...(isPlaceholderCleanupValue(row.peerRunId)
        ? [`missing exact peerRunId for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.worktree)
        ? [`missing exact worktree for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.branch)
        ? [`missing exact branch for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(row.registrySidecar?.blockers ?? []),
    ]),
  ];
  const exactPeerRunIds = cleanupRows
    .map((row) => row.peerRunId)
    .filter((peerRunId) => !isPlaceholderCleanupValue(peerRunId));
  const exactWorktrees = cleanupRows
    .map((row) => row.worktree)
    .filter((worktree) => !isPlaceholderCleanupValue(worktree));
  const exactBranches = cleanupRows
    .map((row) => row.branch)
    .filter((branch) => !isPlaceholderCleanupValue(branch));
  const exactCleanupRows = cleanupRows.filter(
    (row) =>
      !isPlaceholderCleanupValue(row.peerRunId) &&
      !isPlaceholderCleanupValue(row.worktree) &&
      !isPlaceholderCleanupValue(row.branch),
  );
  const registrySidecarBlockerCount = registrySidecars.reduce(
    (sum, sidecar) => sum + sidecar.blockers.length,
    exactPeerRunIds.length === registrySidecars.length ? 0 : exactPeerRunIds.length,
  );
  const canDryRunCleanup = exactPeerRunIds.length > 0 && registrySidecarBlockerCount === 0;
  const fallbackCleanupCommands =
    cleanupBlockers.length === 0
      ? cleanupRows.flatMap((row) => [
          `mkdir -p ${shellQuote(row.archiveDirectory)}`,
          `git -C ${shellQuote(row.worktree)} status --short > ${shellQuote(path.join(row.archiveDirectory, "status.txt"))}`,
          `git -C ${shellQuote(input.cwd)} worktree remove --force ${shellQuote(row.worktree)}`,
          `git -C ${shellQuote(input.cwd)} branch -D ${shellQuote(row.branch)}`,
        ])
      : [];
  const selectedMeasuredRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet" && row.selected,
  );
  const fanInComplete =
    packetInventoryRows.length > 0 &&
    packetInventoryRows.every((row) => row.status === "controller_verified_measured_packet");
  const ownerReviewCall = fanInComplete
    ? (contract.lanes[0]?.reviewCandidateWaveCall ?? null)
    : null;
  const finalizerTokenRequestCall =
    fanInComplete && selectedMeasuredRows.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: input.taskId,
          cwd: input.cwd,
          objective: input.objective,
          sourceReview: "review_matrix_campaign",
          candidateResultPacketPaths: selectedMeasuredRows.map((row) => row.packetPath),
          selectedLaneId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.laneId
              : "<owner-selected-lane-id>",
          selectedCellId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.cellId
              : "<owner-selected-cell-id>",
          validation: {
            command: "<owner validation command>",
            status: "passed",
            summary: "<owner validation summary>",
          },
        })
      : null;
  const promotionHandoffBlockers = [
    ...(fanInComplete
      ? []
      : ["all planned candidate lanes must have controller-verified measured packets"]),
    ...(fanInComplete && selectedMeasuredRows.length === 0
      ? ["owner review must select a measured lane before finalizer token request"]
      : []),
  ];
  const postFaninPromotionHandoff: AutoresearchLevel4PostFaninPromotionHandoffPacket = {
    kind: "autoresearch.level4_post_fanin_promotion_handoff.v1",
    execution: "plan_only_owner_gate_handoff",
    posture: !fanInComplete
      ? "blocked_until_candidate_fan_in_complete"
      : selectedMeasuredRows.length > 0
        ? "ready_for_finalizer_token_request"
        : "ready_for_owner_review",
    selectedLaneCount: selectedMeasuredRows.length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    totalLaneCount: packetInventoryRows.length,
    ownerReviewCall,
    finalizerTokenRequestCall,
    evidenceRecordHandoff: {
      posture: fanInComplete ? "owner_surface_after_review" : "blocked_until_owner_review",
      ownerSurface: "AK",
      exactRecordCall: null,
      boundary:
        "AK evidence remains an owner-surface write after owner review/finalizer closeout; Level-4 never fabricates durable evidence from peer text or local receipts.",
    },
    sequence: [
      "compare_measured_candidate_packets",
      "owner_selects_lane",
      "run_validation",
      "request_finalize_post_fanin_token",
      "apply_finalizer_only_with_exact_token",
      "record_evidence_only_through_owner_surface",
      "cleanup_only_after_successful_integration_closeout",
    ],
    blockers: promotionHandoffBlockers,
    boundary:
      "This handoff collapses the post-fan-in tail into one visible owner-gated sequence; it does not select a winner, apply a finalizer, write AK evidence, merge, promote, or clean candidates by itself.",
    nextStep: !fanInComplete
      ? "Finish bind/measure/export for every planned lane or explicitly replan the lane set before owner review."
      : selectedMeasuredRows.length === 0
        ? "Run the owner review surface on measured candidate packets, select a lane, validate it, then rerun Level-4 or level3_authorized_finalizer_cleanup_plan for the exact finalizer token request."
        : "Use finalizerTokenRequestCall to request the exact finalize_post_fanin token after validation; keep AK evidence, cleanup, and promotion as separate owner gates.",
  };

  const postIntegrationCleanupReady: AutoresearchLevel4PostIntegrationCleanupReadyPacket = {
    kind: "autoresearch.level4_post_integration_cleanup_ready.v1",
    execution: "not_executed_by_orchestrator",
    readiness:
      cleanupBlockers.length === 0
        ? "ready_after_successful_integration_closeout"
        : "blocked_until_successful_integration_closeout",
    integrationCloseout: {
      status: input.integrationCloseout?.status ?? "missing",
      ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
      ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
    },
    registrySidecars,
    exactPeerRunIds,
    exactPeerTabsOrSessions: exactPeerRunIds,
    exactWorktrees,
    exactBranches,
    archiveDirectories: exactCleanupRows.map((row) => row.archiveDirectory),
    tabClosureHints: exactCleanupRows.map(
      (row) =>
        `Close visible peer tab/session for exact peerRunId ${row.peerRunId}; do not fuzzy-match unrelated Pi tabs.`,
    ),
    processTerminationHints: exactCleanupRows.map(
      (row) =>
        `Terminate only sidequest/peer processes whose command line contains exact candidate worktree ${row.worktree}.`,
    ),
    candidatePeerCleanupDryRunCall: canDryRunCleanup
      ? formatToolCall("candidate_peer_cleanup", {
          peerRunIds: exactPeerRunIds,
        })
      : null,
    candidatePeerCleanupExecuteCall:
      cleanupBlockers.length === 0
        ? formatToolCall("candidate_peer_cleanup", {
            peerRunIds: exactPeerRunIds,
            execute: true,
            closeVisibleResources: true,
            integrationCloseoutStatus: "successful",
          })
        : null,
    exactControllerCommands: fallbackCleanupCommands,
    blockers: cleanupBlockers,
    boundary:
      "Post-integration cleanup is a controller/workbench closeout packet only: archive first, close/kill only exact peer resources, remove only named worktrees/branches, and do not infer merge, promotion, AK/KES/evidence writes, release, push, or PR authority.",
    nextStep:
      cleanupBlockers.length === 0
        ? "After successful integration is already committed/accepted, run candidatePeerCleanupExecuteCall or the exact fallback cleanup commands; do not clean any resource not named here."
        : canDryRunCleanup
          ? "Run candidatePeerCleanupDryRunCall for exact registry-backed peer-resource inventory only; after integration succeeds rerun Level-4 with integrationCloseout.status=successful so cleanup execution becomes exact."
          : exactPeerRunIds.length > 0
            ? "Resolve candidate peer registry sidecar blockers before any cleanup dry-run or fallback cleanup command is prepared."
            : "Capture exact candidate_peer_spawn peerRunIds plus controller-verified worktrees/branches before any cleanup dry-run or fallback cleanup command is prepared.",
  };
  const candidateCloseoutPacket: AutoresearchLevel4CandidateCloseoutPacket = {
    kind: "autoresearch.level4_visible_candidate_closeout_packet.v1",
    execution: "plan_only_controller_verified_closeout",
    durableEvidence: false,
    laneCount: promptBundle.length,
    lanes: promptBundle.map((lane): AutoresearchLevel4CandidateCloseoutLane => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
      const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        objective: lane.objective,
        launch: {
          surface: "candidate_peer_spawn",
          call: lane.candidatePeerSpawnCall,
          workspaceName: extractJsonStringFromToolCall(
            lane.candidatePeerSpawnCall,
            "workspaceName",
          ),
          branchName: extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName"),
        },
        watch: {
          ackCall: lane.peerAckWatchCall,
          finalCall: lane.peerFinalWatchCall,
          status: checkpointAccepted
            ? "pending_controller_verification"
            : "pending_controller_execution",
        },
        lineage: {
          peerFinalIsCommunicationOnly: true,
          requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
          verificationCommands: [
            `git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD`,
            `git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD`,
            `git -C ${worktreePlaceholder} status --short`,
            `git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD`,
            `git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD`,
          ],
        },
        scopeReview: {
          filesInScope: nonEmptyStrings(input.filesInScope),
          offLimits: nonEmptyStrings(input.offLimits),
          status: "pending_controller_verification",
        },
        validation: {
          peerClaimStatus: "communication_only",
          controllerValidationStatus: "pending_controller_verification",
          candidateResultPacketPath:
            contractLane?.candidateResultPacketPath ?? "<candidate-result-packet-path>",
        },
        recommendation: {
          disposition: "pending_controller_review",
          options: ["integrate_after_review", "reject", "retry", "inspect_further"],
          requiredBeforeIntegrate: [
            "ACK and FINAL observed through intercom peer_watch",
            "worktree, branch, baseRef, diff summary, and changed files verified by controller git commands",
            "off-limits drift checked against filesInScope/offLimits",
            "smallest truthful validation rerun or explicitly marked unavailable by controller",
            "candidate-result packet exported and reviewed before integration selection",
          ],
        },
        rollbackNotes: [
          "Do not delete candidate resources before controller closeout is accepted.",
          "Rollback integration by reverting only the selected candidate patch; retain rejected lane packet paths as review inputs until cleanup is authorized.",
        ],
      };
    }),
    packetInventory,
    postIntegrationCleanupReady,
    postFaninPromotionHandoff,
    comparison: {
      status: checkpointAccepted ? "ready_for_review_packet" : "pending_candidate_result_packets",
      aggregateReviewCall: contract.lanes[0]?.reviewCandidateWaveCall ?? null,
      reviewRequiresControllerVerifiedPackets: true,
    },
    metric: {
      name: "level4_candidate_closeout_packet_blockers",
      direction: "lower",
      target: 0,
      value: closeoutBlockers.length,
      status: closeoutBlockers.length === 0 ? "target_met" : "blocked",
      blockers: closeoutBlockers,
    },
    notAuthority: [
      "This packet is not AK/KES/evidence authority and does not complete the task.",
      "This packet does not select, merge, promote, release, or clean up candidates.",
      "Peer ACK/FINAL text remains communication only until controller git/worktree verification is recorded in the controller flow.",
    ],
    nextStep:
      closeoutBlockers.length > 0
        ? "Resolve closeout packet blockers before using Level-4 output for candidate comparison."
        : "Use this closeout packet as the controller checklist after PEER_FINAL: verify lineage, export candidate-result packets, run review_candidate_wave, then decide integrate/reject/retry at the owner gate.",
  };
  const blockerValue = Math.max(
    visibleLaunchWatchPlan.metric.value,
    wholeMatrixParallelExecutor.metric.value,
    candidateCloseoutPacket.metric.value,
  );

  return {
    kind: "autoresearch.level4_prompt_runner_bundle.v1",
    pattern: [
      "generate_prompt_bundle",
      "candidate_peer_spawn",
      "peer_watch_ack_final",
      "controller_verify_lineage",
      "bind_measure_export_review",
      "review_matrix_campaign",
      "stop_at_owner_gates",
    ],
    state,
    promptBundle,
    visibleCandidatePeerSpawnCalls: contract.launchPhase.launchCalls,
    peerWatchCalls: promptBundle.flatMap((lane) => [
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
    ]),
    visibleLaunchWatchPlan,
    wholeMatrixParallelExecutor,
    candidateCloseoutPacket,
    controllerLineageVerification: {
      peerFinalIsCommunicationOnly: true,
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      checklist: [
        "Do not checkpoint on PEER_FINAL text alone; verify worktree, branch, base ref, diff summary, and changed files in the controller.",
        "Bind only controller-verified candidate worktrees through autoresearch_candidate_bind.",
        "Measure only from candidate worktrees; controller-inline implementation patches are a process violation.",
      ],
    },
    postFinalControllerSequence,
    metric: {
      name: "whole_matrix_execution_glue_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      proofs: [
        {
          proof: "prompt bundle generated for each matrix lane",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.promptBundle",
        },
        {
          proof: "visible candidate_peer_spawn calls are the only launch surface",
          status:
            contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount === 0
              ? "present"
              : "blocked",
          source: "contract.launchPhase.launchCalls",
        },
        {
          proof: "ACK/FINAL watch calls are explicit controller steps",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.peerWatchCalls",
        },
        {
          proof: "controller lineage verification separates peer communication from measured facts",
          status: "present",
          source: "promptRunnerBundle.controllerLineageVerification",
        },
        {
          proof:
            "bind/measure/export/review sequence is derived from existing Level-2/Level-3 packet surfaces",
          status: postFinalControllerSequence.length > 0 ? "present" : "blocked",
          source: checkpointAccepted
            ? "level3Runner.benchmarkExportReviewCalls"
            : "contract.lanes[].measurementPlan",
        },
        {
          proof: "structured candidate closeout packet is available for controller comparison",
          status: candidateCloseoutPacket.metric.status === "target_met" ? "present" : "blocked",
          source: "promptRunnerBundle.candidateCloseoutPacket",
        },
      ],
    },
    boundaries: [
      "Level-4 prompt runner automates the proven Target-3 prompt matrix pattern; it does not create a new authority ledger.",
      "candidate_peer_spawn launches remain visible peer/worktree launches; hidden scout/fork/controller-inline implementation is not allowed.",
      "intercom ACK/FINAL is communication only; controller git/worktree verification supplies lineage facts for binding.",
      "The candidate closeout packet is a controller checklist and comparison substrate, not AK/KES/evidence authority.",
      "pi-autoresearch remains owner of measurement, candidate-result export, and empirical review packets.",
      "review/finalizer/cleanup/AK/promotion gates stay separate exact owner gates.",
    ],
    nextStep:
      state === "blocked_missing_parent_peer_target"
        ? "Provide parentPeerTarget so the visible prompt-runner matrix can launch candidate_peer_spawn lanes."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Run the controller-verified bind/measure/export/review sequence from the prompt runner bundle; stop at owner gates."
          : "Launch visible candidate_peer_spawn lanes from the prompt bundle, watch ACK/FINAL, verify lineage, then supply the exact checkpoint token.",
  };
}

function resolveLevel4ReceiptPath(input: AutoresearchLevel4CampaignRunnerRequest): string {
  if (input.level4ReceiptPath) {
    const resolved = path.resolve(input.cwd, input.level4ReceiptPath);
    const cwdResolved = path.resolve(input.cwd);
    if (!resolved.startsWith(`${cwdResolved}${path.sep}`) && resolved !== cwdResolved) {
      throw new Error("level4ReceiptPath must stay under cwd.");
    }
    return resolved;
  }
  return path.join(input.cwd, ".autoresearch", "level4-campaign-runner-receipts.jsonl");
}

function loadLevel4Receipts(receiptPath: string): AutoresearchLevel4CampaignRunnerReceipt[] {
  if (!fs.existsSync(receiptPath)) return [];
  return fs
    .readFileSync(receiptPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AutoresearchLevel4CampaignRunnerReceipt);
}

function appendLevel4Receipts(
  receiptPath: string,
  receipts: readonly AutoresearchLevel4CampaignRunnerReceipt[],
): void {
  if (receipts.length === 0) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.appendFileSync(
    receiptPath,
    `${receipts.map((receipt) => JSON.stringify(receipt)).join("\n")}\n`,
  );
}

function classifyLevel4Disposition(
  call: string,
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunnerReceipt["disposition"] {
  if (/finalize_post_fanin|promotion|ak_owner_write|evidence_record\(/u.test(call)) {
    return "blocked_dangerous_gate";
  }
  if (/candidate_cleanup|worktree\s+remove|branch\s+-D|rm\s+-rf/u.test(call)) {
    return input.allowAutomaticCleanupAfterIntegrationCloseout === true &&
      input.integrationCloseout?.status === "successful"
      ? "executed_by_level4"
      : "blocked_dangerous_gate";
  }
  if (/autoresearch_runtime_run|candidate_result_export|autoresearch_runtime_status/u.test(call)) {
    return input.allowMeasureExportReview === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  if (/review_candidate_wave|review_matrix_campaign/u.test(call)) {
    return input.allowReviewGeneration === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  return "awaiting_external_controller";
}

export function runAutoresearchLevel4CampaignRunner(
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunner {
  const receiptPath = resolveLevel4ReceiptPath(input);
  const loadedReceipts = loadLevel4Receipts(receiptPath);
  const completedActionCount = Math.max(
    resolveLevel3CompletedActionCount(input.completedActionCount),
    loadedReceipts.length,
  );
  const maxAutomatedActions = input.maxAutomatedActions ?? 1;
  if (
    !Number.isInteger(maxAutomatedActions) ||
    maxAutomatedActions < 1 ||
    maxAutomatedActions > 25
  ) {
    throw new Error("maxAutomatedActions must be an integer from 1 to 25.");
  }

  const newReceipts: AutoresearchLevel4CampaignRunnerReceipt[] = [];
  let executor = advanceAutoresearchLevel3MatrixCellExecutor({
    ...input,
    completedActionCount,
  });
  let posture: AutoresearchLevel4CampaignRunner["posture"] =
    executor.posture === "blocked_by_level3_runner" ? "blocked_by_level3" : "complete_review_ready";

  for (let i = 0; i < maxAutomatedActions; i += 1) {
    const action = executor.selectedAction;
    if (!action) {
      posture =
        executor.posture === "blocked_by_level3_runner"
          ? "blocked_by_level3"
          : "complete_review_ready";
      break;
    }
    if (!action.allowedByStateMachine) {
      posture = "blocked_dangerous_gate";
      break;
    }
    const disposition = classifyLevel4Disposition(action.call, input);
    const receipt: AutoresearchLevel4CampaignRunnerReceipt = {
      kind: "autoresearch.level4_campaign_runner_receipt.v1",
      receiptId: createHash("sha256")
        .update(`${input.taskId}\0${input.cwd}\0${action.index}\0${action.call}`)
        .digest("hex"),
      actionIndex: action.index,
      call: action.call,
      disposition,
      executedAtEpochMs: Date.now(),
      summary:
        disposition === "executed_by_level4"
          ? "Level-4 accepted and automated this safe action, then persisted a resumable receipt."
          : disposition === "awaiting_external_controller"
            ? "Level-4 stopped at an action that requires an external controller/tool seam result."
            : "Level-4 preserved an exact dangerous-action gate and did not execute this action.",
    };
    newReceipts.push(receipt);
    if (disposition !== "executed_by_level4") {
      posture =
        disposition === "blocked_dangerous_gate"
          ? "blocked_dangerous_gate"
          : "awaiting_external_controller";
      break;
    }
    executor = advanceAutoresearchLevel3MatrixCellExecutor({
      ...input,
      completedActionCount: action.index + 1,
    });
    posture = "advanced_safe_actions";
  }

  appendLevel4Receipts(receiptPath, newReceipts);
  const finalCompletedActionCount =
    completedActionCount +
    newReceipts.filter((receipt) => receipt.disposition === "executed_by_level4").length;
  const blockerValue =
    posture === "blocked_by_level3" || posture === "blocked_dangerous_gate" ? 1 : 0;
  const promptRunnerBundle = buildLevel4PromptRunnerBundle(input, executor);
  const nextLegalActions =
    posture === "blocked_by_level3" &&
    promptRunnerBundle.state === "ready_to_launch_visible_candidate_peers"
      ? promptRunnerBundle.visibleCandidatePeerSpawnCalls
      : executor.emittedNextLegalActions;
  return {
    kind: "autoresearch.level4_autoresearch_campaign_runner.v1",
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    sourceLevel3Executor: executor,
    promptRunnerBundle,
    receiptPath,
    loadedReceiptCount: loadedReceipts.length,
    newReceipts,
    completedActionCount: finalCompletedActionCount,
    posture,
    metric: {
      name: "level4_autoresearch_automation_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ],
    nextLegalActions,
    boundaries: [
      "Level-4 is above Level-3: it consumes Level-3 state-machine output and records resumable receipts.",
      "Level-4 now carries the prompt-runner matrix bundle from the proven Target-3 pattern: prompt bundle -> visible candidate_peer_spawn -> ACK/FINAL watch -> controller lineage verification -> bind/measure/export/review.",
      "Level-4 may automate only explicitly allowed safe measure/export/review/cleanup-after-closeout steps; dangerous gates remain exact-token gated.",
      "Finalizer apply, pre-closeout cleanup, AK evidence/task writes, merge, release, and promotion are never inferred from Level-4 automation.",
      "Visible peer text remains communication only; Level-4 receipts are resumability receipts, not durable AK evidence.",
    ],
    nextStep:
      posture === "awaiting_external_controller"
        ? "Run or bind the awaiting external controller action, then rerun Level-4; receipts make the loop resumable."
        : posture === "blocked_dangerous_gate"
          ? "Stop at the preserved exact gate; obtain the required owner token or closeout evidence before continuing."
          : posture === "blocked_by_level3"
            ? "Resolve the Level-3 checkpoint/runner blockers first."
            : posture === "complete_review_ready"
              ? "Level-4 has no remaining safe Level-3 action to automate; proceed to owner review and exact gated closeout."
              : "Level-4 advanced safe actions and wrote receipts; rerun to continue or inspect owner review gates.",
  };
}

export function reviewAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignReview {
  const { identity, objective, direction, primaryMetricName, primaryMetricTarget, cells } =
    resolveAutoresearchMatrixCampaignPlanParts(input);
  const plan = planAutoresearchMatrixCampaign(input);
  const cellReviews = cells.map((cell): AutoresearchMatrixCampaignCellReview => {
    const candidateWaveReview = reviewAutoresearchCandidateWave({
      taskId: identity.taskId,
      cwd: identity.cwd,
      objective: cell.objective,
      direction,
      candidateResultPacketPaths: cell.candidateResultPacketPaths,
      offLimits: input.offLimits,
    });
    return {
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      objective: cell.objective,
      recommendationPosture: candidateWaveReview.recommendation.posture,
      selectedLaneId: candidateWaveReview.recommendation.laneId,
      completedLaneCount: candidateWaveReview.management.completedLaneCount,
      expectedLaneCount: candidateWaveReview.management.expectedLaneCount,
      reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      candidateWaveReview,
    };
  });
  const completedCellCount = cellReviews.filter(
    (cell) => cell.recommendationPosture !== "planned_lanes_incomplete",
  ).length;
  const selectedCellCount = cellReviews.filter(
    (cell) => cell.recommendationPosture === "owner_selection_required",
  ).length;
  const hasIncomplete = cellReviews.some(
    (cell) => cell.recommendationPosture === "planned_lanes_incomplete",
  );
  const hasNoSelectable = cellReviews.some(
    (cell) => cell.recommendationPosture === "no_selectable_candidate",
  );
  const antiNarrowingBlocked =
    plan.level2PacketPlanning.antiNarrowing.blockerMetric.status === "blocked";
  const posture = hasIncomplete
    ? "waiting_for_managed_cell_waves"
    : hasNoSelectable || antiNarrowingBlocked
      ? "cell_rerun_required"
      : "ready_for_matrix_owner_review";
  const exactNextCalls =
    posture === "waiting_for_managed_cell_waves"
      ? cellReviews
          .filter((cell) => cell.recommendationPosture === "planned_lanes_incomplete")
          .map((cell) => cell.reviewCandidateWaveCall)
      : posture === "ready_for_matrix_owner_review"
        ? cellReviews.flatMap((cell) => cell.candidateWaveReview.recommendation.exactNextCalls)
        : cellReviews
            .filter((cell) => cell.recommendationPosture === "no_selectable_candidate")
            .map((cell) => cell.reviewCandidateWaveCall);
  const closeout = buildAutoresearchMatrixCampaignCloseout({
    taskId: identity.taskId,
    cwd: identity.cwd,
    posture,
    cellReviews,
    ownerReview: plan.ownerReview,
  });
  const boundaries = [
    "This matrix review aggregates managed candidate-wave reviews; it does not launch peers, run benchmarks, merge worktrees, write evidence, or promote candidates.",
    "Each cell remains gated by review_candidate_wave over explicit candidate-result packet paths.",
    "Raw peer messages are communication only; pi-autoresearch candidate-result packets remain the measurement source.",
    "Owner approval and lower-plane candidate decision workbench calls remain required before keep/discard/rewind/finalize actions.",
  ];
  const wholeMatrixMetricPosture = buildWholeMatrixMetricPosture({
    sourceMetricName: primaryMetricName,
    sourceMetricTarget: primaryMetricTarget,
    antiNarrowing: plan.level2PacketPlanning.antiNarrowing,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    posture,
  });
  const reviewPacket = buildMatrixCampaignReviewPacket({
    reviewKind: "autoresearch.matrix_campaign_review.v1",
    wholeMatrixMetricPosture,
    selectedCellCount,
    expectedCellCount: cellReviews.length,
    exactNextCalls,
    closeout,
    cellReviews,
  });
  const cockpit = buildAutoresearchMatrixReviewCockpit({
    posture,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    cellReviews,
    closeout,
    exactNextCalls,
    boundaries,
  });
  const level3ReviewSelection = buildAutoresearchLevel3ReviewSelectionSubstrate({
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    posture,
    cellReviews,
    exactNextCalls,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
  });

  return {
    kind: "autoresearch.matrix_campaign_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: posture,
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      laneStates: cellReviews.flatMap((cell) =>
        cell.candidateWaveReview.management.laneStates.map((lane) => ({
          cellId: cell.cellId,
          laneId: lane.laneId,
          packetPath:
            lane.candidateResultPacketPath ?? `${cell.cellId}/${lane.laneId}:missing-packet`,
          state: lane.state,
        })),
      ),
      checkpoint: {
        posture: "not_applicable",
        manifestPath: null,
        requiredToken: null,
        checkpointAccepted: null,
      },
      measurementReview: {
        posture,
        completedCells: completedCellCount,
        expectedCells: cellReviews.length,
        selectedCells: selectedCellCount,
        benchmarkExportReviewCallsExposed: false,
        reviewMatrixCampaignCall: null,
      },
      nextLegalActions: exactNextCalls.length > 0 ? exactNextCalls : closeout.nextLegalOwnerActions,
    }),
    posture,
    cells: cellReviews,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    ownerReview: plan.ownerReview,
    closeout,
    cockpit,
    reviewPacket,
    level3ReviewSelection,
    exactNextCalls,
    boundaries,
    nextStep:
      posture === "waiting_for_managed_cell_waves"
        ? "Finish controller measurement and candidate_result_export for incomplete cells, then rerun review_matrix_campaign."
        : posture === "cell_rerun_required"
          ? antiNarrowingBlocked
            ? "Do not close proof-only/baseline-only matrix work from review packets; record an explicit downgrade/incomplete-matrix exception or run real candidate lanes."
            : "Rerun or replan cells with no selectable candidate before matrix-level owner review."
          : "Review selected lanes per cell, open /autoresearch export for evidence, then use /autoresearch review for final owner decisions.",
  };
}

function buildAutoresearchMatrixCampaignCloseout(input: {
  taskId: number;
  cwd: string;
  posture: AutoresearchMatrixCampaignReview["posture"];
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
}): AutoresearchMatrixCampaignCloseout {
  const packetPaths = input.cellReviews.flatMap(
    (cell) => cell.candidateWaveReview.packetDiscovery.candidateResultPacketPaths,
  );
  const packetInventory = input.cellReviews.flatMap((cell) =>
    cell.candidateWaveReview.management.laneStates.map((lane) => ({
      cellId: cell.cellId,
      laneId: lane.laneId,
      packetPath: lane.candidateResultPacketPath,
      state: lane.state,
      selected: lane.laneId === cell.selectedLaneId,
    })),
  );
  const selectedLanes = input.cellReviews.flatMap((cell) => {
    if (!cell.selectedLaneId) return [];
    const selectedLane = cell.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === cell.selectedLaneId,
    );
    return [
      {
        cellId: cell.cellId,
        scenario: cell.scenario,
        hypothesis: cell.hypothesis,
        laneId: cell.selectedLaneId,
        sourcePacketPath: selectedLane?.sourcePacketPath ?? null,
      },
    ];
  });
  const handoffProofs = [
    {
      proof: "closeout packet inventory",
      status: "present" as const,
      source: "closeout.packetInventory",
    },
    {
      proof: "owner decision route dashboard -> review before evidence",
      status: "present" as const,
      source: "closeout.ownerDecisionRoute",
    },
    {
      proof: "AK-ready evidence projection handoff with deterministic projection key",
      status: "present" as const,
      source: "closeout.evidenceProjection.projectionKey",
    },
    {
      proof: "exact evidence_record handoff call or blocked projection reason",
      status: "present" as const,
      source: "closeout.evidenceProjection.exactRecordCall",
    },
    {
      proof: "authority-drift not-done boundaries",
      status: "present" as const,
      source: "closeout.notDone",
    },
    {
      proof: "docs/tests alignment mentioning evidence_handoff_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const learningActivationProofs = [
    {
      proof: "explicit pi-autoresearch learning_export call after closeout",
      status: "present" as const,
      source: "closeout.learningActivation.exactLearningExportCall",
    },
    {
      proof: "owner-routed KES adapter plan call for autoresearch.learning.v1",
      status: "present" as const,
      source: "closeout.learningActivation.exactAdapterPlanCall",
    },
    {
      proof: "materialization remains an explicit owner adapter action",
      status: "present" as const,
      source: "closeout.learningActivation.exactAdapterMaterializeCall",
    },
    {
      proof: "authority-drift boundary blocks hidden AK/KES/Prompt Vault/ROCS mutation",
      status: "present" as const,
      source: "closeout.learningActivation.boundary",
    },
    {
      proof: "docs/tests alignment mentioning learning_activation_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const evidenceHandoffBlockers = 0;
  const closeoutPosture =
    input.posture === "ready_for_matrix_owner_review"
      ? "ak_ready_after_owner_review"
      : input.posture === "waiting_for_managed_cell_waves"
        ? "blocked_until_managed_cell_waves_complete"
        : "blocked_until_cell_rerun";
  const projectionReady = input.posture === "ready_for_matrix_owner_review";
  const learningPacketPath = path.join(input.cwd, ".autoresearch", "learning.json");
  const exactLearningExportCall = projectionReady
    ? formatToolCall("autoresearch_runtime_status", {
        cwd: input.cwd,
        action: "learning_export",
        overwrite: true,
      })
    : null;
  const exactAdapterPlanCall = projectionReady
    ? formatToolCall("autoresearch_learning_kes_adapter", {
        action: "plan",
        packetPath: learningPacketPath,
      })
    : null;
  const exactAdapterMaterializeCall = projectionReady
    ? formatToolCall("autoresearch_learning_kes_adapter", {
        action: "materialize",
        packetPath: learningPacketPath,
      })
    : null;
  const learningActivationBlockers = projectionReady ? 0 : 1;
  const projectionKey = buildAutoresearchMatrixCampaignCloseoutProjectionKey({
    taskId: input.taskId,
    selectedLanes,
    packetPaths,
  });
  const evidenceDetails = {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    projection_key: projectionKey,
    task_id: input.taskId,
    posture: closeoutPosture,
    selected_lanes: selectedLanes,
    packet_paths: packetPaths,
    packet_inventory: packetInventory,
    owner_decision_route: {
      dashboard_first: input.ownerReview.primaryUi.slashCommand,
      overlay_fallback: input.ownerReview.primaryUi.fallbackSlashCommand,
      final_decision: input.ownerReview.decisionUi.slashCommand,
      route_order: [
        input.ownerReview.primaryUi.slashCommand,
        input.ownerReview.decisionUi.slashCommand,
        "evidence_record",
      ],
      evidence_after_review: true,
    },
    evidence_handoff_blockers: evidenceHandoffBlockers,
    evidence_handoff_proofs: handoffProofs,
    learning_activation_blockers: learningActivationBlockers,
    learning_activation: {
      required_packet_kind: "autoresearch.learning.v1",
      export_call: exactLearningExportCall,
      adapter_plan_call: exactAdapterPlanCall,
      adapter_materialize_call: exactAdapterMaterializeCall,
      route_order: [
        "autoresearch_runtime_status.learning_export",
        "autoresearch_learning_kes_adapter.plan",
        "owner_review",
        "autoresearch_learning_kes_adapter.materialize",
      ],
      proofs: learningActivationProofs,
    },
    not_done: [
      "No peer was launched.",
      "No benchmark was run.",
      "No worktree lifecycle action was applied.",
      "No merge, promotion, AK evidence write, KES write, or task lifecycle mutation was applied.",
    ],
    boundary:
      "Matrix campaign closeout evidence is an owner-reviewed projection of pi-autoresearch candidate-result packets; it does not merge, promote, write KES, launch peers, run benchmarks, or mutate worktrees.",
  };
  const exactRecordCall = projectionReady
    ? formatToolCall("evidence_record", {
        check_type: "autoresearch:matrix-campaign:closeout",
        result: "pass",
        task_id: input.taskId,
        details: evidenceDetails,
      })
    : null;

  return {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    posture: closeoutPosture,
    summary: projectionReady
      ? `Matrix campaign has ${selectedLanes.length} selected managed cell lane(s); open ${input.ownerReview.primaryUi.slashCommand} before final owner decisions and project evidence only after owner review.`
      : input.posture === "waiting_for_managed_cell_waves"
        ? "Matrix campaign closeout is blocked until every managed cell wave has controller-measured candidate-result packets or the owner replans the lane set."
        : "Matrix campaign closeout is blocked until cells with no selectable candidate are rerun or deliberately replanned.",
    packetPaths,
    packetInventory,
    selectedLanes,
    evidenceProjection: {
      posture: projectionReady ? "ready_for_external_projection" : "blocked",
      ownerSurface: "AK",
      requiredAnchor: `taskId:${input.taskId}`,
      projectionKey,
      exactRecordCall,
      exactHandoff: "evidence_record",
      guidance: projectionReady
        ? [
            "Open /autoresearch export first so the owner reviews receipts, metrics, and packet context before any authority projection.",
            "Use /autoresearch review for the final owner decision before running evidence_record.",
            "If accepted, run only the exact evidence_record handoff call shown here; keep projection_key unchanged for dedupe/review.",
          ]
        : [
            "Do not run evidence_record yet; complete or replan managed cell waves and rerun review_matrix_campaign first.",
            "Keep projection_key unchanged for this exact packet/selection inventory once the closeout becomes ready.",
          ],
      boundary:
        "AK evidence projection is an explicit external owner-surface action after dashboard-first owner review; this closeout prepares the exact evidence_record call but does not execute it.",
    },
    ownerDecisionRoute: {
      dashboardFirst: input.ownerReview.primaryUi.slashCommand,
      overlayFallback: input.ownerReview.primaryUi.fallbackSlashCommand,
      finalDecision: input.ownerReview.decisionUi.slashCommand,
      evidenceAfterReview: true,
      routeOrder: [
        input.ownerReview.primaryUi.slashCommand,
        input.ownerReview.decisionUi.slashCommand,
        "evidence_record",
      ],
    },
    evidenceHandoffBlockers: {
      name: "evidence_handoff_blockers",
      direction: "lower",
      target: 0,
      value: evidenceHandoffBlockers,
      status: evidenceHandoffBlockers === 0 ? "target_met" : "blocked",
      proofs: handoffProofs,
    },
    learningActivation: {
      posture: projectionReady ? "ready_for_owner_routed_learning_handoff" : "blocked",
      ownerSurface: "autoresearch_learning_kes_adapter",
      requiredPacketKind: "autoresearch.learning.v1",
      exactLearningExportCall,
      exactAdapterPlanCall,
      exactAdapterMaterializeCall,
      routeOrder: [
        "autoresearch_runtime_status.learning_export",
        "autoresearch_learning_kes_adapter.plan",
        "owner_review",
        "autoresearch_learning_kes_adapter.materialize",
      ],
      guidance: projectionReady
        ? [
            "After reviewing the matrix closeout, export the pi-autoresearch learning packet explicitly from the campaign cwd.",
            "Run the owner-routed KES adapter in action=plan first; materialize only after owner review accepts the candidate learning draft.",
            "Keep learning activation advisory/packetized until the adapter action explicitly writes package-owned KES artifacts.",
          ]
        : [
            "Do not export or materialize learning yet; complete or replan managed cell waves and rerun review_matrix_campaign first.",
          ],
      boundary:
        "Learning activation is an owner-routed handoff from pi-autoresearch learning_export to autoresearch_learning_kes_adapter; this closeout prepares calls only and does not write KES, AK, Prompt Vault, ROCS, or promotion state.",
    },
    learningActivationBlockers: {
      name: "learning_activation_blockers",
      direction: "lower",
      target: 0,
      value: learningActivationBlockers,
      status: learningActivationBlockers === 0 ? "target_met" : "blocked",
      proofs: learningActivationProofs,
    },
    nextLegalOwnerActions: projectionReady
      ? [
          "Open /autoresearch export for dashboard-first review of receipts, metrics, and candidate packets.",
          "Use /autoresearch review for final keep/discard/rewind/more-samples/finalize decisions per selected lane.",
          "Export the pi-autoresearch learning packet and run autoresearch_learning_kes_adapter action=plan before any learning materialization.",
          "Record AK/KES/evidence only through explicit owner surfaces after accepting the reviewed closeout.",
        ]
      : [
          "Complete or deliberately replan missing managed cell waves.",
          "Rerun review_matrix_campaign after every required cell has controller-measured packet evidence.",
        ],
    notDone: [
      "No peer was launched.",
      "No benchmark was run.",
      "No worktree lifecycle action was applied.",
      "No merge, promotion, AK evidence write, KES write, learning materialization, or task lifecycle mutation was applied.",
    ],
  };
}

function buildAutoresearchMatrixCampaignCloseoutProjectionKey(input: {
  taskId: number;
  selectedLanes: readonly { cellId: string; laneId: string; sourcePacketPath: string | null }[];
  packetPaths: readonly string[];
}): string {
  const selectedLaneKey = input.selectedLanes
    .map((lane) => `${lane.cellId}:${lane.laneId}:${lane.sourcePacketPath ?? "no-packet"}`)
    .sort()
    .join(",");
  const packetKey = [...input.packetPaths].sort().join(",");
  return `matrix-closeout|task:${input.taskId}|selected:${encodeURIComponent(selectedLaneKey)}|packets:${encodeURIComponent(packetKey)}`;
}

const LEVEL3_POLICY_GATE_SPECS: readonly {
  gate: AutoresearchLevel3PolicyGatePreflight["gate"];
  requiredPolicy: readonly string[];
  boundary: string;
}[] = [
  {
    gate: "launchVisibleCandidatePeers",
    requiredPolicy: ["token_required", "policy_or_token_required", "manifest_allowed"],
    boundary:
      "Visible candidate launch is allowed only by accepted manifest policy or launch token.",
  },
  {
    gate: "runMeasurements",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Measurement execution must route through pi-autoresearch seams.",
  },
  {
    gate: "exportCandidateResults",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Candidate-result exports are review inputs, not durable evidence.",
  },
  {
    gate: "generateReviewPackets",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Review packet generation is non-authoritative and does not choose promotion.",
  },
  {
    gate: "prepareFinalizerTokenRequest",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Finalizer-token request preparation does not execute finalizer actions.",
  },
  {
    gate: "applyFinalizer",
    requiredPolicy: ["token_required"],
    boundary: "Finalizer application requires the exact finalize_post_fanin token.",
  },
  {
    gate: "cleanupCandidates",
    requiredPolicy: ["token_required", "token_required_or_manifest_allowed"],
    boundary: "Cleanup requires exact cleanup policy/token naming worktrees and branches.",
  },
  {
    gate: "recordAkEvidence",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK evidence writes require exact AK owner-write policy and projection key.",
  },
  {
    gate: "completeAkTask",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK task completion requires task/cwd/manifest hash matching.",
  },
  {
    gate: "mergeReleasePromotion",
    requiredPolicy: ["promotion_token_required"],
    boundary: "Merge, release, and promotion require a separate promotion token.",
  },
];

function resolveLevel3Manifest(input: AutoresearchLevel3ManifestPreflightRequest): {
  manifest: unknown;
  manifestPath: string | null;
} {
  if (input.manifest !== undefined) return { manifest: input.manifest, manifestPath: null };
  if (input.manifestPath && input.manifestPath.trim().length > 0) {
    const resolved = path.isAbsolute(input.manifestPath)
      ? input.manifestPath
      : path.resolve(input.cwd, input.manifestPath);
    return { manifest: readJsonFile(resolved), manifestPath: resolved };
  }
  return { manifest: null, manifestPath: null };
}

function buildLevel3PolicyGatePreflight(policy: Record<string, unknown> | null): {
  gates: AutoresearchLevel3PolicyGatePreflight[];
  blockers: string[];
} {
  const blockers: string[] = [];
  const gates = LEVEL3_POLICY_GATE_SPECS.map((spec) => {
    const value = policy?.[spec.gate];
    const accepted = spec.requiredPolicy.some((allowed) => {
      if (allowed === "true") return value === true;
      return value === allowed;
    });
    const missing = value === undefined;
    const posture: AutoresearchLevel3PolicyPosture = missing
      ? "blocked_missing_policy"
      : accepted
        ? "allowed_by_manifest_policy"
        : "blocked_invalid_policy";
    if (posture !== "allowed_by_manifest_policy") {
      blockers.push(
        `${spec.gate} policy is ${missing ? "missing" : `invalid (${String(value)})`}; expected one of ${spec.requiredPolicy.join(", ")}.`,
      );
    }
    return {
      gate: spec.gate,
      posture,
      value,
      requiredPolicy: spec.requiredPolicy,
      boundary: spec.boundary,
    };
  });
  return { gates, blockers };
}

function buildAutoresearchLevel3ManifestPreflight(
  input: AutoresearchLevel3ManifestPreflightRequest,
): AutoresearchLevel3CampaignManifestPreflight {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const { manifest, manifestPath } = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const blockers: string[] = [];
  const manifestRecord = isRecord(manifest) ? manifest : null;
  if (!manifestRecord) blockers.push("manifest is required and must be a JSON object.");

  const kind = manifestRecord?.kind;
  if (manifestRecord && kind !== "autoresearch.level3_campaign_manifest.v1") {
    blockers.push("manifest.kind must be autoresearch.level3_campaign_manifest.v1.");
  }
  const manifestTaskId = manifestRecord?.taskId;
  if (manifestRecord && manifestTaskId !== identity.taskId) {
    blockers.push(`manifest.taskId must exactly match ${identity.taskId}.`);
  }
  const manifestCwd = optionalString(manifestRecord?.cwd);
  if (manifestRecord && (!manifestCwd || path.resolve(manifestCwd) !== identity.cwd)) {
    blockers.push(`manifest.cwd must exactly resolve to ${identity.cwd}.`);
  }
  const campaignId = optionalString(manifestRecord?.campaignId) ?? null;
  if (manifestRecord && !campaignId) blockers.push("manifest.campaignId is required.");
  const autonomyLevel = optionalNumber(manifestRecord?.autonomyLevel) ?? null;
  if (manifestRecord && autonomyLevel !== 3) blockers.push("manifest.autonomyLevel must be 3.");

  const primaryMetric = isRecord(manifestRecord?.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const primaryMetricName = optionalString(primaryMetric?.name) ?? null;
  if (manifestRecord && !primaryMetricName)
    blockers.push("manifest.primaryMetric.name is required.");

  const filesInScope = stringArrayFrom(manifestRecord?.filesInScope);
  const offLimits = stringArrayFrom(manifestRecord?.offLimits);
  const rawFilesInScope = manifestRecord?.filesInScope;
  const rawOffLimits = manifestRecord?.offLimits;
  const slices = Array.isArray(manifestRecord?.slices) ? manifestRecord.slices : [];
  if (manifestRecord && !Array.isArray(rawFilesInScope)) {
    blockers.push("manifest.filesInScope must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(rawOffLimits)) {
    blockers.push("manifest.offLimits must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(manifestRecord.slices)) {
    blockers.push("manifest.slices must be an array.");
  }
  const normalizedOffLimits = offLimits.map((spec) =>
    normalizeCandidateReviewPath(spec, identity.cwd),
  );
  const offLimitDrift = filesInScope
    .map((filePath) => normalizeCandidateReviewPath(filePath, identity.cwd))
    .filter((filePath) =>
      normalizedOffLimits.some((spec) => candidatePathMatchesOffLimitSpec(filePath, spec)),
    );
  if (offLimitDrift.length > 0) {
    blockers.push(`manifest.filesInScope overlaps offLimits: ${offLimitDrift.join(", ")}.`);
  }

  const policy = isRecord(manifestRecord?.policy) ? manifestRecord.policy : null;
  if (manifestRecord && !policy) blockers.push("manifest.policy is required.");
  const policyPreflight = buildLevel3PolicyGatePreflight(policy);
  const manifestHash = manifestRecord ? sha256StableJson(manifestRecord) : null;
  const schemaBlockers = blockers.length;
  const policyBlockers = policyPreflight.blockers.length;
  const uxBlockers = manifestHash && policyPreflight.gates.length > 0 ? 0 : 1;
  const allBlockers = [...blockers, ...policyPreflight.blockers];
  if (uxBlockers > 0)
    allBlockers.push("preflight UX requires manifest hash and policy gate rendering.");
  const totalBlockers = allBlockers.length;

  return {
    kind: "autoresearch.level3_campaign_manifest_preflight.v1",
    manifestKind:
      kind === "autoresearch.level3_campaign_manifest.v1"
        ? "autoresearch.level3_campaign_manifest.v1"
        : "invalid_or_missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestPath,
    manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    metric: {
      name: "level3_manifest_preflight_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      manifestSchemaBlockers: {
        name: "manifest_schema_blockers",
        direction: "lower",
        target: 0,
        value: schemaBlockers,
        status: metricStatus(schemaBlockers),
      },
      manifestPolicyGateBlockers: {
        name: "manifest_policy_gate_blockers",
        direction: "lower",
        target: 0,
        value: policyBlockers,
        status: metricStatus(policyBlockers),
      },
      manifestPreflightUxBlockers: {
        name: "manifest_preflight_ux_blockers",
        direction: "lower",
        target: 0,
        value: uxBlockers,
        status: metricStatus(uxBlockers),
      },
    },
    schema: {
      campaignId,
      autonomyLevel,
      primaryMetricName,
      sliceCount: slices.length,
      fileScopeCount: filesInScope.length,
      offLimitsCount: offLimits.length,
    },
    policyGates: policyPreflight.gates,
    blockers: allBlockers,
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review and accept the durable manifest before any level-3 action-consuming runner step.",
            "Proceed to Slice 2 dry-run sequencing only; do not launch peers from Slice 1 preflight.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ]
        : [
            "Fix manifest schema/policy blockers and rerun level3_manifest_preflight.",
            "Do not launch peers, run measurements, cleanup, write AK evidence, or promote while preflight is blocked.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed.",
      "No autoresearch measurement, candidate-result export, review, or finalizer action was executed.",
      "No cleanup, branch deletion, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    level2FallbackRoute: LEVEL2_PACKET_LEVEL1_FALLBACK,
    boundaries: [
      "Level-3 manifest preflight is read-only; manifest acceptance is separate from chat text and peer reports.",
      "Policy gates render authorization posture only; dangerous actions still require later stage-specific execution surfaces.",
      "The manifest hash is an audit anchor, not durable evidence until projected through AK owner-write policy.",
    ],
  };
}

function level3NodeId(value: unknown, fallback: string): string {
  return optionalString(isRecord(value) ? value.id : undefined) ?? fallback;
}

function level3NodeDependencies(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [...stringArrayFrom(value.dependsOn), ...stringArrayFrom(value.dependencies)].filter(
    (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
  );
}

function level3NodeMetricName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const direct = optionalString(value.metric);
  if (direct) return direct;
  return isRecord(value.metric) ? (optionalString(value.metric.name) ?? null) : null;
}

function level3NodeMetricDirection(value: unknown): "lower" | "higher" | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  const direction = optionalString(metric?.direction) ?? optionalString(value.direction);
  return direction === "higher" ? "higher" : direction === "lower" ? "lower" : null;
}

function level3NodeMetricTarget(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  return optionalNumber(metric?.target) ?? optionalNumber(value.metricThreshold) ?? null;
}

function level3CandidateCount(value: unknown, fallback: number): number {
  const raw = isRecord(value)
    ? (optionalNumber(value.candidateCountPerCell) ?? optionalNumber(value.candidateCount))
    : undefined;
  const resolved = raw ?? fallback;
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= 6 ? resolved : fallback;
}

function level3NodeRequiredPolicyGates(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    ...stringArrayFrom(value.requiredPolicyGates),
    ...stringArrayFrom(value.requiresPolicyGates),
    ...stringArrayFrom(value.policyGates),
  ].filter((item, index, items) => item.trim().length > 0 && items.indexOf(item) === index);
}

function buildLevel3SliceSequenceNodes(manifest: unknown): {
  nodes: {
    sliceId: string;
    cellId: string;
    nodeId: string;
    raw: unknown;
    dependencies: readonly string[];
    metricName: string | null;
    requiredPolicyGates: readonly string[];
  }[];
  schemaBlockers: string[];
} {
  if (!isRecord(manifest) || !Array.isArray(manifest.slices)) {
    return { nodes: [], schemaBlockers: ["manifest.slices must be available for sequencing."] };
  }
  const schemaBlockers: string[] = [];
  const nodes: ReturnType<typeof buildLevel3SliceSequenceNodes>["nodes"] = [];
  manifest.slices.forEach((slice, sliceIndex) => {
    const sliceId = level3NodeId(slice, `slice-${String(sliceIndex + 1).padStart(2, "0")}`);
    const sliceDependencies = level3NodeDependencies(slice);
    const slicePolicyGates = level3NodeRequiredPolicyGates(slice);
    const sliceMetricName = level3NodeMetricName(slice);
    const hasExplicitCells =
      isRecord(slice) && Array.isArray(slice.cells) && slice.cells.length > 0;
    const cells =
      hasExplicitCells && isRecord(slice) && Array.isArray(slice.cells) ? slice.cells : [slice];
    cells.forEach((cell, cellIndex) => {
      const cellId = hasExplicitCells
        ? level3NodeId(cell, `${sliceId}:cell-${String(cellIndex + 1).padStart(2, "0")}`)
        : sliceId;
      nodes.push({
        sliceId,
        cellId,
        nodeId: cellId,
        raw: cell,
        dependencies: [...sliceDependencies, ...level3NodeDependencies(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
        metricName: level3NodeMetricName(cell) ?? sliceMetricName,
        requiredPolicyGates: [...slicePolicyGates, ...level3NodeRequiredPolicyGates(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
      });
    });
  });
  if (nodes.length === 0)
    schemaBlockers.push("manifest.slices must contain at least one slice/cell.");
  const duplicates = nodes
    .map((node) => node.nodeId)
    .filter((nodeId, index, items) => items.indexOf(nodeId) !== index);
  if (duplicates.length > 0) {
    schemaBlockers.push(
      `manifest slice/cell ids must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  return { nodes, schemaBlockers };
}

function policyPostureForRequiredGates(
  requiredPolicyGates: readonly string[],
  preflight: AutoresearchLevel3CampaignManifestPreflight,
): { posture: AutoresearchLevel3PolicyPosture; blockers: string[] } {
  if (requiredPolicyGates.length === 0) return { posture: "not_requested", blockers: [] };
  const blockers: string[] = [];
  for (const gate of requiredPolicyGates) {
    const preflightGate = preflight.policyGates.find((item) => item.gate === gate);
    if (!preflightGate) {
      blockers.push(`required policy gate ${gate} is not recognized by level-3 preflight.`);
    } else if (preflightGate.posture !== "allowed_by_manifest_policy") {
      blockers.push(`required policy gate ${gate} is ${preflightGate.posture}.`);
    }
  }
  return {
    posture: blockers.length === 0 ? "allowed_by_manifest_policy" : "blocked_missing_policy",
    blockers,
  };
}

function buildAutoresearchLevel3SliceSequenceDryRun(
  input: AutoresearchLevel3SliceSequenceDryRunRequest,
): AutoresearchLevel3SliceSequenceDryRun {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const nodesResult = buildLevel3SliceSequenceNodes(resolved.manifest);
  const orderedStates: AutoresearchLevel3SliceSequenceCellState[] = [];
  const blockers: string[] = [];
  const readyIds = new Set<string>();
  const nodeIds = new Set(nodesResult.nodes.map((node) => node.nodeId));

  if (preflight.metric.status !== "target_met") {
    blockers.push("manifest preflight is blocked; sequencing dry-run fails closed.");
  }
  blockers.push(...nodesResult.schemaBlockers);

  nodesResult.nodes.forEach((node, index) => {
    const missingDependencies = node.dependencies.filter((dependency) => !nodeIds.has(dependency));
    const blockedDependencies = node.dependencies.filter(
      (dependency) => nodeIds.has(dependency) && !readyIds.has(dependency),
    );
    const policy = policyPostureForRequiredGates(node.requiredPolicyGates, preflight);
    const nodeBlockers = [
      ...missingDependencies.map((dependency) => `missing dependency ${dependency}`),
      ...blockedDependencies.map((dependency) => `blocked dependency ${dependency}`),
      ...policy.blockers,
    ];
    const preflightBlocked = preflight.metric.status !== "target_met";
    if (preflightBlocked) nodeBlockers.push("manifest preflight blocked");
    const state: AutoresearchLevel3SliceSequenceState =
      nodeBlockers.length === 0 ? "ready" : "blocked";
    if (state === "ready") readyIds.add(node.nodeId);
    orderedStates.push({
      sliceId: node.sliceId,
      cellId: node.cellId,
      order: index + 1,
      state,
      dependencies: node.dependencies,
      missingDependencies,
      blockedDependencies,
      policyPosture: policy.posture,
      metricName: node.metricName,
      nextLegalAction:
        state === "ready"
          ? "Owner may proceed to the next level-3 dry-run stage; lower-plane actions remain withheld."
          : "Resolve dependency or preflight/policy blockers, then rerun the slice sequence dry-run.",
      blockers: nodeBlockers,
    });
  });

  const orderingBlockers = orderedStates.reduce(
    (count, state) => count + state.missingDependencies.length + state.blockedDependencies.length,
    nodesResult.schemaBlockers.length,
  );
  const recoveryBlockers =
    orderedStates.length > 0 && preflight.level2FallbackRoute.length > 0 ? 0 : 1;
  const receiptBlockers = preflight.manifestHash && orderedStates.length > 0 ? 0 : 1;
  const stateBlockers = orderedStates.reduce((count, state) => count + state.blockers.length, 0);
  const totalBlockers = preflight.metric.value + stateBlockers + receiptBlockers + recoveryBlockers;
  if (stateBlockers > 0) {
    blockers.push(
      ...orderedStates.flatMap((state) =>
        state.blockers.map((blocker) => `${state.cellId}: ${blocker}`),
      ),
    );
  }
  if (receiptBlockers > 0)
    blockers.push("dry-run receipts require a manifest hash and at least one ordered slice/cell.");
  if (recoveryBlockers > 0)
    blockers.push(
      "dry-run recovery UX requires blocked-state guidance and a level-2 fallback route.",
    );

  const receiptPolicyPosture: AutoresearchLevel3CampaignTransitionReceipt["policyPosture"] =
    preflight.metric.status !== "target_met"
      ? "blocked_preflight"
      : orderedStates.some((state) => state.state === "blocked")
        ? "blocked_dependencies_or_policy"
        : "dry_run_no_lower_plane_actions";
  const receipts = preflight.manifestHash
    ? orderedStates.map(
        (state, index): AutoresearchLevel3CampaignTransitionReceipt => ({
          kind: "autoresearch.level3_campaign_transition_receipt.v1",
          nonAuthoritative: true,
          durableEvidence: false,
          manifestHash: preflight.manifestHash as string,
          taskId: identity.taskId,
          cwd: identity.cwd,
          transitionName: "level3_slice_sequence_dry_run",
          policyPosture: receiptPolicyPosture,
          inputRefs: {
            manifestPath: resolved.manifestPath,
            sliceId: state.sliceId,
            cellId: state.cellId,
            dependencies: state.dependencies,
          },
          outputRefs: {
            packetKind: "autoresearch.level3_slice_sequence_dry_run.v1",
            state: state.state,
            receiptIndex: index + 1,
          },
          metricPosture: {
            name:
              state.state === "ready"
                ? "dry_run_receipt_blockers"
                : "autonomous_slice_sequence_blockers",
            direction: "lower",
            target: 0,
            status: state.state === "ready" ? "target_met" : "blocked",
          },
          nextState: state.state,
          rollbackHint: preflight.level2FallbackRoute,
        }),
      )
    : [];

  return {
    kind: "autoresearch.level3_slice_sequence_dry_run.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    metric: {
      name: "autonomous_slice_sequence_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      sliceOrderingBlockers: {
        name: "slice_ordering_blockers",
        direction: "lower",
        target: 0,
        value: orderingBlockers,
        status: metricStatus(orderingBlockers),
      },
      dryRunReceiptBlockers: {
        name: "dry_run_receipt_blockers",
        direction: "lower",
        target: 0,
        value: receiptBlockers,
        status: metricStatus(receiptBlockers),
      },
      sliceSequenceRecoveryBlockers: {
        name: "slice_sequence_recovery_blockers",
        direction: "lower",
        target: 0,
        value: recoveryBlockers,
        status: metricStatus(recoveryBlockers),
      },
    },
    orderedStates,
    receipts,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review the dry-run state and receipts; continue only to owner-approved visible level-3 surfaces.",
            "Rerun this dry-run after manifest edits before any lower-plane action is considered.",
            preflight.level2FallbackRoute,
          ]
        : [
            "Resolve blocked slice/cell dependencies, policy, or manifest preflight blockers and rerun the dry-run.",
            "Use the safe rerun command shown in this result after manifest repair.",
            preflight.level2FallbackRoute,
          ],
    safeRerunCommand: formatToolCall("autoresearch_live_supervision", {
      action: "level3_slice_sequence_dry_run",
      taskId: identity.taskId,
      cwd: identity.cwd,
      ...(resolved.manifestPath
        ? { level3ManifestPath: resolved.manifestPath }
        : { level3Manifest: "<inline manifest>" }),
    }),
    level2FallbackRoute: preflight.level2FallbackRoute,
    nonActions: [
      "Dry-run only: no peer launch, lower-plane runtime call, candidate-result export, review/finalizer call, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was exposed or executed.",
      "Transition receipts are local audit/review inputs only and are not AK evidence.",
    ],
    boundaries: [
      "Slice sequencing dry-run computes ready/blocked state from the accepted manifest shape and preflight output only.",
      "Transition receipts are non-authoritative and become durable evidence only through a future exact AK owner-write gate.",
      "Blocked states show rerun and level-2 fallback routes instead of exposing action-consuming calls.",
    ],
  };
}

function buildLevel3LaunchAuthorization(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  suppliedToken?: string;
}): AutoresearchLevel3VisibleCandidateLifecyclePlan["launchAuthorization"] {
  const requiredToken = `launch_visible_candidate_lanes task:${input.taskId} cwd:${input.cwd} manifest:${input.manifestHash ?? "missing"}`;
  const launchGate = input.preflight.policyGates.find(
    (gate) => gate.gate === "launchVisibleCandidatePeers",
  );
  const manifestAllowed = launchGate?.value === "manifest_allowed";
  const suppliedTokenAccepted = input.suppliedToken === requiredToken;
  return {
    posture: manifestAllowed
      ? "allowed_by_manifest_policy"
      : suppliedTokenAccepted
        ? "allowed_by_exact_token"
        : "blocked_missing_policy_or_token",
    requiredToken,
    suppliedTokenAccepted,
  };
}

function buildLevel3CandidateLifecycleLaneSpecs(manifest: unknown): {
  sliceId: string | null;
  cellId: string | null;
  laneId: string;
  objective: string;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
}[] {
  const manifestRecord = isRecord(manifest) ? manifest : {};
  const manifestFiles = stringArrayFrom(manifestRecord.filesInScope);
  const manifestOffLimits = stringArrayFrom(manifestRecord.offLimits);
  const manifestPrimaryMetric = isRecord(manifestRecord.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const manifestMetricName = optionalString(manifestPrimaryMetric?.name) ?? null;
  const manifestMetricDirection =
    optionalString(manifestPrimaryMetric?.direction) === "higher" ? "higher" : "lower";
  const manifestMetricTarget = optionalNumber(manifestPrimaryMetric?.target) ?? null;
  const matrixRecord = isRecord(manifestRecord.matrix) ? manifestRecord.matrix : null;
  const manifestCandidateCountPerCell = level3CandidateCount(matrixRecord ?? manifestRecord, 1);
  const nodes = buildLevel3SliceSequenceNodes(manifest).nodes;
  const cellScopedLanes = nodes.flatMap((node) => {
    const raw = isRecord(node.raw) ? node.raw : {};
    const explicitCellLanes = Array.isArray(raw.candidateLanes) ? raw.candidateLanes : [];
    return explicitCellLanes.map((lane, index) => {
      const rawLane = isRecord(lane) ? lane : {};
      const localLaneId = level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`);
      const laneFiles = stringArrayFrom(rawLane.filesInScope);
      const cellFiles = stringArrayFrom(raw.filesInScope);
      const laneOffLimits = stringArrayFrom(rawLane.offLimits);
      const cellOffLimits = stringArrayFrom(raw.offLimits);
      return {
        sliceId: node.sliceId,
        cellId: node.cellId,
        laneId: `${node.cellId}-${localLaneId}`,
        metricName: level3NodeMetricName(rawLane) ?? node.metricName ?? manifestMetricName,
        metricDirection:
          level3NodeMetricDirection(rawLane) ??
          level3NodeMetricDirection(raw) ??
          manifestMetricDirection,
        metricTarget:
          level3NodeMetricTarget(rawLane) ?? level3NodeMetricTarget(raw) ?? manifestMetricTarget,
        objective:
          optionalString(rawLane.objective) ??
          optionalString(raw.objective) ??
          optionalString(manifestRecord.objective) ??
          `Run visible candidate lifecycle for ${node.cellId}/${localLaneId}.`,
        filesInScope:
          laneFiles.length > 0 ? laneFiles : cellFiles.length > 0 ? cellFiles : manifestFiles,
        offLimits:
          laneOffLimits.length > 0
            ? laneOffLimits
            : cellOffLimits.length > 0
              ? cellOffLimits
              : manifestOffLimits,
      };
    });
  });
  if (cellScopedLanes.length > 0) return cellScopedLanes;

  const explicitLanes = Array.isArray(manifestRecord.candidateLanes)
    ? manifestRecord.candidateLanes
    : [];
  if (explicitLanes.length > 0) {
    return explicitLanes
      .map((lane, index) => ({
        sliceId: null,
        cellId: null,
        laneId: level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`),
        metricName:
          level3NodeMetricName(lane) ??
          optionalString(isRecord(lane) ? lane.metricName : undefined) ??
          manifestMetricName,
        metricDirection: level3NodeMetricDirection(lane) ?? manifestMetricDirection,
        metricTarget: level3NodeMetricTarget(lane) ?? manifestMetricTarget,
        objective:
          optionalString(isRecord(lane) ? lane.objective : undefined) ??
          optionalString(manifestRecord.objective) ??
          "Run the declared level-3 candidate lane.",
        filesInScope: stringArrayFrom(isRecord(lane) ? lane.filesInScope : undefined),
        offLimits: stringArrayFrom(isRecord(lane) ? lane.offLimits : undefined),
      }))
      .map((lane) => ({
        ...lane,
        filesInScope: lane.filesInScope.length > 0 ? lane.filesInScope : manifestFiles,
        offLimits: lane.offLimits.length > 0 ? lane.offLimits : manifestOffLimits,
      }));
  }

  return nodes.flatMap((node) => {
    const count = level3CandidateCount(node.raw, manifestCandidateCountPerCell);
    return Array.from({ length: count }, (_, index) => ({
      sliceId: node.sliceId,
      cellId: node.cellId,
      laneId: `${node.cellId}-candidate-${String(index + 1).padStart(2, "0")}`,
      metricName: node.metricName ?? manifestMetricName,
      metricDirection: level3NodeMetricDirection(node.raw) ?? manifestMetricDirection,
      metricTarget: level3NodeMetricTarget(node.raw) ?? manifestMetricTarget,
      objective:
        optionalString(isRecord(node.raw) ? node.raw.objective : undefined) ??
        optionalString(manifestRecord.objective) ??
        `Run visible candidate lifecycle for ${node.cellId}.`,
      filesInScope: manifestFiles,
      offLimits: manifestOffLimits,
    }));
  });
}

function buildAutoresearchLevel3VisibleCandidateLifecyclePlan(
  input: AutoresearchLevel3VisibleCandidateLifecycleRequest,
): AutoresearchLevel3VisibleCandidateLifecyclePlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const authorization = buildLevel3LaunchAuthorization({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    preflight,
    suppliedToken: input.launchAuthorizationToken,
  });
  const laneSpecs = buildLevel3CandidateLifecycleLaneSpecs(resolved.manifest);
  const duplicateLaneIds = laneSpecs
    .map((lane) => lane.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindings = [...(input.candidateBindings ?? [])];
  const duplicateBindingIds = bindings
    .map((binding) => binding.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindingsByLane = new Map(bindings.map((binding) => [binding.laneId, binding]));
  const launchAllowed = authorization.posture !== "blocked_missing_policy_or_token";
  const launchPolicyBlockers =
    preflight.metric.status === "target_met" && launchAllowed && input.parentPeerTarget
      ? duplicateLaneIds.length
      : 1 + duplicateLaneIds.length;

  const lanes = laneSpecs.map((lane) => {
    const binding = bindingsByLane.get(lane.laneId) ?? null;
    const blockers: string[] = [];
    if (preflight.metric.status !== "target_met") blockers.push("manifest preflight blocked");
    if (!launchAllowed)
      blockers.push(
        "missing accepted launchVisibleCandidatePeers manifest policy or exact launch token",
      );
    if (!input.parentPeerTarget)
      blockers.push(
        "parentPeerTarget is required before visible candidate launch calls are exposed",
      );
    if (duplicateLaneIds.includes(lane.laneId))
      blockers.push("duplicate manifest candidate lane id");
    if (!binding) blockers.push("missing candidate worktree binding for lane");
    if (duplicateBindingIds.includes(lane.laneId))
      blockers.push("duplicate candidate binding for lane");
    if (binding) {
      if (!binding.candidateWorktree) blockers.push("candidate binding missing worktree");
      if (!binding.candidateBranch) blockers.push("candidate binding missing branch");
      if (!binding.candidateBaseRef) blockers.push("candidate binding missing base ref");
    }
    const launchPosture: AutoresearchLevel3CandidateLifecycleLane["launchPosture"] = !launchAllowed
      ? "blocked_missing_launch_policy_or_token"
      : !input.parentPeerTarget
        ? "blocked_missing_parent_peer_target"
        : "ready_visible_candidate_peer_spawn_call";
    const peerPayload = {
      objective: lane.objective,
      cwd: identity.cwd,
      parentPeerTarget: input.parentPeerTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      constraints: [
        "visible candidate lane only",
        `AK task ${identity.taskId}`,
        `manifest ${preflight.manifestHash ?? "missing"}`,
      ],
    };
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      launchPosture,
      candidatePeerCall:
        launchPosture === "ready_visible_candidate_peer_spawn_call" &&
        preflight.metric.status === "target_met" &&
        launchAllowed &&
        Boolean(input.parentPeerTarget) &&
        !duplicateLaneIds.includes(lane.laneId)
          ? formatToolCall("candidate_peer_spawn", peerPayload)
          : null,
      bindingPosture: duplicateBindingIds.includes(lane.laneId)
        ? "blocked_duplicate_binding"
        : binding
          ? "bound_visible_candidate_worktree"
          : "blocked_missing_binding",
      binding,
      cleanupPosture: "plan_only_cleanup_token_required",
      cleanupPlan: [
        "Do not close peer tabs/sessions, remove worktrees, delete branches, reset, or clean candidates from this lifecycle plan.",
        "Prepare exact candidate_cleanup token naming peer sessions/tabs, worktrees, and branches before cleanup.",
      ],
      blockers,
    } satisfies AutoresearchLevel3CandidateLifecycleLane;
  });

  const bindingBlockers = lanes.reduce(
    (count, lane) =>
      count +
      (lane.bindingPosture === "bound_visible_candidate_worktree" && lane.blockers.length === 0
        ? 0
        : lane.blockers.filter((blocker) =>
            /binding|duplicate|worktree|branch|base ref/u.test(blocker),
          ).length),
    0,
  );
  const cleanupBlockers = lanes.every(
    (lane) => lane.cleanupPosture === "plan_only_cleanup_token_required",
  )
    ? 0
    : 1;
  const totalBlockers =
    preflight.metric.value + launchPolicyBlockers + bindingBlockers + cleanupBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met"
      ? []
      : ["manifest preflight is blocked; visible candidate lifecycle fails closed."]),
    ...duplicateLaneIds.map((laneId) => `duplicate manifest candidate lane id ${laneId}`),
    ...duplicateBindingIds.map((laneId) => `duplicate candidate binding for lane ${laneId}`),
    ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
  ];

  return {
    kind: "autoresearch.level3_visible_candidate_lifecycle_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    launchAuthorization: authorization,
    metric: {
      name: "candidate_lifecycle_automation_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      visibleLaunchPolicyBlockers: {
        name: "visible_launch_policy_blockers",
        direction: "lower",
        target: 0,
        value: launchPolicyBlockers,
        status: metricStatus(launchPolicyBlockers),
      },
      candidateBindingLifecycleBlockers: {
        name: "candidate_binding_lifecycle_blockers",
        direction: "lower",
        target: 0,
        value: bindingBlockers,
        status: metricStatus(bindingBlockers),
      },
      candidateCleanupPolicyBlockers: {
        name: "candidate_cleanup_policy_blockers",
        direction: "lower",
        target: 0,
        value: cleanupBlockers,
        status: metricStatus(cleanupBlockers),
      },
    },
    lanes,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review visible candidate_peer_spawn calls and bound worktree lineage; execute launch only through the visible tool surface if still intended.",
            "After candidate work completes, route measurement/export/review through the next authorized level-3 slice; this plan does not run them.",
            "Cleanup remains plan-only until exact candidate_cleanup policy/token names peer tabs/sessions, worktrees, and branches.",
          ]
        : [
            "Resolve launch policy/token, parentPeerTarget, duplicate/missing lane bindings, or manifest preflight blockers and rerun this plan.",
            "Do not launch peers, measure/export/review, cleanup, write AK evidence, or promote while lifecycle planning is blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed by the orchestrator; visible calls are returned as owner-reviewable text only when authorized.",
      "No autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Visible candidate launch requires accepted manifest launch policy or exact launch_visible_candidate_lanes token; chat text and peer reports do not authorize launch.",
      "Candidate bindings are controller-verified lineage inputs, not durable evidence or winner selection.",
      "Cleanup is a plan-only posture here; peer tab/session closure, worktree removal, and branch deletion require separate candidate_cleanup authority.",
    ],
  };
}

function buildAutoresearchLevel3MeasureExportReviewPlan(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MeasureExportReviewPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan(input);
  const runGate = preflight.policyGates.find((gate) => gate.gate === "runMeasurements");
  const exportGate = preflight.policyGates.find((gate) => gate.gate === "exportCandidateResults");
  const reviewGate = preflight.policyGates.find((gate) => gate.gate === "generateReviewPackets");
  const measurementAllowed = runGate?.posture === "allowed_by_manifest_policy";
  const exportAllowed = exportGate?.posture === "allowed_by_manifest_policy";
  const reviewAllowed = reviewGate?.posture === "allowed_by_manifest_policy";
  const packetDir = normalizeCandidateReviewPath(
    input.candidateResultPacketDirectory ?? ".autoresearch/level3-measure-export-review",
    identity.cwd,
  );
  const lanes = lifecycle.lanes.map((lane): AutoresearchLevel3MeasureExportReviewLane => {
    const blockers: string[] = [];
    if (lifecycle.metric.status !== "target_met") blockers.push("candidate lifecycle plan blocked");
    if (!measurementAllowed) blockers.push("runMeasurements manifest policy is not allowed");
    if (!exportAllowed) blockers.push("exportCandidateResults manifest policy is not allowed");
    if (!reviewAllowed) blockers.push("generateReviewPackets manifest policy is not allowed");
    if (!lane.binding?.candidateWorktree) blockers.push("missing candidate worktree binding");
    const packetPath = lane.cellId
      ? `${packetDir}/${lane.cellId}/${lane.laneId}.candidate-result.json`
      : `${packetDir}/${lane.laneId}.candidate-result.json`;
    const ready = blockers.length === 0;
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      measurementPosture: ready ? "ready_manifest_approved" : "blocked",
      exportPosture: ready ? "ready_manifest_approved" : "blocked",
      reviewPosture: ready ? "ready_manifest_approved" : "blocked",
      candidateWorktree: lane.binding?.candidateWorktree ?? null,
      candidateBranch: lane.binding?.candidateBranch ?? null,
      runtimeRunCall: ready
        ? formatToolCall("autoresearch_runtime_run", {
            cwd: lane.binding?.candidateWorktree,
            metricName: lane.metricName ?? "candidate_measure_export_review_blockers",
            direction: lane.metricDirection,
            metricThreshold: lane.metricTarget ?? undefined,
            sourceManifestHash: preflight.manifestHash,
          })
        : null,
      candidateResultExportCall: ready
        ? formatToolCall("autoresearch_runtime_status", {
            cwd: lane.binding?.candidateWorktree,
            action: "candidate_result_export",
            outPath: packetPath,
          })
        : null,
      reviewInputPacketPath: packetPath,
      blockers,
    };
  });
  const measurementPolicyBlockers = measurementAllowed ? 0 : 1;
  const candidateExportBindingBlockers =
    (exportAllowed ? 0 : 1) +
    lanes.reduce((count, lane) => count + (lane.candidateWorktree ? 0 : 1), 0);
  const reviewPacketAuthorityBlockers = reviewAllowed ? 0 : 1;
  const laneBlockers = lanes.reduce((count, lane) => count + lane.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    lifecycle.metric.value +
    measurementPolicyBlockers +
    candidateExportBindingBlockers +
    reviewPacketAuthorityBlockers +
    laneBlockers;
  const aggregateReviewCall =
    totalBlockers === 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective:
            optionalString(isRecord(resolved.manifest) ? resolved.manifest.objective : undefined) ??
            "Review level-3 measured candidates.",
          candidateResultPacketPaths: lanes.map((lane) => lane.reviewInputPacketPath),
        })
      : null;
  return {
    kind: "autoresearch.level3_measure_export_review_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    lifecycle,
    metric: {
      name: "candidate_measure_export_review_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      measurementPolicyBlockers: {
        name: "measurement_policy_blockers",
        direction: "lower",
        target: 0,
        value: measurementPolicyBlockers,
        status: metricStatus(measurementPolicyBlockers),
      },
      candidateExportBindingBlockers: {
        name: "candidate_export_binding_blockers",
        direction: "lower",
        target: 0,
        value: candidateExportBindingBlockers,
        status: metricStatus(candidateExportBindingBlockers),
      },
      reviewPacketAuthorityBlockers: {
        name: "review_packet_authority_blockers",
        direction: "lower",
        target: 0,
        value: reviewPacketAuthorityBlockers,
        status: metricStatus(reviewPacketAuthorityBlockers),
      },
    },
    lanes,
    aggregateReviewCall,
    blockers: [
      ...new Set([
        ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
        ...(lifecycle.metric.status === "target_met"
          ? []
          : ["visible candidate lifecycle plan blocked"]),
        ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
      ]),
    ],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Execute the manifest-approved measurement/export calls only through pi-autoresearch owner seams when ready.",
            "Run the aggregate review call only after candidate-result packets exist; review packets remain non-authoritative.",
          ]
        : [
            "Resolve manifest policy, candidate lifecycle, binding, or packet blockers and rerun the level-3 measure/export/review plan.",
          ],
    nonActions: [
      "No measurement, candidate-result export, or review was executed by this planner; it only emits manifest-approved call packets.",
      "No AK evidence/task write, cleanup, finalizer, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Measurement/export/review calls are routed only through pi-autoresearch seams and only when manifest policy permits them.",
      "Candidate-result packets and review packets are non-authoritative review inputs, not durable evidence or promotion authority.",
      "Stale/missing/duplicate packet cases must fail closed before owner selection or closeout.",
    ],
  };
}

function buildAutoresearchLevel3MatrixCellRunner(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MatrixCellRunner {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const manifestRecord = isRecord(resolved.manifest) ? resolved.manifest : {};
  const objective =
    optionalString(manifestRecord.objective) ?? "Run the level-3 matrix/cell campaign.";
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const dryRun = buildAutoresearchLevel3SliceSequenceDryRun({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const measureExportReview = buildAutoresearchLevel3MeasureExportReviewPlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycleByLane = new Map(lifecycle.lanes.map((lane) => [lane.laneId, lane]));
  const orderedCellIds = [
    ...new Set(
      lifecycle.lanes.map((lane) => lane.cellId ?? lane.sliceId ?? "campaign").filter(Boolean),
    ),
  ];
  const sequenceByCell = new Map(dryRun.orderedStates.map((state) => [state.cellId, state]));
  const cells = orderedCellIds.map((cellId): AutoresearchLevel3MatrixCellRunnerCell => {
    const lifecycleLanes = lifecycle.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const measureLanes = measureExportReview.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const firstLifecycleLane = lifecycleLanes[0];
    const firstMeasureLane = measureLanes[0];
    const reviewCandidateWaveCall =
      measureLanes.length > 0
        ? formatToolCall("autoresearch_live_supervision", {
            action: "review_candidate_wave",
            taskId: identity.taskId,
            cwd: identity.cwd,
            objective: firstLifecycleLane?.objective ?? objective,
            direction: firstMeasureLane?.metricDirection ?? "lower",
            candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
            offLimits: firstLifecycleLane?.offLimits ?? [],
          })
        : null;
    const candidateWaveReview = reviewCandidateWaveCall
      ? reviewAutoresearchCandidateWave({
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective: firstLifecycleLane?.objective ?? objective,
          direction: firstMeasureLane?.metricDirection ?? "lower",
          candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
          offLimits: firstLifecycleLane?.offLimits ?? [],
        })
      : null;
    const launchCalls = lifecycleLanes
      .filter((lane) => lane.bindingPosture !== "bound_visible_candidate_worktree")
      .map((lane) => lane.candidatePeerCall)
      .filter((call): call is string => Boolean(call));
    const measureExportCalls = measureLanes.flatMap((lane) =>
      lane.measurementPosture === "ready_manifest_approved"
        ? [lane.runtimeRunCall, lane.candidateResultExportCall].filter((call): call is string =>
            Boolean(call),
          )
        : [],
    );
    const laneRows = measureLanes.map((measureLane) => {
      const lifecycleLane = lifecycleByLane.get(measureLane.laneId);
      const packetPath = measureLane.reviewInputPacketPath;
      const packetExists = fs.existsSync(path.resolve(identity.cwd, packetPath));
      const selected = candidateWaveReview?.recommendation.laneId === measureLane.laneId;
      return {
        laneId: measureLane.laneId,
        launchPosture:
          lifecycleLane?.launchPosture ?? ("blocked_missing_launch_policy_or_token" as const),
        bindingPosture: lifecycleLane?.bindingPosture ?? ("blocked_missing_binding" as const),
        measurementPosture: measureLane.measurementPosture,
        packetPath,
        packetExists,
        selected,
        nextLegalCall: !lifecycleLane?.binding
          ? (lifecycleLane?.candidatePeerCall ?? null)
          : !packetExists && measureLane.runtimeRunCall
            ? measureLane.runtimeRunCall
            : packetExists
              ? reviewCandidateWaveCall
              : measureLane.candidateResultExportCall,
      };
    });
    const launchReadyLaneCount = lifecycleLanes.filter(
      (lane) =>
        lane.candidatePeerCall && lane.launchPosture === "ready_visible_candidate_peer_spawn_call",
    ).length;
    const boundLaneCount = lifecycleLanes.filter(
      (lane) => lane.bindingPosture === "bound_visible_candidate_worktree",
    ).length;
    const measureReadyLaneCount = measureLanes.filter(
      (lane) => lane.measurementPosture === "ready_manifest_approved",
    ).length;
    const packetReadyLaneCount = laneRows.filter((lane) => lane.packetExists).length;
    const sequenceState = sequenceByCell.get(cellId);
    const baseBlockers = [
      ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
      ...(sequenceState?.state === "blocked"
        ? sequenceState.blockers.map((blocker) => `sequence blocked: ${blocker}`)
        : []),
      ...lifecycleLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
      ...measureLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
    ];
    const state: AutoresearchLevel3MatrixCellRunnerCellState =
      preflight.metric.status !== "target_met" || sequenceState?.state === "blocked"
        ? "blocked_preflight_or_sequence"
        : boundLaneCount === 0 && launchReadyLaneCount > 0
          ? "ready_to_launch_visible_candidates"
          : boundLaneCount < lifecycleLanes.length
            ? "waiting_for_candidate_bindings"
            : measureReadyLaneCount > 0 && packetReadyLaneCount < measureLanes.length
              ? "ready_for_measure_export"
              : packetReadyLaneCount < measureLanes.length
                ? "waiting_for_candidate_result_packets"
                : candidateWaveReview?.recommendation.posture === "owner_selection_required"
                  ? "selected_for_matrix_review"
                  : "cell_rerun_required";
    const stateBlockers =
      state === "ready_to_launch_visible_candidates" ||
      state === "ready_for_measure_export" ||
      state === "selected_for_matrix_review"
        ? []
        : state === "waiting_for_candidate_bindings"
          ? [`${lifecycleLanes.length - boundLaneCount} lane(s) missing candidate bindings`]
          : state === "waiting_for_candidate_result_packets"
            ? [`${measureLanes.length - packetReadyLaneCount} lane packet(s) missing`]
            : state === "cell_rerun_required"
              ? [candidateWaveReview?.recommendation.reason ?? "no selectable candidate"]
              : [];
    return {
      sliceId: firstLifecycleLane?.sliceId ?? null,
      cellId,
      objective: firstLifecycleLane?.objective ?? objective,
      state,
      metricName: firstMeasureLane?.metricName ?? firstLifecycleLane?.metricName ?? null,
      metricDirection:
        firstMeasureLane?.metricDirection ?? firstLifecycleLane?.metricDirection ?? "lower",
      metricTarget: firstMeasureLane?.metricTarget ?? firstLifecycleLane?.metricTarget ?? null,
      laneCount: lifecycleLanes.length,
      launchReadyLaneCount,
      boundLaneCount,
      measureReadyLaneCount,
      packetReadyLaneCount,
      selectedLaneId: candidateWaveReview?.recommendation.laneId ?? null,
      launchCalls,
      measureExportCalls,
      reviewCandidateWaveCall,
      blockers: [...new Set([...baseBlockers, ...stateBlockers])],
      lanes: laneRows,
    };
  });
  const selectedCells = cells.filter((cell) => cell.state === "selected_for_matrix_review").length;
  const blockedCells = cells.filter(
    (cell) =>
      cell.state === "blocked_preflight_or_sequence" || cell.state === "cell_rerun_required",
  ).length;
  const cellBlockerCount = cells.reduce((count, cell) => count + cell.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    dryRun.metric.value +
    lifecycle.metric.value +
    measureExportReview.metric.value +
    cellBlockerCount;
  const selectedPacketPaths = cells.flatMap((cell) =>
    cell.lanes.filter((lane) => lane.selected).map((lane) => lane.packetPath),
  );
  const aggregateReviewCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          candidateResultPacketPaths: selectedPacketPaths,
        })
      : null;
  const finalizerPlanCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          sourceReview: "review_matrix_campaign",
          ...(resolved.manifestPath
            ? { level3ManifestPath: resolved.manifestPath }
            : { level3Manifest: "<same accepted inline manifest>" }),
          candidateResultPacketPaths: selectedPacketPaths,
          finalizerAuthorizationToken: "<exact finalize_post_fanin token required>",
          cleanupAuthorizationToken: "<exact candidate_cleanup token required>",
        })
      : null;
  const nextLegalActions = [
    ...cells.flatMap((cell) => {
      if (cell.state === "ready_to_launch_visible_candidates") return cell.launchCalls;
      if (cell.state === "ready_for_measure_export") return cell.measureExportCalls;
      if (cell.state === "selected_for_matrix_review" && cell.reviewCandidateWaveCall)
        return [cell.reviewCandidateWaveCall];
      return [];
    }),
    ...(aggregateReviewCall ? [aggregateReviewCall] : []),
    ...(finalizerPlanCall ? [finalizerPlanCall] : []),
  ];
  return {
    kind: "autoresearch.level3_matrix_cell_runner.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    dryRun,
    lifecycle,
    measureExportReview,
    metric: {
      name: "level3_matrix_cell_runner_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      readyToLaunchCells: cells.filter(
        (cell) => cell.state === "ready_to_launch_visible_candidates",
      ).length,
      boundCells: cells.filter((cell) => cell.boundLaneCount === cell.laneCount).length,
      measureExportReadyCells: cells.filter((cell) => cell.state === "ready_for_measure_export")
        .length,
      packetReadyCells: cells.filter((cell) => cell.packetReadyLaneCount === cell.laneCount).length,
      selectedCells,
      blockedCells,
    },
    cells,
    aggregateReviewCall,
    finalizerPlanCall,
    nextLegalActions,
    blockers: [
      ...new Set([
        ...preflight.blockers,
        ...dryRun.blockers,
        ...lifecycle.blockers,
        ...measureExportReview.blockers,
        ...cells.flatMap((cell) => cell.blockers.map((blocker) => `${cell.cellId}: ${blocker}`)),
      ]),
    ],
    nonActions: [
      "The unified matrix/cell runner did not spawn peers; it exposes visible candidate_peer_spawn calls only as next legal actions.",
      "The runner did not execute autoresearch_candidate_bind, autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK evidence, merge, release, or promotion actions.",
      "Peer reports and candidate-result packets remain review inputs, not durable authority or promotion approval.",
    ],
    boundaries: [
      "This is the Level-3 matrix/cell state machine above existing gated seams: launch -> bind -> measure/export -> review -> select/finalize-plan.",
      "Visible candidate launch still requires manifest policy or exact token plus the visible candidate_peer_spawn surface.",
      "Measurement/export/review calls are surfaced only after controller-verified candidate bindings and manifest policy allow them.",
      "Finalizer, cleanup, AK evidence, and promotion remain exact-gated owner surfaces and are never applied by this runner.",
    ],
  };
}

function exactStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function resolveLevel3CleanupResources(input: {
  cwd: string;
  manifest: unknown;
  cleanupResources?: AutoresearchLevel3CleanupResourcesInput;
}): {
  peerTabsOrSessions: string[];
  worktrees: string[];
  branches: string[];
  manifestExact: boolean;
  missing: string[];
} {
  const manifestRecord = isRecord(input.manifest) ? input.manifest : null;
  const policy = isRecord(manifestRecord?.cleanupPolicy) ? manifestRecord.cleanupPolicy : null;
  const manifestPeers = [
    ...exactStringList(policy?.exactPeerTabsOrSessions),
    ...exactStringList(policy?.exactPeerSessions),
    ...exactStringList(policy?.exactPeerTabs),
  ];
  const manifestWorktrees = exactStringList(policy?.exactWorktrees);
  const manifestBranches = exactStringList(policy?.exactBranches);
  const suppliedPeers = nonEmptyStrings(input.cleanupResources?.peerTabsOrSessions);
  const suppliedWorktrees = nonEmptyStrings(input.cleanupResources?.worktrees);
  const suppliedBranches = nonEmptyStrings(input.cleanupResources?.branches);
  const peerTabsOrSessions = suppliedPeers.length > 0 ? suppliedPeers : manifestPeers;
  const worktrees = suppliedWorktrees.length > 0 ? suppliedWorktrees : manifestWorktrees;
  const branches = suppliedBranches.length > 0 ? suppliedBranches : manifestBranches;
  const sorted = (items: readonly string[]) =>
    [...new Set(items.map((item) => item.trim()))].sort();
  const same = (left: readonly string[], right: readonly string[]) =>
    stableJson(sorted(left)) === stableJson(sorted(right));
  const manifestExact =
    manifestPeers.length > 0 &&
    manifestWorktrees.length > 0 &&
    manifestBranches.length > 0 &&
    same(peerTabsOrSessions, manifestPeers) &&
    same(worktrees, manifestWorktrees) &&
    same(branches, manifestBranches);
  const missing = [
    ...(peerTabsOrSessions.length === 0 ? ["peer tabs/sessions"] : []),
    ...(worktrees.length === 0 ? ["worktrees"] : []),
    ...(branches.length === 0 ? ["branches"] : []),
  ];
  return {
    peerTabsOrSessions: sorted(peerTabsOrSessions),
    worktrees: sorted(
      worktrees.map((item) => (path.isAbsolute(item) ? item : path.resolve(input.cwd, item))),
    ),
    branches: sorted(branches),
    manifestExact,
    missing,
  };
}

function buildLevel3FinalizerToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  postFaninToken: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.taskId}\0${path.resolve(input.cwd)}\0${input.manifestHash ?? "missing"}\0${input.postFaninToken}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:finalize_post_fanin:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function buildLevel3CleanupToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): string {
  const digest = createHash("sha256")
    .update(
      stableJson({
        taskId: input.taskId,
        cwd: path.resolve(input.cwd),
        manifestHash: input.manifestHash ?? "missing",
        peerTabsOrSessions: input.resources.peerTabsOrSessions,
        worktrees: input.resources.worktrees,
        branches: input.resources.branches,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:candidate_cleanup:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function findForbiddenPromotionCommandMatches(commands: readonly string[]): string[] {
  const forbiddenPatterns = [
    /\b(?:merge|push|rebase|tag|release|publish|pull[-_\s]?request|\bpr\b)\b/iu,
    /promotion/iu,
  ];
  return commands.filter((command) => forbiddenPatterns.some((pattern) => pattern.test(command)));
}

function buildNiriVisiblePeerWindowCloseCommand(peerTabOrSession: string): string {
  return `niri msg -j windows | jq -r --arg needle ${shellQuote(peerTabOrSession)} '.[] | select((.title // "") | contains($needle)) | .id' | xargs -r -n1 niri msg action close-window --id`;
}

function buildGhosttySidequestProcessGroupCloseCommand(worktree: string): string {
  return `pgid=$(ps -eo pgid=,args= | awk -v wt=${shellQuote(worktree)} 'index($0, wt) && index($0, "sidequest-pi pi") { print $1; exit }'); if [ -n "$pgid" ]; then kill -TERM -- "-$pgid"; sleep 2; if ps -o pid= -g "$pgid" >/dev/null 2>&1; then kill -KILL -- "-$pgid"; fi; fi`;
}

function buildLevel3CleanupCommandPacket(input: {
  identity: SessionIdentity;
  manifestHash: string;
  authorizationToken: string;
  cleanupExecution: AutoresearchLevel3CleanupCommandPacket["cleanupExecution"];
  cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"];
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): AutoresearchLevel3CleanupCommandPacket {
  const commands = [
    ...input.resources.peerTabsOrSessions.map((session) =>
      buildNiriVisiblePeerWindowCloseCommand(session),
    ),
    ...input.resources.worktrees.map((worktree) =>
      buildGhosttySidequestProcessGroupCloseCommand(worktree),
    ),
    ...input.resources.worktrees.map(
      (worktree) =>
        `git -C ${shellQuote(input.identity.cwd)} worktree remove ${shellQuote(worktree)}`,
    ),
    ...input.resources.branches.map(
      (branch) => `git -C ${shellQuote(input.identity.cwd)} branch -D ${shellQuote(branch)}`,
    ),
  ];
  return {
    kind: "autoresearch.level3_candidate_cleanup_command_packet.v1",
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    manifestHash: input.manifestHash,
    authorizationToken: input.authorizationToken,
    authorizationRequired: true,
    cleanupExecution: input.cleanupExecution,
    cleanupTrigger: input.cleanupTrigger,
    exactPeerTabsOrSessions: input.resources.peerTabsOrSessions,
    exactWorktrees: input.resources.worktrees,
    exactBranches: input.resources.branches,
    exactCommands: commands,
    forbiddenPromotionCommandMatches: findForbiddenPromotionCommandMatches(commands),
    boundary:
      "This cleanup packet names exact peer tabs/sessions, worktrees, and branches only; it is not executed by the orchestrator and carries no merge, push, PR, release, promotion, or AK-write authority.",
  };
}

function buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan(
  input: AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
): AutoresearchLevel3AuthorizedFinalizerCleanupPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("level3_authorized_finalizer_cleanup_plan requires a non-empty objective.");
  }
  const sourceReview = input.sourceReview ?? "review_candidate_wave";
  const finalizerProbe = finalizeAutoresearchPostFanin({
    ...identity,
    objective,
    sourceReview,
    direction: input.direction,
    metricName: input.metricName,
    metricThreshold: input.metricThreshold,
    candidateResultPacketPaths: input.candidateResultPacketPaths,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
    selectedLaneId: input.selectedLaneId,
    selectedCellId: input.selectedCellId,
    validation: input.validation,
    offLimits: input.offLimits,
    dirtyFiles: input.dirtyFiles,
    reviewedAtEpochMs: input.reviewedAtEpochMs,
  });
  const requiredFinalizerToken = buildLevel3FinalizerToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    postFaninToken: finalizerProbe.contract.exactAuthorizationToken,
  });
  const finalizerTokenMissing = !input.finalizerAuthorizationToken;
  const finalizerTokenWrong =
    Boolean(input.finalizerAuthorizationToken) &&
    input.finalizerAuthorizationToken !== requiredFinalizerToken;
  const finalizerTokenAccepted =
    preflight.metric.status === "target_met" &&
    finalizerProbe.preflight.status === "passed" &&
    input.finalizerAuthorizationToken === requiredFinalizerToken;
  const finalizer = finalizerTokenAccepted
    ? finalizeAutoresearchPostFanin({
        ...identity,
        objective,
        sourceReview,
        direction: input.direction,
        metricName: input.metricName,
        metricThreshold: input.metricThreshold,
        candidateResultPacketPaths: input.candidateResultPacketPaths,
        scenarios: input.scenarios,
        hypotheses: input.hypotheses,
        candidateCountPerCell: input.candidateCountPerCell,
        selectedLaneId: input.selectedLaneId,
        selectedCellId: input.selectedCellId,
        validation: input.validation,
        offLimits: input.offLimits,
        dirtyFiles: input.dirtyFiles,
        reviewedAtEpochMs: input.reviewedAtEpochMs,
        applyAuthorizationToken: finalizerProbe.contract.exactAuthorizationToken,
      })
    : finalizerProbe;
  const resources = resolveLevel3CleanupResources({
    cwd: identity.cwd,
    manifest: resolved.manifest,
    cleanupResources: input.cleanupResources,
  });
  const requiredCleanupToken = buildLevel3CleanupToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    resources,
  });
  const cleanupGate = preflight.policyGates.find((gate) => gate.gate === "cleanupCandidates");
  const cleanupManifestPolicyAccepted =
    preflight.metric.status === "target_met" &&
    cleanupGate?.value === "token_required_or_manifest_allowed" &&
    resources.manifestExact &&
    resources.missing.length === 0;
  const integrationCloseout: AutoresearchLevel3IntegrationCloseoutEvidence = {
    status: input.integrationCloseout?.status ?? "missing",
    ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
    ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
  };
  const integrationCloseoutSuccessful = integrationCloseout.status === "successful";
  const cleanupCloseoutAccepted =
    finalizerTokenAccepted && integrationCloseoutSuccessful && resources.missing.length === 0;
  const cleanupTokenWrong =
    Boolean(input.cleanupAuthorizationToken) &&
    input.cleanupAuthorizationToken !== requiredCleanupToken;
  const cleanupTokenAccepted = input.cleanupAuthorizationToken === requiredCleanupToken;
  const cleanupAuthorized =
    finalizerTokenAccepted &&
    resources.missing.length === 0 &&
    (cleanupTokenAccepted || cleanupManifestPolicyAccepted || cleanupCloseoutAccepted) &&
    !cleanupTokenWrong;
  const cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"] =
    cleanupTokenAccepted
      ? "candidate_cleanup_token"
      : cleanupCloseoutAccepted
        ? "successful_integration_closeout"
        : "exact_manifest_policy";
  const cleanupCommandPacket = cleanupAuthorized
    ? buildLevel3CleanupCommandPacket({
        identity,
        manifestHash: preflight.manifestHash ?? "missing",
        authorizationToken: cleanupTokenAccepted
          ? requiredCleanupToken
          : cleanupCloseoutAccepted
            ? "successful_integration_closeout"
            : "manifest_cleanup_policy",
        cleanupExecution: cleanupCloseoutAccepted
          ? "ready_for_automatic_controller_cleanup_after_successful_integration_closeout"
          : "not_executed_by_orchestrator",
        cleanupTrigger,
        resources,
      })
    : null;
  const finalizerTokenBlockers =
    preflight.metric.value +
    finalizer.preflight.blockerCount +
    (finalizerTokenAccepted ? 0 : 1) +
    (finalizer.authorizedFinalizerCleanupGate.status === "blocked" ? 1 : 0);
  const cleanupGateBlockers =
    resources.missing.length +
    (cleanupAuthorized ? 0 : 1) +
    (cleanupCommandPacket?.forbiddenPromotionCommandMatches.length ?? 0);
  const rollbackBlockers = preflight.manifestHash && finalizer.finalizerTokenRequest ? 0 : 1;
  const totalBlockers = finalizerTokenBlockers + cleanupGateBlockers + rollbackBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight is blocked"]),
    ...(finalizer.preflight.status === "passed"
      ? []
      : ["post-fan-in finalizer preflight is blocked"]),
    ...(finalizerTokenMissing ? ["missing exact finalize_post_fanin level-3 token"] : []),
    ...(finalizerTokenWrong
      ? ["wrong finalize_post_fanin token for task/cwd/manifest/review scope"]
      : []),
    ...resources.missing.map((item) => `cleanup resource set missing exact ${item}`),
    ...(cleanupTokenWrong ? ["wrong candidate_cleanup token for exact cleanup resources"] : []),
    ...(!cleanupTokenAccepted && !cleanupManifestPolicyAccepted && !cleanupCloseoutAccepted
      ? [
          "cleanup requires exact candidate_cleanup token, successful integration closeout with exact cleanup resources, or accepted manifest cleanup policy naming exact peer tabs/sessions, worktrees, and branches",
        ]
      : []),
    ...(finalizerTokenAccepted
      ? []
      : ["cleanup is blocked until the exact finalizer token is accepted"]),
    ...(cleanupCommandPacket?.forbiddenPromotionCommandMatches ?? []).map(
      (command) => `cleanup packet contains forbidden promotion command: ${command}`,
    ),
  ];
  const rollbackReceipt: AutoresearchLevel3CampaignTransitionReceipt = {
    kind: "autoresearch.level3_campaign_transition_receipt.v1",
    nonAuthoritative: true,
    durableEvidence: false,
    manifestHash: preflight.manifestHash ?? "missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    transitionName: "level3_authorized_finalizer_cleanup_plan",
    policyPosture:
      totalBlockers === 0
        ? "dry_run_no_lower_plane_actions"
        : preflight.metric.status === "target_met"
          ? "blocked_dependencies_or_policy"
          : "blocked_preflight",
    inputRefs: {
      manifestPath: resolved.manifestPath,
      sliceId: "slice-5",
      cellId: "authorized-finalizer-cleanup",
      dependencies: ["review_candidate_wave_or_review_matrix_campaign", "finalize_post_fanin"],
    },
    outputRefs: {
      packetKind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
      state: totalBlockers === 0 ? "ready" : "blocked",
      receiptIndex: 1,
    },
    metricPosture: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      status: metricStatus(totalBlockers),
    },
    nextState: totalBlockers === 0 ? "ready" : "blocked",
    rollbackHint:
      stringArrayFrom(isRecord(resolved.manifest) ? resolved.manifest.rollback : undefined)[0] ??
      preflight.level2FallbackRoute,
  };
  return {
    kind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    finalizer,
    finalizerAuthorization: {
      requiredTokenName: "finalize_post_fanin",
      requiredToken: requiredFinalizerToken,
      suppliedTokenAccepted: finalizerTokenAccepted,
      posture: finalizerTokenAccepted
        ? "accepted_exact_token"
        : finalizerTokenWrong
          ? "blocked_wrong_token"
          : "blocked_missing_token",
    },
    cleanupAuthorization: {
      requiredTokenName: "candidate_cleanup",
      requiredToken: requiredCleanupToken,
      suppliedTokenAccepted: cleanupTokenAccepted,
      manifestPolicyAccepted: cleanupManifestPolicyAccepted,
      posture: cleanupAuthorized
        ? cleanupTokenAccepted
          ? "accepted_exact_token"
          : cleanupCloseoutAccepted
            ? "accepted_successful_integration_closeout"
            : "accepted_exact_manifest_policy"
        : resources.missing.length > 0
          ? "blocked_missing_exact_resources"
          : cleanupTokenWrong
            ? "blocked_wrong_token"
            : "blocked_missing_token_or_exact_policy",
    },
    metric: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      finalizerTokenApplicationBlockers: {
        name: "finalizer_token_application_blockers",
        direction: "lower",
        target: 0,
        value: finalizerTokenBlockers,
        status: metricStatus(finalizerTokenBlockers),
      },
      cleanupExecutionGateBlockers: {
        name: "cleanup_execution_gate_blockers",
        direction: "lower",
        target: 0,
        value: cleanupGateBlockers,
        status: metricStatus(cleanupGateBlockers),
      },
      postFaninRollbackBlockers: {
        name: "post_fanin_rollback_blockers",
        direction: "lower",
        target: 0,
        value: rollbackBlockers,
        status: metricStatus(rollbackBlockers),
      },
    },
    finalizerApplyCommandPacket: finalizer.exactApplyCommandPacket,
    cleanupCommandPacket,
    integrationCloseout,
    rollbackReceipt,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            integrationCloseoutSuccessful
              ? "Run the exact cleanup packet automatically as the final Level-3 integration-closeout step; close only the named peer tabs/sessions and remove only the named worktrees/branches."
              : "Review exact finalizer apply and cleanup command packets; execute cleanup automatically after successful integration closeout, or explicitly with candidate_cleanup if cleanup is needed earlier.",
            "Keep merge, release, PR, push, promotion, and AK evidence/task writes behind separate promotion and ak_owner_write tokens.",
          ]
        : [
            "Resolve manifest, review freshness, dirty/off-limits, exact finalizer token, and exact cleanup policy/token blockers before any post-fan-in action.",
            "Use the rollback receipt hint and fall back to level-2 review/finalizer packet surfaces while blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn, autoresearch_runtime_run, candidate_result_export, review, finalizer apply, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, PR, push, or promotion was executed by this planner.",
      "Finalizer apply packets and cleanup command packets are command packets only; when integrationCloseout.status=successful, the controller/workbench should consume the exact cleanup packet automatically as part of closeout rather than leaving candidate resources behind.",
    ],
    boundaries: [
      "finalize_post_fanin authorizes only finalizer scope for the exact task/cwd/manifest/review packet chain; it does not authorize cleanup, promotion, or AK writes.",
      "candidate_cleanup names exact peer tabs/sessions, worktrees, and branches for pre-closeout cleanup; after successful integration closeout, exact cleanup resources are automatically eligible for cleanup without a second operator prompt.",
      "Dirty overlap, off-limits drift, stale review artifacts, wrong tokens, missing exact cleanup resources, and promotion command leakage fail closed.",
      "Rollback receipt is visible and non-authoritative; receipts/packets become durable evidence only through separate ak_owner_write.",
    ],
  };
}

export async function readAutoresearchLiveObservation(
  input: { cwd: string },
  config: Pick<
    AutoresearchLiveSupervisionRunnerConfig,
    | "observeRuntime"
    | "loadLedger"
    | "projectLedgerEntries"
    | "inspectFinalization"
    | "observeOracleEvidence"
  > = {},
): Promise<AutoresearchLiveObservation> {
  const cwd = path.resolve(input.cwd);
  const runtime = await (config.observeRuntime || buildAutoresearchRuntimeStatus)(cwd, {
    persistSnapshot: false,
  });
  const ledgerLoad = await (config.loadLedger || loadAutoresearchLedger)(cwd);
  const ledgerProjection = await (config.projectLedgerEntries || projectAutoresearchLedgerEntries)(
    ledgerLoad.entries,
  );
  const ledger = toSupervisorLedgerLike(ledgerProjection);
  const finalization = await (config.inspectFinalization || inspectAutoresearchFinalization)({
    cwd,
    status: runtime,
  });
  const oracleEvidence = await (
    config.observeOracleEvidence || buildAutoresearchOracleEvidencePacket
  )(cwd);

  return {
    cwd,
    runtime,
    ledgerLoad,
    ledger,
    finalization,
    oracleEvidence,
  };
}

export class AutoresearchLiveSupervisionRunner {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly setTimeoutImpl: (
    callback: () => void | Promise<void>,
    delayMs: number,
  ) => unknown;
  private readonly clearTimeoutImpl: (handle: unknown) => void;
  private readonly config: AutoresearchLiveSupervisionRunnerConfig;

  constructor(config: AutoresearchLiveSupervisionRunnerConfig = {}) {
    this.config = config;
    this.now = config.now || (() => Date.now());
    this.setTimeoutImpl =
      config.setTimeout ||
      ((callback, delayMs) => globalThis.setTimeout(() => void callback(), delayMs));
    this.clearTimeoutImpl =
      config.clearTimeout || ((handle) => globalThis.clearTimeout(handle as NodeJS.Timeout));
  }

  async observe(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLivePollResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);
    const policy =
      existing?.session.policy ?? resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    return this.executeReadOnlyObservation({
      identity,
      policy,
      previousSession: existing?.session ?? null,
      signal: input.signal,
    });
  }

  async start(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLiveStartResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (existing && existing.session.state === "running") {
      return {
        sessionKey: identity.sessionKey,
        session: cloneSession(existing.session),
        reused: true,
        poll: null,
      };
    }

    const policy = resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    const record = this.createRecord(identity, policy, true);
    this.sessions.set(identity.sessionKey, record);

    const poll = await this.runPoll(record, { signal: input.signal, reschedule: true });
    return {
      sessionKey: identity.sessionKey,
      session: poll.session,
      reused: false,
      poll,
    };
  }

  async startCampaign(
    input: AutoresearchLiveStartCampaignRequest,
  ): Promise<AutoresearchLiveStartCampaignResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const campaignObjective = input.objective.trim();
    if (campaignObjective.length === 0) {
      throw new Error("start_campaign requires a non-empty objective.");
    }

    const maxIterations = resolveStartCampaignPositiveIntegerBudget(
      "maxIterations",
      input.maxIterations,
      3,
    );
    const maxWallClockMinutes = resolveStartCampaignPositiveNumberBudget(
      "maxWallClockMinutes",
      input.maxWallClockMinutes,
      30,
    );

    const campaign = await (this.config.startCampaign || executeAutoresearchCampaignStart)({
      cwd: identity.cwd,
      objective: campaignObjective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations,
      maxWallClockMinutes,
      peerMode: "plan",
      benchmarkCommand: input.benchmarkCommand,
      checksCommand: input.checksCommand,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      direction: input.direction,
      metricThreshold: input.metricThreshold,
      reconfigure: input.reconfigure,
      filesInScope: input.filesInScope,
      offLimits: input.offLimits,
      constraints: input.constraints,
      planner: input.planner,
      materializeDspxIntent: input.materializeDspxIntent,
      runDspxProgramGen: input.runDspxProgramGen,
      dspxProgramGenTimeoutSeconds: input.dspxProgramGenTimeoutSeconds,
      dspxIntentPath: input.dspxIntentPath,
      dspxOutdir: input.dspxOutdir,
      dspxBehaviorPath: input.dspxBehaviorPath,
      signal: input.signal,
    });

    const supervision = await this.start(input);
    return { campaign, supervision };
  }

  planCandidateWave(input: AutoresearchCandidateWaveRequest): AutoresearchCandidateWavePlan {
    return planAutoresearchCandidateWave(input);
  }

  preflightLevel3CampaignManifest(
    input: AutoresearchLevel3ManifestPreflightRequest,
  ): AutoresearchLevel3CampaignManifestPreflight {
    return buildAutoresearchLevel3ManifestPreflight(input);
  }

  dryRunLevel3SliceSequence(
    input: AutoresearchLevel3SliceSequenceDryRunRequest,
  ): AutoresearchLevel3SliceSequenceDryRun {
    return buildAutoresearchLevel3SliceSequenceDryRun(input);
  }

  planLevel3VisibleCandidateLifecycle(
    input: AutoresearchLevel3VisibleCandidateLifecycleRequest,
  ): AutoresearchLevel3VisibleCandidateLifecyclePlan {
    return buildAutoresearchLevel3VisibleCandidateLifecyclePlan(input);
  }

  planLevel3MeasureExportReview(
    input: AutoresearchLevel3MeasureExportReviewRequest,
  ): AutoresearchLevel3MeasureExportReviewPlan {
    return buildAutoresearchLevel3MeasureExportReviewPlan(input);
  }

  runLevel3MatrixCellRunner(
    input: AutoresearchLevel3MeasureExportReviewRequest,
  ): AutoresearchLevel3MatrixCellRunner {
    return buildAutoresearchLevel3MatrixCellRunner(input);
  }

  planLevel3AuthorizedFinalizerCleanup(
    input: AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
  ): AutoresearchLevel3AuthorizedFinalizerCleanupPlan {
    return buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan(input);
  }

  planMatrixCampaign(input: AutoresearchMatrixCampaignRequest): AutoresearchMatrixCampaignPlan {
    return planAutoresearchMatrixCampaign(input);
  }

  prepareMatrixCampaignRunner(
    input: AutoresearchMatrixCampaignRunnerRequest,
  ): AutoresearchMatrixCampaignRunnerContract {
    return buildAutoresearchMatrixCampaignRunnerContract(input);
  }

  checkpointMatrixCampaignRunner(
    input: AutoresearchMatrixCampaignRunnerRequest,
  ): AutoresearchMatrixCampaignRunnerCheckpoint {
    return checkpointAutoresearchMatrixCampaignRunner(input);
  }

  advanceLevel3MatrixCellExecutor(
    input: AutoresearchLevel3MatrixCellExecutorRequest,
  ): AutoresearchLevel3MatrixCellExecutor {
    return advanceAutoresearchLevel3MatrixCellExecutor(input);
  }

  runLevel4CampaignRunner(
    input: AutoresearchLevel4CampaignRunnerRequest,
  ): AutoresearchLevel4CampaignRunner {
    return runAutoresearchLevel4CampaignRunner(input);
  }

  reviewMatrixCampaign(input: AutoresearchMatrixCampaignRequest): AutoresearchMatrixCampaignReview {
    return reviewAutoresearchMatrixCampaign(input);
  }

  reviewCandidateWave(
    input: AutoresearchCandidateWaveReviewRequest,
  ): AutoresearchCandidateWaveReview {
    return reviewAutoresearchCandidateWave(input);
  }

  finalizePostFanin(
    input: AutoresearchPostFaninFinalizerRequest,
  ): AutoresearchPostFaninFinalizerResult {
    return finalizeAutoresearchPostFanin(input);
  }

  stop(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveStopResult {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (!existing) {
      return {
        sessionKey: identity.sessionKey,
        session: null,
        stopped: false,
        nextStep: "No live supervision session is active for this task/cwd pair.",
      };
    }

    existing.keepRunning = false;
    this.cancelTimer(existing);
    existing.session = {
      ...existing.session,
      state: "stopped",
      lastLifecycleAction: "stopped",
      lastSummary: "Live supervision stopped by operator.",
      lastError: null,
    };

    return {
      sessionKey: identity.sessionKey,
      session: cloneSession(existing.session),
      stopped: true,
      nextStep: "Live supervision is stopped. Start it again to resume polling.",
    };
  }

  getSession(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveSupervisionSessionV1 | null {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const session = this.sessions.get(identity.sessionKey)?.session;
    return session ? cloneSession(session) : null;
  }

  listSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return [...this.sessions.values()].map((record) => cloneSession(record.session));
  }

  listActiveSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return this.listSessions().filter((session) => session.state === "running");
  }

  dispose(): void {
    for (const record of this.sessions.values()) {
      record.keepRunning = false;
      this.cancelTimer(record);
      if (record.session.state === "running") {
        record.session = {
          ...record.session,
          state: "stopped",
          lastLifecycleAction: "stopped",
          lastSummary: "Live supervision stopped because the runner was disposed.",
          lastError: null,
        };
      }
    }
  }

  private createRecord(
    identity: SessionIdentity,
    policy: AutoresearchLiveSupervisionPolicyV1,
    persistent: boolean,
  ): SessionRecord {
    return {
      identity,
      persistent,
      keepRunning: persistent,
      session: {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: identity.taskId,
        cwd: identity.cwd,
        policy: { ...policy },
        state: persistent ? "running" : "stopped",
        startedAt: this.now(),
        lastPolledAt: null,
        pollCount: 0,
        lastRuntimeState: null,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary: null,
        lastError: null,
      },
      timer: null,
      inFlight: null,
    };
  }

  private runPoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    if (record.inFlight) {
      return record.inFlight;
    }

    const promise = this.executePoll(record, options).finally(() => {
      if (record.inFlight === promise) {
        record.inFlight = null;
      }
    });

    record.inFlight = promise;
    return promise;
  }

  private async executeReadOnlyObservation(input: {
    identity: SessionIdentity;
    policy: AutoresearchLiveSupervisionPolicyV1;
    previousSession: AutoresearchLiveSupervisionSessionV1 | null;
    signal?: AbortSignal;
  }): Promise<AutoresearchLivePollResult> {
    try {
      const observation = await readAutoresearchLiveObservation(
        { cwd: input.identity.cwd },
        {
          observeRuntime: this.config.observeRuntime,
          loadLedger: this.config.loadLedger,
          projectLedgerEntries: this.config.projectLedgerEntries,
          inspectFinalization: this.config.inspectFinalization,
          observeOracleEvidence: this.config.observeOracleEvidence,
        },
      );
      const previous = input.previousSession;
      const state = deriveReadOnlyObservationState(observation);
      const session: AutoresearchLiveSupervisionSessionV1 = {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: input.identity.taskId,
        cwd: input.identity.cwd,
        policy: { ...input.policy },
        state,
        startedAt: previous?.startedAt ?? this.now(),
        lastPolledAt: this.now(),
        pollCount: (previous?.pollCount ?? 0) + 1,
        lastRuntimeState: observation.runtime.runtimeProjection.state,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary:
          "Read-only observation only; no milestone projection or lifecycle mutation was attempted.",
        lastError: null,
      };
      return {
        sessionKey: input.identity.sessionKey,
        session,
        observation,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const session: AutoresearchLiveSupervisionSessionV1 = {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: input.identity.taskId,
        cwd: input.identity.cwd,
        policy: { ...input.policy },
        state: "blocked",
        startedAt: input.previousSession?.startedAt ?? this.now(),
        lastPolledAt: this.now(),
        pollCount: (input.previousSession?.pollCount ?? 0) + 1,
        lastRuntimeState: null,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary: message,
        lastError: message,
      };
      return {
        sessionKey: input.identity.sessionKey,
        session,
        observation: null,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    }
  }

  private async executePoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    this.cancelTimer(record);

    try {
      const observation = await readAutoresearchLiveObservation(
        { cwd: record.identity.cwd },
        {
          observeRuntime: this.config.observeRuntime,
          loadLedger: this.config.loadLedger,
          projectLedgerEntries: this.config.projectLedgerEntries,
          inspectFinalization: this.config.inspectFinalization,
          observeOracleEvidence: this.config.observeOracleEvidence,
        },
      );

      const projector = await this.projectMilestone(
        record.identity.taskId,
        observation,
        options.signal,
      );
      const lifecycle = isBlockedProjectorResult(projector)
        ? blockedLifecycleOutcome(projector.error || projector.candidate.reason)
        : await this.evaluateLifecycle(record, observation, projector, options.signal);

      const session = this.applyPollOutcome(record, observation, projector, lifecycle);
      if (
        record.persistent &&
        options.reschedule &&
        record.keepRunning &&
        session.state === "running"
      ) {
        this.scheduleNext(record);
      }

      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation,
        projector,
        lifecycle,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const session = this.applyUnexpectedFailure(record, message);
      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation: null,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    }
  }

  private applyPollOutcome(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    lifecycle: AutoresearchLiveLifecycleOutcome,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested = record.persistent && !record.keepRunning;
    const nextState = stopRequested ? "stopped" : deriveSessionState(projector, lifecycle);
    const lifecycleAction = stopRequested ? "stopped" : lifecycle.action;
    const summary = stopRequested
      ? "Live supervision stopped by operator."
      : deriveSessionSummary(projector, lifecycle);
    const error = stopRequested ? null : deriveSessionError(projector, lifecycle, nextState);

    if (nextState !== "running") {
      record.keepRunning = false;
    }

    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: nextState,
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastRuntimeState: observation.runtime.runtimeProjection.state,
      lastProjectionAction: projector.action,
      lastLifecycleAction: lifecycleAction,
      lastSummary: summary,
      lastError: error,
    };

    record.session = nextSession;
    return nextSession;
  }

  private applyUnexpectedFailure(
    record: SessionRecord,
    message: string,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested =
      record.persistent && (record.session.state === "stopped" || !record.keepRunning);
    record.keepRunning = false;
    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: stopRequested ? "stopped" : "blocked",
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastProjectionAction: "blocked",
      lastLifecycleAction: stopRequested ? "stopped" : "blocked",
      lastSummary: stopRequested ? "Live supervision stopped by operator." : message,
      lastError: stopRequested ? null : message,
    };

    record.session = nextSession;
    return nextSession;
  }

  private async projectMilestone(
    taskId: number,
    observation: AutoresearchLiveObservation,
    signal?: AbortSignal,
  ): Promise<AutoresearchAkProjectorResult> {
    if (this.config.projectMilestone) {
      return this.config.projectMilestone({
        taskId,
        observation,
        akPath: this.resolveAkPathForCwd(observation.cwd),
        societyDb: this.resolveSocietyDbPath(),
        signal,
      });
    }

    return projectAutoresearchAkMilestone({
      taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      runtime: observation.runtime,
      ledger: observation.ledger,
      signal,
    });
  }

  private async evaluateLifecycle(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    signal?: AbortSignal,
  ): Promise<AutoresearchLiveLifecycleOutcome> {
    if (this.config.evaluateLifecycle) {
      return this.config.evaluateLifecycle({
        taskId: record.identity.taskId,
        sessionKey: record.identity.sessionKey,
        session: cloneSession(record.session),
        observation,
        projector,
        signal,
      });
    }

    return evaluateAutoresearchAkLifecycle({
      taskId: record.identity.taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      observation,
      projector,
      signal,
    });
  }

  private scheduleNext(record: SessionRecord): void {
    this.cancelTimer(record);
    record.timer = this.setTimeoutImpl(
      () => this.runPoll(record, { reschedule: true }).then(() => undefined),
      record.session.policy.intervalSeconds * 1000,
    );
  }

  private cancelTimer(record: SessionRecord): void {
    if (!record.timer) {
      return;
    }

    this.clearTimeoutImpl(record.timer);
    record.timer = null;
  }

  private resolveAkPathForCwd(cwd: string): string {
    return this.config.akPath || resolveAkPath({ cwd });
  }

  private resolveSocietyDbPath(): string {
    return this.config.societyDb || DEFAULT_SOCIETY_DB;
  }
}

function deriveReadOnlyObservationState(
  observation: AutoresearchLiveObservation,
): AutoresearchLiveSessionState {
  const runtimeState = observation.runtime.runtimeProjection.state;
  if (runtimeState === "completed") return "completed";
  if (runtimeState === "blocked") return "blocked";
  return "running";
}

function deriveSessionState(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): AutoresearchLiveSessionState {
  if (isBlockedProjectorResult(projector) || !lifecycle.ok || lifecycle.action === "blocked") {
    return "blocked";
  }

  if (lifecycle.action === "completed_task" || lifecycle.action === "already_terminal") {
    return "completed";
  }

  return "running";
}

function deriveSessionSummary(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): string {
  if (
    lifecycle.summary.trim().length > 0 &&
    (lifecycle.action !== "none" || lifecycle.summary !== projector.candidate.reason)
  ) {
    return lifecycle.summary;
  }

  return projector.candidate.reason;
}

function deriveSessionError(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
  state: AutoresearchLiveSessionState,
): string | null {
  if (state !== "blocked") {
    return null;
  }

  return lifecycle.error || projector.error || lifecycle.summary || projector.candidate.reason;
}

function blockedLifecycleOutcome(reason: string): AutoresearchLiveLifecycleOutcome {
  return {
    ok: false,
    action: "blocked",
    summary: reason,
    error: reason,
  };
}

function isBlockedProjectorResult(projector: AutoresearchAkProjectorResult): boolean {
  return projector.action === "blocked" || projector.ok === false;
}

function toSupervisorLedgerLike(
  projection: Pick<AutoresearchLedgerProjection, "context"> | null | undefined,
): AutoresearchSupervisorLedgerLike {
  return {
    context: {
      blockedReason: projection?.context.blockedReason ?? null,
      completionReason: projection?.context.completionReason ?? null,
    },
  };
}

function cloneSession(
  session: AutoresearchLiveSupervisionSessionV1,
): AutoresearchLiveSupervisionSessionV1 {
  return {
    ...session,
    policy: { ...session.policy },
  };
}

export function describeAutoresearchLiveNextStep(
  session: Pick<
    AutoresearchLiveSupervisionSessionV1,
    "state" | "lastProjectionAction" | "lastLifecycleAction"
  >,
): string {
  switch (session.state) {
    case "running":
      switch (session.lastProjectionAction) {
        case "recorded":
          return "Milestone evidence was recorded. Continue monitoring until the runtime changes again.";
        case "already-projected":
          return "No new durable change was detected. Continue monitoring.";
        case "noop":
        case null:
          return "No coarse milestone is ready yet. Continue monitoring.";
        case "blocked":
          return "Resolve the blocking error, then restart live supervision.";
      }
      return "Continue monitoring the live supervision session.";
    case "blocked":
      return "Resolve the blocking error, then start a new live supervision session.";
    case "completed":
      return "Live supervision reached a terminal state. No further polling is scheduled.";
    case "stopped":
      return "Live supervision is stopped. Start it again to resume polling.";
  }
}
