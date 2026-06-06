/**
 * Crystallization domain resolver - remembering, recalling, and forgetting patterns.
 */

import { createEdgeMonotonicId, normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";
import {
  handleForgetOntologyCandidate,
  handleRecallOntologyCandidates,
  handleRejectOntologyCandidate,
  handleRememberOntologyCandidate,
  isOntologyCandidateQuery,
} from "./ontology-candidates.ts";

export const CRYSTALLIZATION_KEYWORDS = [
  "remember",
  "learned",
  "crystallize",
  "save pattern",
  "what did i learn",
  "recall",
  "what patterns",
  "forget",
  "remove pattern",
  "ontology candidate",
  "ontology candidates",
  "ontology gap",
  "semantic gap",
  "reject ontology candidate",
  "reject candidate",
  "candidate rejected",
  "mark candidate as rejected",
];

export function mapCrystallizationIntent(lower: string): string {
  if (isOntologyCandidateQuery(lower)) {
    if (lower.includes("reject") || lower.includes("rejected")) {
      return "reject_ontology_candidate";
    }
    if (lower.includes("forget") || lower.includes("remove") || lower.includes("delete")) {
      return "forget_ontology_candidate";
    }
    if (lower.includes("what") || lower.includes("list") || lower.includes("recall")) {
      return "recall_ontology_candidates";
    }
    return "remember_ontology_candidate";
  }

  // Check recall patterns FIRST - query indicators like "what" signal retrieval, not storage
  if (
    lower.includes("recall") ||
    lower.includes("what") ||
    lower.includes("learn") ||
    lower.includes("list") ||
    (lower.includes("what") && lower.includes("crystallized"))
  ) {
    return "recall_patterns";
  }

  // Then check for storage actions
  if (lower.includes("remember") || lower.includes("save") || lower.includes("crystallize")) {
    return "remember_pattern";
  }

  if (lower.includes("forget") || lower.includes("remove")) {
    return "forget_pattern";
  }

  return "recall_patterns";
}

export function resolveCrystallizationQuery(
  intent: string,
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  switch (intent) {
    case "remember_pattern": {
      return handleRememberPattern(query, state);
    }

    case "recall_patterns": {
      return handleRecallPatterns(query, state);
    }

    case "forget_pattern": {
      return handleForgetPattern(query, state);
    }

    case "remember_ontology_candidate": {
      return handleRememberOntologyCandidate(query, state);
    }

    case "recall_ontology_candidates": {
      return handleRecallOntologyCandidates(query, state);
    }

    case "forget_ontology_candidate": {
      return handleForgetOntologyCandidate(query, state);
    }

    case "reject_ontology_candidate": {
      return handleRejectOntologyCandidate(query, state);
    }

    default:
      return {
        understood: true,
        intent: "crystallization",
        answer: "Crystallization query understood but not fully specified.",
        suggestions: [
          "remember: [pattern]",
          "what did I learn about [topic]",
          "remember ontology candidate: [missing term]",
          "what ontology candidates have I crystallized?",
        ],
      };
  }
}

function handleRememberPattern(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const content = normalizeString(normalizedContext.pattern) || extractQuotedContent(query.query);

  if (!content) {
    return {
      understood: true,
      intent: "crystallization",
      answer: "What pattern would you like to remember? Provide it in quotes or context.pattern.",
    };
  }

  const patternId = createEdgeMonotonicId("pattern");
  const topic = normalizeString(normalizedContext.topic) || "general";

  state.learnings.patterns.set(patternId, {
    id: patternId,
    topic,
    content,
    context: `Crystallized at turn ${state.operations.turnCount}`,
    crystallizedAt: Date.now(),
    lastAccessedAt: Date.now(),
    accessCount: 0,
    strength: 1.0,
  });

  // Update topic index
  if (!state.learnings.topicsIndex.has(topic)) {
    state.learnings.topicsIndex.set(topic, new Set());
  }
  state.learnings.topicsIndex.get(topic)?.add(patternId);

  return {
    understood: true,
    intent: "crystallization",
    answer: `Pattern crystallized: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}" (topic: ${topic})`,
    data: { patternId, topic },
  };
}

function isExactRecallQuery(query: SelfQuery): boolean {
  const normalizedContext = normalizeInput(query.context);
  const lower = query.query.toLowerCase();
  return (
    normalizedContext.exact === true ||
    normalizedContext.verbatim === true ||
    lower.includes("exact") ||
    lower.includes("verbatim") ||
    lower.includes("untruncated") ||
    lower.includes("full pattern") ||
    lower.includes("full patterns")
  );
}

function formatPatternForRecall(content: string, exactRecall: boolean): string {
  if (!exactRecall) {
    return `"${content.slice(0, 50)}..."`;
  }

  const maxExactChars = 1000;
  if (content.length <= maxExactChars) {
    return JSON.stringify(content);
  }

  return `${JSON.stringify(content.slice(0, maxExactChars))}... [truncated above ${maxExactChars} chars]`;
}

function handleRecallPatterns(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const topic = normalizeString(normalizedContext.topic);
  const exactRecall = isExactRecallQuery(query);

  let patterns = Array.from(state.learnings.patterns.values());
  if (topic) {
    const topicPatternIds = state.learnings.topicsIndex.get(topic);
    if (topicPatternIds) {
      patterns = patterns.filter((p) => topicPatternIds.has(p.id));
    }
  }

  // Sort by strength * recency
  patterns.sort((a, b) => {
    const scoreA = a.strength * (1 / (Date.now() - a.lastAccessedAt + 1));
    const scoreB = b.strength * (1 / (Date.now() - b.lastAccessedAt + 1));
    return scoreB - scoreA;
  });

  // Update access
  for (const p of patterns.slice(0, 5)) {
    p.lastAccessedAt = Date.now();
    p.accessCount++;
  }

  const visiblePatterns = patterns.slice(0, exactRecall ? 3 : 5);

  return {
    understood: true,
    intent: "crystallization",
    answer:
      patterns.length > 0
        ? `${patterns.length} pattern(s) crystallized${topic ? ` for topic "${topic}"` : ""}${exactRecall ? " (verbatim visible recall, capped at 1000 chars each)" : ""}: ${visiblePatterns
            .map((p) => formatPatternForRecall(p.content, exactRecall))
            .join("; ")}`
        : "No patterns crystallized yet.",
    data: { patterns: patterns.slice(0, 10), count: patterns.length, exactRecall },
  };
}

function handleForgetPattern(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const patternId = normalizeString(normalizedContext.patternId);

  if (!patternId) {
    return {
      understood: true,
      intent: "crystallization",
      answer: "Which pattern would you like to forget? Provide patternId in context.",
    };
  }

  const pattern = state.learnings.patterns.get(patternId);
  if (!pattern) {
    return {
      understood: true,
      intent: "crystallization",
      answer: `Pattern ${patternId} not found.`,
    };
  }

  state.learnings.patterns.delete(patternId);
  const topicPatterns = state.learnings.topicsIndex.get(pattern.topic);
  if (topicPatterns) {
    topicPatterns.delete(patternId);
  }

  return {
    understood: true,
    intent: "crystallization",
    answer: `Pattern forgotten: "${pattern.content.slice(0, 50)}..."`,
    data: { patternId },
  };
}
