import {
  classifyLatestEmpiricalDecision,
  computeConfidence,
  interpretMetricNoise,
  isBetter,
  isSuccessfulMetricRun,
} from "./runtime-metrics.ts";
import type {
  AutoresearchConfigReceipt,
  AutoresearchEmpiricalPosture,
  AutoresearchReceipt,
  AutoresearchRunReceipt,
  AutoresearchSegmentSummary,
} from "./runtime-model.ts";

export interface CurrentSegmentView {
  config: AutoresearchConfigReceipt | null;
  runs: AutoresearchRunReceipt[];
}

export function summarizeCurrentSegment(
  currentSegment: CurrentSegmentView,
): AutoresearchSegmentSummary {
  const successfulRuns = currentSegment.runs.filter(isSuccessfulMetricRun);
  const optimizationRuns = successfulRuns.filter(
    (run) => (run.runKind ?? "ordinary") !== "calibration",
  );
  const baselineMetric = successfulRuns[0]?.metric ?? null;
  const metricInterpretation = currentSegment.config
    ? interpretMetricNoise(successfulRuns, currentSegment.config)
    : null;
  let bestMetric = optimizationRuns[0]?.metric ?? baselineMetric;

  if (currentSegment.config) {
    for (const run of optimizationRuns) {
      if (
        bestMetric === null ||
        isBetter(run.metric, bestMetric, currentSegment.config.direction)
      ) {
        bestMetric = run.metric;
      }
    }
  }

  return {
    configured: currentSegment.config !== null,
    name: currentSegment.config?.name ?? null,
    objectiveDigest: currentSegment.config?.objectiveDigest ?? null,
    metricName: currentSegment.config?.metricName ?? null,
    metricUnit: currentSegment.config?.metricUnit ?? "",
    direction: currentSegment.config?.direction ?? null,
    metricThreshold: currentSegment.config?.metricThreshold ?? null,
    benchmarkCommand: currentSegment.config?.benchmarkCommand ?? null,
    checksCommand: currentSegment.config?.checksCommand ?? null,
    runCount: currentSegment.runs.length,
    successfulRunCount: successfulRuns.length,
    baselineMetric,
    bestMetric,
    confidence:
      currentSegment.config && optimizationRuns.length > 0
        ? computeConfidence(optimizationRuns, currentSegment.config.direction)
        : null,
    metricInterpretation,
    empiricalDecisionClass: classifyLatestEmpiricalDecision(
      currentSegment.runs,
      successfulRuns,
      currentSegment.config,
      metricInterpretation,
    ),
    lastRunStatus: currentSegment.runs.at(-1)?.status ?? null,
    lastRunKind: currentSegment.runs.at(-1)?.runKind ?? null,
    lastRunMetric: currentSegment.runs.at(-1)?.metric ?? null,
  };
}

