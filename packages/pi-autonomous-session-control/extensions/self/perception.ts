/**
 * Perception Layer: Operation tracking and pattern detection.
 * The LLM queries this to perceive its own behavior.
 */

import { type ContextPressureResult, queryContextPressure } from "./context-pressure.ts";
import {
  activeErrorCount,
  commandIsProductiveWorkflow,
  extractErrorSignature,
  isProductiveWorkflowCommand,
  isRecoveryEvidenceCommand,
  latestRecoveryEvidenceCommandIndex,
  latestSuccessfulRecoveryEvidenceCommandAt,
  normalizeCommand,
  normalizeRawCommandForStorage,
  recoveryEvidenceAppliesToError,
} from "./perception-command-evidence.ts";
import { rankSliceCandidates, type SliceCandidate } from "./perception-slices.ts";
import type { DetectedPattern, FileOperation, OperationLog, PatternDetector } from "./types.ts";

export { analyzePatterns, createPatternDetector } from "./perception-patterns.ts";
export { rankSliceCandidates } from "./perception-slices.ts";

// ============================================================================
// OPERATION LOG
// ============================================================================

export function createOperationLog(): OperationLog {
  return {
    fileOps: [],
    commands: [],
    errors: [],
    sessionStartAt: Date.now(),
    lastMeaningfulChangeAt: Date.now(),
    turnCount: 0,
    turnsSinceMeaningfulChange: 0,
  };
}

export function trackFileOp(log: OperationLog, op: Omit<FileOperation, "timestamp">): void {
  log.fileOps.push({ ...op, timestamp: Date.now() });
  log.lastMeaningfulChangeAt = Date.now();
  log.turnsSinceMeaningfulChange = 0;
  trimLog(log);
}

export function trackCommand(log: OperationLog, rawCommand: string, success: boolean): void {
  const normalized = normalizeCommand(rawCommand);
  const now = Date.now();
  const recoveryEvidence = success && isRecoveryEvidenceCommand(rawCommand);
  log.commands.push({
    command: normalized,
    rawCommand: normalizeRawCommandForStorage(rawCommand),
    timestamp: now,
    success,
    productiveWorkflow: isProductiveWorkflowCommand(rawCommand),
    recoveryEvidence,
  });
  if (recoveryEvidence) {
    for (const error of log.errors) {
      if (!recoveryEvidenceAppliesToError(error)) continue;
      error.recoveredAt = now;
      error.activeCount = 0;
    }
  }
  trimLog(log);
}

export function trackError(log: OperationLog, toolName: string, rawMessage: string): void {
  const signature = extractErrorSignature(rawMessage);
  const now = Date.now();

  // Find or create error entry
  const entry = log.errors.find((e) => e.toolName === toolName && e.signature === signature);
  if (entry) {
    const latestRecoveryEvidenceAt = latestSuccessfulRecoveryEvidenceCommandAt(log);
    const priorLastSeen = entry.lastSeen ?? entry.timestamp;
    const recoveredBeforeRecurrence =
      recoveryEvidenceAppliesToError(entry) &&
      latestRecoveryEvidenceAt > 0 &&
      priorLastSeen < latestRecoveryEvidenceAt;
    const priorActiveCount = recoveredBeforeRecurrence ? 0 : (entry.activeCount ?? entry.count);
    entry.count++;
    entry.lastSeen = now;
    entry.rawMessage = rawMessage.slice(0, 200);
    entry.activeCount = priorActiveCount + 1;
  } else {
    log.errors.push({
      toolName,
      signature,
      rawMessage: rawMessage.slice(0, 200),
      timestamp: now,
      lastSeen: now,
      count: 1,
      activeCount: 1,
    });
  }
  trimLog(log);
}

export function incrementTurn(log: OperationLog): void {
  log.turnCount++;
  log.turnsSinceMeaningfulChange++;
}

function trimLog(log: OperationLog, maxSize = 500): void {
  if (log.fileOps.length > maxSize) {
    log.fileOps = log.fileOps.slice(-maxSize);
  }
  if (log.commands.length > maxSize) {
    log.commands = log.commands.slice(-maxSize);
  }
  if (log.errors.length > maxSize) {
    log.errors = log.errors.slice(-maxSize);
  }
}

// ============================================================================
// PERCEPTION QUERIES
// ============================================================================

export interface FilesTouchedResult {
  files: Array<{ path: string; ops: number; lastOp: string; netLinesDelta: number }>;
  total: number;
}

