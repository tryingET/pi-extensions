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
  const now = Date.now();

  // Find or create error entry
  const entry = log.errors.find((e) => e.toolName === toolName && e.signature === signature);
  if (entry) {
    entry.count++;
    entry.lastSeen = now;
    entry.rawMessage = rawMessage.slice(0, 200);
  } else {
    log.errors.push({
      toolName,
      signature,
      rawMessage: rawMessage.slice(0, 200),
      timestamp: now,
      lastSeen: now,
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

function isValidationOrQualityCommand(lowerCommand: string): boolean {
  return (
    /\b(?:npm|pnpm|yarn)(?:\s+(?:--prefix|-c|--cwd)\s+\S+|\s+--\S+(?:=\S+)?)*\s+(?:run\s+)?(?:test|check|lint|typecheck|quality(?::\w+)?|ci|release:check(?::quick)?)\b/.test(
      lowerCommand,
    ) ||
    /\b(?:node\s+--test|vitest|jest|tsc|biome\s+(?:check|ci|lint)|just\s+(?:test|check|lint|ci))\b/.test(
      lowerCommand,
    )
  );
}

function isProductiveWorkflowCommand(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return (
    /\bprovenance[-_]?note\b|\bpi[-_]?provenance\b/.test(lower) ||
    /^git\s+(?:commit|status|log|diff|show|rev-parse)\b/.test(lower) ||
    /^ak\s+task\s+(?:complete|close|done|finish|update\b.*\b(?:done|completed))\b/.test(lower) ||
    isValidationOrQualityCommand(lower)
  );
}

function isRecoveryEvidenceCommand(command: string): boolean {
  return isValidationOrQualityCommand(command.trim().toLowerCase());
}

function latestSuccessfulRecoveryEvidenceCommandAt(log: OperationLog): number {
  return log.commands.reduce(
    (latest, cmd) =>
      cmd.success && isRecoveryEvidenceCommand(cmd.rawCommand)
        ? Math.max(latest, cmd.timestamp)
        : latest,
    0,
  );
}

function latestRecoveryEvidenceCommandIndex(log: OperationLog): number {
  let latestRecoveryEvidenceIndex = -1;
  log.commands.forEach((cmd, index) => {
    if (cmd.success && isRecoveryEvidenceCommand(cmd.rawCommand)) {
      latestRecoveryEvidenceIndex = index;
    }
  });
  return latestRecoveryEvidenceIndex;
}

function hasRecoveryEvidenceAfterLatestFailedCommand(log: OperationLog): boolean {
  let latestFailedIndex = -1;
  log.commands.forEach((cmd, index) => {
    if (!cmd.success) latestFailedIndex = index;
  });
  return latestFailedIndex >= 0 && latestRecoveryEvidenceCommandIndex(log) > latestFailedIndex;
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

  // Detect command loops: same normalized command 3+ times.
  // Repeated successful workflow commands are common validation/closeout, not stuckness.
  const latestRecoveryEvidenceAt = latestSuccessfulRecoveryEvidenceCommandAt(log);
  const recoveredLatestFailure = hasRecoveryEvidenceAfterLatestFailedCommand(log);
  const commandCounts = new Map<
    string,
    { count: number; successes: number; productive: boolean; latestFailureAt: number }
  >();
  for (const cmd of log.commands) {
    const existing = commandCounts.get(cmd.command);
    if (existing) {
      existing.count++;
      if (cmd.success) existing.successes++;
      if (!cmd.success)
        existing.latestFailureAt = Math.max(existing.latestFailureAt, cmd.timestamp);
      existing.productive = existing.productive || isProductiveWorkflowCommand(cmd.rawCommand);
    } else {
      commandCounts.set(cmd.command, {
        count: 1,
        successes: cmd.success ? 1 : 0,
        productive: isProductiveWorkflowCommand(cmd.rawCommand),
        latestFailureAt: cmd.success ? 0 : cmd.timestamp,
      });
    }
  }
  for (const [command, data] of commandCounts) {
    if (data.count >= LOOP_THRESHOLD) {
      if (data.successes === data.count && data.productive) continue;
      if (
        data.latestFailureAt > 0 &&
        recoveredLatestFailure &&
        latestRecoveryEvidenceAt >= data.latestFailureAt
      ) {
        continue;
      }
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

  // Detect error loops: same error signature 3+ times. A later successful validation/check
  // command is recovery evidence, so stale failures should not dominate continuation routing.
  for (const error of log.errors) {
    if (error.count >= LOOP_THRESHOLD) {
      const errorLastSeen = error.lastSeen ?? error.timestamp;
      if (
        latestRecoveryEvidenceAt > errorLastSeen ||
        (recoveredLatestFailure && latestRecoveryEvidenceAt >= errorLastSeen)
      ) {
        continue;
      }
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
    successRate: totalRuns > 0 ? totalSuccesses / totalRuns : 1,
  };
}

export interface ErrorsResult {
  errors: Array<{
    tool: string;
    signature: string;
    count: number;
    lastMessage: string;
    lastSeen: number;
  }>;
  total: number;
}

export function queryErrors(log: OperationLog): ErrorsResult {
  return {
    errors: log.errors.map((e) => ({
      tool: e.toolName,
      signature: e.signature,
      count: e.count,
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
      isProductiveWorkflowCommand(cmd.rawCommand),
  ).length;
  const concern = isStalled
    ? recentProductiveCommands > 0
      ? "stall_with_progress_evidence"
      : "possible_stall"
    : "no_concern";

  const summary = isStalled
    ? recentProductiveCommands > 0
      ? `Mirror-only advisory: possible stall with progress evidence. No tracked file change for ${log.turnsSinceMeaningfulChange} turns, but recent successful workflow command(s) suggest investigation, validation, or closeout may still be productive.`
      : `Mirror-only advisory: possible stall. No tracked meaningful file change for ${log.turnsSinceMeaningfulChange} turns.`
    : hasProgress
      ? `✅ Progress: ${filesTouched} files touched, ${log.fileOps.length} operations.`
      : `📊 No file progress yet: ${log.turnCount} turns, ${log.commands.length} commands.`;

  return {
    hasProgress,
    filesTouched,
    operations: log.fileOps.length,
    turnsSinceChange: log.turnsSinceMeaningfulChange,
    isStalled,
    concern,
    progressEvidence: { recentSuccessfulProductiveCommands: recentProductiveCommands },
    summary,
  };
}

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

export interface HandoffSummaryResult {
  files: FilesTouchedResult["files"];
  commands: Array<{ command: string; rawCommand: string; success: boolean }>;
  errors: ErrorsResult["errors"];
  progress: ProgressResult;
  loops: LoopStatusResult;
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
  const commands = recentCommandEntries.map(({ cmd }) => ({
    command: cmd.command,
    rawCommand: cmd.rawCommand,
    success: cmd.success,
  }));
  const unrecoveredFailedCommands = recentCommandEntries.filter(
    ({ cmd, index }) => !cmd.success && index > latestRecoveryEvidenceIndex,
  ).length;
  const recoveredFailedCommands = recentCommandEntries.filter(
    ({ cmd, index }) => !cmd.success && index <= latestRecoveryEvidenceIndex,
  ).length;
  const allErrors = queryErrors(log).errors;
  const latestRecoveryEvidenceAt = latestSuccessfulRecoveryEvidenceCommandAt(log);
  const recoveredLatestFailure = hasRecoveryEvidenceAfterLatestFailedCommand(log);
  const errors = allErrors
    .filter(
      (error) =>
        latestRecoveryEvidenceAt === 0 ||
        (recoveredLatestFailure
          ? error.lastSeen > latestRecoveryEvidenceAt
          : error.lastSeen >= latestRecoveryEvidenceAt),
    )
    .slice(0, 5);
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
    cues,
    sliceCandidates,
    nextMove: sliceCandidates[0],
    authority: "mirror_only",
  };
}

export function rankSliceCandidates(input: {
  files: FilesTouchedResult["files"];
  commands: Array<{ command: string; rawCommand: string; success: boolean }>;
  errors: ErrorsResult["errors"];
  loops: LoopStatusResult;
  progress: ProgressResult;
}): SliceCandidate[] {
  const candidates: SliceCandidate[] = [];
  const failedCommands = input.commands.filter((cmd) => !cmd.success).length;

  if (input.errors.length > 0 || input.loops.isLooping) {
    candidates.push({
      slice: "temporal + failure-recovery + source-owner + authority-risk",
      owner: "peer-tools",
      score: 95,
      confidence: "high",
      reason:
        "Loop/error cues need a read-only recovery review before more mutation or authority claims.",
      evidence: [
        ...(input.loops.isLooping ? [`${input.loops.patterns.length} loop pattern(s)`] : []),
        ...(input.errors.length > 0 ? [`${input.errors.length} error pattern(s)`] : []),
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
      score: input.errors.length > 0 || input.loops.isLooping ? 70 : 90,
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
