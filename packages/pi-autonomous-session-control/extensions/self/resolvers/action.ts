/**
 * Action domain resolver - checkpoints, followups, and editor prefills.
 */

import { createEdgeMonotonicId, normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

export const ACTION_KEYWORDS = [
  "create checkpoint",
  "checkpoint",
  "mark checkpoint",
  "save point",
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
  if (lower.includes("checkpoint") || lower.includes("save point")) return "create_checkpoint";
  if (
    lower.includes("followup") ||
    lower.includes("follow-up") ||
    lower.includes("remind") ||
    lower.includes("later")
  ) {
    return "queue_followup";
  }
  if (lower.includes("prefill") || lower.includes("suggest input")) return "prefill_editor";
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
      return handlePrefillEditor(query);
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

function handlePrefillEditor(query: SelfQuery): SelfResponse {
  const normalizedContext = normalizeInput(query.context);

  // Try multiple sources for the prefill text
  let text = normalizeString(normalizedContext.text) || extractQuotedContent(query.query);

  // Also support colon syntax: "Prefill: <text>"
  if (!text) {
    const colonMatch = query.query.match(/(?:prefill|suggest\s+input)\s*:\s*(.+)$/i);
    if (colonMatch) {
      text = colonMatch[1].trim();
    }
  }

  if (!text) {
    return {
      understood: true,
      intent: "action",
      answer: "What should I prefill in the editor? Provide text in quotes or use colon syntax.",
      suggestions: ['prefill: "next step description"', 'suggest input: "test edge case X"'],
    };
  }

  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true },
  };
}
