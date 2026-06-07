import { existsSync } from "node:fs";
import path from "node:path";

import type { AutoresearchAutoContinuationSessionGate } from "./autoContinuation.ts";
import type { FinalizeDecisionPacket, SetupDecisionPacket } from "./decisions.ts";
import { AUTORESEARCH_LOCAL_ARTIFACTS, AUTORESEARCH_PHASE } from "./runtime-constants.ts";
import { formatMetricValue } from "./runtime-format.ts";
import type {
  AutoresearchLlamacppCampaignProjectionAvailability,
  AutoresearchLlamacppCampaignProjectionStatus,
  AutoresearchPromptVaultDecisionAvailability,
  AutoresearchRunDecisionSummary,
  AutoresearchRuntimeStatus,
} from "./runtime-model.ts";
import { loadReceiptLog, resolveAutoresearchPaths } from "./runtime-receipts.ts";
import { buildAutoresearchRuntimeStatusFromEntries } from "./runtime-status-projection.ts";

export {
  createCampaignSegmentConfigFromReceipt,
  ensureEventLedgerInitializedFromReceipts,
} from "./runtime-status-ledger.ts";
export { ensureMachineReadyForBoundedRun } from "./runtime-status-machine.ts";
export {
  buildAutoresearchRuntimeStatusFromEntries,
  createRuntimeSnapshotInput,
} from "./runtime-status-projection.ts";
export {
  createConfigFromInput,
  decorateRunDescription,
  defaultBenchmarkCommand,
  describeBenchmarkFailure,
  determineRunStatus,
  resolveChecksCommand,
} from "./runtime-status-run.ts";
export { getCurrentSegment } from "./runtime-status-segment.ts";

export function buildAutoresearchRuntimeStatus(
  cwd?: string,
  options: {
    persistSnapshot?: boolean;
    autoContinuationSession?: AutoresearchAutoContinuationSessionGate;
  } = {},
): AutoresearchRuntimeStatus {
  const paths = cwd ? resolveAutoresearchPaths(cwd) : null;
  const { entries, invalidLineCount } = cwd
    ? loadReceiptLog(cwd)
    : { entries: [], invalidLineCount: 0 };
  return buildAutoresearchRuntimeStatusFromEntries(cwd, paths, entries, invalidLineCount, {
    persistSnapshot: options.persistSnapshot ?? false,
    autoContinuationSession: options.autoContinuationSession,
  });
}

export function enrichSetupDecisionPacket(
  cwd: string,
  packet: SetupDecisionPacket,
): SetupDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const repoContext =
    packet.repoContext.length > 0
      ? [...packet.repoContext]
      : [
          `cwd: ${cwd}`,
          `phase: ${AUTORESEARCH_PHASE}`,
          `machine state: ${status.runtimeProjection.state}`,
        ];
  const benchmarkSurfaces =
    packet.benchmarkSurfaces.length > 0
      ? [...packet.benchmarkSurfaces]
      : [
          status.currentSegment.benchmarkCommand
            ? `benchmark command: ${status.currentSegment.benchmarkCommand}`
            : "benchmark command: (unset)",
          `checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        ];
  const existingArtifacts =
    packet.existingArtifacts.length > 0
      ? [...packet.existingArtifacts]
      : AUTORESEARCH_LOCAL_ARTIFACTS.filter((artifact) => existsSync(path.join(cwd, artifact)));

  return {
    ...packet,
    repoContext,
    benchmarkSurfaces,
    existingArtifacts,
  };
}

export function enrichFinalizeDecisionPacket(
  cwd: string,
  packet: FinalizeDecisionPacket,
): FinalizeDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  return {
    ...packet,
    campaignContext:
      packet.campaignContext.length > 0
        ? [...packet.campaignContext]
        : [
            `campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
            `machine state: ${status.runtimeProjection.state}`,
            `baseline: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
            `best: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
          ],
  };
}

export function formatPromptVaultDecisionAvailability(
  value: AutoresearchPromptVaultDecisionAvailability,
): string {
  switch (value) {
    case "available_not_yet_used":
      return "available (not used yet)";
    case "available_last_used_successfully":
      return "available (last used successfully)";
    case "available_last_used_blocked":
      return "available (last use blocked)";
  }
}

export function formatLastPostRunDecision(value: AutoresearchRunDecisionSummary | null): string {
  if (!value) {
    return "(none)";
  }

  const summary =
    value.blockingReason ?? value.nextHypothesis ?? value.stateRead ?? "decision recorded";
  return `${value.status} -> ${value.mappedDecision} (${summary})`;
}

export function formatLlamacppCampaignProjectionAvailability(
  value: AutoresearchLlamacppCampaignProjectionAvailability,
): string {
  switch (value) {
    case "current":
      return "current";
    case "stale":
      return "stale";
    default:
      return "not projected";
  }
}

export function formatLlamacppCampaignProjectionLabel(
  value: AutoresearchLlamacppCampaignProjectionStatus,
): string {
  if (!value.campaignId && !value.manifestPath) {
    return "(none)";
  }
  if (!value.campaignId) {
    return value.manifestPath ?? "(none)";
  }
  if (!value.manifestPath) {
    return value.campaignId;
  }
  return `${value.campaignId} (${value.manifestPath})`;
}
