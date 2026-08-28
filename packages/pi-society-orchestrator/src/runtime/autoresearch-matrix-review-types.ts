// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch matrix-review type contracts."
// ---

import type { AutoresearchLevel2CandidateBinding } from "./autoresearch-candidate-wave-types.ts";
import type {
  AutoresearchCandidateReviewPacketChainMetric,
  AutoresearchCandidateReviewPacketChainRef,
} from "./autoresearch-finalizer-cleanup-types.ts";
import type { AutoresearchMatrixCampaignOwnerReviewRoute } from "./autoresearch-matrix-campaign-types.ts";
import type {
  AutoresearchMatrixCampaignCellReview,
  AutoresearchMatrixCampaignCloseout,
  AutoresearchMatrixCampaignOperatorFollowup,
  AutoresearchMatrixCampaignOperatorLaneState,
} from "./autoresearch-matrix-runner-types.ts";

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
