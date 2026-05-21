import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendCurationEvent,
  appendReviewEvent,
  appendVentRecord,
  assertCanCurateRecurrence,
  buildEscalationDraft,
  buildLifecycleSnapshot,
  buildRecurrenceKey,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  DRAFT_TARGETS,
  defaultCurationPath,
  defaultReviewPath,
  defaultStorePath,
  formatExportJson,
  formatExportMarkdown,
  formatLifecycleStats,
  formatReviewQueue,
  formatSummary,
  readCurationEvents,
  readReviewEvents,
  readVentRecords,
  redactSensitiveText,
  summarizeRecords,
  summarizeReviewQueue,
} from "../src/vent-store.js";

test("default store and review paths honor PI_AGENT_VENT_DIR", () => {
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

test("curation events merge recurrence groups without rewriting source records", () => {
  const first = createVentRecord(
    { summary: "Reload drops tool", category: "bug", recurrenceKey: "reload-tool-a" },
    { id: "v1" },
  );
  const second = createVentRecord(
    { summary: "Reload loses tool", category: "bug", recurrenceKey: "reload-tool-b" },
    { id: "v2" },
  );
  const records = [first, second];
  const curation = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: second.recurrenceKey,
    targetRecurrenceKey: first.recurrenceKey,
    note: "same bug token=abc123",
  });
  assert.equal(curation.privacy.redacted, true);
  assert.match(curation.note, /token=\[REDACTED\]/);

  const summary = summarizeRecords(records, { curationEvents: [curation] });
  assert.equal(summary.groupCount, 1);
  assert.equal(summary.groups[0].count, 2);
  assert.equal(summary.groups[0].recurrenceKey, first.recurrenceKey);
  assert.equal(second.recurrenceKey, "bug:reload-tool-b");
});

test("curation fails closed for unknown source, self merge, and cycles", () => {
  const records = [
    createVentRecord({ summary: "Alpha", category: "bug", recurrenceKey: "alpha" }, { id: "v1" }),
    createVentRecord({ summary: "Beta", category: "bug", recurrenceKey: "beta" }, { id: "v2" }),
  ];
  assert.throws(
    () =>
      assertCanCurateRecurrence(records, [], {
        action: "merge",
        sourceRecurrenceKey: "bug:nope",
        targetRecurrenceKey: "bug:alpha",
      }),
    /unknown recurrence group/,
  );
  assert.throws(
    () =>
      createCurationEvent({
        action: "merge",
        sourceRecurrenceKey: "bug:alpha",
        targetRecurrenceKey: "bug:alpha",
      }),
    /source and target must differ/,
  );
  const first = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: "bug:alpha",
    targetRecurrenceKey: "bug:beta",
  });
  assert.throws(
    () =>
      assertCanCurateRecurrence(records, [first], {
        action: "merge",
        sourceRecurrenceKey: "bug:beta",
        targetRecurrenceKey: "bug:alpha",
      }),
    /cycle detected/,
  );
});

test("review state follows curated recurrence key", () => {
  const first = createVentRecord(
    { summary: "Primary", category: "workflow", recurrenceKey: "primary" },
    { id: "v1" },
  );
  const second = createVentRecord(
    { summary: "Duplicate", category: "workflow", recurrenceKey: "duplicate" },
    { id: "v2" },
  );
  const curation = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: second.recurrenceKey,
    targetRecurrenceKey: first.recurrenceKey,
  });
  const review = createReviewEvent({ recurrenceKey: second.recurrenceKey, state: "acknowledged" });

  const queue = summarizeReviewQueue([first, second], [review], { curationEvents: [curation] });
  assert.equal(queue.groupCount, 1);
  assert.equal(queue.items[0].reviewState, "acknowledged");
  assert.equal(queue.items[0].recurrenceKey, first.recurrenceKey);
});

test("curation JSONL tolerates malformed lines and symlink stores fail closed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-curation-"));
  const filePath = path.join(dir, "curation-events.jsonl");
  fs.writeFileSync(filePath, "{not-json}\n", "utf8");
  appendCurationEvent(
    filePath,
    createCurationEvent({
      action: "rename",
      sourceRecurrenceKey: "bug:old",
      targetRecurrenceKey: "bug:new",
    }),
  );
  const result = readCurationEvents(filePath);
  assert.equal(result.malformedLines, 1);
  assert.equal(result.events.length, 1);

  const target = path.join(dir, "target.jsonl");
  const link = path.join(dir, "curation-link.jsonl");
  fs.writeFileSync(target, "", "utf8");
  fs.symlinkSync(target, link);
  assert.throws(() => appendCurationEvent(link, result.events[0]), /must not be a symlink/);
});

