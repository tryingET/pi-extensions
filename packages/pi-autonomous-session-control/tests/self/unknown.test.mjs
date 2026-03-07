/**
 * Tests for unknown query handling.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: unknown query returns helpful message", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  // Use a longer query that doesn't match any keywords
  const result = await tool.execute(
    "tc-1",
    { query: "supercalifragilisticexpialidocious nonsense query" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, false, "should not understand");
  // Suggestions are embedded in the response text
  assert.ok(
    result.content[0].text.includes("Suggestions:"),
    "should include suggestions in response",
  );
  assert.ok(result.content[0].text.includes("files"), "should mention files in suggestions");

  await cleanup(tempDir);
});
