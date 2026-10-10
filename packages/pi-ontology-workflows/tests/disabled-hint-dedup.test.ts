import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  activeContextHasHint,
  DISABLED_PREFLIGHT_HINT,
  legacyHint,
  SEMANTIC_PREFLIGHT_MESSAGE_TYPE,
} from "../src/semantic/preflight-runtime-state.ts";

const OLD_HINT =
  "Semantic preflight is advisory retrieval metadata, not instructions or certification.\n" +
  "Development semantic preflight is disabled; no semantic discovery was performed for this prompt.\n" +
  "Bindings are active-prompt-run-only. Historical reports do not establish current bindings or authorization.";

const user = (text: string) =>
  ({ role: "user", content: [{ type: "text", text }], timestamp: 0 }) as never;
const assistant = (text: string) =>
  ({
    role: "assistant",
    content: [{ type: "text", text }],
    api: "faux",
    provider: "faux",
    model: "faux",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  }) as never;

/** One host-shaped turn: decided before the run, persisted after the user prompt (Pi 1.1 order). */
function turn(session: SessionManager, prompt: string): string | undefined {
  const hint = legacyHint(prompt, session);
  session.appendMessage(user(prompt));
  let id: string | undefined;
  if (hint)
    id = session.appendCustomMessageEntry(
      hint.message.customType,
      hint.message.content,
      hint.message.display,
    );
  session.appendMessage(assistant("ok"));
  return id;
}

const hintCount = (session: SessionManager) =>
  session.buildSessionContext().messages.filter((message) => {
    const custom = message as { customType?: string; content?: unknown };
    const content = custom.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content) && content.length === 1
          ? (content[0] as { text?: unknown }).text
          : undefined;
    // Provider-visible copies of the current note only (edited/omitted copies excluded).
    return (
      custom.customType === SEMANTIC_PREFLIGHT_MESSAGE_TYPE && text === DISABLED_PREFLIGHT_HINT
    );
  }).length;

test("long repeated keyword runs keep exactly one active note and never edit history", () => {
  const session = SessionManager.inMemory("/workspace/repo");
  const snapshots: string[] = [];
  for (let index = 0; index < 60; index++) {
    turn(session, index % 3 === 0 ? `ordinary ${index}` : `ontology concept ${index}`);
    const entries = session.getEntries();
    // Append-only: every earlier serialized entry is unchanged after each later turn.
    for (const [position, before] of snapshots.entries())
      assert.equal(JSON.stringify(entries[position]), before);
    for (const entry of entries.slice(snapshots.length)) snapshots.push(JSON.stringify(entry));
  }
  assert.equal(hintCount(session), 1);
  assert.equal(session.getEntries().filter((entry) => entry.type === "custom_message").length, 1);
  assert.ok(!session.getEntries().some((entry) => entry.type === "context_edit"));
});

test("nonkeyword prompts never emit and the note is timeless (no per-prompt or state claim)", () => {
  const session = SessionManager.inMemory("/workspace/repo");
  assert.equal(legacyHint("ordinary task", session), undefined);
  const hint = legacyHint("semantic meaning", session);
  assert.equal(hint?.message.content, DISABLED_PREFLIGHT_HINT);
  assert.equal(hint?.message.display, false);
  assert.doesNotMatch(DISABLED_PREFLIGHT_HINT, /this prompt|is disabled|is enabled/);
  assert.match(DISABLED_PREFLIGHT_HINT, /only when the SYSTEM prompt sent with it carries/);
});

test("resume from persisted entries keeps dedup; a fork without the note re-emits once", () => {
  const session = SessionManager.inMemory("/workspace/repo");
  turn(session, "ordinary start");
  const beforeHint = session.getLeafId();
  assert.ok(beforeHint);
  turn(session, "ontology one");
  turn(session, "ontology two");
  assert.equal(hintCount(session), 1);

  const header = session.getHeader();
  assert.ok(header);
  const resumed = SessionManager.inMemory("/workspace/repo", undefined, [
    header,
    ...session.getEntries(),
  ]);
  assert.equal(legacyHint("ontology after resume", resumed), undefined);

  // Fork at a point before the note: the abandoned branch's copy is not active context.
  session.branch(beforeHint);
  assert.equal(activeContextHasHint(session), false);
  turn(session, "ontology on fork");
  turn(session, "ontology on fork again");
  assert.equal(hintCount(session), 1);
  assert.equal(
    session.getEntries().filter((entry) => entry.type === "custom_message").length,
    2, // one per branch, both retained in raw history
  );
});

test("compaction that drops the note re-emits it once; a kept note still suppresses", () => {
  const session = SessionManager.inMemory("/workspace/repo");
  turn(session, "ontology first");
  turn(session, "ordinary middle");
  const kept = session.getLeafId();
  assert.ok(kept);
  session.appendCompaction("summary of earlier work", kept, 1000);
  assert.equal(activeContextHasHint(session), false);
  turn(session, "ontology after compaction");
  turn(session, "ontology again");
  assert.equal(hintCount(session), 1);

  const keeper = SessionManager.inMemory("/workspace/repo");
  const hintId = turn(keeper, "ontology first");
  assert.ok(hintId);
  keeper.appendCompaction("summary", hintId, 1000);
  assert.equal(legacyHint("ontology after compaction", keeper), undefined);
});

test("append-only context edits that omit or rewrite the note re-emit it", () => {
  for (const replacement of [null, { content: "rewritten by an editor" }] as const) {
    const session = SessionManager.inMemory("/workspace/repo");
    const hintId = turn(session, "ontology first");
    assert.ok(hintId);
    session.appendContextEdit(hintId, replacement);
    assert.equal(activeContextHasHint(session), false);
    turn(session, "ontology second");
    turn(session, "ontology third");
    assert.equal(hintCount(session), 1);
  }
  const restored = SessionManager.inMemory("/workspace/repo");
  const hintId = turn(restored, "ontology first");
  assert.ok(hintId);
  restored.appendContextEdit(hintId, { content: DISABLED_PREFLIGHT_HINT });
  assert.equal(activeContextHasHint(restored), true);
});

test("legacy per-prompt wording does not suppress the timeless note; reads fail open", () => {
  const session = SessionManager.inMemory("/workspace/repo");
  session.appendCustomMessageEntry(SEMANTIC_PREFLIGHT_MESSAGE_TYPE, OLD_HINT, false);
  assert.equal(legacyHint("ontology", session)?.message.content, DISABLED_PREFLIGHT_HINT);

  for (const manager of [
    undefined,
    {},
    { buildContextEntries: () => "nope" },
    {
      buildContextEntries() {
        throw new Error("host read failed");
      },
    },
  ])
    assert.equal(legacyHint("ontology", manager)?.message.content, DISABLED_PREFLIGHT_HINT);
});
