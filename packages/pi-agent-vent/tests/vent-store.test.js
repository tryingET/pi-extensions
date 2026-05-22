import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendCurationEvent,
  appendReviewEvent,
  appendVentRecord,
  archiveRecurrenceGroup,
  assertCanCurateRecurrence,
  buildEscalationDraft,
  buildFacetSummary,
  buildLifecycleSnapshot,
  buildRecurrenceKey,
  buildRetentionCandidates,
  buildRetentionPreview,
  buildReviewComparison,
  buildReviewDetail,
  buildReviewOutcomes,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  DRAFT_TARGETS,
  defaultBackupDir,
  defaultCurationPath,
  defaultRetentionPath,
  defaultReviewPath,
  defaultStorePath,
  formatExportJson,
  formatExportMarkdown,
  formatFacetSummary,
  formatLifecycleStats,
  formatRetentionCandidates,
  formatReviewComparison,
  formatReviewDetail,
  formatReviewOutcomes,
  formatReviewQueue,
  formatSummary,
  loadDiagnosticState,
  MAX_JSONL_FILE_BYTES,
  MAX_JSONL_LINE_BYTES,
  readCurationEvents,
  readRetentionEvents,
  readReviewEvents,
  readVentRecords,
  redactSensitiveText,
  restoreRetentionBackup,
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

test("stale vent-store lock files are removed before append", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-stale-lock-"));
  const filePath = path.join(dir, "vents.jsonl");
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lockPath, "stale\n", "utf8");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lockPath, old, old);
  appendVentRecord(filePath, createVentRecord({ summary: "Stale lock clears" }, { id: "v1" }));

  assert.equal(readVentRecords(filePath).records.length, 1);
  assert.equal(fs.existsSync(lockPath), false);
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

test("facet summary counts local categories tags tools packages and review states", () => {
  const first = createVentRecord(
    {
      summary: "Facet primary",
      category: "tool_failure",
      severity: "high",
      recurrenceKey: "facet-primary",
      tags: ["Reload", "Runtime"],
      tool: "pi reload",
      packageName: "@tryinget/pi-agent-vent",
    },
    { id: "v1" },
  );
  const second = createVentRecord(
    {
      summary: "Facet duplicate token=abc123",
      category: "workflow",
      recurrenceKey: "facet-dupe",
      tags: ["Reload"],
      tool: "pi reload",
      packageName: "@tryinget/pi-agent-vent",
    },
    { id: "v2" },
  );
  const curation = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: second.recurrenceKey,
    targetRecurrenceKey: first.recurrenceKey,
  });
  const review = createReviewEvent({ recurrenceKey: first.recurrenceKey, state: "acknowledged" });

  const summary = buildFacetSummary({
    records: [first, second],
    reviewEvents: [review],
    curationEvents: [curation],
    limit: 1,
  });
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.groupCount, 1);
  assert.deepEqual(summary.records.tools, [{ name: "pi-reload", count: 2 }]);
  assert.deepEqual(summary.records.packages, [{ name: "tryinget-pi-agent-vent", count: 2 }]);
  assert.deepEqual(summary.groups.reviewStates, [{ name: "acknowledged", count: 1 }]);
  const text = formatFacetSummary(summary);
  assert.match(text, /not owner routing/);
  assert.match(text, /tools: pi-reload=2/);
  assert.doesNotMatch(text, /abc123/);
});

test("review queue filters by local facets without owner-routing claims", () => {
  const reload = createVentRecord(
    {
      summary: "Reload tool fails",
      category: "tool_failure",
      recurrenceKey: "reload-tool",
      tags: ["Review Flow", "Reload"],
      tool: "pi reload",
      packageName: "@tryinget/pi-agent-vent",
    },
    { id: "v1" },
  );
  const docs = createVentRecord(
    {
      summary: "Docs stale",
      category: "documentation",
      recurrenceKey: "docs-stale",
      tags: ["Docs"],
      tool: "docs-list",
      packageName: "@tryinget/other-package",
    },
    { id: "v2" },
  );

  assert.throws(
    () => summarizeReviewQueue([reload, docs], [], { filters: { category: "bgu" } }),
    /invalid agent_vent review filter category/,
  );

  const queue = summarizeReviewQueue([reload, docs], [], {
    filters: {
      category: "tool-failure",
      tags: ["review flow"],
      tool: "pi reload token=abc123",
      packageName: "@tryinget/pi-agent-vent",
    },
  });
  assert.equal(queue.groupCount, 2);
  assert.equal(queue.matchingGroupCount, 0);
  assert.equal(queue.queueCount, 0);
  assert.equal(queue.filters.tool, "pi-reload-token-redacted");
  const noMatchText = formatReviewQueue(queue);
  assert.match(noMatchText, /not owner routing/);
  assert.match(noMatchText, /token-redacted/);
  assert.doesNotMatch(noMatchText, /abc123/);

  const matchingQueue = summarizeReviewQueue([reload, docs], [], {
    filters: {
      category: "tool-failure",
      tags: ["review flow", "reload"],
      tool: "pi reload",
      packageName: "@tryinget/pi-agent-vent",
    },
  });
  assert.equal(matchingQueue.matchingGroupCount, 1);
  assert.equal(matchingQueue.queueCount, 1);
  assert.equal(matchingQueue.items[0].recurrenceKey, reload.recurrenceKey);
  assert.equal(matchingQueue.filters.tool, "pi-reload");
  assert.deepEqual(matchingQueue.filters.tags, ["review-flow", "reload"]);
  const matchingText = formatReviewQueue(matchingQueue);
  assert.match(
    matchingText,
    /Filters: category=tool_failure; tool=pi-reload; package=tryinget-pi-agent-vent; tags=review-flow,reload/,
  );
  assert.match(matchingText, /Filter note:/);
  assert.doesNotMatch(matchingText, /owner assignment was created/);
});

