/**
summary: "Tests metadata-only compaction quality and recall telemetry contracts."
read_when:
  - "Changing quality event normalization or cross-package emitters."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { recordCompactionQualityTelemetry, recordCompactionRecallTelemetry } from "../src/emit.ts";
import {
  createCompactionQualityTelemetryEvent,
  createCompactionRecallTelemetryEvent,
} from "../src/quality.ts";

const SECRET = `sk-proj-${"A".repeat(40)}`;

test("quality event contains only allowlisted metadata and basename session identity", () => {
  const event = createCompactionQualityTelemetryEvent({
    mode: "deterministic_fallback_after_error",
    validationOk: true,
    summaryChars: 5_000.8,
    compactedMessages: 42,
    selectedMessages: 10,
    omittedMessages: -1,
    omittedManagedRecords: 3,
    omittedManagedBlocks: 2,
    continuityRecords: 8,
    evidenceAnchors: 5,
    worktreeVerified: true,
    sessionId: "/private/customer/sessions/session-42.jsonl",
    query: `do not record ${SECRET}`,
    cwd: "/private/customer/repo",
  });
  assert.equal(event.mode, "deterministic_fallback");
  assert.equal(event.fallback, true);
  assert.equal(event.summaryChars, 5_000);
  assert.equal(event.compactedMessages, 42);
  assert.equal(event.omittedMessages, 0);
  assert.equal(event.omittedManagedBlocks, 2);
  assert.equal(event.continuityRecords, 8);
  assert.equal(event.evidenceAnchors, 5);
  assert.equal(event.sessionId, "session-42.jsonl");
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /private|customer|sk-proj|query|cwd/u);
});

test("recall event records bounded result shape but never the query", () => {
  const event = createCompactionRecallTelemetryEvent({
    scope: "all",
    mode: "files",
    queryTokens: 12,
    sourceEntries: 500,
    sourceEntriesOmitted: 200,
    candidateCount: 300,
    totalHits: 40,
    hitCount: 5,
    page: 2,
    expandedCount: 1,
    directRefCount: 2,
    query: `find ${SECRET}`,
  });
  assert.equal(event.scopeWidened, true);
  assert.equal(event.mode, "files");
  assert.equal(event.hitCount, 5);
  assert.equal(event.sourceEntriesOmitted, 200);
  assert.equal(event.totalHits, 40);
  assert.equal(event.directRefCount, 2);
  assert.doesNotMatch(JSON.stringify(event), /find|sk-proj|do not record/u);
  assert.equal("query" in event, false);
});

test("quality emitters are best-effort and never break the owner", async () => {
  const append = async () => {
    throw new Error("telemetry disk unavailable");
  };
  await recordCompactionQualityTelemetry({ validationOk: true }, { append, dir: "/tmp/x" });
  await recordCompactionRecallTelemetry({ hitCount: 0 }, { append, dir: "/tmp/x" });
});
