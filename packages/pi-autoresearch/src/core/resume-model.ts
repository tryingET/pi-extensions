import path from "node:path";

import type { CampaignMachineResumeState, CampaignMachineStateValue } from "../machine/campaign.ts";
import type {
  AutoresearchPromptVaultDecisionAvailability,
  AutoresearchRunDecisionSummary,
  MetricDirection,
  RunStatus,
} from "./runtime.ts";

export const AUTORESEARCH_RUNTIME_SNAPSHOT_FILE = "autoresearch.runtime.json" as const;
export const AUTORESEARCH_OPERATOR_ACTIONS = [
  "continue",
  "rebaseline",
  "finalize",
  "stop",
] as const;

export type AutoresearchOperatorAction = (typeof AUTORESEARCH_OPERATOR_ACTIONS)[number];
export type AutoresearchControlStateKind =
  | "none"
  | "awaiting_operator"
  | AutoresearchOperatorAction;
export type AutoresearchRuntimeSnapshotReuse =
  | "unavailable"
  | "missing"
  | "reused"
  | "cwd_mismatch"
  | "segment_mismatch"
  | "runtime_mismatch"
  | "illegal_control"
  | "state_ahead"
  | "parse_failed";
export type AutoresearchProjectionSource = "ledger" | "receipt_fallback";

export interface AutoresearchControlStateV1 {
  kind: AutoresearchControlStateKind;
  allowedActions: AutoresearchOperatorAction[];
  reason: string | null;
  selectedAt: number | null;
}

export interface AutoresearchRuntimeSnapshotInput {
  cwd: string;
  phase: "bounded_runtime_kernel";
  projectionSource: AutoresearchProjectionSource;
  machine: {
    state: CampaignMachineStateValue;
    resumeState: CampaignMachineResumeState | null;
    blockedReason: string | null;
    completionReason: string | null;
  };
  segment: {
    name: string | null;
    objectiveDigest: string | null;
    metricName: string | null;
    metricUnit: string;
    direction: MetricDirection | null;
    metricThreshold: number | null;
    benchmarkCommand: string | null;
    checksCommand: string | null;
    runCount: number;
    successfulRunCount: number;
    baselineMetric: number | null;
    bestMetric: number | null;
    lastRunStatus: RunStatus | null;
    lastRunMetric: number | null;
  };
  decision: {
    availability: AutoresearchPromptVaultDecisionAvailability;
    lastPostRunDecision: AutoresearchRunDecisionSummary | null;
  };
}

export interface AutoresearchRuntimeSnapshotV1 {
  type: "runtime_snapshot";
  version: 1;
  phase: "bounded_runtime_kernel";
  cwd: string;
  updatedAt: number;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: AutoresearchProjectionSource;
  machine: {
    state: CampaignMachineStateValue;
    resumeState: CampaignMachineResumeState | null;
    blockedReason: string | null;
    completionReason: string | null;
  };
  segment: {
    name: string | null;
    objectiveDigest: string | null;
    metricName: string | null;
    metricUnit: string;
    direction: MetricDirection | null;
    metricThreshold: number | null;
    benchmarkCommand: string | null;
    checksCommand: string | null;
    runCount: number;
    successfulRunCount: number;
    baselineMetric: number | null;
    bestMetric: number | null;
    lastRunStatus: RunStatus | null;
    lastRunMetric: number | null;
  };
  decision: {
    availability: AutoresearchPromptVaultDecisionAvailability;
    lastPostRunDecision: AutoresearchRunDecisionSummary | null;
  };
  control: AutoresearchControlStateV1;
}

export interface AutoresearchRuntimeSnapshotStatus {
  path?: string;
  exists: boolean;
  reuse: AutoresearchRuntimeSnapshotReuse;
  discardedReason: string | null;
  segmentKey: string | null;
  runtimeKey: string | null;
}

export interface LoadAutoresearchRuntimeControlStateInput {
  cwd: string;
  current: AutoresearchRuntimeSnapshotInput;
}

export interface LoadAutoresearchRuntimeControlStateResult {
  control: AutoresearchControlStateV1;
  snapshot: AutoresearchRuntimeSnapshotV1 | null;
  snapshotStatus: AutoresearchRuntimeSnapshotStatus;
}

export function resolveAutoresearchRuntimeSnapshotPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_RUNTIME_SNAPSHOT_FILE);
}
