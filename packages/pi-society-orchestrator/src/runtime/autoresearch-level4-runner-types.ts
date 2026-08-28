// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch level4-runner type contracts."
// ---

import type { AutoresearchLevel3IntegrationCloseoutEvidence } from "./autoresearch-finalizer-cleanup-types.ts";
import type {
  AutoresearchLevel3MatrixCellExecutor,
  AutoresearchLevel3MatrixCellExecutorRequest,
} from "./autoresearch-level3-planning-types.ts";
import type { AutoresearchMatrixCampaignOperatorLaneState } from "./autoresearch-matrix-runner-types.ts";

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