export function queryFilesTouched(log: OperationLog): FilesTouchedResult {
  const fileMap = new Map<string, { ops: number; lastOp: string; netLinesDelta: number }>();

  for (const op of log.fileOps) {
    const existing = fileMap.get(op.path);
    if (existing) {
      existing.ops++;
      existing.lastOp = op.type;
      existing.netLinesDelta += op.linesDelta;
    } else {
      fileMap.set(op.path, { ops: 1, lastOp: op.type, netLinesDelta: op.linesDelta });
    }
  }

  return {
    files: Array.from(fileMap.entries()).map(([path, data]) => ({
      path,
      ops: data.ops,
      lastOp: data.lastOp,
      netLinesDelta: data.netLinesDelta,
    })),
    total: fileMap.size,
  };
}

export interface CommandsRunResult {
  commands: Array<{ command: string; count: number; successRate: number }>;
  total: number;
  successRate: number;
}

export function queryCommandsRun(log: OperationLog): CommandsRunResult {
  const commandMap = new Map<string, { count: number; successes: number }>();
  let totalSuccesses = 0;
  let totalRuns = 0;

  for (const cmd of log.commands) {
    const existing = commandMap.get(cmd.command);
    if (existing) {
      existing.count++;
      if (cmd.success) existing.successes++;
    } else {
      commandMap.set(cmd.command, {
        count: 1,
        successes: cmd.success ? 1 : 0,
      });
    }
    totalRuns++;
    if (cmd.success) totalSuccesses++;
  }

  return {
    commands: Array.from(commandMap.entries())
      .map(([command, data]) => ({
        command,
        count: data.count,
        successRate: data.count > 0 ? data.successes / data.count : 0,
      }))
      .sort((a, b) => b.count - a.count),
    total: totalRuns,
    successRate: totalRuns > 0 ? totalSuccesses / totalRuns : 0,
  };
}

export interface ErrorsResult {
  errors: Array<{
    tool: string;
    signature: string;
    count: number;
    activeCount: number;
    lastMessage: string;
    lastSeen: number;
  }>;
  total: number;
}

export function queryErrors(log: OperationLog): ErrorsResult {
  const latestRecoveryEvidenceAt = latestSuccessfulRecoveryEvidenceCommandAt(log);
  return {
    errors: log.errors.map((e) => ({
      tool: e.toolName,
      signature: e.signature,
      count: e.count,
      activeCount: activeErrorCount(e, latestRecoveryEvidenceAt),
      lastMessage: e.rawMessage,
      lastSeen: e.lastSeen ?? e.timestamp,
    })),
    total: log.errors.reduce((sum, e) => sum + e.count, 0),
  };
}

export interface LoopStatusResult {
  isLooping: boolean;
  patterns: DetectedPattern[];
  summary: string;
}

export function queryLoopStatus(detector: PatternDetector): LoopStatusResult {
  const loops = detector.detected.filter(
    (p) => p.type === "edit_loop" || p.type === "command_loop" || p.type === "error_loop",
  );

  const isLooping = loops.length > 0;
  const summary = isLooping
    ? `Mirror-only advisory: possible repetition in ${loops.length} pattern(s): ${loops.map((l) => `${l.type}(${l.key}): ${l.count}x`).join(", ")}. Review task context before treating this as stuckness.`
    : "Mirror-only advisory: no loop concern from tracked session-local evidence.";

  return {
    isLooping,
    patterns: loops,
    summary,
  };
}

export interface ProgressResult {
  hasProgress: boolean;
  filesTouched: number;
  operations: number;
  turnsSinceChange: number;
  isStalled: boolean;
  concern: "stall_with_progress_evidence" | "possible_stall" | "no_concern";
  progressEvidence: { recentSuccessfulProductiveCommands: number };
  contextPressure: ContextPressureResult;
  summary: string;
}

