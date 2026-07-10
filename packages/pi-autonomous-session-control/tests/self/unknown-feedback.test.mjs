import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: records session-local self-evolution feedback without owner writes", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const candidateResult = await tool.execute(
    "tc-self-feedback-candidate",
    {
      query: "self-evolution",
      context: {
        summary: "candidate feedback was previously unbound",
        hypothesis: "candidate ids were not stored",
        metric: "unbound_feedback_rate=0",
        falsifier: "feedback accepts a nonexistent candidate id",
        owner: "pi-autonomous-session-control",
        nextSafeTest: "record feedback against this exact candidate",
      },
    },
    null,
    null,
    ctx,
  );
  const candidateId = candidateResult.details.data.evolutionCandidate.candidateId;

  const result = await tool.execute(
    "tc-self-feedback-helpful",
    {
      query: "self feedback: helpful — self.evolution_candidate.v1 routed the owner correctly",
      context: {
        targetKind: "self.evolution_candidate.v1",
        candidateId,
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
  assert.equal(result.details.data.feedback.targetId, candidateId);
  assert.equal(result.details.data.feedback.bound, true);
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
