import { existsSync } from "node:fs";
import { isSuccessfulMetricRun } from "./runtime-metrics.ts";
import type {
  AutoresearchConfigReceipt,
  CommandExecutionSummary,
  ExecuteAutoresearchRunInput,
  RunStatus,
} from "./runtime-model.ts";
import { type AutoresearchPaths, createConfigReceipt } from "./runtime-receipts.ts";
import type { CurrentSegmentView } from "./runtime-status-segment.ts";

export function createConfigFromInput(
  input: ExecuteAutoresearchRunInput,
  paths: AutoresearchPaths,
): AutoresearchConfigReceipt {
  const name = input.name?.trim();
  const metricName = input.metricName?.trim();
  if (!name) {
    throw new Error("name is required when bootstrapping or reconfiguring the bounded runtime");
  }
  if (!metricName) {
    throw new Error(
      "metricName is required when bootstrapping or reconfiguring the bounded runtime",
    );
  }

  const benchmarkCommand = input.benchmarkCommand ?? defaultBenchmarkCommand(paths);
  if (!benchmarkCommand) {
    throw new Error(
      "benchmarkCommand is required when no config receipt exists and autoresearch.sh is missing",
    );
  }

  const checksCommand = resolveChecksCommand(input.checksCommand, undefined, paths);
  return createConfigReceipt({
    name,
    objectiveDigest: input.objectiveDigest,
    metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction ?? "lower",
    metricThreshold: input.metricThreshold,
    benchmarkCommand,
    checksCommand,
  });
}

export function resolveChecksCommand(
  requestedChecksCommand: string | null | undefined,
  configuredChecksCommand: string | null | undefined,
  paths: AutoresearchPaths,
): string | null {
  if (requestedChecksCommand === null) return null;
  return requestedChecksCommand ?? configuredChecksCommand ?? defaultChecksCommand(paths);
}

export function defaultBenchmarkCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.benchmarkScriptPath) ? "bash autoresearch.sh" : null;
}

function defaultChecksCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.checksScriptPath) ? "bash autoresearch.checks.sh" : null;
}

export function determineRunStatus(input: {
  currentSegment: CurrentSegmentView;
  benchmarkSucceeded: boolean;
  metricContractFailed: boolean;
  checksPassed: boolean | null;
}): RunStatus {
  if (!input.benchmarkSucceeded || input.metricContractFailed) {
    return "crash";
  }
  if (input.checksPassed === false) {
    return "checks_failed";
  }
  const hasSuccessfulRun = input.currentSegment.runs.some(isSuccessfulMetricRun);
  return hasSuccessfulRun ? "candidate" : "baseline";
}

export function decorateRunDescription(
  description: string,
  benchmarkSucceeded: boolean,
  metricContractFailed: boolean,
  checksPassed: boolean | null,
): string {
  if (!benchmarkSucceeded) {
    return `${description} (benchmark failed or timed out)`;
  }
  if (metricContractFailed) {
    return `${description} (primary metric missing)`;
  }
  if (checksPassed === false) {
    return `${description} (checks failed)`;
  }
  return description;
}

export function describeBenchmarkFailure(
  benchmark: CommandExecutionSummary,
  metricContractFailed: boolean,
): string {
  if (metricContractFailed) {
    return "primary metric missing from benchmark output";
  }
  if (benchmark.timedOut) {
    return "benchmark timed out";
  }
  if (benchmark.exitCode === null) {
    return "benchmark ended with a signal or process error";
  }
  return `benchmark exited with code ${benchmark.exitCode}`;
}
