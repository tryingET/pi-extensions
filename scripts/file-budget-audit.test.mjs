/**
 * summary: "tests file-budget policy parity, classification, exclusions, limits, failures, CLI guidance, and owner-scoped exceptions."
 * read_when:
 *   - "changing file-budget audit policy, path classification, traversal errors, output modes, or the exceptions manifest contract."
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FILE_BUDGET_POLICY as ascFileBudgetPolicy,
  fileBudgetKindForPath as ascFileBudgetKindForPath,
} from "../packages/pi-autonomous-session-control/extensions/self/file-budget.ts";
import {
  FILE_BUDGET_POLICY as contextFileBudgetPolicy,
  fileBudgetKindForPath as contextFileBudgetKindForPath,
} from "../packages/pi-context-packer/src/file-budget.js";
import { auditFileBudgets, classifyFileBudgetPath, FILE_BUDGET_POLICY } from "./file-budget-audit.mjs";
import { loadFileBudgetExceptionsPolicy } from "./file-budget-exceptions.mjs";

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

test("file budget policy boundary stays package-local with root parity coverage", () => {
  assert.equal(FILE_BUDGET_POLICY.boundary, "package-local-runtime-copy/root-parity-test");
  assert.deepEqual(contextFileBudgetPolicy, FILE_BUDGET_POLICY);
  assert.deepEqual(ascFileBudgetPolicy, FILE_BUDGET_POLICY);
});

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

const VALID_ENTRY = {
  path: "src/large.ts",
  owner: "test-owner",
  reason: "cohesive module pending an owner-approved split",
  reopen_trigger: "src/large.ts grows past 700 LOC or its domain splits",
};

function makeExceptionsRepo(t, { policy, writeLargeFile = true } = {}) {
  const root = makeTempDir(t);
  if (writeLargeFile) writeLines(path.join(root, "src", "large.ts"), 600);
  writeLines(path.join(root, "src", "small.ts"), 100);
  const manifest = policy ?? { exceptions: [VALID_ENTRY] };
  fs.mkdirSync(path.join(root, "policy"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "policy", "file-budget-exceptions.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest, null, 2),
    "utf8",
  );
  return root;
}

test("valid owner-scoped exceptions suppress matching violations without hiding them", (t) => {
  const root = makeExceptionsRepo(t);

  const result = auditFileBudgets({ root });

  assert.deepEqual(result.policyErrors, []);
  assert.deepEqual(result.violations, []);
  assert.equal(result.excepted.length, 1);
  assert.equal(result.excepted[0].path, "src/large.ts");
  assert.equal(result.excepted[0].owner, "test-owner");

  const cli = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--fail"], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0);
  assert.match(cli.stderr, /carry explicit owner-scoped exceptions/);
  assert.match(cli.stderr, /excepted, owner: test-owner/);
  assert.match(cli.stdout, /file-budget: ok \(1 over-budget file/);
});

test("exceptions policy is discovered from an ancestor of the audit root", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "packages", "demo", "src", "large.ts"), 600);
  writeLines(path.join(root, "other", "src", "large.ts"), 600);
  fs.mkdirSync(path.join(root, "policy"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "policy", "file-budget-exceptions.json"),
    JSON.stringify({
      exceptions: [
        { ...VALID_ENTRY, path: "packages/demo/src/large.ts" },
        { ...VALID_ENTRY, path: "other/src/large.ts" },
      ],
    }),
    "utf8",
  );

  const result = auditFileBudgets({ root: path.join(root, "packages", "demo") });

  assert.deepEqual(result.policyErrors, []);
  assert.deepEqual(result.violations, []);
  assert.equal(result.excepted.length, 1);
  assert.equal(result.excepted[0].path, "src/large.ts");
});

test("out-of-scope exceptions stay valid but unknown files are always rejected", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large.ts"), 600);
  writeLines(path.join(root, "packages", "elsewhere", "src", "large.ts"), 600);
  fs.mkdirSync(path.join(root, "policy"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "policy", "file-budget-exceptions.json"),
    JSON.stringify({
      exceptions: [
        VALID_ENTRY,
        { ...VALID_ENTRY, path: "packages/elsewhere/src/large.ts" },
        { ...VALID_ENTRY, path: "packages/deleted/src/gone.ts" },
      ],
    }),
    "utf8",
  );

  const result = auditFileBudgets({ root: path.join(root, "packages", "elsewhere") });

  assert.deepEqual(result.policyErrors.map((item) => [item.category, item.path]), [
    ["unknown_file", "packages/deleted/src/gone.ts"],
  ]);
  // The out-of-audit-scope src/large.ts exception stays valid here; the
  // in-scope violation is excepted by its own manifest entry.
  assert.deepEqual(result.violations, []);
  assert.equal(result.excepted.length, 1);
  assert.equal(result.excepted[0].path, "src/large.ts");
});

test("exceptions missing any required field are rejected", (t) => {
  for (const field of ["owner", "reason", "reopen_trigger"]) {
    const entry = { ...VALID_ENTRY };
    delete entry[field];
    const { entries, errors } = loadFileBudgetExceptionsPolicyFromEntry(t, entry);
    assert.equal(entries.length, 0, `field ${field}`);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].category, "invalid_entry");
    assert.match(errors[0].message, new RegExp(`missing required field "${field}"`));
  }
});

test("exceptions with empty or whitespace-only fields are rejected", (t) => {
  for (const field of ["owner", "reason", "reopen_trigger"]) {
    for (const value of ["", "   "]) {
      const entry = { ...VALID_ENTRY, [field]: value };
      const { entries, errors } = loadFileBudgetExceptionsPolicyFromEntry(t, entry);
      assert.equal(entries.length, 0, `field ${field}=${JSON.stringify(value)}`);
      assert.equal(errors[0].category, "invalid_entry");
      assert.match(errors[0].message, new RegExp(`field "${field}" must be a non-empty string`));
    }
  }
});

test("exceptions with unknown extra fields are rejected", (t) => {
  const entry = { ...VALID_ENTRY, expires: "2027-01-01" };
  const { entries, errors } = loadFileBudgetExceptionsPolicyFromEntry(t, entry);
  assert.equal(entries.length, 0);
  assert.equal(errors[0].category, "invalid_entry");
  assert.match(errors[0].message, /unknown field "expires"/);
});

test("exceptions with non-relative or unnormalized paths are rejected", (t) => {
  for (const badPath of ["/abs/path.ts", "../escape.ts", "src//double.ts", "./dot.ts", "back\\\\slash.ts", ""]) {
    const entry = { ...VALID_ENTRY, path: badPath };
    const { entries, errors } = loadFileBudgetExceptionsPolicyFromEntry(t, entry);
    assert.equal(entries.length, 0, `path ${JSON.stringify(badPath)}`);
    assert.equal(errors[0].category, "invalid_entry");
  }
});

test("duplicate exception paths are rejected", (t) => {
  const policyPath = writePolicyFileSync(t, { exceptions: [VALID_ENTRY, VALID_ENTRY] });
  const { entries, errors } = loadFileBudgetExceptionsPolicy(policyPath);
  assert.equal(entries.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].category, "duplicate");
});

test("malformed exception manifests are rejected without suppressing violations", (t) => {
  const cases = [
    "{ not json",
    { notes: "missing exceptions" },
    { exceptions: {} },
    { exceptions: [], extra: true },
    { exceptions: [], notes: "  " },
    { exceptions: ["src/large.ts"] },
    { exceptions: [null] },
  ];
  for (const manifest of cases) {
    const root = makeExceptionsRepo(t, { policy: manifest });
    const result = auditFileBudgets({ root });
    assert.ok(result.policyErrors.length >= 1, `manifest ${JSON.stringify(manifest)}`);
    assert.equal(result.excepted.length, 0);
    assert.equal(result.violations.length, 1, `violations stay visible for ${JSON.stringify(manifest)}`);

    const warn = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--warn-only"], {
      encoding: "utf8",
    });
    assert.equal(warn.status, 1, `warn-only rejects invalid manifest ${JSON.stringify(manifest)}`);
    assert.match(warn.stderr, /exceptions policy rejected/);

    const fail = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--fail"], {
      encoding: "utf8",
    });
    assert.equal(fail.status, 1);
  }
});

test("stale exceptions for in-scope compliant files are rejected", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "fine.ts"), 100);
  writeLines(path.join(root, "docs", "fine.md"), 10);
  fs.mkdirSync(path.join(root, "policy"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "policy", "file-budget-exceptions.json"),
    JSON.stringify({
      exceptions: [
        { ...VALID_ENTRY, path: "src/fine.ts" },
        { ...VALID_ENTRY, path: "docs/fine.md" },
      ],
    }),
    "utf8",
  );

  const result = auditFileBudgets({ root });

  assert.equal(result.violations.length, 0);
  assert.equal(result.excepted.length, 0);
  assert.equal(result.policyErrors.length, 2);
  assert.ok(result.policyErrors.every((item) => item.category === "stale"));
});

test("explicit --exceptions path overrides discovery and fails closed when missing", (t) => {
  const root = makeTempDir(t);
  writeLines(path.join(root, "src", "large.ts"), 600);
  const policyFile = path.join(root, "override-exceptions.json");
  fs.writeFileSync(
    policyFile,
    JSON.stringify({ exceptions: [{ ...VALID_ENTRY, path: "src/large.ts" }] }),
    "utf8",
  );

  const okRun = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--root", root, "--fail", "--exceptions", policyFile],
    { encoding: "utf8" },
  );
  assert.equal(okRun.status, 0);
  assert.match(okRun.stderr, /carry explicit owner-scoped exceptions/);

  const missingRun = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--root", root, "--warn-only", "--exceptions", path.join(root, "nope.json")],
    { encoding: "utf8" },
  );
  assert.equal(missingRun.status, 1);
  assert.match(missingRun.stderr, /--exceptions policy file does not exist/);
});

test("exception manifest itself is not audited as a budgeted file", (t) => {
  const root = makeExceptionsRepo(t);
  const result = auditFileBudgets({ root });
  assert.deepEqual(
    result.violations.concat(result.excepted).map((item) => item.path),
    ["src/large.ts"],
  );
});

function writePolicyFileSync(t, manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-file-budget-policy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "exceptions.json");
  fs.writeFileSync(file, JSON.stringify(manifest), "utf8");
  return file;
}

function loadFileBudgetExceptionsPolicyFromEntry(t, entry) {
  return loadFileBudgetExceptionsPolicy(writePolicyFileSync(t, { exceptions: [entry] }));
}
