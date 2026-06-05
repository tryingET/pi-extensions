/**
 * Action domain resolver - checkpoints, followups, and editor prefills.
 */

import { createEdgeMonotonicId, normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
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
