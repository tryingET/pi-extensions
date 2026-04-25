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
 *   ontology_context               — Get relevant ontology
 *   autoresearch_live_supervision  — Observe/start/status/stop live pi-autoresearch sessions
 *   autoresearch_manifest_campaign_supervision — Observe one exact manifest-driven campaign and optionally record bounded AK evidence
 *   loop_execute                   — Execute structured loops
 *   workflow_execute               — Execute chain/parallel workflow compositions
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import {
  AGENT_TEAMS,
  type AgentTeam,
  autoSelectAgent,
  getAgentTeamDisplayLabel,
  resolveAgentForTeam,
} from "../src/runtime/agent-routing.ts";
import { resolveAkPath } from "../src/runtime/ak.ts";
import {
  type AutoresearchManifestCampaignEvidenceResult,
  type AutoresearchManifestCampaignObservation,
  AutoresearchManifestCampaignSupervisor,
  type AutoresearchManifestCampaignTaskAnchor,
} from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";
import {
  type AutoresearchLivePollResult,
  type AutoresearchLiveStartResult,
  type AutoresearchLiveStopResult,
  AutoresearchLiveSupervisionRunner,
  type AutoresearchLiveSupervisionSessionV1,
  describeAutoresearchLiveNextStep,
} from "../src/runtime/autoresearch-supervisor-runner.ts";
import {
  getBoundaryTelemetryStats,
  getLatestBoundaryTelemetryFailure,
  isBoundaryFailure,
  listBoundaryTelemetry,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";
import { getCognitiveToolByName, listCognitiveTools } from "../src/runtime/cognitive-tools.ts";
import {
  type EvidenceEntry,
  finalizeExecutionEffects,
  recordEvidence,
} from "../src/runtime/evidence.ts";
import { getExecutionIcon } from "../src/runtime/execution-status.ts";
import { formatOntologyConcepts, lookupOntologyConcepts } from "../src/runtime/ontology.ts";
import { previewRecentEvidence, runSocietyDiagnosticQuery } from "../src/runtime/society.ts";
import {
  createRuntimeTruthSnapshot,
  fitRuntimeFooterLayout,
  formatRuntimeRoutingStatus,
  formatRuntimeStatusReport,
  joinRuntimeFooterSlotText,
  type RuntimeFooterSlot,
  selectRuntimeFooterSlotText,
} from "../src/runtime/status-semantics.ts";
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../src/runtime/subagent.ts";
import { createSessionTeamStore, type TeamScopedContext } from "../src/runtime/team-state.ts";
import { WORKFLOW_AGENT_NAMES } from "../src/runtime/workflow.ts";
import {
  createWorkflowExecutor,
  WorkflowExecutionError,
} from "../src/runtime/workflow-execution.ts";

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
const DEFAULT_FOOTER_HEALTH_REFRESH_MS = 30_000;
const AGENT_KERNEL = resolveAkPath({ cwd: process.cwd() });

function resolveVaultDir() {
  return process.env.VAULT_DIR || DEFAULT_VAULT_DIR;
}

function parseFooterHealthRefreshMs(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FOOTER_HEALTH_REFRESH_MS;
}

function getFooterHealthRefreshMs() {
  return parseFooterHealthRefreshMs(process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS);
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
}

type AutoresearchLiveSupervisionAction = "status" | "observe" | "start" | "stop";

type AutoresearchManifestCampaignSupervisionAction = "observe" | "record_evidence";

type AutoresearchLiveSupervisionToolDetails = {
  ok: boolean;
  action: AutoresearchLiveSupervisionAction;
  activeSessionCount?: number;
  sessions?: AutoresearchLiveSupervisionSessionV1[];
  sessionKey?: string;
  session?: AutoresearchLiveSupervisionSessionV1 | null;
  nextStep?: string;
  projector?: AutoresearchLivePollResult["projector"];
  lifecycle?: AutoresearchLivePollResult["lifecycle"];
  reused?: boolean;
  poll?: AutoresearchLiveStartResult["poll"];
  stopped?: boolean;
  error?: string;
};

type AutoresearchManifestCampaignSupervisionToolDetails = {
  ok: boolean;
  action: AutoresearchManifestCampaignSupervisionAction;
  observation?: AutoresearchManifestCampaignObservation;
  task?: AutoresearchManifestCampaignTaskAnchor;
  evidenceAction?: AutoresearchManifestCampaignEvidenceResult["action"];
  evidenceVia?: Exclude<AutoresearchManifestCampaignEvidenceResult["evidence"], undefined>["via"];
  existingEvidenceId?: number;
  nextStep?: string;
  error?: string;
};

function formatAutoresearchLiveTimestamp(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return new Date(value).toISOString();
}

function formatAutoresearchLiveSessionReport(input: {
  action: AutoresearchLiveSupervisionAction;
  session: AutoresearchLiveSupervisionSessionV1;
  nextStep: string;
  sessionKey?: string;
  extraLines?: string[];
}): string {
  const { action, session, nextStep, sessionKey, extraLines = [] } = input;
  const lines = [
    `Autoresearch live supervision — ${action}`,
    `Task: #${session.taskId}`,
    `CWD: ${session.cwd}`,
    `Session state: ${session.state}`,
    `Polling interval: ${session.policy.intervalSeconds}s`,
    `Started at: ${formatAutoresearchLiveTimestamp(session.startedAt)}`,
    `Last poll: ${formatAutoresearchLiveTimestamp(session.lastPolledAt)}`,
    `Poll count: ${session.pollCount}`,
    `Last runtime state: ${session.lastRuntimeState || "-"}`,
    `Last projection action: ${session.lastProjectionAction || "-"}`,
    `Last lifecycle action: ${session.lastLifecycleAction}`,
    `Last summary: ${session.lastSummary || "-"}`,
    `Last error: ${session.lastError || "-"}`,
    `Next step: ${nextStep}`,
  ];

  if (sessionKey) {
    lines.splice(1, 0, `Session key: ${sessionKey}`);
  }

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  return lines.join("\n");
}

function formatAutoresearchLiveSessionList(
  sessions: readonly AutoresearchLiveSupervisionSessionV1[],
): string {
  if (sessions.length === 0) {
    return "No active live autoresearch supervision sessions.";
  }

  const lines = [`Active live autoresearch supervision sessions: ${sessions.length}`, ""];
  for (const session of sessions) {
    lines.push(
      `- #${session.taskId} ${session.cwd}`,
      `  state: ${session.state}`,
      `  interval: ${session.policy.intervalSeconds}s`,
      `  last runtime: ${session.lastRuntimeState || "-"}`,
      `  projection: ${session.lastProjectionAction || "-"}`,
      `  lifecycle: ${session.lastLifecycleAction}`,
      `  next step: ${describeAutoresearchLiveNextStep(session)}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

function formatAutoresearchLivePollExtras(
  poll: Pick<AutoresearchLivePollResult, "observation" | "projector" | "lifecycle">,
): string[] {
  const lines: string[] = [];
  if (poll.observation) {
    lines.push(`Observed runtime state: ${poll.observation.runtime.runtimeProjection.state}`);
    lines.push(`Observed finalization next step: ${poll.observation.finalization.nextStep}`);
  }
  if (poll.projector) {
    lines.push(`Projection outcome: ${poll.projector.action}`);
  }
  if (poll.lifecycle) {
    lines.push(`Lifecycle outcome: ${poll.lifecycle.action}`);
  }
  return lines;
}

function formatAutoresearchLiveStartReport(result: AutoresearchLiveStartResult): string {
  const extraLines = [
    `Reused existing session: ${result.reused ? "yes" : "no"}`,
    ...(result.poll ? formatAutoresearchLivePollExtras(result.poll) : []),
  ];

  return formatAutoresearchLiveSessionReport({
    action: "start",
    sessionKey: result.sessionKey,
    session: result.session,
    nextStep: result.poll?.nextStep || describeAutoresearchLiveNextStep(result.session),
    extraLines,
  });
}

function formatAutoresearchLiveStopReport(result: AutoresearchLiveStopResult): string {
  if (!result.session) {
    return [
      "Autoresearch live supervision — stop",
      `Session key: ${result.sessionKey}`,
      `Stopped: ${result.stopped ? "yes" : "no"}`,
      `Next step: ${result.nextStep}`,
    ].join("\n");
  }

  return formatAutoresearchLiveSessionReport({
    action: "stop",
    sessionKey: result.sessionKey,
    session: result.session,
    nextStep: result.nextStep,
    extraLines: [`Stopped: ${result.stopped ? "yes" : "no"}`],
  });
}

function formatAutoresearchLiveMissingSession(input: {
  action: "status";
  taskId: number;
  cwd: string;
}): string {
  return [
    "Autoresearch live supervision — status",
    `Task: #${input.taskId}`,
    `CWD: ${path.resolve(input.cwd)}`,
    "Session state: missing",
    "Next step: No live supervision session is active for this task/cwd pair.",
  ].join("\n");
}

function validateAutoresearchLiveIdentity(input: {
  action: AutoresearchLiveSupervisionAction;
  taskId?: number;
  cwd?: string;
}) {
  const hasTaskId = input.taskId !== undefined;
  const hasCwd = input.cwd !== undefined;

  if (input.action === "status" && !hasTaskId && !hasCwd) {
    return;
  }

  if (hasTaskId !== hasCwd) {
    throw new Error(
      `${input.action} requires taskId and cwd together, or neither for action=status.`,
    );
  }

  if (!hasTaskId || !hasCwd) {
    throw new Error(`${input.action} requires an exact taskId and cwd.`);
  }
}

function createAutoresearchLiveToolResult(
  text: string,
  details: AutoresearchLiveSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function formatAutoresearchManifestCampaignObservationReport(input: {
  action: AutoresearchManifestCampaignSupervisionAction;
  observation: AutoresearchManifestCampaignObservation;
  nextStep: string;
  extraLines?: string[];
}) {
  const { action, observation, nextStep, extraLines = [] } = input;
  const { control } = observation.controlResult;
  const lines = [
    `Autoresearch manifest campaign supervision — ${action}`,
    `CWD: ${observation.cwd}`,
    `Manifest: ${observation.manifestPath}`,
    `Observed at: ${formatAutoresearchLiveTimestamp(observation.observedAt)}`,
    `Campaign: ${control.autonomy.manifest.campaignId}`,
    `Overall state: ${control.autonomy.projection.overallState}`,
    `Public next-step action: ${control.public.nextStepAction}`,
    `Task verification: ${control.taskContext.verificationState}`,
    `Verified task: ${control.taskContext.verifiedTaskId ?? "-"}`,
    `AK milestone: ${control.akBinding?.ak.milestone ?? "-"}`,
    `AK check type: ${control.akBinding?.ak.checkType ?? "-"}`,
    `AK projection key: ${control.akBinding?.projection.projectionKey ?? "-"}`,
    `Projection path: ${observation.projectionPath}`,
    `Package next step: ${observation.controlResult.nextAction}`,
  ];

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  lines.push(`Next step: ${nextStep}`);
  return lines.join("\n");
}

function formatAutoresearchManifestCampaignEvidenceReport(
  result: AutoresearchManifestCampaignEvidenceResult,
) {
  const extraLines = [
    `Evidence action: ${result.action}`,
    `Evidence via: ${result.evidence?.via ?? "-"}`,
    `Task repo: ${result.task?.repo ?? "-"}`,
    `Existing evidence id: ${result.existingEvidenceId ?? "-"}`,
    `Blocking error: ${result.error ?? "-"}`,
  ];

  return formatAutoresearchManifestCampaignObservationReport({
    action: "record_evidence",
    observation: result.observation,
    nextStep: result.nextStep,
    extraLines,
  });
}

function createAutoresearchManifestCampaignToolResult(
  text: string,
  details: AutoresearchManifestCampaignSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
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
  const sessionTeams = createSessionTeamStore();
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "society-orchestrator");

  type RuntimeStatusContext = TeamScopedContext & {
    cwd: string;
    model?: { id?: string };
    getContextUsage?: () =>
      | {
          tokens: number | null;
          contextWindow: number;
          percent: number | null;
        }
      | undefined;
  };
  type RuntimeSnapshot = ReturnType<typeof createRuntimeTruthSnapshot>;
  type FooterTheme = {
    fg(color: string, text: string): string;
  };
  type FooterTui = {
    requestRender(): void;
  };
  type CognitiveToolsResult = Awaited<ReturnType<typeof listCognitiveTools>>;
  type FooterHealthState = {
    latestToolsResult?: CognitiveToolsResult;
    lastProbeAt: number;
    probeInFlight?: Promise<void>;
    disposed: boolean;
  };

  function getSessionEntriesForUsage(ctx: RuntimeStatusContext): unknown[] {
    const sessionManager = ctx.sessionManager;
    if (!sessionManager || typeof sessionManager !== "object") {
      return [];
    }

    const manager = sessionManager as {
      getEntries?: () => unknown;
      getBranch?: () => unknown;
    };

    try {
      if (typeof manager.getEntries === "function") {
        const entries = manager.getEntries();
        return Array.isArray(entries) ? entries : [];
      }
      if (typeof manager.getBranch === "function") {
        const entries = manager.getBranch();
        return Array.isArray(entries) ? entries : [];
      }
    } catch {
      return [];
    }

    return [];
  }

  function normalizeSessionTokenCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function summarizeSessionTokens(ctx: RuntimeStatusContext) {
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;

    for (const entry of getSessionEntriesForUsage(ctx)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const messageEntry = entry as {
        type?: unknown;
        message?: {
          role?: unknown;
          usage?: {
            input?: unknown;
            output?: unknown;
            cacheRead?: unknown;
            cacheWrite?: unknown;
          };
        };
      };
      if (messageEntry.type !== "message" || messageEntry.message?.role !== "assistant") {
        continue;
      }

      input += normalizeSessionTokenCount(messageEntry.message.usage?.input);
      output += normalizeSessionTokenCount(messageEntry.message.usage?.output);
      cacheRead += normalizeSessionTokenCount(messageEntry.message.usage?.cacheRead);
      cacheWrite += normalizeSessionTokenCount(messageEntry.message.usage?.cacheWrite);
    }

    return { input, output, cacheRead, cacheWrite };
  }

  function readContextUsage(ctx: RuntimeStatusContext) {
    try {
      return ctx.getContextUsage?.();
    } catch {
      return undefined;
    }
  }

  function buildRuntimeSnapshot(ctx: RuntimeStatusContext, toolsResult?: CognitiveToolsResult) {
    const contextUsage = readContextUsage(ctx);

    return createRuntimeTruthSnapshot({
      cwd: ctx.cwd,
      model: ctx.model?.id,
      activeTeam: sessionTeams.getTeam(ctx),
      contextUsage: contextUsage
        ? {
            tokens: contextUsage.tokens,
            contextWindow: contextUsage.contextWindow,
          }
        : undefined,
      sessionTokens: summarizeSessionTokens(ctx),
      boundaryTelemetry: {
        ...getBoundaryTelemetryStats(),
        latestFailure: getLatestBoundaryTelemetryFailure(),
      },
      societyDbPath: SOCIETY_DB,
      societyDbAvailable: fs.existsSync(SOCIETY_DB),
      vaultAvailable: toolsResult ? !isBoundaryFailure(toolsResult) : false,
      vaultSummary: !toolsResult
        ? "not refreshed in this interaction"
        : isBoundaryFailure(toolsResult)
          ? `unavailable (${toolsResult.error.slice(0, 120)})`
          : `available (${toolsResult.value.length} cognitive tools)`,
    });
  }

  function summarizeFooterHealth(toolsResult?: CognitiveToolsResult) {
    if (!toolsResult) {
      return "unrefreshed";
    }
    return isBoundaryFailure(toolsResult)
      ? `error:${toolsResult.error}`
      : `ok:${toolsResult.value.length}`;
  }

  function createFooterHealthState(initialToolsResult?: CognitiveToolsResult): FooterHealthState {
    return {
      latestToolsResult: initialToolsResult,
      lastProbeAt: initialToolsResult ? Date.now() : 0,
      probeInFlight: undefined,
      disposed: false,
    };
  }

  function shouldRefreshFooterHealth(state: FooterHealthState) {
    if (state.disposed || state.probeInFlight) {
      return false;
    }
    return Date.now() - state.lastProbeAt >= getFooterHealthRefreshMs();
  }

  function refreshFooterHealth(state: FooterHealthState, cwd?: string, tui?: FooterTui) {
    if (!shouldRefreshFooterHealth(state)) {
      return;
    }

    const previousHealth = summarizeFooterHealth(state.latestToolsResult);
    state.lastProbeAt = Date.now();
    state.probeInFlight = (async () => {
      let nextToolsResult: CognitiveToolsResult;
      try {
        nextToolsResult = await listCognitiveTools({ cwd });
      } catch (error) {
        nextToolsResult = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      state.latestToolsResult = nextToolsResult;
      if (!state.disposed && summarizeFooterHealth(nextToolsResult) !== previousHealth) {
        tui?.requestRender();
      }
    })().finally(() => {
      state.probeInFlight = undefined;
    });
  }

  function renderFooterSlotText(
    theme: FooterTheme,
    slots: RuntimeFooterSlot[],
    compactModel = false,
  ) {
    const separator = theme.fg("muted", " · ");
    return slots
      .map((slot) => theme.fg(slot.tone, selectRuntimeFooterSlotText(slot, compactModel)))
      .join(separator);
  }

  function renderRuntimeFooterLine(width: number, theme: FooterTheme, snapshot: RuntimeSnapshot) {
    const layout = fitRuntimeFooterLayout(snapshot, width);
    const rightPlain = joinRuntimeFooterSlotText(layout.right);
    const rightText = renderFooterSlotText(theme, layout.right);
    const rightWidth = visibleWidth(rightPlain);

    if (rightWidth >= width || layout.left.length === 0) {
      return truncateToWidth(rightText, width);
    }

    const leftPlain = joinRuntimeFooterSlotText(layout.left, layout.compactModel);
    const leftText = renderFooterSlotText(theme, layout.left, layout.compactModel);
    const leftWidth = visibleWidth(leftPlain) + 1;
    const paddedRightWidth = rightWidth + 1;
    if (leftWidth + paddedRightWidth + 1 > width) {
      return truncateToWidth(rightText, width);
    }

    const leftSegment = ` ${leftText}`;
    const rightSegment = `${rightText} `;
    const padWidth = Math.max(1, width - leftWidth - paddedRightWidth);
    return leftSegment + " ".repeat(padWidth) + rightSegment;
  }

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
  // TOOL: autoresearch_live_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_live_supervision",
    label: "Autoresearch Live Supervision",
    description:
      "Inspect, start, one-shot observe, or stop live pi-autoresearch supervision sessions above the package runtime.",
    promptSnippet:
      "Observe/start/status/stop a live pi-autoresearch supervision session through the orchestrator.",
    promptGuidelines: [
      "Use autoresearch_live_supervision for exact taskId + cwd supervision above the pi-autoresearch runtime.",
      "Do not invent fuzzy task lookup or hidden daemons; provide exact taskId and cwd for observe/start/stop.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("status"),
          Type.Literal("observe"),
          Type.Literal("start"),
          Type.Literal("stop"),
        ]),
      ),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id for the campaign" })),
      cwd: Type.Optional(Type.String({ description: "Exact campaign cwd" })),
      intervalSeconds: Type.Optional(
        Type.Number({ description: "Polling interval in seconds for action=start|observe" }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const {
        action: requestedAction,
        taskId,
        cwd,
        intervalSeconds,
      } = params as {
        action?: AutoresearchLiveSupervisionAction;
        taskId?: number;
        cwd?: string;
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
      "Observe one exact manifest-driven pi-autoresearch campaign through the orchestrator and optionally record bounded AK evidence from verified task context.",
    promptGuidelines: [
      "Use autoresearch_manifest_campaign_supervision when the caller already knows the exact manifest path and wants one-shot observation or bounded AK evidence projection above the package seam.",
      "Use action=record_evidence only when the caller already has an exact taskId; this surface stays evidence-only and does not add polling, stage execution, or task lifecycle mutation.",
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
  // COMMANDS
  // ===========================================================================

  pi.registerCommand("cognitive", {
    description: "List available cognitive tools from the vault",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
      if (isBoundaryFailure(toolsResult)) {
        ctx.ui.notify(`Failed to list cognitive tools: ${toolsResult.error}`, "error");
        return;
      }

      const tools = toolsResult.value;
      const output = tools.map((t) => `- \`${t.name}\` — ${t.description}`).join("\n");
      await ctx.ui.editor(
        "Cognitive Tools",
        `# Available Cognitive Tools (${tools.length})\n\n${output}`,
      );
    },
  });

  pi.registerCommand("agents-team", {
    description: "Select routing scope",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const options = Object.entries(AGENT_TEAMS).map(([name, agents]) => ({
        value: name as AgentTeam,
        label: `${getAgentTeamDisplayLabel(name)} — ${agents.join(", ")}`,
      }));

      const choice = await ctx.ui.select(
        "Select routing scope",
        options.map((o) => o.label),
      );
      if (choice === undefined) return;

      const idx = options.findIndex((o) => o.label === choice);
      if (idx >= 0) {
        const team = options[idx].value;
        const stored = sessionTeams.setTeam(ctx, team);
        if (!stored) {
          ctx.ui.notify(
            "Cannot set team for this session because no session identity is available.",
            "error",
          );
          return;
        }

        const snapshot = buildRuntimeSnapshot(ctx);
        ctx.ui.notify(
          `${formatRuntimeRoutingStatus(snapshot)} (${AGENT_TEAMS[team].join(", ")})`,
          "info",
        );
      }
    },
  });

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

  pi.registerCommand("runtime-status", {
    description: "Inspect runtime truth and routing status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
      const snapshot = buildRuntimeSnapshot(ctx, toolsResult);
      await ctx.ui.editor("Runtime Status", formatRuntimeStatusReport(snapshot));
    },
  });

  pi.registerCommand("runtime-boundary-telemetry", {
    description: "Inspect lower-plane boundary execution telemetry",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Runtime Boundary Telemetry", summarizeBoundaryTelemetry());
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

      // Load cognitive tool for workflow context
      const toolResult = await getCognitiveToolByName("controlled", { cwd: ctx.cwd }, signal);
      const cognitiveToolContent =
        toolResult && !isBoundaryFailure(toolResult) && toolResult.value
          ? toolResult.value.content
          : "FRAMEWORK: workflow execution";

      const workflowExecutor = createWorkflowExecutor({
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

  // Register loop tools (loop_execute)
  registerLoopTools(pi, undefined, resolveVaultDir(), (agent, ctx) =>
    resolveAgentForTeam(agent, sessionTeams.getTeam(ctx)),
  );

  // Register loop commands (/loop, /loops)
  registerLoopCommands(pi);

  // ===========================================================================
  // SESSION START
  // ===========================================================================

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
    const footerHealthState = createFooterHealthState(toolsResult);
    const snapshot = buildRuntimeSnapshot(ctx, footerHealthState.latestToolsResult);
    const dbOk = snapshot.societyDb.available;
    const vaultStatus = isBoundaryFailure(toolsResult)
      ? `✗ (${toolsResult.error.slice(0, 120)})`
      : `✓ (${toolsResult.value.length} cognitive tools)`;

    ctx.ui.notify(
      `${snapshot.descriptor.extensionTitle}\n` +
        `DB: ${dbOk ? "✓" : "✗"} ${snapshot.societyDb.path}\n` +
        `Vault: ${vaultStatus}\n` +
        `${formatRuntimeRoutingStatus(snapshot)}\n\n` +
        `/cognitive          List cognitive tools\n` +
        `${snapshot.descriptor.routingSelectorCommand.padEnd(20, " ")}Select routing scope\n` +
        `${snapshot.descriptor.runtimeStatusCommand.padEnd(20, " ")}Inspect runtime truth\n` +
        `/runtime-boundary-telemetry Inspect lower-plane telemetry\n` +
        `/evidence           Show evidence\n` +
        `/ontology <query>   Search ontology\n` +
        `/workflow [obj]     Seed workflow_execute call\n` +
        `/workflows          Show workflow wrapper usage\n` +
        `/loops              List loop types\n` +
        `/loop <type> <obj>  Execute loop`,
      isBoundaryFailure(toolsResult) ? "warning" : "info",
    );

    // Footer
    ctx.ui.setFooter((tui, theme, _footerData) => ({
      dispose: () => {
        footerHealthState.disposed = true;
      },
      invalidate() {},
      render(width: number): string[] {
        refreshFooterHealth(footerHealthState, ctx.cwd, tui);
        const footerSnapshot = buildRuntimeSnapshot(ctx, footerHealthState.latestToolsResult);
        return [renderRuntimeFooterLine(width, theme, footerSnapshot)];
      },
    }));
  });
}
