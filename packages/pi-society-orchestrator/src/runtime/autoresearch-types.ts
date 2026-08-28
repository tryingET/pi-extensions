// ---
// summary: "Shared type contracts for autoresearch live supervision, candidate waves, matrix campaigns, and Level-3/Level-4 flows."
// read_when:
//   - "Changing autoresearch packet, campaign, wave, or supervision type contracts."
// ---

// This module is now the compatibility barrel for the domain catalogs:
//   ./autoresearch-live-core-types.ts
//   ./autoresearch-level3-planning-types.ts
//   ./autoresearch-level4-runner-types.ts
//   ./autoresearch-finalizer-cleanup-types.ts
//   ./autoresearch-candidate-wave-types.ts
//   ./autoresearch-matrix-campaign-types.ts
//   ./autoresearch-matrix-runner-types.ts
//   ./autoresearch-matrix-review-types.ts

export type {
  AutoresearchCampaignPeerRunnerHandoffContract,
  AutoresearchCandidateWaveLane,
  AutoresearchCandidateWaveManagement,
  AutoresearchCandidateWaveManagementLane,
  AutoresearchCandidateWaveManagementLaneState,
  AutoresearchCandidateWaveOwnerDecisionForm,
  AutoresearchCandidateWaveOwnerDecisionFormOption,
  AutoresearchCandidateWaveOwnerDecisionInterviewPayload,
  AutoresearchCandidateWaveOwnerDecisionOption,
  AutoresearchCandidateWaveOwnerDecisionPrimaryUi,
  AutoresearchCandidateWavePacketDiscovery,
  AutoresearchCandidateWavePlan,
  AutoresearchCandidateWaveReliabilityLaneRecovery,
  AutoresearchCandidateWaveReliabilityLaneRecoveryKind,
  AutoresearchCandidateWaveReliabilityRecovery,
  AutoresearchCandidateWaveReliabilityRecoveryPosture,
  AutoresearchCandidateWaveRequest,
  AutoresearchCandidateWaveResultInput,
  AutoresearchCandidateWaveReview,
  AutoresearchCandidateWaveReviewLane,
  AutoresearchCandidateWaveReviewRequest,
  AutoresearchLevel2CandidateBinding,
  AutoresearchLevel2CandidateBindingLane,
  AutoresearchOwnerReviewRoute,
} from "./autoresearch-candidate-wave-types.ts";
export type {
  AutoresearchAuthorizedFinalizerCleanupGate,
  AutoresearchCandidateReviewPacketChainMetric,
  AutoresearchCandidateReviewPacketChainRef,
  AutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
  AutoresearchLevel3CleanupCommandPacket,
  AutoresearchLevel3CleanupResourcesInput,
  AutoresearchLevel3IntegrationCloseoutEvidence,
  AutoresearchPostFaninFinalizerApplyCommandPacket,
  AutoresearchPostFaninFinalizerCloseoutReceipt,
  AutoresearchPostFaninFinalizerContract,
  AutoresearchPostFaninFinalizerPreflightCheck,
  AutoresearchPostFaninFinalizerRequest,
  AutoresearchPostFaninFinalizerResult,
  AutoresearchPostFaninFinalizerTokenRequestPacket,
  AutoresearchPostFaninValidationEvidence,
} from "./autoresearch-finalizer-cleanup-types.ts";

export type {
  AutoresearchLevel3CampaignManifestPreflight,
  AutoresearchLevel3CampaignTransitionReceipt,
  AutoresearchLevel3CandidateLifecycleBindingInput,
  AutoresearchLevel3CandidateLifecycleLane,
  AutoresearchLevel3ManifestPreflightRequest,
  AutoresearchLevel3MatrixCellExecutor,
  AutoresearchLevel3MatrixCellExecutorPosture,
  AutoresearchLevel3MatrixCellExecutorRequest,
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  AutoresearchLevel3MatrixCellRunner,
  AutoresearchLevel3MatrixCellRunnerCell,
  AutoresearchLevel3MatrixCellRunnerCellState,
  AutoresearchLevel3MeasureExportReviewLane,
  AutoresearchLevel3MeasureExportReviewPlan,
  AutoresearchLevel3MeasureExportReviewRequest,
  AutoresearchLevel3PolicyGatePreflight,
  AutoresearchLevel3PolicyPosture,
  AutoresearchLevel3SliceSequenceCellState,
  AutoresearchLevel3SliceSequenceDryRun,
  AutoresearchLevel3SliceSequenceDryRunRequest,
  AutoresearchLevel3SliceSequenceState,
  AutoresearchLevel3VisibleCandidateLifecyclePlan,
  AutoresearchLevel3VisibleCandidateLifecycleRequest,
} from "./autoresearch-level3-planning-types.ts";

