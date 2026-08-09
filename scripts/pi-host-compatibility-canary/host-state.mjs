// ---
// summary: "Tracks host package snapshots, target identities, and npm install/restore commands for the canary."
// read_when:
//   - "Changing host alignment snapshots, package target ledgers, or restoration command construction."
// ---
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  errorMessage,
  identitiesMatch,
  identityOf,
  IntegrityError,
  isIntegrityError,
} from "./integrity.mjs";
import { CANONICAL_ROOT, resolveContainedRepoPath, ROOT } from "./paths.mjs";

export function nodeModulesState(packageAbs) {
  const nodeModulesPath = path.join(packageAbs, "node_modules");
  const stats = lstatSync(nodeModulesPath, { bigint: true, throwIfNoEntry: false });
  if (!stats) return { kind: "absent" };
  if (!stats.isDirectory()) {
    const kind = stats.isSymbolicLink() ? "symlink" : "non-directory";
    throw new IntegrityError(`node_modules must be absent or a real directory at ${path.relative(ROOT, packageAbs)}; got ${kind}`);
  }
  return { kind: "directory", identity: identityOf(stats) };
}

export function captureTargetLedger(target, host) {
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

export function verifyTargetIdentity(entry) {
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

export function verifyInitialTargetState(entry) {
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

export function captureAlignedTargetState(entry, host) {
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

export function verifyAlignedTargetState(entry, host) {
  const captured = captureAlignedTargetState(entry, host);
  const expectedIdentity = entry.nodeModulesBefore.kind === "directory"
    ? entry.nodeModulesBefore.identity
    : entry.alignedNodeModulesIdentity;
  if (!expectedIdentity || !identitiesMatch(captured.nodeModulesIdentity, expectedIdentity)) {
    throw new IntegrityError(`aligned node_modules identity changed: ${entry.packagePath}`);
  }
  return captured.packageAbs;
}

export function verifyScenarioCwdIdentity(scenario) {
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

export function restorationError(entry, phase, operation, error, result) {
  return {
    phase,
    packagePath: entry.packagePath,
    operation,
    message: errorMessage(error),
    ...(result?.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    ...(result?.signal ? { signal: result.signal } : {}),
  };
}

export function commandToString(command) {
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

export function describeHostAlignment(host, cwd) {
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

export function summarizeAlignment(alignment) {
  return summarizeSnapshot(alignment.packages);
}

export function snapshotHostPackages(cwd, host) {
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

export function snapshotTargetHostPackages(host) {
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

export function snapshotsMatch(expected, actual) {
  return Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length &&
    expected.every((entry, index) => actual[index]?.packageName === entry.packageName &&
      actual[index].installedVersion === entry.installedVersion);
}

export function summarizeSnapshot(snapshot) {
  return snapshot
    .map((entry) => `${entry.packageName}=${entry.installedVersion ?? "missing"}`)
    .join(", ");
}

export function buildInstallCommand(host) {
  return ["npm", "install", "--no-save", "--package-lock=false", ...hostInstallSpecifiers(host)];
}

export function buildRestoreCommands(snapshot) {
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
