// ---
// summary: "Tests authoritative npm tarball creation, exact local dependency closure, isolated installation, and tamper detection."
// read_when:
//   - "Changing release-artifact.mjs or the exact npm publication contract."
// ---

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildExactInstallManifest,
  collectConcreteTargets,
  collectLocalDependencyClosure,
} from "./release-artifact.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-artifact.mjs");

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixture(t, { localDependency = false } = {}) {
  fs.mkdirSync(path.join(ROOT, ".git", "tmp"), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, ".git", "tmp", "release-artifact-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manifest = {
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
      prepack: "node -e \"console.log('[lifecycle-prepack]'); console.log(JSON.stringify({phase:'prepack'}))\"",
      postpack: "node -e \"console.log('[lifecycle-postpack]'); console.log(JSON.stringify({phase:'postpack'}))\"",
    },
  };

  if (localDependency) {
    const dependencyRoot = path.join(root, "dependency");
    fs.mkdirSync(dependencyRoot);
    writeJson(path.join(dependencyRoot, "package.json"), {
      name: "@example/release-artifact-dependency",
      version: "0.1.0",
      type: "module",
      files: ["index.js"],
      main: "./index.js",
      exports: "./index.js",
    });
    fs.writeFileSync(
      path.join(dependencyRoot, "index.js"),
      "export const dependencyFixture = true;\n",
      "utf8",
    );
    manifest.dependencies = {
      "@example/release-artifact-dependency": "file:./dependency",
    };
  }

  writeJson(path.join(root, "package.json"), manifest);
  fs.writeFileSync(path.join(root, "index.js"), "export const fixture = true;\n", "utf8");
  fs.writeFileSync(path.join(root, "types.d.ts"), "export declare const fixture: true;\n", "utf8");
  return root;
}

function packFixture(packageRoot, artifactDir, envFile) {
  const packed = run(
    [
      "pack",
      "--package-path",
      path.relative(ROOT, packageRoot),
      "--artifact-dir",
      artifactDir,
      "--output-env-file",
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
  return { record, env };
}

test("builds one exact file dependency manifest and rejects duplicate identities", (t) => {
  fs.mkdirSync(path.join(ROOT, ".git", "tmp"), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, ".git", "tmp", "release-artifact-manifest-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dependencyPath = path.join(root, "dependency.tgz");
  const packagePath = path.join(root, "package.tgz");
  fs.writeFileSync(dependencyPath, "dependency", "utf8");
  fs.writeFileSync(packagePath, "package", "utf8");

  const manifest = buildExactInstallManifest([
    { name: "@example/dependency", artifactPath: dependencyPath },
    { name: "@example/package", artifactPath: packagePath },
  ]);
  assert.deepEqual(manifest, {
    name: "pi-release-artifact-verifier",
    version: "0.0.0",
    private: true,
    dependencies: {
      "@example/dependency": pathToFileURL(dependencyPath).href,
      "@example/package": pathToFileURL(packagePath).href,
    },
  });
  assert.throws(
    () =>
      buildExactInstallManifest([
        { name: "@example/package", artifactPath: packagePath },
        { name: "@example/package", artifactPath: dependencyPath },
      ]),
    /Duplicate exact install artifact/u,
  );
});

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

test("collects local runtime dependencies in dependency-first order", (t) => {
  const packageRoot = fixture(t, { localDependency: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const closure = collectLocalDependencyClosure(packageRoot, manifest);
  assert.deepEqual(
    closure.map((entry) => [entry.manifest.name, entry.manifest.version]),
    [["@example/release-artifact-dependency", "0.1.0"]],
  );
});

test("packs once amid lifecycle output, records a digest, and installs the exact tarball", (t) => {
  const packageRoot = fixture(t);
  const artifactDir = path.join(packageRoot, "artifacts");
  const envFile = path.join(packageRoot, "github.env");
  const { record, env } = packFixture(packageRoot, artifactDir, envFile);

  assert.equal(record.schema, "pi.release-artifact.v1");
  assert.equal(record.package.name, "@example/release-artifact-fixture");
  assert.equal(record.package.version, "1.2.3");
  assert.deepEqual(record.dependencies.localArtifacts, []);
  assert.match(record.artifact.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(record.source.tag, "fixture-v1.2.3");
  assert.equal(fs.readdirSync(artifactDir).filter((name) => name.endsWith(".tgz")).length, 1);
  assert.equal(env.RELEASE_TARBALL_SHA256, record.artifact.sha256);
  assert.equal(env.RELEASE_ARTIFACT_DIRECTORY, fs.realpathSync(artifactDir));

  const verified = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.match(verified.stdout, /with 0 local dependency artifact\(s\)/);

  fs.appendFileSync(env.RELEASE_TARBALL_PATH, "tamper", "utf8");
  const tampered = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /SHA-256 changed/);
});

test("packs and installs an unpublished local dependency closure without registry access", (t) => {
  const packageRoot = fixture(t, { localDependency: true });
  const artifactDir = path.join(packageRoot, "artifacts");
  const envFile = path.join(packageRoot, "github.env");
  const { record, env } = packFixture(packageRoot, artifactDir, envFile);

  assert.equal(record.dependencies.localArtifacts.length, 1);
  const dependency = record.dependencies.localArtifacts[0];
  assert.equal(dependency.name, "@example/release-artifact-dependency");
  assert.equal(dependency.version, "0.1.0");
  assert.match(dependency.sha256, /^[0-9a-f]{64}$/u);
  assert.match(dependency.relativePath, /^local-dependencies\//u);
  assert.ok(fs.existsSync(path.join(artifactDir, dependency.relativePath)));
  assert.ok(fs.existsSync(path.join(artifactDir, `${dependency.relativePath}.sha256`)));

  const tarManifest = spawnSync(
    "tar",
    ["-xOf", env.RELEASE_TARBALL_PATH, "package/package.json"],
    { encoding: "utf8" },
  );
  assert.equal(tarManifest.status, 0, tarManifest.stderr);
  assert.equal(
    JSON.parse(tarManifest.stdout).dependencies["@example/release-artifact-dependency"],
    "0.1.0",
    "published manifest must resolve through the registry, not the source checkout",
  );

  const restored = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(
    restored.dependencies["@example/release-artifact-dependency"],
    "file:./dependency",
  );

  const verified = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.match(verified.stdout, /with 1 local dependency artifact\(s\)/);

  fs.appendFileSync(path.join(artifactDir, dependency.relativePath), "tamper", "utf8");
  const tampered = run(["verify", "--manifest", env.RELEASE_ARTIFACT_MANIFEST_PATH]);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /Local dependency .* SHA-256 changed/);
});

test("restores the tagged manifest when npm pack fails", (t) => {
  const packageRoot = fixture(t, { localDependency: true });
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.scripts.prepack = "node -e \"process.exit(23)\"";
  writeJson(manifestPath, manifest);
  const taggedBytes = fs.readFileSync(manifestPath);
  const result = run([
    "pack",
    "--package-path",
    path.relative(ROOT, packageRoot),
    "--artifact-dir",
    path.join(packageRoot, "artifacts"),
  ]);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(manifestPath), taggedBytes);
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
