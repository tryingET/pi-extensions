// summary: explicit prefill payloads cannot dispatch a saved continuation.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntent } from "../../extensions/self/query-resolver.ts";
import {
  cleanup,
  createMockContext,
  createPiHarness,
  loadExtensionWithMocks,
  reloadExtensionWithMocks,
} from "./harness.mjs";

async function fixture(t, draft = "", hasUI = true) {
  const loaded = await loadExtensionWithMocks();
  t.after(() => cleanup(loaded.tempDir));
  const seed = createPiHarness();
  loaded.default(seed.pi);
  let editorText = draft;
  const writes = [];
  const ctx = createMockContext({
    cwd: "/repo/explicit-prefill-continuation",
    hasUI,
    ui: {
      getEditorText: () => editorText,
      setEditorText: (text) => {
        writes.push(text);
        editorText = text;
      },
    },
  });
  const recorded = await seed.tools
    .get("self")
    .execute("seed", { query: "record continuation candidate: npm test" }, null, null, ctx);
  assert.equal(recorded.details.data.recorded, true);
  assert.equal(seed.sentUserMessages.length, 0);
  const reloaded = await reloadExtensionWithMocks(loaded.tempDir);
  const harness = createPiHarness();
  reloaded.default(harness.pi);
  const run = (query, context) =>
    harness.tools.get("self").execute("prefill-continuation", { query, context }, null, null, ctx);
  const summary = await run("action summary");
  assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);
  assert.equal(
    summary.details.data.currentCwdFreshContinuationCandidates[0].prefillText,
    "npm test",
  );
  return {
    harness,
    run,
    ctx,
    writes,
    get text() {
      return editorText;
    },
  };
}

const editors = [
  ["empty", "", true, "prefilled"],
  ["nonempty", "operator draft", true, "nonempty_draft"],
  ["no UI", "", false, "no_ui"],
];
for (const [query, payload] of [
  ["prefill: continue safely", "continue safely"],
  ['prefill: "continue suggested next move"', "continue suggested next move"],
]) {
  for (const [label, draft, hasUI, outcome] of editors) {
    test(`literal ${query} with saved npm test and ${label} editor`, async (t) => {
      const f = await fixture(t, draft, hasUI);
      const result = await f.run(query);
      assert.equal(f.harness.sentUserMessages.length, 0, "prefill must never send");
      assert.equal(result.details.data.text, payload, "colon payload owns its text");
      assert.equal(result.details.data.userMessageSent, false);
      assert.equal(result.details.data.prefillSuggested, true);
      assert.equal(result.details.data.prefillRequested, true);
      assert.equal(result.details.data.prefillPerformed, outcome === "prefilled");
      assert.equal(result.details.data.editorDelivery.outcome, outcome);
      assert.deepEqual(f.writes, outcome === "prefilled" ? [payload] : []);
      assert.equal(f.text, outcome === "prefilled" ? payload : draft);
      const summary = await f.run("action summary");
      assert.equal(summary.details.data.followUpPolicy.totalSent, 0);
      assert.equal(
        summary.details.data.followUpPolicy.totalPrefilled,
        outcome === "prefilled" ? 1 : 0,
      );
      assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);
      assert.equal(summary.details.data.continuationCandidates[0].consumedByFollowUpId, undefined);
      // The saved command really is sendable; do not pass merely because a safety gate blocked it.
      const continued = await f.run("continue safely");
      assert.equal(continued.details.data.usedPersistedContinuationCandidate, true);
      assert.equal(continued.details.data.userMessageSent, true);
      assert.match(f.harness.sentUserMessages[0].text, /Action: npm test/);
    });
  }
}

for (const [label, draft, hasUI] of editors) {
  test(`affirmative prefill excludes sends independently of resolver flags (${label})`, async (t) => {
    const f = await fixture(t, draft, hasUI);
    // This existing non-colon route still proposes a continuation, not an editor prefill.
    const result = await f.run("please prefill continue safely");
    assert.equal(result.details.data.sendUserMessage, true);
    assert.equal(result.details.data.prefill, false);
    assert.equal(result.details.data.usedPersistedContinuationCandidate, true);
    assert.equal(f.harness.sentUserMessages.length, 0);
    assert.equal(result.details.data.userMessageSent, false);
    assert.equal(result.details.data.prefillRequested, true);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(result.details.data.editorDelivery.outcome, "shown");
    assert.match(result.content[0].text, /Editor prefill not performed/);
    assert.deepEqual(f.writes, []);
    assert.equal(f.text, draft);
    const summary = await f.run("action summary");
    assert.equal(summary.details.data.followUpPolicy.totalSent, 0);
    assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);
  });
}

