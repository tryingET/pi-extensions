/**
 * Action domain resolver - checkpoints, followups, and editor prefills.
 */

import {
  createEdgeMonotonicId,
  normalizeInput,
  normalizeString,
  normalizeStringArray,
} from "../edge-contract-kernel.ts";
import { analyzePatterns, queryHandoffSummary } from "../perception.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

export const ACTION_KEYWORDS = [
  "create checkpoint",
  "checkpoint",
  "mark checkpoint",
  "save point",
  "action summary",
  "what checkpoints",
  "list checkpoints",
  "what followups",
  "list followups",
  "pending followups",
  "queue followup",
  "queue follow-up",
  "remind me",
  "follow up",
  "followup",
  "later",
  "prefill",
  "suggest input",
  "prefill editor",
  "continue suggested next move",
  "send suggested next move",
  "advance suggested next move",
  "continue diagnostic review",
  "continue self diagnostic",
  "send diagnostic review",
  "send diagnostic followup",
  "send diagnostic follow-up",
  "prefill diagnostic record",
  "prefill agent_vent record",
  "prefill vent record",
  "record this friction",
  "compaction handoff prompt",
  "fresh session handoff prompt",
  "fresh-session handoff prompt",
  "self-contained handoff prompt",
  "create handoff prompt",
  "handoff prompt",
  "send user message",
];

export function mapActionIntent(lower: string): string {
  if (
    lower.includes("action summary") ||
    lower.includes("what checkpoints") ||
    lower.includes("list checkpoints") ||
    lower.includes("what followups") ||
    lower.includes("list followups") ||
    lower.includes("pending followups")
  ) {
    return "list_action_state";
  }
  if (lower.includes("checkpoint") || lower.includes("save point")) return "create_checkpoint";
  if (
    lower.includes("prefill diagnostic record") ||
    lower.includes("prefill agent_vent record") ||
    lower.includes("prefill vent record") ||
    lower.includes("record this friction")
  ) {
    return "prefill_diagnostic_record";
  }
  if (isSelfContainedHandoffPromptQuery(lower)) {
    return "self_contained_handoff_prompt";
  }
  if (
    lower.includes("continue diagnostic review") ||
    lower.includes("continue self diagnostic") ||
    lower.includes("send diagnostic review") ||
    lower.includes("send diagnostic followup") ||
    lower.includes("send diagnostic follow-up")
  ) {
    return "continue_diagnostic_review";
  }
  if (
    lower.includes("continue suggested next move") ||
    lower.includes("send suggested next move") ||
    lower.includes("advance suggested next move") ||
    lower.includes("send user message")
  ) {
    return "continue_suggested_next_move";
  }
  if (lower.includes("prefill") || lower.includes("suggest input")) return "prefill_editor";
  if (
    lower.includes("followup") ||
    lower.includes("follow-up") ||
    lower.includes("remind") ||
    lower.includes("later")
  ) {
    return "queue_followup";
  }
  return "create_checkpoint";
}

export function resolveActionQuery(
  intent: string,
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  switch (intent) {
    case "create_checkpoint": {
      return handleCreateCheckpoint(query, state);
    }

    case "queue_followup": {
      return handleQueueFollowup(query, state);
    }

    case "prefill_editor": {
      return handlePrefillEditor(query, state);
    }

    case "continue_suggested_next_move": {
      return handleContinueSuggestedNextMove(state);
    }

    case "continue_diagnostic_review": {
      return handleContinueDiagnosticReview(query);
    }

    case "prefill_diagnostic_record": {
      return handlePrefillDiagnosticRecord(query);
    }

    case "self_contained_handoff_prompt": {
      return handleSelfContainedHandoffPrompt(query, state);
    }

    case "list_action_state": {
      return handleListActionState(state);
    }

    default:
      return {
        understood: true,
        intent: "action",
        answer: "Action query understood but not fully specified.",
        suggestions: [
          "create checkpoint before risky refactor",
          "queue followup: remember to test edge cases",
          "prefill: next step description",
          "action summary",
        ],
      };
  }
}

