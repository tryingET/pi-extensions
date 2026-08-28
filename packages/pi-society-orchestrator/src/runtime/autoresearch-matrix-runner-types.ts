// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch matrix-runner type contracts."
// ---

import type { AutoresearchCandidateWaveReview } from "./autoresearch-candidate-wave-types.ts";
import type { AutoresearchLevel3CandidateLifecycleBindingInput } from "./autoresearch-level3-planning-types.ts";
import type { AutoresearchMatrixCampaignRequest } from "./autoresearch-matrix-campaign-types.ts";
import type { AutoresearchMatrixCampaignCockpit } from "./autoresearch-matrix-review-types.ts";

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
