/**
 * Query Resolver: Natural language -> Structured response.
 * The LLM asks in its own words, receives what it needs.
 *
 * This module is a thin composition layer. Domain-specific logic lives in:
 * - resolvers/perception.ts (session state, operations)
 * - resolvers/direction.ts (branches, confidence, help)
 * - resolvers/crystallization.ts (patterns, learnings)
 * - resolvers/protection.ts (traps, warnings)
 * - resolvers/action.ts (checkpoints, followups, prefills)
 */

import { ACTION_KEYWORDS, mapActionIntent, resolveActionQuery } from "./resolvers/action.ts";
import {
  CRYSTALLIZATION_KEYWORDS,
  mapCrystallizationIntent,
  resolveCrystallizationQuery,
} from "./resolvers/crystallization.ts";
import {
  DIRECTION_KEYWORDS,
  mapDirectionIntent,
  resolveDirectionQuery,
} from "./resolvers/direction.ts";
import {
  mapPerceptionIntent,
  PERCEPTION_KEYWORDS,
  resolvePerceptionQuery,
} from "./resolvers/perception.ts";
import {
  mapProtectionIntent,
  PROTECTION_KEYWORDS,
  resolveProtectionQuery,
} from "./resolvers/protection.ts";
import type {
  ActionIntent,
  CrystallizationIntent,
  DirectionIntent,
  PerceptionIntent,
  ProtectionIntent,
  QueryIntent,
  SelfQuery,
  SelfResponse,
  SelfState,
} from "./types.ts";

// Re-export for consumers that need direct access
export {
  resolveActionQuery,
  resolveCrystallizationQuery,
  resolveDirectionQuery,
  resolvePerceptionQuery,
  resolveProtectionQuery,
};

// Capability discovery keywords (checked first)
const CAPABILITY_KEYWORDS = [
  "what can you do",
  "what queries",
  "capabilities",
  "what do you understand",
  "show commands",
  "available queries",
];

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

export function classifyIntent(query: string): QueryIntent {
  const lower = query.toLowerCase();

  // Check capabilities FIRST (meta-query about the tool itself)
  for (const keyword of CAPABILITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "meta", intent: "list_capabilities" };
    }
  }

  // Check action domain (highest priority for domain queries)
  for (const keyword of ACTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "action", intent: mapActionIntent(lower) as ActionIntent };
    }
  }

  // Then check perception domain
  for (const keyword of PERCEPTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "perception", intent: mapPerceptionIntent(lower) as PerceptionIntent };
    }
  }

  for (const keyword of DIRECTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "direction", intent: mapDirectionIntent(lower) as DirectionIntent };
    }
  }

  for (const keyword of CRYSTALLIZATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        domain: "crystallization",
        intent: mapCrystallizationIntent(lower) as CrystallizationIntent,
      };
    }
  }

  for (const keyword of PROTECTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "protection", intent: mapProtectionIntent(lower) as ProtectionIntent };
    }
  }

  // Default to session summary for vague queries
  if (lower.includes("summary") || lower.includes("overview") || lower.length < 20) {
    return { domain: "perception", intent: "session_summary" };
  }

  return { domain: "unknown", intent: lower.slice(0, 50) };
}

// ============================================================================
// QUERY RESOLUTION
// ============================================================================

export function resolveQuery(query: SelfQuery, state: SelfState): SelfResponse {
  const intent = classifyIntent(query.query);

  switch (intent.domain) {
    case "meta":
      return resolveMetaQuery(intent.intent);
    case "perception":
      return resolvePerceptionQuery(intent.intent, state);
    case "direction":
      return resolveDirectionQuery(intent.intent, query, state);
    case "crystallization":
      return resolveCrystallizationQuery(intent.intent, query, state);
    case "protection":
      return resolveProtectionQuery(intent.intent, query, state);
    case "action":
      return resolveActionQuery(intent.intent, query, state);
    default:
      return {
        understood: false,
        intent: "unknown",
        answer: `I don't understand the query: "${query.query}". Try asking about files, commands, errors, progress, loops, branches, learnings, or traps.`,
        suggestions: [
          "What files have I touched?",
          "Am I in a loop?",
          "What progress have I made?",
          "What errors have I encountered?",
        ],
      };
  }
}

// ============================================================================
// META QUERIES (Capability Discovery)
// ============================================================================

function resolveMetaQuery(intent: string): SelfResponse {
  if (intent === "list_capabilities") {
    return {
      understood: true,
      intent: "meta",
      answer: `I understand 5 domains of queries:

**Perception** (see yourself):
- "What files have I touched?" / "What commands have I run?"
- "Am I in a loop?" / "What progress have I made?"
- "What errors have I encountered?" / "Status"

**Direction** (move yourself):
- "Spawn branch to explore X" / "What branches?"
- "I'm confident about this" / "I need help with X"

**Crystallization** (improve yourself):
- "Remember: [pattern]" / "What did I learn?"
- "Recall patterns about [topic]"

**Protection** (protect yourself):
- "Mark as trap: [pattern]" / "Am I approaching a trap?"
- "List traps"

**Action** (act):
- "Create checkpoint before [reason]"
- "Queue followup: [task]" / "Remind me: [task]"
- "Prefill: [text]"`,
      data: {
        domains: [
          {
            name: "perception",
            description: "Query session state and operations",
            examples: ["What files have I touched?", "Am I in a loop?", "Progress"],
          },
          {
            name: "direction",
            description: "Spawn branches, signal confidence, request help",
            examples: ["Spawn branch to explore X", "I need help with Y"],
          },
          {
            name: "crystallization",
            description: "Remember and recall patterns",
            examples: ["Remember: [pattern]", "What did I learn?"],
          },
          {
            name: "protection",
            description: "Mark and check for traps",
            examples: ["Mark as trap: [pattern]", "List traps"],
          },
          {
            name: "action",
            description: "Create checkpoints, queue followups, prefill editor",
            examples: ["Create checkpoint", "Queue followup: X", "Prefill: Y"],
          },
        ],
      },
    };
  }

  return {
    understood: true,
    intent: "meta",
    answer: "Meta query understood but not fully specified.",
    suggestions: ["What can you do?", "What queries do you understand?"],
  };
}
