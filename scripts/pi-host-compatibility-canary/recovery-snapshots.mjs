// Pure snapshot contract. No history fields are invented for old journals.
const fail = message => { throw Object.assign(new Error(message), { code: "PI_HOST_COMPAT_INTEGRITY" }); };

export function captureFinalRecoverySnapshots(targets, readSnapshot) {
  return new Map(targets.filter(target => target.initialNodeModules.kind === "directory").map(target => [
    target.index,
    // Baseline-only targets have no authorized install effect: preserve what was
    // actually admitted, not possibly different lockfile versions. Capture BEFORE
    // any target recovery can mutate a linked consumer. Other states use the journal.
    structuredClone(target.state === "baselined" ? readSnapshot(target) : target.restoreSnapshot),
  ]));
}

export function verifyFinalRecoverySnapshot(target, expectedSnapshots, actual) {
  const expected = expectedSnapshots?.get(target.index);
  if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length ||
      expected.some((entry, index) => entry.packageName !== actual[index]?.packageName ||
        entry.installedVersion !== actual[index]?.installedVersion)) {
    fail(`final recovery host snapshot drifted: ${target.declaredPath}`);
  }
}
