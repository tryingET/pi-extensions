/**
 * Pattern detection helpers for self perception.
 */

import {
  activeErrorCount,
  commandIsProductiveWorkflow,
  latestRecoveryEvidenceCommandIndex,
  latestSuccessfulRecoveryEvidenceCommandAt,
} from "./perception-command-evidence.ts";
import type { DetectedPattern, OperationLog, PatternDetector } from "./types.ts";

const LOOP_THRESHOLD = 3;
const STALL_TURN_THRESHOLD = 5;

export function createPatternDetector(): PatternDetector {
  return {
    detected: [],
    lastAnalysisAt: 0,
  };
}

export function analyzePatterns(log: OperationLog, detector: PatternDetector): void {
  const patterns: DetectedPattern[] = [];
  const now = Date.now();

  // Detect edit loops: same file edited 3+ times
  const editCounts = new Map<string, number>();
  for (const op of log.fileOps) {
    if (op.type === "modify") {
      editCounts.set(op.path, (editCounts.get(op.path) ?? 0) + 1);
    }
  }
  for (const [path, count] of editCounts) {
    if (count >= LOOP_THRESHOLD) {
      patterns.push({
        type: "edit_loop",
        key: path,
        count,
        firstSeen: now,
        lastSeen: now,
        severity: count >= 5 ? "critical" : "warning",
      });
    }
  }

  // Detect command loops: same normalized command 3+ times.
  // Repeated successful workflow commands are common validation/closeout, not stuckness.
  const latestRecoveryEvidenceAt = latestSuccessfulRecoveryEvidenceCommandAt(log);
  const latestRecoveryEvidenceIndex = latestRecoveryEvidenceCommandIndex(log);
  const activeCommands = log.commands.filter((_, index) => index > latestRecoveryEvidenceIndex);
  const commandCounts = new Map<
    string,
    { count: number; successes: number; productive: boolean }
  >();
  for (const cmd of activeCommands) {
    const existing = commandCounts.get(cmd.command);
    if (existing) {
      existing.count++;
      if (cmd.success) existing.successes++;
      existing.productive = existing.productive || commandIsProductiveWorkflow(cmd);
    } else {
      commandCounts.set(cmd.command, {
        count: 1,
        successes: cmd.success ? 1 : 0,
        productive: commandIsProductiveWorkflow(cmd),
      });
    }
  }
  for (const [command, data] of commandCounts) {
    if (data.count >= LOOP_THRESHOLD) {
      if (data.successes === data.count && data.productive) continue;
      patterns.push({
        type: "command_loop",
        key: command,
        count: data.count,
        firstSeen: now,
        lastSeen: now,
        severity: data.successes === data.count ? "warning" : "critical",
      });
    }
  }

  // Detect error loops: same active error signature 3+ times. A later successful
  // validation/check command is the active-signal boundary.
  for (const error of log.errors) {
    const activeCount = activeErrorCount(error, latestRecoveryEvidenceAt);
    if (activeCount >= LOOP_THRESHOLD) {
      patterns.push({
        type: "error_loop",
        key: `${error.toolName}:${error.signature}`,
        count: activeCount,
        firstSeen: error.recoveredAt ?? error.timestamp,
        lastSeen: now,
        severity: "critical",
      });
    }
  }

  // Detect stalls: no meaningful changes for 5+ turns
  const turnsSinceChange = log.turnsSinceMeaningfulChange;
  const isStalled = turnsSinceChange >= STALL_TURN_THRESHOLD;
  if (isStalled) {
    patterns.push({
      type: "stall",
      key: "session",
      count: turnsSinceChange,
      firstSeen: log.lastMeaningfulChangeAt,
      lastSeen: now,
      severity: turnsSinceChange >= 10 ? "critical" : "warning",
    });
  }

  // Detect progress
  if (log.fileOps.length > 0) {
    const _filesTouched = new Set(log.fileOps.map((op) => op.path)).size;
    const _totalLinesDelta = log.fileOps.reduce((sum, op) => sum + op.linesDelta, 0);
    patterns.push({
      type: "progress",
      key: "session",
      count: log.fileOps.length,
      firstSeen: log.sessionStartAt,
      lastSeen: now,
      severity: "info",
    });
  }

  detector.detected = patterns;
  detector.lastAnalysisAt = now;
}
