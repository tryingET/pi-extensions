// Unexecuted source candidate. Callback proxies are NOT real npm/journal/identity I/O proof.
// Only the final source assertions read real files; no lifecycle module is imported/executed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearRecordedChild, finishMutationCommand, verifyWithCompletionHold } from "./mutation-completion.mjs";

const phases = ["alignment", "restoration", "recovery"];
function fixture(phase, persistenceFailure = false) {
  const targets = [0, 1].map(index => ({ index, root: `root-${index}`, tree: `tree-${index}`,
    manifest: "original manifest", lock: "original lock", version: "not-aligned" }));
  const expected = structuredClone(targets);
  const child = { identity: "prior-child", targetIndex: 0 };
  const payload = { phase, child, targets };
  let durable = structuredClone(payload);
  const events = [];
  const persist = () => {
    events.push("persist");
    if (persistenceFailure) throw Error("publication failed");
    durable = structuredClone(payload);
  };
  const verify = () => {
    for (const [index, target] of targets.entries()) {
      events.push(`verify-${index}`);
      for (const field of ["root", "tree", "manifest", "lock"]) {
        assert.equal(target[field], expected[index][field], `${index}: ${field} drift`);
      }
    }
  };
  const hold = (reason, effectMayBeActive) => {
    events.push("hold");
    payload.completionHold = { reason, effectMayBeActive };
    persist();
  };
  const clear = () => { events.push("clear"); clearRecordedChild(payload, persist); };
  return { payload, child, targets, events, verify, hold, clear, durable: () => durable,
    reason: phase === "alignment" ? "command-completion-unverified" : "restoration-completion-unverified" };
}
const resultFor = ok => ({ ok, exitCode: ok ? 0 : 7, signal: null });

for (const phase of phases) for (const ok of [true, false]) {
  test(`callback proxy: ${phase} exit ${ok ? 0 : 7} verifies all identities, not aligned versions`, () => {
    const f = fixture(phase);
    const result = resultFor(ok);
    assert.equal(finishMutationCommand(result, f), result);
    assert.deepEqual(f.events, ["verify-0", "verify-1", "clear", "persist"]);
    assert.equal(f.durable().child, null);
    assert.equal("completionHold" in f.payload, false);
  });
  for (const index of [0, 1]) for (const field of ["manifest", "lock", "root", "tree"]) {
    test(`callback proxy: ${phase} exit ${ok ? 0 : 7} ${index ? "cross" : "same"}-target ${field} drift`, () => {
      const f = fixture(phase);
      f.targets[index][field] = "replacement";
      assert.throws(() => finishMutationCommand(resultFor(ok), f), { code: "PI_HOST_COMPAT_INTEGRITY" });
      assert.equal(f.payload.child, f.child);
      assert.deepEqual(f.durable().child, f.child);
      assert.equal(f.durable().completionHold.reason, f.reason);
      assert.equal(f.events.includes("clear"), false);
      assert.equal(f.payload.phase, phase); // no restoration/rebinding/new command after hold
    });
  }
  test(`callback proxy: ${phase} exit ${ok ? 0 : 7} hold publication failure retains prior durable child`, () => {
    const f = fixture(phase, true);
    f.targets[1].lock = "drift";
    assert.throws(() => finishMutationCommand(resultFor(ok), f), /publication failed/);
    assert.equal(f.payload.child, f.child);
    assert.deepEqual(f.durable().child, f.child);
    assert.equal("completionHold" in f.durable(), false); // no claim of durable hold on failed I/O
    assert.equal(f.events.includes("clear"), false);
  });
}

test("callback proxy: unknown/integrity results hold even without a recorded child", () => {
  for (const result of [undefined, {}, { ok: true, exitCode: 0 },
    { ...resultFor(false), signal: 3 }, { ...resultFor(true), integrityFailure: true },
    { ...resultFor(false), effectMayBeActive: true }]) {
    const f = fixture("recovery"); f.payload.child = null;
    assert.throws(() => finishMutationCommand(result, f), { code: "PI_HOST_COMPAT_INTEGRITY" });
    assert.equal(f.durable().completionHold.effectMayBeActive, true);
    assert.equal(f.events.includes("clear"), false);
  }
});

test("callback proxy: clearance publication failure restores in-memory and retains durable child", () => {
  const f = fixture("recovery", true);
  assert.throws(() => finishMutationCommand(resultFor(true), f), /publication failed/);
  assert.equal(f.payload.child, f.child);
  assert.deepEqual(f.durable().child, f.child);
  assert.deepEqual(f.events, ["verify-0", "verify-1", "clear", "persist", "hold", "persist"]);
});