export type {
  AutoresearchLevel4CampaignRunner,
  AutoresearchLevel4CampaignRunnerReceipt,
  AutoresearchLevel4CampaignRunnerRequest,
  AutoresearchLevel4CandidateCloseoutLane,
  AutoresearchLevel4CandidateCloseoutPacket,
  AutoresearchLevel4CandidatePacketInventoryStatus,
  AutoresearchLevel4PostFaninPromotionHandoffPacket,
  AutoresearchLevel4PostIntegrationCleanupReadyPacket,
  AutoresearchLevel4PostIntegrationCleanupRegistrySidecar,
  AutoresearchLevel4PromptRunnerBundle,
  AutoresearchLevel4PromptRunnerLane,
  AutoresearchLevel4VisibleLaunchWatchLanePlan,
  AutoresearchLevel4VisibleLaunchWatchPlan,
  AutoresearchLevel4WholeMatrixExecutor,
  AutoresearchLevel4WholeMatrixExecutorBatch,
} from "./autoresearch-level4-runner-types.ts";
export type {
  AutoresearchLiveLifecycleAction,
  AutoresearchLiveLifecycleInput,
  AutoresearchLiveLifecycleOutcome,
  AutoresearchLiveObservation,
  AutoresearchLivePollResult,
  AutoresearchLiveProjectionAction,
  AutoresearchLiveSessionState,
  AutoresearchLiveStartCampaignRequest,
  AutoresearchLiveStartCampaignResult,
  AutoresearchLiveStartResult,
  AutoresearchLiveStopResult,
  AutoresearchLiveSupervisionPolicyV1,
  AutoresearchLiveSupervisionRequest,
  AutoresearchLiveSupervisionRunnerConfig,
  AutoresearchLiveSupervisionSessionV1,
} from "./autoresearch-live-core-types.ts";
export {
  AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR,
  AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_TYPE,
  AUTORESEARCH_LIVE_SUPERVISION_VERSION,
  buildAutoresearchCampaignPeerRunnerHandoffContract,
} from "./autoresearch-live-core-types.ts";

export type {
  AutoresearchLevel2PacketDescriptor,
  AutoresearchLevel2PacketPlanning,
  AutoresearchLevel2PacketPlanningAntiNarrowing,
  AutoresearchLevel2PacketPlanningAntiNarrowingPosture,
  AutoresearchLevel2PacketPlanningBlockerMetric,
  AutoresearchLevel2PacketTokenName,
  AutoresearchLevel2PacketTokenVocabularyEntry,
  AutoresearchMatrixCampaignCell,
  AutoresearchMatrixCampaignOwnerReviewRoute,
  AutoresearchMatrixCampaignPlan,
  AutoresearchMatrixCampaignRequest,
  AutoresearchMatrixManagedWaveSubstrate,
} from "./autoresearch-matrix-campaign-types.ts";
export type {
  AutoresearchCandidateWaveReviewPacket,
  AutoresearchLevel2OperatorUxDashboard,
  AutoresearchLevel2OperatorUxMetric,
  AutoresearchLevel3ReviewSelectionCell,
  AutoresearchLevel3ReviewSelectionSubstrate,
  AutoresearchLevel3ReviewSelectionWinnerState,
  AutoresearchMatrixCampaignCockpit,
  AutoresearchMatrixCampaignReview,
  AutoresearchMatrixCampaignReviewPacket,
  AutoresearchReviewDispositionOption,
  AutoresearchReviewPacketAuthorityBoundary,
  AutoresearchReviewPacketDispositionOption,
  AutoresearchWholeMatrixMetricPosture,
} from "./autoresearch-matrix-review-types.ts";
export type {
  AutoresearchLevel2PacketPlanningBlockers,
  AutoresearchMatrixCampaignCellReview,
  AutoresearchMatrixCampaignCloseout,
  AutoresearchMatrixCampaignControllerCommandPacket,
  AutoresearchMatrixCampaignOperatorFollowup,
  AutoresearchMatrixCampaignOperatorLaneState,
  AutoresearchMatrixCampaignRunnerCheckpoint,
  AutoresearchMatrixCampaignRunnerContract,
  AutoresearchMatrixCampaignRunnerLane,
  AutoresearchMatrixCampaignRunnerRequest,
} from "./autoresearch-matrix-runner-types.ts";
