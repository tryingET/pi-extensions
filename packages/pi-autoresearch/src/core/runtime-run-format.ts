import { formatAutoresearchRuntimeSnapshotReuse } from "./resume.ts";
import { formatAllowedActions } from "./runtime-control.ts";
import {
  formatConfidenceValue,
  formatExit,
  formatMetricInterpretation,
  formatMetricValue,
} from "./runtime-format.ts";
import type { ExecuteAutoresearchRunResult } from "./runtime-model.ts";
import { formatAutoresearchPeerLaneRecommendations } from "./runtime-peer-assist.ts";
import { formatExperimentLineageLines, formatTargetFiles } from "./runtime-status-format.ts";

export function formatAutoresearchRunResult(result: ExecuteAutoresearchRunResult): string {
  const metricUnit = result.status.currentSegment.metricUnit;
  const metrics = Object.entries(result.parsedMetrics)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `- ${name}=${value}`);

  const checksSummary = result.checks
    ? [
        `- checks: ${result.checks.command}`,
        `- checks exit: ${formatExit(result.checks.exitCode, result.checks.timedOut)} in ${result.checks.durationSeconds.toFixed(2)}s`,
      ]
    : ["- checks: (not run)"];
  const decisionSummary = result.decisionSummary
    ? [
        `- live post-run decision: ${result.decisionSummary.status} -> ${result.decisionSummary.mappedDecision}`,
        result.decisionSummary.blockingReason
          ? `- decision block: ${result.decisionSummary.blockingReason}`
          : `- next hypothesis: ${result.decisionSummary.nextHypothesis ?? "(none)"}`,
        `- decision target files: ${formatTargetFiles(result.decisionSummary.targetFiles)}`,
      ]
    : ["- live post-run decision: not requested; preserved bounded iterate bridge"];

  return [
    "# PI-AUTORESEARCH RUN",
    "",
    `- cwd: ${result.cwd}`,
    `- receipt log: ${result.receiptPath}`,
    `- event ledger: ${result.status.runtimeProjection.ledgerPath ?? "(unresolved)"}`,
    result.status.runtimeSnapshot.path
      ? `- runtime snapshot: ${result.status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- created config: ${result.createdConfig ? "yes" : "no"}`,
    `- run status: ${result.runReceipt.status}`,
    `- run kind: ${result.runReceipt.runKind ?? "ordinary"}`,
    `- empirical decision: ${result.runReceipt.empiricalDecisionClass ?? result.status.currentSegment.empiricalDecisionClass}`,
    ...formatExperimentLineageLines(result.runReceipt.experiment),
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- control state: ${result.status.control.kind} (${formatAllowedActions(result.status.control.allowedActions)})`,
    `- ledger replay: ${result.status.runtimeProjection.replayedEventCount}/${result.status.runtimeProjection.eventCount} events accepted`,
    `- primary metric: ${result.primaryMetricName}=${formatMetricValue(result.primaryMetric, metricUnit)}`,
    `- benchmark: ${result.benchmark.command}`,
    `- benchmark exit: ${formatExit(result.benchmark.exitCode, result.benchmark.timedOut)} in ${result.benchmark.durationSeconds.toFixed(2)}s`,
    ...checksSummary,
    ...decisionSummary,
    `- current baseline: ${formatMetricValue(result.status.currentSegment.baselineMetric, metricUnit)}`,
    `- current best: ${formatMetricValue(result.status.currentSegment.bestMetric, metricUnit)}`,
    `- confidence: ${formatConfidenceValue(result.status.currentSegment.confidence)}`,
    `- segment empirical decision: ${result.status.currentSegment.empiricalDecisionClass}`,
    `- timing interpretation: ${formatMetricInterpretation(result.status.currentSegment.metricInterpretation, metricUnit)}`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({
      cwd: result.cwd,
      runStatus: result.runReceipt.status,
      decisionSummary: result.decisionSummary,
    }),
    "",
    "## Parsed metrics",
    ...(metrics.length > 0 ? metrics : ["- (none)"]),
    "",
    "## Output tail",
    result.benchmark.outputTail.length > 0 ? result.benchmark.outputTail : "(no output)",
    ...(result.checks && result.checks.outputTail.length > 0
      ? ["", "## Checks output tail", result.checks.outputTail]
      : []),
  ].join("\n");
}