function handleCreateCheckpoint(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const reason =
    normalizeString(normalizedContext.reason) ||
    extractQuotedContent(query.query) ||
    "manual checkpoint";
  const entryId = normalizeString(normalizedContext.entryId);

  const checkpointId = createEdgeMonotonicId("checkpoint");
  const checkpointSuffix = checkpointId.replace(/^checkpoint-/, "");
  const label = `checkpoint-${reason.replace(/[^a-zA-Z0-9.-]/g, "-").slice(0, 30)}-${checkpointSuffix}`;

  const checkpoint = {
    id: checkpointId,
    label,
    reason,
    entryId,
    createdAt: Date.now(),
  };

  state.checkpoints.push(checkpoint);

  return {
    understood: true,
    intent: "action",
    answer: `Checkpoint created: "${reason}"${entryId ? ` at entry ${entryId}` : ""}. Label: ${label}`,
    data: { checkpointId, label, reason, entryId },
  };
}

function handleQueueFollowup(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);

  // Try multiple sources for the followup text
  let text = normalizeString(normalizedContext.text) || extractQuotedContent(query.query);

  // Also support colon syntax: "Queue followup: <text>" or "Remind me: <text>"
  if (!text) {
    const colonMatch = query.query.match(/(?:queue\s+follow[- ]?up|remind\s+me)\s*:\s*(.+)$/i);
    if (colonMatch) {
      text = colonMatch[1].trim();
    }
  }

  // Last resort: use the whole query
  if (!text) {
    text = "follow-up needed";
  }

  const context = normalizeString(normalizedContext.context, { allowEmpty: true }) || "";

  const followupId = createEdgeMonotonicId("followup");
  const followup = {
    id: followupId,
    text,
    context,
    queuedAt: Date.now(),
    delivered: false,
  };

  state.followups.push(followup);

  return {
    understood: true,
    intent: "action",
    answer: `Follow-up queued: "${text}". I will remind myself to address this later.`,
    data: { followupId, text, context },
  };
}

function handleListActionState(state: SelfState): SelfResponse {
  const pendingFollowups = state.followups.filter((followup) => !followup.delivered);
  const checkpointText = state.checkpoints
    .slice(-5)
    .map((checkpoint) => `${checkpoint.label}: ${checkpoint.reason}`)
    .join("; ");
  const followupText = pendingFollowups
    .slice(-5)
    .map((followup) => `${followup.id}: ${followup.text}`)
    .join("; ");

  return {
    understood: true,
    intent: "action",
    answer: `Action summary: checkpoints=${state.checkpoints.length}${checkpointText ? ` (${checkpointText})` : ""}; pending followups=${pendingFollowups.length}${followupText ? ` (${followupText})` : ""}`,
    data: {
      checkpoints: [...state.checkpoints],
      followups: [...state.followups],
      pendingFollowups,
    },
  };
}

function handlePrefillEditor(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);

  // Prefer colon syntax so command text can contain quoted arguments.
  const colonMatch = query.query.match(/(?:prefill|suggest\s+input)\s*:\s*(.+)$/i);
  const text =
    normalizeString(normalizedContext.text) ||
    normalizePrefillText(colonMatch?.[1]) ||
    extractQuotedContent(query.query);

  if (text) {
    return buildPrefillResponse(text);
  }

  if (/prefill\s+(?:the\s+)?(?:suggested\s+)?next\s+move/i.test(query.query)) {
    analyzePatterns(state.operations, state.patterns);
    const handoff = queryHandoffSummary(state.operations, state.patterns);
    if (handoff.nextMove) {
      return buildPrefillResponse(handoff.nextMove.prefillText, { nextMove: handoff.nextMove });
    }
    return {
      understood: true,
      intent: "action",
      answer:
        "No suggested next move is visible from the current mirror state. Ask for a controller handoff summary or continue locally.",
      data: { prefill: false },
      suggestions: ["controller handoff summary", "prefill: local validation command"],
    };
  }

  return {
    understood: true,
    intent: "action",
    answer: "What should I prefill in the editor? Provide text in quotes or use colon syntax.",
    suggestions: [
      'prefill: "next step description"',
      'suggest input: "test edge case X"',
      "prefill suggested next move",
    ],
  };
}

