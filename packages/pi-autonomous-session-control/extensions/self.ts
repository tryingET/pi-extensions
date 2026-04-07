/**
 * Transcendent Autonomy Extension
 *
 * The self tool: A mirror the LLM queries to perceive itself.
 * The dispatch_subagent tool: Spawn specialized subagents for parallel work.
 *
 * This is not a manager. This is not a supervisor.
 * This is a mirror. The LLM asks questions about itself and receives answers.
 * This is also a delegator. The LLM spawns subagents and receives results.
 *
 * Usage:
 *   self({ query: "What files have I touched?" })
 *   self({ query: "Am I in a loop?" })
 *   self({ query: "Remember: [pattern I discovered]" })
 *   self({ query: "I need help with [topic]" })
 *   dispatch_subagent({ profile: "explorer", objective: "Find all test files" })
 *   dispatch_subagent({ profile: "reviewer", objective: "Review my changes" })
 *
 * For prompt A/B testing, use the vault-client extension's prompt_eval tool.
 */

import { basename, dirname, join } from "node:path";
import type {
  ExtensionAPI,
  RegisteredCommand,
  ToolCallEvent,
  ToolResultEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createSelfMemoryLifecycle, type SelfMemoryLifecycle } from "./self/memory-lifecycle.ts";
import { incrementTurn, trackCommand, trackError, trackFileOp } from "./self/perception.ts";
import {
  formatPromptVaultCompatibilityReport,
  getPromptVaultCompatibilitySnapshot,
} from "./self/prompt-vault-compat.ts";
import { resolveQuery } from "./self/query-resolver.ts";
import {
  evaluateRuntimeInvariants,
  formatRuntimeInvariantReport,
} from "./self/runtime-invariants.ts";
import { createSelfState } from "./self/state.ts";
import {
  clearSubagentSessions,
  createSubagentState,
  registerSubagentCommands,
  registerSubagentTool,
  type SubagentState,
} from "./self/subagent.ts";
import { registerSubagentDashboard } from "./self/subagent-dashboard.ts";
import type { SelfState } from "./self/types.ts";

type CompatToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0] & {
  promptSnippet?: string;
  promptGuidelines?: string[];
};

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

// ============================================================================
// EXTENSION SESSION STATE HELPERS
// ============================================================================

function resolveSubagentSessionsDir(sessionsDir?: string): string {
  if (sessionsDir?.trim()) {
    return sessionsDir;
  }

  const fromEnv = process.env.PI_SUBAGENT_SESSIONS_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return join(process.cwd(), ".pi-subagent-sessions");
}

function resolveSelfMemoryPath(sessionsDir: string): string {
  const fromEnv = process.env.PI_SELF_MEMORY_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const sessionsBase = basename(sessionsDir);
  const safeBase = sessionsBase.length > 0 ? sessionsBase : "pi-subagent-sessions";
  return join(dirname(sessionsDir), `${safeBase}.self-memory.json`);
}

export const DEFAULT_SUBAGENT_MODEL = "openai-codex/gpt-5.4";

export function resolveSubagentModel(ctx?: {
  model?: {
    provider?: unknown;
    id?: unknown;
  };
}): string {
  const fromEnv = process.env.PI_SUBAGENT_MODEL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const provider = typeof ctx?.model?.provider === "string" ? ctx.model.provider.trim() : "";
  const modelId = typeof ctx?.model?.id === "string" ? ctx.model.id.trim() : "";
  if (provider.length > 0 && modelId.length > 0) {
    return `${provider}/${modelId}`;
  }

  return DEFAULT_SUBAGENT_MODEL;
}

function registerDelegationRuntime(pi: ExtensionAPI, subagentState: SubagentState): void {
  registerSubagentTool(pi, subagentState, (ctx) => resolveSubagentModel(ctx));

  registerSubagentCommands(pi, subagentState);
  registerSubagentDashboard(pi, subagentState);

  const clearOnSessionStart =
    process.env.PI_SUBAGENT_CLEAR_ON_SESSION_START?.trim().toLowerCase() === "true";
  if (clearOnSessionStart) {
    pi.on("session_start", async () => {
      clearSubagentSessions(subagentState);
    });
  }
}

