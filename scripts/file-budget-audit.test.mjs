import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { auditFileBudgets } from "./file-budget-audit.mjs";

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-file-budget-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeLines(filePath, count) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Array.from({ length: count }, (_, index) => `line ${index}`).join("\n"), "utf8");
}

test("file budget audit applies defaults by file type", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large.ts"), 501);
  writeLines(path.join(root, "tests", "large.test.mjs"), 1001);
  writeLines(path.join(root, "docs", "large.md"), 801);
  writeLines(path.join(root, "src", "small.ts"), 500);
  writeLines(path.join(root, "tests", "small.test.mjs"), 1000);
  writeLines(path.join(root, "docs", "small.md"), 800);

  const result = auditFileBudgets({ root });

  assert.deepEqual(
    result.violations
      .map((item) => [item.path, item.kind, item.maxLines])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ["docs/large.md", "markdown", 800],
      ["src/large.ts", "code", 500],
      ["tests/large.test.mjs", "test", 1000],
    ],
  );
});

test("file budget audit excludes generated and dependency-like paths", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "node_modules", "pkg", "large.ts"), 2000);
  writeLines(path.join(root, "dist", "large.js"), 2000);
  writeLines(path.join(root, "src", "generated.d.ts"), 2000);

  const result = auditFileBudgets({ root });

  assert.deepEqual(result.violations, []);
});
