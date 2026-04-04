export interface TransportReadyProtocolEvent {
  type: "transport_ready";
  rawChildPid?: number;
}

export interface AssistantTextDeltaProtocolEvent {
  type: "assistant_text_delta";
  delta: string;
}

export interface AssistantMessageEndProtocolEvent {
  type: "assistant_message_end";
  stopReason?: string;
  errorMessage?: string;
  text?: string;
  textTruncated?: boolean;
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
  | TransportReadyProtocolEvent
  | AssistantTextDeltaProtocolEvent
  | AssistantMessageEndProtocolEvent
  | StdoutNoiseProtocolEvent
  | ProtocolErrorProtocolEvent;

const DEFAULT_STDOUT_NOISE_PREVIEW_CHARS = 200;

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

    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = extractAssistantText(event.message.content);
      const bounded = truncateToMaxChars(text, options?.maxFinalTextChars);
      return {
        type: "assistant_message_end",
        stopReason:
          event.message.stopReason === undefined ? undefined : String(event.message.stopReason),
        errorMessage:
          typeof event.message.errorMessage === "string" ? event.message.errorMessage : undefined,
        text: bounded.value || undefined,
        textTruncated: bounded.truncated || undefined,
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
