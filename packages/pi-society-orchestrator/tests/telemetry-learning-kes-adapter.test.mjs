import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import telemetryKesAdapterExtension from "../extensions/telemetry-kes-adapter.ts";
import {
  buildTelemetryLearningKesAdapterResult,
  TELEMETRY_REVIEW_METRIC_KEYS,
} from "../src/runtime/telemetry-learning-kes-adapter.ts";

const now = new Date("2026-08-19T12:00:00.000Z");
const subject = "tryingET/pi-extensions:pi-society-orchestrator";
const subjectRevision = "0123456789abcdef0123456789abcdef01234567";

function metric(value = 0, unit = "percent", sampleSize = 100) {
  return {
    value,
    unit,
    sampleSize,
    numerator: unit === "percent" ? Math.round((value / 100) * sampleSize) : null,
    denominator: unit === "percent" ? sampleSize : null,
  };
}

function snapshot(overrides = {}) {
  const metrics = Object.fromEntries(TELEMETRY_REVIEW_METRIC_KEYS.map((key) => [key, metric()]));
  metrics.total_events = metric(100, "count", 100);
  metrics.tool_failure_rate_pct = metric(20, "percent", 50);
  return {
    schema: "pi.telemetry-review-snapshot.v1",
    producer: {
      package: "@tryinget/pi-telemetry",
      packageVersion: "0.2.0",
      telemetrySchemaVersion: 1,
    },
    generatedAt: now.toISOString(),
    window: {
      days: 7,
      start: "2026-08-12T12:00:00.000Z",
      end: now.toISOString(),
    },
    coverage: {
      mode: "mixed",
      totalEvents: 100,
      liveEvents: 80,
      backfillEvents: 20,
      unspecifiedSourceEvents: 0,
      limitations: ["best-effort collection", "backfill is incomplete"],
    },
    metrics,
    sourceEventSetSha256: "a".repeat(64),
    nonclaims: [
      "This snapshot is observational only.",
      "It does not establish causality.",
      "Missing events are not zero failures.",
    ],
    snapshotSha256: "b".repeat(64),
    ...overrides,
  };
}

async function build(root, overrides = {}) {
  const { snapshot: fixture = snapshot(), ...inputOverrides } = overrides;
  return buildTelemetryLearningKesAdapterResult({
    packageRoot: root,
    snapshotPath: path.join(root, "telemetry-review.json"),
    subject,
    subjectRevision,
    configurationRef: "orchestrator-profile-v1",
    metric: "tool_failure_rate_pct",
    threshold: 10,
    comparison: "at-or-above",
    coveragePolicy: "live-required",
    minimumSampleSize: 20,
    minimumLiveEvents: 1,
    candidateClaim: "Repeated tool failures justify a bounded pilot of clearer recovery guidance.",
    falsificationCondition:
      "Reject or narrow the rule if representative pilot windows do not reduce tool failures.",
    reviewTrigger: "Review after two complete seven-day pilot windows.",
    retirementSignal: "Retire when the underlying tool failure mode no longer exists.",
    timestamp: now,
    loadSnapshot: async () => fixture,
    ...inputOverrides,
  });
}

test("registers the adapter without importing pi-telemetry at extension load time", () => {
  let registered;
  telemetryKesAdapterExtension({
    registerTool(tool) {
      registered = tool;
    },
  });
  assert.equal(registered.name, "telemetry_learning_kes_adapter");
  assert.equal(typeof registered.execute, "function");
  assert.equal(registered.parameters.required.includes("subject"), true);
  assert.equal(registered.parameters.required.includes("minimum_sample_size"), true);
  assert.equal(registered.parameters.required.includes("coverage_policy"), true);
});

test("plans a Proposal candidate without mutating KES, telemetry, AK, or promotion state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-plan-"));
  const result = await build(root);

  assert.equal(result.status, "planned");
  assert.deepEqual(result.review.blockers, []);
  assert.equal(result.review.thresholdCrossed, true);
  assert.equal(result.effect.kesArtifactsWritten, false);
  assert.equal(result.effect.telemetryMutated, false);
  assert.equal(result.effect.akCalled, false);
  assert.equal(result.effect.promotionStateChanged, false);
  assert.equal(result.subject.id, subject);
  assert.equal(result.subject.revision, subjectRevision);
  assert.equal(result.snapshot.fileName, "telemetry-review.json");
  assert.equal(result.kesPlan.learningCandidate.metadata.lifecycle_entry_stage, "proposal");
  assert.equal(result.kesPlan.learningCandidate.metadata.subject_revision, subjectRevision);
  assert.equal(result.akEvidenceHandoff.result, "pass");
  assert.equal(result.akEvidenceHandoff.details.subject, subject);
  assert.match(result.akEvidenceHandoff.authorityCeiling, /snapshot contract and digest/);
  assert.doesNotMatch(result.kesPlan.learningCandidate.content, /telemetry-review\.json|\/tmp\//);
  await assert.rejects(() => readdir(path.join(root, "diary")));
});

test("materializes exactly one owner-local diary and one candidate after all gates pass", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-write-"));
  const result = await build(root, { action: "materialize" });

  assert.equal(result.status, "materialized");
  assert.equal(result.effect.kesArtifactsWritten, true);
  assert.equal(result.writtenArtifacts.length, 2);
  assert.equal((await readdir(path.join(root, "diary"))).length, 1);
  assert.equal((await readdir(path.join(root, "docs", "learnings"))).length, 1);
});

test("fails closed when the metric sample is insufficient", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-sample-"));
  await assert.rejects(
    () => build(root, { action: "materialize", minimumSampleSize: 51 }),
    /metric sample is insufficient/,
  );
});

test("fails closed when the predeclared threshold is not crossed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-threshold-"));
  await assert.rejects(
    () => build(root, { action: "materialize", threshold: 30 }),
    /threshold was not crossed/,
  );
});

test("requires live coverage by explicit policy and accepts backfill only with explicit zero-live policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-coverage-"));
  const backfillOnly = snapshot({
    coverage: {
      mode: "backfill-only",
      totalEvents: 100,
      liveEvents: 0,
      backfillEvents: 100,
      unspecifiedSourceEvents: 0,
      limitations: ["derived coverage", "no measured-live events"],
    },
  });

  await assert.rejects(
    () => build(root, { action: "materialize", snapshot: backfillOnly }),
    /measured-live coverage is insufficient/,
  );
  const accepted = await build(root, {
    action: "plan",
    snapshot: backfillOnly,
    coveragePolicy: "any-observed",
    minimumLiveEvents: 0,
  });
  assert.deepEqual(accepted.review.blockers, []);
  assert.equal(accepted.review.coveragePolicy, "any-observed");
});

test("rejects contradictory source policy instead of applying a hidden default", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-policy-"));
  await assert.rejects(
    () => build(root, { coveragePolicy: "live-required", minimumLiveEvents: 0 }),
    /must be at least 1/,
  );
  await assert.rejects(
    () => build(root, { coveragePolicy: "any-observed", minimumLiveEvents: 1 }),
    /must be 0/,
  );
});

test("the AK handoff records artifact validation and subject lineage, not claim truth", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "telemetry-kes-ak-"));
  const result = await build(root);
  assert.equal(result.akEvidenceHandoff.check_type, "pi-telemetry-review-snapshot-v1");
  assert.equal(result.akEvidenceHandoff.details.subject_revision, subjectRevision);
  assert.equal(result.akEvidenceHandoff.details.review_ready, true);
  assert.match(result.akEvidenceHandoff.details.authority_ceiling, /does not verify causality/);
  assert.equal(result.effect.akCalled, false);
});
