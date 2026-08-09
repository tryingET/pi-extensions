// ---
// summary: "Loads, validates, and selects manifest-defined Pi host compatibility profiles and scenarios."
// read_when:
//   - "Changing canary manifest validation, profile resolution, or scenario package targeting."
// ---
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { identityOf } from "./integrity.mjs";
import { resolveContainedRepoPath } from "./paths.mjs";

function ensureString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${fieldName} must be a non-empty string`);
  return value.trim();
}

function ensureOptionalString(value, fieldName) {
  return value === undefined || value === null ? undefined : ensureString(value, fieldName);
}

function ensureStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${fieldName} must be a non-empty string array`);
  return value.map((entry, index) => ensureString(entry, `${fieldName}[${index}]`));
}

function ensureOptionalStringArray(value, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be a string array`);
  return value.map((entry, index) => ensureString(entry, `${fieldName}[${index}]`));
}

function ensureNpmPackageName(value, fieldName) {
  const name = ensureString(value, fieldName);
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new Error(`${fieldName} must be a canonical npm package name`);
  }
  return name;
}

function ensureExactNpmVersion(value, fieldName) {
  const version = ensureString(value, fieldName);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${fieldName} must be an exact npm semantic version`);
  }
  return version;
}

export function loadManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function validateProfileHost(profileHost, profileFieldName) {
  if (!profileHost || typeof profileHost !== "object" || Array.isArray(profileHost)) {
    throw new Error(`${profileFieldName}.host must be an object`);
  }
  const names = ["version", "versionFromEnv", "reviewAnchor", "reviewAnchorFromEnv"];
  const result = Object.fromEntries(names.map((name) => [
    name, ensureOptionalString(profileHost[name], `${profileFieldName}.host.${name}`),
  ]));
  if (!result.version && !result.versionFromEnv) {
    throw new Error(`${profileFieldName}.host must define version or versionFromEnv`);
  }
  if (!result.reviewAnchor && !result.reviewAnchorFromEnv) {
    throw new Error(`${profileFieldName}.host must define reviewAnchor or reviewAnchorFromEnv`);
  }
  if (result.version) result.version = ensureExactNpmVersion(result.version, `${profileFieldName}.host.version`);
  return result;
}

