/**
summary: "Vent store diagnostic state membrane; split from vent-store.test.js."
read_when:
  - "You change diagnostic state membrane behavior."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendVentRecord,
  assertCanCurateRecurrence,
  buildEscalationDraft,
  buildReviewComparison,
  createCurationEvent,
  createVentRecord,
  formatReviewComparison,
  loadDiagnosticState,
  MAX_JSONL_FILE_BYTES,
  MAX_JSONL_LINE_BYTES,
  readVentRecords,
  summarizeRecords,
} from "../src/vent-store.js";

test("diagnostic state membrane redacts legacy valid JSONL before draft/export/compare", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-legacy-secret-"));
  const storePath = path.join(dir, "vents.jsonl");
  fs.writeFileSync(
    storePath,
    `${JSON.stringify({
      id: "legacy-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      category: "bug",
      severity: "high",
      recurrenceKey: "bug:legacy-secret",
      summary: "Legacy unredacted payload",
      evidence: "password=hunter2",
      reproduction: "Bearer abcdefghijklmnop",
      tool: "tool token=abc123",
      tags: ["secret=tagged"],
      privacy: {
        classification: "local-diagnostic-user-data",
        redacted: false,
        redactionPatterns: [],
      },
    })}\n`,
    "utf8",
  );
  const state = loadDiagnosticState({ storePath, reviewPath: path.join(dir, "review.jsonl") });
  const draft = buildEscalationDraft({
    target: "github_issue",
    recurrenceKey: "bug:legacy-secret",
    records: state.records,
  });

  assert.equal(state.records[0].privacy.redacted, true);
  assert.deepEqual(state.records[0].tags, ["secret-redacted"]);
  assert.equal(state.records[0].tool, "tool-token-redacted");
  const comparisonText = formatReviewComparison(
    buildReviewComparison({ records: state.records, filters: { tool: "tool token=abc123" } }),
  );

  assert.match(draft.text, /password=\[REDACTED\]/);
  assert.match(draft.text, /Bearer \[REDACTED\]/);
  assert.match(comparisonText, /tool-token-redacted/);
  assert.doesNotMatch(`${draft.text}\n${comparisonText}`, /hunter2|abcdefghijklmnop|abc123/);
});

test("draft lookup is not constrained by display limits", () => {
  const records = [
    createVentRecord(
      { summary: "Low-ranked target", category: "documentation", recurrenceKey: "target-old" },
      { id: "target", now: "2026-01-01T00:00:00.000Z" },
    ),
    ...Array.from({ length: 120 }, (_, index) =>
      createVentRecord(
        {
          summary: `Higher ranked group ${index}`,
          category: "documentation",
          recurrenceKey: `higher-${index}`,
          severity: "critical",
        },
        { id: `v-${index}`, now: `2026-02-01T00:00:${String(index % 60).padStart(2, "0")}.000Z` },
      ),
    ),
  ];

  const draft = buildEscalationDraft({
    target: "github_issue",
    recurrenceKey: "documentation:target-old",
    records,
  });
  assert.equal(draft.recurrenceKey, "documentation:target-old");
});

test("diagnostic state quarantines semantic curation cycles", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-curation-cycle-"));
  const storePath = path.join(dir, "vents.jsonl");
  const curationPath = path.join(dir, "curation-events.jsonl");
  const a = createVentRecord({ summary: "A", category: "bug", recurrenceKey: "a" });
  const b = createVentRecord({ summary: "B", category: "bug", recurrenceKey: "b" });
  appendVentRecord(storePath, a);
  appendVentRecord(storePath, b);
  fs.writeFileSync(
    curationPath,
    `${JSON.stringify({ eventType: "recurrence_curation", action: "merge", sourceRecurrenceKey: a.recurrenceKey, targetRecurrenceKey: b.recurrenceKey })}\n${JSON.stringify({ eventType: "recurrence_curation", action: "merge", sourceRecurrenceKey: b.recurrenceKey, targetRecurrenceKey: a.recurrenceKey })}\n`,
    "utf8",
  );

  const state = loadDiagnosticState({ storePath, curationPath });
  assert.equal(state.quarantinedCurationEvents, 1);
  assert.doesNotThrow(() =>
    summarizeRecords(state.records, { curationEvents: state.curationEvents }),
  );
});

test("curation remove is append-only rollback", () => {
  const records = [
    createVentRecord({ summary: "A", category: "bug", recurrenceKey: "a" }, { id: "a" }),
    createVentRecord({ summary: "B", category: "bug", recurrenceKey: "b" }, { id: "b" }),
  ];
  const merge = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: "bug:a",
    targetRecurrenceKey: "bug:b",
  });
  assertCanCurateRecurrence(records, [merge], {
    action: "remove",
    sourceRecurrenceKey: "bug:a",
  });
  const remove = createCurationEvent({ action: "remove", sourceRecurrenceKey: "bug:a" });
  const summary = summarizeRecords(records, { curationEvents: [merge, remove] });
  assert.equal(summary.groupCount, 2);
});

test("diagnostic state membrane bounds file and line size", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-size-"));
  const linePath = path.join(dir, "oversized-line.jsonl");
  fs.writeFileSync(linePath, `${"x".repeat(MAX_JSONL_LINE_BYTES + 1)}\n`, "utf8");
  const lineResult = readVentRecords(linePath);
  assert.equal(lineResult.oversizedLines, 1);
  assert.equal(lineResult.records.length, 0);

  const filePath = path.join(dir, "oversized-file.jsonl");
  fs.writeFileSync(filePath, "x".repeat(MAX_JSONL_FILE_BYTES + 1), "utf8");
  assert.throws(() => readVentRecords(filePath), /store file is too large/);
});
