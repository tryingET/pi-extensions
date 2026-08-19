// ---
// summary: "Strictly validates telemetry review snapshots and their canonical digest."
// read_when:
//   - "Changing telemetry snapshot validation, internal consistency, or byte limits."
// ---

import {
  canonicalTelemetryReviewJson,
  isTelemetryReviewRecord,
  telemetryReviewSha256,
} from "./review-snapshot-canonical.ts";
import {
  TELEMETRY_REVIEW_BREAKDOWN_LIMIT,
  TELEMETRY_REVIEW_DAY_MS,
  TELEMETRY_REVIEW_MAX_LABEL_CHARS,
  TELEMETRY_REVIEW_METRIC_KEYS,
  TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES,
  TELEMETRY_REVIEW_SNAPSHOT_SCHEMA,
  type TelemetryReviewCoverageMode,
  type TelemetryReviewSnapshot,
} from "./review-snapshot-types.ts";
import { TELEMETRY_RETENTION_DAYS } from "./store.ts";

export function validateTelemetryReviewSnapshot(value: unknown): TelemetryReviewSnapshot {
  const root = record(value, "telemetry review snapshot");
  exact(root, [
    "schema",
    "producer",
    "generatedAt",
    "window",
    "coverage",
    "metrics",
    "breakdowns",
    "sourceEventSetSha256",
    "nonclaims",
    "snapshotSha256",
  ]);
  if (root.schema !== TELEMETRY_REVIEW_SNAPSHOT_SCHEMA) {
    throw new Error("unsupported telemetry review snapshot schema");
  }

  validateProducer(root.producer);
  timestamp(root.generatedAt, "generatedAt");
  validateWindow(root.window);
  validateCoverage(root.coverage, root.window);
  validateMetrics(root.metrics);
  validateBreakdowns(root.breakdowns);
  sha256(root.sourceEventSetSha256, "sourceEventSetSha256");
  stringArray(root.nonclaims, "nonclaims", 8, 500);
  sha256(root.snapshotSha256, "snapshotSha256");

  const { snapshotSha256: _snapshotSha256, ...payload } = root;
  if (root.snapshotSha256 !== telemetryReviewSha256(canonicalTelemetryReviewJson(payload))) {
    throw new Error("telemetry review snapshot digest mismatch");
  }
  if (Buffer.byteLength(JSON.stringify(root), "utf8") > TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES) {
    throw new Error("telemetry review snapshot exceeds the maximum byte size");
  }
  return root as unknown as TelemetryReviewSnapshot;
}

export function parseTelemetryReviewSnapshotJson(text: string): TelemetryReviewSnapshot {
  if (Buffer.byteLength(text, "utf8") > TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES) {
    throw new Error("telemetry review snapshot exceeds the maximum byte size");
  }
  try {
    return validateTelemetryReviewSnapshot(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("telemetry review snapshot is not valid JSON");
    }
    throw error;
  }
}

function validateProducer(value: unknown): void {
  const producer = record(value, "producer");
  exact(producer, ["package", "packageVersion", "telemetrySchemaVersion"]);
  if (
    producer.package !== "@tryinget/pi-telemetry" ||
    typeof producer.packageVersion !== "string" ||
    producer.packageVersion.length === 0 ||
    producer.packageVersion.length > 64 ||
    producer.telemetrySchemaVersion !== 1
  ) {
    throw new Error("unsupported telemetry review snapshot producer");
  }
}

function validateWindow(value: unknown): void {
  const candidate = record(value, "window");
  exact(candidate, ["days", "start", "end"]);
  const days = windowDays(candidate.days);
  const start = timestamp(candidate.start, "window.start");
  const end = timestamp(candidate.end, "window.end");
  if (end <= start || end - start !== days * TELEMETRY_REVIEW_DAY_MS) {
    throw new Error("telemetry review snapshot window bounds are inconsistent");
  }
}

function validateCoverage(value: unknown, windowValue: unknown): void {
  const coverage = record(value, "coverage");
  exact(coverage, [
    "mode",
    "totalEvents",
    "liveEvents",
    "backfillEvents",
    "unspecifiedSourceEvents",
    "firstObservedAt",
    "lastObservedAt",
    "retentionCeilingDays",
    "sourceCounts",
    "perKind",
    "limitations",
  ]);

  const total = nonnegative(coverage.totalEvents, "coverage.totalEvents");
  const live = nonnegative(coverage.liveEvents, "coverage.liveEvents");
  const backfill = nonnegative(coverage.backfillEvents, "coverage.backfillEvents");
  const unspecified = nonnegative(
    coverage.unspecifiedSourceEvents,
    "coverage.unspecifiedSourceEvents",
  );
  if (live + backfill + unspecified !== total) throw new Error("coverage counts do not sum");
  if (coverage.mode !== expectedCoverageMode(total, live, backfill, unspecified)) {
    throw new Error("coverage mode does not match counts");
  }

  const reviewWindow = record(windowValue, "window");
  const start = timestamp(reviewWindow.start, "window.start");
  const end = timestamp(reviewWindow.end, "window.end");
  const first =
    coverage.firstObservedAt === null
      ? null
      : timestamp(coverage.firstObservedAt, "firstObservedAt");
  const last =
    coverage.lastObservedAt === null
      ? null
      : timestamp(coverage.lastObservedAt, "lastObservedAt");
  if ((total === 0) !== (first === null && last === null)) {
    throw new Error("coverage observed bounds do not match totalEvents");
  }
  if (first !== null && last !== null && (first > last || first < start || last > end)) {
    throw new Error("coverage observed bounds fall outside the review window");
  }
  if (coverage.retentionCeilingDays !== TELEMETRY_RETENTION_DAYS) {
    throw new Error("unsupported telemetry retention ceiling");
  }

  const sourceRows = countRows(coverage.sourceCounts, "source");
  const kindRows = countRows(coverage.perKind, "kind");
  if (sourceRows.reduce((sum, row) => sum + row.n, 0) !== total) {
    throw new Error("coverage sourceCounts do not sum to totalEvents");
  }
  if (kindRows.reduce((sum, row) => sum + row.n, 0) !== total) {
    throw new Error("coverage perKind does not sum to totalEvents");
  }
  stringArray(coverage.limitations, "coverage.limitations", 16, 500);
}

