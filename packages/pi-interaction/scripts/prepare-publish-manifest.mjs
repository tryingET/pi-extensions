#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];

if (!mode || !["prepack", "postpack"].includes(mode)) {
  console.error("Usage: node ../scripts/prepare-publish-manifest.mjs <prepack|postpack>");
  process.exit(1);
}

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, "package.json");
const backupPath = path.join(packageDir, ".package.json.prepack.backup");
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const writeText = (filePath, content) => fs.writeFileSync(filePath, content, "utf8");
const exists = (filePath) => fs.existsSync(filePath);

function restoreBackupIfPresent() {
  if (!exists(backupPath)) {
    return false;
  }

  fs.copyFileSync(backupPath, packageJsonPath);
  fs.unlinkSync(backupPath);
  return true;
}

if (mode === "postpack") {
  if (restoreBackupIfPresent()) {
    console.error("[prepare-publish-manifest] restored package.json from postpack backup");
  }
  process.exit(0);
}

if (!exists(packageJsonPath)) {
  console.error(`[prepare-publish-manifest] Missing package.json in ${packageDir}`);
  process.exit(1);
}

if (exists(backupPath)) {
  restoreBackupIfPresent();
  console.error("[prepare-publish-manifest] restored stale backup before rewriting");
}

const originalText = readText(packageJsonPath);
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
      console.error(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but ${dependencyPackageJsonPath} does not exist`,
      );
      process.exit(1);
    }

    const dependencyManifest = JSON.parse(readText(dependencyPackageJsonPath));
    if (dependencyManifest.name !== dependencyName) {
      console.error(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but resolved package name is ${dependencyManifest.name ?? "<missing>"}`,
      );
      process.exit(1);
    }

    if (typeof dependencyManifest.version !== "string" || dependencyManifest.version.length === 0) {
      console.error(
        `[prepare-publish-manifest] ${field}.${dependencyName} points to ${spec}, but the resolved package has no version`,
      );
      process.exit(1);
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

if (rewrites.length === 0) {
  process.exit(0);
}

writeText(backupPath, originalText);
writeText(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const rewrite of rewrites) {
  console.error(
    `[prepare-publish-manifest] ${rewrite.field}.${rewrite.dependencyName}: ${rewrite.from} -> ${rewrite.to}`,
  );
}
