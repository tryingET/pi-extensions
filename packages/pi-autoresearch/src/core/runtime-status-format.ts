import type {
  AutoresearchDecisionFailureStage,
  FinalizeDecisionOutcome,
  NextHypothesisDecisionOutcome,
  SetupDecisionOutcome,
} from "./decisions.ts";
import type {
  AutoresearchCandidateBinding,
  AutoresearchExperimentLineage,
  AutoresearchRunReceipt,
  AutoresearchRuntimeStatus,
  AutoresearchSegmentCloseout,
  MetricMap,
} from "./runtime.ts";
import { formatMetricValue } from "./runtime-format.ts";

export function formatTargetFiles(files: readonly string[]): string {
  return files.length > 0 ? files.join(", ") : "(none)";
}

export function formatNullableBoolean(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes" : "no";
}

export function describeAutoresearchBaselineDriftRisk(status: AutoresearchRuntimeStatus): string {
  if (
    status.empiricalPosture.classification === "baseline_drift_suspected" ||
    status.currentSegment.metricInterpretation?.verdict === "baseline_drift"
  ) {
    return "suspected; rebaseline before candidate promotion";
  }
  if (
    status.currentSegment.metricInterpretation?.verdict === "possible_noise" ||
    status.currentSegment.metricInterpretation?.verdict === "insufficient_samples"
  ) {
    return "possible; collect more samples before overclaiming";
  }
  if (!status.currentSegment.configured || status.currentSegment.runCount === 0) {
    return "unknown; no measured segment yet";
  }
  return "not currently indicated by runtime posture";
}

export function describeLatestCloseoutChecks(closeout: AutoresearchSegmentCloseout): string {
  return closeout.runs.at(-1)?.checks ?? "not run";
}

export function formatCandidateBindingLines(
  binding: AutoresearchCandidateBinding | undefined,
): Array<string | null> {
  if (!binding) return [];
  return [
    binding.source ? `- candidate source: ${binding.source}` : null,
    binding.worktreePath ? `- candidate worktree: ${binding.worktreePath}` : null,
    binding.branch ? `- candidate branch: ${binding.branch}` : null,
    binding.baseRef ? `- candidate base ref: ${binding.baseRef}` : null,
    binding.diffSummary ? `- candidate diff summary: ${binding.diffSummary}` : null,
    binding.filesChanged.length > 0
      ? `- candidate files changed: ${formatTargetFiles(binding.filesChanged)}`
      : null,
  ];
}

export function formatExperimentLabel(experiment: AutoresearchExperimentLineage): string {
  return (
    experiment.hypothesisId ??
    experiment.hypothesis ??
    experiment.interventionSummary ??
    experiment.expectedPrimaryEffect ??
    "(unlabeled)"
  );
}

export function formatExperimentLineageLines(
  experiment: AutoresearchExperimentLineage | undefined,
): string[] {
  if (!experiment) return [];
  return [
    experiment.hypothesisId ? `- hypothesis id: ${experiment.hypothesisId}` : null,
    experiment.hypothesis ? `- hypothesis: ${experiment.hypothesis}` : null,
    experiment.interventionSummary ? `- intervention: ${experiment.interventionSummary}` : null,
    experiment.expectedPrimaryEffect
      ? `- expected primary effect: ${experiment.expectedPrimaryEffect}`
      : null,
    experiment.targetFiles.length > 0
      ? `- experiment target files: ${formatTargetFiles(experiment.targetFiles)}`
      : null,
    experiment.risk ? `- experiment risk: ${experiment.risk}` : null,
    ...formatCandidateBindingLines(experiment.candidate),
  ].filter((line): line is string => line !== null);
}

export function describeChecksState(run: AutoresearchRunReceipt): string {
  if (run.checksCommand === null || run.checksCommand === undefined) {
    return "not run";
  }
  if (run.checksPassed === true) {
    return "passed";
  }
  if (run.checksPassed === false) {
    return "failed";
  }
  return "not recorded";
}

export function formatRunHistoryLine(run: AutoresearchRunReceipt, metricUnit: string): string {
  return [
    `iteration ${run.iteration ?? "?"}`,
    run.status,
    run.experiment ? `hypothesis ${formatExperimentLabel(run.experiment)}` : null,
    run.empiricalDecisionClass ? `empirical ${run.empiricalDecisionClass}` : null,
    `metric ${formatMetricValue(run.metric, metricUnit)}`,
    run.decision ? `decision ${run.decision.status}` : null,
    run.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

export function normalizeInlineReason(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function formatSetupBlockingReason(outcome: SetupDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return outcome.missingInformation.join("; ") || "setup decision blocked";
}

export function formatFinalizeBlockingReason(outcome: FinalizeDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return normalizeInlineReason(outcome.overallResult) ?? "finalize decision blocked";
}

export function isDecisionErrorOutcome(
  outcome: SetupDecisionOutcome | NextHypothesisDecisionOutcome | FinalizeDecisionOutcome,
): outcome is
  | Extract<SetupDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<NextHypothesisDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<FinalizeDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }> {
  return "failureStage" in outcome;
}

export function hasOwn(record: MetricMap, key: string): boolean {
  return Object.hasOwn(record, key);
}
