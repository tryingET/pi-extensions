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

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true, ...extraData },
  };
}

function normalizePrefillText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const quoted = trimmed.match(/^"([\s\S]*)"$/) || trimmed.match(/^'([\s\S]*)'$/);
  return (quoted?.[1] ?? trimmed).replace(/\\"/g, '"').replace(/\\'/g, "'");
}
