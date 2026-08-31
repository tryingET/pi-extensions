// ---
// summary: registers the agent_registry and dispatch_agent tools plus the /agents command for standing-agent manifests.
// read_when:
//   - changing the extension entrypoint, tool schemas, or registry lifecycle wiring.
// ---

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { dispatchAgent } from "../src/dispatch.ts";
import { lintAgentFleet } from "../src/fleet-lint.ts";
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
  role?: string;
  creation_task?: string;
  tools: string[];
  skills: { profile?: string; extra?: string[] };
  defaults: { model: string | null; thinking: string };
  activities: string[];
  manifestPath: string;
}): string {
  const parts = [
    `- ${agent.name}${agent.display_name ? ` (${agent.display_name})` : ""}${agent.version ? ` v${agent.version}` : ""}`,
    `  role: ${agent.role ?? "missing"} | creation_task: ${agent.creation_task ?? "missing"}`,
    `  tools: ${agent.tools.length > 0 ? agent.tools.join(",") : "none (read-only declaration)"}`,
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
- validate: compatibility check for already loaded manifests and resolved metadata.
- lint: aggregate every canonical agent-* repository, including missing/malformed manifests, into one immutable-observation fleet report with stable diagnostics and no execution effects.
- refresh: reload manifests from the configured roots.

Fleet layout: ONE STANDALONE REPO PER AGENT. The canonical fleet home is ~/ai-society/agents/agent-* (conventions: softwareco-agents/docs/agent-registry.md); company/lane agent-* homes are forward-compatible extras. agent.json lives at each agent-repo root; never nested inside product repos. Override discovery with PI_AGENT_REGISTRY_ROOTS (colon-separated patterns).
Engineering-core skill profiles come from PI_AGENT_REGISTRY_EC_PROFILES or ~/ai-society/core/engineering-core/skills/profiles.json.

Fail-closed: unknown skill names, unknown EC profiles, missing files, or schema mismatches surface as resolution errors; use validate to see them without dispatching.`,
    promptSnippet:
      "List, inspect, or immutably lint standing-agent fleet manifests without dispatching.",
    promptGuidelines: [
      "Use agent_registry for read-only discovery, validation, and fleet lint; dispatch_agent executes only the Fleet Phase-2 exact-task read-only contract.",
      "Use agent_registry action=lint for aggregate fleet health, immutable revision, prompt freshness, role/creation-task, profile, collision, provenance, and advisory staleness diagnostics; it never dispatches or runs fleet scripts.",
      "Never treat the advisory scope.repos as a sandbox; it is rendered into the system prompt only.",
    ],
    parameters: Type.Object({
      action: StringEnum(["list", "show", "validate", "lint", "refresh"] as const, {
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

      if (action === "lint") {
        let report: Awaited<ReturnType<typeof lintAgentFleet>>;
        try {
          report = await lintAgentFleet();
        } catch {
          throw new AgentRegistryError(
            "fleet lint failed before a bounded immutable-observation report could be produced",
          );
        }
        const displayed = report.diagnostics.slice(0, 20);
        return textResult(
          [
            `fleet lint ${report.summary.status}: repositories=${report.summary.includedRepositories}/${report.summary.candidateRepositories}, manifests=${report.summary.manifests}, errors=${report.summary.errors}, warnings=${report.summary.warnings}, digest=${report.reportSha256}`,
            `profile source: ${report.profileSource.status} ${report.profileSource.schema} ${report.profileSource.rawSha256}`,
            ...displayed.map(
              (entry) =>
                `- ${entry.severity.toUpperCase()} ${entry.repo} ${entry.code}${entry.path ? ` (${entry.path})` : ""}: ${entry.message}`,
            ),
            ...(report.diagnostics.length > displayed.length
              ? [
                  `- ... ${report.diagnostics.length - displayed.length} additional diagnostic(s) in details`,
                ]
              : []),
            "Observation only: no agent was selected, authorized, dispatched, claimed active, or retired.",
          ].join("\n"),
          report as unknown as Record<string, unknown>,
        );
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
              `role: ${manifest.role ?? "missing"} | creation_task: ${manifest.creation_task ?? "missing"}`,
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
              role: manifest.role,
              creationTask: manifest.creation_task,
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
    label: "Dispatch Standing Agent (Phase 2)",
    description: `Dispatch ONE registered standing agent for ONE exact claimed AK task, read-only, through the ASC-owned execution runtime (Fleet Phase 2).

Contract (every gate fails closed with confirmed_no_effects before any spawn):
- agent: registered agent.json name; declared tools must be a non-empty subset of [read, bash];
- task: exact AK task id that must be claimed with a live lease for this repository;
- objective: bounded read-only objective; the child task contract enforces mutationPolicy=read_only;
- the agent repository must be clean so the dispatch binds an immutable revision (commit + tree + manifest/prompt blob digests);
- one SETTLED dispatch per (agent, exact task) pair: failed attempts stay as immutable receipts, bounded to three;
- the dispatch-origin repository is observed (HEAD + porcelain digest) across the dispatch window; mutation observed → no AK evidence;
- a settled, provably-read-only dispatch publishes one write-once receipt (0o400, canonical sha256) and records one typed AK evidence row (check-type standing-agent-dispatch).

Phase-2 boundaries: standing-agent dispatch is one level deep (children carry PI_PROVENANCE_STANDING_AGENT_DISPATCH); sessions/capacity/spawn machinery stays ASC-owned; visible Ghostty standing agents, lifecycle-v2 permits, and orchestrator fleet integration remain later fleet phases.`,
    promptSnippet:
      "Dispatch one read-only standing agent for one exact claimed AK task with an immutable receipt and AK evidence.",
    promptGuidelines: [
      "Use agent_registry for discovery/validation first; dispatch_agent requires an exact claimed AK task id and a read-only agent.",
      "One dispatch per (agent, exact task): a completed pair is rejected with its receipt digest.",
      "Do not route standing agents through fork_peer_spawn, scout_peer_spawn, candidate_peer_spawn, or loop_execute; those are separate capabilities, not standing-agent routes.",
    ],
    parameters: Type.Object({
      agent: Type.String({ description: "Registered standing-agent name." }),
      task: Type.Integer({
        description: "Exact AK task id that authorizes this one read-only dispatch.",
        minimum: 1,
      }),
      objective: Type.String({
        description:
          "Bounded read-only objective for the dispatched standing agent (wrapped in the Phase-2 read-only task contract).",
        maxLength: 100_000,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const registry = await getRegistry();
      const outcome = await dispatchAgent(
        { agent: params.agent, task: params.task, objective: params.objective },
        { registry },
        {
          cwd: ctx.cwd,
          model: ctx.model,
          thinkingLevel: ctx.thinkingLevel,
          sessionManager: ctx.sessionManager,
        },
        (update) =>
          onUpdate?.({
            content: [{ type: "text" as const, text: update.text }],
            details: update.details as Record<string, unknown>,
          }),
        signal,
      );
      if (outcome.ok) {
        return textResult(
          [
            `standing-agent dispatch settled: ${outcome.receipt.agent.name} for AK task ${outcome.receipt.task.id}`,
            `receipt: ${outcome.receiptPath} (sha256 ${outcome.receipt.receiptSha256})`,
            `asc: dispatchId=${outcome.receipt.dispatch.asc.dispatchId} session=${outcome.receipt.dispatch.asc.sessionName} effect=${outcome.receipt.dispatch.asc.effectDisposition}`,
            `observation: noMutationObserved=${outcome.receipt.observation.noMutationObserved} agentRevision=${outcome.receipt.agent.agentRepo.commit}`,
            ...(outcome.evidenceId !== undefined
              ? [`ak evidence: #${outcome.evidenceId} (check-type standing-agent-dispatch)`]
              : []),
            "--- child output ---",
            outcome.output,
          ].join("\n"),
          {
            ok: true,
            phase: "fleet_phase_2",
            reason: undefined,
            receipt: outcome.receipt as unknown as Record<string, unknown>,
            receiptPath: outcome.receiptPath,
            ...(outcome.evidenceId !== undefined ? { evidenceId: outcome.evidenceId } : {}),
          },
        );
      }
      return {
        content: [{ type: "text" as const, text: outcome.message }],
        details: {
          ok: false,
          phase: "fleet_phase_2",
          reason: outcome.reason,
          effectDisposition: outcome.effectDisposition,
          spawnAttempted: outcome.spawnAttempted,
          ...(outcome.receipt
            ? { receipt: outcome.receipt as unknown as Record<string, unknown> }
            : {}),
          ...(outcome.receiptPath ? { receiptPath: outcome.receiptPath } : {}),
        },
        isError: true,
      };
    },
  });
}
