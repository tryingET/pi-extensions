import { classifyPiSettlementMode, type SubagentSettlementMode } from "./subagent-protocol-v2.ts";
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

function optionalSafeInteger(value: unknown, minimum: number): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
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
  addUsage: (usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens: number;
  }) => void;
  setLatestTool: (toolName: string) => void;
  markAgentRunEnd: (willRetry: boolean | undefined) => void;
  markAgentSettled: () => void;
  hasRawChildSpawnIntent: () => boolean;
  markRawChildSpawnIntent: () => void;
  isTransportReady: () => boolean;
  markTransportReady: (
    rawChildPid: number | undefined,
    rawChildPidStartedAt: number | undefined,
    rawChildProcessGroupId: number | undefined,
    settlementMode: SubagentSettlementMode,
    piVersion: string,
  ) => void;
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

    if (event.type === "raw_child_spawn_intent") {
      if (params.isTransportReady()) {
        return { parseError: "raw_child_spawn_intent arrived after transport_ready." };
      }
      if (params.hasRawChildSpawnIntent()) {
        return { parseError: "Duplicate raw_child_spawn_intent from subagent protocol." };
      }
      params.markRawChildSpawnIntent();
      return {};
    }

    if (!params.hasRawChildSpawnIntent()) {
      return {
        parseError: `Subagent protocol event ${String(event.type)} arrived before raw_child_spawn_intent.`,
      };
    }

    if (event.type === "transport_ready") {
      if (params.isTransportReady()) {
        return { parseError: "Duplicate transport_ready handshake from subagent protocol." };
      }
      const settlementMode =
        event.settlementMode === "agent_settled" || event.settlementMode === "legacy_agent_end_exit"
          ? event.settlementMode
          : undefined;
      if (!settlementMode) {
        return {
          parseError: `Missing or unknown Pi settlement mode from subagent protocol: ${String(event.settlementMode)}`,
        };
      }
      const piVersion = typeof event.piVersion === "string" ? event.piVersion.trim() : "";
      const classifiedMode = classifyPiSettlementMode(piVersion);
      if (!piVersion || !classifiedMode) {
        return {
          parseError: `Missing or unsupported Pi version from subagent protocol: ${piVersion || "undefined"}`,
        };
      }
      if (classifiedMode !== settlementMode) {
        return {
          parseError: `Pi settlement handshake mismatch: piVersion=${piVersion} requires ${classifiedMode}, received ${settlementMode}.`,
        };
      }
      const rawChildPid = optionalSafeInteger(event.rawChildPid, 1);
      const rawChildPidStartedAt = optionalSafeInteger(event.rawChildPidStartedAt, 0);
      const rawChildProcessGroupId = optionalSafeInteger(event.rawChildProcessGroupId, 1);
      if (
        rawChildPid === null ||
        rawChildPidStartedAt === null ||
        rawChildProcessGroupId === null
      ) {
        return { parseError: "Invalid raw-child custody identity in transport_ready." };
      }
      params.markTransportReady(
        rawChildPid,
        rawChildPidStartedAt,
        rawChildProcessGroupId,
        settlementMode,
        piVersion,
      );
      return {};
    }

    if (
      !params.isTransportReady() &&
      event.type !== "stdout_noise" &&
      event.type !== "protocol_error"
    ) {
      return {
        parseError: `Subagent protocol event ${String(event.type)} arrived before a complete transport_ready settlement handshake.`,
      };
    }

    if (event.type === "assistant_text_delta") {
      params.appendTextDelta(typeof event.delta === "string" ? event.delta : "");
      return {};
    }

    if (event.type === "assistant_message_end") {
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
      if (event.usage && typeof event.usage === "object") {
        params.addUsage(event.usage);
      }
      return {};
    }

    if (event.type === "agent_run_end") {
      params.markAgentRunEnd(typeof event.willRetry === "boolean" ? event.willRetry : undefined);
      return {};
    }

    if (event.type === "agent_settled") {
      params.markAgentSettled();
      return {};
    }

    if (event.type === "tool_activity") {
      if (typeof event.toolName === "string" && event.toolName.length > 0) {
        params.setLatestTool(event.toolName.slice(0, 80));
      }
      return {};
    }

    if (event.type === "stdout_noise") {
      return { stdoutNoiseLine: typeof event.line === "string" ? event.line : "" };
    }

    if (event.type === "protocol_error") {
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
  protocolIncomplete: boolean;
  assistantStopReason?: AssistantStopReason;
}): SubagentStatus {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return "aborted";
  }
  if (params.timedOut) {
    return "timeout";
  }
  if (params.protocolFailed || params.protocolIncomplete) {
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
      return "error";
    default: {
      const exhaustive: never = params.assistantStopReason;
      return exhaustive;
    }
  }
}

export function createExecutionState(params: {
  transportExitCode: number;
  transportSignal?: string;
  aborted: boolean;
  timedOut: boolean;
  rawChildPid?: number;
  rawChildSpawnIntent?: boolean;
  protocolFailed: boolean;
  protocolIncomplete: boolean;
  transportExitedBeforeSettlement?: boolean;
  protocolFailureOutput: string;
  finalAssistantStopReason?: AssistantStopReason;
  finalAssistantErrorMessage?: string;
}): ExecutionState {
  return {
    transport: {
      kind: "transport",
      exitCode: params.transportExitCode,
      ...(params.transportSignal ? { signal: params.transportSignal } : {}),
      aborted: params.aborted,
      timedOut: params.timedOut,
      ...(typeof params.rawChildSpawnIntent === "boolean"
        ? { rawChildSpawnIntent: params.rawChildSpawnIntent }
        : {}),
      ...(typeof params.rawChildPid === "number" ? { rawChildPid: params.rawChildPid } : {}),
    },
    protocol: params.protocolFailed
      ? {
          kind: "assistant_protocol_parse_error",
          errorMessage:
            params.protocolFailureOutput || "Failed to parse the subagent protocol event stream.",
        }
      : params.protocolIncomplete
        ? {
            kind: "assistant_protocol_incomplete",
            errorMessage:
              params.protocolFailureOutput ||
              "Subagent transport ended without exactly one terminal assistant event.",
            ...(params.transportExitedBeforeSettlement
              ? { transportExitedBeforeSettlement: true as const }
              : {}),
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
  protocolIncomplete: boolean;
  assistantStopReason?: AssistantStopReason;
}): number {
  if (params.aborted || params.assistantStopReason === "aborted") {
    return ASSISTANT_ABORT_EXIT_CODE;
  }
  if (params.timedOut) {
    return 124;
  }
  if (params.protocolFailed || params.protocolIncomplete) {
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
