import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCloseoutJournalEntry,
  createCloseoutCapsule,
  createCloseoutJournalEntry,
  digestCloseoutValue,
  sealArchiveReceipt,
  sealCleanupPermit,
  sealPromotionCertificate,
  sealValidationAttestation,
} from "../src/candidatePeerCloseoutReducer.ts";
import {
  createSyntheticCloseoutWorld,
  stepSyntheticCloseoutEffect,
} from "../src/candidatePeerCloseoutSyntheticEffectAdapter.ts";

const T0 = "2026-07-17T20:00:00.000Z";
const T1 = "2026-07-17T20:01:00.000Z";
const T2 = "2026-07-17T20:02:00.000Z";
const T3 = "2026-07-17T20:03:00.000Z";
const OID = "a".repeat(40);

function digest(value) {
  return digestCloseoutValue({ syntheticAdapterFixture: value });
}

function append(state, payload, eventId, occurredAt) {
  const entry = createCloseoutJournalEntry(state, { eventId, occurredAt, payload });
  return { entry, state: applyCloseoutJournalEntry(state, entry) };
}

function nextTime(state) {
  return new Date(Date.parse(state.lastEventAt ?? T0) + 1_000).toISOString();
}

function createGenesis() {
  const gitCommonDirDigest = digest("git-common-dir");
  return createCloseoutCapsule({
    bindings: {
      resourceId: "synthetic-resource",
      generationId: "synthetic-generation",
      sourceLifecycleVersion: 2,
      sourceRecordDigest: digest("source-record"),
      disposition: "accepted",
      reviewSnapshotDigest: digest("review-snapshot"),
      acceptedScopeDigest: digest("accepted-scope"),
      targetOwnerAuthorityDigest: digest("target-owner-authority"),
      piOwnerAuthorityDigest: digest("pi-owner-authority"),
      registeredTargetConfigDigest: digest("registered-target"),
      targetRepositoryDigest: digest("target-repository"),
      clockAuthorityDigest: digest("clock-authority"),
    },
    requiredEffects: [
      {
        kind: "remove_worktree",
        generationId: "synthetic-generation",
        worktreeRealPath: "/synthetic/candidate",
        gitCommonDirDigest,
      },
      {
        kind: "delete_branch",
        fullRef: "refs/heads/candidate/synthetic",
        expectedOid: "b".repeat(40),
        gitCommonDirDigest,
      },
    ],
    fence: { epoch: 3, tokenDigest: digest("fence-3") },
  });
}

function promotion(state) {
  const attestation = sealValidationAttestation({
    schemaVersion: 1,
    issuer: "target-owner:test",
    targetOid: OID,
    targetTreeDigest: digest("target-tree"),
    argv: ["npm", "run", "check"],
    cwd: "/synthetic/target",
    policyDigest: digest("validation-policy"),
    toolchainDigest: digest("toolchain"),
    startedAt: T0,
    finishedAt: T1,
    exitCode: 0,
    outputDigest: digest("validation-output"),
  });
  return sealPromotionCertificate({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "target-owner:test",
    authorityConfigDigest: state.bindings.targetOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("target-authentication"),
    issuedAt: T1,
    registeredTargetConfigDigest: state.bindings.registeredTargetConfigDigest,
    targetRepositoryDigest: state.bindings.targetRepositoryDigest,
    fullTargetRef: "refs/heads/main",
    observedTargetOid: OID,
    acceptedScopeDigest: state.bindings.acceptedScopeDigest,
    integrationProofDigest: digest("integration-proof"),
    validationAttestations: [attestation],
  });
}

function archive(state) {
  return sealArchiveReceipt({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("archive-authentication"),
    verifiedAt: T2,
    reviewSnapshotDigest: state.bindings.reviewSnapshotDigest,
    promotionCertificateDigest: state.promotionCertificate.certificateDigest,
    archiveDigest: digest("archive"),
    restorationManifestDigest: digest("restoration-manifest"),
  });
}

function permit(state) {
  return sealCleanupPermit({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("permit-authentication"),
    issuedAt: T2,
    expiresAt: "2026-07-17T21:00:00.000Z",
    nonce: "synthetic-permit",
    bindingsDigest: state.bindingsDigest,
    archiveReceiptDigest: state.archiveReceipt.receiptDigest,
    promotionCertificateDigest: state.promotionCertificate.certificateDigest,
    policyDigest: digest("cleanup-policy"),
    holdDigest: digest("active-hold"),
    runtimeDigest: digest("admitted-runtime"),
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    effects: state.requiredEffects,
  });
}

function readyState() {
  let state = createGenesis();
  state = append(
    state,
    { type: "promotion_attached", certificate: promotion(state) },
    "promotion",
    T1,
  ).state;
  state = append(state, { type: "archive_attached", receipt: archive(state) }, "archive", T2).state;
  state = append(state, { type: "permit_attached", permit: permit(state) }, "permit", T3).state;
  return state;
}

function intendNext(state, eventId) {
  const occurredAt = nextTime(state);
  const effectKey = state.requiredEffectKeys.find(
    (key) => !state.observations.some((observation) => observation.effectKey === key),
  );
  return append(
    state,
    {
      type: "effect_intended",
      intent: {
        effectKey,
        permitDigest: state.cleanupPermit.permitDigest,
        guard: {
          observedAt: occurredAt,
          clockAuthorityDigest: state.bindings.clockAuthorityDigest,
          clockReceiptDigest: digest(`clock-${occurredAt}`),
          bindingsDigest: state.bindingsDigest,
          archiveReceiptDigest: state.archiveReceipt.receiptDigest,
          policyDigest: state.cleanupPermit.policyDigest,
          holdDigest: state.cleanupPermit.holdDigest,
          runtimeDigest: state.cleanupPermit.runtimeDigest,
          targetRelation: "same",
          targetFullRef: state.promotionCertificate.fullTargetRef,
          targetObservedOid: state.promotionCertificate.observedTargetOid,
          targetObservationDigest: digest(`target-${occurredAt}`),
        },
      },
    },
    eventId,
    occurredAt,
  );
}

