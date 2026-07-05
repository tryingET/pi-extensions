/**
 * Action domain resolver - checkpoints, followups, and editor prefills.
 */

import {
  candidateToSliceCandidate,
  latestFreshContinuationCandidate,
  latestFreshExplicitContinuationCandidate,
  recordContinuationCandidate,
} from "../continuation-candidate.ts";
import { createEdgeMonotonicId, normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import { analyzePatterns, queryHandoffSummary } from "../perception.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import {
  handleLaunchAutoresearchCampaign,
  handleLaunchVisibleLoopSelfEvolution,
  handlePrefillAutoresearchCampaign,
  handlePrefillVisibleLoopSelfEvolution,
} from "./action-autonomy-routes.ts";
import { handleListActionState, handleRecordContinuationCandidate } from "./action-continuation.ts";
import {
  handleContinueDiagnosticReview,
  handlePrefillDiagnosticRecord,
} from "./action-diagnostic.ts";
import {
  handleSelfContainedHandoffPrompt,
  isSelfContainedHandoffPromptQuery,
} from "./action-handoff.ts";
import { handleDirectUserMessage } from "./action-user-message.ts";
import { extractQuotedContent } from "./helpers.ts";

export const SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES = [
  "continue with self-evolution",
  "continue self-evolution",
  "continue visible self-evolution",
] as const;

export function isSelfEvolutionContinuationPrefillQuery(lower: string): boolean {
  const normalized = lower
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/\s*[.!?]+$/u, "")
    .trim();
  return SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES.some((alias) => normalized === alias);
}

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
  "prefill visible-loop self-evolution",
  "prefill visible loop self-evolution",
  "prefill self-evolution visible-loop",
  "prefill self-evolution loop",
  "launch visible-loop self-evolution",
  "launch visible loop self-evolution",
  "run visible-loop self-evolution",
  "start visible-loop self-evolution",
  "prefill autoresearch campaign",
  "prefill measured campaign",
  "launch autoresearch campaign",
  "run autoresearch campaign",
  "start autoresearch campaign",
  "launch measured campaign",
  "run measured campaign",
  "start measured campaign",
  "continue suggested next move",
  "continue safely",
  "next autonomous step",
  "next safe step",
  "record continuation candidate",
  "queue continuation candidate",
  "remember next autonomous step",
  "send suggested next move",
  "advance suggested next move",
  "continue diagnostic review",
  "continue self diagnostic",
  "send diagnostic review",
  "send diagnostic followup",
  "send diagnostic follow-up",
  "notify operator",
  "notify user",
  "message operator",
  "send operator message",
  "send usermessage",
  "sendusermessage",
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