test("draft-only escalation text is bounded and authority-safe", () => {
  const records = Array.from({ length: 8 }, (_, index) =>
    createVentRecord(
      {
        summary: `Draft sample ${index}`,
        evidence: `Pointer ${index}`,
        category: "bug",
        severity: index === 7 ? "high" : "medium",
        recurrenceKey: "draft-target",
      },
      { id: `v${index}`, now: `2026-05-21T00:0${index}:00.000Z` },
    ),
  );
  const review = createReviewEvent({
    recurrenceKey: "bug:draft-target",
    state: "acknowledged",
    note: "reviewed token=abc123",
  });
  const draft = buildEscalationDraft({
    target: "github_issue",
    recurrenceKey: "bug:draft-target",
    records,
    reviewEvents: [review],
    limit: 3,
    now: "2026-05-21T00:10:00.000Z",
  });

  assert.equal(draft.samples.length, 3);
  assert.equal(draft.group.reviewState, "acknowledged");
  assert.match(draft.text, /Draft-only GitHub issue text/);
  assert.match(draft.text, /No AK task, GitHub issue, incident, evidence/);
  assert.match(draft.text, /token=\[REDACTED\]/);
  assert.doesNotMatch(draft.text, /was created|was filed|was declared/);
});

test("draft-only escalation supports all targets and curation projections", () => {
  assert.deepEqual(DRAFT_TARGETS, [
    "github_issue",
    "ak_task",
    "incident_review",
    "maintainer_note",
  ]);
  const first = createVentRecord(
    { summary: "Primary draft", category: "workflow", recurrenceKey: "draft-primary" },
    { id: "v1" },
  );
  const second = createVentRecord(
    { summary: "Duplicate draft", category: "workflow", recurrenceKey: "draft-dupe" },
    { id: "v2" },
  );
  const curation = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: second.recurrenceKey,
    targetRecurrenceKey: first.recurrenceKey,
  });

  for (const target of DRAFT_TARGETS) {
    const draft = buildEscalationDraft({
      target,
      recurrenceKey: second.recurrenceKey,
      records: [first, second],
      curationEvents: [curation],
    });
    assert.equal(draft.recurrenceKey, first.recurrenceKey);
    assert.equal(draft.group.count, 2);
    assert.match(draft.text, /Draft-only/);
  }
});

test("draft-only escalation fails closed for unknown group and invalid target", () => {
  const records = [createVentRecord({ summary: "Known", category: "bug" }, { id: "v1" })];
  assert.throws(
    () => buildEscalationDraft({ target: "github_issue", recurrenceKey: "bug:missing", records }),
    /unknown recurrence group/,
  );
  assert.throws(
    () =>
      buildEscalationDraft({ target: "email", recurrenceKey: records[0].recurrenceKey, records }),
    /invalid agent_vent draft target/,
  );
});

test("lifecycle stats and exports are bounded local projections", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-lifecycle-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const record = createVentRecord(
    { summary: "Lifecycle export captures recurrence", category: "documentation" },
    { id: "v1" },
  );
  const review = createReviewEvent({
    recurrenceKey: record.recurrenceKey,
    state: "escalation_drafted",
    note: "Draft locally only",
  });
  appendVentRecord(storePath, record);
  appendReviewEvent(reviewPath, review);

  const snapshot = buildLifecycleSnapshot({
    records: readVentRecords(storePath).records,
    reviewEvents: readReviewEvents(reviewPath).events,
    storePath,
    reviewPath,
    now: "2026-05-21T00:00:00.000Z",
  });

  assert.equal(snapshot.counts.vents, 1);
  assert.equal(snapshot.counts.reviewStates.escalation_drafted, 1);
  assert.equal(snapshot.files.vents.exists, true);
  assert.match(formatLifecycleStats(snapshot), /no AK task, GitHub issue, incident, evidence/);
  assert.match(formatExportMarkdown(snapshot), /# Agent vent local diagnostic export/);
  assert.equal(JSON.parse(formatExportJson(snapshot)).counts.vents, 1);
});

test("lifecycle stats report missing stores without creating files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-lifecycle-missing-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const snapshot = buildLifecycleSnapshot({ storePath, reviewPath });

  assert.equal(snapshot.files.vents.exists, false);
  assert.equal(snapshot.files.reviewEvents.sizeBytes, 0);
  assert.equal(fs.existsSync(storePath), false);
  assert.match(formatLifecycleStats(snapshot), /vents: 0 record/);
});

test("lifecycle stats count more groups than the display limit", () => {
  const records = Array.from({ length: 125 }, (_, index) =>
    createVentRecord(
      {
        summary: `Distinct lifecycle group ${index}`,
        category: "workflow",
        recurrenceKey: `distinct-${index}`,
      },
      { id: `v-${index}` },
    ),
  );
  const snapshot = buildLifecycleSnapshot({ records, limit: 5 });

  assert.equal(snapshot.counts.recurrenceGroups, 125);
  assert.equal(snapshot.summary.groups.length, 5);
  assert.equal(snapshot.reviewQueue.items.length, 5);
});

test("record requires non-empty summary", () => {
  assert.throws(() => createVentRecord({ summary: "   " }), /requires a non-empty summary/);
});