test("review queue facet filters are bounded for huge caller-controlled input", () => {
  const record = createVentRecord({
    summary: "Huge filter should not leak",
    category: "workflow",
    recurrenceKey: "huge-filter",
    tags: ["safe"],
    tool: "small-tool",
  });
  const queue = summarizeReviewQueue([record], [], {
    filters: {
      tool: `${"x".repeat(5000)} token=abc123`,
      tags: Array.from({ length: 20 }, (_, index) => `tag-${index}`),
    },
  });
  assert.equal(queue.queueCount, 0);
  assert.ok(queue.filters.tool.length <= 80);
  assert.equal(queue.filters.tags.length, 12);
  const text = formatReviewQueue(queue);
  assert.doesNotMatch(text, /abc123/);
  assert.match(text, /not owner routing/);
});

test("review detail expands curated groups with bounded redacted samples", () => {
  const first = createVentRecord(
    {
      summary: "Primary reload failure",
      category: "tool_failure",
      severity: "high",
      recurrenceKey: "reload-primary",
      evidence: "Bearer abcdefghijklmnop should redact",
      tags: ["Pi Tool", "Reload"],
      packageName: "@tryinget/pi-agent-vent",
    },
    { id: "v1", now: "2026-05-21T00:00:00.000Z" },
  );
  const second = createVentRecord(
    {
      summary: "Duplicate reload wording",
      category: "workflow",
      recurrenceKey: "reload-dupe",
      reproduction: "Run reload with token=abc123 in shell",
      tags: ["Reload"],
    },
    { id: "v2", now: "2026-05-21T00:01:00.000Z" },
  );
  const curation = createCurationEvent({
    action: "merge",
    sourceRecurrenceKey: second.recurrenceKey,
    targetRecurrenceKey: first.recurrenceKey,
  });
  const review = createReviewEvent({ recurrenceKey: second.recurrenceKey, state: "acknowledged" });

  const detail = buildReviewDetail({
    recurrenceKey: second.recurrenceKey,
    records: [first, second],
    reviewEvents: [review],
    curationEvents: [curation],
    limit: 999,
  });
  assert.equal(detail.recurrenceKey, first.recurrenceKey);
  assert.equal(detail.group.count, 2);
  assert.equal(detail.group.reviewState, "acknowledged");
  assert.deepEqual(detail.group.categories, ["tool_failure", "workflow"]);
  assert.deepEqual(detail.group.tags, ["pi-tool", "reload"]);
  assert.equal(detail.samples.length, 2);
  const text = formatReviewDetail(detail);
  assert.match(text, /Requested key resolved through local curation/);
  assert.match(text, /Human review hints:/);
  assert.match(text, /incident_review draft may help a human decide/);
  assert.match(text, /maintainer_note draft may help package\/tool maintainers/);
  assert.match(text, /github_issue draft may help/);
  assert.match(text, /ak_task draft may help/);
  assert.match(text, /not owner routing, assignment, filing, task creation, incident declaration/);
  assert.match(text, /Local next actions:/);
  assert.match(text, /draft github_issue/);
  assert.match(text, /draft ak_task/);
  assert.match(text, /draft incident_review/);
  assert.match(text, /draft maintainer_note/);
  assert.match(text, /retention preview/);
  assert.match(
    text,
    /do not file, create, declare, assign, record evidence, publish, or mutate owner systems/,
  );
  assert.match(text, /Bearer \[REDACTED\]/);
  assert.match(text, /token=\[REDACTED\]/);
  assert.match(text, /No AK task, GitHub issue, incident, evidence/);
  assert.doesNotMatch(text, /filed|declared|owner was assigned/);
});

