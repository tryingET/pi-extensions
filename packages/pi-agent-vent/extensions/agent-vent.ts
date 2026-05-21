import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
  appendVentRecord,
  CATEGORIES,
  clampLimit,
  createVentRecord,
  defaultStorePath,
  formatRecent,
  formatSummary,
  readVentRecords,
  SEVERITIES,
  summarizeRecords,
} from "../src/vent-store.js";

const ACTIONS = ["record", "summary", "list", "path"] as const;

const AgentVentParams = Type.Object({
  action: Type.Optional(
    Type.Union(
      ACTIONS.map((action) => Type.Literal(action)),
      {
        description:
          "Action to perform. Defaults to record when summary is provided; otherwise summary.",
      },
    ),
  ),
  category: Type.Optional(
    Type.Union(
      CATEGORIES.map((category) => Type.Literal(category)),
      {
        description: "Local category for the frustration pattern.",
      },
    ),
  ),
  severity: Type.Optional(
    Type.Union(
      SEVERITIES.map((severity) => Type.Literal(severity)),
      {
        description: "Local severity estimate. Candidate incidents are still advisory only.",
      },
    ),
  ),
  summary: Type.Optional(
    Type.String({
      description:
        "Short minimized summary. Required for action=record. Do not include secrets or raw user payloads.",
    }),
  ),
  frustration: Type.Optional(
    Type.String({ description: "Brief explanation of why this is frustrating or costly." }),
  ),
  evidence: Type.Optional(
    Type.String({
      description: "Minimal evidence or observation. Prefer pointers over copied logs.",
    }),
  ),
  expected: Type.Optional(Type.String({ description: "What the agent expected to happen." })),
  actual: Type.Optional(Type.String({ description: "What actually happened." })),
  reproduction: Type.Optional(
    Type.String({ description: "Minimal reproduction hint if known; avoid sensitive inputs." }),
  ),
  recurrenceKey: Type.Optional(
    Type.String({
      description: "Stable grouping key for repeated occurrences of the same frustration.",
    }),
  ),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Optional local grouping tags." })),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Maximum rows/groups for list or summary actions.",
    }),
  ),
});

export default function agentVentExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "agent_vent",
    label: "Agent Vent",
    description:
      "Record and inspect local agent frustration events so recurring bugs, workflow friction, and missing affordances become visible.",
    promptSnippet:
      "Record minimized local frustration events and summarize recurring patterns without creating incidents, tasks, issues, or evidence records.",
    promptGuidelines: [
      "Use agent_vent when you encounter recurring agent frustration, long-lived bugs, repeated tool/runtime failures, context-loss patterns, or missing affordances worth later human review.",
      "Do not use agent_vent for ordinary progress updates, single-use complaints, or content that belongs in the final answer.",
      "agent_vent records are local diagnostic events only; agent_vent must not claim to create AK tasks, incidents, GitHub issues, canonical evidence, or external telemetry.",
      "When calling agent_vent, summarize minimally and never include secrets, credentials, private user payloads, or long raw logs.",
    ],
    parameters: AgentVentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storePath = defaultStorePath();
      const action = params.action || (params.summary ? "record" : "summary");

      if (action === "path") {
        return textResult(formatPath(storePath), { action, storePath });
      }

      if (action === "record") {
        const sessionFile = ctx.sessionManager.getSessionFile();
        const record = createVentRecord(params, {
          cwd: ctx.cwd,
          sessionFile: sessionFile ? path.basename(sessionFile) : undefined,
          source: "agent_vent_tool",
        });
        appendVentRecord(storePath, record);
        const { records, malformedLines } = readVentRecords(storePath);
        const group = summarizeRecords(
          records.filter((entry) => entry.recurrenceKey === record.recurrenceKey),
          { limit: 1 },
        ).groups[0];
        const candidate = group?.candidateIncident ? " Candidate incident for human review." : "";
        const text = `Recorded agent vent ${record.id} (${record.severity}/${record.category}) under ${record.recurrenceKey}.${candidate}`;
        return textResult(text, {
          action,
          storePath,
          record,
          recurrenceGroup: group,
          malformedLines,
        });
      }

      const { records, malformedLines } = readVentRecords(storePath);
      if (action === "list") {
        return textResult(formatRecent(records, clampLimit(params.limit)), {
          action,
          storePath,
          count: records.length,
          malformedLines,
        });
      }

      const summary = summarizeRecords(records, { limit: clampLimit(params.limit, 20) });
      return textResult(formatSummary(summary), { action, storePath, summary, malformedLines });
    },
  });

  registerAgentVentCommand(
    pi,
    "agent_vent",
    "Inspect local agent vent records: /agent_vent [help|summary|list|path]",
  );
  registerAgentVentCommand(pi, "agent-vent", "Alias for /agent_vent [help|summary|list|path]");
}

function registerAgentVentCommand(pi: ExtensionAPI, name: string, description: string) {
  pi.registerCommand(name, {
    description,
    handler: async (args, ctx) => {
      const output = handleCommand(args);
      if (ctx.hasUI) {
        ctx.ui.notify(output, "info");
      } else {
        console.log(output);
      }
    },
  });
}

function handleCommand(args: string) {
  const [rawAction, rawLimit] = args.trim().split(/\s+/, 2);
  const action = rawAction || "summary";
  const storePath = defaultStorePath();

  if (action === "help" || action === "--help" || action === "-h") {
    return [
      "agent_vent commands:",
      "  /agent_vent summary        Show recurrence groups and candidate incidents.",
      "  /agent_vent list [limit]   Show recent local vent records.",
      "  /agent_vent path           Show the local JSONL store path.",
      "  /agent-vent ...            Backward-compatible alias.",
      "",
      "LLM tool: agent_vent can record minimized frustration events.",
      "Boundary: local diagnostics only; no AK tasks, GitHub issues, incidents, or external telemetry are created.",
    ].join("\n");
  }

  if (action === "path") {
    return formatPath(storePath);
  }

  const { records, malformedLines } = readVentRecords(storePath);
  const suffix =
    malformedLines > 0 ? `\nWarning: ignored ${malformedLines} malformed JSONL line(s).` : "";
  if (action === "list") {
    return `${formatRecent(records, clampLimit(rawLimit))}${suffix}`;
  }
  if (action === "summary") {
    return `${formatSummary(summarizeRecords(records, { limit: 20 }))}${suffix}`;
  }
  return `Unknown /agent_vent action: ${action}\nRun /agent_vent help for usage.`;
}

function formatPath(storePath: string) {
  return [
    `Agent vent store: ${storePath}`,
    "Schema: append-only JSONL, one local diagnostic vent record per line.",
    "Override: set PI_AGENT_VENT_DIR to use a different private directory.",
    "Authority boundary: records are local diagnostics, not tasks, issues, incidents, or evidence.",
  ].join("\n");
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}
