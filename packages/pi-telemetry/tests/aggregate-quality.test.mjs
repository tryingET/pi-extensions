/**
summary: "Tests aggregation of compaction quality and recall metadata."
read_when:
  - "Changing telemetry quality aggregates."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTelemetryEvents } from "../src/aggregate.ts";

const t0 = Date.parse("2026-08-17T12:00:00.000Z");

test("aggregate reports quality, omission, worktree, and recall metrics", () => {
  const events = [
    {
      v: 1,
      kind: "compaction_quality",
      ts: t0,
      source: "live",
      mode: "model",
      validationOk: true,
      fallback: false,
      repaired: false,
      splitTurn: false,
      summaryChars: 4_000,
      compactedMessages: 30,
      selectedMessages: 20,
      omittedMessages: 10,
      omittedManagedRecords: 2,
      omittedManagedBlocks: 0,
      continuityRecords: 8,
      evidenceAnchors: 4,
      redactions: 1,
      truncatedRecords: 0,
      inputTokenBudget: 8_000,
      finalTokenBudget: 2_000,
      worktreeVerified: true,
      durationMs: 100,
    },
    {
      v: 1,
      kind: "compaction_quality",
      ts: t0 + 1,
      source: "live",
      mode: "deterministic_fallback",
      validationOk: false,
      fallback: true,
      repaired: true,
      splitTurn: true,
      summaryChars: 6_000,
      compactedMessages: 40,
      selectedMessages: 10,
      omittedMessages: 30,
      omittedManagedRecords: 4,
      omittedManagedBlocks: 2,
      continuityRecords: 6,
      evidenceAnchors: 2,
      redactions: 3,
      truncatedRecords: 2,
      inputTokenBudget: 8_000,
      finalTokenBudget: 2_000,
      worktreeVerified: false,
      durationMs: 300,
    },
    {
      v: 1,
      kind: "compaction_recall",
      ts: t0 + 2,
      source: "live",
      scope: "lineage",
      mode: "hybrid",
      queryTokens: 4,
      sourceEntries: 1_000,
      sourceEntriesOmitted: 100,
      candidateCount: 100,
      totalHits: 20,
      hitCount: 5,
      page: 1,
      expandedCount: 1,
      directRefCount: 1,
      scopeWidened: false,
      durationMs: 20,
    },
    {
      v: 1,
      kind: "compaction_recall",
      ts: t0 + 3,
      source: "live",
      scope: "degraded",
      mode: "files",
      queryTokens: 2,
      sourceEntries: 200,
      sourceEntriesOmitted: 0,
      candidateCount: 0,
      totalHits: 0,
      hitCount: 0,
      page: 1,
      expandedCount: 0,
      directRefCount: 0,
      scopeWidened: false,
      durationMs: 40,
    },
  ];
  const summary = summarizeTelemetryEvents(events, 7, t0 + 4);
  assert.equal(summary.compactionQuality.total, 2);
  assert.equal(summary.compactionQuality.fallbacks, 1);
  assert.equal(summary.compactionQuality.fallbackRatePct, 50);
  assert.equal(summary.compactionQuality.validationFailures, 1);
  assert.equal(summary.compactionQuality.validationFailureRatePct, 50);
  assert.equal(summary.compactionQuality.splitTurnRatePct, 50);
  assert.equal(summary.compactionQuality.worktreeVerifiedRatePct, 50);
  assert.equal(summary.compactionQuality.avgCompactedMessages, 35);
  assert.equal(summary.compactionQuality.avgSelectedMessages, 15);
  assert.equal(summary.compactionQuality.messageOmissionRatePct, 57.1);
  assert.equal(summary.compactionQuality.totalOmittedManagedRecords, 6);
  assert.equal(summary.compactionQuality.totalOmittedManagedBlocks, 2);
  assert.equal(summary.compactionQuality.avgContinuityRecords, 7);
  assert.equal(summary.compactionQuality.avgEvidenceAnchors, 3);
  assert.equal(summary.compactionQuality.avgDurationMs, 200);
  assert.equal(summary.compactionQuality.totalRedactions, 4);

  assert.equal(summary.recall.total, 2);
  assert.equal(summary.recall.hits, 5);
  assert.equal(summary.recall.totalRankedHits, 20);
  assert.equal(summary.recall.zeroHit, 1);
  assert.equal(summary.recall.zeroHitRatePct, 50);
  assert.equal(summary.recall.degraded, 1);
  assert.equal(summary.recall.degradedRatePct, 50);
  assert.equal(summary.recall.avgSourceEntries, 600);
  assert.equal(summary.recall.sourceOmissionRatePct, 8.3);
  assert.equal(summary.recall.avgDirectRefs, 0.5);
  assert.equal(summary.recall.avgDurationMs, 30);
});

test("aggregate tolerates historical quality events that predate optional fields", () => {
  const summary = summarizeTelemetryEvents(
    [
      {
        v: 1,
        kind: "compaction_quality",
        ts: t0,
        mode: "model",
        validationOk: true,
        fallback: false,
        repaired: false,
        splitTurn: false,
        summaryChars: 1_000,
        selectedMessages: 3,
        omittedMessages: 1,
        omittedManagedRecords: 0,
        redactions: 0,
        truncatedRecords: 0,
        inputTokenBudget: 100,
        finalTokenBudget: 50,
        worktreeVerified: false,
      },
    ],
    7,
    t0 + 1,
  );
  assert.equal(summary.compactionQuality.total, 1);
  assert.equal(summary.compactionQuality.avgCompactedMessages, 0);
  assert.equal(summary.compactionQuality.totalOmittedManagedBlocks, 0);
});