// Models MutationSession.persist replacing this.payload BEFORE withFence's
// finally/gate.release throws. The old payload rollback cannot repair the new
// session payload; exact child evidence must survive in clearance history.
for (const ok of [true, false]) for (const holdFails of [false, true]) {
  test(`callback proxy: scenario exit ${ok ? 0 : 7} payload replacement then gate-release fsync failure; hold fails=${holdFails}`, () => {
    const priorChild = { effect: "scenario", targetIndex: null,
      identity: { platform: "linux", uid: 1000, pid: 123, processGroupId: 123,
        machineId: "a".repeat(32), bootId: "11111111-1111-4111-8111-111111111111",
        startTimeTicks: "456", pidNamespace: { dev: "4", ino: "5", link: "pid:[5]" } } };
    const expectedChild = structuredClone(priorChild);
    const oldPayload = { phase: "scenario-intent", child: priorChild };
    const session = { payload: oldPayload };
    let published = structuredClone(oldPayload);
    const events = [];
    const releaseError = Error("gate-release directory fsync failed after payload replacement");
    const holdError = Error("hold publication failed");
    session.clearChild = () => clearRecordedChild(session.payload, () => {
      events.push("clear-publish", "payload-replaced");
      published = structuredClone(session.payload);
      session.payload = structuredClone(published);
      events.push("gate-release-fsync");
      throw releaseError;
    });
    session.holdCompletion = (reason, effectMayBeActive) => {
      events.push("hold");
      session.payload.completionHold = { reason, effectMayBeActive };
      if (holdFails) throw holdError;
      published = structuredClone(session.payload);
    };
    const execution = resultFor(ok);
    assert.throws(() => {
      // Pure policy callback plus separate real-source wiring assertions below;
      // NOT a runner, MutationSession, filesystem or gate execution test.
      verifyWithCompletionHold(() => session.clearChild(),
        (...args) => session.holdCompletion(...args), "command-completion-unverified");
      events.push("restore", "rebind", "finalize");
      return execution;
    }, error => {
      assert.equal(error.code, "PI_HOST_COMPAT_INTEGRITY");
      assert.equal(error.cause, holdFails ? holdError : releaseError);
      return true;
    });
    assert.notEqual(session.payload, oldPayload);
    assert.equal(oldPayload.child, priorChild); // rollback only reaches abandoned memory
    assert.equal(session.payload.child, null); // hasRecordedChild alone cannot guard restore
    assert.equal(published.child, null);
    assert.deepEqual(priorChild, expectedChild);
    assert.deepEqual(session.payload.childClearanceAttempts, [expectedChild]);
    assert.deepEqual(published.childClearanceAttempts, [expectedChild]);
    assert.deepEqual(session.payload.completionHold,
      { reason: "command-completion-unverified", effectMayBeActive: false });
    assert.equal("completionHold" in published, !holdFails); // no durable-hold claim on failed publication
    assert.deepEqual(events, ["clear-publish", "payload-replaced", "gate-release-fsync", "hold"]);
  });
}

test("callback proxy: no-effect child clearance performs no publication", () => {
  clearRecordedChild({ child: null }, () => assert.fail("unexpected publication"));
});

for (const index of [0, 1]) for (const field of ["manifest", "lock"]) {
  test(`callback proxy: final barrier catches late metadata drift on target ${index}/${field} before any mark/rebind`, () => {
    const f = fixture("restoration");
    f.verify(); // earlier target verification was safe
    f.targets[index][field] = "later target side effect";
    const marks = [];
    assert.throws(() => {
      verifyWithCompletionHold(f.verify, f.hold, f.reason);
      marks.push("markTargetRestored", "remove-final-journal");
    }, { code: "PI_HOST_COMPAT_INTEGRITY" });
    assert.deepEqual(marks, []);
    assert.equal(f.durable().completionHold.reason, f.reason);
  });
}

