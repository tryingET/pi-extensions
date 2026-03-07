/**
 * Tests for self tool registration and event handling.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self tool is registered", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  assert.ok(harness.tools.has("self"), "self tool should be registered");
  const tool = harness.tools.get("self");
  assert.equal(tool.name, "self");
  assert.ok(tool.description.includes("mirror"), "description should mention mirror");

  await cleanup(tempDir);
});

test("dispatch_subagent tool is registered in default extension", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  assert.ok(harness.tools.has("dispatch_subagent"), "dispatch_subagent should be registered");

  await cleanup(tempDir);
});

test("event handlers are registered", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  assert.ok(harness.eventHandlers.has("tool_call"), "should register tool_call handler");
  assert.ok(harness.eventHandlers.has("tool_result"), "should register tool_result handler");
  assert.ok(harness.eventHandlers.has("turn_start"), "should register turn_start handler");

  await cleanup(tempDir);
});

test("turn_start increments turn counter", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  // Get initial state
  const initial = await tool.execute("tc-1", { query: "summary" }, null, null, ctx);
  const initialTurns = initial.details.data.turns;

  // Simulate turn start
  const turnStartHandler = harness.eventHandlers.get("turn_start");
  turnStartHandler();

  // Check state after turn
  const after = await tool.execute("tc-2", { query: "summary" }, null, null, ctx);
  const afterTurns = after.details.data.turns;

  assert.equal(afterTurns, initialTurns + 1, "turn count should increment");

  await cleanup(tempDir);
});

test("compatibility commands are registered", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  assert.ok(harness.commands.has("self-status"), "should register self-status command");
  assert.ok(harness.commands.has("self-loop-check"), "should register self-loop-check command");
  assert.ok(harness.commands.has("self-progress"), "should register self-progress command");
  assert.ok(
    harness.commands.has("self-runtime-invariants"),
    "should register self-runtime-invariants command",
  );
  assert.ok(
    harness.commands.has("self-prompt-vault-compat"),
    "should register self-prompt-vault-compat command",
  );

  await cleanup(tempDir);
});

test("self-status includes runtime invariant summary", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const statusCommand = harness.commands.get("self-status");
  const output = await statusCommand.handler("", createMockContext());

  assert.match(output, /Invariants:/);

  const invariantsCommand = harness.commands.get("self-runtime-invariants");
  const invariantsOutput = await invariantsCommand.handler("", createMockContext());
  assert.match(invariantsOutput, /Runtime Invariant Check/);

  await cleanup(tempDir);
});

test("bash command tracking stores actual command instead of toolCallId", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");

  toolCallHandler({ toolName: "bash", toolCallId: "bash-1", input: { command: "rg TODO src" } });
  toolResultHandler({ toolName: "bash", toolCallId: "bash-1", isError: false });

  const tool = harness.tools.get("self");
  const result = await tool.execute(
    "tc-commands",
    { query: "what commands have I run?" },
    null,
    null,
    createMockContext(),
  );

  assert.equal(result.details.data.total, 1);
  assert.equal(result.details.data.commands[0].command, "rg TODO src");
  assert.notEqual(result.details.data.commands[0].command, "bash-1");

  await cleanup(tempDir);
});

test("write tracking includes empty file content", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolCallHandler = harness.eventHandlers.get("tool_call");
  toolCallHandler({ toolName: "write", input: { path: "empty.txt", content: "" } });

  const tool = harness.tools.get("self");
  const result = await tool.execute(
    "tc-empty-write",
    { query: "What files have I touched?" },
    null,
    null,
    createMockContext(),
  );

  assert.equal(result.details.data.total, 1);
  assert.equal(result.details.data.files[0].path, "empty.txt");

  await cleanup(tempDir);
});

test("createExtension refreshes subagent state when sessionsDir changes", async () => {
  const { module, tempDir } = await loadExtensionWithMocks();

  const firstHarness = createPiHarness();
  module.createExtension("/tmp/subagent-a")(firstHarness.pi);
  const firstDispatch = firstHarness.tools.get("dispatch_subagent");
  const firstResult = await firstDispatch.execute("tc-a", {}, null, null, createMockContext());

  const secondHarness = createPiHarness();
  module.createExtension("/tmp/subagent-b")(secondHarness.pi);
  const secondDispatch = secondHarness.tools.get("dispatch_subagent");
  const secondResult = await secondDispatch.execute("tc-b", {}, null, null, createMockContext());

  assert.equal(firstResult.details.sessionsDir, "/tmp/subagent-a");
  assert.equal(secondResult.details.sessionsDir, "/tmp/subagent-b");

  await cleanup(tempDir);
});

test("default extension state is isolated per registration", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();

  const firstHarness = createPiHarness();
  extension(firstHarness.pi);
  firstHarness.eventHandlers.get("tool_call")({
    toolName: "edit",
    input: { path: "a.ts", oldText: "a", newText: "ab" },
  });
  const firstResult = await firstHarness.tools
    .get("self")
    .execute("tc-first", { query: "What files have I touched?" }, null, null, createMockContext());

  const secondHarness = createPiHarness();
  extension(secondHarness.pi);
  const secondResult = await secondHarness.tools
    .get("self")
    .execute("tc-second", { query: "What files have I touched?" }, null, null, createMockContext());

  assert.equal(firstResult.details.data.total, 1);
  assert.equal(secondResult.details.data.total, 0);

  await cleanup(tempDir);
});
