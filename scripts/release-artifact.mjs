#!/usr/bin/env node
/**
summary: "Creates one authoritative npm release tarball and verifies the exact bytes through an isolated install."
read_when:
  - "Changing npm publication, retained release artifacts, checksums, or installed-artifact verification."
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCHEMA = "pi.release-artifact.v1";
const SHA256_RE = /^[0-9a-f]{64}$/u;

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
  const absolute = path.resolve(filePath);
  const real = fs.realpathSync(absolute);
  return real;
}

function assertWithin(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  fail(`${label} escapes ${parent}: ${child}`);
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

function parsePackJson(text) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < first) fail("npm pack did not emit a JSON array");
  const parsed = JSON.parse(text.slice(first, last + 1));
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]) {
    fail("npm pack must produce exactly one artifact");
  }
  return parsed[0];
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

function packArtifact(options) {
  const packagePath = requireOption(options, "package-path");
  const artifactDirInput = requireOption(options, "artifact-dir");
  const envFile = options["env-file"];
  const packageRoot = canonicalExisting(path.resolve(ROOT, packagePath));
  assertWithin(ROOT, packageRoot, "package path");
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.statSync(packageJsonPath).isFile()) fail(`Missing package.json: ${packageJsonPath}`);
  const packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const expectedName = String(packageManifest.name ?? "");
  const expectedVersion = String(packageManifest.version ?? "");
  if (!expectedName || !expectedVersion) fail("package name and version are required");

  const artifactDir = path.resolve(artifactDirInput);
  fs.mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
  const existing = fs.readdirSync(artifactDir);
  if (existing.length > 0) fail(`Artifact directory must start empty: ${artifactDir}`);

  const packResult = run(
    "npm",
    ["pack", "--json", "--pack-destination", artifactDir],
    { cwd: packageRoot, capture: true },
  );
  const pack = parsePackJson(packResult.stdout ?? "");
  if (pack.name !== expectedName) fail(`Packed name mismatch: ${pack.name} != ${expectedName}`);
  if (pack.version !== expectedVersion) {
    fail(`Packed version mismatch: ${pack.version} != ${expectedVersion}`);
  }
  const basename = path.basename(String(pack.filename ?? ""));
  if (!basename || basename !== pack.filename) fail(`Unsafe npm pack filename: ${pack.filename}`);
  const tarballPath = canonicalExisting(path.join(artifactDir, basename));
  assertWithin(canonicalExisting(artifactDir), tarballPath, "release tarball");
  const stat = fs.lstatSync(tarballPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("Release tarball must be a regular file");
  if (stat.size <= 0) fail("Release tarball is empty");

  const sha256 = sha256File(tarballPath);
  const checksumPath = `${tarballPath}.sha256`;
  fs.writeFileSync(checksumPath, `${sha256}  ${basename}\n`, { encoding: "utf8", mode: 0o600 });

  const artifactManifest = {
    schema: SCHEMA,
    producer: "scripts/release-artifact.mjs",
    package: {
      component: process.env.RELEASE_COMPONENT ?? null,
      name: expectedName,
      version: expectedVersion,
      repositoryPath: path.relative(ROOT, packageRoot).replaceAll(path.sep, "/"),
    },
    source: {
      tag: process.env.RELEASE_TAG ?? null,
      commit: process.env.GITHUB_SHA ?? null,
    },
    artifact: {
      basename,
      sha256,
      size: stat.size,
      npmIntegrity: typeof pack.integrity === "string" ? pack.integrity : null,
      npmShasum: typeof pack.shasum === "string" ? pack.shasum : null,
      fileCount: Array.isArray(pack.files) ? pack.files.length : null,
      unpackedSize: Number.isSafeInteger(pack.unpackedSize) ? pack.unpackedSize : null,
    },
  };
  const manifestPath = path.join(artifactDir, `${basename}.manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(artifactManifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  writeEnv(envFile, {
    RELEASE_TARBALL_PATH: tarballPath,
    RELEASE_TARBALL_BASENAME: basename,
    RELEASE_TARBALL_SHA256: sha256,
    RELEASE_TARBALL_CHECKSUM_PATH: checksumPath,
    RELEASE_ARTIFACT_MANIFEST_PATH: manifestPath,
  });
  process.stdout.write(`${JSON.stringify(artifactManifest, null, 2)}\n`);
}

function verifyArtifact(options) {
  const manifestPath = canonicalExisting(requireOption(options, "manifest"));
  const artifactDir = path.dirname(manifestPath);
  const record = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(record.schema, SCHEMA, `Unsupported release artifact schema: ${record.schema}`);
  const basename = String(record.artifact?.basename ?? "");
  const expectedSha = String(record.artifact?.sha256 ?? "");
  if (!basename || basename !== path.basename(basename)) fail(`Unsafe artifact basename: ${basename}`);
  if (!SHA256_RE.test(expectedSha)) fail("Artifact manifest has an invalid SHA-256");
  const tarballPath = canonicalExisting(path.join(artifactDir, basename));
  assertWithin(canonicalExisting(artifactDir), tarballPath, "release tarball");
  const actualSha = sha256File(tarballPath);
  if (actualSha !== expectedSha) fail(`Release tarball SHA-256 changed: ${actualSha}`);
  const stat = fs.statSync(tarballPath);
  if (stat.size !== record.artifact.size) fail("Release tarball size changed");
  const checksumText = fs.readFileSync(`${tarballPath}.sha256`, "utf8");
  if (checksumText !== `${expectedSha}  ${basename}\n`) fail("Checksum sidecar does not match");

  const tempParent = process.env.RUNNER_TEMP || os.tmpdir();
  const installRoot = fs.mkdtempSync(path.join(tempParent, "pi-release-artifact-"));
  try {
    fs.writeFileSync(
      path.join(installRoot, "package.json"),
      `${JSON.stringify({ private: true }, null, 2)}\n`,
      "utf8",
    );
    run(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--legacy-peer-deps",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--no-save",
        tarballPath,
      ],
      { cwd: installRoot },
    );
    const installedRoot = path.join(installRoot, "node_modules", ...String(record.package.name).split("/"));
    const installedManifestPath = path.join(installedRoot, "package.json");
    if (!fs.existsSync(installedManifestPath)) fail("Exact tarball did not install expected package");
    const installed = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
    if (installed.name !== record.package.name) fail("Installed package name differs from artifact manifest");
    if (installed.version !== record.package.version) {
      fail("Installed package version differs from artifact manifest");
    }
    verifyInstalledTargets(installedRoot, installed);
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  process.stdout.write(
    `Verified exact artifact ${record.package.name}@${record.package.version} (${expectedSha}).\n`,
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

export { collectConcreteTargets, sha256File };
