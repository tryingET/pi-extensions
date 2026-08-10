// ---
// summary: "Aligns and restores scenario host dependencies with journaled crash-recovery boundaries."
// read_when:
//   - "Changing canary host preparation, durable mutation intent, or restoration ordering."
// ---
import { lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertEffectiveOwner,
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
  durablySyncHostPackageState,
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
import { fsyncDirectory, fsyncFile } from "./state-files.mjs";

function crashBoundary(name) {
  if (process.env.PI_HOST_COMPAT_TEST_SIGKILL_AT === name) process.kill(process.pid, "SIGKILL");
}

function privatePackagePath(entry, packageAbs) {
  Object.defineProperty(entry, "packageAbs", { value: packageAbs, enumerable: false });
  return entry;
}

function assertOwnedDirectory(directoryPath, expectedIdentity, label) {
  const stats = lstatSync(directoryPath, { bigint: true, throwIfNoEntry: false });
  if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) {
    throw new IntegrityError(`${label} is not an identity-proven directory`);
  }
  assertEffectiveOwner(stats, label);
  const identity = identityOf(stats);
  if (expectedIdentity && !identitiesMatch(identity, expectedIdentity)) {
    throw new IntegrityError(`${label} identity changed`);
  }
  return identity;
}

function prepareAbsentNodeModules(entry, packageAbs, mutationSession) {
  const nodeModulesPath = path.join(packageAbs, "node_modules");
  const names = mutationSession.artifactNames(entry);
  const stagePath = path.join(packageAbs, names.stage);
  const quarantinePath = path.join(packageAbs, names.quarantine);
  if (lstatSync(nodeModulesPath, { throwIfNoEntry: false })) {
    throw new IntegrityError(`node_modules appeared before runner staging: ${entry.packagePath}`);
  }
  if (lstatSync(stagePath, { throwIfNoEntry: false }) || lstatSync(quarantinePath, { throwIfNoEntry: false })) {
    throw new IntegrityError(`runner recovery artifact already exists: ${entry.packagePath}`);
  }
  mutationSession.validateEntryMetadata(entry);
  mutationSession.transition(entry, "stage-create-intent");
  mutationSession.assertOwned();
  mkdirSync(stagePath, { mode: 0o700 });
  fsyncDirectory(packageAbs);
  crashBoundary("stage-mkdir");
  entry.stageIdentity = assertOwnedDirectory(stagePath, null, "runner stage");
  mutationSession.transition(entry, "stage-create-intent", { stageIdentity: entry.stageIdentity });
  crashBoundary("stage-identity");
  mutationSession.assertOwned();
  const markerPath = path.join(stagePath, ".pi-host-compat-owner");
  writeFileSync(markerPath, `${mutationSession.artifactToken(entry)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  fsyncFile(markerPath);
  fsyncDirectory(stagePath);
  fsyncDirectory(packageAbs);
  crashBoundary("stage-marker");
  mutationSession.transition(entry, "stage-created", { stageIdentity: entry.stageIdentity });
  mutationSession.validateEntryMetadata(entry);
  mutationSession.transition(entry, "stage-promote-intent", { stageIdentity: entry.stageIdentity });
  mutationSession.assertOwned();
  renameSync(stagePath, nodeModulesPath);
  fsyncDirectory(packageAbs);
  entry.alignedNodeModulesIdentity = assertOwnedDirectory(
    nodeModulesPath,
    entry.stageIdentity,
    "runner-created node_modules",
  );
  mutationSession.transition(entry, "owned-node-modules", {
    stageIdentity: entry.stageIdentity,
    ownedNodeModulesIdentity: entry.alignedNodeModulesIdentity,
  });
}

export async function ensureScenarioHost(host, scenario, options, preparationTracker, mutationSession) {
  verifyScenarioCwdIdentity(scenario);
  const targetSnapshot = snapshotTargetHostPackages(host);
  let packagePreparations;
  try {
    const resolvedTargets = resolveScenarioPackageTargets(scenario);
    packagePreparations = resolvedTargets.map((target) => {
      const entry = privatePackagePath(captureTargetLedger(target, host), target.packageAbs);
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
    // Object spread drops non-enumerable packageAbs; restore it without changing JSON schemas.
    packagePreparations.forEach((entry, index) => {
      privatePackagePath(entry, resolvedTargets[index].packageAbs);
    });
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    throw new IntegrityError(`Scenario target preflight failed: ${errorMessage(error)}`);
  }
  preparationTracker.packages = packagePreparations;
  mutationSession?.bindScenario(scenario, host, packagePreparations);
  crashBoundary("pre-alignment");
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
  mutationSession.recordAlignmentEffectsIntent();
  for (const entry of packagePreparations) {
    entry.afterAlignment = entry.alignment;
    const packageAbs = verifyInitialTargetState(entry);
    if (entry.alignment.aligned) continue;
    if (!options.json) {
      console.log(`    host[${entry.packagePath}]: aligning to ${host.packageName}@${host.version}`);
      console.log(`    host_before[${entry.packagePath}]: ${summarizeSnapshot(entry.beforeSnapshot)}`);
    }

    verifyInitialTargetState(entry);
    if (entry.nodeModulesBefore.kind === "absent") {
      prepareAbsentNodeModules(entry, packageAbs, mutationSession);
    }
    mutationSession.validateEntryMetadata(entry);
    mutationSession.transition(entry, "alignment-intent", {
      ownedNodeModulesIdentity: entry.alignedNodeModulesIdentity,
    });
    entry.install = await spawnWithNeutralNpmEnv(entry.command[0], entry.command.slice(1), {
      cwd: packageAbs,
      stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
      beforeRelease: (identity) => {
        const rebound = verifyTargetIdentity(entry);
        if (rebound !== packageAbs) throw new IntegrityError(`npm target path changed: ${entry.packagePath}`);
        mutationSession.validateEntryMetadata(entry);
        const current = nodeModulesState(rebound);
        const expectedIdentity = entry.nodeModulesBefore.kind === "directory"
          ? entry.nodeModulesBefore.identity
          : entry.stageIdentity;
        if (current.kind !== "directory" || !identitiesMatch(current.identity, expectedIdentity)) {
          throw new IntegrityError(`npm target tree identity changed: ${entry.packagePath}`);
        }
        mutationSession.recordChild(entry, "align-host", identity);
      },
    });
    if (!entry.install.effectMayBeActive) mutationSession.clearChild();
    entry.changed = true;
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
    mutationSession.transition(entry, "aligned", {
      ownedNodeModulesIdentity: entry.nodeModulesBefore.kind === "absent"
        ? entry.alignedNodeModulesIdentity
        : undefined,
    });
    crashBoundary("post-alignment");
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

function removeExactArtifact(artifactPath, expectedIdentity, label, packageAbs) {
  const identity = assertOwnedDirectory(artifactPath, expectedIdentity, label);
  removeDirectoryByHandle(artifactPath, identity);
  fsyncDirectory(packageAbs);
}

function cleanupInitiallyAbsent(entry, packageAbs, mutationSession) {
  const names = mutationSession.artifactNames(entry);
  const nodeModulesPath = path.join(packageAbs, "node_modules");
  const stagePath = path.join(packageAbs, names.stage);
  const quarantinePath = path.join(packageAbs, names.quarantine);
  const present = [nodeModulesPath, stagePath, quarantinePath].filter(
    (candidate) => lstatSync(candidate, { throwIfNoEntry: false }),
  );
  mutationSession.validateEntryMetadata(entry);
  if (present.length > 1) throw new IntegrityError(`multiple runner artifacts exist: ${entry.packagePath}`);

  if (present[0] === stagePath) {
    const stageIdentity = assertOwnedDirectory(stagePath, entry.stageIdentity, "runner stage");
    mutationSession.transition(entry, "stage-remove-intent", { stageIdentity });
    mutationSession.assertOwned();
    removeExactArtifact(stagePath, stageIdentity, "runner stage", packageAbs);
  } else if (present[0] === nodeModulesPath) {
    const current = nodeModulesState(packageAbs);
    if (!identitiesMatch(current.identity, entry.alignedNodeModulesIdentity)) {
      throw new IntegrityError(`runner-created node_modules identity changed: ${entry.packagePath}`);
    }
    mutationSession.transition(entry, "detach-intent", {
      ownedNodeModulesIdentity: current.identity,
    });
    mutationSession.assertOwned();
    renameSync(nodeModulesPath, quarantinePath);
    fsyncDirectory(packageAbs);
    const quarantineIdentity = assertOwnedDirectory(
      quarantinePath,
      current.identity,
      "node_modules quarantine",
    );
    mutationSession.transition(entry, "quarantined", { quarantineIdentity });
    crashBoundary("post-quarantine");
    mutationSession.transition(entry, "quarantine-remove-intent", { quarantineIdentity });
    mutationSession.assertOwned();
    removeExactArtifact(quarantinePath, quarantineIdentity, "node_modules quarantine", packageAbs);
  } else if (present[0] === quarantinePath) {
    const quarantineIdentity = assertOwnedDirectory(
      quarantinePath,
      entry.alignedNodeModulesIdentity,
      "node_modules quarantine",
    );
    mutationSession.transition(entry, "quarantine-remove-intent", { quarantineIdentity });
    mutationSession.assertOwned();
    removeExactArtifact(quarantinePath, quarantineIdentity, "node_modules quarantine", packageAbs);
  }
  if (lstatSync(nodeModulesPath, { throwIfNoEntry: false })) {
    throw new IntegrityError("expected node_modules to be absent after restoration");
  }
}

export async function restoreScenarioHost(host, hostPreparation, options, mutationSession) {
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
    try { packageAbs = verifyTargetIdentity(entry); }
    catch (error) {
      record("identity", "verify-package", error);
      restoredPackages.push(restoredPackage);
      continue;
    }
    const nodeModulesPath = path.join(packageAbs, "node_modules");

    if (entry.nodeModulesBefore.kind === "absent") {
      try {
        const beforePresent = lstatSync(nodeModulesPath, { throwIfNoEntry: false });
        cleanupInitiallyAbsent(entry, packageAbs, mutationSession);
        changed ||= Boolean(beforePresent || entry.stageIdentity);
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
        mutationSession.validateEntryMetadata(entry);
        mutationSession.transition(entry, "recreate-preexisting-intent");
        mutationSession.assertOwned();
        mkdirSync(nodeModulesPath);
        fsyncDirectory(packageAbs);
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
        mutationSession.validateEntryMetadata(entry);
        mutationSession.transition(entry, "restore-command-intent");
        restoreResult = await spawnWithNeutralNpmEnv(
          restoreCommand[0],
          restoreCommand.slice(1),
          {
            cwd: packageAbs,
            stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
            beforeRelease: (identity) => {
              const rebound = verifyTargetIdentity(entry);
              if (rebound !== packageAbs) throw new IntegrityError(`restore target path changed: ${entry.packagePath}`);
              mutationSession.validateEntryMetadata(entry);
              const beforeEffect = nodeModulesState(rebound);
              if (
                beforeEffect.kind !== "directory" ||
                !identitiesMatch(beforeEffect.identity, restoreNodeModulesIdentity)
              ) throw new IntegrityError(`restore target tree identity changed: ${entry.packagePath}`);
              mutationSession.recordChild(entry, "restore-host", identity);
            },
          },
        );
        if (restoreResult.effectMayBeActive) {
          throw new IntegrityError("restore command process group could not be proven stopped");
        }
        mutationSession.clearChild();
      } catch (error) {
        restoreResult = { ok: false, exitCode: 1, signal: null, error: errorMessage(error) };
      }
      if (mutationSession.hasRecordedChild()) {
        throw new IntegrityError("restore effect identity remains active or unknown");
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
    const restoredPackage = restoredPackages.find((candidate) => candidate.packagePath === entry.packagePath);
    try {
      const packageAbs = verifyTargetIdentity(entry);
      const finalState = nodeModulesState(packageAbs);
      if (entry.nodeModulesBefore.kind === "absent") {
        if (finalState.kind !== "absent") {
          throw new IntegrityError(`final node_modules state is not absent: ${entry.packagePath}`);
        }
      } else {
        if (finalState.kind !== "directory" || !identitiesMatch(finalState.identity, entry.nodeModulesBefore.identity)) {
          throw new IntegrityError(`final pre-existing node_modules identity changed: ${entry.packagePath}`);
        }
        const expected = entry.restoreSnapshot ?? entry.beforeSnapshot ?? [];
        const actual = snapshotHostPackages(packageAbs, host);
        if (!snapshotsMatch(expected, actual)) {
          throw new Error(`final host snapshot expected ${summarizeSnapshot(expected)}, got ${summarizeSnapshot(actual)}`);
        }
        durablySyncHostPackageState(packageAbs, host);
      }
      if ((restoredPackage?.errors?.length ?? 0) === 0) mutationSession.markTargetRestored(entry);
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
