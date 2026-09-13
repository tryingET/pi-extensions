// summary: editor intent, observable-draft safety and truthful delivery across self action routes.
// read_when: changing self editor mutation or send-failure behavior.
import assert from "node:assert/strict";
import test from "node:test";
import {
  captureEditorDraft,
  hasExplicitEditorIntent,
} from "../../extensions/self/editor-prefill.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function editor(initial = "", overrides = {}) {
  let text = initial;
  const writes = [];
  const ctx = createMockContext({
    hasUI: true,
    ui: {
      getEditorText: () => text,
      setEditorText: (next) => {
        writes.push(next);
        text = next;
      },
    },
    ...overrides,
  });
  return {
    ctx,
    writes,
    get text() {
      return text;
    },
    set text(next) {
      text = next;
    },
  };
}
async function fixture(t) {
  const loaded = await loadExtensionWithMocks();
  t.after(() => cleanup(loaded.tempDir));
  const harness = createPiHarness();
  loaded.default(harness.pi);
  const tool = harness.tools.get("self");
  return {
    harness,
    run: (query, ctx, context) => tool.execute("draft-test", { query, context }, null, null, ctx),
  };
}

for (const query of [
  "create self-contained handoff prompt",
  "show fresh session handoff prompt",
  "create handoff prompt, no-prefill",
  "create handoff prompt, do not prefill",
  "should I prefill a handoff prompt?",
  "show prefill handoff prompt",
  "prefill handoff prompt, show only",
  "prefill handoff prompt, show-only",
  "prefill handoff prompt; do not\nprefill",
  "prefill handoff prompt; don’t prefill",
  "prefill handoff prompt; do-not-prefill",
  "prefill handoff prompt; no‑prefill",
]) {
  test(`handoff is nonmutating without affirmative editor intent: ${query}`, async (t) => {
    const f = await fixture(t);
    for (const draft of ["", "operator draft"]) {
      const e = editor(draft);
      const result = await f.run(query, e.ctx, { prefill: true });
      assert.equal(e.text, draft);
      assert.deepEqual(e.writes, []);
      assert.equal(f.harness.sentUserMessages.length, 0);
      assert.equal(result.details.data.prefillRequested, false);
      assert.equal(result.details.data.prefillPerformed, false);
      assert.equal(result.details.data.editorDelivery.outcome, "shown");
      assert.match(result.details.data.text, /fresh, stateless Pi coding session/);
      assert.doesNotMatch(result.content[0].text, /Editor prefilled/);
    }
  });
}

test("explicit intent must be anchored; quoted or negative intent cannot mutate", () => {
  assert.equal(hasExplicitEditorIntent("Prefill: review the output"), true);
  assert.equal(hasExplicitEditorIntent("please prefill self-contained handoff prompt"), true);
  for (const query of [
    "suggest input: next command",
    'notify operator: "prefill: next"',
    "explain prefill editor",
    "do not prefill: next",
    "prefill handoff prompt; don't prefill",
    "prefill handoff prompt; no prefill",
  ])
    assert.equal(hasExplicitEditorIntent(query), false, query);
});

test("explicit empty-editor handoff prefill records actual readback and increments telemetry once", async (t) => {
  const f = await fixture(t),
    e = editor();
  const result = await f.run("prefill self-contained handoff prompt", e.ctx);
  assert.equal(e.writes.length, 1);
  assert.equal(e.text, result.details.data.text);
  assert.deepEqual(result.details.data.editorDelivery, {
    requested: true,
    available: true,
    outcome: "prefilled",
  });
  assert.match(result.content[0].text, /Editor prefilled/);
  assert.equal(f.harness.sentUserMessages.length, 0);
  const again = await f.run("prefill: another suggestion", e.ctx);
  assert.equal(again.details.data.prefillBlockedReason, "nonempty_draft");
  const summary = await f.run("action summary", e.ctx);
  assert.equal(summary.details.data.followUpPolicy.totalPrefilled, 1);
  assert.equal(e.writes.length, 1);
});

for (const draft of ["operator draft", " \n"]) {
  test(`explicit prefill preserves nonempty draft ${JSON.stringify(draft)}`, async (t) => {
    const f = await fixture(t),
      e = editor(draft);
    const result = await f.run("prefill: next local check", e.ctx);
    assert.equal(result.details.data.editorDelivery.outcome, "nonempty_draft");
    assert.equal(result.details.data.prefillRequested, true);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(e.text, draft);
    assert.deepEqual(e.writes, []);
    assert.equal(f.harness.sentUserMessages.length, 0);
  });
}

test("wrapper captures draft before its first await and preserves intervening edits", async (t) => {
  const f = await fixture(t),
    e = editor();
  const pending = f.run("prefill: suggested local check", e.ctx);
  e.text = "typed while self awaited memory";
  const result = await pending;
  assert.equal(result.details.data.prefillBlockedReason, "draft_changed");
  assert.match(result.content[0].text, /intervening operator edit preserved/);
  assert.equal(e.text, "typed while self awaited memory");
  assert.deepEqual(e.writes, []);
  assert.equal(f.harness.sentUserMessages.length, 0);
});

