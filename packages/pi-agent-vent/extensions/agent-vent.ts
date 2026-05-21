import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
  appendCurationEvent,
  appendReviewEvent,
  appendVentRecord,
  assertCanCurateRecurrence,
  buildEscalationDraft,
  buildLifecycleSnapshot,
  CATEGORIES,
  CURATION_ACTIONS,
  clampLimit,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  DRAFT_TARGETS,
  defaultCurationPath,
  defaultReviewPath,
  defaultStorePath,
  formatExportJson,
  formatExportMarkdown,
  formatLifecycleStats,
  formatPath,
  formatRecent,
  formatReviewQueue,
  formatSummary,
  hasRecurrenceGroup,
  normalizeReviewState,
  REVIEW_STATES,
  readCurationEvents,
  readReviewEvents,
  readVentRecords,
  SEVERITIES,
  summarizeRecords,
  summarizeReviewQueue,
} from "../src/vent-store.js";

const ACTIONS = [
  "record",
  "summary",
  "list",
  "path",
  "review",
  "set_review",
  "stats",
  "export",
  "curate",
  "draft",
] as const;
const EXPORT_FORMATS = ["markdown", "json"] as const;

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
      description:
        "Stable grouping key for repeated occurrences, or the target recurrence key for action=set_review.",
    }),
  ),
  curationAction: Type.Optional(
    Type.Union(
      CURATION_ACTIONS.map((action) => Type.Literal(action)),
      {
        description: "Local curation action for action=curate.",
      },
    ),
  ),
  sourceRecurrenceKey: Type.Optional(
    Type.String({ description: "Existing recurrence group key to curate for action=curate." }),
  ),
  targetRecurrenceKey: Type.Optional(
    Type.String({ description: "Target projected recurrence group key for action=curate." }),
  ),
  curationNote: Type.Optional(
    Type.String({
      description:
        "Optional minimized local curation note for action=curate. Do not include secrets or raw payloads.",
    }),
  ),
  reviewState: Type.Optional(
    Type.Union(
      REVIEW_STATES.map((state) => Type.Literal(state)),
      {
        description:
          "Local review state filter for action=review or target state for action=set_review.",
      },
    ),
  ),
  reviewNote: Type.Optional(
    Type.String({
      description:
        "Optional minimized local review note for action=set_review. Do not include secrets or raw payloads.",
    }),
  ),
  exportFormat: Type.Optional(
    Type.Union(
      EXPORT_FORMATS.map((format) => Type.Literal(format)),
      {
        description: "Projection export format for action=export. Defaults to markdown.",
      },
    ),
  ),
  draftTarget: Type.Optional(
    Type.Union(
      DRAFT_TARGETS.map((target) => Type.Literal(target)),
      {
        description: "Draft-only owner surface text target for action=draft.",
      },
    ),
  ),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Optional local grouping tags." })),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Maximum rows/groups for list, summary, or review actions.",
    }),
  ),
});

