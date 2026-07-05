import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

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

test("self query: diagnostic continuation prose does not route visible-loop prefill", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  let editorText = "";
  const ctx = createMockContext({
    hasUI: true,
    ui: {
      setEditorText(text) {
        editorText = text;
      },
    },
  });

  for (const [index, query] of [
    "Dogfood self: continue the self-evolution analysis without launching visible-loop or agent_vent",
    "Dogfood self: continue self-evolution after checking the external signal; do not launch anything",
    `Dogfood self: ${"continue self-evolution ".repeat(200)}only analyze this noisy caller-controlled prose`,
  ].entries()) {
    editorText = "";
    const result = await tool.execute(
      `tc-self-evolution-continuation-prose-${index}`,
      { query },
      null,
      null,
      ctx,
    );

    assert.equal(result.details.understood, true, "should understand diagnostic-review query");
    assert.equal(result.details.intent, "meta");
    assert.equal(result.details.data.evolutionCandidate.kind, "self.evolution_candidate.v1");
    assert.equal(editorText, "");
    assert.equal(harness.sentUserMessages.length, 0, "should not send a hidden continuation");
    assert.match(result.content[0].text, /No authority changed/);
  }

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
