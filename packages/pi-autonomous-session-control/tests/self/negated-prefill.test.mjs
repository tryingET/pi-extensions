import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntent } from "../../extensions/self/query-resolver.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

const observedQuery =
  "Closeout audit progress/loop check only: summarize verified proof gathered since latest user closeout request, remaining mandatory gaps, and minimal next actions. Do not prefill editor or write anything.";

for (const query of [
  observedQuery,
  "What files have I touched? Do not prefill or write anything.",
  "Show progress; never prefill the editor.",
  'What is my progress? The prior answer mentioned "prefill: next step".',
]) {
  test(`incidental or negated prefill stays a perception query: ${query}`, () => {
    assert.equal(classifyIntent(query).domain, "perception");
  });
}

test("affirmative prefill syntax remains available", () => {
  assert.deepEqual(classifyIntent('Please prefill: "check the tests"'), {
    domain: "action",
    intent: "prefill_editor",
  });
});

test("observed query returns a mirror answer and preserves the existing draft", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  try {
    const harness = createPiHarness();
    extension(harness.pi);
    const ctx = createMockContext();
    const draft = "OPERATOR-DRAFT-SENTINEL";
    let writes = 0;
    ctx.mode = "tui";
    ctx.hasUI = true;
    ctx.ui = {
      getEditorText: () => draft,
      setEditorText: () => {
        writes++;
        throw new Error("forbidden editor mutation");
      },
    };
    const result = await harness.tools
      .get("self")
      .execute("negated-prefill-observed", { query: observedQuery }, null, null, ctx);
    assert.equal(result.details.intent, "perception");
    assert.doesNotMatch(result.content[0].text, /What should I prefill/);
    assert.equal(writes, 0);
    assert.equal(ctx.ui.getEditorText(), draft);
  } finally {
    await cleanup(tempDir);
  }
});