export default function agentVentExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "agent_vent",
    label: "Agent Vent",
    description:
      "Record, review, and inspect local agent frustration events so recurring bugs, workflow friction, and missing affordances become visible.",
    promptSnippet:
      "Record minimized local frustration events and review recurring patterns without creating incidents, tasks, issues, evidence records, or telemetry.",
    promptGuidelines: [
      "Use agent_vent when you encounter recurring agent frustration, long-lived bugs, repeated tool/runtime failures, context-loss patterns, or missing affordances worth later human review.",
      "Use action=review to inspect the local recurrence review queue and action=set_review to mark a recurrence group as new, acknowledged, dismissed, or escalation_drafted.",
      "Use action=stats or action=export for non-destructive local lifecycle inspection; exports are diagnostic projections, not evidence or escalation.",
      "Use action=curate to append local recurrence merge/rename projection events; raw vent records are not rewritten.",
      "Use action=draft to generate owner-surface draft text only; never claim it submitted, filed, declared, or recorded anything.",
      "Do not use agent_vent for ordinary progress updates, single-use complaints, or content that belongs in the final answer.",
      "agent_vent records and review states are local diagnostics only; agent_vent must not claim to create AK tasks, incidents, GitHub issues, canonical evidence, external telemetry, or ASC/self state.",
      "When calling agent_vent, summarize minimally and never include secrets, credentials, private user payloads, or long raw logs.",
    ],
    parameters: AgentVentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storePath = defaultStorePath();
      const reviewPath = defaultReviewPath();
      const curationPath = defaultCurationPath();
      const action = params.action || (params.summary ? "record" : "summary");

      if (action === "path") {
        return textResult(formatPath(storePath, reviewPath, curationPath), {
          action,
          storePath,
          reviewPath,
          curationPath,
        });
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
        const { events: curationEvents } = readCurationEvents(curationPath);
        const group = summarizeRecords(
          records.filter((entry) => entry.recurrenceKey === record.recurrenceKey),
          { limit: 1, curationEvents },
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
      const { events: curationEvents, malformedLines: malformedCurationLines } =
        readCurationEvents(curationPath);

      if (action === "curate") {
        const input = {
          action: params.curationAction,
          sourceRecurrenceKey: params.sourceRecurrenceKey,
          targetRecurrenceKey: params.targetRecurrenceKey,
          note: params.curationNote,
        };
        assertCanCurateRecurrence(records, curationEvents, input);
        const event = createCurationEvent(input, { source: "agent_vent_tool" });
        appendCurationEvent(curationPath, event);
        const text = [
          `Recorded local recurrence ${event.action} curation: ${event.sourceRecurrenceKey} -> ${event.targetRecurrenceKey}.`,
          "Boundary: local diagnostic curation projection only; raw vents were not rewritten and no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
        ].join("\n");
        return textResult(text, {
          action,
          storePath,
          reviewPath,
          curationPath,
          curationEvent: event,
          malformedLines,
          malformedCurationLines,
        });
      }

      if (action === "set_review") {
        const recurrenceKey = params.recurrenceKey?.trim();
        if (!recurrenceKey) throw new Error("action=set_review requires recurrenceKey");
        if (!params.reviewState) throw new Error("action=set_review requires reviewState");
        if (!hasRecurrenceGroup(records, recurrenceKey, curationEvents)) {
          throw new Error(`cannot set review state for unknown recurrence group: ${recurrenceKey}`);
        }
        const event = createReviewEvent(
          {
            recurrenceKey,
            state: params.reviewState,
            note: params.reviewNote,
          },
          { source: "agent_vent_tool" },
        );
        appendReviewEvent(reviewPath, event);
        const text = [
          `Set local review state for ${event.recurrenceKey} to ${event.state}.`,
          "Boundary: local diagnostic review state only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
        ].join("\n");
        return textResult(text, {
          action,
          storePath,
          reviewPath,
          curationPath,
          reviewEvent: event,
          malformedLines,
          malformedCurationLines,
        });
      }

      if (action === "list") {
        return textResult(formatRecent(records, clampLimit(params.limit)), {
          action,
          storePath,
          count: records.length,
          malformedLines,
        });
      }

      if (action === "review") {
        const { events, malformedLines: malformedReviewLines } = readReviewEvents(reviewPath);
        const queue = summarizeReviewQueue(records, events, {
          state: params.reviewState,
          limit: clampLimit(params.limit, 20),
          curationEvents,
        });
        return textResult(formatReviewQueue(queue), {
          action,
          storePath,
          reviewPath,
          curationPath,
          reviewQueue: queue,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
        });
      }

      if (action === "draft") {
        const { events, malformedLines: malformedReviewLines } = readReviewEvents(reviewPath);
        const draft = buildEscalationDraft({
          target: params.draftTarget,
          recurrenceKey: params.recurrenceKey,
          records,
          reviewEvents: events,
          curationEvents,
          limit: clampLimit(params.limit, 5),
        });
        return textResult(draft.text, {
          action,
          draftTarget: draft.target,
          storePath,
          reviewPath,
          curationPath,
          draft,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
        });
      }

      if (action === "stats" || action === "export") {
        const { events, malformedLines: malformedReviewLines } = readReviewEvents(reviewPath);
        const snapshot = buildLifecycleSnapshot({
          records,
          reviewEvents: events,
          curationEvents,
          storePath,
          reviewPath,
          curationPath,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
          state: params.reviewState || "all",
          limit: clampLimit(params.limit, 20),
        });
        if (action === "stats") {
          return textResult(formatLifecycleStats(snapshot), {
            action,
            storePath,
            reviewPath,
            curationPath,
            lifecycle: snapshot,
          });
        }
        const format = params.exportFormat || "markdown";
        return textResult(
          format === "json" ? formatExportJson(snapshot) : formatExportMarkdown(snapshot),
          {
            action,
            exportFormat: format,
            storePath,
            reviewPath,
            curationPath,
            lifecycle: snapshot,
          },
        );
      }

      const summary = summarizeRecords(records, {
        limit: clampLimit(params.limit, 20),
        curationEvents,
      });
      return textResult(formatSummary(summary), {
        action,
        storePath,
        curationPath,
        summary,
        malformedLines,
        malformedCurationLines,
      });
    },
  });

  registerAgentVentCommand(
    pi,
    "agent_vent",
    "Inspect local agent vent records: /agent_vent [help|summary|list|review|curate|draft|stats|export|path]",
  );
  registerAgentVentCommand(
    pi,
    "agent-vent",
    "Alias for /agent_vent [help|summary|list|review|curate|draft|stats|export|path]",
  );
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
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const action = tokens[0] || "summary";
  const storePath = defaultStorePath();
  const reviewPath = defaultReviewPath();
  const curationPath = defaultCurationPath();

  if (action === "help" || action === "--help" || action === "-h") {
    return [
      "agent_vent commands:",
      "  /agent_vent summary                                  Show recurrence groups and candidate incidents.",
      "  /agent_vent list [limit]                             Show recent local vent records.",
      "  /agent_vent review [new|acknowledged|dismissed|escalation_drafted|all] [limit]",
      "                                                        Show local recurrence review queue.",
      "  /agent_vent review set <state> <recurrenceKey> [note] Set local review state for a recurrence group.",
      "  /agent_vent curate merge <sourceKey> <targetKey> [note] Append a local merge projection event.",
      "  /agent_vent curate rename <sourceKey> <targetKey> [note] Append a local rename projection event.",
      "  /agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]",
      "                                                        Generate draft-only owner-surface text.",
      "  /agent_vent stats                                    Show local store counts, sizes, and review-state totals.",
      "  /agent_vent export [markdown|json] [state|all] [limit] Export a bounded local diagnostic projection.",
      "  /agent_vent path                                     Show local JSONL store paths.",
      "  /agent-vent ...                                      Backward-compatible alias.",
      "",
      "LLM tool: agent_vent can record minimized frustration events, local review states, and local recurrence curation projections.",
      "Boundary: local diagnostics only; no AK tasks, GitHub issues, incidents, evidence, telemetry, or ASC/self state are created.",
    ].join("\n");
  }

  if (action === "path") {
    return formatPath(storePath, reviewPath, curationPath);
  }

  const { records, malformedLines } = readVentRecords(storePath);
  const suffix =
    malformedLines > 0 ? `\nWarning: ignored ${malformedLines} malformed vent JSONL line(s).` : "";

  if (action === "review") {
    return `${handleReviewCommand(tokens.slice(1), records, reviewPath, curationPath)}${suffix}`;
  }
  if (action === "curate") {
    return `${handleCurateCommand(tokens.slice(1), records, curationPath)}${suffix}`;
  }
  if (action === "draft") {
    return handleDraftCommand(tokens.slice(1), records, reviewPath, curationPath);
  }
  if (action === "stats" || action === "export") {
    return handleLifecycleCommand(
      action,
      tokens.slice(1),
      records,
      malformedLines,
      storePath,
      reviewPath,
      curationPath,
    );
  }
  if (action === "list") {
    return `${formatRecent(records, clampLimit(tokens[1]))}${suffix}`;
  }
  if (action === "summary") {
    const { events: curationEvents } = readCurationEvents(curationPath);
    return `${formatSummary(summarizeRecords(records, { limit: 20, curationEvents }))}${suffix}`;
  }
  return `Unknown /agent_vent action: ${action}\nRun /agent_vent help for usage.`;
}

