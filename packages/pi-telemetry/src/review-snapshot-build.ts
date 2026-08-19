// ---
// summary: "Builds deterministic bounded telemetry review snapshots from an exact aggregate window."
// read_when:
//   - "Adding review metrics, coverage limitations, or bounded breakdowns."
// ---

import type { TelemetrySummary } from "./aggregate.ts";
import type { TelemetryEvent } from "./events.ts";
import {
  boundedTelemetryReviewLabel,
  canonicalTelemetryReviewJson,
  compareTelemetryReviewEvents,
  readTelemetryPackageVersion,
  telemetryEventForReviewDigest,
  telemetryReviewSha256,
} from "./review-snapshot-canonical.ts";
import {
  TELEMETRY_REVIEW_BREAKDOWN_LIMIT,
  TELEMETRY_REVIEW_DAY_MS,
  TELEMETRY_REVIEW_SNAPSHOT_SCHEMA,
  type TelemetryReviewCoverageMode,
  type TelemetryReviewMetric,
  type TelemetryReviewMetricKey,
  type TelemetryReviewSnapshot,
} from "./review-snapshot-types.ts";
import { validateTelemetryReviewSnapshot } from "./review-snapshot-validate.ts";
import { TELEMETRY_RETENTION_DAYS } from "./store.ts";

export interface BuildTelemetryReviewSnapshotInput {
  events: TelemetryEvent[];
  summary: TelemetrySummary;
  windowDays: number;
  generatedAt?: Date | number | string;
}

export function buildTelemetryReviewSnapshot(
  input: BuildTelemetryReviewSnapshotInput,
): TelemetryReviewSnapshot {
  const generatedAtMs = timestamp(input.generatedAt ?? Date.now(), "generatedAt");
  const windowDays = reviewWindowDays(input.windowDays);
  const windowStartMs = generatedAtMs - windowDays * TELEMETRY_REVIEW_DAY_MS;
  const events = [...input.events].sort(compareTelemetryReviewEvents);

  if (input.summary.windowDays !== windowDays || input.summary.totalEvents !== events.length) {
    throw new Error("telemetry summary does not match the supplied review window and event set");
  }
  for (const event of events) {
    if (!Number.isFinite(event.ts) || event.ts < windowStartMs || event.ts > generatedAtMs) {
      throw new Error("telemetry snapshot event falls outside the declared review window");
    }
  }

  const sources = count(events, (event) => event.source ?? "unspecified");
  const kinds = count(events, (event) => event.kind);
  assertKindSummary(input.summary.perKind, kinds);
  const liveEvents = sources.get("live") ?? 0;
  const backfillEvents = sources.get("backfill") ?? 0;
  const unspecifiedSourceEvents = events.length - liveEvents - backfillEvents;

  const payload = {
    schema: TELEMETRY_REVIEW_SNAPSHOT_SCHEMA,
    producer: {
      package: "@tryinget/pi-telemetry" as const,
      packageVersion: readTelemetryPackageVersion(),
      telemetrySchemaVersion: 1 as const,
    },
    generatedAt: new Date(generatedAtMs).toISOString(),
    window: {
      days: windowDays,
      start: new Date(windowStartMs).toISOString(),
      end: new Date(generatedAtMs).toISOString(),
    },
    coverage: {
      mode: coverageMode(events.length, liveEvents, backfillEvents, unspecifiedSourceEvents),
      totalEvents: events.length,
      liveEvents,
      backfillEvents,
      unspecifiedSourceEvents,
      firstObservedAt: events[0] ? new Date(events[0].ts).toISOString() : null,
      lastObservedAt: events.at(-1) ? new Date(events.at(-1)?.ts ?? 0).toISOString() : null,
      retentionCeilingDays: TELEMETRY_RETENTION_DAYS,
      sourceCounts: countRows(sources, "source"),
      perKind: countRows(kinds, "kind"),
      limitations: coverageLimitations(
        events.length,
        liveEvents,
        backfillEvents,
        unspecifiedSourceEvents,
      ),
    },
    metrics: buildMetrics(input.summary, events.length, liveEvents, backfillEvents, kinds),
    breakdowns: {
      topFailingTools: breakdown(input.summary.toolCalls.topFailing, "tool"),
      compactionReasons: breakdown(input.summary.compaction.byReason, "reason"),
      compactionFailureStages: breakdown(input.summary.compactionFailures, "stage"),
      topSkills: breakdown(input.summary.skills, "skill"),
      followUpBlockedReasons: breakdown(input.summary.followUps.byBlockedReason, "reason"),
      subagentProfiles: profileBreakdown(input.summary.subagents.byProfile),
    },
    sourceEventSetSha256: telemetryReviewSha256(
      canonicalTelemetryReviewJson(events.map(telemetryEventForReviewDigest)),
    ),
    nonclaims: [
      "This snapshot is a bounded observational projection, not AK/KES evidence or owner authority.",
      "This snapshot does not establish causality, safety, compliance, adoption, or promotion readiness.",
      "Missing or zero events may reflect disabled collection, retention, incomplete backfill, unavailable shards, or no observed activity.",
    ],
  };

  return validateTelemetryReviewSnapshot({
    ...payload,
    snapshotSha256: telemetryReviewSha256(canonicalTelemetryReviewJson(payload)),
  });
}

