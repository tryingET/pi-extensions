import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SOURCE = readFileSync(new URL("../extensions/input-triggers.ts", import.meta.url), "utf8");

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".ts"))) {
      files.push(fullPath);
    }
  }

  return files;
}

test("extension entrypoint imports split package surfaces", () => {
  assert.match(SOURCE, /from\s+"@tryinget\/pi-editor-registry"/);
  assert.match(SOURCE, /from\s+"@tryinget\/pi-trigger-adapter"/);
  assert.match(SOURCE, /from\s+"@tryinget\/pi-interaction-kit"/);
});

test("extension entrypoint re-exports helper primitives without duplicates", () => {
  assert.match(SOURCE, /registerPickerInteraction/);
  assert.match(SOURCE, /rankCandidatesWithFzf/);
  assert.match(SOURCE, /selectFuzzyCandidate/);
  assert.match(SOURCE, /splitQueryAndContext/);
  assert.doesNotMatch(SOURCE, /getBroker\s*,\s*getBroker/);
  assert.doesNotMatch(SOURCE, /resetBroker\s*,\s*resetBroker/);
});

test("source files do not import vault-client internals via relative source paths", () => {
  const roots = [
    new URL("../index.ts", import.meta.url),
    ...collectSourceFiles(new URL("../extensions", import.meta.url).pathname).map(
      (path) => new URL(`file://${path}`),
    ),
    ...collectSourceFiles(new URL("../src", import.meta.url).pathname).map(
      (path) => new URL(`file://${path}`),
    ),
  ];

  const disallowed =
    /(?:from|import\()\s*["'][^"']*vault-client\/(?:src|dist\/src|packages\/[^"']*\/src)/;

  for (const fileUrl of roots) {
    const source = readFileSync(fileUrl, "utf8");
    assert.doesNotMatch(
      source,
      disallowed,
      `disallowed vault-client internal import in ${fileUrl}`,
    );
  }
});
