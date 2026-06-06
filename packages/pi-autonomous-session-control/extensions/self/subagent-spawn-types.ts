import type { SubagentState } from "./subagent-session.ts";

export interface SubagentDef {
  name: string;
  objective: string;
  tools: string;
  systemPrompt?: string;
  profile?: string;
  sessionFile: string | null;
  timeout?: number; // milliseconds, 0 = no timeout
  env?: Record<string, string>;
  noSkills?: boolean;
  skillSources?: string[];
  executionSlotReserved?: boolean;
  parentSessionKey?: string;
  parentRepoRoot?: string;
  extensionSources?: string[];
}

export const ASSISTANT_STOP_REASONS = ["stop", "length", "toolUse", "error", "aborted"] as const;

export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[number];
export type SubagentStatus = "done" | "error" | "timeout" | "aborted";

export interface TransportExecutionState {
  kind: "transport";
  exitCode: number;
  aborted: boolean;
  timedOut: boolean;
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

export type ProtocolExecutionState =
  | AssistantProtocolExecutionState
  | AssistantProtocolParseErrorState;

export interface ExecutionState {
  transport: TransportExecutionState;
  protocol?: ProtocolExecutionState;
}

export interface SubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  status: SubagentStatus;
  stderr?: string;
  outputTruncated?: boolean;
  timedOut?: boolean;
  aborted?: boolean;
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
) => Promise<SubagentResult>;