export function queryProgress(log: OperationLog, detector: PatternDetector): ProgressResult {
  const filesTouched = new Set(log.fileOps.map((op) => op.path)).size;
  const hasProgress = log.fileOps.length > 0;
  const stallPattern = detector.detected.find((p) => p.type === "stall");
  const isStalled = Boolean(stallPattern);
  const recentProductiveCommands = log.commands.filter(
    (cmd) =>
      cmd.timestamp >= log.lastMeaningfulChangeAt &&
      cmd.success &&
      commandIsProductiveWorkflow(cmd),
  ).length;
  const concern = isStalled
    ? recentProductiveCommands > 0
      ? "stall_with_progress_evidence"
      : "possible_stall"
    : "no_concern";

  const contextPressure = queryContextPressure(log);
  const baseSummary = isStalled
    ? recentProductiveCommands > 0
      ? `Mirror-only advisory: possible stall with progress evidence. No tracked file change for ${log.turnsSinceMeaningfulChange} turns, but recent successful workflow command(s) suggest investigation, validation, or closeout may still be productive.`
      : `Mirror-only advisory: possible stall. No tracked meaningful file change for ${log.turnsSinceMeaningfulChange} turns.`
    : hasProgress
      ? `✅ Progress: ${filesTouched} files touched, ${log.fileOps.length} operations.`
      : `📊 No file progress yet: ${log.turnCount} turns, ${log.commands.length} commands.`;
  const summary = contextPressure.shouldConsiderHandoff
    ? `${baseSummary} ${contextPressure.summary}`
    : baseSummary;

  return {
    hasProgress,
    filesTouched,
    operations: log.fileOps.length,
    turnsSinceChange: log.turnsSinceMeaningfulChange,
    isStalled,
    concern,
    progressEvidence: { recentSuccessfulProductiveCommands: recentProductiveCommands },
    contextPressure,
    summary,
  };
}

export interface HandoffSummaryResult {
  files: FilesTouchedResult["files"];
  commands: Array<{
    command: string;
    rawCommand: string;
    success: boolean;
    activeFailure?: boolean;
  }>;
  errors: ErrorsResult["errors"];
  progress: ProgressResult;
  loops: LoopStatusResult;
  contextPressure: ContextPressureResult;
  cues: string[];
  sliceCandidates: SliceCandidate[];
  nextMove?: SliceCandidate;
  authority: "mirror_only";
}

export function queryHandoffSummary(
  log: OperationLog,
  detector: PatternDetector,
): HandoffSummaryResult {
  const files = queryFilesTouched(log).files;
  const latestRecoveryEvidenceIndex = latestRecoveryEvidenceCommandIndex(log);
  const recentCommandEntries = log.commands.map((cmd, index) => ({ cmd, index })).slice(-5);
  const commands = recentCommandEntries.map(({ cmd, index }) => ({
    command: cmd.command,
    rawCommand: cmd.rawCommand,
    success: cmd.success,
    activeFailure: !cmd.success && index > latestRecoveryEvidenceIndex,
  }));
  const unrecoveredFailedCommands = commands.filter((cmd) => cmd.activeFailure).length;
  const recoveredFailedCommands = commands.filter(
    (cmd) => !cmd.success && !cmd.activeFailure,
  ).length;
  const allErrors = queryErrors(log).errors;
  const errors = allErrors.filter((error) => error.activeCount > 0).slice(0, 5);
  const progress = queryProgress(log, detector);
  const loops = queryLoopStatus(detector);

  const cues: string[] = [];
  if (files.length > 0) {
    cues.push(`handoff should mention ${files.length} touched file(s)`);
  }
  if (commands.length > 0) {
    if (unrecoveredFailedCommands > 0) {
      cues.push(
        `include ${unrecoveredFailedCommands} unrecovered recent failed command(s) and validation caveats`,
      );
    } else if (recoveredFailedCommands > 0) {
      cues.push("earlier failed command(s) are followed by successful validation/check evidence");
    } else {
      cues.push("include recent validation/check commands");
    }
  }
  if (errors.length > 0) {
    cues.push(`include ${errors.length} unrecovered error pattern(s) still visible to self`);
  } else if (allErrors.length > 0) {
    cues.push("earlier error pattern(s) are followed by successful validation/check evidence");
  }
  if (loops.isLooping) {
    cues.push("mirror-only repetition cue visible; caller should decide whether it is intentional");
  }
  if (progress.isStalled) {
    cues.push(
      progress.concern === "stall_with_progress_evidence"
        ? "possible stall coexists with recent productive command evidence"
        : "possible stall: no recent tracked meaningful file change",
    );
  }
  if (progress.contextPressure.shouldConsiderHandoff) {
    cues.push(
      "Context-pressure heuristic suggests preparing a handoff (mirror-only; not token telemetry)",
    );
  }
  if (cues.length === 0) {
    cues.push("no tracked file, command, error, loop, or progress evidence yet");
  }

  const sliceCandidates = rankSliceCandidates({ files, commands, errors, loops, progress });

  return {
    files,
    commands,
    errors,
    progress,
    loops,
    contextPressure: progress.contextPressure,
    cues,
    sliceCandidates,
    nextMove: sliceCandidates[0],
    authority: "mirror_only",
  };
}