function handleContinueSuggestedNextMove(state: SelfState): SelfResponse {
  analyzePatterns(state.operations, state.patterns);
  const handoff = queryHandoffSummary(state.operations, state.patterns);
  const nextMove = handoff.nextMove;

  if (!nextMove) {
    return {
      understood: true,
      intent: "action",
      answer:
        "No suggested next move is visible from the current mirror state. Ask for a controller handoff summary or continue locally.",
      data: { sendUserMessage: false, prefill: false },
      suggestions: ["controller handoff summary", "prefill: local validation command"],
    };
  }

  if (requiresOperatorReview(nextMove)) {
    return buildPrefillResponse(nextMove.prefillText, {
      nextMove,
      sendUserMessage: false,
      dispatchMode: "operator_review_required",
      reason:
        "Suggested move crosses a harness, peer, compaction, or high-severity recovery boundary; keep it as editor prefill for operator review.",
    });
  }

  const text = buildContinuationMessage(nextMove);
  return {
    understood: true,
    intent: "action",
    answer: `User-message continuation suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: {
      text,
      nextMove,
      sendUserMessage: true,
      prefill: false,
      dispatchMode: "agent_continuation",
    },
  };
}

function handleContinueDiagnosticReview(query: SelfQuery): SelfResponse {
  const candidate = buildDiagnosticCandidate(query);
  const text = buildDiagnosticContinuationMessage(candidate);

  return {
    understood: true,
    intent: "action",
    answer: `Diagnostic-review continuation suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: {
      text,
      diagnosticCandidate: candidate,
      sendUserMessage: true,
      prefill: false,
      dispatchMode: "agent_diagnostic_continuation",
      boundary:
        "Low-risk mirror-only continuation; durable agent_vent recording remains operator-reviewed.",
    },
  };
}

function handlePrefillDiagnosticRecord(query: SelfQuery): SelfResponse {
  const candidate = buildDiagnosticCandidate(query);
  const text = buildAgentVentPreviewCommand(candidate);

  return buildPrefillResponse(text, {
    diagnosticCandidate: candidate,
    sendUserMessage: false,
    dispatchMode: "operator_review_required",
    reason:
      "Durable local diagnostic recording writes agent_vent state, so self prefills an agent_vent preview first for operator review and anti-junk checking.",
  });
}

function handleSelfContainedHandoffPrompt(query: SelfQuery, state: SelfState): SelfResponse {
  analyzePatterns(state.operations, state.patterns);
  const handoff = queryHandoffSummary(state.operations, state.patterns);
  const text = buildSelfContainedHandoffPrompt(query, handoff);
  const prefill = !isShowOnlyHandoffPromptQuery(query.query.toLowerCase());
  const answer = prefill
    ? `Editor prefill suggested for a self-contained handoff prompt. Copy/paste text:\n\n${text}`
    : `Self-contained handoff prompt (not prefilled):\n\n${text}`;

  return {
    understood: true,
    intent: "action",
    answer,
    data: {
      text,
      prefill,
      sendUserMessage: false,
      dispatchMode: prefill ? "operator_review_required" : "show_only",
      authority: "mirror_only",
      handoff,
    },
  };
}

function buildDiagnosticCandidate(query: SelfQuery): Record<string, string> {
  const context = normalizeInput(query.context);
  const summary =
    normalizeString(context.summary) ||
    normalizeString(context.diagnosticSummary) ||
    extractQuotedContent(query.query) ||
    "self/operator diagnostic affordance needs review";
  const category = normalizeString(context.category) || "missing_affordance";
  const tool = normalizeString(context.tool) || "self";
  const packageName = normalizeString(context.package) || "pi-autonomous-session-control";

  return {
    kind: "self.diagnostic_candidate.v1",
    summary,
    category,
    tool,
    package: packageName,
    sourceQuery: query.query,
    suggestedOwnerSurface: "agent_vent",
    boundary:
      "candidate-only local diagnostic suggestion; self does not record agent_vent entries or create AK/evidence/incident state",
  };
}

function buildDiagnosticContinuationMessage(candidate: Record<string, string>): string {
  return [
    "Continue the self diagnostic review as a mirror-only local improvement step.",
    `Candidate: ${candidate.summary}`,
    `Facet: category=${candidate.category}, tool=${candidate.tool}, package=${candidate.package}`,
    "Allowed: inspect the candidate, improve self/tooling behavior, or ask the operator before durable capture.",
    "Not allowed: do not write agent_vent records, AK tasks/evidence, issues, incidents, or telemetry unless explicitly requested through the owning surface.",
  ].join("\n");
}

function buildAgentVentPreviewCommand(candidate: Record<string, string>): string {
  return `agent_vent({ action: "preview", category: ${JSON.stringify(candidate.category)}, tool: ${JSON.stringify(candidate.tool)}, package: ${JSON.stringify(candidate.package)}, summary: ${JSON.stringify(candidate.summary)} })`;
}

