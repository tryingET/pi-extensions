import type {
  AutoresearchCandidateBindingSource,
  AutoresearchEmpiricalDecisionClass,
  AutoresearchEmpiricalPostureClassification,
} from "./runtime-model-basic.ts";
import type {
  AutoresearchCandidateResultPacket,
  AutoresearchRuntimeStatus,
} from "./runtime-model-packets.ts";

export type AutoresearchAutoplanPlanner = "heuristic" | "dspx_program";
export type AutoresearchSetupAction = "plan" | "apply" | "baseline";
export type AutoresearchCampaignStartSetupMode = "autoplan" | "prompt_vault_setup";
export type AutoresearchCampaignStartRunMode = "plan_only" | "baseline" | "bounded_loop";
export type AutoresearchCandidateLifecycleMode = "worktree";
export type AutoresearchCandidateKeepAction = "preserve_branch" | "plan_review_branch";
export type AutoresearchCandidateDiscardAction =
  | "suggest_cleanup"
  | "delete_worktree_after_confirm";
export type AutoresearchCandidateRewindAction =
  | "reset_worktree_to_base"
  | "recreate_worktree_from_base";

export interface AutoresearchCandidateLifecyclePolicyInput {
  mode?: AutoresearchCandidateLifecycleMode;
  keep?: AutoresearchCandidateKeepAction;
  discard?: AutoresearchCandidateDiscardAction;
  rewind?: AutoresearchCandidateRewindAction;
}

export interface AutoresearchCandidateLifecyclePolicy {
  mode: AutoresearchCandidateLifecycleMode;
  keep: AutoresearchCandidateKeepAction;
  discard: AutoresearchCandidateDiscardAction;
  rewind: AutoresearchCandidateRewindAction;
  authority: "policy_only_no_mutation";
  worktreeRole: string;
  replayFabricRole: string;
  ascRewindRole: string;
}

export const DEFAULT_AUTORESEARCH_CANDIDATE_LIFECYCLE_POLICY: AutoresearchCandidateLifecyclePolicy =
  {
    mode: "worktree",
    keep: "preserve_branch",
    discard: "suggest_cleanup",
    rewind: "reset_worktree_to_base",
    authority: "policy_only_no_mutation",
    worktreeRole: "primary candidate accept/keep/discard/rewind primitive",
    replayFabricRole: "observer/history/recovery-clue projection only; not the executor",
    ascRewindRole: "live Pi/session recovery only; not candidate accept/discard authority",
  };

export type AutoresearchCandidateDecisionAction =
  | "status"
  | "plan_keep"
  | "plan_discard"
  | "plan_rewind";
export type AutoresearchCandidateLifecycleDecision =
  | "keep"
  | "discard"
  | "rewind"
  | "rebaseline"
  | "collect_more_samples"
  | "rebind_candidate"
  | "finalize"
  | "no_candidate_bound_yet";

export interface BuildAutoresearchCandidateDecisionInput {
  cwd: string;
  action?: AutoresearchCandidateDecisionAction;
  candidatePolicy?: AutoresearchCandidateLifecyclePolicyInput;
}

export type AutoresearchCandidateArtifactStatus =
  | "available"
  | "missing_worktree"
  | "missing_branch"
  | "missing_worktree_and_branch"
  | "unknown";

export interface AutoresearchCandidateDecisionSummary {
  source: AutoresearchCandidateBindingSource | null;
  worktreePath: string | null;
  branch: string | null;
  baseRef: string | null;
  diffSummary: string | null;
  filesChanged: string[];
  label: string;
  worktreeExists: boolean | null;
  branchExists: boolean | null;
  artifactStatus: AutoresearchCandidateArtifactStatus;
}

export interface AutoresearchCandidateDecisionConfirmation {
  required: boolean;
  riskLevel: "none" | "review_gate" | "destructive_external";
  exactConfirmationPhrase: string;
  checklist: string[];
  blockedReasons: string[];
  nextHumanAction: string;
}

export type AutoresearchMetricReadinessClassification =
  | "unconfigured"
  | "threshold_ready"
  | "duration_under_sampled"
  | "duration_baseline_drift"
  | "duration_review_ready"
  | "generic_review";

export interface AutoresearchMetricReadinessReview {
  classification: AutoresearchMetricReadinessClassification;
  summary: string;
  checklist: string[];
  blockedReasons: string[];
}

export interface AutoresearchCandidateDecisionWorkbench {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  candidate: AutoresearchCandidateDecisionSummary | null;
  empirical: {
    classification: AutoresearchEmpiricalPostureClassification;
    empiricalDecisionClass: AutoresearchEmpiricalDecisionClass;
    promotionReady: boolean;
    confidence: number | null;
    confidenceNoiseInterpretation: string;
    checksStatus: string;
    baselineDriftRisk: string;
  };
  metricReadiness?: AutoresearchMetricReadinessReview;
  recommendedDecision: AutoresearchCandidateLifecycleDecision;
  recommendationReason: string;
  confirmation: AutoresearchCandidateDecisionConfirmation;
  exactNextCalls: string[];
  plannedCommands: string[];
  boundaryWarnings: string[];
  status: AutoresearchRuntimeStatus;
  candidateResult: AutoresearchCandidateResultPacket;
}

export type AutoresearchCandidateBindAction = "status" | "plan_run";
export type AutoresearchCandidateBindReadiness = "ready" | "needs_review" | "blocked";

export interface BuildAutoresearchCandidateBindInput {
  cwd: string;
  action?: AutoresearchCandidateBindAction;
  candidateWorktree?: string | null;
  candidateSource?: AutoresearchCandidateBindingSource;
  candidateBranch?: string | null;
  candidateBaseRef?: string | null;
  description?: string | null;
}

export interface AutoresearchCandidateBindInspection {
  candidateWorktree: string;
  exists: boolean;
  isGitWorktree: boolean;
  sameRepository: boolean | null;
  repositoryRoot: string | null;
  branch: string | null;
  head: string | null;
  baseRef: string | null;
  baseRefSource: string | null;
  baseResolved: boolean;
  statusShort: string[];
  filesChanged: string[];
  diffSummary: string;
  readiness: AutoresearchCandidateBindReadiness;
  readinessReasons: string[];
  warnings: string[];
}

export interface AutoresearchCandidateBindPlan {
  cwd: string;
  action: AutoresearchCandidateBindAction;
  candidateSource: AutoresearchCandidateBindingSource;
  description: string;
  inspection: AutoresearchCandidateBindInspection;
  exactNextCalls: string[];
  plannedCommands: string[];
  boundaryWarnings: string[];
  status: AutoresearchRuntimeStatus;
}