test("review output quotes generated commands for legacy recurrence keys", () => {
  const legacy = {
    ...createVentRecord({ summary: "Legacy key with spaces", category: "bug" }),
    recurrenceKey: 'bug:legacy key "quoted"',
  };

  const queueText = formatReviewQueue(summarizeReviewQueue([legacy], []));
  assert.match(queueText, /review show "bug:legacy key \\"quoted\\""/);
  assert.match(queueText, /review set acknowledged "bug:legacy key \\"quoted\\""/);
  assert.match(queueText, /draft github_issue "bug:legacy key \\"quoted\\""/);

  const detailText = formatReviewDetail(
    buildReviewDetail({ recurrenceKey: legacy.recurrenceKey, records: [legacy] }),
  );
  assert.match(detailText, /review set dismissed "bug:legacy key \\"quoted\\""/);
  assert.match(detailText, /draft maintainer_note "bug:legacy key \\"quoted\\""/);
});

test("review queue guidance hints remain advisory and authority-safe", () => {
  const incident = createVentRecord({
    summary: "Critical package bug",
    category: "bug",
    severity: "critical",
    recurrenceKey: "critical-package-bug",
    packageName: "@tryinget/pi-agent-vent",
  });
  const workflow = createVentRecord({
    summary: "Workflow docs unclear",
    category: "documentation",
    recurrenceKey: "workflow-docs",
  });
  const toolOnly = createVentRecord({
    summary: "Tool-only reload issue",
    category: "workflow",
    recurrenceKey: "tool-only",
    tool: "pi reload",
  });

  const text = formatReviewQueue(summarizeReviewQueue([incident, workflow, toolOnly], []));
  assert.match(text, /incident_review draft may help a human decide/);
  assert.match(text, /maintainer_note draft may help package\/tool maintainers/);
  assert.match(text, /github_issue draft may help/);
  assert.match(text, /ak_task draft may help/);
  assert.match(text, /Hints are local diagnostics only/);
  assert.doesNotMatch(
    text,
    /GitHub issue was created|AK task was created|incident was declared|owner was assigned|was filed/,
  );
});

