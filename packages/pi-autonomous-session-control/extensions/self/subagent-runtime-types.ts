import type { InvariantIssue } from "./edge-contract-kernel.ts";
import type { DispatchEffectReceipt } from "./effect-receipt.ts";
import type { SessionScopedContext } from "./session-context.ts";
import type {
  ResolvedSubagentModelSelection,
  SubagentModelSelectionSource,
} from "./subagent-model-selection.ts";
import type { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import type { SubagentState } from "./subagent-session.ts";
import type { AssistantStopReason, ExecutionState, SubagentSpawner } from "./subagent-spawn.ts";

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
}
export type DispatchSubagentFailureKind =
  | "aborted"
  | "timed_out"
  | "assistant_protocol_error"
  | "assistant_protocol_parse_error"
  | "assistant_protocol_incomplete"
  | "transport_error"
  | "startup_timed_out"
  | "extension_bootstrap_missing"
  | "env_policy_failed"
  | "skill_profile_failed"
  | "invariant_failed"
  | "unknown_profile"
  | "rate_limited"
  | "model_selection_failed"
  | "effect_receipt_write_failed";

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
  /** Durable, owner-issued effect disposition for this exact ASC attempt. */
  effectReceipt?: DispatchEffectReceipt;
  effectCorrelationId?: string;
  invariants?: InvariantIssue[];
  activeCount?: number;
  maxConcurrent?: number;
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
  state?: SubagentState;
  maxConcurrent?: number;
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
