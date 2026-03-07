/**
 * Tests for action domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: create checkpoint", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: 'Create checkpoint "before risky refactor"', context: { entryId: "entry-123" } },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Checkpoint created"), "should confirm checkpoint");
  assert.ok(result.details.data.checkpointId, "should return checkpoint ID");
  assert.ok(result.details.data.label, "should generate label");

  await cleanup(tempDir);
});

test("self query: queue followup", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    {
      query: "Queue followup: remember to test edge cases",
      context: { context: "after refactor" },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Follow-up queued"), "should confirm followup queued");
  assert.ok(result.details.data.followupId, "should return followup ID");

  await cleanup(tempDir);
});

test("self query: prefill editor", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "Prefill: implement the error handling for edge case X" },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("prefill") || result.content[0].text.includes("Prefill"),
    "should mention prefill",
  );
  assert.ok(result.details.data?.text, "should return prefill text");

  await cleanup(tempDir);
});

test("self query: remind me later", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "Remind me later to check the database indexes" },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("Follow-up queued"),
    "should recognize remind as followup",
  );

  await cleanup(tempDir);
});
