// ---
// summary: wires Pi lifecycle and tool events into self perception tracking and the live-runtime proof ledger.
// read_when:
//   - changing how tool calls, results, session transitions, or proof invalidations update self state.
// ---

import type {
  ExtensionAPI,
  ExtensionContext,
  MessageStartEvent,
  SessionStartEvent,
  SessionTreeEvent,
  ToolCallEvent,
  ToolResultEvent,
  TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { noteUserMessageArrived } from "./follow-up-policy.ts";
import {
  appendLiveRuntimeProofEvent,
  appendLiveRuntimeProofInvalidation,
  classifyLiveRuntimeProofCommand,
  hasActiveLiveRuntimeProofRun,
  hasLiveRuntimeProofSourceDrift,
  isLiveRuntimeDogfoodProbe,
  pathMayMutateRuntimePackage,
  reconstructLiveRuntimeProofEvents,
  resolveAscRuntimePackageRoot,
} from "./live-runtime-proof-ledger.ts";
import {
  incrementTurn,
  trackCommand,
  trackError,
  trackFileOp,
  trackSessionLifecycleEvent,
} from "./perception.ts";
import type { SelfState } from "./types.ts";

interface FinalToolExecutionEvent {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

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

function readSelfQueryInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const query = (input as { query?: unknown }).query;
  return typeof query === "string" ? query : undefined;
}

function resultHasTypedDogfoodProbe(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const data = (details as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const evolutionCandidate = (data as { evolutionCandidate?: unknown }).evolutionCandidate;
  if (
    !evolutionCandidate ||
    typeof evolutionCandidate !== "object" ||
    Array.isArray(evolutionCandidate)
  ) {
    return false;
  }
  const guard = (evolutionCandidate as { liveRuntimeProofGuard?: unknown }).liveRuntimeProofGuard;
  return (
    Boolean(guard) &&
    typeof guard === "object" &&
    !Array.isArray(guard) &&
    (guard as { kind?: unknown }).kind === "self.live_runtime_proof_guard.v1"
  );
}

function readActiveBranch(ctx: ExtensionContext | undefined): unknown[] {
  try {
    const branch = ctx?.sessionManager?.getBranch();
    return Array.isArray(branch) ? branch : [];
  } catch {
    return [];
  }
}

function extractTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export function setupEventHandlers(pi: ExtensionAPI, state: SelfState): void {
  const packageRoot = resolveAscRuntimePackageRoot();
  const bashCommandByCallId = new Map<string, string>();
  const proofBashByCallId = new Map<
    string,
    { input: unknown; cwd: string; tier: "packageCheck" | "install" }
  >();
  const dogfoodSelfCalls = new Map<string, unknown>();
  const malformedBashCallIds = new Set<string>();

  const persistSourceDriftInvalidation = (): void => {
    if (!hasLiveRuntimeProofSourceDrift(state)) return;
    try {
      appendLiveRuntimeProofInvalidation(pi, state, packageRoot, {
        source: "pi.tool_call.file_mutation",
        reason: "runtime source fingerprint drift observed before proof status",
      });
    } catch (error) {
      state.liveRuntimeProofEvents = [];
      trackError(
        state.operations,
        "live-runtime-proof-ledger",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleToolCall = (event: ToolCallEvent, ctx?: ExtensionContext): void => {
    const cwd = ctx?.cwd || process.cwd();
    if (event.toolName === "self") persistSourceDriftInvalidation();
    const invalidateForPackageMutation = (path: unknown): void => {
      if (
        !hasActiveLiveRuntimeProofRun(state) ||
        !pathMayMutateRuntimePackage(path, cwd, packageRoot)
      ) {
        return;
      }
      try {
        appendLiveRuntimeProofInvalidation(pi, state, packageRoot, {
          source: "pi.tool_call.file_mutation",
          reason: "package file mutation observed after live-runtime proof began",
        });
      } catch (error) {
        state.liveRuntimeProofEvents = [];
        trackError(
          state.operations,
          "live-runtime-proof-ledger",
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    if (isNamedToolCallEvent(event, "write")) {
      const { path, content } = event.input;
      invalidateForPackageMutation(path);
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
      invalidateForPackageMutation(path);
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
        const tier = classifyLiveRuntimeProofCommand(command, cwd, packageRoot);
        if (tier) proofBashByCallId.set(callId, { input: event.input, cwd, tier });
      }
      if (hasRelativeDevNullRedirect(command)) {
        trackError(
          state.operations,
          "bash",
          "Suspicious bash redirection to relative dev/null; use absolute /dev/null to avoid repo artifacts.",
        );
      }
    }

    if (event.toolName === "self" && event.toolCallId) {
      const query = readSelfQueryInput(event.input);
      if (isLiveRuntimeDogfoodProbe(query)) dogfoodSelfCalls.set(event.toolCallId, event.input);
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

  const handleToolExecutionEnd = (event: FinalToolExecutionEvent): void => {
    if (event.toolName === "bash") {
      const proofCommand = proofBashByCallId.get(event.toolCallId);
      proofBashByCallId.delete(event.toolCallId);
      const finalCommand = proofCommand ? readBashCommandInput(proofCommand.input) : null;
      const finalTier =
        proofCommand && finalCommand
          ? classifyLiveRuntimeProofCommand(finalCommand, proofCommand.cwd, packageRoot)
          : undefined;
      if (!event.isError && proofCommand && finalCommand && finalTier === proofCommand.tier) {
        try {
          appendLiveRuntimeProofEvent(pi, state, packageRoot, {
            tier: proofCommand.tier,
            toolCallId: event.toolCallId,
            command: finalCommand,
          });
        } catch (error) {
          trackError(
            state.operations,
            "live-runtime-proof-ledger",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    if (event.toolName === "self") {
      const input = dogfoodSelfCalls.get(event.toolCallId);
      dogfoodSelfCalls.delete(event.toolCallId);
      if (
        !event.isError &&
        isLiveRuntimeDogfoodProbe(readSelfQueryInput(input)) &&
        resultHasTypedDogfoodProbe(event.result)
      ) {
        try {
          appendLiveRuntimeProofEvent(pi, state, packageRoot, {
            tier: "postReloadDogfood",
            toolCallId: event.toolCallId,
          });
        } catch (error) {
          trackError(
            state.operations,
            "live-runtime-proof-ledger",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  };

  const handleTurnStart = (_event: TurnStartEvent): void => {
    incrementTurn(state.operations);
  };

  const handleMessageStart = (event: MessageStartEvent): void => {
    const message = event?.message;
    if (!message || typeof message !== "object" || message.role !== "user") return;
    const content = (message as { content?: unknown }).content;
    const text = typeof content === "string" ? content : extractTextContent(content);
    if (typeof text !== "string") return;
    noteUserMessageArrived(state, text);
  };

  const handleSessionStart = (event: SessionStartEvent, ctx?: ExtensionContext): void => {
    state.evolutionCandidates = [];
    state.suggestionFeedback = [];
    reconstructLiveRuntimeProofEvents(state, readActiveBranch(ctx), packageRoot);
    try {
      if (event.reason === "reload") {
        appendLiveRuntimeProofEvent(pi, state, packageRoot, { tier: "reload" });
      } else {
        appendLiveRuntimeProofInvalidation(pi, state, packageRoot, {
          source: "pi.session_start.non_reload",
          reason: `proof does not carry across session_start reason=${event.reason}`,
        });
      }
    } catch (error) {
      state.liveRuntimeProofEvents = [];
      trackError(
        state.operations,
        "live-runtime-proof-ledger",
        error instanceof Error ? error.message : String(error),
      );
    }
    trackSessionLifecycleEvent(state.operations, {
      type: "session_start",
      reason: event.reason,
      ...(event.previousSessionFile ? { previousSessionFile: event.previousSessionFile } : {}),
    });
  };

  const handleSessionTree = (_event: SessionTreeEvent, ctx?: ExtensionContext): void => {
    state.evolutionCandidates = [];
    state.suggestionFeedback = [];
    reconstructLiveRuntimeProofEvents(state, readActiveBranch(ctx), packageRoot);
    persistSourceDriftInvalidation();
  };

  pi.on("tool_call", handleToolCall);
  pi.on("tool_result", handleToolResult);
  pi.on("tool_execution_end", handleToolExecutionEnd);
  pi.on("turn_start", handleTurnStart);
  pi.on("message_start", handleMessageStart);
  pi.on("session_start", handleSessionStart);
  pi.on("session_tree", handleSessionTree);
}
