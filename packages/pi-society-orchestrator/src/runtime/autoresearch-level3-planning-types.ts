// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch level3-planning type contracts."
// ---
import type { AutoresearchLiveSupervisionRequest } from "./autoresearch-live-core-types.ts";
import type {
  AutoresearchMatrixCampaignRunnerCheckpoint,
  AutoresearchMatrixCampaignRunnerRequest,
} from "./autoresearch-matrix-runner-types.ts";

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
