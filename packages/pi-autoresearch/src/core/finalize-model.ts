import type {
  AutoresearchDecisionRuntime,
  FinalizeDecisionPacket,
  FinalizeDecisionResult,
} from "./decisions.ts";
import type {
  AutoresearchConfigReceipt,
  AutoresearchRunReceipt,
  AutoresearchRuntimeStatus,
} from "./runtime.ts";

export const AUTORESEARCH_FINALIZATION_PLAN_FILE = "autoresearch.finalization.json" as const;

export type AutoresearchFinalizationApprovalState =
  | "pending"
  | "approved"
  | "materialized"
  | "superseded";
export type AutoresearchFinalizationMaterializationStatus = "not_started" | "succeeded" | "failed";
export type AutoresearchFinalizationPlanReuse =
  | "unavailable"
  | "missing"
  | "reused"
  | "parse_failed"
  | "cwd_mismatch"
  | "source_branch_mismatch"
  | "trunk_mismatch"
  | "base_mismatch"
  | "final_tree_mismatch"
  | "runtime_mismatch";

export interface AutoresearchFinalizationGroupDraftV1 {
  title: string;
  body: string;
  last_commit: string;
  slug: string;
}

export interface AutoresearchFinalizationGroupsJsonDraftV1 {
  base: string;
  trunk: string;
  final_tree: string;
  goal: string;
  groups: AutoresearchFinalizationGroupDraftV1[];
}

export interface AutoresearchFinalizationGroupV1 {
  index: number;
  title: string;
  slug: string;
  branchName: string;
  lastCommit: string;
  commits: string[];
  files: string[];
  metricEffect: string;
  dependencyNotes: string[];
  body: string;
}

export interface AutoresearchFinalizationPlanV1 {
  type: "finalization_plan";
  version: 1;
  phase: "bounded_runtime_kernel";
  cwd: string;
  sourceBranch: string;
  trunkRef: string;
  baseRef: string;
  finalTree: string;
  goalSlug: string;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: "ledger" | "receipt_fallback";
  createdAt: number;
  decision: {
    templateName: "pi-autoresearch-finalize";
    overallResult: string;
    groupingRationale: string[];
    riskNotes: string[];
    cleanupHints: string[];
  };
  groups: AutoresearchFinalizationGroupV1[];
  groupsJsonDraft: AutoresearchFinalizationGroupsJsonDraftV1;
  approval: {
    required: true;
    state: AutoresearchFinalizationApprovalState;
    reason: string | null;
    approvedAt: number | null;
  };
  materialization: {
    status: AutoresearchFinalizationMaterializationStatus;
    createdBranches: string[];
    verifiedAt: number | null;
    failureReason: string | null;
  };
}

export interface AutoresearchFinalizationPlanStatus {
  path?: string;
  exists: boolean;
  reuse: AutoresearchFinalizationPlanReuse;
  discardedReason: string | null;
  sourceBranch: string | null;
  trunkRef: string | null;
  baseRef: string | null;
  finalTree: string | null;
  runtimeKey: string | null;
}

export interface AutoresearchFinalizationGitContext {
  sourceBranch: string;
  trunkRef: string;
  baseRef: string;
  finalTree: string;
}

export interface AutoresearchKeptRunContext {
  receipt: AutoresearchRunReceipt;
  fullCommit: string;
  summary: string;
}

export interface AutoresearchFinalizationContext {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  git: AutoresearchFinalizationGitContext;
  goalSlug: string;
  config: AutoresearchConfigReceipt;
  keptRuns: AutoresearchKeptRunContext[];
  packet: FinalizeDecisionPacket;
}

export interface CreateAutoresearchFinalizationContextInput {
  cwd: string;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
}

export interface PlanAutoresearchFinalizationFromDecisionInput {
  cwd: string;
  decision: FinalizeDecisionResult;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  createdAt?: number;
}

export interface PlanAutoresearchFinalizationFromDecisionResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  context: AutoresearchFinalizationContext;
  plan: AutoresearchFinalizationPlanV1;
  planPath: string;
}

export interface RequestAutoresearchFinalizationPlanInput {
  cwd: string;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  createdAt?: number;
}

export interface RequestAutoresearchFinalizationPlanResult {
  cwd: string;
  packet: FinalizeDecisionPacket;
  decision: FinalizeDecisionResult;
  status: AutoresearchRuntimeStatus;
  plan: AutoresearchFinalizationPlanV1;
  planPath: string;
}

export interface LoadAutoresearchFinalizationPlanStateInput {
  cwd: string;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
}

export interface LoadAutoresearchFinalizationPlanStateResult {
  plan: AutoresearchFinalizationPlanV1 | null;
  planStatus: AutoresearchFinalizationPlanStatus;
  status: AutoresearchRuntimeStatus;
  git: AutoresearchFinalizationGitContext | null;
}

export type AutoresearchFinalizationAction = "status" | "plan" | "approve" | "materialize";
export type AutoresearchFinalizationDisposition =
  | "status"
  | "reused"
  | "planned"
  | "approved"
  | "materialized";

export interface AutoresearchFinalizationVerificationResult {
  ok: boolean;
  unionMatchesFinalTree: boolean;
  missingFinalTreeFiles: string[];
  unexpectedFinalTreeFiles: string[];
  blobMismatches: string[];
  branchFileMismatches: string[];
  nonIndependentBranches: string[];
  sessionArtifactLeaks: string[];
  emptyBranches: string[];
}

export interface InspectAutoresearchFinalizationResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  plan: AutoresearchFinalizationPlanV1 | null;
  planStatus: AutoresearchFinalizationPlanStatus;
  git: AutoresearchFinalizationGitContext | null;
  planPath: string;
  nextStep: string;
}

export interface ApproveAutoresearchFinalizationPlanInput {
  cwd: string;
  reason?: string;
  approvedAt?: number;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
}

export interface ApproveAutoresearchFinalizationPlanResult
  extends InspectAutoresearchFinalizationResult {
  approvalState: AutoresearchFinalizationApprovalState;
}

export interface MaterializeAutoresearchFinalizationTestHooks {
  beforeCreateGroup?(group: AutoresearchFinalizationGroupV1): void;
  beforeVerify?(input: {
    cwd: string;
    plan: AutoresearchFinalizationPlanV1;
    createdBranches: string[];
    sourceBranch: string;
  }): void;
}

export interface MaterializeAutoresearchFinalizationPlanInput {
  cwd: string;
  reason?: string;
  materializedAt?: number;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  testHooks?: MaterializeAutoresearchFinalizationTestHooks;
}

export interface MaterializeAutoresearchFinalizationPlanResult
  extends InspectAutoresearchFinalizationResult {
  createdBranches: string[];
  verification: AutoresearchFinalizationVerificationResult;
}

export interface ExecuteAutoresearchFinalizationInput {
  cwd: string;
  action?: AutoresearchFinalizationAction;
  reason?: string;
  runtime?: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  createdAt?: number;
  approvedAt?: number;
  materializedAt?: number;
  testHooks?: MaterializeAutoresearchFinalizationTestHooks;
}

export interface ExecuteAutoresearchFinalizationResult
  extends InspectAutoresearchFinalizationResult {
  action: AutoresearchFinalizationAction;
  disposition: AutoresearchFinalizationDisposition;
  createdBranches: string[];
  verification: AutoresearchFinalizationVerificationResult | null;
}
