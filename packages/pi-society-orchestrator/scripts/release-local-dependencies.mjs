#!/usr/bin/env node
// Keep this helper mirrored with packages/pi-vault-client/scripts/release-local-dependencies.mjs
// until task scope allows a shared monorepo release-proof helper.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtimeDependencyFields = ["dependencies", "optionalDependencies"];
const args = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${flag} requires a value`);
  }
  return value;
}

const packDir = getFlagValue("--pack-dir");
const output = getFlagValue("--output") ?? "json";

function loadManifest(dir) {
  const manifestPath = path.join(dir, "package.json");
  if (!fs.existsSync(manifestPath)) {
    fail(`Missing package.json in ${dir}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function collectLocalDependencies(dir, seen = new Set(), collected = []) {
  const manifest = loadManifest(dir);

  for (const field of runtimeDependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(dependencies)) {
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

      collectLocalDependencies(dependencyDir, seen, collected);

      if (seen.has(dependencyDir)) {
        continue;
      }

      seen.add(dependencyDir);
      collected.push({
        name: dependencyManifest.name,
        version: dependencyManifest.version,
        dir: dependencyDir,
      });
    }
  }

  return collected;
}

function packDependency(dependency) {
  const result = spawnSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
    cwd: dependency.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    fail(
      `npm pack failed for ${dependency.name} (${dependency.dir}) with exit code ${result.status ?? "unknown"}`,
    );
  }

  const tarballName = `${result.stdout ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!tarballName) {
    fail(`Could not determine tarball name for ${dependency.name} (${dependency.dir})`);
  }

  return path.join(packDir, tarballName);
}

const packageDir = process.cwd();
const packageManifest = loadManifest(packageDir);
const localDependencies = collectLocalDependencies(packageDir);

if (packDir) {
  fs.mkdirSync(packDir, { recursive: true });
  for (const dependency of localDependencies) {
    dependency.tarballPath = packDependency(dependency);
  }
}

switch (output) {
  case "json": {
    process.stdout.write(
      `${JSON.stringify(
        {
          package: {
            name: packageManifest.name,
            version: packageManifest.version,
            dir: packageDir,
          },
          localDependencies,
        },
        null,
        2,
      )}\n`,
    );
    break;
  }
  case "dirs": {
    for (const dependency of localDependencies) {
      process.stdout.write(`${dependency.dir}\n`);
    }
    break;
  }
  case "tarballs": {
    if (!packDir) {
      fail("--output tarballs requires --pack-dir");
    }
    for (const dependency of localDependencies) {
      process.stdout.write(`${dependency.tarballPath}\n`);
    }
    break;
  }
  default:
    fail(`Unsupported --output value: ${output}`);
}
