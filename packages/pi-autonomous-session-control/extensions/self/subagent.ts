/** Subagent dispatcher for the `dispatch_subagent` tool. */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { shapeToolResult } from "./edge-contract-kernel.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import {
  type AscExecutionRuntime,
  createAscExecutionRuntime,
  type DispatchSubagentProfile,
  type DispatchSubagentRequest,
  type SubagentModelContext,
} from "./subagent-runtime.ts";
import {
  clearSubagentSessions,
  createSubagentState,
  type SubagentState,
} from "./subagent-session.ts";
import {
  type AssistantStopReason,
  type ExecutionState,
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  spawnSubagent,
  spawnSubagentWithSpawn,
} from "./subagent-spawn.ts";

export {
  SUBAGENT_PROFILES,
  createAscExecutionRuntime,
  createSubagentState,
  clearSubagentSessions,
  spawnSubagent,
  spawnSubagentWithSpawn,
};
export type {
  AscExecutionRuntime,
  AssistantStopReason,
  DispatchSubagentProfile,
  DispatchSubagentRequest,
  ExecutionState,
  SubagentDef,
  SubagentModelContext,
  SubagentResult,
  SubagentSpawner,
  SubagentState,
};

type CompatToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0] & {
  promptSnippet?: string;
  promptGuidelines?: string[];
};

export function registerDispatchSubagentTool(pi: ExtensionAPI, runtime: AscExecutionRuntime): void {
  const tool: CompatToolDefinition = {
    name: "dispatch_subagent",
    label: "Dispatch Subagent",
    description: `Spawn a specialized subagent to work on a specific objective. Subagents run in parallel and return their results.

Profiles:
- explorer: Broad investigation, pattern discovery (tools: read, bash)
- reviewer: Code evaluation, critique (tools: read, bash)
- tester: Verification, validation (tools: read, bash)
- researcher: Documentation, examples, patterns (tools: read, bash)
- minimal: Just read and bash with minimal prompt

Use for:
- Parallel exploration of different approaches
- Self-review of your own work
- Background research while you continue
- Testing hypotheses before committing

Subagents maintain session state - you can dispatch follow-up tasks to continue work.

Prompt envelope (optional):
- prompt_name / prompt_content / prompt_tags / prompt_source
- If prompt_content is provided, it is prepended deterministically to the effective system prompt.
- Provenance is returned in details as prompt_name, prompt_source, prompt_tags, prompt_applied.`,
    promptSnippet:
      "Spawn a focused subagent for parallel investigation, review, testing, or research.",
    promptGuidelines: [
      "Use dispatch_subagent when parallel work will reduce risk or latency versus doing the investigation yourself inline.",
      "Pick the narrowest profile and objective that will produce a useful intermediate result you can inspect before proceeding.",
    ],
    parameters: Type.Object({
      profile: Type.Union(
        [
          Type.Literal("explorer"),
          Type.Literal("reviewer"),
          Type.Literal("tester"),
          Type.Literal("researcher"),
          Type.Literal("minimal"),
          Type.Literal("custom"),
        ],
        { description: "Predefined profile or 'custom'" },
      ),
      objective: Type.String({ description: "Clear objective for the subagent" }),
      tools: Type.Optional(
        Type.String({ description: "Comma-separated tools (default: from profile)" }),
      ),
      systemPrompt: Type.Optional(
        Type.String({ description: "Custom system prompt (for custom profile)" }),
      ),
      name: Type.Optional(
        Type.String({ description: "Session name for resumption (default: profile name)" }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in seconds (default: 300, 0 = no timeout)" }),
      ),
      prompt_name: Type.Optional(
        Type.String({ description: "Prompt identifier used for provenance (e.g. template name)" }),
      ),
      prompt_content: Type.Optional(
        Type.String({ description: "Prompt content to inject into subagent system prompt" }),
      ),
      prompt_tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional prompt tags for provenance (e.g. ['phase:sensemaking'])",
        }),
      ),
      prompt_source: Type.Optional(
        Type.String({
          description: "Prompt source label for provenance (default: vault-client)",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const result = await runtime.execute(
        params as DispatchSubagentRequest,
        ctx,
        onUpdate
          ? (update) => {
              onUpdate({
                content: [{ type: "text", text: update.text }],
                details: update.details,
              });
            }
          : undefined,
        _signal ?? undefined,
      );

      return shapeToolResult({
        status: result.details.status ?? (result.ok ? "done" : "error"),
        text: result.text,
        details: result.details as Record<string, unknown>,
      });
    },
  };

  pi.registerTool(tool);
}

export function registerSubagentTool(
  pi: ExtensionAPI,
  state: SubagentState,
  modelProvider: (ctx?: SubagentModelContext) => string,
  spawner: SubagentSpawner = spawnSubagent,
): void {
  registerDispatchSubagentTool(
    pi,
    createAscExecutionRuntime({
      sessionsDir: state.sessionsDir,
      state,
      modelProvider,
      spawner,
    }),
  );
}

export { registerSubagentCommands } from "./subagent-commands.ts";
