/**
 * Self-evolution feedback resolver.
 *
 * This is a bounded, session-local feedback ledger for ASC/self suggestions. It is
 * intentionally not an agent_vent record, AK task/evidence, KES note, ontology entry,
 * visible-loop run, or telemetry stream.
 */

import { createEdgeMonotonicId, normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState, SuggestionFeedbackOutcome } from "../types.ts";

const MAX_FEEDBACK_ENTRIES = 50;

const OUTCOMES: SuggestionFeedbackOutcome[] = [
  "helpful",
  "ignored",
  "stale",
  "wrong-owner",
  "unsafe",
];

export function isEvolutionFeedbackQuery(lower: string): boolean {
  return (
    lower.includes("self feedback") ||
    lower.includes("suggestion feedback") ||
    lower.includes("candidate feedback") ||
    lower.includes("self-evolution feedback") ||
    lower.includes("self evolution feedback") ||
    lower.includes("evolution feedback") ||
    lower.includes("outcome feedback") ||
    /^\s*feedback\s*:/u.test(lower)
  );
}

export function mapEvolutionFeedbackIntent(lower: string): "record_feedback" | "list_feedback" {
  if (
    lower.includes("feedback summary") ||
    lower.includes("outcome summary") ||
    lower.includes("list feedback") ||
    lower.includes("show feedback") ||
    lower.includes("what feedback") ||
    lower.includes("feedback ledger")
  ) {
    return "list_feedback";
  }

  return "record_feedback";
}

function parseOutcome(query: SelfQuery): SuggestionFeedbackOutcome | undefined {
  const context = normalizeInput(query.context);
  const contextOutcome = normalizeString(context.outcome)?.toLowerCase().replace(/_/g, "-");
  if (contextOutcome && OUTCOMES.includes(contextOutcome as SuggestionFeedbackOutcome)) {
    return contextOutcome as SuggestionFeedbackOutcome;
  }

  const lower = query.query.toLowerCase();
  if (
    lower.includes("wrong-owner") ||
    lower.includes("wrong owner") ||
    lower.includes("wrongowner")
  ) {
    return "wrong-owner";
  }
  if (lower.includes("unsafe") || lower.includes("not safe") || lower.includes("risky")) {
    return "unsafe";
  }
  if (lower.includes("stale") || lower.includes("outdated") || lower.includes("obsolete")) {
    return "stale";
  }
  if (
    lower.includes("ignored") ||
    lower.includes("skip") ||
    lower.includes("not useful") ||
    lower.includes("not helpful") ||
    lower.includes("unhelpful")
  ) {
    return "ignored";
  }
  if (lower.includes("helpful") || lower.includes("useful") || lower.includes("worked")) {
    return "helpful";
  }

  return undefined;
}

function inferTargetKind(query: SelfQuery): string {
  const context = normalizeInput(query.context);
  const contextTargetKind = normalizeString(context.targetKind) || normalizeString(context.kind);
  if (contextTargetKind) {
    return contextTargetKind;
  }

  const lower = query.query.toLowerCase();
  if (lower.includes("self.evolution_candidate.v1")) {
    return "self.evolution_candidate.v1";
  }
  if (lower.includes("self.diagnostic_candidate.v1")) {
    return "self.diagnostic_candidate.v1";
  }
  if (lower.includes("diagnostic")) {
    return "diagnostic_suggestion";
  }
  if (lower.includes("handoff")) {
    return "handoff_suggestion";
  }

  return "self_suggestion";
}

