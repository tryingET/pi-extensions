// ---
// summary: "Inspects and safely recovers hard-interrupted Pi host canary mutations."
// read_when:
//   - "Changing automatic cleanup, explicit npm recovery, or recovery status behavior."
// ---
import { lstatSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import {
  assertEffectiveOwner,
  identitiesMatch,
  identityOf,
  IntegrityError,
  removeDirectoryByHandle,
} from "./integrity.mjs";
import {
  buildRestoreCommands,
  durablySyncHostPackageState,
  nodeModulesState,
  resolveRestoreSnapshot,
  snapshotHostPackages,
  snapshotsMatch,
  verifyTargetIdentity,
} from "./host-state.mjs";
import { resolveProfileHost, resolveScenarioPackageTargets } from "./manifest.mjs";
import { spawnWithNeutralNpmEnv } from "./process.mjs";
import { CANONICAL_ROOT } from "./paths.mjs";
import { persistRecoveredJournal, RecoveryRequiredError } from "./recovery-journal.mjs";
import {
  acquireStateGate,
  acquireCheckoutRecoveryLock,
  childLiveness,
  ConcurrentCanaryError,
  JOURNAL_KIND,
  LOCK_KIND,
  manifestStateBinding,
  readCheckoutState,
  recordLiveness,
  validateTargetMetadata,
} from "./state-store.mjs";
import { ownersMatch } from "./state-lock.mjs";
import {
  fsyncDirectory,
  MAX_JOURNAL_BYTES,
  MAX_LOCK_BYTES,
  recoveryStatePaths,
  removeStateFile,
  sha256,
} from "./state-files.mjs";

function artifactNames(payload, target) {
  const prefix = `.node_modules.pi-host-compat-${payload.runId}-${target.index}`;
  return { stage: `${prefix}.stage`, quarantine: `${prefix}.quarantine` };
}

function safeIdentity(value) {
  return value ? { dev: String(value.dev), ino: String(value.ino) } : null;
}

function assertDirectoryArtifact(artifactPath, expectedIdentity, label) {
  const stats = lstatSync(artifactPath, { bigint: true, throwIfNoEntry: false });
  if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) {
    throw new IntegrityError(`${label} is not an identity-proven directory`);
  }
  assertEffectiveOwner(stats, label);
  const actual = identityOf(stats);
  if (expectedIdentity && !identitiesMatch(actual, expectedIdentity)) {
    throw new IntegrityError(`${label} identity drifted`);
  }
  return actual;
}

function assertStageMarker(stagePath, target) {
  const markerPath = path.join(stagePath, ".pi-host-compat-owner");
  const stats = lstatSync(markerPath, { bigint: true, throwIfNoEntry: false });
  if (!stats || !stats.isFile() || stats.isSymbolicLink() || (Number(stats.mode) & 0o077) !== 0 || stats.size > 128n) {
    throw new IntegrityError(`runner stage marker is invalid for ${target.declaredPath}`);
  }
  assertEffectiveOwner(stats, "runner stage marker");
  if (readFileSync(markerPath, "utf8") !== `${target.artifactToken}\n`) {
    throw new IntegrityError(`runner stage marker token mismatched for ${target.declaredPath}`);
  }
}

function assertUnmarkedStage(stagePath, target) {
  const identity = assertDirectoryArtifact(stagePath, null, "unmarked runner stage");
  if (target.state !== "stage-create-intent" || readdirSync(stagePath).length !== 0) {
    throw new IntegrityError(`unmarked runner stage is not safely empty for ${target.declaredPath}`);
  }
  return identity;
}

function assertRecoveryFence(context) {
  context.gate.assertOwned();
  const ownedRecovery = context.recoveryLock.assertOwned();
  const state = readCheckoutState(context.gate.paths, context.manifestBinding);
  if (
    !state.recoveryLock ||
    !identitiesMatch(state.recoveryLock.identity, ownedRecovery.identity) ||
    !ownersMatch(state.recoveryLock.payload.owner, context.recoveryLock.owner) ||
    JSON.stringify(state.recoveryLock.payload) !== JSON.stringify(context.recoveryLock.record.payload)
  ) throw new ConcurrentCanaryError("checkout recovery ownership changed");
  for (const [name, expected] of [["lock", context.lock], ["journal", context.journal]]) {
    const current = state[name];
    if (!expected) {
      if (current) throw new ConcurrentCanaryError(`unexpected mutation ${name} appeared during recovery`);
      continue;
    }
    if (
      !current || !identitiesMatch(current.identity, expected.identity) ||
      current.payload.runId !== expected.payload.runId ||
      !ownersMatch(current.payload.owner, expected.payload.owner) ||
      (name === "journal" && current.payload.revision !== expected.payload.revision) ||
      sha256(JSON.stringify(current.payload)) !== context[`${name}Digest`]
    ) throw new ConcurrentCanaryError(`mutation ${name} ownership changed during recovery`);
  }
  return state;
}

