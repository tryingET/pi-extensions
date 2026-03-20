/** Subagent dispatcher for the `dispatch_subagent` tool. */
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { shapeToolResult } from "./edge-contract-kernel.ts";
import {
  formatInvariantIssues,
  normalizeDispatchParams,
  validateDispatchParams,
  validateSubagentLifecycle,
} from "./subagent-edge-contract.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import { applyPromptEnvelope } from "./subagent-prompt-envelope.ts";
import {
  canSpawnSubagent,
  clearSubagentSessions,
  createSubagentState,
  type SubagentState,
} from "./subagent-session.ts";
import { reserveUniqueSessionName } from "./subagent-session-name.ts";
import {
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  spawnSubagent,
  spawnSubagentWithSpawn,
} from "./subagent-spawn.ts";

export {
  SUBAGENT_PROFILES,
  createSubagentState,
  clearSubagentSessions,
  spawnSubagent,
  spawnSubagentWithSpawn,
};
export type { SubagentState, SubagentDef, SubagentResult, SubagentSpawner };

type CompatToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0] & {
  promptSnippet?: string;
  promptGuidelines?: string[];
};

interface SubagentResultDetails {
  profile?: string;
  objective?: string;
  status?: string;
  elapsed?: number;
  exitCode?: number;
  fullOutput?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied?: boolean;
  prompt_warning?: string;
}

type RenderOptions = { isPartial?: boolean; expanded?: boolean };

