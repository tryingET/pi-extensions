// ---
// summary: "Fixture coverage for host-contract pin, lock alignment, and nested lock-float rules."
// read_when:
//   - "Changing Pi host contract drift coverage beyond package.json devDependencies."
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKER = path.join(ROOT, "scripts", "pi-host-compatibility-canary", "check-dev-pin-drift.mjs");

function minimalManifest() {
  return {
    schemaVersion: 1,
    hostPackage: "@earendil-works/pi-coding-agent",
    hostCompanionPackages: ["@earendil-works/pi-ai", "@earendil-works/pi-tui"],
    trackedChangelog: "https://example.test/pi-changelog",
    defaultProfile: "current",
    profiles: {
      current: {
        description: "Fixture host contract.",
        host: {
          version: "0.83.0",
          reviewAnchor: "npm:@earendil-works/pi-coding-agent@0.83.0",
        },
      },
    },
    scenarios: [
      {
        id: "path-containment",
        title: "Path containment",
        owner: "monorepo-root",
        why: "Canary effects must stay inside the repository.",
        profiles: ["current"],
        packages: [],
        upstreamSurfaces: ["repository path containment"],
        cwd: ".",
        command: [process.execPath, "-e", "void 0"],
      },
    ],
  };
}

function writePackage(root, name, packageJson, lock) {
  const dir = path.join(root, "packages", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  if (lock) {
    writeFileSync(path.join(dir, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function runChecker(repoRoot, manifestPath) {
  return spawnSync(process.execPath, [CHECKER, "--manifest", manifestPath, "--repo-root", repoRoot], {
    encoding: "utf-8",
  });
}

test("dependencies field drift fails closed", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-dep-drift-"));
  try {
    writePackage(tempDir, "sample-a", {
      name: "sample-a",
      dependencies: { "@earendil-works/pi-ai": "0.82.0" },
    });
    const manifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(minimalManifest())}\n`);
    const result = runChecker(tempDir, manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /packages\/sample-a\/package\.json: dependencies\.@earendil-works\/pi-ai=0\.82\.0 \(expected 0\.83\.0\)/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("lock toolchain records must match declared pins", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-lock-align-"));
  try {
    writePackage(
      tempDir,
      "sample-a",
      {
        name: "sample-a",
        devDependencies: { "@earendil-works/pi-coding-agent": "0.83.0" },
      },
      {
        lockfileVersion: 3,
        packages: {
          "": {
            name: "sample-a",
            devDependencies: { "@earendil-works/pi-coding-agent": "^0.83.0" },
          },
          "node_modules/@earendil-works/pi-coding-agent": { version: "0.82.0" },
        },
      },
    );
    const manifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(minimalManifest())}\n`);
    const result = runChecker(tempDir, manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /packages\[""\]\.devDependencies\.@earendil-works\/pi-coding-agent=\^0\.83\.0/);
    assert.match(
      result.stderr,
      /node_modules\/@earendil-works\/pi-coding-agent=0\.82\.0 \(expected 0\.83\.0\)/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("nested lock floats fail; companion nested closures do not", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-nested-lock-"));
  try {
    writePackage(
      tempDir,
      "sample-a",
      {
        name: "sample-a",
        devDependencies: { "@earendil-works/pi-ai": "0.83.0" },
      },
      {
        lockfileVersion: 3,
        packages: {
          "": {
            name: "sample-a",
            devDependencies: { "@earendil-works/pi-ai": "0.83.0" },
          },
          "node_modules/@earendil-works/pi-ai": { version: "0.83.0" },
          "node_modules/@earendil-works/pi-agent-core/node_modules/@earendil-works/pi-ai": {
            version: "0.84.4",
          },
          "node_modules/unrelated-tool/node_modules/@earendil-works/pi-ai": { version: "0.82.0" },
        },
      },
    );
    const manifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(minimalManifest())}\n`);
    const result = runChecker(tempDir, manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /node_modules\/unrelated-tool\/node_modules\/@earendil-works\/pi-ai=0\.82\.0 \(expected 0\.83\.0\)/,
    );
    assert.doesNotMatch(result.stderr, /pi-agent-core\/node_modules\/@earendil-works\/pi-ai/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
