#!/usr/bin/env node
/**
 * Deterministic, synthetic dogfood for the telemetry -> owner-local KES boundary.
 *
 * This script does not read live telemetry, call Agent Kernel, or mutate tracked
 * repository state. It exercises one supporting case, one falsifying case, and
 * one insufficient-evidence case in temporary package roots.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTelemetryLearningKesAdapterResult,
  TELEMETRY_REVIEW_METRIC_KEYS,
} from "../src/runtime/telemetry-learning-kes-adapter.ts";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OUTPUT_SCHEMA = "pi.telemetry-kes-dogfood.v1";
const FIXED_REVISION = "f".repeat(40);
const FIXED_GENERATED_AT = "2026-07-28T12:00:00.000Z";
const FIXED_SNAPSHOT_PATH = "/synthetic/pi-telemetry-review-snapshot-v1.json";

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function dogfoodMetric(value, unit, sampleSize) {
  return {
    value,
    unit,
    sampleSize,
    numerator: unit === "percent" ? Math.round((value / 100) * sampleSize) : null,
    denominator: unit === "percent" ? sampleSize : null,
  };
}

function makeSnapshot() {
  const metrics = Object.fromEntries(
    TELEMETRY_REVIEW_METRIC_KEYS.map((key) => [key, dogfoodMetric(0, "percent", 100)]),
  );
  metrics.total_events = dogfoodMetric(100, "count", 100);
  metrics.subagent_failure_rate_pct = dogfoodMetric(20, "percent", 100);
  return {
    schema: "pi.telemetry-review-snapshot.v1",
    producer: {
      package: "@tryinget/pi-telemetry",
      packageVersion: "0.3.0",
      telemetrySchemaVersion: 1,
    },
    generatedAt: FIXED_GENERATED_AT,
    window: {
      days: 7,
      start: "2026-07-21T12:00:00.000Z",
      end: FIXED_GENERATED_AT,
    },
    coverage: {
      mode: "live-only",
      totalEvents: 100,
      liveEvents: 100,
      backfillEvents: 0,
      unspecifiedSourceEvents: 0,
      limitations: [],
    },
    metrics,
    sourceEventSetSha256: "a".repeat(64),
    snapshotSha256: "b".repeat(64),
    nonclaims: [
      "This snapshot is observational only.",
      "It does not establish causality.",
      "Missing events are not zero failures.",
    ],
  };
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Unexpected non-file dogfood output: ${absolute}`);
    }
  };
  visit(root);
  return files;
}

function fileEvidence(root) {
  return listFiles(root).map((absolute) => ({
    path: path.relative(root, absolute).replaceAll(path.sep, "/"),
    sha256: sha256Text(fs.readFileSync(absolute)),
  }));
}

function adapterInput({ snapshot, packageRoot, action, threshold, minimumSampleSize }) {
  return {
    snapshotPath: FIXED_SNAPSHOT_PATH,
    subject: "pi-society-orchestrator/subagent-throughput",
    subjectRevision: FIXED_REVISION,
    configurationRef: "config://pi-society-orchestrator/telemetry-kes-dogfood-v1",
    metric: "subagent_failure_rate_pct",
    comparison: "at-or-above",
    threshold,
    minimumSampleSize,
    coveragePolicy: "live-required",
    minimumLiveEvents: 25,
    candidateClaim:
      "Subagent failure rates at or above the declared threshold justify an owner-reviewed KES proposal.",
    falsificationCondition:
      "Reject or retire the proposal when a representative review window remains below the threshold.",
    reviewTrigger:
      "Review after two comparable windows or whenever the profile/runtime configuration changes.",
    retirementSignal:
      "Retire when the failure mode disappears or a lower-complexity rule produces equal or better outcomes.",
    packageRoot,
    action,
    loadSnapshot: async () => snapshot,
  };
}

function summarizeResult(id, expectedDisposition, result, outputs) {
  return {
    id,
    expectedDisposition,
    status: result.status,
    review: {
      observedValue: result.review.value,
      sampleSize: result.review.sampleSize,
      thresholdCrossed: result.review.thresholdCrossed,
      // Derived from adapter evidence: the adapter reports raw inputs and
      // blockers, not pre-baked sufficiency flags.
      sampleSufficient:
        result.review.sampleSize >= result.review.minimumSampleSize &&
        !result.review.blockers.some((blocker) => blocker.includes("sample is insufficient")),
      liveCoverageSufficient:
        result.snapshot.coverage.liveEvents >= result.review.minimumLiveEvents,
      blockerCount: result.review.blockers.length,
    },
    materializedFiles: outputs,
    authority: {
      kesStage: "proposal",
      agentKernelMutation: false,
      engineeringContentPromotion: false,
    },
  };
}

async function runCase({ id, expectedDisposition, action, threshold, minimumSampleSize }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `pi-telemetry-kes-${id}-`));
  try {
    const packageRoot = path.join(root, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    const snapshot = makeSnapshot();
    const result = await buildTelemetryLearningKesAdapterResult(
      adapterInput({ snapshot, packageRoot, action, threshold, minimumSampleSize }),
    );
    return summarizeResult(id, expectedDisposition, result, fileEvidence(packageRoot));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export async function runTelemetryKesLifecycleDogfood() {
  const cases = [
    await runCase({
      id: "supporting",
      expectedDisposition: "candidate-materialized",
      action: "materialize",
      threshold: 15,
      minimumSampleSize: 50,
    }),
    await runCase({
      id: "falsifying",
      expectedDisposition: "proposal-blocked-by-counterevidence",
      action: "plan",
      threshold: 30,
      minimumSampleSize: 50,
    }),
    await runCase({
      id: "insufficient-evidence",
      expectedDisposition: "proposal-blocked-by-sample-size",
      action: "plan",
      threshold: 15,
      minimumSampleSize: 101,
    }),
  ];

  return {
    schema: OUTPUT_SCHEMA,
    fixture: {
      synthetic: true,
      generatedAt: FIXED_GENERATED_AT,
      subjectRevision: FIXED_REVISION,
      telemetrySnapshotSchema: "pi.telemetry-review-snapshot.v1",
      adapterSchema: "pi-society-orchestrator.telemetry_learning_kes_adapter.v1",
      metric: "subagent_failure_rate_pct",
      observedValue: 20,
      sampleDomain: "subagent-throughput-total",
    },
    cases,
    boundaries: {
      claims: [
        "The real telemetry-to-KES adapter was exercised against bounded deterministic fixtures.",
        "Only the supporting case materialized owner-local KES files in a temporary root.",
      ],
      nonclaims: [
        "The fixtures are not live operational evidence.",
        "No Agent Kernel record, ontology change, or engineering-content promotion occurred.",
        "A KES candidate remains a proposal requiring owner review.",
      ],
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.stdout.write(canonicalJson(await runTelemetryKesLifecycleDogfood()));
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }
}