// ============================================================================
// EVENT HANDLERS (Track operations for perception)
// ============================================================================

function setupEventHandlers(pi: ExtensionAPI, state: SelfState): void {
  const bashCommandByCallId = new Map<string, string>();

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
      const { command } = event.input;
      const callId = event.toolCallId;
      if (typeof command === "string" && callId) {
        bashCommandByCallId.set(callId, command);
      }
    }
  };

  const handleToolResult = (event: ToolResultEvent): void => {
    const toolName = event.toolName;
    const success = !event.isError;

    if (toolName === "bash") {
      const command = bashCommandByCallId.get(event.toolCallId) || "unknown";
      bashCommandByCallId.delete(event.toolCallId);
      trackCommand(state.operations, command, success);
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

// ============================================================================
// SELF TOOL REGISTRATION
// ============================================================================

function registerSelfTool(
  pi: ExtensionAPI,
  state: SelfState,
  memoryLifecycle: SelfMemoryLifecycle,
): void {
  const tool: CompatToolDefinition = {
    name: "self",
    label: "Self-Perception Mirror",
    description: `Query your own operational state. Ask questions about what you've done, what patterns you're in, and what you've learned.

Examples:
- self({ query: "What files have I touched?" })
- self({ query: "Am I in a loop?" })
- self({ query: "What progress have I made?" })
- self({ query: "Remember: [pattern discovered]" })
- self({ query: "I need help with [topic]" })
- self({ query: "Mark as trap: [description]" })

This is a mirror, not a manager. You ask, you receive, you decide.`,
    promptSnippet:
      "Inspect your current execution state, progress, memory, loops, and recent operations.",
    promptGuidelines: [
      "Use self when you need to verify what work has actually happened before planning the next step.",
      "Use self for loop checks, progress checks, file-touch summaries, and explicit remember/mark-trap directives.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural language question about your own state or a directive to crystallize/protect.",
      }),
      context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      await memoryLifecycle.ready;

      const typedParams = params as { query: string; context?: Record<string, unknown> };
      const context =
        typedParams.context &&
        typeof typedParams.context === "object" &&
        !Array.isArray(typedParams.context)
          ? typedParams.context
          : undefined;
      const response = resolveQuery({ query: typedParams.query, context }, state);

      if (response.intent === "crystallization" || response.intent === "protection") {
        try {
          await memoryLifecycle.persistScopedDomains();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          trackError(state.operations, "self-memory", message);
        }
      }

      return {
        content: [
          {
            type: "text",
            text:
              response.answer +
              (response.suggestions?.length
                ? `\n\nSuggestions: ${response.suggestions.join("; ")}`
                : ""),
          },
        ],
        details: {
          understood: response.understood,
          intent: response.intent,
          data: response.data,
        },
      };
    },
  };

  pi.registerTool(tool);
}

// ============================================================================
// COMPATIBILITY COMMAND (for gradual migration)
// ============================================================================

function registerCommandWithTextResult(
  pi: ExtensionAPI,
  name: string,
  options: {
    description: string;
    handler: (args: string, ctx: Parameters<RegisteredCommand["handler"]>[1]) => Promise<string>;
  },
): void {
  pi.registerCommand(name, options as unknown as Omit<RegisteredCommand, "name">);
}

