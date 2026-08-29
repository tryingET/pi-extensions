/**
summary: "Vent store review outcomes, comparisons, fail-closed paths, and escalation drafts; split from vent-store.test.js."
read_when:
  - "You change review outcomes, comparisons, fail-closed paths, and escalation drafts behavior."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendCurationEvent,
  buildEscalationDraft,
  buildReviewComparison,
  buildReviewDetail,
  buildReviewOutcomes,
  createCurationEvent,
  createReviewEvent,
  createVentRecord,
  DRAFT_TARGETS,
  formatReviewComparison,
  formatReviewDetail,
  formatReviewOutcomes,
  readCurationEvents,
  readVentRecords,
} from "../src/vent-store.js";

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
  assert.match(text, /decision posture: needs_local_review/);
  assert.match(text, /decision posture: dismissed_retention_ready/);
  assert.match(text, /decision posture: draft_recorded_owner_external/);
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
