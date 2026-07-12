// ---
// summary: tests package whitelist parsing and published markdown link validation
// read_when:
//   - changing release artifact checks, pack output handling, or files-array policy
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectPackagedMarkdownLinkFailures,
  parsePackJson,
  runReleaseArtifactCheck,
  validatePackageFilesWhitelist,
} from "../scripts/release-artifact-check.mjs";

const readFrom = (files) => (filePath) => files[filePath] ?? "";

test("packaged markdown link validation accepts packaged local, directory, query, fragment, and external links", () => {
  const actualFiles = ["README.md", "docs/guide.md", "docs/nested/index.md", "package.json"];
  const markdown = [
    "[guide](docs/guide.md)",
    "[guide with query](docs/guide.md?view=full#intro)",
    '[guide with title](<docs/guide.md> "maintainer guide")',
    "[reference][guide-ref]",
    '[guide-ref]: docs/guide.md "reference title"',
    "[directory](docs/nested/)",
    "[fragment](#local-section)",
    "[external](https://example.invalid/docs)",
    "[mailto](mailto:maintainer@example.invalid)",
  ].join("\n");

  const result = collectPackagedMarkdownLinkFailures({
    actualFiles,
    readFile: readFrom({ "README.md": markdown, "docs/guide.md": "# Guide" }),
  });

  assert.deepEqual(result, { failures: [], packagedMarkdownCount: 3 });
});

test("packaged markdown link validation fails closed for missing local and reference links", () => {
  const result = collectPackagedMarkdownLinkFailures({
    actualFiles: ["README.md", "package.json"],
    readFile: readFrom({
      "README.md": ["[missing](docs/missing.md)", "[missing-ref]: docs/also-missing.md"].join("\n"),
    }),
  });

  assert.deepEqual(result.failures, [
    "README.md: local link missing from npm artifact: docs/missing.md",
    "README.md: local link missing from npm artifact: docs/also-missing.md",
  ]);
});

test("packaged markdown link validation fails closed for path escapes", () => {
  const result = collectPackagedMarkdownLinkFailures({
    actualFiles: ["README.md", "docs/guide.md", "package.json"],
    readFile: readFrom({
      "README.md": ["[parent](../outside.md)", "[absolute](/etc/passwd)"].join("\n"),
      "docs/guide.md": "[nested parent](../../outside.md)",
    }),
  });

  assert.deepEqual(result.failures, [
    "README.md: local link escapes package root: ../outside.md",
    "README.md: local link escapes package root: /etc/passwd",
    "docs/guide.md: local link escapes package root: ../../outside.md",
  ]);
});

test("pack json parser fails closed for malformed, stale, or unsafe pack output", () => {
  assert.throws(() => parsePackJson("not json"), /Could not parse npm pack/);
  assert.throws(() => parsePackJson(JSON.stringify([{ files: null }])), /Could not parse npm pack/);
  assert.throws(
    () => parsePackJson(JSON.stringify([{ files: [{ path: "../outside.md" }] }])),
    /unsafe package path/,
  );
  assert.throws(
    () => parsePackJson(JSON.stringify([{ files: [{ path: "/etc/passwd" }] }])),
    /unsafe package path/,
  );
});

test("package files whitelist fails closed for wildcard entries", () => {
  assert.throws(
    () =>
      validatePackageFilesWhitelist({
        cwd: process.cwd(),
        filesEntries: ["docs/*.md"],
        actualFiles: ["package.json", "docs/readme.txt"],
      }),
    /Unsupported files\[\] wildcard entry/,
  );
});

test("package files whitelist detects missing and extra artifact entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-artifact-check-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "docs", "guide.md"), "# Guide\n");

    const result = validatePackageFilesWhitelist({
      cwd: dir,
      filesEntries: ["docs/guide.md"],
      actualFiles: ["README.md", "package.json", "unexpected.txt"],
    });

    assert.deepEqual(result, {
      missing: ["docs/guide.md"],
      extra: ["unexpected.txt"],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release artifact check accepts directory files entries and always-included metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-release-check-ok-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ files: ["docs"] }));
    fs.writeFileSync(path.join(dir, "README.md"), "[guide](docs/guide.md)\n");
    fs.writeFileSync(path.join(dir, "LICENSE"), "local test license\n");
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "docs", "guide.md"), "# Guide\n");
    const packJsonText = JSON.stringify([
      {
        files: [
          { path: "README.md" },
          { path: "LICENSE" },
          { path: "docs/guide.md" },
          { path: "package.json" },
        ],
      },
    ]);
    const logs = [];

    runReleaseArtifactCheck({ cwd: dir, packJsonText, log: (message) => logs.push(message) });

    assert.deepEqual(logs, [
      "File whitelist OK (4 files).",
      "Packaged Markdown links OK (2 files).",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release artifact check reports packaged markdown failures with actionable wording", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-release-check-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ files: ["README.md", "docs/guide.md"] }),
    );
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "README.md"), "[missing](docs/missing.md)\n");
    fs.writeFileSync(path.join(dir, "docs", "guide.md"), "# Guide\n");
    const packJsonText = JSON.stringify([
      {
        files: [{ path: "README.md" }, { path: "docs/guide.md" }, { path: "package.json" }],
      },
    ]);

    assert.throws(
      () => runReleaseArtifactCheck({ cwd: dir, packJsonText, log: () => {} }),
      /Packaged Markdown link check failed\.\n- README\.md: local link missing from npm artifact: docs\/missing\.md/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
