/**
 * Tests for perception domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

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

  assert.ok(result.content[0].text.includes("No loop patterns"), "should report no loops");

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
    result.content[0].text.includes("No progress") || result.content[0].text.includes("Progress"),
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

  const result = await tool.execute("tc-1", { query: "What can you do?" }, null, null, ctx);

  assert.ok(result.details.understood, "should understand capability query");
  assert.ok(result.content[0].text.includes("Perception"), "should list perception domain");
  assert.ok(result.content[0].text.includes("Direction"), "should list direction domain");
  assert.ok(
    result.content[0].text.includes("Crystallization"),
    "should list crystallization domain",
  );
  assert.ok(result.content[0].text.includes("Protection"), "should list protection domain");
  assert.ok(result.content[0].text.includes("Action"), "should list action domain");
  assert.ok(result.details.data.domains, "should return domains data");

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
