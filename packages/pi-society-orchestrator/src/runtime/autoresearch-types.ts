// ---
// summary: "Shared type contracts for autoresearch live supervision, candidate waves, matrix campaigns, and Level-3/Level-4 flows."
// read_when:
//   - "Changing autoresearch packet, campaign, wave, or supervision type contracts."
// ---

import * as os from "node:os";
import * as path from "node:path";
import type {
  AutoresearchAutoplanPlanner,
  AutoresearchLedgerLoadResult,
  AutoresearchLedgerProjection,
  AutoresearchOracleEvidencePacket,
  AutoresearchRuntimeStatus,
  ExecuteAutoresearchCampaignStartResult,
  executeAutoresearchCampaignStart,
  InspectAutoresearchFinalizationResult,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchSupervisorLedgerLike } from "../loops/autoresearch-supervisor.ts";
import type { AutoresearchAkProjectorResult } from "./autoresearch-ak-projector.ts";

const _DEFAULT_SOCIETY_DB =
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
  /** Historical compatibility fields. Registry-v1 cleanup is permanently non-executable. */
  candidatePeerCleanupDryRunCall: null;
  candidatePeerCleanupExecuteCall: null;
  exactControllerCommands: readonly [];
  candidateLifecycleStatusCall: string | null;
  candidateLifecyclePlanCall: string | null;
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
  peerRunIds?: readonly string[];
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
  kind: "autoresearch.level3_candidate_lifecycle_closeout_handoff.v2";
  exactTaskId: number;
  exactCwd: string;
  manifestHash: string;
  gateReference: string;
  authorizationRequired: false;
  cleanupExecution: "not_executed_by_orchestrator";
  cleanupExecutionAuthorized: false;
  cleanupTrigger:
    | "candidate_cleanup_token"
    | "exact_manifest_policy"
    | "successful_integration_closeout";
  exactPeerRunIds: readonly string[];
  exactPeerTabsOrSessions: readonly string[];
  exactWorktrees: readonly string[];
  exactBranches: readonly string[];
  candidateLifecycleStatusCall: string;
  candidateLifecyclePlanCall: string;
  exactCommands: readonly [];
  forbiddenPromotionCommandMatches: readonly [];
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
    cleanupExecutionAuthorized: false;
    posture:
      | "accepted_exact_token"
      | "accepted_exact_manifest_policy"
      | "lifecycle_plan_ready_successful_integration"
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
    requiredTrigger: "lifecycle_v2_disposition_proof_archive_and_cleanup_authorization";
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
    candidateCleanup: "lifecycle_v2_closeout_required";
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
