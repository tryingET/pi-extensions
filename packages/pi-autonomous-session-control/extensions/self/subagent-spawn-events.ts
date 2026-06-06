import {
  ASSISTANT_STOP_REASONS,
  type AssistantStopReason,
  type ExecutionState,
  type SubagentStatus,
} from "./subagent-spawn-types.ts";

const DEFAULT_STATUS_RESULT_PREVIEW_CHARS = 280;
const ASSISTANT_ERROR_EXIT_CODE = 1;
const ASSISTANT_ABORT_EXIT_CODE = 130;

function isAssistantStopReason(value: unknown): value is AssistantStopReason {
  return (
    typeof value === "string" && ASSISTANT_STOP_REASONS.some((candidate) => candidate === value)
  );
}

export function toStatusResultPreview(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.length > DEFAULT_STATUS_RESULT_PREVIEW_CHARS
    ? `${normalized.slice(0, DEFAULT_STATUS_RESULT_PREVIEW_CHARS - 1)}…`
    : normalized;
}

export function formatTimeoutDuration(timeoutMs: number): string {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return "0ms";
  }

  if (timeoutMs < 1000) {
    return `${Math.max(1, Math.round(timeoutMs))}ms`;
  }

  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${(timeoutMs / 1000).toFixed(1).replace(/\.0$/, "")}s`;
}

export function consumeSubagentEventLine(params: {
  line: string;
  appendTextDelta: (value: string) => void;
  setFinalAssistantText: (value: string) => void;
  markAssistantOutputTruncated: () => void;
  setFinalAssistantState: (state: {
    stopReason?: AssistantStopReason;
    errorMessage?: string;
  }) => void;
  markTransportReady: (rawChildPid?: number) => void;
}): { parseError?: string; protocolError?: string; stdoutNoiseLine?: string } {
  const trimmed = params.line.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.startsWith("{")) {
    return {
      parseError: `Non-JSON stdout while parsing the subagent protocol: ${trimmed.slice(0, 200)}`,
    };
  }

  try {
    const event = JSON.parse(trimmed);

    if (event.type === "transport_ready") {
      params.markTransportReady(
        typeof event.rawChildPid === "number" && event.rawChildPid > 0
          ? event.rawChildPid
          : undefined,
      );
      return {};
    }

    if (event.type === "assistant_text_delta") {
      params.markTransportReady();
      params.appendTextDelta(typeof event.delta === "string" ? event.delta : "");
      return {};
    }

    if (event.type === "assistant_message_end") {
      params.markTransportReady();
      const rawStopReason = event.stopReason;
      const stopReason =
        rawStopReason === undefined
          ? undefined
          : isAssistantStopReason(rawStopReason)
            ? rawStopReason
            : null;

      if (typeof event.text === "string" && event.text.length > 0) {
        params.setFinalAssistantText(event.text);
      }
      if (event.textTruncated === true) {
        params.markAssistantOutputTruncated();
      }

      if (stopReason === null) {
        return {
          parseError: `Unknown assistant stop reason from subagent protocol: ${String(rawStopReason)}`,
        };
      }

      params.setFinalAssistantState({
        stopReason,
        errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
      });
      return {};
    }

    if (event.type === "stdout_noise") {
      params.markTransportReady();
      return { stdoutNoiseLine: typeof event.line === "string" ? event.line : "" };
    }

    if (event.type === "protocol_error") {
      params.markTransportReady();
      return {
        protocolError:
          typeof event.errorMessage === "string"
            ? event.errorMessage
            : "Subagent protocol reported an unspecified error.",
      };
    }

    return {
      parseError: `Unexpected subagent protocol event type: ${typeof event.type === "string" ? event.type : "unknown"}`,
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getAssistantProtocolFallbackOutput(params: {
  stopReason?: AssistantStopReason;
  errorMessage?: string;
  combinedStderr: string;
  transportExitCode: number;
}): string {
  switch (params.stopReason) {
    case "error":
      return (
        params.errorMessage ||
        params.combinedStderr ||
        "Assistant reported an error before producing a final response."
      );
    case "aborted":
      return params.errorMessage || "Assistant aborted execution.";
    case "length":
      return (
        params.errorMessage ||
        "Assistant stopped because it hit its response length limit before producing a final response."
      );
    case "toolUse":
      return (
        params.errorMessage || "Assistant stopped for tool use before producing a final response."
      );
    case "stop":
    case undefined:
      return params.combinedStderr || `pi exited with code ${params.transportExitCode}`;
    default: {
      const exhaustive: never = params.stopReason;
      return exhaustive;
    }
  }
}

export function getSemanticStatus(params: {
  transportExitCode: number;
  aborted: boolean;
  timedOut: boolean;
  protocolFailed: boolean;
  assistantStopReason?: AssistantStopReason;
}): SubagentStatus {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return "aborted";
  }
  if (params.timedOut) {
    return "timeout";
  }
  if (params.protocolFailed) {
    return "error";
  }
  switch (params.assistantStopReason) {
    case "error":
    case "length":
    case "toolUse":
      return "error";
    case "stop":
      // Once the assistant protocol emits a final stop message, treat that as the semantic truth
      // even if the transport exits non-zero afterward. Preserve the transport exit code separately
      // in executionState so diagnostics can still explain the drift.
      return "done";
    case undefined:
      return params.transportExitCode === 0 ? "done" : "error";
    default: {
      const exhaustive: never = params.assistantStopReason;
      return exhaustive;
    }
  }
}

export function createExecutionState(params: {
  transportExitCode: number;
  aborted: boolean;
  timedOut: boolean;
  rawChildPid?: number;
  protocolFailed: boolean;
  protocolFailureOutput: string;
  finalAssistantStopReason?: AssistantStopReason;
  finalAssistantErrorMessage?: string;
}): ExecutionState {
  return {
    transport: {
      kind: "transport",
      exitCode: params.transportExitCode,
      aborted: params.aborted,
      timedOut: params.timedOut,
      ...(typeof params.rawChildPid === "number" ? { rawChildPid: params.rawChildPid } : {}),
    },
    protocol: params.protocolFailed
      ? {
          kind: "assistant_protocol_parse_error",
          errorMessage:
            params.protocolFailureOutput || "Failed to parse the subagent protocol event stream.",
        }
      : params.finalAssistantStopReason
        ? {
            kind: "assistant_protocol",
            stopReason: params.finalAssistantStopReason,
            errorMessage: params.finalAssistantErrorMessage,
          }
        : undefined,
  };
}

export function getSemanticExitCode(params: {
  transportExitCode: number;
  aborted: boolean;
  timedOut: boolean;
  protocolFailed: boolean;
  assistantStopReason?: AssistantStopReason;
}): number {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return ASSISTANT_ABORT_EXIT_CODE;
  }
  if (params.timedOut) {
    return 124;
  }
  if (params.protocolFailed) {
    return ASSISTANT_ERROR_EXIT_CODE;
  }
  switch (params.assistantStopReason) {
    case "error":
      return ASSISTANT_ERROR_EXIT_CODE;
    case "stop":
      return 0;
    case "length":
    case "toolUse":
    case undefined:
      return params.transportExitCode;
    default: {
      const exhaustive: never = params.assistantStopReason;
      return exhaustive;
    }
  }
}
