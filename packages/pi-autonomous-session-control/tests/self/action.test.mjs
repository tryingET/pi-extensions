/**
 * Tests for action domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOwnerBridgeSendUserMessage } from "../../extensions/self.ts";
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

async function seedRoutableCandidate(harness, tool, ctx, id) {
  recordBash(harness, `seed-check-${id}`, "npm run check");
  const result = await tool.execute(
    `seed-${id}`,
    {
      query: "self-evolution",
      context: {
        summary: "typed self-evolution handoff loses its candidate payload",
        hypothesis: "the route omits candidate identity",
        metric: "candidate_handoff_fidelity=100%",
        falsifier: "the visible-loop config omits any required candidate field",
        owner: "pi-little-helpers",
        nextSafeTest: "launch a candidate-bound visible loop and inspect its config",
        promotionStatus: "promoted",
        promotionTarget:
          "packages/pi-little-helpers/docs/project/self-evolution-owner-artifact.json",
        sourceArtifact: "owner product posture verified after package check",
      },
    },
    null,
    null,
    ctx,
  );
  return result.details.data.evolutionCandidate;
}

function recordEdit(harness, id, path) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  toolCallHandler({
    toolName: "edit",
    toolCallId: id,
    input: { path, edits: [{ oldText: "before\n", newText: "before\nafter\n" }] },
  });
}

test("owner-bridge sendUserMessage policy only permits known whole-message bridges", () => {
  assert.equal(
    isAllowedOwnerBridgeSendUserMessage({
      text: "/visible-loop --count 1 --delegate-commit --candidate evolution-test-1",
      dispatchMode: "owner_bridge_send_user_message",
      ownerBridge: "pi-little-helpers extension-originated /visible-loop bridge",
      routeKind: "visible_loop_self_evolution",
    }),
    true,
  );
  assert.equal(
    isAllowedOwnerBridgeSendUserMessage({
      text: "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0",
      dispatchMode: "owner_bridge_send_user_message",
      ownerBridge: "pi-autoresearch extension-originated /autoresearch bridge",
      routeKind: "measured_self_evolution_campaign",
    }),
    false,
  );
  assert.equal(
    isAllowedOwnerBridgeSendUserMessage({
      text: "/nexus-loop --count 1",
      dispatchMode: "owner_bridge_send_user_message",
      ownerBridge: "unknown",
      routeKind: "unknown",
    }),
    false,
  );
  assert.equal(
    isAllowedOwnerBridgeSendUserMessage({
      text: "/tmp/autoresearch-notes are available",
      dispatchMode: "operator_notification",
    }),
    true,
  );
});

test("self query: create checkpoint", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: 'Create checkpoint "before risky refactor"', context: { entryId: "entry-123" } },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Checkpoint created"), "should confirm checkpoint");
  assert.ok(result.details.data.checkpointId, "should return checkpoint ID");
  assert.ok(result.details.data.label, "should generate label");

  await cleanup(tempDir);
});

test("self query: queue followup", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    {
      query: "Queue followup: remember to test edge cases",
      context: { context: "after refactor" },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Follow-up queued"), "should confirm followup queued");
  assert.ok(result.details.data.followupId, "should return followup ID");

  await cleanup(tempDir);
});

test("self query: prefill editor", async () => {
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
    "tc-1",
    { query: "Prefill: implement the error handling for edge case X" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("prefilled"), "should report real prefill");
  assert.equal(editorText, "implement the error handling for edge case X");
  assert.ok(result.details.data?.text, "should return prefill text");

  await cleanup(tempDir);
});

test("self query: prefill intent wins when text mentions follow-up", async () => {
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
    "tc-prefill-followup",
    { query: 'prefill: "write the follow-up later"' },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("prefilled"));
  assert.equal(editorText, "write the follow-up later");
  assert.equal(result.details.data.prefill, true);

  await cleanup(tempDir);
});

test("self query: prefill visible-loop self-evolution route", async () => {
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

  const candidate = await seedRoutableCandidate(harness, tool, ctx, "prefill-visible-loop");
  const result = await tool.execute(
    "tc-prefill-visible-loop-self-evolution",
    { query: "prefill visible-loop self-evolution" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.match(
    result.content[0].text,
    /press Enter to launch it through Pi's slash-command parser/,
  );
  assert.equal(
    editorText,
    `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`,
  );
  assert.equal(result.details.data.candidateId, candidate.candidateId);
  assert.equal(result.details.data.prefill, true);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");
  assert.equal(
    result.details.data.launchMechanism,
    "operator_reviews_prefilled_editor_then_presses_enter",
  );
  assert.equal(result.details.data.autonomyLevel, 4);
  assert.equal(result.details.data.ownerSurface, "pi-little-helpers / visible-loop");
  assert.match(result.details.data.boundary, /exact session-local candidate id/);
  assert.match(result.details.data.boundary, /pi-little-helpers must resolve that id/);

  await cleanup(tempDir);
});

test("self query: continue with self-evolution routes to visible-loop prefill", async () => {
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

  const candidate = await seedRoutableCandidate(harness, tool, ctx, "continue-visible-loop");
  for (const [index, query] of [
    "continue with self-evolution",
    "continue self-evolution",
    "continue visible self-evolution!",
    "  CONTINUE   SELF-EVOLUTION ? ",
  ].entries()) {
    editorText = "";
    const result = await tool.execute(
      `tc-continue-self-evolution-visible-loop-${index}`,
      { query },
      null,
      null,
      ctx,
    );

    assert.equal(result.details.intent, "action");
    assert.ok(result.content[0].text.includes("Editor prefilled"));
    assert.equal(
      editorText,
      `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`,
    );
    assert.equal(result.details.data.candidateId, candidate.candidateId);
    assert.equal(harness.sentUserMessages.length, 0);
    assert.equal(result.details.data.prefill, true);
    assert.equal(result.details.data.sendUserMessage, false);
    assert.equal(result.details.data.dispatchMode, "operator_submit_required");
    assert.equal(result.details.data.routeKind, "visible_loop_self_evolution");
    assert.doesNotMatch(result.content[0].text, /agent_vent/);
  }

  await cleanup(tempDir);
});

test("self query: visible-loop self-evolution reports manual submission when UI is unavailable", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const candidate = await seedRoutableCandidate(harness, tool, ctx, "no-ui-visible-loop");

  for (const [index, query] of [
    "prefill visible-loop self-evolution",
    "continue self-evolution",
  ].entries()) {
    const result = await tool.execute(
      `tc-prefill-visible-loop-self-evolution-no-ui-${index}`,
      { query },
      null,
      null,
      ctx,
    );

    assert.match(result.content[0].text, /Editor prefill unavailable \(no UI\)/);
    assert.match(result.content[0].text, /manual operator submission required/);
    assert.equal(harness.sentUserMessages.length, 0);
    assert.equal(
      result.details.data.text,
      `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`,
    );
    assert.equal(result.details.data.prefill, true);
    assert.equal(result.details.data.sendUserMessage, false);
    assert.equal(result.details.data.dispatchMode, "operator_manual_submit_required");
    assert.equal(result.details.data.requestedDispatchMode, "operator_submit_required");
    assert.equal(result.details.data.prefillAvailable, false);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(result.details.data.prefillUnavailableReason, "no_ui");
  }

  await cleanup(tempDir);
});

test("self query: continue with self-evolution defers inside visible-loop child", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  let editorText = "";
  const ctx = createMockContext({
    hasUI: true,
    sessionManager: {
      getSessionId() {
        return "019f325c-4aef-7795-a9ac-aa5219418a36";
      },
      getSessionName() {
        return "visible-loop";
      },
    },
    ui: {
      setEditorText(text) {
        editorText = text;
      },
    },
  });

  const result = await tool.execute(
    "tc-continue-self-evolution-visible-loop-child",
    { query: "continue with self-evolution" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "action");
  assert.match(result.content[0].text, /already appears to be a visible-loop child/);
  assert.equal(editorText, "");
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "nested_visible_loop_deferred_to_controller");
  assert.equal(result.details.data.launchMechanism, "deferred_inside_visible_loop_child");

  await cleanup(tempDir);
});

test("self query: launch visible-loop self-evolution sends owner-bridge message", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({ hasUI: true });
  const candidate = await seedRoutableCandidate(harness, tool, ctx, "launch-visible-loop");

  const result = await tool.execute(
    "tc-launch-visible-loop-self-evolution",
    { query: "launch visible-loop self-evolution" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Owner-bridge launch sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(
    harness.sentUserMessages[0].text,
    `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`,
  );
  assert.equal(harness.sentUserMessages[0].options.deliverAs, "followUp");
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.userMessageSent, true);
  assert.equal(result.details.data.dispatchMode, "owner_bridge_send_user_message");
  assert.equal(
    result.details.data.ownerBridge,
    "pi-little-helpers extension-originated /visible-loop bridge",
  );
  assert.match(result.details.data.boundary, /pi-little-helpers-owned bridge/);

  await cleanup(tempDir);
});

test("self query: visible-loop self-evolution prefill ignores caller overrides", async () => {
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

  const candidate = await seedRoutableCandidate(harness, tool, ctx, "ignore-overrides");
  const result = await tool.execute(
    "tc-prefill-visible-loop-self-evolution-no-overrides",
    {
      query: "prefill visible-loop self-evolution",
      context: { count: "99", delegateCommit: false },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(
    editorText,
    `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`,
  );
  assert.equal(result.details.data.routeKind, "visible_loop_self_evolution");

  await cleanup(tempDir);
});

test("self query: prefill autoresearch campaign route", async () => {
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

  const candidate = await seedRoutableCandidate(harness, tool, ctx, "prefill-autoresearch");
  const result = await tool.execute(
    "tc-prefill-autoresearch-campaign",
    {
      query: "prefill autoresearch campaign for self-evolution",
      context: { objective: "override" },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(
    editorText,
    `/autoresearch Evaluate promoted self-evolution candidate ${candidate.candidateId} for owner pi-little-helpers; ownerArtifact=packages/pi-little-helpers/docs/project/self-evolution-owner-artifact.json`,
  );
  assert.doesNotMatch(editorText, /candidate_handoff_fidelity|route omits candidate identity/);
  assert.equal(result.details.data.prefill, true);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");
  assert.equal(result.details.data.autonomyLevel, 5);
  assert.equal(result.details.data.ownerSurface, "pi-autoresearch");
  assert.equal(result.details.data.routeKind, "measured_self_evolution_campaign");
  assert.match(result.details.data.boundary, /only the candidate id, routed owner, and promoted/);
  assert.match(result.details.data.boundary, /must read and verify that artifact/);

  editorText = "";
  const measuredAlias = await tool.execute(
    "tc-prefill-measured-campaign",
    { query: "prefill measured campaign for self-evolution" },
    null,
    null,
    ctx,
  );
  assert.ok(measuredAlias.content[0].text.includes("Editor prefilled"));
  assert.equal(
    editorText,
    `/autoresearch Evaluate promoted self-evolution candidate ${candidate.candidateId} for owner pi-little-helpers; ownerArtifact=packages/pi-little-helpers/docs/project/self-evolution-owner-artifact.json`,
  );
  assert.equal(measuredAlias.details.data.routeKind, "measured_self_evolution_campaign");

  await cleanup(tempDir);
});

test("self query: launch autoresearch campaign prefills slash command for operator submission", async () => {
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

  const candidate = await seedRoutableCandidate(harness, tool, ctx, "launch-autoresearch");
  const result = await tool.execute(
    "tc-launch-autoresearch-campaign",
    { query: "launch autoresearch campaign for self-evolution" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.equal(
    editorText,
    `/autoresearch Evaluate promoted self-evolution candidate ${candidate.candidateId} for owner pi-little-helpers; ownerArtifact=packages/pi-little-helpers/docs/project/self-evolution-owner-artifact.json`,
  );
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.prefill, true);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.userMessageSent, false);
  assert.equal(result.details.data.dispatchMode, "operator_submit_required");
  assert.equal(
    result.details.data.launchMechanism,
    "operator_reviews_prefilled_editor_then_presses_enter",
  );
  assert.match(result.details.data.boundary, /only the candidate id, routed owner, and promoted/);
  assert.match(result.details.data.boundary, /must read and verify that artifact/);

  await cleanup(tempDir);
});

test("self query: prefill preserves quoted command arguments", async () => {
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

  await tool.execute(
    "tc-prefill-quoted-command",
    {
      query:
        'prefill: "scout_peer_spawn({ role: \\"reviewer\\", objective: \\"Review loop cues\\" })"',
    },
    null,
    null,
    ctx,
  );

  assert.equal(editorText, 'scout_peer_spawn({ role: "reviewer", objective: "Review loop cues" })');

  await cleanup(tempDir);
});

test("self query: creates self-contained handoff prompt and prefills editor", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  let editorText = "";
  const ctx = createMockContext({
    cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
    hasUI: true,
    ui: {
      setEditorText(text) {
        editorText = text;
      },
    },
  });

  recordEdit(
    harness,
    "edit-handoff-action",
    "packages/pi-autonomous-session-control/extensions/self/resolvers/action.ts",
  );
  recordBash(harness, "cmd-git-status", "git status --short");
  recordBash(harness, "cmd-ak-claim", "ak task claim 3482 --agent pi");
  recordBash(harness, "cmd-check", "npm --prefix packages/pi-autonomous-session-control run check");
  recordBash(
    harness,
    "cmd-install",
    "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
  );

  const result = await tool.execute(
    "tc-handoff-prompt-prefill",
    {
      query: "create self-contained handoff prompt",
      context: {
        latestUserIntent: "Continue other autonomy-harness suggestions.",
        currentObjective: "Bridge ASC handoff cues into pi-session-compaction schema.",
      },
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.ok(editorText.startsWith("You are a fresh, stateless Pi coding session."));
  assert.match(
    editorText,
    /Work in:\n`\/home\/tryinget\/ai-society\/softwareco\/owned\/pi-extensions`/,
  );
  assert.match(editorText, /ASC self mirror-only; canonical prompt owner is pi-session-compaction/);
  assert.match(editorText, /Known AK task ids: 3482/);
  assert.match(editorText, /git status was run, but ASC does not store stdout/);
  assert.match(
    editorText,
    /packages\/pi-autonomous-session-control\/extensions\/self\/resolvers\/action\.ts/,
  );
  assert.match(editorText, /npm --prefix packages\/pi-autonomous-session-control run check/);
  assert.match(editorText, /ask operator to \/reload/);
  assert.match(editorText, /Compaction-owned handoff option/);
  assert.match(editorText, /session_compaction_handoff/);
  assert.match(editorText, /Bridge ASC handoff cues into pi-session-compaction schema/);
  assert.match(editorText, /Do not treat ASC latest-intent text as task authority/);
  assert.match(editorText, /pi-session-compaction owns compaction summaries/);
  assert.doesNotMatch(editorText, /remaining context budget: \d+/i);
  assert.equal(result.details.data.prefill, true);
  assert.equal(result.details.data.authority, "mirror_only");

  await cleanup(tempDir);
});

test("self query: show fresh handoff prompt is truthful when mirror evidence is sparse", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({
    cwd: "/tmp/example-repo",
    hasUI: true,
    ui: {
      setEditorText() {
        throw new Error("show-only handoff prompt should not prefill");
      },
    },
  });

  const result = await tool.execute(
    "tc-handoff-prompt-show-sparse",
    { query: "show fresh session handoff prompt" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /Self-contained handoff prompt \(not prefilled\)/);
  assert.match(result.content[0].text, /ASC mirror evidence is sparse/);
  assert.match(result.content[0].text, /Exact token\/context-window telemetry: unavailable/);
  assert.match(result.content[0].text, /Git status: unknown to ASC; run git status --short/);
  assert.match(result.content[0].text, /Known AK task ids: none visible to ASC/);
  assert.match(result.content[0].text, /Recent touched files: none tracked by ASC mirror/);
  assert.match(result.content[0].text, /AK \+ society DB remain canonical/);
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.dispatchMode, "show_only");

  await cleanup(tempDir);
});

test("self query: prefill suggested next move uses current handoff nextMove", async () => {
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
    recordBash(harness, `cmd-failed-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-prefill-next-move",
    { query: "prefill suggested next move" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("prefilled"));
  assert.ok(editorText.startsWith("/scoutpeer "));
  assert.equal(editorText.includes("scout_peer_spawn"), false);
  assert.equal(result.details.data.nextMove.owner, "peer-tools");

  await cleanup(tempDir);
});

test("self query: remind me later", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "Remind me later to check the database indexes" },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("Follow-up queued"),
    "should recognize remind as followup",
  );

  await cleanup(tempDir);
});

test("self query: action summary lists checkpoints and pending followups", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  await tool.execute(
    "tc-checkpoint",
    { query: 'Create checkpoint "before level-4 dogfood"' },
    null,
    null,
    ctx,
  );
  await tool.execute(
    "tc-followup",
    { query: "Queue followup: verify level-4 closeout" },
    null,
    null,
    ctx,
  );

  const result = await tool.execute("tc-summary", { query: "action summary" }, null, null, ctx);

  assert.ok(result.content[0].text.includes("Action summary"));
  assert.ok(result.content[0].text.includes("totals, not per-query mutation delta"));
  assert.ok(result.content[0].text.includes("before level-4 dogfood"));
  assert.ok(result.content[0].text.includes("verify level-4 closeout"));
  assert.equal(result.details.data.checkpoints.length, 1);
  assert.equal(result.details.data.pendingFollowups.length, 1);
  assert.equal(result.details.data.continuationCandidates.length, 0);
  assert.equal(result.details.data.freshContinuationCandidates.length, 0);
  assert.equal(result.details.data.currentCwdFreshContinuationCandidates.length, 0);
  assert.equal(
    result.details.data.summaryScope,
    "totals_not_per_query_mutation_delta_current_cwd_candidates_separated",
  );

  await cleanup(tempDir);
});