function registerCompatibilityCommand(
  pi: ExtensionAPI,
  state: SelfState,
  subagentState: SubagentState,
): void {
  registerCommandWithTextResult(pi, "self-status", {
    description: "Get a summary of your current session state",
    handler: async (_args, ctx) => {
      const response = resolveQuery({ query: "session summary" }, state);
      const invariants = evaluateRuntimeInvariants({
        operations: state.operations,
        subagent: subagentState,
      });

      const statusLine =
        invariants.issues.length > 0
          ? `Invariants: ${invariants.issues.length} issue(s)`
          : `Invariants: OK (${invariants.checked} checks)`;
      const text = `${response.answer} | ${statusLine}`;

      if (ctx.hasUI) {
        const level = invariants.issues.length > 0 ? "warning" : "info";
        ctx.ui.notify(text, level);
      }

      return text;
    },
  });

  registerCommandWithTextResult(pi, "self-loop-check", {
    description: "Check if you're in a behavioral loop",
    handler: async (_args, ctx) => {
      const response = resolveQuery({ query: "am I looping?" }, state);

      if (ctx.hasUI) {
        const data = (response.data ?? {}) as { isLooping?: boolean };
        const level = data.isLooping ? "warning" : "info";
        ctx.ui.notify(response.answer, level);
      }

      return response.answer;
    },
  });

  registerCommandWithTextResult(pi, "self-progress", {
    description: "Check your progress status",
    handler: async (_args, ctx) => {
      const response = resolveQuery({ query: "what progress have I made?" }, state);

      if (ctx.hasUI) {
        const data = (response.data ?? {}) as { isStalled?: boolean };
        const level = data.isStalled ? "warning" : "info";
        ctx.ui.notify(response.answer, level);
      }

      return response.answer;
    },
  });

  registerCommandWithTextResult(pi, "self-runtime-invariants", {
    description: "Check runtime invariants for self and subagent state",
    handler: async (_args, ctx) => {
      const report = evaluateRuntimeInvariants({
        operations: state.operations,
        subagent: subagentState,
      });
      const formatted = formatRuntimeInvariantReport(report);

      if (ctx.hasUI) {
        const level = report.issues.length > 0 ? "warning" : "info";
        ctx.ui.notify(
          `Runtime invariants: ${report.issues.length > 0 ? `${report.issues.length} issue(s)` : "OK"}`,
          level,
        );
      }

      return formatted;
    },
  });

  registerCommandWithTextResult(pi, "self-prompt-vault-compat", {
    description: "Check runtime compatibility for autonomy × vault-client × prompt-vault schema",
    handler: async (_args, ctx) => {
      const snapshot = getPromptVaultCompatibilitySnapshot();
      const report = formatPromptVaultCompatibilityReport(snapshot);

      if (ctx.hasUI) {
        const level =
          snapshot.status === "supported"
            ? "info"
            : snapshot.status === "limited"
              ? "warning"
              : "error";
        ctx.ui.notify(`Prompt-vault compatibility: ${snapshot.status}`, level);
      }

      return report;
    },
  });
}

// ============================================================================
// EXTENSION ENTRY POINT
// ============================================================================

export default function (pi: ExtensionAPI) {
  const state = createSelfState();
  const sessionsDir = resolveSubagentSessionsDir();
  const subagentState = createSubagentState(sessionsDir);
  const memoryLifecycle = createSelfMemoryLifecycle(state, resolveSelfMemoryPath(sessionsDir));

  // Setup event handlers to track operations
  setupEventHandlers(pi, state);

  // Register the self tool
  registerSelfTool(pi, state, memoryLifecycle);

  // Register delegation runtime
  registerDelegationRuntime(pi, subagentState);

  // Register compatibility commands for gradual migration
  registerCompatibilityCommand(pi, state, subagentState);
}

/**
 * Extended entry point with subagent support.
 * Use this when you want the full autonomy stack including delegation.
 */
export function createExtension(sessionsDir: string) {
  return (pi: ExtensionAPI) => {
    const state = createSelfState();
    const resolvedSessionsDir = resolveSubagentSessionsDir(sessionsDir);
    const subagentState = createSubagentState(resolvedSessionsDir);
    const memoryLifecycle = createSelfMemoryLifecycle(
      state,
      resolveSelfMemoryPath(resolvedSessionsDir),
    );

    // Setup event handlers to track operations
    setupEventHandlers(pi, state);

    // Register the self tool (introspection)
    registerSelfTool(pi, state, memoryLifecycle);

    // Register delegation runtime
    registerDelegationRuntime(pi, subagentState);

    // Register compatibility commands
    registerCompatibilityCommand(pi, state, subagentState);
  };
}