function validateMetrics(value: unknown): void {
  const candidate = record(value, "metrics");
  exact(candidate, [...TELEMETRY_REVIEW_METRIC_KEYS]);
  for (const key of TELEMETRY_REVIEW_METRIC_KEYS) {
    const metric = record(candidate[key], `metric ${key}`);
    exact(metric, ["value", "unit", "sampleSize", "numerator", "denominator"]);
    if (typeof metric.value !== "number" || !Number.isFinite(metric.value) || metric.value < 0) {
      throw new Error(`metric ${key}.value is invalid`);
    }
    if (metric.unit !== "count" && metric.unit !== "percent") {
      throw new Error(`metric ${key}.unit is invalid`);
    }
    if (metric.unit === "percent" && metric.value > 100) {
      throw new Error(`metric ${key}.value exceeds 100 percent`);
    }
    const sample = nonnegative(metric.sampleSize, `metric ${key}.sampleSize`);
    const numerator =
      metric.numerator === null
        ? null
        : nonnegative(metric.numerator, `metric ${key}.numerator`);
    const denominator =
      metric.denominator === null
        ? null
        : nonnegative(metric.denominator, `metric ${key}.denominator`);
    if (denominator !== null && denominator !== sample) {
      throw new Error(`metric ${key}.denominator does not match sampleSize`);
    }
    if (numerator !== null && denominator !== null && numerator > denominator) {
      throw new Error(`metric ${key}.numerator exceeds denominator`);
    }
    if (metric.unit === "count" && !Number.isSafeInteger(metric.value)) {
      throw new Error(`metric ${key}.value must be an integer count`);
    }
  }
}

function validateBreakdowns(value: unknown): void {
  const candidate = record(value, "breakdowns");
  exact(candidate, [
    "topFailingTools",
    "compactionReasons",
    "compactionFailureStages",
    "topSkills",
    "followUpBlockedReasons",
    "subagentProfiles",
  ]);
  countRows(candidate.topFailingTools, "tool");
  countRows(candidate.compactionReasons, "reason");
  countRows(candidate.compactionFailureStages, "stage");
  countRows(candidate.topSkills, "skill");
  countRows(candidate.followUpBlockedReasons, "reason");
  if (!Array.isArray(candidate.subagentProfiles)) throw new Error("invalid subagent profiles");
  if (candidate.subagentProfiles.length > TELEMETRY_REVIEW_BREAKDOWN_LIMIT) {
    throw new Error("too many subagent profiles");
  }
  for (const row of candidate.subagentProfiles) {
    const item = record(row, "subagent profile");
    exact(item, ["profile", "n", "failed"]);
    label(item.profile, "profile");
    const total = nonnegative(item.n, "subagent profile n");
    const failed = nonnegative(item.failed, "subagent profile failed");
    if (failed > total) throw new Error("subagent profile failed count exceeds total");
  }
}

function countRows(value: unknown, key: string): Array<{ n: number }> {
  if (!Array.isArray(value) || value.length > TELEMETRY_REVIEW_BREAKDOWN_LIMIT) {
    throw new Error(`invalid ${key} breakdown`);
  }
  const result: Array<{ n: number }> = [];
  for (const row of value) {
    const item = record(row, `${key} breakdown row`);
    exact(item, [key, "n"]);
    label(item[key], key);
    result.push({ n: nonnegative(item.n, `${key} breakdown count`) });
  }
  return result;
}

function expectedCoverageMode(
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

function windowDays(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 90) {
    throw new Error("windowDays must be an integer between 1 and 90");
  }
  return Number(value);
}

function timestamp(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return parsed;
}

function nonnegative(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return Number(value);
}

function label(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > TELEMETRY_REVIEW_MAX_LABEL_CHARS
  ) {
    throw new Error(`${field} is invalid`);
  }
}

function stringArray(value: unknown, field: string, maxItems: number, maxChars: number): void {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => typeof item !== "string" || item.length === 0 || item.length > maxChars)
  ) {
    throw new Error(`${field} is invalid`);
  }
}

function sha256(value: unknown, field: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be a lowercase SHA-256 digest`);
  }
}

function exact(value: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`unexpected or missing fields: ${actual.join(", ")}`);
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isTelemetryReviewRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}
