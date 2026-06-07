import type { AutoresearchRuntimeStatus, RunStatus } from "../core/runtime.ts";
import type { CampaignDecision, CampaignSegmentConfig } from "./events.ts";

export const CAMPAIGN_MACHINE_STATES = [
  "idle",
  "segment_unconfigured",
  "ready",
  "running_benchmark",
  "running_checks",
  "recording_receipt",
  "awaiting_decision",
  "rebaseline_needed",
  "finalize_candidate",
  "blocked",
  "completed",
] as const;

export type CampaignMachineStateValue = (typeof CAMPAIGN_MACHINE_STATES)[number];
export type CampaignMachineResumeState = Exclude<
  CampaignMachineStateValue,
  "idle" | "blocked" | "completed"
>;

export interface CampaignMachineInput {
  segment?: CampaignSegmentConfig | null;
  runCount?: number;
  successfulRunCount?: number;
  baselineMetric?: number | null;
  bestMetric?: number | null;
  lastRunStatus?: RunStatus | null;
  lastRunMetric?: number | null;
  awaitingDecision?: boolean;
  blockedReason?: string | null;
  completionReason?: string | null;
  resumeState?: CampaignMachineResumeState | null;
}

export interface CampaignActiveRun {
  description: string;
  benchmarkCommand: string;
  checksCommand: string | null;
  metric: number | null;
  requiresChecks: boolean;
  checksPassed: boolean | null;
  failureReason: string | null;
}

export interface CampaignMachineContext {
  segment: CampaignSegmentConfig | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  lastRunStatus: RunStatus | null;
  lastRunMetric: number | null;
  awaitingDecision: boolean;
  blockedReason: string | null;
  completionReason: string | null;
  lastDecision: CampaignDecision | null;
  activeRun: CampaignActiveRun | null;
  resumeState: CampaignMachineResumeState | null;
}

export function isCampaignMachineAwaitingOperatorChoice(state: CampaignMachineStateValue): boolean {
  return (
    state === "awaiting_decision" ||
    state === "rebaseline_needed" ||
    state === "finalize_candidate" ||
    state === "blocked"
  );
}

export function canCampaignMachineStartBoundedRun(state: CampaignMachineStateValue): boolean {
  return state === "ready";
}

export function isCampaignMachineTerminalState(state: CampaignMachineStateValue): boolean {
  return state === "completed";
}

export function createCampaignMachineInputFromRuntimeStatus(
  status: AutoresearchRuntimeStatus,
  overrides: Partial<
    Pick<CampaignMachineInput, "awaitingDecision" | "blockedReason" | "completionReason">
  > = {},
): CampaignMachineInput {
  const segment = status.currentSegment.configured
    ? {
        name: status.currentSegment.name ?? "(unnamed)",
        metricName: status.currentSegment.metricName ?? "(unset)",
        metricUnit: status.currentSegment.metricUnit,
        direction: status.currentSegment.direction ?? "lower",
        metricThreshold: status.currentSegment.metricThreshold,
        benchmarkCommand: status.currentSegment.benchmarkCommand ?? "",
        checksCommand: status.currentSegment.checksCommand,
      }
    : null;
  const projectionState = status.runtimeProjection.state;

  return {
    segment,
    runCount: status.currentSegment.runCount,
    successfulRunCount: status.currentSegment.successfulRunCount,
    baselineMetric: status.currentSegment.baselineMetric,
    bestMetric: status.currentSegment.bestMetric,
    lastRunStatus: status.currentSegment.lastRunStatus,
    lastRunMetric: status.currentSegment.lastRunMetric,
    awaitingDecision: overrides.awaitingDecision ?? projectionState === "awaiting_decision",
    blockedReason:
      overrides.blockedReason ??
      (projectionState === "blocked"
        ? (status.promptVaultDecisions.lastPostRunDecision?.blockingReason ??
          "campaign blocked pending operator action")
        : null),
    completionReason:
      overrides.completionReason ?? (projectionState === "completed" ? "campaign completed" : null),
    resumeState:
      projectionState === "rebaseline_needed" || projectionState === "finalize_candidate"
        ? projectionState
        : null,
  };
}
