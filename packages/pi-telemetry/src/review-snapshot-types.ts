// ---
// summary: "Defines the bounded pi.telemetry-review-snapshot.v1 contract."
// read_when:
//   - "Changing telemetry review snapshot fields, metric keys, limits, or public types."
// ---

export const TELEMETRY_REVIEW_SNAPSHOT_SCHEMA = "pi.telemetry-review-snapshot.v1" as const;
export const TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const TELEMETRY_REVIEW_BREAKDOWN_LIMIT = 20;
export const TELEMETRY_REVIEW_MAX_LABEL_CHARS = 120;
export const TELEMETRY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

export const TELEMETRY_REVIEW_METRIC_KEYS = [
  "total_events",
  "live_event_share_pct",
  "backfill_event_share_pct",
  "tool_failure_rate_pct",
  "compaction_stalled_rate_pct",
  "compaction_unresolved_begin_count",
  "compaction_failure_count",
  "compaction_quality_validation_failure_rate_pct",
  "compaction_quality_fallback_rate_pct",
  "compaction_quality_repair_rate_pct",
  "compaction_quality_message_omission_rate_pct",
  "recall_zero_hit_rate_pct",
  "recall_degraded_rate_pct",
  "recall_scope_widened_rate_pct",
  "vault_failure_rate_pct",
  "follow_up_blocked_rate_pct",
  "subagent_failure_rate_pct",
] as const;

export type TelemetryReviewMetricKey = (typeof TELEMETRY_REVIEW_METRIC_KEYS)[number];
export type TelemetryReviewCoverageMode =
  | "empty"
  | "live-only"
  | "backfill-only"
  | "mixed"
  | "unspecified-only";

export interface TelemetryReviewMetric {
  value: number;
  unit: "count" | "percent";
  sampleSize: number;
  numerator: number | null;
  denominator: number | null;
}

export interface TelemetryReviewSnapshot {
  schema: typeof TELEMETRY_REVIEW_SNAPSHOT_SCHEMA;
  producer: {
    package: "@tryinget/pi-telemetry";
    packageVersion: string;
    telemetrySchemaVersion: 1;
  };
  generatedAt: string;
  window: { days: number; start: string; end: string };
  coverage: {
    mode: TelemetryReviewCoverageMode;
    totalEvents: number;
    liveEvents: number;
    backfillEvents: number;
    unspecifiedSourceEvents: number;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    retentionCeilingDays: number;
    sourceCounts: Array<{ source: string; n: number }>;
    perKind: Array<{ kind: string; n: number }>;
    limitations: string[];
  };
  metrics: Record<TelemetryReviewMetricKey, TelemetryReviewMetric>;
  breakdowns: {
    topFailingTools: Array<{ tool: string; n: number }>;
    compactionReasons: Array<{ reason: string; n: number }>;
    compactionFailureStages: Array<{ stage: string; n: number }>;
    topSkills: Array<{ skill: string; n: number }>;
    followUpBlockedReasons: Array<{ reason: string; n: number }>;
    subagentProfiles: Array<{ profile: string; n: number; failed: number }>;
  };
  sourceEventSetSha256: string;
  nonclaims: string[];
  snapshotSha256: string;
}
