// ---
// summary: "Aligns and restores scenario host dependencies while preserving target identity and cleanup ordering."
// read_when:
//   - "Changing canary host preparation, restoration ordering, or final all-target barriers."
// ---
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import {
  errorMessage,
  identitiesMatch,
  identityOf,
  IntegrityError,
  isIntegrityError,
  removeDirectoryByHandle,
} from "./integrity.mjs";
import { resolveScenarioPackageTargets } from "./manifest.mjs";
import {
  buildInstallCommand,
  buildRestoreCommands,
  captureAlignedTargetState,
  captureTargetLedger,
  commandToString,
  nodeModulesState,
  restorationError,
  snapshotHostPackages,
  snapshotsMatch,
  snapshotTargetHostPackages,
  summarizeAlignment,
  summarizeSnapshot,
  verifyInitialTargetState,
  verifyScenarioCwdIdentity,
  verifyTargetIdentity,
} from "./host-state.mjs";
import { spawnWithNeutralNpmEnv } from "./process.mjs";

export async function ensureScenarioHost(host, scenario, options, preparationTracker) {
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

export async function restoreScenarioHost(host, hostPreparation, options) {
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
