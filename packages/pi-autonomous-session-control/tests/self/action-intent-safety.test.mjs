// summary: action mentions, questions and refusals must not become self directives.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { classifyIntent } from "../../extensions/self/query-resolver.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

const nonActions = [
  ...[
    "create checkpoint",
    "queue followup",
    "continue safely",
    "continue suggested next move",
    "continue self-evolution",
    "continue with self-evolution",
    "create handoff prompt",
    "prefill handoff prompt",
    "prefill suggested next move",
    "launch visible-loop self-evolution",
    "launch autoresearch campaign",
  ].flatMap((command) => [`Do not ${command}`, `${command}?`, `"${command}"`]),
  "create checkpoint before tests, don't do it",
  "create checkpoint before tests, don’t do it",
  "queue followup later to inspect tests, don't do it",
  "queue followup later to inspect tests, don’t do it",
  "What is a checkpoint?",
  "How do checkpoints work?",
  "What can you do with checkpoints?",
  "What progress have I made since the last checkpoint?",
  "Do not create checkpoint",
  "Please do not create checkpoint",
  "Never queue followup: check the tests",
  "We can examine this later",
  "What files should I inspect later?",
  "Do not continue safely",
  "Please don't continue safely",
  "Never send suggested next move",
  "Should I continue safely?",
  "should I prefill a handoff prompt?",
  "Explain continue suggested next move",
  '"continue safely"',
  "`continue safely`",
  "continue safely; do not send anything",
  "continue safely?",
  "Create checkpoint?",
  "create checkpoint before tests? No, do not.",
  "queue followup later? No, do not.",
  "Create checkpoint is not what I want.",
  'prefill.ts contains "npm test"',
  'prefill "npm test"? Please explain first.',
  "prefill handoff prompt?",
  '"prefill handoff prompt"',
  "Do not prefill handoff prompt",
  "prefill：npm test",
  'notify operator：Tests failed; quoted log says "all checks passed"',
  "What does record continuation candidate mean?",
  "Do not record continuation candidate: npm test",
  "Do not launch visible-loop self-evolution",
  "Explain launch autoresearch campaign",
];

for (const query of nonActions) {
  test(`non-directive does not select an action: ${query}`, () => {
    assert.notEqual(classifyIntent(query).domain, "action");
  });
}

// Every action family must reject before stateful keyword fallback, not just
// avoid domain=action. Include aliases and payloads that collide with other owners.
const rejectedDirectiveCollisions = [
  "create checkpoint",
  "mark checkpoint",
  "save point",
  "queue followup",
  "queue follow-up",
  "queue follow up",
  "remind me",
  "continue safely",
  "continue suggested next move",
  "send suggested next move",
  "advance suggested next move",
  "next autonomous step",
  "next safe step",
  "send user message",
  "send usermessage",
  "sendusermessage",
  "notify operator",
  "notify user",
  "message operator",
  "send operator message",
  "record continuation candidate",
  "queue continuation candidate",
  "remember next autonomous step",
  "continue with self-evolution",
  "continue self-evolution",
  "continue visible self-evolution",
  "continue diagnostic review",
  "continue self diagnostic",
  "send diagnostic review",
  "send diagnostic followup",
  "send diagnostic follow-up",
  "record this friction",
  "prefill",
  "prefill editor",
  "prefill diagnostic record",
  "prefill agent_vent record",
  "prefill vent record",
  "create handoff prompt",
  "show handoff prompt",
  ...["prefill", "launch", "run", "start"].flatMap((verb) =>
    [
      "visible-loop self-evolution",
      "visible loop self-evolution",
      "self-evolution visible-loop",
      "self-evolution loop",
      "autoresearch campaign",
      "measured campaign",
    ].map((target) => `${verb} ${target}`),
  ),
].flatMap((command) =>
  ["controller handoff summary", "self feedback", "remember this pattern"].flatMap((payload) => [
    `Do not ${command}: ${payload}`,
    `Please don’t ${command}: ${payload}`,
    `Should I ${command}: ${payload}?`,
    `"${command}: ${payload}"`,
  ]),
);

test("rejected action families cannot select stateful fallback domains", () => {
  for (const query of rejectedDirectiveCollisions) {
    assert.deepEqual(
      classifyIntent(query),
      { domain: "unknown", intent: "unsupported_action_request" },
      query,
    );
  }
});

for (const [query, intent] of [
  ["self feedback: helpful — handoff prompt was useful", "record_feedback"],
  ["feedback: helpful — handoff prompt was useful", "record_feedback"],
  ["Dogfood self: improve handoff prompt generation", "diagnostic_review"],
]) {
  test(`explicit meta query owns action-like payload: ${query}`, () => {
    assert.deepEqual(classifyIntent(query), { domain: "meta", intent });
  });
}