test("review queue next actions are state-aware and authority-safe", () => {
  const record = createVentRecord({
    summary: "State-aware next action",
    category: "workflow",
    recurrenceKey: "state-aware",
  });

  const newQueueText = formatReviewQueue(summarizeReviewQueue([record], []));
  assert.match(newQueueText, /review first before local retention archive/);
  assert.match(newQueueText, /draft ak_task/);
  assert.match(
    newQueueText,
    /do not file, create, declare, assign, record evidence, publish, or mutate owner systems/,
  );
  assert.doesNotMatch(newQueueText, /optional local lifecycle: \/agent_vent retention preview/);

  const reviewedQueueText = formatReviewQueue(
    summarizeReviewQueue(
      [record],
      [createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" })],
    ),
  );
  assert.match(reviewedQueueText, /optional local lifecycle: \/agent_vent retention preview/);
  assert.match(reviewedQueueText, /draft maintainer_note/);
  assert.doesNotMatch(
    reviewedQueueText,
    /GitHub issue was created|AK task was created|incident was declared|was filed/,
  );
});

test("review outcomes bucket post-review follow-up without authority drift", () => {
  const fresh = createVentRecord({
    summary: "Fresh outcome needs review",
    category: "workflow",
    recurrenceKey: "fresh outcome",
    tags: ["outcome"],
  });
  const acknowledged = createVentRecord({
    summary: "Acknowledged package issue",
    category: "tool_failure",
    recurrenceKey: "acknowledged outcome",
    packageName: "@tryinget/pi-agent-vent",
    tags: ["outcome"],
  });
  const dismissed = createVentRecord({
    summary: "Dismissed noisy group",
    category: "documentation",
    recurrenceKey: "dismissed outcome",
    tags: ["outcome"],
  });
  const drafted = createVentRecord({
    summary: "Escalation draft prepared",
    category: "bug",
    recurrenceKey: "drafted outcome",
    severity: "high",
    tags: ["outcome"],
  });
  const reviews = [
    createReviewEvent({
      recurrenceKey: acknowledged.recurrenceKey,
      state: "acknowledged",
      note: "seen token=abc123 locally",
    }),
    createReviewEvent({ recurrenceKey: dismissed.recurrenceKey, state: "dismissed" }),
    createReviewEvent({ recurrenceKey: drafted.recurrenceKey, state: "escalation_drafted" }),
  ];

  const outcomes = buildReviewOutcomes({
    records: [fresh, acknowledged, dismissed, drafted],
    reviewEvents: reviews,
    filters: { tags: ["outcome"] },
    limit: 10,
  });
  assert.equal(outcomes.counts.new, 1);
  assert.equal(outcomes.counts.acknowledged, 1);
  assert.equal(outcomes.counts.dismissed, 1);
  assert.equal(outcomes.counts.escalation_drafted, 1);
  assert.equal(outcomes.limitPerBucket, 10);
  assert.deepEqual(outcomes.filters.tags, ["outcome"]);
  const boundedFilter = buildReviewOutcomes({
    records: [fresh],
    reviewEvents: [],
    filters: { tags: ["x".repeat(1000)] },
  });
  assert.deepEqual(boundedFilter.filters.tags, ["x".repeat(80)]);
  assert.equal(boundedFilter.matchingGroupCount, 0);

  const text = formatReviewOutcomes(outcomes);
  assert.match(text, /Agent vent review outcomes/);
  assert.match(text, /showing up to 10 group\(s\) per state bucket/);
  assert.match(text, /new: 1 group/);
  assert.match(text, /acknowledged: 1 group/);
  assert.match(text, /dismissed: 1 group/);
  assert.match(text, /escalation_drafted: 1 group/);
  assert.match(text, /seen token=\[REDACTED\] locally/);
  assert.match(text, /retention waits for local review/);
  assert.match(text, /optional local lifecycle: \/agent_vent retention preview/);
  assert.match(
    text,
    /export this outcome bucket: \/agent_vent export markdown acknowledged tag=outcome/,
  );
  assert.match(text, /Local diagnostic labels only; not owner routing/);
  assert.match(text, /No AK task, GitHub issue, incident, evidence, telemetry/);
  assert.doesNotMatch(
    text,
    /GitHub issue was created|AK task was created|incident was declared|owner was assigned|resolved externally|was filed/,
  );
});

test("review comparison contrasts state buckets without authority drift", () => {
  const fresh = createVentRecord({
    summary: "Fresh compare needs review token=abc123",
    category: "workflow",
    recurrenceKey: "fresh compare",
    tags: ["Compare"],
  });
  const acknowledged = createVentRecord({
    summary: "Acknowledged compare issue",
    category: "tool_failure",
    severity: "high",
    recurrenceKey: "ack compare",
    tags: ["Compare"],
    tool: "pi reload",
    packageName: "@tryinget/pi-agent-vent",
  });
  const dismissed = createVentRecord({
    summary: "Dismissed compare issue",
    category: "documentation",
    recurrenceKey: "dismiss compare",
    tags: ["Compare"],
  });
  const drafted = createVentRecord({
    summary: "Drafted compare critical issue",
    category: "bug",
    severity: "critical",
    recurrenceKey: "draft compare",
    tags: ["Compare"],
  });
  const reviews = [
    createReviewEvent({ recurrenceKey: acknowledged.recurrenceKey, state: "acknowledged" }),
    createReviewEvent({ recurrenceKey: dismissed.recurrenceKey, state: "dismissed" }),
    createReviewEvent({ recurrenceKey: drafted.recurrenceKey, state: "escalation_drafted" }),
  ];

  const comparison = buildReviewComparison({
    records: [fresh, acknowledged, dismissed, drafted],
    reviewEvents: reviews,
    filters: { tags: ["compare"], tool: `${"x".repeat(5000)} token=abc123` },
    limit: 1000,
  });
  assert.equal(comparison.limitPerState, 100);
  assert.equal(comparison.matchingGroupCount, 0);
  assert.ok(comparison.filters.tool.length <= 80);

  const unfiltered = buildReviewComparison({
    records: [fresh, acknowledged, dismissed, drafted],
    reviewEvents: reviews,
    filters: { tags: ["compare"] },
    limit: 2,
  });
  assert.equal(unfiltered.totals.new.groups, 1);
  assert.equal(unfiltered.totals.acknowledged.candidateIncidents, 0);
  assert.equal(unfiltered.totals.escalation_drafted.candidateIncidents, 1);
  assert.equal(unfiltered.totals.escalation_drafted.criticalGroups, 1);
  assert.deepEqual(unfiltered.filters.tags, ["compare"]);
  const text = formatReviewComparison(unfiltered);
  assert.match(text, /Agent vent review comparison/);
  assert.match(text, /State totals:/);
  assert.match(text, /export bucket: \/agent_vent export markdown acknowledged tag=compare/);
  assert.match(text, /outcomes: \/agent_vent outcomes acknowledged tag=compare/);
  assert.match(
    text,
    /retention planning: \/agent_vent retention candidates acknowledged tag=compare/,
  );
  assert.match(text, /choose local outcome: \/agent_vent review set acknowledged/);
  assert.match(text, /intentionally emits no archive or restore confirmation tokens/);
  assert.match(text, /No AK task, GitHub issue, incident, evidence, telemetry/);
  assert.match(text, /token=\[REDACTED\]/);
  assert.doesNotMatch(
    text,
    /archive:[a-f0-9]|restore:[a-f0-9]|GitHub issue was created|AK task was created|incident was declared|owner was assigned|resolved externally|was filed/,
  );
});

test("review outcomes limit is explicit per state bucket", () => {
  const states = ["new", "acknowledged", "dismissed", "escalation_drafted"];
  const records = [];
  const reviews = [];
  for (const state of states) {
    const record = createVentRecord({
      summary: `${state} grouped`,
      recurrenceKey: `${state}-group`,
    });
    records.push(record);
    if (state !== "new") {
      reviews.push(createReviewEvent({ recurrenceKey: record.recurrenceKey, state }));
    }
  }

  const outcomes = buildReviewOutcomes({ records, reviewEvents: reviews, state: "all", limit: 1 });
  assert.equal(outcomes.limitPerBucket, 1);
  assert.deepEqual(
    outcomes.buckets.map((bucket) => `${bucket.state}:${bucket.items.length}`),
    ["new:1", "acknowledged:1", "dismissed:1", "escalation_drafted:1"],
  );
  assert.match(formatReviewOutcomes(outcomes), /showing up to 1 group\(s\) per state bucket/);
});

test("review outcomes fail closed for invalid states and category filters", () => {
  assert.throws(
    () => buildReviewOutcomes({ state: "resolved", records: [], reviewEvents: [] }),
    /invalid agent_vent review state/,
  );
  assert.throws(
    () => buildReviewOutcomes({ filters: { category: "../../etc/passwd" } }),
    /invalid agent_vent review filter category/,
  );
  const emptyText = formatReviewOutcomes(buildReviewOutcomes({ records: [], reviewEvents: [] }));
  assert.match(emptyText, /No agent vent records found/);
  assert.match(emptyText, /Boundary:/);
});

test("review detail fails closed for unknown groups and redacts legacy JSONL", () => {
  assert.throws(
    () => buildReviewDetail({ recurrenceKey: "bug:missing", records: [] }),
    /cannot inspect unknown recurrence group/,
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-review-detail-"));
  const storePath = path.join(dir, "vents.jsonl");
  fs.writeFileSync(
    storePath,
    `${JSON.stringify({
      schemaVersion: 1,
      id: "legacy",
      createdAt: "2026-05-21T00:00:00.000Z",
      category: "bug",
      severity: "high",
      recurrenceKey: "bug:legacy-secret",
      summary: "Legacy token=abc123 should redact",
      evidence: "Authorization Bearer abcdefghijklmnop",
    })}\n`,
    "utf8",
  );

  const records = readVentRecords(storePath).records;
  const text = formatReviewDetail(
    buildReviewDetail({ recurrenceKey: "bug:legacy-secret", records, limit: 1000 }),
  );
  assert.doesNotMatch(text, /abc123|abcdefghijklmnop/);
  assert.match(text, /token=\[REDACTED\]/);
  assert.match(text, /Bearer \[REDACTED\]/);
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
        tool: index % 2 === 0 ? "pi reload token=abc123" : undefined,
        packageName: "@tryinget/pi-agent-vent",
        tags: ["Draft Flow"],
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
  assert.match(draft.text, /Local diagnostic facets \(not owner routing\)/);
  assert.match(draft.text, /Tools: pi-reload-token-redacted/);
  assert.match(draft.text, /Packages: tryinget-pi-agent-vent/);
  assert.match(draft.text, /token=\[REDACTED\]/);
  assert.doesNotMatch(draft.text, /abc123|was created|was filed|was declared/);
});

test("draft-only escalation supports all targets and curation projections", () => {
  assert.deepEqual(DRAFT_TARGETS, [
    "github_issue",
    "ak_task",
    "incident_review",
    "maintainer_note",
  ]);
  const first = createVentRecord(
    {
      summary: "Primary draft",
      category: "workflow",
      recurrenceKey: "draft-primary",
      tool: "pi reload",
      packageName: "@tryinget/pi-agent-vent",
    },
    { id: "v1" },
  );
  const second = createVentRecord(
    {
      summary: "Duplicate draft",
      category: "workflow",
      recurrenceKey: "draft-dupe",
      tool: "pi toolbox",
      packageName: "@tryinget/pi-toolbox-discovery",
    },
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
    assert.deepEqual(draft.group.tools, ["pi-reload", "pi-toolbox"]);
    assert.match(draft.text, /Draft-only/);
    assert.match(draft.text, /Local facets are hints, not owner routing/);
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

test("lifecycle export can preserve facet scope without owner-routing claims", () => {
  const keep = createVentRecord({
    summary: "Keep export scoped token=abc123",
    category: "tool_failure",
    recurrenceKey: "export-keep",
    tags: ["Export"],
    tool: "pi reload",
    packageName: "@tryinget/pi-agent-vent",
  });
  const omit = createVentRecord({
    summary: "Omit unrelated export group",
    category: "documentation",
    recurrenceKey: "export-omit",
    tags: ["Other"],
  });
  const mixedOut = createVentRecord({
    summary: "Omit mixed-group private payload",
    category: "tool_failure",
    recurrenceKey: "export-keep",
    tags: ["Other"],
    tool: "pi reload",
    packageName: "@tryinget/pi-agent-vent",
  });
  const review = createReviewEvent({
    recurrenceKey: keep.recurrenceKey,
    state: "acknowledged",
    note: "review token=abc123 locally",
  });

  const snapshot = buildLifecycleSnapshot({
    records: [keep, omit, mixedOut],
    reviewEvents: [review],
    filters: { tags: ["export"], tool: "pi reload", packageName: "@tryinget/pi-agent-vent" },
    state: "acknowledged",
    limit: 10,
    now: "2026-05-22T00:00:00.000Z",
  });

  assert.equal(snapshot.scope.hasFilters, true);
  assert.equal(snapshot.scope.matchingGroups, 1);
  assert.equal(snapshot.counts.vents, 1);
  assert.equal(snapshot.counts.reviewStates.acknowledged, 1);
  assert.equal(snapshot.reviewQueue.items.length, 1);
  assert.equal(snapshot.reviewQueue.items[0].recurrenceKey, keep.recurrenceKey);
  assert.equal(snapshot.summary.groups[0].recurrenceKey, keep.recurrenceKey);
  const markdown = formatExportMarkdown(snapshot);
  assert.match(markdown, /Filters: tool=pi-reload; package=tryinget-pi-agent-vent; tags=export/);
  assert.match(markdown, /not owner routing or owner assignment/);
  assert.match(markdown, /token=\[REDACTED\]/);
  assert.doesNotMatch(
    markdown,
    /Omit unrelated export group|Omit mixed-group private payload|owner was assigned|archive:[a-f0-9]/,
  );
  const json = JSON.parse(formatExportJson(snapshot));
  assert.equal(json.scope.filters.tool, "pi-reload");
  assert.equal(json.counts.vents, 1);
});

test("lifecycle export state scope constrains counts and summaries", () => {
  const acknowledged = createVentRecord({
    summary: "Acknowledged export group",
    category: "bug",
    recurrenceKey: "ack-export",
    tags: ["export-state"],
  });
  const fresh = createVentRecord({
    summary: "Fresh export group should not appear",
    category: "bug",
    recurrenceKey: "fresh-export",
    tags: ["export-state"],
  });
  const review = createReviewEvent({
    recurrenceKey: acknowledged.recurrenceKey,
    state: "acknowledged",
  });

  const snapshot = buildLifecycleSnapshot({
    records: [acknowledged, fresh],
    reviewEvents: [review],
    filters: { tags: ["export-state"] },
    state: "acknowledged",
    limit: 10,
  });

  assert.equal(snapshot.scope.stateFilter, "acknowledged");
  assert.equal(snapshot.scope.facetMatchingGroups, 2);
  assert.equal(snapshot.scope.matchingGroups, 1);
  assert.equal(snapshot.counts.vents, 1);
  assert.equal(snapshot.counts.reviewStates.new, 0);
  assert.equal(snapshot.counts.reviewStates.acknowledged, 1);
  assert.equal(snapshot.summary.groups.length, 1);
  assert.equal(snapshot.reviewQueue.items.length, 1);
  const markdown = formatExportMarkdown(snapshot);
  assert.match(markdown, /Acknowledged export group/);
  assert.doesNotMatch(markdown, /Fresh export group should not appear/);
});

test("lifecycle export rejects empty facet filters", () => {
  assert.throws(
    () => buildLifecycleSnapshot({ records: [], filters: { tags: [""] } }),
    /invalid agent_vent review filter tag: empty value/,
  );
  assert.throws(
    () => buildLifecycleSnapshot({ records: [], filters: { tool: "" } }),
    /invalid agent_vent review filter tool: empty value/,
  );
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

test("retention candidates list reviewed groups without tokens or mutation", () => {
  const fresh = createVentRecord({
    summary: "Fresh retention group",
    category: "workflow",
    recurrenceKey: "fresh-retention",
  });
  const acknowledged = createVentRecord({
    summary: "Acknowledged retention group token=abc123",
    category: "tool_failure",
    recurrenceKey: "ack-retention",
    tags: ["Retention"],
    tool: "pi reload",
    packageName: "@tryinget/pi-agent-vent",
  });
  const dismissed = createVentRecord({
    summary: "Dismissed retention group",
    category: "documentation",
    recurrenceKey: "dismissed-retention",
    tags: ["Retention"],
  });
  const reviews = [
    createReviewEvent({
      recurrenceKey: acknowledged.recurrenceKey,
      state: "acknowledged",
      note: "reviewed token=abc123 locally",
    }),
    createReviewEvent({ recurrenceKey: dismissed.recurrenceKey, state: "dismissed" }),
  ];

  const candidates = buildRetentionCandidates({
    records: [fresh, acknowledged, dismissed],
    reviewEvents: reviews,
    filters: { tags: ["retention"], tool: "pi reload" },
    limit: 10,
    now: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(candidates.stateFilter, "reviewed");
  assert.equal(candidates.groupCount, 3);
  assert.equal(candidates.matchingGroupCount, 1);
  assert.equal(candidates.candidateCount, 1);
  assert.equal(candidates.items[0].reviewState, "acknowledged");
  assert.equal(candidates.filters.tool, "pi-reload");

  const text = formatRetentionCandidates(candidates);
  assert.match(text, /Agent vent retention candidates/);
  assert.match(text, /read-only planning view/);
  assert.match(text, /preview archive token: \/agent_vent retention preview/);
  assert.match(text, /reviewed token=\[REDACTED\] locally/);
  assert.match(
    text,
    /export this outcome bucket: \/agent_vent export markdown acknowledged tool=pi-reload tag=retention/,
  );
  assert.match(text, /No archive, restore, AK task, GitHub issue, incident, evidence/);
  assert.match(text, /not owner routing/);
  assert.doesNotMatch(text, /archive:[a-f0-9]/);
  assert.doesNotMatch(text, /abc123|was archived|was filed|owner was assigned/);

  const allCandidates = buildRetentionCandidates({
    records: [fresh, acknowledged],
    reviewEvents: reviews,
    state: "all",
  });
  assert.equal(allCandidates.candidateCount, 2);
  assert.match(formatRetentionCandidates(allCandidates), /review before archive/);
  assert.throws(
    () => buildRetentionCandidates({ records: [], reviewEvents: [], state: "resolved" }),
    /invalid agent_vent review state/,
  );
  assert.throws(
    () => buildRetentionCandidates({ filters: { category: "../../etc/passwd" } }),
    /invalid agent_vent review filter category/,
  );
});

test("retention archive is confirmation-gated, backed up, receipted, and restorable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const keep = createVentRecord(
    { summary: "Keep active", category: "workflow", recurrenceKey: "keep" },
    { id: "keep" },
  );
  const archive = createVentRecord(
    { summary: "Archive reviewed", category: "workflow", recurrenceKey: "archive-me" },
    { id: "archive" },
  );
  appendVentRecord(storePath, keep);
  appendVentRecord(storePath, archive);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({
      recurrenceKey: archive.recurrenceKey,
      state: "dismissed",
      note: "reviewed token=abc123",
    }),
  );

  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  assert.throws(
    () =>
      buildRetentionPreview({
        recurrenceKey: archive.recurrenceKey,
        records: state.records,
        reviewEvents: state.reviewEvents,
        storeHash: state.ventsHash,
      }),
    /requires current store, review, and curation hashes/,
  );
  const preview = buildRetentionPreview({
    recurrenceKey: archive.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  assert.equal(preview.archivable, true);
  assert.equal(preview.archivedRecordCount, 1);
  assert.match(preview.confirmationToken, /^archive:/);
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: archive.recurrenceKey,
        confirmationToken: "archive:wrong",
      }),
    /requires exact confirmation token/,
  );

  const result = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: archive.recurrenceKey,
    confirmationToken: preview.confirmationToken,
    note: "archive note password=hunter2",
  });
  assert.equal(readVentRecords(storePath).records.length, 1);
  assert.equal(readVentRecords(storePath).records[0].id, "keep");
  assert.equal(fs.existsSync(result.backupPath), true);
  assert.match(result.restoreConfirmationToken, /^restore:/);
  const retentionEvents = readRetentionEvents(retentionPath).events;
  assert.equal(retentionEvents.length, 1);
  assert.equal(retentionEvents[0].action, "archive");
  assert.match(retentionEvents[0].note, /password=\[REDACTED\]/);
  assert.match(result.boundary, /No AK task, GitHub issue, incident, evidence/);

  const restore = restoreRetentionBackup({
    storePath,
    retentionPath,
    backupDir,
    backupPath: result.backupPath,
    confirmationToken: result.restoreConfirmationToken,
  });
  assert.equal(restore.restoredRecordCount, 1);
  assert.equal(readVentRecords(storePath).records.length, 2);
  assert.equal(readRetentionEvents(retentionPath).events.length, 2);
});

test("retention archive removes only selected group records when legacy ids collide", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-duplicate-id-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const archive = createVentRecord(
    { summary: "Archive duplicate id", category: "bug", recurrenceKey: "archive-duplicate" },
    { id: "duplicate-id" },
  );
  const keep = createVentRecord(
    { summary: "Keep duplicate id", category: "workflow", recurrenceKey: "keep-duplicate" },
    { id: "duplicate-id" },
  );
  appendVentRecord(storePath, archive);
  appendVentRecord(storePath, keep);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: archive.recurrenceKey, state: "acknowledged" }),
  );

  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: archive.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: archive.recurrenceKey,
    confirmationToken: preview.confirmationToken,
  });

  const remaining = readVentRecords(storePath).records;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].recurrenceKey, keep.recurrenceKey);
  assert.equal(remaining[0].id, "duplicate-id");
});

