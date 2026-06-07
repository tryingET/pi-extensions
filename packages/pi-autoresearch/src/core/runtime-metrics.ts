import type {
  AutoresearchConfigReceipt,
  AutoresearchEmpiricalDecisionClass,
  AutoresearchMetricInterpretation,
  AutoresearchMetricInterpretationVerdict,
  AutoresearchRunReceipt,
  MetricDirection,
} from "./runtime.ts";

export function isSuccessfulMetricRun(run: AutoresearchRunReceipt): boolean {
  return (
    run.status !== "crash" &&
    run.status !== "checks_failed" &&
    typeof run.metric === "number" &&
    Number.isFinite(run.metric)
  );
}

export function isBetter(current: number, best: number, direction: MetricDirection): boolean {
  return direction === "lower" ? current < best : current > best;
}

export function classifyLatestEmpiricalDecision(
  runs: AutoresearchRunReceipt[],
  successfulRuns: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt | null,
  metricInterpretation: AutoresearchMetricInterpretation | null,
): AutoresearchEmpiricalDecisionClass {
  const latestRun = runs.at(-1);
  if (!latestRun) return "not_evaluated";
  return classifyRunEmpiricalDecision(latestRun, successfulRuns, config, metricInterpretation);
}

export function classifyRunEmpiricalDecision(
  run: AutoresearchRunReceipt,
  successfulRuns: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt | null,
  metricInterpretation: AutoresearchMetricInterpretation | null,
): AutoresearchEmpiricalDecisionClass {
  if (run.status === "checks_failed") return "checks_failed";
  if (run.status === "crash") return "measurement_invalid";
  if (!isSuccessfulMetricRun(run)) return "measurement_invalid";
  if (run.status === "baseline" || successfulRuns[0] === run) return "baseline";
  if (!config) return "not_evaluated";

  const baselineMetric = successfulRuns[0]?.metric;
  if (baselineMetric === undefined) return "not_evaluated";

  const delta = directionalDelta(baselineMetric, run.metric, config.direction);
  const runKind = run.runKind ?? "ordinary";

  if (isDurationMetric(config.metricName, config.metricUnit)) {
    if (!metricInterpretation || metricInterpretation.sampleCount < 3) {
      return "insufficient_samples";
    }
    if (delta >= metricInterpretation.noiseBand) {
      if (runKind === "calibration") return "calibration_signal";
      if (metricInterpretation.verdict === "baseline_drift") return "baseline_drift";
      const threshold = resolveMetricThreshold(config);
      if (threshold !== null) {
        return classifyMetricThresholdDecision(
          baselineMetric,
          run.metric,
          threshold,
          config.direction,
        );
      }
      return "candidate_improvement";
    }
    if (delta <= -metricInterpretation.noiseBand) {
      return runKind === "calibration" ? "baseline_drift" : "candidate_regression";
    }
    return "possible_noise";
  }

  if (runKind === "calibration") return "possible_noise";
  const threshold = resolveMetricThreshold(config);
  if (threshold !== null) {
    return classifyMetricThresholdDecision(baselineMetric, run.metric, threshold, config.direction);
  }
  if (isBetter(run.metric, baselineMetric, config.direction)) return "candidate_improvement";
  if (run.metric === baselineMetric) return "candidate_neutral";
  return "candidate_regression";
}

export function resolveMetricThreshold(config: AutoresearchConfigReceipt): number | null {
  if (typeof config.metricThreshold === "number" && Number.isFinite(config.metricThreshold)) {
    return config.metricThreshold;
  }
  return isZeroThresholdMetric(config.metricName, config.metricUnit, config.direction) ? 0 : null;
}

export function classifyMetricThresholdDecision(
  baselineMetric: number,
  runMetric: number,
  threshold: number,
  direction: MetricDirection,
): AutoresearchEmpiricalDecisionClass {
  const baselineSatisfied = satisfiesMetricThreshold(baselineMetric, threshold, direction);
  const runSatisfied = satisfiesMetricThreshold(runMetric, threshold, direction);
  if (runSatisfied && !baselineSatisfied) return "threshold_satisfied";
  if (runSatisfied && baselineSatisfied) return "threshold_preserved";
  if (!runSatisfied && baselineSatisfied) return "threshold_regressed";
  return isBetter(runMetric, baselineMetric, direction) || runMetric === baselineMetric
    ? "threshold_not_met"
    : "candidate_regression";
}

export function satisfiesMetricThreshold(
  value: number,
  threshold: number,
  direction: MetricDirection,
): boolean {
  return direction === "lower" ? value <= threshold : value >= threshold;
}

export function isZeroThresholdMetric(
  metricName: string,
  metricUnit: string,
  direction: MetricDirection,
): boolean {
  if (direction !== "lower") return false;
  if (/^(?:ms|s|sec|secs|seconds|milliseconds)$/iu.test(metricUnit)) return false;
  return /(?:^|[_:-])(?:blockers?|failures?|violations?|errors?|unresolved|remaining|regressions?)(?:$|[_:-])/iu.test(
    metricName,
  );
}

