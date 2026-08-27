// ---
// summary: "Registers the Society Orchestrator extension commands and tools for cognitive dispatch, workflows, loops, evidence, and autoresearch supervision."
// read_when:
//   - "Changing the extension entrypoint, tool schemas, command adapters, or top-level orchestration wiring."
// ---

/**
 * Society Orchestrator — Cognitive-driven multi-agent orchestration
 *
 * Integrates:
 * - society.db (canonical state, tasks, evidence, ontology)
 * - prompt-vault (30+ cognitive tools)
 * - agent-kernel (Rust CLI for MVCC operations)
 *
 * This is not a manager. This is not a supervisor.
 * This is a cognitive orchestrator that thinks about HOW to think
 * before dispatching agents to act.
 *
 * Usage:
 *   /cognitive                     — List available cognitive tools
 *   /agents-team                   — Select routing scope
 *   /runtime-status                — Inspect runtime truth
 *   /runtime-boundary-telemetry    — Inspect lower-plane boundary telemetry
 *   /ontology <concept>            — Query ontology
 *   /evidence                      — Show recent evidence via ak evidence search
 *   /workflow [objective]          — Seed a workflow_execute call in the editor
 *   /workflows                     — Show workflow wrapper usage and examples
 *   /loops                         — List available loop types
 *   /loop <type> <objective>       — Execute a loop
 *
 * Naming note:
 *   The old loop label `mito` was retired because it conflicted with
 *   Prof. Binner's MITO already used in the workspace. Use `strategic`
 *   for the Mission → Intelligence → Tooling → Operations loop.
 *
 * Tools:
 *   cognitive_dispatch             — Cognitive-first agent dispatch
 *   society_query                  — Bounded read-only diagnostic SQL against society.db
 *   evidence_record                — Record evidence
 *   orchestrator_boundary_telemetry — Inspect lower-plane boundary telemetry
 *   direction_controller_readback  — Read existing AK D2E state and controls without mutation
 *   ontology_context               — Get relevant ontology
 *   autoresearch_live_supervision  — Observe/start/status/stop live pi-autoresearch sessions and start bounded campaigns before attaching supervision
 *   autoresearch_manifest_campaign_supervision — Observe one exact manifest-driven campaign and optionally record bounded AK evidence
 *   autoresearch_self_hosting_supervision — Observe one self-hosting campaign artifact set and optionally record bounded AK evidence
 *   autoresearch_learning_kes_adapter — Plan/materialize package-owned KES candidates from autoresearch.learning.v1 packets
 *   ts_quality_release_workflow    — Coordinate ts-quality local release prep through GitHub Release trusted publishing
 *   loop_execute                   — Execute structured loops
 *   workflow_execute               — Execute chain/parallel workflow compositions
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerAutoresearchAdapterTools } from "../src/extension/autoresearch-adapter-registrations.ts";
import { registerAutoresearchLiveSupervisionTool } from "../src/extension/autoresearch-live-registration.ts";
import {
  registerWorkflowCommands,
  registerWorkflowTool,
} from "../src/extension/workflow-adapter.ts";
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import { autoSelectAgent, resolveAgentForTeam } from "../src/runtime/agent-routing.ts";
import { resolveAkPath } from "../src/runtime/ak.ts";
import { AutoresearchManifestCampaignSupervisor } from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";
import { AutoresearchSelfHostingSupervisor } from "../src/runtime/autoresearch-self-hosting-supervision.ts";
import { AutoresearchLiveSupervisionRunner } from "../src/runtime/autoresearch-supervisor-runner.ts";
import {
  getBoundaryTelemetryStats,
  getLatestBoundaryTelemetryFailure,
  isBoundaryFailure,
  listBoundaryTelemetry,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";
import { getCognitiveToolByName } from "../src/runtime/cognitive-tools.ts";
import { registerDirectionControllerReadbackTool } from "../src/runtime/direction-controller-readback.ts";
import {
  type EvidenceEntry,
  finalizeExecutionEffects,
  recordEvidence,
} from "../src/runtime/evidence.ts";
import { getExecutionIcon } from "../src/runtime/execution-status.ts";
import { createGovernedDeepReviewPreflightRuntime } from "../src/runtime/governed-deep-review-preflight.ts";
import { formatOntologyConcepts, lookupOntologyConcepts } from "../src/runtime/ontology.ts";
import { previewRecentEvidence, runSocietyDiagnosticQuery } from "../src/runtime/society.ts";
import { resolveSocietyDbPath } from "../src/runtime/society-db-path.ts";
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../src/runtime/subagent.ts";
import { getGlobalSessionTeamStore } from "../src/runtime/team-state.ts";
import {
  formatTsQualityReleaseWorkflowResult,
  TsQualityReleaseWorkflowRunner,
} from "../src/runtime/ts-quality-release-workflow.ts";
import { materializeVaultWorkflowBinding } from "../src/runtime/vault-workflow-binding.ts";
import { createWorkflowExecutor } from "../src/runtime/workflow-execution.ts";
import runtimeFooterExtension from "./runtime-footer.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOCIETY_DB = resolveSocietyDbPath();
const DEFAULT_VAULT_DIR = path.join(
  os.homedir(),
  "ai-society",
  "core",
  "prompt-vault",
  "prompt-vault-db",
);
const AGENT_KERNEL = resolveAkPath({ cwd: process.cwd() });
const ORCHESTRATOR_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveVaultDir() {
  return process.env.VAULT_DIR || DEFAULT_VAULT_DIR;
}

// ============================================================================
// RUNTIME ADAPTERS
// ============================================================================

function writeEvidence(entry: EvidenceEntry, signal?: AbortSignal, cwd?: string) {
  return recordEvidence(entry, signal, {
    akPath: AGENT_KERNEL,
    societyDb: SOCIETY_DB,
    cwd,
  });
}

export interface SocietyOrchestratorExtensionOptions {
  autoresearchLiveRunner?: AutoresearchLiveSupervisionRunner;
  manifestCampaignSupervisor?: AutoresearchManifestCampaignSupervisor;
  selfHostingSupervisor?: AutoresearchSelfHostingSupervisor;
  tsQualityReleaseWorkflowRunner?: TsQualityReleaseWorkflowRunner;
  autoresearchLearningKesPackageRoot?: string;
  workflowCognitiveToolLookup?: typeof getCognitiveToolByName;
  workflowExecutorFactory?: typeof createWorkflowExecutor;
  governedDeepReviewPreflight?: {
    requireMaterializationManifest?: boolean;
    dispatchReceiptPath?: string;
  };
}

// ============================================================================
// EXTENSION
// ============================================================================

export default function (pi: ExtensionAPI, options: SocietyOrchestratorExtensionOptions = {}) {
  runtimeFooterExtension(pi);
  registerDirectionControllerReadbackTool(pi);

  const sessionTeams = getGlobalSessionTeamStore();
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "society-orchestrator");

  // Ensure sessions directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const subagentExecutor = createOrchestratorSubagentExecutor({ sessionsDir });
  const autoresearchLiveRunner =
    options.autoresearchLiveRunner ||
    new AutoresearchLiveSupervisionRunner({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const manifestCampaignSupervisor =
    options.manifestCampaignSupervisor ||
    new AutoresearchManifestCampaignSupervisor({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const selfHostingSupervisor =
    options.selfHostingSupervisor ||
    new AutoresearchSelfHostingSupervisor({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const tsQualityReleaseWorkflowRunner =
    options.tsQualityReleaseWorkflowRunner || new TsQualityReleaseWorkflowRunner();
  const autoresearchLearningKesPackageRoot = path.resolve(
    options.autoresearchLearningKesPackageRoot || ORCHESTRATOR_PACKAGE_ROOT,
  );
  const workflowCognitiveToolLookup = options.workflowCognitiveToolLookup || getCognitiveToolByName;
  const workflowExecutorFactory = options.workflowExecutorFactory || createWorkflowExecutor;
  const governedDeepReviewPreflight = createGovernedDeepReviewPreflightRuntime(
    pi,
    options.governedDeepReviewPreflight,
  );

  // ===========================================================================
  // TOOL: society_query
  // ===========================================================================

  registerCompatTool(pi, {
    name: "society_query",
    label: "Society Query",
    description: "Execute a bounded read-only diagnostic SQL query against society.db.",
    promptSnippet: "Run a bounded read-only diagnostic SQL query against society.db.",
    promptGuidelines: [
      "Use society_query for diagnostic reads against society.db instead of inventing schema details.",
      "Keep queries read-only and reasonably scoped so results stay inspectable.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Read-only SQL query to execute" }),
    }),
    async execute(_toolCallId, params, signal) {
      const { query } = params as { query: string };

      const results = await runSocietyDiagnosticQuery<Record<string, unknown>>(
        query,
        {
          akPath: AGENT_KERNEL,
          societyDb: SOCIETY_DB,
        },
        signal,
      );
      if (isBoundaryFailure(results)) {
        return {
          content: [{ type: "text", text: `society_query failed: ${results.error}` }],
          details: {
            ok: false,
            rowCount: 0,
            error: results.error,
            boundedDiagnosticException: true,
          },
        };
      }

      if (results.value.length === 0) {
        return {
          content: [{ type: "text", text: "No results found." }],
          details: {
            ok: true,
            rowCount: 0,
            error: "",
            boundedDiagnosticException: true,
          },
        };
      }

      const output = JSON.stringify(results.value, null, 2);
      const truncated = output.length > 8000 ? `${output.slice(0, 8000)}\n... [truncated]` : output;

      return {
        content: [{ type: "text", text: truncated }],
        details: {
          ok: true,
          rowCount: results.value.length,
          error: "",
          boundedDiagnosticException: true,
        },
      };
    },
    renderCall(args, theme) {
      const query = (args as { query?: string }).query || "";
      const preview = query.length > 50 ? `${query.slice(0, 47)}...` : query;
      return new Text(
        theme.fg("toolTitle", theme.bold("society_query ")) + theme.fg("muted", preview),
        0,
        0,
      );
    },
    renderResult(result, _options, _theme) {
      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text.slice(0, 500) : "", 0, 0);
    },
  });

  // ===========================================================================
  // TOOL: orchestrator_boundary_telemetry
  // ===========================================================================

  registerCompatTool(pi, {
    name: "orchestrator_boundary_telemetry",
    label: "Orchestrator Boundary Telemetry",
    description: `Inspect session-local lower-plane execution telemetry for the orchestrator.

Use when investigating sqlite3, ak, rocs, or other boundary command behavior.
Reports call counts, latency summary, command mix, and recent boundary events captured by the orchestrator runtime.`,
    promptSnippet: "Inspect session-local lower-plane execution telemetry for the orchestrator.",
    promptGuidelines: [
      "Use orchestrator_boundary_telemetry when investigating lower-plane command behavior such as sqlite3, ak, or rocs.",
    ],
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max recent events to include (default: 15)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const requestedLimit = Math.floor(Number((params as { limit?: number }).limit));
      const recentEvents = listBoundaryTelemetry(
        Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 15,
      );
      const stats = getBoundaryTelemetryStats();
      const latestFailure = getLatestBoundaryTelemetryFailure();
      return {
        content: [{ type: "text", text: summarizeBoundaryTelemetry() }],
        details: {
          ...stats,
          latestFailure,
          recentEvents,
        },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("orchestrator_boundary_telemetry")), 0, 0);
    },
    renderResult(result, _options, _theme) {
      const details = (result.details || {}) as { totalCalls?: number; failureCount?: number };
      return new Text(
        `${details.totalCalls ?? 0} calls, ${details.failureCount ?? 0} failures`,
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: cognitive_dispatch
  // ===========================================================================

  registerCompatTool(pi, {
    name: "cognitive_dispatch",
    label: "Cognitive Dispatch",
    description: `Dispatch an agent with cognitive tool injection. The system:
1. Analyzes the context using meta-orchestration
2. Selects the appropriate cognitive tool from the vault
3. Injects that tool as the agent's system prompt
4. Records the decision in the evidence ledger

This is cognitive-first dispatch — think about HOW to think before acting.`,
    promptSnippet:
      "Dispatch an agent with an injected cognitive tool chosen for the current problem.",
    promptGuidelines: [
      "Use cognitive_dispatch when the main risk is choosing the wrong thinking pattern, not just the wrong action.",
      "Provide enough situation context for tool and agent selection to be meaningful.",
    ],
    parameters: Type.Object({
      context: Type.String({ description: "The situation or problem context" }),
      agent: Type.Optional(Type.String({ description: "Agent to use (default: auto-select)" })),
      cognitive_tool: Type.Optional(
        Type.String({ description: "Cognitive tool to inject (default: auto-select)" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { context, agent, cognitive_tool } = params as {
        context: string;
        agent?: string;
        cognitive_tool?: string;
      };

      // Auto-select cognitive tool if not specified
      let toolToUse = cognitive_tool;
      if (!toolToUse) {
        // Simple heuristic based on context keywords
        const ctxLower = context.toLowerCase();
        if (ctxLower.includes("bug") || ctxLower.includes("error") || ctxLower.includes("fail")) {
          toolToUse = "inversion";
        } else if (ctxLower.includes("review") || ctxLower.includes("check")) {
          toolToUse = "audit";
        } else if (ctxLower.includes("stuck") || ctxLower.includes("decide")) {
          toolToUse = "nexus";
        } else if (ctxLower.includes("explore") || ctxLower.includes("understand")) {
          toolToUse = "telescopic";
        } else {
          toolToUse = "first-principles";
        }
      }

      // Get the cognitive tool
      const toolResult = await getCognitiveToolByName(toolToUse, { cwd: ctx.cwd }, signal);
      if (isBoundaryFailure(toolResult)) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to load cognitive tool '${toolToUse}': ${toolResult.error}`,
            },
          ],
          details: { ok: false, error: toolResult.error },
        };
      }

      const tool = toolResult.value;
      if (!tool) {
        return {
          content: [{ type: "text", text: `Cognitive tool not found: ${toolToUse}` }],
          details: { ok: false, error: "tool-not-found" },
        };
      }

      // Validate the selected/requested agent against the active team.
      const requestedAgent = agent || autoSelectAgent(context);
      const activeTeam = sessionTeams.getTeam(ctx);
      const resolution = resolveAgentForTeam(requestedAgent, activeTeam);
      if (!resolution.ok) {
        return {
          content: [{ type: "text", text: resolution.error }],
          details: {
            ok: false,
            error: resolution.error,
            requestedAgent,
            activeTeam: resolution.team,
            allowedAgents: resolution.allowedAgents,
          },
        };
      }
      const agentToUse = resolution.agent;

      const agentDef = AGENT_PROFILES[agentToUse];
      if (!agentDef) {
        return {
          content: [
            {
              type: "text",
              text: `Agent not found: ${agentToUse}. Available: ${Object.keys(AGENT_PROFILES).join(", ")}`,
            },
          ],
          details: { ok: false },
        };
      }

      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : `openrouter/google/gemini-2.5-flash-preview`;
      const runtimeResult = await subagentExecutor.execute({
        agentProfile: agentDef,
        cognitiveToolName: toolToUse,
        cognitiveToolContent: tool.content,
        objective: context,
        model,
        cwd: ctx.cwd,
        contextHeading: "OBJECTIVE",
        contextBody: context,
        sessionName: `${agentToUse}-${toolToUse}`,
        signal,
      });
      const result = toExecutionLike(runtimeResult);

      const executionOutcome = await finalizeExecutionEffects({
        result,
        signal,
        createEvidenceEntry: ({ status, success }) => ({
          check_type: "cognitive:dispatch",
          result: success ? "pass" : "fail",
          details: {
            tool: toolToUse,
            agent: agentToUse,
            context: context.slice(0, 100),
            exitCode: result.exitCode,
            status,
            elapsed: result.elapsed,
          },
        }),
        recordEvidence: (entry, activeSignal) => writeEvidence(entry, activeSignal, ctx.cwd),
      });
      const status = executionOutcome.status;
      const icon = getExecutionIcon(result);
      const evidenceOutcome = executionOutcome.evidence;
      const summary = `${icon} [${agentToUse} + ${toolToUse}] ${status} in ${Math.round(result.elapsed / 1000)}s`;
      const evidenceAkError = "akError" in evidenceOutcome ? evidenceOutcome.akError : undefined;
      const evidenceDiagnostics = [
        evidenceAkError ? `ak error: ${evidenceAkError.slice(0, 120)}` : undefined,
      ].filter(Boolean);
      const evidenceNote = evidenceOutcome.ok
        ? ""
        : `\nEvidence path: ${evidenceOutcome.via}${evidenceDiagnostics.length > 0 ? ` (${evidenceDiagnostics.join("; ")})` : ""}`;

      const truncated =
        result.output.length > 6000
          ? `${result.output.slice(0, 6000)}\n\n... [truncated]`
          : result.output;

      return {
        content: [{ type: "text", text: `${summary}${evidenceNote}\n\n${truncated}` }],
        details: {
          agent: agentToUse,
          cognitiveTool: toolToUse,
          status,
          failureKind: result.failureKind,
          elapsed: result.elapsed,
          fullOutput: result.output,
          evidenceOk: evidenceOutcome.ok,
          evidenceVia: evidenceOutcome.via,
          evidenceAkError: evidenceAkError,
        },
      };
    },
    renderCall(args, theme) {
      const a = args as { context?: string; agent?: string; cognitive_tool?: string };
      const ctx = a.context || "";
      const preview = ctx.length > 40 ? `${ctx.slice(0, 37)}...` : ctx;
      return new Text(
        theme.fg("toolTitle", theme.bold("cognitive_dispatch ")) +
          theme.fg("accent", a.agent || "auto") +
          theme.fg("dim", " + ") +
          theme.fg("accent", a.cognitive_tool || "auto") +
          theme.fg("dim", " — ") +
          theme.fg("muted", preview),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | { agent?: string; cognitiveTool?: string; status?: string; elapsed?: number }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const icon = details.status === "done" ? "✓" : "✗";
      const color = details.status === "done" ? "success" : "error";
      const elapsed = Math.round((details.elapsed || 0) / 1000);
      return new Text(
        theme.fg(color, `${icon} ${details.agent} + ${details.cognitiveTool}`) +
          theme.fg("dim", ` ${elapsed}s`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: evidence_record
  // ===========================================================================

  registerCompatTool(pi, {
    name: "evidence_record",
    label: "Record Evidence",
    description: "Record evidence in the society.db evidence ledger.",
    promptSnippet: "Record a pass/fail/skip evidence entry in the society evidence ledger.",
    promptGuidelines: [
      "Use evidence_record after a meaningful check or execution outcome you want preserved in the ledger.",
    ],
    parameters: Type.Object({
      check_type: Type.String({
        description: "Type of check (e.g., 'validation:test', 'cognitive:inversion')",
      }),
      result: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("skip")]),
      task_id: Type.Optional(Type.Number({ description: "Associated task ID" })),
      details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outcome = await writeEvidence(
        params as EvidenceEntry & { task_id?: number },
        signal,
        ctx?.cwd || process.cwd(),
      );
      const { check_type, result } = params as EvidenceEntry & {
        task_id?: number;
      };

      const failureDiagnostics = [
        outcome.akError ? `ak error: ${outcome.akError.slice(0, 200)}` : undefined,
      ].filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: outcome.ok
              ? `Evidence recorded via ${outcome.via}: ${check_type} = ${result}`
              : `Failed to record evidence via the canonical ak path. ${failureDiagnostics.join("; ") || "unknown failure"}`,
          },
        ],
        details: {
          ok: outcome.ok,
          via: outcome.via,
          akError: outcome.akError,
        },
      };
    },
  });

  // ===========================================================================
  // TOOL: ontology_context
  // ===========================================================================

  registerCompatTool(pi, {
    name: "ontology_context",
    label: "Ontology Context",
    description: "Get relevant ontology concepts for a company or concern.",
    promptSnippet: "Retrieve ontology concepts relevant to a company, concern, or search term.",
    promptGuidelines: [
      "Use ontology_context when you need governed vocabulary or concept grounding before making society-level decisions.",
    ],
    parameters: Type.Object({
      concept: Type.Optional(Type.String({ description: "Specific concept to look up" })),
      search: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_toolCallId, params, signal) {
      const { concept, search } = params as { concept?: string; search?: string };
      const results = await lookupOntologyConcepts({ concept, search }, { signal });
      if (isBoundaryFailure(results)) {
        return {
          content: [{ type: "text", text: `ontology_context failed: ${results.error}` }],
          details: { ok: false, count: 0, error: results.error },
        };
      }

      if (results.value.length === 0) {
        return {
          content: [{ type: "text", text: "No ontology concepts found." }],
          details: { ok: true, count: 0, error: "" },
        };
      }

      return {
        content: [{ type: "text", text: formatOntologyConcepts(results.value) }],
        details: { ok: true, count: results.value.length, error: "" },
      };
    },
  });

  // ===========================================================================
  // TOOL: ts_quality_release_workflow
  // ===========================================================================

  registerCompatTool(pi, {
    name: "ts_quality_release_workflow",
    label: "ts-quality Release Workflow",
    description:
      "Coordinate the ts-quality local release-prep workflow that culminates in GitHub Release-triggered npm Trusted Publishing/OIDC.",
    promptSnippet:
      "Coordinate ts-quality release planning, preparation, tagging, GitHub Release creation, and public verification without local npm publish.",
    promptGuidelines: [
      "Use ts_quality_release_workflow when releasing ts-quality through the Pi Society orchestrator boundary.",
      "Use action=plan first; use apply=true only for local file/git mutations the operator requested.",
      "Use externalMutationApproved=true for push or create_github_release only when the operator explicitly approves public external mutations.",
      "Do not run local npm publish; GitHub Release publication triggers npm Trusted Publishing/OIDC.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("plan"),
          Type.Literal("prepare"),
          Type.Literal("commit_tag"),
          Type.Literal("push"),
          Type.Literal("create_github_release"),
          Type.Literal("verify_public"),
        ]),
      ),
      cwd: Type.Optional(
        Type.String({
          description: "ts-quality repo root. Defaults to the canonical owned repo path.",
        }),
      ),
      version: Type.String({
        description: "Release version without leading v, for example 0.1.1.",
      }),
      apply: Type.Optional(
        Type.Boolean({
          description: "Apply local mutations for prepare/commit_tag/push/create_github_release.",
        }),
      ),
      externalMutationApproved: Type.Optional(
        Type.Boolean({
          description:
            "Required for public external mutations such as git push or GitHub Release creation.",
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({ description: "Optional per-command timeout in milliseconds." }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await tsQualityReleaseWorkflowRunner.run(
        params as {
          action?:
            | "plan"
            | "prepare"
            | "commit_tag"
            | "push"
            | "create_github_release"
            | "verify_public";
          cwd?: string;
          version: string;
          apply?: boolean;
          externalMutationApproved?: boolean;
          timeoutMs?: number;
        },
        signal,
      );
      return {
        content: [{ type: "text", text: formatTsQualityReleaseWorkflowResult(result) }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const typed = args as { action?: string; version?: string; apply?: boolean };
      return new Text(
        theme.fg("toolTitle", theme.bold("ts_quality_release_workflow ")) +
          theme.fg(
            "muted",
            `${typed.action || "plan"} ${typed.version || ""}${typed.apply ? " apply" : ""}`,
          ),
        0,
        0,
      );
    },
    renderResult(result, _options, _theme) {
      const details = (result.details || {}) as {
        ok?: boolean;
        action?: string;
        nextStep?: string;
      };
      return new Text(
        `${details.ok ? "ok" : "failed"} ${details.action || "release"}: ${details.nextStep || "inspect result"}`.slice(
          0,
          500,
        ),
        0,
        0,
      );
    },
  });

  registerAutoresearchLiveSupervisionTool(pi, autoresearchLiveRunner);

  registerAutoresearchAdapterTools(pi, {
    manifestCampaignSupervisor,
    selfHostingSupervisor,
    autoresearchLearningKesPackageRoot,
  });

  // ===========================================================================
  // COMMANDS
  // ===========================================================================

  pi.registerCommand("evidence", {
    description: "Show recent evidence via ak evidence search",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const results = await previewRecentEvidence(
        {
          akPath: AGENT_KERNEL,
          societyDb: SOCIETY_DB,
          cwd: ctx.cwd,
        },
        undefined,
        20,
      );
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query evidence: ${results.error}`, "error");
        return;
      }

      if (results.value.entryCount === 0) {
        ctx.ui.notify("No evidence recorded yet.", "info");
        return;
      }

      const suffix = results.value.truncated
        ? `\n\n… showing latest 20 of ${results.value.entryCount} evidence rows from ak evidence search.`
        : "";
      await ctx.ui.editor("Evidence Ledger", `${results.value.text}${suffix}`);
    },
  });

  registerWorkflowCommands(pi);

  pi.registerCommand("ontology", {
    description: "Search ontology concepts",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const search = args?.trim();
      if (!search) {
        ctx.ui.notify("Usage: /ontology <search>", "warning");
        return;
      }

      const results = await lookupOntologyConcepts({ search, limit: 10 });
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query ontology: ${results.error}`, "error");
        return;
      }

      if (results.value.length === 0) {
        ctx.ui.notify(`No concepts found for: ${search}`, "warning");
        return;
      }

      await ctx.ui.editor("Ontology", formatOntologyConcepts(results.value));
    },
  });

  registerWorkflowTool(pi, {
    sessionTeams,
    workflowCognitiveToolLookup,
    workflowExecutorFactory,
  });

  // ===========================================================================
  // LOOP ENGINE REGISTRATION
  // ===========================================================================

  // Register loop tools and exact Prompt Vault workflow bindings.
  registerLoopTools(
    pi,
    undefined,
    resolveVaultDir(),
    (agent, ctx) => resolveAgentForTeam(agent, sessionTeams.getTeam(ctx)),
    {
      governedDeepReviewPreflight,
      dispatchReceiptPath: options.governedDeepReviewPreflight?.dispatchReceiptPath,
      async executeVaultWorkflow(request) {
        const materialized = materializeVaultWorkflowBinding(
          request.templateName,
          request.executionArgs,
          request.objective,
        );
        if (!materialized.ok) {
          return {
            accepted: false,
            handoffId: request.handoffId,
            status: "error",
            details: { error: materialized.error },
          };
        }

        const workflowExecutor = workflowExecutorFactory({
          sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "workflows"),
        });
        const model = request.ctx.model
          ? `${request.ctx.model.provider}/${request.ctx.model.id}`
          : "openrouter/google/gemini-2.5-flash-preview";

        try {
          const result = await workflowExecutor.execute({
            request: materialized.request,
            activeTeam: sessionTeams.getTeam(request.ctx),
            model,
            cwd: request.cwd,
            cognitiveToolContent: request.sealedText,
            cognitiveToolName: request.templateName,
            contextHeading: "GOVERNED PROMPT VAULT WORKFLOW",
            contextBody: `Vault handoff: ${request.handoffId}\nAuthorization: ${request.authorizationId}`,
            promptName: request.templateName,
            promptContent: request.sealedText,
            promptTags: ["prompt-vault", "governed-workflow", materialized.workflowId],
            promptSource: "prompt-vault",
            effectCorrelationId: request.handoffId,
            signal: request.signal,
          });
          return {
            accepted: result.status === "done",
            handoffId: request.handoffId,
            runId: result.runId,
            status: result.status,
            output: result.aggregatedOutput,
            details: {
              workflowId: materialized.workflowId,
              stepCount: result.steps.length,
              stepStatuses: result.steps.map((step) => step.status),
            },
          };
        } catch (error) {
          return {
            accepted: false,
            handoffId: request.handoffId,
            status: "error",
            details: { error: error instanceof Error ? error.message : String(error) },
          };
        }
      },
    },
  );

  // Register loop commands (/loop, /loops)
  registerLoopCommands(pi);

  // Runtime footer/status surfaces live in extensions/runtime-footer.ts.
}
