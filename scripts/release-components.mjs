#!/usr/bin/env node
/**
summary: "Lists, validates, syncs, and resolves release components from package metadata and component-scoped tags."
read_when:
  - "Changing release component eligibility, release-please projection, tag parsing, or npm dist-tag selection."
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleasePlan, loadReleaseGraph, validateUniqueIdentities } from "./release-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
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
    let initialVersion;
    if (templateMeta.releaseInitialVersion !== undefined) {
      if (typeof templateMeta.releaseInitialVersion !== "string") {
        fail(`Invalid releaseInitialVersion for ${packagePath}: expected a string`);
      }
      initialVersion = templateMeta.releaseInitialVersion.trim();
      if (!VERSION_RE.test(initialVersion)) {
        fail(`Invalid releaseInitialVersion for ${packagePath}: ${initialVersion}`);
      }
    }
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
      initialVersion,
      changelogPath: `${packagePath}/CHANGELOG.md`,
    });
  }

  components.sort((a, b) => a.packagePath.localeCompare(b.packagePath) || a.component.localeCompare(b.component));

  validateUniqueIdentities(components);
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
      components.map((component) => {
        const packageConfig = {
          "release-type": "node",
          component: component.component,
        };
        if (component.initialVersion) {
          packageConfig["initial-version"] = component.initialVersion;
        }
        return [component.packagePath, packageConfig];
      }),
    ),
  };
}

function buildReleasePleaseManifest(components, currentManifest = {}) {
  const current =
    currentManifest && typeof currentManifest === "object" && !Array.isArray(currentManifest)
      ? currentManifest
      : {};
  return Object.fromEntries(
    components.map((component) => {
      const currentVersion = current[component.packagePath];
      if (component.initialVersion) {
        if (component.version !== component.initialVersion) {
          throw new Error(
            `Initial release version mismatch for ${component.packagePath}: package=${component.version}, initial=${component.initialVersion}`,
          );
        }
        if (!Object.hasOwn(current, component.packagePath)) {
          throw new Error(
            `Missing bootstrap manifest sentinel for ${component.packagePath}; add 0.0.0 explicitly.`,
          );
        }
        if (currentVersion !== "0.0.0") {
          throw new Error(
            `Bootstrap metadata for ${component.packagePath} must be removed before its manifest advances from 0.0.0.`,
          );
        }
        return [component.packagePath, "0.0.0"];
      }
      return [component.packagePath, component.version];
    }),
  );
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
  const actualConfig = readJsonIfPresent(CONFIG_PATH);
  const actualManifest = readJsonIfPresent(MANIFEST_PATH);

  if (!actualConfig) fail(`Missing ${path.basename(CONFIG_PATH)}`);
  if (!actualManifest) fail(`Missing ${path.basename(MANIFEST_PATH)}`);

  const expectedManifest = buildReleasePleaseManifest(components, actualManifest);

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

function printReleasePlan(plan, json) {
  if (json) return print(plan, true);
  process.stdout.write(`portfolio release plan: ${plan.status}\n`);
  process.stdout.write(`source: ${plan.source.commit}\n`);
  process.stdout.write(`base: ${plan.source.baseCommit ?? "(explicit selection)"}\n`);
  process.stdout.write(`dirty paths: ${plan.source.dirtyPaths.join(", ") || "(none)"}\n`);
  process.stdout.write(`changed: ${plan.changedComponents.join(", ") || "(none)"}\n`);
  process.stdout.write(`propagation: ${plan.propagationRequiredComponents.join(", ") || "(none)"}\n`);
  process.stdout.write(`unowned paths: ${plan.unownedChangedPaths.join(", ") || "(none)"}\n`);
  process.stdout.write(`dependency-first order: ${plan.releaseOrder.join(" -> ") || "(none)"}\n`);
  for (const component of plan.components.filter((entry) => entry.selection)) {
    const reasons = component.reasons.map((reason) => reason.path ?? reason.chain?.join(" -> ") ?? reason.kind);
    process.stdout.write(
      `${component.selection.toUpperCase()} ${component.component}: intended=${component.intendedVersion} current=${component.currentVersion ?? "(none)"} registry=${component.registry.state} owner=${component.ownership.state}\n`,
    );
    process.stdout.write(`  reasons: ${reasons.join(", ") || "(none)"}\n`);
  }
  for (const blocker of plan.blockers) {
    process.stdout.write(`BLOCKED ${blocker.component ?? blocker.scope}: ${blocker.reasons.join(", ")}\n`);
  }
  for (const blocker of plan.externalBlockers) {
    process.stdout.write(
      `EXTERNAL ${blocker.component} ${blocker.kind}: ${blocker.state}; owner=${blocker.owner}; reopen=${blocker.reopenTrigger}\n`,
    );
  }
}

function parsePlanOptions(args) {
  const options = { base: null, changed: [], all: false, registry: false, requireReady: false };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (["--json", "--registry", "--require-ready", "--all"].includes(argument)) {
      if (argument === "--registry") options.registry = true;
      if (argument === "--require-ready") options.requireReady = true;
      if (argument === "--all") options.all = true;
      continue;
    }
    if (["--base", "--changed"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      if (argument === "--base") {
        if (options.base) throw new Error("--base may be specified only once");
        options.base = value;
      } else options.changed.push(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown plan option: ${argument}`);
  }
  const selectionModes = Number(Boolean(options.base)) + Number(options.changed.length > 0) + Number(options.all);
  if (selectionModes !== 1) {
    throw new Error("Choose exactly one plan selection mode: --base, --changed, or --all");
  }
  return options;
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

function main() {
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
      print(buildReleasePleaseManifest(components, readJsonIfPresent(MANIFEST_PATH)), true);
      break;
    case "sync": {
      const nextConfig = stableJson(buildReleasePleaseConfig(components));
      const nextManifest = stableJson(
        buildReleasePleaseManifest(components, readJsonIfPresent(MANIFEST_PATH)),
      );
      fs.writeFileSync(CONFIG_PATH, nextConfig, "utf8");
      fs.writeFileSync(MANIFEST_PATH, nextManifest, "utf8");
      process.stdout.write(`Wrote ${path.basename(CONFIG_PATH)} and ${path.basename(MANIFEST_PATH)}\n`);
      break;
    }
    case "validate":
      validateCommittedFiles(components);
      loadReleaseGraph(components);
      process.stdout.write("release component identities, runtime graph, and release-please config OK\n");
      break;
    case "plan": {
      const options = parsePlanOptions(args);
      const plan = buildReleasePlan(components, options);
      printReleasePlan(plan, json);
      if (options.requireReady && plan.status !== "ready") process.exitCode = 2;
      break;
    }
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

export {
  buildReleasePlan,
  buildReleasePleaseConfig,
  buildReleasePleaseManifest,
};
