import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertDirectoriesMatchExactly,
  createRuntimeFooterSmokeData,
  executeRuntimeFooterSmokeGit,
  listConfiguredPackageSources,
  settingsPackagesContainSpec,
} from "../scripts/release-smoke-helpers.mjs";

test("settingsPackagesContainSpec accepts string and object package entries", () => {
  const settings = {
    packages: [
      "npm:/fixtures/string-spec.tgz",
      { source: "npm:/fixtures/object-spec.tgz" },
      { source: 42 },
      { unexpected: "ignored" },
      null,
    ],
  };

  assert.deepEqual(listConfiguredPackageSources(settings), [
    "npm:/fixtures/string-spec.tgz",
    "npm:/fixtures/object-spec.tgz",
  ]);
  assert.equal(settingsPackagesContainSpec(settings, "npm:/fixtures/string-spec.tgz"), true);
  assert.equal(settingsPackagesContainSpec(settings, "npm:/fixtures/object-spec.tgz"), true);
  assert.equal(settingsPackagesContainSpec(settings, "npm:/fixtures/missing-spec.tgz"), false);
});

test("runtime footer smoke fixtures expose fast and Starship-style Git state", async () => {
  const result = await executeRuntimeFooterSmokeGit("git", [
    "status",
    "--porcelain=v2",
    "--branch",
  ]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /# branch\.head main/);
  assert.match(result.stdout, /# branch\.ab \+3 -0/);

  const footerData = createRuntimeFooterSmokeData();
  assert.equal(footerData.getGitBranch(), "main");
  assert.equal(footerData.getExtensionStatuses().get("better-openai-fast"), "🐇");
  const unsubscribe = footerData.onBranchChange(() => {});
  assert.equal(typeof unsubscribe, "function");
  assert.equal(unsubscribe(), undefined);
});

test("assertDirectoriesMatchExactly rejects unexpected extra installed files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-helper-"));
  const expectedDir = path.join(tempDir, "expected");
  const actualDir = path.join(tempDir, "actual");

  fs.mkdirSync(expectedDir, { recursive: true });
  fs.mkdirSync(actualDir, { recursive: true });
  fs.writeFileSync(path.join(expectedDir, "package.json"), "{}");
  fs.writeFileSync(path.join(actualDir, "package.json"), "{}");
  fs.writeFileSync(path.join(actualDir, "stale.txt"), "stale");

  try {
    assert.throws(
      () =>
        assertDirectoriesMatchExactly({
          expectedDir,
          actualDir,
          actualLabel: "installed package",
        }),
      /unexpected extra file\(s\): stale\.txt/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("assertDirectoriesMatchExactly can ignore installed dependency trees", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-helper-ignore-"));
  const expectedDir = path.join(tempDir, "expected");
  const actualDir = path.join(tempDir, "actual");

  fs.mkdirSync(expectedDir, { recursive: true });
  fs.mkdirSync(path.join(actualDir, "node_modules", "dep"), { recursive: true });
  fs.writeFileSync(path.join(expectedDir, "package.json"), "{}");
  fs.writeFileSync(path.join(actualDir, "package.json"), "{}");
  fs.writeFileSync(
    path.join(actualDir, "node_modules", "dep", "index.js"),
    "module.exports = {};\n",
  );

  try {
    assert.doesNotThrow(() =>
      assertDirectoriesMatchExactly({
        expectedDir,
        actualDir,
        actualLabel: "installed package",
        ignoredPathSegments: ["node_modules"],
      }),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
