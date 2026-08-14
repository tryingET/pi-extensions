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
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import { autoSelectAgent, resolveAgentForTeam } from "../src/runtime/agent-routing.ts";
import { resolveAkPath } from "../src/runtime/ak.ts";
import {
  type AutoresearchLearningKesAdapterAction,
  buildAutoresearchLearningKesAdapterResult,
  loadAutoresearchLearningPacketWithSource,
} from "../src/runtime/autoresearch-learning-kes-adapter.ts";
import { AutoresearchManifestCampaignSupervisor } from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";
import type {
  AutoresearchLearningKesAdapterToolDetails,
  AutoresearchLiveSupervisionAction,
  AutoresearchLiveSupervisionToolDetails,
  AutoresearchManifestCampaignSupervisionAction,
  AutoresearchManifestCampaignSupervisionToolDetails,
  AutoresearchSelfHostingSupervisionToolDetails,
} from "../src/runtime/autoresearch-report-format.ts";
import {
  formatAutoresearchCampaignStartUnderSupervisionReport,
  formatAutoresearchCandidateWavePlanReport,
  formatAutoresearchCandidateWaveReviewReport,
  formatAutoresearchLearningKesAdapterReport,
  formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport,
  formatAutoresearchLevel3ManifestPreflightReport,
  formatAutoresearchLevel3MatrixCellExecutorReport,
  formatAutoresearchLevel3MatrixCellRunnerReport,
  formatAutoresearchLevel3MeasureExportReviewPlanReport,
  formatAutoresearchLevel3SliceSequenceDryRunReport,
  formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport,
  formatAutoresearchLevel4CampaignRunnerReport,
  formatAutoresearchLiveMissingSession,
  formatAutoresearchLivePollExtras,
  formatAutoresearchLiveSessionList,
  formatAutoresearchLiveSessionReport,
  formatAutoresearchLiveStartReport,
  formatAutoresearchLiveStopReport,
  formatAutoresearchManifestCampaignEvidenceReport,
  formatAutoresearchManifestCampaignObservationReport,
  formatAutoresearchMatrixCampaignPlanReport,
  formatAutoresearchMatrixCampaignReviewReport,
  formatAutoresearchMatrixCampaignRunnerCheckpointReport,
  formatAutoresearchMatrixCampaignRunnerContractReport,
  formatAutoresearchPostFaninFinalizerReport,
  formatAutoresearchSelfHostingEvidenceReport,
  formatAutoresearchSelfHostingObservationReport,
} from "../src/runtime/autoresearch-report-format.ts";
import {
  type AutoresearchSelfHostingSupervisionAction,
  AutoresearchSelfHostingSupervisor,
} from "../src/runtime/autoresearch-self-hosting-supervision.ts";
import {
  AutoresearchLiveSupervisionRunner,
  describeAutoresearchLiveNextStep,
  runAutoresearchLevel4CampaignRunner,
} from "../src/runtime/autoresearch-supervisor-runner.ts";
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
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../src/runtime/subagent.ts";
import { getGlobalSessionTeamStore } from "../src/runtime/team-state.ts";
import {
  formatTsQualityReleaseWorkflowResult,
  TsQualityReleaseWorkflowRunner,
} from "../src/runtime/ts-quality-release-workflow.ts";
import { materializeVaultWorkflowBinding } from "../src/runtime/vault-workflow-binding.ts";
import { validateWorkflowRequest, WORKFLOW_AGENT_NAMES } from "../src/runtime/workflow.ts";
import {
  createWorkflowExecutor,
  WorkflowExecutionError,
} from "../src/runtime/workflow-execution.ts";

import {
  createAutoresearchLearningKesAdapterToolResult,
  createAutoresearchLiveToolResult,
  createAutoresearchManifestCampaignToolResult,
  createAutoresearchSelfHostingToolResult,
  validateAutoresearchLiveIdentity,
} from "./autoresearch-tool-adapters.ts";
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

const SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
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

