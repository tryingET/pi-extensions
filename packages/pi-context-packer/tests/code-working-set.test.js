import assert from "node:assert/strict";
import { test } from "node:test";
import { codeContentKey, dedupeCodeItems, workingSetFromEntries } from "../src/code-working-set.js";

const key = "a".repeat(64);
const item = {
  content: "source",
  contentMode: "body",
  estimatedTokens: 3,
  provenance: { contentKey: key },
};
const message = {
  role: "toolResult",
  toolName: "context_pack",
  content: [{ type: "text", text: `context key: ${key}` }],
  details: { ok: true, sections: [{ provider: "ripwire", items: [item] }] },
};
test("working set only trusts keys in active successful visible tool results", () => {
  assert.deepEqual(workingSetFromEntries([{ type: "message", message }]).keys, [key]);
  assert.deepEqual(
    workingSetFromEntries([{ type: "message", message: { ...message, isError: true } }]).keys,
    [],
  );
  assert.deepEqual(
    workingSetFromEntries([{ type: "message", message: { ...message, content: [] } }]).keys,
    [],
  );
  assert.deepEqual(workingSetFromEntries([]).keys, []);
  assert.equal(workingSetFromEntries(null).available, false);
});
test("metadata does not perpetuate a false loaded claim after compaction", () => {
  const w = { available: true, keys: [key] };
  const duplicate = dedupeCodeItems([item], w).items[0];
  assert.equal(duplicate.contentMode, "metadata");
  assert.equal(item.content, "source");
  assert.equal(dedupeCodeItems([item], w, true).duplicates, 0);
  assert.equal(dedupeCodeItems([item], { available: false, keys: [key] }).duplicates, 0);
  const m = {
    ...message,
    details: { ok: true, sections: [{ provider: "ripwire", items: [duplicate] }] },
  };
  assert.deepEqual(workingSetFromEntries([{ type: "message", message: m }]).keys, []);
});
test("code keys separate source root, range, content and representation", () => {
  const base = { path: "a.ts", line: 1, contentSha256: key, mode: "signature" };
  const first = codeContentKey("/one", base, "abc");
  for (const [root, rec, text] of [
    ["/two", base, "abc"],
    ["/one", { ...base, line: 2 }, "abc"],
    ["/one", { ...base, mode: "body" }, "abc"],
    ["/one", base, "abcd"],
  ])
    assert.notEqual(codeContentKey(root, rec, text), first);
});