function handleReviewCommand(
  tokens: string[],
  records: unknown[],
  reviewPath: string,
  curationPath: string,
) {
  const { events: curationEvents } = readCurationEvents(curationPath);
  if (tokens[0] === "set") {
    const state = tokens[1];
    const recurrenceKey = tokens[2];
    const note = tokens.slice(3).join(" ");
    if (!state || !recurrenceKey) {
      return "Usage: /agent_vent review set <new|acknowledged|dismissed|escalation_drafted> <recurrenceKey> [note]";
    }
    if (!hasRecurrenceGroup(records, recurrenceKey, curationEvents)) {
      return `Cannot set review state for unknown recurrence group: ${recurrenceKey}`;
    }
    const event = createReviewEvent(
      { recurrenceKey, state, note },
      { source: "agent_vent_command" },
    );
    appendReviewEvent(reviewPath, event);
    return [
      `Set local review state for ${event.recurrenceKey} to ${event.state}.`,
      "Boundary: local diagnostic review state only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
    ].join("\n");
  }

  const first = tokens[0];
  const state = first && !/^\d+$/.test(first) ? first : undefined;
  const rawLimit = state ? tokens[1] : first;
  const normalizedState = state && state !== "all" ? normalizeReviewState(state) : state;
  const { events, malformedLines } = readReviewEvents(reviewPath);
  const queue = summarizeReviewQueue(records, events, {
    state: normalizedState,
    limit: clampLimit(rawLimit, 20),
    curationEvents,
  });
  const suffix =
    malformedLines > 0
      ? `\nWarning: ignored ${malformedLines} malformed review JSONL line(s).`
      : "";
  return `${formatReviewQueue(queue)}${suffix}`;
}

