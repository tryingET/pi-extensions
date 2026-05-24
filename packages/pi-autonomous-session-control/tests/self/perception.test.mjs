/**
 * Tests for perception domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePatterns,
  createPatternDetector,
  queryErrors,
  queryHandoffSummary,
  trackError,
} from "../../extensions/self/perception.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function recordBash(harness, id, command, { isError = false, text = "" } = {}) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");

  toolCallHandler({ toolName: "bash", toolCallId: id, input: { command } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: id,
    isError,
    content: text ? [{ type: "text", text }] : [],
  });
}

test("self query: files touched returns empty when no operations", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "What files have I touched?" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("No files touched"), "should report no files touched");

  await cleanup(tempDir);
});

test("self query: am I looping returns no loops initially", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "Am I in a loop?" }, null, null, ctx);

  assert.ok(result.content[0].text.includes("no loop concern"), "should report no loops");

  await cleanup(tempDir);
});

test("self query: repeated successful validation commands are productive workflow, not a loop", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-validation-${i}`, "npm run check");
  }

  const loopResult = await tool.execute(
    "tc-validation-loop",
    { query: "Am I in a loop?" },
    null,
    null,
    ctx,
  );

  assert.equal(loopResult.details.data.isLooping, false);

  const commandsResult = await tool.execute(
    "tc-validation-commands",
    { query: "What commands have I run?" },
    null,
    null,
    ctx,
  );

  assert.equal(commandsResult.details.data.total, 3);
  assert.equal(commandsResult.details.data.successRate, 1);

  await cleanup(tempDir);
});

test("self query: repeated successful provenance helper commands are not a loop", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 5; i++) {
    recordBash(
      harness,
      `cmd-provenance-${i}`,
      `node scripts/provenance-note.mjs --task AK-${100 + i}`,
    );
  }

  const result = await tool.execute(
    "tc-provenance-loop",
    { query: "Am I in a loop?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.isLooping, false);

  await cleanup(tempDir);
});

test("self query: repeated failed commands remain a loop concern", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-${i}`, "npm run check", {
      isError: true,
      text: "lint failed on a.ts",
    });
  }

  const result = await tool.execute(
    "tc-failed-loop",
    { query: "Am I in a loop?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.isLooping, true);
  assert.ok(
    result.details.data.patterns.some(
      (pattern) => pattern.type === "command_loop" && pattern.severity === "critical",
    ),
    "should keep repeated failed command loop evidence",
  );

  await cleanup(tempDir);
});

test("self query: later validation success recovers stale failure loop cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-recovered-${i}`, "false", {
      isError: true,
      text: "command failed",
    });
  }
  recordBash(
    harness,
    "cmd-recovery-validation",
    "npm --prefix packages/pi-autonomous-session-control run check",
  );

  const loopResult = await tool.execute(
    "tc-recovered-loop",
    { query: "Am I in a loop?" },
    null,
    null,
    ctx,
  );

  assert.equal(loopResult.details.data.isLooping, false);

  const handoffResult = await tool.execute(
    "tc-recovered-handoff",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.equal(handoffResult.details.data.sliceCandidates[0]?.owner, undefined);
  assert.ok(
    handoffResult.content[0].text.includes("no continuation slice candidate"),
    "stale recovered failures should not prefill a scout peer",
  );

  await cleanup(tempDir);
});

test("self query: later validation success frames handoff failures as recovered", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-handoff-failed-recovered-${i}`, "false", {
      isError: true,
      text: "command failed",
    });
  }
  recordBash(
    harness,
    "cmd-handoff-recovery-validation",
    "npm --prefix packages/pi-autonomous-session-control run check",
  );

  const result = await tool.execute(
    "tc-recovered-handoff-summary",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.nextMove, undefined);
  assert.equal(result.content[0].text.includes("/scoutpeer"), false);
  assert.equal(result.content[0].text.includes("recent failed command(s)"), false);
  assert.ok(
    result.details.data.cues.some((cue) => cue.includes("successful validation/check evidence")),
    "recovered failures should be framed as recovered handoff history",
  );

  await cleanup(tempDir);
});

test("self query: partial failure recurrence after recovery does not reuse old failures", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 2; i++) {
    recordBash(harness, `cmd-partial-before-recovery-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }
  recordBash(
    harness,
    "cmd-partial-recovery-validation",
    "npm --prefix packages/pi-autonomous-session-control run check",
  );
  recordBash(harness, "cmd-partial-after-recovery", "false", {
    isError: true,
    text: "Command exited with code 1",
  });

  const result = await tool.execute(
    "tc-partial-recurrence-after-recovery",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.nextMove, undefined);
  assert.equal(result.details.data.sliceCandidates.length, 0);
  assert.ok(
    result.content[0].text.includes("no continuation slice candidate"),
    "pre-recovery failures should not combine with one new failure into an active loop",
  );

  await cleanup(tempDir);
});

test("self query: long validation command still recovers stale failure cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-long-recovery-failed-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }
  recordBash(harness, "cmd-long-recovery-validation", `cd ${"a".repeat(120)} && npm run check`);

  const result = await tool.execute(
    "tc-long-command-recovery",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.nextMove, undefined);
  assert.ok(
    result.content[0].text.includes("no continuation slice candidate"),
    "recovery classification must not depend on truncated display command text",
  );

  await cleanup(tempDir);
});

test("self perception: display-only legacy command entries are not recovery evidence", () => {
  const now = Date.now();
  const displayOnlyCommand = `npm run check ${"x".repeat(90)}`.slice(0, 100);
  const log = {
    fileOps: [],
    commands: [
      { command: "false", rawCommand: "false", timestamp: now, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 1, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 2, success: false },
      {
        command: displayOnlyCommand,
        rawCommand: displayOnlyCommand,
        timestamp: now + 3,
        success: true,
      },
    ],
    errors: [
      {
        toolName: "bash",
        signature: "Command exited with code N",
        rawMessage: "Command exited with code 1",
        timestamp: now,
        lastSeen: now + 2,
        count: 3,
      },
    ],
    sessionStartAt: now,
    lastMeaningfulChangeAt: now,
    turnCount: 4,
    turnsSinceMeaningfulChange: 0,
  };
  const detector = createPatternDetector();

  analyzePatterns(log, detector);
  const result = queryHandoffSummary(log, detector);

  assert.equal(result.nextMove?.owner, "peer-tools");
  assert.equal(result.errors[0].activeCount, 3);
});

test("self perception: legacy recovered errors recur with a fresh active count", () => {
  const now = Date.now();
  const log = {
    fileOps: [],
    commands: [
      { command: "false", rawCommand: "false", timestamp: now, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 1, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 2, success: false },
      { command: "npm run check", rawCommand: "npm run check", timestamp: now + 3, success: true },
    ],
    errors: [
      {
        toolName: "bash",
        signature: "Command exited with code N",
        rawMessage: "Command exited with code 1",
        timestamp: now,
        lastSeen: now + 2,
        count: 3,
      },
    ],
    sessionStartAt: now,
    lastMeaningfulChangeAt: now,
    turnCount: 5,
    turnsSinceMeaningfulChange: 0,
  };
  const detector = createPatternDetector();

  trackError(log, "bash", "Command exited with code 1");
  analyzePatterns(log, detector);
  const errors = queryErrors(log).errors;
  const result = queryHandoffSummary(log, detector);

  assert.equal(errors[0].count, 4);
  assert.equal(errors[0].activeCount, 1);
  assert.equal(result.nextMove, undefined);
});

test("self query: git status after failures is not recovery evidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-unrecovered-${i}`, "npm run check", {
      isError: true,
      text: "lint failed on a.ts",
    });
  }
  recordBash(harness, "cmd-git-status", "git status --short");

  const result = await tool.execute(
    "tc-git-status-not-recovery",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));
  assert.ok(
    result.content[0].text.includes("failure-recovery"),
    "read-only git inspection should not suppress failure recovery cues",
  );

  await cleanup(tempDir);
});

test("self query: stall wording includes productive command evidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab" } });
  for (let i = 0; i < 6; i++) {
    turnStartHandler();
  }
  recordBash(harness, "cmd-stall-validation", "npm run check");

  const progressResult = await tool.execute(
    "tc-stall-progress-evidence",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.equal(progressResult.details.data.isStalled, true);
  assert.equal(progressResult.details.data.concern, "stall_with_progress_evidence");
  assert.ok(progressResult.content[0].text.includes("progress evidence"));
  assert.equal(progressResult.details.data.progressEvidence.recentSuccessfulProductiveCommands, 1);

  const handoffResult = await tool.execute(
    "tc-stall-handoff-evidence",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.ok(
    handoffResult.details.data.cues.some((cue) => cue.includes("productive command evidence")),
    "handoff cues should contextualize stall evidence",
  );
  assert.equal(handoffResult.details.data.nextMove.owner, "pi-session-compaction");
  assert.equal(handoffResult.details.data.nextMove.slice, "temporal + artifact/packet");
  assert.ok(handoffResult.details.data.nextMove.prefillText.includes("/compact-focus"));

  await cleanup(tempDir);
});

test("self query: progress status when no progress", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("No file progress") ||
      result.content[0].text.includes("Progress"),
    "should report progress status",
  );

  await cleanup(tempDir);
});

test("self query: session summary", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "summary" }, null, null, ctx);

  assert.ok(result.content[0].text.includes("Session"), "should include session info");
  assert.ok(result.details.data.turns !== undefined, "should include turn count");

  await cleanup(tempDir);
});

test("self query: capability discovery", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "capability discovery" }, null, null, ctx);

  assert.ok(result.details.understood, "should understand capability discovery query");
  assert.ok(result.content[0].text.includes("Perception"), "should list perception domain");
  assert.ok(result.content[0].text.includes("Direction"), "should list direction domain");
  assert.ok(
    result.content[0].text.includes("Crystallization"),
    "should list crystallization domain",
  );
  assert.ok(result.content[0].text.includes("Protection"), "should list protection domain");
  assert.ok(result.content[0].text.includes("Action"), "should list action domain");
  assert.ok(result.content[0].text.includes("toolbox"), "should mention toolbox discovery");
  assert.ok(result.content[0].text.includes("capability maps"), "should mention capability maps");
  assert.ok(
    result.content[0].text.includes("repo-capability-map.md"),
    "should mention repo capability-map docs",
  );
  assert.ok(
    result.content[0].text.includes("pi-extensions/docs/project/root-capabilities.md"),
    "should mention root capabilities docs",
  );
  assert.ok(result.content[0].text.includes("agent_vent"), "should mention agent-vent companion");
  assert.ok(result.details.data.domains, "should return domains data");
  assert.ok(result.details.data.discoverySurfaces, "should return discovery surfaces data");

  await cleanup(tempDir);
});

test("self query: capability routing variant", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-capability-routing",
    { query: "capability routing" },
    null,
    null,
    ctx,
  );

  assert.ok(result.details.understood, "should understand capability routing query");
  assert.equal(result.details.intent, "meta");
  assert.ok(result.content[0].text.includes("toolbox"), "should mention toolbox discovery");
  assert.ok(result.content[0].text.includes("agent_vent"), "should mention agent-vent companion");
  assert.ok(result.content[0].text.includes("capability maps"), "should mention capability maps");

  await cleanup(tempDir);
});

test("self query: controller handoff summary includes actionable mirror cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab\nc" } });
  toolCallHandler({ toolName: "bash", toolCallId: "cmd-1", input: { command: "npm test" } });
  toolResultHandler({ toolName: "bash", toolCallId: "cmd-1", isError: false, content: [] });
  toolCallHandler({ toolName: "bash", toolCallId: "cmd-2", input: { command: "npm run check" } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: "cmd-2",
    isError: true,
    content: [{ type: "text", text: "lint failed on a.ts" }],
  });

  const result = await tool.execute(
    "tc-handoff",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only handoff summary"));
  assert.ok(result.content[0].text.includes("a.ts"));
  assert.ok(result.content[0].text.includes("failed: npm run check"));
  assert.equal(result.details.data.authority, "mirror_only");
  assert.equal(result.details.data.files[0].netLinesDelta, 1);
  assert.equal(result.details.data.commands.length, 2);
  assert.equal(result.details.data.errors[0].tool, "bash");
  assert.equal(result.details.data.errors[0].activeCount, 1);
  assert.ok(result.details.data.cues.some((cue) => cue.includes("failed command")));
  assert.equal(result.details.data.nextMove, undefined);
  assert.equal(result.details.data.sliceCandidates.length, 0);

  await cleanup(tempDir);
});

test("self query: rank continuation slices surfaces multi-dimensional candidates", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-slice-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-slice-ranking",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only slice ranking"));
  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("temporal"));
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));
  assert.ok(result.details.data.nextMove.slice.includes("authority-risk"));
  assert.ok(result.details.data.nextMove.prefillText.startsWith("/scoutpeer "));
  assert.equal(result.details.data.sliceCandidates[0].confidence, "high");

  await cleanup(tempDir);
});

test("self query: compound failure-recovery cue request returns handoff packet", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-compound-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-compound-failure-recovery",
    {
      query:
        "What visible loop/errors/failure-recovery cues triggered this scout? Include recent failed commands, loop status, files touched, and the smallest safe next action.",
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only handoff summary"));
  assert.ok(result.content[0].text.includes("failed: false"));
  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));

  await cleanup(tempDir);
});

test("self query: time since change uses turns since meaningful change", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  turnStartHandler();
  turnStartHandler();
  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab" } });
  turnStartHandler();

  const result = await tool.execute(
    "tc-time-since",
    { query: "How many turns since last meaningful change?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.turnsSince, 1);

  await cleanup(tempDir);
});

test("self query: stalled can trigger after earlier edits when no recent meaningful change", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab" } });
  for (let i = 0; i < 6; i++) {
    turnStartHandler();
  }

  const result = await tool.execute(
    "tc-stalled",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.isStalled, true);

  await cleanup(tempDir);
});
