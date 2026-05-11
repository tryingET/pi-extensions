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
  "capability discovery",
  "capability routing",
  "capability map",
  "capability maps",
  "toolbox discovery",
  "bundle discovery",
  "what do you understand",
  "show commands",
  "available queries",
];

const SEMANTIC_PRESSURE_KEYWORDS = [
  "semantic pressure",
  "semantic pressures",
  "semantic-pressure",
  "semantic-pressure annotation",
  "semantic-pressure annotations",
  "pressure annotation",
  "pressure annotations",
  "semantic annotation",
  "semantic annotations",
];

const SEMANTIC_PRESSURE_INTENTS = new Set<CrystallizationIntent>([
  "remember_semantic_pressure_annotation",
  "recall_semantic_pressure_annotations",
  "forget_semantic_pressure_annotation",
  "reject_semantic_pressure_annotation",
]);

function isSemanticPressureQuery(lower: string): boolean {
  return SEMANTIC_PRESSURE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function mapSemanticPressureIntent(lower: string): CrystallizationIntent {
  if (lower.includes("reject") || lower.includes("rejected")) {
    return "reject_semantic_pressure_annotation";
  }
  if (lower.includes("forget") || lower.includes("remove") || lower.includes("delete")) {
    return "forget_semantic_pressure_annotation";
  }
  if (lower.includes("what") || lower.includes("list") || lower.includes("recall")) {
    return "recall_semantic_pressure_annotations";
  }
  return "remember_semantic_pressure_annotation";
}

function normalizeCrystallizationIntent(intent: CrystallizationIntent): string {
  switch (intent) {
    case "remember_semantic_pressure_annotation":
      return "remember_ontology_candidate";
    case "recall_semantic_pressure_annotations":
      return "recall_ontology_candidates";
    case "forget_semantic_pressure_annotation":
      return "forget_ontology_candidate";
    case "reject_semantic_pressure_annotation":
      return "reject_ontology_candidate";
    default:
      return intent;
  }
}

function normalizeSemanticPressureText(text: string): string {
  return text
    .replace(/semantic(?:-|\s+)pressure(?:-|\s+)annotations?/gi, "ontology candidate")
    .replace(/semantic(?:-|\s+)annotations?/gi, "ontology candidate")
    .replace(/pressure annotations?/gi, "ontology candidate")
    .replace(/semantic(?:-|\s+)pressures?/gi, "ontology candidate");
}

function normalizeSemanticPressureContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const normalized = { ...context };

  if (normalized.annotationId !== undefined && normalized.candidateId === undefined) {
    normalized.candidateId = normalized.annotationId;
  }
  if (normalized.annotationKind !== undefined && normalized.candidateKind === undefined) {
    normalized.candidateKind = normalized.annotationKind;
  }

  return normalized;
}

function normalizeSemanticPressureQuery(query: SelfQuery): SelfQuery {
  return {
    ...query,
    query: normalizeSemanticPressureText(query.query),
    context: normalizeSemanticPressureContext(query.context),
  };
}

function presentSemanticPressureText(text: string): string {
  return text
    .replace(/Ontology candidate/g, "Semantic-pressure annotation")
    .replace(/ontology candidates/g, "semantic-pressure annotations")
    .replace(/ontology candidate/g, "semantic-pressure annotation")
    .replace(/candidate-only ontology gaps/g, "semantic-pressure annotations")
    .replace(/candidate-only ontology/g, "semantic-pressure");
}

function presentSemanticPressureData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const record = { ...(data as Record<string, unknown>) };

  if (typeof record.candidateId === "string" && record.annotationId === undefined) {
    record.annotationId = record.candidateId;
  }
  if (typeof record.candidateKind === "string" && record.annotationKind === undefined) {
    record.annotationKind = record.candidateKind;
  }
  if (Array.isArray(record.candidates) && record.annotations === undefined) {
    record.annotations = record.candidates;
  }

  return record;
}

function presentSemanticPressureResponse(response: SelfResponse): SelfResponse {
  return {
    ...response,
    answer: presentSemanticPressureText(response.answer),
    suggestions: response.suggestions?.map((suggestion) => presentSemanticPressureText(suggestion)),
    data: presentSemanticPressureData(response.data),
  };
}

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

  if (isSemanticPressureQuery(lower)) {
    return {
      domain: "crystallization",
      intent: mapSemanticPressureIntent(lower),
    };
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
    case "crystallization": {
      const usesSemanticPressureSurface = SEMANTIC_PRESSURE_INTENTS.has(intent.intent);
      const normalizedIntent = normalizeCrystallizationIntent(intent.intent);
      const normalizedQuery = usesSemanticPressureSurface
        ? normalizeSemanticPressureQuery(query)
        : query;
      const response = resolveCrystallizationQuery(normalizedIntent, normalizedQuery, state);
      return usesSemanticPressureSurface ? presentSemanticPressureResponse(response) : response;
    }
    case "protection":
      return resolveProtectionQuery(intent.intent, query, state);
    case "action":
      return resolveActionQuery(intent.intent, query, state);
    default:
      return {
        understood: false,
        intent: "unknown",
        answer: `I don't understand the query: "${query.query}". Try asking about files, commands, errors, progress, loops, branches, learnings, semantic-pressure annotations, traps, or capability discovery.`,
        suggestions: [
          "What files have I touched?",
          "Am I in a loop?",
          "What progress have I made?",
          "What semantic-pressure annotations have I recorded?",
          "Capability discovery",
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
      answer: `I can help with capability discovery, but these surfaces are intentionally different:

**1. self-tool query domains** (ask this tool about the current session):

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
- "Remember semantic pressure: [missing term]"
- "What semantic-pressure annotations have I recorded?"
- "Mark semantic-pressure annotation as rejected"

**Protection** (protect yourself):
- "Mark as trap: [pattern]" / "Am I approaching a trap?"
- "List traps"

**Action** (act):
- "Create checkpoint before [reason]"
- "Queue followup: [task]" / "Remind me: [task]"
- "Prefill: [text]"

**2. toolbox/bundle discovery** (outside self):
- Use the \`toolbox\` tool to search, explain, activate, deactivate, or inspect Pi extension bundles when you need extension-provided capabilities.
- Keep toolbox/bundle discovery separate from this self-tool query list; self explains itself, toolbox discovers extension bundles.

**3. repo/lane capability-map routing surfaces** (documentation/read-first routing):
- Use lane and repo capability maps such as \`repo-capability-map.md\` and \`pi-extensions/docs/project/root-capabilities.md\` to choose the owning repo/package and read-first docs.
- Capability maps are routing surfaces, not new runtime tools or durable authority.`,
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
            description: "Remember and recall patterns plus semantic-pressure annotations",
            examples: [
              "Remember: [pattern]",
              "What did I learn?",
              "Remember semantic pressure: [missing term]",
              "What semantic-pressure annotations have I recorded?",
            ],
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
        discoverySurfaces: [
          {
            name: "self-tool query domains",
            description:
              "Natural-language queries understood by this self tool for session perception, direction, crystallization, protection, and action.",
          },
          {
            name: "toolbox/bundle discovery",
            description:
              "Use the toolbox tool for Pi extension bundle search, explanation, activation, deactivation, and inspection.",
          },
          {
            name: "repo/lane capability-map routing",
            description:
              "Use repo-capability-map.md and pi-extensions/docs/project/root-capabilities.md as read-first routing surfaces for repo/package ownership.",
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
