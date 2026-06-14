/**
 * Tests for perception domain queries.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeTouchedFileBudgets } from "../../extensions/self/file-budget.ts";
import { rankSliceCandidates } from "../../extensions/self/perception.ts";
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

test("self query: files touched returns empty when no operations", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "What files have I touched?" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("No files touched"), "should report no files touched");

  await cleanup(tempDir);
});

test("self query: am I looping returns no loops initially", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "Am I in a loop?" }, null, null, ctx);

  assert.ok(result.content[0].text.includes("no loop concern"), "should report no loops");

  await cleanup(tempDir);
});

test("self query: files touched includes mirror-only file budget cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-"));
  const harness = createPiHarness();

  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "large.ts"), `${"x\n".repeat(501)}`, "utf8");
    extension(harness.pi);
    harness.eventHandlers.get("tool_call")({
      toolName: "edit",
      input: { path: "src/large.ts", oldText: "x", newText: "x\ny" },
    });

    const result = await harness.tools
      .get("self")
      .execute(
        "tc-file-budget",
        { query: "What files have I touched?" },
        null,
        null,
        createMockContext({ cwd: workspace }),
      );

    assert.match(result.content[0].text, /File-budget cues/);
    assert.match(result.content[0].text, /src\/large\.ts exceeds code budget/);
    assert.equal(result.details.data.fileBudgetObservations[0].kind, "code");
    assert.equal(result.details.data.fileBudgetObservations[0].growing, true);
  } finally {
    await cleanup(tempDir);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("self file-budget cues classify absolute in-cwd paths relative to cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-absolute-"));

  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    const absolutePath = join(workspace, "src", "large.ts");
    await writeFile(absolutePath, `${"x\n".repeat(501)}`, "utf8");

    const observations = analyzeTouchedFileBudgets([{ path: absolutePath, netLinesDelta: 1 }], {
      cwd: workspace,
    });

    assert.equal(observations.length, 1);
    assert.equal(observations[0].path, "src/large.ts");
    assert.equal(observations[0].kind, "code");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("self file-budget cues ignore touched paths outside cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "self-file-budget-outside-"));

  try {
    await mkdir(join(outside, "src"), { recursive: true });
    await writeFile(join(outside, "src", "large.ts"), `${"x\n".repeat(501)}`, "utf8");

    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: join(outside, "src", "large.ts"), netLinesDelta: 1 }], {
        cwd: workspace,
      }),
      [],
    );
    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: "../src/large.ts", netLinesDelta: 1 }], {
        cwd: join(outside, "child"),
      }),
      [],
    );
    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: "node_modules/pkg/large.ts", netLinesDelta: 1 }], {
        cwd: workspace,
      }),
      [],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("self query: current objective mirrors caller-provided latest intent", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const result = await harness.tools.get("self").execute(
    "tc-current-objective",
    {
      query: "what is my current objective?",
      context: {
        latestUserIntent: "Proceed with other suggestions.",
        currentObjective: "Improve autonomous self and Pi harness affordances.",
      },
    },
    null,
    null,
    createMockContext(),
  );

  assert.match(result.content[0].text, /Mirror-only session intent/);
  assert.match(result.content[0].text, /Proceed with other suggestions/);
  assert.equal(result.details.data.sessionIntent.source, "caller_context");
  assert.equal(
    result.details.data.sessionIntent.currentObjective,
    "Improve autonomous self and Pi harness affordances.",
  );

  await cleanup(tempDir);
});

test("self handoff summary includes latest intent as mirror-only context", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const result = await harness.tools.get("self").execute(
    "tc-handoff-intent",
    {
      query: "controller handoff summary",
      context: {
        latestUserIntent: "Continue ASC self-awareness slice.",
        currentObjective: "Expose latest operator intent in self handoffs.",
      },
    },
    null,
    null,
    createMockContext(),
  );

  assert.match(result.content[0].text, /latestUserIntent=Continue ASC self-awareness slice/);
  assert.match(result.content[0].text, /currentObjective=Expose latest operator intent/);
  assert.equal(result.details.data.sessionIntent.source, "caller_context");

  await cleanup(tempDir);
});

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

test("self query: progress status when no progress", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-1",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.ok(
    result.content[0].text.includes("No file progress") ||
      result.content[0].text.includes("Progress"),
    "should report progress status",
  );

  await cleanup(tempDir);
});

test("self query: session summary", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "summary" }, null, null, ctx);

  assert.ok(result.content[0].text.includes("Session"), "should include session info");
  assert.ok(result.details.data.turns !== undefined, "should include turn count");

  await cleanup(tempDir);
});

test("self query: capability discovery", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute("tc-1", { query: "capability discovery" }, null, null, ctx);

  assert.ok(result.details.understood, "should understand capability discovery query");
  assert.ok(result.content[0].text.includes("Perception"), "should list perception domain");
  assert.ok(result.content[0].text.includes("Direction"), "should list direction domain");
  assert.ok(
    result.content[0].text.includes("Crystallization"),
    "should list crystallization domain",
  );
  assert.ok(result.content[0].text.includes("Protection"), "should list protection domain");
  assert.ok(result.content[0].text.includes("Action"), "should list action domain");
  assert.ok(result.content[0].text.includes("toolbox"), "should mention toolbox discovery");
  assert.ok(result.content[0].text.includes("capability maps"), "should mention capability maps");
  assert.ok(
    result.content[0].text.includes("repo-capability-map.md"),
    "should mention repo capability-map docs",
  );
  assert.ok(
    result.content[0].text.includes("pi-extensions/docs/project/root-capabilities.md"),
    "should mention root capabilities docs",
  );
  assert.ok(result.content[0].text.includes("agent_vent"), "should mention agent-vent companion");
  assert.ok(result.details.data.domains, "should return domains data");
  assert.ok(result.details.data.discoverySurfaces, "should return discovery surfaces data");

  await cleanup(tempDir);
});

test("self query: capability routing variant", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-capability-routing",
    { query: "capability routing" },
    null,
    null,
    ctx,
  );

  assert.ok(result.details.understood, "should understand capability routing query");
  assert.equal(result.details.intent, "meta");
  assert.ok(result.content[0].text.includes("toolbox"), "should mention toolbox discovery");
  assert.ok(result.content[0].text.includes("agent_vent"), "should mention agent-vent companion");
  assert.ok(result.content[0].text.includes("capability maps"), "should mention capability maps");

  await cleanup(tempDir);
});

test("self query: controller handoff summary includes actionable mirror cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab\nc" } });
  toolCallHandler({ toolName: "bash", toolCallId: "cmd-1", input: { command: "npm test" } });
  toolResultHandler({ toolName: "bash", toolCallId: "cmd-1", isError: false, content: [] });
  toolCallHandler({ toolName: "bash", toolCallId: "cmd-2", input: { command: "npm run check" } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: "cmd-2",
    isError: true,
    content: [{ type: "text", text: "lint failed on a.ts" }],
  });

  const result = await tool.execute(
    "tc-handoff",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Mirror-only handoff summary"));
  assert.ok(result.content[0].text.includes("a.ts"));
  assert.ok(result.content[0].text.includes("failed: npm run check"));
  assert.equal(result.details.data.authority, "mirror_only");
  assert.equal(result.details.data.files[0].netLinesDelta, 1);
  assert.equal(result.details.data.commands.length, 2);
  assert.equal(result.details.data.errors[0].tool, "bash");
  assert.equal(result.details.data.errors[0].activeCount, 1);
  assert.ok(result.details.data.cues.some((cue) => cue.includes("failed command")));
  assert.equal(result.details.data.nextMove, undefined);
  assert.equal(result.details.data.sliceCandidates.length, 0);

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

test("self query: time since change uses turns since meaningful change", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const turnStartHandler = harness.eventHandlers.get("turn_start");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  turnStartHandler();
  turnStartHandler();
  toolCallHandler({ toolName: "edit", input: { path: "a.ts", oldText: "a", newText: "ab" } });
  turnStartHandler();

  const result = await tool.execute(
    "tc-time-since",
    { query: "How many turns since last meaningful change?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.turnsSince, 1);

  await cleanup(tempDir);
});

test("self query: stalled can trigger after earlier edits when no recent meaningful change", async () => {
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

  const result = await tool.execute(
    "tc-stalled",
    { query: "What progress have I made?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.data.isStalled, true);

  await cleanup(tempDir);
});