for (const [label, overrides, expected] of [
  ["no UI", { hasUI: false }, "no_ui"],
  ["RPC empty placeholder", { mode: "rpc" }, "editor_state_unavailable"],
  ["unknown mode", { mode: undefined }, "editor_state_unavailable"],
  ["print", { mode: "print" }, "editor_state_unavailable"],
  [
    "missing getter",
    { ui: { setEditorText: () => assert.fail("forbidden write") } },
    "editor_state_unavailable",
  ],
  [
    "throwing getter",
    {
      ui: {
        getEditorText: () => {
          throw new Error("unreadable");
        },
        setEditorText: () => assert.fail("forbidden write"),
      },
    },
    "editor_state_unavailable",
  ],
]) {
  test(`prefill fails closed for ${label}`, async (t) => {
    const f = await fixture(t),
      e = editor("", overrides);
    const result = await f.run("prefill: next local check", e.ctx);
    assert.equal(result.details.data.editorDelivery.outcome, expected);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.deepEqual(e.writes, []);
    assert.equal(f.harness.sentUserMessages.length, 0);
  });
}

test("unavailable recheck, setter failure and unconfirmed write never claim success or retry", async (t) => {
  const f = await fixture(t);
  let reads = 0;
  const e = editor();
  e.ctx.ui.getEditorText = () => (++reads === 1 ? "" : undefined);
  const unreadable = await f.run("prefill: text", e.ctx);
  assert.equal(unreadable.details.data.editorDelivery.outcome, "editor_state_unavailable");
  assert.deepEqual(e.writes, []);
  for (const throws of [true, false]) {
    let writes = 0;
    const ctx = editor().ctx;
    ctx.ui.setEditorText = () => {
      writes++;
      if (throws) throw new Error("setter failed");
    };
    const result = await f.run("prefill: text", ctx);
    assert.equal(
      result.details.data.editorDelivery.outcome,
      throws ? "write_failed" : "write_unconfirmed",
    );
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(writes, 1);
    assert.doesNotMatch(result.content[0].text, /Editor prefilled/);
  }
  assert.equal(f.harness.sentUserMessages.length, 0);
  const summary = await f.run("action summary", e.ctx);
  assert.equal(summary.details.data.followUpPolicy.totalPrefilled, 0);
});

test("nonexplicit slash and risky notifications never write even to an empty editor", async (t) => {
  const f = await fixture(t),
    e = editor();
  for (const query of [
    "notify operator: /visible-loop --count 1",
    "notify operator: please commit everything",
  ]) {
    const result = await f.run(query, e.ctx);
    assert.equal(result.details.data.prefillRequested, false);
    assert.equal(result.details.data.prefillPerformed, false);
    assert.equal(result.details.data.userMessageSent, false);
  }
  assert.deepEqual(e.writes, []);
  assert.equal(f.harness.sentUserMessages.length, 0);
});

test("dedup/budget blocked followups preserve drafts and report no safety prefill", async (t) => {
  const f = await fixture(t),
    e = editor("operator draft");
  const query = "notify operator: Local validation passed.";
  assert.equal((await f.run(query, e.ctx)).details.data.userMessageSent, true);
  const duplicate = await f.run(query, e.ctx);
  assert.equal(duplicate.details.data.userMessageBlockedReason, "self_driving_dedup_suppressed");
  assert.equal(duplicate.details.data.safetyPrefillPerformed, false);
  for (let i = 0; i < 7; i++)
    await f.run(`notify operator: Validation result ${i} is available.`, e.ctx);
  const budget = await f.run("notify operator: Final validation result is available.", e.ctx);
  assert.equal(budget.details.data.userMessageBlockedReason, "self_driving_budget_exhausted");
  assert.equal(budget.details.data.safetyPrefillPerformed, false);
  assert.equal(e.text, "operator draft");
  assert.deepEqual(e.writes, []);
});

test("a failed asynchronous send cannot overwrite an intervening draft as a fallback", async (t) => {
  const f = await fixture(t),
    e = editor();
  let rejectSend;
  f.harness.pi.sendUserMessage = () =>
    new Promise((_resolve, reject) => {
      rejectSend = reject;
    });
  const pending = f.run("notify operator: Local checks passed.", e.ctx);
  while (!rejectSend) await new Promise((resolve) => setImmediate(resolve));
  e.text = "new operator draft during send";
  rejectSend(new Error("test transport failure"));
  const result = await pending;
  assert.equal(result.details.data.userMessageSendFailed, true);
  assert.equal(result.details.data.safetyPrefillPerformed, false);
  assert.equal(result.details.data.prefillPerformed, false);
  assert.equal(e.text, "new operator draft during send");
  assert.deepEqual(e.writes, []);
});

test("draft guard has no asynchronous gap between final comparison and the write", () => {
  const e = editor();
  const guard = captureEditorDraft(e.ctx);
  assert.equal(guard.apply(true, "explicit text").outcome, "prefilled");
  assert.equal(e.text, "explicit text");
});
