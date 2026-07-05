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
  assert.ok(result.content[0].text.includes("Dogfood self"), "should suggest diagnostic review");
  assert.ok(result.details.data.nearestIntents, "should expose nearest-intent recovery data");

  await cleanup(tempDir);
});
test("self query: explicit remember wins over self-evolution diagnostic keywords", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const pattern =
    "For ASC/self-evolution live dogfood, explicit crystallization should beat diagnostic_review, feedback, checkpoint, and continue with self-evolution words";

  const remember = await tool.execute(
    "tc-remember-self-evolution-collision",
    { query: `Remember: ${pattern}` },
    null,
    null,
    ctx,
  );

  assert.equal(remember.details.understood, true);
  assert.equal(remember.details.intent, "crystallization");
  assert.ok(remember.content[0].text.includes("Pattern crystallized"));
  assert.ok(remember.details.data.patternId, "should store a pattern");
  assert.equal(
    remember.details.data.diagnosticCandidate,
    undefined,
    "should not produce diagnostic candidate state",
  );

  const recall = await tool.execute(
    "tc-remember-self-evolution-collision-recall",
    { query: "What did I learn?" },
    null,
    null,
    ctx,
  );

  assert.equal(recall.details.intent, "crystallization");
  assert.equal(recall.details.data.count, 1);
  assert.equal(recall.details.data.patterns[0].content, pattern);
  assert.equal(recall.details.data.diagnosticCandidate, undefined);

  const actionSummary = await tool.execute(
    "tc-remember-self-evolution-collision-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.match(actionSummary.content[0].text, /checkpoints=0/);
  assert.equal(harness.sentUserMessages.length, 0, "should not send hidden messages");

  await cleanup(tempDir);
});
test("self query: explicit trap marking wins over self-evolution diagnostic keywords", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const description =
    "self-evolution diagnostic feedback wording with checkpoint and continue with self-evolution content can hijack protection storage";

  const mark = await tool.execute(
    "tc-trap-self-evolution-collision",
    { query: `Mark as trap: ${description}` },
    null,
    null,
    ctx,
  );

  assert.equal(mark.details.understood, true);
  assert.equal(mark.details.intent, "protection");
  assert.ok(mark.content[0].text.includes("Trap marked"));
  assert.ok(mark.details.data.trapId, "should store a trap");
  assert.equal(mark.details.data.diagnosticCandidate, undefined);

  const traps = await tool.execute(
    "tc-trap-self-evolution-collision-list",
    { query: "list traps" },
    null,
    null,
    ctx,
  );

  assert.equal(traps.details.intent, "protection");
  assert.equal(traps.details.data.traps.length, 1);
  assert.equal(traps.details.data.traps[0].description, description);

  const actionSummary = await tool.execute(
    "tc-trap-self-evolution-collision-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);

  await cleanup(tempDir);
});
