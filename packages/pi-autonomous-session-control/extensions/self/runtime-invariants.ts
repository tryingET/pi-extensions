/**
 * Runtime invariant checks for self + subagent state.
 *
 * These checks are report-only by default and are intended to catch
 * silent state corruption or lifecycle drift early.
 */

import { existsSync } from "node:fs";

export interface RuntimeInvariantIssue {
  id: string;
  severity: "warning" | "error";
  message: string;
}

export interface RuntimeInvariantReport {
  ok: boolean;
  checked: number;
  issues: RuntimeInvariantIssue[];
}

export interface RuntimeInvariantInput {
  operations?: {
    turnCount?: number;
    turnsSinceMeaningfulChange?: number;
  };
  subagent?: {
    sessionsDir?: string;
    activeCount?: number;
    completedCount?: number;
    maxConcurrent?: number;
    reservedSessionNames?: Set<string>;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateRuntimeInvariants(input: RuntimeInvariantInput): RuntimeInvariantReport {
  const issues: RuntimeInvariantIssue[] = [];
  let checked = 0;

  const turnCount = input.operations?.turnCount;
  const turnsSinceMeaningfulChange = input.operations?.turnsSinceMeaningfulChange;

  checked++;
  if (!isFiniteNumber(turnCount) || turnCount < 0) {
    issues.push({
      id: "ops.turnCount.invalid",
      severity: "error",
      message: "turnCount must be a non-negative finite number.",
    });
  }

  checked++;
  if (!isFiniteNumber(turnsSinceMeaningfulChange) || turnsSinceMeaningfulChange < 0) {
    issues.push({
      id: "ops.turnsSinceMeaningfulChange.invalid",
      severity: "error",
      message: "turnsSinceMeaningfulChange must be a non-negative finite number.",
    });
  }

  checked++;
  if (
    isFiniteNumber(turnCount) &&
    isFiniteNumber(turnsSinceMeaningfulChange) &&
    turnsSinceMeaningfulChange > turnCount
  ) {
    issues.push({
      id: "ops.turnsSinceMeaningfulChange.gt.turnCount",
      severity: "error",
      message: "turnsSinceMeaningfulChange cannot exceed turnCount.",
    });
  }

  const activeCount = input.subagent?.activeCount;
  const completedCount = input.subagent?.completedCount;
  const maxConcurrent = input.subagent?.maxConcurrent;

  checked++;
  if (!isFiniteNumber(activeCount) || activeCount < 0) {
    issues.push({
      id: "subagent.activeCount.invalid",
      severity: "error",
      message: "activeCount must be a non-negative finite number.",
    });
  }

  checked++;
  if (!isFiniteNumber(completedCount) || completedCount < 0) {
    issues.push({
      id: "subagent.completedCount.invalid",
      severity: "error",
      message: "completedCount must be a non-negative finite number.",
    });
  }

  checked++;
  if (!isFiniteNumber(maxConcurrent) || maxConcurrent <= 0) {
    issues.push({
      id: "subagent.maxConcurrent.invalid",
      severity: "error",
      message: "maxConcurrent must be a positive finite number.",
    });
  }

  checked++;
  if (
    isFiniteNumber(activeCount) &&
    isFiniteNumber(maxConcurrent) &&
    maxConcurrent > 0 &&
    activeCount > maxConcurrent
  ) {
    issues.push({
      id: "subagent.activeCount.gt.maxConcurrent",
      severity: "warning",
      message: "activeCount exceeds maxConcurrent.",
    });
  }

  checked++;
  const sessionsDir = input.subagent?.sessionsDir;
  if (
    typeof sessionsDir === "string" &&
    sessionsDir.trim().length > 0 &&
    !existsSync(sessionsDir)
  ) {
    issues.push({
      id: "subagent.sessionsDir.missing",
      severity: "warning",
      message: `sessionsDir does not exist on disk: ${sessionsDir}`,
    });
  }

  checked++;
  const reservedSize = input.subagent?.reservedSessionNames?.size;
  if (isFiniteNumber(reservedSize) && reservedSize < 0) {
    issues.push({
      id: "subagent.reservedSessionNames.invalid",
      severity: "error",
      message: "reservedSessionNames size cannot be negative.",
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    checked,
    issues,
  };
}

export function formatRuntimeInvariantReport(report: RuntimeInvariantReport): string {
  const lines = [
    "# Runtime Invariant Check",
    "",
    `- status: ${report.ok ? "OK" : "NOT_OK"}`,
    `- checks: ${report.checked}`,
    `- issues: ${report.issues.length}`,
    "",
    "## Issues",
  ];

  if (report.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.id}: ${issue.message}`);
    }
  }

  return lines.join("\n");
}
