#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = path.join(ROOT, "packages");
const CONFIG_PATH = path.join(ROOT, ".release-please-config.json");
const MANIFEST_PATH = path.join(ROOT, ".release-please-manifest.json");
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const TAG_RE = /^(?<component>.+)-v(?<version>\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const PRERELEASE_RE = /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeRelative(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function walkPackageJsonFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPackageJsonFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") {
      files.push(fullPath);
    }
  }
  return files;
}

function loadManagedComponents() {
  const packageJsonFiles = walkPackageJsonFiles(PACKAGES_ROOT).sort();
  const components = [];

  for (const packageJsonPath of packageJsonFiles) {
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const templateMeta = manifest["x-pi-template"];
    if (!templateMeta || typeof templateMeta !== "object") continue;
    if (templateMeta.releaseConfigMode !== "component") continue;
    if (typeof templateMeta.releaseComponent !== "string" || !templateMeta.releaseComponent.trim()) {
      continue;
    }
    if (manifest.private === true) continue;

    const packagePath = normalizeRelative(path.relative(ROOT, path.dirname(packageJsonPath)));
    const packageName = String(manifest.name ?? "").trim();
    const version = String(manifest.version ?? "").trim();
    const component = String(templateMeta.releaseComponent).trim();
    const repositoryDirectory = normalizeRelative(String(manifest.repository?.directory ?? "").trim());

    if (!packageName) fail(`Missing package name for ${packagePath}`);
    if (!VERSION_RE.test(version)) fail(`Invalid package version for ${packagePath}: ${version}`);
    if (!repositoryDirectory) {
      fail(`Missing repository.directory for ${packagePath}`);
    }
    if (repositoryDirectory !== packagePath) {
      fail(
        `repository.directory mismatch for ${packagePath}: expected ${packagePath}, got ${repositoryDirectory}`,
      );
    }

    components.push({
      component,
      packagePath,
      packageName,
      version,
      changelogPath: `${packagePath}/CHANGELOG.md`,
    });
  }

  components.sort((a, b) => a.packagePath.localeCompare(b.packagePath) || a.component.localeCompare(b.component));

  const seenComponents = new Set();
  for (const component of components) {
    if (seenComponents.has(component.component)) {
      fail(`Duplicate release component detected: ${component.component}`);
    }
    seenComponents.add(component.component);
  }

  return components;
}

function buildReleasePleaseConfig(components) {
  return {
    $schema: "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "release-type": "node",
    "include-v-in-tag": true,
    "include-component-in-tag": true,
    "separate-pull-requests": true,
    packages: Object.fromEntries(
      components.map((component) => [
        component.packagePath,
        {
          "release-type": "node",
          component: component.component,
        },
      ]),
    ),
  };
}

function buildReleasePleaseManifest(components) {
  return Object.fromEntries(components.map((component) => [component.packagePath, component.version]));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deriveNpmDistTag(version) {
  const match = String(version).match(PRERELEASE_RE);
  if (!match) {
    return "latest";
  }

  const candidate = String(match[1] || "next").toLowerCase();
  return /^[a-z][a-z0-9-]*$/.test(candidate) ? candidate : "next";
}

function validateCommittedFiles(components) {
  const expectedConfig = buildReleasePleaseConfig(components);
  const expectedManifest = buildReleasePleaseManifest(components);
  const actualConfig = readJsonIfPresent(CONFIG_PATH);
  const actualManifest = readJsonIfPresent(MANIFEST_PATH);

  if (!actualConfig) fail(`Missing ${path.basename(CONFIG_PATH)}`);
  if (!actualManifest) fail(`Missing ${path.basename(MANIFEST_PATH)}`);

  if (stableJson(actualConfig) !== stableJson(expectedConfig)) {
    fail(
      `${path.basename(CONFIG_PATH)} is out of sync with package metadata. Run: node ./scripts/release-components.mjs sync`,
    );
  }
  if (stableJson(actualManifest) !== stableJson(expectedManifest)) {
    fail(
      `${path.basename(MANIFEST_PATH)} is out of sync with package versions. Run: node ./scripts/release-components.mjs sync`,
    );
  }
}

function resolveTag(tag, components) {
  const match = String(tag).match(TAG_RE);
  if (!match?.groups) {
    fail(`Unsupported release tag format: ${tag}. Expected <component>-vX.Y.Z`);
  }

  const component = components.find((entry) => entry.component === match.groups.component);
  if (!component) {
    fail(`Unknown release component in tag ${tag}: ${match.groups.component}`);
  }

  return {
    ...component,
    tag,
    tagVersion: match.groups.version,
    npmDistTag: deriveNpmDistTag(match.groups.version),
  };
}

function print(value, json) {
  if (json) {
    process.stdout.write(stableJson(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      process.stdout.write(`${item.component}\t${item.packagePath}\t${item.packageName}\t${item.version}\n`);
    }
    return;
  }
  process.stdout.write(`${stableJson(value)}`);
}

function printEnv(value) {
  const pairs = {
    RELEASE_COMPONENT: value.component,
    RELEASE_PACKAGE_PATH: value.packagePath,
    RELEASE_PACKAGE_NAME: value.packageName,
    RELEASE_PACKAGE_VERSION: value.version,
    RELEASE_CHANGELOG_PATH: value.changelogPath,
    RELEASE_TAG: value.tag,
    RELEASE_TAG_VERSION: value.tagVersion,
    RELEASE_NPM_DIST_TAG: value.npmDistTag,
  };

  for (const [key, entryValue] of Object.entries(pairs)) {
    process.stdout.write(`${key}=${String(entryValue ?? "")}\n`);
  }
}

const args = process.argv.slice(2);
const command = args[0] ?? "list";
const json = args.includes("--json");
const envMode = args.includes("--env");
const components = loadManagedComponents();

switch (command) {
  case "list":
    print(components, json);
    break;
  case "matrix":
    print(
      {
        include: components.map((component) => ({
          component: component.component,
          package_path: component.packagePath,
          package_name: component.packageName,
        })),
      },
      true,
    );
    break;
  case "config":
    print(buildReleasePleaseConfig(components), true);
    break;
  case "manifest":
    print(buildReleasePleaseManifest(components), true);
    break;
  case "sync":
    fs.writeFileSync(CONFIG_PATH, stableJson(buildReleasePleaseConfig(components)), "utf8");
    fs.writeFileSync(MANIFEST_PATH, stableJson(buildReleasePleaseManifest(components)), "utf8");
    process.stdout.write(`Wrote ${path.basename(CONFIG_PATH)} and ${path.basename(MANIFEST_PATH)}\n`);
    break;
  case "validate":
    validateCommittedFiles(components);
    process.stdout.write("release-please component config OK\n");
    break;
  case "resolve-tag": {
    const tag = args.find((arg, index) => index > 0 && !arg.startsWith("--"));
    if (!tag) {
      fail(
        "Usage: node ./scripts/release-components.mjs resolve-tag <component-vX.Y.Z> [--json|--env]",
      );
    }
    const resolved = resolveTag(tag, components);
    if (envMode) {
      printEnv(resolved);
      break;
    }
    print(resolved, true);
    break;
  }
  default:
    fail(`Unknown command: ${command}`);
}
