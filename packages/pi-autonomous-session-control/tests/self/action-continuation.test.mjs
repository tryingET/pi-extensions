import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: explicit continuation candidate owns diagnostic-looking payload", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({ cwd: "/repo/explicit-continuation" });

  const result = await tool.execute(
    "tc-record-explicit-continuation-diagnostic-payload",
    { query: "record continuation candidate: dogfood self: run local check" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "action");
  assert.match(result.content[0].text, /Continuation candidate recorded/);
  assert.equal(result.details.data.recorded, true);

  await cleanup(tempDir);
});

test("self query: bare peer explicit continuation candidate remains prefilled on continue", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  let editorText = "";
  const ctx = createMockContext({
    cwd: "/repo/explicit-continuation",
    hasUI: true,
    ui: {
      setEditorText(text) {
        editorText = text;
      },
    },
  });

  await tool.execute(
    "tc-record-bare-peer-explicit-continuation",
    { query: "record continuation candidate: peer review this change" },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-continue-bare-peer-explicit",
    { query: "continue safely" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.match(editorText, /peer review this change/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");

  await cleanup(tempDir);
});

test("self query: risky explicit continuation candidate remains prefilled on continue", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  let editorText = "";
  const ctx = createMockContext({
    cwd: "/repo/explicit-continuation",
    hasUI: true,
    ui: {
      setEditorText(text) {
        editorText = text;
      },
    },
  });

  await tool.execute(
    "tc-record-risky-explicit-continuation",
    { query: 'record continuation candidate: dispatch_subagent({ profile: "reviewer" })' },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-continue-risky-explicit",
    { query: "continue safely" },
    null,
    null,
    ctx,
  );

  assert.ok(result.content[0].text.includes("Editor prefilled"));
  assert.match(editorText, /dispatch_subagent/);
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.dispatchMode, "operator_review_required");
  assert.equal(result.details.data.usedPersistedContinuationCandidate, true);

  await cleanup(tempDir);
});

test("self query: explicit continuation candidate records without sending", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({ cwd: "/repo/explicit-continuation" });

  const result = await tool.execute(
    "tc-record-explicit-continuation",
    { query: "record continuation candidate: npm --prefix packages/pi-demo run check" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /Continuation candidate recorded/);
  assert.equal(result.details.data.recorded, true);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.prefill, false);
  assert.equal(result.details.data.continuationCandidate.kind, "self.continuation_candidate.v1");
  assert.equal(result.details.data.continuationCandidate.owner, "local-shell");
  assert.equal(harness.sentUserMessages.length, 0);

  await cleanup(tempDir);
});

test("self query: explicit continuation candidate requires text", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-record-explicit-continuation-empty",
    { query: "record continuation candidate" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /No continuation candidate recorded/);
  assert.equal(result.details.data.recorded, false);
  assert.equal(harness.sentUserMessages.length, 0);

  await cleanup(tempDir);
});

test("self query: action summary lists continuation candidates as mirror-only", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({ cwd: "/repo/continuation-summary" });
  const toolCallHandler = harness.eventHandlers.get("tool_call");

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-continuation-summary",
    input: { path: "src/continuation-summary.ts", content: "export const value = 1;\n" },
  });

  await tool.execute(
    "tc-record-continuation",
    { query: "controller handoff summary" },
    null,
    null,
    ctx,
  );

  const result = await tool.execute(
    "tc-action-summary-continuation",
    { query: "action summary" },
    null,
    null,
    ctx,
  );

  assert.match(result.content[0].text, /continuation candidates=1/);
  assert.match(result.content[0].text, /current-cwd fresh mirror-only candidates=1/);
  assert.match(result.content[0].text, /cross-cwd fresh candidates=0/);
  assert.match(
    result.content[0].text,
    /Continuation candidates are mirror-only routing hints, not authority/,
  );
  assert.match(result.content[0].text, /vertical \+ local-validation via local-shell/);
  assert.equal(result.details.data.continuationCandidates.length, 1);
  assert.equal(result.details.data.freshContinuationCandidates.length, 1);
  assert.equal(result.details.data.currentCwdFreshContinuationCandidates.length, 1);
  assert.equal(result.details.data.crossCwdFreshContinuationCandidateCount, 0);
  assert.equal(result.details.data.authority, "mirror_only");
  assert.match(result.details.data.nonAuthorizations[0], /durable owner writes/);

  await cleanup(tempDir);
});

test("self query: action summary separates cross-cwd continuation candidates", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const firstCtx = createMockContext({ cwd: "/repo/first" });
  const secondCtx = createMockContext({ cwd: "/repo/second" });

  toolCallHandler({
    toolName: "write",
    toolCallId: "write-cross-cwd-continuation",
    input: { path: "src/cross-cwd.ts", content: "export const value = 1;\n" },
  });

  await tool.execute(
    "tc-cross-cwd-record",
    { query: "controller handoff summary" },
    null,
    null,
    firstCtx,
  );

  const result = await tool.execute(
    "tc-cross-cwd-summary",
    { query: "action summary" },
    null,
    null,
    secondCtx,
  );

  assert.match(result.content[0].text, /continuation candidates=1/);
  assert.match(result.content[0].text, /current-cwd fresh mirror-only candidates=0/);
  assert.match(result.content[0].text, /cross-cwd fresh candidates=1/);
  assert.equal(result.details.data.currentCwdFreshContinuationCandidates.length, 0);
  assert.equal(result.details.data.crossCwdFreshContinuationCandidateCount, 1);

  await cleanup(tempDir);
});
