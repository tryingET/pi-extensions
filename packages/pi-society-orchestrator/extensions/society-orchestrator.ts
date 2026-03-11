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
 *   /agents-team                   — Select agent team
 *   /ontology <concept>            — Query ontology
 *   /evidence                      — Show evidence stats
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
 *   society_query                  — Read-only diagnostic SQL against society.db
 *   evidence_record                — Record evidence
 *   ontology_context               — Get relevant ontology
 *   loop_execute                   — Execute structured loops
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES, type AgentDef } from "../src/runtime/agent-profiles.ts";
import {
  buildSqlContainsExpression,
  escapeSqlLiteral,
  execFileText,
  isBoundaryFailure,
  isReadOnlySql,
  querySqliteJson,
  runSqliteStatement,
} from "../src/runtime/boundaries.ts";
import { getCognitiveToolByName, listCognitiveTools } from "../src/runtime/cognitive-tools.ts";

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
const DEFAULT_AK_PATH = path.join(
  os.homedir(),
  "ai-society",
  "softwareco",
  "owned",
  "agent-kernel",
  "target",
  "release",
  "ak",
);
const AGENT_KERNEL =
  process.env.AGENT_KERNEL || (fs.existsSync(DEFAULT_AK_PATH) ? DEFAULT_AK_PATH : "ak");

// ============================================================================
// TYPES
// ============================================================================

interface OntologyConcept {
  concept: string;
  definition: Record<string, unknown>;
  source_repo?: string;
  layer?: string;
}

interface EvidenceEntry {
  task_id?: number;
  check_type: string;
  result: "pass" | "fail" | "skip";
  details?: Record<string, unknown>;
}

// ============================================================================
// DATABASE QUERIES
// ============================================================================

function querySociety<T>(sql: string) {
  return querySqliteJson<T>(SOCIETY_DB, sql);
}

function execSociety(sql: string) {
  return runSqliteStatement(SOCIETY_DB, sql);
}

function runAk(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = execFileText(AGENT_KERNEL, args, {
    env: {
      ...process.env,
      AK_DB: process.env.AK_DB || SOCIETY_DB,
    },
  });

  if (isBoundaryFailure(result)) {
    return {
      ok: false,
      stdout: result.stdout || "",
      stderr: result.stderr || result.error,
    };
  }

  return { ok: true, stdout: result.value, stderr: "" };
}

function buildOntologySearchPredicate(search: string): string {
  return [
    buildSqlContainsExpression("concept", search),
    buildSqlContainsExpression("definition", search),
  ].join(" OR ");
}

function recordEvidence(entry: EvidenceEntry): {
  ok: boolean;
  via: "ak" | "sql-fallback" | "failed";
  akError?: string;
  sqlError?: string;
} {
  const akArgs = ["evidence", "record", "--check-type", entry.check_type, "--result", entry.result];
  if (typeof entry.task_id === "number") {
    akArgs.push("--task", String(entry.task_id));
  }
  if (entry.details) {
    akArgs.push("--details", JSON.stringify(entry.details));
  }

  const akResult = runAk(akArgs);
  if (akResult.ok) {
    return { ok: true, via: "ak" };
  }

  const taskIdSql = typeof entry.task_id === "number" ? `${entry.task_id}` : "NULL";
  const detailsJson = entry.details ? escapeSqlLiteral(JSON.stringify(entry.details)) : "{}";
  const checkTypeSql = escapeSqlLiteral(entry.check_type);
  const resultSql = escapeSqlLiteral(entry.result);
  const sql = `INSERT INTO evidence (task_id, check_type, result, details) VALUES (${taskIdSql}, '${checkTypeSql}', '${resultSql}', '${detailsJson}')`;
  const sqlResult = execSociety(sql);

  if (isBoundaryFailure(sqlResult)) {
    return {
      ok: false,
      via: "failed",
      akError: akResult.stderr.slice(0, 500),
      sqlError: sqlResult.error.slice(0, 500),
    };
  }

  return {
    ok: true,
    via: "sql-fallback",
    akError: akResult.stderr.slice(0, 500),
  };
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

const AGENT_TEAMS: Record<string, string[]> = {
  full: ["scout", "builder", "reviewer"],
  explore: ["scout", "researcher"],
  implement: ["builder", "reviewer"],
  quality: ["reviewer", "researcher"],
};

// ============================================================================
// SUBAGENT SPAWNING
// ============================================================================

interface SubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  stderr?: string;
}