function persist(context) {
  assertRecoveryFence(context);
  context.journal = persistRecoveredJournal(context.journal, context.payload);
  context.journalDigest = sha256(JSON.stringify(context.payload));
  assertRecoveryFence(context);
}

function validateJournalScenario(manifest, payload) {
  const scenario = manifest.scenarios.find((entry) => entry.id === payload.scenarioId);
  if (!scenario || !scenario.profiles.includes(payload.profile)) {
    throw new IntegrityError("recovery journal scenario is not present in the bound manifest profile");
  }
  const host = resolveProfileHost(manifest, payload.profile);
  if (
    host.packageName !== payload.host?.packageName ||
    host.version !== payload.host?.version ||
    JSON.stringify(host.companionPackages) !== JSON.stringify(payload.host?.companionPackages)
  ) throw new IntegrityError("recovery journal host contract drifted from the bound manifest");
  const resolvedTargets = resolveScenarioPackageTargets(scenario);
  if (resolvedTargets.length !== payload.targets.length) {
    throw new IntegrityError("recovery journal target count drifted from the bound manifest");
  }
  const targets = resolvedTargets.map((resolved, index) => {
    const journalTarget = payload.targets[index];
    const stats = statSync(resolved.packageAbs, { bigint: true });
    assertEffectiveOwner(stats, `recovery package root ${resolved.declaredPath}`);
    const canonicalPackagePath = path.relative(CANONICAL_ROOT, resolved.packageAbs);
    if (
      journalTarget.index !== index ||
      journalTarget.declaredPath !== resolved.declaredPath ||
      journalTarget.canonicalPackagePath !== canonicalPackagePath ||
      !identitiesMatch(journalTarget.packageIdentity, identityOf(stats))
    ) throw new IntegrityError(`recovery target identity drifted at index ${index}`);
    validateTargetMetadata(journalTarget, resolved.packageAbs);
    return { resolved, journalTarget };
  });
  return { scenario, host, targets };
}

function removeArtifact(context, target, artifactPath, identity, nextState) {
  const packageAbs = verifyTargetIdentity(target);
  if (path.dirname(artifactPath) !== packageAbs) throw new IntegrityError("recovery artifact left its package root");
  validateTargetMetadata(target, packageAbs);
  target.state = nextState;
  persist(context);
  assertRecoveryFence(context);
  if (verifyTargetIdentity(target) !== packageAbs) throw new IntegrityError("recovery package root changed before removal");
  assertDirectoryArtifact(artifactPath, identity, "recovery removal artifact");
  removeDirectoryByHandle(artifactPath, identity);
  fsyncDirectory(packageAbs);
}

