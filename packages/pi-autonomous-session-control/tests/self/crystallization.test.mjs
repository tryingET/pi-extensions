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

test("self query: remember memory status content is not hijacked by memory lifecycle status", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-memory-status-remember",
    { query: "Remember: memory lifecycle status can be stale after reload" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "crystallization");
  assert.ok(
    result.content[0].text.includes("Pattern crystallized"),
    "should remember memory-status content as a pattern",
  );
  assert.ok(result.details.data.patternId, "should return pattern ID");

  await cleanup(tempDir);
});

test("self query: forget memory status content is not hijacked by memory lifecycle status", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const remembered = await tool.execute(
    "tc-memory-status-forget-seed",
    { query: "Remember: memory status pattern for forgetting" },
    null,
    null,
    ctx,
  );

  const forgotten = await tool.execute(
    "tc-memory-status-forget",
    {
      query: "Forget memory lifecycle status pattern",
      context: { patternId: remembered.details.data.patternId },
    },
    null,
    null,
    ctx,
  );

  assert.equal(forgotten.details.intent, "crystallization");
  assert.ok(forgotten.content[0].text.includes("Pattern forgotten"));

  await cleanup(tempDir);
});

test("self query: remember capability-map content is not hijacked by capability discovery", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-capability-map-remember",
    { query: "Remember: capability map stale for ASC routing" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "crystallization");
  assert.ok(
    result.content[0].text.includes("Pattern crystallized"),
    "should remember capability-map content as a pattern",
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

test("self query: exact recall exposes verbatim pattern text for stateless dogfood", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const pattern =
    "stateless pi-p structured dogfood needs visible exact recall for self-evolution feedback checkpoint diagnostic_review words";

  await tool.execute(
    "tc-exact-recall-remember",
    { query: `Remember: ${pattern}`, context: { topic: "stateless-dogfood" } },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-exact-recall",
    { query: "recall exact patterns", context: { topic: "stateless-dogfood" } },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "crystallization");
  assert.equal(result.details.data.exactRecall, true);
  assert.ok(result.content[0].text.includes("verbatim visible recall"));
  assert.ok(result.content[0].text.includes(JSON.stringify(pattern)));
  assert.doesNotMatch(
    result.content[0].text,
    /structured dogfood needs visible exact recall.*\.\.\./,
  );

  const actionSummary = await tool.execute(
    "tc-exact-recall-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.equal(harness.sentUserMessages.length, 0);

  await cleanup(tempDir);
});

test("self query: recall patterns can filter by topic in natural language", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  await tool.execute(
    "tc-topic-1",
    { query: 'Remember: "Use bounded peer messages"', context: { topic: "peer protocol" } },
    null,
    null,
    ctx,
  );
  await tool.execute(
    "tc-topic-2",
    { query: 'Remember: "Run narrow tests first"', context: { topic: "validation" } },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-topic-3",
    { query: "Recall patterns about peer protocol" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.count, 1);
  assert.equal(result.details.data.patterns[0].topic, "peer protocol");
  assert.ok(result.content[0].text.includes('topic "peer protocol"'));
  assert.deepEqual(result.details.data.topicSummary, [{ topic: "peer protocol", count: 1 }]);

  const explicitTopic = await tool.execute(
    "tc-explicit-topic",
    { query: "Recall patterns for topic: validation" },
    null,
    null,
    ctx,
  );

  assert.equal(explicitTopic.details.data.count, 1);
  assert.equal(explicitTopic.details.data.patterns[0].topic, "validation");
  assert.ok(explicitTopic.content[0].text.includes('topic "validation"'));

  const summary = await tool.execute(
    "tc-topic-summary",
    { query: "topic summary" },
    null,
    null,
    ctx,
  );

  assert.equal(summary.details.data.count, 2);
  assert.ok(summary.content[0].text.includes("Topics:"));
  assert.deepEqual(summary.details.data.topicSummary, [
    { topic: "peer protocol", count: 1 },
    { topic: "validation", count: 1 },
  ]);

  await cleanup(tempDir);
});
