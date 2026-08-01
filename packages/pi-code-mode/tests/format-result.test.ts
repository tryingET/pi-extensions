import assert from "node:assert/strict";
import test from "node:test";
import { truncateUtf8 } from "../src/format-result.ts";

test("truncateUtf8 keeps the complete result within the byte limit", () => {
  const result = truncateUtf8("x".repeat(1_000), 100);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text, "utf8") <= 100);
  assert.match(result.text, /output truncated/);
});

test("truncateUtf8 never emits a broken Unicode replacement character", () => {
  const result = truncateUtf8("🙂🙂🙂", 5);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text, "utf8") <= 5);
  assert.equal(result.text.includes("�"), false);
});
