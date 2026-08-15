export type SubagentSettlementMode = "agent_settled" | "legacy_agent_end_exit";

// Protocol generation v2 is paired with subagent-pi-json-filter-v2.ts and the
// current parent parser. Preserve this contract; add a new generation for incompatible changes.

export interface RawChildSpawnIntentProtocolEvent {
  type: "raw_child_spawn_intent";
}

export interface TransportReadyProtocolEvent {
  type: "transport_ready";
  rawChildPid?: number;
  rawChildPidStartedAt?: number;
  rawChildProcessGroupId?: number;
  settlementMode: SubagentSettlementMode;
  piVersion: string;
}

export interface AssistantTextDeltaProtocolEvent {
  type: "assistant_text_delta";
  delta: string;
}

export interface ProtocolUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
}

export interface AssistantMessageEndProtocolEvent {
  type: "assistant_message_end";
  stopReason?: string;
  errorMessage?: string;
  text?: string;
  textTruncated?: boolean;
  usage?: ProtocolUsage;
}

export interface ToolActivityProtocolEvent {
  type: "tool_activity";
  toolName: string;
}

export interface AgentRunEndProtocolEvent {
  type: "agent_run_end";
  willRetry?: boolean;
}

export interface AgentSettledProtocolEvent {
  type: "agent_settled";
}

export interface StdoutNoiseProtocolEvent {
  type: "stdout_noise";
  line: string;
}

export interface ProtocolErrorProtocolEvent {
  type: "protocol_error";
  errorMessage: string;
}

export type SubagentProtocolEvent =
  | RawChildSpawnIntentProtocolEvent
  | TransportReadyProtocolEvent
  | AssistantTextDeltaProtocolEvent
  | AssistantMessageEndProtocolEvent
  | ToolActivityProtocolEvent
  | AgentRunEndProtocolEvent
  | AgentSettledProtocolEvent
  | StdoutNoiseProtocolEvent
  | ProtocolErrorProtocolEvent;

const DEFAULT_STDOUT_NOISE_PREVIEW_CHARS = 200;

export function classifyPiSettlementMode(version: string): SubagentSettlementMode | undefined {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return undefined;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 0 && minor === 76) return "legacy_agent_end_exit";
  if (major > 0 || (major === 0 && minor >= 80)) return "agent_settled";
  return undefined;
}
const RECOGNIZED_PI_EVENT_TYPES = new Set([
  "agent_start",
  "agent_end",
  "agent_settled",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
]);

export function isRecognizedPiJsonEventLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const event = JSON.parse(trimmed) as { type?: unknown };
    return typeof event.type === "string" && RECOGNIZED_PI_EVENT_TYPES.has(event.type);
  } catch {
    return false;
  }
}

export function translatePiJsonEventLineToSubagentProtocol(
  line: string,
  options?: { maxFinalTextChars?: number },
): SubagentProtocolEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!trimmed.startsWith("{")) {
    return {
      type: "stdout_noise",
      line: trimmed.slice(0, DEFAULT_STDOUT_NOISE_PREVIEW_CHARS),
    };
  }

  try {
    const event = JSON.parse(trimmed);
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      return {
        type: "assistant_text_delta",
        delta:
          typeof event.assistantMessageEvent.delta === "string"
            ? event.assistantMessageEvent.delta
            : "",
      };
    }

    if (event.type === "agent_end") {
      return {
        type: "agent_run_end",
        willRetry: typeof event.willRetry === "boolean" ? event.willRetry : undefined,
      };
    }

    if (event.type === "agent_settled") {
      return { type: "agent_settled" };
    }

    if (event.type === "tool_execution_start" && typeof event.toolName === "string") {
      return {
        type: "tool_activity",
        toolName: event.toolName.slice(0, 80),
      };
    }

    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = extractAssistantText(event.message.content);
      const bounded = truncateToMaxChars(text, options?.maxFinalTextChars);
      const usage = normalizeUsage(event.message.usage);
      return {
        type: "assistant_message_end",
        stopReason:
          event.message.stopReason === undefined ? undefined : String(event.message.stopReason),
        errorMessage:
          typeof event.message.errorMessage === "string" ? event.message.errorMessage : undefined,
        text: bounded.value || undefined,
        textTruncated: bounded.truncated || undefined,
        ...(usage ? { usage } : {}),
      };
    }

    return undefined;
  } catch (error) {
    return {
      type: "protocol_error",
      errorMessage: `Failed to parse raw pi JSON event line.\n${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function normalizeUsage(value: unknown): ProtocolUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const cost =
    usage.cost && typeof usage.cost === "object" && !Array.isArray(usage.cost)
      ? (usage.cost as Record<string, unknown>).total
      : undefined;
  const number = (entry: unknown): number =>
    typeof entry === "number" && Number.isFinite(entry) && entry >= 0 ? entry : 0;
  return {
    input: number(usage.input),
    output: number(usage.output),
    cacheRead: number(usage.cacheRead),
    cacheWrite: number(usage.cacheWrite),
    cost: number(cost),
    contextTokens: number(usage.totalTokens),
  };
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (item): item is { type: string; text?: string } =>
        typeof item === "object" && item !== null && "type" in item,
    )
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
}

function truncateToMaxChars(
  value: string,
  maxChars: number | undefined,
): { value: string; truncated: boolean } {
  if (typeof maxChars !== "number" || maxChars < 0) {
    return { value, truncated: false };
  }

  if (maxChars === 0) {
    return { value: "", truncated: value.length > 0 };
  }

  if (value.length <= maxChars) {
    return { value, truncated: false };
  }

  return {
    value: value.slice(0, maxChars),
    truncated: true,
  };
}
