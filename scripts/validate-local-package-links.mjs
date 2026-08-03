#!/usr/bin/env node
// ---
// summary: "Validates installed direct and transitive file: package links without mutating package state."
// read_when:
//   - "Diagnosing missing local package links or changing package dependency validation."
// ---

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const LOCAL_DEPENDENCY_FIELDS = ["dependencies", "devDependencies"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function displayPath(repoRoot, targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  return isPathInside(repoRoot, targetPath) ? relative || "." : targetPath;
}

function shellArgument(value) {
  if (/^[A-Za-z0-9_./@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installedDependencyPath(packageRoot, dependencyName) {
  const validShape = dependencyName.startsWith("@")
    ? /^@[^/\\]+\/[^/\\]+$/.test(dependencyName)
    : /^[^/\\]+$/.test(dependencyName);
  const segments = dependencyName.split("/");
  if (
    !validShape ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`invalid dependency name: ${dependencyName}`);
  }
  return path.join(packageRoot, "node_modules", ...segments);
}

function discoverPackageRoots(repoRoot) {
  const packagesRoot = path.join(repoRoot, "packages");
  if (!fs.existsSync(packagesRoot)) return [];

  const results = [];
  const queue = [packagesRoot];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
      } else if (entry.isFile() && entry.name === "package.json") {
        results.push(path.dirname(entryPath));
      }
    }
  }
  return results.sort();
}

function listLocalDependencies(manifest) {
  const dependencies = [];
  for (const field of LOCAL_DEPENDENCY_FIELDS) {
    const entries = manifest[field];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const [name, spec] of Object.entries(entries)) {
      if (typeof spec === "string" && spec.startsWith("file:")) {
        dependencies.push({ field, name, spec });
      }
    }
  }
  return dependencies.sort((left, right) =>
    `${left.field}:${left.name}`.localeCompare(`${right.field}:${right.name}`),
  );
}

