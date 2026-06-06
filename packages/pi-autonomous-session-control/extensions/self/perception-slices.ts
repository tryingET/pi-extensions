/**
 * Mirror-only continuation slice ranking for self perception.
 */

import type {
  ErrorsResult,
  FilesTouchedResult,
  LoopStatusResult,
  ProgressResult,
} from "./perception.ts";

const LOOP_THRESHOLD = 3;

export interface SuggestedHarnessMove {
  slice: string;
  owner: string;
  prefillText: string;
  score?: number;
  confidence?: "low" | "medium" | "high";
  reason?: string;
  evidence?: string[];
  nonAuthorizations?: string[];
}

export interface SliceCandidate extends SuggestedHarnessMove {
  score: number;
  confidence: "low" | "medium" | "high";
  reason: string;
  evidence: string[];
  nonAuthorizations: string[];
}

export function rankSliceCandidates(input: {
  files: FilesTouchedResult["files"];
  commands: Array<{
    command: string;
    rawCommand: string;
    success: boolean;
    activeFailure?: boolean;
  }>;
  errors: ErrorsResult["errors"];
  loops: LoopStatusResult;
  progress: ProgressResult;
}): SliceCandidate[] {
  const candidates: SliceCandidate[] = [];
  const failedCommands = input.commands.filter((cmd) => cmd.activeFailure ?? !cmd.success).length;
  const activeErrorPatterns = input.errors.filter((error) => error.activeCount >= LOOP_THRESHOLD);
  const failureRecoveryLoopPatterns = input.loops.patterns.filter(
    (pattern) =>
      pattern.type === "error_loop" ||
      (pattern.type === "command_loop" && pattern.severity === "critical"),
  );

  if (
    activeErrorPatterns.length > 0 ||
    failureRecoveryLoopPatterns.length > 0 ||
    failedCommands >= LOOP_THRESHOLD
  ) {
    candidates.push({
      slice: "temporal + failure-recovery + source-owner + authority-risk",
      owner: "peer-tools",
      score: 95,
      confidence: "high",
      reason:
        "Loop/error cues need a read-only recovery review before more mutation or authority claims.",
      evidence: [
        ...(failureRecoveryLoopPatterns.length > 0
          ? [`${failureRecoveryLoopPatterns.length} failure-recovery loop pattern(s)`]
          : []),
        ...(activeErrorPatterns.length > 0
          ? [`${activeErrorPatterns.length} active error loop(s)`]
          : []),
        ...(failedCommands > 0 ? [`${failedCommands} failed recent command(s)`] : []),
      ],
      nonAuthorizations: ["do not edit files", "do not claim task/evidence authority"],
      prefillText:
        "/scoutpeer Review the visible loop/error/failure-recovery cues and recommend the smallest safe next move without changing owner boundaries. Do not edit files or claim authority.",
    });
  }

  if (input.progress.isStalled) {
    candidates.push({
      slice: "temporal + artifact/packet",
      owner: "pi-session-compaction",
      score: activeErrorPatterns.length > 0 || failureRecoveryLoopPatterns.length > 0 ? 70 : 90,
      confidence: "high",
      reason:
        "A continuation or handoff should preserve session order, artifacts, and next action.",
      evidence: [`${input.progress.turnsSinceChange} turn(s) since tracked meaningful change`],
      nonAuthorizations: ["do not make ASC the compaction owner"],
      prefillText:
        "/compact-focus temporal + artifact/packet: preserve objective, recent validation, stall-with-progress context, dirty files, and next safe action; do not make ASC the compaction owner.",
    });
  }

  if (input.files.length > 1) {
    candidates.push({
      slice: "horizontal + artifact/packet + source-owner",
      owner: "pi-context-packer",
      score: 65,
      confidence: "medium",
      reason: "Multiple touched files may need a cross-file packet before continuing.",
      evidence: [`${input.files.length} touched file(s)`],
      nonAuthorizations: ["do not treat context packets as task authority"],
      prefillText:
        "Use context_plan for a horizontal source-owner packet over the touched files, then continue only within the owning package boundaries.",
    });
  }

  if (input.files.length === 1 && failedCommands === 0 && !input.progress.isStalled) {
    candidates.push({
      slice: "vertical + local-validation",
      owner: "local-shell",
      score: 55,
      confidence: "medium",
      reason:
        "A single touched file with no visible failure usually wants the narrow validation path.",
      evidence: [`1 touched file: ${input.files[0]?.path}`],
      nonAuthorizations: ["do not broaden scope without a new signal"],
      prefillText: "npm run check",
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
