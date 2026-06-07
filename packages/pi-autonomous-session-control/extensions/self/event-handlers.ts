import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolResultEvent,
  TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { incrementTurn, trackCommand, trackError, trackFileOp } from "./perception.ts";
import type { SelfState } from "./types.ts";

type NamedToolCallEvent<TName extends ToolCallEvent["toolName"]> = Extract<
  ToolCallEvent,
  { toolName: TName }
>;

function isNamedToolCallEvent<TName extends ToolCallEvent["toolName"]>(
  event: ToolCallEvent,
  toolName: TName,
): event is NamedToolCallEvent<TName> {
  return event.toolName === toolName;
}

const RELATIVE_DEV_NULL_REDIRECT_PATTERN = /(^|[\s;&|])(?:\d+|&)?>>?\s*dev\/null(?:\s|$)/;

function readBashCommandInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const command = (input as { command?: unknown }).command;
  return typeof command === "string" && command.trim().length > 0 ? command : null;
}

function hasRelativeDevNullRedirect(command: string): boolean {
  return RELATIVE_DEV_NULL_REDIRECT_PATTERN.test(command);
}

export function setupEventHandlers(pi: ExtensionAPI, state: SelfState): void {
  const bashCommandByCallId = new Map<string, string>();
  const malformedBashCallIds = new Set<string>();

  const handleToolCall = (event: ToolCallEvent): void => {
    if (isNamedToolCallEvent(event, "write")) {
      const { path, content } = event.input;
      if (typeof path === "string" && typeof content === "string") {
        trackFileOp(state.operations, {
          type: "create",
          path,
          linesDelta: content.length > 0 ? content.split("\n").length : 0,
        });
      }
    }

    if (isNamedToolCallEvent(event, "edit")) {
      const input = event.input as {
        path?: unknown;
        edits?: Array<{ oldText?: unknown; newText?: unknown }>;
        oldText?: unknown;
        newText?: unknown;
      };
      const path = input.path;
      const edits = Array.isArray(input.edits)
        ? input.edits
        : [{ oldText: input.oldText, newText: input.newText }];
      if (typeof path === "string") {
        const oldLines = edits.reduce(
          (sum, edit) =>
            sum +
            (typeof edit.oldText === "string" && edit.oldText.length > 0
              ? edit.oldText.split("\n").length
              : 0),
          0,
        );
        const newLines = edits.reduce(
          (sum, edit) =>
            sum +
            (typeof edit.newText === "string" && edit.newText.length > 0
              ? edit.newText.split("\n").length
              : 0),
          0,
        );
        trackFileOp(state.operations, {
          type: "modify",
          path,
          linesDelta: newLines - oldLines,
        });
      }
    }

    if (isNamedToolCallEvent(event, "bash")) {
      const command = readBashCommandInput(event.input);
      const callId = event.toolCallId;
      if (!command) {
        if (callId) {
          malformedBashCallIds.add(callId);
        }
        trackError(
          state.operations,
          "bash",
          "Malformed bash tool call: missing non-empty command string.",
        );
        return;
      }

      if (callId) {
        bashCommandByCallId.set(callId, command);
      }
      if (hasRelativeDevNullRedirect(command)) {
        trackError(
          state.operations,
          "bash",
          "Suspicious bash redirection to relative dev/null; use absolute /dev/null to avoid repo artifacts.",
        );
      }
    }
  };

  const handleToolResult = (event: ToolResultEvent): void => {
    const toolName = event.toolName;
    const success = !event.isError;

    if (toolName === "bash") {
      if (malformedBashCallIds.has(event.toolCallId)) {
        malformedBashCallIds.delete(event.toolCallId);
      } else {
        const command = bashCommandByCallId.get(event.toolCallId);
        bashCommandByCallId.delete(event.toolCallId);
        if (command) {
          trackCommand(state.operations, command, success);
        } else {
          trackError(
            state.operations,
            "bash",
            "Bash tool result had no matching command; command history cannot prove what ran.",
          );
        }
      }
    }

    if (event.isError) {
      const errorMessage = Array.isArray(event.content)
        ? event.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("")
            .trim() || "Unknown error"
        : "Unknown error";
      trackError(state.operations, toolName, errorMessage);
    }
  };

  const handleTurnStart = (_event: TurnStartEvent): void => {
    incrementTurn(state.operations);
  };

  pi.on("tool_call", handleToolCall);
  pi.on("tool_result", handleToolResult);
  pi.on("turn_start", handleTurnStart);
}