function recoverAbsentTarget(context, target, packageAbs) {
  if (verifyTargetIdentity(target) !== packageAbs) throw new IntegrityError("recovery package root changed");
  validateTargetMetadata(target, packageAbs);
  const names = artifactNames(context.payload, target);
  const nodeModulesPath = path.join(packageAbs, "node_modules");
  const stagePath = path.join(packageAbs, names.stage);
  const quarantinePath = path.join(packageAbs, names.quarantine);
  const found = [nodeModulesPath, stagePath, quarantinePath].filter(
    (candidate) => lstatSync(candidate, { throwIfNoEntry: false }),
  );
  if (found.length > 1) throw new IntegrityError(`multiple recovery artifacts exist for ${target.declaredPath}`);

  if (target.state === "baselined") {
    if (found.length > 0) throw new IntegrityError(`unknown tree appeared before mutation at ${target.declaredPath}`);
    target.state = "restored";
    persist(context);
    return;
  }

  if (found[0] === stagePath) {
    const expected = target.stageIdentity;
    if (!expected && target.state !== "stage-create-intent") {
      throw new IntegrityError(`runner stage identity is unavailable for ${target.declaredPath}`);
    }
    let identity;
    if (!expected) {
      const marker = lstatSync(path.join(stagePath, ".pi-host-compat-owner"), { throwIfNoEntry: false });
      if (marker) {
        assertStageMarker(stagePath, target);
        identity = assertDirectoryArtifact(stagePath, null, "runner stage");
      } else {
        identity = assertUnmarkedStage(stagePath, target);
      }
    } else {
      identity = assertDirectoryArtifact(stagePath, expected, "runner stage");
    }
    target.stageIdentity = safeIdentity(identity);
    removeArtifact(context, target, stagePath, identity, "recovery-stage-remove-intent");
  } else if (found[0] === nodeModulesPath) {
    const expected = target.ownedNodeModulesIdentity ?? target.stageIdentity;
    if (!expected) throw new IntegrityError(`runner-created tree identity is unavailable for ${target.declaredPath}`);
    const identity = assertDirectoryArtifact(nodeModulesPath, expected, "runner-created node_modules");
    if (lstatSync(quarantinePath, { throwIfNoEntry: false })) {
      throw new IntegrityError(`recovery quarantine already exists for ${target.declaredPath}`);
    }
    target.state = "recovery-detach-intent";
    target.ownedNodeModulesIdentity = safeIdentity(identity);
    persist(context);
    assertRecoveryFence(context);
    if (verifyTargetIdentity(target) !== packageAbs) throw new IntegrityError("recovery package root changed before quarantine");
    validateTargetMetadata(target, packageAbs);
    assertDirectoryArtifact(nodeModulesPath, identity, "runner-created node_modules");
    renameSync(nodeModulesPath, quarantinePath);
    fsyncDirectory(packageAbs);
    const movedIdentity = assertDirectoryArtifact(quarantinePath, identity, "recovery quarantine");
    target.state = "recovery-quarantined";
    target.quarantineIdentity = safeIdentity(movedIdentity);
    persist(context);
    removeArtifact(context, target, quarantinePath, movedIdentity, "recovery-quarantine-remove-intent");
  } else if (found[0] === quarantinePath) {
    const expected = target.quarantineIdentity ?? target.ownedNodeModulesIdentity ?? target.stageIdentity;
    if (!expected) throw new IntegrityError(`quarantine identity is unavailable for ${target.declaredPath}`);
    const identity = assertDirectoryArtifact(quarantinePath, expected, "recovery quarantine");
    target.quarantineIdentity = safeIdentity(identity);
    removeArtifact(context, target, quarantinePath, identity, "recovery-quarantine-remove-intent");
  }

  if (
    lstatSync(nodeModulesPath, { throwIfNoEntry: false }) ||
    lstatSync(stagePath, { throwIfNoEntry: false }) ||
    lstatSync(quarantinePath, { throwIfNoEntry: false })
  ) throw new IntegrityError(`runner artifacts remain after recovery for ${target.declaredPath}`);
  target.state = "restored";
  target.quarantineIdentity = null;
  persist(context);
}

function derivedRestoreSnapshot(target, packageAbs, host) {
  if (!target.metadata?.packageLock?.present) {
    throw new RecoveryRequiredError(`explicit recovery cannot derive restore commands without package-lock.json: ${target.declaredPath}`);
  }
  const derived = resolveRestoreSnapshot(packageAbs, host, []);
  if (!snapshotsMatch(derived, target.restoreSnapshot)) {
    throw new IntegrityError(`lockfile-derived restore snapshot drifted for ${target.declaredPath}`);
  }
  return derived;
}

function resolvePresentPackage(target, expectedPath) {
  const packageAbs = verifyTargetIdentity(target);
  if (expectedPath && packageAbs !== expectedPath) {
    throw new IntegrityError(`canonical package root changed for ${target.declaredPath}`);
  }
  const stats = statSync(packageAbs, { bigint: true });
  assertEffectiveOwner(stats, `explicit recovery package root ${target.declaredPath}`);
  validateTargetMetadata(target, packageAbs);
  return packageAbs;
}

function verifyPresentTree(target, packageAbs, label) {
  const current = nodeModulesState(packageAbs);
  if (current.kind !== "directory" || !identitiesMatch(current.identity, target.initialNodeModules.identity)) {
    throw new IntegrityError(`${label} for ${target.declaredPath}`);
  }
  const stats = lstatSync(path.join(packageAbs, "node_modules"), { bigint: true });
  assertEffectiveOwner(stats, `pre-existing node_modules ${target.declaredPath}`);
  return current;
}

