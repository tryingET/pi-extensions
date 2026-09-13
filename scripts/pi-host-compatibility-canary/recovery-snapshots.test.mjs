// Pure SDK snapshot proxies and read-only source assertions, NOT lifecycle execution.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureFinalRecoverySnapshots, verifyFinalRecoverySnapshot } from "./recovery-snapshots.mjs";
import { verifyWithCompletionHold } from "./mutation-completion.mjs";

const sdk = version => ["synthetic-host", "synthetic-ai", "synthetic-tui"].map(packageName => ({
  packageName, installedVersion: version,
}));
function targets(state) {
  return [0, 1].map(index => ({ index, declaredPath: `target-${index}`, state,
    initialNodeModules: { kind: "directory", identity: { dev: "1", ino: `${index + 10}` } },
    packageIdentity: { dev: "1", ino: `${index + 20}` }, metadata: { manifest: "unchanged", lock: "unchanged" },
    restoreSnapshot: sdk("0.84.3") }));
}
for (const state of ["baselined", "aligned", "restored"]) for (const index of [0, 1, 2]) {
  test(`callback proxy: later B changes earlier A SDK member ${index}, ${state}, with roots/meta unchanged`, () => {
    const entries = targets(state); const admitted = entries.map(() => sdk(state === "baselined" ? "0.80.0" : "0.84.3"));
    const expected = captureFinalRecoverySnapshots(entries, entry => admitted[entry.index]);
    const unchanged = structuredClone(entries); const events = [];
    verifyFinalRecoverySnapshot(entries[0], expected, admitted[0]); // earlier A was verified
    const after = structuredClone(admitted); after[0][index].installedVersion = "0.99.0";
    assert.deepEqual(entries, unchanged); // only installed SDK snapshot drift, not tree/manifest/lock
    assert.throws(() => {
      verifyWithCompletionHold(() => {
        for (const entry of entries) verifyFinalRecoverySnapshot(entry, expected, after[entry.index]);
      }, reason => events.push(reason), "restoration-completion-unverified");
      events.push("restored-marks", "rebind", "remove-journal");
    }, /final recovery host snapshot drifted/);
    assert.deepEqual(events, ["restoration-completion-unverified"]);
  });
}
test("pure expectation capture preserves baseline actual versions, journals exposed targets, and no absent reads", () => {
  const entries = targets("baselined"); entries[1].state = "aligned";
  entries.push({ index: 2, initialNodeModules: { kind: "absent" }, state: "baselined" });
  const actual = sdk("0.80.0"); const read = [];
  const expected = captureFinalRecoverySnapshots(entries, entry => { read.push(entry.index); return actual; });
  assert.deepEqual(read, [0]);
  assert.deepEqual(expected.get(0), actual); assert.deepEqual(expected.get(1), sdk("0.84.3"));
  assert.equal(expected.has(2), false);
  actual[0].installedVersion = "0.99.0";
  entries[1].restoreSnapshot[0].installedVersion = "0.99.0";
  verifyFinalRecoverySnapshot(entries[0], expected, sdk("0.80.0"));
  verifyFinalRecoverySnapshot(entries[1], expected, sdk("0.84.3")); // deep copies, not mutable aliases
  assert.throws(() => verifyFinalRecoverySnapshot(entries[0], undefined, sdk("0.80.0")), /snapshot drifted/);
});
test("source assertions: admission capture and final all-target metadata/tree/version checks precede ANY restored marks", () => {
  const source = name => readFileSync(new URL(name, import.meta.url), "utf8");
  const recovery = source("recovery.mjs");
  const capture = recovery.indexOf("const finalSnapshots = captureFinalRecoverySnapshots");
  const loop = recovery.indexOf("for (const { resolved, journalTarget } of bound.targets)");
  const barrier = recovery.indexOf("verifyRecoveryTargets(context.payload, true, finalSnapshots)");
  const mark = recovery.indexOf('target.state = "restored"');
  const rebind = recovery.indexOf("context.payload.targets = []");
  assert.ok(capture > 0 && capture < loop && loop < barrier && barrier < mark && mark < rebind);
  assert.equal(recovery.match(/target.state = "restored"/g)?.length, 1);
  assert.match(recovery, /if \(target.state !== "baselined"\) target.state = "restored"/);
  const verification = source("recovery-verification.mjs");
  assert.match(verification, /validateTargetMetadata\(target, packageAbs\)/);
  assert.match(verification, /for \(const target of payload.targets\)[\s\S]*?resolvePresentPackage\(target\)[\s\S]*?verifyPresentTree\(target[\s\S]*?if \(final\)[\s\S]*?verifyFinalRecoverySnapshot\(target, expectedSnapshots, snapshotHostPackages\(packageAbs, payload.host\)\)/);
});
