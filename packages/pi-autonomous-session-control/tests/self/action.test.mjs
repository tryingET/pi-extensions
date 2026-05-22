/**
 * Tests for action domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

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
  assert.ok(result.content[0].text.includes("before level-4 dogfood"));
  assert.ok(result.content[0].text.includes("verify level-4 closeout"));
  assert.equal(result.details.data.checkpoints.length, 1);
  assert.equal(result.details.data.pendingFollowups.length, 1);

  await cleanup(tempDir);
});
