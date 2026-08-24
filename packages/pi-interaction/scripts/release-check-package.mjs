#!/usr/bin/env node
/**
 * summary: "validates one package publish artifact, local dependency rewrites, tarball installation, and importability."
 * read_when:
 *   - "checking package-level release contents or investigating packed dependency and install smoke failures."
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseNpmPackJson } from "../../../scripts/npm-pack-json.mjs";

const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const runtimeDependencyFields = ["dependencies", "optionalDependencies"];
const keepArtifacts = process.env.KEEP_RELEASE_ARTIFACTS === "1";

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, "package.json");
const manifestStatePaths = [
  ".package.json.prepack.backup",
  ".package.json.publish-manifest.lock",
  ".package.json.publish-manifest.guard",
  ".package.json.publish-manifest.recovery",
].map((name) => path.join(packageDir, name));
const manifestLifecycleScriptPath = path.resolve(
  packageDir,
  "../scripts/prepare-publish-manifest.mjs",
);

if (!fs.existsSync(packageJsonPath)) {
  console.error(`Missing package.json in ${packageDir}`);
  process.exit(1);
}

const originalPackageJsonText = fs.readFileSync(packageJsonPath, "utf8");
const pkg = JSON.parse(originalPackageJsonText);

const normalize = (value) => String(value).replace(/^\.\//, "").replace(/\\/g, "/");
const statePathExists = (statePath) => {
  try {
    fs.lstatSync(statePath);
    return true;
  } catch {
    return false;
  }
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const cwd = options.cwd ?? packageDir;
  console.log(`== ${command} ${args.join(" ")} (${cwd})`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }

  return result;
}

function loadManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
}

function listLocalDependencies(dir, seen = new Map()) {
  const manifest = loadManifest(dir);

  for (const field of runtimeDependencyFields) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec !== "string" || !spec.startsWith("file:")) {
        continue;
      }

      const dependencyDir = path.resolve(dir, spec.slice("file:".length));
      const dependencyManifest = loadManifest(dependencyDir);

      if (dependencyManifest.name !== dependencyName) {
        fail(
          `${manifest.name} ${field}.${dependencyName} points to ${spec}, but resolved package is ${dependencyManifest.name ?? "<missing>"}`,
        );
      }

      listLocalDependencies(dependencyDir, seen);

      if (!seen.has(dependencyName)) {
        seen.set(dependencyName, {
          name: dependencyName,
          version: dependencyManifest.version,
          dir: dependencyDir,
        });
      }
    }
  }

  return [...seen.values()];
}

function collectDirectLocalDependencyVersions(manifest, dir) {
  const versions = [];

  for (const field of dependencyFields) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec !== "string" || !spec.startsWith("file:")) {
        continue;
      }

      const dependencyDir = path.resolve(dir, spec.slice("file:".length));
      const dependencyManifest = loadManifest(dependencyDir);
      versions.push({
        field,
        dependencyName,
        expectedVersion: dependencyManifest.version,
      });
    }
  }

  return versions;
}

function validatePackWhitelist(packJson, manifest) {
  const filesEntries = Array.isArray(manifest.files)
    ? manifest.files.map((entry) => normalize(String(entry).trim())).filter(Boolean)
    : [];

  if (filesEntries.length === 0) {
    fail("package.json must define a non-empty files array for deterministic publish artifacts.");
  }

  const expectedExact = new Set(["package.json"]);
  const expectedDirPrefixes = [];
  const expectedPatternPrefixes = [];

  for (const entry of filesEntries) {
    if (/[*?[]/.test(entry)) {
      const prefix = normalize(entry.split(/[*?[]/, 1)[0]);
      if (!prefix) {
        fail(`Unsupported files[] wildcard entry without prefix: ${entry}`);
      }
      expectedPatternPrefixes.push(prefix);
      continue;
    }

    const fullPath = path.resolve(packageDir, entry);
    if (!fs.existsSync(fullPath)) {
      fail(`files[] entry does not exist: ${entry}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      expectedDirPrefixes.push(entry.endsWith("/") ? entry : `${entry}/`);
    } else {
      expectedExact.add(entry);
    }
  }

  if (!Array.isArray(packJson) || !packJson[0] || !Array.isArray(packJson[0].files)) {
    fail("Could not parse npm pack --dry-run --json output.");
  }

  const actual = packJson[0].files
    .map((file) => normalize(String(file.path ?? "")))
    .filter(Boolean)
    .sort();
  const actualSet = new Set(actual);
  const allowByAlwaysIncluded = (filePath) => {
    return (
      /^README(?:\.[^/]+)?$/i.test(filePath) ||
      /^LICENSE(?:\.[^/]+)?$/i.test(filePath) ||
      /^NOTICE(?:\.[^/]+)?$/i.test(filePath)
    );
  };

  const missing = [];
  for (const filePath of expectedExact) {
    if (!actualSet.has(filePath)) {
      missing.push(filePath);
    }
  }
  for (const prefix of expectedDirPrefixes) {
    if (!actual.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }
  for (const prefix of expectedPatternPrefixes) {
    if (!actual.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }

  const extra = actual.filter((filePath) => {
    if (expectedExact.has(filePath)) return false;
    if (expectedDirPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (expectedPatternPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (allowByAlwaysIncluded(filePath)) return false;
    return true;
  });

  if (missing.length || extra.length) {
    console.error("Publish file whitelist mismatch.");
    if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`Extra: ${extra.join(", ")}`);
    process.exit(1);
  }

  console.log(`File whitelist OK (${actual.length} files).`);
}

function readPackedManifest(tarballPath) {
  const result = run("tar", ["-xOf", tarballPath, "package/package.json"]);
  return JSON.parse(result.stdout);
}

function dependencyProjection(manifest) {
  return Object.fromEntries(
    dependencyFields
      .filter((field) => manifest[field] && Object.keys(manifest[field]).length > 0)
      .map((field) => [field, manifest[field]]),
  );
}

function validatePackedManifest(packedManifest, originalManifest, packageName, artifactLabel) {
  for (const field of dependencyFields) {
    const deps = packedManifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec.startsWith("file:")) {
        fail(
          `Prepared manifest still contains file dependency ${field}.${dependencyName}=${spec} in ${artifactLabel}`,
        );
      }
    }
  }

  const directLocalDependencyVersions = collectDirectLocalDependencyVersions(
    originalManifest,
    packageDir,
  );
  for (const dependency of directLocalDependencyVersions) {
    const packedValue = packedManifest?.[dependency.field]?.[dependency.dependencyName];
    if (packedValue !== dependency.expectedVersion) {
      fail(
        `${packageName} packed manifest expected ${dependency.field}.${dependency.dependencyName}=${dependency.expectedVersion}, got ${packedValue ?? "<missing>"}`,
      );
    }
  }

  console.log(
    `${artifactLabel} dependency projection: ${JSON.stringify(dependencyProjection(packedManifest))}`,
  );
  console.log(`${artifactLabel} dependency rewrite OK.`);
}

if (typeof pkg.name !== "string" || pkg.name.length === 0) fail("package.json name is required.");
if (typeof pkg.version !== "string" || pkg.version.length === 0)
  fail("package.json version is required.");

const repositoryUrl = (() => {
  const repository = pkg.repository;
  if (typeof repository === "string") return repository.trim();
  if (repository && typeof repository === "object" && typeof repository.url === "string") {
    return repository.url.trim();
  }
  return "";
})();

console.log(`== release-check: ${pkg.name}@${pkg.version}`);

if (!repositoryUrl) fail("package.json repository.url is required for provenance publishing.");
if (pkg.name !== pkg.name.toLowerCase())
  fail(`Invalid npm package name: must be lowercase: ${pkg.name}`);

const dependencyPackages = listLocalDependencies(packageDir);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-interaction-release-check-"));
const createdTarballs = [];
function restorePublishManifest() {
  if (!manifestStatePaths.some(statePathExists)) {
    return true;
  }

  const result = spawnSync(process.execPath, [manifestLifecycleScriptPath, "restore"], {
    cwd: packageDir,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(
      `Could not restore package.json after publish modeling (exit ${result.status ?? "unknown"}).`,
    );
    return false;
  }
  return true;
}

function validateDeveloperManifestRestored(context) {
  if (fs.readFileSync(packageJsonPath, "utf8") !== originalPackageJsonText) {
    fail(`Developer package.json was not restored after ${context}.`);
  }
  if (manifestStatePaths.some(statePathExists)) {
    fail(`Manifest lifecycle state remains after ${context}.`);
  }
  console.log(`Developer package.json restoration OK after ${context}.`);
}

const cleanupPaths = () => {
  if (!restorePublishManifest()) {
    process.exitCode = 1;
  }
  if (keepArtifacts) {
    console.log(`Keeping release-check artifacts under ${tempDir}`);
    for (const tarballPath of createdTarballs) {
      console.log(`Keeping tarball ${tarballPath}`);
    }
    return;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  for (const tarballPath of createdTarballs) {
    fs.rmSync(tarballPath, { force: true });
  }
};

process.on("exit", cleanupPaths);
const exitAfterCleanup = (exitCode) => {
  cleanupPaths();
  process.exit(exitCode);
};
process.on("SIGINT", () => exitAfterCleanup(130));
process.on("SIGTERM", () => exitAfterCleanup(143));

const packDryRunResult = run("npm", ["pack", "--dry-run", "--json"]);
let packEntry;
try {
  packEntry = parseNpmPackJson(packDryRunResult.stdout);
} catch (error) {
  fail(
    `Could not parse npm pack --dry-run --json output: ${error instanceof Error ? error.message : String(error)}`,
  );
}
if (packEntry.name !== pkg.name || packEntry.version !== pkg.version) {
  fail(
    `npm pack identity mismatch: expected ${pkg.name}@${pkg.version}, got ${packEntry.name}@${packEntry.version}`,
  );
}
validatePackWhitelist([packEntry], pkg);

const npmVersion = run("npm", ["--version"]).stdout.trim();
if (!/^(11|12)\./.test(npmVersion)) {
  fail(`Release checks require npm 11 or 12; found ${npmVersion}.`);
}
const registry = pkg.publishConfig?.registry ?? "https://registry.npmjs.org/";
for (const dependencyPackage of dependencyPackages) {
  const spec = `${dependencyPackage.name}@${dependencyPackage.version}`;
  const result = run("npm", ["view", spec, "version", "--json", "--registry", registry], {
    allowFailure: true,
  });
  let availableVersion;
  try {
    availableVersion = JSON.parse(result.stdout || "null");
  } catch {
    availableVersion = undefined;
  }
  // npm >= 12 returns arrays from `npm view --json` even for exact specs.
  if (Array.isArray(availableVersion)) {
    availableVersion =
      availableVersion.length === 1 && typeof availableVersion[0] === "string"
        ? availableVersion[0]
        : undefined;
  }
  if (result.status !== 0 || availableVersion !== dependencyPackage.version) {
    fail(`${spec} must be available in ${registry} before publishing ${pkg.name}.`);
  }
  console.log(`Registry publish-order gate OK: ${spec} is available before ${pkg.name}.`);
}
if (dependencyPackages.length === 0)
  console.log("Registry publish-order gate OK: no local runtime dependencies.");

const modeledOwner = `release-check-${process.pid}-${Date.now()}`;
const modeledPublishEnv = {
  npm_command: "publish",
  npm_config_user_agent: `npm/${npmVersion} release-check`,
  PI_PUBLISH_MANIFEST_OWNER: modeledOwner,
  PI_PUBLISH_MANIFEST_OWNER_PID: String(process.pid),
};
run(process.execPath, [manifestLifecycleScriptPath, "prepack"], {
  env: { ...modeledPublishEnv, npm_lifecycle_event: "prepack" },
});
run(process.execPath, [manifestLifecycleScriptPath, "postpack"], {
  env: { ...modeledPublishEnv, npm_lifecycle_event: "postpack" },
});
const publishReadyManifest = loadManifest(packageDir);
validatePackedManifest(publishReadyManifest, pkg, pkg.name, "Publish-ready package.json");
run(process.execPath, [manifestLifecycleScriptPath, "restore"], {
  env: { ...modeledPublishEnv, npm_command: "run-script" },
});
validateDeveloperManifestRestored("modeled npm publish manifest reread");

const publishDryRunResult = run("npm", ["publish", "--dry-run"], { allowFailure: true });
if (!restorePublishManifest()) {
  fail("Could not restore package.json after npm publish --dry-run.");
}
validateDeveloperManifestRestored("npm publish --dry-run");
if (
  publishDryRunResult.status !== 0 &&
  !/You cannot publish over the previously published versions/i.test(
    `${publishDryRunResult.stdout ?? ""}\n${publishDryRunResult.stderr ?? ""}`,
  )
) {
  fail("npm publish --dry-run failed.");
}
if (publishDryRunResult.status !== 0) {
  console.log(`npm publish --dry-run hit already-published version (${pkg.version}); continuing.`);
}

const packPackage = (dir) => {
  const packResult = run("npm", ["pack", "--silent"], { cwd: dir });
  const tarballName = (packResult.stdout || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!tarballName) {
    fail(`Could not determine tarball name for ${dir}`);
  }

  const tarballPath = path.join(dir, tarballName);
  createdTarballs.push(tarballPath);
  return tarballPath;
};

const dependencyTarballs = dependencyPackages.map((dependencyPackage) => ({
  ...dependencyPackage,
  tarballPath: packPackage(dependencyPackage.dir),
}));

const packageTarballPath = packPackage(packageDir);
const packedManifest = readPackedManifest(packageTarballPath);
validatePackedManifest(
  packedManifest,
  pkg,
  pkg.name,
  `Packed package.json (${packageTarballPath})`,
);

run("npm", ["init", "-y"], { cwd: tempDir });

if (dependencyTarballs.length > 0) {
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...dependencyTarballs.map((dependencyPackage) => dependencyPackage.tarballPath),
    ],
    { cwd: tempDir },
  );
}

run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", packageTarballPath], {
  cwd: tempDir,
});
console.log(`Coordinated local artifact-set install OK for ${pkg.name}.`);

if (pkg.main || pkg.exports) {
  run(
    "node",
    [
      "--input-type=module",
      "-e",
      `import(${JSON.stringify(pkg.name)}).then(() => console.log(${JSON.stringify(`Import smoke OK for ${pkg.name}`)})).catch((error) => { console.error(error?.stack || error?.message || error); process.exit(1); });`,
    ],
    { cwd: tempDir },
  );
} else {
  console.log(`Import smoke skipped for ${pkg.name}: package.json has no main or exports entry.`);
}

console.log("release-check done");
