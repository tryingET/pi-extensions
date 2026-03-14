#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const runtimeDependencyFields = ["dependencies", "optionalDependencies"];
const keepArtifacts = process.env.KEEP_RELEASE_ARTIFACTS === "1";

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, "package.json");

if (!fs.existsSync(packageJsonPath)) {
  console.error(`Missing package.json in ${packageDir}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const normalize = (value) => String(value).replace(/^\.\//, "").replace(/\\/g, "/");

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
    if (/[*?\[]/.test(entry)) {
      const prefix = normalize(entry.split(/[*?\[]/, 1)[0]);
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

  const actual = packJson[0].files.map((file) => normalize(String(file.path ?? ""))).filter(Boolean).sort();
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

function validatePackedManifest(packedManifest, originalManifest, packageName, tarballPath) {
  for (const field of dependencyFields) {
    const deps = packedManifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec.startsWith("file:")) {
        fail(`Packed manifest still contains file dependency ${field}.${dependencyName}=${spec} in ${tarballPath}`);
      }
    }
  }

  const directLocalDependencyVersions = collectDirectLocalDependencyVersions(originalManifest, packageDir);
  for (const dependency of directLocalDependencyVersions) {
    const packedValue = packedManifest?.[dependency.field]?.[dependency.dependencyName];
    if (packedValue !== dependency.expectedVersion) {
      fail(
        `${packageName} packed manifest expected ${dependency.field}.${dependency.dependencyName}=${dependency.expectedVersion}, got ${packedValue ?? "<missing>"}`,
      );
    }
  }

  console.log("Packed manifest dependency rewrite OK.");
}

if (typeof pkg.name !== "string" || pkg.name.length === 0) {
  fail("package.json name is required.");
}
if (typeof pkg.version !== "string" || pkg.version.length === 0) {
  fail("package.json version is required.");
}

const repositoryUrl = (() => {
  const repository = pkg.repository;
  if (typeof repository === "string") return repository.trim();
  if (repository && typeof repository === "object" && typeof repository.url === "string") {
    return repository.url.trim();
  }
  return "";
})();

console.log(`== release-check: ${pkg.name}@${pkg.version}`);

if (!repositoryUrl) {
  fail("package.json repository.url is required for provenance release publishing.");
}
if (pkg.name !== pkg.name.toLowerCase()) {
  fail(`Invalid npm package name: must be lowercase: ${pkg.name}`);
}

const dependencyPackages = listLocalDependencies(packageDir);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-interaction-release-check-"));
const createdTarballs = [];

const cleanupPaths = () => {
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
process.on("SIGINT", () => {
  cleanupPaths();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanupPaths();
  process.exit(143);
});

const packDryRunResult = run("npm", ["pack", "--dry-run", "--json"]);
const packJson = JSON.parse(packDryRunResult.stdout || "[]");
validatePackWhitelist(packJson, pkg);

const publishDryRunResult = run("npm", ["publish", "--dry-run"], { allowFailure: true });
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
validatePackedManifest(packedManifest, pkg, pkg.name, packageTarballPath);

run("npm", ["init", "-y"], { cwd: tempDir });

if (dependencyTarballs.length > 0) {
  run(
    "npm",
    ["install", ...dependencyTarballs.map((dependencyPackage) => dependencyPackage.tarballPath)],
    { cwd: tempDir },
  );
}

run("npm", ["install", packageTarballPath], { cwd: tempDir });
run(
  "node",
  [
    "--input-type=module",
    "-e",
    `import(${JSON.stringify(pkg.name)}).then(() => console.log(${JSON.stringify(`Import smoke OK for ${pkg.name}`)})).catch((error) => { console.error(error?.stack || error?.message || error); process.exit(1); });`,
  ],
  { cwd: tempDir },
);

console.log("release-check done");
