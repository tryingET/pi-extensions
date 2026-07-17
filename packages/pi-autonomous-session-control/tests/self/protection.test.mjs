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

test("self query: mark trap with capability-map content is not hijacked by capability discovery", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-capability-map-trap",
    { query: "Mark as trap: capability map can be stale during routing" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "protection");
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

test("self query: list traps can filter and summarize by topic", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  await tool.execute(
    "tc-topic-trap-1",
    {
      query: 'Mark as trap: "Treating peer messages as durable evidence"',
      context: { topic: "peer protocol", triggers: ["intercom"] },
    },
    null,
    null,
    ctx,
  );
  await tool.execute(
    "tc-topic-trap-2",
    {
      query: 'Mark as trap: "Skipping validation after edits"',
      context: { topic: "validation", triggers: ["tests"] },
    },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-topic-trap-3",
    { query: "List traps about peer protocol" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.count, 1);
  assert.equal(
    result.details.data.traps[0].description,
    "Treating peer messages as durable evidence",
  );
  assert.ok(result.content[0].text.includes('topic "peer protocol"'));
  assert.deepEqual(result.details.data.topicSummary, [{ topic: "peer protocol", count: 1 }]);

  const explicitTopic = await tool.execute(
    "tc-topic-trap-explicit",
    { query: "List traps for topic: validation" },
    null,
    null,
    ctx,
  );

  assert.equal(explicitTopic.details.intent, "protection");
  assert.equal(explicitTopic.details.data.count, 1);
  assert.equal(explicitTopic.details.data.traps[0].topic, "validation");

  const topicSummary = await tool.execute(
    "tc-topic-trap-summary-routing",
    { query: "List traps with a topic summary" },
    null,
    null,
    ctx,
  );

  assert.equal(topicSummary.details.intent, "protection");
  assert.equal(topicSummary.details.data.count, 2);
  assert.deepEqual(topicSummary.details.data.topicSummary, [
    { topic: "peer protocol", count: 1 },
    { topic: "validation", count: 1 },
  ]);

  const proximity = await tool.execute(
    "tc-topic-trap-proximity",
    {
      query: "Am I approaching a trap?",
      context: { currentContext: "I am reviewing the peer protocol" },
    },
    null,
    null,
    ctx,
  );

  assert.equal(proximity.details.data.approachingTraps.length, 0);
  assert.ok(proximity.content[0].text.includes("No known traps"));

  await cleanup(tempDir);
});