export function interpretMetricNoise(
  runs: AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt,
): AutoresearchMetricInterpretation | null {
  if (!isDurationMetric(config.metricName, config.metricUnit)) return null;
  if (runs.length === 0) return null;

  const values = runs.map((run) => run.metric);
  const baselineMetric = values[0];
  const bestMetric = selectBestMetric(values, config.direction);
  const latestMetric = values.at(-1) ?? baselineMetric;
  const minMetric = Math.min(...values);
  const maxMetric = Math.max(...values);
  const medianMetric = sortedMedian(values);
  const deviations = values.map((value) => Math.abs(value - medianMetric));
  const mad = sortedMedian(deviations);
  const noiseBand = Math.max(Math.abs(baselineMetric) * 0.05, mad * 2, 1);
  const bestDelta = directionalDelta(baselineMetric, bestMetric, config.direction);
  const latestDelta = directionalDelta(baselineMetric, latestMetric, config.direction);
  const bestDeltaPercent = percentDelta(bestDelta, baselineMetric);
  const latestDeltaPercent = percentDelta(latestDelta, baselineMetric);

  if (values.length < 3) {
    return {
      verdict: "insufficient_samples",
      sampleCount: values.length,
      baselineMetric,
      bestMetric,
      latestMetric,
      minMetric,
      medianMetric,
      maxMetric,
      noiseBand,
      bestDelta,
      latestDelta,
      bestDeltaPercent,
      latestDeltaPercent,
      reason:
        "duration metrics need at least 3 successful samples before small deltas are meaningful",
    };
  }

  const bestRun = selectBestRun(runs, config.direction);
  const bestRunKind = bestRun?.runKind ?? "ordinary";
  const baselineDrift = detectBaselineDrift(runs, config.direction, baselineMetric, noiseBand);
  let verdict: AutoresearchMetricInterpretationVerdict = "possible_noise";
  let reason = "best timing delta is within the current noise band";
  if (latestDelta < -noiseBand) {
    verdict = "regression";
    reason = "latest timing sample is worse than baseline beyond the current noise band";
  } else if (baselineDrift) {
    verdict = "baseline_drift";
    reason =
      "calibration samples explain the apparent baseline improvement; treat candidate gains as baseline drift unless the candidate beats calibration beyond the noise band";
  } else if (bestDelta >= noiseBand && bestRunKind === "calibration") {
    verdict = "calibration_signal";
    reason =
      "best timing sample is calibration-only evidence beyond the current noise band; do not treat it as a candidate improvement";
  } else if (bestDelta >= noiseBand) {
    verdict = "meaningful_improvement";
    reason = "best timing sample improves on baseline beyond the current noise band";
  }

  return {
    verdict,
    sampleCount: values.length,
    baselineMetric,
    bestMetric,
    latestMetric,
    minMetric,
    medianMetric,
    maxMetric,
    noiseBand,
    bestDelta,
    latestDelta,
    bestDeltaPercent,
    latestDeltaPercent,
    reason,
  };
}

export function isDurationMetric(metricName: string, metricUnit: string): boolean {
  return (
    /(?:^|[_:-])(?:ms|millis|milliseconds|seconds|secs|duration|runtime|latency|time)$/iu.test(
      metricName,
    ) || /^(?:ms|s|sec|secs|seconds|milliseconds)$/iu.test(metricUnit)
  );
}

export function selectBestMetric(values: number[], direction: MetricDirection): number {
  return values.reduce((best, value) => (isBetter(value, best, direction) ? value : best));
}

export function selectBestRun(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
): AutoresearchRunReceipt | null {
  return runs.reduce<AutoresearchRunReceipt | null>(
    (best, run) => (best === null || isBetter(run.metric, best.metric, direction) ? run : best),
    null,
  );
}

export function detectBaselineDrift(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
  baselineMetric: number,
  noiseBand: number,
): boolean {
  const calibrationRuns = runs.filter((run) => (run.runKind ?? "ordinary") === "calibration");
  if (calibrationRuns.length < 2) return false;

  const candidateRuns = runs.filter(
    (run) =>
      run.status === "candidate" &&
      (run.runKind ?? "ordinary") !== "calibration" &&
      isSuccessfulMetricRun(run),
  );
  if (candidateRuns.length === 0) return false;

  const bestCalibration = selectBestRun(calibrationRuns, direction);
  const bestCandidate = selectBestRun(candidateRuns, direction);
  if (!bestCalibration || !bestCandidate) return false;

  const calibrationDelta = directionalDelta(baselineMetric, bestCalibration.metric, direction);
  if (calibrationDelta < noiseBand) return false;

  const candidateBeyondCalibration = directionalDelta(
    bestCalibration.metric,
    bestCandidate.metric,
    direction,
  );
  return candidateBeyondCalibration < noiseBand;
}

export function directionalDelta(
  baseline: number,
  current: number,
  direction: MetricDirection,
): number {
  return direction === "lower" ? baseline - current : current - baseline;
}

export function percentDelta(delta: number, baseline: number): number {
  return baseline === 0 ? 0 : (delta / Math.abs(baseline)) * 100;
}

export function computeConfidence(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
): number | null {
  if (runs.length < 3) return null;

  const values = runs.map((run) => run.metric);
  const baseline = runs[0]?.metric;
  if (baseline === undefined) return null;

  let best = baseline;
  for (const value of values) {
    if (isBetter(value, best, direction)) {
      best = value;
    }
  }
  if (best === baseline) return null;

  const median = sortedMedian(values);
  const deviations = values.map((value) => Math.abs(value - median));
  const mad = sortedMedian(deviations);
  if (mad === 0) return null;

  return Math.abs(best - baseline) / mad;
}

export function sortedMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}
