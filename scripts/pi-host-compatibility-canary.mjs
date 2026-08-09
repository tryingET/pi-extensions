#!/usr/bin/env node
// ---
// summary: "Validates, lists, and runs manifest-defined package scenarios against pinned Pi host compatibility profiles."
// read_when:
//   - "Reviewing Pi host upgrade coverage, scenario selection, temporary dependency alignment, or restoration behavior."
// ---
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync,
  rmdirSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
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
    if (["--manifest", "--profile", "--scenario"].includes(arg)) {
      const value = rest[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--manifest") options.manifestPath = path.resolve(ROOT, value);
      else if (arg === "--profile") options.profile = value;
      else options.scenarioIds.push(value);
      continue;
    }
    const flagName = { "--fail-fast": "failFast", "--dry-run": "dryRun", "--json": "json" }[arg];
    if (flagName) options[flagName] = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

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

function loadManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

const CANONICAL_ROOT = realpathSync(ROOT);

function resolveContainedRepoPath(declaredPath, fieldName) {
  const resolved = path.resolve(ROOT, declaredPath);
  if (!existsSync(resolved)) throw new Error(`${fieldName} does not exist: ${declaredPath}`);
  const canonical = realpathSync(resolved);
  const relativePath = path.relative(CANONICAL_ROOT, canonical);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`${fieldName} must stay within repository root: ${declaredPath}`);
  }
  return canonical;
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
  return result;
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
  const hostCompanionPackages = ensureOptionalStringArray(manifest.hostCompanionPackages, "hostCompanionPackages");
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

class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrityError";
    this.code = "PI_HOST_COMPAT_INTEGRITY";
  }
}

function isIntegrityError(error) {
  return error?.code === "PI_HOST_COMPAT_INTEGRITY";
}

function identityOf(stats) {
  return { dev: String(stats.dev), ino: String(stats.ino) };
}

