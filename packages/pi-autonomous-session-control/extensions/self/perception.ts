/**
 * Perception Layer: Operation tracking and pattern detection.
 * The LLM queries this to perceive its own behavior.
 */

import type { DetectedPattern, FileOperation, OperationLog, PatternDetector } from "./types.ts";

// ============================================================================
// CONSTANTS
// ============================================================================

const LOOP_THRESHOLD = 3;
const STALL_TURN_THRESHOLD = 5;
const COMMAND_NORMALIZE_MAX_LEN = 100;

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
  log.commands.push({
    command: normalized,
    rawCommand: rawCommand.slice(0, COMMAND_NORMALIZE_MAX_LEN),
    timestamp: Date.now(),
    success,
  });
  trimLog(log);
}

export function trackError(log: OperationLog, toolName: string, rawMessage: string): void {
  const signature = extractErrorSignature(rawMessage);

  // Find or create error entry
  const entry = log.errors.find((e) => e.toolName === toolName && e.signature === signature);
  if (entry) {
    entry.count++;
    entry.lastSeen = Date.now();
    entry.rawMessage = rawMessage.slice(0, 200);
  } else {
    log.errors.push({
      toolName,
      signature,
      rawMessage: rawMessage.slice(0, 200),
      timestamp: Date.now(),
      count: 1,
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
// COMMAND NORMALIZATION
// ============================================================================

function normalizeCommand(command: string): string {
  return (
    command
      // Remove specific numbers (but keep structure)
      .replace(/\b\d{2,}\b/g, "N")
      // Remove timestamps
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "TS")
      // Remove file paths (keep basename)
      .replace(/\/[^\s]+\//g, "PATH/")
      // Remove UUIDs
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, COMMAND_NORMALIZE_MAX_LEN)
  );
}

function extractErrorSignature(message: string): string {
  return message
    .slice(0, 80)
    .replace(/\b\d+\b/g, "N")
    .replace(/"[^"]*"/g, '"..."')
    .replace(/'[^']*'/g, "'...'")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

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

  // Detect command loops: same normalized command 3+ times
  const commandCounts = new Map<string, { count: number; success: boolean }>();
  for (const cmd of log.commands) {
    const existing = commandCounts.get(cmd.command);
    if (existing) {
      existing.count++;
      existing.success = existing.success && cmd.success;
    } else {
      commandCounts.set(cmd.command, { count: 1, success: cmd.success });
    }
  }
  for (const [command, data] of commandCounts) {
    if (data.count >= LOOP_THRESHOLD) {
      patterns.push({
        type: "command_loop",
        key: command,
        count: data.count,
        firstSeen: now,
        lastSeen: now,
        severity: !data.success ? "critical" : "warning",
      });
    }
  }

  // Detect error loops: same error signature 3+ times
  for (const error of log.errors) {
    if (error.count >= LOOP_THRESHOLD) {
      patterns.push({
        type: "error_loop",
        key: `${error.toolName}:${error.signature}`,
        count: error.count,
        firstSeen: error.timestamp,
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

// ============================================================================
// PERCEPTION QUERIES
// ============================================================================

export interface FilesTouchedResult {
  files: Array<{ path: string; ops: number; lastOp: string }>;
  total: number;
}

export function queryFilesTouched(log: OperationLog): FilesTouchedResult {
  const fileMap = new Map<string, { ops: number; lastOp: string }>();

  for (const op of log.fileOps) {
    const existing = fileMap.get(op.path);
    if (existing) {
      existing.ops++;
      existing.lastOp = op.type;
    } else {
      fileMap.set(op.path, { ops: 1, lastOp: op.type });
    }
  }

  return {
    files: Array.from(fileMap.entries()).map(([path, data]) => ({
      path,
      ops: data.ops,
      lastOp: data.lastOp,
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
    successRate: totalRuns > 0 ? totalSuccesses / totalRuns : 1,
  };
}

export interface ErrorsResult {
  errors: Array<{ tool: string; signature: string; count: number; lastMessage: string }>;
  total: number;
}

export function queryErrors(log: OperationLog): ErrorsResult {
  return {
    errors: log.errors.map((e) => ({
      tool: e.toolName,
      signature: e.signature,
      count: e.count,
      lastMessage: e.rawMessage,
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
    ? `Detected ${loops.length} loop pattern(s): ${loops.map((l) => `${l.type}(${l.key}): ${l.count}x`).join(", ")}`
    : "No loop patterns detected.";

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
  summary: string;
}

export function queryProgress(log: OperationLog, detector: PatternDetector): ProgressResult {
  const filesTouched = new Set(log.fileOps.map((op) => op.path)).size;
  const hasProgress = log.fileOps.length > 0;
  const stallPattern = detector.detected.find((p) => p.type === "stall");
  const isStalled = Boolean(stallPattern);

  const summary = isStalled
    ? `⚠️ Stalled: No meaningful changes for ${log.turnsSinceMeaningfulChange} turns.`
    : hasProgress
      ? `✅ Progress: ${filesTouched} files touched, ${log.fileOps.length} operations.`
      : `📊 No progress yet: ${log.turnCount} turns, ${log.commands.length} commands.`;

  return {
    hasProgress,
    filesTouched,
    operations: log.fileOps.length,
    turnsSinceChange: log.turnsSinceMeaningfulChange,
    isStalled,
    summary,
  };
}
