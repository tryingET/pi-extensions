/**
 * Tests for mirror-only context-pressure handoff cues.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { queryContextPressure } from "../../extensions/self/context-pressure.ts";
import { createOperationLog, trackCommand } from "../../extensions/self/perception.ts";
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

test("self query: progress surfaces mirror-only context-pressure heuristic after many turns", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 36; i++) {
    turnStartHandler();
  }

  const result = await tool.execute(
    "tc-context-pressure-turns",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.contextPressure.level, "handoff_advised");
  assert.equal(result.details.data.contextPressure.shouldConsiderHandoff, true);
  assert.ok(result.content[0].text.includes("Context-pressure heuristic"));
  assert.ok(result.content[0].text.includes("not token telemetry"));
  assert.ok(result.content[0].text.includes("Consider preparing a handoff"));
  assert.equal(result.content[0].text.includes("remaining token"), false);

  await cleanup(tempDir);
});

test("self perception: repeated lifecycle commands advise handoff without token-budget claims", () => {
  const log = createOperationLog();
  trackCommand(log, "pi install /tmp/pkg-a", true);
  trackCommand(log, "pi install /tmp/pkg-b", true);
  trackCommand(log, "git commit -m one", true);
  trackCommand(log, "git commit -m two", true);
  trackCommand(log, "ak task complete 1", true);
  trackCommand(log, "ak task complete 2", true);

  const result = queryContextPressure(log);

  assert.equal(result.level, "handoff_advised");
  assert.equal(result.shouldConsiderHandoff, true);
  assert.ok(result.signals.some((signal) => signal.includes("pi install")));
  assert.ok(result.signals.some((signal) => signal.includes("git commit")));
  assert.ok(result.signals.some((signal) => signal.includes("AK task completion")));
  assert.ok(result.summary.includes("not token telemetry"));
});

test("self query: controller handoff includes context-pressure cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  recordBash(harness, "cmd-pressure-install-1", "pi install /tmp/pkg-a");
  recordBash(harness, "cmd-pressure-install-2", "pi install /tmp/pkg-b");
  recordBash(harness, "cmd-pressure-commit-1", 'git commit -m "one"');
  recordBash(harness, "cmd-pressure-commit-2", 'git commit -m "two"');
  recordBash(harness, "cmd-pressure-complete-1", "ak task complete 1");
  recordBash(harness, "cmd-pressure-complete-2", "ak task complete 2");

  const result = await tool.execute(
    "tc-context-pressure-handoff",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.contextPressure.level, "handoff_advised");
  assert.ok(
    result.details.data.cues.some((cue) => cue.includes("Context-pressure heuristic")),
    "handoff cues should include context pressure",
  );
  assert.ok(result.content[0].text.includes("Consider preparing a handoff"));

  await cleanup(tempDir);
});
