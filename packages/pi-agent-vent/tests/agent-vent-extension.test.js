import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import agentVentExtension from "../extensions/agent-vent.ts";
import { createCurationEvent, createVentRecord, readReviewEvents } from "../src/vent-store.js";

function createMockPi() {
  const tools = new Map();
  const commands = new Map();
  return {
    tools,
    commands,
    api: {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
    },
  };
}

test("extension registers agent_vent tool and command aliases", () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);

  assert.equal(pi.tools.has("agent_vent"), true);
  assert.equal(pi.commands.has("agent_vent"), true);
  assert.equal(pi.commands.has("agent-vent"), true);
  assert.match(pi.tools.get("agent_vent").description, /frustration/i);
});

test("agent_vent tool schema stays aligned with retention candidate and compare command contracts", () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const schemaText = JSON.stringify(pi.tools.get("agent_vent").parameters);

  assert.match(schemaText, /"compare"/);
  assert.match(schemaText, /"candidates"/);
  assert.match(schemaText, /"history"/);
  assert.match(schemaText, /retentionCandidateState/);
  assert.match(schemaText, /"reviewed"/);
  assert.match(schemaText, /"all"/);
  assert.match(schemaText, /candidates, history, preview, archive, or restore/);
  assert.match(schemaText, /outcomes, compare, export, or retention planning/);
});

