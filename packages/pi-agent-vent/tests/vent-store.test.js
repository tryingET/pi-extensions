import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendVentRecord,
  buildRecurrenceKey,
  createVentRecord,
  defaultStorePath,
  formatSummary,
  readVentRecords,
  redactSensitiveText,
  summarizeRecords,
} from "../src/vent-store.js";

test("defaultStorePath honors PI_AGENT_VENT_DIR", () => {
  assert.equal(
    defaultStorePath({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/vents.jsonl",
  );
});

test("createVentRecord minimizes, redacts, and derives recurrence key", () => {
  const record = createVentRecord(
    {
      category: "tool-failure",
      severity: "high",
      summary: "Bash retry keeps failing with token=abc123",
      frustration: "Same brittle flow; Authorization: Bearer abcdefghijklmnop should not leak.",
      tags: ["Tool Failure", "runtime"],
    },
    { id: "vent-1", now: "2026-05-21T00:00:00.000Z", cwd: "/repo", sessionFile: "session.jsonl" },
  );

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.category, "tool_failure");
  assert.equal(record.severity, "high");
  assert.equal(record.recurrenceKey, "tool_failure:bash-retry-keeps-failing-with-token-redacted");
  assert.equal(record.privacy.redacted, true);
  assert.match(record.summary, /token=\[REDACTED\]/);
  assert.match(record.frustration, /Bearer \[REDACTED\]/);
  assert.deepEqual(record.tags, ["tool-failure", "runtime"]);
});

test("redactSensitiveText catches common secret shapes", () => {
  const result = redactSensitiveText(
    "api_key=secret sk-abcdefghijklmnopqrstuvwxyz ghp_abcdefghijklmnopqrstuvwxyz",
  );
  assert.equal(result.redacted, true);
  assert.match(result.text, /api_key=\[REDACTED\]/);
  assert.match(result.text, /sk-\[REDACTED\]/);
  assert.match(result.text, /gh\*_REDACTED/);
});

test("append/read JSONL tolerates malformed old lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-"));
  const filePath = path.join(dir, "vents.jsonl");
  fs.writeFileSync(filePath, "{not-json}\n", "utf8");
  const record = createVentRecord(
    { summary: "Repeated docs mismatch", category: "documentation" },
    { id: "v1" },
  );
  appendVentRecord(filePath, record);

  const result = readVentRecords(filePath);
  assert.equal(result.malformedLines, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, "v1");
});

test("summary groups recurrence candidates without declaring incidents", () => {
  const records = [
    createVentRecord(
      {
        summary: "Reload drops registered tool",
        category: "bug",
        severity: "medium",
        recurrenceKey: "reload-tools",
      },
      { id: "a", now: "2026-05-21T00:00:00.000Z" },
    ),
    createVentRecord(
      {
        summary: "Reload drops registered tool again",
        category: "bug",
        severity: "high",
        recurrenceKey: "reload-tools",
      },
      { id: "b", now: "2026-05-21T00:01:00.000Z" },
    ),
  ];

  assert.equal(
    buildRecurrenceKey({ category: "bug", recurrenceKey: "reload-tools" }),
    "bug:reload-tools",
  );
  const summary = summarizeRecords(records);
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.candidateIncidentCount, 1);
  assert.equal(summary.groups[0].candidateIncident, true);
  assert.match(formatSummary(summary), /candidate incident/);
});

test("record requires non-empty summary", () => {
  assert.throws(() => createVentRecord({ summary: "   " }), /requires a non-empty summary/);
});
