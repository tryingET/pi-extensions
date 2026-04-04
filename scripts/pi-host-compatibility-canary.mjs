#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MANIFEST_PATH = path.join(ROOT, "policy", "pi-host-compatibility-canary.json");

function usage() {
  console.error(`Usage:
  node ./scripts/pi-host-compatibility-canary.mjs validate [--manifest <path>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs resolve-host [--manifest <path>] [--profile <name>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs list [--manifest <path>] [--profile <name>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs run [--manifest <path>] [--profile <name>] [--scenario <id>] [--fail-fast] [--dry-run] [--json]`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    manifestPath: DEFAULT_MANIFEST_PATH,
    profile: undefined,
    scenarioIds: [],
    failFast: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case "--manifest": {
        const value = rest[index + 1];
        if (!value) throw new Error("--manifest requires a value");
        options.manifestPath = path.resolve(ROOT, value);
        index += 1;
        break;
      }
      case "--profile": {
        const value = rest[index + 1];
        if (!value) throw new Error("--profile requires a value");
        options.profile = value;
        index += 1;
        break;
      }
      case "--scenario": {
        const value = rest[index + 1];
        if (!value) throw new Error("--scenario requires a value");
        options.scenarioIds.push(value);
        index += 1;
        break;
      }
      case "--fail-fast":
        options.failFast = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function ensureOptionalString(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  return ensureString(value, fieldName);
}

function ensureStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string array`);
  }

  return value.map((entry, index) => ensureString(entry, `${fieldName}[${index}]`));
}

function ensureOptionalStringArray(value, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a string array`);
  }
  return value.map((entry, index) => ensureString(entry, `${fieldName}[${index}]`));
}

function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function validateProfileHost(profileHost, profileFieldName) {
  if (!profileHost || typeof profileHost !== "object" || Array.isArray(profileHost)) {
    throw new Error(`${profileFieldName}.host must be an object`);
  }

  const version = ensureOptionalString(profileHost.version, `${profileFieldName}.host.version`);
  const versionFromEnv = ensureOptionalString(
    profileHost.versionFromEnv,
    `${profileFieldName}.host.versionFromEnv`,
  );
  const reviewAnchor = ensureOptionalString(
    profileHost.reviewAnchor,
    `${profileFieldName}.host.reviewAnchor`,
  );
  const reviewAnchorFromEnv = ensureOptionalString(
    profileHost.reviewAnchorFromEnv,
    `${profileFieldName}.host.reviewAnchorFromEnv`,
  );

  if (!version && !versionFromEnv) {
    throw new Error(`${profileFieldName}.host must define version or versionFromEnv`);
  }

  if (!reviewAnchor && !reviewAnchorFromEnv) {
    throw new Error(`${profileFieldName}.host must define reviewAnchor or reviewAnchorFromEnv`);
  }

  return {
    version,
    versionFromEnv,
    reviewAnchor,
    reviewAnchorFromEnv,
  };
}

