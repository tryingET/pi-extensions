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

test("self query: diagnostic review recognizes self-improvement friction without recording vents", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review",
    { query: "how can self improve after this annoying missing affordance?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, true, "should understand diagnostic-review query");
  assert.equal(result.details.intent, "meta");
  assert.ok(result.content[0].text.includes("Diagnostic review"), "should return review text");
  assert.ok(result.content[0].text.includes("No authority changed"), "should state boundary");
  assert.equal(
    result.details.data.diagnosticCandidate.kind,
    "self.diagnostic_candidate.v1",
    "should return typed candidate payload",
  );
  assert.equal(result.details.data.diagnosticCandidate.suggestedOwnerSurface, "agent_vent");
  assert.equal(harness.sentUserMessages.length, 0, "should not send a hidden continuation");

  await cleanup(tempDir);
});
