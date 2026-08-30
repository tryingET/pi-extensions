// ---
// summary: registers the agent_registry and dispatch_agent tools plus the /agents command for standing-agent manifests.
// read_when:
//   - changing the extension entrypoint, tool schemas, or registry lifecycle wiring.
// ---

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { dispatchAgent, STANDING_AGENT_PHASE0_GATE } from "../src/dispatch.ts";
import { type AgentRegistry, AgentRegistryError, createAgentRegistry } from "../src/registry.ts";

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
      "Use agent_registry for read-only discovery and validation; dispatch_agent is disabled throughout Fleet Phase 0.",
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

  pi.on("tool_result", (event) => {
    if (event.toolName !== "dispatch_agent" || !event.isError) return;
    const text = event.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (!text.includes("standing-agent dispatch is disabled in Fleet Phase 0")) return;
    return {
      details: {
        ...STANDING_AGENT_PHASE0_GATE,
        error: STANDING_AGENT_PHASE0_GATE.code,
      },
      isError: true,
    };
  });

  pi.registerTool({
    name: "dispatch_agent",
    label: "Dispatch Standing Agent (Phase 0 Gate)",
    description: `Standing-agent execution is disabled during Fleet Phase 0.

The read-only registry remains available through agent_registry. AK task 5132 must land and prove an exact-task, immutable-receipt, read-only ASC launch contract before dispatch_agent is enabled. This gate performs no registry resolution, skill materialization, ASC runtime construction, capacity reservation, worktree creation, spawn, evidence write, or authority mutation.`,
    promptSnippet: "Report the Fleet Phase-0 standing-agent dispatch gate.",
    promptGuidelines: [
      "Use agent_registry for read-only discovery and validation.",
      "Do not route a standing agent through fork_peer_spawn, scout_peer_spawn, candidate_peer_spawn, dispatch_subagent, workflow_execute, or loop_execute as a workaround.",
      "Wait for the exact-task read-only dispatch contract owned by AK task 5132.",
    ],
    parameters: Type.Object({
      agent: Type.String({ description: "Registered standing-agent name." }),
      objective: Type.String({
        description: "Requested objective (reported only; no launch occurs in Phase 0).",
        maxLength: 100_000,
      }),
    }),
    execute: () => dispatchAgent(),
  });
}
