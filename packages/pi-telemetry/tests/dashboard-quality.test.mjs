/**
summary: "Tests compaction quality and recall dashboard sections."
read_when:
  - "Changing telemetry dashboard quality/recall rendering."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTelemetryEvents } from "../src/aggregate.ts";
import { renderTelemetryDashboard } from "../src/dashboard.ts";

test("dashboard renders quality and recall aggregates without event payloads", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const summary = summarizeTelemetryEvents(
    [
      {
        v: 1,
        kind: "compaction_quality",
        ts: now,
        mode: "model",
        validationOk: true,
        fallback: false,
        repaired: false,
        splitTurn: false,
        summaryChars: 1000,
        compactedMessages: 10,
        selectedMessages: 8,
        omittedMessages: 2,
        omittedManagedRecords: 0,
        omittedManagedBlocks: 0,
        continuityRecords: 4,
        evidenceAnchors: 2,
        redactions: 1,
        truncatedRecords: 0,
        inputTokenBudget: 2000,
        finalTokenBudget: 500,
        worktreeVerified: true,
      },
      {
        v: 1,
        kind: "compaction_recall",
        ts: now,
        scope: "lineage",
        mode: "hybrid",
        queryTokens: 2,
        sourceEntries: 20,
        sourceEntriesOmitted: 0,
        candidateCount: 10,
        totalHits: 4,
        hitCount: 4,
        page: 1,
        expandedCount: 1,
        directRefCount: 1,
        scopeWidened: false,
      },
    ],
    7,
    now,
  );
  const html = renderTelemetryDashboard(summary, {
    generatedAt: now,
    windowDays: 7,
    sourceDir: "/tmp/telemetry",
  });
  assert.match(html, /id="compaction-quality"/u);
  assert.match(html, /message omission rate/u);
  assert.match(html, /id="recall"/u);
  assert.match(html, /avg direct refs/u);
  assert.match(html, /metadata only/u);
});
