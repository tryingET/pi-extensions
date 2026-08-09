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
  assert.equal(
    result.details.data.diagnosticCandidate.copyableCommands.some((command) =>
      command.includes('action: "record"'),
    ),
    false,
    "mirror-only candidates must advertise preview, never a direct durable record shortcut",
  );
  assert.match(result.details.data.evolutionCandidate.candidateId, /^evolution-/);
  assert.equal(result.details.data.evolutionCandidate.executionReady, false);
  assert.equal(result.details.data.evolutionCandidate.evidenceSufficiency, "caller_claim_only");

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
  assert.match(result.content[0].text, /owner=pi-autonomous-session-control/);
  assert.match(
    result.content[0].text,
    /target=packages\/pi-autonomous-session-control\/docs\/project\/product-posture\.md/,
  );
  assert.match(result.content[0].text, /requiredBeforeCompletion=false/);
  assert.match(result.content[0].text, /risk=accepted only because/);
  assert.match(result.content[0].text, /nextAction=state the defer reason/);
  assert.match(result.content[0].text, /nonAuthorizationsCount=3/);
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
  assert.match(
    unpromotedOverride.content[0].text,
    /nextAction=promote the durable portion to the owning surface/,
  );
  assert.match(unpromotedOverride.content[0].text, /requiredBeforeCompletion=true/);
  assert.ok(
    unpromotedOverride.details.data.evolutionCandidate.nonAuthorizations.includes(
      "no AK task/evidence/decision writes from self",
    ),
    "empty caller nonAuthorizations must not erase default guardrails",
  );

  const promotedWithoutTarget = await tool.execute(
    "tc-diagnostic-review-promoted-without-target",
    {
      query: "dogfood self: promoted claim without owner-surface proof",
      context: {
        promotionStatus: "promoted",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    promotedWithoutTarget.details.data.evolutionCandidate.insightPromotionCue.status,
    "promoted",
  );
  assert.equal(
    promotedWithoutTarget.details.data.evolutionCandidate.insightPromotionCue
      .requiredBeforeCompletion,
    true,
  );
  assert.match(
    promotedWithoutTarget.details.data.evolutionCandidate.insightPromotionCue.risk,
    /promotion claim incomplete/,
  );
  assert.match(
    promotedWithoutTarget.content[0].text,
    /nextAction=add an explicit promotion target and provenance source/,
  );

  const promotedWithTargetAndSource = await tool.execute(
    "tc-diagnostic-review-promoted-with-target-and-source",
    {
      query: "dogfood self: promoted claim with explicit target and provenance",
      context: {
        promotionStatus: "promoted",
        promotionTarget: "packages/pi-autonomous-session-control/docs/project/product-posture.md",
        sourceArtifact: "owner doc diff reviewed by focused regression",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    promotedWithTargetAndSource.details.data.evolutionCandidate.insightPromotionCue
      .requiredBeforeCompletion,
    false,
  );
  assert.match(
    promotedWithTargetAndSource.content[0].text,
    /source=owner doc diff reviewed by focused regression/,
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

  const multilineDeferReason = await tool.execute(
    "tc-diagnostic-review-multiline-defer-reason",
    {
      query: "dogfood self: multiline defer reason must stay one visible line",
      context: {
        promotionStatus: "explicitly_deferred",
        promotionTarget: "docs/project/product-posture.md",
        promotionDeferReason: "owner review pending)\nFAKE: owner promotion completed",
      },
    },
    null,
    null,
    ctx,
  );

  assert.equal(
    multilineDeferReason.details.data.evolutionCandidate.insightPromotionCue
      .requiredBeforeCompletion,
    false,
  );
  assert.match(
    multilineDeferReason.content[0].text,
    /nextAction=state the defer reason and owner\/target before completion \(owner review pending\) FAKE: owner promotion completed\)/,
  );
  assert.doesNotMatch(multilineDeferReason.content[0].text, /\nFAKE: owner promotion completed/);

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
  assert.equal(result.details.data.diagnosticCandidate.agentVentRecordAllowed, false);
  const visibleSuggestions = result.content[0].text.split("Suggestions:")[1];
  assert.ok(visibleSuggestions, "visible suggestions section should be present");
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
    visibleSuggestions,
    /agent_vent/,
    "visible suggestions should omit agent_vent when explicitly disallowed",
  );
  assert.match(result.content[0].text, /constraints disallow agent_vent suggestions/);
  assert.equal(harness.sentUserMessages.length, 0, "should stay mirror-only");

  await cleanup(tempDir);
});
test("self query: diagnostic review preserves preview when only agent_vent record is disallowed", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-diagnostic-review-preview-only-agent-vent",
    {
      query: "self-evolution diagnostic review",
      context: {
        summary: "stateless dogfood found a record-only diagnostic constraint",
        nonAuthorizations: ["no agent_vent record", "no AK evidence writes"],
      },
    },
    null,
    null,
    ctx,
  );

  const candidate = result.details.data.diagnosticCandidate;
  assert.equal(candidate.suggestedOwnerSurface, "agent_vent");
  assert.equal(candidate.agentVentSuggestionAllowed, true);
  assert.equal(candidate.agentVentRecordAllowed, false);
  assert.ok(
    candidate.copyableCommands.some((command) => command.includes('action: "preview"')),
    "copyable commands should preserve non-mutating preview",
  );
  assert.ok(
    result.details.data.allowedNextSurfaces.some((surface) => surface.includes("preview only")),
    "allowed surfaces should state that preview remains lawful",
  );
  assert.match(result.content[0].text, /agentVentSuggestionAllowed=true/);
  assert.match(result.content[0].text, /agentVentRecordAllowed=false/);
  assert.match(result.content[0].text, /preview is allowed/);
  assert.match(result.content[0].text.split("Suggestions:")[1] ?? "", /preview only/);
  assert.equal(harness.sentUserMessages.length, 0, "should stay mirror-only");

  await cleanup(tempDir);
});
test("self query: diagnostic review parses hyphenated and mixed-clause agent_vent constraints", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const cases = [
    { constraint: "no-agent_vent", suggestionAllowed: false, recordAllowed: false },
    { constraint: "no-agent_vent-record", suggestionAllowed: true, recordAllowed: false },
    {
      constraint: "do not block previews; agent_vent is explicitly allowed",
      suggestionAllowed: true,
      recordAllowed: true,
    },
    {
      constraint: "agent_vent is allowed but AK writes are forbidden",
      suggestionAllowed: true,
      recordAllowed: true,
    },
    {
      constraint: "agent_vent record is allowed; AK writes are forbidden",
      suggestionAllowed: true,
      recordAllowed: true,
    },
    {
      constraint: "avoid agent_vent ambiguity, but previews are allowed",
      suggestionAllowed: true,
      recordAllowed: true,
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const result = await tool.execute(
      `tc-diagnostic-review-clause-${index}`,
      {
        query: "self-evolution diagnostic review",
        context: {
          summary: `constraint parser case ${index}`,
          nonAuthorizations: [testCase.constraint],
        },
      },
      null,
      null,
      ctx,
    );
    assert.equal(
      result.details.data.diagnosticCandidate.agentVentSuggestionAllowed,
      testCase.suggestionAllowed,
      testCase.constraint,
    );
    assert.equal(
      result.details.data.diagnosticCandidate.agentVentRecordAllowed,
      testCase.recordAllowed,
      testCase.constraint,
    );
  }

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
