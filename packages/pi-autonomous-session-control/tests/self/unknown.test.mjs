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

test("self query: diagnostic review uses provided context for candidate payload", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-context",
    {
      query: "dogfood self",
      context: {
        summary: "self failed to use sendUserMessage until the operator pushed twice",
        category: "workflow_friction",
        tool: "self",
        package: "pi-autonomous-session-control",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    result.details.data.diagnosticCandidate.summary,
    "self failed to use sendUserMessage until the operator pushed twice",
  );
  assert.equal(result.details.data.diagnosticCandidate.category, "workflow_friction");
  assert.match(result.details.data.diagnosticCandidate.copyableCommands[1], /action: "preview"/);
  assert.match(
    result.details.data.diagnosticCandidate.copyableCommands[1],
    /self failed to use sendUserMessage/,
  );
  assert.match(result.details.data.diagnosticCandidate.copyableCommands[2], /action: "record"/);

  await cleanup(tempDir);
});

test("self query: diagnostic review falls back to recent mirror error evidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");

  toolCallHandler({ toolName: "bash", toolCallId: "bad-cmd", input: { command: "false" } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: "bad-cmd",
    isError: true,
    content: [{ type: "text", text: "Command exited with code 1" }],
  });

  const result = await tool.execute(
    "tc-diagnostic-review-evidence",
    { query: "what friction just happened?" },
    null,
    null,
    ctx,
  );

  assert.match(result.details.data.diagnosticCandidate.summary, /recent bash friction/);
  assert.equal(result.details.data.diagnosticCandidate.category, "tool_failure");
  assert.equal(result.details.data.diagnosticCandidate.tool, "bash");
  assert.equal(result.details.data.diagnosticCandidate.mirrorEvidence.latestError.toolName, "bash");

  await cleanup(tempDir);
});