function spawnSubagent(
  def: AgentDef,
  objective: string,
  model: string,
  sessionFile: string,
): Promise<SubagentResult> {
  const startTime = Date.now();

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-extensions",
    "--model",
    model,
    "--tools",
    def.tools,
    "--thinking",
    "off",
    "--append-system-prompt",
    def.systemPrompt,
    "--session",
    sessionFile,
    objective,
  ];

  const textChunks: string[] = [];

  return new Promise((resolve) => {
    const proc = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let buffer = "";
    let stderr = "";

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_update") {
            const delta = event.assistantMessageEvent;
            if (delta?.type === "text_delta") {
              textChunks.push(delta.delta || "");
            }
          }
        } catch {}
      }
    });

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    proc.on("close", (code) => {
      const output = textChunks.join("") || stderr || `pi exited with code ${code ?? 1}`;
      resolve({
        output,
        exitCode: code ?? 1,
        elapsed: Date.now() - startTime,
        stderr: stderr || undefined,
      });
    });

    proc.on("error", (err) => {
      resolve({
        output: `Error: ${err.message}`,
        exitCode: 1,
        elapsed: Date.now() - startTime,
        stderr: err.message,
      });
    });
  });
}

// ============================================================================
// EXTENSION
// ============================================================================

export default function (pi: ExtensionAPI) {
  let activeTeam = "full";
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "society-orchestrator");

  // Ensure sessions directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // ===========================================================================
  // TOOL: society_query
  // ===========================================================================

  pi.registerTool({
    name: "society_query",
    label: "Society Query",
    description: "Execute a read-only diagnostic SQL query against society.db.",
    parameters: Type.Object({
      query: Type.String({ description: "Read-only SQL query to execute" }),
    }),
    async execute(_toolCallId, params) {
      const { query } = params as { query: string };

      if (!isReadOnlySql(query)) {
        return {
          content: [
            {
              type: "text",
              text: "society_query only allows read-only SELECT/EXPLAIN/PRAGMA statements.",
            },
          ],
          details: { ok: false, rowCount: 0, error: "read-only-query-required" },
        };
      }

      const results = querySociety<Record<string, unknown>>(query);
      if (isBoundaryFailure(results)) {
        return {
          content: [{ type: "text", text: `society_query failed: ${results.error}` }],
          details: { ok: false, rowCount: 0, error: results.error },
        };
      }

      if (results.value.length === 0) {
        return {
          content: [{ type: "text", text: "No results found." }],
          details: { ok: true, rowCount: 0, error: "" },
        };
      }

      const output = JSON.stringify(results.value, null, 2);
      const truncated = output.length > 8000 ? `${output.slice(0, 8000)}\n... [truncated]` : output;

      return {
        content: [{ type: "text", text: truncated }],
        details: { ok: true, rowCount: results.value.length, error: "" },
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
    parameters: Type.Object({
      context: Type.String({ description: "The situation or problem context" }),
      agent: Type.Optional(Type.String({ description: "Agent to use (default: auto-select)" })),
      cognitive_tool: Type.Optional(
        Type.String({ description: "Cognitive tool to inject (default: auto-select)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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
      const toolResult = getCognitiveToolByName(VAULT_DIR, toolToUse);
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

      // Auto-select agent if not specified
      let agentToUse = agent;
      if (!agentToUse) {
        const ctxLower = context.toLowerCase();
        if (
          ctxLower.includes("implement") ||
          ctxLower.includes("build") ||
          ctxLower.includes("fix")
        ) {
          agentToUse = "builder";
        } else if (ctxLower.includes("review") || ctxLower.includes("check")) {
          agentToUse = "reviewer";
        } else if (
          ctxLower.includes("find") ||
          ctxLower.includes("explore") ||
          ctxLower.includes("search")
        ) {
          agentToUse = "scout";
        } else {
          agentToUse = "scout";
        }
      }

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

      // Create combined system prompt
      const combinedPrompt = `${tool.content}

---

## OBJECTIVE

${context}`;

      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : `openrouter/google/gemini-2.5-flash-preview`;
      const sessionFile = path.join(sessionsDir, `${agentToUse}-${toolToUse}-${Date.now()}.json`);

      // Spawn the agent
      const result = await spawnSubagent(
        { ...agentDef, systemPrompt: combinedPrompt },
        context,
        model,
        sessionFile,
      );

      const icon = result.exitCode === 0 ? "✓" : "✗";
      const status = result.exitCode === 0 ? "done" : "error";
      const evidenceOutcome = recordEvidence({
        check_type: "cognitive:dispatch",
        result: result.exitCode === 0 ? "pass" : "fail",
        details: {
          tool: toolToUse,
          agent: agentToUse,
          context: context.slice(0, 100),
          exitCode: result.exitCode,
          status,
          elapsed: result.elapsed,
        },
      });
      const summary = `${icon} [${agentToUse} + ${toolToUse}] ${status} in ${Math.round(result.elapsed / 1000)}s`;
      const evidenceDiagnostics = [
        evidenceOutcome.akError ? `ak error: ${evidenceOutcome.akError.slice(0, 120)}` : undefined,
        evidenceOutcome.sqlError
          ? `sql error: ${evidenceOutcome.sqlError.slice(0, 120)}`
          : undefined,
      ].filter(Boolean);
      const evidenceNote =
        evidenceOutcome.via === "ak"
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
          elapsed: result.elapsed,
          fullOutput: result.output,
          evidenceOk: evidenceOutcome.ok,
          evidenceVia: evidenceOutcome.via,
          evidenceAkError: evidenceOutcome.akError,
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
    parameters: Type.Object({
      check_type: Type.String({
        description: "Type of check (e.g., 'validation:test', 'cognitive:inversion')",
      }),
      result: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("skip")]),
      task_id: Type.Optional(Type.Number({ description: "Associated task ID" })),
      details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_toolCallId, params) {
      const outcome = recordEvidence(params as EvidenceEntry & { task_id?: number });
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
    parameters: Type.Object({
      concept: Type.Optional(Type.String({ description: "Specific concept to look up" })),
      search: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_toolCallId, params) {
      const { concept, search } = params as { concept?: string; search?: string };

      let sql: string;
      if (concept) {
        sql = `SELECT concept, definition, layer FROM ontology WHERE concept = '${escapeSqlLiteral(concept)}'`;
      } else if (search) {
        sql = `SELECT concept, definition, layer FROM ontology WHERE ${buildOntologySearchPredicate(search)} LIMIT 10`;
      } else {
        sql = "SELECT concept, definition, layer FROM ontology LIMIT 20";
      }

      const results = querySociety<OntologyConcept>(sql);
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

      const output = results.value
        .map((r) => {
          const def =
            typeof r.definition === "string" ? r.definition : JSON.stringify(r.definition);
          return `## ${r.concept}${r.layer ? ` (${r.layer})` : ""}\n${def}`;
        })
        .join("\n\n");

      return {
        content: [{ type: "text", text: output }],
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

      const toolsResult = listCognitiveTools(VAULT_DIR);
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
    description: "Select an agent team",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const options = Object.entries(AGENT_TEAMS).map(([name, agents]) => ({
        value: name,
        label: `${name} — ${agents.join(", ")}`,
      }));

      const choice = await ctx.ui.select(
        "Select Team",
        options.map((o) => o.label),
      );
      if (choice === undefined) return;

      const idx = options.findIndex((o) => o.label === choice);
      if (idx >= 0) {
        activeTeam = options[idx].value;
        ctx.ui.notify(`Team: ${activeTeam} (${AGENT_TEAMS[activeTeam].join(", ")})`, "info");
      }
    },
  });

  pi.registerCommand("evidence", {
    description: "Show recent evidence from society.db",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const results = querySociety<{ check_type: string; result: string; created_at: string }>(
        "SELECT check_type, result, created_at FROM evidence ORDER BY created_at DESC LIMIT 20",
      );
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query evidence: ${results.error}`, "error");
        return;
      }

      if (results.value.length === 0) {
        ctx.ui.notify("No evidence recorded yet.", "info");
        return;
      }

      const output = results.value
        .map((r) => `${r.created_at?.slice(0, 19) || "?"} | ${r.check_type} = ${r.result}`)
        .join("\n");
      await ctx.ui.editor("Evidence Ledger", output);
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

      const results = querySociety<{ concept: string; definition: string }>(
        `SELECT concept, definition FROM ontology WHERE ${buildOntologySearchPredicate(search)} LIMIT 10`,
      );
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query ontology: ${results.error}`, "error");
        return;
      }

      if (results.value.length === 0) {
        ctx.ui.notify(`No concepts found for: ${search}`, "warning");
        return;
      }

      const output = results.value.map((r) => `## ${r.concept}\n${r.definition}`).join("\n\n");
      await ctx.ui.editor("Ontology", output);
    },
  });

  // ===========================================================================
  // LOOP ENGINE REGISTRATION
  // ===========================================================================

  // Register loop tools (loop_execute)
  registerLoopTools(pi, undefined, VAULT_DIR);

  // Register loop commands (/loop, /loops)
  registerLoopCommands(pi);

  // ===========================================================================
  // SESSION START
  // ===========================================================================

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Check connections
    const dbOk = fs.existsSync(SOCIETY_DB);
    const toolsResult = listCognitiveTools(VAULT_DIR);
    const vaultStatus = isBoundaryFailure(toolsResult)
      ? `✗ (${toolsResult.error.slice(0, 120)})`
      : `✓ (${toolsResult.value.length} cognitive tools)`;

    ctx.ui.notify(
      `Society Orchestrator\n` +
        `DB: ${dbOk ? "✓" : "✗"} ${SOCIETY_DB}\n` +
        `Vault: ${vaultStatus}\n` +
        `Team: ${activeTeam}\n\n` +
        `/cognitive          List cognitive tools\n` +
        `/agents-team        Select team\n` +
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
        const model = ctx.model?.id || "no-model";
        const left =
          theme.fg("dim", ` ${model}`) + theme.fg("muted", " · ") + theme.fg("accent", `orchestra`);
        const right = theme.fg("dim", `Team: ${activeTeam} `);
        const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
        return [truncateToWidth(left + pad + right, width)];
      },
    }));
  });
}
