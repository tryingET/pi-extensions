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
  assert.equal(
    result.details.data.evolutionCandidate.insightPromotionCue.kind,
    "self.insight_promotion_cue.v1",
  );
  assert.equal(
    result.details.data.evolutionCandidate.insightPromotionCue.status,
    "session_only_unpromoted",
  );
  assert.equal(
    result.details.data.evolutionCandidate.insightPromotionCue.requiredBeforeCompletion,
    true,
  );
  assert.match(
    result.details.data.evolutionCandidate.insightPromotionCue.risk,
    /lost rationale risk/,
  );
  assert.match(
    result.details.data.evolutionCandidate.insightPromotionCue.nextAction,
    /promote the durable portion/,
  );
  assert.doesNotMatch(
    result.details.data.evolutionCandidate.insightPromotionCue.risk,
    /low if the named owner surface/,
  );
  assert.match(result.content[0].text, /Insight promotion cue/);
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

test("self query: explicit remember wins over self-evolution diagnostic keywords", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const pattern =
    "For ASC/self-evolution live dogfood, explicit crystallization should beat diagnostic_review, feedback, and checkpoint words";

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
    "self-evolution diagnostic feedback wording with checkpoint content can hijack protection storage";

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

test("self query: diagnostic review surfaces explicit insight promotion status without owner writes", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-promotion-cue",
    {
      query: "dogfood self: promote session-only insight cue",
      context: {
        summary: "subagent review found a durable routing rationale",
        sourceArtifact: "subagent deep-review summary",
        promotionStatus: "explicitly_deferred",
        promotionTarget: "packages/pi-autonomous-session-control/docs/project/product-posture.md",
        promotionDeferReason: "owner doc will be updated after focused regression",
        owner: "pi-autonomous-session-control",
      },
    },
    null,
    null,
    ctx,
  );

  const cue = result.details.data.evolutionCandidate.insightPromotionCue;
  assert.equal(cue.kind, "self.insight_promotion_cue.v1");
  assert.equal(cue.sourceArtifact, "subagent deep-review summary");
  assert.equal(cue.status, "explicitly_deferred");
  assert.equal(
    cue.target,
    "packages/pi-autonomous-session-control/docs/project/product-posture.md",
  );
  assert.equal(cue.requiredBeforeCompletion, false);
  assert.match(cue.nextAction, /owner doc will be updated after focused regression/);
  assert.match(cue.boundary, /mirror-only promotion cue/);
  assert.match(result.content[0].text, /requiredBeforeCompletion=false/);
  assert.match(result.content[0].text, /No authority changed/);
  assert.equal(harness.sentUserMessages.length, 0, "should not send hidden messages");

  const actionSummary = await tool.execute(
    "tc-diagnostic-review-promotion-cue-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );
  assert.equal(actionSummary.details.data.checkpoints.length, 0);

  await cleanup(tempDir);
});

