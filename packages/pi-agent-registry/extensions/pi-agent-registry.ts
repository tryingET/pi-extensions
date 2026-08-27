// ---
// summary: registers the agent_registry and dispatch_agent tools plus the /agents command for standing-agent manifests.
// read_when:
//   - changing the extension entrypoint, tool schemas, or registry lifecycle wiring.
// ---

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createSubagentState,
  type SubagentState,
} from "@tryinget/pi-autonomous-session-control/execution";
import { Type } from "typebox";
import { AgentDispatchError, dispatchAgent } from "../src/dispatch.ts";
import { type AgentRegistry, AgentRegistryError, createAgentRegistry } from "../src/registry.ts";
import { resolveRegistrySubagentSessionsDir } from "../src/sessions-dir.ts";

interface RegistryHandle {
  registry: AgentRegistry;
  loadedAt: string;
  error?: undefined;
}

interface RegistryFailure {
  registry?: undefined;
  loadedAt: string;
  error: string;
}

type RegistryState = RegistryHandle | RegistryFailure;

function textResult(text: string, details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatAgentListing(agent: {
  name: string;
  display_name?: string;
  version?: string;
  tools: string[];
  skills: { profile?: string; extra?: string[] };
  defaults: { model: string | null; thinking: string };
  activities: string[];
  manifestPath: string;
}): string {
  const parts = [
    `- ${agent.name}${agent.display_name ? ` (${agent.display_name})` : ""}${agent.version ? ` v${agent.version}` : ""}`,
    `  tools: ${agent.tools.length > 0 ? agent.tools.join(",") : "read (read-only default)"}`,
    `  skills: ${
      [
        agent.skills.profile ? `profile=${agent.skills.profile}` : undefined,
        agent.skills.extra ? `extra=[${agent.skills.extra.join(", ")}]` : undefined,
      ]
        .filter(Boolean)
        .join(" ") || "none"
    }`,
    `  model: ${agent.defaults.model ?? "inherit"} | thinking: ${agent.defaults.thinking}`,
  ];
  if (agent.activities.length > 0) {
    parts.push(`  activities: ${agent.activities.join(", ")}`);
  }
  parts.push(`  manifest: ${agent.manifestPath}`);
  return parts.join("\n");
}

export default function (pi: ExtensionAPI) {
  const sessionsDir = resolveRegistrySubagentSessionsDir();
  let subagentState: SubagentState | undefined;
  let registryState: RegistryState | undefined;
  let registryPromise: Promise<RegistryState> | undefined;

  const loadRegistry = (): Promise<RegistryState> => {
    registryPromise ??= createAgentRegistry()
      .then((registry): RegistryState => ({ registry, loadedAt: new Date().toISOString() }))
      .catch(
        (error): RegistryState => ({
          loadedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return registryPromise;
  };

  const getRegistry = async (): Promise<AgentRegistry> => {
    if (!registryState) {
      registryState = await loadRegistry();
    }
    const state = registryState;
    if (!state.registry) {
      throw new AgentRegistryError(`agent registry failed to load: ${state.error}`);
    }
    return state.registry;
  };

  const getState = (): SubagentState => {
    subagentState ??= createSubagentState(sessionsDir);
    return subagentState;
  };

  pi.registerCommand("agents", {
    description: "List standing agents registered from agent.json manifests",
    handler: async (_args, ctx) => {
      try {
        const registry = await getRegistry();
        const agents = registry.list();
        const lines =
          agents.length > 0
            ? agents.map(formatAgentListing)
            : ["No agent.json manifests found.", `Roots scanned: ${registry.roots.join(", ")}`];
        if (ctx.hasUI) {
          ctx.ui.notify(`Registered agents (${agents.length}):\n${lines.join("\n")}`, "info");
        } else {
          console.log(`Registered agents (${agents.length}):\n${lines.join("\n")}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
        } else {
          console.error(message);
        }
      }
    },
  });

  pi.registerTool({
    name: "agent_registry",
    label: "Agent Registry",
    description: `Inspect standing agents declared by agent.json manifests (ai-society.agent/1 convention).

Actions:
- list: registered agent names, tool allowlists, skill profiles, defaults, and manifest paths.
- show: one agent's resolved launch metadata (system prompt source, rendered scope, skills, tools, model/thinking).
- validate: re-run fail-closed manifest validation across all discovered manifests and report per-agent results.
- refresh: reload manifests from the configured roots.

Fleet layout: ONE STANDALONE REPO PER AGENT. The canonical fleet home is ~/ai-society/agents/agent-* (conventions: softwareco-agents/docs/agent-registry.md); company/lane agent-* homes are forward-compatible extras. agent.json lives at each agent-repo root; never nested inside product repos. Override discovery with PI_AGENT_REGISTRY_ROOTS (colon-separated patterns).
Engineering-core skill profiles come from PI_AGENT_REGISTRY_EC_PROFILES or ~/ai-society/core/engineering-core/skills/profiles.json.

Fail-closed: unknown skill names, unknown EC profiles, missing files, or schema mismatches surface as resolution errors; use validate to see them without dispatching.`,
    promptSnippet: "List or inspect standing agents declared by agent.json manifests.",
    promptGuidelines: [
      "Use agent_registry action=list before dispatch_agent when unsure which standing agents exist.",
      "Use action=validate to diagnose manifest drift after editing agent.json files; it never dispatches.",
      "Never treat the advisory scope.repos as a sandbox; it is rendered into the system prompt only.",
    ],
    parameters: Type.Object({
      action: StringEnum(["list", "show", "validate", "refresh"] as const, {
        description: "Registry inspection action",
      }),
      agent: Type.Optional(Type.String({ description: "Agent name (required for action=show)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action;
      if (action === "refresh") {
        registryPromise = undefined;
        registryState = undefined;
      }

      const registry = await getRegistry();

      if (action === "list" || action === "refresh") {
        const agents = registry.list();
        const lines =
          agents.length > 0
            ? agents.map(formatAgentListing)
            : [
                "No agent.json manifests found.",
                `Roots scanned: ${registry.roots.join(", ")}`,
                "Set PI_AGENT_REGISTRY_ROOTS (colon-separated agent-repo patterns) to scan other roots.",
              ];
        return textResult(lines.join("\n"), {
          action,
          agents: agents.map((agent) => agent.name),
          roots: registry.roots,
          ecProfilesPath: registry.ec.path,
        });
      }

      if (action === "show") {
        const name = params.agent?.trim();
        if (!name) {
          return textResult("action=show requires an agent name.", {
            action,
            error: "missing_agent",
          });
        }
        const manifest = registry.get(name);
        if (!manifest) {
          return textResult(
            `unknown agent: ${name} (registered: ${[...registry.agents.keys()].sort().join(", ") || "none"})`,
            { action, error: "unknown_agent" },
          );
        }
        const launch = await registry.resolve(name);
        try {
          return textResult(
            [
              `agent: ${launch.name}${manifest.display_name ? ` (${manifest.display_name})` : ""}`,
              `system_prompt_file: ${manifest.system_prompt_file} (${launch.systemPrompt.length} chars composed)`,
              `tools: ${launch.tools}`,
              `thinking: ${launch.thinking} | model: ${launch.model ?? "inherit"}`,
              `extensions: ${launch.extensions.join(", ") || "none"}`,
              `skills: ${launch.loadedSkills.join(", ") || "none"}`,
              `scope.repos: ${launch.scopeRepos.join(", ") || "none"}`,
              `scope.forbidden: ${launch.scopeForbidden.join(", ") || "none"}`,
              `activities: ${launch.activities.join(", ") || "none"}`,
              `manifest: ${manifest.manifestPath}`,
            ].join("\n"),
            {
              action,
              agent: launch.name,
              systemPromptChars: launch.systemPrompt.length,
              tools: launch.tools,
              thinking: launch.thinking,
              model: launch.model,
              extensions: launch.extensions,
              loadedSkills: launch.loadedSkills,
              scopeRepos: launch.scopeRepos,
              scopeForbidden: launch.scopeForbidden,
              activities: launch.activities,
              manifestPath: manifest.manifestPath,
            },
          );
        } finally {
          await launch.cleanup();
        }
      }

      // action === "validate"
      const results: Array<{ agent: string; ok: boolean; error?: string }> = [];
      for (const name of [...registry.agents.keys()].sort()) {
        let launch: Awaited<ReturnType<AgentRegistry["resolve"]>> | undefined;
        try {
          launch = await registry.resolve(name);
          results.push({ agent: name, ok: true });
        } catch (error) {
          results.push({
            agent: name,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          await launch?.cleanup();
        }
      }
      const failed = results.filter((entry) => !entry.ok);
      return textResult(
        [
          `validated ${results.length} agent manifest(s): ${results.length - failed.length} ok, ${failed.length} failed`,
          ...results.map((entry) =>
            entry.ok ? `- ${entry.agent}: ok` : `- ${entry.agent}: FAILED — ${entry.error}`,
          ),
        ].join("\n"),
        { action, results, cwd: ctx.cwd },
      );
    },
  });

  pi.registerTool({
    name: "dispatch_agent",
    label: "Dispatch Standing Agent",
    description: `Dispatch a standing agent declared by an agent.json manifest (ai-society.agent/1).

The registry resolves the agent name into an ASC custom-profile launch: the manifest's system prompt file contents plus rendered advisory scope, least-privilege tool allowlist, thinking/model defaults, child extension allowlist, and materialized skill dirs from its engineering-core skill profile plus extras. Execution, session custody, capacity, effect receipts, and resume stay owned by ASC's dispatch machinery; the result carries the same dispatchId/attemptId semantics as dispatch_subagent.

Use dispatch_agent instead of dispatch_subagent when a named standing agent exists; use dispatch_subagent directly for built-in explorer/reviewer/tester/researcher/minimal profiles.

Fail-closed: unknown agent names, unknown skills/profiles, or missing manifest files reject before spawn. Discover names with agent_registry action=list.`,
    promptSnippet: "Dispatch a registered standing agent through ASC's custom-profile path.",
    promptGuidelines: [
      "Call agent_registry action=list first when the standing agent set is unknown.",
      "Pass mutationPolicy=read_only for read-only agents; manifest scope stays advisory regardless.",
      "The manifest may pin a model; omit the model field to honor it or to inherit the parent session model.",
    ],
    parameters: Type.Object({
      agent: Type.String({ description: "Registered agent name from agent.json" }),
      objective: Type.String({
        description: "Clear objective for the standing agent (maximum 100000 characters)",
        maxLength: 100_000,
      }),
      name: Type.Optional(
        Type.String({ description: "Session name override (default: agent name)" }),
      ),
      deliverable: Type.Optional(
        Type.String({ description: "Expected result shape or artifact." }),
      ),
      acceptanceCriteria: Type.Optional(
        Type.Array(Type.String(), { description: "Observable completion criteria." }),
      ),
      constraints: Type.Optional(
        Type.Array(Type.String(), { description: "Task-specific constraints." }),
      ),
      evidenceRequired: Type.Optional(
        Type.Array(Type.String(), { description: "Evidence the agent should cite." }),
      ),
      mutationPolicy: Type.Optional(
        StringEnum(["read_only", "bounded_mutation"] as const, {
          description: "Declared mutation posture (advisory; tool policy still applies).",
        }),
      ),
      stopConditions: Type.Optional(
        Type.Array(Type.String(), { description: "Conditions that require the agent to stop." }),
      ),
      allowedPaths: Type.Optional(
        Type.Array(Type.String(), {
          description: "Advisory allowed path scope override (default: manifest scope.repos).",
        }),
      ),
      forbiddenPaths: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Advisory forbidden path scope override (default: manifest scope.forbidden).",
        }),
      ),
      thinking: Type.Optional(
        StringEnum(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const, {
          description: "Thinking override (default: manifest defaults.thinking).",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Model override like provider/model-id (default: manifest defaults.model or inherit).",
        }),
      ),
      extensions: Type.Optional(
        Type.Array(Type.String(), {
          description: "Additional child-only extension allowlist entries beyond the manifest.",
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description:
            "Absolute execution deadman in seconds after bootstrap. Omit for the ASC default long emergency deadman.",
        }),
      ),
      startupTimeout: Type.Optional(
        Type.Number({ description: "Bootstrap timeout in seconds (default: 30, maximum: 300)." }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      let outcome: Awaited<ReturnType<typeof dispatchAgent>>;
      try {
        outcome = await dispatchAgent(
          {
            sessionsDir: sessionsDir,
            registry: await getRegistry(),
            state: getState(),
          },
          {
            agent: params.agent,
            objective: params.objective,
            ...(params.name ? { name: params.name } : {}),
            ...(params.deliverable ? { deliverable: params.deliverable } : {}),
            ...(params.acceptanceCriteria ? { acceptanceCriteria: params.acceptanceCriteria } : {}),
            ...(params.constraints ? { constraints: params.constraints } : {}),
            ...(params.evidenceRequired ? { evidenceRequired: params.evidenceRequired } : {}),
            ...(params.mutationPolicy ? { mutationPolicy: params.mutationPolicy } : {}),
            ...(params.stopConditions ? { stopConditions: params.stopConditions } : {}),
            ...(params.allowedPaths ? { allowedPaths: params.allowedPaths } : {}),
            ...(params.forbiddenPaths ? { forbiddenPaths: params.forbiddenPaths } : {}),
            ...(params.thinking ? { thinking: params.thinking } : {}),
            ...(params.model ? { model: params.model } : {}),
            ...(params.extensions ? { extensions: params.extensions } : {}),
            ...(params.timeout !== undefined ? { timeout: params.timeout } : {}),
            ...(params.startupTimeout !== undefined
              ? { startupTimeout: params.startupTimeout }
              : {}),
          },
          { cwd: ctx.cwd || process.cwd() },
          (update) => {
            onUpdate?.({
              content: [{ type: "text", text: update.text }],
              details: update.details as Record<string, unknown>,
            });
          },
          signal ?? undefined,
        );
      } catch (error) {
        if (error instanceof AgentDispatchError) {
          return textResult(error.message, { error: error.reason, agent: params.agent });
        }
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`dispatch_agent failed: ${message}`, {
          error: "dispatch_failed",
          agent: params.agent,
        });
      }

      const { result } = outcome;
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: { ...result.details, agent: params.agent } as Record<string, unknown>,
      };
    },
  });
}
