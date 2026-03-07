/**
 * Tests for direction domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: signal confidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "I'm confident about this approach", context: { context: "refactoring" } },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("Confidence signal"),
    "should confirm confidence signal",
  );
  assert.equal(result.details.data.level, "high", "should detect high confidence");

  await cleanup(tempDir);
});

test("self query: request help", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: 'I need help with "database schema design"', context: { urgency: "high" } },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Help request"), "should confirm help request");
  assert.equal(result.details.data.urgency, "high", "should honor context urgency override");

  await cleanup(tempDir);
});

test('self query: "help me" maps to direction help request (not meta capabilities)', async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-2",
    { query: 'Help me with "auth migration"' },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "direction");
  assert.ok(result.content[0].text.includes("Help request"), "should create help request");

  await cleanup(tempDir);
});

test('self query: "what branches" lists branches instead of requesting spawn context', async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-3", { query: "what branches?" }, null, null, ctx);

  assert.equal(result.details.intent, "direction");
  assert.ok(result.content[0].text.includes("No branches spawned"));

  await cleanup(tempDir);
});

test('self query: "compare branches" is handled explicitly', async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const originalNow = Date.now;

  Date.now = () => 1_732_100_000_000;

  try {
    await tool.execute(
      "tc-4a",
      { query: 'spawn branch "alt-A"', context: { entryId: "entry-1" } },
      null,
      null,
      ctx,
    );
    await tool.execute(
      "tc-4b",
      { query: 'spawn branch "alt-B"', context: { entryId: "entry-1" } },
      null,
      null,
      ctx,
    );

    const result = await tool.execute("tc-4c", { query: "compare branches" }, null, null, ctx);

    assert.equal(result.details.intent, "direction");
    assert.ok(result.content[0].text.includes("Comparison snapshot"));
    assert.equal(result.details.data.comparable, true);
    assert.equal(result.details.data.count, 2);
  } finally {
    Date.now = originalNow;
    await cleanup(tempDir);
  }
});
