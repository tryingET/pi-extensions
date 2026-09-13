// Final all-target pass: validate every metadata binding before marking ANY target.
import { identitiesMatch, IntegrityError, isIntegrityError } from "./integrity.mjs";
import { durablySyncHostPackageState, nodeModulesState, restorationError, snapshotHostPackages,
  snapshotsMatch, summarizeSnapshot, verifyTargetIdentity } from "./host-state.mjs";
import { verifyWithCompletionHold } from "./mutation-completion.mjs";

export function finishHostRestoration(preparedPackages, restoredPackages, errors, host, mutationSession) {
  verifyWithCompletionHold(() => {
    for (const entry of preparedPackages) {
      verifyTargetIdentity(entry);
      mutationSession.validateEntryMetadata(entry);
    }
  }, (...args) => mutationSession.holdCompletion(...args), "restoration-completion-unverified");
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
    } catch (error) {
      if (isIntegrityError(error)) {
        mutationSession.holdCompletion("restoration-completion-unverified", false);
        throw error;
      }
      const detail = restorationError(entry, "final-barrier", "verify-all-targets", error);
      restoredPackage?.errors?.push(detail);
      errors.push(detail);
    }
  }
  if (errors.length === 0) {
    for (const entry of preparedPackages) mutationSession.markTargetRestored(entry);
  }
}
