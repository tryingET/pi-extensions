import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTelemetryReviewSnapshot,
  loadTelemetryReviewSnapshot,
  validateTelemetryReviewSnapshot,
  writeTelemetryReviewSnapshot,
} from "../src/review-snapshot.ts";

const now = Date.parse("2026-08-19T12:00:00.000Z");
const events = [
  { v: 1, kind: "tool_call", ts: now - 1000, tool: "bash", ok: false, source: "live" },
  { v: 1, kind: "subagent", ts: now - 2000, profile: "reviewer", ok: true, source: "live" },
  { v: 1, kind: "turn", ts: now - 3000, index: 1, source: "backfill" },
];
const summary = {
  windowDays: 7,
  totalEvents: 3,
  perKind: [
    { kind: "tool_call", n: 1 },
    { kind: "subagent", n: 1 },
    { kind: "turn", n: 1 },
  ],
  toolCalls: {
    total: 1,
    failed: 1,
    topFailing: [{ tool: "bash", n: 1, topError: "secret" }],
  },
  compaction: { total: 0, stalledAfterCompaction: 0, unresolvedBegins: 0, byReason: [] },
  compactionQuality: {
    total: 0,
    validationFailures: 0,
    fallbacks: 0,
    repairs: 0,
    messageOmissionRatePct: 0,
    totalCompactedMessages: 0,
  },
  recall: { total: 0, zeroHit: 0, degraded: 0, scopeWidened: 0 },
  vault: { total: 0, failed: 0 },
  compactionFailures: [],
  skills: [],
  followUps: { total: 0, blocked: 0, byBlockedReason: [] },
  subagents: {
    total: 1,
    failed: 0,
    byProfile: [{ profile: "reviewer", n: 1, failed: 0 }],
  },
};

function snapshot() {
  return buildTelemetryReviewSnapshot({ events, summary, windowDays: 7, generatedAt: now });
}

test("builds a deterministic bounded review snapshot", () => {
  const first = snapshot();
  const second = snapshot();
  assert.deepEqual(first, second);
  assert.equal(first.coverage.mode, "mixed");
  assert.equal(first.coverage.liveEvents, 2);
  assert.equal(first.coverage.backfillEvents, 1);
  assert.equal(first.metrics.tool_failure_rate_pct.value, 100);
  assert.equal(first.metrics.tool_failure_rate_pct.sampleSize, 1);
  assert.match(first.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(first), /sessionId|cwd|topError|secret/);
});

test("excludes session and cwd metadata from the source event-set digest", () => {
  const changedEvents = events.map((event, index) => ({
    ...event,
    sessionId: `different-session-${index}`,
    cwd: `/private/worktree/${index}`,
  }));
  const changed = buildTelemetryReviewSnapshot({
    events: changedEvents,
    summary,
    windowDays: 7,
    generatedAt: now,
  });
  assert.equal(changed.sourceEventSetSha256, snapshot().sourceEventSetSha256);
});

test("rejects tampered snapshots", () => {
  const changed = structuredClone(snapshot());
  changed.metrics.tool_failure_rate_pct.value = 0;
  assert.throws(() => validateTelemetryReviewSnapshot(changed), /digest mismatch/);
});

test("rejects internally inconsistent coverage with a recomputed digest", async () => {
  const changed = structuredClone(snapshot());
  changed.coverage.liveEvents = 1;
  assert.throws(() => validateTelemetryReviewSnapshot(changed), /coverage counts do not sum/);
});

test("writes and loads one digest-bound snapshot idempotently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-telemetry-review-"));
  const first = await writeTelemetryReviewSnapshot(root, snapshot());
  const second = await writeTelemetryReviewSnapshot(root, snapshot());
  assert.equal(first, second);
  assert.deepEqual(await loadTelemetryReviewSnapshot(first), snapshot());
  assert.equal((await readFile(first, "utf8")).endsWith("\n"), true);
});

test("does not follow a snapshot symlink on Linux", async (t) => {
  if (process.platform !== "linux") t.skip("O_NOFOLLOW proof is Linux-specific");
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-telemetry-review-link-"));
  const target = await writeTelemetryReviewSnapshot(root, snapshot());
  const link = path.join(root, "snapshot-link.json");
  await symlink(target, link);
  await assert.rejects(() => loadTelemetryReviewSnapshot(link));
});
