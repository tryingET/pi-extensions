import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { fileBudgetKindForPath as ascFileBudgetKindForPath } from "../packages/pi-autonomous-session-control/extensions/self/file-budget.ts";
import { fileBudgetKindForPath as contextFileBudgetKindForPath } from "../packages/pi-context-packer/src/file-budget.js";
import { auditFileBudgets, classifyFileBudgetPath } from "./file-budget-audit.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("./file-budget-audit.mjs", import.meta.url));

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-file-budget-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeLines(filePath, count) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Array.from({ length: count }, (_, index) => `line ${index}`).join("\n"), "utf8");
}

const CLASSIFIER_CASES = [
  ["src/app.ts", "code"],
  ["src/component.jsx", "code"],
  ["src/app.TSX", "code"],
  ["docs/guide.md", "markdown"],
  ["README.MDX", "markdown"],
  ["tests/app.test.mjs", "test"],
  ["src/component.test.jsx", "test"],
  ["src/app.SPEC.CTS", "test"],
  ["src/UPPER.TEST.JS", "test"],
  ["src/generated.d.ts", null],
  ["src/GENERATED.D.TS", null],
  ["src/app.min.js", null],
  ["src/app.bundle.js", null],
  ["src/app.js.map", null],
  ["node_modules/pkg/app.ts", null],
  ["dist/app.ts", null],
  ["vendor/pkg/app.ts", null],
  ["assets/logo.svg", null],
];

test("file budget classifiers stay in parity across advisory surfaces", () => {
  for (const [relativePath, expected] of CLASSIFIER_CASES) {
    assert.equal(classifyFileBudgetPath(relativePath), expected, `root classifier: ${relativePath}`);
    assert.equal(contextFileBudgetKindForPath(relativePath), expected, `context-packer classifier: ${relativePath}`);
    assert.equal(ascFileBudgetKindForPath(relativePath), expected, `self classifier: ${relativePath}`);
  }
});

test("file budget audit applies defaults by file type", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large.ts"), 501);
  writeLines(path.join(root, "src", "large.jsx"), 501);
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
      ["src/large.jsx", "code", 500],
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
  writeLines(path.join(root, "src", "GENERATED.D.TS"), 2000);

  const result = auditFileBudgets({ root });

  assert.deepEqual(result.violations, []);
});

test("file budget audit treats uppercase test suffixes as test files", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "LARGE.TEST.JS"), 501);

  const result = auditFileBudgets({ root });

  assert.deepEqual(result.violations, []);
});

test("file budget audit fails closed for missing roots", (t) => {
  const root = path.join(makeTempDir(t), "missing");

  assert.throws(() => auditFileBudgets({ root }), /ENOENT|no such file/i);

  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--fail"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /error:/);
  assert.doesNotMatch(result.stdout + result.stderr, /file-budget: ok/);
});

test("file budget audit reports unreadable subtrees", (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root can read chmod 000 directories");
    return;
  }

  const root = makeTempDir(t);
  const secretDir = path.join(root, "src", "secret");
  writeLines(path.join(secretDir, "large.ts"), 1000);
  fs.chmodSync(secretDir, 0o000);

  try {
    const audit = auditFileBudgets({ root });
    assert.equal(audit.violations.length, 0);
    assert.equal(audit.errors.length, 1);
    assert.equal(audit.errors[0].operation, "read_dir");
    assert.equal(audit.errors[0].path, "src/secret");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--fail"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not be audited/);
    assert.match(result.stderr, /src\/secret/);
    assert.doesNotMatch(result.stdout + result.stderr, /file-budget: ok/);
  } finally {
    fs.chmodSync(secretDir, 0o700);
  }
});

test("file budget audit prints mode-correct fail guidance", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large.ts"), 501);

  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--fail"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /file-budget: error:/);
  assert.match(result.stderr, /hard-fail posture is active/);
  assert.doesNotMatch(result.stderr, /current posture is warn-only/);
});

test("file budget audit does not suggest --max-warnings 0 while already summary-only", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large-a.ts"), 501);
  writeLines(path.join(root, "src", "large-b.ts"), 502);

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--root", root, "--warn-only", "--max-warnings", "0"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stderr, /summary-only output/);
  assert.doesNotMatch(result.stderr, /rerun with --max-warnings 0/);
});
