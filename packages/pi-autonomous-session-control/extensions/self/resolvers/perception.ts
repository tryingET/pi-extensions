/**
 * Perception domain resolver - queries about session state and operations.
 */

import {
  analyzePatterns,
  queryCommandsRun,
  queryErrors,
  queryFilesTouched,
  queryHandoffSummary,
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
  "handoff",
  "closeout",
  "close out",
  "close-out",
  "controller summary",
  "session close",
  "am i stalled",
  "success rate",
  "how many turns",
  "rank continuation slices",
  "suggest next slice",
  "best slice",
  "slice ranking",
  "failure-recovery cues",
  "smallest safe next action",
  "recent failed commands",
];

export function mapPerceptionIntent(lower: string): string {
  if (
    lower.includes("handoff") ||
    lower.includes("closeout") ||
    lower.includes("close out") ||
    lower.includes("close-out") ||
    lower.includes("controller summary") ||
    lower.includes("session close") ||
    lower.includes("failure-recovery cues") ||
    lower.includes("smallest safe next action") ||
    lower.includes("recent failed commands")
  ) {
    return "handoff_summary";
  }
  if (
    lower.includes("rank continuation slices") ||
    lower.includes("suggest next slice") ||
    lower.includes("best slice") ||
    lower.includes("slice ranking")
  ) {
    return "slice_ranking";
  }
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

    case "slice_ranking": {
      const result = queryHandoffSummary(state.operations, state.patterns);
      const rankingText =
        result.sliceCandidates.length > 0
          ? result.sliceCandidates
              .map(
                (candidate, index) =>
                  `${index + 1}. ${candidate.slice} via ${candidate.owner} (${candidate.confidence}, ${candidate.score}) — ${candidate.reason}`,
              )
              .join("; ")
          : "no continuation slice candidate from current mirror state";
      return {
        understood: true,
        intent: "perception",
        answer: `Mirror-only slice ranking: ${rankingText}`,
        data: {
          sliceCandidates: result.sliceCandidates,
          nextMove: result.nextMove,
          authority: result.authority,
        },
      };
    }

    case "handoff_summary": {
      const result = queryHandoffSummary(state.operations, state.patterns);
      const fileText =
        result.files.length > 0
          ? result.files
              .slice(0, 5)
              .map(
                (f) =>
                  `${f.path} (${f.lastOp}, ${f.ops} op${f.ops === 1 ? "" : "s"}, Δ${f.netLinesDelta})`,
              )
              .join("; ")
          : "none tracked";
      const commandText =
        result.commands.length > 0
          ? result.commands
              .map((cmd) => `${cmd.success ? "ok" : "failed"}: ${cmd.rawCommand}`)
              .join("; ")
          : "none tracked";
      const errorText =
        result.errors.length > 0
          ? result.errors
              .map((error) => `${error.tool}:${error.signature} (${error.count}x)`)
              .join("; ")
          : "none tracked";
      const nextMoveText = result.nextMove
        ? `; next suggested move=${result.nextMove.slice} via ${result.nextMove.owner}`
        : "";

      return {
        understood: true,
        intent: "perception",
        answer: `Mirror-only handoff summary: files=${fileText}; recent commands=${commandText}; errors=${errorText}; progress=${result.progress.summary}; loops=${result.loops.summary}; cues=${result.cues.join(" | ")}${nextMoveText}`,
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
    parts.push(`⚠️ Possible repetition: ${loops.patterns.length} pattern(s)`);
  }
  if (progress.isStalled) {
    parts.push(
      progress.concern === "stall_with_progress_evidence"
        ? "⚠️ Possible stall with progress evidence"
        : "⚠️ Possible stall",
    );
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
      progressConcern: progress.concern,
    },
  };
}