test("retention fails closed for unreviewed groups, path escape, and stale restore", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-negative-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Needs lifecycle", category: "bug", recurrenceKey: "needs-lifecycle" },
    { id: "v1" },
  );
  appendVentRecord(storePath, record);
  const unreviewed = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: unreviewed.records,
    reviewEvents: unreviewed.reviewEvents,
    storeHash: unreviewed.ventsHash,
    reviewHash: unreviewed.reviewEventsHash,
    curationHash: unreviewed.curationEventsHash,
  });
  assert.equal(preview.archivable, false);
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /before local review/,
  );

  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" }),
  );
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /requires exact confirmation token/,
  );
  const reviewed = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const token = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: reviewed.records,
    reviewEvents: reviewed.reviewEvents,
    storeHash: reviewed.ventsHash,
    reviewHash: reviewed.reviewEventsHash,
    curationHash: reviewed.curationEventsHash,
  }).confirmationToken;
  const archived = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: record.recurrenceKey,
    confirmationToken: token,
  });

  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: path.join(dir, "outside.agent-vent-backup.json"),
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /backup path must stay inside/,
  );
  appendVentRecord(
    storePath,
    createVentRecord({ summary: "New record after archive", category: "bug" }, { id: "new" }),
  );
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: archived.backupPath,
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /stale backup/,
  );
});

