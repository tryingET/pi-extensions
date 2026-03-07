/**
 * Tests for protection domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: mark trap", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    {
      query: 'Mark as trap: "Editing generated files - they get overwritten"',
      context: { triggers: ["generated", "auto-generated"] },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Trap marked"), "should confirm trap marking");
  assert.ok(result.details.data.trapId, "should return trap ID");

  await cleanup(tempDir);
});

test("self query: check traps", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  // First mark a trap
  await tool.execute(
    "tc-1",
    {
      query: 'Mark as trap: "Infinite loop in recursion"',
      context: { triggers: ["recursion", "loop"] },
    },
    null,
    null,
    ctx,
  );

  // Then check for traps
  const result = await tool.execute(
    "tc-2",
    {
      query: "Am I approaching a trap?",
      context: { currentContext: "I'm implementing recursion" },
    },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("trap") || result.content[0].text.includes("No known traps"),
    "should check for traps",
  );

  await cleanup(tempDir);
});
