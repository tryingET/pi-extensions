import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCodeRequest } from "../src/code-request.js";
import { expansionArguments, parseExpansion } from "../src/ripwire-expansion.js";

const selection = { path: "src/a.ts", name: "target", line: 201, contentSha256: "a".repeat(64) };
const xml =
  '<ctx><bodies shown="1" total="1" capped="0"><b p="src/a.ts" n="target" l="201" t="fn"><![CDATA[function target() { return 42; }]]></b></bodies></ctx>';
test("expansion requires a strict hash-bound literal selector", () => {
  assert.equal(normalizeCodeRequest({ mode: "expand", selection }).selection.line, 201);
  assert.ok(expansionArguments("/tmp/corpus", selection).includes("--expand=src/a.ts:201:target"));
  for (const value of [
    { ...selection, path: "../escape.ts" },
    { ...selection, name: "a,b" },
    { ...selection, contentSha256: "unknown" },
    { ...selection, line: 0 },
    { ...selection, flags: "--run-trace" },
  ])
    assert.throws(() => normalizeCodeRequest({ mode: "expand", selection: value }));
});
test("expansion rejects multiple definitions and mismatched line despite upstream selector behavior", () => {
  assert.match(parseExpansion(xml, selection).records[0].content, /42/);
  assert.throws(() => parseExpansion(xml, { ...selection, line: 202 }), /ambiguous/);
  assert.throws(
    () => parseExpansion(xml.replace('total="1"', 'total="2"'), selection),
    /ambiguous/,
  );
  assert.throws(() => parseExpansion(`<!DOCTYPE x>${xml}`, selection));
});
test("CDATA rejoins safely while preserving redaction disclosure", () => {
  const body = xml
    .replace(' t="fn"', ' t="fn" redacted="1"')
    .replace("return 42;", 'return "split ]]]]><![CDATA[>";');
  const result = parseExpansion(body, selection).records[0];
  assert.match(result.content, /split \]\]>/);
  assert.equal(result.redacted, true);
});
