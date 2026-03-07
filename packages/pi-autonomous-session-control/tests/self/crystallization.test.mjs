/**
 * Tests for crystallization domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: remember pattern", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    {
      query: 'Remember: "Always check for null before accessing properties"',
      context: { topic: "safety" },
    },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("Pattern crystallized"),
    "should confirm crystallization",
  );
  assert.ok(result.details.data.patternId, "should return pattern ID");

  await cleanup(tempDir);
});

test("self query: recall patterns", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  // First remember something
  await tool.execute(
    "tc-1",
    { query: 'Remember: "Test pattern for recall"', context: { topic: "test" } },
    null,
    null,
    ctx,
  );

  // Then recall it
  const result = await tool.execute(
    "tc-2",
    { query: "What did I learn?", context: { topic: "test" } },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("pattern"), "should mention patterns");

  await cleanup(tempDir);
});
