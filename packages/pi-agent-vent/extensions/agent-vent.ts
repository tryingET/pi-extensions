import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  appendCurationEvent,
  appendReviewEvent,
  appendVentRecord,
  archiveRecurrenceGroup,
  assertCanCurateRecurrence,
  buildEscalationDraft,
  buildFacetSummary,
  buildLifecycleSnapshot,
  buildRetentionCandidates,
  buildRetentionHistory,
  buildRetentionPreview,
  buildReviewComparison,
  buildReviewDetail,
  buildReviewOutcomes,
  CATEGORIES,
  CATEGORY_ALIASES,
  CURATION_ACTIONS,
  clampLimit,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  DRAFT_TARGETS,
  defaultBackupDir,
  defaultCurationPath,
  defaultRetentionPath,
  defaultReviewPath,
  defaultStorePath,
  formatExportJson,
  formatExportMarkdown,
  formatFacetSummary,
  formatLifecycleStats,
  formatPath,
  formatRecent,
  formatRetentionArchiveResult,
  formatRetentionCandidates,
  formatRetentionHistory,
  formatRetentionPreview,
  formatRetentionRestoreResult,
  formatReviewComparison,
  formatReviewDetail,
  formatReviewOutcomes,
  formatReviewQueue,
  formatSummary,
  loadDiagnosticState,
  normalizeRetentionAction,
  normalizeReviewState,
  RETENTION_ACTIONS,
  readRetentionEvents,
  resolveCategoryFilter,
  resolveRecurrenceGroup,
  restoreRetentionBackup,
  SEVERITIES,
  REVIEW_STATES as STORE_REVIEW_STATES,
  summarizeRecords,
  summarizeReviewQueue,
} from "../src/vent-store.js";

const ACTIONS = [
  "record",
  "summary",
  "list",
  "path",
  "review",
  "outcomes",
  "compare",
  "set_review",
  "stats",
  "export",
  "facets",
  "curate",
  "draft",
  "retention",
] as const;
const EXPORT_FORMATS = ["markdown", "json"] as const;
const FALLBACK_REVIEW_STATES = ["new", "acknowledged", "dismissed", "escalation_drafted"] as const;
const REVIEW_STATES = Array.isArray(STORE_REVIEW_STATES)
  ? STORE_REVIEW_STATES
  : FALLBACK_REVIEW_STATES;