export function registerSubagentTool(
  pi: ExtensionAPI,
  state: SubagentState,
  modelProvider: () => string,
  spawner: SubagentSpawner = spawnSubagent,
): void {
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
      const normalizedParams = normalizeDispatchParams(params);
      const {
        profile,
        objective,
        tools,
        systemPrompt,
        name,
        timeout,
        prompt_name,
        prompt_content,
        prompt_tags,
        prompt_source,
      } = normalizedParams;

      const invariants = validateDispatchParams(normalizedParams);

      if (!invariants.ok) {
        return shapeToolResult({
          status: "error",
          text: formatInvariantIssues("Invalid dispatch_subagent input", invariants),
          details: {
            reason: "invariant_failed",
            invariants: invariants.issues,
          },
        });
      }

      const safeObjective = objective as string;
      const profileDef = SUBAGENT_PROFILES[profile];
      if (!profileDef && profile !== "custom") {
        return shapeToolResult({
          status: "error",
          text: `Unknown profile: ${profile}. Available: ${Object.keys(SUBAGENT_PROFILES).join(", ")}, custom`,
          details: { reason: "unknown_profile" },
        });
      }

      if (!canSpawnSubagent(state)) {
        return shapeToolResult({
          status: "error",
          text: `Maximum concurrent subagents reached (${state.maxConcurrent}). Wait for existing subagents to complete.`,
          details: {
            reason: "rate_limited",
            activeCount: state.activeCount,
            maxConcurrent: state.maxConcurrent,
          },
        });
      }

      const baseSystemPrompt = systemPrompt || profileDef?.systemPrompt;
      const promptEnvelope = applyPromptEnvelope(baseSystemPrompt, {
        prompt_name,
        prompt_content,
        prompt_tags,
        prompt_source,
      });

      // Reservation controls:
      // - PI_SUBAGENT_RESERVE_SESSION_NAMES=false disables all reservation mechanisms
      // - PI_SUBAGENT_FILE_LOCK_SESSION_NAMES=false disables only file-lock reservation
      const reservationsEnabled =
        process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES?.trim().toLowerCase() !== "false";
      const useFileLockReservation =
        reservationsEnabled &&
        process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES?.trim().toLowerCase() !== "false";

      const sessionReservation = reserveUniqueSessionName(
        name || profile,
        state.sessionsDir,
        state.reservedSessionNames,
        {
          useInMemoryReservation: reservationsEnabled,
          useFileLockReservation,
        },
      );

      const timeoutMs = typeof timeout === "number" ? timeout * 1000 : undefined;

      const def: SubagentDef = {
        name: sessionReservation.sessionName,
        objective: safeObjective,
        tools: tools || profileDef?.tools || "read,bash",
        systemPrompt: promptEnvelope.systemPrompt,
        sessionFile: join(state.sessionsDir, `${sessionReservation.sessionName}.json`),
        timeout: timeoutMs,
      };

      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: `Dispatching ${profile} subagent...` }],
          details: { profile, objective: safeObjective, status: "spawning" },
        });
      }

      const model = modelProvider();
      let result: SubagentResult;
      try {
        result = await spawner(def, model, ctx, state);
      } catch (error) {
        result = {
          output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
          exitCode: 1,
          elapsed: 0,
          status: "error",
        };
      } finally {
        sessionReservation.release();
      }

      const lifecycleInvariants = validateSubagentLifecycle(state);

      if (!lifecycleInvariants.ok) {
        return shapeToolResult({
          status: "error",
          text: formatInvariantIssues("Subagent lifecycle invariant failed", lifecycleInvariants),
          details: {
            reason: "invariant_failed",
            profile,
            objective: safeObjective,
            invariants: lifecycleInvariants.issues,
          },
        });
      }

      const normalizedOutput =
        result.output.trim().length > 0
          ? result.output
          : result.status === "error"
            ? `Subagent exited with code ${result.exitCode} without output.`
            : result.output;
      const truncated =
        normalizedOutput.length > 8000
          ? `${normalizedOutput.slice(0, 8000)}\n\n... [truncated]`
          : normalizedOutput;

      const icon = result.status === "done" ? "✓" : "✗";
      const summary = `${icon} [${profile}] ${result.status} in ${Math.round(result.elapsed / 1000)}s`;
      const promptWarning = promptEnvelope.prompt_warning
        ? `\nPrompt envelope warning: ${promptEnvelope.prompt_warning}`
        : "";

      return shapeToolResult({
        status: result.status,
        text: `${summary}${promptWarning}\n\n${truncated}`,
        details: {
          profile,
          objective: safeObjective,
          elapsed: result.elapsed,
          exitCode: result.exitCode,
          fullOutput: result.output,
          prompt_name: promptEnvelope.prompt_name,
          prompt_source: promptEnvelope.prompt_source,
          prompt_tags: promptEnvelope.prompt_tags,
          prompt_applied: promptEnvelope.prompt_applied,
          prompt_warning: promptEnvelope.prompt_warning,
        },
      });
    },

    renderCall(args, theme) {
      const a = args as { profile?: string; objective?: string };
      const profile = a.profile || "?";
      const objective = a.objective || "";
      const preview = objective.length > 50 ? `${objective.slice(0, 47)}...` : objective;
      return new Text(
        theme.fg("toolTitle", theme.bold("dispatch_subagent ")) +
          theme.fg("accent", profile) +
          theme.fg("dim", " — ") +
          theme.fg("muted", preview),
        0,
        0,
      );
    },

    renderResult(result, options, theme) {
      const details = result.details as SubagentResultDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const opts = options as RenderOptions;
      if (opts.isPartial || details.status === "spawning") {
        return new Text(
          theme.fg("accent", `● ${details.profile}`) + theme.fg("dim", " working..."),
          0,
          0,
        );
      }

      const icon = details.status === "done" ? "✓" : "✗";
      const color = details.status === "done" ? "success" : "error";
      const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
      const header =
        theme.fg(color, `${icon} ${details.profile}`) + theme.fg("dim", ` ${elapsed}s`);

      if (opts.expanded && details.fullOutput) {
        const output =
          details.fullOutput.length > 4000
            ? `${details.fullOutput.slice(0, 4000)}\n... [truncated]`
            : details.fullOutput;
        return new Text(`${header}\n${theme.fg("muted", output)}`, 0, 0);
      }

      return new Text(header, 0, 0);
    },
  };

  pi.registerTool(tool);
}

export { registerSubagentCommands } from "./subagent-commands.ts";
