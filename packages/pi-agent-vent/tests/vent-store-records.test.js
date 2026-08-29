/**
summary: "Vent store record creation, redaction, JSONL append/read, review queue, and store safety; split from vent-store.test.js."
read_when:
  - "You change record creation, redaction, JSONL append/read, review queue, and store safety behavior."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendReviewEvent,
  appendVentRecord,
  buildRecurrenceKey,
  createReviewEvent,
  createVentRecord,
  defaultBackupDir,
  defaultCurationPath,
  defaultRetentionPath,
  defaultReviewPath,
  defaultStorePath,
  formatReviewQueue,
  formatSummary,
  readReviewEvents,
  readVentRecords,
  redactSensitiveText,
  summarizeRecords,
  summarizeReviewQueue,
} from "../src/vent-store.js";

test("default store and lifecycle paths honor PI_AGENT_VENT_DIR", () => {
  assert.equal(
    defaultStorePath({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/vents.jsonl",
  );
  assert.equal(
    defaultReviewPath({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/review-events.jsonl",
  );
  assert.equal(
    defaultCurationPath({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/curation-events.jsonl",
  );
  assert.equal(
    defaultRetentionPath({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/retention-events.jsonl",
  );
  assert.equal(
    defaultBackupDir({ PI_AGENT_VENT_DIR: "/tmp/private-vents" }),
    "/tmp/private-vents/backups",
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
      tool: "bash token=abc123",
      packageName: "@tryinget/pi-agent-vent secret=hidden",
    },
    { id: "vent-1", now: "2026-05-21T00:00:00.000Z", cwd: "/repo", sessionFile: "session.jsonl" },
  );

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.category, "tool_failure");
  assert.equal(record.severity, "high");
  assert.equal(record.recurrenceKey, "tool_failure:bash-retry-keeps-failing-with-token-redacted");
  assert.equal(record.tool, "bash-token-redacted");
  assert.equal(record.packageName, "tryinget-pi-agent-vent-secret-redacted");
  assert.equal(record.privacy.redacted, true);
  assert.match(record.summary, /token=\[REDACTED\]/);
  assert.match(record.frustration, /Bearer \[REDACTED\]/);
  assert.deepEqual(record.tags, ["tool-failure", "runtime"]);

  const tagOnlySecret = createVentRecord({
    summary: "Tag-only secret must update privacy metadata",
    tags: ["token=abc123"],
  });
  assert.deepEqual(tagOnlySecret.tags, ["token-redacted"]);
  assert.equal(tagOnlySecret.privacy.redacted, true);
  assert.deepEqual(tagOnlySecret.privacy.redactionPatterns, ["assigned_secret"]);
});

test("category aliases normalize at record and review-filter boundaries", () => {
  const workflow = createVentRecord({
    summary: "Workflow alias should not degrade",
    category: "workflow_friction",
    recurrenceKey: "workflow alias",
  });
  const missing = createVentRecord({
    summary: "Missing affordance alias should preserve meaning",
    category: "missing_affordance",
  });
  const alignment = createVentRecord({
    summary: "Context alignment candidate should remain callable",
    category: "context_alignment",
  });

  assert.equal(workflow.category, "workflow");
  assert.equal(workflow.recurrenceKey, "workflow:workflow-alias");
  assert.equal(missing.category, "missing_capability");
  assert.match(missing.recurrenceKey, /^missing_capability:/);
  assert.equal(alignment.category, "other");
  assert.match(alignment.recurrenceKey, /^other:/);

  const queue = summarizeReviewQueue([workflow, missing, alignment], [], {
    filters: { category: "workflow_friction" },
  });
  assert.equal(queue.filters.category, "workflow");
  assert.equal(queue.matchingGroupCount, 1);
  assert.equal(queue.items[0].recurrenceKey, workflow.recurrenceKey);

  const alignmentQueue = summarizeReviewQueue([workflow, missing, alignment], [], {
    filters: { category: "context_alignment" },
  });
  assert.equal(alignmentQueue.filters.category, "other");
  assert.equal(alignmentQueue.matchingGroupCount, 1);
  assert.equal(alignmentQueue.items[0].recurrenceKey, alignment.recurrenceKey);
});

test("explicit recurrence keys are redacted before slugging", () => {
  const record = createVentRecord({
    summary: "Explicit key should not leak",
    category: "bug",
    recurrenceKey: "reload token=abc123",
  });

  assert.equal(record.recurrenceKey, "bug:reload-token-redacted");
  assert.doesNotMatch(record.recurrenceKey, /abc123/);
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

test("review events are append-only local state projections", () => {
  const records = [
    createVentRecord(
      {
        summary: "Reload drops registered tool",
        category: "bug",
        severity: "high",
        recurrenceKey: "reload-tools",
      },
      { id: "a", now: "2026-05-21T00:00:00.000Z" },
    ),
  ];
  const acknowledged = createReviewEvent(
    {
      recurrenceKey: "bug:reload-tools",
      state: "acknowledged",
      note: "Operator saw token=abc123 and will inspect later",
    },
    { id: "r1", now: "2026-05-21T00:02:00.000Z" },
  );
  const reset = createReviewEvent(
    { recurrenceKey: "bug:reload-tools", state: "new" },
    { id: "r2", now: "2026-05-21T00:03:00.000Z" },
  );

  assert.equal(acknowledged.privacy.redacted, true);
  assert.match(acknowledged.note, /token=\[REDACTED\]/);

  const queue = summarizeReviewQueue(records, [acknowledged, reset]);
  assert.equal(queue.queueCount, 1);
  assert.equal(queue.items[0].reviewState, "new");
  assert.match(formatReviewQueue(queue), /local diagnostic state only/);
});

test("review events fail closed on invalid state and clamp huge notes", () => {
  assert.throws(
    () => createReviewEvent({ recurrenceKey: "bug:bad-state", state: "resolved" }),
    /invalid agent_vent review state/,
  );

  const event = createReviewEvent({
    recurrenceKey: "bug:huge-note",
    state: "acknowledged",
    note: "x".repeat(5000),
  });
  assert.equal(event.note.length, 1200);
  assert.match(event.note, /…$/);
});

test("dismissed recurrence groups leave the default active review queue", () => {
  const records = [
    createVentRecord(
      { summary: "Noisy one-off", category: "workflow", recurrenceKey: "noisy-one-off" },
      { id: "v1" },
    ),
  ];
  const event = createReviewEvent({ recurrenceKey: "workflow:noisy-one-off", state: "dismissed" });

  assert.equal(summarizeReviewQueue(records, [event]).queueCount, 0);
  assert.equal(summarizeReviewQueue(records, [event], { state: "dismissed" }).queueCount, 1);
  assert.equal(summarizeReviewQueue(records, [event], { state: "all" }).queueCount, 1);
});

test("review JSONL tolerates malformed lines and records latest state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-review-"));
  const filePath = path.join(dir, "review-events.jsonl");
  fs.writeFileSync(filePath, "{not-json}\n", "utf8");
  appendReviewEvent(
    filePath,
    createReviewEvent({ recurrenceKey: "bug:reload-tools", state: "acknowledged" }, { id: "r1" }),
  );

  const result = readReviewEvents(filePath);
  assert.equal(result.malformedLines, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].state, "acknowledged");
});

test("JSONL store files fail closed when replaced by symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-symlink-"));
  const target = path.join(dir, "target.jsonl");
  const link = path.join(dir, "vents.jsonl");
  fs.writeFileSync(target, "", "utf8");
  fs.symlinkSync(target, link);

  assert.throws(
    () => appendVentRecord(link, createVentRecord({ summary: "Symlink escape", category: "bug" })),
    /must not be a symlink/,
  );
  assert.throws(() => readVentRecords(link), /must not be a symlink|ELOOP/);
});

test("JSONL write permission failures propagate instead of pretending success", (context) => {
  if (process.getuid?.() === 0) {
    context.skip("root can bypass directory write permissions");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-permission-"));
  const filePath = path.join(dir, "vents.jsonl");
  fs.chmodSync(dir, 0o500);
  try {
    assert.throws(
      () => appendVentRecord(filePath, createVentRecord({ summary: "Permission failure" })),
      /EACCES|EPERM/,
    );
  } finally {
    fs.chmodSync(dir, 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
