/**
 * Tests for perception domain queries.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

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
test("self query: autonomy status explains safe self-driving levels", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-autonomy-status",
    { query: "what level of autonomy is needed for you to be self-evolving?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "meta");
  assert.match(result.content[0].text, /Autonomy status/);
  assert.match(result.content[0].text, /Level 3/);
  assert.match(result.content[0].text, /Level 4/);
  assert.match(result.content[0].text, /Level 5/);
  assert.match(result.content[0].text, /Level 6 durable owner-surface mutation/);
  assert.equal(result.details.data.kind, "self.autonomy_status.v1");
  assert.equal(result.details.data.currentSafeDefaultLevel, 3);
  assert.deepEqual(result.details.data.neededForSelfEvolution, [3, 4, 5]);
  assert.match(result.details.data.nonAuthorizations[0], /hidden infinite loops/);

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
  assert.ok(
    result.content[0].text.includes("continue self-evolution"),
    "should advertise self-evolution continuation aliases",
  );
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
