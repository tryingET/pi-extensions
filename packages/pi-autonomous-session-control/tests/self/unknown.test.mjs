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
  assert.ok(
    result.content[0].text.includes("self.evolution_candidate.v1"),
    "text response should expose typed evolution candidate kind for stateless probes",
  );
  assert.ok(result.content[0].text.includes("No authority changed"), "should state boundary");
  assert.equal(
    result.details.data.diagnosticCandidate.kind,
    "self.diagnostic_candidate.v1",
    "should return typed candidate payload",
  );
  assert.equal(
    result.details.data.evolutionCandidate.kind,
    "self.evolution_candidate.v1",
    "should return typed self-evolution candidate payload",
  );
  assert.ok(result.details.data.evolutionCandidate.falsifier, "should name falsifier");
  assert.ok(result.details.data.evolutionCandidate.metric, "should name metric");
  assert.ok(result.details.data.evolutionCandidate.nextSafeTest, "should name next safe test");
  assert.deepEqual(
    result.details.data.evolutionCandidate.nonAuthorizations.includes(
      "no action-state mutation from diagnostic/self-evolution queries",
    ),
    true,
  );
  assert.equal(result.details.data.diagnosticCandidate.suggestedOwnerSurface, "agent_vent");
  assert.equal(harness.sentUserMessages.length, 0, "should not send a hidden continuation");

  await cleanup(tempDir);
});

test("self query: diagnostic review with incidental action words remains mirror-only", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-action-collision",
    { query: "Dogfood self: big-picture query created checkpoint" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, true, "should understand diagnostic-review query");
  assert.equal(result.details.intent, "meta");
  assert.equal(result.details.data.evolutionCandidate.kind, "self.evolution_candidate.v1");
  assert.match(result.content[0].text, /No authority changed/);

  const actionSummary = await tool.execute(
    "tc-diagnostic-action-collision-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.match(actionSummary.content[0].text, /checkpoints=0/);

  await cleanup(tempDir);
});

test("self query: diagnostic review recognizes self-evolution phrasing", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-self-evolution",
    { query: "self-evolution: improve the next diagnostic affordance" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, true, "should understand self-evolution query");
  assert.equal(result.details.intent, "meta");
  assert.ok(result.content[0].text.includes("Diagnostic review"));
  assert.equal(
    result.details.data.diagnosticCandidate.sourceQuery,
    "self-evolution: improve the next diagnostic affordance",
  );
  assert.equal(result.details.data.diagnosticCandidate.suggestedOwnerSurface, "agent_vent");
  assert.equal(harness.sentUserMessages.length, 0, "should stay mirror-only");

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
  assert.match(result.details.data.diagnosticCandidate.copyableCommands[1], /packageName: /);
  assert.doesNotMatch(result.details.data.diagnosticCandidate.copyableCommands[1], /package: /);
  assert.match(
    result.details.data.diagnosticCandidate.copyableCommands[1],
    /self failed to use sendUserMessage/,
  );
  assert.match(result.details.data.diagnosticCandidate.copyableCommands[2], /action: "record"/);

  await cleanup(tempDir);
});

test("self query: diagnostic review honors correction context before recent errors", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");

  toolCallHandler({ toolName: "bash", toolCallId: "bad-cmd-context", input: { command: "false" } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: "bad-cmd-context",
    isError: true,
    content: [{ type: "text", text: "Command exited with code 1" }],
  });

  const result = await tool.execute(
    "tc-diagnostic-review-correction-context",
    {
      query: "self-evolution",
      context: {
        correction:
          "operator meant pi-autonomous-session-control continuation, not the latest workstation incident",
        package: "pi-autonomous-session-control",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    result.details.data.diagnosticCandidate.summary,
    "operator meant pi-autonomous-session-control continuation, not the latest workstation incident",
  );
  assert.equal(result.details.data.diagnosticCandidate.category, "context_alignment");
  assert.equal(result.details.data.diagnosticCandidate.tool, "self");
  assert.equal(
    result.details.data.diagnosticCandidate.mirrorEvidence.latestError.toolName,
    "bash",
    "recent error remains evidence, but no longer hijacks the candidate summary",
  );

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

test("self query: records session-local self-evolution feedback without owner writes", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-self-feedback-helpful",
    {
      query: "self feedback: helpful — self.evolution_candidate.v1 routed the owner correctly",
      context: {
        targetKind: "self.evolution_candidate.v1",
        candidateId: "candidate-1",
        owner: "pi-autonomous-session-control",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, true);
  assert.equal(result.details.intent, "meta");
  assert.ok(result.content[0].text.includes("Self-evolution feedback recorded"));
  assert.equal(result.details.data.feedback.kind, "self.suggestion_feedback.v1");
  assert.equal(result.details.data.feedback.outcome, "helpful");
  assert.equal(result.details.data.feedback.targetKind, "self.evolution_candidate.v1");
  assert.equal(result.details.data.feedback.targetId, "candidate-1");
  assert.equal(result.details.data.feedbackCounts.helpful, 1);
  assert.equal(result.details.data.ledgerScope, "session-local-bounded");
  assert.deepEqual(
    result.details.data.feedback.nonAuthorizations.includes(
      "no agent_vent record from feedback capture",
    ),
    true,
  );
  assert.equal(harness.sentUserMessages.length, 0, "feedback must not send hidden messages");

  const summary = await tool.execute(
    "tc-self-feedback-summary",
    { query: "self feedback summary" },
    null,
    null,
    ctx,
  );

  assert.match(summary.content[0].text, /helpful=1/);
  assert.equal(summary.details.data.durableWrites, false);
  assert.equal(summary.details.data.feedback.length, 1);

  const actionSummary = await tool.execute(
    "tc-self-feedback-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.equal(actionSummary.details.data.followups.length, 0);

  await cleanup(tempDir);
});

test("self query: feedback with self-evolution and checkpoint words does not mutate action state", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-self-feedback-collision",
    {
      query: "self-evolution feedback: unsafe checkpoint suggestion would have written AK evidence",
    },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "meta");
  assert.equal(result.details.data.feedback.outcome, "unsafe");
  assert.match(result.content[0].text, /No authority changed/);

  const actionSummary = await tool.execute(
    "tc-self-feedback-collision-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.match(actionSummary.content[0].text, /checkpoints=0/);

  await cleanup(tempDir);
});
