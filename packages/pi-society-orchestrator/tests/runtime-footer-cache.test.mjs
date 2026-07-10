import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionTokenHistoryCache,
  summarizeSessionTokenEntries,
} from "../src/runtime/session-token-history.js";

let nextEntryId = 0;
function assistant(input, output = 0, id = `assistant-${++nextEntryId}`) {
  return { id, type: "message", message: { role: "assistant", usage: { input, output } } };
}

test("runtime footer token cache scans only appended history", () => {
  const cache = createSessionTokenHistoryCache();
  const entries = Array.from({ length: 10_000 }, () => assistant(1, 2));
  assert.deepEqual(summarizeSessionTokenEntries([...entries], cache), {
    input: 10_000,
    output: 20_000,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.equal(cache.scannedEntries, 10_000);
  entries.push(assistant(3, 4));
  assert.equal(summarizeSessionTokenEntries(structuredClone(entries), cache).input, 10_003);
  assert.equal(
    cache.scannedEntries,
    10_001,
    "append render must process only the new entry even when entries are defensive deep copies",
  );
});

test("runtime footer token cache invalidates when a stable-id boundary usage changes", () => {
  const cache = createSessionTokenHistoryCache();
  const entries = [assistant(2, 3, "stable-tail")];
  summarizeSessionTokenEntries(entries, cache);
  const changed = structuredClone(entries);
  changed[0].message.usage.input = 7;
  assert.deepEqual(summarizeSessionTokenEntries(changed, cache), {
    input: 7,
    output: 3,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.equal(cache.scannedEntries, 2);
});

test("runtime footer token cache invalidates on truncation and branch replacement", () => {
  const cache = createSessionTokenHistoryCache();
  const first = assistant(1);
  const oldTail = assistant(2);
  summarizeSessionTokenEntries([first, oldTail], cache);
  assert.equal(summarizeSessionTokenEntries([first], cache).input, 1);
  assert.equal(summarizeSessionTokenEntries([first, assistant(9)], cache).input, 10);
  assert.equal(cache.scannedEntries, 4);
});
