import type { SubagentCapacityCustodyBinding } from "./subagent-capacity-custody.ts";
import type { SubagentState } from "./subagent-session.ts";

export interface SubagentDef {
  name: string;
  dispatchId: string;
  attemptId: string;
  objective: string;
  /** Initial user message sent after Pi's stable host/project system context. */
  userPrompt?: string;
  tools: string;
  /** Legacy direct-spawner compatibility only; dispatch runtime leaves this unset. */
  systemPrompt?: string;
  profile?: string;
  sessionFile: string | null;
  timeout?: number; // execution milliseconds after bootstrap, 0 = no timeout
  startupTimeout?: number; // bootstrap milliseconds, always bounded
  thinking?: string;
  resumed?: boolean;
  taskContract?: Record<string, unknown>;
  env?: Record<string, string>;
  noSkills?: boolean;
  skillSources?: string[];
  executionSlotReserved?: boolean;
  parentSessionKey?: string;
  parentRepoRoot?: string;
  extensionSources?: string[];
  capacityCustody?: SubagentCapacityCustodyBinding;
}

export const ASSISTANT_STOP_REASONS = ["stop", "length", "toolUse", "error", "aborted"] as const;

export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[number];
export type SubagentStatus = "done" | "error" | "timeout" | "aborted";

export interface PromptCacheSample {
  promptTokens: number;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  uncachedTokens: number;
  cacheReadRatio: number;
  outputTokens: number;
  cost: number;
}

export interface SubagentCacheMetrics {
  firstTurn: PromptCacheSample;
  aggregate: PromptCacheSample;
}

export interface TransportExecutionState {
  kind: "transport";
  exitCode: number;
  signal?: string;
  aborted: boolean;
  timedOut: boolean;
  rawChildSpawnIntent?: boolean;
  rawChildPid?: number;
}

export interface AssistantProtocolExecutionState {
  kind: "assistant_protocol";
  stopReason: AssistantStopReason;
  errorMessage?: string;
}

export interface AssistantProtocolParseErrorState {
  kind: "assistant_protocol_parse_error";
  errorMessage: string;
}

export interface AssistantProtocolIncompleteState {
  kind: "assistant_protocol_incomplete";
  errorMessage: string;
  transportExitedBeforeSettlement?: true;
}

export type ProtocolExecutionState =
  | AssistantProtocolExecutionState
  | AssistantProtocolParseErrorState
  | AssistantProtocolIncompleteState;

export interface ExecutionState {
  transport: TransportExecutionState;
  protocol?: ProtocolExecutionState;
}

export interface SubagentUsage {
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  cache?: SubagentCacheMetrics;
}

export interface SubagentProgressEvent {
  phase: "spawning" | "running" | "finalizing";
  elapsedMs: number;
  lastActivityAt: number;
  outputChars: number;
  latestTool?: string;
  usage: SubagentUsage;
}

export interface SubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  status: SubagentStatus;
  stderr?: string;
  outputTruncated?: boolean;
  timedOut?: boolean;
  timeoutPhase?: "startup" | "execution";
  aborted?: boolean;
  usage?: SubagentUsage;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
  executionState?: ExecutionState;
}

export type SubagentSpawner = (
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
  signal?: AbortSignal,
  onProgress?: (event: SubagentProgressEvent) => void,
) => Promise<SubagentResult>;