function buildSelfContainedHandoffPrompt(
  query: SelfQuery,
  handoff: ReturnType<typeof queryHandoffSummary>,
): string {
  const context = normalizeInput(query.context);
  const cwd = normalizeString(context.cwd) || process.cwd();
  const gitStatus = normalizeString(context.gitStatusSummary) || normalizeString(context.gitStatus);
  const taskIds = collectKnownTaskIds(
    context,
    handoff.commands.map((command) => command.rawCommand),
  );
  const touchedPackages = collectTouchedPackages(handoff.files.map((file) => file.path));
  const sparseEvidence =
    handoff.files.length === 0 && handoff.commands.length === 0 && handoff.errors.length === 0;
  const nextMove = handoff.nextMove;

  return [
    "You are a fresh, stateless Pi coding session.",
    "",
    "Work in:",
    `\`${cwd}\``,
    "",
    "Follow all AGENTS.md instructions. Start by reading repo/package AGENTS.md and README files before editing.",
    "",
    "Current handoff (ASC self mirror-only; canonical prompt owner is pi-session-compaction)",
    `- Evidence posture: ${sparseEvidence ? "ASC mirror evidence is sparse; this can happen after reload/compaction. Read git log, AK task show/list, and session JSONL if needed before trusting absence of evidence." : "ASC mirror has session-local tracked files/commands/errors below; verify against git and AK before acting."}`,
    `- Context pressure: ${handoff.contextPressure.summary}`,
    "- Exact token/context-window telemetry: unavailable; do not invent remaining context budget.",
    `- Git status: ${gitStatus || gitStatusFallback(handoff.commands.map((command) => command.rawCommand))}`,
    `- Known AK task ids: ${taskIds.length > 0 ? taskIds.join(", ") : "none visible to ASC; run ak task ready/list/show as needed."}`,
    `- Recent touched files: ${formatTouchedFiles(handoff.files)}`,
    `- Recent commands: ${formatRecentCommands(handoff.commands)}`,
    `- Recent visible errors: ${formatErrors(handoff.errors)}`,
    `- Validation/install/reload reminders: ${buildValidationReminder(
      touchedPackages,
      handoff.commands.map((command) => command.rawCommand),
    )}`,
    `- Next suggested slice: ${nextMove ? `${nextMove.slice} via ${nextMove.owner} — ${nextMove.reason}. Suggested action: ${nextMove.prefillText}` : "none from ASC mirror; inspect git/AK/task state and choose the smallest truthful next step."}`,
    "",
    "Authority boundaries",
    "- AK + society DB remain canonical for tasks/evidence/decisions; ASC/self is a mirror only.",
    "- Git status/diff/log are code-state truth; verify before committing or closing work.",
    "- pi-session-compaction owns compaction summaries and canonical fresh-session handoff prompt shape; ASC may provide mirror-only cues but must not become the canonical compaction engine.",
    "- Prompt Vault, ROCS/ontology, agent_vent, and FCOS/control-board state must stay on their owning surfaces.",
    "- Do not treat stale candidate packets, autoresearch artifacts, or session mirror data as live worktrees/branches without owner-surface verification.",
    "",
    "Suggested startup commands",
    "```bash",
    "git status --short",
    taskIds.length > 0 ? `ak task show ${taskIds[0]}` : "ak task ready",
    "ak task list --status pending",
    "```",
  ].join("\n");
}

function isSelfContainedHandoffPromptQuery(lower: string): boolean {
  return (
    lower.includes("compaction handoff prompt") ||
    lower.includes("fresh session handoff prompt") ||
    lower.includes("fresh-session handoff prompt") ||
    lower.includes("self-contained handoff prompt") ||
    /(?:create|prefill|show)\b[\s\S]{0,60}\bhandoff prompt\b/.test(lower)
  );
}

function isShowOnlyHandoffPromptQuery(lower: string): boolean {
  return lower.includes("show") || lower.includes("no prefill") || lower.includes("do not prefill");
}

