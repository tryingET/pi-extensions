/**
 * Perception domain resolver - queries about session state and operations.
 */

import {
  analyzePatterns,
  queryCommandsRun,
  queryErrors,
  queryFilesTouched,
  queryLoopStatus,
  queryProgress,
} from "../perception.ts";
import type { SelfResponse, SelfState } from "../types.ts";

export const PERCEPTION_KEYWORDS = [
  "what files",
  "files touched",
  "what have i edited",
  "modified files",
  "what commands",
  "commands run",
  "what have i run",
  "what errors",
  "errors encountered",
  "failed",
  "am i looping",
  "in a loop",
  "stuck",
  "repeating",
  "progress",
  "how am i doing",
  "status",
  "am i stalled",
  "success rate",
  "how many turns",
];

export function mapPerceptionIntent(lower: string): string {
  if (lower.includes("file")) return "files_touched";
  if (lower.includes("command")) return "commands_run";
  if (lower.includes("error") || lower.includes("fail")) return "errors_encountered";
  if (lower.includes("loop") || lower.includes("repeating") || lower.includes("stuck"))
    return "am_i_looping";
  if (lower.includes("progress") || lower.includes("stalled")) return "progress_status";
  if (lower.includes("success rate")) return "success_rate";
  if (lower.includes("turn") || lower.includes("time")) return "time_since_change";
  return "session_summary";
}

export function resolvePerceptionQuery(intent: string, state: SelfState): SelfResponse {
  // Ensure patterns are analyzed
  analyzePatterns(state.operations, state.patterns);

  switch (intent) {
    case "files_touched": {
      const result = queryFilesTouched(state.operations);
      return {
        understood: true,
        intent: "perception",
        answer:
          result.total > 0
            ? `Touched ${result.total} file(s): ${result.files
                .slice(0, 10)
                .map((f) => f.path)
                .join(", ")}${result.total > 10 ? "..." : ""}`
            : "No files touched in this session.",
        data: result,
      };
    }

    case "commands_run": {
      const result = queryCommandsRun(state.operations);
      return {
        understood: true,
        intent: "perception",
        answer: `Run ${result.total} command(s) with ${Math.round(result.successRate * 100)}% success rate. Top: ${result.commands
          .slice(0, 5)
          .map((c) => c.command)
          .join(", ")}`,
        data: result,
      };
    }

    case "errors_encountered": {
      const result = queryErrors(state.operations);
      return {
        understood: true,
        intent: "perception",
        answer:
          result.total > 0
            ? `Encountered ${result.total} error(s) across ${result.errors.length} pattern(s): ${result.errors
                .slice(0, 3)
                .map((e) => e.signature)
                .join("; ")}`
            : "No errors encountered in this session.",
        data: result,
      };
    }

    case "am_i_looping": {
      const result = queryLoopStatus(state.patterns);
      return {
        understood: true,
        intent: "perception",
        answer: result.summary,
        data: { isLooping: result.isLooping, patterns: result.patterns },
      };
    }

    case "progress_status": {
      const result = queryProgress(state.operations, state.patterns);
      return {
        understood: true,
        intent: "perception",
        answer: result.summary,
        data: result,
      };
    }

    case "success_rate": {
      const result = queryCommandsRun(state.operations);
      return {
        understood: true,
        intent: "perception",
        answer: `Tool success rate: ${Math.round(result.successRate * 100)}%`,
        data: { successRate: result.successRate },
      };
    }

    case "time_since_change": {
      const turnsSince = state.operations.turnsSinceMeaningfulChange;
      const timeSince = Date.now() - state.operations.lastMeaningfulChangeAt;
      return {
        understood: true,
        intent: "perception",
        answer: `${turnsSince} turn(s) since last meaningful change (${Math.round(timeSince / 1000)}s ago).`,
        data: { turnsSince, timeSinceMs: timeSince },
      };
    }

    default: {
      return resolveSessionSummary(state);
    }
  }
}

function resolveSessionSummary(state: SelfState): SelfResponse {
  const files = queryFilesTouched(state.operations);
  const progress = queryProgress(state.operations, state.patterns);
  const loops = queryLoopStatus(state.patterns);
  const errors = queryErrors(state.operations);

  const parts = [
    `Session: ${state.operations.turnCount} turns`,
    `${files.total} files touched`,
    `${progress.operations} operations`,
    `${errors.total} errors`,
  ];

  if (loops.isLooping) {
    parts.push(`⚠️ Looping: ${loops.patterns.length} pattern(s)`);
  }
  if (progress.isStalled) {
    parts.push("⚠️ Stalled");
  }

  return {
    understood: true,
    intent: "perception",
    answer: parts.join(" | "),
    data: {
      turns: state.operations.turnCount,
      files: files.total,
      operations: progress.operations,
      errors: errors.total,
      isLooping: loops.isLooping,
      isStalled: progress.isStalled,
      loopPatterns: loops.patterns,
    },
  };
}
