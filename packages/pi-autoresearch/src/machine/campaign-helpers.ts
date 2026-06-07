import type { MetricDirection, RunStatus } from "../core/runtime.ts";
import type { CampaignMachineContext, CampaignMachineInput } from "./campaign-model.ts";
import type { CampaignSegmentConfig } from "./events.ts";

export function createInitialContext(
  input: CampaignMachineInput | undefined,
): CampaignMachineContext {
  return {
    segment: input?.segment ? normalizeSegment(input.segment) : null,
    runCount: input?.runCount ?? 0,
    successfulRunCount: input?.successfulRunCount ?? 0,
    baselineMetric: normalizeMetric(input?.baselineMetric),
    bestMetric: normalizeMetric(input?.bestMetric),
    lastRunStatus: input?.lastRunStatus ?? null,
    lastRunMetric: normalizeMetric(input?.lastRunMetric),
    awaitingDecision: input?.awaitingDecision ?? false,
    blockedReason: input?.blockedReason ?? null,
    completionReason: input?.completionReason ?? null,
    lastDecision: null,
    activeRun: null,
    resumeState: input?.resumeState ?? null,
  };
}

export function normalizeSegment(segment: CampaignSegmentConfig): CampaignSegmentConfig {
  const metricThreshold = normalizeMetric(segment.metricThreshold);
  return {
    name: segment.name,
    metricName: segment.metricName,
    metricUnit: segment.metricUnit,
    direction: segment.direction,
    ...(metricThreshold === null ? {} : { metricThreshold }),
    benchmarkCommand: segment.benchmarkCommand,
    checksCommand: segment.checksCommand,
  };
}

export function normalizeMetric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSuccessfulRecordedRun(status: RunStatus): boolean {
  return status !== "crash" && status !== "checks_failed";
}

export function pickBestMetric(
  candidateMetric: number,
  currentBestMetric: number | null,
  direction: MetricDirection,
): number {
  if (currentBestMetric === null) {
    return candidateMetric;
  }

  if (direction === "lower") {
    return candidateMetric < currentBestMetric ? candidateMetric : currentBestMetric;
  }

  return candidateMetric > currentBestMetric ? candidateMetric : currentBestMetric;
}