test("self query: diagnostic review fails closed on unresolved insight promotion overrides", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const unpromotedOverride = await tool.execute(
    "tc-diagnostic-review-promotion-required-override",
    {
      query: "dogfood self: do not trust caller completion override",
      context: {
        promotionRequiredBeforeCompletion: false,
        nonAuthorizations: [],
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    unpromotedOverride.details.data.evolutionCandidate.insightPromotionCue.status,
    "session_only_unpromoted",
  );
  assert.equal(
    unpromotedOverride.details.data.evolutionCandidate.insightPromotionCue.requiredBeforeCompletion,
    true,
  );
  assert.match(
    unpromotedOverride.details.data.evolutionCandidate.insightPromotionCue.nextAction,
    /promote the durable portion/,
  );
  assert.ok(
    unpromotedOverride.details.data.evolutionCandidate.nonAuthorizations.includes(
      "no AK task/evidence/decision writes from self",
    ),
    "empty caller nonAuthorizations must not erase default guardrails",
  );

  const deferredWithoutReason = await tool.execute(
    "tc-diagnostic-review-deferred-without-reason",
    {
      query: "dogfood self: incomplete explicit deferral",
      context: {
        promotionStatus: "explicitly_deferred",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    deferredWithoutReason.details.data.evolutionCandidate.insightPromotionCue.status,
    "explicitly_deferred",
  );
  assert.equal(
    deferredWithoutReason.details.data.evolutionCandidate.insightPromotionCue
      .requiredBeforeCompletion,
    true,
  );
  assert.match(
    deferredWithoutReason.details.data.evolutionCandidate.insightPromotionCue.risk,
    /defer claim incomplete/,
  );

  const deferredWithoutDestination = await tool.execute(
    "tc-diagnostic-review-deferred-without-owner-target",
    {
      query: "dogfood self: incomplete explicit deferral destination",
      context: {
        promotionStatus: "explicitly_deferred",
        promotionDeferReason: "will promote after owner review",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    deferredWithoutDestination.details.data.evolutionCandidate.insightPromotionCue.status,
    "explicitly_deferred",
  );
  assert.equal(
    deferredWithoutDestination.details.data.evolutionCandidate.insightPromotionCue
      .requiredBeforeCompletion,
    true,
  );
  assert.match(
    deferredWithoutDestination.details.data.evolutionCandidate.insightPromotionCue.risk,
    /owner\/target and reason/,
  );

  const unknownStatus = await tool.execute(
    "tc-diagnostic-review-unknown-promotion-status",
    {
      query: "dogfood self: unrecognized promotion status must stay unresolved",
      context: {
        promotionStatus: "deferred_but_probably_promoted",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(unknownStatus.details.data.evolutionCandidate.insightPromotionCue.status, "unknown");
  assert.equal(
    unknownStatus.details.data.evolutionCandidate.insightPromotionCue.requiredBeforeCompletion,
    true,
  );
  assert.match(
    unknownStatus.details.data.evolutionCandidate.insightPromotionCue.nextAction,
    /normalize the promotion status/,
  );
  assert.doesNotMatch(
    unknownStatus.details.data.evolutionCandidate.insightPromotionCue.risk,
    /low if the named owner surface/,
  );
  assert.equal(harness.sentUserMessages.length, 0, "should not send hidden messages");

  await cleanup(tempDir);
});

test("self query: diagnostic review honors non-authorization against agent_vent suggestions", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-no-agent-vent",
    {
      query: "self-evolution diagnostic review; constraints say no agent_vent",
      context: {
        summary: "stateless dogfood found a wrong-owner diagnostic suggestion",
        nonAuthorizations: ["no agent_vent", "no AK evidence writes"],
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.understood, true);
  assert.equal(result.details.intent, "meta");
  assert.equal(
    result.details.data.diagnosticCandidate.suggestedOwnerSurface,
    "self_diagnostic_review_only",
  );
  assert.equal(result.details.data.diagnosticCandidate.agentVentSuggestionAllowed, false);
  assert.match(result.content[0].text, /ownerSurface=self_diagnostic_review_only/);
  assert.match(result.content[0].text, /agentVentSuggestionAllowed=false/);
  assert.doesNotMatch(
    JSON.stringify(result.details.data.diagnosticCandidate.copyableCommands),
    /agent_vent/,
    "copyable commands should omit agent_vent when explicitly disallowed",
  );
  assert.doesNotMatch(
    JSON.stringify(result.details.data.allowedNextSurfaces),
    /agent_vent/,
    "allowed next surfaces should omit agent_vent when explicitly disallowed",
  );
  assert.doesNotMatch(
    result.content[0].text.split("Suggestions:")[1] ?? "",
    /agent_vent/,
    "visible suggestions should omit agent_vent when explicitly disallowed",
  );
  assert.match(result.content[0].text, /constraints disallow agent_vent suggestions/);
  assert.equal(harness.sentUserMessages.length, 0, "should stay mirror-only");

  await cleanup(tempDir);
});

test("self query: diagnostic review requires external check for repeated self-analysis", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-reflection-guard-required",
    {
      query:
        "self-evolution again: repeated reflection is looping and the caller says completion is fine",
      context: {
        summary: "recursive self-analysis has repeated without a concrete validation signal",
        reflectionRequiredBeforeCompletion: false,
        repeatedReflection: true,
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.reflectionGuard;
  assert.equal(guard.kind, "self.reflection_guard.v1");
  assert.equal(guard.status, "external_check_required");
  assert.equal(guard.requiresExternalCheck, true);
  assert.match(guard.reason, /without an external validation signal/);
  assert.match(guard.nextAction, /concrete check/);
  assert.match(result.content[0].text, /Reflection guard/);
  assert.match(result.content[0].text, /requiresExternalCheck=true/);
  assert.equal(
    result.details.data.evolutionCandidate.trace.check,
    guard.nextAction,
    "unresolved repeated reflection should replace recursive check text with a concrete-stop action",
  );
  assert.ok(
    guard.nonAuthorizations.includes(
      "no completion override while repeated self-analysis lacks a concrete check signal",
    ),
  );
  assert.equal(harness.sentUserMessages.length, 0, "reflection guard must not send messages");

  const actionSummary = await tool.execute(
    "tc-diagnostic-review-reflection-guard-required-action-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );
  assert.equal(actionSummary.details.data.checkpoints.length, 0);
  assert.equal(actionSummary.details.data.followups.length, 0);

  await cleanup(tempDir);
});

test("self query: diagnostic review does not treat negated external-check text as observed", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-reflection-guard-negated-check",
    {
      query: "self-evolution repeated reflection without external check",
      context: {
        summary: "live dogfood phrasing should not by itself count as validation",
        repeatedReflection: true,
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.reflectionGuard;
  assert.equal(guard.kind, "self.reflection_guard.v1");
  assert.equal(guard.status, "external_check_required");
  assert.equal(guard.requiresExternalCheck, true);
  assert.match(guard.nextAction, /concrete check/);
  assert.equal(harness.sentUserMessages.length, 0, "negated check text remains mirror-only");

  await cleanup(tempDir);
});

test("self query: diagnostic review resolves reflection guard only with concrete check signal", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-reflection-guard-resolved",
    {
      query: "self-evolution repeated reflection after focused regression passed",
      context: {
        repeatedSelfAnalysis: "repeated",
        externalValidation: "focused regression and package check passed",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.reflectionGuard;
  assert.equal(guard.kind, "self.reflection_guard.v1");
  assert.equal(guard.status, "external_check_observed");
  assert.equal(guard.requiresExternalCheck, false);
  assert.match(guard.nextAction, /state the concrete check signal/);
  assert.match(guard.boundary, /mirror-only reflection guard/);
  assert.match(result.content[0].text, /requiresExternalCheck=false/);
  assert.equal(harness.sentUserMessages.length, 0, "resolved guard remains mirror-only");

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
