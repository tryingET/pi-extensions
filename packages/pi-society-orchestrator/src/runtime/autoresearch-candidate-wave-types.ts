// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch candidate-wave type contracts."
// ---
import type { AutoresearchLiveSupervisionRequest } from "./autoresearch-live-core-types.ts";
import type { AutoresearchCandidateWaveReviewPacket } from "./autoresearch-matrix-review-types.ts";

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
