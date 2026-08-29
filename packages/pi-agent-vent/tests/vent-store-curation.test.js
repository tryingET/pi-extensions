/**
summary: "Vent store curation events, cycle guards, facet summaries, and queue guidance; split from vent-store.test.js."
read_when:
  - "You change curation events, cycle guards, facet summaries, and queue guidance behavior."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendVentRecord,
  assertCanCurateRecurrence,
  buildFacetSummary,
  buildReviewDetail,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  formatFacetSummary,
  formatReviewDetail,
  formatReviewQueue,
  readVentRecords,
  resolveRecurrenceGroup,
  summarizeRecords,
  summarizeReviewQueue,
} from "../src/vent-store.js";

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

  const resolved = resolveRecurrenceGroup([first, second], second.recurrenceKey, [curation]);
  assert.equal(resolved.recurrenceKey, first.recurrenceKey);
  assert.equal(resolved.resolvedThroughCuration, true);
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
  assert.equal(detail.group.decisionPosture.state, "reviewed_retention_ready");
  assert.deepEqual(detail.group.categories, ["tool_failure", "workflow"]);
  assert.deepEqual(detail.group.tags, ["pi-tool", "reload"]);
  assert.equal(detail.samples.length, 2);
  const text = formatReviewDetail(detail);
  assert.match(text, /Requested key resolved through local curation/);
  assert.match(text, /Decision posture: reviewed_retention_ready/);
  assert.match(
    text,
    /not resolution, assignment, evidence, publication, issue status, task truth, or incident state/,
  );
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

  const queue = summarizeReviewQueue([incident, workflow, toolOnly], []);
  assert.equal(queue.items[0].decisionPosture.priority, "human_review_candidate");
  assert.equal(queue.items[0].decisionPosture.state, "needs_local_review");
  const text = formatReviewQueue(queue);
  assert.match(text, /decision posture: needs_local_review; priority=human_review_candidate/);
  assert.match(text, /No local review decision has been recorded/);
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
  assert.match(reviewedQueueText, /decision posture: reviewed_retention_ready/);
  assert.match(reviewedQueueText, /optional local lifecycle: \/agent_vent retention preview/);
  assert.match(reviewedQueueText, /draft maintainer_note/);
  assert.doesNotMatch(
    reviewedQueueText,
    /GitHub issue was created|AK task was created|incident was declared|was filed/,
  );
});
