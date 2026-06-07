import type {
  AutoresearchEmpiricalPosture,
  AutoresearchMetricInterpretation,
  AutoresearchRunKind,
  RunStatus,
} from "./runtime.ts";

export function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "(n/a)";
  return `${value}${unit}`;
}

export function formatMetricThresholdValue(value: number | null, unit: string): string {
  return value === null
    ? "(not set; zero-target blocker inference may apply)"
    : formatMetricValue(value, unit);
}

export function formatConfidenceValue(value: number | null): string {
  if (value === null) return "(n/a)";
  return `${value.toFixed(2)}x`;
}

export function formatEmpiricalPosture(posture: AutoresearchEmpiricalPosture): string {
  return `${posture.classification}; promotion_ready=${posture.promotionReady ? "yes" : "no"}; ${posture.summary}; next=${posture.recommendedNextAction}`;
}

export function formatMetricInterpretation(
  interpretation: AutoresearchMetricInterpretation | null,
  unit: string,
): string {
  if (!interpretation) return "(n/a)";
  return `${interpretation.verdict}; samples=${interpretation.sampleCount}; noise_band=±${formatMetricValue(roundMetric(interpretation.noiseBand), unit)}; best_delta=${formatSignedMetric(interpretation.bestDelta, unit)} (${interpretation.bestDeltaPercent.toFixed(1)}%); latest_delta=${formatSignedMetric(interpretation.latestDelta, unit)} (${interpretation.latestDeltaPercent.toFixed(1)}%); ${interpretation.reason}`;
}

export function formatSignedMetric(value: number, unit: string): string {
  const rounded = roundMetric(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}${unit}`;
}

export function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatLastRun(
  status: RunStatus | null,
  metric: number | null,
  unit: string,
  runKind?: AutoresearchRunKind | null,
): string {
  if (!status) return "(none)";
  const kindSuffix = runKind && runKind !== "ordinary" ? ` (${runKind})` : "";
  return `${status}${kindSuffix} @ ${formatMetricValue(metric, unit)}`;
}

export function formatExit(exitCode: number | null, timedOut: boolean): string {
  if (timedOut) return "timeout";
  if (exitCode === null) return "signal/error";
  return `exit ${exitCode}`;
}

export function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "(none)";
  }
  return new Date(value).toISOString();
}
