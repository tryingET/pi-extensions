import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCloseoutJournalEntry,
  canonicalCloseoutJson,
  createCloseoutCapsule,
  createCloseoutJournalEntry,
  digestCloseoutValue,
  sealArchiveReceipt,
  sealCleanupPermit,
  sealCloseoutEffectReceipt,
  sealPendingEffectRecovery,
  sealPromotionCertificate,
  sealRemainingEffectsWaiver,
  sealValidationAttestation,
} from "../src/candidatePeerCloseoutReducer.ts";

const OID = "a".repeat(40);
const T0 = "2026-07-17T12:00:00.000Z";
const T1 = "2026-07-17T12:01:00.000Z";
const T2 = "2026-07-17T12:02:00.000Z";
const T3 = "2026-07-17T12:03:00.000Z";
const EXPIRES = "2026-07-17T13:00:00.000Z";

function digest(value) {
  return digestCloseoutValue({ edge: value });
}

function nextTime(state) {
  return new Date(Date.parse(state.lastEventAt ?? T0) + 1_000).toISOString();
}

function append(state, payload, eventId, occurredAt = nextTime(state)) {
  const entry = createCloseoutJournalEntry(state, { eventId, occurredAt, payload });
  return { entry, state: applyCloseoutJournalEntry(state, entry) };
}

function createGenesis() {
  const common = digest("common-dir");
  return createCloseoutCapsule({
    bindings: {
      resourceId: "edge-resource",
      generationId: "edge-generation",
      sourceLifecycleVersion: 9,
      sourceRecordDigest: digest("source"),
      disposition: "accepted",
      reviewSnapshotDigest: digest("review"),
      acceptedScopeDigest: digest("scope"),
      targetOwnerAuthorityDigest: digest("target-owner"),
      piOwnerAuthorityDigest: digest("pi-owner"),
      registeredTargetConfigDigest: digest("registered-main"),
      targetRepositoryDigest: digest("target-repo"),
      clockAuthorityDigest: digest("clock-owner"),
    },
    requiredEffects: [
      {
        kind: "remove_worktree",
        generationId: "edge-generation",
        worktreeRealPath: "/synthetic/edge",
        gitCommonDirDigest: common,
      },
      {
        kind: "delete_branch",
        fullRef: "refs/heads/candidate/edge",
        expectedOid: "b".repeat(40),
        gitCommonDirDigest: common,
      },
    ],
    fence: { epoch: 2, tokenDigest: digest("fence-2") },
  });
}

function promotion(state, overrides = {}) {
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
    outputDigest: digest("output"),
  });
  return sealPromotionCertificate({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "target-owner:test",
    authorityConfigDigest: state.bindings.targetOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("target-auth"),
    issuedAt: T1,
    registeredTargetConfigDigest: state.bindings.registeredTargetConfigDigest,
    targetRepositoryDigest: state.bindings.targetRepositoryDigest,
    fullTargetRef: "refs/heads/main",
    observedTargetOid: OID,
    acceptedScopeDigest: state.bindings.acceptedScopeDigest,
    integrationProofDigest: digest("integration"),
    validationAttestations: [attestation],
    ...overrides,
  });
}

function archive(state, overrides = {}) {
  return sealArchiveReceipt({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("archive-auth"),
    verifiedAt: T2,
    reviewSnapshotDigest: state.bindings.reviewSnapshotDigest,
    promotionCertificateDigest: state.promotionCertificate.certificateDigest,
    archiveDigest: digest("archive"),
    restorationManifestDigest: digest("restoration"),
    ...overrides,
  });
}