test("retention archive rejects stale confirmation when active store changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-stale-token-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Archive target", category: "bug", recurrenceKey: "target" },
    { id: "target" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" }),
  );
  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  appendVentRecord(
    storePath,
    createVentRecord({ summary: "Concurrent new record", category: "bug" }, { id: "new" }),
  );
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /requires exact confirmation token/,
  );
  assert.deepEqual(
    readVentRecords(storePath)
      .records.map((entry) => entry.id)
      .sort(),
    ["new", "target"],
  );
});

test("retention archive rolls active store back when receipt append fails", (context) => {
  if (process.getuid?.() === 0) {
    context.skip("root can bypass file write permissions");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-receipt-fail-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Receipt failure target", category: "bug", recurrenceKey: "receipt-fail" },
    { id: "target" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "dismissed" }),
  );
  fs.writeFileSync(retentionPath, "", "utf8");
  fs.chmodSync(retentionPath, 0o400);
  try {
    const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
    const token = buildRetentionPreview({
      recurrenceKey: record.recurrenceKey,
      records: state.records,
      reviewEvents: state.reviewEvents,
      storeHash: state.ventsHash,
      reviewHash: state.reviewEventsHash,
      curationHash: state.curationEventsHash,
    }).confirmationToken;
    assert.throws(
      () =>
        archiveRecurrenceGroup({
          storePath,
          reviewPath,
          retentionPath,
          backupDir,
          recurrenceKey: record.recurrenceKey,
          confirmationToken: token,
        }),
      /EACCES|EPERM|permission/i,
    );
    assert.equal(readVentRecords(storePath).records.length, 1);
    assert.equal(fs.readdirSync(backupDir).length, 0);
  } finally {
    fs.chmodSync(retentionPath, 0o600);
  }
});

