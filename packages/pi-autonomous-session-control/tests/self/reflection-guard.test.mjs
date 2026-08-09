/**
 * Tests for diagnostic-review reflection guard handling.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function recordBash(harness, id, command, options = {}) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");
  toolCallHandler({ toolName: "bash", toolCallId: id, input: { command } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: id,
    isError: options.isError ?? false,
    content: [{ type: "text", text: options.text ?? "ok" }],
  });
}

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
        nonAuthorizations: ["no-agent_vent-record"],
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
  assert.match(guard.reason, /without an explicit positive external validation signal/);
  assert.match(guard.nextAction, /concrete check/);
  assert.match(result.content[0].text, /Reflection guard/);
  assert.match(result.content[0].text, /externalCheckStatus=unknown/);
  assert.match(result.content[0].text, /requiresExternalCheck=true/);
  assert.match(result.content[0].text, /reflection guard requires an external check now/);
  assert.equal(
    result.details.data.diagnosticCandidate.suggestedOwnerSurface,
    "external_check_required",
  );
  assert.equal(result.details.data.diagnosticCandidate.agentVentSuggestionAllowed, false);
  assert.equal(result.details.data.diagnosticCandidate.agentVentRecordAllowed, false);
  assert.doesNotMatch(
    JSON.stringify(result.details.data.diagnosticCandidate.copyableCommands),
    /agent_vent/,
  );
  assert.doesNotMatch(JSON.stringify(result.details.data.allowedNextSurfaces), /agent_vent/);
  assert.doesNotMatch(result.content[0].text.split("Suggestions:")[1] ?? "", /agent_vent/);
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

test("self query: diagnostic review does not treat required or failed check text as observed", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const required = await tool.execute(
    "tc-diagnostic-review-reflection-guard-required-status-text",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalValidation: "required",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    required.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
  );
  assert.equal(
    required.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "required",
  );
  assert.equal(
    required.details.data.evolutionCandidate.reflectionGuard.requiresExternalCheck,
    true,
  );

  const requiredWithNamedCheck = await tool.execute(
    "tc-diagnostic-review-reflection-guard-required-named-check-text",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheckStatus: "required",
        externalCheck: "package check required before completion",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    requiredWithNamedCheck.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
  );
  assert.equal(
    requiredWithNamedCheck.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "required",
    "required/pending named-check text should remain required, not be classified as failed",
  );
  assert.match(requiredWithNamedCheck.content[0].text, /externalCheckStatus=required/);

  const failed = await tool.execute(
    "tc-diagnostic-review-reflection-guard-failed-check-text",
    {
      query: "self-evolution repeated reflection external check not passed",
      context: {
        repeatedReflection: true,
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    failed.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
  );
  assert.equal(failed.details.data.evolutionCandidate.reflectionGuard.requiresExternalCheck, true);

  const queryOnly = await tool.execute(
    "tc-diagnostic-review-reflection-guard-query-only-check-text",
    {
      query: "self-evolution repeated reflection package check passed",
      context: {
        repeatedReflection: true,
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    queryOnly.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "query prose alone must not satisfy the external-check guard",
  );
  assert.equal(
    queryOnly.details.data.evolutionCandidate.reflectionGuard.requiresExternalCheck,
    true,
  );
  assert.equal(harness.sentUserMessages.length, 0, "negative check states remain mirror-only");

  await cleanup(tempDir);
});

test("self query: diagnostic review fails closed on boolean or conflicting check signals", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const booleanOnly = await tool.execute(
    "tc-diagnostic-review-reflection-guard-boolean-check",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheck: true,
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    booleanOnly.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "bare caller-controlled booleans must not satisfy the external-check guard",
  );
  assert.equal(
    booleanOnly.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "unknown",
  );

  const conflicting = await tool.execute(
    "tc-diagnostic-review-reflection-guard-conflicting-check",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheckStatus: "observed",
        validationSignal: "external check failed after the package check passed",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    conflicting.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "contradictory caller-controlled signals must fail closed",
  );
  assert.equal(
    conflicting.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "failed",
  );

  const observedPlusUnknown = await tool.execute(
    "tc-diagnostic-review-reflection-guard-observed-plus-unknown",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheckStatus: "observed",
        validationStatus: "unknown",
        validationSignal: "focused regression passed",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    observedPlusUnknown.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "observed plus unknown signals must fail closed instead of clearing the guard",
  );
  assert.equal(
    observedPlusUnknown.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "failed",
  );

  const callerTextOnly = await tool.execute(
    "tc-diagnostic-review-reflection-guard-caller-text-only",
    {
      query: `self-evolution repeated reflection ${"package check passed ".repeat(500)}`,
      context: {
        repeatedReflection: true,
        validationSignal: "focused regression passed",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    callerTextOnly.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "caller-controlled check prose alone must not satisfy the external-check guard",
  );
  assert.equal(
    callerTextOnly.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "unknown",
  );

  const genericDone = await tool.execute(
    "tc-diagnostic-review-reflection-guard-generic-done",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheckStatus: "observed",
        focusedRegression: "done",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    genericDone.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_required",
    "generic signal values like done must not satisfy the external-check guard",
  );
  assert.equal(
    genericDone.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "unknown",
  );

  const noRegressions = await tool.execute(
    "tc-diagnostic-review-reflection-guard-no-regressions-pass",
    {
      query: "self-evolution repeated reflection",
      context: {
        repeatedReflection: true,
        externalCheckStatus: "observed",
        validationSignal: "package check passed with no regressions observed",
      },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    noRegressions.details.data.evolutionCandidate.reflectionGuard.status,
    "external_check_observed",
    "successful no-regressions prose should not be misclassified as failed",
  );
  assert.equal(
    noRegressions.details.data.evolutionCandidate.reflectionGuard.externalCheckStatus,
    "observed",
  );
  assert.equal(
    noRegressions.details.data.evolutionCandidate.reflectionGuard.externalCheckEvidence
      .missingProvenance,
    true,
    "observed check signals without command/artifact provenance should stay visible in closeout cues",
  );
  assert.equal(harness.sentUserMessages.length, 0, "reflection guard remains mirror-only");

  await cleanup(tempDir);
});

test("self query: diagnostic review uses session validation command as reflection provenance", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  recordBash(
    harness,
    "cmd-reflection-session-validation",
    "node --test packages/pi-autonomous-session-control/tests/self/reflection-guard.test.mjs",
  );

  const result = await tool.execute(
    "tc-diagnostic-review-reflection-guard-session-validation-provenance",
    {
      query: "self-evolution repeated reflection after focused regression passed",
      context: {
        repeatedSelfAnalysis: "repeated",
        externalCheckStatus: "observed",
        externalValidation: "focused regression and package check passed",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.reflectionGuard;
  assert.equal(guard.status, "external_check_observed");
  assert.deepEqual(guard.externalCheckEvidence.provenance, [
    "session validation command: node --test packages/pi-autonomous-session-control/tests/self/reflection-guard.test.mjs",
  ]);
  assert.equal(guard.externalCheckEvidence.missingProvenance, false);
  assert.match(result.content[0].text, /provenanceCount=1/);
  assert.equal(harness.sentUserMessages.length, 0, "session evidence remains mirror-only");

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
        externalCheckStatus: "observed",
        externalValidation: "focused regression and package check passed",
        validationCommand:
          "node --test packages/pi-autonomous-session-control/tests/self/reflection-guard.test.mjs",
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
  assert.equal(
    guard.externalCheckEvidence.positiveSignal,
    "focused regression and package check passed",
  );
  assert.deepEqual(guard.externalCheckEvidence.provenance, [
    "node --test packages/pi-autonomous-session-control/tests/self/reflection-guard.test.mjs",
  ]);
  assert.equal(guard.externalCheckEvidence.missingProvenance, false);
  assert.match(result.content[0].text, /externalCheckStatus=observed/);
  assert.match(
    result.content[0].text,
    /positiveCheckSignal=focused regression and package check passed/,
  );
  assert.match(result.content[0].text, /provenanceCount=1/);
  assert.match(result.content[0].text, /requiresExternalCheck=false/);
  assert.equal(harness.sentUserMessages.length, 0, "resolved guard remains mirror-only");

  await cleanup(tempDir);
});