async function recoverPresentTarget(context, target, packageAbs, host, apply) {
  packageAbs = resolvePresentPackage(target, packageAbs);
  verifyPresentTree(target, packageAbs, "pre-existing node_modules identity drifted");
  if (target.state === "baselined") {
    target.state = "restored";
    persist(context);
    return;
  }
  const expected = derivedRestoreSnapshot(target, packageAbs, host);
  if (snapshotsMatch(expected, snapshotHostPackages(packageAbs, host))) {
    target.state = "restored";
    persist(context);
    return;
  }
  if (!apply) {
    throw new RecoveryRequiredError(
      `pre-existing node_modules requires explicit recovery: node ./scripts/pi-host-compatibility-canary.mjs recover --apply --manifest ${context.payload.manifest.relativePath}`,
    );
  }

  for (const command of buildRestoreCommands(expected)) {
    packageAbs = resolvePresentPackage(target, packageAbs);
    verifyPresentTree(target, packageAbs, "pre-existing node_modules changed before explicit recovery");
    target.state = "recovery-restore-command-intent";
    context.payload.recoveryOwner = context.recoveryLock.owner;
    persist(context);
    assertRecoveryFence(context);
    const commandPackageAbs = resolvePresentPackage(target, packageAbs);
    verifyPresentTree(target, commandPackageAbs, "pre-existing node_modules changed before npm spawn");
    const result = await spawnWithNeutralNpmEnv(command[0], command.slice(1), {
      cwd: commandPackageAbs,
      stdio: context.json ? ["ignore", "pipe", "pipe"] : "inherit",
      beforeRelease: (identity) => {
        const releasedPackageAbs = resolvePresentPackage(target, commandPackageAbs);
        verifyPresentTree(target, releasedPackageAbs, "pre-existing node_modules changed before npm release");
        context.payload.child = { effect: "explicit-restore-host", targetIndex: target.index, identity };
        persist(context);
      },
    });
    if (!result.effectMayBeActive && context.payload.child) {
      context.payload.child = null;
      persist(context);
    }
    if (result.effectMayBeActive) {
      throw new RecoveryRequiredError(`explicit host restoration process group remains active for ${target.declaredPath}`);
    }
    if (!result.ok) {
      throw new RecoveryRequiredError(`explicit host restoration failed for ${target.declaredPath}: ${result.error ?? `exit ${result.exitCode}`}`);
    }
  }
  packageAbs = resolvePresentPackage(target, packageAbs);
  const finalState = verifyPresentTree(target, packageAbs, "explicit host restoration changed node_modules identity");
  if (!snapshotsMatch(expected, snapshotHostPackages(packageAbs, host))) {
    throw new IntegrityError(`explicit host restoration verification failed for ${target.declaredPath}`);
  }
  assertRecoveryFence(context);
  durablySyncHostPackageState(packageAbs, host);
  if (!identitiesMatch(finalState.identity, target.initialNodeModules.identity)) {
    throw new IntegrityError(`explicit host restoration final identity drifted for ${target.declaredPath}`);
  }
  target.state = "restored";
  persist(context);
}

