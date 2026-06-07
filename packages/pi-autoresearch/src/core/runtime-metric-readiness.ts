import { formatMetricValue, formatSignedMetric, roundMetric } from "./runtime-format.ts";
import { isDurationMetric, isZeroThresholdMetric } from "./runtime-metrics.ts";
import type {
  AutoresearchMetricReadinessReview,
  AutoresearchRuntimeStatus,
  AutoresearchSegmentSummary,
} from "./runtime-model.ts";

export function buildAutoresearchMetricReadinessReview(
  status: AutoresearchRuntimeStatus,
): AutoresearchMetricReadinessReview {
  const segment = status.currentSegment;
  if (!segment.configured || !segment.metricName || !segment.direction) {
    return {
      classification: "unconfigured",
      summary: "no metric contract is configured yet",
      checklist: ["configure a fresh metric contract before making candidate lifecycle decisions"],
      blockedReasons: [
        "candidate decision cannot assess metric readiness without a configured segment",
      ],
    };
  }

  const thresholdTarget =
    segment.metricThreshold ??
    (isZeroThresholdMetric(segment.metricName, segment.metricUnit, segment.direction) ? 0 : null);
  const thresholdReviewNote =
    thresholdTarget === null
      ? null
      : `threshold target ${segment.direction === "higher" ? ">=" : "<="}${formatMetricValue(thresholdTarget, segment.metricUnit)} reviewed after duration/noise gates`;

  if (isDurationMetric(segment.metricName, segment.metricUnit)) {
    const interpretation = segment.metricInterpretation;
    if (!interpretation || interpretation.sampleCount < 3) {
      return {
        classification: "duration_under_sampled",
        summary:
          "duration metric has fewer than three successful samples; avoid treating one timing delta as a candidate win",
        checklist: [
          ...(thresholdReviewNote ? [thresholdReviewNote] : []),
          "collect baseline/calibration/candidate samples before promotion",
          "confirm candidate binding is ordinary, not calibration-only",
          "do not use keep/finalize as promotion authority while under-sampled",
        ],
        blockedReasons: ["duration metric is under-sampled for promotion-ready interpretation"],
      };
    }
    if (interpretation.verdict === "baseline_drift") {
      return {
        classification: "duration_baseline_drift",
        summary: "duration evidence is explainable by baseline/calibration drift",
        checklist: [
          ...(thresholdReviewNote ? [thresholdReviewNote] : []),
          "rebaseline or collect calibration before keep/finalize",
          "confirm the candidate effect is not workstation drift",
        ],
        blockedReasons: ["baseline drift suspected for the current duration metric"],
      };
    }
    return {
      classification: "duration_review_ready",
      summary: `duration metric has ${interpretation.sampleCount} samples; timing interpretation=${interpretation.verdict}`,
      checklist: [
        ...(thresholdReviewNote ? [thresholdReviewNote] : []),
        `noise band reviewed: ±${formatMetricValue(roundMetric(interpretation.noiseBand), segment.metricUnit)}`,
        `latest delta reviewed: ${formatSignedMetric(interpretation.latestDelta, segment.metricUnit)}`,
        "candidate lifecycle action remains external and review-gated",
      ],
      blockedReasons: [],
    };
  }

  if (thresholdTarget !== null) {
    const operator = segment.direction === "higher" ? ">=" : "<=";
    return {
      classification: "threshold_ready",
      summary: `threshold metric target ${operator}${formatMetricValue(thresholdTarget, segment.metricUnit)}; success is evidence posture, not promotion authority`,
      checklist: [
        `threshold target reviewed: ${operator}${formatMetricValue(thresholdTarget, segment.metricUnit)}`,
        "candidate result compared against baseline and threshold classification",
        "external promotion still requires owner-routed evidence or review",
      ],
      blockedReasons: [],
    };
  }

  return {
    classification: "generic_review",
    summary:
      "non-duration metric; review freshness, causal linkage, checks, and candidate binding before acting",
    checklist: [
      "metric was generated fresh by the benchmark command",
      "metric movement is causally linked to the candidate",
      "checks and candidate binding were reviewed",
    ],
    blockedReasons: [],
  };
}

export function describeMetricThresholdCaveat(segment: AutoresearchSegmentSummary): string {
  if (segment.metricThreshold === null) {
    return "no explicit threshold set; zero-target blocker/failure metric-name inference may still apply";
  }
  const operator = segment.direction === "higher" ? ">=" : "<=";
  return `explicit success threshold ${operator}${formatMetricValue(segment.metricThreshold, segment.metricUnit)}; external promotion still requires owner-routed review`;
}
