// ---
// summary: "Tests authoritative npm tarball creation, exact install verification, and tamper detection."
// read_when:
//   - "Changing release-artifact.mjs or the exact npm publication contract."
// ---

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectConcreteTargets } from "./release-artifact.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-artifact.mjs");

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(ROOT, ".release-artifact-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "@example/release-artifact-fixture",
        version: "1.2.3",
        type: "module",
        files: ["index.js", "types.d.ts"],
        main: "./index.js",
        types: "./types.d.ts",
        exports: {
          ".": {
            import: "./index.js",
            types: "./types.d.ts",
          },
          "./package.json": "./package.json",
        },
        pi: {
          extensions: ["./index.js"],
        },
        scripts: {
          prepack:
            "node -e \"console.log('[lifecycle-prepack]'); console.log(JSON.stringify({phase:'prepack'}))\"",
          postpack:
            "node -e \"console.log('[lifecycle-postpack]'); console.log(JSON.stringify({phase:'postpack'}))\"",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(root, "index.js"), "export const fixture = true;\n", "utf8");
  fs.writeFileSync(path.join(root, "types.d.ts"), "export declare const fixture: true;\n", "utf8");
  return root;
}

test("collects concrete package targets without treating patterns as files", () => {
  assert.deepEqual(
    collectConcreteTargets({
      main: "./index.js",
      types: "./index.d.ts",
      bin: { fixture: "./bin.js" },
      exports: { ".": "./index.js", "./feature/*": "./dist/*.js" },
      pi: { extensions: ["./extension.ts"], prompts: ["./prompts"] },
    }),
    ["./bin.js", "./extension.ts", "./index.d.ts", "./index.js", "./prompts", "package.json"],
  );
});

test("packs once amid lifecycle output, records a digest, and installs the exact tarball", (t) => {
  const packageRoot = fixture(t);
  const artifactDir = path.join(packageRoot, "artifacts");
  const envFile = path.join(packageRoot, "github.env");
  const relativePackage = path.relative(ROOT, packageRoot);

  const packed = run(
    [
      "pack",
      "--package-path",
      relativePackage,
      "--artifact-dir",
      artifactDir,
      "--env-file",
      envFile,
    ],
    {
      RELEASE_COMPONENT: "fixture",
      RELEASE_TAG: "fixture-v1.2.3",
      GITHUB_SHA: "a".repeat(40),
    },
  );
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);
  const record = JSON.parse(packed.stdout);
  assert.equal(record.schema, "pi.release-artifact.v1");
  assert.equal(record.package.name, "@example/release-artifact-fixture");
  assert.equal(record.package.version, "1.2.3");
  assert.match(record.artifact.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(record.source.tag, "fixture-v1.2.3");
  assert.equal(fs.readdirSync(artifactDir).filter((name) => name.endsWith(".tgz")).length, 1);

  const env = Object.fromEntries(
    fs
      .readFileSync(envFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  assert.equal(env.RELEASE_TARBALL_SHA256, record.artifact.sha256);
  assert.ok(fs.existsSync(env.RELEASE_TARBALL_PATH));
  assert.ok(fs.existsSync(env.RELEASE_TARBALL_CHECKSUM_PATH));
  assert.ok(fs.existsSync(env.RELEASE_ARTIFACT_MANIFEST_PATH));

  const verified = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.match(verified.stdout, /Verified exact artifact @example\/release-artifact-fixture@1\.2\.3/);

  fs.appendFileSync(env.RELEASE_TARBALL_PATH, "tamper", "utf8");
  const tampered = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /SHA-256 changed/);
});

test("refuses a non-empty artifact directory", (t) => {
  const packageRoot = fixture(t);
  const artifactDir = path.join(packageRoot, "artifacts");
  fs.mkdirSync(artifactDir);
  fs.writeFileSync(path.join(artifactDir, "stale.txt"), "stale", "utf8");
  const result = run([
    "pack",
    "--package-path",
    path.relative(ROOT, packageRoot),
    "--artifact-dir",
    artifactDir,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must start empty/);
});