test("synthetic adapter completes effects in reducer order without hidden state", () => {
  let state = readyState();
  let world = createSyntheticCloseoutWorld(state);
  for (const label of ["worktree", "branch"]) {
    const intended = intendNext(state, `intent-${label}`);
    const step = stepSyntheticCloseoutEffect({
      capsule: intended.state,
      world,
      eventId: `observe-${label}`,
      occurredAt: nextTime(intended.state),
    });
    assert.equal(step.status, "observed");
    assert.equal(step.outcome, "completed");
    state = step.capsule;
    world = step.world;
  }
  assert.equal(state.phase, "cleaned");
  assert.equal(state.observations.length, 2);
  assert.deepEqual(
    Object.values(world.records).map((record) => record.applicationCount),
    [1, 1],
  );
});

test("faults before probe or effect leave capsule and world unchanged", () => {
  const intended = intendNext(readyState(), "intent-before-effect");
  const world = createSyntheticCloseoutWorld(intended.state);
  for (const faultAt of ["before_probe", "after_probe_before_effect"]) {
    const step = stepSyntheticCloseoutEffect({
      capsule: intended.state,
      world,
      eventId: `unused-${faultAt}`,
      occurredAt: nextTime(intended.state),
      faultAt,
    });
    assert.equal(step.status, "fault_injected");
    assert.deepEqual(step.capsule, intended.state);
    assert.deepEqual(step.world, world);
  }
});

test("crash after effect resumes by observation without applying twice", () => {
  const intended = intendNext(readyState(), "intent-before-crash");
  const world = createSyntheticCloseoutWorld(intended.state);
  const crashed = stepSyntheticCloseoutEffect({
    capsule: intended.state,
    world,
    eventId: "uncommitted-observation",
    occurredAt: nextTime(intended.state),
    faultAt: "after_effect_before_observation",
  });
  assert.equal(crashed.status, "fault_injected");
  assert.deepEqual(crashed.capsule, intended.state);
  const effectKey = intended.state.pendingIntent.effectKey;
  assert.equal(crashed.world.records[effectKey].applicationCount, 1);

  const resumed = stepSyntheticCloseoutEffect({
    capsule: intended.state,
    world: crashed.world,
    eventId: "reconciled-observation",
    occurredAt: nextTime(intended.state),
  });
  assert.equal(resumed.status, "observed");
  assert.equal(resumed.outcome, "already_satisfied_after_intent");
  assert.equal(resumed.world.records[effectKey].applicationCount, 1);
  assert.equal(resumed.capsule.observations.length, 1);
});

test("unexplained pre-existing absence is not accepted as cleanup success", () => {
  const intended = intendNext(readyState(), "intent-after-absence");
  const world = createSyntheticCloseoutWorld(intended.state);
  const effectKey = intended.state.pendingIntent.effectKey;
  world.records[effectKey].present = false;
  const step = stepSyntheticCloseoutEffect({
    capsule: intended.state,
    world,
    eventId: "observe-unexplained-absence",
    occurredAt: nextTime(intended.state),
  });
  assert.equal(step.status, "observed");
  assert.equal(step.outcome, "not_applied");
  assert.equal(step.capsule.phase, "partial_review");
  assert.equal(step.capsule.observations.length, 0);
  assert.equal(step.world.records[effectKey].applicationCount, 0);
});

test("world identity drift records a reducer blocker before any effect", () => {
  const intended = intendNext(readyState(), "intent-before-drift");
  const originalWorld = createSyntheticCloseoutWorld(intended.state);
  for (const mutate of [
    (world) => {
      world.capsuleId = digest("other-capsule");
    },
    (world) => {
      const effectKey = intended.state.pendingIntent.effectKey;
      world.records[effectKey].effect.worktreeRealPath = "/synthetic/other";
    },
    (world) => {
      const effectKey = intended.state.pendingIntent.effectKey;
      world.records[effectKey].applicationCount = 2;
    },
  ]) {
    const world = structuredClone(originalWorld);
    mutate(world);
    const step = stepSyntheticCloseoutEffect({
      capsule: intended.state,
      world,
      eventId: `block-${digestCloseoutValue(world)}`,
      occurredAt: nextTime(intended.state),
    });
    assert.equal(step.status, "blocked");
    assert.equal(step.reason, "binding_drift");
    assert.equal(step.capsule.phase, "fresh_review_required");
    assert.deepEqual(step.world, world);
    assert.deepEqual(originalWorld, createSyntheticCloseoutWorld(intended.state));
  }
});

test("identical synthetic inputs are deterministic and never mutate caller values", () => {
  const intended = intendNext(readyState(), "deterministic-intent");
  const world = createSyntheticCloseoutWorld(intended.state);
  const capsuleBefore = structuredClone(intended.state);
  const worldBefore = structuredClone(world);
  const input = {
    capsule: intended.state,
    world,
    eventId: "deterministic-observation",
    occurredAt: nextTime(intended.state),
  };
  const first = stepSyntheticCloseoutEffect(input);
  const second = stepSyntheticCloseoutEffect(input);
  assert.deepEqual(first, second);
  assert.deepEqual(intended.state, capsuleBefore);
  assert.deepEqual(world, worldBefore);
});
