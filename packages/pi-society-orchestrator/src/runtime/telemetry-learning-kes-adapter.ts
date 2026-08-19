// ---
// summary: "Plans or materializes owner-local KES candidates from validated pi.telemetry-review-snapshot.v1 artifacts."
// read_when:
//   - "Changing the telemetry review, AK handoff, KES candidate, threshold, or authority boundary."
// ---

import path from "node:path";
import {
  createKesArtifactPlan,
  materializeKesArtifactPlan,
  type KesArtifactPlan,
} from "../kes/index.ts";
import type { EvidenceEntry } from "./evidence.ts";

export const TELEMETRY_LEARNING_KES_ADAPTER_KIND =
  "pi-society-orchestrator.telemetry_learning_kes_adapter.v1" as const;
export const TELEMETRY_REVIEW_SNAPSHOT_SCHEMA = "pi.telemetry-review-snapshot.v1" as const;

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
export type TelemetryLearningKesAdapterAction = "plan" | "materialize";
export type TelemetryThresholdComparison = "above" | "at-or-above" | "below" | "at-or-below";
export type TelemetryCoveragePolicy = "live-required" | "any-observed";

interface TelemetryReviewMetric {
  value: number;
  unit: "count" | "percent";
  sampleSize: number;
  numerator: number | null;
  denominator: number | null;
}

interface TelemetryReviewSnapshot {
  schema: typeof TELEMETRY_REVIEW_SNAPSHOT_SCHEMA;
  producer: { package: string; packageVersion: string; telemetrySchemaVersion: number };
  generatedAt: string;
  window: { days: number; start: string; end: string };
  coverage: {
    mode: string;
    totalEvents: number;
    liveEvents: number;
    backfillEvents: number;
    unspecifiedSourceEvents: number;
    limitations: string[];
  };
  metrics: Record<TelemetryReviewMetricKey, TelemetryReviewMetric>;
  sourceEventSetSha256: string;
  nonclaims: string[];
  snapshotSha256: string;
}

export type TelemetryReviewSnapshotLoader = (snapshotPath: string) => Promise<unknown>;

export interface BuildTelemetryLearningKesAdapterInput {
  packageRoot: string;
  snapshotPath: string;
  metric: TelemetryReviewMetricKey;
  threshold: number;
  comparison: TelemetryThresholdComparison;
  candidateClaim: string;
  falsificationCondition: string;
  reviewTrigger: string;
  retirementSignal: string;
  action?: TelemetryLearningKesAdapterAction;
  coveragePolicy?: TelemetryCoveragePolicy;
  minimumSampleSize?: number;
  minimumLiveEvents?: number;
  sessionId?: string;
  timestamp?: Date;
  loadSnapshot?: TelemetryReviewSnapshotLoader;
}

export interface TelemetryLearningKesAdapterResult {
  kind: typeof TELEMETRY_LEARNING_KES_ADAPTER_KIND;
  action: TelemetryLearningKesAdapterAction;
  status: "planned" | "materialized";
  packageRoot: string;
  snapshot: {
    path: string;
    schema: typeof TELEMETRY_REVIEW_SNAPSHOT_SCHEMA;
    digest: string;
    sourceEventSetDigest: string;
    producerVersion: string;
    generatedAt: string;
    window: TelemetryReviewSnapshot["window"];
    coverage: TelemetryReviewSnapshot["coverage"];
    nonclaims: string[];
  };
  review: {
    metric: TelemetryReviewMetricKey;
    value: number;
    unit: "count" | "percent";
    sampleSize: number;
    threshold: number;
    comparison: TelemetryThresholdComparison;
    thresholdCrossed: boolean;
    coveragePolicy: TelemetryCoveragePolicy;
    minimumSampleSize: number;
    minimumLiveEvents: number;
    blockers: string[];
  };
  akEvidenceHandoff: EvidenceEntry & {
    authorityCeiling: string;
  };
  kesPlan: KesArtifactPlan;
  writtenArtifacts: string[];
  effect: {
    telemetryMutated: false;
    akCalled: false;
    externalAuthorityMutated: false;
    promotionStateChanged: false;
    kesArtifactsWritten: boolean;
  };
  boundary: string;
}

const TELEMETRY_REVIEW_MODULE = "@tryinget/pi-telemetry/review-snapshot";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DEFAULT_MINIMUM_SAMPLE_SIZE = 20;
const DEFAULT_MINIMUM_LIVE_EVENTS = 1;
const MAX_POLICY_COUNT = 10_000_000;
const ADAPTER_BOUNDARY =
  "The adapter validates one digest-bound telemetry observation, evaluates one predeclared review trigger, and may write only package-owned KES diary/candidate artifacts. It does not call Agent Kernel, prove causality or claim truth, mutate telemetry or ontology, or promote content beyond Proposal.";

