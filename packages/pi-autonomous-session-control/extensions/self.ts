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
 *   self({ query: "Remember ontology candidate: [missing term]" })
 *   self({ query: "What ontology candidates have I crystallized?" })
 *   self({ query: "I need help with [topic]" })
 *   dispatch_subagent({ profile: "explorer", objective: "Find all test files" })
 *   dispatch_subagent({ profile: "reviewer", objective: "Review my changes" })
 *
 * For prompt A/B testing, use the vault-client extension's prompt_eval tool.
 */

import { basename, dirname, join } from "node:path";
import type { ExtensionAPI, RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { setupEventHandlers } from "./self/event-handlers.ts";
import { createSelfMemoryLifecycle, type SelfMemoryLifecycle } from "./self/memory-lifecycle.ts";
import { trackError } from "./self/perception.ts";
import {
  formatPromptVaultCompatibilityReport,
  getPromptVaultCompatibilitySnapshot,
} from "./self/prompt-vault-compat.ts";
import { resolveQuery } from "./self/query-resolver.ts";
import { registerRewindRuntime } from "./self/rewind/runtime.ts";
import {
  evaluateRuntimeInvariants,
  formatRuntimeInvariantReport,
} from "./self/runtime-invariants.ts";
import { createSelfState } from "./self/state.ts";
import {
  createSubagentState,
  registerSubagentCommands,
  registerSubagentTool,
  type SubagentState,
} from "./self/subagent.ts";
import { registerSubagentDashboard } from "./self/subagent-dashboard.ts";
import {
  DEFAULT_SUBAGENT_MODEL,
  resolveSubagentModel,
  resolveSubagentModelSelection,
} from "./self/subagent-model-selection.ts";
import { resolveSubagentSessionsDir as resolveSubagentSessionsDirPath } from "./self/subagent-session-paths.ts";
import type { SelfState } from "./self/types.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
};

function resolveSubagentSessionsDir(sessionsDir?: string): string {
  return resolveSubagentSessionsDirPath({ explicitDir: sessionsDir }).path;
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

export { DEFAULT_SUBAGENT_MODEL, resolveSubagentModel, resolveSubagentModelSelection };

function registerDelegationRuntime(pi: ExtensionAPI, subagentState: SubagentState): void {
  registerSubagentTool(pi, subagentState, (ctx) => resolveSubagentModelSelection(ctx));

  registerSubagentCommands(pi, subagentState);
  registerSubagentDashboard(pi, subagentState);
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
- self({ query: "Give me a controller handoff summary" })
- self({ query: "Create self-contained handoff prompt" })
- self({ query: "Remember: [pattern discovered]" })
- self({ query: "Remember ontology candidate: [missing term]" })
- self({ query: "What ontology candidates have I crystallized?" })
- self({ query: "I need help with [topic]" })
- self({ query: "Mark as trap: [description]" })
- self({ query: "Dogfood self: what friction just happened?" })
- self({ query: "self-evolution" })
- self({ query: "notify operator: I finished the verified slice and need a reload" })

This is a mirror, not a manager. You ask, you receive, you decide.`,
    promptSnippet:
      "Inspect your current execution state, progress, memory, loops, and recent operations.",
    promptGuidelines: [
      "Use self when you need to verify what work has actually happened before planning the next step.",
      "Use self for loop checks, progress checks, file-touch and controller-handoff summaries, self-contained handoff prompt generation, explicit remember/mark-trap directives, diagnostic-review queries, explicit low-risk operator notifications via notify operator/send user message, candidate-only ontology crystallization, and persistent checkpoints/follow-ups before Level-4 handoff or dogfood loops.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural language question about your own state or a directive to crystallize/protect.",
      }),
      context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await memoryLifecycle.ready;

      const typedParams = params as { query: string; context?: Record<string, unknown> };
      const callerContext =
        typedParams.context &&
        typeof typedParams.context === "object" &&
        !Array.isArray(typedParams.context)
          ? typedParams.context
          : undefined;
      const context = { ...(callerContext ?? {}), cwd: ctx.cwd || process.cwd() };
      const response = resolveQuery({ query: typedParams.query, context }, state);
      const actionData = response.data as
        | { prefill?: unknown; sendUserMessage?: unknown; text?: unknown }
        | undefined;
      const didPrefill =
        response.intent === "action" &&
        actionData?.prefill === true &&
        typeof actionData.text === "string" &&
        ctx.hasUI;
      const didSendUserMessage =
        response.intent === "action" &&
        actionData?.sendUserMessage === true &&
        typeof actionData.text === "string" &&
        typeof pi.sendUserMessage === "function";

      if (didPrefill) {
        ctx.ui.setEditorText(actionData.text as string);
      }

      if (didSendUserMessage) {
        await pi.sendUserMessage(actionData.text as string, { deliverAs: "followUp" });
      }

      if (
        response.intent === "crystallization" ||
        response.intent === "protection" ||
        response.intent === "action"
      ) {
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
              (didPrefill
                ? response.answer.replace("Editor prefill suggested", "Editor prefilled")
                : didSendUserMessage
                  ? response.answer
                      .replace(
                        "User-message continuation suggested",
                        "User-message continuation sent",
                      )
                      .replace("User-message dispatch suggested", "User-message dispatch sent")
                      .replace(
                        "Diagnostic-review continuation suggested",
                        "Diagnostic-review continuation sent",
                      )
                  : response.answer) +
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

  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
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

  // Register rewind runtime
  registerRewindRuntime(pi);

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

    // Register rewind runtime
    registerRewindRuntime(pi);

    // Register delegation runtime
    registerDelegationRuntime(pi, subagentState);

    // Register compatibility commands
    registerCompatibilityCommand(pi, state, subagentState);
  };
}