export function buildAutoresearchEmpiricalPosture(
  segment: AutoresearchSegmentSummary,
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchEmpiricalPosture {
  const ordinaryCandidateRuns = runs.filter(
    (run) =>
      run.status === "candidate" &&
      (run.runKind ?? "ordinary") !== "calibration" &&
      isSuccessfulMetricRun(run),
  );
  const calibrationRuns = runs.filter(
    (run) => (run.runKind ?? "ordinary") === "calibration" && isSuccessfulMetricRun(run),
  );
  if (!segment.configured) {
    return {
      classification: "unconfigured",
      summary: `no campaign configured yet`,
      promotionReady: false,
      recommendedNextAction: "configure a bounded segment before collecting evidence",
    };
  }

  if (segment.runCount === 0) {
    return {
      classification: "no_runs",
      summary: `configured but no baseline or run evidence exists yet`,
      promotionReady: false,
      recommendedNextAction: "run a baseline before interpreting candidate evidence",
    };
  }

  if (segment.empiricalDecisionClass === "measurement_invalid") {
    return {
      classification: "measurement_invalid",
      summary: `measurement is invalid; no promotion-ready evidence exists`,
      promotionReady: false,
      recommendedNextAction: "fix the benchmark or metric contract before another optimization run",
    };
  }

  if (segment.empiricalDecisionClass === "checks_failed") {
    return {
      classification: "checks_failed",
      summary: `checks failed; candidate evidence is blocked`,
      promotionReady: false,
      recommendedNextAction:
        "diagnose the check failure before promotion or another optimization claim",
    };
  }

  if (segment.successfulRunCount === 0 || segment.baselineMetric === null) {
    return {
      classification: "measurement_invalid",
      summary: `no successful metric baseline is available`,
      promotionReady: false,
      recommendedNextAction: "collect a successful baseline metric before interpreting the segment",
    };
  }

  if (ordinaryCandidateRuns.length === 0) {
    if (calibrationRuns.length > 0 || segment.empiricalDecisionClass === "calibration_signal") {
      return {
        classification: "calibration_only",
        summary: `calibration-only; no ordinary candidate evidence yet`,
        promotionReady: false,
        recommendedNextAction: "run an ordinary candidate before claiming improvement",
      };
    }
    return {
      classification: "baseline_only",
      summary: `baseline-only; no candidate evidence yet`,
      promotionReady: false,
      recommendedNextAction: "collect calibration samples or bind one ordinary candidate run",
    };
  }

  if (segment.empiricalDecisionClass === "baseline_drift") {
    return {
      classification: "baseline_drift_suspected",
      summary: `baseline drift suspected; candidate result is not promotion-ready`,
      promotionReady: false,
      recommendedNextAction: "rebaseline or collect more candidate samples before promotion",
    };
  }

  if (segment.empiricalDecisionClass === "insufficient_samples") {
    return {
      classification: "under_sampled",
      summary: `under-sampled; candidate result is not promotion-ready`,
      promotionReady: false,
      recommendedNextAction: "collect enough successful samples to separate effect from noise",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_improvement") {
    return {
      classification: "candidate_review_ready",
      summary: `ordinary candidate evidence exists and is review-ready`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_satisfied") {
    return {
      classification: "threshold_satisfied",
      summary: `candidate satisfies the primary threshold-style success condition`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote threshold-satisfied evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_preserved") {
    return {
      classification: "threshold_preserved",
      summary: `candidate preserves the primary threshold-style success condition`,
      promotionReady: true,
      recommendedNextAction:
        "generate closeout and promote threshold-preserved evidence through the owning review/evidence surface",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_regressed") {
    return {
      classification: "threshold_regressed",
      summary: `candidate regressed the primary threshold-style success condition`,
      promotionReady: false,
      recommendedNextAction: "discard or revise the candidate before another measured run",
    };
  }

  if (segment.empiricalDecisionClass === "threshold_not_met") {
    return {
      classification: "threshold_not_met",
      summary: `candidate has not satisfied the primary threshold-style success condition`,
      promotionReady: false,
      recommendedNextAction:
        "continue measuring or revise the candidate until the explicit threshold is satisfied",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_regression") {
    return {
      classification: "candidate_regression",
      summary: `candidate regression; do not promote this result`,
      promotionReady: false,
      recommendedNextAction: "discard or revise the candidate before another measured run",
    };
  }

  if (segment.empiricalDecisionClass === "candidate_neutral") {
    return {
      classification: "candidate_neutral",
      summary: `candidate appears neutral on the primary metric`,
      promotionReady: false,
      recommendedNextAction:
        "promote only with separate non-metric justification; otherwise try another candidate",
    };
  }

  return {
    classification: "inconclusive",
    summary: `result is inconclusive; no promotion-ready candidate evidence yet`,
    promotionReady: false,
    recommendedNextAction:
      "collect more samples, rebaseline, or bind a clearer candidate hypothesis",
  };
}

export function getCurrentSegment(entries: AutoresearchReceipt[]): CurrentSegmentView {
  let config: AutoresearchConfigReceipt | null = null;
  let runs: AutoresearchRunReceipt[] = [];

  for (const entry of entries) {
    if (entry.type === "config") {
      config = entry;
      runs = [];
      continue;
    }
    if (config) {
      runs.push(entry);
    }
  }

  return { config, runs };
}