function removeCompletedState(context) {
  context.payload.phase = "clean";
  context.payload.child = null;
  persist(context);
  let state = assertRecoveryFence(context);
  removeStateFile(context.gate.paths.lockPath, state.lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
  context.lock = null;
  context.lockDigest = null;
  state = assertRecoveryFence(context);
  removeStateFile(state.journal.path, state.journal.identity, JOURNAL_KIND, MAX_JOURNAL_BYTES);
  context.journal = null;
  context.journalDigest = null;
  assertRecoveryFence(context);
}

function ownerIsRecoverable(state) {
  const owner = recordLiveness(state.lock ?? state.journal);
  if (owner === "active") throw new ConcurrentCanaryError("a canary mutation owner is still active");
  if (owner !== "dead") throw new IntegrityError("canary mutation owner identity cannot be proven stale");
  const child = childLiveness(state.journal);
  if (child === "active") throw new ConcurrentCanaryError("an interrupted canary child process is still active");
  if (child === "unknown") throw new IntegrityError("interrupted canary child identity cannot be proven stale");
  return child;
}

export async function recoverInterruptedRun(manifest, options = {}) {
  const manifestBinding = manifestStateBinding(manifest);
  const gate = acquireStateGate(options.env ?? process.env);
  const context = { gate, manifestBinding, json: options.json === true };
  try {
    const state = readCheckoutState(gate.paths, manifestBinding);
    if (state.recoveryLock) {
      const liveness = recordLiveness(state.recoveryLock);
      if (liveness === "active") throw new ConcurrentCanaryError("checkout recovery is active");
      throw new IntegrityError("stale checkout recovery claim requires manual review");
    }
    if (!state.lock && !state.journal) return { status: "clean", recovered: false, applied: false };

    if (state.lock && !state.journal) {
      const liveness = recordLiveness(state.lock);
      if (liveness === "active") throw new ConcurrentCanaryError("a canary mutation lock is active");
      if (liveness !== "dead") throw new IntegrityError("mutation lock owner identity cannot be proven stale");
      if (state.lock.payload.state !== "initializing") {
        throw new IntegrityError("journal-ready mutation lock is missing its recovery journal");
      }
    } else if (!state.lock && state.journal) {
      ownerIsRecoverable(state);
      const cleanOrReady = ["clean", "ready"].includes(state.journal.payload.phase) && state.journal.payload.targets.length === 0;
      if (!cleanOrReady) throw new IntegrityError("recovery journal is missing its mutation lock");
    } else {
      ownerIsRecoverable(state);
    }

    gate.assertOwned();
    context.recoveryLock = acquireCheckoutRecoveryLock(gate.paths);
    context.lock = state.lock;
    context.journal = state.journal;
    context.payload = state.journal?.payload;
    context.lockDigest = state.lock ? sha256(JSON.stringify(state.lock.payload)) : null;
    context.journalDigest = state.journal ? sha256(JSON.stringify(state.journal.payload)) : null;
    const fenced = assertRecoveryFence(context);

    if (context.lock && !context.journal) {
      removeStateFile(gate.paths.lockPath, fenced.lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
      context.lock = null;
      context.lockDigest = null;
      assertRecoveryFence(context);
      return { status: "recovered", recovered: true, applied: false, recoveryMode: "initialization-cleanup" };
    }
    if (!context.lock && context.journal) {
      removeStateFile(fenced.journal.path, fenced.journal.identity, JOURNAL_KIND, MAX_JOURNAL_BYTES);
      context.journal = null;
      context.journalDigest = null;
      assertRecoveryFence(context);
      return { status: "recovered", recovered: true, applied: false, recoveryMode: "completed-journal-cleanup" };
    }

    if (context.payload.child) {
      context.payload.child = null;
      persist(context);
    }
    if (["clean", "ready"].includes(context.payload.phase) && context.payload.targets.length === 0) {
      removeCompletedState(context);
      return { status: "recovered", recovered: true, applied: false, recoveryMode: "completed-run-cleanup" };
    }

    const bound = validateJournalScenario(manifest, context.payload);
    for (const { resolved, journalTarget } of bound.targets) {
      verifyTargetIdentity(journalTarget);
      if (journalTarget.initialNodeModules.kind === "absent") {
        recoverAbsentTarget(context, journalTarget, resolved.packageAbs);
      } else if (journalTarget.initialNodeModules.kind === "directory") {
        await recoverPresentTarget(context, journalTarget, resolved.packageAbs, bound.host, options.apply === true);
      } else {
        throw new IntegrityError(`unsupported initial node_modules state for ${journalTarget.declaredPath}`);
      }
    }
    context.payload.phase = "ready";
    context.payload.scenarioId = null;
    context.payload.targets = [];
    delete context.payload.host;
    persist(context);
    removeCompletedState(context);
    return {
      status: "recovered",
      recovered: true,
      applied: options.apply === true,
      recoveryMode: options.apply ? "explicit-apply" : "automatic-safe",
    };
  } finally {
    try { context.recoveryLock?.release(); }
    finally { gate.release(); }
  }
}

function summarizeState(state) {
  if (!state.lock && !state.journal && !state.recoveryLock) {
    return { status: "clean", recoveryRequired: false };
  }
  const ownerLiveness = recordLiveness(state.lock ?? state.journal);
  const recoveryLiveness = recordLiveness(state.recoveryLock);
  const effectLiveness = childLiveness(state.journal);
  const targets = state.journal?.payload.targets.map((target) => ({
    index: target.index,
    packagePath: target.declaredPath,
    initialNodeModules: target.initialNodeModules.kind,
    state: target.state,
  })) ?? [];
  return {
    status: ownerLiveness === "active" || effectLiveness === "active" || recoveryLiveness === "active"
      ? "active"
      : "recovery-required",
    recoveryRequired: ownerLiveness !== "active" && recoveryLiveness !== "active",
    runId: state.journal?.payload.runId ?? state.lock?.payload.runId,
    ownerLiveness,
    recoveryLiveness,
    childLiveness: effectLiveness,
    phase: state.journal?.payload.phase ?? state.lock?.payload.state,
    profile: state.journal?.payload.profile ?? null,
    scenarioId: state.journal?.payload.scenarioId ?? null,
    requiresApply: targets.some((target) =>
      target.initialNodeModules === "directory" && !["baselined", "restored"].includes(target.state)),
    targets,
  };
}

export function recoveryStatus(manifest, env = process.env) {
  const manifestBinding = manifestStateBinding(manifest);
  const paths = recoveryStatePaths(env, { create: false });
  const state = readCheckoutState(paths, manifestBinding);
  return { manifestPath: manifest.manifestPath, checkout: CANONICAL_ROOT, ...summarizeState(state) };
}