function validateManifest(manifest, manifestPath) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Manifest at ${manifestPath} must be a JSON object`);
  }

  const schemaVersion = Number(manifest.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    throw new Error("schemaVersion must be a positive number");
  }

  const hostPackage = ensureString(manifest.hostPackage, "hostPackage");
  const hostCompanionPackages = ensureOptionalStringArray(
    manifest.hostCompanionPackages,
    "hostCompanionPackages",
  );
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

  if (!profiles[defaultProfile]) {
    throw new Error(`defaultProfile '${defaultProfile}' is not defined in profiles`);
  }

  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error("scenarios must be a non-empty array");
  }

  const seenIds = new Set();
  const scenarios = manifest.scenarios.map((scenario, index) => {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      throw new Error(`scenarios[${index}] must be an object`);
    }

    const id = ensureString(scenario.id, `scenarios[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`Duplicate scenario id: ${id}`);
    }
    seenIds.add(id);

    const scenarioProfiles = ensureStringArray(scenario.profiles, `scenarios[${index}].profiles`);
    for (const profileName of scenarioProfiles) {
      if (!profiles[profileName]) {
        throw new Error(`Scenario '${id}' references unknown profile '${profileName}'`);
      }
    }

    const cwd = ensureString(scenario.cwd, `scenarios[${index}].cwd`);
    const command = ensureStringArray(scenario.command, `scenarios[${index}].command`);

    return {
      id,
      title: ensureString(scenario.title, `scenarios[${index}].title`),
      owner: ensureString(scenario.owner, `scenarios[${index}].owner`),
      why: ensureString(scenario.why, `scenarios[${index}].why`),
      profiles: scenarioProfiles,
      packages: ensureStringArray(scenario.packages, `scenarios[${index}].packages`),
      upstreamSurfaces: ensureStringArray(
        scenario.upstreamSurfaces,
        `scenarios[${index}].upstreamSurfaces`,
      ),
      cwd,
      cwdAbs: path.resolve(ROOT, cwd),
      command,
      notes:
        scenario.notes === undefined
          ? undefined
          : ensureString(scenario.notes, `scenarios[${index}].notes`),
    };
  });

  return {
    schemaVersion,
    hostPackage,
    hostCompanionPackages,
    trackedChangelog,
    defaultProfile,
    profiles,
    scenarios,
    manifestPath,
  };
}

function hasPackageJson(dirPath) {
  return existsSync(path.join(dirPath, "package.json"));
}

function resolveDeclaredPackageTarget(packagePath) {
  const packageAbs = path.resolve(ROOT, packagePath);
  if (!hasPackageJson(packageAbs)) {
    throw new Error(`Scenario package target is not a package root: ${packagePath}`);
  }

  return {
    declaredPath: packagePath,
    packagePath,
    packageAbs,
    mode: "package",
  };
}

