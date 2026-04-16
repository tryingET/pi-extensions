/**
 * Tests for semantic-pressure annotation queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: remember and recall semantic-pressure annotation", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const remember = await tool.execute(
    "sp-1",
    {
      query: 'Remember semantic pressure: "Benchmark harness"',
      context: {
        annotationKind: "concept",
        proposedScopeHint: "repo",
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
        labelHints: ["Benchmark harness"],
        confidence: 0.82,
        evidence: {
          files: ["docs/project/pi-autoresearch-rfc.md"],
          repeatedPhrases: ["benchmark harness"],
        },
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(
    remember.content[0].text.includes("Semantic-pressure annotation crystallized"),
    "should confirm semantic-pressure annotation crystallization",
  );
  assert.ok(remember.details.data.annotationId, "should return annotation ID alias");
  assert.equal(
    remember.details.data.annotationKind,
    "concept",
    "should expose annotation kind alias",
  );

  const recall = await tool.execute(
    "sp-2",
    { query: "What semantic-pressure annotations have I recorded?" },
    null,
    null,
    ctx,
  );

  assert.ok(
    recall.content[0].text.includes("semantic-pressure annotation"),
    "should mention semantic-pressure annotations",
  );
  assert.equal(recall.details.data.count, 1, "should recall one semantic-pressure annotation");
  assert.equal(recall.details.data.annotations[0].titleHint, "Benchmark harness");
  assert.equal(recall.details.data.candidates[0].titleHint, "Benchmark harness");

  await cleanup(tempDir);
});

test("self query: reject and forget semantic-pressure annotation via annotationId", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const remember = await tool.execute(
    "sp-1",
    {
      query: 'Remember semantic-pressure annotation: "Benchmark harness"',
      context: {
        annotationKind: "concept",
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
      },
    },
    null,
    null,
    ctx,
  );

  const annotationId = remember.details.data.annotationId;
  assert.ok(annotationId, "should create semantic-pressure annotation before rejecting it");

  const rejected = await tool.execute(
    "sp-2",
    {
      query: "Mark semantic-pressure annotation as rejected",
      context: {
        annotationId,
        rejectionReason: "duplicate of benchmark metric",
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(
    rejected.content[0].text.includes("Semantic-pressure annotation rejected"),
    "should confirm semantic-pressure annotation rejection",
  );

  const recall = await tool.execute(
    "sp-3",
    { query: "What semantic-pressure annotations have I recorded?" },
    null,
    null,
    ctx,
  );

  assert.equal(
    recall.details.data.annotations[0].metadata.rejectionReason,
    "duplicate of benchmark metric",
    "should persist rejection reason through annotation alias view",
  );

  const forgotten = await tool.execute(
    "sp-4",
    { query: "Forget semantic-pressure annotation", context: { annotationId } },
    null,
    null,
    ctx,
  );

  assert.ok(
    forgotten.content[0].text.includes("Semantic-pressure annotation forgotten"),
    "should confirm semantic-pressure annotation forgetting",
  );

  const recallAfterForget = await tool.execute(
    "sp-5",
    { query: "What semantic-pressure annotations have I recorded?" },
    null,
    null,
    ctx,
  );

  assert.equal(recallAfterForget.details.data.count, 0, "should remove forgotten annotation");

  await cleanup(tempDir);
});

test("self query: capability output advertises semantic-pressure annotations", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const capabilities = await tool.execute("sp-1", { query: "What can you do?" }, null, null, ctx);

  assert.ok(
    capabilities.content[0].text.includes("Remember semantic pressure"),
    "should advertise semantic-pressure remember queries",
  );
  assert.ok(
    capabilities.content[0].text.includes("What semantic-pressure annotations have I recorded?"),
    "should advertise semantic-pressure recall queries",
  );

  await cleanup(tempDir);
});
