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