export async function buildTelemetryLearningKesAdapterResult(
  input: BuildTelemetryLearningKesAdapterInput,
): Promise<TelemetryLearningKesAdapterResult> {
  const action = normalizeAction(input.action ?? "plan");
  const packageRoot = path.resolve(input.packageRoot);
  const snapshotPath = path.resolve(input.snapshotPath);
  const metricKey = normalizeMetricKey(input.metric);
  const threshold = finiteNumber(input.threshold, "threshold");
  const comparison = normalizeComparison(input.comparison);
  const coveragePolicy = normalizeCoveragePolicy(input.coveragePolicy ?? "live-required");
  const minimumSampleSize = boundedCount(
    input.minimumSampleSize ?? DEFAULT_MINIMUM_SAMPLE_SIZE,
    "minimumSampleSize",
  );
  const minimumLiveEvents = boundedCount(
    input.minimumLiveEvents ?? DEFAULT_MINIMUM_LIVE_EVENTS,
    "minimumLiveEvents",
  );
  const candidateClaim = boundedText(input.candidateClaim, "candidateClaim", 2_000);
  const falsificationCondition = boundedText(
    input.falsificationCondition,
    "falsificationCondition",
    1_500,
  );
  const reviewTrigger = boundedText(input.reviewTrigger, "reviewTrigger", 1_000);
  const retirementSignal = boundedText(input.retirementSignal, "retirementSignal", 1_000);

  const loaded = await (input.loadSnapshot ?? loadTelemetryReviewSnapshot)(snapshotPath);
  const snapshot = telemetryReviewSnapshot(loaded);
  const metric = telemetryMetric(snapshot.metrics[metricKey], metricKey);
  if (metric.unit === "percent" && threshold > 100) {
    throw new Error("threshold cannot exceed 100 for a percentage metric");
  }

  const thresholdCrossed = compareThreshold(metric.value, threshold, comparison);
  const blockers: string[] = [];
  if (metric.sampleSize < minimumSampleSize) {
    blockers.push(
      `metric sample is insufficient (${metric.sampleSize} < ${minimumSampleSize})`,
    );
  }
  if (snapshot.coverage.totalEvents === 0) {
    blockers.push("snapshot coverage is empty");
  }
  if (
    coveragePolicy === "live-required" &&
    snapshot.coverage.liveEvents < minimumLiveEvents
  ) {
    blockers.push(
      `measured-live coverage is insufficient (${snapshot.coverage.liveEvents} < ${minimumLiveEvents})`,
    );
  }
  if (!thresholdCrossed) {
    blockers.push("the predeclared metric threshold was not crossed");
  }

  const snapshotEvidence = [
    `Snapshot: ${snapshot.schema} sha256:${snapshot.snapshotSha256}`,
    `Source event set: sha256:${snapshot.sourceEventSetSha256}`,
    `Window: ${snapshot.window.start} through ${snapshot.window.end} (${snapshot.window.days} days)` ,
    `Coverage: ${snapshot.coverage.mode}; total=${snapshot.coverage.totalEvents}; live=${snapshot.coverage.liveEvents}; backfill=${snapshot.coverage.backfillEvents}; unspecified=${snapshot.coverage.unspecifiedSourceEvents}`,
    `Metric: ${metricKey}=${metric.value} ${metric.unit}; sample=${metric.sampleSize}; trigger=${comparison} ${threshold}; crossed=${thresholdCrossed}`,
  ];

  const kesPlan = createKesArtifactPlan(packageRoot, {
    diary: {
      kind: "validation",
      summary: `Review telemetry signal ${metricKey}`,
      source: {
        kind: "manual",
        packageName: "pi-society-orchestrator",
        sessionId: input.sessionId,
        objective:
          "Review one digest-bound Pi telemetry observation without promoting it into evidence or doctrine authority.",
      },
      actions: [
        "Validated one pi.telemetry-review-snapshot.v1 artifact through the telemetry package contract.",
        `Evaluated the predeclared ${metricKey} trigger against its sample and source-coverage policy.`,
        "Prepared an owner-local candidate only; no Agent Kernel call or content promotion was performed.",
      ],
      surprises: thresholdCrossed
        ? [`The predeclared ${metricKey} threshold was crossed.`]
        : [`The predeclared ${metricKey} threshold was not crossed.`],
      patterns: [candidateClaim],
      candidateHints: blockers.length === 0 ? [candidateClaim] : [],
      followUps: [reviewTrigger, falsificationCondition, retirementSignal],
      metadata: {
        telemetry_snapshot_schema: snapshot.schema,
        telemetry_snapshot_sha256: snapshot.snapshotSha256,
        telemetry_source_event_set_sha256: snapshot.sourceEventSetSha256,
        telemetry_metric: metricKey,
        telemetry_threshold_crossed: thresholdCrossed,
        telemetry_review_blockers: blockers,
      },
      timestamp: input.timestamp,
    },
    learningCandidate: {
      kind: "learning",
      summary: `Telemetry candidate for ${metricKey}`,
      claim: candidateClaim,
      evidence: snapshotEvidence,
      heuristics: [
        "Treat the threshold as a review trigger, not as causality or claim verification.",
        "Preserve live, backfill, and unspecified coverage when comparing windows.",
      ],
      antiPatterns: [
        "Do not interpret missing, disabled, pruned, or partially backfilled telemetry as zero failures.",
        "Do not auto-promote a KES candidate into shared engineering content.",
      ],
      followUps: [
        `Falsification: ${falsificationCondition}`,
        `Review: ${reviewTrigger}`,
        `Retirement: ${retirementSignal}`,
      ],
      metadata: {
        telemetry_snapshot_schema: snapshot.schema,
        telemetry_snapshot_sha256: snapshot.snapshotSha256,
        telemetry_source_event_set_sha256: snapshot.sourceEventSetSha256,
        telemetry_metric: metricKey,
        telemetry_value: metric.value,
        telemetry_unit: metric.unit,
        telemetry_sample_size: metric.sampleSize,
        telemetry_threshold: threshold,
        telemetry_comparison: comparison,
        telemetry_coverage_policy: coveragePolicy,
        lifecycle_entry_stage: "proposal",
      },
    },
  });

  if (action === "materialize" && blockers.length > 0) {
    throw new Error(`telemetry KES materialization blocked: ${blockers.join("; ")}`);
  }
  if (action === "materialize") {
    materializeKesArtifactPlan(kesPlan, { acceptIdenticalExisting: true });
  }

  const akEvidenceHandoff: EvidenceEntry & { authorityCeiling: string } = {
    check_type: "pi-telemetry-review-snapshot-v1",
    result: "pass",
    details: {
      schema: snapshot.schema,
      snapshot_sha256: snapshot.snapshotSha256,
      source_event_set_sha256: snapshot.sourceEventSetSha256,
      producer_version: snapshot.producer.packageVersion,
      window: snapshot.window,
      coverage: snapshot.coverage,
      selected_metric: {
        key: metricKey,
        ...metric,
        threshold,
        comparison,
        threshold_crossed: thresholdCrossed,
      },
      review_ready: blockers.length === 0,
      review_blockers: blockers,
      authority_ceiling:
        "pass records snapshot schema/digest validation only; it does not verify causality, the candidate claim, KES acceptance, or promotion readiness",
    },
    authorityCeiling:
      "The handoff is inert. A separate authorized AK operation may record it; result=pass means only that the snapshot contract and digest were validated.",
  };

  return {
    kind: TELEMETRY_LEARNING_KES_ADAPTER_KIND,
    action,
    status: action === "materialize" ? "materialized" : "planned",
    packageRoot,
    snapshot: {
      path: snapshotPath,
      schema: snapshot.schema,
      digest: snapshot.snapshotSha256,
      sourceEventSetDigest: snapshot.sourceEventSetSha256,
      producerVersion: snapshot.producer.packageVersion,
      generatedAt: snapshot.generatedAt,
      window: snapshot.window,
      coverage: snapshot.coverage,
      nonclaims: [...snapshot.nonclaims],
    },
    review: {
      metric: metricKey,
      value: metric.value,
      unit: metric.unit,
      sampleSize: metric.sampleSize,
      threshold,
      comparison,
      thresholdCrossed,
      coveragePolicy,
      minimumSampleSize,
      minimumLiveEvents,
      blockers,
    },
    akEvidenceHandoff,
    kesPlan,
    writtenArtifacts:
      action === "materialize"
        ? [kesPlan.diary.relativePath, kesPlan.learningCandidate?.relativePath].filter(
            (value): value is string => Boolean(value),
          )
        : [],
    effect: {
      telemetryMutated: false,
      akCalled: false,
      externalAuthorityMutated: false,
      promotionStateChanged: false,
      kesArtifactsWritten: action === "materialize",
    },
    boundary: ADAPTER_BOUNDARY,
  };
}

