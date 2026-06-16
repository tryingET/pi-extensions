import assert from "node:assert/strict";
import test from "node:test";
import { rankSliceCandidates } from "../../extensions/self/perception.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";
import { recordBash } from "./perception-harness.mjs";

test("self query: validation success does not recover unrelated provider errors", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolResultHandler = harness.eventHandlers.get("tool_result");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    toolResultHandler({
      toolName: "vault_query",
      toolCallId: `vault-failed-${i}`,
      isError: true,
      content: [{ type: "text", text: "Prompt Vault unavailable" }],
    });
  }
  recordBash(harness, "cmd-provider-unrelated-validation", "npm run check");

  const result = await tool.execute(
    "tc-provider-errors-not-recovered",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.errors[0].tool, "vault_query");
  assert.equal(result.details.data.errors[0].activeCount, 3);
  assert.equal(result.details.data.nextMove.owner, "peer-tools");

  await cleanup(tempDir);
});
test("self query: recurring provider errors stay active after local validation", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolResultHandler = harness.eventHandlers.get("tool_result");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    toolResultHandler({
      toolName: "vault_query",
      toolCallId: `vault-before-validation-${i}`,
      isError: true,
      content: [{ type: "text", text: "Prompt Vault unavailable" }],
    });
  }
  recordBash(harness, "cmd-provider-recurrence-validation", "npm run check");
  toolResultHandler({
    toolName: "vault_query",
    toolCallId: "vault-after-validation",
    isError: true,
    content: [{ type: "text", text: "Prompt Vault unavailable" }],
  });

  const result = await tool.execute(
    "tc-provider-errors-recur-after-validation",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.errors[0].tool, "vault_query");
  assert.equal(result.details.data.errors[0].count, 4);
  assert.equal(result.details.data.errors[0].activeCount, 4);
  assert.equal(result.details.data.nextMove.owner, "peer-tools");

  await cleanup(tempDir);
});
test("self query: git status after failures is not recovery evidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-unrecovered-${i}`, "npm run check", {
      isError: true,
      text: "lint failed on a.ts",
    });
  }
  recordBash(harness, "cmd-git-status", "git status --short");

  const result = await tool.execute(
    "tc-git-status-not-recovery",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));
  assert.ok(
    result.content[0].text.includes("failure-recovery"),
    "read-only git inspection should not suppress failure recovery cues",
  );

  await cleanup(tempDir);
});
test("self query: stall wording includes productive command evidence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab" } });
  for (let i = 0; i < 6; i++) {
    turnStartHandler();
  }
  recordBash(harness, "cmd-stall-validation", "npm run check");

  const progressResult = await tool.execute(
    "tc-stall-progress-evidence",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.equal(progressResult.details.data.isStalled, true);
  assert.equal(progressResult.details.data.concern, "stall_with_progress_evidence");
  assert.ok(progressResult.content[0].text.includes("progress evidence"));
  assert.equal(progressResult.details.data.progressEvidence.recentSuccessfulProductiveCommands, 1);

  const handoffResult = await tool.execute(
    "tc-stall-handoff-evidence",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.ok(
    handoffResult.details.data.cues.some((cue) => cue.includes("productive command evidence")),
    "handoff cues should contextualize stall evidence",
  );
  assert.equal(handoffResult.details.data.nextMove.owner, "pi-session-compaction");
  assert.equal(handoffResult.details.data.nextMove.slice, "temporal + artifact/packet");
  assert.ok(handoffResult.details.data.nextMove.prefillText.includes("/compact-focus"));

  await cleanup(tempDir);
});
test("self query: rank continuation slices surfaces multi-dimensional candidates", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-slice-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-slice-ranking",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only slice ranking"));
  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("temporal"));
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));
  assert.ok(result.details.data.nextMove.slice.includes("authority-risk"));
  assert.ok(result.details.data.nextMove.prefillText.startsWith("/scoutpeer "));
  assert.equal(result.details.data.sliceCandidates[0].confidence, "high");

  await cleanup(tempDir);
});
test("self perception: active failed command loops rank failure recovery beyond recent command window", () => {
  const candidates = rankSliceCandidates({
    files: [],
    commands: Array.from({ length: 5 }, () => ({
      command: "pwd",
      rawCommand: "pwd",
      success: true,
    })),
    errors: [],
    loops: {
      isLooping: true,
      patterns: [
        {
          type: "command_loop",
          key: "false",
          count: 3,
          firstSeen: Date.now() - 1000,
          lastSeen: Date.now(),
          severity: "critical",
        },
      ],
    },
    progress: {
      hasProgress: false,
      filesTouched: 0,
      operations: 0,
      turnsSinceChange: 0,
      isStalled: false,
      concern: "no_concern",
      progressEvidence: { recentSuccessfulProductiveCommands: 0 },
      summary: "no progress",
    },
  });

  assert.equal(candidates[0].owner, "peer-tools");
  assert.ok(candidates[0].evidence.some((item) => item.includes("failure-recovery")));
});
test("self query: successful nonproductive command loops do not rank failure recovery peer-tools", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-success-loop-${i}`, "pwd");
  }

  const result = await tool.execute(
    "tc-success-command-loop-slice-ranking",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.notEqual(result.details.data.nextMove?.owner, "peer-tools");
  assert.equal(
    result.details.data.sliceCandidates.some((candidate) =>
      candidate.slice.includes("failure-recovery"),
    ),
    false,
  );

  await cleanup(tempDir);
});
test("self query: edit-only loops do not rank failure recovery peer-tools", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    toolCallHandler({
      toolName: "edit",
      input: { path: "a.ts", oldText: "a", newText: `a${i}` },
    });
  }

  const result = await tool.execute(
    "tc-edit-only-loop-slice-ranking",
    { query: "rank continuation slices" },
    null,
    null,
    ctx,
  );

  assert.notEqual(result.details.data.nextMove?.owner, "peer-tools");
  assert.equal(
    result.details.data.sliceCandidates.some((candidate) =>
      candidate.slice.includes("failure-recovery"),
    ),
    false,
  );

  await cleanup(tempDir);
});
test("self query: compound failure-recovery cue request returns handoff packet", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  for (let i = 0; i < 3; i++) {
    recordBash(harness, `cmd-failed-compound-${i}`, "false", {
      isError: true,
      text: "Command exited with code 1",
    });
  }

  const result = await tool.execute(
    "tc-compound-failure-recovery",
    {
      query:
        "What visible loop/errors/failure-recovery cues triggered this scout? Include recent failed commands, loop status, files touched, and the smallest safe next action.",
    },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only handoff summary"));
  assert.ok(result.content[0].text.includes("failed: false"));
  assert.equal(result.details.data.nextMove.owner, "peer-tools");
  assert.ok(result.details.data.nextMove.slice.includes("failure-recovery"));

  await cleanup(tempDir);
});
