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
import { isAutonomyStatusQuery, resolveAutonomyStatusQuery } from "./resolvers/autonomy-status.ts";
import { resolveCapabilityQuery } from "./resolvers/capabilities.ts";
import {
  CRYSTALLIZATION_KEYWORDS,
  mapCrystallizationIntent,
  resolveCrystallizationQuery,
} from "./resolvers/crystallization.ts";
import { resolveDiagnosticReviewQuery } from "./resolvers/diagnostic-review.ts";
import {
  DIRECTION_KEYWORDS,
  mapDirectionIntent,
  resolveDirectionQuery,
} from "./resolvers/direction.ts";
import {
  isEvolutionFeedbackQuery,
  mapEvolutionFeedbackIntent,
  resolveEvolutionFeedbackQuery,
} from "./resolvers/evolution-feedback.ts";
import { resolveMemoryLifecycleStatus } from "./resolvers/memory-lifecycle-status.ts";
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

const DIAGNOSTIC_REVIEW_KEYWORDS = [
  "dogfood self",
  "improve self",
  "improve the self",
  "self improvement",
  "self-improvement",
  "self evolution",
  "self-evolution",
  "self evolve",
  "evolve self",
  "how should self improve",
  "how can self improve",
  "how can you improve",
  "what friction",
  "friction just happened",
  "tooling friction",
  "workflow friction",
  "missing affordance",
  "this was annoying",
  "that was annoying",
  "record this friction",
  "diagnostic candidate",
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

function isDiagnosticReviewQuery(lower: string): boolean {
  return DIAGNOSTIC_REVIEW_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isMemoryLifecycleStatusQuery(lower: string): boolean {
  return (
    lower.includes("memory lifecycle") ||
    lower.includes("memory status") ||
    lower.includes("self memory status") ||
    lower.includes("memory persistence status") ||
    lower.includes("memory load status")
  );
}

function isExplicitCrystallizationDirectiveQuery(lower: string): boolean {
  return /^\s*remember\s*:/u.test(lower);
}

function isExplicitProtectionDirectiveQuery(lower: string): boolean {
  return /^\s*mark\s+as\s+trap\s*:/u.test(lower);
}

function isExplicitUserMessageActionQuery(lower: string): boolean {
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

function isExplicitDiagnosticActionQuery(lower: string): boolean {
  return (
    isExplicitUserMessageActionQuery(lower) ||
    lower.includes("record continuation candidate") ||
    lower.includes("queue continuation candidate") ||
    lower.includes("remember next autonomous step") ||
    /prefill (?:visible[- ]loop self-evolution|self-evolution (?:visible-loop|loop))/u.test(
      lower,
    ) ||
    lower.includes("continue diagnostic review") ||
    lower.includes("continue self diagnostic") ||
    lower.includes("send diagnostic review") ||
    lower.includes("send diagnostic followup") ||
    lower.includes("send diagnostic follow-up") ||
    lower.includes("prefill diagnostic record") ||
    lower.includes("prefill agent_vent record") ||
    lower.includes("prefill vent record") ||
    lower.trim().startsWith("record this friction")
  );
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

function unquoteDirectiveContent(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([\s\S]*)"$/) || trimmed.match(/^'([\s\S]*)'$/);
  return (quoted?.[1] ?? trimmed).trim();
}

function normalizeColonDirectiveContext(
  query: SelfQuery,
  field: "pattern" | "description",
  pattern: RegExp,
): SelfQuery {
  const context = query.context ?? {};
  if (typeof context[field] === "string" && context[field].trim().length > 0) {
    return query;
  }

  const match = query.query.match(pattern);
  const content = match?.[1] ? unquoteDirectiveContent(match[1]) : "";
  if (content.length === 0) {
    return query;
  }

  return {
    ...query,
    context: {
      ...context,
      [field]: content,
    },
  };
}

export function classifyIntent(query: string): QueryIntent {
  const lower = query.toLowerCase();

  // Check diagnostic review before broad action keywords so incidental action words in
  // self-evolution questions (for example "dogfood self: ... checkpoint ...") do not mutate
  // action state. Explicit diagnostic action follow-ups are still handled as actions.
  if (isExplicitDiagnosticActionQuery(lower)) {
    return { domain: "action", intent: mapActionIntent(lower) as ActionIntent };
  }

  // Explicit storage/protection directives own their payload, so diagnostic/self-evolution
  // keywords inside the content do not hijack them into mirror-only diagnostic review.
  // User-message/diagnostic action directives are checked above to preserve safe routing.
  if (isExplicitCrystallizationDirectiveQuery(lower)) {
    return { domain: "crystallization", intent: "remember_pattern" };
  }

  if (isExplicitProtectionDirectiveQuery(lower)) {
    return { domain: "protection", intent: "mark_trap" };
  }

  if (isEvolutionFeedbackQuery(lower)) {
    return { domain: "meta", intent: mapEvolutionFeedbackIntent(lower) };
  }

  if (isDiagnosticReviewQuery(lower)) {
    return { domain: "meta", intent: "diagnostic_review" };
  }

  // Check explicit action/crystallization/protection requests before capability discovery.
  for (const keyword of ACTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "action", intent: mapActionIntent(lower) as ActionIntent };
    }
  }

  if (isSemanticPressureQuery(lower)) {
    return {
      domain: "crystallization",
      intent: mapSemanticPressureIntent(lower),
    };
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

  if (isAutonomyStatusQuery(lower)) {
    return { domain: "meta", intent: "autonomy_status" };
  }

  if (isMemoryLifecycleStatusQuery(lower)) {
    return { domain: "meta", intent: "memory_lifecycle_status" };
  }

  // Check capabilities after explicit domain requests (meta-query about the tool itself).
  for (const keyword of CAPABILITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { domain: "meta", intent: "list_capabilities" };
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

  // Default to session summary for vague queries
  if (lower.includes("summary") || lower.includes("overview") || lower.length < 20) {
    return { domain: "perception", intent: "session_summary" };
  }

  return { domain: "unknown", intent: lower.slice(0, 50) };
}

export function resolveQuery(query: SelfQuery, state: SelfState): SelfResponse {
  const intent = classifyIntent(query.query);

  switch (intent.domain) {
    case "meta":
      return resolveMetaQuery(intent.intent, query, state);
    case "perception":
      return resolvePerceptionQuery(intent.intent, state, query);
    case "direction":
      return resolveDirectionQuery(intent.intent, query, state);
    case "crystallization": {
      const usesSemanticPressureSurface = SEMANTIC_PRESSURE_INTENTS.has(intent.intent);
      const normalizedIntent = normalizeCrystallizationIntent(intent.intent);
      const baseQuery = usesSemanticPressureSurface ? normalizeSemanticPressureQuery(query) : query;
      const normalizedQuery =
        normalizedIntent === "remember_pattern"
          ? normalizeColonDirectiveContext(baseQuery, "pattern", /^\s*remember\s*:\s*([\s\S]+)$/i)
          : baseQuery;
      const response = resolveCrystallizationQuery(normalizedIntent, normalizedQuery, state);

      return usesSemanticPressureSurface ? presentSemanticPressureResponse(response) : response;
    }
    case "protection": {
      const normalizedQuery =
        intent.intent === "mark_trap"
          ? normalizeColonDirectiveContext(
              query,
              "description",
              /^\s*mark\s+as\s+trap\s*:\s*([\s\S]+)$/i,
            )
          : query;
      return resolveProtectionQuery(intent.intent, normalizedQuery, state);
    }
    case "action":
      return resolveActionQuery(intent.intent, query, state);
    default:
      return resolveUnknownQuery(query);
  }
}

function resolveUnknownQuery(query: SelfQuery): SelfResponse {
  return {
    understood: false,
    intent: "unknown",
    answer: `I don't understand the query: "${query.query}". Try asking about files, commands, errors, progress, loops, branches, learnings, semantic-pressure annotations, traps, diagnostic review, or capability discovery.`,
    data: {
      nearestIntents: [
        "perception: current files/commands/errors/progress",
        "action: checkpoint/followup/prefill/notify operator/continue suggested next move",
        "meta: capability discovery or diagnostic review",
      ],
    },
    suggestions: [
      "What files have I touched?",
      "Am I in a loop?",
      "What progress have I made?",
      "Dogfood self: what friction just happened?",
      "Capability discovery",
    ],
  };
}

function resolveMetaQuery(
  intent: string,
  query: SelfQuery | undefined,
  state: SelfState,
): SelfResponse {
  if ((intent === "record_feedback" || intent === "list_feedback") && query) {
    return resolveEvolutionFeedbackQuery(intent, query, state);
  }

  if (intent === "diagnostic_review") {
    return resolveDiagnosticReviewQuery(query, state);
  }

  if (intent === "list_capabilities") {
    return resolveCapabilityQuery();
  }

  if (intent === "memory_lifecycle_status") {
    return resolveMemoryLifecycleStatus(query, state);
  }

  if (intent === "autonomy_status") {
    return resolveAutonomyStatusQuery(query);
  }

  return {
    understood: true,
    intent: "meta",
    answer: "Meta query understood but not fully specified.",
    suggestions: ["What can you do?", "What queries do you understand?"],
  };
}