function tryRealpath(targetPath) {
  try {
    return { ok: true, path: fs.realpathSync.native(targetPath) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function validateLocalPackageLinks({ repoRoot = DEFAULT_REPO_ROOT, packageRoots } = {}) {
  const resolvedRepoRoot = fs.realpathSync.native(path.resolve(repoRoot));
  const selectedRoots = (packageRoots?.length ? packageRoots : discoverPackageRoots(resolvedRepoRoot)).map(
    (packageRoot) => path.resolve(packageRoot),
  );
  const visited = new Set();
  const issues = [];
  let linkCount = 0;

  const addIssue = (issue) => {
    issues.push(issue);
  };

  const visit = (rawPackageRoot, chain = []) => {
    const packageRootResult = tryRealpath(rawPackageRoot);
    if (!packageRootResult.ok) {
      addIssue({
        code: "package_root_missing",
        packageRoot: rawPackageRoot,
        summary: `package root is missing or unreadable: ${displayPath(resolvedRepoRoot, rawPackageRoot)}`,
        chain,
      });
      return;
    }

    const packageRoot = packageRootResult.path;
    if (!isPathInside(resolvedRepoRoot, packageRoot)) {
      addIssue({
        code: "package_root_outside_repo",
        packageRoot,
        summary: `selected package root resolves outside the repository: ${packageRoot}`,
        chain,
      });
      return;
    }
    if (visited.has(packageRoot)) return;
    visited.add(packageRoot);

    const manifestPath = path.join(packageRoot, "package.json");
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      addIssue({
        code: "manifest_unreadable",
        packageRoot,
        manifestPath,
        summary: `${displayPath(resolvedRepoRoot, manifestPath)} is missing or invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        chain,
      });
      return;
    }

    for (const dependency of listLocalDependencies(manifest)) {
      linkCount += 1;
      const declaration = `${dependency.field}.${dependency.name}`;
      const declaredTarget = path.resolve(packageRoot, dependency.spec.slice("file:".length));
      const packageLabel = displayPath(resolvedRepoRoot, packageRoot);
      const manifestLabel = displayPath(resolvedRepoRoot, manifestPath);
      const repair = `cd ${shellArgument(packageLabel)} && npm install`;
      const dependencyChain = [...chain, packageLabel];

      if (!isPathInside(resolvedRepoRoot, declaredTarget)) {
        addIssue({
          code: "target_outside_repo",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} resolves outside the repository: ${declaredTarget}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      const targetResult = tryRealpath(declaredTarget);
      if (!targetResult.ok) {
        addIssue({
          code: "declared_target_missing",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} points to a missing package directory: ${displayPath(
            resolvedRepoRoot,
            declaredTarget,
          )}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      const targetRoot = targetResult.path;
      if (!isPathInside(resolvedRepoRoot, targetRoot)) {
        addIssue({
          code: "target_outside_repo",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} resolves through a filesystem link outside the repository: ${targetRoot}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      const targetManifestPath = path.join(targetRoot, "package.json");
      let targetManifest;
      try {
        targetManifest = readJson(targetManifestPath);
      } catch (error) {
        addIssue({
          code: "target_manifest_unreadable",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} targets a directory without a readable package.json: ${displayPath(
            resolvedRepoRoot,
            targetManifestPath,
          )}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      if (targetManifest.name !== dependency.name) {
        addIssue({
          code: "target_name_mismatch",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} targets package ${JSON.stringify(
            targetManifest.name ?? null,
          )}, not ${JSON.stringify(dependency.name)}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      let installedPath;
      try {
        installedPath = installedDependencyPath(packageRoot, dependency.name);
      } catch (error) {
        addIssue({
          code: "invalid_dependency_name",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration} uses an invalid package name: ${dependency.name}`,
          chain: dependencyChain,
          repair,
        });
        continue;
      }

      const installedResult = tryRealpath(installedPath);
      if (!installedResult.ok) {
        let entryExists = false;
        try {
          fs.lstatSync(installedPath);
          entryExists = true;
        } catch {
          // Missing entry and dangling links both fail closed below with distinct wording.
        }
        addIssue({
          code: entryExists ? "dangling_installed_link" : "missing_installed_link",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} expects ${displayPath(
            resolvedRepoRoot,
            installedPath,
          )} to resolve to ${displayPath(resolvedRepoRoot, targetRoot)}, but the installed entry is ${
            entryExists ? "dangling" : "missing"
          }`,
          chain: dependencyChain,
          repair,
        });
      } else if (installedResult.path !== targetRoot) {
        addIssue({
          code: "installed_target_mismatch",
          packageRoot,
          manifestPath,
          dependencyName: dependency.name,
          summary: `${manifestLabel} ${declaration}=${dependency.spec} expects ${displayPath(
            resolvedRepoRoot,
            installedPath,
          )} to resolve to ${displayPath(resolvedRepoRoot, targetRoot)}, but it resolves to ${displayPath(
            resolvedRepoRoot,
            installedResult.path,
          )}`,
          chain: dependencyChain,
          repair,
        });
      }

      visit(targetRoot, dependencyChain);
    }
  };

  for (const packageRoot of selectedRoots) visit(packageRoot);

  return {
    ok: issues.length === 0,
    issues,
    packageCount: visited.size,
    linkCount,
  };
}

function parseArgs(argv) {
  let repoRoot = DEFAULT_REPO_ROOT;
  const packageArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo-root") {
      repoRoot = argv[index + 1];
      if (!repoRoot) throw new Error("--repo-root requires a path");
      index += 1;
    } else if (argument === "--package") {
      const packageRoot = argv[index + 1];
      if (!packageRoot) throw new Error("--package requires a path");
      packageArgs.push(packageRoot);
      index += 1;
    } else if (argument === "-h" || argument === "--help") {
      return { help: true, repoRoot, packageArgs };
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return { help: false, repoRoot, packageArgs };
}

function printUsage() {
  console.log(`Usage: node ./scripts/validate-local-package-links.mjs [--repo-root <path>] [--package <path>]...

With no --package arguments, validates every package.json below packages/ (excluding hidden and node_modules directories).
Checks required local file: dependencies and devDependencies recursively. It never installs packages or mutates manifests, locks, or node_modules.`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`local-package-links: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printUsage();
    return;
  }

  const repoRoot = path.resolve(options.repoRoot);
  const packageRoots = options.packageArgs.map((packageRoot) =>
    path.isAbsolute(packageRoot) ? packageRoot : path.resolve(repoRoot, packageRoot),
  );
  let result;
  try {
    result = validateLocalPackageLinks({ repoRoot, packageRoots });
  } catch (error) {
    console.error(`local-package-links: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  if (result.ok) {
    console.log(`local-package-links: ok (${result.packageCount} package(s), ${result.linkCount} link(s))`);
    return;
  }

  console.error(`local-package-links: failed (${result.issues.length} issue(s))`);
  for (const issue of result.issues) {
    console.error(`- [${issue.code}] ${issue.summary}`);
    if (issue.chain?.length > 1) console.error(`  dependency chain: ${issue.chain.join(" -> ")}`);
    if (issue.repair) console.error(`  repair: ${issue.repair}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}
