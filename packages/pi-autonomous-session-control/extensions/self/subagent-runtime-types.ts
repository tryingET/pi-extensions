import type { InvariantIssue } from "./edge-contract-kernel.ts";
import type { DispatchEffectDisposition, DispatchEffectReceipt } from "./effect-receipt.ts";
import type { SessionScopedContext } from "./session-context.ts";
import type { SharedSubagentCapacityHolder } from "./subagent-capacity.ts";
import type {
  ResolvedSubagentModelSelection,
  SubagentModelSelectionSource,
} from "./subagent-model-selection.ts";
import type { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import type { SubagentState } from "./subagent-session.ts";
import type { ExtraSkillProfileResolver } from "./subagent-skill-selection.ts";
import type {
  AssistantStopReason,
  ExecutionState,
  SubagentCacheMetrics,
  SubagentSpawner,
} from "./subagent-spawn.ts";

export type DispatchSubagentProfile = keyof typeof SUBAGENT_PROFILES | "custom";
export type DispatchThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type DispatchMutationPolicy = "read_only" | "bounded_mutation";
export type DispatchSubagentStatus =
  | "done"
  | "error"
  | "timed_out"
  | "aborted"
  | "spawning"
  | "running";

export interface DispatchTaskContract {
  objective: string;
  deliverable: string;
  acceptanceCriteria: string[];
  constraints: string[];
  evidenceRequired: string[];
  mutationPolicy?: DispatchMutationPolicy;
  stopConditions: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  boundary: string;
}

export interface DispatchUsage {
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  cache?: SubagentCacheMetrics;
}
export type DispatchSubagentFailureKind =
  | "aborted"
  | "timed_out"
  | "assistant_protocol_error"
  | "assistant_protocol_parse_error"
  | "assistant_protocol_incomplete"
  | "transport_exited_before_settlement"
  | "subagent_helper_bootstrap_failed"
  | "transport_error"
  | "startup_timed_out"
  | "extension_bootstrap_missing"
  | "env_policy_failed"
  | "skill_profile_failed"
  | "invariant_failed"
  | "unknown_profile"
  | "rate_limited"
  | "model_selection_failed"
  | "effect_receipt_write_failed"
  | "capacity_release_deferred";

export interface DispatchSubagentPreDispatchFailureAttestation {
  schema: "asc.dispatch_pre_dispatch_failure.v1";
  phase: "pre_dispatch";
  identityAllocated: false;
  spawnAttempted: false;
  effectDisposition: "confirmed_no_effects";
  failureKind: DispatchSubagentFailureKind;
}

export interface DispatchSubagentRequest {
  profile: DispatchSubagentProfile;
  objective: string;
  tools?: string;
  resumeDispatchId?: string;
  thinking?: DispatchThinkingLevel;
  startupTimeout?: number;
  allowUnlimited?: boolean;
  deliverable?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  evidenceRequired?: string[];
  mutationPolicy?: DispatchMutationPolicy;
  stopConditions?: string[];
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  /** Compatibility field: custom child instructions placed in the initial user task message. */
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  extensions?: string[];
  env?: Record<string, string>;
  skillProfile?: string;
  noSkills?: boolean;
  skills?: string[];
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
  /** Consumer-owned correlation id bound into ASC's durable effect receipt. */
  effectCorrelationId?: string;
}

export interface DispatchSubagentDetails {
  profile?: DispatchSubagentProfile;
  objective?: string;
  dispatchId?: string;
  attemptId?: string;
  sessionName?: string;
  sessionFile?: string;
  resumed?: boolean;
  resumeDispatchId?: string;
  configuredThinking?: DispatchThinkingLevel;
  startupTimeoutSeconds?: number;
  executionTimeoutSeconds?: number;
  timeoutPhase?: "startup" | "execution";
  taskContract?: DispatchTaskContract;
  usage?: DispatchUsage;
  progressSequence?: number;
  progressPhase?: "preparing" | "spawning" | "running" | "finalizing" | "completed";
  lastActivityAt?: number;
  latestTool?: string;
  status?: DispatchSubagentStatus;
  elapsed?: number;
  exitCode?: number;
  fullOutput?: string;
  displayOutput?: string;
  stderr?: string;
  outputTruncated?: boolean;
  timedOut?: boolean;
  aborted?: boolean;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
  executionState?: ExecutionState;
  requestedModel?: string;
  effectiveModel?: string;
  modelSelectionSource?: SubagentModelSelectionSource;
  modelSelectionWarning?: string;
  loadedExtensions?: string[];
  extensionWarnings?: string[];
  skillProfile?: string;
  loadedSkills?: string[];
  librarySkills?: string[];
  skillWarnings?: string[];
  skillRegistry?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied?: boolean;
  prompt_warning?: string;
  reason?: string;
  failureKind?: DispatchSubagentFailureKind;
  /** Owner-issued effect classification, including failures before receipt identity exists. */
  effectDisposition?: DispatchEffectDisposition;
  /** Exact owner attestation for failures before dispatch/attempt identity allocation. */
  preDispatchFailure?: DispatchSubagentPreDispatchFailureAttestation;
  /** Durable, owner-issued effect disposition for this exact ASC attempt. */
  effectReceipt?: DispatchEffectReceipt;
  effectCorrelationId?: string;
  invariants?: InvariantIssue[];
  activeCount?: number;
  maxConcurrent?: number;
  capacityScope?: "repository_sessions_dir";
  capacityHolders?: SharedSubagentCapacityHolder[];
}

export interface DispatchSubagentExecutionUpdate {
  text: string;
  details?: DispatchSubagentDetails;
}

export interface DispatchSubagentExecutionResult {
  text: string;
  details: DispatchSubagentDetails;
  ok: boolean;
}

export interface SubagentModelContext extends SessionScopedContext {
  cwd: string;
  model?: {
    provider?: unknown;
    id?: unknown;
  };
}

export type SubagentModelProviderResult = string | ResolvedSubagentModelSelection;

export interface AscExecutionRuntimeOptions {
  sessionsDir: string;
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult;
  spawner?: SubagentSpawner;
  customSpawnerCapacityOwnership?: "parent_owned";
  state?: SubagentState;
  maxConcurrent?: number;
  /**
   * Consumer-supplied allowlisted resolver consulted when the built-in
   * skill-librarian registry does not know the requested skill profile
   * (pi-agent-registry agent names, engineering-core profiles).
   */
  extraSkillProfileResolver?: ExtraSkillProfileResolver;
}

export interface AscExecutionRuntime {
  state: SubagentState;
  cancel(
    dispatchId: string,
    ctx: SubagentModelContext,
    reason?: string,
  ): { ok: boolean; status: string; error?: string; sessionName?: string };
  execute(
    request: DispatchSubagentRequest,
    ctx: SubagentModelContext,
    onUpdate?: (update: DispatchSubagentExecutionUpdate) => void,
    signal?: AbortSignal,
  ): Promise<DispatchSubagentExecutionResult>;
}
