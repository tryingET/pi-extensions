#!/usr/bin/env node
/**
summary: "Creates one authoritative npm release tarball plus exact local-dependency artifacts, then verifies the bytes through an isolated install."
read_when:
  - "Changing npm publication, retained release artifacts, checksums, local package dependencies, or installed-artifact verification."
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseNpmPackJson } from "./npm-pack-json.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCHEMA = "pi.release-artifact.v1";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const LOCAL_RUNTIME_FIELDS = ["dependencies", "optionalDependencies"];

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--")) fail(`Unexpected argument: ${String(flag)}`);
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) fail(`Missing --${name}`);
  return value;
}

function canonicalExisting(filePath) {
  return fs.realpathSync(path.resolve(filePath));
}

function assertWithin(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  fail(`${label} escapes ${parent}: ${child}`);
}

function readManifest(packageRoot) {
  const manifestPath = path.join(packageRoot, "package.json");
  const stat = fs.statSync(manifestPath);
  if (!stat.isFile()) fail(`Missing package.json: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (typeof manifest.name !== "string" || !manifest.name) fail(`${manifestPath}: name is required`);
  if (typeof manifest.version !== "string" || !manifest.version) {
    fail(`${manifestPath}: version is required`);
  }
  return manifest;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ""}\n${result.stderr ?? ""}` : "";
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}${detail}`);
  }
  return result;
}

function writeToStderr(value) {
  const text = String(value ?? "");
  if (!text) return;
  process.stderr.write(text);
  if (!text.endsWith("\n")) process.stderr.write("\n");
}

function readJsonValueEnd(text, start) {
  const expected = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") expected.push("}");
    else if (character === "[") expected.push("]");
    else if (character === "}" || character === "]") {
      if (expected.pop() !== character) return -1;
      if (expected.length === 0) return index + 1;
    }
  }
  return -1;
}

function parseCapturedNpmPackOutput(raw) {
  const text = String(raw ?? "");
  let selected = null;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "[" && text[start] !== "{") continue;
    const end = readJsonValueEnd(text, start);
    if (end < 0) continue;
    try {
      selected = {
        pack: parseNpmPackJson(text.slice(start, end)),
        start,
        end,
      };
      start = end - 1;
    } catch {
      // Lifecycle output can contain unrelated JSON. Keep scanning for the final pack payload.
    }
  }
  if (!selected) return { pack: parseNpmPackJson(text), noise: "" };
  return {
    pack: selected.pack,
    noise: `${text.slice(0, selected.start)}${text.slice(selected.end)}`,
  };
}

function writeEnv(envFile, pairs) {
  if (!envFile) return;
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${String(value)}`);
  fs.appendFileSync(path.resolve(envFile), `${lines.join("\n")}\n`, "utf8");
}

function collectConcreteTargets(manifest) {
  const targets = new Set(["package.json"]);
  for (const key of ["main", "module", "types", "typings"]) {
    if (typeof manifest[key] === "string") targets.add(manifest[key]);
  }
  if (typeof manifest.bin === "string") targets.add(manifest.bin);
  if (manifest.bin && typeof manifest.bin === "object" && !Array.isArray(manifest.bin)) {
    for (const value of Object.values(manifest.bin)) {
      if (typeof value === "string") targets.add(value);
    }
  }
  const visit = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("./") && !value.includes("*")) targets.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  visit(manifest.exports);
  if (manifest.pi && typeof manifest.pi === "object") {
    for (const key of ["extensions", "prompts", "themes"]) visit(manifest.pi[key]);
  }
  return [...targets].sort();
}

function verifyInstalledTargets(packageRoot, manifest) {
  const packageReal = fs.realpathSync(packageRoot);
  for (const target of collectConcreteTargets(manifest)) {
    const resolved = path.resolve(packageRoot, target);
    assertWithin(packageReal, resolved, `package target ${target}`);
    if (!fs.existsSync(resolved)) fail(`Installed package target is missing: ${target}`);
    const real = fs.realpathSync(resolved);
    assertWithin(packageReal, real, `installed package target ${target}`);
  }
}

function directLocalDependencies(packageRoot, manifest) {
  const dependencies = [];
  for (const field of LOCAL_RUNTIME_FIELDS) {
    const values = manifest[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [declaredName, spec] of Object.entries(values)) {
      if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
      const dependencyRoot = canonicalExisting(path.resolve(packageRoot, spec.slice("file:".length)));
      assertWithin(ROOT, dependencyRoot, `${manifest.name} ${field}.${declaredName}`);
      const dependencyManifest = readManifest(dependencyRoot);
      if (dependencyManifest.name !== declaredName) {
        fail(
          `${manifest.name} ${field}.${declaredName} resolves to ${dependencyManifest.name}`,
        );
      }
      dependencies.push({ field, root: dependencyRoot, manifest: dependencyManifest });
    }
  }
  return dependencies;
}

function collectLocalDependencyClosure(packageRoot, packageManifest) {
  const ordered = [];
  const visiting = new Set();
  const byName = new Map();

  function visit(ownerRoot, ownerManifest) {
    for (const dependency of directLocalDependencies(ownerRoot, ownerManifest)) {
      const name = dependency.manifest.name;
      const existing = byName.get(name);
      if (existing) {
        if (
          existing.root !== dependency.root ||
          existing.manifest.version !== dependency.manifest.version
        ) {
          fail(`Conflicting local dependency identity for ${name}`);
        }
        continue;
      }
      if (visiting.has(name)) fail(`Local dependency cycle detected at ${name}`);
      visiting.add(name);
      visit(dependency.root, dependency.manifest);
      visiting.delete(name);
      byName.set(name, dependency);
      ordered.push(dependency);
    }
  }

  visit(packageRoot, packageManifest);
  return ordered;
}

function ensurePackageDependencies(packageRoot) {
  const result = fs.existsSync(path.join(packageRoot, "package-lock.json"))
    ? run("npm", ["ci", "--include=dev"], { cwd: packageRoot, capture: true })
    : run("npm", ["install", "--include=dev", "--no-package-lock"], {
        cwd: packageRoot,
        capture: true,
      });
  writeToStderr(result.stdout);
  writeToStderr(result.stderr);
}

function packedManifest(tarballPath) {
  const result = run("tar", ["-xOf", tarballPath, "package/package.json"], { capture: true });
  return JSON.parse(result.stdout);
}

function validatePackedLocalDependencyVersions(
  sourceRoot,
  sourceManifest,
  packed,
) {
  for (const dependency of directLocalDependencies(sourceRoot, sourceManifest)) {
    const value = packed?.[dependency.field]?.[dependency.manifest.name];
    if (value !== dependency.manifest.version) {
      fail(
        `${sourceManifest.name} packed ${dependency.field}.${dependency.manifest.name} expected ${dependency.manifest.version}, got ${value ?? "<missing>"}`,
      );
    }
  }
}

function packOne(packageRoot, destination, artifactRoot) {
  const manifest = readManifest(packageRoot);
  const result = run(
    "npm",
    ["pack", "--json", "--pack-destination", destination],
    { cwd: packageRoot, capture: true },
  );
  const parsedOutput = parseCapturedNpmPackOutput(result.stdout ?? "");
  writeToStderr(parsedOutput.noise);
  writeToStderr(result.stderr);
  const pack = parsedOutput.pack;
  if (pack.name !== manifest.name) fail(`Packed name mismatch: ${pack.name} != ${manifest.name}`);
  if (pack.version !== manifest.version) {
    fail(`Packed version mismatch: ${pack.version} != ${manifest.version}`);
  }
  const basename = path.basename(String(pack.filename ?? ""));
  if (!basename || basename !== pack.filename) fail(`Unsafe npm pack filename: ${pack.filename}`);
  const tarballPath = canonicalExisting(path.join(destination, basename));
  assertWithin(canonicalExisting(artifactRoot), tarballPath, `${manifest.name} release tarball`);
  const stat = fs.lstatSync(tarballPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${manifest.name} tarball must be a regular file`);
  if (stat.size <= 0) fail(`${manifest.name} tarball is empty`);
  validatePackedLocalDependencyVersions(packageRoot, manifest, packedManifest(tarballPath));
  return {
    root: packageRoot,
    manifest,
    tarballPath,
    relativePath: path.relative(artifactRoot, tarballPath).replaceAll(path.sep, "/"),
    basename,
    sha256: sha256File(tarballPath),
    size: stat.size,
    npmIntegrity: typeof pack.integrity === "string" ? pack.integrity : null,
    npmShasum: typeof pack.shasum === "string" ? pack.shasum : null,
    fileCount: Array.isArray(pack.files) ? pack.files.length : null,
    unpackedSize: Number.isSafeInteger(pack.unpackedSize) ? pack.unpackedSize : null,
  };
}

function artifactRecord(packed) {
  return {
    name: packed.manifest.name,
    version: packed.manifest.version,
    repositoryPath: path.relative(ROOT, packed.root).replaceAll(path.sep, "/"),
    relativePath: packed.relativePath,
    sha256: packed.sha256,
    size: packed.size,
    npmIntegrity: packed.npmIntegrity,
    npmShasum: packed.npmShasum,
  };
}

function verifyRecordedArtifact(artifactDir, record, label) {
  if (!record || typeof record !== "object") fail(`${label} record is missing`);
  const relativePath = String(record.relativePath ?? record.basename ?? "");
  if (!relativePath || path.isAbsolute(relativePath)) fail(`${label} has an unsafe relative path`);
  const artifactPath = canonicalExisting(path.join(artifactDir, relativePath));
  assertWithin(canonicalExisting(artifactDir), artifactPath, label);
  const expectedSha = String(record.sha256 ?? "");
  if (!SHA256_RE.test(expectedSha)) fail(`${label} has an invalid SHA-256`);
  const actualSha = sha256File(artifactPath);
  if (actualSha !== expectedSha) fail(`${label} SHA-256 changed: ${actualSha}`);
  const stat = fs.statSync(artifactPath);
  if (!stat.isFile() || stat.size !== record.size) fail(`${label} size changed`);
  const manifest = packedManifest(artifactPath);
  if (manifest.name !== record.name || manifest.version !== record.version) {
    fail(`${label} package identity changed`);
  }
  return artifactPath;
}

function packArtifact(options) {
  const packagePath = requireOption(options, "package-path");
  const artifactDirInput = requireOption(options, "artifact-dir");
  const envFile = options["output-env-file"];
  const packageRoot = canonicalExisting(path.resolve(ROOT, packagePath));
  assertWithin(ROOT, packageRoot, "package path");
  const packageManifest = readManifest(packageRoot);

  const artifactDir = path.resolve(artifactDirInput);
  fs.mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
  if (fs.readdirSync(artifactDir).length > 0) {
    fail(`Artifact directory must start empty: ${artifactDir}`);
  }

  const localDirectory = path.join(artifactDir, "local-dependencies");
  const closure = collectLocalDependencyClosure(packageRoot, packageManifest);
  const localArtifacts = [];
  if (closure.length > 0) fs.mkdirSync(localDirectory, { mode: 0o700 });
  for (const dependency of closure) {
    ensurePackageDependencies(dependency.root);
    const packed = packOne(dependency.root, localDirectory, artifactDir);
    const record = artifactRecord(packed);
    const checksumPath = `${packed.tarballPath}.sha256`;
    fs.writeFileSync(checksumPath, `${record.sha256}  ${packed.basename}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    localArtifacts.push(record);
  }

  const packed = packOne(packageRoot, artifactDir, artifactDir);
  const checksumPath = `${packed.tarballPath}.sha256`;
  fs.writeFileSync(checksumPath, `${packed.sha256}  ${packed.basename}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  const artifactManifest = {
    schema: SCHEMA,
    producer: "scripts/release-artifact.mjs",
    package: {
      component: process.env.RELEASE_COMPONENT ?? null,
      name: packageManifest.name,
      version: packageManifest.version,
      repositoryPath: path.relative(ROOT, packageRoot).replaceAll(path.sep, "/"),
    },
    source: {
      tag: process.env.RELEASE_TAG ?? null,
      commit: process.env.GITHUB_SHA ?? null,
    },
    artifact: {
      basename: packed.basename,
      relativePath: packed.relativePath,
      sha256: packed.sha256,
      size: packed.size,
      npmIntegrity: packed.npmIntegrity,
      npmShasum: packed.npmShasum,
      fileCount: packed.fileCount,
      unpackedSize: packed.unpackedSize,
    },
    dependencies: {
      localArtifacts,
    },
  };
  const manifestPath = path.join(artifactDir, `${packed.basename}.manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(artifactManifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  writeEnv(envFile, {
    RELEASE_ARTIFACT_DIRECTORY: canonicalExisting(artifactDir),
    RELEASE_TARBALL_PATH: packed.tarballPath,
    RELEASE_TARBALL_BASENAME: packed.basename,
    RELEASE_TARBALL_SHA256: packed.sha256,
    RELEASE_TARBALL_CHECKSUM_PATH: checksumPath,
    RELEASE_ARTIFACT_MANIFEST_PATH: manifestPath,
  });
  process.stdout.write(`${JSON.stringify(artifactManifest, null, 2)}\n`);
}

function buildExactInstallManifest(entries) {
  const dependencies = {};
  for (const entry of entries) {
    const name = String(entry?.name ?? "");
    if (!name) fail("Exact install artifact name is required");
    if (Object.hasOwn(dependencies, name)) {
      fail(`Duplicate exact install artifact: ${name}`);
    }
    const artifactPath = canonicalExisting(entry.artifactPath);
    const stat = fs.lstatSync(artifactPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`Exact install artifact must be a regular file: ${name}`);
    }
    dependencies[name] = pathToFileURL(artifactPath).href;
  }
  return {
    name: "pi-release-artifact-verifier",
    version: "0.0.0",
    private: true,
    dependencies,
  };
}

function verifyArtifact(options) {
  const manifestPath = canonicalExisting(requireOption(options, "manifest"));
  const artifactDir = path.dirname(manifestPath);
  const record = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(record.schema, SCHEMA, `Unsupported release artifact schema: ${record.schema}`);
  const mainRecord = {
    name: record.package?.name,
    version: record.package?.version,
    relativePath: record.artifact?.relativePath ?? record.artifact?.basename,
    sha256: record.artifact?.sha256,
    size: record.artifact?.size,
  };
  const tarballPath = verifyRecordedArtifact(artifactDir, mainRecord, "Release tarball");
  const checksumText = fs.readFileSync(`${tarballPath}.sha256`, "utf8");
  if (checksumText !== `${mainRecord.sha256}  ${path.basename(tarballPath)}\n`) {
    fail("Checksum sidecar does not match");
  }

  const localRecords = record.dependencies?.localArtifacts ?? [];
  if (!Array.isArray(localRecords)) fail("localArtifacts must be an array");
  const localPaths = [];
  const localNames = new Set();
  for (const localRecord of localRecords) {
    if (localNames.has(localRecord.name)) fail(`Duplicate local artifact: ${localRecord.name}`);
    localNames.add(localRecord.name);
    const localPath = verifyRecordedArtifact(
      artifactDir,
      localRecord,
      `Local dependency ${localRecord.name}`,
    );
    const sidecar = fs.readFileSync(`${localPath}.sha256`, "utf8");
    if (sidecar !== `${localRecord.sha256}  ${path.basename(localPath)}\n`) {
      fail(`Local dependency checksum sidecar differs: ${localRecord.name}`);
    }
    localPaths.push(localPath);
  }

  const exactArtifacts = [
    ...localRecords.map((localRecord, index) => ({
      name: localRecord.name,
      artifactPath: localPaths[index],
    })),
    { name: mainRecord.name, artifactPath: tarballPath },
  ];
  const consumerManifest = buildExactInstallManifest(exactArtifacts);
  const consumerManifestText = `${JSON.stringify(consumerManifest, null, 2)}\n`;

  const tempParent = process.env.RUNNER_TEMP || os.tmpdir();
  const installRoot = fs.mkdtempSync(path.join(tempParent, "pi-release-artifact-"));
  try {
    const consumerManifestPath = path.join(installRoot, "package.json");
    fs.writeFileSync(consumerManifestPath, consumerManifestText, "utf8");
    run(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--legacy-peer-deps",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--no-save",
      ],
      { cwd: installRoot },
    );
    if (fs.readFileSync(consumerManifestPath, "utf8") !== consumerManifestText) {
      fail("Exact install rewrote the verification consumer manifest");
    }
    if (fs.existsSync(path.join(installRoot, "package-lock.json"))) {
      fail("Exact install generated a package-lock.json");
    }
    for (const packageRecord of [...localRecords, mainRecord]) {
      const installedRoot = path.join(
        installRoot,
        "node_modules",
        ...String(packageRecord.name).split("/"),
      );
      const installedManifestPath = path.join(installedRoot, "package.json");
      if (!fs.existsSync(installedManifestPath)) {
        fail(`Exact install omitted ${packageRecord.name}`);
      }
      const installed = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
      if (installed.name !== packageRecord.name || installed.version !== packageRecord.version) {
        fail(`Installed identity differs for ${packageRecord.name}`);
      }
      verifyInstalledTargets(installedRoot, installed);
    }
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  process.stdout.write(
    `Verified exact artifact ${record.package.name}@${record.package.version} with ${localRecords.length} local dependency artifact(s) (${mainRecord.sha256}).\n`,
  );
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "pack") return packArtifact(options);
  if (command === "verify") return verifyArtifact(options);
  fail("Usage: release-artifact.mjs <pack|verify> [options]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  buildExactInstallManifest,
  parseCapturedNpmPackOutput,
  collectConcreteTargets,
  collectLocalDependencyClosure,
  sha256File,
};
