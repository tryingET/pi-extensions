import type { AutoresearchAutoContinuationDecision } from "./autoContinuation.ts";
import type { AutoresearchCampaignGoalStatusView } from "./goal.ts";
import type { AutoresearchControlStateV1, AutoresearchRuntimeSnapshotStatus } from "./resume.ts";
import type {
  AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_PHASE,
} from "./runtime-constants.ts";
import type {
  AutoresearchCandidateBinding,
  AutoresearchEmpiricalDecisionClass,
  AutoresearchEmpiricalPosture,
  AutoresearchLlamacppCampaignProjectionStatus,
  AutoresearchMetricInterpretation,
  AutoresearchPromptVaultDecisionStatus,
  AutoresearchRunKind,
  AutoresearchRuntimeProjection,
  AutoresearchSegmentCloseoutRun,
  AutoresearchSegmentSummary,
  MetricDirection,
  RunStatus,
} from "./runtime-model-basic.ts";
import type {
  AutoresearchLoopProgressEvent,
  ExecuteAutoresearchLoopResult,
} from "./runtime-model-loop.ts";

export interface AutoresearchAkEvidencePacket {
  packetKind: "autoresearch.ak_evidence.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  taskId: number;
  checkType: "autoresearch:segment_closeout";
  result: string;
  closeout: AutoresearchSegmentCloseout;
  suggestedToolCall: string;
  adapterBoundary: string;
  evidenceBoundary: string;
}

export interface AutoresearchOracleEvidenceRecord {
  recordKind: "autoresearch.campaign_run.oracle_evidence.v1";
  recordId: string;
  campaign: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  runStatus: RunStatus;
  runKind: AutoresearchRunKind;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  metric: number;
  timestamp: number;
  description: string;
  checks: string;
  hypothesisId: string | null;
  hypothesis: string | null;
  interventionSummary: string | null;
  candidate: AutoresearchCandidateBinding | null;
  oracleText: string;
  sourceRefs: {
    receiptPath: string;
    closeoutPacketKind: "autoresearch.closeout.v1";
    runIteration: number | null;
    runTimestamp: number;
  };
  nonAuthority: true;
}

export interface AutoresearchOraclePublicationPreflightSummary {
  status: "ready_for_dspx_owner_review" | "blocked_no_campaign_evidence";
  target: "dspx_oracle_postgres_pgvector";
  publicationLabel: "retained_behavior_memory_candidate";
  sharedOracleMutated: false;
  localCoordinatesDbMigrated: false;
  canonicalAuthorityMutated: false;
  blockedReasons: string[];
  suggestedDspxOwnerAction: string;
  suggestedDspxPreflightCommandTemplate: string;
}

export interface AutoresearchOracleEvidenceReadiness {
  packetKind: "autoresearch.oracle_evidence.v1";
  recordCount: number;
  preflightStatus: AutoresearchOraclePublicationPreflightSummary["status"];
  target: AutoresearchOraclePublicationPreflightSummary["target"];
  authorityBoundary: string;
}

export interface AutoresearchOracleEvidencePacket {
  packetKind: "autoresearch.oracle_evidence.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  cwd: string;
  campaign: string | null;
  sourceArtifacts: {
    closeoutPacketKind: "autoresearch.closeout.v1";
    receiptPath: string;
  };
  records: AutoresearchOracleEvidenceRecord[];
  publicationPreflight: AutoresearchOraclePublicationPreflightSummary;
  adapterBoundary: string;
  evidenceBoundary: string;
  authorityBoundary: string;
}

export interface AutoresearchOracleEvidenceExportResult {
  exportKind: "autoresearch.oracle_evidence_export.v1";
  path: string;
  packet: AutoresearchOracleEvidencePacket;
  suggestedDspxPreflightCommand: string;
  suggestedDspxPreflightArgv: string[];
  effect: {
    localFileWritten: true;
    sharedOracleMutated: false;
    localCoordinatesDbMigrated: false;
    canonicalAuthorityMutated: false;
    akCalled: false;
    kesWritten: false;
  };
  authorityBoundary: string;
}

export interface AutoresearchKnowledgeExportPacket {
  packetKind: "autoresearch.learning.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  suggestedPath: string;
  title: string;
  markdown: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}

export interface AutoresearchLearningExportResult {
  exportKind: "autoresearch.learning_export.v1";
  path: string;
  packet: AutoresearchKnowledgeExportPacket;
  suggestedKesAdapterCall: string;
  effect: {
    localFileWritten: true;
    akCalled: false;
    kesWritten: false;
    externalAuthorityMutated: false;
    promotionStateChanged: false;
  };
  authorityBoundary: string;
}

export interface AutoresearchCandidateResultPacket {
  packetKind: "autoresearch.candidate_result.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  cwd: string;
  campaign: string | null;
  candidate: AutoresearchCandidateBinding | null;
  candidateRun: AutoresearchSegmentCloseoutRun | null;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  recommendedAction: string;
  resultSummary: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}