export function validateManifest(manifest, manifestPath) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Manifest at ${manifestPath} must be a JSON object`);
  }

  const schemaVersion = manifest.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error("schemaVersion must be exactly 1");
  }

  const hostPackage = ensureNpmPackageName(manifest.hostPackage, "hostPackage");
  const hostCompanionPackages = ensureOptionalStringArray(
    manifest.hostCompanionPackages,
    "hostCompanionPackages",
  ).map((entry, index) => ensureNpmPackageName(entry, `hostCompanionPackages[${index}]`));
  const trackedChangelog = ensureString(manifest.trackedChangelog, "trackedChangelog");
  const defaultProfile = ensureString(manifest.defaultProfile, "defaultProfile");

  if (!manifest.profiles || typeof manifest.profiles !== "object" || Array.isArray(manifest.profiles)) {
    throw new Error("profiles must be an object keyed by profile name");
  }

  const profiles = {};
  for (const [profileName, profileValue] of Object.entries(manifest.profiles)) {
    const normalizedName = ensureString(profileName, "profile name");
    if (!profileValue || typeof profileValue !== "object" || Array.isArray(profileValue)) {
      throw new Error(`profiles.${normalizedName} must be an object`);
    }
    profiles[normalizedName] = {
      name: normalizedName,
      description: ensureString(profileValue.description, `profiles.${normalizedName}.description`),
      host: validateProfileHost(profileValue.host, `profiles.${normalizedName}`),
    };
  }

  if (!profiles[defaultProfile]) throw new Error(`defaultProfile '${defaultProfile}' is not defined in profiles`);
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error("scenarios must be a non-empty array");
  }

  const seenIds = new Set();
  const scenarios = manifest.scenarios.map((scenario, index) => {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      throw new Error(`scenarios[${index}] must be an object`);
    }
    const id = ensureString(scenario.id, `scenarios[${index}].id`);
    if (seenIds.has(id)) throw new Error(`Duplicate scenario id: ${id}`);
    seenIds.add(id);

    const scenarioProfiles = ensureStringArray(scenario.profiles, `scenarios[${index}].profiles`);
    for (const profileName of scenarioProfiles) {
      if (!profiles[profileName]) throw new Error(`Scenario '${id}' references unknown profile '${profileName}'`);
    }

    const cwd = ensureString(scenario.cwd, `scenarios[${index}].cwd`);
    const cwdAbs = resolveContainedRepoPath(cwd, `scenarios[${index}].cwd`);
    const cwdStats = statSync(cwdAbs, { bigint: true });
    if (!cwdStats.isDirectory()) throw new Error(`scenarios[${index}].cwd must be a directory`);
    const command = ensureStringArray(scenario.command, `scenarios[${index}].command`);

    return {
      id,
      title: ensureString(scenario.title, `scenarios[${index}].title`),
      owner: ensureString(scenario.owner, `scenarios[${index}].owner`),
      why: ensureString(scenario.why, `scenarios[${index}].why`),
      profiles: scenarioProfiles,
      packages: ensureStringArray(scenario.packages, `scenarios[${index}].packages`),
      upstreamSurfaces: ensureStringArray(scenario.upstreamSurfaces, `scenarios[${index}].upstreamSurfaces`),
      cwd,
      cwdAbs,
      cwdIdentity: identityOf(cwdStats),
      command,
      notes: scenario.notes === undefined ? undefined : ensureString(scenario.notes, `scenarios[${index}].notes`),
    };
  });

  return {
    schemaVersion, hostPackage, hostCompanionPackages, trackedChangelog, defaultProfile,
    profiles, scenarios, manifestPath,
  };
}

function resolveDeclaredPackageTarget(packagePath) {
  const packageAbs = resolveContainedRepoPath(packagePath, "Scenario package target");
  if (!existsSync(path.join(packageAbs, "package.json"))) {
    throw new Error(`Scenario package target is not a package root: ${packagePath}`);
  }

  return {
    declaredPath: packagePath,
    packagePath,
    packageAbs,
    mode: "package",
  };
}

export function resolveScenarioPackageTargets(scenario) {
  const resolved = [];
  const seen = new Set();

  for (const declaredPath of scenario.packages) {
    const target = resolveDeclaredPackageTarget(declaredPath);
    if (seen.has(target.packageAbs)) continue;
    seen.add(target.packageAbs);
    resolved.push(target);
  }

  return resolved;
}

export function selectScenarios(manifest, options) {
  const profile = options.profile ?? manifest.defaultProfile;
  if (!manifest.profiles[profile]) throw new Error(`Unknown profile '${profile}'`);
  const available = manifest.scenarios.filter((scenario) => scenario.profiles.includes(profile));
  const scenarios = (options.scenarioIds ?? []).map((id) => {
    const scenario = available.find((entry) => entry.id === id);
    if (!scenario) throw new Error(`Scenario '${id}' is not available for profile '${profile}'`);
    return scenario;
  });
  return { profile, scenarios: scenarios.length > 0 ? scenarios : available };
}

export function resolveProfileHost(manifest, profileName) {
  const profile = manifest.profiles[profileName];
  if (!profile) throw new Error(`Unknown profile '${profileName}'`);
  const resolve = (name) => {
    const envName = profile.host[`${name}FromEnv`];
    return profile.host[name] ?? ensureString(
      process.env[envName], `env:${envName} (required for profile '${profileName}')`,
    );
  };
  const source = (name) => profile.host[name]
    ? `profile:${profileName}`
    : `env:${profile.host[`${name}FromEnv`]}`;
  return {
    packageName: manifest.hostPackage,
    companionPackages: manifest.hostCompanionPackages,
    version: ensureExactNpmVersion(resolve("version"), `profiles.${profileName}.host.version`),
    reviewAnchor: resolve("reviewAnchor"),
    versionSource: source("version"),
    reviewAnchorSource: source("reviewAnchor"),
    trackedChangelog: manifest.trackedChangelog,
  };
}