function buildMetrics(
  summary: TelemetrySummary,
  totalEvents: number,
  liveEvents: number,
  backfillEvents: number,
  kinds: Map<string, number>,
): Record<TelemetryReviewMetricKey, TelemetryReviewMetric> {
  const compactionBegins = kinds.get("compaction_begin") ?? 0;
  return {
    total_events: countMetric(totalEvents, totalEvents),
    live_event_share_pct: percentMetric(liveEvents, totalEvents),
    backfill_event_share_pct: percentMetric(backfillEvents, totalEvents),
    tool_failure_rate_pct: percentMetric(summary.toolCalls.failed, summary.toolCalls.total),
    compaction_stalled_rate_pct: percentMetric(
      summary.compaction.stalledAfterCompaction,
      summary.compaction.total,
    ),
    compaction_unresolved_begin_count: countMetric(
      summary.compaction.unresolvedBegins,
      compactionBegins,
    ),
    compaction_failure_count: countMetric(
      kinds.get("compaction_failure") ?? 0,
      compactionBegins,
    ),
    compaction_quality_validation_failure_rate_pct: percentMetric(
      summary.compactionQuality.validationFailures,
      summary.compactionQuality.total,
    ),
    compaction_quality_fallback_rate_pct: percentMetric(
      summary.compactionQuality.fallbacks,
      summary.compactionQuality.total,
    ),
    compaction_quality_repair_rate_pct: percentMetric(
      summary.compactionQuality.repairs,
      summary.compactionQuality.total,
    ),
    compaction_quality_message_omission_rate_pct: observedPercentMetric(
      summary.compactionQuality.messageOmissionRatePct,
      summary.compactionQuality.totalCompactedMessages,
    ),
    recall_zero_hit_rate_pct: percentMetric(summary.recall.zeroHit, summary.recall.total),
    recall_degraded_rate_pct: percentMetric(summary.recall.degraded, summary.recall.total),
    recall_scope_widened_rate_pct: percentMetric(
      summary.recall.scopeWidened,
      summary.recall.total,
    ),
    vault_failure_rate_pct: percentMetric(summary.vault.failed, summary.vault.total),
    follow_up_blocked_rate_pct: percentMetric(
      summary.followUps.blocked,
      summary.followUps.total,
    ),
    subagent_failure_rate_pct: percentMetric(
      summary.subagents.failed,
      summary.subagents.total,
    ),
  };
}

function countMetric(value: unknown, sampleSize: unknown): TelemetryReviewMetric {
  return {
    value: finiteCount(value),
    unit: "count",
    sampleSize: finiteCount(sampleSize),
    numerator: null,
    denominator: null,
  };
}