export interface AutoresearchCandidateResultExportResult {
  exportKind: "autoresearch.candidate_result_export.v1";
  path: string;
  packet: AutoresearchCandidateResultPacket;
  suggestedReviewCall: string;
  suggestedAggregateReviewCall: string | null;
  effect: {
    localFileWritten: true;
    candidateLifecycleMutated: false;
    worktreeMutated: false;
    akCalled: false;
    kesWritten: false;
    promotionStateChanged: false;
  };
  authorityBoundary: string;
}

export interface AutoresearchSegmentCloseout {
  packetKind: "autoresearch.closeout.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  cwd: string;
  receiptPath: string;
  status: AutoresearchRuntimeStatus;
  campaign: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
  timingInterpretation: AutoresearchMetricInterpretation | null;
  empiricalPosture: AutoresearchEmpiricalPosture;
  runs: AutoresearchSegmentCloseoutRun[];
  candidateBindings: AutoresearchCandidateBinding[];
  recommendedAction: string;
  oracleReadyEvidence: AutoresearchOracleEvidenceReadiness;
  adapterBoundary: string;
  evidenceBoundary: string;
}

export interface AutoresearchDashboardExportResult {
  cwd: string;
  path: string;
  fileUrl: string;
  refreshedAt: number;
  status: AutoresearchRuntimeStatus;
}

export interface AutoresearchCandidateInventoryCleanupPlan {
  kind: "autoresearch.candidate_inventory_cleanup_plan.v1";
  cwd: string;
  mode: "plan" | "applied";
  archiveDir: string;
  confirmationRequired: typeof AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION;
  before: {
    runCount: number;
    successfulRunCount: number;
    candidateRunCount: number;
    checksFailedOrCrashCount: number;
    openCandidateReviewCellCount: number;
    candidatePacketInventoryCount: number;
  };
  archivedPaths: string[];
  skippedMissingPaths: string[];
  rootCause: string;
  multiOrderEffect: string;
  boundary: string;
  after?: {
    runCount: number;
    successfulRunCount: number;
    candidateRunCount: number;
    openCandidateReviewCellCount: number;
    candidatePacketInventoryCount: number;
  };
}

export interface AutoresearchResumePlan {
  packetKind: "autoresearch.resume_plan.v1";
  cwd: string;
  campaign: string | null;
  segmentKey: string | null;
  runtimeKey: string | null;
  snapshotReuse: string;
  reusable: boolean;
  machineState: string;
  controlState: string;
  allowedControlActions: string[];
  lastStopReason: string;
  remainingBudget: "operator_required";
  wouldRun: string | null;
  blockingReasons: string[];
  authorityWarnings: string[];
}

export interface AutoresearchResumeApplyPlan {
  packetKind: "autoresearch.resume_apply_plan.v1";
  cwd: string;
  action: "plan_only";
  planReady: boolean;
  executionAuthorized: false;
  executorAvailable: boolean;
  resumePlan: AutoresearchResumePlan;
  requiredOperatorInputs: string[];
  preflightChecks: string[];
  futureExecutorContract: string;
  futureForegroundCall: string | null;
  blockedReasons: string[];
  authorityWarnings: string[];
}

export interface ExecuteAutoresearchResumeApplyInput {
  cwd: string;
  segmentKey: string;
  runtimeKey: string;
  maxIterations: number;
  maxWallClockMinutes: number;
  operatorConfirmation: string;
  description?: string;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchResumeApplyResult {
  cwd: string;
  action: "resume_apply";
  executionAuthorized: true;
  applyPlan: AutoresearchResumeApplyPlan;
  loopResult: ExecuteAutoresearchLoopResult;
  authorityWarnings: string[];
}

export interface AutoresearchRuntimeStatus {
  phase: typeof AUTORESEARCH_PHASE;
  cwd?: string;
  commandName: typeof AUTORESEARCH_COMMAND_NAME;
  toolNames: readonly string[];
  localArtifacts: readonly string[];
  receiptEntryTypes: readonly ["config", "run"];
  readyPromptVaultTemplates: readonly string[];
  blockedPromptVaultTemplates: readonly string[];
  receiptPath?: string;
  hasReceiptLog: boolean;
  hasBenchmarkScript: boolean;
  hasChecksScript: boolean;
  invalidReceiptLines: number;
  currentSegment: AutoresearchSegmentSummary;
  empiricalPosture: AutoresearchEmpiricalPosture;
  runtimeProjection: AutoresearchRuntimeProjection;
  runtimeSnapshot: AutoresearchRuntimeSnapshotStatus;
  control: AutoresearchControlStateV1;
  campaignGoal: AutoresearchCampaignGoalStatusView;
  autoContinuation: AutoresearchAutoContinuationDecision;
  promptVaultDecisions: AutoresearchPromptVaultDecisionStatus;
  llamacppCampaignProjection: AutoresearchLlamacppCampaignProjectionStatus;
  nextSlices: readonly string[];
}