function handleCurateCommand(tokens: string[], records: unknown[], curationPath: string) {
  const curationAction = tokens[0];
  const sourceRecurrenceKey = tokens[1];
  const targetRecurrenceKey = tokens[2];
  const note = tokens.slice(3).join(" ");
  if (!curationAction || !sourceRecurrenceKey || !targetRecurrenceKey) {
    return "Usage: /agent_vent curate <merge|rename> <sourceRecurrenceKey> <targetRecurrenceKey> [note]";
  }
  const { events: curationEvents } = readCurationEvents(curationPath);
  const input = { action: curationAction, sourceRecurrenceKey, targetRecurrenceKey, note };
  assertCanCurateRecurrence(records, curationEvents, input);
  const event = createCurationEvent(input, { source: "agent_vent_command" });
  appendCurationEvent(curationPath, event);
  return [
    `Recorded local recurrence ${event.action} curation: ${event.sourceRecurrenceKey} -> ${event.targetRecurrenceKey}.`,
    "Boundary: local diagnostic curation projection only; raw vents were not rewritten and no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
  ].join("\n");
}

function handleDraftCommand(
  tokens: string[],
  records: unknown[],
  reviewPath: string,
  curationPath: string,
) {
  const draftTarget = tokens[0];
  const recurrenceKey = tokens[1];
  const rawLimit = tokens[2];
  if (!draftTarget || !recurrenceKey) {
    return "Usage: /agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]";
  }
  const { events: reviewEvents } = readReviewEvents(reviewPath);
  const { events: curationEvents } = readCurationEvents(curationPath);
  return buildEscalationDraft({
    target: draftTarget,
    recurrenceKey,
    records,
    reviewEvents,
    curationEvents,
    limit: clampLimit(rawLimit, 5),
  }).text;
}

function handleLifecycleCommand(
  action: string,
  tokens: string[],
  records: unknown[],
  malformedLines: number,
  storePath: string,
  reviewPath: string,
  curationPath: string,
) {
  const { events, malformedLines: malformedReviewLines } = readReviewEvents(reviewPath);
  const { events: curationEvents, malformedLines: malformedCurationLines } =
    readCurationEvents(curationPath);
  const formatToken = tokens[0] === "json" || tokens[0] === "markdown" ? tokens[0] : "markdown";
  const stateToken = formatToken === tokens[0] ? tokens[1] : tokens[0];
  const limitToken = formatToken === tokens[0] ? tokens[2] : tokens[1];
  const normalizedState =
    stateToken && stateToken !== "all" && !/^\d+$/.test(stateToken)
      ? normalizeReviewState(stateToken)
      : stateToken === "all"
        ? "all"
        : "all";
  const rawLimit = /^\d+$/.test(stateToken || "") ? stateToken : limitToken;
  const snapshot = buildLifecycleSnapshot({
    records,
    reviewEvents: events,
    curationEvents,
    storePath,
    reviewPath,
    curationPath,
    malformedLines,
    malformedReviewLines,
    malformedCurationLines,
    state: normalizedState,
    limit: clampLimit(rawLimit, 20),
  });

  if (action === "stats") return formatLifecycleStats(snapshot);
  return formatToken === "json" ? formatExportJson(snapshot) : formatExportMarkdown(snapshot);
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}