function workflowCognitiveToolUnavailable(
  mode: "chain" | "parallel",
  lookupFailure: "boundary_failure" | "lookup_exception" | "not_found" | "empty_content",
  error: string,
) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Workflow execution blocked: governed cognitive tool 'controlled' is unavailable (${lookupFailure}): ${error}`,
      },
    ],
    details: {
      ok: false,
      mode,
      status: "blocked",
      stepCount: 0,
      errorCode: "workflow_cognitive_tool_unavailable",
      cognitiveTool: "controlled",
      lookupFailure,
      error,
      dispatchedSteps: 0,
    },
  };
}

function buildWorkflowExecuteInvocation(objective?: string): string {
  const trimmedObjective = objective?.trim();
  const request = trimmedObjective
    ? {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: trimmedObjective,
          },
          {
            kind: "step",
            agent: "reviewer",
            objective: `Review the findings from: ${trimmedObjective}`,
          },
        ],
      }
    : {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: "Inspect the current repo and identify the relevant workflow entry points.",
          },
          {
            kind: "step",
            agent: "reviewer",
            objective:
              "Review the discovered workflow surface and summarize the main runtime risks.",
          },
        ],
      };

  return `workflow_execute(${JSON.stringify({ request }, null, 2)})`;
}

function formatWorkflowWrapperGuide(): string {
  return [
    "# Workflow wrappers",
    "",
    "Thin command adapters over `workflow_execute`:",
    "- `/workflow [objective]` seeds a starter `workflow_execute(...)` call in the editor",
    "- `/workflows` shows this short guide",
    "",
    "## Recommended first use",
    "",
    "```js",
    buildWorkflowExecuteInvocation(),
    "```",
    "",
    "## Selection guide",
    "- `dispatch_subagent` — one focused specialist worker via ASC",
    "- `cognitive_dispatch` — one task where cognition/tool choice is the main uncertainty",
    "- `loop_execute` — predefined orchestrator-owned cognitive framework",
    "- `workflow_execute` — explicit caller-authored chain/parallel/worktree graph",
    "- DSPy / DSPx — program/runtime optimization, replay, compile/eval, and empirical evolution",
    "",
    "## Interpretation",
    "- workflows here are caller-authored / operator-authored requests",
    "- the request names the graph explicitly; the agent executes it but does not silently redefine the topology",
    "- loops are different: they are predefined orchestrator-owned cognitive frameworks",
    "- subagents are the execution units underneath these higher-level orchestration surfaces",
    "- DSPy/DSPx concerns are different again: inner cognition/program runtimes and the engineering/optimization/replay layer around them",
    "",
    "## Notes",
    "- prefer chain for dependent work",
    "- use parallel only for independent tasks",
    "- reserve worktree mode for eligible mutation cases",
    "- wrappers are adapters only; `workflow_execute` remains the core surface",
  ].join("\n");
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

  // ===========================================================================
  // TOOL: autoresearch_live_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_live_supervision",
    label: "Autoresearch Live Supervision",
    description:
      "Inspect, start, one-shot observe, stop, or start one bounded pi-autoresearch campaign and then attach live supervision above the package runtime.",
    promptSnippet:
      "Observe/start/status/stop a live pi-autoresearch supervision session, or start one bounded pi-autoresearch campaign and then attach supervision, while keeping peer-assisted lanes communication-only.",
    promptGuidelines: [
      "Use autoresearch_live_supervision for exact taskId + cwd supervision above the pi-autoresearch runtime.",
      "Use action=start_campaign only with an exact taskId, cwd, and objective; campaign execution is delegated to pi-autoresearch runtime semantics before live supervision starts.",
      "Use action=plan_candidate_wave when the operator wants multiple visible candidate experiments in parallel; this returns explicit candidate_peer_spawn and pi-autoresearch measurement/review calls, but does not launch or promote anything by itself.",
      "Use action=level3_manifest_preflight to validate a level-3 manifest read-only before any action-consuming surface.",
      "Use action=level3_slice_sequence_dry_run to walk manifest slices/cells and emit non-authoritative dry-run receipts without exposing or executing lower-plane action calls.",
      "Use action=level3_visible_candidate_lifecycle_plan to expose authorized visible candidate launch calls, bind candidate worktree lineage, and prepare cleanup posture without executing launch or cleanup.",
      "Use action=level3_measure_export_review_plan to emit manifest-approved pi-autoresearch measurement/export/review call packets without executing them or treating packets as durable evidence.",
      "Use action=level3_matrix_cell_runner to compute the unified Level-3 cell state machine over manifest preflight, sequencing, visible launch, candidate bindings, measure/export packets, per-cell review, and finalizer-plan readiness without executing hidden actions.",
      "Use action=level3_authorized_finalizer_cleanup_plan to consume exact finalize_post_fanin and candidate closeout gates and emit lifecycle-v2 status/plan handoffs. Successful integration does not itself authorize deletion; lifecycle-v2 owner review, proof, archive, authorization, and execution remain required while promotion and AK writes stay separate.",
      "Use action=level3_matrix_cell_executor above checkpoint_matrix_campaign_runner output when the controller wants deterministic one-step advancement through runner nextLegalActions without hidden execution; pass completedActionCount after each explicitly verified action.",
      "Use action=plan_matrix_campaign when the operator wants implementation-wave work dogfooded as a scenario × hypothesis matrix; this returns cell-scoped plan_candidate_wave/review_candidate_wave calls and keeps AK as the task spine.",
      "Use action=prepare_matrix_campaign_runner for the safer manifest/checkpoint runner contract: it exposes visible candidate_peer_spawn launch calls only, withholds benchmark/export/review calls, and emits an exact controller checkpoint token.",
      "Use action=checkpoint_matrix_campaign_runner only after visible candidate peers have reported back and the controller has verified lineage; without the exact checkpointConfirmation token, benchmark/export/review calls remain withheld, and with it the tool returns an explicit controller-command packet: bind -> metric runtime_run -> candidate_result_export -> review_candidate_wave -> review_matrix_campaign.",
      "Use action=review_matrix_campaign after matrix cells have exported candidate-result packets; this aggregates managed cell-wave reviews without launching, measuring, writing evidence, or selecting promotion authority.",
      "Use action=review_candidate_wave after multiple pi-autoresearch candidate measurements have produced result summaries; this compares lanes for owner selection, but still does not choose winners as promotion authority.",
      "For DSPx/DSPy planning, set planner=dspx_program and runDspxProgramGen=true; this asks pi-autoresearch to materialize and run a bounded DSPx-generated DSPy planner assembly, then validate the generated DSPy output from behavior_results.json as the campaign plan. Orchestrator still does not synthesize or apply a DSPy program itself.",
      "Do not invent fuzzy task lookup or hidden daemons; provide exact taskId and cwd for observe/start/stop/start_campaign.",
      "Do not auto-spawn scout_peer_spawn, candidate_peer_spawn, or fork_peer_spawn from this surface; pi-autoresearch may recommend exact peer calls and the operator/controller chooses whether to launch them.",
      "Do not change direction from this surface; emit direction proposals/gated next steps and route actual direction changes through AK/decision authority.",
      "AK evidence/task-lifecycle projection may occur only from verified package runtime/ledger proof through the live supervisor/projector, not from raw peer messages or unverified campaign claims.",
      "Treat PEER_ACK/PEER_FINAL or legacy QUEST_ACK/QUEST_FINAL intercom messages as communication only.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("status"),
          Type.Literal("observe"),
          Type.Literal("start"),
          Type.Literal("start_campaign"),
          Type.Literal("plan_candidate_wave"),
          Type.Literal("level3_manifest_preflight"),
          Type.Literal("level3_slice_sequence_dry_run"),
          Type.Literal("level3_visible_candidate_lifecycle_plan"),
          Type.Literal("level3_measure_export_review_plan"),
          Type.Literal("level3_matrix_cell_runner"),
          Type.Literal("level3_authorized_finalizer_cleanup_plan"),
          Type.Literal("level3_matrix_cell_executor"),
          Type.Literal("level4_autoresearch_campaign_runner"),
          Type.Literal("plan_matrix_campaign"),
          Type.Literal("prepare_matrix_campaign_runner"),
          Type.Literal("checkpoint_matrix_campaign_runner"),
          Type.Literal("review_matrix_campaign"),
          Type.Literal("review_candidate_wave"),
          Type.Literal("finalize_post_fanin"),
          Type.Literal("stop"),
        ]),
      ),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id for the campaign" })),
      cwd: Type.Optional(Type.String({ description: "Exact campaign cwd" })),
      objective: Type.Optional(
        Type.String({
          description:
            "Bounded optimization objective for action=start_campaign, action=plan_candidate_wave, matrix campaign actions, action=review_candidate_wave, action=finalize_post_fanin, or action=level3_authorized_finalizer_cleanup_plan.",
        }),
      ),
      candidateCount: Type.Optional(
        Type.Number({
          description: "Number of candidate lanes for action=plan_candidate_wave (1-6, default 3).",
          minimum: 1,
          maximum: 6,
        }),
      ),
      candidateObjectives: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional explicit per-lane candidate objectives for action=plan_candidate_wave.",
        }),
      ),
      candidatePacketDirectory: Type.Optional(
        Type.String({
          description:
            "Optional repo-relative .autoresearch/ packet directory for action=plan_candidate_wave.",
        }),
      ),
      scenarios: Type.Optional(
        Type.Array(Type.String(), {
          description: "Scenario axis values for matrix campaign actions.",
        }),
      ),
      hypotheses: Type.Optional(
        Type.Array(Type.String(), {
          description: "Hypothesis axis values for matrix campaign actions.",
        }),
      ),
      candidateCountPerCell: Type.Optional(
        Type.Number({
          description:
            "Number of candidate lanes generated inside each matrix cell for matrix campaign actions (1-6, default 3).",
          minimum: 1,
          maximum: 6,
        }),
      ),
      parentPeerTarget: Type.Optional(
        Type.String({
          description:
            "Optional exact controller peer target to include in candidate_peer_spawn calls for action=plan_candidate_wave or action=level3_visible_candidate_lifecycle_plan.",
        }),
      ),
      launchAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact launch_visible_candidate_lanes token for action=level3_visible_candidate_lifecycle_plan when manifest policy does not directly allow launch.",
        }),
      ),
      level3CandidateBindings: Type.Optional(
        Type.Array(
          Type.Object({
            laneId: Type.String(),
            candidatePeerRunId: Type.Optional(Type.String()),
            candidateWorktree: Type.Optional(Type.String()),
            candidateBranch: Type.Optional(Type.String()),
            candidateBaseRef: Type.Optional(Type.String()),
            candidateDiffSummary: Type.Optional(Type.String()),
            candidateFilesChanged: Type.Optional(Type.Array(Type.String())),
          }),
          {
            description:
              "Controller-verified candidate lane bindings for action=level3_visible_candidate_lifecycle_plan.",
          },
        ),
      ),
      level3CandidateResultPacketDirectory: Type.Optional(
        Type.String({
          description:
            "Repo-relative packet directory for action=level3_measure_export_review_plan candidate-result packet outputs.",
        }),
      ),
      candidateResults: Type.Optional(
        Type.Array(
          Type.Object({
            laneId: Type.String({ description: "Candidate lane id, for example candidate-01." }),
            objective: Type.Optional(Type.String()),
            metric: Type.Optional(Type.Number()),
            status: Type.Optional(Type.String()),
            checksStatus: Type.Optional(Type.String()),
            confidence: Type.Optional(Type.Number()),
            candidateSource: Type.Optional(Type.String()),
            candidateWorktree: Type.Optional(Type.String()),
            candidateBranch: Type.Optional(Type.String()),
            candidateBaseRef: Type.Optional(Type.String()),
            candidateDiffSummary: Type.Optional(Type.String()),
            candidateFilesChanged: Type.Optional(Type.Array(Type.String())),
            candidatePeerRunId: Type.Optional(Type.String()),
            candidateRunnerId: Type.Optional(Type.String()),
            sourcePacketPath: Type.Optional(Type.String()),
            caveat: Type.Optional(Type.String()),
          }),
          {
            description:
              "Candidate result summaries for action=review_candidate_wave after pi-autoresearch measurement.",
          },
        ),
      ),
      candidateResultPacketPaths: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Paths to exported autoresearch.candidate_result.v1 packet JSON files for action=review_candidate_wave or action=finalize_post_fanin.",
        }),
      ),
      sourceReview: Type.Optional(
        Type.Union(
          [Type.Literal("review_candidate_wave"), Type.Literal("review_matrix_campaign")],
          {
            description:
              "Fan-in review source for action=finalize_post_fanin; defaults to review_candidate_wave.",
          },
        ),
      ),
      selectedLaneId: Type.Optional(
        Type.String({ description: "Expected selected lane id for action=finalize_post_fanin." }),
      ),
      selectedCellId: Type.Optional(
        Type.String({
          description: "Expected selected matrix cell id for action=finalize_post_fanin.",
        }),
      ),
      dirtyFiles: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Repo-relative dirty controller/parent paths that must not overlap selected finalizer files.",
        }),
      ),
      reviewedAtEpochMs: Type.Optional(
        Type.Number({ description: "Review timestamp used to detect selected packet staleness." }),
      ),
      applyAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact finalizer authorization token required for terminal authorized posture.",
        }),
      ),
      finalizerAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact level-3 finalize_post_fanin token for action=level3_authorized_finalizer_cleanup_plan.",
        }),
      ),
      cleanupAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact level-3 candidate_cleanup token for action=level3_authorized_finalizer_cleanup_plan when cleanup is requested before successful integration closeout or without exact closeout resources.",
        }),
      ),
      integrationCloseout: Type.Optional(
        Type.Object({
          status: Type.Union([
            Type.Literal("successful"),
            Type.Literal("failed"),
            Type.Literal("missing"),
          ]),
          commit: Type.Optional(Type.String()),
          summary: Type.Optional(Type.String()),
        }),
      ),
      cleanupPeerRunIds: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Exact candidate_peer_spawn peer run ids for lifecycle-v2 closeout planning.",
        }),
      ),
      cleanupPeerTabsOrSessions: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact peer tab/session ids for level-3 candidate cleanup planning.",
        }),
      ),
      cleanupWorktrees: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact candidate worktree paths for level-3 candidate cleanup planning.",
        }),
      ),
      cleanupBranches: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact candidate branches for level-3 candidate cleanup planning.",
        }),
      ),
      validation: Type.Optional(
        Type.Object({
          command: Type.String({
            description: "Validation command that was run after selected patch application.",
          }),
          status: Type.Union([
            Type.Literal("passed"),
            Type.Literal("failed"),
            Type.Literal("missing"),
          ]),
          summary: Type.Optional(Type.String()),
          artifactPath: Type.Optional(Type.String()),
        }),
      ),
      runnerManifestPath: Type.Optional(
        Type.String({
          description:
            "Optional repo-relative manifest path for action=prepare_matrix_campaign_runner or checkpoint_matrix_campaign_runner.",
        }),
      ),
      checkpointConfirmation: Type.Optional(
        Type.String({
          description:
            "Exact controller checkpoint token required by action=checkpoint_matrix_campaign_runner before benchmark/export/review calls are exposed.",
        }),
      ),
      completedActionCount: Type.Optional(
        Type.Number({
          description:
            "For action=level3_matrix_cell_executor or level4_autoresearch_campaign_runner, the count of previously controller-run and verified Level-3 runner nextLegalActions; Level-4 also resumes from its receipt file.",
          minimum: 0,
        }),
      ),
      level3ManifestPath: Type.Optional(
        Type.String({
          description:
            "Path to an autoresearch.level3_campaign_manifest.v1 JSON manifest for action=level3_manifest_preflight or action=level3_slice_sequence_dry_run.",
        }),
      ),
      level3Manifest: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description:
            "Inline autoresearch.level3_campaign_manifest.v1 object for Level-3 or Level-4 action surfaces.",
        }),
      ),
      level4ReceiptPath: Type.Optional(
        Type.String({
          description:
            "Optional cwd-relative receipt JSONL path for action=level4_autoresearch_campaign_runner.",
        }),
      ),
      maxAutomatedActions: Type.Optional(
        Type.Number({
          description:
            "Maximum safe actions Level-4 may automate in one invocation (1-25, default 1).",
          minimum: 1,
          maximum: 25,
        }),
      ),
      maxParallelCandidatePeers: Type.Optional(
        Type.Number({
          description:
            "Level-4 whole-matrix executor visible candidate_peer_spawn concurrency limit (1-12, default 4).",
          minimum: 1,
          maximum: 12,
        }),
      ),
      allowMeasureExportReview: Type.Optional(
        Type.Boolean({
          description:
            "When true, Level-4 may execute safe measure/export/status actions instead of stopping for the controller seam.",
        }),
      ),
      allowReviewGeneration: Type.Optional(
        Type.Boolean({
          description:
            "When true, Level-4 may execute safe review packet generation actions; owner gates still remain exact.",
        }),
      ),
      maxIterations: Type.Optional(
        Type.Number({
          description:
            "Bounded positive-integer campaign iteration budget for action=start_campaign",
          minimum: 1,
        }),
      ),
      maxWallClockMinutes: Type.Optional(
        Type.Number({
          description: "Bounded positive wall-clock budget for action=start_campaign",
          minimum: 0,
          exclusiveMinimum: 0,
        }),
      ),
      benchmarkCommand: Type.Optional(
        Type.String({ description: "Optional explicit pi-autoresearch benchmark command" }),
      ),
      checksCommand: Type.Optional(
        Type.String({ description: "Optional explicit pi-autoresearch checks command" }),
      ),
      metricName: Type.Optional(
        Type.String({
          description:
            "Optional explicit metric name for start_campaign or matrix campaign operator follow-up (for example operator_ux_blockers).",
        }),
      ),
      metricUnit: Type.Optional(Type.String({ description: "Optional explicit metric unit" })),
      direction: Type.Optional(Type.Union([Type.Literal("lower"), Type.Literal("higher")])),
      metricThreshold: Type.Optional(
        Type.Number({
          description:
            "Optional explicit metric success threshold forwarded to pi-autoresearch for action=start_campaign or rendered in matrix campaign operator follow-up.",
        }),
      ),
      reconfigure: Type.Optional(
        Type.Boolean({
          description:
            "When true, ask pi-autoresearch to append a fresh config segment for action=start_campaign instead of continuing the active segment.",
        }),
      ),
      filesInScope: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional file/path scope forwarded to pi-autoresearch for action=start_campaign peer handoff planning.",
        }),
      ),
      offLimits: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional off-limits file/path specs forwarded to pi-autoresearch for action=start_campaign peer handoff planning and enforced during review_candidate_wave selection.",
        }),
      ),
      constraints: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional hard constraints forwarded to pi-autoresearch for action=start_campaign peer handoff planning.",
        }),
      ),
      planner: Type.Optional(Type.Union([Type.Literal("heuristic"), Type.Literal("dspx_program")])),

      materializeDspxIntent: Type.Optional(
        Type.Boolean({
          description:
            "When planner=dspx_program, ask pi-autoresearch to write the local DSPx program-gen intent artifact.",
        }),
      ),
      runDspxProgramGen: Type.Optional(
        Type.Boolean({
          description:
            "When planner=dspx_program, ask pi-autoresearch to run bounded DSPx program-gen and use behavior_results.json as the campaign plan.",
        }),
      ),
      dspxProgramGenTimeoutSeconds: Type.Optional(
        Type.Number({ description: "DSPx program-gen timeout seconds.", minimum: 1 }),
      ),
      dspxIntentPath: Type.Optional(
        Type.String({ description: "Optional repo-relative or absolute DSPx intent path." }),
      ),
      dspxOutdir: Type.Optional(
        Type.String({
          description: "Optional repo-relative or absolute DSPx program-gen output dir.",
        }),
      ),
      dspxBehaviorPath: Type.Optional(
        Type.String({ description: "Optional DSPx behavior_results.json advisory path." }),
      ),
      intervalSeconds: Type.Optional(
        Type.Number({
          description: "Polling interval in seconds for action=start|observe|start_campaign",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const {
        action: requestedAction,
        taskId,
        cwd,
        objective,
        candidateCount,
        candidateObjectives,
        candidatePacketDirectory,
        scenarios,
        hypotheses,
        candidateCountPerCell,
        parentPeerTarget,
        candidateResults,
        level3CandidateBindings,
        launchAuthorizationToken,
        level3CandidateResultPacketDirectory,
        candidateResultPacketPaths,
        sourceReview,
        selectedLaneId,
        selectedCellId,
        dirtyFiles,
        reviewedAtEpochMs,
        applyAuthorizationToken,
        finalizerAuthorizationToken,
        cleanupAuthorizationToken,
        cleanupPeerRunIds,
        cleanupPeerTabsOrSessions,
        cleanupWorktrees,
        cleanupBranches,
        integrationCloseout,
        validation,
        runnerManifestPath,
        checkpointConfirmation,
        completedActionCount,
        level3ManifestPath,
        level3Manifest,
        level4ReceiptPath,
        maxAutomatedActions,
        maxParallelCandidatePeers,
        allowMeasureExportReview,
        allowReviewGeneration,
        maxIterations,
        maxWallClockMinutes,
        benchmarkCommand,
        checksCommand,
        metricName,
        metricUnit,
        direction,
        metricThreshold,
        reconfigure,
        filesInScope,
        offLimits,
        constraints,
        planner,
        materializeDspxIntent,
        runDspxProgramGen,
        dspxProgramGenTimeoutSeconds,
        dspxIntentPath,
        dspxOutdir,
        dspxBehaviorPath,
        intervalSeconds,
      } = params as {
        action?: AutoresearchLiveSupervisionAction;
        taskId?: number;
        cwd?: string;
        objective?: string;
        candidateCount?: number;
        candidateObjectives?: string[];
        candidatePacketDirectory?: string;
        scenarios?: string[];
        hypotheses?: string[];
        candidateCountPerCell?: number;
        parentPeerTarget?: string;
        level3CandidateBindings?: Array<{
          laneId: string;
          candidatePeerRunId?: string;
          candidateWorktree?: string;
          candidateBranch?: string;
          candidateBaseRef?: string;
          candidateDiffSummary?: string;
          candidateFilesChanged?: string[];
        }>;
        launchAuthorizationToken?: string;
        level3CandidateResultPacketDirectory?: string;
        candidateResults?: Array<{
          laneId: string;
          objective?: string;
          metric?: number;
          status?: string;
          checksStatus?: string;
          confidence?: number;
          candidateSource?: string;
          candidateWorktree?: string;
          candidateBranch?: string;
          candidateBaseRef?: string;
          candidateDiffSummary?: string;
          candidateFilesChanged?: string[];
          candidatePeerRunId?: string;
          candidateRunnerId?: string;
          sourcePacketPath?: string;
          caveat?: string;
        }>;
        candidateResultPacketPaths?: string[];
        sourceReview?: "review_candidate_wave" | "review_matrix_campaign";
        selectedLaneId?: string;
        selectedCellId?: string;
        dirtyFiles?: string[];
        reviewedAtEpochMs?: number;
        applyAuthorizationToken?: string;
        finalizerAuthorizationToken?: string;
        cleanupAuthorizationToken?: string;
        cleanupPeerRunIds?: string[];
        cleanupPeerTabsOrSessions?: string[];
        cleanupWorktrees?: string[];
        cleanupBranches?: string[];
        integrationCloseout?: {
          status: "successful" | "failed" | "missing";
          commit?: string;
          summary?: string;
        };
        validation?: {
          command: string;
          status: "passed" | "failed" | "missing";
          summary?: string;
          artifactPath?: string;
        };
        runnerManifestPath?: string;
        checkpointConfirmation?: string;
        completedActionCount?: number;
        level3ManifestPath?: string;
        level3Manifest?: Record<string, unknown>;
        level4ReceiptPath?: string;
        maxAutomatedActions?: number;
        maxParallelCandidatePeers?: number;
        allowMeasureExportReview?: boolean;
        allowReviewGeneration?: boolean;
        maxIterations?: number;
        maxWallClockMinutes?: number;
        benchmarkCommand?: string;
        checksCommand?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        reconfigure?: boolean;
        filesInScope?: string[];
        offLimits?: string[];
        constraints?: string[];
        planner?: "heuristic" | "dspx_program";
        materializeDspxIntent?: boolean;
        runDspxProgramGen?: boolean;
        dspxProgramGenTimeoutSeconds?: number;
        dspxIntentPath?: string;
        dspxOutdir?: string;
        dspxBehaviorPath?: string;
        intervalSeconds?: number;
      };
      const action = requestedAction || "status";

      try {
        validateAutoresearchLiveIdentity({ action, taskId, cwd });
        const identity = taskId !== undefined && cwd !== undefined ? { taskId, cwd } : null;

        if (action === "status" && !identity) {
          const sessions = autoresearchLiveRunner.listActiveSessions();
          return createAutoresearchLiveToolResult(formatAutoresearchLiveSessionList(sessions), {
            ok: true,
            action,
            activeSessionCount: sessions.length,
            sessions,
          });
        }

        if (!identity) {
          throw new Error(`${action} requires an exact taskId and cwd.`);
        }

        if (action === "status") {
          const session = autoresearchLiveRunner.getSession(identity);
          const sessionKey = `${identity.taskId}|${path.resolve(identity.cwd)}`;
          if (!session) {
            return createAutoresearchLiveToolResult(
              formatAutoresearchLiveMissingSession({
                action: "status",
                taskId: identity.taskId,
                cwd: identity.cwd,
              }),
              {
                ok: true,
                action,
                sessionKey,
                session: null,
                nextStep: "No live supervision session is active for this task/cwd pair.",
              },
            );
          }

          const nextStep = describeAutoresearchLiveNextStep(session);
          return createAutoresearchLiveToolResult(
            formatAutoresearchLiveSessionReport({
              action,
              sessionKey,
              session,
              nextStep,
            }),
            {
              ok: true,
              action,
              sessionKey,
              session,
              nextStep,
            },
          );
        }

        if (action === "observe") {
          const result = await autoresearchLiveRunner.observe({
            ...identity,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLiveSessionReport({
              action,
              sessionKey: result.sessionKey,
              session: result.session,
              nextStep: result.nextStep,
              extraLines: formatAutoresearchLivePollExtras(result),
            }),
            {
              ok: true,
              action,
              sessionKey: result.sessionKey,
              session: result.session,
              nextStep: result.nextStep,
              projector: result.projector,
              lifecycle: result.lifecycle,
            },
          );
        }

        if (action === "start") {
          const result = await autoresearchLiveRunner.start({
            ...identity,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(formatAutoresearchLiveStartReport(result), {
            ok: true,
            action,
            sessionKey: result.sessionKey,
            session: result.session,
            reused: result.reused,
            nextStep: result.poll?.nextStep || describeAutoresearchLiveNextStep(result.session),
            poll: result.poll,
          });
        }

        if (action === "plan_candidate_wave") {
          const waveObjective = objective?.trim() ?? "";
          if (waveObjective.length === 0) {
            throw new Error("plan_candidate_wave requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.planCandidateWave({
            ...identity,
            objective: waveObjective,
            candidateCount,
            candidateObjectives,
            candidatePacketDirectory,
            filesInScope,
            offLimits,
            constraints,
            direction,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCandidateWavePlanReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              candidateWave: result,
            },
          );
        }

        if (action === "level3_manifest_preflight") {
          const result = autoresearchLiveRunner.preflightLevel3CampaignManifest({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3ManifestPreflightReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3ManifestPreflight: result,
            },
          );
        }

        if (action === "level3_slice_sequence_dry_run") {
          const result = autoresearchLiveRunner.dryRunLevel3SliceSequence({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3SliceSequenceDryRunReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3SliceSequenceDryRun: result,
            },
          );
        }

        if (action === "level3_visible_candidate_lifecycle_plan") {
          const result = autoresearchLiveRunner.planLevel3VisibleCandidateLifecycle({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3VisibleCandidateLifecyclePlan: result,
            },
          );
        }

        if (action === "level3_measure_export_review_plan") {
          const result = autoresearchLiveRunner.planLevel3MeasureExportReview({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            candidateResultPacketDirectory: level3CandidateResultPacketDirectory,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MeasureExportReviewPlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3MeasureExportReviewPlan: result,
            },
          );
        }

        if (action === "level3_matrix_cell_runner") {
          const result = autoresearchLiveRunner.runLevel3MatrixCellRunner({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            candidateResultPacketDirectory: level3CandidateResultPacketDirectory,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MatrixCellRunnerReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3MatrixCellRunner: result,
            },
          );
        }

        if (action === "level3_authorized_finalizer_cleanup_plan") {
          const finalizerObjective = objective?.trim() ?? "";
          if (finalizerObjective.length === 0) {
            throw new Error(
              "level3_authorized_finalizer_cleanup_plan requires a non-empty objective.",
            );
          }
          const result = autoresearchLiveRunner.planLevel3AuthorizedFinalizerCleanup({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            objective: finalizerObjective,
            sourceReview,
            direction,
            metricName,
            metricThreshold,
            candidateResultPacketPaths,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            selectedLaneId,
            selectedCellId,
            validation,
            offLimits,
            dirtyFiles,
            reviewedAtEpochMs,
            finalizerAuthorizationToken,
            cleanupAuthorizationToken,
            cleanupResources: {
              peerRunIds: cleanupPeerRunIds,
              peerTabsOrSessions: cleanupPeerTabsOrSessions,
              worktrees: cleanupWorktrees,
              branches: cleanupBranches,
            },
            integrationCloseout,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3AuthorizedFinalizerCleanupPlan: result,
            },
          );
        }

        if (action === "plan_matrix_campaign") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("plan_matrix_campaign requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.planMatrixCampaign({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignPlanReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaign: result,
            },
          );
        }

        if (action === "prepare_matrix_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("prepare_matrix_campaign_runner requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.prepareMatrixCampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignRunnerContractReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignRunner: result,
            },
          );
        }

        if (action === "checkpoint_matrix_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("checkpoint_matrix_campaign_runner requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.checkpointMatrixCampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignRunnerCheckpointReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignRunnerCheckpoint: result,
            },
          );
        }

        if (action === "level3_matrix_cell_executor") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("level3_matrix_cell_executor requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.advanceLevel3MatrixCellExecutor({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            completedActionCount,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MatrixCellExecutorReport(result),
            {
              ok: result.stateMachineBlockers.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              level3MatrixCellExecutor: result,
            },
          );
        }

        if (action === "level4_autoresearch_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("level4_autoresearch_campaign_runner requires a non-empty objective.");
          }
          const result = runAutoresearchLevel4CampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            completedActionCount,
            candidateBindings: level3CandidateBindings,
            level4ReceiptPath,
            maxAutomatedActions,
            maxParallelCandidatePeers,
            allowMeasureExportReview,
            allowReviewGeneration,
            integrationCloseout,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel4CampaignRunnerReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              level4CampaignRunner: result,
            },
          );
        }

        if (action === "review_matrix_campaign") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("review_matrix_campaign requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.reviewMatrixCampaign({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignReviewReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignReview: result,
            },
          );
        }

        if (action === "review_candidate_wave") {
          const waveObjective = objective?.trim() ?? "";
          if (waveObjective.length === 0) {
            throw new Error("review_candidate_wave requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.reviewCandidateWave({
            ...identity,
            objective: waveObjective,
            direction,
            candidateResults,
            candidateResultPacketPaths,
            offLimits,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCandidateWaveReviewReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              candidateWaveReview: result,
            },
          );
        }

        if (action === "finalize_post_fanin") {
          const finalizerObjective = objective?.trim() ?? "";
          if (finalizerObjective.length === 0) {
            throw new Error("finalize_post_fanin requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.finalizePostFanin({
            ...identity,
            objective: finalizerObjective,
            sourceReview: sourceReview ?? "review_candidate_wave",
            direction,
            metricName,
            metricThreshold,
            candidateResultPacketPaths,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            selectedLaneId,
            selectedCellId,
            validation,
            offLimits,
            dirtyFiles,
            reviewedAtEpochMs,
            applyAuthorizationToken,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchPostFaninFinalizerReport(result),
            {
              ok: result.outcome !== "failed_closed",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              postFaninFinalizer: result,
            },
          );
        }

        if (action === "start_campaign") {
          const campaignObjective = objective?.trim() ?? "";
          if (campaignObjective.length === 0) {
            throw new Error("start_campaign requires a non-empty objective.");
          }
          const result = await autoresearchLiveRunner.startCampaign({
            ...identity,
            objective: campaignObjective,
            maxIterations,
            maxWallClockMinutes,
            benchmarkCommand,
            checksCommand,
            metricName,
            metricUnit,
            direction,
            metricThreshold,
            reconfigure,
            filesInScope,
            offLimits,
            constraints,
            planner,
            materializeDspxIntent,
            runDspxProgramGen,
            dspxProgramGenTimeoutSeconds,
            dspxIntentPath,
            dspxOutdir,
            dspxBehaviorPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCampaignStartUnderSupervisionReport(result),
            {
              ok: true,
              action,
              sessionKey: result.supervision.sessionKey,
              session: result.supervision.session,
              reused: result.supervision.reused,
              nextStep:
                result.supervision.poll?.nextStep ||
                describeAutoresearchLiveNextStep(result.supervision.session),
              poll: result.supervision.poll,
              campaign: result.campaign,
            },
          );
        }

        const result = autoresearchLiveRunner.stop(identity);
        return createAutoresearchLiveToolResult(formatAutoresearchLiveStopReport(result), {
          ok: true,
          action,
          sessionKey: result.sessionKey,
          session: result.session,
          stopped: result.stopped,
          nextStep: result.nextStep,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchLiveToolResult(
          `autoresearch_live_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchLiveSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = a.action || "status";
      const target =
        a.taskId !== undefined && a.cwd
          ? `#${a.taskId} ${a.cwd}`
          : a.taskId !== undefined
            ? `#${a.taskId}`
            : a.cwd || "active sessions";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_live_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchLiveSupervisionToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.action === "status" && !details.session) {
        return new Text(
          theme.fg("muted", `status ${details.activeSessionCount ?? 0} active session(s)`),
          0,
          0,
        );
      }

      const state = details.session?.state || "unknown";
      const color = details.ok === false ? "error" : state === "completed" ? "success" : "accent";
      const icon = details.ok === false ? "✗" : state === "completed" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action || "status"}`) + theme.fg("dim", ` ${state}`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_manifest_campaign_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_manifest_campaign_supervision",
    label: "Autoresearch Manifest Campaign Supervision",
    description:
      "Observe one exact manifest-driven pi-autoresearch campaign and optionally record bounded AK evidence above the package seam.",
    promptSnippet:
      "Observe one exact manifest-driven pi-autoresearch campaign through the orchestrator and optionally record bounded AK evidence from verified task context, not raw peer messages.",
    promptGuidelines: [
      "Use autoresearch_manifest_campaign_supervision when the caller already knows the exact manifest path and wants one-shot observation or bounded AK evidence projection above the package seam.",
      "Use action=record_evidence only when the caller already has an exact taskId; this surface stays evidence-only and does not add polling, stage execution, or task lifecycle mutation.",
      "Do not turn peer-assisted autoresearch into orchestrator-owned peer launch, review choreography, or hidden autonomy; visible peers remain optional caller-launched lanes.",
      "If a peer report influenced the observation, verify and summarize the controller-accepted finding before recording evidence; raw intercom delivery is not authority.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("observe"), Type.Literal("record_evidence")])),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id anchor", minimum: 1 })),
      cwd: Type.Optional(Type.String({ description: "Exact campaign cwd" })),
      manifestPath: Type.String({
        description: "Exact manifest path relative to cwd or absolute.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?: AutoresearchManifestCampaignSupervisionAction;
        taskId?: number;
        cwd?: string;
        manifestPath: string;
      };
      const action = request.action || "observe";
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();

      try {
        if (action === "record_evidence" && request.taskId === undefined) {
          throw new Error("record_evidence requires an exact taskId.");
        }

        if (action === "observe") {
          const observation = manifestCampaignSupervisor.observe({
            cwd,
            manifestPath: request.manifestPath,
            taskId: request.taskId,
          });
          return createAutoresearchManifestCampaignToolResult(
            formatAutoresearchManifestCampaignObservationReport({
              action,
              observation,
              nextStep: observation.nextStep,
            }),
            {
              ok: true,
              action,
              observation,
              nextStep: observation.nextStep,
            },
          );
        }

        const result = await manifestCampaignSupervisor.recordEvidence({
          cwd,
          manifestPath: request.manifestPath,
          taskId: request.taskId,
          signal,
        });
        return createAutoresearchManifestCampaignToolResult(
          formatAutoresearchManifestCampaignEvidenceReport(result),
          {
            ok: result.ok,
            action,
            observation: result.observation,
            task: result.task,
            evidenceAction: result.action,
            evidenceVia: result.evidence?.via,
            existingEvidenceId: result.existingEvidenceId,
            nextStep: result.nextStep,
            error: result.error,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchManifestCampaignToolResult(
          `autoresearch_manifest_campaign_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchManifestCampaignSupervisionAction;
        taskId?: number;
        manifestPath?: string;
      };
      const action = a.action || "observe";
      const target =
        a.taskId !== undefined
          ? `#${a.taskId} ${a.manifestPath || "(manifest)"}`
          : a.manifestPath || "(manifest)";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_manifest_campaign_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | AutoresearchManifestCampaignSupervisionToolDetails
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const action = details.evidenceAction || details.action;
      const color =
        details.ok === false
          ? "error"
          : action === "recorded" || action === "already-projected"
            ? "success"
            : "accent";
      const icon = details.ok === false ? "✗" : action === "recorded" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg(
            "dim",
            ` ${details.observation?.controlResult.control.autonomy.projection.overallState || "-"}`,
          ),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_self_hosting_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_self_hosting_supervision",
    label: "Autoresearch Self-Hosting Supervision",
    description:
      "Observe one pi-autoresearch self-hosting artifact set and optionally record bounded AK evidence above the package seam.",
    promptSnippet:
      "Observe one exact pi-autoresearch self-hosting campaign through the orchestrator and optionally record bounded AK evidence from verified task context, without running candidates or approving promotion.",
    promptGuidelines: [
      "Use autoresearch_self_hosting_supervision when the caller wants above-seam observation of autoresearch.self-hosting.json, its evaluator lock, and its promotion/rollback record.",
      "Use action=observe for read-only contract/evaluator/promotion posture; it must not run candidates, mutate evaluator locks, approve promotion, rotate controllers, roll back controllers, spawn peers, or complete tasks.",
      "Use action=record_evidence only when the caller already has an exact taskId; this surface stays evidence-only and does not reclassify applicability independently of pi-autoresearch.",
      "If a peer report or package-local receipt influenced the observation, verify and summarize the controller-accepted artifact state before recording evidence; raw intercom delivery and local receipts are not durable authority.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("observe"), Type.Literal("record_evidence")])),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id anchor", minimum: 1 })),
      cwd: Type.String({
        description: "Exact package cwd containing autoresearch.self-hosting.json",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const request = params as {
        action?: AutoresearchSelfHostingSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = request.action || "observe";
      const cwd = request.cwd;

      try {
        if (!cwd) {
          throw new Error("autoresearch_self_hosting_supervision requires an exact cwd.");
        }
        if (action === "record_evidence" && request.taskId === undefined) {
          throw new Error("record_evidence requires an exact taskId.");
        }

        if (action === "observe") {
          const observation = selfHostingSupervisor.observe({
            cwd,
            taskId: request.taskId,
          });
          return createAutoresearchSelfHostingToolResult(
            formatAutoresearchSelfHostingObservationReport({
              action,
              observation,
              nextStep: observation.nextStep,
            }),
            {
              ok: true,
              action,
              observation,
              nextStep: observation.nextStep,
            },
          );
        }

        const result = await selfHostingSupervisor.recordEvidence({
          cwd,
          taskId: request.taskId,
          signal,
        });
        return createAutoresearchSelfHostingToolResult(
          formatAutoresearchSelfHostingEvidenceReport(result),
          {
            ok: result.ok,
            action,
            observation: result.observation,
            task: result.task,
            evidenceAction: result.action,
            evidenceVia: result.evidence?.via,
            existingEvidenceId: result.existingEvidenceId,
            nextStep: result.nextStep,
            error: result.error,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchSelfHostingToolResult(
          `autoresearch_self_hosting_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchSelfHostingSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = a.action || "observe";
      const target = a.taskId !== undefined ? `#${a.taskId} ${a.cwd || "(cwd)"}` : a.cwd || "(cwd)";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_self_hosting_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchSelfHostingSupervisionToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const action = details.evidenceAction || details.action;
      const color =
        details.ok === false
          ? "error"
          : action === "recorded" || action === "already-projected"
            ? "success"
            : "accent";
      const icon = details.ok === false ? "✗" : action === "recorded" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg("dim", ` ${details.observation?.promotionPosture || "-"}`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_learning_kes_adapter
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_learning_kes_adapter",
    label: "Autoresearch Learning KES Adapter",
    description:
      "Plan or explicitly materialize package-owned KES diary and candidate-only learning artifacts from an autoresearch.learning.v1 packet.",
    promptSnippet:
      "Consume an autoresearch.learning.v1 packet through the pi-society-orchestrator KES owner seam.",
    promptGuidelines: [
      "Use action=plan first to inspect the package-owned KES diary and candidate-learning paths without writing files.",
      "Use action=materialize only when the caller explicitly wants pi-society-orchestrator to write candidate-only KES artifacts under its diary/ and docs/learnings/ roots.",
      "Do not use this tool to mutate pi-autoresearch, AK, Prompt Vault, ROCS, Oracle/DSPx, or promotion state.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("plan"), Type.Literal("materialize")])),
      packetPath: Type.String({
        description:
          "Path to an autoresearch.learning.v1 packet JSON file produced by pi-autoresearch.",
      }),
      sessionId: Type.Optional(
        Type.String({ description: "Optional Pi/session identifier to include in KES metadata." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const request = params as {
        action?: AutoresearchLearningKesAdapterAction;
        packetPath: string;
        sessionId?: string;
      };
      const action = request.action || "plan";

      try {
        if (!request.packetPath || request.packetPath.trim().length === 0) {
          throw new Error("autoresearch_learning_kes_adapter requires packetPath.");
        }
        const loadedPacket = loadAutoresearchLearningPacketWithSource(request.packetPath);
        const result = buildAutoresearchLearningKesAdapterResult({
          packageRoot: autoresearchLearningKesPackageRoot,
          packet: loadedPacket.packet,
          packetSource: loadedPacket.source,
          action,
          sessionId: request.sessionId,
        });
        return createAutoresearchLearningKesAdapterToolResult(
          formatAutoresearchLearningKesAdapterReport(result),
          {
            ok: true,
            action,
            result,
            nextStep:
              action === "plan"
                ? "Review the KES plan, then rerun with action=materialize only if candidate-only package-owned writes are intended."
                : "Review the written KES candidate artifacts before any separate promotion step.",
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchLearningKesAdapterToolResult(
          `autoresearch_learning_kes_adapter failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as { action?: AutoresearchLearningKesAdapterAction; packetPath?: string };
      const action = a.action || "plan";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_learning_kes_adapter ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", a.packetPath || "(packetPath)"),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchLearningKesAdapterToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const icon = details.ok === false ? "✗" : details.action === "materialize" ? "✓" : "•";
      const color =
        details.ok === false ? "error" : details.action === "materialize" ? "success" : "accent";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg("dim", ` ${details.result?.status || "failed"}`),
        0,
        0,
      );
    },
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

  pi.registerCommand("workflow", {
    description: "Seed a workflow_execute call in the editor: /workflow [objective]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const objective = (args || "").trim();
      ctx.ui.setEditorText(buildWorkflowExecuteInvocation(objective || undefined));
      ctx.ui.notify(
        objective
          ? `Seeded workflow_execute chain for: ${objective}`
          : "Inserted starter workflow_execute template.",
        "info",
      );
    },
  });

  pi.registerCommand("workflows", {
    description: "Show workflow wrapper usage and examples",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Workflow wrappers", formatWorkflowWrapperGuide());
    },
  });

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

  // ===========================================================================
  // TOOL: workflow_execute
  // ===========================================================================

  registerCompatTool(pi, {
    name: "workflow_execute",
    label: "Execute Workflow",
    description: `Execute a bounded chain or parallel workflow composition over the ASC-backed subagent executor.

Supports:
- chain: sequential step execution; halts on first failure
- parallel: concurrent step execution within parallel groups
- worktree isolation: optional git worktree coordination for eligible parallel groups

Each step dispatches a named agent (scout, builder, reviewer, researcher) with a cognitive tool.
The workflow executor validates the request against the active team, preserves step-level status
and failureKind truth, and produces a structured aggregated output with workflow/group/task summaries.`,
    promptSnippet:
      "Execute a chain or parallel workflow composition over the orchestrator's ASC-backed subagent seam.",
    promptGuidelines: [
      "Use workflow_execute when the task decomposes into a structured sequence of agent steps rather than a single cognitive dispatch.",
      "Prefer chain mode for dependent steps; use parallel groups for independent work that can run concurrently.",
      "Set worktree: true on parallel groups only when steps may mutate files and git isolation is required.",
    ],
    parameters: Type.Object({
      request: Type.Object({
        mode: Type.Union([Type.Literal("chain"), Type.Literal("parallel")], {
          description:
            "Workflow mode: chain (sequential, halt on failure) or parallel (concurrent within groups)",
        }),
        cwd: Type.Optional(Type.String({ description: "Shared working directory for all steps" })),
        steps: Type.Array(
          Type.Union([
            Type.Object({
              kind: Type.Literal("step"),
              agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
              objective: Type.String({ description: "What this step should accomplish" }),
              cwd: Type.Optional(Type.String({ description: "Step-specific cwd override" })),
            }),
            Type.Object({
              kind: Type.Literal("parallel"),
              concurrency: Type.Optional(Type.Number({ description: "Max concurrent tasks" })),
              worktree: Type.Optional(Type.Boolean({ description: "Use git worktree isolation" })),
              tasks: Type.Array(
                Type.Object({
                  kind: Type.Literal("step"),
                  agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
                  objective: Type.String({ description: "What this task should accomplish" }),
                  cwd: Type.Optional(Type.String({ description: "Task-specific cwd override" })),
                }),
              ),
            }),
          ]),
        ),
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { request } = params as { request: unknown };
      const activeTeam = sessionTeams.getTeam(ctx);
      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "openrouter/google/gemini-2.5-flash-preview";

      // Preserve request/team validation precedence so malformed workflows fail without
      // consulting Prompt Vault or touching the execution substrate.
      const validatedRequest = validateWorkflowRequest(request, { activeTeam });
      if (!validatedRequest.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Workflow execution failed: Workflow request failed validation.\nIssues: ${validatedRequest.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
            },
          ],
          details: {
            ok: false,
            errorCode: "workflow_validation_failed",
            issues: validatedRequest.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
              message: issue.message,
            })),
          },
        };
      }

      // A valid workflow must never silently downgrade from its governed cognitive framework
      // to an ungoverned placeholder. Fail before constructing the executor or dispatching.
      let toolResult: Awaited<ReturnType<typeof getCognitiveToolByName>>;
      try {
        toolResult = await workflowCognitiveToolLookup("controlled", { cwd: ctx.cwd }, signal);
      } catch (error) {
        signal?.throwIfAborted();
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "lookup_exception",
          error instanceof Error ? error.message : String(error),
        );
      }
      signal?.throwIfAborted();
      if (isBoundaryFailure(toolResult)) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "boundary_failure",
          toolResult.error,
        );
      }
      if (!toolResult.value) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "not_found",
          "Cognitive tool 'controlled' was not found.",
        );
      }
      const cognitiveToolContent = toolResult.value.content;
      if (!cognitiveToolContent.trim()) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "empty_content",
          "Cognitive tool 'controlled' has empty content.",
        );
      }

      const workflowExecutor = workflowExecutorFactory({
        sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "workflows"),
      });

      try {
        const result = await workflowExecutor.execute({
          request,
          activeTeam,
          model,
          cwd: ctx.cwd,
          cognitiveToolContent,
          signal,
        });

        const statusIcon = result.status === "done" ? "✓" : "✗";
        const truncatedOutput =
          result.aggregatedOutput.length > 8000
            ? `${result.aggregatedOutput.slice(0, 8000)}\n\n... [truncated]`
            : result.aggregatedOutput;

        const summary = `${statusIcon} Workflow (${result.mode}) — ${result.status} — ${result.steps.length} step(s) executed`;

        return {
          content: [{ type: "text" as const, text: `${summary}\n\n${truncatedOutput}` }],
          details: {
            ok: result.status === "done",
            mode: result.mode,
            status: result.status,
            stepCount: result.steps.length,
            stepStatuses: result.steps.map((step) => ({
              index: step.index,
              agent: step.agent,
              status: step.status,
              failureKind: step.failureKind || null,
              provenance: step.provenance || null,
            })),
            worktreeSummary: result.worktreeSummary || null,
          },
        };
      } catch (error) {
        if (error instanceof WorkflowExecutionError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Workflow execution failed: ${error.message}${error.issues ? `\nIssues: ${error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}` : ""}`,
              },
            ],
            details: {
              ok: false,
              errorCode: error.code,
              issues:
                error.issues?.map((issue) => ({
                  path: issue.path,
                  code: issue.code,
                  message: issue.message,
                })) || [],
            },
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Workflow execution failed: ${message}` }],
          details: { ok: false, error: message },
        };
      }
    },
    renderCall(args, theme) {
      const a = args as { request?: { mode?: string; steps?: unknown[] } };
      const mode = a.request?.mode || "?";
      const stepCount = a.request?.steps?.length ?? 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("workflow_execute ")) +
          theme.fg("accent", mode) +
          theme.fg("dim", ` — ${stepCount} node(s)`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | { ok?: boolean; mode?: string; status?: string; stepCount?: number }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text.slice(0, 200) : "", 0, 0);
      }

      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.mode} workflow`) +
          theme.fg("dim", ` — ${details.status} — ${details.stepCount} step(s)`),
        0,
        0,
      );
    },
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
