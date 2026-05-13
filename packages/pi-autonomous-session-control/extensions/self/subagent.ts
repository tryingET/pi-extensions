/** Subagent dispatcher for the `dispatch_subagent` tool. */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { shapeToolResult } from "./edge-contract-kernel.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import {
  type AscExecutionRuntime,
  createAscExecutionRuntime,
  type DispatchSubagentProfile,
  type DispatchSubagentRequest,
  type SubagentModelContext,
  type SubagentModelProviderResult,
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

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
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
- Provenance is returned in details as prompt_name, prompt_source, prompt_tags, prompt_applied.

Child extension bootstrap (optional):
- extensions: explicit child-only extension allowlist loaded via --no-extensions + repeated --extension flags
- use this when the subagent needs extension-provided providers/tools such as pi-multi-pass or vault-client without inheriting the full parent extension surface.

Request env policy (optional):
- env only accepts PI_PROVENANCE_* keys for per-dispatch provenance sidecars.
- PATH, NODE_OPTIONS, PI_CODING_AGENT_DIR, and any non-PI_PROVENANCE_* key fail before spawn.

Child skill profile bootstrap (optional):
- skillProfile resolves a named, allowlisted skill-library profile and starts the child with --no-skills + a materialized --skill directory.
- noSkills disables ordinary child skill discovery when no profile is needed.
- raw skills[] paths are currently rejected fail-closed; use named profiles.`,
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
      extensions: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional child-only extension allowlist (for example ['pi-multi-pass', 'vault-client', '/abs/path/to/ext.ts'])",
        }),
      ),
      env: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description:
            "Optional per-dispatch child env overlay. Only PI_PROVENANCE_* keys are accepted; control env such as PATH, NODE_OPTIONS, and PI_CODING_AGENT_DIR is rejected before spawn.",
        }),
      ),
      skillProfile: Type.Optional(
        Type.String({
          description:
            "Optional named child skill profile (for example 'minimal', 'ak', 'governance', or 'dspx-skill-authoring'). Resolved through an allowlisted registry before spawn.",
        }),
      ),
      noSkills: Type.Optional(
        Type.Boolean({
          description:
            "When true, starts the child with --no-skills. skillProfile implies this and adds a materialized --skill directory.",
        }),
      ),
      skills: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Reserved for future allowlisted explicit skill selection. Raw skill paths are currently rejected fail-closed; use skillProfile.",
        }),
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

  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

export function registerSubagentTool(
  pi: ExtensionAPI,
  state: SubagentState,
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult,
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
