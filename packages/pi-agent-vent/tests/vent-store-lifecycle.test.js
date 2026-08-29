/**
summary: "Vent store lifecycle snapshots, stats, and exports; split from vent-store.test.js."
read_when:
  - "You change lifecycle snapshots, stats, and exports behavior."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendReviewEvent,
  appendVentRecord,
  buildLifecycleSnapshot,
  createReviewEvent,
  createVentRecord,
  formatExportJson,
  formatExportMarkdown,
  formatLifecycleStats,
  readReviewEvents,
  readVentRecords,
} from "../src/vent-store.js";

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
  const markdown = formatExportMarkdown(snapshot);
  assert.match(markdown, /# Agent vent local diagnostic export/);
  assert.match(markdown, /Decision posture: draft_recorded_owner_external/);
  assert.match(
    markdown,
    /not resolution, assignment, evidence, publication, issue status, task truth, or incident state/,
  );
  assert.match(markdown, /## Safe local follow-up/);
  assert.match(markdown, /Optional local retention preview: \/agent_vent retention preview/);
  assert.match(markdown, /Draft-only handoff:/);
  assert.match(
    markdown,
    /They do not file, create, declare, assign, record evidence, publish, archive, restore/,
  );
  const json = JSON.parse(formatExportJson(snapshot));
  assert.equal(json.counts.vents, 1);
  assert.equal(json.nextActions[0].decisionPosture.state, "draft_recorded_owner_external");
  assert.equal(
    json.nextActions[0].retentionPreviewCommand,
    `/agent_vent retention preview ${record.recurrenceKey}`,
  );
  assert.doesNotMatch(
    JSON.stringify(json.nextActions),
    /archive:[a-f0-9]|restore:[a-f0-9]|owner was assigned/,
  );
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
  assert.match(markdown, /Safe local follow-up/);
  assert.match(
    markdown,
    /Optional local retention preview: \/agent_vent retention preview tool_failure:export-keep/,
  );
  assert.doesNotMatch(
    markdown,
    /Omit unrelated export group|Omit mixed-group private payload|owner was assigned|archive:[a-f0-9]/,
  );
  const json = JSON.parse(formatExportJson(snapshot));
  assert.equal(json.scope.filters.tool, "pi-reload");
  assert.equal(json.counts.vents, 1);
  assert.equal(
    json.nextActions[0].exportBucketCommand,
    "/agent_vent export markdown acknowledged tool=pi-reload package=tryinget-pi-agent-vent tag=export",
  );
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

test("lifecycle export follow-up commands quote legacy keys without authority claims", () => {
  const legacy = {
    ...createVentRecord({ summary: "Legacy export key", category: "bug" }),
    recurrenceKey: 'bug:legacy key "quoted"',
  };
  const snapshot = buildLifecycleSnapshot({ records: [legacy], reviewEvents: [], limit: 5 });
  const markdown = formatExportMarkdown(snapshot);
  const json = JSON.parse(formatExportJson(snapshot));

  assert.match(markdown, /\/agent_vent review show "bug:legacy key \\"quoted\\""/);
  assert.match(markdown, /Choose local review state:/);
  assert.doesNotMatch(markdown, /retention preview "bug:legacy key/);
  assert.match(markdown, /draft commands only generate local text|local diagnostics\/drafts only/);
  assert.equal(json.nextActions[0].reviewCommands.length, 3);
  assert.equal(json.nextActions[0].retentionPreviewCommand, undefined);
  assert.doesNotMatch(
    JSON.stringify(json.nextActions),
    /archive:[a-f0-9]|restore:[a-f0-9]|filed|owner was assigned/,
  );
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
