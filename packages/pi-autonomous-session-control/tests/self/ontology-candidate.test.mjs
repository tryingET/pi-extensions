/**
 * Tests for ontology-candidate crystallization queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: remember and recall ontology candidate", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const remember = await tool.execute(
    "tc-1",
    {
      query: 'Remember ontology candidate: "Benchmark harness"',
      context: {
        candidateKind: "concept",
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
    remember.content[0].text.includes("Ontology candidate crystallized"),
    "should confirm ontology-candidate crystallization",
  );
  assert.ok(remember.details.data.candidateId, "should return candidate ID");

  const recall = await tool.execute(
    "tc-2",
    { query: "What ontology candidates have I crystallized?" },
    null,
    null,
    ctx,
  );

  assert.ok(
    recall.content[0].text.includes("ontology candidate"),
    "should mention ontology candidates",
  );
  assert.equal(recall.details.data.count, 1, "should recall one ontology candidate");
  assert.equal(recall.details.data.candidates[0].titleHint, "Benchmark harness");

  await cleanup(tempDir);
});

test("self query: reject ontology candidate persists across registrations", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const firstHarness = createPiHarness();

  extension(firstHarness.pi);

  const firstTool = firstHarness.tools.get("self");
  const ctx = createMockContext();

  const remember = await firstTool.execute(
    "tc-1",
    {
      query: 'Remember ontology candidate: "Benchmark harness"',
      context: {
        candidateKind: "concept",
        proposedScopeHint: "repo",
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
        labelHints: ["Benchmark harness"],
      },
    },
    null,
    null,
    ctx,
  );

  const candidateId = remember.details.data.candidateId;
  assert.ok(candidateId, "should create candidate before rejecting it");

  const rejected = await firstTool.execute(
    "tc-2",
    {
      query: "Mark ontology candidate as rejected",
      context: {
        candidateId,
        rejectionReason: "duplicate of benchmark metric",
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(rejected.content[0].text.includes("rejected"), "should confirm rejection");

  const secondHarness = createPiHarness();
  extension(secondHarness.pi);
  const secondTool = secondHarness.tools.get("self");

  const recall = await secondTool.execute(
    "tc-3",
    { query: "What ontology candidates have I crystallized?" },
    null,
    null,
    ctx,
  );

  assert.equal(recall.details.data.count, 1, "should reload persisted ontology candidate");
  assert.equal(
    recall.details.data.candidates[0].metadata.rejectionReason,
    "duplicate of benchmark metric",
    "should persist rejection reason",
  );

  await cleanup(tempDir);
});

test("self query: forget ontology candidate removes it", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const remember = await tool.execute(
    "tc-1",
    {
      query: 'Remember ontology candidate: "Experiment receipt"',
      context: {
        candidateKind: "concept",
        description: "Durable record emitted after an experiment run completes.",
      },
    },
    null,
    null,
    ctx,
  );

  const candidateId = remember.details.data.candidateId;

  const forgotten = await tool.execute(
    "tc-2",
    { query: "Forget ontology candidate", context: { candidateId } },
    null,
    null,
    ctx,
  );

  assert.ok(forgotten.content[0].text.includes("forgotten"), "should confirm forgetting");

  const recall = await tool.execute(
    "tc-3",
    { query: "What ontology candidates have I crystallized?" },
    null,
    null,
    ctx,
  );

  assert.equal(recall.details.data.count, 0, "should remove forgotten ontology candidate");

  await cleanup(tempDir);
});
