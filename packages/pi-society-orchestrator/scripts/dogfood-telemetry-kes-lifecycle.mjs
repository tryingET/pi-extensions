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

import { buildTelemetryLearningKesAdapterResult } from "../src/runtime/telemetry-learning-kes-adapter.ts";

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

function makeSnapshot() {
  return {
    schema: "pi.telemetry-review-snapshot.v1",
    producer: {
      package: "@tryinget/pi-telemetry",
      version: "0.3.0",
    },
    generatedAt: FIXED_GENERATED_AT,
    window: {
      start: "2026-07-21T12:00:00.000Z",
      end: FIXED_GENERATED_AT,
      requestedDays: 7,
      retentionDays: 30,
    },
    source: {
      eventPath: "~/.pi/agent/telemetry/events.ndjson",
      aggregatePath: "~/.pi/agent/telemetry/aggregates.json",
    },
    coverage: {
      eventCount: 100,
      liveEventCount: 100,
      backfillEventCount: 0,
      unspecifiedEventCount: 0,
      sourceMode: "live-only",
      partialHistory: false,
      limitations: [],
    },
    metrics: {
      topTools: [],
      topSkills: [],
      compaction: {
        validated: 10,
        fallback: 2,
        repair: 1,
        omittedToolOutputs: 0,
        omittedTokens: 0,
        evidenceAnchorCount: 10,
        zeroEvidenceRecallCount: 0,
        totalCompactedMessages: 20,
        avgCompactionDurationMs: 100,
        fallbackRatePct: 20,
        repairRatePct: 10,
        zeroEvidenceRecallRatePct: 0,
      },
      recall: {
        total: 10,
        hits: 9,
        directReference: 5,
        evidenceAnchor: 4,
        zeroHit: 1,
        degraded: 0,
        errors: 0,
        hitRatePct: 90,
        zeroHitRatePct: 10,
        degradedRatePct: 0,
      },
      followups: {
        total: 10,
        sent: 8,
        blocked: 2,
        blockedReasons: [],
        sentRatePct: 80,
        blockedRatePct: 20,
      },
      subagentThroughput: {
        total: 100,
        completed: 80,
        failed: 20,
        cancelled: 0,
        timedOut: 0,
        avgDurationMs: 1000,
        failureRatePct: 20,
        byProfile: [],
      },
    },
    sourceEventSetSha256: "a".repeat(64),
    sha256: "b".repeat(64),
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
    comparison: "gte",
    threshold,
    minimumSampleSize,
    requireLiveEvents: true,
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
      observedValue: result.review.observedValue,
      sampleSize: result.review.sampleSize,
      thresholdCrossed: result.review.thresholdCrossed,
      sampleSufficient: result.review.sampleSufficient,
      liveCoverageSufficient: result.review.liveCoverageSufficient,
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