test("colon prefill owns action/diagnostic keywords; context text keeps precedence", async (t) => {
  for (const payload of [
    "continue safely",
    "continue diagnostic review",
    "create checkpoint",
    "dogfood self",
    "create handoff prompt",
    "notify operator: checks passed",
  ]) {
    assert.deepEqual(classifyIntent(`Please prefill: ${payload}`), {
      domain: "action",
      intent: "prefill_editor",
    });
  }
  const f = await fixture(t);
  const result = await f.run("prefill: continue safely", { text: "context-owned text" });
  assert.equal(result.details.data.text, "context-owned text");
  assert.deepEqual(f.writes, ["context-owned text"]);
  assert.equal(f.harness.sentUserMessages.length, 0);
});

test("anchored notify/storage directives retain ownership of quoted prefill payloads", async (t) => {
  const f = await fixture(t, "operator draft");
  assert.deepEqual(classifyIntent('Remember: "prefill: continue safely"'), {
    domain: "crystallization",
    intent: "remember_pattern",
  });
  assert.deepEqual(classifyIntent('Mark as trap: "prefill: continue safely"'), {
    domain: "protection",
    intent: "mark_trap",
  });
  const result = await f.run('notify operator: "prefill: continue safely"');
  assert.equal(result.details.data.userMessageSent, true);
  assert.equal(result.details.data.prefillRequested, false);
  assert.equal(f.harness.sentUserMessages[0].text, "prefill: continue safely");
  assert.deepEqual(f.writes, []);
  assert.equal(f.text, "operator draft");
});

for (const [query, payload] of [
  ["prefill: continue safely; show only", "continue safely; show only"],
  ['prefill: "continue safely; do not prefill"', "continue safely; do not prefill"],
  [
    "Please prefill: continue suggested next move; don’t prefill",
    "continue suggested next move; don’t prefill",
  ],
  ["prefill: continue safely; do not\nprefill", "continue safely; do not\nprefill"],
  ["prefill:\ncontinue safely; show\nonly", "continue safely; show\nonly"],
  ["prefill: continue safely; no‑prefill", "continue safely; no‑prefill"],
  ["prefill: create checkpoint; show only", "create checkpoint; show only"],
  [
    "prefill: record continuation candidate: npm run check; show only",
    "record continuation candidate: npm run check; show only",
  ],
  [
    "prefill: dogfood self: continue diagnostic review; show only",
    "dogfood self: continue diagnostic review; show only",
  ],
  [
    "prefill: launch visible-loop self-evolution; show only",
    "launch visible-loop self-evolution; show only",
  ],
  ["prefill: create handoff prompt; show only", "create handoff prompt; show only"],
  [
    'prefill: notify operator: "continue safely"; show only',
    'notify operator: "continue safely"; show only',
  ],
]) {
  for (const [label, draft, hasUI] of editors) {
    test(`opt-out owns payload without effects (${label}): ${query}`, async (t) => {
      const f = await fixture(t, draft, hasUI);
      const result = await f.run(query);
      assert.equal(f.harness.sentUserMessages.length, 0, "opt-out must not enable a send");
      assert.deepEqual(f.writes, []);
      assert.equal(f.text, draft);
      assert.equal(result.details.data.text, payload);
      assert.equal(result.details.data.userMessageSent, false);
      assert.equal(result.details.data.prefillSuggested, true);
      assert.equal(result.details.data.prefillRequested, false);
      assert.equal(result.details.data.prefillPerformed, false);
      assert.equal(result.details.data.editorDelivery.outcome, "shown");
      assert.match(result.content[0].text, /Editor unchanged/);
      const summary = await f.run("action summary");
      assert.equal(summary.details.data.followUpPolicy.totalSent, 0);
      assert.equal(summary.details.data.followUpPolicy.totalBlocked, 0);
      assert.equal(summary.details.data.followUpPolicy.totalPrefilled, 0);
      assert.equal(summary.details.data.continuationCandidates.length, 1);
      assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);
      assert.equal(summary.details.data.continuationCandidates[0].consumedByFollowUpId, undefined);
      assert.equal(summary.details.data.checkpoints.length, 0);
      assert.equal(summary.details.data.followups.length, 0);
    });
  }
}

for (const [label, draft, hasUI] of editors) {
  test(`non-colon opt-out excludes sends despite resolver flags (${label})`, async (t) => {
    const f = await fixture(t, draft, hasUI);
    const result = await f.run("please prefill continue safely; don’t\nprefill");
    assert.equal(result.details.data.sendUserMessage, true);
    assert.equal(result.details.data.prefill, false);
    assert.equal(f.harness.sentUserMessages.length, 0);
    assert.equal(result.details.data.userMessageSent, false);
    assert.equal(result.details.data.prefillRequested, false);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(result.details.data.editorDelivery.outcome, "shown");
    assert.deepEqual(f.writes, []);
    assert.equal(f.text, draft);
    const summary = await f.run("action summary");
    assert.equal(summary.details.data.currentCwdFreshContinuationCandidates.length, 1);
    assert.equal(summary.details.data.continuationCandidates[0].consumedByFollowUpId, undefined);
    assert.equal(summary.details.data.followUpPolicy.totalSent, 0);
  });
}
