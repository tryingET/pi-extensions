/**
 * Protection domain resolver - marking and checking for traps.
 */

import {
  createEdgeMonotonicId,
  normalizeInput,
  normalizeString,
  normalizeStringArray,
} from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

export const PROTECTION_KEYWORDS = [
  "trap",
  "avoid",
  "warning",
  "danger",
  "mark as trap",
  "known issue",
  "am i approaching",
  "proximity",
];

export function mapProtectionIntent(lower: string): string {
  if (lower.includes("mark") || lower.includes("add trap")) return "mark_trap";
  if (lower.includes("approach") || lower.includes("near")) return "trap_proximity";
  if (lower.includes("list") || lower.includes("what trap")) return "list_traps";
  return "check_traps";
}

export function resolveProtectionQuery(
  intent: string,
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  switch (intent) {
    case "mark_trap": {
      return handleMarkTrap(query, state);
    }

    case "check_traps":
    case "trap_proximity": {
      return handleTrapProximity(query, state);
    }

    case "list_traps": {
      const normalizedContext = normalizeInput(query.context);
      const topic = normalizeString(normalizedContext.topic) || extractTopicFilter(query.query);
      const traps = filterTrapsByTopic(Array.from(state.traps.traps.values()), topic);
      const topicSummary = summarizeTrapTopics(traps);

      return {
        understood: true,
        intent: "protection",
        answer:
          traps.length > 0
            ? `${traps.length} trap(s) marked${topic ? ` for topic "${topic}"` : ""}: ${traps.map((t) => `"${t.description.slice(0, 30)}..."`).join("; ")}. Topics: ${formatTopicSummary(topicSummary)}`
            : topic
              ? `No traps marked for topic "${topic}".`
              : "No traps marked in this session.",
        data: { traps, count: traps.length, topicSummary },
      };
    }

    default:
      return {
        understood: true,
        intent: "protection",
        answer: "Protection query understood but not fully specified.",
        suggestions: ["mark as trap: [description]", "am I approaching a trap?", "list traps"],
      };
  }
}

function handleMarkTrap(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const description =
    normalizeString(normalizedContext.description) || extractQuotedContent(query.query);

  if (!description) {
    return {
      understood: true,
      intent: "protection",
      answer:
        "What trap would you like to mark? Provide a description in quotes or context.description.",
    };
  }

  const trapId = createEdgeMonotonicId("trap");
  const topic = normalizeString(normalizedContext.topic);
  const triggers = normalizeStringArray(normalizedContext.triggers) || [];

  state.traps.traps.set(trapId, {
    id: trapId,
    description,
    context: `Marked at turn ${state.operations.turnCount}`,
    topic,
    triggers,
    markedAt: Date.now(),
    encounterCount: 0,
  });

  return {
    understood: true,
    intent: "protection",
    answer: `Trap marked: "${description.slice(0, 100)}". I will warn when approaching this pattern.`,
    data: { trapId },
  };
}

function normalizeTopicKey(topic: string): string {
  return topic.trim().toLowerCase();
}

function extractTopicFilter(query: string): string | undefined {
  const naturalMatch = query.match(/\b(?:about|for)\s+["']?([^"'?.,;]+)["']?/i);
  const explicitMatch = query.match(/\btopic\s*:\s*["']?([^"'?.,;]+)["']?/i);
  const topic = (naturalMatch?.[1] ?? explicitMatch?.[1])?.trim();
  return topic && topic.length > 0 ? topic : undefined;
}

function filterTrapsByTopic<T extends { description: string; topic?: string }>(
  traps: T[],
  topic?: string,
): T[] {
  if (!topic) {
    return traps;
  }

  const normalizedTopic = normalizeTopicKey(topic);
  return traps.filter(
    (trap) =>
      (trap.topic !== undefined && normalizeTopicKey(trap.topic) === normalizedTopic) ||
      trap.description.toLowerCase().includes(normalizedTopic),
  );
}

function summarizeTrapTopics(
  traps: Array<{ topic?: string }>,
): Array<{ topic: string; count: number }> {
  const counts = new Map<string, { topic: string; count: number }>();

  for (const trap of traps) {
    const topic = trap.topic ?? "trap";
    const key = normalizeTopicKey(topic);
    const current = counts.get(key) ?? { topic, count: 0 };
    current.count++;
    counts.set(key, current);
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.topic.localeCompare(b.topic),
  );
}

function formatTopicSummary(summary: Array<{ topic: string; count: number }>): string {
  return summary.map((entry) => `${entry.topic} (${entry.count})`).join(", ");
}

function handleTrapProximity(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const currentContext =
    normalizeString(normalizedContext.currentContext, { allowEmpty: true }) || "";

  // Check for trap proximity
  const approachingTraps: Array<{ id: string; description: string; matchScore: number }> = [];

  for (const trap of state.traps.traps.values()) {
    for (const trigger of trap.triggers) {
      if (currentContext.toLowerCase().includes(trigger.toLowerCase())) {
        approachingTraps.push({
          id: trap.id,
          description: trap.description,
          matchScore: 1,
        });
        trap.encounterCount++;
        break;
      }
    }
  }

  return {
    understood: true,
    intent: "protection",
    answer:
      approachingTraps.length > 0
        ? `⚠️ Approaching ${approachingTraps.length} known trap(s): ${approachingTraps.map((t) => `"${t.description.slice(0, 50)}..."`).join("; ")}`
        : "No known traps in current context.",
    data: { approachingTraps, totalTraps: state.traps.traps.size },
  };
}
