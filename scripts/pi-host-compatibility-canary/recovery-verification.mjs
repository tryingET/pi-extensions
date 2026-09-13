// Read-only target verification for recovery completion barriers.
import { lstatSync, statSync } from "node:fs";
import path from "node:path";
import { assertEffectiveOwner, identitiesMatch, identityOf, IntegrityError } from "./integrity.mjs";
import { nodeModulesState, snapshotHostPackages, verifyTargetIdentity } from "./host-state.mjs";
import { verifyFinalRecoverySnapshot } from "./recovery-snapshots.mjs";
import { validateTargetMetadata } from "./state-store.mjs";

export function resolvePresentPackage(target, expectedPath) {
  const packageAbs = verifyTargetIdentity(target);
  if (expectedPath && packageAbs !== expectedPath) {
    throw new IntegrityError(`canonical package root changed for ${target.declaredPath}`);
  }
  const stats = statSync(packageAbs, { bigint: true });
  assertEffectiveOwner(stats, `explicit recovery package root ${target.declaredPath}`);
  validateTargetMetadata(target, packageAbs);
  return packageAbs;
}
export function verifyPresentTree(target, packageAbs, label) {
  const current = nodeModulesState(packageAbs);
  if (current.kind !== "directory" || !identitiesMatch(current.identity, target.initialNodeModules.identity)) {
    throw new IntegrityError(`${label} for ${target.declaredPath}`);
  }
  const stats = lstatSync(path.join(packageAbs, "node_modules"), { bigint: true });
  assertEffectiveOwner(stats, `pre-existing node_modules ${target.declaredPath}`);
  return current;
}

export function verifyRecoveryTargets(payload, final = false, expectedSnapshots = undefined) {
  for (const target of payload.targets) {
    const packageAbs = resolvePresentPackage(target);
    if (target.initialNodeModules.kind === "directory") {
      verifyPresentTree(target, packageAbs, "recovery completion target tree identity changed");
      if (final) {
        verifyFinalRecoverySnapshot(target, expectedSnapshots, snapshotHostPackages(packageAbs, payload.host));
      }
      continue;
    }
    if (target.initialNodeModules.kind !== "absent") throw new IntegrityError("unknown initial target tree");
    const prefix = `.node_modules.pi-host-compat-${payload.runId}-${target.index}`;
    const candidates = [
      ["node_modules", target.ownedNodeModulesIdentity ?? target.stageIdentity],
      [`${prefix}.stage`, target.stageIdentity],
      [`${prefix}.quarantine`, target.quarantineIdentity ?? target.ownedNodeModulesIdentity ?? target.stageIdentity],
    ];
    let found = 0;
    for (const [name, expected] of candidates) {
      const stats = lstatSync(path.join(packageAbs, name), { bigint: true, throwIfNoEntry: false });
      if (!stats) continue;
      found++;
      if (final || target.state === "restored" || !expected || !stats.isDirectory() || stats.isSymbolicLink() ||
          !identitiesMatch(identityOf(stats), expected)) {
        throw new IntegrityError(`recovery completion artifact identity changed: ${target.declaredPath}/${name}`);
      }
      assertEffectiveOwner(stats, `recovery completion artifact ${name}`);
    }
    if (found > 1) throw new IntegrityError(`multiple recovery artifacts: ${target.declaredPath}`);
    // An owned tree cannot disappear silently while a linked target command runs.
    if (!final && found === 0 && ["owned-node-modules", "alignment-intent", "aligned", "scenario-intent",
      "restore-command-intent", "recovery-restore-command-intent"].includes(target.state)) {
      throw new IntegrityError(`recovery completion tree disappeared: ${target.declaredPath}`);
    }
  }
}
