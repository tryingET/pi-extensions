#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];

if (!mode || !["prepack", "postpack"].includes(mode)) {
  console.error("Usage: node ./scripts/prepare-publish-manifest.mjs <prepack|postpack>");
  process.exit(1);
}

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, "package.json");
const backupPath = path.join(packageDir, ".package.json.prepack.backup");
const stagedStatePath = path.join(packageDir, ".bundled-deps.prepack.state.json");
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const runtimeDependencyFields = ["dependencies", "optionalDependencies"];

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const writeText = (filePath, content) => fs.writeFileSync(filePath, content, "utf8");
const exists = (filePath) => fs.existsSync(filePath);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, cwd = packageDir) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_json: undefined,
      npm_config_dry_run: undefined,
    },
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(
      `[prepare-publish-manifest] ${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
    );
  }

  return result;
}

function restoreBackupIfPresent() {
  if (!exists(backupPath)) {
    return false;
  }

  fs.copyFileSync(backupPath, packageJsonPath);
  fs.unlinkSync(backupPath);
  return true;
}

function restoreBundledDependencyLinksFromState() {
  if (!exists(stagedStatePath)) {
    return false;
  }

  const state = JSON.parse(readText(stagedStatePath));
  const dependencies = Array.isArray(state.dependencies) ? state.dependencies : [];
  const tarballs = Array.isArray(state.tarballs) ? state.tarballs : [];

  for (const dependency of dependencies) {
    if (!dependency || typeof dependency !== "object") continue;
    const name = String(dependency.name ?? "").trim();
    const sourceDir = String(dependency.sourceDir ?? "").trim();
    if (!name || !sourceDir) continue;

    const destination = path.join(packageDir, "node_modules", ...name.split("/"));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(sourceDir, destination, "dir");
  }

  for (const tarballPath of tarballs) {
    if (typeof tarballPath !== "string" || !tarballPath.trim()) continue;
    fs.rmSync(tarballPath, { force: true });
  }

  fs.rmSync(stagedStatePath, { force: true });
  return dependencies.length > 0 || tarballs.length > 0;
}

function collectLocalBundledDependencies(manifest) {
  const bundledNames = new Set([
    ...(Array.isArray(manifest.bundleDependencies) ? manifest.bundleDependencies : []).map(String),
    ...(Array.isArray(manifest.bundledDependencies) ? manifest.bundledDependencies : []).map(
      String,
    ),
  ]);

  const collected = [];
  const seen = new Set();
  for (const field of runtimeDependencyFields) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (!bundledNames.has(dependencyName)) continue;
      if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
      if (seen.has(dependencyName)) continue;

      const sourceDir = path.resolve(packageDir, spec.slice("file:".length));
      const dependencyPackageJsonPath = path.join(sourceDir, "package.json");
      if (!exists(dependencyPackageJsonPath)) {
        fail(
          `[prepare-publish-manifest] bundled dependency ${dependencyName} points to ${spec}, but ${dependencyPackageJsonPath} does not exist`,
        );
      }

      const dependencyManifest = JSON.parse(readText(dependencyPackageJsonPath));
      if (dependencyManifest.name !== dependencyName) {
        fail(
          `[prepare-publish-manifest] bundled dependency ${dependencyName} points to ${spec}, but resolved package name is ${dependencyManifest.name ?? "<missing>"}`,
        );
      }

      collected.push({ name: dependencyName, spec, sourceDir });
      seen.add(dependencyName);
    }
  }

  return collected;
}

function stageBundledDependencies(manifest) {
  const dependencies = collectLocalBundledDependencies(manifest);
  if (dependencies.length === 0) {
    return;
  }

  const tarballs = [];
  for (const dependency of dependencies) {
    const packResult = run("npm", ["pack", "--silent"], dependency.sourceDir);
    const tarballName = (packResult.stdout || "")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    if (!tarballName) {
      fail(`[prepare-publish-manifest] Could not determine tarball name for ${dependency.name}`);
    }

    tarballs.push(path.join(dependency.sourceDir, tarballName));
  }

  run("npm", ["install", "--ignore-scripts", "--no-save", ...tarballs], packageDir);
  writeText(
    stagedStatePath,
    `${JSON.stringify(
      {
        dependencies,
        tarballs,
      },
      null,
      2,
    )}\n`,
  );
}

if (mode === "postpack") {
  const restoredBackup = restoreBackupIfPresent();
  const restoredBundled = restoreBundledDependencyLinksFromState();
  if (restoredBackup) {
    console.error("[prepare-publish-manifest] restored package.json from postpack backup");
  }
  if (restoredBundled) {
    console.error("[prepare-publish-manifest] restored bundled dependency links after pack");
  }
  process.exit(0);
}

if (!exists(packageJsonPath)) {
  fail(`[prepare-publish-manifest] Missing package.json in ${packageDir}`);
}

if (exists(backupPath)) {
  restoreBackupIfPresent();
  console.error("[prepare-publish-manifest] restored stale backup before rewriting");
}
if (exists(stagedStatePath)) {
  restoreBundledDependencyLinksFromState();
  console.error(
    "[prepare-publish-manifest] restored stale bundled-dependency state before rewriting",
  );
}

const originalText = readText(packageJsonPath);
const originalManifest = JSON.parse(originalText);
const manifest = JSON.parse(originalText);
const rewrites = [];

for (const field of dependencyFields) {
  const deps = manifest[field];
  if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
    continue;
  }

  for (const [dependencyName, spec] of Object.entries(deps)) {
    if (typeof spec !== "string" || !spec.startsWith("file:")) {
      continue;
    }

    const relativeTarget = spec.slice("file:".length);
    const dependencyDir = path.resolve(packageDir, relativeTarget);
    const dependencyPackageJsonPath = path.join(dependencyDir, "package.json");

    if (!exists(dependencyPackageJsonPath)) {
      fail(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but ${dependencyPackageJsonPath} does not exist`,
      );
    }

    const dependencyManifest = JSON.parse(readText(dependencyPackageJsonPath));
    if (dependencyManifest.name !== dependencyName) {
      fail(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but resolved package name is ${dependencyManifest.name ?? "<missing>"}`,
      );
    }

    if (typeof dependencyManifest.version !== "string" || dependencyManifest.version.length === 0) {
      fail(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but the resolved package has no version`,
      );
    }

    manifest[field][dependencyName] = dependencyManifest.version;
    rewrites.push({
      field,
      dependencyName,
      from: spec,
      to: dependencyManifest.version,
    });
  }
}

if (rewrites.length > 0) {
  writeText(backupPath, originalText);
  writeText(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const rewrite of rewrites) {
    console.error(
      `[prepare-publish-manifest] ${rewrite.field}.${rewrite.dependencyName}: ${rewrite.from} -> ${rewrite.to}`,
    );
  }
}

stageBundledDependencies(originalManifest);