const RETENTION_CANDIDATE_STATES = ["reviewed", "all", ...REVIEW_STATES] as const;
const CATEGORY_INPUTS = [...CATEGORIES, ...Object.keys(CATEGORY_ALIASES)] as const;

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
      CATEGORY_INPUTS.map((category) => Type.Literal(category)),
      {
        description:
          "Local category for the frustration pattern. Common aliases are accepted and normalized to canonical categories.",
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
  tool: Type.Optional(
    Type.String({ description: "Optional local diagnostic tool facet. Not owner routing." }),
  ),
  packageName: Type.Optional(
    Type.String({ description: "Optional local diagnostic package facet. Not owner routing." }),
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
          "Local review state filter for action=review/outcomes or target state for action=set_review.",
      },
    ),
  ),
  retentionCandidateState: Type.Optional(
    Type.Union(
      RETENTION_CANDIDATE_STATES.map((state) => Type.Literal(state)),
      {
        description:
          "Local state filter for action=retention with retentionAction=candidates. Defaults to reviewed; reviewed means acknowledged, dismissed, or escalation_drafted.",
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
  retentionAction: Type.Optional(
    Type.Union(
      RETENTION_ACTIONS.map((action) => Type.Literal(action)),
      {
        description:
          "Local data lifecycle action for action=retention: candidates, history, preview, archive, or restore. Only archive/restore mutate local diagnostic stores and require confirmation tokens.",
      },
    ),
  ),
  confirmationToken: Type.Optional(
    Type.String({ description: "Exact retention confirmation token shown by preview or archive." }),
  ),
  backupPath: Type.Optional(
    Type.String({
      description: "Package-created retention backup path for action=retention restore.",
    }),
  ),
  retentionNote: Type.Optional(
    Type.String({
      description: "Optional minimized local retention note. Do not include secrets.",
    }),
  ),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Optional local grouping tags." })),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description:
        "Maximum rows/groups for list, summary, review, outcomes, compare, export, or retention planning actions.",
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
      "Use action=review to inspect the local recurrence review queue; include recurrenceKey to inspect bounded representative samples for one local group; optionally filter review by local category, tag, tool, or package facets; use action=set_review to mark a recurrence group as new, acknowledged, dismissed, or escalation_drafted.",
      "Use action=outcomes for read-only post-review follow-up across local review-state buckets; outcome guidance is local diagnostic UX only, not owner routing or external completion.",
      "Use action=compare for a read-only cross-state review comparison before export, retention planning, or draft-only handoff; comparison output emits no archive/restore tokens and mutates nothing.",
      "Use action=facets for read-only local category/tag/tool/package triage; facets and review filters are caller-supplied diagnostic labels, not owner routing.",
      "Use action=stats or action=export for non-destructive local lifecycle inspection; exports are diagnostic projections, not evidence or escalation. Export may be focused by local category/tag/tool/package facets; those facets are not owner routing.",
      "Use action=curate to append local recurrence merge/rename projection events; raw vent records are not rewritten.",
      "Use action=draft to generate owner-surface draft text only; never claim it submitted, filed, declared, or recorded anything.",
      "Use action=retention to list read-only archive candidates or retention history, preview, confirmation-gate, archive, or restore local diagnostic records only; never imply owner-system deletion or canonical evidence changes.",
      "Do not use agent_vent for ordinary progress updates, single-use complaints, or content that belongs in the final answer.",
      "agent_vent records and review states are local diagnostics only; agent_vent must not claim to create AK tasks, incidents, GitHub issues, canonical evidence, external telemetry, or ASC/self state.",
      "When calling agent_vent, summarize minimally and never include secrets, credentials, private user payloads, or long raw logs.",
    ],
    parameters: AgentVentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storePath = defaultStorePath();
      const reviewPath = defaultReviewPath();
      const curationPath = defaultCurationPath();
      const retentionPath = defaultRetentionPath();
      const backupDir = defaultBackupDir();
      const action = params.action || (params.summary ? "record" : "summary");

      if (action === "path") {
        return textResult(
          formatPath(storePath, reviewPath, curationPath, retentionPath, backupDir),
          {
            action,
            storePath,
            reviewPath,
            curationPath,
            retentionPath,
            backupDir,
          },
        );
      }

      if (action === "record") {
        const sessionFile = ctx.sessionManager.getSessionFile();
        const record = createVentRecord(params, {
          cwd: ctx.cwd,
          sessionFile: sessionFile ? path.basename(sessionFile) : undefined,
          source: "agent_vent_tool",
        });
        appendVentRecord(storePath, record);
        const state = loadDiagnosticState({
          storePath,
          reviewPath,
          curationPath,
          retentionPath,
          backupDir,
        });
        const { records, curationEvents, malformedLines } = state;
        const group =
          resolveRecurrenceGroup(records, record.recurrenceKey, curationEvents)?.group ||
          summarizeRecords(
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

      if (
        action === "retention" &&
        normalizeRetentionAction(params.retentionAction || "preview") === "history"
      ) {
        const retentions = readRetentionEvents(retentionPath);
        const history = buildRetentionHistory({
          retentionEvents: retentions.events,
          backupDir,
          limit: clampLimit(params.limit, 20),
        });
        const suffix = formatRetentionReadWarnings(retentions);
        return textResult(`${formatRetentionHistory(history)}${suffix}`, {
          action,
          retentionAction: "history",
          retentionPath,
          backupDir,
          retention: history,
          malformedRetentionLines: retentions.malformedLines,
          oversizedRetentionLines: retentions.oversizedLines,
          invalidRetentionEvents: retentions.invalidEvents,
        });
      }

      const state = loadDiagnosticState({
        storePath,
        reviewPath,
        curationPath,
        retentionPath,
        backupDir,
      });
      const {
        records,
        reviewEvents,
        curationEvents,
        retentionEvents,
        malformedLines,
        malformedReviewLines,
        malformedCurationLines,
        malformedRetentionLines,
        oversizedLines,
        oversizedReviewLines,
        oversizedCurationLines,
        oversizedRetentionLines,
        invalidRecords,
        invalidReviewEvents,
        invalidCurationEvents,
        invalidRetentionEvents,
        quarantinedCurationEvents,
      } = state;

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
        const targetText = event.targetRecurrenceKey ? ` -> ${event.targetRecurrenceKey}` : "";
        const text = [
          `Recorded local recurrence ${event.action} curation: ${event.sourceRecurrenceKey}${targetText}.`,
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
        const resolved = resolveRecurrenceGroup(records, recurrenceKey, curationEvents);
        if (!resolved) {
          throw new Error(`cannot set review state for unknown recurrence group: ${recurrenceKey}`);
        }
        const event = createReviewEvent(
          {
            recurrenceKey: resolved.recurrenceKey,
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

      if (action === "facets") {
        const facets = buildFacetSummary({
          records,
          reviewEvents,
          curationEvents,
          limit: clampLimit(params.limit, 10),
        });
        return textResult(formatFacetSummary(facets), {
          action,
          storePath,
          reviewPath,
          curationPath,
          facets,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
        });
      }

      if (action === "outcomes") {
        const outcomes = buildReviewOutcomes({
          records,
          reviewEvents,
          curationEvents,
          state: params.reviewState || "all",
          limit: clampLimit(params.limit, 5),
          filters: {
            category: params.category,
            tool: params.tool,
            packageName: params.packageName,
            tags: params.tags,
          },
        });
        return textResult(formatReviewOutcomes(outcomes), {
          action,
          storePath,
          reviewPath,
          curationPath,
          reviewOutcomes: outcomes,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
        });
      }

      if (action === "compare") {
        const comparison = buildReviewComparison({
          records,
          reviewEvents,
          curationEvents,
          limit: clampLimit(params.limit, 5),
          filters: {
            category: params.category,
            tool: params.tool,
            packageName: params.packageName,
            tags: params.tags,
          },
        });
        return textResult(formatReviewComparison(comparison), {
          action,
          storePath,
          reviewPath,
          curationPath,
          reviewComparison: comparison,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
        });
      }

      if (action === "review") {
        if (params.recurrenceKey) {
          const detail = buildReviewDetail({
            recurrenceKey: params.recurrenceKey,
            records,
            reviewEvents,
            curationEvents,
            limit: clampLimit(params.limit, 5),
          });
          return textResult(formatReviewDetail(detail), {
            action,
            storePath,
            reviewPath,
            curationPath,
            reviewDetail: detail,
            malformedLines,
            malformedReviewLines,
            malformedCurationLines,
          });
        }
        const queue = summarizeReviewQueue(records, reviewEvents, {
          state: params.reviewState,
          limit: clampLimit(params.limit, 20),
          curationEvents,
          filters: {
            category: params.category,
            tool: params.tool,
            packageName: params.packageName,
            tags: params.tags,
          },
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
        const draft = buildEscalationDraft({
          target: params.draftTarget,
          recurrenceKey: params.recurrenceKey,
          records,
          reviewEvents,
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

      if (action === "retention") {
        const retentionAction = normalizeRetentionAction(params.retentionAction || "preview");
        if (retentionAction === "candidates") {
          const candidates = buildRetentionCandidates({
            records,
            reviewEvents,
            curationEvents,
            state: params.retentionCandidateState || params.reviewState,
            limit: clampLimit(params.limit, 20),
            filters: {
              category: params.category,
              tool: params.tool,
              packageName: params.packageName,
              tags: params.tags,
            },
          });
          return textResult(formatRetentionCandidates(candidates), {
            action,
            retentionAction,
            storePath,
            reviewPath,
            curationPath,
            retentionPath,
            backupDir,
            retention: candidates,
          });
        }
        if (retentionAction === "preview") {
          const preview = buildRetentionPreview({
            recurrenceKey: params.recurrenceKey,
            records,
            reviewEvents,
            curationEvents,
            storeHash: state.ventsHash,
            reviewHash: state.reviewEventsHash,
            curationHash: state.curationEventsHash,
            limit: clampLimit(params.limit, 5),
          });
          return textResult(formatRetentionPreview(preview), {
            action,
            retentionAction,
            storePath,
            reviewPath,
            curationPath,
            retentionPath,
            backupDir,
            retention: preview,
          });
        }
        if (retentionAction === "archive") {
          const result = archiveRecurrenceGroup({
            storePath,
            reviewPath,
            curationPath,
            retentionPath,
            backupDir,
            recurrenceKey: params.recurrenceKey,
            confirmationToken: params.confirmationToken,
            note: params.retentionNote,
            source: "agent_vent_tool",
          });
          return textResult(formatRetentionArchiveResult(result), {
            action,
            retentionAction,
            storePath,
            reviewPath,
            curationPath,
            retentionPath,
            backupDir,
            retention: result,
          });
        }
        const result = restoreRetentionBackup({
          storePath,
          retentionPath,
          backupDir,
          backupPath: params.backupPath,
          confirmationToken: params.confirmationToken,
          note: params.retentionNote,
          source: "agent_vent_tool",
        });
        return textResult(formatRetentionRestoreResult(result), {
          action,
          retentionAction,
          storePath,
          retentionPath,
          backupDir,
          retention: result,
        });
      }

      if (action === "stats" || action === "export") {
        const snapshot = buildLifecycleSnapshot({
          records,
          reviewEvents,
          curationEvents,
          retentionEvents,
          storePath,
          reviewPath,
          curationPath,
          retentionPath,
          backupDir,
          malformedLines,
          malformedReviewLines,
          malformedCurationLines,
          malformedRetentionLines,
          oversizedLines,
          oversizedReviewLines,
          oversizedCurationLines,
          oversizedRetentionLines,
          invalidRecords,
          invalidReviewEvents,
          invalidCurationEvents,
          invalidRetentionEvents,
          quarantinedCurationEvents,
          state: params.reviewState || "all",
          limit: clampLimit(params.limit, 20),
          filters:
            action === "export"
              ? {
                  category: params.category,
                  tool: params.tool,
                  packageName: params.packageName,
                  tags: params.tags,
                }
              : undefined,
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
    "Inspect local agent_vent records: /agent_vent [help|summary|list|facets|review|outcomes|compare|curate|draft|retention|stats|export|path]",
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
  const tokens = splitCommandArgs(args);
  const action = tokens[0] || "summary";
  const storePath = defaultStorePath();
  const reviewPath = defaultReviewPath();
  const curationPath = defaultCurationPath();
  const retentionPath = defaultRetentionPath();
  const backupDir = defaultBackupDir();

  if (action === "help" || action === "--help" || action === "-h") {
    return [
      "agent_vent commands:",
      "  /agent_vent summary                                  Show recurrence groups and candidate incidents.",
      "  /agent_vent list [limit]                             Show recent local vent records.",
      "  /agent_vent facets [limit]                           Show read-only local category/tag/tool/package facets.",
      "  /agent_vent review [state|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]",
      "                                                        Show local recurrence review queue with optional local facet filters.",
      "  /agent_vent review show <recurrenceKey> [limit]      Show bounded representative local samples.",
      "  /agent_vent review set <state> <recurrenceKey> [note] Set local review state for a recurrence group.",
      "  /agent_vent outcomes [state|all] [per-state-limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]",
      "                                                        Show read-only local follow-up by review outcome bucket.",
      "  /agent_vent compare [per-state-limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]",
      "                                                        Compare local review-state buckets before export, retention planning, or draft-only handoff.",
      "  /agent_vent curate merge <sourceKey> <targetKey> [note] Append a local merge projection event.",
      "  /agent_vent curate rename <sourceKey> <targetKey> [note] Append a local rename projection event.",
      "  /agent_vent curate remove <sourceKey> [note]             Append a local curation undo event.",
      "  /agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]",
      "                                                        Generate draft-only owner-surface text.",
      "  /agent_vent retention candidates [reviewed|state|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]",
      "                                                        Show read-only reviewed groups ready for retention planning, without tokens.",
      "  /agent_vent retention history [limit]                Show read-only local archive/restore receipt history and restore candidates.",
      "  /agent_vent retention preview <recurrenceKey>        Preview exact local records and confirmation token.",
      "  /agent_vent retention archive <recurrenceKey> <token> [note]",
      "                                                        Archive reviewed local records with a backup receipt.",
      "  /agent_vent retention restore <backupPath> <token> [note]",
      "                                                        Restore a package-created local retention backup.",
      "  /agent_vent stats                                    Show local store counts, sizes, and review-state totals.",
      "  /agent_vent export [markdown|json] [state|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]",
      "                                                        Export a bounded local diagnostic projection, optionally facet-filtered.",
      "  /agent_vent path                                     Show local JSONL store paths.",
      "",
      "LLM tool: agent_vent can record minimized frustration events, local review states, local recurrence curation projections, and read-only review comparisons.",
      "Boundary: local diagnostics only; no AK tasks, GitHub issues, incidents, evidence, telemetry, or ASC/self state are created.",
    ].join("\n");
  }

  if (action === "path") {
    return formatPath(storePath, reviewPath, curationPath, retentionPath, backupDir);
  }

  if (action === "review" || action === "outcomes") {
    const syntaxError = reviewListSyntaxError(tokens.slice(1), action);
    if (syntaxError) return syntaxError;
  }
  if (action === "compare") {
    const syntaxError = compareSyntaxError(tokens.slice(1));
    if (syntaxError) return syntaxError;
  }
  if (action === "export") {
    const syntaxError = exportSyntaxError(tokens.slice(1));
    if (syntaxError) return syntaxError;
  }
  if (action === "retention" && tokens[1] === "candidates") {
    const syntaxError = retentionCandidatesSyntaxError(tokens.slice(2));
    if (syntaxError) return syntaxError;
  }
  if (action === "retention" && tokens[1] === "history") {
    const syntaxError = retentionHistorySyntaxError(tokens.slice(2));
    if (syntaxError) return syntaxError;
    const retentions = readRetentionEvents(retentionPath);
    const history = buildRetentionHistory({
      retentionEvents: retentions.events,
      backupDir,
      limit: clampLimit(tokens[2], 20),
    });
    return `${formatRetentionHistory(history)}${formatRetentionReadWarnings(retentions)}`;
  }

  const state = loadDiagnosticState({
    storePath,
    reviewPath,
    curationPath,
    retentionPath,
    backupDir,
  });
  const { records } = state;
  const suffix = formatDiagnosticWarnings(state);

  if (action === "review") {
    return `${handleReviewCommand(tokens.slice(1), state, reviewPath)}${suffix}`;
  }
  if (action === "outcomes") {
    return `${handleOutcomesCommand(tokens.slice(1), state)}${suffix}`;
  }
  if (action === "compare") {
    return `${handleCompareCommand(tokens.slice(1), state)}${suffix}`;
  }
  if (action === "curate") {
    return `${handleCurateCommand(tokens.slice(1), state, curationPath)}${suffix}`;
  }
  if (action === "draft") {
    return `${handleDraftCommand(tokens.slice(1), state)}${suffix}`;
  }
  if (action === "retention") {
    return `${handleRetentionCommand(tokens.slice(1), state, {
      storePath,
      reviewPath,
      curationPath,
      retentionPath,
      backupDir,
    })}${suffix}`;
  }
  if (action === "stats" || action === "export") {
    return handleLifecycleCommand(action, tokens.slice(1), state);
  }
  if (action === "facets") {
    return `${formatFacetSummary(
      buildFacetSummary({
        records: state.records as unknown[],
        reviewEvents: state.reviewEvents as unknown[],
        curationEvents: state.curationEvents as unknown[],
        limit: clampLimit(tokens[1], 10),
      }),
    )}${suffix}`;
  }
  if (action === "list") {
    return `${formatRecent(records, clampLimit(tokens[1]))}${suffix}`;
  }
  if (action === "summary") {
    return `${formatSummary(
      summarizeRecords(records, { limit: 20, curationEvents: state.curationEvents }),
    )}${suffix}`;
  }
  return `Unknown /agent_vent action: ${action}\nRun /agent_vent help for usage.`;
}

function handleReviewCommand(
  tokens: string[],
  diagnosticState: Record<string, unknown>,
  reviewPath: string,
) {
  const records = diagnosticState.records as unknown[];
  const curationEvents = diagnosticState.curationEvents as unknown[];
  const reviewEvents = diagnosticState.reviewEvents as unknown[];
  if (tokens[0] === "show") {
    const recurrenceKey = tokens[1];
    const rawLimit = tokens[2];
    if (!recurrenceKey) {
      return "Usage: /agent_vent review show <recurrenceKey> [limit]";
    }
    return formatReviewDetail(
      buildReviewDetail({
        recurrenceKey,
        records,
        reviewEvents,
        curationEvents,
        limit: clampLimit(rawLimit, 5),
      }),
    );
  }

  if (tokens[0] === "set") {
    const state = tokens[1];
    const recurrenceKey = tokens[2];
    const note = tokens.slice(3).join(" ");
    if (!state || !recurrenceKey) {
      return "Usage: /agent_vent review set <new|acknowledged|dismissed|escalation_drafted> <recurrenceKey> [note]";
    }
    const resolved = resolveRecurrenceGroup(records, recurrenceKey, curationEvents);
    if (!resolved) {
      return `Cannot set review state for unknown recurrence group: ${recurrenceKey}`;
    }
    const event = createReviewEvent(
      { recurrenceKey: resolved.recurrenceKey, state, note },
      { source: "agent_vent_command" },
    );
    appendReviewEvent(reviewPath, event);
    return [
      `Set local review state for ${event.recurrenceKey} to ${event.state}.`,
      "Boundary: local diagnostic review state only; no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
    ].join("\n");
  }

  const parsed = parseReviewListTokens(tokens);
  const syntaxError = reviewListSyntaxError(tokens, "review", parsed);
  if (syntaxError) return syntaxError;
  const normalizedState =
    parsed.state && parsed.state !== "all" ? normalizeReviewState(parsed.state) : parsed.state;
  const queue = summarizeReviewQueue(records, reviewEvents, {
    state: normalizedState,
    limit: clampLimit(parsed.limit, 20),
    curationEvents,
    filters: parsed.filters,
  });
  return formatReviewQueue(queue);
}

function handleOutcomesCommand(tokens: string[], diagnosticState: Record<string, unknown>) {
  const parsed = parseReviewListTokens(tokens);
  const syntaxError = reviewListSyntaxError(tokens, "outcomes", parsed);
  if (syntaxError) return syntaxError;
  const normalizedState =
    parsed.state && parsed.state !== "all" ? normalizeReviewState(parsed.state) : parsed.state;
  return formatReviewOutcomes(
    buildReviewOutcomes({
      records: diagnosticState.records as unknown[],
      reviewEvents: diagnosticState.reviewEvents as unknown[],
      curationEvents: diagnosticState.curationEvents as unknown[],
      state: normalizedState || "all",
      limit: clampLimit(parsed.limit, 5),
      filters: parsed.filters,
    }),
  );
}

function handleCompareCommand(tokens: string[], diagnosticState: Record<string, unknown>) {
  const parsed = parseReviewListTokens(tokens);
  const syntaxError = compareSyntaxError(tokens, parsed);
  if (syntaxError) return syntaxError;
  return formatReviewComparison(
    buildReviewComparison({
      records: diagnosticState.records as unknown[],
      reviewEvents: diagnosticState.reviewEvents as unknown[],
      curationEvents: diagnosticState.curationEvents as unknown[],
      limit: clampLimit(parsed.limit, 5),
      filters: parsed.filters,
    }),
  );
}

function reviewListSyntaxError(
  tokens: string[],
  action: "review" | "outcomes",
  parsed = parseReviewListTokens(tokens),
) {
  if (action === "review" && tokens[0] === "show") {
    if (!tokens[1]) return "Usage: /agent_vent review show <recurrenceKey> [limit]";
    return undefined;
  }
  if (action === "review" && tokens[0] === "set") {
    const state = tokens[1]?.toLowerCase().replaceAll("-", "_");
    if (!tokens[1] || !tokens[2]) {
      return "Usage: /agent_vent review set <new|acknowledged|dismissed|escalation_drafted> <recurrenceKey> [note]";
    }
    if (!REVIEW_STATES.includes(state)) {
      return `Invalid /agent_vent review state: ${tokens[1]}\nUsage: /agent_vent review set <new|acknowledged|dismissed|escalation_drafted> <recurrenceKey> [note]`;
    }
    return undefined;
  }
  const usage =
    action === "review"
      ? "Usage: /agent_vent review [state|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]"
      : "Usage: /agent_vent outcomes [state|all] [per-state-limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]";
  if (parsed.unknownFilters.length) {
    return `Unknown /agent_vent ${action} filter(s): ${parsed.unknownFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidFilters.length) {
    return `Invalid /agent_vent ${action} filter value(s): ${parsed.invalidFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidState) {
    return `Invalid /agent_vent ${action} state: ${parsed.invalidState}\n${usage}`;
  }
  return undefined;
}

function retentionCandidatesSyntaxError(
  tokens: string[],
  parsed = parseReviewListTokens(tokens, { allowReviewedState: true }),
) {
  const usage =
    "Usage: /agent_vent retention candidates [reviewed|new|acknowledged|dismissed|escalation_drafted|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]";
  if (parsed.unknownFilters.length) {
    return `Unknown /agent_vent retention candidates filter(s): ${parsed.unknownFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidFilters.length) {
    return `Invalid /agent_vent retention candidates filter value(s): ${parsed.invalidFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidState) {
    return `Invalid /agent_vent retention candidates state: ${parsed.invalidState}\n${usage}`;
  }
  return undefined;
}

function retentionHistorySyntaxError(tokens: string[]) {
  const usage = "Usage: /agent_vent retention history [limit]";
  if (tokens.length > 1 || (tokens[0] && !/^\d+$/.test(tokens[0]))) {
    return `Invalid /agent_vent retention history argument: ${tokens.join(" ")}\n${usage}`;
  }
  return undefined;
}

function compareSyntaxError(tokens: string[], parsed = parseReviewListTokens(tokens)) {
  const usage =
    "Usage: /agent_vent compare [per-state-limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]";
  if (parsed.unknownFilters.length) {
    return `Unknown /agent_vent compare filter(s): ${parsed.unknownFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidFilters.length) {
    return `Invalid /agent_vent compare filter value(s): ${parsed.invalidFilters.join(", ")}\n${usage}`;
  }
  if (parsed.state) {
    return `Invalid /agent_vent compare argument: ${parsed.invalidState || parsed.state}\n${usage}`;
  }
  return undefined;
}

function exportSyntaxError(tokens: string[], parsed = parseLifecycleTokens(tokens)) {
  const usage =
    "Usage: /agent_vent export [markdown|json] [state|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]";
  if (parsed.unknownFilters.length) {
    return `Unknown /agent_vent export filter(s): ${parsed.unknownFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidFilters.length) {
    return `Invalid /agent_vent export filter value(s): ${parsed.invalidFilters.join(", ")}\n${usage}`;
  }
  if (parsed.invalidState) {
    return `Invalid /agent_vent export state: ${parsed.invalidState}\n${usage}`;
  }
  return undefined;
}

function parseReviewListTokens(tokens: string[], options: { allowReviewedState?: boolean } = {}) {
  const filters: { category?: string; tags?: string[]; tool?: string; packageName?: string } = {};
  const tags: string[] = [];
  const unknownFilters: string[] = [];
  const invalidFilters: string[] = [];
  let state: string | undefined;
  let limit: string | undefined;
  for (const token of tokens) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex > 0) {
      const key = token.slice(0, separatorIndex).trim().toLowerCase().replaceAll("-", "_");
      const value = token.slice(separatorIndex + 1).trim();
      if (key === "category") {
        if (!value) {
          invalidFilters.push("category=");
          continue;
        }
        const category = resolveCategoryFilter(value);
        if (category) filters.category = category;
        else invalidFilters.push(`category=${value}`);
      } else if (key === "tool") {
        if (!value) {
          invalidFilters.push("tool=");
          continue;
        }
        filters.tool = value;
      } else if (key === "package" || key === "package_name" || key === "packagename") {
        if (!value) {
          invalidFilters.push(`${key}=`);
          continue;
        }
        filters.packageName = value;
      } else if (key === "tag" || key === "tags") {
        if (!value) {
          invalidFilters.push(`${key}=`);
          continue;
        }
        tags.push(
          ...value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
      } else {
        unknownFilters.push(key || token.slice(0, separatorIndex));
      }
      continue;
    }
    if (!limit && /^\d+$/.test(token)) {
      limit = token;
      continue;
    }
    if (!state) state = token;
  }
  const normalizedState = state?.toLowerCase().replaceAll("-", "_");
  const invalidState =
    normalizedState &&
    normalizedState !== "all" &&
    !(options.allowReviewedState && normalizedState === "reviewed") &&
    !REVIEW_STATES.includes(normalizedState)
      ? state
      : undefined;
  return {
    state: normalizedState,
    limit,
    filters: tags.length ? { ...filters, tags } : filters,
    unknownFilters,
    invalidFilters,
    invalidState,
  };
}

function parseLifecycleTokens(tokens: string[]) {
  const format = tokens[0] === "json" || tokens[0] === "markdown" ? tokens[0] : "markdown";
  const parsed = parseReviewListTokens(format === tokens[0] ? tokens.slice(1) : tokens);
  return {
    format,
    state: parsed.state,
    limit: parsed.limit,
    filters: parsed.filters,
    unknownFilters: parsed.unknownFilters,
    invalidFilters: parsed.invalidFilters,
    invalidState: parsed.invalidState,
  };
}

function handleCurateCommand(
  tokens: string[],
  state: Record<string, unknown>,
  curationPath: string,
) {
  const records = state.records as unknown[];
  const curationEvents = state.curationEvents as unknown[];
  const curationAction = tokens[0];
  const sourceRecurrenceKey = tokens[1];
  const targetRecurrenceKey = curationAction === "remove" ? undefined : tokens[2];
  const note = tokens.slice(curationAction === "remove" ? 2 : 3).join(" ");
  if (
    !curationAction ||
    !sourceRecurrenceKey ||
    (curationAction !== "remove" && !targetRecurrenceKey)
  ) {
    return "Usage: /agent_vent curate <merge|rename> <sourceRecurrenceKey> <targetRecurrenceKey> [note] OR /agent_vent curate remove <sourceRecurrenceKey> [note]";
  }
  const input = { action: curationAction, sourceRecurrenceKey, targetRecurrenceKey, note };
  assertCanCurateRecurrence(records, curationEvents, input);
  const event = createCurationEvent(input, { source: "agent_vent_command" });
  appendCurationEvent(curationPath, event);
  const targetText = event.targetRecurrenceKey ? ` -> ${event.targetRecurrenceKey}` : "";
  return [
    `Recorded local recurrence ${event.action} curation: ${event.sourceRecurrenceKey}${targetText}.`,
    "Boundary: local diagnostic curation projection only; raw vents were not rewritten and no AK task, GitHub issue, incident, evidence, telemetry, or ASC/self state was created.",
  ].join("\n");
}

function handleDraftCommand(tokens: string[], state: Record<string, unknown>) {
  const records = state.records as unknown[];
  const reviewEvents = state.reviewEvents as unknown[];
  const curationEvents = state.curationEvents as unknown[];
  const draftTarget = tokens[0];
  const recurrenceKey = tokens[1];
  const rawLimit = tokens[2];
  if (!draftTarget || !recurrenceKey) {
    return "Usage: /agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]";
  }
  return buildEscalationDraft({
    target: draftTarget,
    recurrenceKey,
    records,
    reviewEvents,
    curationEvents,
    limit: clampLimit(rawLimit, 5),
  }).text;
}

function handleRetentionCommand(
  tokens: string[],
  state: Record<string, unknown>,
  paths: {
    storePath: string;
    reviewPath: string;
    curationPath: string;
    retentionPath: string;
    backupDir: string;
  },
) {
  const retentionAction = normalizeRetentionAction(tokens[0] || "preview");
  if (retentionAction === "candidates") {
    const parsed = parseReviewListTokens(tokens.slice(1), { allowReviewedState: true });
    const syntaxError = retentionCandidatesSyntaxError(tokens.slice(1), parsed);
    if (syntaxError) return syntaxError;
    return formatRetentionCandidates(
      buildRetentionCandidates({
        records: state.records as unknown[],
        reviewEvents: state.reviewEvents as unknown[],
        curationEvents: state.curationEvents as unknown[],
        state: parsed.state,
        limit: clampLimit(parsed.limit, 20),
        filters: parsed.filters,
      }),
    );
  }
  if (retentionAction === "preview") {
    const recurrenceKey = tokens[1];
    if (!recurrenceKey) return "Usage: /agent_vent retention preview <recurrenceKey>";
    return formatRetentionPreview(
      buildRetentionPreview({
        recurrenceKey,
        records: state.records as unknown[],
        reviewEvents: state.reviewEvents as unknown[],
        curationEvents: state.curationEvents as unknown[],
        storeHash: state.ventsHash as string,
        reviewHash: state.reviewEventsHash as string,
        curationHash: state.curationEventsHash as string,
        limit: 5,
      }),
    );
  }
  if (retentionAction === "archive") {
    const recurrenceKey = tokens[1];
    const confirmationToken = tokens[2];
    const note = tokens.slice(3).join(" ");
    if (!recurrenceKey || !confirmationToken) {
      return "Usage: /agent_vent retention archive <recurrenceKey> <confirmationToken> [note]";
    }
    return formatRetentionArchiveResult(
      archiveRecurrenceGroup({
        ...paths,
        recurrenceKey,
        confirmationToken,
        note,
        source: "agent_vent_command",
      }),
    );
  }
  const backupPath = tokens[1];
  const confirmationToken = tokens[2];
  const note = tokens.slice(3).join(" ");
  if (!backupPath || !confirmationToken) {
    return "Usage: /agent_vent retention restore <backupPath> <confirmationToken> [note]";
  }
  return formatRetentionRestoreResult(
    restoreRetentionBackup({
      storePath: paths.storePath,
      retentionPath: paths.retentionPath,
      backupDir: paths.backupDir,
      backupPath,
      confirmationToken,
      note,
      source: "agent_vent_command",
    }),
  );
}

function splitCommandArgs(args: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: string | undefined;
  let escaping = false;
  for (const char of args.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function handleLifecycleCommand(action: string, tokens: string[], state: Record<string, unknown>) {
  const parsed = parseLifecycleTokens(tokens);
  const snapshot = buildLifecycleSnapshot({
    ...state,
    state: parsed.state || "all",
    limit: clampLimit(parsed.limit, 20),
    filters: action === "export" ? parsed.filters : undefined,
  });

  if (action === "stats") return formatLifecycleStats(snapshot);
  return parsed.format === "json" ? formatExportJson(snapshot) : formatExportMarkdown(snapshot);
}

function formatRetentionReadWarnings(retentions: {
  malformedLines?: number;
  oversizedLines?: number;
  invalidEvents?: number;
}) {
  const warnings = [];
  if (Number(retentions.malformedLines) > 0)
    warnings.push(`malformed retention=${retentions.malformedLines}`);
  if (Number(retentions.oversizedLines) > 0)
    warnings.push(`oversized retention=${retentions.oversizedLines}`);
  if (Number(retentions.invalidEvents) > 0)
    warnings.push(`invalid retention=${retentions.invalidEvents}`);
  return warnings.length > 0
    ? `\nWarning: ignored local retention receipt entries (${warnings.join(", ")}).`
    : "";
}

function formatDiagnosticWarnings(state: Record<string, unknown>) {
  const warnings = [];
  const pairs = [
    ["malformed vent", state.malformedLines],
    ["malformed review", state.malformedReviewLines],
    ["malformed curation", state.malformedCurationLines],
    ["malformed retention", state.malformedRetentionLines],
    ["oversized vent", state.oversizedLines],
    ["oversized review", state.oversizedReviewLines],
    ["oversized curation", state.oversizedCurationLines],
    ["oversized retention", state.oversizedRetentionLines],
    ["invalid vent", state.invalidRecords],
    ["invalid review", state.invalidReviewEvents],
    ["invalid curation", state.invalidCurationEvents],
    ["invalid retention", state.invalidRetentionEvents],
    ["quarantined curation", state.quarantinedCurationEvents],
  ];
  for (const [label, value] of pairs) {
    if (Number(value) > 0) warnings.push(`${label}=${value}`);
  }
  return warnings.length > 0
    ? `\nWarning: ignored local diagnostic entries (${warnings.join(", ")}).`
    : "";
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}