function inferTargetId(query: SelfQuery): string | undefined {
  const context = normalizeInput(query.context);
  const contextId =
    normalizeString(context.targetId) ||
    normalizeString(context.candidateId) ||
    normalizeString(context.suggestionId) ||
    normalizeString(context.id);
  if (contextId) {
    return contextId;
  }

  const match = query.query.match(
    /(?:target|candidate|suggestion|id)\s*[:#=]\s*([A-Za-z0-9._-]+)/u,
  );
  return match?.[1];
}

function inferNote(query: SelfQuery): string {
  const context = normalizeInput(query.context);
  const contextNote =
    normalizeString(context.note) ||
    normalizeString(context.summary) ||
    normalizeString(context.reason) ||
    normalizeString(context.observedOutcome);
  if (contextNote) {
    return contextNote;
  }

  const colonMatch = query.query.match(
    /(?:self|suggestion|candidate|self[- ]?evolution|evolution|outcome)?\s*feedback\s*:\s*([\s\S]+)$/iu,
  );
  return (colonMatch?.[1] ?? query.query).trim();
}

function countByOutcome(state: SelfState): Record<SuggestionFeedbackOutcome, number> {
  const counts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    SuggestionFeedbackOutcome,
    number
  >;

  for (const entry of state.suggestionFeedback) {
    counts[entry.outcome]++;
  }

  return counts;
}

function trimFeedbackLedger(state: SelfState): void {
  if (state.suggestionFeedback.length <= MAX_FEEDBACK_ENTRIES) {
    return;
  }

  state.suggestionFeedback.splice(0, state.suggestionFeedback.length - MAX_FEEDBACK_ENTRIES);
}

function handleRecordFeedback(query: SelfQuery, state: SelfState): SelfResponse {
  const outcome = parseOutcome(query);

  if (!outcome) {
    return {
      understood: true,
      intent: "meta",
      answer:
        "Self-evolution feedback understood, but no outcome label was found. Use one of: helpful, ignored, stale, wrong-owner, unsafe.",
      data: {
        feedbackRecorded: false,
        allowedOutcomes: OUTCOMES,
        boundary:
          "feedback is a bounded session-local mirror ledger; it does not write agent_vent, AK, KES, ontology, visible-loop, or telemetry state",
      },
      suggestions: [
        "self feedback: helpful — owner routing was correct",
        "self feedback: wrong-owner — suggested visible-loop but this belongs in ASC",
        "self feedback: unsafe — suggestion would have mutated durable state",
      ],
    };
  }

  const context = normalizeInput(query.context);
  const feedback = {
    kind: "self.suggestion_feedback.v1" as const,
    id: createEdgeMonotonicId("feedback"),
    outcome,
    targetKind: inferTargetKind(query),
    targetId: inferTargetId(query),
    note: inferNote(query),
    owner:
      normalizeString(context.owner) ||
      normalizeString(context.packageName) ||
      "pi-autonomous-session-control",
    sourceQuery: query.query,
    recordedAt: Date.now(),
    boundary:
      "bounded session-local feedback only; not durable recurrence memory or authoritative evidence",
    nonAuthorizations: [
      "no agent_vent record from feedback capture",
      "no AK task/evidence/decision write from feedback capture",
      "no KES/ontology/Prompt Vault mutation from feedback capture",
      "no visible-loop launch, measured campaign, issue, incident, or telemetry write from feedback capture",
    ],
  };

  state.suggestionFeedback.push(feedback);
  trimFeedbackLedger(state);

  const counts = countByOutcome(state);

  return {
    understood: true,
    intent: "meta",
    answer: `Self-evolution feedback recorded (${feedback.kind}): outcome=${outcome}; target=${feedback.targetKind}; owner=${feedback.owner}. No authority changed beyond the session-local self mirror.`,
    data: {
      feedbackRecorded: true,
      feedback,
      feedbackCounts: counts,
      ledgerScope: "session-local-bounded",
      maxEntries: MAX_FEEDBACK_ENTRIES,
    },
    suggestions: ["self feedback summary", "Dogfood self: what friction just happened?"],
  };
}

function handleListFeedback(state: SelfState): SelfResponse {
  const counts = countByOutcome(state);
  const recent = state.suggestionFeedback.slice(-5);
  const recentText = recent
    .map(
      (entry) =>
        `${entry.outcome}:${entry.targetKind}${entry.targetId ? `#${entry.targetId}` : ""}`,
    )
    .join("; ");

  return {
    understood: true,
    intent: "meta",
    answer: `Self-evolution feedback summary: total=${state.suggestionFeedback.length}; helpful=${counts.helpful}; ignored=${counts.ignored}; stale=${counts.stale}; wrong-owner=${counts["wrong-owner"]}; unsafe=${counts.unsafe}${recentText ? `; recent=${recentText}` : ""}. Scope=session-local mirror only; no durable owner surface was written.`,
    data: {
      feedback: [...state.suggestionFeedback],
      feedbackCounts: counts,
      ledgerScope: "session-local-bounded",
      maxEntries: MAX_FEEDBACK_ENTRIES,
      durableWrites: false,
    },
    suggestions: [
      "self feedback: helpful — suggestion reduced operator correction",
      "self feedback: wrong-owner — suggestion belonged to another owner",
      "agent_vent preview only if this feedback shows recurrence worth durable local memory",
    ],
  };
}

export function resolveEvolutionFeedbackQuery(
  intent: "record_feedback" | "list_feedback",
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  if (intent === "list_feedback") {
    return handleListFeedback(state);
  }

  return handleRecordFeedback(query, state);
}