test("agent_vent records minimized local diagnostics without external authority claims", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-extension-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  process.env.PI_AGENT_VENT_DIR = dir;
  try {
    const tool = pi.tools.get("agent_vent");
    const result = await tool.execute(
      "tool-call-1",
      {
        action: "record",
        summary: "Repeated reload loses tool registration",
        category: "tool-failure",
        severity: "high",
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
        tags: ["reload"],
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => "/tmp/session.jsonl" },
      },
    );

    assert.match(result.content[0].text, /Recorded agent vent/);
    assert.equal(result.details.record.category, "tool_failure");
    assert.equal(result.details.record.context.source, "agent_vent_tool");
    assert.equal(result.details.record.context.cwd, "/repo");
    assert.equal(result.details.record.context.sessionFile, "session.jsonl");
    assert.equal(fs.existsSync(path.join(dir, "vents.jsonl")), true);

    await tool.execute(
      "tool-call-1b",
      {
        action: "record",
        summary: "Reload registration duplicate wording",
        category: "tool-failure",
        severity: "medium",
        recurrenceKey: "reload-registration-dupe",
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
        tags: ["reload"],
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );

    const curateResult = await tool.execute(
      "tool-call-1c",
      {
        action: "curate",
        curationAction: "merge",
        sourceRecurrenceKey: "tool_failure:reload-registration-dupe",
        targetRecurrenceKey: "tool_failure:repeated-reload-loses-tool-registration",
        curationNote: "same local issue token=abc123",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(curateResult.content[0].text, /local diagnostic curation projection only/);
    assert.match(curateResult.details.curationEvent.note, /token=\[REDACTED\]/);

    const reviewResult = await tool.execute(
      "tool-call-2",
      { action: "review" },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(reviewResult.content[0].text, /Agent vent review queue/);
    assert.match(reviewResult.content[0].text, /no AK task, GitHub issue, incident, evidence/);
    assert.equal(reviewResult.details.reviewQueue.items[0].reviewState, "new");
    assert.equal(reviewResult.details.reviewQueue.groupCount, 1);
    assert.equal(reviewResult.details.reviewQueue.items[0].count, 2);
    assert.match(reviewResult.content[0].text, /review show/);

    const reviewDetailResult = await tool.execute(
      "tool-call-2b",
      {
        action: "review",
        recurrenceKey: "tool_failure:reload-registration-dupe",
        limit: 1000,
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(reviewDetailResult.content[0].text, /Agent vent review detail/);
    assert.match(
      reviewDetailResult.content[0].text,
      /Requested key resolved through local curation/,
    );
    assert.equal(reviewDetailResult.details.reviewDetail.group.count, 2);
    assert.equal(reviewDetailResult.details.reviewDetail.samples.length, 2);

    const facetsResult = await tool.execute(
      "tool-call-2c",
      { action: "facets" },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(facetsResult.content[0].text, /Agent vent facets/);
    assert.match(facetsResult.content[0].text, /not owner routing/);
    assert.equal(facetsResult.details.facets.records.tools[0].name, "pi-reload");
    assert.equal(facetsResult.details.facets.records.packages[0].count, 2);

    const filteredReviewResult = await tool.execute(
      "tool-call-2d",
      {
        action: "review",
        category: "tool_failure",
        tags: ["reload"],
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(filteredReviewResult.content[0].text, /Filters:/);
    assert.match(filteredReviewResult.content[0].text, /not owner routing/);
    assert.equal(filteredReviewResult.details.reviewQueue.matchingGroupCount, 1);
    assert.equal(filteredReviewResult.details.reviewQueue.filters.tool, "pi-reload");

    const setReviewResult = await tool.execute(
      "tool-call-3",
      {
        action: "set_review",
        recurrenceKey: "tool_failure:reload-registration-dupe",
        reviewState: "acknowledged",
        reviewNote: "Operator acknowledged token=abc123 locally",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(setReviewResult.content[0].text, /local diagnostic review state only/);
    assert.equal(
      setReviewResult.details.reviewEvent.recurrenceKey,
      "tool_failure:repeated-reload-loses-tool-registration",
    );
    assert.equal(setReviewResult.details.reviewEvent.state, "acknowledged");
    assert.match(setReviewResult.details.reviewEvent.note, /token=\[REDACTED\]/);

    const outcomesResult = await tool.execute(
      "tool-call-3b",
      {
        action: "outcomes",
        reviewState: "acknowledged",
        category: "tool_failure",
        tags: ["reload"],
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(outcomesResult.content[0].text, /Agent vent review outcomes/);
    assert.match(outcomesResult.content[0].text, /acknowledged: 1 group/);
    assert.match(outcomesResult.content[0].text, /export this outcome bucket/);
    assert.match(outcomesResult.content[0].text, /not owner routing/);
    assert.equal(outcomesResult.details.reviewOutcomes.counts.acknowledged, 1);
    assert.equal(outcomesResult.details.reviewOutcomes.filters.tool, "pi-reload");

    const compareResult = await tool.execute(
      "tool-call-3c",
      {
        action: "compare",
        category: "tool_failure",
        tags: ["reload"],
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(compareResult.content[0].text, /Agent vent review comparison/);
    assert.match(compareResult.content[0].text, /acknowledged: groups=1/);
    assert.match(
      compareResult.content[0].text,
      /retention planning: \/agent_vent retention candidates acknowledged category=tool_failure tool=pi-reload package=tryinget-pi-agent-vent tag=reload/,
    );
    assert.match(
      compareResult.content[0].text,
      /export bucket: \/agent_vent export markdown acknowledged category=tool_failure tool=pi-reload package=tryinget-pi-agent-vent tag=reload/,
    );
    assert.match(
      compareResult.content[0].text,
      /intentionally emits no archive or restore confirmation tokens/,
    );
    assert.doesNotMatch(
      compareResult.content[0].text,
      /archive:[a-f0-9]|was filed|owner was assigned/,
    );
    assert.equal(compareResult.details.reviewComparison.totals.acknowledged.groups, 1);
    assert.equal(compareResult.details.reviewComparison.filters.tool, "pi-reload");

    const retentionCandidatesResult = await tool.execute(
      "tool-call-3d",
      {
        action: "retention",
        retentionAction: "candidates",
        reviewState: "acknowledged",
        category: "tool_failure",
        tags: ["reload"],
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(retentionCandidatesResult.content[0].text, /Agent vent retention candidates/);
    assert.match(retentionCandidatesResult.content[0].text, /does not archive records/);
    assert.match(retentionCandidatesResult.content[0].text, /retention preview/);
    assert.doesNotMatch(retentionCandidatesResult.content[0].text, /Confirmation token: archive:/);
    assert.equal(retentionCandidatesResult.details.retention.candidateCount, 1);
    assert.equal(retentionCandidatesResult.details.retention.filters.tool, "pi-reload");

    const allRetentionCandidatesResult = await tool.execute(
      "tool-call-3e",
      {
        action: "retention",
        retentionAction: "candidates",
        retentionCandidateState: "all",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.equal(allRetentionCandidatesResult.details.retention.stateFilter, "all");

    const draftResult = await tool.execute(
      "tool-call-4",
      {
        action: "draft",
        draftTarget: "github_issue",
        recurrenceKey: "tool_failure:repeated-reload-loses-tool-registration",
        limit: 2,
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(draftResult.content[0].text, /Draft-only GitHub issue text/);
    assert.match(draftResult.content[0].text, /No AK task, GitHub issue, incident, evidence/);
    assert.match(draftResult.content[0].text, /Local diagnostic facets \(not owner routing\)/);
    assert.match(draftResult.content[0].text, /Tools: pi-reload/);
    assert.equal(draftResult.details.draft.samples.length, 2);
    assert.equal(draftResult.details.draft.group.count, 2);

    const statsResult = await tool.execute(
      "tool-call-5",
      { action: "stats" },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(statsResult.content[0].text, /Agent vent lifecycle stats/);
    assert.equal(statsResult.details.lifecycle.counts.vents, 2);
    assert.equal(statsResult.details.lifecycle.counts.curationEvents, 1);

    const exportResult = await tool.execute(
      "tool-call-6",
      {
        action: "export",
        exportFormat: "json",
        category: "tool_failure",
        tags: ["reload"],
        tool: "pi reload",
        packageName: "@tryinget/pi-agent-vent",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    const exported = JSON.parse(exportResult.content[0].text);
    assert.equal(exported.counts.reviewStates.acknowledged, 1);
    assert.equal(exported.scope.hasFilters, true);
    assert.equal(exported.scope.matchingGroups, 1);
    assert.equal(exported.scope.filters.tool, "pi-reload");
    assert.match(exportResult.content[0].text, /Local diagnostic projection only/);

    const pathResult = await tool.execute("tool-call-7", { action: "path" }, undefined, undefined, {
      cwd: "/repo",
      sessionManager: { getSessionFile: () => undefined },
    });
    assert.match(
      pathResult.content[0].text,
      /curation projections are local diagnostics, not tasks, issues, incidents, evidence, telemetry, or ASC\/self state/,
    );

    const previewResult = await tool.execute(
      "tool-call-8",
      {
        action: "retention",
        retentionAction: "preview",
        recurrenceKey: "tool_failure:repeated-reload-loses-tool-registration",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(previewResult.content[0].text, /Confirmation token: archive:/);
    assert.equal(previewResult.details.retention.archivable, true);

    const archiveResult = await tool.execute(
      "tool-call-9",
      {
        action: "retention",
        retentionAction: "archive",
        recurrenceKey: "tool_failure:repeated-reload-loses-tool-registration",
        confirmationToken: previewResult.details.retention.confirmationToken,
        retentionNote: "archive locally token=abc123",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(archiveResult.content[0].text, /Archived 2 local diagnostic record/);
    assert.match(archiveResult.content[0].text, /No AK task, GitHub issue, incident, evidence/);
    assert.equal(fs.existsSync(archiveResult.details.retention.backupPath), true);

    const historyResult = await tool.execute(
      "tool-call-9b",
      {
        action: "retention",
        retentionAction: "history",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(historyResult.content[0].text, /Agent vent retention history/);
    assert.match(
      historyResult.content[0].text,
      /rollback candidate: \/agent_vent retention restore/,
    );
    assert.match(historyResult.content[0].text, /read-only receipt projection/i);
    assert.equal(
      historyResult.details.retention.items[0].restoreConfirmationToken,
      archiveResult.details.retention.restoreConfirmationToken,
    );

    const restoreResult = await tool.execute(
      "tool-call-10",
      {
        action: "retention",
        retentionAction: "restore",
        backupPath: archiveResult.details.retention.backupPath,
        confirmationToken: archiveResult.details.retention.restoreConfirmationToken,
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );
    assert.match(restoreResult.content[0].text, /Restored local diagnostic backup/);
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent command rejects unknown review filter keys without creating stores", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-command-filter-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  const oldLog = console.log;
  const messages = [];
  process.env.PI_AGENT_VENT_DIR = dir;
  console.log = (message) => messages.push(String(message));
  try {
    const unsafeTarget = path.join(dir, "unsafe-target.jsonl");
    fs.writeFileSync(unsafeTarget, "", "utf8");
    fs.symlinkSync(unsafeTarget, path.join(dir, "vents.jsonl"));
    await pi.commands.get("agent_vent").handler("review owner=github", { hasUI: false });
    assert.match(messages[0], /Unknown \/agent_vent review filter\(s\): owner/);
    assert.match(messages[0], /category=bug/);
    assert.doesNotMatch(messages[0], /symlink/);
    await pi.commands.get("agent_vent").handler("review owner=", { hasUI: false });
    assert.match(messages[1], /Unknown \/agent_vent review filter\(s\): owner/);
    assert.doesNotMatch(messages[1], /symlink/);
    await pi.commands.get("agent_vent").handler("review category=bgu", { hasUI: false });
    assert.match(messages[2], /Invalid \/agent_vent review filter value\(s\): category=bgu/);
    await pi.commands.get("agent_vent").handler("review show", { hasUI: false });
    assert.match(messages[3], /Usage: \/agent_vent review show <recurrenceKey> \[limit\]/);
    await pi.commands.get("agent_vent").handler("review set resolved bug:legacy", { hasUI: false });
    assert.match(messages[4], /Invalid \/agent_vent review state: resolved/);
    await pi.commands.get("agent_vent").handler("outcomes owner=github", { hasUI: false });
    assert.match(messages[5], /Unknown \/agent_vent outcomes filter\(s\): owner/);
    assert.doesNotMatch(messages[5], /symlink/);
    await pi.commands.get("agent_vent").handler("outcomes owner=", { hasUI: false });
    assert.match(messages[6], /Unknown \/agent_vent outcomes filter\(s\): owner/);
    assert.doesNotMatch(messages[6], /symlink/);
    await pi.commands.get("agent_vent").handler("outcomes resolved", { hasUI: false });
    assert.match(messages[7], /Invalid \/agent_vent outcomes state: resolved/);
    await pi.commands.get("agent_vent").handler("compare owner=", { hasUI: false });
    assert.match(messages[8], /Unknown \/agent_vent compare filter\(s\): owner/);
    assert.doesNotMatch(messages[8], /symlink/);
    await pi.commands.get("agent_vent").handler("compare resolved", { hasUI: false });
    assert.match(messages[9], /Invalid \/agent_vent compare argument: resolved/);
    assert.doesNotMatch(messages[9], /symlink/);
    await pi.commands.get("agent_vent").handler("compare new", { hasUI: false });
    assert.match(messages[10], /Invalid \/agent_vent compare argument: new/);
    assert.doesNotMatch(messages[10], /symlink/);
    await pi.commands.get("agent_vent").handler("retention candidates owner=", { hasUI: false });
    assert.match(messages[11], /Unknown \/agent_vent retention candidates filter\(s\): owner/);
    assert.doesNotMatch(messages[11], /symlink/);
    await pi.commands.get("agent_vent").handler("retention candidates resolved", { hasUI: false });
    assert.match(messages[12], /Invalid \/agent_vent retention candidates state: resolved/);
    assert.doesNotMatch(messages[12], /symlink/);
    await pi.commands.get("agent_vent").handler("export owner=", { hasUI: false });
    assert.match(messages[13], /Unknown \/agent_vent export filter\(s\): owner/);
    assert.doesNotMatch(messages[13], /symlink/);
    await pi.commands.get("agent_vent").handler("export category=bgu", { hasUI: false });
    assert.match(messages[14], /Invalid \/agent_vent export filter value\(s\): category=bgu/);
    assert.doesNotMatch(messages[14], /symlink/);
    await pi.commands.get("agent_vent").handler("export tag=", { hasUI: false });
    assert.match(messages[15], /Invalid \/agent_vent export filter value\(s\): tag=/);
    assert.doesNotMatch(messages[15], /symlink/);
    await pi.commands.get("agent_vent").handler("retention history owner=", { hasUI: false });
    assert.match(messages[16], /Invalid \/agent_vent retention history argument: owner=/);
    assert.doesNotMatch(messages[16], /symlink/);
    await pi.commands.get("agent_vent").handler("retention history", { hasUI: false });
    assert.match(messages[17], /No agent vent retention events found yet/);
    assert.doesNotMatch(messages[17], /symlink/);
  } finally {
    console.log = oldLog;
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent tool retention history does not read active vent store", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-tool-history-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  process.env.PI_AGENT_VENT_DIR = dir;
  try {
    const unsafeTarget = path.join(dir, "unsafe-target.jsonl");
    fs.writeFileSync(unsafeTarget, "", "utf8");
    fs.symlinkSync(unsafeTarget, path.join(dir, "vents.jsonl"));
    const result = await pi.tools
      .get("agent_vent")
      .execute(
        "tool-call-history-empty",
        { action: "retention", retentionAction: "history" },
        undefined,
        undefined,
        {
          cwd: "/repo",
          sessionManager: { getSessionFile: () => undefined },
        },
      );

    assert.match(result.content[0].text, /No agent vent retention events found yet/);
    assert.doesNotMatch(result.content[0].text, /symlink/);
    assert.equal(result.details.retention.totalEvents, 0);
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent command round-trips quoted legacy recurrence keys", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-legacy-key-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  const oldLog = console.log;
  const messages = [];
  process.env.PI_AGENT_VENT_DIR = dir;
  console.log = (message) => messages.push(String(message));
  try {
    const legacy = {
      ...createVentRecord({ summary: "Legacy spaced key", category: "bug" }),
      recurrenceKey: 'bug:legacy key "quoted"',
    };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "vents.jsonl"), `${JSON.stringify(legacy)}\n`, "utf8");
    await pi.commands
      .get("agent_vent")
      .handler('review set acknowledged "bug:legacy key \\"quoted\\"" seen locally', {
        hasUI: false,
      });
    assert.match(messages[0], /Set local review state/);
    assert.equal(
      readReviewEvents(path.join(dir, "review-events.jsonl")).events[0].recurrenceKey,
      legacy.recurrenceKey,
    );
  } finally {
    console.log = oldLog;
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent record feedback summarizes resolved curated groups", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-record-curated-feedback-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  process.env.PI_AGENT_VENT_DIR = dir;
  try {
    const primary = createVentRecord({
      summary: "Primary curated record group",
      category: "bug",
      recurrenceKey: "primary-record",
    });
    const duplicate = createVentRecord({
      summary: "Duplicate curated record group",
      category: "bug",
      recurrenceKey: "duplicate-record",
    });
    const curation = createCurationEvent({
      action: "merge",
      sourceRecurrenceKey: duplicate.recurrenceKey,
      targetRecurrenceKey: primary.recurrenceKey,
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "vents.jsonl"),
      `${JSON.stringify(primary)}\n${JSON.stringify(duplicate)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "curation-events.jsonl"),
      `${JSON.stringify(curation)}\n`,
      "utf8",
    );

    const result = await pi.tools.get("agent_vent").execute(
      "tool-call-record-curated-feedback",
      {
        action: "record",
        summary: "Third curated record group",
        category: "bug",
        recurrenceKey: "duplicate-record",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => undefined },
      },
    );

    assert.equal(result.details.recurrenceGroup.recurrenceKey, primary.recurrenceKey);
    assert.equal(result.details.recurrenceGroup.count, 3);
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent command review set accepts curated source keys", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-command-curated-review-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  const oldLog = console.log;
  const messages = [];
  process.env.PI_AGENT_VENT_DIR = dir;
  console.log = (message) => messages.push(String(message));
  try {
    const primary = createVentRecord({
      summary: "Primary curated command group",
      category: "bug",
      recurrenceKey: "primary-command",
    });
    const duplicate = createVentRecord({
      summary: "Duplicate curated command group",
      category: "bug",
      recurrenceKey: "duplicate-command",
    });
    const curation = createCurationEvent({
      action: "merge",
      sourceRecurrenceKey: duplicate.recurrenceKey,
      targetRecurrenceKey: primary.recurrenceKey,
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "vents.jsonl"),
      `${JSON.stringify(primary)}\n${JSON.stringify(duplicate)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "curation-events.jsonl"),
      `${JSON.stringify(curation)}\n`,
      "utf8",
    );

    await pi.commands
      .get("agent_vent")
      .handler(`review set acknowledged ${duplicate.recurrenceKey} seen via source key`, {
        hasUI: false,
      });

    assert.match(messages[0], /Set local review state/);
    assert.equal(
      readReviewEvents(path.join(dir, "review-events.jsonl")).events[0].recurrenceKey,
      primary.recurrenceKey,
    );
  } finally {
    console.log = oldLog;
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_vent fails closed for unknown review groups", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-extension-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  process.env.PI_AGENT_VENT_DIR = dir;
  try {
    const tool = pi.tools.get("agent_vent");
    await assert.rejects(
      () =>
        tool.execute(
          "tool-call-unknown-review",
          {
            action: "set_review",
            recurrenceKey: "bug:no-such-group",
            reviewState: "dismissed",
          },
          undefined,
          undefined,
          {
            cwd: "/repo",
            sessionManager: { getSessionFile: () => undefined },
          },
        ),
      /unknown recurrence group/,
    );
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
