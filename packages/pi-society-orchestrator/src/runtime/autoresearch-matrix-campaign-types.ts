// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch matrix-campaign type contracts."
// ---

import type { AutoresearchCampaignPeerRunnerHandoffContract } from "./autoresearch-candidate-wave-types.ts";
import type { AutoresearchLiveSupervisionRequest } from "./autoresearch-live-core-types.ts";
import type { AutoresearchMatrixCampaignOperatorFollowup } from "./autoresearch-matrix-runner-types.ts";

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
