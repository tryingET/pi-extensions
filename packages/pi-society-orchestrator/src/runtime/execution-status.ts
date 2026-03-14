export interface ExecutionLike {
  exitCode: number;
  aborted?: boolean;
  timedOut?: boolean;
}

export type ExecutionStatus = "done" | "aborted" | "timed_out" | "error";

export function getExecutionStatus(result: ExecutionLike): ExecutionStatus {
  if (result.aborted) {
    return "aborted";
  }
  if (result.timedOut) {
    return "timed_out";
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
