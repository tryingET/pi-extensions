import assert from "node:assert/strict";
import { extract } from "../src/native.ts";

const html =
  "<!doctype html><html><head><title>Clipper fixture</title></head><body><article><h1>Clipper fixture</h1><p>Clipper fixture evidence: inert caller HTML.</p><p>This native smoke performs no page fetch, model POST or vault write.</p></article></body></html>";
const result = await extract("https://example.com/clipper-fixture", html);
// Independent smoke assertion: metadata must not satisfy the body/content checks.
const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(result.markdown);
assert.ok(match, "Expected native frontmatter followed by a body");
const body = match[1];
assert.ok(body.trim() && /[\p{L}\p{N}\p{S}]/u.test(body), "Native body is empty");
assert.match(body, /Clipper fixture evidence/);
assert.match(body, /This native smoke performs no page fetch, model POST or vault write\./);
for (const [key, value] of [
  ["space", "input"],
  ["kind", "source"],
  ["state", "captured"],
])
  assert.match(result.markdown, new RegExp(`^${key}: ["']?${value}["']?$`, "m"));
assert.match(result.markdown, /^source:.*https:\/\/example\.com\/clipper-fixture/m);
assert.match(result.markdown, /^captured:/m);
assert.equal(result.saved, false);
console.log(
  JSON.stringify({ nativeFixturePassed: true, bodyBytes: Buffer.byteLength(body), ...result }),
);