function isDirectUserMessageQuery(lower: string): boolean {
  return (
    lower.includes("notify operator") ||
    lower.includes("notify user") ||
    lower.includes("message operator") ||
    lower.includes("send operator message") ||
    /send\s+user\s*message\s*:/u.test(lower) ||
    /sendusermessage\s*:/u.test(lower) ||
    lower.trim() === "sendusermessage"
  );
}

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
  if (isDirectUserMessageQuery(lower)) {
    return "send_user_message";
  }
  if (
    lower.includes("record continuation candidate") ||
    lower.includes("queue continuation candidate") ||
    lower.includes("remember next autonomous step")
  ) {
    return "record_continuation_candidate";
  }
  if (lower.includes("checkpoint") || lower.includes("save point")) return "create_checkpoint";
  if (isSelfEvolutionContinuationPrefillQuery(lower)) {
    return "prefill_visible_loop_self_evolution";
  }
  if (
    lower.includes("launch visible-loop self-evolution") ||
    lower.includes("launch visible loop self-evolution") ||
    lower.includes("run visible-loop self-evolution") ||
    lower.includes("start visible-loop self-evolution")
  ) {
    return "launch_visible_loop_self_evolution";
  }
  if (
    lower.includes("prefill visible-loop self-evolution") ||
    lower.includes("prefill visible loop self-evolution") ||
    lower.includes("prefill self-evolution visible-loop") ||
    lower.includes("prefill self-evolution loop")
  ) {
    return "prefill_visible_loop_self_evolution";
  }
  if (
    lower.includes("launch autoresearch campaign") ||
    lower.includes("run autoresearch campaign") ||
    lower.includes("start autoresearch campaign") ||
    lower.includes("launch measured campaign") ||
    lower.includes("run measured campaign") ||
    lower.includes("start measured campaign")
  ) {
    return "launch_autoresearch_campaign";
  }
  if (
    lower.includes("prefill autoresearch campaign") ||
    lower.includes("prefill measured campaign")
  ) {
    return "prefill_autoresearch_campaign";
  }
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
    lower.includes("continue safely") ||
    lower.includes("next autonomous step") ||
    lower.includes("next safe step") ||
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

    case "prefill_visible_loop_self_evolution": {
      return handlePrefillVisibleLoopSelfEvolution(query);
    }

    case "launch_visible_loop_self_evolution": {
      return handleLaunchVisibleLoopSelfEvolution(query);
    }

    case "prefill_autoresearch_campaign": {
      return handlePrefillAutoresearchCampaign(query);
    }

    case "launch_autoresearch_campaign": {
      return handleLaunchAutoresearchCampaign(query);
    }

    case "continue_suggested_next_move": {
      return handleContinueSuggestedNextMove(query, state);
    }

    case "record_continuation_candidate": {
      return handleRecordContinuationCandidate(query, state);
    }

    case "send_user_message": {
      return handleDirectUserMessage(query);
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
      return handleListActionState(query, state);
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
      const candidate = recordContinuationCandidate(
        state,
        handoff.nextMove,
        normalizeCurrentCwd(query),
      );
      return buildPrefillResponse(handoff.nextMove.prefillText, {
        nextMove: handoff.nextMove,
        continuationCandidate: candidate,
      });
    }
    const persisted = latestFreshContinuationCandidate(state, normalizeCurrentCwd(query));
    if (persisted) {
      const nextMove = candidateToSliceCandidate(persisted);
      return buildPrefillResponse(nextMove.prefillText, {
        nextMove,
        continuationCandidate: persisted,
        usedPersistedContinuationCandidate: true,
      });
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

function handleContinueSuggestedNextMove(query: SelfQuery, state: SelfState): SelfResponse {
  analyzePatterns(state.operations, state.patterns);
  const handoff = queryHandoffSummary(state.operations, state.patterns);
  const cwd = normalizeCurrentCwd(query);
  const persistedCandidate = handoff.nextMove
    ? latestFreshExplicitContinuationCandidate(state, cwd)
    : latestFreshContinuationCandidate(state, cwd);
  const candidate =
    persistedCandidate ??
    (handoff.nextMove ? recordContinuationCandidate(state, handoff.nextMove, cwd) : undefined);
  const nextMove = persistedCandidate
    ? candidateToSliceCandidate(persistedCandidate)
    : handoff.nextMove;
  const usedPersistedContinuationCandidate = Boolean(persistedCandidate);

  if (!nextMove) {
    return {
      understood: true,
      intent: "action",
      answer:
        "No suggested next move is visible from the current mirror state and no fresh same-cwd continuation candidate is available. Ask for a controller handoff summary or continue locally.",
      data: { sendUserMessage: false, prefill: false },
      suggestions: ["controller handoff summary", "prefill: local validation command"],
    };
  }

  if (requiresOperatorReview(nextMove)) {
    return buildPrefillResponse(nextMove.prefillText, {
      nextMove,
      continuationCandidate: candidate,
      usedPersistedContinuationCandidate,
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
      continuationCandidate: candidate,
      usedPersistedContinuationCandidate,
      sendUserMessage: true,
      prefill: false,
      dispatchMode: "agent_continuation",
    },
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

function requiresOperatorReview(nextMove: {
  owner: string;
  prefillText: string;
  confidence?: string;
  score?: number;
}): boolean {
  const text = nextMove.prefillText.trim();
  const lower = text.toLowerCase();
  const riskyOwner = [
    "peer-tools",
    "pi-session-compaction",
    "pi-little-helpers",
    "pi-autoresearch",
    "pi-society-orchestrator",
  ].includes(nextMove.owner);
  const riskyDirective =
    /\b(commit|merge|push|release|publish|delete|remove|rm\s+-rf|ak\s+evidence|ak\s+task|agent_vent|visible-loop|autoresearch|orchestrator|dispatch_subagent|candidate_peer_spawn|scout_peer_spawn|fork_peer_spawn|peer|peer[_-]?spawn|peer\s+launch|spawn|launch|harness|compact|compaction|pi\s+install|reload)\b/u.test(
      lower,
    );
  return (
    text.startsWith("/") ||
    riskyOwner ||
    riskyDirective ||
    (nextMove.confidence === "high" && (nextMove.score ?? 0) >= 90)
  );
}

function normalizeCurrentCwd(query: SelfQuery): string {
  const context = normalizeInput(query.context);
  return normalizeString(context.cwd) || process.cwd();
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