export async function loadTelemetryReviewSnapshot(snapshotPath: string): Promise<unknown> {
  let loaded: unknown;
  try {
    loaded = await import(TELEMETRY_REVIEW_MODULE);
  } catch (error) {
    throw new Error(
      `telemetry review support is unavailable; install or link @tryinget/pi-telemetry and keep the integration explicit (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const module = loaded as { loadTelemetryReviewSnapshot?: (value: string) => Promise<unknown> };
  if (typeof module.loadTelemetryReviewSnapshot !== "function") {
    throw new Error("@tryinget/pi-telemetry does not export loadTelemetryReviewSnapshot");
  }
  return module.loadTelemetryReviewSnapshot(snapshotPath);
}

function telemetryReviewSnapshot(value: unknown): TelemetryReviewSnapshot {
  const root = record(value, "telemetry review snapshot");
  if (root.schema !== TELEMETRY_REVIEW_SNAPSHOT_SCHEMA) {
    throw new Error("unsupported telemetry review snapshot schema");
  }
  const producer = record(root.producer, "snapshot producer");
  const window = record(root.window, "snapshot window");
  const coverage = record(root.coverage, "snapshot coverage");
  const metrics = record(root.metrics, "snapshot metrics");
  if (
    producer.package !== "@tryinget/pi-telemetry" ||
    typeof producer.packageVersion !== "string" ||
    producer.telemetrySchemaVersion !== 1 ||
    typeof root.generatedAt !== "string" ||
    typeof window.days !== "number" ||
    typeof window.start !== "string" ||
    typeof window.end !== "string" ||
    typeof coverage.mode !== "string" ||
    !Number.isSafeInteger(coverage.totalEvents) ||
    !Number.isSafeInteger(coverage.liveEvents) ||
    !Number.isSafeInteger(coverage.backfillEvents) ||
    !Number.isSafeInteger(coverage.unspecifiedSourceEvents) ||
    !Array.isArray(coverage.limitations) ||
    !Array.isArray(root.nonclaims) ||
    typeof root.sourceEventSetSha256 !== "string" ||
    !SHA256_PATTERN.test(root.sourceEventSetSha256) ||
    typeof root.snapshotSha256 !== "string" ||
    !SHA256_PATTERN.test(root.snapshotSha256)
  ) {
    throw new Error("telemetry review snapshot is missing required validated fields");
  }
  for (const metricKey of TELEMETRY_REVIEW_METRIC_KEYS) telemetryMetric(metrics[metricKey], metricKey);
  return root as unknown as TelemetryReviewSnapshot;
}

function telemetryMetric(value: unknown, key: string): TelemetryReviewMetric {
  const metric = record(value, `telemetry metric ${key}`);
  if (
    typeof metric.value !== "number" ||
    !Number.isFinite(metric.value) ||
    (metric.unit !== "count" && metric.unit !== "percent") ||
    !Number.isSafeInteger(metric.sampleSize) ||
    Number(metric.sampleSize) < 0
  ) {
    throw new Error(`telemetry metric ${key} is invalid`);
  }
  return metric as unknown as TelemetryReviewMetric;
}

function normalizeAction(value: string): TelemetryLearningKesAdapterAction {
  if (value !== "plan" && value !== "materialize") throw new Error("invalid adapter action");
  return value;
}

function normalizeMetricKey(value: string): TelemetryReviewMetricKey {
  if (!(TELEMETRY_REVIEW_METRIC_KEYS as readonly string[]).includes(value)) {
    throw new Error("unsupported telemetry review metric");
  }
  return value as TelemetryReviewMetricKey;
}

function normalizeComparison(value: string): TelemetryThresholdComparison {
  if (
    value !== "above" &&
    value !== "at-or-above" &&
    value !== "below" &&
    value !== "at-or-below"
  ) {
    throw new Error("invalid telemetry threshold comparison");
  }
  return value;
}

function normalizeCoveragePolicy(value: string): TelemetryCoveragePolicy {
  if (value !== "live-required" && value !== "any-observed") {
    throw new Error("invalid telemetry coverage policy");
  }
  return value;
}

function compareThreshold(
  value: number,
  threshold: number,
  comparison: TelemetryThresholdComparison,
): boolean {
  if (comparison === "above") return value > threshold;
  if (comparison === "at-or-above") return value >= threshold;
  if (comparison === "below") return value < threshold;
  return value <= threshold;
}

function boundedCount(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_POLICY_COUNT) {
    throw new Error(`${field} must be a non-negative safe integer no greater than ${MAX_POLICY_COUNT}`);
  }
  return Number(value);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function boundedText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxChars || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${field} is empty, oversized, or contains control characters`);
  }
  return normalized;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
