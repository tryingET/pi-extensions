// Pure schema/publication proxies plus read-only source assertions. NO lifecycle executor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertChildVacant, assertClearancePublication, assertRecoveryChildReconciled,
  clearRecordedChild, MAX_CHILD_CLEARANCE_ATTEMPTS } from "./child-clearance.mjs";
import { validateStatePayload } from "./state-schema.mjs";

const uuid = "11111111-1111-4111-8111-111111111111";
const identity = { platform: "linux", uid: 1000, pid: 101, processGroupId: 101,
  machineId: "a".repeat(32), bootId: uuid, startTimeTicks: "12345",
  pidNamespace: { dev: "1", ino: "2", link: "pid:[2]" } };
const child = () => ({ effect: "scenario", targetIndex: null, identity: structuredClone(identity) });
function journal() {
  return { kind: "pi-host-compatibility-canary-recovery-journal", runId: uuid,
    owner: { token: "b".repeat(64), identity: structuredClone(identity) },
    root: { canonicalPath: "/fixture/repo", identity: { dev: "1", ino: "3" } },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", revision: 0,
    manifest: { relativePath: "manifest.json", digest: "c".repeat(64), identity: { dev: "1", ino: "4" } },
    profile: "current", phase: "ready", scenarioId: null, child: child(), targets: [] };
}
const validate = value => validateStatePayload(value, value.kind);

test("historical absent field stays absent; even a dead unreviewed child requires reconciliation", () => {
  const payload = journal(); const bytes = JSON.stringify(payload);
  validate(payload); assert.equal(JSON.stringify(payload), bytes);
  assert.equal("childClearanceAttempts" in payload, false);
  assert.throws(() => assertRecoveryChildReconciled(payload), /owner reconciliation/);
  payload.child = null;
  assert.doesNotThrow(() => assertRecoveryChildReconciled(payload));
});

test("same publication retains a deep exact copy; healthy live transitions preserve append-only history", () => {
  const payload = journal(); const previous = structuredClone(payload); const oldChild = payload.child;
  clearRecordedChild(payload, () => { validate(payload); assertClearancePublication(previous, payload); });
  assert.equal(payload.child, null);
  assert.deepEqual(payload.childClearanceAttempts, [previous.child]);
  oldChild.identity.pid++;
  assert.deepEqual(payload.childClearanceAttempts[0], previous.child);
  assert.throws(() => assertRecoveryChildReconciled(payload), /owner reconciliation/);
  for (const phase of ["pre-alignment", "ready", "clean"]) {
    const next = { ...structuredClone(payload), phase };
    assert.doesNotThrow(() => assertClearancePublication(payload, next));
  }
  assert.doesNotThrow(() => assertChildVacant(payload));
  assert.throws(() => assertChildVacant(previous), /prior child/);
});

test("publication invariant forbids clearing without exact evidence, replacing child, or forgetting history", () => {
  const previous = journal();
  for (const next of [
    { ...previous, child: null },
    { ...previous, child: { ...child(), targetIndex: 1 } },
    { ...previous, child: null, childClearanceAttempts: [{ ...child(), targetIndex: 1 }] },
  ]) assert.throws(() => assertClearancePublication(previous, next), /exact prior child/);
  const cleared = structuredClone(previous);
  clearRecordedChild(cleared, () => {});
  for (const attempts of [undefined, [], [{ ...child(), targetIndex: 1 }]]) {
    assert.throws(() => assertClearancePublication(cleared,
      { ...cleared, childClearanceAttempts: attempts }), /history/);
  }
});

test("strict bounded schema validates every copied identity; no nullable/empty/extra-field marker", () => {
  const payload = journal();
  for (const attempts of [null, [], {}, [null], [{}], [{ ...child(), extra: true }],
    [{ ...child(), identity: { ...identity, pid: 0 } }],
    [{ ...child(), identity: { ...identity, pidNamespace: { dev: "1", ino: "2", link: "wrong" } } }],
    Array.from({ length: MAX_CHILD_CLEARANCE_ATTEMPTS + 1 }, child)]) {
    assert.throws(() => validate({ ...payload, childClearanceAttempts: attempts }), /schema/);
  }
  validate({ ...payload, childClearanceAttempts: [child()] });
  const full = { ...payload, childClearanceAttempts: Array.from({ length: MAX_CHILD_CLEARANCE_ATTEMPTS }, child) };
  validate(full);
  const before = JSON.stringify(full); const prior = full.child;
  assert.throws(() => clearRecordedChild(full, () => assert.fail("overflow published")), /capacity exhausted/);
  assert.equal(full.child, prior); assert.equal(JSON.stringify(full), before);
});

test("callback proxy: before-write versus publish-then-throw; failed hold cannot hide either child representation", () => {
  for (const published of [false, true]) {
    const payload = journal(); let visible = structuredClone(payload); const prior = structuredClone(payload.child);
    assert.throws(() => clearRecordedChild(payload, () => {
      if (published) visible = structuredClone(payload);
      throw Error(published ? "post-rename readback failed" : "fence failed before write");
    }));
    assert.deepEqual(payload.child, prior);
    assert.deepEqual(published ? visible.childClearanceAttempts : [visible.child], [prior]);
    if (published) assert.equal(visible.child, null);
    assert.equal("completionHold" in visible, false);
    assert.throws(() => assertRecoveryChildReconciled(visible), /automatic and explicit recovery refused/);
  }
});

const source = file => readFileSync(new URL(file, import.meta.url), "utf8");
test("source ordering: refusal precedes liveness/takeover/removal; all journal publishers enforce the invariant", () => {
  const recovery = source("recovery.mjs");
  const run = recovery.slice(recovery.indexOf("export async function recoverInterruptedRun"));
  const refusal = run.indexOf("assertRecoveryChildReconciled(state.journal?.payload");
  assert.ok(refusal > 0 && refusal < run.indexOf("ownerIsRecoverable(state)"));
  assert.ok(refusal < run.indexOf("acquireCheckoutRecoveryLock(gate.paths)"));
  assert.ok(refusal < run.indexOf("removeStateFile("));
  const session = source("recovery-journal.mjs");
  assert.match(session, /assertClearancePublication\(current.payload, payload\)/);
  assert.match(session, /assertClearancePublication\(state.journal.payload, next\)/);
  assert.match(session, /clearRecordedChild\(this.payload, \(\) => this.persist\(\)\)/);
  for (const name of ["bindScenario", "recordChild", "recordScenarioChild", "completeScenario"]) {
    const method = session.slice(session.indexOf(`  ${name}(`));
    const guard = method.indexOf("assertChildVacant(this.payload)");
    assert.ok(guard >= 0 && guard < method.indexOf("this.payload.child ="));
  }
  // Live finalization is allowed after healthy completion; markers are never reset
  // by bind/complete and can disappear only with the normal journal removal.
  assert.doesNotMatch(session, /delete .*childClearanceAttempts|childClearanceAttempts\s*=/);
});
