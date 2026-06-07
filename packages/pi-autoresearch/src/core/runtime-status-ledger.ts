import { type CampaignSegmentConfig, campaignEvents } from "../machine/events.ts";
import {
  type AutoresearchLedgerEventEntry,
  appendLedgerEvent,
  createLedgerEventEntry,
  loadAutoresearchLedger,
  projectAutoresearchLedger,
} from "./ledger.ts";
import type {
  AutoresearchConfigReceipt,
  AutoresearchReceipt,
  AutoresearchRunDecisionSummary,
  AutoresearchRunReceipt,
} from "./runtime-model.ts";
import { projectionMatchesCurrentSegment } from "./runtime-status-projection.ts";
import {
  type CurrentSegmentView,
  getCurrentSegment,
  summarizeCurrentSegment,
} from "./runtime-status-segment.ts";

function reconstructOriginalRunDescription(description: string): string {
  return description
    .replace(/ \(benchmark failed or timed out\)$/u, "")
    .replace(/ \(primary metric missing\)$/u, "")
    .replace(/ \(checks failed\)$/u, "");
}

export function ensureEventLedgerInitializedFromReceipts(
  cwd: string,
  entries: AutoresearchReceipt[],
): void {
  if (entries.length === 0) {
    return;
  }

  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const reconstructedEntries = reconstructLedgerEntriesForCurrentSegment(currentSegmentView);
  const loadResult = loadAutoresearchLedger(cwd);
  if (loadResult.entries.length === 0 && loadResult.invalidLineCount === 0) {
    appendLedgerEntries(cwd, reconstructedEntries);
    return;
  }

  const projection = projectAutoresearchLedger(cwd);
  if (!projectionMatchesCurrentSegment(projection, currentSegment)) {
    appendLedgerEntries(cwd, reconstructedEntries);
  }
}

function appendLedgerEntries(cwd: string, entries: AutoresearchLedgerEventEntry[]): void {
  for (const entry of entries) {
    appendLedgerEvent(cwd, entry);
  }
}

function reconstructLedgerEntriesForCurrentSegment(
  currentSegment: CurrentSegmentView,
): AutoresearchLedgerEventEntry[] {
  if (!currentSegment.config) {
    return [];
  }

  const config = currentSegment.config;
  return [
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
      config.createdAt,
    ),
    ...currentSegment.runs.flatMap((run) => reconstructLedgerEntriesForRun(run, config)),
  ];
}

function reconstructLedgerEntriesForRun(
  run: AutoresearchRunReceipt,
  config: AutoresearchConfigReceipt,
): AutoresearchLedgerEventEntry[] {
  const benchmarkCommand =
    run.benchmarkCommand ?? config.benchmarkCommand ?? "bash autoresearch.sh";
  const checksCommand = run.checksCommand ?? config.checksCommand ?? null;
  const entries: AutoresearchLedgerEventEntry[] = [
    createLedgerEventEntry(
      campaignEvents.startRun({
        description: reconstructOriginalRunDescription(run.description),
        benchmarkCommand,
        checksCommand,
      }),
      run.timestamp,
    ),
  ];

  if (run.status === "crash") {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkFailed("reconstructed crash receipt"),
        run.timestamp,
      ),
    );
  } else {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkSucceeded({
          metric: run.metric,
          requiresChecks: checksCommand !== null,
        }),
        run.timestamp,
      ),
    );

    if (checksCommand !== null) {
      entries.push(
        createLedgerEventEntry(
          run.status === "checks_failed" || run.checksPassed === false
            ? campaignEvents.checksFailed("reconstructed checks failure receipt")
            : campaignEvents.checksSucceeded(),
          run.timestamp,
        ),
      );
    }
  }

  entries.push(
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({
        status: run.status,
        metric: run.metric,
      }),
      run.timestamp,
    ),
    createLedgerEventEntry(
      campaignEvents.decideNextAction(
        run.decision?.mappedDecision ?? "iterate",
        run.decision
          ? formatRunDecisionLedgerReason(run.decision)
          : "reconstructed from receipt history",
      ),
      run.timestamp,
    ),
  );

  return entries;
}

export function createCampaignSegmentConfigFromReceipt(
  receipt: AutoresearchConfigReceipt,
): CampaignSegmentConfig {
  return {
    name: receipt.name,
    metricName: receipt.metricName,
    metricUnit: receipt.metricUnit,
    direction: receipt.direction,
    ...(receipt.metricThreshold === undefined ? {} : { metricThreshold: receipt.metricThreshold }),
    benchmarkCommand: receipt.benchmarkCommand ?? "bash autoresearch.sh",
    checksCommand: receipt.checksCommand ?? null,
  };
}

function formatRunDecisionLedgerReason(summary: AutoresearchRunDecisionSummary): string {
  if (summary.blockingReason) {
    return `Prompt Vault next_hypothesis blocked: ${summary.blockingReason}`;
  }

  return `Prompt Vault next_hypothesis -> ${summary.status}: ${summary.nextHypothesis ?? summary.stateRead ?? "decision recorded"}`;
}
