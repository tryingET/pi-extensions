// ---
// summary: registers the self-perception tool, delegation runtime, rewind support, and compatibility commands for the autonomy extension.
// read_when:
//   - changing the extension entry point or the self tool's action-delivery policy.
// ---

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
import { collectSessionIntentSnapshot, getContextSessionKey } from "./self/session-context.ts";
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
- self({ query: "cache-aware delegation: tree or fork?" })
- self({ query: "notify operator: I finished the verified slice and need a reload" })

This is a mirror, not a manager. You ask, you receive, you decide.`,
    promptSnippet:
      "Inspect your current execution state, progress, memory, loops, and recent operations.",
    promptGuidelines: [
      "Use self when you need to verify what work has actually happened before planning the next step.",
      "Use self for loop checks, progress checks, file-touch and controller-handoff summaries, cache-aware tree/fork/dispatch routing, self-contained handoff prompt generation, explicit remember/mark-trap directives, diagnostic-review queries, explicit low-risk operator notifications via notify operator/send user message, candidate-only ontology crystallization, and persistent checkpoints/follow-ups before Level-4 handoff or dogfood loops.",
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
      const sessionName = readSessionManagerString(ctx, "getSessionName");
      const sessionFile = readSessionManagerString(ctx, "getSessionFile");
      const context = {
        ...(callerContext ?? {}),
        cwd: ctx.cwd || process.cwd(),
        sessionId: getContextSessionKey(ctx),
        ...(sessionName ? { sessionName } : {}),
        ...(sessionFile ? { sessionFile } : {}),
        modelProvider: typeof ctx.model?.provider === "string" ? ctx.model.provider : undefined,
        modelId: typeof ctx.model?.id === "string" ? ctx.model.id : undefined,
        contextUsage: readContextUsage(ctx),
        sessionIntent: collectSessionIntentSnapshot(ctx, callerContext),
        memoryLoadResult: memoryLifecycle.getLoadResult(),
      };
      const response = resolveQuery({ query: typedParams.query, context }, state);
      const actionData = response.data as
        | { prefill?: unknown; sendUserMessage?: unknown; text?: unknown; dispatchMode?: unknown }
        | undefined;
      const hasActionText = response.intent === "action" && typeof actionData?.text === "string";
      const wantsPrefill = hasActionText && actionData?.prefill === true;
      const canPrefill = ctx.hasUI && typeof ctx.ui?.setEditorText === "function";
      const didPrefill = wantsPrefill && canPrefill;
      const prefillUnavailable = wantsPrefill && !canPrefill;
      const wantsSendUserMessage =
        hasActionText &&
        !wantsPrefill &&
        actionData?.sendUserMessage === true &&
        typeof pi.sendUserMessage === "function";
      const blockedSendUserMessage =
        wantsSendUserMessage && !isAllowedOwnerBridgeSendUserMessage(actionData);
      const didSafetyPrefill = blockedSendUserMessage && canPrefill;
      const didSendUserMessage = wantsSendUserMessage && !blockedSendUserMessage;

      if (didPrefill || didSafetyPrefill) {
        ctx.ui.setEditorText(actionData.text as string);
      }

      if (didSendUserMessage) {
        await pi.sendUserMessage(actionData.text as string, { deliverAs: "followUp" });
      }

      const resultData = shapeActionDeliveryData(response.data, {
        hasActionText,
        wantsPrefill,
        didPrefill,
        prefillUnavailable,
        canPrefill,
        didSendUserMessage,
        blockedSendUserMessage,
        didSafetyPrefill,
      });

      const shouldPersistScopedDomains =
        response.intent === "crystallization" ||
        response.intent === "protection" ||
        response.intent === "action" ||
        responseHasContinuationCandidate(response.data);

      if (shouldPersistScopedDomains) {
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
              formatActionDeliveryText(response.answer, {
                didPrefill,
                prefillUnavailable,
                didSendUserMessage,
                blockedSendUserMessage,
                didSafetyPrefill,
                actionData,
              }) +
              (response.suggestions?.length
                ? `\n\nSuggestions: ${response.suggestions.join("; ")}`
                : ""),
          },
        ],
        details: {
          understood: response.understood,
          intent: response.intent,
          data: resultData,
        },
      };
    },
  };

  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

function readSessionManagerString(
  ctx: unknown,
  method: "getSessionName" | "getSessionFile",
): string | undefined {
  const sessionManager = (ctx as { sessionManager?: unknown } | undefined)?.sessionManager;
  if (!sessionManager || typeof sessionManager !== "object") return undefined;
  const value = (sessionManager as Record<string, unknown>)[method];
  if (typeof value !== "function") return undefined;

  try {
    const result = value.call(sessionManager);
    return typeof result === "string" && result.trim().length > 0 ? result.trim() : undefined;
  } catch {
    return undefined;
  }
}

function readContextUsage(
  ctx: unknown,
): { tokens: number | null; contextWindow: number; percent: number | null } | undefined {
  const getContextUsage = (ctx as { getContextUsage?: unknown } | undefined)?.getContextUsage;
  if (typeof getContextUsage !== "function") return undefined;

  try {
    const value = getContextUsage.call(ctx) as
      | { tokens?: unknown; contextWindow?: unknown; percent?: unknown }
      | undefined;
    if (!value || typeof value.contextWindow !== "number") return undefined;
    return {
      tokens: typeof value.tokens === "number" || value.tokens === null ? value.tokens : null,
      contextWindow: value.contextWindow,
      percent: typeof value.percent === "number" || value.percent === null ? value.percent : null,
    };
  } catch {
    return undefined;
  }
}

function shapeActionDeliveryData(
  data: unknown,
  delivery: {
    hasActionText: boolean;
    wantsPrefill: boolean;
    didPrefill: boolean;
    prefillUnavailable: boolean;
    canPrefill: boolean;
    didSendUserMessage: boolean;
    blockedSendUserMessage: boolean;
    didSafetyPrefill: boolean;
  },
): unknown {
  if (!delivery.hasActionText || typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }

  const source = data as Record<string, unknown>;
  const dispatchMode =
    delivery.prefillUnavailable && source.dispatchMode === "operator_submit_required"
      ? "operator_manual_submit_required"
      : source.dispatchMode;

  return {
    ...source,
    dispatchMode,
    userMessageSent: delivery.didSendUserMessage,
    ...(delivery.blockedSendUserMessage
      ? {
          userMessageBlockedReason: "unapproved_slash_command_send_user_message",
          safetyPrefillPerformed: delivery.didSafetyPrefill,
        }
      : {}),
    ...(delivery.wantsPrefill
      ? {
          requestedDispatchMode: source.dispatchMode,
          prefillAvailable: delivery.canPrefill,
          prefillPerformed: delivery.didPrefill,
          ...(delivery.prefillUnavailable ? { prefillUnavailableReason: "no_ui" } : {}),
        }
      : {}),
  };
}

function formatActionDeliveryText(
  answer: string,
  delivery: {
    didPrefill: boolean;
    prefillUnavailable: boolean;
    didSendUserMessage: boolean;
    blockedSendUserMessage: boolean;
    didSafetyPrefill: boolean;
    actionData:
      | { prefill?: unknown; sendUserMessage?: unknown; text?: unknown; dispatchMode?: unknown }
      | undefined;
  },
): string {
  if (delivery.didPrefill) {
    return answer.replace("Editor prefill suggested", "Editor prefilled");
  }

  if (delivery.prefillUnavailable && typeof delivery.actionData?.text === "string") {
    const preview = formatQuotedPreview(delivery.actionData.text);
    if (delivery.actionData.dispatchMode === "operator_submit_required") {
      return `Editor prefill unavailable (no UI): manual operator submission required. Copy and submit this text through Pi's slash-command parser: ${preview}`;
    }

    return `Editor prefill unavailable (no UI): manual operator review required. Copy/review this text before acting: ${preview}`;
  }

  if (delivery.blockedSendUserMessage && typeof delivery.actionData?.text === "string") {
    const preview = formatQuotedPreview(delivery.actionData.text);
    const prefillText = delivery.didSafetyPrefill
      ? " Editor prefilled for operator review instead."
      : " No UI prefill is available; copy/review manually before acting.";
    return `User-message dispatch blocked by ASC slash-command policy.${prefillText} Text: ${preview}`;
  }

  if (delivery.didSendUserMessage) {
    return answer
      .replace("User-message continuation suggested", "User-message continuation sent")
      .replace("User-message dispatch suggested", "User-message dispatch sent")
      .replace("Owner-bridge launch suggested", "Owner-bridge launch sent")
      .replace("Diagnostic-review continuation suggested", "Diagnostic-review continuation sent");
  }

  return answer;
}