function resolveScenarioPackageTargets(scenario) {
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

function selectScenarios(manifest, options) {
  const profile = options.profile ?? manifest.defaultProfile;
  if (!manifest.profiles[profile]) {
    throw new Error(`Unknown profile '${profile}'`);
  }

  const scenarioFilter = options.scenarioIds ?? [];
  const selected = manifest.scenarios.filter((scenario) => scenario.profiles.includes(profile));

  if (scenarioFilter.length === 0) {
    return { profile, scenarios: selected };
  }

  const selectedById = [];
  for (const id of scenarioFilter) {
    const scenario = selected.find((entry) => entry.id === id);
    if (!scenario) {
      throw new Error(`Scenario '${id}' is not available for profile '${profile}'`);
    }
    selectedById.push(scenario);
  }

  return { profile, scenarios: selectedById };
}

function resolveProfileHost(manifest, profileName) {
  const profile = manifest.profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown profile '${profileName}'`);
  }

  const version = profile.host.version
    ? profile.host.version
    : ensureString(
        process.env[profile.host.versionFromEnv],
        `env:${profile.host.versionFromEnv} (required for profile '${profileName}')`,
      );
  const reviewAnchor = profile.host.reviewAnchor
    ? profile.host.reviewAnchor
    : ensureString(
        process.env[profile.host.reviewAnchorFromEnv],
        `env:${profile.host.reviewAnchorFromEnv} (required for profile '${profileName}')`,
      );

  return {
    packageName: manifest.hostPackage,
    companionPackages: manifest.hostCompanionPackages,
    version,
    reviewAnchor,
    versionSource: profile.host.version ? `profile:${profileName}` : `env:${profile.host.versionFromEnv}`,
    reviewAnchorSource: profile.host.reviewAnchor
      ? `profile:${profileName}`
      : `env:${profile.host.reviewAnchorFromEnv}`,
    trackedChangelog: manifest.trackedChangelog,
  };
}

function commandToString(command) {
  return command.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ");
}

function hostInstallSpecifiers(host) {
  return [host.packageName, ...host.companionPackages].map(
    (packageName) => `${packageName}@${host.version}`,
  );
}

function readInstalledPackageVersion(cwd, packageName) {
  const packageJsonPath = path.join(cwd, "node_modules", ...packageName.split("/"), "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return typeof pkg.version === "string" ? pkg.version.trim() : null;
}

function readLockedPackageVersion(cwd, packageName) {
  const packageLockPath = path.join(cwd, "package-lock.json");
  if (!existsSync(packageLockPath)) {
    return null;
  }

  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  const packageKey = `node_modules/${packageName}`;
  const lockedVersion = packageLock?.packages?.[packageKey]?.version;
  return typeof lockedVersion === "string" && lockedVersion.trim().length > 0
    ? lockedVersion.trim()
    : null;
}

function describeHostAlignment(host, cwd) {
  const packageStates = [host.packageName, ...host.companionPackages].map((packageName) => {
    const installedVersion = readInstalledPackageVersion(cwd, packageName);
    return {
      packageName,
      expectedVersion: host.version,
      installedVersion,
      aligned: installedVersion === host.version,
    };
  });

  return {
    cwd: path.relative(ROOT, cwd) || ".",
    packages: packageStates,
    aligned: packageStates.every((entry) => entry.aligned),
  };
}

function describeScenarioAlignment(host, scenario) {
  const packageTargets = resolveScenarioPackageTargets(scenario);
  const packages = packageTargets.map((target) => ({
    ...target,
    alignment: describeHostAlignment(host, target.packageAbs),
  }));

  return {
    packages,
    aligned: packages.every((entry) => entry.alignment.aligned),
  };
}

function summarizeAlignment(alignment) {
  return alignment.packages
    .map((entry) => `${entry.packageName}=${entry.installedVersion ?? "missing"}`)
    .join(", ");
}

function snapshotHostPackages(cwd, host) {
  return [host.packageName, ...host.companionPackages].map((packageName) => ({
    packageName,
    installedVersion: readInstalledPackageVersion(cwd, packageName),
  }));
}

function snapshotLockedHostPackages(cwd, host) {
  return [host.packageName, ...host.companionPackages].map((packageName) => ({
    packageName,
    installedVersion: readLockedPackageVersion(cwd, packageName),
  }));
}

function snapshotTargetHostPackages(host) {
  return [host.packageName, ...host.companionPackages].map((packageName) => ({
    packageName,
    installedVersion: host.version,
  }));
}

function resolveRestoreSnapshot(cwd, host, fallbackSnapshot) {
  const lockedSnapshot = snapshotLockedHostPackages(cwd, host);
  const hasLockfile = existsSync(path.join(cwd, "package-lock.json"));
  if (!hasLockfile) return fallbackSnapshot;
  return lockedSnapshot;
}

function snapshotsMatch(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
    return false;
  }

  return expected.every((entry, index) => {
    const candidate = actual[index];
    return (
      candidate &&
      candidate.packageName === entry.packageName &&
      candidate.installedVersion === entry.installedVersion
    );
  });
}

function summarizeSnapshot(snapshot) {
  return snapshot
    .map((entry) => `${entry.packageName}=${entry.installedVersion ?? "missing"}`)
    .join(", ");
}

function buildInstallCommand(host) {
  return [
    "npm",
    "install",
    "--no-save",
    "--package-lock=false",
    ...hostInstallSpecifiers(host),
  ];
}

function createNeutralNpmEnv(baseEnv = process.env) {
  const sandboxDir = mkdtempSync(path.join(tmpdir(), "pi-host-compat-npm-"));
  const userConfig = path.join(sandboxDir, "user.npmrc");
  const globalConfig = path.join(sandboxDir, "global.npmrc");
  writeFileSync(userConfig, "");
  writeFileSync(globalConfig, "");

  const env = {
    ...baseEnv,
    NPM_CONFIG_USERCONFIG: userConfig,
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
  };

  delete env.NPM_CONFIG_BEFORE;
  delete env.npm_config_before;
  delete env.NPM_CONFIG_MIN_RELEASE_AGE;
  delete env.npm_config_min_release_age;

  return {
    env,
    cleanup() {
      rmSync(sandboxDir, { recursive: true, force: true });
    },
  };
}

function buildRestoreCommands(snapshot) {
  const installSpecifiers = snapshot
    .filter((entry) => typeof entry.installedVersion === "string" && entry.installedVersion.length > 0)
    .map((entry) => `${entry.packageName}@${entry.installedVersion}`);
  const uninstallPackages = snapshot
    .filter((entry) => entry.installedVersion === null)
    .map((entry) => entry.packageName);

  const commands = [];
  if (installSpecifiers.length > 0) {
    commands.push([
      "npm",
      "install",
      "--no-save",
      "--package-lock=false",
      ...installSpecifiers,
    ]);
  }
  if (uninstallPackages.length > 0) {
    commands.push(["npm", "uninstall", "--no-save", ...uninstallPackages]);
  }

  return commands;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (Array.isArray(options.stdio)) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", (error) => {
      resolve({ ok: false, exitCode: 1, signal: null, stdout, stderr, error: error.message });
    });

    child.on("close", (code, signal) => {
      resolve({
        ok: code === 0,
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout,
        stderr,
      });
    });
  });
}

async function ensureScenarioHost(host, scenario, options) {
  const scenarioAlignment = describeScenarioAlignment(host, scenario);
  const targetSnapshot = snapshotTargetHostPackages(host);
  const packagePreparations = scenarioAlignment.packages.map((entry) => {
    const beforeSnapshot = snapshotHostPackages(entry.packageAbs, host);
    const restoreSnapshot = resolveRestoreSnapshot(entry.packageAbs, host, beforeSnapshot);
    return {
      declaredPath: entry.declaredPath,
      packagePath: entry.packagePath,
      mode: entry.mode,
      alignment: entry.alignment,
      beforeSnapshot,
      restoreSnapshot,
      needsRestore: !snapshotsMatch(
        restoreSnapshot,
        entry.alignment.aligned ? beforeSnapshot : targetSnapshot,
      ),
      command: buildInstallCommand(host),
    };
  });

  if (options.dryRun) {
    return {
      status: scenarioAlignment.aligned ? "ready" : "dry-run",
      changed: false,
      packages: packagePreparations,
      alignment: {
        packages: packagePreparations.map((entry) => ({
          packagePath: entry.packagePath,
          mode: entry.mode,
          alignment: entry.alignment,
        })),
        aligned: scenarioAlignment.aligned,
      },
    };
  }

  if (scenarioAlignment.aligned) {
    return {
      status: "ready",
      changed: false,
      packages: packagePreparations,
      alignment: {
        packages: packagePreparations.map((entry) => ({
          packagePath: entry.packagePath,
          mode: entry.mode,
          alignment: entry.alignment,
        })),
        aligned: true,
      },
    };
  }

  const changedPackages = [];
  for (const entry of packagePreparations) {
    const packageAbs = path.resolve(ROOT, entry.packagePath);
    const installCommand = entry.command;

    if (entry.alignment.aligned) {
      changedPackages.push({
        declaredPath: entry.declaredPath,
        packagePath: entry.packagePath,
        mode: entry.mode,
        changed: false,
        beforeSnapshot: entry.beforeSnapshot,
        restoreSnapshot: entry.restoreSnapshot,
        needsRestore: entry.needsRestore,
        afterAlignment: entry.alignment,
        installCommand,
      });
      continue;
    }

    if (!options.json) {
      console.log(`    host[${entry.packagePath}]: aligning to ${host.packageName}@${host.version}`);
      console.log(`    host_before[${entry.packagePath}]: ${summarizeSnapshot(entry.beforeSnapshot)}`);
    }

    const npmEnv = createNeutralNpmEnv(process.env);
    const installResult = await spawnCommand(installCommand[0], installCommand.slice(1), {
      cwd: packageAbs,
      env: npmEnv.env,
      stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    npmEnv.cleanup();

    if (!installResult.ok) {
      return {
        status: "failed",
        changed: changedPackages.some((pkg) => pkg.changed),
        packages: [
          ...changedPackages,
          {
            declaredPath: entry.declaredPath,
            packagePath: entry.packagePath,
            mode: entry.mode,
            changed: false,
            beforeSnapshot: entry.beforeSnapshot,
            restoreSnapshot: entry.restoreSnapshot,
            needsRestore: entry.needsRestore,
            installCommand,
            install: installResult,
          },
        ],
        error: `Failed to align host package set for ${scenario.id} at ${entry.packagePath}`,
      };
    }

    const afterAlignment = describeHostAlignment(host, packageAbs);
    if (!afterAlignment.aligned) {
      return {
        status: "failed",
        changed: true,
        packages: [
          ...changedPackages,
          {
            declaredPath: entry.declaredPath,
            packagePath: entry.packagePath,
            mode: entry.mode,
            changed: true,
            beforeSnapshot: entry.beforeSnapshot,
            restoreSnapshot: entry.restoreSnapshot,
            needsRestore: entry.needsRestore,
            installCommand,
            install: installResult,
            afterAlignment,
          },
        ],
        error: `Host package alignment verification failed for ${scenario.id} at ${entry.packagePath}: ${summarizeAlignment(afterAlignment)}`,
      };
    }

    if (!options.json) {
      console.log(`    host_after[${entry.packagePath}]: ${summarizeAlignment(afterAlignment)}`);
    }

    changedPackages.push({
      declaredPath: entry.declaredPath,
      packagePath: entry.packagePath,
      mode: entry.mode,
      changed: true,
      beforeSnapshot: entry.beforeSnapshot,
      restoreSnapshot: entry.restoreSnapshot,
      needsRestore: entry.needsRestore,
      installCommand,
      install: installResult,
      afterAlignment,
    });
  }

  return {
    status: "prepared",
    changed: changedPackages.some((entry) => entry.changed),
    packages: changedPackages,
    alignment: {
      packages: changedPackages.map((entry) => ({
        packagePath: entry.packagePath,
        mode: entry.mode,
        alignment: entry.afterAlignment,
      })),
      aligned: changedPackages.every((entry) => entry.afterAlignment?.aligned !== false),
    },
  };
}

async function restoreScenarioHost(host, hostPreparation, options) {
  if (!hostPreparation) {
    return {
      status: "skipped",
      changed: false,
      packages: [],
    };
  }

  const changedPackages = Array.isArray(hostPreparation.packages)
    ? hostPreparation.packages.filter((entry) => entry.needsRestore)
    : [];
  if (changedPackages.length === 0) {
    return {
      status: "not-needed",
      changed: false,
      packages: [],
    };
  }

  const restoredPackages = [];
  for (const entry of changedPackages) {
    const packageAbs = path.resolve(ROOT, entry.packagePath);
    const restoreCommands = buildRestoreCommands(entry.restoreSnapshot ?? entry.beforeSnapshot ?? []);

    if (!options.json) {
      console.log(`    restore[${entry.packagePath}]: ${summarizeSnapshot(entry.restoreSnapshot ?? entry.beforeSnapshot ?? [])}`);
    }

    const commandResults = [];
    for (const restoreCommand of restoreCommands) {
      const npmEnv = createNeutralNpmEnv(process.env);
      const restoreResult = await spawnCommand(restoreCommand[0], restoreCommand.slice(1), {
        cwd: packageAbs,
        env: npmEnv.env,
        stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
      });
      npmEnv.cleanup();
      commandResults.push({ command: restoreCommand, result: restoreResult });
      if (!restoreResult.ok) {
        return {
          status: "failed",
          changed: true,
          packages: [
            ...restoredPackages,
            {
              packagePath: entry.packagePath,
              mode: entry.mode,
              beforeSnapshot: entry.beforeSnapshot,
              restoreSnapshot: entry.restoreSnapshot,
              restoreCommands,
              commandResults,
            },
          ],
          error: `Failed to restore host package set at ${entry.packagePath}`,
        };
      }
    }

    const afterRestore = snapshotHostPackages(packageAbs, host);
    if (!snapshotsMatch(entry.restoreSnapshot ?? entry.beforeSnapshot ?? [], afterRestore)) {
      return {
        status: "failed",
        changed: true,
        packages: [
          ...restoredPackages,
          {
            packagePath: entry.packagePath,
            mode: entry.mode,
            beforeSnapshot: entry.beforeSnapshot,
            restoreSnapshot: entry.restoreSnapshot,
            restoreCommands,
            commandResults,
            afterRestore,
          },
        ],
        error: `Host package restore verification failed at ${entry.packagePath}: expected ${summarizeSnapshot(entry.restoreSnapshot ?? entry.beforeSnapshot ?? [])}, got ${summarizeSnapshot(afterRestore)}`,
      };
    }

    restoredPackages.push({
      packagePath: entry.packagePath,
      mode: entry.mode,
      beforeSnapshot: entry.beforeSnapshot,
      restoreSnapshot: entry.restoreSnapshot,
      restoreCommands,
      commandResults,
      afterRestore,
    });
  }

  return {
    status: "restored",
    changed: true,
    packages: restoredPackages,
  };
}

function resolveHostPayload(manifest, options) {
  const profile = options.profile ?? manifest.defaultProfile;
  const host = resolveProfileHost(manifest, profile);
  return {
    manifestPath: manifest.manifestPath,
    profile,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    host,
  };
}

function listPayload(manifest, options) {
  const selection = selectScenarios(manifest, options);
  const host = resolveProfileHost(manifest, selection.profile);
  return {
    manifestPath: manifest.manifestPath,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    profile: selection.profile,
    profiles: manifest.profiles,
    host,
    scenarios: selection.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      owner: scenario.owner,
      why: scenario.why,
      packages: scenario.packages,
      packageRoots: resolveScenarioPackageTargets(scenario).map((entry) => ({
        declaredPath: entry.declaredPath,
        packagePath: entry.packagePath,
        mode: entry.mode,
      })),
      upstreamSurfaces: scenario.upstreamSurfaces,
      cwd: scenario.cwd,
      command: scenario.command,
      notes: scenario.notes,
    })),
  };
}

function printResolvedHost(payload) {
  console.log(`# Pi host compatibility host contract (${payload.profile})`);
  console.log("");
  console.log(`- host_package: ${payload.host.packageName}`);
  console.log(`- host_version: ${payload.host.version}`);
  console.log(`- host_version_source: ${payload.host.versionSource}`);
  console.log(`- review_anchor: ${payload.host.reviewAnchor}`);
  console.log(`- review_anchor_source: ${payload.host.reviewAnchorSource}`);
  console.log(`- tracked_changelog: ${payload.trackedChangelog}`);
  console.log(`- host_companion_packages: ${payload.host.companionPackages.join(", ") || "none"}`);
}

function printList(payload) {
  console.log(`# Pi host compatibility canary (${payload.profile})`);
  console.log("");
  console.log(`- host_package: ${payload.host.packageName}`);
  console.log(`- host_version: ${payload.host.version}`);
  console.log(`- host_version_source: ${payload.host.versionSource}`);
  console.log(`- review_anchor: ${payload.host.reviewAnchor}`);
  console.log(`- tracked_changelog: ${payload.trackedChangelog}`);
  console.log(`- scenarios: ${payload.scenarios.length}`);
  console.log("");

  for (const scenario of payload.scenarios) {
    console.log(`## ${scenario.id}`);
    console.log(scenario.title);
    console.log(`- owner: ${scenario.owner}`);
    console.log(`- packages: ${scenario.packages.join(", ")}`);
    if (Array.isArray(scenario.packageRoots) && scenario.packageRoots.length > 0) {
      console.log(`- package_roots: ${scenario.packageRoots.map((entry) => entry.packagePath).join(", ")}`);
    }
    console.log(`- upstream_surfaces: ${scenario.upstreamSurfaces.join(", ")}`);
    console.log(`- cwd: ${scenario.cwd}`);
    console.log(`- command: ${commandToString(scenario.command)}`);
    console.log(`- why: ${scenario.why}`);
    if (scenario.notes) {
      console.log(`- notes: ${scenario.notes}`);
    }
    console.log("");
  }
}

function buildDryRunResult(scenario, host, hostPreparation) {
  return {
    id: scenario.id,
    title: scenario.title,
    status: "dry-run",
    exitCode: 0,
    elapsedMs: 0,
    cwd: scenario.cwd,
    command: scenario.command,
    packages: scenario.packages,
    upstreamSurfaces: scenario.upstreamSurfaces,
    owner: scenario.owner,
    why: scenario.why,
    notes: scenario.notes,
    host: {
      packageName: host.packageName,
      version: host.version,
      reviewAnchor: host.reviewAnchor,
      preparation: hostPreparation,
      restoration: {
        status: "not-run",
        changed: false,
        packages: [],
      },
    },
  };
}

async function spawnScenario(scenario, host, options) {
  const startedAt = Date.now();
  const hostPreparation = await ensureScenarioHost(host, scenario, options);

  if (hostPreparation.status === "failed") {
    const restoration = await restoreScenarioHost(host, hostPreparation, options);
    const error = restoration.status === "failed"
      ? `${hostPreparation.error}; restore failed: ${restoration.error}`
      : hostPreparation.error;

    return {
      id: scenario.id,
      title: scenario.title,
      status: "failed",
      exitCode: 1,
      signal: null,
      elapsedMs: Date.now() - startedAt,
      cwd: scenario.cwd,
      command: scenario.command,
      packages: scenario.packages,
      upstreamSurfaces: scenario.upstreamSurfaces,
      owner: scenario.owner,
      why: scenario.why,
      notes: scenario.notes,
      error,
      host: {
        packageName: host.packageName,
        version: host.version,
        reviewAnchor: host.reviewAnchor,
        preparation: hostPreparation,
        restoration,
      },
    };
  }

  if (options.dryRun) {
    return buildDryRunResult(scenario, host, hostPreparation);
  }

  const stdio = options.json ? ["ignore", "pipe", "pipe"] : "inherit";
  let execution = null;
  let restoration = {
    status: "skipped",
    changed: false,
    packages: [],
  };

  try {
    execution = await spawnCommand(scenario.command[0], scenario.command.slice(1), {
      cwd: scenario.cwdAbs,
      env: {
        ...process.env,
        PI_HOST_COMPAT_PROFILE: options.profile,
        PI_HOST_COMPAT_SCENARIO: scenario.id,
        PI_HOST_VERSION: host.version,
        PI_HOST_COMPAT_REVIEW_ANCHOR: host.reviewAnchor,
      },
      stdio,
    });
  } finally {
    restoration = await restoreScenarioHost(host, hostPreparation, options);
  }

  const restorationFailed = restoration.status === "failed";
  const executionFailed = !execution?.ok;
  const status = !execution || executionFailed || restorationFailed ? "failed" : "passed";
  const error = restorationFailed
    ? restoration.error
    : executionFailed
      ? `Scenario command failed for ${scenario.id}`
      : undefined;

  return {
    id: scenario.id,
    title: scenario.title,
    status,
    exitCode: restorationFailed ? 1 : execution?.exitCode ?? 1,
    signal: execution?.signal ?? null,
    elapsedMs: Date.now() - startedAt,
    cwd: scenario.cwd,
    command: scenario.command,
    packages: scenario.packages,
    upstreamSurfaces: scenario.upstreamSurfaces,
    owner: scenario.owner,
    why: scenario.why,
    notes: scenario.notes,
    ...(error ? { error } : {}),
    host: {
      packageName: host.packageName,
      version: host.version,
      reviewAnchor: host.reviewAnchor,
      preparation: hostPreparation,
      restoration,
    },
    ...(options.json && execution ? { stdout: execution.stdout, stderr: execution.stderr } : {}),
  };
}

async function runPayload(manifest, options) {
  const selection = selectScenarios(manifest, options);
  const host = resolveProfileHost(manifest, selection.profile);
  const results = [];

  for (const scenario of selection.scenarios) {
    if (!options.json) {
      console.log(`==> ${scenario.id} (${selection.profile})`);
      console.log(`    title: ${scenario.title}`);
      console.log(`    packages: ${scenario.packages.join(", ")}`);
      console.log(`    upstream_surfaces: ${scenario.upstreamSurfaces.join(", ")}`);
      console.log(`    cwd: ${scenario.cwd}`);
      console.log(`    command: ${commandToString(scenario.command)}`);
      console.log(`    host_version: ${host.version}`);
      console.log(`    review_anchor: ${host.reviewAnchor}`);
    }

    const result = await spawnScenario(scenario, host, {
      dryRun: options.dryRun,
      json: options.json,
      profile: selection.profile,
    });
    results.push(result);

    if (!options.json) {
      console.log(
        `    result: ${result.status} (exit=${result.exitCode}, elapsed=${result.elapsedMs}ms)`,
      );
      console.log("");
    }

    if (result.status === "failed" && options.failFast) {
      break;
    }
  }

  const summary = {
    selected: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    dryRun: results.filter((result) => result.status === "dry-run").length,
  };

  return {
    manifestPath: manifest.manifestPath,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    profile: selection.profile,
    host,
    dryRun: options.dryRun,
    results,
    summary,
  };
}

function printRunSummary(payload) {
  console.log(`# Pi host compatibility canary run`);
  console.log("");
  console.log(`- profile: ${payload.profile}`);
  console.log(`- host_package: ${payload.host.packageName}`);
  console.log(`- host_version: ${payload.host.version}`);
  console.log(`- host_version_source: ${payload.host.versionSource}`);
  console.log(`- review_anchor: ${payload.host.reviewAnchor}`);
  console.log(`- review_anchor_source: ${payload.host.reviewAnchorSource}`);
  console.log(`- tracked_changelog: ${payload.trackedChangelog}`);
  console.log(`- selected: ${payload.summary.selected}`);
  console.log(`- passed: ${payload.summary.passed}`);
  console.log(`- failed: ${payload.summary.failed}`);
  console.log(`- dry_run: ${payload.summary.dryRun}`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.command) {
    usage();
    return 0;
  }

  const manifest = validateManifest(loadManifest(options.manifestPath), options.manifestPath);

  switch (options.command) {
    case "validate": {
      const payload = {
        ok: true,
        manifestPath: manifest.manifestPath,
        hostPackage: manifest.hostPackage,
        hostCompanionPackages: manifest.hostCompanionPackages,
        trackedChangelog: manifest.trackedChangelog,
        scenarioCount: manifest.scenarios.length,
        profiles: Object.keys(manifest.profiles),
        defaultProfile: manifest.defaultProfile,
      };
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`ok: pi host compatibility canary manifest (${manifest.scenarios.length} scenarios)`);
        console.log(`manifest: ${manifest.manifestPath}`);
      }
      return 0;
    }
    case "resolve-host": {
      const payload = resolveHostPayload(manifest, options);
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else printResolvedHost(payload);
      return 0;
    }
    case "list": {
      const payload = listPayload(manifest, options);
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else printList(payload);
      return 0;
    }
    case "run": {
      const payload = await runPayload(manifest, options);
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printRunSummary(payload);
      }
      return payload.summary.failed > 0 ? 1 : 0;
    }
    default:
      throw new Error(`Unknown command: ${options.command}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