function percentMetric(numerator: unknown, denominator: unknown): TelemetryReviewMetric {
  const safeNumerator = finiteCount(numerator);
  const safeDenominator = finiteCount(denominator);
  return {
    value:
      safeDenominator > 0
        ? Math.round((safeNumerator / safeDenominator) * 1000) / 10
        : 0,
    unit: "percent",
    sampleSize: safeDenominator,
    numerator: safeNumerator,
    denominator: safeDenominator,
  };
}

function observedPercentMetric(value: unknown, sampleSize: unknown): TelemetryReviewMetric {
  const observed =
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const sample = finiteCount(sampleSize);
  return {
    value: Math.round(observed * 10) / 10,
    unit: "percent",
    sampleSize: sample,
    numerator: null,
    denominator: sample,
  };
}

function count(
  events: TelemetryEvent[],
  key: (event: TelemetryEvent) => string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const event of events) {
    const label = boundedTelemetryReviewLabel(key(event));
    result.set(label, (result.get(label) ?? 0) + 1);
  }
  return result;
}

function countRows<K extends "source" | "kind">(
  values: Map<string, number>,
  key: K,
): Array<Record<K, string> & { n: number }> {
  return [...values]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, n]) => ({ [key]: label, n })) as Array<Record<K, string> & { n: number }>;
}

function breakdown<K extends "tool" | "reason" | "stage" | "skill">(
  value: unknown,
  key: K,
): Array<Record<K, string> & { n: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => ({ [key]: boundedTelemetryReviewLabel(row[key]), n: finiteCount(row.n) }))
    .sort(
      (left, right) =>
        right.n - left.n || String(left[key]).localeCompare(String(right[key])),
    )
    .slice(0, TELEMETRY_REVIEW_BREAKDOWN_LIMIT) as Array<Record<K, string> & { n: number }>;
}

function profileBreakdown(
  value: unknown,
): Array<{ profile: string; n: number; failed: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => ({
      profile: boundedTelemetryReviewLabel(row.profile),
      n: finiteCount(row.n),
      failed: finiteCount(row.failed),
    }))
    .sort((left, right) => right.n - left.n || left.profile.localeCompare(right.profile))
    .slice(0, TELEMETRY_REVIEW_BREAKDOWN_LIMIT);
}

function coverageMode(
  total: number,
  live: number,
  backfill: number,
  unspecified: number,
): TelemetryReviewCoverageMode {
  if (total === 0) return "empty";
  if (live === total) return "live-only";
  if (backfill === total) return "backfill-only";
  if (unspecified === total) return "unspecified-only";
  return "mixed";
}

function coverageLimitations(
  total: number,
  live: number,
  backfill: number,
  unspecified: number,
): string[] {
  const result = [
    `Telemetry shards are retained for at most ${TELEMETRY_RETENTION_DAYS} days by default.`,
    "Collection is best-effort and may be disabled or unavailable; absence of events is not proof that no activity or failure occurred.",
  ];
  if (total === 0) {
    result.push("The selected window is empty and cannot establish that no activity occurred.");
  }
  if (total > 0 && live === 0) {
    result.push("The selected window has no explicitly measured-live events.");
  }
  if (backfill > 0) {
    result.push(
      "Backfill is derived and omits durations and live-only event kinds; live and backfill observations remain distinct.",
    );
  }
  if (unspecified > 0) {
    result.push("Some events predate explicit source labeling and have unspecified provenance.");
  }
  return result;
}

function assertKindSummary(value: unknown, actual: Map<string, number>): void {
  if (!Array.isArray(value)) throw new Error("telemetry summary perKind is invalid");
  const expected = new Map<string, number>();
  for (const row of value) {
    if (!isRecord(row)) throw new Error("telemetry summary perKind row is invalid");
    expected.set(boundedTelemetryReviewLabel(row.kind), finiteCount(row.n));
  }
  if (expected.size !== actual.size) throw new Error("telemetry summary perKind is inconsistent");
  for (const [kind, n] of actual) {
    if (expected.get(kind) !== n) throw new Error("telemetry summary perKind is inconsistent");
  }
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function reviewWindowDays(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 90) {
    throw new Error("windowDays must be an integer between 1 and 90");
  }
  return Number(value);
}

function timestamp(value: unknown, field: string): number {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