test("retention restore rejects symlinked backup directories and tampered restore tokens", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-symlink-backup-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-external-"));
  const storePath = path.join(dir, "vents.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const current = createVentRecord({ summary: "Current", category: "bug" }, { id: "current" });
  const injectedJsonl = `${JSON.stringify(createVentRecord({ summary: "Injected", category: "bug" }, { id: "injected" }))}\n`;
  appendVentRecord(storePath, current);
  const currentText = fs.readFileSync(storePath, "utf8");
  const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  const backup = {
    schemaVersion: 1,
    artifactType: "agent_vent_retention_backup",
    recurrenceKey: "bug:crafted",
    beforeHash: hash(injectedJsonl),
    afterHash: hash(currentText),
    restoreConfirmationToken: "restore:not-derived",
    ventsJsonl: injectedJsonl,
  };
  fs.writeFileSync(
    path.join(externalDir, "crafted.agent-vent-backup.json"),
    JSON.stringify(backup),
  );
  fs.symlinkSync(externalDir, backupDir);
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: path.join(backupDir, "crafted.agent-vent-backup.json"),
        confirmationToken: "restore:not-derived",
      }),
    /backup directory must be a real directory/,
  );
  fs.rmSync(backupDir);
  fs.mkdirSync(backupDir);
  const localBackupPath = path.join(backupDir, "crafted.agent-vent-backup.json");
  fs.writeFileSync(localBackupPath, JSON.stringify(backup));
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: localBackupPath,
        confirmationToken: "restore:not-derived",
      }),
    /restore token failed integrity check/,
  );
});

test("retention restore fails closed when current store is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-missing-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    {
      summary: "Archive then remove active store",
      category: "bug",
      recurrenceKey: "missing-store",
    },
    { id: "missing" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "dismissed" }),
  );
  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const token = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  }).confirmationToken;
  const archived = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: record.recurrenceKey,
    confirmationToken: token,
  });
  fs.rmSync(storePath);
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: archived.backupPath,
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /requires current vents store/,
  );
});

test("record requires non-empty summary", () => {
  assert.throws(() => createVentRecord({ summary: "   " }), /requires a non-empty summary/);
});