// Real read-only SOURCE I/O, not execution or verification of filesystem effects.
const source = name => readFileSync(new URL(name, import.meta.url), "utf8");
function ordered(text, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1);
    assert.ok(next > cursor, `missing/out-of-order source: ${needle}`);
    cursor = next;
  }
}
test("source assertions: alignment/restoration wire all-target verification before clearance", () => {
  const lifecycle = source("host-lifecycle.mjs");
  ordered(lifecycle, ["entry.install = await spawnWithNeutralNpmEnv", "finishMutationCommand(entry.install",
    "for (const target of packagePreparations)", "verifyMutationTargetState(target)",
    "mutationSession.validateEntryMetadata(target)", "if (entry.install.ok) capturedAlignment",
    "clear: () => mutationSession.clearChild()", "if (!entry.install.ok)"]);
  ordered(lifecycle, ["restoreResult = await spawnWithNeutralNpmEnv", "finishMutationCommand(restoreResult",
    "for (const target of preparedPackages)", "verifyMutationTargetState(target, expectedTrees.get(target))",
    "mutationSession.validateEntryMetadata(target)", "clear: () => mutationSession.clearChild()",
    "isIntegrityError(error) || mutationSession.hasRecordedChild() || mutationSession.hasCompletionHold()",
    "throw error;", "restoreResult = { ok: false"]);
  assert.match(source("host-state.mjs"), /export function verifyMutationTargetState[\s\S]*?verifyTargetIdentity\(entry\)[\s\S]*?nodeModulesState\(packageAbs\)/);
});
test("source assertions: final metadata prepass precedes ANY restoration mark", () => {
  const final = source("host-restoration-barrier.mjs");
  ordered(final, ["verifyWithCompletionHold", "for (const entry of preparedPackages)",
    "verifyTargetIdentity(entry)", "mutationSession.validateEntryMetadata(entry)",
    '"restoration-completion-unverified"', "for (const entry of preparedPackages)",
    "mutationSession.markTargetRestored(entry)"]);
  assert.match(source("host-lifecycle.mjs"), /finishHostRestoration\(preparedPackages, restoredPackages, errors, host, mutationSession\)/);
});
test("source assertions: recovery checks all targets before child clearance/nonzero handling and final rebind", () => {
  const recovery = source("recovery.mjs");
  ordered(recovery, ["const result = await spawnWithNeutralNpmEnv", "finishMutationCommand(result",
    "verify: () => verifyRecoveryTargets(context.payload)", "hold: (...args) => holdRecoveryCompletion(context, ...args)",
    "clear: () => clearRecordedChild(context.payload, () => persist(context))", "if (!result.ok)"]);
  ordered(recovery, ["const bound = verifyWithCompletionHold", "validateJournalScenario(manifest, context.payload)",
    "const finalSnapshots = captureFinalRecoverySnapshots", "for (const { resolved, journalTarget } of bound.targets)",
    "verifyWithCompletionHold(() => verifyRecoveryTargets(context.payload, true, finalSnapshots)", 'context.payload.phase = "ready"',
    "context.payload.targets = []", "removeCompletedState(context)"]);
  ordered(source("recovery-verification.mjs"), ["export function verifyRecoveryTargets", "for (const target of payload.targets)",
    "resolvePresentPackage(target)", "verifyPresentTree(target", "target.initialNodeModules.kind !=="]);
  assert.match(source("recovery-verification.mjs"), /validateTargetMetadata\(target, packageAbs\)/);
  assert.match(source("runner.mjs"), /integrityFailure \|\|= isIntegrityError\(error\) \|\| mutationSession.hasCompletionHold\(\)/);
});
test("source assertions: prealigned/denied executor branches remain non-effectful", () => {
  ordered(source("host-lifecycle.mjs"), ["if (options.dryRun || alignment.aligned)", "return {",
    "entry.install = await spawnWithNeutralNpmEnv"]);
  const denied = source("completion-fixture-denied-lifecycle.mjs");
  assert.match(denied, /throw Object.assign\(new Error\(`completion fixture lifecycle executor denied/);
  assert.doesNotMatch(denied, /from ["']node:child_process["']|beforeRelease\s*\(/);
});

test("source assertions: scenario clearance failure is normalized before runner restoration/finalization", () => {
  const boundary = source("completion-boundary.mjs");
  assert.match(boundary, /import \{ verifyWithCompletionHold \} from "\.\/mutation-completion\.mjs"/);
  ordered(boundary, ["verify(entry, host)", "session.validateEntryMetadata(entry)",
    "verifyWithCompletionHold(() => session.clearChild(),",
    '(...args) => session.holdCompletion(...args), "command-completion-unverified")', "return execution;"]);
  ordered(source("recovery-journal.mjs"), ["persist() {", "this.withFence((state, gate)",
    "this.payload = after.journal.payload;", "this.journalDigest =", "hasCompletionHold()"]);
  assert.match(source("recovery-journal.mjs"), /finally \{\s*gate.release\(\);/);
  assert.match(source("recovery-journal.mjs"), /canFinalize\(\) \{\s*return !this.hasCompletionHold\(\)/);
  ordered(source("runner.mjs"), ["execution = finishScenarioCommand", "integrityFailure ||= isIntegrityError(error)",
    "!integrityFailure && !mutationSession.hasCompletionHold() && !mutationSession.hasRecordedChild()",
    "restoreScenarioHost(", "!integrityFailure) mutationSession.completeScenario()"]);
});
