import type { ResolvedSubagentExtensionSelection } from "./subagent-extension-selection.ts";
import type {
  DispatchSubagentExecutionResult,
  DispatchSubagentFailureKind,
  DispatchSubagentStatus,
} from "./subagent-runtime-types.ts";
import type { ExecutionState, SubagentResult, SubagentStatus } from "./subagent-spawn.ts";

export function toDispatchSubagentStatus(status: SubagentStatus): DispatchSubagentStatus {
  return status === "timeout" ? "timed_out" : status;
}

export function getDispatchSubagentStatusLabel(status: DispatchSubagentStatus): string {
  return status === "timed_out" ? "timed out" : status;
}

export function getDispatchSubagentFailureKind(params: {
  status: DispatchSubagentStatus;
  reason?: string;
  timeoutPhase?: "startup" | "execution";
  executionState?: ExecutionState;
}): DispatchSubagentFailureKind | undefined {
  switch (params.reason) {
    case "invariant_failed":
    case "unknown_profile":
    case "rate_limited":
      return params.reason;
  }

  switch (params.status) {
    case "done":
    case "spawning":
    case "running":
      return undefined;
    case "aborted":
      return "aborted";
    case "timed_out":
      return params.timeoutPhase === "startup" ? "startup_timed_out" : "timed_out";
    case "error":
      if (params.executionState?.protocol?.kind === "assistant_protocol_parse_error") {
        return "assistant_protocol_parse_error";
      }
      if (params.executionState?.protocol?.kind === "assistant_protocol_incomplete") {
        return "assistant_protocol_incomplete";
      }
      if (params.executionState?.protocol?.kind === "assistant_protocol") {
        return "assistant_protocol_error";
      }
      return "transport_error";
    default: {
      const exhaustive: never = params.status;
      return exhaustive;
    }
  }
}

export function normalizeDispatchSubagentDisplayOutput(
  result: Pick<SubagentResult, "output" | "status" | "exitCode">,
): string {
  if (result.output.trim().length > 0) {
    return result.output;
  }

  switch (result.status) {
    case "done":
      return result.output;
    case "aborted":
      return "Subagent aborted.";
    case "timeout":
      return "Subagent timed out without output.";
    case "error":
      return `Subagent exited with code ${result.exitCode} without output.`;
    default: {
      const exhaustive: never = result.status;
      return exhaustive;
    }
  }
}

export function truncateDispatchSubagentDisplayOutput(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n\n... [truncated]` : value;
}

export function getDispatchSubagentTextBody(result: DispatchSubagentExecutionResult): string {
  const separatorIndex = result.text.indexOf("\n\n");
  return separatorIndex >= 0 ? result.text.slice(separatorIndex + 2) : result.text;
}

export function formatExtensionSelectionWarnings(
  selection: ResolvedSubagentExtensionSelection,
): string {
  if (selection.warnings.length === 0) {
    return "";
  }

  return `\nExtension note: ${selection.warnings.join(" ")}`;
}

export function formatSkillSelectionWarnings(selection: { skillWarnings: string[] }): string {
  if (selection.skillWarnings.length === 0) {
    return "";
  }

  return `\nSkill note: ${selection.skillWarnings.join(" ")}`;
}

export function getDispatchSubagentDisplayOutput(result: DispatchSubagentExecutionResult): string {
  if (typeof result.details.displayOutput === "string") {
    return result.details.displayOutput;
  }

  if (
    typeof result.details.fullOutput === "string" &&
    result.details.fullOutput.trim().length > 0
  ) {
    return result.details.fullOutput;
  }

  return getDispatchSubagentTextBody(result);
}
