/**
 * Tests for action domain queries.
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

function recordEdit(harness, id, path) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  toolCallHandler({
    toolName: "edit",
    toolCallId: id,
    input: { path, edits: [{ oldText: "before\n", newText: "before\nafter\n" }] },
  });
}

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

test("self query: continue diagnostic review sends mirror-only follow-up", async () => {
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

  assert.ok(result.content[0].text.includes("Diagnostic-review continuation sent"));
  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(harness.sentUserMessages[0].text, /Continue the self diagnostic review/);
  assert.match(harness.sentUserMessages[0].text, /do not write agent_vent records/);
  assert.equal(harness.sentUserMessages[0].options.deliverAs, "followUp");
  assert.equal(result.details.data.sendUserMessage, true);
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.diagnosticCandidate.kind, "self.diagnostic_candidate.v1");

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
  assert.doesNotMatch(editorText, /action: "record"/);
  assert.match(editorText, /authority_boundary/);
  assert.match(editorText, /self should not silently write durable diagnostic state/);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

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
    { query: "create self-contained handoff prompt" },
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
  assert.equal(result.details.data.summaryScope, "totals_not_per_query_delta");

  await cleanup(tempDir);
});
