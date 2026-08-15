/**
 * Tests for telemetry aggregation and the dashboard renderer.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { STALL_THRESHOLD_MS, summarizeTelemetryEvents } from "../src/aggregate.ts";
import { renderTelemetryDashboard } from "../src/dashboard.ts";

const MIN = 60 * 1000;

function events() {
  const t0 = Date.parse("2026-08-15T08:00:00.000Z");
  return [
    { v: 1, kind: "turn", ts: t0 - 20 * MIN, index: 0, sessionId: "s1" },
    {
      v: 1,
      kind: "tool_call",
      ts: t0 - 15 * MIN,
      tool: "bash",
      ok: true,
      durationMs: 100,
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "tool_call",
      ts: t0 - 14 * MIN,
      tool: "bash",
      ok: false,
      durationMs: 50,
      errorSignature: "boom N",
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "vault_query",
      ts: t0 - 10 * MIN,
      tool: "vault_query",
      ok: true,
      durationMs: 200,
      sessionId: "s1",
    },
    { v: 1, kind: "skill_load", ts: t0 - 9 * MIN, skill: "refactorops", sessionId: "s1" },
    {
      v: 1,
      kind: "follow_up",
      ts: t0 - 8 * MIN,
      sent: true,
      dispatchMode: "agent_continuation",
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "follow_up",
      ts: t0 - 7 * MIN,
      sent: false,
      dispatchMode: "agent_continuation",
      blockedReason: "self_driving_budget_exhausted",
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "subagent",
      ts: t0 - 5 * MIN,
      profile: "reviewer",
      ok: true,
      durationMs: 5000,
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "compaction_begin",
      ts: t0 - 4 * MIN,
      reason: "threshold",
      willRetry: false,
      sessionId: "s1",
    },
    {
      v: 1,
      kind: "compaction",
      ts: t0 - 3 * MIN,
      reason: "threshold",
      willRetry: false,
      fromExtension: true,
      tokensBefore: 200000,
      summaryChars: 30000,
      sessionId: "s1",
    },
    { v: 1, kind: "turn", ts: t0 - 2 * MIN, index: 1, sessionId: "s1" },
    // A second compaction in another session with no following turn: stalled.
    {
      v: 1,
      kind: "compaction",
      ts: t0 - 60 * MIN,
      reason: "threshold",
      willRetry: false,
      fromExtension: false,
      summaryChars: 20000,
      sessionId: "s2",
    },
  ];
}

test("aggregate: counts kinds, tools, failures, and compaction stats", () => {
  const summary = summarizeTelemetryEvents(events(), 7);
  assert.equal(summary.totalEvents, 12);
  assert.equal(summary.toolCalls.total, 2);
  assert.equal(summary.toolCalls.failed, 1);
  assert.equal(summary.compaction.total, 2);
  assert.equal(summary.compaction.avgSummaryChars, 25000);
  assert.equal(summary.compaction.maxSummaryChars, 30000);
  assert.equal(summary.vault.total, 1);
  assert.equal(summary.followUps.sent, 1);
  assert.equal(summary.followUps.blocked, 1);
  assert.equal(summary.subagents.byProfile[0].profile, "reviewer");
});

test("aggregate: compaction without a following turn counts as stalled", () => {
  const summary = summarizeTelemetryEvents(events(), 7);
  assert.equal(summary.compaction.stalledAfterCompaction, 1);
});

test("aggregate: unresolved compaction begin counts as failed or aborted", () => {
  const t0 = Date.parse("2026-08-15T08:00:00.000Z");
  const withLonelyBegin = [
    ...events(),
    {
      v: 1,
      kind: "compaction_begin",
      ts: t0 - 30 * MIN,
      reason: "threshold",
      willRetry: false,
      sessionId: "s3",
    },
  ];
  const summary = summarizeTelemetryEvents(withLonelyBegin, 7, t0);
  assert.ok(summary.compaction.unresolvedBegins >= 1);
});

test("aggregate: resumed compaction within the stall threshold is not stalled", () => {
  const t0 = Date.now();
  const resumed = [
    {
      v: 1,
      kind: "compaction",
      ts: t0 - STALL_THRESHOLD_MS / 2,
      reason: "threshold",
      willRetry: false,
      fromExtension: false,
      sessionId: "s1",
    },
    { v: 1, kind: "turn", ts: t0 - 1000, index: 1, sessionId: "s1" },
  ];
  const summary = summarizeTelemetryEvents(resumed, 7);
  assert.equal(summary.compaction.stalledAfterCompaction, 0);
});

test("dashboard: renders self-contained HTML with all sections and no external assets", () => {
  const summary = summarizeTelemetryEvents(events(), 7);
  const html = renderTelemetryDashboard(summary, {
    generatedAt: Date.parse("2026-08-15T14:00:00.000Z"),
    windowDays: 7,
    sourceDir: "/home/x/.pi/agent/telemetry",
  });

  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(
    !/<script src=|<link [^>]*href=/.test(html),
    "dashboard must not reference external assets",
  );
  for (const id of ["compaction", "tools", "vault", "skills", "selfdriving", "subagents", "raw"]) {
    assert.ok(html.includes(`id="${id}"`), `missing section ${id}`);
  }
  assert.ok(html.includes("stalled after compaction") || html.includes("Stalled"));
  assert.ok(html.includes("refactorops"));
});
