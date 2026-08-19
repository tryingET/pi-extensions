// ---
// summary: "Strictly validates telemetry review snapshots, JSON members, invariants, and canonical digest."
// read_when:
//   - "Changing telemetry snapshot validation, JSON parsing, internal consistency, or byte limits."
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

const REQUIRED_NONCLAIMS = [
  "This snapshot is a bounded observational projection, not AK/KES evidence or owner authority.",
  "This snapshot does not establish causality, safety, compliance, adoption, or promotion readiness.",
  "Missing or zero events may reflect disabled collection, retention, incomplete backfill, unavailable shards, or no observed activity.",
] as const;
const MAX_JSON_DEPTH = 64;

interface ValidatedWindow {
  days: number;
  start: number;
  end: number;
}

interface ValidatedCoverage {
  total: number;
  live: number;
  backfill: number;
  unspecified: number;
}

class DuplicateJsonObjectMemberError extends Error {}

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
  const generatedAt = timestamp(root.generatedAt, "generatedAt");
  const window = validateWindow(root.window);
  if (generatedAt !== window.end) {
    throw new Error("generatedAt must equal window.end");
  }
  const coverage = validateCoverage(root.coverage, window);
  validateMetrics(root.metrics, coverage);
  validateBreakdowns(root.breakdowns);
  sha256(root.sourceEventSetSha256, "sourceEventSetSha256");
  validateNonclaims(root.nonclaims);
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("telemetry review snapshot is not valid JSON");
  }

  try {
    rejectDuplicateJsonObjectMembers(text);
  } catch (error) {
    if (error instanceof DuplicateJsonObjectMemberError) throw error;
    throw new Error("telemetry review snapshot is not valid JSON");
  }
  return validateTelemetryReviewSnapshot(parsed);
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

function validateWindow(value: unknown): ValidatedWindow {
  const candidate = record(value, "window");
  exact(candidate, ["days", "start", "end"]);
  const days = windowDays(candidate.days);
  const start = timestamp(candidate.start, "window.start");
  const end = timestamp(candidate.end, "window.end");
  if (end <= start || end - start !== days * TELEMETRY_REVIEW_DAY_MS) {
    throw new Error("telemetry review snapshot window bounds are inconsistent");
  }
  return { days, start, end };
}

function validateCoverage(value: unknown, window: ValidatedWindow): ValidatedCoverage {
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
  if (first !== null && last !== null && (first > last || first < window.start || last > window.end)) {
    throw new Error("coverage observed bounds fall outside the review window");
  }
  if (coverage.retentionCeilingDays !== TELEMETRY_RETENTION_DAYS) {
    throw new Error("unsupported telemetry retention ceiling");
  }

  const sourceRows = countRows(coverage.sourceCounts, "source");
  const sourceMap = new Map(sourceRows.map((row) => [row.label, row.n]));
  for (const source of sourceMap.keys()) {
    if (source !== "live" && source !== "backfill" && source !== "unspecified") {
      throw new Error("coverage sourceCounts contains an unsupported source");
    }
  }
  if (
    (sourceMap.get("live") ?? 0) !== live ||
    (sourceMap.get("backfill") ?? 0) !== backfill ||
    (sourceMap.get("unspecified") ?? 0) !== unspecified
  ) {
    throw new Error("coverage sourceCounts do not match source totals");
  }
  if (sourceRows.reduce((sum, row) => sum + row.n, 0) !== total) {
    throw new Error("coverage sourceCounts do not sum to totalEvents");
  }

  const kindRows = countRows(coverage.perKind, "kind");
  if (kindRows.reduce((sum, row) => sum + row.n, 0) !== total) {
    throw new Error("coverage perKind does not sum to totalEvents");
  }
  stringArray(coverage.limitations, "coverage.limitations", 2, 16, 500);
  return { total, live, backfill, unspecified };
}

function validateMetrics(value: unknown, coverage: ValidatedCoverage): void {
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
    if (sample > coverage.total) {
      throw new Error(`metric ${key}.sampleSize exceeds totalEvents`);
    }
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
    if (metric.unit === "count") {
      if (!Number.isSafeInteger(metric.value)) {
        throw new Error(`metric ${key}.value must be an integer count`);
      }
      if (numerator !== null || denominator !== null) {
        throw new Error(`metric ${key} count must not carry numerator or denominator`);
      }
    } else {
      if (denominator === null) {
        throw new Error(`metric ${key} percent must carry a denominator`);
      }
      if (numerator !== null) {
        const expected = denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
        if (metric.value !== expected) {
          throw new Error(`metric ${key}.value does not match numerator and denominator`);
        }
      } else if (sample === 0 && metric.value !== 0) {
        throw new Error(`metric ${key}.value must be zero when no sample exists`);
      }
    }
  }

  const totalMetric = record(candidate.total_events, "metric total_events");
  if (totalMetric.value !== coverage.total || totalMetric.sampleSize !== coverage.total) {
    throw new Error("total_events metric does not match coverage");
  }
  validateCoverageShareMetric(candidate.live_event_share_pct, coverage.live, coverage.total, "live");
  validateCoverageShareMetric(
    candidate.backfill_event_share_pct,
    coverage.backfill,
    coverage.total,
    "backfill",
  );
}