export function isAllowedOwnerBridgeSendUserMessage(actionData: {
  text?: unknown;
  dispatchMode?: unknown;
  ownerBridge?: unknown;
  routeKind?: unknown;
}): boolean {
  if (typeof actionData.text !== "string" || !messageLooksWholeSlashCommand(actionData.text)) {
    return true;
  }

  if (actionData.dispatchMode !== "owner_bridge_send_user_message") {
    return false;
  }

  const text = actionData.text.trim();
  if (
    actionData.ownerBridge === "pi-little-helpers extension-originated /visible-loop bridge" &&
    actionData.routeKind === "visible_loop_self_evolution" &&
    /^\/visible-loop --count 1 --delegate-commit --candidate evolution-[A-Za-z0-9._-]+$/u.test(text)
  ) {
    return true;
  }

  return false;
}

function messageLooksWholeSlashCommand(text: string): boolean {
  const match = text.trim().match(/^\/([A-Za-z][\w-]*)(?=\s|$)/u);
  if (!match) return false;
  const commandName = match[1]?.toLowerCase();
  return Boolean(commandName && !COMMON_ABSOLUTE_PATH_ROOTS.has(commandName));
}

const COMMON_ABSOLUTE_PATH_ROOTS = new Set([
  "bin",
  "dev",
  "etc",
  "home",
  "lib",
  "lib64",
  "media",
  "mnt",
  "opt",
  "proc",
  "root",
  "run",
  "sbin",
  "srv",
  "sys",
  "tmp",
  "usr",
  "var",
  "workspace",
]);

function formatQuotedPreview(text: string): string {
  return `"${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`;
}

function responseHasContinuationCandidate(data: unknown): boolean {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }

  const candidate = (data as Record<string, unknown>).continuationCandidate;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    (candidate as Record<string, unknown>).kind === "self.continuation_candidate.v1"
  );
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