for (const [query, intent] of [
  ['Create checkpoint "before risky refactor"', "create_checkpoint"],
  ["Please create checkpoint before risky refactor", "create_checkpoint"],
  ["Mark checkpoint: before tests", "create_checkpoint"],
  ["Mark checkpoint: why did tests fail?", "create_checkpoint"],
  ["Save point: why did tests fail?", "create_checkpoint"],
  ["Remind me: why did tests fail?", "queue_followup"],
  ["What checkpoints?", "list_action_state"],
  ["List checkpoints?", "list_action_state"],
  ["What followups?", "list_action_state"],
  ["List followups?", "list_action_state"],
  ["Save point before tests", "create_checkpoint"],
  ["Queue followup: check checkpoint semantics later", "queue_followup"],
  ["Queue followup: why did the check fail?", "queue_followup"],
  ["Remind me later to check the indexes", "queue_followup"],
  ["Record continuation candidate: check checkpoint semantics", "record_continuation_candidate"],
  ["continue safely", "continue_suggested_next_move"],
  ["send user message", "continue_suggested_next_move"],
  ["continue self-evolution", "prefill_visible_loop_self_evolution"],
  ["notify operator: checkpoint and followup inspection finished", "send_user_message"],
  ["prefill: continue safely", "prefill_editor"],
  ["action summary", "list_action_state"],
]) {
  test(`explicit directive retains ownership: ${query}`, () => {
    assert.deepEqual(classifyIntent(query), { domain: "action", intent });
  });
}

for (const initialDraft of ["OPERATOR-DRAFT", ""]) {
  test(`rejected queries preserve state and never deliver a saved continuation (draft=${JSON.stringify(initialDraft)})`, async (t) => {
    const { default: extension, tempDir } = await loadExtensionWithMocks();
    t.after(() => cleanup(tempDir));
    const harness = createPiHarness();
    extension(harness.pi);
    let draft = initialDraft;
    let writes = 0;
    const ctx = createMockContext({
      cwd: "/repo/action-intent-safety",
      hasUI: true,
      ui: {
        getEditorText: () => draft,
        setEditorText: (text) => {
          writes++;
          draft = text;
        },
      },
    });
    const tool = harness.tools.get("self");
    const run = (query) =>
      tool.execute(
        query,
        {
          query,
          context: { text: "npm test", reason: "caller context cannot grant action intent" },
        },
        null,
        null,
        ctx,
      );
    await run("record continuation candidate: npm test");
    // Ensure rejected queries cannot accidentally fall through to handoff-summary
    // handling, which still records mirror-derived candidates in the old design.
    harness.eventHandlers.get("tool_call")({
      toolName: "edit",
      toolCallId: "tracked-file",
      input: { path: "packages/pi-demo/index.ts", oldText: "old", newText: "new" },
    });
    const memoryPath = path.join(tempDir, "sessions.self-memory.json");
    const before = await readFile(memoryPath, "utf8");

    for (const query of [...nonActions, ...rejectedDirectiveCollisions]) {
      const result = await run(query);
      assert.notEqual(result.details.intent, "action", query);
      assert.equal(harness.sentUserMessages.length, 0, query);
      assert.equal(writes, 0, query);
      assert.equal(draft, initialDraft, query);
      assert.equal(await readFile(memoryPath, "utf8"), before, query);
    }
    const summary = await run("action summary");
    assert.equal(summary.details.data.checkpoints.length, 0);
    assert.equal(summary.details.data.pendingFollowups.length, 0);
    assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);

    const continued = await run("continue safely");
    assert.equal(continued.details.data.userMessageSent, true);
    assert.equal(harness.sentUserMessages.length, 1);
    assert.equal(writes, 0);
  });
}

test("action-state question aliases return the stored records", async (t) => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  t.after(() => cleanup(tempDir));
  const harness = createPiHarness();
  extension(harness.pi);
  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const run = (query) => tool.execute(query, { query }, null, null, ctx);
  await run('Create checkpoint "before test"');
  await run("Queue followup: inspect the result");
  for (const query of [
    "What checkpoints?",
    "List checkpoints?",
    "What followups?",
    "List followups?",
  ]) {
    const result = await run(query);
    assert.equal(result.details.data.checkpoints.length, 1, query);
    assert.equal(result.details.data.pendingFollowups.length, 1, query);
  }
  assert.equal(harness.sentUserMessages.length, 0);
});

test("ASCII notification preserves the complete payload; unsupported separator does not send", async (t) => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  t.after(() => cleanup(tempDir));
  const harness = createPiHarness();
  extension(harness.pi);
  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const payload = 'Tests failed; quoted log says "all checks passed"';
  await tool.execute(
    "unsupported-separator",
    { query: `notify operator：${payload}` },
    null,
    null,
    ctx,
  );
  assert.equal(harness.sentUserMessages.length, 0);
  const result = await tool.execute(
    "ascii-separator",
    { query: `notify operator: ${payload}` },
    null,
    null,
    ctx,
  );
  assert.equal(result.details.data.userMessageSent, true);
  assert.equal(harness.sentUserMessages[0].text, payload);
});
