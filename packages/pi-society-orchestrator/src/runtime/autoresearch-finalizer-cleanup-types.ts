// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch finalizer-cleanup type contracts."
// ---

import type { AutoresearchLevel2CandidateBindingLane } from "./autoresearch-candidate-wave-types.ts";
import type {
  AutoresearchLevel3CampaignManifestPreflight,
  AutoresearchLevel3CampaignTransitionReceipt,
  AutoresearchLevel3ManifestPreflightRequest,
} from "./autoresearch-level3-planning-types.ts";
import type { AutoresearchLiveSupervisionRequest } from "./autoresearch-live-core-types.ts";

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