function validateCoverageShareMetric(
  value: unknown,
  numerator: number,
  denominator: number,
  label: string,
): void {
  const metric = record(value, `${label} coverage share metric`);
  if (metric.numerator !== numerator || metric.denominator !== denominator) {
    throw new Error(`${label} coverage share metric does not match coverage`);
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
  const seenProfiles = new Set<string>();
  for (const row of candidate.subagentProfiles) {
    const item = record(row, "subagent profile");
    exact(item, ["profile", "n", "failed"]);
    const profile = label(item.profile, "profile");
    if (seenProfiles.has(profile)) throw new Error("duplicate subagent profile");
    seenProfiles.add(profile);
    const total = nonnegative(item.n, "subagent profile n");
    const failed = nonnegative(item.failed, "subagent profile failed");
    if (failed > total) throw new Error("subagent profile failed count exceeds total");
  }
}

function countRows(value: unknown, key: string): Array<{ label: string; n: number }> {
  if (!Array.isArray(value) || value.length > TELEMETRY_REVIEW_BREAKDOWN_LIMIT) {
    throw new Error(`invalid ${key} breakdown`);
  }
  const result: Array<{ label: string; n: number }> = [];
  const seen = new Set<string>();
  for (const row of value) {
    const item = record(row, `${key} breakdown row`);
    exact(item, [key, "n"]);
    const rowLabel = label(item[key], key);
    if (seen.has(rowLabel)) throw new Error(`duplicate ${key} breakdown label`);
    seen.add(rowLabel);
    result.push({ label: rowLabel, n: nonnegative(item.n, `${key} breakdown count`) });
  }
  return result;
}

function validateNonclaims(value: unknown): void {
  stringArray(value, "nonclaims", REQUIRED_NONCLAIMS.length, REQUIRED_NONCLAIMS.length, 500);
  if (
    !Array.isArray(value) ||
    value.some((item, index) => item !== REQUIRED_NONCLAIMS[index])
  ) {
    throw new Error("telemetry review snapshot nonclaims do not match the v1 contract");
  }
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
  if (
    !Number.isFinite(parsed) ||
    typeof value !== "string" ||
    new Date(parsed).toISOString() !== value
  ) {
    throw new Error(`${field} must be a canonical UTC timestamp`);
  }
  return parsed;
}

function nonnegative(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return Number(value);
}

function label(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > TELEMETRY_REVIEW_MAX_LABEL_CHARS ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function stringArray(
  value: unknown,
  field: string,
  minItems: number,
  maxItems: number,
  maxChars: number,
): void {
  if (
    !Array.isArray(value) ||
    value.length < minItems ||
    value.length > maxItems ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.length === 0 ||
        item.length > maxChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item),
    )
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

function rejectDuplicateJsonObjectMembers(text: string): void {
  let index = 0;

  function skipWhitespace(): void {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/u.test(text[index] ?? "")) {
      index += 1;
    }
  }

  function parseString(): string {
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index] ?? "";
      index += 1;
      if (character === '"') {
        return JSON.parse(text.slice(start, index)) as string;
      }
      if (character === "\\") {
        const escape = text[index] ?? "";
        index += 1;
        if (escape === "u") index += 4;
      }
    }
    throw new Error("unterminated JSON string");
  }

  function parseValue(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new Error("JSON nesting exceeds limit");
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      parseObject(depth + 1);
      return;
    }
    if (character === "[") {
      parseArray(depth + 1);
      return;
    }
    if (character === '"') {
      parseString();
      return;
    }
    if (text.startsWith("true", index)) {
      index += 4;
      return;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return;
    }
    if (text.startsWith("null", index)) {
      index += 4;
      return;
    }
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) throw new Error("invalid JSON value");
    index += match[0].length;
  }

  function parseObject(depth: number): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    const keys = new Set<string>();
    while (index < text.length) {
      skipWhitespace();
      if (text[index] !== '"') throw new Error("invalid JSON object key");
      const key = parseString();
      if (keys.has(key)) throw new DuplicateJsonObjectMemberError("duplicate JSON object member");
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") throw new Error("invalid JSON object separator");
      index += 1;
      parseValue(depth);
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") throw new Error("invalid JSON object delimiter");
      index += 1;
    }
    throw new Error("unterminated JSON object");
  }

  function parseArray(depth: number): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      parseValue(depth);
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") throw new Error("invalid JSON array delimiter");
      index += 1;
    }
    throw new Error("unterminated JSON array");
  }

  parseValue(0);
  skipWhitespace();
  if (index !== text.length) throw new Error("trailing JSON content");
}
