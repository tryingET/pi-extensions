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
 *   /ontology <concept>            — Query ontology
 *   /evidence                      — Show recent evidence via ak evidence search
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
 *   ontology_context               — Get relevant ontology
 *   loop_execute                   — Execute structured loops
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import {
  AGENT_TEAMS,
  type AgentTeam,
  autoSelectAgent,
  resolveAgentForTeam,
} from "../src/runtime/agent-routing.ts";
import { resolveAkPath } from "../src/runtime/ak.ts";
import { isBoundaryFailure } from "../src/runtime/boundaries.ts";
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
  formatRuntimeFooterLeft,
  formatRuntimeRoutingStatus,
  formatRuntimeStatusReport,
} from "../src/runtime/status-semantics.ts";
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../src/runtime/subagent.ts";
import { createSessionTeamStore, type TeamScopedContext } from "../src/runtime/team-state.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
const VAULT_DIR =
  process.env.VAULT_DIR ||
  path.join(os.homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db");
const AGENT_KERNEL = resolveAkPath({ cwd: process.cwd() });

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

// ============================================================================
// EXTENSION
// ============================================================================

export default function (pi: ExtensionAPI) {
  const sessionTeams = createSessionTeamStore();
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "society-orchestrator");

  type RuntimeStatusContext = TeamScopedContext & {
    cwd: string;
    model?: { id?: string };
  };

  function buildRuntimeSnapshot(
    ctx: RuntimeStatusContext,
    toolsResult?: Awaited<ReturnType<typeof listCognitiveTools>>,
  ) {
    return createRuntimeTruthSnapshot({
      cwd: ctx.cwd,
      model: ctx.model?.id,
      activeTeam: sessionTeams.getTeam(ctx),
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

  // Ensure sessions directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const subagentExecutor = createOrchestratorSubagentExecutor({ sessionsDir });

  // ===========================================================================
  // TOOL: society_query
  // ===========================================================================

  pi.registerTool({
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
  // TOOL: cognitive_dispatch
  // ===========================================================================

  pi.registerTool({
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
      const toolResult = await getCognitiveToolByName(VAULT_DIR, toolToUse, signal);
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
      const evidenceSqlError = "sqlError" in evidenceOutcome ? evidenceOutcome.sqlError : undefined;
      const evidenceDiagnostics = [
        evidenceAkError ? `ak error: ${evidenceAkError.slice(0, 120)}` : undefined,
        evidenceSqlError ? `sql error: ${evidenceSqlError.slice(0, 120)}` : undefined,
      ].filter(Boolean);
      const evidenceNote =
        evidenceOutcome.via === "ak" || evidenceOutcome.via === "sql-direct"
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

  pi.registerTool({
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
        outcome.sqlError ? `sql error: ${outcome.sqlError.slice(0, 200)}` : undefined,
      ].filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: outcome.ok
              ? `Evidence recorded via ${outcome.via}: ${check_type} = ${result}`
              : `Failed to record evidence (ak and SQL both failed). ${failureDiagnostics.join("; ") || "unknown failure"}`,
          },
        ],
        details: {
          ok: outcome.ok,
          via: outcome.via,
          akError: outcome.akError,
          sqlError: outcome.sqlError,
        },
      };
    },
  });

  // ===========================================================================
  // TOOL: ontology_context
  // ===========================================================================

  pi.registerTool({
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
  // COMMANDS
  // ===========================================================================

  pi.registerCommand("cognitive", {
    description: "List available cognitive tools from the vault",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const toolsResult = await listCognitiveTools(VAULT_DIR);
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
        label: `${name} — ${agents.join(", ")}`,
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

      const toolsResult = await listCognitiveTools(VAULT_DIR);
      const snapshot = buildRuntimeSnapshot(ctx, toolsResult);
      await ctx.ui.editor("Runtime Status", formatRuntimeStatusReport(snapshot));
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
  // LOOP ENGINE REGISTRATION
  // ===========================================================================

  // Register loop tools (loop_execute)
  registerLoopTools(pi, undefined, VAULT_DIR, (agent, ctx) =>
    resolveAgentForTeam(agent, sessionTeams.getTeam(ctx)),
  );

  // Register loop commands (/loop, /loops)
  registerLoopCommands(pi);

  // ===========================================================================
  // SESSION START
  // ===========================================================================

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const toolsResult = await listCognitiveTools(VAULT_DIR);
    const snapshot = buildRuntimeSnapshot(ctx, toolsResult);
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
        `/evidence           Show evidence\n` +
        `/ontology <query>   Search ontology\n` +
        `/loops              List loop types\n` +
        `/loop <type> <obj>  Execute loop`,
      isBoundaryFailure(toolsResult) ? "warning" : "info",
    );

    // Footer
    ctx.ui.setFooter((_tui, theme, _footerData) => ({
      dispose: () => {},
      invalidate() {},
      render(width: number): string[] {
        const footerSnapshot = buildRuntimeSnapshot(ctx);
        const [modelLabel, seamLabel = footerSnapshot.descriptor.executionSeamLabel] =
          formatRuntimeFooterLeft(footerSnapshot).split(" · ");
        const left =
          theme.fg("dim", ` ${modelLabel}`) +
          theme.fg("muted", " · ") +
          theme.fg("accent", seamLabel);
        const right = theme.fg("dim", `${formatRuntimeRoutingStatus(footerSnapshot)} `);
        const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
        return [truncateToWidth(left + pad + right, width)];
      },
    }));
  });
}
