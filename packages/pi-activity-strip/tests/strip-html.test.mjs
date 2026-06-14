import assert from "node:assert/strict";
import test from "node:test";
import { createStripHtml } from "../src/ui/strip-html.mjs";

test("strip card footer renders last-seen freshness beside elapsed time", () => {
  const html = createStripHtml();

  assert.match(html, /function formatLastSeen\(session\)/);
  assert.match(html, /updatedAt \|\| snapshot\.generatedAt/);
  assert.match(html, / · seen /);
});
