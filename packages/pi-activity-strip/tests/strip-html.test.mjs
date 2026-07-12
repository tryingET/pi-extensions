/**
summary: "Tests that generated strip HTML reports session freshness beside elapsed time."
read_when:
  - "Changing strip card footer markup, freshness timestamps, or last-seen rendering."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { createStripHtml } from "../src/ui/strip-html.mjs";

test("strip card footer renders last-seen freshness beside elapsed time", () => {
  const html = createStripHtml();

  assert.match(html, /function formatLastSeen\(session\)/);
  assert.match(html, /updatedAt \|\| snapshot\.generatedAt/);
  assert.match(html, / · seen /);
});
