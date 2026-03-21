export const ASSISTANT_STOP_REASONS = ["stop", "length", "toolUse", "error", "aborted"] as const;

export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[number];

export interface TransportExecutionState {
  kind: "transport";
  exitCode: number;
  aborted: boolean;
  timedOut: boolean;
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

export interface ExecutionLike {
  exitCode: number;
  aborted?: boolean;
  timedOut?: boolean;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
  // Preferred source of truth when present. Legacy top-level fields remain for compatibility.
  executionState?: ExecutionState;
}

export type ExecutionStatus = "done" | "aborted" | "timed_out" | "error";

export function isAssistantStopReason(value: unknown): value is AssistantStopReason {
  return (
    typeof value === "string" && ASSISTANT_STOP_REASONS.some((candidate) => candidate === value)
  );
}

export function getExecutionState(result: ExecutionLike): ExecutionState {
  const transport = result.executionState?.transport ?? {
    kind: "transport",
    exitCode: result.exitCode,
    aborted: Boolean(result.aborted),
    timedOut: Boolean(result.timedOut),
  };

  const protocol =
    result.executionState?.protocol ??
    (result.assistantStopReason
      ? {
          kind: "assistant_protocol",
          stopReason: result.assistantStopReason,
          errorMessage: result.assistantErrorMessage,
        }
      : undefined);

  return {
    transport,
    protocol,
  };
}

export function getExecutionStatus(result: ExecutionLike): ExecutionStatus {
  const state = getExecutionState(result);

  if (state.transport.aborted) {
    return "aborted";
  }
  if (state.transport.timedOut) {
    return "timed_out";
  }
  if (state.protocol?.kind === "assistant_protocol_parse_error") {
    return "error";
  }
  if (state.protocol?.kind === "assistant_protocol") {
    switch (state.protocol.stopReason) {
      case "aborted":
        return "aborted";
      case "error":
        return "error";
      case "stop":
        return state.transport.exitCode === 0 ? "done" : "error";
      case "length":
        return "error";
      case "toolUse":
        // This runtime expects a final assistant response, not an unfinished tool handoff.
        return "error";
      default: {
        const exhaustive: never = state.protocol.stopReason;
        return exhaustive;
      }
    }
  }
  if (state.transport.exitCode === 0) {
    return "done";
  }
  return "error";
}

export function isExecutionSuccess(result: ExecutionLike): boolean {
  return getExecutionStatus(result) === "done";
}

export function getExecutionIcon(result: ExecutionLike): string {
  return isExecutionSuccess(result) ? "✓" : "✗";
}