function collectKnownTaskIds(context: Record<string, unknown>, commands: string[]): string[] {
  const ids = new Set<string>();
  for (const key of ["taskId", "currentTaskId", "akTaskId"]) {
    const value = normalizeString(context[key]);
    if (value) ids.add(stripTaskPrefix(value));
  }
  for (const value of normalizeStringArray(context.taskIds) ?? []) {
    ids.add(stripTaskPrefix(value));
  }
  for (const command of commands) {
    const taskMatch = command.match(
      /\bak\s+task\s+(?:show|claim|complete|close|done|finish|update|reopen|start)\s+(?:AK-|#)?(\d{2,})\b/i,
    );
    if (taskMatch?.[1]) ids.add(taskMatch[1]);

    const evidenceMatch = command.match(
      /\bak\s+evidence\s+record\b[\s\S]*?--task\s+(?:AK-|#)?(\d{2,})\b/i,
    );
    if (evidenceMatch?.[1]) ids.add(evidenceMatch[1]);
  }
  return [...ids].filter((id) => /^\d+$/.test(id));
}

function stripTaskPrefix(value: string): string {
  return value.replace(/^AK-/i, "").replace(/^#/, "").trim();
}

function collectTouchedPackages(paths: string[]): string[] {
  const packages = new Set<string>();
  for (const filePath of paths) {
    const match = filePath.match(/^packages\/([^/]+)/);
    if (match?.[1]) packages.add(match[1]);
  }
  return [...packages];
}

function gitStatusFallback(commands: string[]): string {
  return commands.some((command) => /^git\s+status\b/i.test(command.trim()))
    ? "git status was run, but ASC does not store stdout; rerun git status --short in the fresh session."
    : "unknown to ASC; run git status --short.";
}

function formatTouchedFiles(files: ReturnType<typeof queryHandoffSummary>["files"]): string {
  if (files.length === 0) return "none tracked by ASC mirror";
  return files
    .slice(0, 10)
    .map(
      (file) =>
        `${file.path} (${file.lastOp}, ${file.ops} op${file.ops === 1 ? "" : "s"}, Δ${file.netLinesDelta})`,
    )
    .join("; ");
}

function formatRecentCommands(
  commands: ReturnType<typeof queryHandoffSummary>["commands"],
): string {
  if (commands.length === 0) return "none tracked by ASC mirror";
  return commands
    .map((command) => `${command.success ? "ok" : "failed"}: ${command.rawCommand}`)
    .join("; ");
}

function formatErrors(errors: ReturnType<typeof queryHandoffSummary>["errors"]): string {
  if (errors.length === 0) return "none tracked by ASC mirror";
  return errors
    .map(
      (error) =>
        `${error.tool}:${error.signature} (${error.activeCount} active/${error.count} total)`,
    )
    .join("; ");
}

function buildValidationReminder(touchedPackages: string[], commands: string[]): string {
  const reminders: string[] = [];
  const successfulChecks = commands.filter((command) =>
    /\bnpm\b[\s\S]*\brun\s+(?:check|docs:list)\b/i.test(command),
  );
  for (const packageName of touchedPackages) {
    reminders.push(`run npm --prefix packages/${packageName} run check`);
    reminders.push(
      `run npm --prefix packages/${packageName} run docs:list if package docs changed`,
    );
    reminders.push(
      `if live Pi behavior changed, pi install /absolute/path/to/packages/${packageName} and ask operator to /reload`,
    );
  }
  if (successfulChecks.length > 0) {
    reminders.push(`recent package check/docs command(s) visible: ${successfulChecks.join("; ")}`);
  }
  if (commands.some((command) => /^pi\s+install\b/i.test(command.trim()))) {
    reminders.push(
      "pi install command visible; verify operator /reload happened before relying on live behavior",
    );
  }
  reminders.push("run git diff --check before commit");
  return reminders.join("; ");
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true, ...extraData },
  };
}

function requiresOperatorReview(nextMove: {
  owner: string;
  prefillText: string;
  confidence?: string;
  score?: number;
}): boolean {
  const text = nextMove.prefillText.trim();
  return (
    text.startsWith("/") ||
    nextMove.owner === "peer-tools" ||
    nextMove.owner === "pi-session-compaction" ||
    (nextMove.confidence === "high" && (nextMove.score ?? 0) >= 90)
  );
}

function buildContinuationMessage(nextMove: {
  slice: string;
  owner: string;
  prefillText: string;
  reason?: string;
}): string {
  return [
    `Continue with the self-suggested next move (${nextMove.slice}, owner=${nextMove.owner}).`,
    `Reason: ${nextMove.reason ?? "self mirror ranked this as the next local continuation."}`,
    `Action: ${nextMove.prefillText}`,
    "Keep owner boundaries explicit and do not treat this self suggestion as durable authority.",
  ].join("\n");
}

function normalizePrefillText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const quoted = trimmed.match(/^"([\s\S]*)"$/) || trimmed.match(/^'([\s\S]*)'$/);
  return (quoted?.[1] ?? trimmed).replace(/\\"/g, '"').replace(/\\'/g, "'");
}
