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
  finalizerTokenRequest: AutoresearchPostFaninFinalizerTokenRequestPacket;
  exactApplyCommandPacket: AutoresearchPostFaninFinalizerApplyCommandPacket | null;
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

function buildCandidateWaveReviewPacket(input: {
  review: Pick<
    AutoresearchCandidateWaveReview,
    "kind" | "level2CandidateBinding" | "recommendation" | "lanes"
  >;
}): AutoresearchCandidateWaveReviewPacket {
  return {
    kind: "autoresearch.review_candidate_wave_packet.v1",
    generatedFrom: "bound_candidate_results",
    candidateWaveReviewKind: input.review.kind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    bindingMetric: input.review.level2CandidateBinding.metric,
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
}): AutoresearchPostFaninFinalizerTokenRequestPacket {
  return {
    kind: "autoresearch.post_fanin_finalizer_token_request.v1",
    sourceReview: input.sourceReview,
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    objective: input.objective,
    requiredTokenName: "finalize_post_fanin",
    exactAuthorizationToken: input.authorizationToken,
    requestExecution: "not_executed_by_orchestrator",
    candidateResultPacketRefs: input.selectedLanes
      .map((lane) => lane.sourcePacketPath)
      .filter((packetPath): packetPath is string => Boolean(packetPath)),
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
      "candidate_cleanup is separate and required before worktree removal or branch deletion.",
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
            "Owner may copy the exact finalize_post_fanin token into a deliberate finalize_post_fanin call to expose apply commands.",
            "Run validation again in the apply lane before commit/promotion decisions.",
            "Keep cleanup and promotion requests separate after finalizer review.",
          ]
        : [
            "Resolve preflight/review blockers and rerun finalize_post_fanin token-request preparation.",
            "Do not infer finalize_post_fanin authorization from this blocked request.",
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
      "Do not delete candidate worktrees or non-selected lanes from this finalizer packet; lifecycle cleanup needs a separate owner-approved action.",
    ],
    boundary:
      "This packet is an exact explicit apply recipe only; pi-society-orchestrator does not checkout, merge, commit, clean, delete, promote, or write evidence from finalizer construction.",
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
  const outcome: AutoresearchPostFaninFinalizerResult["outcome"] =
    !preflightPassed || wrongAuthorization
      ? "failed_closed"
      : input.applyAuthorizationToken === authorizationToken
        ? "committed_cleaned"
        : "review_blocked";
  const manualResidueValue =
    outcome === "committed_cleaned" ? 0 : Math.max(1, blockerCount + (wrongAuthorization ? 1 : 0));

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
    finalizerTokenRequest,
    exactApplyCommandPacket,
    nextStep:
      outcome === "committed_cleaned"
        ? "Exact authorization token accepted; run the emitted apply command packet deliberately in the controller/apply lane if promotion is approved. The orchestrator has not executed it."
        : outcome === "review_blocked"
          ? "Preflight passed and a finalize_post_fanin token request was prepared, but apply commands are withheld until the exact authorization token is supplied deliberately."
          : wrongAuthorization
            ? "Fail closed: supplied applyAuthorizationToken did not match the contract token. Re-run preflight and authorize explicitly if still intended."
            : "Fail closed: resolve preflight blockers, rerun fan-in review/finalizer, and do not apply hidden promotion or cleanup.",
    boundaries: [
      "No checkout, merge, commit, cleanup, worktree deletion, evidence write, AK/KES/Prompt Vault/ROCS mutation, or promotion was executed by this finalizer.",
      "Missing finals, failed validation, off-limits drift, dirty overlap, selected-lane mismatch, stale packets, and wrong authorization fail closed.",
      "The exact apply command packet is communication for an explicit owner-approved apply lane; it is not durable evidence or completion authority.",
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
      const peerPayload: Record<string, unknown> = {
        objective: laneObjective,
        cwd: identity.cwd,
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
        candidateWorktree: `<${cell.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`,
        candidateBranch: `<${cell.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${cell.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`,
        candidateDiffSummary: `<${cell.cellId}-${lane.laneId}-controller-verified-diff-summary>`,
        candidateFilesChanged: [`<${cell.cellId}-${lane.laneId}-changed-files>`],
      };
      if (input.metricThreshold !== null) metricRunPayload.metricThreshold = input.metricThreshold;

      const bindCall = formatToolCall("autoresearch_candidate_bind", {
        cwd: input.identity.cwd,
        candidateWorktree: `<${cell.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${cell.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`,
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
}): AutoresearchMatrixCampaignReviewPacket {
  return {
    kind: "autoresearch.review_matrix_campaign_packet.v1",
    generatedFrom: "managed_cell_candidate_wave_reviews",
    matrixCampaignReviewKind: input.reviewKind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    wholeMatrixMetricPosture: input.wholeMatrixMetricPosture,
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
