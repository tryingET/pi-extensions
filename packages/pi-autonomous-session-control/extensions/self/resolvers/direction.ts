/**
 * Direction domain resolver - spawning branches, signaling confidence, requesting help.
 */

import {
  createEdgeMonotonicId,
  normalizeEnum,
  normalizeInput,
  normalizeString,
} from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractConfidenceLevel, extractQuotedContent, extractUrgency } from "./helpers.ts";

export const DIRECTION_KEYWORDS = [
  "spawn branch",
  "explore alternative",
  "try different approach",
  "compare branches",
  "compare alternatives",
  "list branches",
  "what branches",
  "what branch",
  "branch status",
  "confident",
  "certainty",
  "uncertain",
  "sure",
  "need help",
  "help me",
  "request help",
  "guidance",
  "stuck need",
];

export function mapDirectionIntent(lower: string): string {
  if (lower.includes("compare")) return "compare_branches";
  if (
    lower.includes("list branch") ||
    lower.includes("what branch") ||
    lower.includes("branch status")
  ) {
    return "list_branches";
  }
  if (lower.includes("confident") || lower.includes("certain")) return "signal_confidence";
  if (lower.includes("help") || lower.includes("guidance")) return "request_help";
  if (lower.includes("spawn") || lower.includes("branch")) return "spawn_branch";
  return "spawn_branch";
}

export function resolveDirectionQuery(
  intent: string,
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  switch (intent) {
    case "spawn_branch": {
      return handleSpawnBranch(query, state);
    }

    case "list_branches": {
      return handleListBranches(state);
    }

    case "compare_branches": {
      return handleCompareBranches(state);
    }

    case "signal_confidence": {
      return handleSignalConfidence(query, state);
    }

    case "request_help": {
      return handleRequestHelp(query, state);
    }

    default:
      return {
        understood: true,
        intent: "direction",
        answer: "Direction query understood but not fully specified.",
        suggestions: ["spawn branch", "signal confidence", "request help", "list branches"],
      };
  }
}

function handleSpawnBranch(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const objective =
    normalizeString(normalizedContext.objective) ||
    extractQuotedContent(query.query) ||
    "explore alternative approach";

  const branchId = createEdgeMonotonicId("branch");
  const entryId = normalizeString(normalizedContext.entryId);

  if (!entryId) {
    return {
      understood: true,
      intent: "direction",
      answer: "To spawn a branch, I need an entryId to fork from. Provide it in context.",
      suggestions: ["self({ query: 'spawn branch to explore X', context: { entryId: '...' })"],
    };
  }

  state.branches.branches.set(branchId, {
    id: branchId,
    objective,
    spawnedAt: Date.now(),
    entryId,
    status: "active",
  });
  state.branches.activeBranchCount++;

  return {
    understood: true,
    intent: "direction",
    answer: `Branch spawned: "${objective}". Use /fork from entryId ${entryId}, then work on the alternative approach.`,
    data: { branchId, objective, entryId },
  };
}

function handleListBranches(state: SelfState): SelfResponse {
  const branches = Array.from(state.branches.branches.values());
  return {
    understood: true,
    intent: "direction",
    answer:
      branches.length > 0
        ? `${branches.length} branch(es): ${branches.map((b) => `"${b.objective}" (${b.status})`).join(", ")}`
        : "No branches spawned in this session.",
    data: { branches, count: branches.length },
  };
}

function handleCompareBranches(state: SelfState): SelfResponse {
  const branches = Array.from(state.branches.branches.values());

  if (branches.length < 2) {
    return {
      understood: true,
      intent: "direction",
      answer:
        branches.length === 0
          ? "No branches available to compare yet. Spawn at least two branches first."
          : "Only one branch exists. Spawn another branch to compare alternatives.",
      data: { branches, count: branches.length, comparable: false },
      suggestions: [
        "spawn branch to explore alternative A",
        "spawn branch to explore alternative B",
      ],
    };
  }

  const byStatus = branches.reduce<Record<string, number>>((acc, branch) => {
    acc[branch.status] = (acc[branch.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    understood: true,
    intent: "direction",
    answer: `Comparison snapshot: ${branches.length} branches (${Object.entries(byStatus)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ")}).`,
    data: { branches, count: branches.length, byStatus, comparable: true },
  };
}

function handleSignalConfidence(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const level = extractConfidenceLevel(query.query);
  const context =
    normalizeString(normalizedContext.context) || extractQuotedContent(query.query) || "general";

  state.signals.confidenceSignals.push({
    level,
    context,
    timestamp: Date.now(),
  });
  state.signals.lastSignalAt = Date.now();

  return {
    understood: true,
    intent: "direction",
    answer: `Confidence signal recorded: ${level} for "${context}".`,
    data: { level, context },
  };
}

function handleRequestHelp(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const topic =
    normalizeString(normalizedContext.topic) || extractQuotedContent(query.query) || "unspecified";
  const urgency =
    normalizeEnum(normalizedContext.urgency, ["low", "medium", "high"] as const) ||
    extractUrgency(query.query);
  const context = normalizeString(normalizedContext.context, { allowEmpty: true }) || "";

  state.signals.helpRequests.push({
    topic,
    context,
    urgency,
    timestamp: Date.now(),
    resolved: false,
  });
  state.signals.lastSignalAt = Date.now();

  return {
    understood: true,
    intent: "direction",
    answer: `Help request recorded for "${topic}" (${urgency} urgency). The operator will be notified.`,
    data: { topic, urgency, context },
    suggestions: [
      "The operator should respond with guidance.",
      "If you can proceed with partial information, signal confidence: 'medium' or 'low'.",
    ],
  };
}