function permit(state, overrides = {}) {
  return sealCleanupPermit({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("permit-auth"),
    issuedAt: T2,
    expiresAt: EXPIRES,
    nonce: "edge-permit",
    bindingsDigest: state.bindingsDigest,
    archiveReceiptDigest: state.archiveReceipt.receiptDigest,
    promotionCertificateDigest: state.promotionCertificate.certificateDigest,
    policyDigest: digest("cleanup-policy"),
    holdDigest: digest("hold"),
    runtimeDigest: digest("runtime"),
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    effects: state.requiredEffects,
    ...overrides,
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

function intend(state, eventId = "intent") {
  const occurredAt = nextTime(state);
  return append(
    state,
    {
      type: "effect_intended",
      intent: {
        effectKey: state.requiredEffectKeys[state.observations.length],
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

function observe(state, intentEntry, outcome, eventId, overrides = {}) {
  const occurredAt = nextTime(state);
  const effectIndex = state.requiredEffectKeys.indexOf(state.pendingIntent.effectKey);
  const effect = state.requiredEffects[effectIndex];
  const receipt = sealCloseoutEffectReceipt({
    schemaVersion: 1,
    adapterId: "synthetic:edge-test",
    adapterSchemaVersion: "1",
    capsuleId: state.capsuleId,
    effectKey: state.pendingIntent.effectKey,
    effectKind: effect.kind,
    effectSpecDigest: digestCloseoutValue(effect),
    intentEntryHash: intentEntry.entryHash,
    permitDigest: state.pendingIntent.permitDigest,
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    observedAt: occurredAt,
    preconditionDigest: digest(`pre-${eventId}`),
    postconditionDigest: digest(`post-${eventId}`),
    outcome,
    ...overrides,
  });
  return append(
    state,
    {
      type: "effect_observed",
      observation: {
        effectKey: state.pendingIntent.effectKey,
        intentEntryHash: intentEntry.entryHash,
        outcome,
        receipt,
      },
    },
    eventId,
    occurredAt,
  ).state;
}

function driftPending(reason = "binding_drift") {
  const intended = intend(readyState(), `intent-${reason}`);
  const drifted = append(
    intended.state,
    { type: "block_recorded", reason, evidenceDigest: digest(reason) },
    `drift-${reason}`,
  ).state;
  return { drifted, intentEntry: intended.entry };
}

test("fresh-review lineage remains sticky while a pending effect is reconciled", () => {
  for (const outcome of ["completed", "not_applied"]) {
    const { drifted, intentEntry } = driftPending();
    const recovered = observe(drifted, intentEntry, outcome, `observe-${outcome}`);
    assert.equal(recovered.phase, "fresh_review_required");
    assert.equal(recovered.pendingIntent, undefined);
    assert.equal(recovered.observations.length, outcome === "completed" ? 1 : 0);
    assert.throws(
      () =>
        append(recovered, { type: "permit_attached", permit: permit(recovered) }, "stale-permit"),
      /permit_state_invalid/,
    );
  }
});

test("later blockers and fence rotation cannot downgrade fresh-review lineage", () => {
  const pending = driftPending();
  const first = pending.drifted;
  const blockedAgain = append(
    first,
    { type: "block_recorded", reason: "runtime_stale", evidenceDigest: digest("runtime") },
    "runtime-after-drift",
  ).state;
  assert.equal(blockedAgain.phase, "fresh_review_required");

  const noPending = observe(first, pending.intentEntry, "not_applied", "clear-intent");
  const rotated = append(
    noPending,
    {
      type: "fence_rotated",
      newEpoch: 3,
      newTokenDigest: digest("fence-3"),
      recoveryReceiptDigest: digest("fence-recovery"),
    },
    "rotate-after-drift",
  ).state;
  assert.equal(rotated.phase, "fresh_review_required");
});

test("expiry is exclusive and direct journal application requires a nonblank event id", () => {
  const state = readyState();
  assert.throws(
    () =>
      append(
        state,
        {
          type: "effect_intended",
          intent: {
            ...intend(state).entry.payload.intent,
            guard: { ...intend(state).entry.payload.intent.guard, observedAt: EXPIRES },
          },
        },
        "at-expiry",
        EXPIRES,
      ),
    /permit_expired/,
  );
  const valid = createCloseoutJournalEntry(state, {
    eventId: "valid-id",
    occurredAt: nextTime(state),
    payload: { type: "block_recorded", reason: "runtime_stale", evidenceDigest: digest("blank") },
  });
  const blankBody = { ...valid, eventId: " " };
  const { entryHash: _ignored, ...body } = blankBody;
  assert.throws(
    () => applyCloseoutJournalEntry(state, { ...body, entryHash: digestCloseoutValue(body) }),
    /event_id_required/,
  );
});

test("archive and permit timestamps must follow their causal predecessors", () => {
  let state = createGenesis();
  state = append(
    state,
    { type: "promotion_attached", certificate: promotion(state) },
    "promotion",
    T1,
  ).state;
  assert.throws(
    () =>
      append(
        state,
        { type: "archive_attached", receipt: archive(state, { verifiedAt: T0 }) },
        "early-archive",
        T2,
      ),
    /archive_precedes_promotion/,
  );
  state = append(state, { type: "archive_attached", receipt: archive(state) }, "archive", T2).state;
  assert.throws(
    () =>
      append(
        state,
        { type: "permit_attached", permit: permit(state, { issuedAt: T1 }) },
        "early-permit",
        T3,
      ),
    /permit_precedes_archive/,
  );
});

test("capsule identity commits to exact effects and initial fence", () => {
  const first = createGenesis();
  const changedEffects = structuredClone(first.requiredEffects);
  changedEffects[0].worktreeRealPath = "/synthetic/other";
  const second = createCloseoutCapsule({
    bindings: first.bindings,
    requiredEffects: changedEffects,
    fence: first.fence,
  });
  const changedFence = createCloseoutCapsule({
    bindings: first.bindings,
    requiredEffects: first.requiredEffects,
    fence: { epoch: first.fence.epoch + 1, tokenDigest: digest("other-fence") },
  });
  assert.notEqual(first.capsuleId, second.capsuleId);
  assert.notEqual(first.capsuleId, changedFence.capsuleId);
  assert.throws(
    () =>
      append(
        second,
        { type: "promotion_attached", certificate: promotion(first) },
        "cross-effect-replay",
        T1,
      ),
    /promotion_capsule_mismatch/,
  );
});

test("effect receipt binds adapter, effect, intent, permit, fence, and observation time", () => {
  const intended = intend(readyState(), "typed-receipt-intent");
  for (const overrides of [
    { effectSpecDigest: digest("wrong-effect") },
    { permitDigest: digest("wrong-permit") },
    { fenceTokenDigest: digest("wrong-fence") },
    { adapterId: " " },
  ]) {
    assert.throws(
      () => observe(intended.state, intended.entry, "completed", "bad-receipt", overrides),
      /candidate_closeout_/,
    );
  }
  const observed = observe(intended.state, intended.entry, "completed", "good-receipt");
  assert.equal(observed.observations.length, 1);
  assert.equal(observed.observations[0].receipt.effectKind, "remove_worktree");
});

test("pending effect recovery rotates the fence and permits reconciliation but not replay", () => {
  const intended = intend(readyState(), "uncertain-effect-intent");
  const recoveryTime = nextTime(intended.state);
  const recovery = sealPendingEffectRecovery({
    schemaVersion: 1,
    capsuleId: intended.state.capsuleId,
    resourceId: intended.state.bindings.resourceId,
    generationId: intended.state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: intended.state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("recovery-auth"),
    issuedAt: recoveryTime,
    pendingIntentEntryHash: intended.entry.entryHash,
    priorFenceEpoch: intended.state.fence.epoch,
    priorFenceTokenDigest: intended.state.fence.tokenDigest,
    newFenceEpoch: intended.state.fence.epoch + 1,
    newFenceTokenDigest: digest("recovered-fence"),
  });
  const recovered = append(
    intended.state,
    { type: "pending_effect_recovered", recovery },
    "recover-pending-effect",
    recoveryTime,
  ).state;
  assert.equal(recovered.phase, "effect_reconciliation_required");
  assert.equal(recovered.fence.epoch, 3);
  assert.ok(recovered.pendingIntent);
  assert.throws(() => intend(recovered, "effect-replay"), /intent_state_invalid/);

  const reconciled = observe(
    recovered,
    intended.entry,
    "already_satisfied_after_intent",
    "reconcile-under-new-fence",
  );
  assert.equal(reconciled.phase, "partial_review");
  assert.equal(reconciled.observations.length, 1);
  assert.equal(reconciled.pendingIntent, undefined);
});

test("remaining-effect waiver is sealed by Pi authority and exact current state", () => {
  const intended = intend(readyState(), "waiver-first-intent");
  let partial = observe(intended.state, intended.entry, "completed", "waiver-first-observation");
  partial = append(
    partial,
    { type: "block_recorded", reason: "authorization_expired", evidenceDigest: digest("expiry") },
    "waiver-partial",
  ).state;
  const retainedEffectKeys = [partial.requiredEffectKeys[1]];
  const waiverTime = nextTime(partial);
  const makeWaiver = (overrides = {}) =>
    sealRemainingEffectsWaiver({
      schemaVersion: 1,
      capsuleId: partial.capsuleId,
      resourceId: partial.bindings.resourceId,
      generationId: partial.bindings.generationId,
      issuer: "pi-owner:test",
      authorityConfigDigest: partial.bindings.piOwnerAuthorityDigest,
      authenticationReceiptDigest: digest("waiver-auth"),
      issuedAt: waiverTime,
      bindingsDigest: partial.bindingsDigest,
      archiveReceiptDigest: partial.archiveReceipt.receiptDigest,
      promotionCertificateDigest: partial.promotionCertificate.certificateDigest,
      cleanupPermitDigest: partial.cleanupPermit.permitDigest,
      expectedCapsuleVersion: partial.capsuleVersion,
      expectedChainHead: partial.chainHead,
      fenceEpoch: partial.fence.epoch,
      fenceTokenDigest: partial.fence.tokenDigest,
      observationsDigest: digestCloseoutValue(partial.observations),
      retainedEffectKeys,
      rationale: "retain branch under explicit Pi-owner authority",
      ...overrides,
    });
  assert.throws(
    () =>
      append(
        partial,
        {
          type: "remaining_effects_waived",
          waiver: makeWaiver({ authorityConfigDigest: digest("wrong-owner") }),
        },
        "forged-waiver",
        waiverTime,
      ),
    /waiver_authority_mismatch/,
  );
  const staleWaiver = makeWaiver();
  const revoked = append(
    partial,
    {
      type: "block_recorded",
      reason: "authorization_revoked",
      evidenceDigest: digest("waiver-revoked"),
    },
    "revoke-waiver",
    waiverTime,
  ).state;
  assert.equal(revoked.phase, "partial_review");
  assert.throws(
    () =>
      append(
        revoked,
        { type: "remaining_effects_waived", waiver: staleWaiver },
        "stale-waiver-after-revocation",
        nextTime(revoked),
      ),
    /waiver_capsule_version_mismatch|waiver_chain_head_mismatch/,
  );
  const closed = append(
    partial,
    { type: "remaining_effects_waived", waiver: makeWaiver() },
    "valid-waiver",
    waiverTime,
  ).state;
  assert.equal(closed.phase, "closed_with_retained_effects");
  assert.deepEqual(closed.retainedEffectKeys, retainedEffectKeys);
});

test("canonical hashing and destructive identifiers reject ambiguous values", () => {
  const sparse = Array(1);
  const symbolKeyed = { visible: true };
  symbolKeyed[Symbol("hidden")] = true;
  const hiddenProperty = {};
  Object.defineProperty(hiddenProperty, "hidden", { value: true, enumerable: false });
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", {
    get: () => "getter-value",
    enumerable: true,
  });
  accessorArray.length = 1;
  const hiddenArray = [];
  Object.defineProperty(hiddenArray, "0", { value: "hidden-value", enumerable: false });
  hiddenArray.length = 1;
  for (const value of [
    NaN,
    Infinity,
    [undefined],
    { bad: undefined },
    new Date(T0),
    sparse,
    symbolKeyed,
    hiddenProperty,
    accessorArray,
    hiddenArray,
  ]) {
    assert.throws(() => canonicalCloseoutJson(value), /candidate_closeout_canonical_/);
  }
  const first = canonicalCloseoutJson({ ä: 1, z: 2, a: 3 });
  const second = canonicalCloseoutJson({ z: 2, a: 3, ä: 1 });
  assert.equal(first, second);

  const base = createGenesis();
  for (const requiredEffects of [
    [{ ...base.requiredEffects[0], worktreeRealPath: "/" }, base.requiredEffects[1]],
    [
      { ...base.requiredEffects[0], worktreeRealPath: "/synthetic//candidate/." },
      base.requiredEffects[1],
    ],
    [base.requiredEffects[0], { ...base.requiredEffects[1], fullRef: "refs/heads/unsafe..branch" }],
    [base.requiredEffects[0], { ...base.requiredEffects[1], fullRef: "refs/heads/foo.lock/bar" }],
    [base.requiredEffects[0], { ...base.requiredEffects[1], fullRef: "refs/heads/.hidden" }],
  ]) {
    assert.throws(
      () => createCloseoutCapsule({ bindings: base.bindings, requiredEffects, fence: base.fence }),
      /worktree_real_path_unsafe|branch_full_ref_invalid/,
    );
  }
});