function identitiesMatch(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function nodeModulesState(packageAbs) {
  const nodeModulesPath = path.join(packageAbs, "node_modules");
  const stats = lstatSync(nodeModulesPath, { bigint: true, throwIfNoEntry: false });
  if (!stats) return { kind: "absent" };
  if (!stats.isDirectory()) {
    const kind = stats.isSymbolicLink() ? "symlink" : "non-directory";
    throw new IntegrityError(`node_modules must be absent or a real directory at ${path.relative(ROOT, packageAbs)}; got ${kind}`);
  }
  return { kind: "directory", identity: identityOf(stats) };
}

function captureTargetLedger(target, host) {
  const stats = statSync(target.packageAbs, { bigint: true });
  if (!stats.isDirectory()) {
    throw new Error(`Scenario package target is not a directory: ${target.declaredPath}`);
  }
  const canonicalPackagePath = path.relative(CANONICAL_ROOT, target.packageAbs);
  const nodeModulesBefore = nodeModulesState(target.packageAbs);
  const beforeSnapshot = snapshotHostPackages(target.packageAbs, host);
  return {
    declaredPath: target.declaredPath,
    packagePath: target.packagePath,
    canonicalPackagePath,
    packageIdentity: identityOf(stats),
    mode: target.mode,
    alignment: describeHostAlignment(host, target.packageAbs),
    nodeModulesBefore,
    beforeSnapshot,
    restoreSnapshot: resolveRestoreSnapshot(target.packageAbs, host, beforeSnapshot),
    mayNeedCleanup: false,
  };
}

function verifyTargetIdentity(entry) {
  try {
    const packageAbs = resolveContainedRepoPath(entry.declaredPath, "Scenario package target");
    const canonicalPackagePath = path.relative(CANONICAL_ROOT, packageAbs);
    const stats = statSync(packageAbs, { bigint: true });
    if (
      canonicalPackagePath !== entry.canonicalPackagePath ||
      !identitiesMatch(identityOf(stats), entry.packageIdentity)
    ) {
      throw new IntegrityError(`Scenario package target identity changed: ${entry.declaredPath}`);
    }
    return packageAbs;
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    throw new IntegrityError(`Scenario package target integrity failed for ${entry.declaredPath}: ${errorMessage(error)}`);
  }
}

function verifyInitialTargetState(entry) {
  const packageAbs = verifyTargetIdentity(entry);
  const current = nodeModulesState(packageAbs);
  if (current.kind !== entry.nodeModulesBefore.kind) {
    throw new IntegrityError(`node_modules state changed before host alignment: ${entry.packagePath}`);
  }
  if (
    current.kind === "directory" &&
    !identitiesMatch(current.identity, entry.nodeModulesBefore.identity)
  ) {
    throw new IntegrityError(`node_modules identity changed before host alignment: ${entry.packagePath}`);
  }
  return packageAbs;
}

function captureAlignedTargetState(entry, host) {
  const packageAbs = verifyTargetIdentity(entry);
  const current = nodeModulesState(packageAbs);
  if (current.kind !== "directory") {
    throw new IntegrityError(`aligned node_modules is not a real directory: ${entry.packagePath}`);
  }
  if (
    entry.nodeModulesBefore.kind === "directory" &&
    !identitiesMatch(current.identity, entry.nodeModulesBefore.identity)
  ) {
    throw new IntegrityError(`pre-existing node_modules identity changed: ${entry.packagePath}`);
  }
  const alignment = describeHostAlignment(host, packageAbs);
  if (!alignment.aligned) {
    throw new IntegrityError(`aligned host package versions changed: ${entry.packagePath}`);
  }
  return { packageAbs, nodeModulesIdentity: current.identity, alignment };
}

function verifyAlignedTargetState(entry, host) {
  const captured = captureAlignedTargetState(entry, host);
  const expectedIdentity = entry.nodeModulesBefore.kind === "directory"
    ? entry.nodeModulesBefore.identity
    : entry.alignedNodeModulesIdentity;
  if (!expectedIdentity || !identitiesMatch(captured.nodeModulesIdentity, expectedIdentity)) {
    throw new IntegrityError(`aligned node_modules identity changed: ${entry.packagePath}`);
  }
  return captured.packageAbs;
}

function verifyScenarioCwdIdentity(scenario) {
  try {
    const current = resolveContainedRepoPath(scenario.cwd, "Scenario cwd");
    const stats = statSync(current, { bigint: true });
    if (current !== scenario.cwdAbs || !identitiesMatch(identityOf(stats), scenario.cwdIdentity)) {
      throw new IntegrityError(`Scenario cwd identity changed: ${scenario.cwd}`);
    }
    return current;
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    throw new IntegrityError(`Scenario cwd integrity failed for ${scenario.cwd}: ${errorMessage(error)}`);
  }
}

function removeDirectoryByHandle(directoryPath, expectedIdentity) {
  const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(directoryPath, flags);
  const fdRoot = `${process.platform === "linux" ? "/proc/self/fd" : "/dev/fd"}/${fd}`;
  try {
    const openedIdentity = identityOf(fstatSync(fd, { bigint: true }));
    if (!identitiesMatch(openedIdentity, expectedIdentity)) {
      throw new IntegrityError("directory identity changed before handle-safe removal");
    }
    for (const child of readdirSync(fdRoot, { withFileTypes: true })) {
      const childPath = path.join(fdRoot, child.name);
      const childStats = lstatSync(childPath, { bigint: true });
      if (childStats.isDirectory() && !childStats.isSymbolicLink()) {
        removeDirectoryByHandle(childPath, identityOf(childStats));
      } else {
        unlinkSync(childPath);
      }
    }
  } finally {
    closeSync(fd);
  }
  const finalStats = lstatSync(directoryPath, { bigint: true, throwIfNoEntry: false });
  if (!finalStats || !identitiesMatch(identityOf(finalStats), expectedIdentity)) {
    throw new IntegrityError("directory identity changed before final removal");
  }
  rmdirSync(directoryPath);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function restorationError(entry, phase, operation, error, result) {
  return {
    phase,
    packagePath: entry.packagePath,
    operation,
    message: errorMessage(error),
    ...(result?.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    ...(result?.signal ? { signal: result.signal } : {}),
  };
}

function selectScenarios(manifest, options) {
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

function resolveProfileHost(manifest, profileName) {
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
    version: resolve("version"),
    reviewAnchor: resolve("reviewAnchor"),
    versionSource: source("version"),
    reviewAnchorSource: source("reviewAnchor"),
    trackedChangelog: manifest.trackedChangelog,
  };
}

function commandToString(command) {
  return command.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ");
}

function hostPackageNames(host) {
  return [host.packageName, ...host.companionPackages];
}

function hostInstallSpecifiers(host) {
  return hostPackageNames(host).map((name) => `${name}@${host.version}`);
}

function readInstalledPackageVersion(cwd, packageName) {
  const packageJsonPath = path.join(cwd, "node_modules", ...packageName.split("/"), "package.json");
  if (!existsSync(packageJsonPath)) return null;
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return typeof version === "string" ? version.trim() : null;
}

function readLockedPackageVersion(cwd, packageName) {
  const packageLockPath = path.join(cwd, "package-lock.json");
  if (!existsSync(packageLockPath)) return null;
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  const version = packageLock?.packages?.[`node_modules/${packageName}`]?.version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

function describeHostAlignment(host, cwd) {
  const packageStates = hostPackageNames(host).map((packageName) => {
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

function summarizeAlignment(alignment) {
  return summarizeSnapshot(alignment.packages);
}

function snapshotHostPackages(cwd, host) {
  return hostPackageNames(host).map((packageName) => ({
    packageName,
    installedVersion: readInstalledPackageVersion(cwd, packageName),
  }));
}

function snapshotLockedHostPackages(cwd, host) {
  return hostPackageNames(host).map((packageName) => ({
    packageName,
    installedVersion: readLockedPackageVersion(cwd, packageName),
  }));
}

function snapshotTargetHostPackages(host) {
  return hostPackageNames(host).map((packageName) => ({
    packageName,
    installedVersion: host.version,
  }));
}

function resolveRestoreSnapshot(cwd, host, fallbackSnapshot) {
  return existsSync(path.join(cwd, "package-lock.json"))
    ? snapshotLockedHostPackages(cwd, host)
    : fallbackSnapshot;
}

function snapshotsMatch(expected, actual) {
  return Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length &&
    expected.every((entry, index) => actual[index]?.packageName === entry.packageName &&
      actual[index].installedVersion === entry.installedVersion);
}

function summarizeSnapshot(snapshot) {
  return snapshot
    .map((entry) => `${entry.packageName}=${entry.installedVersion ?? "missing"}`)
    .join(", ");
}

function buildInstallCommand(host) {
  return ["npm", "install", "--no-save", "--package-lock=false", ...hostInstallSpecifiers(host)];
}

function createNeutralNpmEnv(baseEnv = process.env) {
  const sandboxDir = mkdtempSync(path.join(tmpdir(), "pi-host-compat-npm-"));
  const userConfig = path.join(sandboxDir, "user.npmrc");
  const globalConfig = path.join(sandboxDir, "global.npmrc");
  const sandboxIdentity = identityOf(lstatSync(sandboxDir, { bigint: true }));
  try {
    writeFileSync(userConfig, "");
    writeFileSync(globalConfig, "");
  } catch (error) {
    try { removeDirectoryByHandle(sandboxDir, sandboxIdentity); }
    catch (cleanupError) {
      throw new IntegrityError(`npm environment setup failed: ${errorMessage(error)}; cleanup failed: ${errorMessage(cleanupError)}`);
    }
    throw error;
  }

  const env = {
    ...baseEnv, NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
    npm_config_userconfig: userConfig, npm_config_globalconfig: globalConfig,
  };

  delete env.NPM_CONFIG_BEFORE;
  delete env.npm_config_before;
  delete env.NPM_CONFIG_MIN_RELEASE_AGE;
  delete env.npm_config_min_release_age;

  return { env, cleanup: () => removeDirectoryByHandle(sandboxDir, sandboxIdentity) };
}

function buildRestoreCommands(snapshot) {
  const installSpecifiers = snapshot.filter((entry) => entry.installedVersion)
    .map((entry) => `${entry.packageName}@${entry.installedVersion}`);
  const uninstallPackages = snapshot.filter((entry) => entry.installedVersion === null)
    .map((entry) => entry.packageName);
  const commands = [];
  if (installSpecifiers.length > 0) {
    commands.push(["npm", "install", "--no-save", "--package-lock=false", ...installSpecifiers]);
  }
  if (uninstallPackages.length > 0) commands.push(["npm", "uninstall", "--no-save", ...uninstallPackages]);
  return commands;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env, stdio: options.stdio ?? "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (Array.isArray(options.stdio)) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", (error) => resolve({
      ok: false, exitCode: 1, signal: null, stdout, stderr, error: error.message,
    }));
    child.on("close", (code, signal) => resolve({
      ok: code === 0, exitCode: code ?? 1, signal: signal ?? null, stdout, stderr,
    }));
  });
}

async function spawnWithNeutralNpmEnv(command, args, options) {
  let npmEnv;
  let result;
  let cleanupError;
  try {
    npmEnv = createNeutralNpmEnv(options.baseEnv ?? process.env);
    result = await spawnCommand(command, args, {
      cwd: options.cwd, env: npmEnv.env, stdio: options.stdio,
    });
  } catch (error) {
    result = {
      ok: false, exitCode: 1, signal: null, stdout: "", stderr: "",
      error: errorMessage(error), integrityFailure: isIntegrityError(error),
    };
  } finally {
    try { npmEnv?.cleanup(); }
    catch (error) { cleanupError = errorMessage(error); }
  }
  if (!cleanupError) return result;
  return {
    ...result,
    ok: false,
    cleanupError,
    integrityFailure: true,
    error: [result?.error, `npm environment cleanup failed: ${cleanupError}`].filter(Boolean).join("; "),
  };
}

async function ensureScenarioHost(host, scenario, options, preparationTracker) {
  verifyScenarioCwdIdentity(scenario);
  const targetSnapshot = snapshotTargetHostPackages(host);
  let packagePreparations;
  try {
    packagePreparations = resolveScenarioPackageTargets(scenario).map((target) => {
      const entry = captureTargetLedger(target, host);
      return {
        ...entry,
        nodeModulesExistedBefore: entry.nodeModulesBefore.kind === "directory",
        alignedNodeModulesIdentity: entry.nodeModulesBefore.identity,
        needsRestore: !snapshotsMatch(
          entry.restoreSnapshot,
          entry.alignment.aligned ? entry.beforeSnapshot : targetSnapshot,
        ),
        command: buildInstallCommand(host),
        changed: false,
      };
    });
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    throw new IntegrityError(`Scenario target preflight failed: ${errorMessage(error)}`);
  }
  preparationTracker.packages = packagePreparations;
  const alignment = {
    packages: packagePreparations.map((entry) => ({
      packagePath: entry.packagePath,
      mode: entry.mode,
      alignment: entry.alignment,
    })),
    aligned: packagePreparations.every((entry) => entry.alignment.aligned),
  };

  if (options.dryRun || alignment.aligned) {
    return {
      status: options.dryRun && !alignment.aligned ? "dry-run" : "ready",
      changed: false,
      packages: packagePreparations,
      alignment,
    };
  }

  for (const entry of packagePreparations) entry.mayNeedCleanup = true;

  for (const entry of packagePreparations) {
    entry.afterAlignment = entry.alignment;
    const packageAbs = verifyInitialTargetState(entry);
    if (entry.alignment.aligned) continue;
    if (!options.json) {
      console.log(`    host[${entry.packagePath}]: aligning to ${host.packageName}@${host.version}`);
      console.log(`    host_before[${entry.packagePath}]: ${summarizeSnapshot(entry.beforeSnapshot)}`);
    }

    verifyInitialTargetState(entry);
    entry.install = await spawnWithNeutralNpmEnv(entry.command[0], entry.command.slice(1), {
      cwd: packageAbs,
      stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    entry.changed = true;
    if (entry.nodeModulesBefore.kind === "absent") {
      const current = nodeModulesState(verifyTargetIdentity(entry));
      if (current.kind === "directory") entry.alignedNodeModulesIdentity = current.identity;
    }
    if (!entry.install.ok) {
      return {
        status: "failed",
        changed: true,
        packages: packagePreparations,
        alignment,
        ...(entry.install.integrityFailure ? { integrityFailed: true } : {}),
        error: `Failed to align host package set for ${scenario.id} at ${entry.packagePath}: ${entry.install.error ?? `exit ${entry.install.exitCode}`}`,
      };
    }

    const capturedAlignment = captureAlignedTargetState(entry, host);
    entry.alignedNodeModulesIdentity = capturedAlignment.nodeModulesIdentity;
    entry.afterAlignment = capturedAlignment.alignment;
    if (!options.json) {
      console.log(`    host_after[${entry.packagePath}]: ${summarizeAlignment(entry.afterAlignment)}`);
    }
  }

  return {
    status: "prepared",
    changed: packagePreparations.some((entry) => entry.changed),
    packages: packagePreparations,
    alignment: {
      packages: packagePreparations.map((entry) => ({
        packagePath: entry.packagePath,
        mode: entry.mode,
        alignment: entry.afterAlignment,
      })),
      aligned: packagePreparations.every((entry) => entry.afterAlignment?.aligned),
    },
  };
}

async function restoreScenarioHost(host, hostPreparation, options) {
  const preparedPackages = Array.isArray(hostPreparation?.packages)
    ? hostPreparation.packages.filter((entry) => entry.mayNeedCleanup)
    : [];
  if (preparedPackages.length === 0) {
    return { status: "not-needed", changed: false, packages: [], errors: [] };
  }

  const reversed = [...preparedPackages].reverse();
  const ordered = [
    ...reversed.filter((entry) => entry.nodeModulesBefore?.kind === "directory"),
    ...reversed.filter((entry) => entry.nodeModulesBefore?.kind === "absent"),
  ];
  const restoredPackages = [];
  const errors = [];
  let changed = false;

  for (const entry of ordered) {
    const packageErrors = [];
    const commandResults = [];
    const restoredPackage = {
      packagePath: entry.packagePath,
      mode: entry.mode,
      nodeModulesExistedBefore: entry.nodeModulesExistedBefore,
      beforeSnapshot: entry.beforeSnapshot,
      restoreSnapshot: entry.restoreSnapshot,
      commandResults,
      errors: packageErrors,
    };
    const record = (phase, operation, error, result) => {
      const detail = restorationError(entry, phase, operation, error, result);
      packageErrors.push(detail);
      errors.push(detail);
    };

    let packageAbs;
    try {
      packageAbs = verifyTargetIdentity(entry);
    } catch (error) {
      record("identity", "verify-package", error);
      restoredPackages.push(restoredPackage);
      continue;
    }
    const nodeModulesPath = path.join(packageAbs, "node_modules");

    if (entry.nodeModulesBefore.kind === "absent") {
      try {
        const current = nodeModulesState(packageAbs);
        if (current.kind === "directory") {
          if (!identitiesMatch(current.identity, entry.alignedNodeModulesIdentity)) {
            throw new IntegrityError(`runner-created node_modules identity changed: ${entry.packagePath}`);
          }
          verifyTargetIdentity(entry);
          const quarantine = path.join(packageAbs, `.node_modules.pi-host-compat-${randomUUID()}`);
          if (lstatSync(quarantine, { throwIfNoEntry: false })) {
            throw new Error(`node_modules quarantine already exists: ${path.basename(quarantine)}`);
          }
          renameSync(nodeModulesPath, quarantine);
          changed = true;
          const moved = lstatSync(quarantine, { bigint: true });
          if (!moved.isDirectory() || !identitiesMatch(identityOf(moved), current.identity)) {
            throw new IntegrityError("quarantined node_modules identity changed before removal");
          }
          verifyTargetIdentity(entry);
          removeDirectoryByHandle(quarantine, current.identity);
        }
        const after = lstatSync(nodeModulesPath, { throwIfNoEntry: false });
        if (after) throw new IntegrityError("expected node_modules to be absent after restoration");
        restoredPackage.nodeModulesPresentAfter = false;
        restoredPackage.afterRestore = snapshotHostPackages(packageAbs, host);
      } catch (error) {
        record("cleanup", "remove-created-node-modules", error);
      }
      restoredPackages.push(restoredPackage);
      continue;
    }

    let canRunRestore = true;
    let restoreNodeModulesIdentity;
    try {
      const current = nodeModulesState(packageAbs);
      if (current.kind === "absent") {
        record(
          "verification",
          "detect-missing-preexisting-node-modules",
          new Error("pre-existing node_modules disappeared during scenario execution"),
        );
        verifyTargetIdentity(entry);
        mkdirSync(nodeModulesPath);
        changed = true;
      } else if (!identitiesMatch(current.identity, entry.nodeModulesBefore.identity)) {
        throw new IntegrityError(`pre-existing node_modules identity changed: ${entry.packagePath}`);
      }
      restoreNodeModulesIdentity = nodeModulesState(packageAbs).identity;
    } catch (error) {
      record("verification", "verify-preexisting-node-modules", error);
      canRunRestore = false;
    }

    const expectedSnapshot = entry.restoreSnapshot ?? entry.beforeSnapshot ?? [];
    let restoreCommands = [];
    if (canRunRestore) {
      try {
        if (!snapshotsMatch(expectedSnapshot, snapshotHostPackages(packageAbs, host))) {
          restoreCommands = buildRestoreCommands(expectedSnapshot);
        }
      } catch (error) {
        record("verification", "read-pre-restore-host-snapshot", error);
        restoreCommands = buildRestoreCommands(expectedSnapshot);
      }
    }
    restoredPackage.restoreCommands = restoreCommands;
    if (!options.json && restoreCommands.length > 0) {
      console.log(`    restore[${entry.packagePath}]: ${summarizeSnapshot(expectedSnapshot)}`);
    }
    for (const restoreCommand of restoreCommands) {
      let restoreResult;
      try {
        packageAbs = verifyTargetIdentity(entry);
        const current = nodeModulesState(packageAbs);
        if (current.kind !== "directory" || !identitiesMatch(current.identity, restoreNodeModulesIdentity)) {
          throw new IntegrityError(`node_modules identity changed between restore commands: ${entry.packagePath}`);
        }
        restoreResult = await spawnWithNeutralNpmEnv(
          restoreCommand[0],
          restoreCommand.slice(1),
          {
            cwd: packageAbs,
            stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
          },
        );
      } catch (error) {
        restoreResult = { ok: false, exitCode: 1, signal: null, error: errorMessage(error) };
      }
      commandResults.push({ command: restoreCommand, result: restoreResult });
      changed = true;
      if (!restoreResult.ok) {
        record(
          "restore-command",
          commandToString(restoreCommand),
          new Error(restoreResult.error ?? `exit ${restoreResult.exitCode}`),
          restoreResult,
        );
      }
    }

    try {
      packageAbs = verifyTargetIdentity(entry);
      const finalState = nodeModulesState(packageAbs);
      if (finalState.kind !== "directory") throw new Error("expected node_modules directory");
      const afterRestore = snapshotHostPackages(packageAbs, host);
      restoredPackage.nodeModulesPresentAfter = true;
      restoredPackage.afterRestore = afterRestore;
      if (!snapshotsMatch(expectedSnapshot, afterRestore)) {
        throw new Error(`expected ${summarizeSnapshot(expectedSnapshot)}, got ${summarizeSnapshot(afterRestore)}`);
      }
    } catch (error) {
      record("verification", "verify-host-snapshot", error);
    }
    restoredPackages.push(restoredPackage);
  }

  for (const entry of preparedPackages) {
    const restoredPackage = restoredPackages.find(
      (candidate) => candidate.packagePath === entry.packagePath,
    );
    try {
      const packageAbs = verifyTargetIdentity(entry);
      const finalState = nodeModulesState(packageAbs);
      if (entry.nodeModulesBefore.kind === "absent") {
        if (finalState.kind !== "absent") {
          throw new IntegrityError(`final node_modules state is not absent: ${entry.packagePath}`);
        }
      } else {
        if (
          finalState.kind !== "directory" ||
          !identitiesMatch(finalState.identity, entry.nodeModulesBefore.identity)
        ) {
          throw new IntegrityError(`final pre-existing node_modules identity changed: ${entry.packagePath}`);
        }
        const expected = entry.restoreSnapshot ?? entry.beforeSnapshot ?? [];
        const actual = snapshotHostPackages(packageAbs, host);
        if (!snapshotsMatch(expected, actual)) {
          throw new Error(`final host snapshot expected ${summarizeSnapshot(expected)}, got ${summarizeSnapshot(actual)}`);
        }
      }
    } catch (error) {
      const detail = restorationError(entry, "final-barrier", "verify-all-targets", error);
      restoredPackage?.errors?.push(detail);
      errors.push(detail);
    }
  }

  return {
    status: errors.length > 0 ? "failed" : changed ? "restored" : "not-needed",
    changed,
    packages: restoredPackages,
    errors,
    ...(errors.length > 0
      ? { error: errors.map((entry) => `${entry.packagePath}: ${entry.message}`).join("; ") }
      : {}),
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

function scenarioFields(scenario) {
  const { id, title, cwd, command, packages, upstreamSurfaces, owner, why, notes } = scenario;
  return { id, title, cwd, command, packages, upstreamSurfaces, owner, why, notes };
}

function scenarioHostResult(host, preparation, restoration) {
  return {
    packageName: host.packageName,
    version: host.version,
    reviewAnchor: host.reviewAnchor,
    preparation,
    restoration,
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
      ...scenarioFields(scenario),
      packageRoots: resolveScenarioPackageTargets(scenario).map((entry) => ({
        declaredPath: entry.declaredPath,
        packagePath: entry.packagePath,
        mode: entry.mode,
      })),
    })),
  };
}

function printHostContract(payload) {
  const { host } = payload;
  const fields = {
    host_package: host.packageName,
    host_version: host.version,
    host_version_source: host.versionSource,
    review_anchor: host.reviewAnchor,
    review_anchor_source: host.reviewAnchorSource,
    tracked_changelog: payload.trackedChangelog,
    host_companion_packages: host.companionPackages.join(", ") || "none",
  };
  for (const [name, value] of Object.entries(fields)) console.log(`- ${name}: ${value}`);
}

function printResolvedHost(payload) {
  console.log(`# Pi host compatibility host contract (${payload.profile})\n`);
  printHostContract(payload);
}

function printList(payload) {
  console.log(`# Pi host compatibility canary (${payload.profile})\n`);
  printHostContract(payload);
  console.log(`- scenarios: ${payload.scenarios.length}\n`);

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
  const restoration = { status: "not-run", changed: false, packages: [] };
  return {
    ...scenarioFields(scenario),
    status: "dry-run",
    exitCode: 0,
    elapsedMs: 0,
    host: scenarioHostResult(host, hostPreparation, restoration),
  };
}

async function spawnScenario(scenario, host, options) {
  const startedAt = Date.now();
  const preparationTracker = { packages: [] };
  let hostPreparation;
  let execution = null;
  let preparationException;
  let scenarioException;
  let integrityFailure = false;
  let restoration = { status: "skipped", changed: false, packages: [], errors: [] };

  try {
    hostPreparation = await ensureScenarioHost(host, scenario, options, preparationTracker);
    integrityFailure ||= hostPreparation.integrityFailed === true;
    if (hostPreparation.status !== "failed" && !options.dryRun) {
      for (const entry of preparationTracker.packages) verifyAlignedTargetState(entry, host);
      const scenarioCwd = verifyScenarioCwdIdentity(scenario);
      for (const entry of preparationTracker.packages) entry.mayNeedCleanup = true;
      execution = await spawnWithNeutralNpmEnv(
        scenario.command[0],
        scenario.command.slice(1),
        {
          cwd: scenarioCwd,
          baseEnv: {
            ...process.env,
            PI_HOST_COMPAT_PROFILE: options.profile,
            PI_HOST_COMPAT_SCENARIO: scenario.id,
            PI_HOST_VERSION: host.version,
            PI_HOST_COMPAT_REVIEW_ANCHOR: host.reviewAnchor,
          },
          stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
        },
      );
      integrityFailure ||= execution.integrityFailure === true;
    }
  } catch (error) {
    integrityFailure ||= isIntegrityError(error);
    if (!hostPreparation) preparationException = errorMessage(error);
    else scenarioException = errorMessage(error);
  }

  if (!hostPreparation) {
    hostPreparation = {
      status: "failed",
      changed: preparationTracker.packages.some((entry) => entry.changed),
      packages: preparationTracker.packages,
      error: preparationException ?? "Host preparation failed",
    };
  }

  if (!options.dryRun && preparationTracker.packages.length > 0) {
    try {
      restoration = await restoreScenarioHost(host, preparationTracker, options);
    } catch (error) {
      restoration = {
        status: "failed",
        changed: true,
        packages: [],
        errors: [{ phase: "restoration", operation: "unexpected-exception", message: errorMessage(error) }],
        error: errorMessage(error),
      };
    }
  }

  if (options.dryRun && hostPreparation.status !== "failed") {
    return buildDryRunResult(scenario, host, hostPreparation);
  }

  const preparationFailed = hostPreparation.status === "failed";
  const executionFailed = scenarioException || (execution && !execution.ok);
  const executionMissing = !preparationFailed && !options.dryRun && !execution;
  const restorationFailed = restoration.status === "failed";
  const failureMessages = [
    preparationFailed ? hostPreparation.error : undefined,
    scenarioException,
    executionFailed && execution ? execution.error ?? `Scenario command failed for ${scenario.id}` : undefined,
    executionMissing ? `Scenario command did not run for ${scenario.id}` : undefined,
    restorationFailed ? `restore failed: ${restoration.error}` : undefined,
  ].filter(Boolean);
  const status = failureMessages.length > 0 ? "failed" : "passed";
  const lifecycleErrors = {
    ...(integrityFailure ? { integrity: "identity or path integrity verification failed" } : {}),
    ...(preparationFailed ? { preparation: hostPreparation.error } : {}),
    ...(scenarioException ? { scenarioException } : {}),
    ...(executionFailed && execution
      ? {
          scenario: {
            exitCode: execution.exitCode,
            signal: execution.signal,
            ...(execution.error ? { error: execution.error } : {}),
          },
        }
      : {}),
    ...(restorationFailed ? { restoration: restoration.errors } : {}),
  };

  return {
    ...scenarioFields(scenario),
    status,
    exitCode: execution?.exitCode ?? 1,
    signal: execution?.signal ?? null,
    elapsedMs: Date.now() - startedAt,
    ...(failureMessages.length > 0 ? { error: failureMessages.join("; ") } : {}),
    ...(Object.keys(lifecycleErrors).length > 0 ? { lifecycleErrors } : {}),
    ...(restorationFailed ? { restorationFailed: true } : {}),
    ...(integrityFailure ? { integrityFailed: true } : {}),
    host: scenarioHostResult(host, hostPreparation, restoration),
    ...(options.json && execution ? { stdout: execution.stdout, stderr: execution.stderr } : {}),
  };
}

async function runPayload(manifest, options) {
  const selection = selectScenarios(manifest, options);
  const host = resolveProfileHost(manifest, selection.profile);
  const results = [];
  let aborted = false;
  let abortReason;

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

    if (result.restorationFailed || result.integrityFailed) {
      aborted = true;
      abortReason = result.integrityFailed ? "integrity-failed" : "restoration-failed";
      break;
    }
    if (result.status === "failed" && options.failFast) break;
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
    aborted,
    ...(abortReason ? { abortReason } : {}),
    results,
    summary,
  };
}

function printRunSummary(payload) {
  console.log(`# Pi host compatibility canary run\n\n- profile: ${payload.profile}`);
  printHostContract(payload);
  for (const name of ["selected", "passed", "failed", "dryRun"]) {
    console.log(`- ${name === "dryRun" ? "dry_run" : name}: ${payload.summary[name]}`);
  }
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
