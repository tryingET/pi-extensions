#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "./npm-pack-json.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = path.join(REPO_ROOT, "packages");
const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkPackageJsonPaths(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "package.json") {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeScript(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePath(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
}

function normalizeFilesEntries(pkg) {
  if (!Array.isArray(pkg.files)) return [];
  return pkg.files.map((entry) => normalizePath(entry)).filter(Boolean);
}

function filesEntryExists(packageDir, entry) {
  const prefix = entry.split(/[\*\?\[]/, 1)[0];
  const candidate = normalizePath(prefix || entry).replace(/\/$/, "");
  if (!candidate) return false;
  return fs.existsSync(path.resolve(packageDir, candidate));
}

function summarizeProcessFailure(result) {
  const parts = [result.stdout, result.stderr]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return `exit ${result.status ?? "unknown"}`;
  }
  const combined = parts.join("\n").split(/\r?\n/).slice(-8).join(" | ");
  return combined;
}

function runNpmPack(packageDir, packageLabel, issues) {
  const result = spawnSync("npm", ["pack", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    issues.push(`${packageLabel}: npm pack --json failed: ${summarizeProcessFailure(result)}`);
    return null;
  }

  let packEntry;
  try {
    packEntry = parseNpmPackJson(result.stdout);
  } catch (error) {
    issues.push(
      `${packageLabel}: could not parse npm pack --json output: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (typeof packEntry.filename !== "string" || !Array.isArray(packEntry.files)) {
    issues.push(`${packageLabel}: npm pack --json did not return the expected filename/files contract.`);
    return null;
  }

  return {
    packEntry,
    tarballPath: path.join(packageDir, packEntry.filename),
  };
}

function readPackedManifest(tarballPath, packageLabel, issues) {
  const result = spawnSync("tar", ["-xOf", tarballPath, "package/package.json"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    issues.push(`${packageLabel}: could not read packed package.json from ${path.basename(tarballPath)}.`);
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    issues.push(
      `${packageLabel}: packed package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function collectPackedFiles(packEntry) {
  return Array.isArray(packEntry.files)
    ? packEntry.files.map((entry) => normalizePath(entry?.path ?? "")).filter(Boolean).sort()
    : [];
}

function collectBundledPrefixes(pkg) {
  return [
    ...((Array.isArray(pkg.bundleDependencies) ? pkg.bundleDependencies : []).map(String)),
    ...((Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []).map(String)),
  ]
    .map((entry) => normalizePath(`node_modules/${entry}/`))
    .filter(Boolean);
}

function validatePackWhitelist(packageLabel, packageDir, pkg, filesEntries, packedFiles, issues) {
  const expectedExact = new Set(["package.json"]);
  const expectedDirPrefixes = [];
  const expectedPatternPrefixes = [];
  const bundledPrefixes = collectBundledPrefixes(pkg);

  for (const entry of filesEntries) {
    if (/[*?\[]/.test(entry)) {
      const prefix = normalizePath(entry.split(/[*?\[]/, 1)[0]);
      if (!prefix) {
        issues.push(`${packageLabel}: unsupported files[] wildcard entry without a stable prefix: ${entry}`);
        continue;
      }
      expectedPatternPrefixes.push(prefix);
      continue;
    }

    const fullPath = path.resolve(packageDir, entry);
    if (!fs.existsSync(fullPath)) {
      issues.push(`${packageLabel}: files[] entry does not exist: ${entry}`);
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      expectedDirPrefixes.push(entry.endsWith("/") ? entry : `${entry}/`);
    } else {
      expectedExact.add(entry);
    }
  }

  const packedSet = new Set(packedFiles);
  const allowByAlwaysIncluded = (filePath) => {
    return (
      /^README(?:\.[^/]+)?$/i.test(filePath) ||
      /^LICENSE(?:\.[^/]+)?$/i.test(filePath) ||
      /^NOTICE(?:\.[^/]+)?$/i.test(filePath)
    );
  };

  const missing = [];
  for (const filePath of expectedExact) {
    if (!packedSet.has(filePath)) {
      missing.push(filePath);
    }
  }
  for (const prefix of expectedDirPrefixes) {
    if (!packedFiles.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }
  for (const prefix of expectedPatternPrefixes) {
    if (!packedFiles.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }
  for (const prefix of bundledPrefixes) {
    if (!packedFiles.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }

  const extra = packedFiles.filter((filePath) => {
    if (expectedExact.has(filePath)) return false;
    if (expectedDirPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (expectedPatternPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (bundledPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (allowByAlwaysIncluded(filePath)) return false;
    return true;
  });

  if (missing.length > 0) {
    issues.push(`${packageLabel}: packed artifact is missing declared files[] coverage for: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    issues.push(`${packageLabel}: packed artifact includes files outside files[] coverage: ${extra.join(", ")}`);
  }
}

function collectDeclaredArtifactPaths(pkg) {
  const artifacts = [];
  const seen = new Set();

  const addArtifact = (label, target) => {
    if (typeof target !== "string") return;
    const normalized = normalizePath(target);
    if (!normalized) return;
    const key = `${label}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push({ label, path: normalized });
  };

  const walkExports = (value, label = "exports") => {
    if (typeof value === "string") {
      addArtifact(label, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walkExports(entry, `${label}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      walkExports(nested, `${label}.${key}`);
    }
  };

  addArtifact("main", pkg.main);
  addArtifact("types", pkg.types);

  if (typeof pkg.bin === "string") {
    addArtifact("bin", pkg.bin);
  } else if (isRecord(pkg.bin)) {
    for (const [name, target] of Object.entries(pkg.bin)) {
      addArtifact(`bin.${name}`, target);
    }
  }

  walkExports(pkg.exports);

  if (Array.isArray(pkg.pi?.extensions)) {
    for (const [index, target] of pkg.pi.extensions.entries()) {
      addArtifact(`pi.extensions[${index}]`, target);
    }
  }

  if (Array.isArray(pkg.pi?.prompts)) {
    for (const [index, target] of pkg.pi.prompts.entries()) {
      addArtifact(`pi.prompts[${index}]`, target);
    }
  }

  return artifacts;
}

function validateDeclaredArtifacts(packageLabel, packageDir, pkg, packedFiles, issues) {
  const packedSet = new Set(packedFiles);

  for (const artifact of collectDeclaredArtifactPaths(pkg)) {
    const fullPath = path.resolve(packageDir, artifact.path);
    if (!fs.existsSync(fullPath)) {
      issues.push(`${packageLabel}: ${artifact.label} points to a missing path: ${artifact.path}`);
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const prefix = artifact.path.endsWith("/") ? artifact.path : `${artifact.path}/`;
      if (!packedFiles.some((filePath) => filePath.startsWith(prefix))) {
        issues.push(`${packageLabel}: ${artifact.label} directory is not present in the packed artifact: ${artifact.path}`);
      }
      continue;
    }

    if (!packedSet.has(artifact.path)) {
      issues.push(`${packageLabel}: ${artifact.label} file is not present in the packed artifact: ${artifact.path}`);
    }
  }
}

function validatePackedManifest(packageLabel, packedManifest, issues) {
  for (const field of DEPENDENCY_FIELDS) {
    const deps = packedManifest[field];
    if (!isRecord(deps)) continue;
    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec.startsWith("file:")) {
        issues.push(`${packageLabel}: packed package.json still contains ${field}.${dependencyName}=${spec}`);
      }
    }
  }
}

function collectIssues(packageJsonPath) {
  const packageDir = path.dirname(packageJsonPath);
  const pkg = readJson(packageJsonPath);
  const scripts = isRecord(pkg.scripts) ? pkg.scripts : {};
  const issues = [];

  if (pkg.private === true) {
    return { pkg, issues };
  }

  const packageLabel = `${pkg.name ?? "<unnamed>"} (${path.relative(REPO_ROOT, packageJsonPath)})`;
  const filesEntries = normalizeFilesEntries(pkg);
  const hasExtensions = Array.isArray(pkg.pi?.extensions) && pkg.pi.extensions.length > 0;
  const releaseConfigMode = pkg?.["x-pi-template"]?.releaseConfigMode;
  const quickReleaseCheck = typeof scripts["release:check:quick"] === "string" ? scripts["release:check:quick"] : "";
  const fullReleaseCheck = typeof scripts["release:check"] === "string" ? scripts["release:check"] : "";

  if (filesEntries.length === 0) {
    issues.push(`${packageLabel}: package.json must define a non-empty files[] array for deterministic publish artifacts.`);
  }

  for (const entry of filesEntries) {
    if (!filesEntryExists(packageDir, entry)) {
      issues.push(`${packageLabel}: files[] entry does not exist: ${entry}`);
    }
  }

  if (!quickReleaseCheck.trim()) {
    issues.push(`${packageLabel}: scripts.release:check:quick is required for publishable packages.`);
  }

  if (hasExtensions && !fullReleaseCheck.trim()) {
    issues.push(`${packageLabel}: scripts.release:check is required for packages that expose pi.extensions.`);
  }

  const normalizedQuick = normalizeScript(quickReleaseCheck);
  if ((releaseConfigMode === "component" || hasExtensions) && normalizedQuick === "npm pack --dry-run") {
    issues.push(
      `${packageLabel}: scripts.release:check:quick must be artifact-aware for component/extension packages; bare 'npm pack --dry-run' is too weak.`,
    );
  }

  const packedArtifact = runNpmPack(packageDir, packageLabel, issues);
  if (!packedArtifact) {
    return { pkg, issues };
  }

  try {
    const packedFiles = collectPackedFiles(packedArtifact.packEntry);
    validatePackWhitelist(packageLabel, packageDir, pkg, filesEntries, packedFiles, issues);

    const packedManifest = readPackedManifest(packedArtifact.tarballPath, packageLabel, issues);
    if (packedManifest) {
      validatePackedManifest(packageLabel, packedManifest, issues);
      validateDeclaredArtifacts(packageLabel, packageDir, packedManifest, packedFiles, issues);
    }
  } finally {
    fs.rmSync(packedArtifact.tarballPath, { force: true });
  }

  return { pkg, issues };
}

function main() {
  const packageJsonPaths = walkPackageJsonPaths(PACKAGES_ROOT);
  const reports = packageJsonPaths.map((packageJsonPath) => collectIssues(packageJsonPath));
  const checked = reports.filter(({ pkg }) => pkg.private !== true).length;
  const issues = reports.flatMap(({ issues }) => issues);

  if (issues.length > 0) {
    console.error(`package release contract validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}).`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`package release contract validation passed (${checked} publishable package${checked === 1 ? "" : "s"}).`);
}

main();
