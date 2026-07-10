/**
 * Tests for action user-message and diagnostic dispatch queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function recordBash(harness, id, command, { isError = false, text = "" } = {}) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");

  toolCallHandler({ toolName: "bash", toolCallId: id, input: { command } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: id,
    isError,
    content: text ? [{ type: "text", text }] : [],
  });
}

test("self query: continue suggested next move sends user message for agent-actionable local move", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const toolCallHandler = harness.eventHandlers.get("tool_call");

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-one-file",
    input: { path: "src/one-file.ts", content: "export const value = 1;\n" },
  });

  const result = await tool.execute(
    "tc-send-next-move",
    { query: "continue suggested next move" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message continuation sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(harness.sentUserMessages[0].text, /Continue with the self-suggested next move/);
  assert.match(harness.sentUserMessages[0].text, /npm run check/);
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.prefill, false);

  await cleanup(tempDir);
});

test("self query: next autonomous step aliases the guarded continuation seam", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const toolCallHandler = harness.eventHandlers.get("tool_call");

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-one-file-autonomous-step",
    input: { path: "src/autonomous-step.ts", content: "export const value = 1;\n" },
  });

  const result = await tool.execute(
    "tc-next-autonomous-step",
    { query: "next autonomous step" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message continuation sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(harness.sentUserMessages[0].text, /Continue with the self-suggested next move/);
  assert.match(harness.sentUserMessages[0].text, /Keep owner boundaries explicit/);
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.dispatchMode, "agent_continuation");

  await cleanup(tempDir);
});

test("self query: continue safely stays bounded when no next move is visible", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-continue-safely-empty",
    { query: "continue safely" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /No suggested next move is visible/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.prefill, false);

  await cleanup(tempDir);
});

test("self query: direct operator notification sends user message", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator",
    { query: "notify operator: verified implementation; please reload for live dogfood" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message dispatch sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(
    harness.sentUserMessages[0].text,
    "verified implementation; please reload for live dogfood",
  );
  assert.equal(harness.sentUserMessages[0].options.deliverAs, "followUp");
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.dispatchMode, "operator_notification");

  await cleanup(tempDir);
});

test("self query: explicit operator notification wins over diagnostic and checkpoint words", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-diagnostic-words",
    { query: "notify operator: self-evolution checkpoint collision dogfood is live" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message dispatch sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(
    harness.sentUserMessages[0].text,
    "self-evolution checkpoint collision dogfood is live",
  );
  assert.equal(result.details.intent, "action");
  assert.equal(result.details.data.sendUserMessage, true);

  const actionSummary = await tool.execute(
    "tc-notify-operator-diagnostic-words-summary",
    { query: "action summary" },
    null,
    null,
    ctx,
  );
  assert.equal(actionSummary.details.data.checkpoints.length, 0);

  await cleanup(tempDir);
});

test("self query: direct operator notification allows low-risk compaction status", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-compaction-status",
    {
      query:
        "notify operator: I am active after compaction and continuing with the verified local slice.",
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message dispatch sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(
    harness.sentUserMessages[0].text,
    "I am active after compaction and continuing with the verified local slice.",
  );
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.prefill, false);

  await cleanup(tempDir);
});

test("self query: fresh explicit continuation candidate wins over stale failure-recovery cue", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const recorded = await tool.execute(
    "tc-record-local-continuation-before-failures",
    { query: "record continuation candidate: npm --prefix packages/pi-demo run check" },
    null,
    null,
    ctx,
  );
  assert.equal(recorded.details.data.recorded, true);

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-after-candidate-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-next-autonomous-step-prefers-candidate",
    { query: "next autonomous step" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message continuation sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(harness.sentUserMessages[0].text, /packages\/pi-demo run check/);
  assert.equal(result.details.data.usedPersistedContinuationCandidate, true);
  assert.equal(result.details.data.nextMove.owner, "local-shell");
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.prefill, false);

  await cleanup(tempDir);
});

test("self query: mirror-derived continuation candidate does not override current recovery cue", async () => {
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
  const toolCallHandler = harness.eventHandlers.get("tool_call");

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-mirror-candidate",
    input: { path: "src/mirror-candidate.ts", content: "export const value = 1;\n" },
  });

  const first = await tool.execute(
    "tc-create-mirror-derived-candidate",
    { query: "continue suggested next move" },
    null,
    null,
    ctx,
  );
  assert.equal(first.details.data.usedPersistedContinuationCandidate, false);
  assert.equal(first.details.data.continuationCandidate.kind, "self.continuation_candidate.v1");

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-after-mirror-candidate-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-next-autonomous-step-keeps-current-recovery",
    { query: "next autonomous step" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.ok(editorText.startsWith("/scoutpeer "));
  assert.equal(result.details.data.usedPersistedContinuationCandidate, false);
  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.equal(result.details.data.sendUserMessage, false);

  await cleanup(tempDir);
});

test("self query: legacy send user message alias still continues suggested next move", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const toolCallHandler = harness.eventHandlers.get("tool_call");

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-one-file-for-legacy-send",
    input: { path: "src/legacy-send.ts", content: "export const value = 1;\n" },
  });

  const result = await tool.execute(
    "tc-send-user-message-legacy",
    { query: "send user message" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message continuation sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(harness.sentUserMessages[0].text, /Continue with the self-suggested next move/);
  assert.equal(result.details.data.dispatchMode, "agent_continuation");

  await cleanup(tempDir);
});

test("self query: direct operator notification requires explicit message text", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-no-text",
    { query: "sendUserMessage" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /need explicit message text/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "missing_message_text");

  await cleanup(tempDir);
});

test("self query: direct operator notification allows completed compaction status", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-compaction-complete",
    { query: "notify operator: Compaction complete; continuing with the verified local slice." },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("User-message dispatch sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(
    harness.sentUserMessages[0].text,
    "Compaction complete; continuing with the verified local slice.",
  );
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.prefill, false);

  await cleanup(tempDir);
});

test("self query: direct operator notification gates compaction directives to editor prefill", async () => {
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

  const result = await tool.execute(
    "tc-notify-operator-compaction-directive",
    { query: "notify operator: please compact the session now" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, "please compact the session now");
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});

test("self query: direct operator notification gates slash commands to operator-submitted editor prefill", async () => {
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

  const result = await tool.execute(
    "tc-notify-operator-slash-command",
    { query: "notify operator: /visible-loop --count 1 --delegate-commit" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.match(result.content[0].text, /press Enter to send it through Pi's slash-command parser/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, "/visible-loop --count 1 --delegate-commit");
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");
  assert.match(
    result.details.data.boundary,
    /sendUserMessage does not invoke Pi slash-command expansion/,
  );

  await cleanup(tempDir);
});

test("self query: direct operator notification gates multiline slash commands to prefill", async () => {
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

  const message = "status update:\n/visible-loop --count 1 --delegate-commit";
  const result = await tool.execute(
    "tc-notify-operator-multiline-slash-command",
    { query: `notify operator: ${message}` },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.match(result.content[0].text, /press Enter to send it through Pi's slash-command parser/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, message);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");

  await cleanup(tempDir);
});

test("self query: direct operator notification gates indented multiline slash commands to prefill", async () => {
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

  const message = "campaign proposal:\n  /autoresearch Evaluate ASC slash-command gate";
  const result = await tool.execute(
    "tc-notify-operator-indented-multiline-slash-command",
    { query: `notify operator: ${message}` },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, message);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");

  await cleanup(tempDir);
});

test("self query: direct operator notification gates context slash commands to prefill", async () => {
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

  const result = await tool.execute(
    "tc-notify-operator-context-slash-command",
    { query: "notify operator", context: { text: "/compact-handoff" } },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, "/compact-handoff");
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");

  await cleanup(tempDir);
});

test("self query: direct operator notification reports manual slash submission when UI is unavailable", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-slash-command-no-ui",
    { query: "notify operator: /visible-loop --count 1 --delegate-commit" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /Editor prefill unavailable \(no UI\)/);
  assert.match(result.content[0].text, /manual operator submission required/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_manual_submit_required");
  assert.equal(result.details.data.requestedDispatchMode, "operator_submit_required");
  assert.equal(result.details.data.prefillAvailable, false);
  assert.equal(result.details.data.prefillPerformed, false);
  assert.equal(result.details.data.prefillUnavailableReason, "no_ui");

  await cleanup(tempDir);
});

test("self query: direct operator notification gates prose and markdown slash commands", async () => {
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

  for (const [id, message] of [
    ["prose-autoresearch", "please use /autoresearch Evaluate ASC slash-command gate"],
    ["blockquote-visible-loop", "status update:\n> /visible-loop --count 1"],
    ["list-visible-loop", "status update:\n- /visible-loop --count 1"],
    ["code-visible-loop", "status update:\n`/visible-loop --count 1`"],
  ]) {
    editorText = "";
    harness.sentUserMessages.length = 0;
    const result = await tool.execute(
      `tc-notify-operator-${id}`,
      { query: `notify operator: ${message}` },
      null,
      null,
      ctx,
    );

    assert.ok(result.content[0].text.includes("Editor prefilled"));
    assert.equal(harness.sentUserMessages.length, 0);
    assert.equal(editorText, message);
    assert.equal(result.details.data.sendUserMessage, false);
    assert.equal(result.details.data.dispatchMode, "operator_submit_required");
    assert.equal(result.details.data.prefillAvailable, true);
    assert.equal(result.details.data.prefillPerformed, true);
  }

  await cleanup(tempDir);
});

test("self query: direct operator notification allows low-risk multiline absolute path status", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (const [id, message] of [
    ["absolute-path-file", "validated output written to:\n/tmp/asc-visible-loop-report.txt"],
    ["absolute-path-root", "validated output directory:\n/tmp"],
  ]) {
    harness.sentUserMessages.length = 0;
    const result = await tool.execute(
      `tc-notify-operator-${id}`,
      { query: `notify operator: ${message}` },
      null,
      null,
      ctx,
    );

    assert.ok(result.content[0].text.includes("User-message dispatch sent"));
    assert.equal(harness.sentUserMessages.length, 1);
    assert.equal(harness.sentUserMessages[0].text, message);
    assert.equal(result.details.data.sendUserMessage, true);
    assert.equal(result.details.data.userMessageSent, true);
    assert.equal(result.details.data.dispatchMode, "operator_notification");
    assert.equal(result.details.data.prefillAvailable, undefined);
    assert.equal(result.details.data.prefillPerformed, undefined);
  }

  await cleanup(tempDir);
});

test("self query: direct operator notification gates risky directives to editor prefill", async () => {
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

  const result = await tool.execute(
    "tc-notify-operator-risky",
    { query: "notify operator: run peer review and commit the result" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(editorText, "run peer review and commit the result");
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});

test("self query: direct operator notification blocks likely secrets", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-notify-operator-secret",
    { query: "notify operator: token sk-abcdefghijklmnopqrstuvwxyz" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /not sent/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "blocked_sensitive_message");

  await cleanup(tempDir);
});

test("self query: continue suggested next move keeps operator-gated peer move as prefill", async () => {
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

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-continue-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-send-next-move-peer-gated",
    { query: "continue suggested next move" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.ok(editorText.startsWith("/scoutpeer "));
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});

test("self query: continue diagnostic review returns a candidate without hidden recursion", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-continue-diagnostic-review",
    {
      query: "continue diagnostic review",
      context: {
        summary: "self failed to turn diagnostic insight into a same-task continuation",
        category: "missing_affordance",
      },
    },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /Diagnostic review produced candidate evolution-/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.dispatchMode, "diagnostic_candidate_review_required");
  assert.equal(result.details.data.diagnosticCandidate.kind, "self.diagnostic_candidate.v1");
  assert.match(result.details.data.evolutionCandidate.candidateId, /^evolution-/);

  await cleanup(tempDir);
});

test("self query: durable diagnostic record stays editor-prefilled", async () => {
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

  const result = await tool.execute(
    "tc-prefill-diagnostic-record",
    {
      query: "prefill agent_vent record",
      context: {
        summary: "self should not silently write durable diagnostic state",
        category: "authority_boundary",
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.match(editorText, /^agent_vent\(\{ action: "preview"/);
  assert.match(editorText, /packageName: /);
  assert.doesNotMatch(editorText, /package: /);
  assert.doesNotMatch(editorText, /action: "record"/);
  assert.match(editorText, /authority_boundary/);
  assert.match(editorText, /self should not silently write durable diagnostic state/);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});

test("self query: diagnostic record prefill JSON-quotes caller-controlled facets", async () => {
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

  const result = await tool.execute(
    "tc-prefill-diagnostic-record-injection",
    {
      query: "prefill agent_vent record",
      context: {
        summary: 'schema drift attempt "}); agent_vent({ action: "record" }) //',
        category: "workflow_friction",
        tool: "self",
        packageName: 'pi-autonomous-session-control\npackage: "wrong"',
        package: "legacy-package-should-not-win",
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(harness.sentUserMessages.length, 0);
  assert.match(editorText, /^agent_vent\(\{ action: "preview"/);
  assert.match(editorText, /packageName: "pi-autonomous-session-control\\npackage: \\"wrong\\""/);
  assert.doesNotMatch(editorText, /legacy-package-should-not-win/);
  assert.doesNotMatch(editorText, /, package: /);
  assert.doesNotMatch(editorText, /action: "record" \}\)/);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});
