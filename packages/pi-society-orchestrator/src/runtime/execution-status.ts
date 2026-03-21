export type AssistantStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface ExecutionLike {
  exitCode: number;
  aborted?: boolean;
  timedOut?: boolean;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
}

export type ExecutionStatus = "done" | "aborted" | "timed_out" | "error";

export function getExecutionStatus(result: ExecutionLike): ExecutionStatus {
  if (result.aborted) {
    return "aborted";
  }
  if (result.timedOut) {
    return "timed_out";
  }
  if (result.assistantStopReason === "aborted") {
    return "aborted";
  }
  if (result.assistantStopReason === "error") {
    return "error";
  }
  if (result.assistantStopReason === "stop") {
    return result.exitCode === 0 ? "done" : "error";
  }
  if (result.assistantStopReason) {
    return "error";
  }
  if (result.exitCode === 0) {
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
