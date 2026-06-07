/**
 * Tests for perception command recovery evidence and loop recovery.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePatterns,
  createOperationLog,
  createPatternDetector,
  queryCommandsRun,
  queryErrors,
  queryHandoffSummary,
  queryLoopStatus,
  trackCommand,
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

test("perception command query reports zero success rate when no commands ran", () => {
  const result = queryCommandsRun(createOperationLog());

  assert.equal(result.total, 0);
  assert.equal(result.successRate, 0);
});

test("perception treats workspace validation commands as recovery evidence", () => {
  const log = createOperationLog();
  for (let i = 0; i < 3; i++) {
    trackError(log, "bash", "Command exited with code 1");
  }
  trackCommand(log, "npm --workspace packages/pi-autonomous-session-control run check", true);

  const detector = createPatternDetector();
  analyzePatterns(log, detector);
  const loopStatus = queryLoopStatus(detector);

  assert.equal(queryErrors(log).errors[0].activeCount, 0);
  assert.equal(loopStatus.isLooping, false);
});

test("perception treats npm run workspace validation commands as recovery evidence", () => {
  const log = createOperationLog();
  for (let i = 0; i < 3; i++) {
    trackError(log, "bash", "Command exited with code 1");
  }
  trackCommand(log, "npm run --workspace packages/pi-autonomous-session-control check", true);

  const detector = createPatternDetector();
  analyzePatterns(log, detector);
  const loopStatus = queryLoopStatus(detector);

  assert.equal(queryErrors(log).errors[0].activeCount, 0);
  assert.equal(loopStatus.isLooping, false);
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

test("self perception: failed commands flagged as recovery evidence do not recover errors", () => {
  const now = Date.now();
  const log = {
    fileOps: [],
    commands: [
      { command: "false", rawCommand: "false", timestamp: now, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 1, success: false },
      { command: "false", rawCommand: "false", timestamp: now + 2, success: false },
      {
        command: "npm run check",
        rawCommand: "npm run check",
        timestamp: now + 3,
        success: false,
        recoveryEvidence: true,
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
    turnCount: 5,
    turnsSinceMeaningfulChange: 0,
  };
  const detector = createPatternDetector();

  analyzePatterns(log, detector);
  const errors = queryErrors(log).errors;
  const result = queryHandoffSummary(log, detector);

  assert.equal(errors[0].activeCount, 3);
  assert.equal(result.nextMove?.owner, "peer-tools");
});

test("self perception: legacy recovered errors recur with a fresh active count", () => {
  const now = Date.now() - 1000;
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

test("self perception: stale active counts reconcile with later recovery evidence", () => {
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
        activeCount: 3,
      },
    ],
    sessionStartAt: now,
    lastMeaningfulChangeAt: now,
    turnCount: 5,
    turnsSinceMeaningfulChange: 0,
  };
  const detector = createPatternDetector();

  analyzePatterns(log, detector);
  const errors = queryErrors(log).errors;
  const result = queryHandoffSummary(log, detector);

  assert.equal(errors[0].activeCount, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.nextMove, undefined);
});

test("self perception: recurring stale active counts restart after recovery evidence", () => {
  const now = Date.now() - 10_000;
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
        activeCount: 3,
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
