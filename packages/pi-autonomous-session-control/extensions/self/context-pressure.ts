// ---
// summary: evaluates mirror-only session pressure from turn counts and repeated lifecycle commands.
// read_when:
//   - changing handoff-pressure thresholds or the signals reported by self context diagnostics.
// ---

import type { OperationLog } from "./types.ts";

const CONTEXT_PRESSURE_TURN_NOTICE_THRESHOLD = 20;
const CONTEXT_PRESSURE_TURN_HANDOFF_THRESHOLD = 35;
const CONTEXT_PRESSURE_REPEATED_LIFECYCLE_THRESHOLD = 2;
const CONTEXT_PRESSURE_LIFECYCLE_HANDOFF_THRESHOLD = 4;

export interface ContextPressureResult {
  level: "none" | "notice" | "handoff_advised";
  shouldConsiderHandoff: boolean;
  signals: string[];
  summary: string;
  authority: "mirror_only";
}

export function queryContextPressure(log: OperationLog): ContextPressureResult {
  const piInstallCount = countCommands(log, /^pi\s+install\b/);
  const reloadCount = countCommands(log, /^(?:\/reload\b|pi\s+reload\b)/);
  const gitCommitCount = countCommands(log, /^git\s+commit\b/);
  const akTaskCompleteCount = countCommands(log, /^ak\s+task\s+(?:complete|close|done|finish)\b/);
  const lifecycleCommandCount = piInstallCount + reloadCount + gitCommitCount;
  const noticeSignals: string[] = [];
  const handoffSignals: string[] = [];

  if (log.turnCount >= CONTEXT_PRESSURE_TURN_HANDOFF_THRESHOLD) {
    handoffSignals.push(`${log.turnCount} turn(s) elapsed in this session`);
  } else if (log.turnCount >= CONTEXT_PRESSURE_TURN_NOTICE_THRESHOLD) {
    noticeSignals.push(`${log.turnCount} turn(s) elapsed in this session`);
  }

  if (piInstallCount >= CONTEXT_PRESSURE_REPEATED_LIFECYCLE_THRESHOLD) {
    noticeSignals.push(`${piInstallCount} pi install command(s) visible`);
  }
  if (reloadCount >= CONTEXT_PRESSURE_REPEATED_LIFECYCLE_THRESHOLD) {
    noticeSignals.push(`${reloadCount} reload command(s) visible`);
  }
  if (gitCommitCount >= CONTEXT_PRESSURE_REPEATED_LIFECYCLE_THRESHOLD) {
    noticeSignals.push(`${gitCommitCount} git commit command(s) visible`);
  }
  if (akTaskCompleteCount >= CONTEXT_PRESSURE_REPEATED_LIFECYCLE_THRESHOLD) {
    handoffSignals.push(`${akTaskCompleteCount} AK task completion command(s) visible`);
  }
  if (lifecycleCommandCount >= CONTEXT_PRESSURE_LIFECYCLE_HANDOFF_THRESHOLD) {
    handoffSignals.push(
      `${lifecycleCommandCount} install/reload/commit lifecycle command(s) visible`,
    );
  }

  const signals = [...handoffSignals, ...noticeSignals];
  const level =
    handoffSignals.length > 0 ? "handoff_advised" : signals.length > 0 ? "notice" : "none";
  const summary =
    signals.length > 0
      ? `Context-pressure heuristic (mirror-only, not token telemetry): ${signals.join("; ")}. Consider preparing a handoff before continuing.`
      : "Context-pressure heuristic (mirror-only, not token telemetry): no handoff-pressure signal from tracked turns or lifecycle commands.";

  return {
    level,
    shouldConsiderHandoff: signals.length > 0,
    signals,
    summary,
    authority: "mirror_only",
  };
}

function countCommands(log: OperationLog, pattern: RegExp): number {
  return log.commands.filter((cmd) => pattern.test(cmd.rawCommand.trim().toLowerCase())).length;
}
