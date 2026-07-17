import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCloseoutJournalEntry,
  canonicalCloseoutJson,
  createCloseoutCapsule,
  createCloseoutJournalEntry,
  digestCloseoutValue,
  reduceCloseoutJournal,
  sealArchiveReceipt,
  sealCleanupPermit,
  sealCloseoutEffectReceipt,
  sealPromotionCertificate,
  sealRemainingEffectsWaiver,
  sealValidationAttestation,
} from "../src/candidatePeerCloseoutReducer.ts";

const T0 = "2026-07-17T12:00:00.000Z";
const T1 = "2026-07-17T12:01:00.000Z";
const T2 = "2026-07-17T12:02:00.000Z";
const T3 = "2026-07-17T12:03:00.000Z";
const T4 = "2026-07-17T12:04:00.000Z";
const T5 = "2026-07-17T12:05:00.000Z";
const EXPIRY = "2026-07-17T13:00:00.000Z";
const OID = "a".repeat(40);
const TARGET_TREE = digest("target-tree");

function digest(value) {
  return digestCloseoutValue({ fixture: value });
}

function effects(generationId = "generation-1") {
  const common = digest("git-common-dir");
  return [
    { kind: "close_process", processIdentityDigest: digest("process-incarnation") },
    {
      kind: "remove_worktree",
      generationId,
      worktreeRealPath: "/synthetic/candidate",
      gitCommonDirDigest: common,
    },
    {
      kind: "delete_branch",
      fullRef: "refs/heads/candidate/synthetic",
      expectedOid: "b".repeat(40),
      gitCommonDirDigest: common,
    },
  ];
}

function genesis(disposition = "accepted") {
  return createCloseoutCapsule({
    bindings: {
      resourceId: "resource-1",
      generationId: "generation-1",
      sourceLifecycleVersion: 7,
      sourceRecordDigest: digest("source-record"),
      disposition,
      reviewSnapshotDigest: digest("review-snapshot"),
      ...(disposition === "accepted" ? { acceptedScopeDigest: digest("accepted-scope") } : {}),
      targetOwnerAuthorityDigest: digest("target-owner-authority"),
      piOwnerAuthorityDigest: digest("pi-owner-authority"),
      registeredTargetConfigDigest: digest("registered-main-config"),
      targetRepositoryDigest: digest("target-repository"),
      clockAuthorityDigest: digest("trusted-clock-authority"),
    },
    requiredEffects: effects(),
    fence: { epoch: 4, tokenDigest: digest("fence-4") },
  });
}

function validation(overrides = {}) {
  return sealValidationAttestation({
    schemaVersion: 1,
    issuer: "target-owner:test",
    targetOid: OID,
    targetTreeDigest: TARGET_TREE,
    argv: ["npm", "run", "check"],
    cwd: "/synthetic/target-at-T",
    policyDigest: digest("validation-policy"),
    toolchainDigest: digest("toolchain-lock"),
    startedAt: T0,
    finishedAt: T1,
    exitCode: 0,
    outputDigest: digest("validation-output"),
    ...overrides,
  });
}

function promotion(state, overrides = {}) {
  return sealPromotionCertificate({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "target-owner:test",
    authorityConfigDigest: state.bindings.targetOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("target-owner-authentication"),
    issuedAt: T1,
    registeredTargetConfigDigest: state.bindings.registeredTargetConfigDigest,
    targetRepositoryDigest: state.bindings.targetRepositoryDigest,
    fullTargetRef: "refs/heads/main",
    observedTargetOid: OID,
    acceptedScopeDigest: state.bindings.acceptedScopeDigest,
    integrationProofDigest: digest("patch-equivalence-proof"),
    validationAttestations: [validation()],
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
    authenticationReceiptDigest: digest("archive-owner-authentication"),
    verifiedAt: T2,
    reviewSnapshotDigest: state.bindings.reviewSnapshotDigest,
    ...(state.promotionCertificate
      ? { promotionCertificateDigest: state.promotionCertificate.certificateDigest }
      : {}),
    archiveDigest: digest("lossless-archive"),
    restorationManifestDigest: digest("restored-byte-manifest"),
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
    authenticationReceiptDigest: digest("permit-owner-authentication"),
    issuedAt: T2,
    expiresAt: EXPIRY,
    nonce: "synthetic-permit-1",
    bindingsDigest: state.bindingsDigest,
    archiveReceiptDigest: state.archiveReceipt.receiptDigest,
    ...(state.promotionCertificate
      ? { promotionCertificateDigest: state.promotionCertificate.certificateDigest }
      : {}),
    policyDigest: digest("cleanup-policy"),
    holdDigest: digest("active-hold-set"),
    runtimeDigest: digest("admitted-runtime"),
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    effects: state.requiredEffects,
    ...overrides,
  });
}

function nextTime(state) {
  return new Date(Date.parse(state.lastEventAt ?? T0) + 1_000).toISOString();
}

function append(state, payload, eventId, occurredAt, entryOverrides = {}) {
  const eventTime = occurredAt ?? nextTime(state);
  const entry = {
    ...createCloseoutJournalEntry(state, { eventId, occurredAt: eventTime, payload }),
    ...entryOverrides,
  };
  return { entry, state: applyCloseoutJournalEntry(state, entry) };
}

function prepareReady(disposition = "accepted") {
  let state = genesis(disposition);
  const genesisState = structuredClone(state);
  const entries = [];
  if (disposition === "accepted") {
    const result = append(
      state,
      { type: "promotion_attached", certificate: promotion(state) },
      "promotion",
      T1,
    );
    state = result.state;
    entries.push(result.entry);
  }
  let result = append(state, { type: "archive_attached", receipt: archive(state) }, "archive", T2);
  state = result.state;
  entries.push(result.entry);
  result = append(state, { type: "permit_attached", permit: permit(state) }, "permit", T3);
  state = result.state;
  entries.push(result.entry);
  return { genesisState, state, entries };
}

function guard(state, observedAt = T4, overrides = {}) {
  return {
    observedAt,
    clockAuthorityDigest: state.bindings.clockAuthorityDigest,
    clockReceiptDigest: digest(`clock-${observedAt}`),
    bindingsDigest: state.bindingsDigest,
    archiveReceiptDigest: state.archiveReceipt.receiptDigest,
    policyDigest: state.cleanupPermit.policyDigest,
    holdDigest: state.cleanupPermit.holdDigest,
    runtimeDigest: state.cleanupPermit.runtimeDigest,
    targetRelation: state.bindings.disposition === "accepted" ? "same" : "not_applicable",
    ...(state.bindings.disposition === "accepted"
      ? {
          targetFullRef: state.promotionCertificate.fullTargetRef,
          targetObservedOid: state.promotionCertificate.observedTargetOid,
          targetObservationDigest: digest(`target-${observedAt}`),
        }
      : {}),
    ...overrides,
  };
}

function intendNext(state, eventId = `intent-${state.observations.length}`, guardOverrides = {}) {
  const observed = new Set(state.observations.map((item) => item.effectKey));
  const effectKey = state.requiredEffectKeys.find((key) => !observed.has(key));
  const eventTime = nextTime(state);
  return append(
    state,
    {
      type: "effect_intended",
      intent: {
        effectKey,
        permitDigest: state.cleanupPermit.permitDigest,
        guard: guard(state, eventTime, guardOverrides),
      },
    },
    eventId,
    eventTime,
  );
}

function effectReceipt(state, intentEntry, outcome, observedAt, overrides = {}) {
  const effectIndex = state.requiredEffectKeys.indexOf(state.pendingIntent.effectKey);
  const effect = state.requiredEffects[effectIndex];
  return sealCloseoutEffectReceipt({
    schemaVersion: 1,
    adapterId: "synthetic:test",
    adapterSchemaVersion: "1",
    capsuleId: state.capsuleId,
    effectKey: state.pendingIntent.effectKey,
    effectKind: effect.kind,
    effectSpecDigest: digestCloseoutValue(effect),
    intentEntryHash: intentEntry.entryHash,
    permitDigest: state.pendingIntent.permitDigest,
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    observedAt,
    preconditionDigest: digest(`precondition-${intentEntry.entryHash}`),
    postconditionDigest: digest(`postcondition-${intentEntry.entryHash}-${outcome}`),
    outcome,
    ...overrides,
  });
}

function observePending(
  state,
  intentEntry,
  eventId = `observe-${state.observations.length}`,
  outcome = "completed",
  receiptOverrides = {},
) {
  const occurredAt = nextTime(state);
  return append(
    state,
    {
      type: "effect_observed",
      observation: {
        effectKey: state.pendingIntent.effectKey,
        intentEntryHash: intentEntry.entryHash,
        outcome,
        receipt: effectReceipt(state, intentEntry, outcome, occurredAt, receiptOverrides),
      },
    },
    eventId,
    occurredAt,
  );
}

function waiver(state, retainedEffectKeys, rationale, overrides = {}) {
  return sealRemainingEffectsWaiver({
    schemaVersion: 1,
    capsuleId: state.capsuleId,
    resourceId: state.bindings.resourceId,
    generationId: state.bindings.generationId,
    issuer: "pi-owner:test",
    authorityConfigDigest: state.bindings.piOwnerAuthorityDigest,
    authenticationReceiptDigest: digest("waiver-owner-authentication"),
    issuedAt: nextTime(state),
    bindingsDigest: state.bindingsDigest,
    archiveReceiptDigest: state.archiveReceipt.receiptDigest,
    ...(state.promotionCertificate
      ? { promotionCertificateDigest: state.promotionCertificate.certificateDigest }
      : {}),
    cleanupPermitDigest: state.cleanupPermit.permitDigest,
    expectedCapsuleVersion: state.capsuleVersion,
    expectedChainHead: state.chainHead,
    fenceEpoch: state.fence.epoch,
    fenceTokenDigest: state.fence.tokenDigest,
    observationsDigest: digestCloseoutValue(state.observations),
    retainedEffectKeys,
    rationale,
    ...overrides,
  });
}

function completeOneEffect(state, label) {
  const intended = intendNext(state, `intent-${label}`);
  const observed = observePending(intended.state, intended.entry, `observe-${label}`);
  return { state: observed.state, entries: [intended.entry, observed.entry] };
}

test("accepted capsule requires target-owner proof, archive, separate permit, and ordered observations", () => {
  const prepared = prepareReady();
  let { state } = prepared;
  const effectEntries = [];
  for (const label of ["process", "worktree", "branch"]) {
    const completed = completeOneEffect(state, label);
    state = completed.state;
    effectEntries.push(...completed.entries);
  }

  assert.equal(state.phase, "cleaned");
  assert.equal(state.observations.length, 3);
  assert.match(state.terminalReceiptDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    reduceCloseoutJournal(prepared.genesisState, [...prepared.entries, ...effectEntries]),
    state,
  );
  assert.throws(
    () =>
      append(
        state,
        { type: "block_recorded", reason: "runtime_stale", evidenceDigest: digest("late") },
        "late",
      ),
    /terminal_capsule_immutable/,
  );
});

test("rejected capsule skips promotion but still requires restoration and Pi cleanup authority", () => {
  const prepared = prepareReady("rejected");
  assert.equal(prepared.genesisState.phase, "awaiting_archive_receipt");
  assert.equal(prepared.state.phase, "ready");
  assert.equal(prepared.state.promotionCertificate, undefined);
  assert.equal(prepared.state.cleanupPermit.promotionCertificateDigest, undefined);
  assert.equal(guard(prepared.state).targetRelation, "not_applicable");
});

test("promotion certificate rejects failed, wrong-target, unregistered-ref, and tampered validation", () => {
  const state = genesis();
  for (const certificate of [
    promotion(state, { fullTargetRef: "main" }),
    promotion(state, { validationAttestations: [validation({ targetOid: "c".repeat(40) })] }),
    promotion(state, { validationAttestations: [validation({ exitCode: 1 })] }),
  ]) {
    assert.throws(
      () => append(state, { type: "promotion_attached", certificate }, "bad-promotion", T1),
      /candidate_closeout_/,
    );
  }
  const tampered = promotion(state);
  tampered.validationAttestations[0].outputDigest = digest("forged-output");
  assert.throws(
    () => append(state, { type: "promotion_attached", certificate: tampered }, "tampered", T1),
    /attestation_digest_mismatch|promotion_digest_mismatch/,
  );
});

test("journal CAS, sequence, previous hash, entry hash, and fencing reject stale concurrent writers", () => {
  const state = genesis();
  const certificate = promotion(state);
  const first = createCloseoutJournalEntry(state, {
    eventId: "winner",
    occurredAt: T1,
    payload: { type: "promotion_attached", certificate },
  });
  const stale = createCloseoutJournalEntry(state, {
    eventId: "loser",
    occurredAt: T1,
    payload: { type: "promotion_attached", certificate },
  });
  const advanced = applyCloseoutJournalEntry(state, first);
  assert.throws(() => applyCloseoutJournalEntry(advanced, stale), /journal_sequence_mismatch/);
  assert.throws(
    () => applyCloseoutJournalEntry(state, { ...first, previousHash: digest("wrong") }),
    /journal_previous_hash_mismatch/,
  );
  assert.throws(
    () => applyCloseoutJournalEntry(state, { ...first, entryHash: digest("forged") }),
    /journal_hash_mismatch/,
  );
  const staleFence = createCloseoutJournalEntry(state, {
    eventId: "stale-fence",
    occurredAt: T1,
    payload: { type: "promotion_attached", certificate },
    fenceEpoch: 3,
    fenceTokenDigest: digest("fence-3"),
  });
  assert.throws(() => applyCloseoutJournalEntry(state, staleFence), /journal_fence_mismatch/);
});

test("crash after durable intent resumes by observation and never replays the effect", () => {
  const prepared = prepareReady();
  const intended = intendNext(prepared.state, "intent-before-crash");
  const recovered = reduceCloseoutJournal(prepared.genesisState, [
    ...prepared.entries,
    intended.entry,
  ]);
  assert.equal(recovered.phase, "effect_intended");
  assert.equal(recovered.pendingIntent.intentEntryHash, intended.entry.entryHash);
  assert.throws(() => intendNext(recovered, "duplicate-intent"), /intent_state_invalid/);

  const observed = observePending(recovered, intended.entry, "observe-after-restart");
  assert.equal(observed.state.observations.length, 1);
  assert.equal(observed.state.pendingIntent, undefined);
  assert.throws(
    () => applyCloseoutJournalEntry(observed.state, observed.entry),
    /journal_sequence_mismatch/,
  );
});

test("observation without prior durable intent and observation for another intent fail closed", () => {
  const { state } = prepareReady();
  assert.throws(
    () =>
      append(
        state,
        {
          type: "effect_observed",
          observation: {
            effectKey: state.requiredEffectKeys[0],
            intentEntryHash: digest("invented-intent"),
            outcome: "already_satisfied_after_intent",
            observationDigest: digest("absence"),
          },
        },
        "unexplained-absence",
      ),
    /observation_without_intent/,
  );
  const intended = intendNext(state);
  assert.throws(
    () =>
      append(
        intended.state,
        {
          type: "effect_observed",
          observation: {
            effectKey: state.requiredEffectKeys[1],
            intentEntryHash: intended.entry.entryHash,
            outcome: "completed",
            observationDigest: digest("wrong-effect-observation"),
          },
        },
        "wrong-effect",
      ),
    /observation_effect_mismatch/,
  );
});

test("expired authority and guard drift cannot create effect intent", () => {
  const { state } = prepareReady();
  for (const overrides of [
    { observedAt: "2026-07-17T14:00:00.000Z" },
    { bindingsDigest: digest("drift") },
    { archiveReceiptDigest: digest("other-archive") },
    { holdDigest: digest("replacement-hold") },
    { runtimeDigest: digest("stale-runtime") },
    { targetRelation: "diverged" },
  ]) {
    const observedAt = overrides.observedAt ?? T4;
    assert.throws(
      () =>
        append(
          state,
          {
            type: "effect_intended",
            intent: {
              effectKey: state.requiredEffectKeys[0],
              permitDigest: state.cleanupPermit.permitDigest,
              guard: guard(state, observedAt, overrides),
            },
          },
          `guard-${Object.keys(overrides)[0]}`,
          observedAt,
        ),
      /candidate_closeout_/,
    );
  }
  assert.throws(
    () => intendNext(state, "descendant-requires-new-proof", { targetRelation: "descendant" }),
    /guard_target_moved/,
  );
});

test("block before effects cannot authorize cleanup; drift requires fresh review", () => {
  const { state } = prepareReady();
  const expired = append(
    state,
    { type: "block_recorded", reason: "authorization_expired", evidenceDigest: digest("clock") },
    "expired",
  ).state;
  assert.equal(expired.phase, "awaiting_cleanup_permit");
  assert.throws(() => intendNext(expired), /intent_state_invalid/);

  const drifted = append(
    state,
    { type: "block_recorded", reason: "target_diverged", evidenceDigest: digest("rewind") },
    "diverged",
  ).state;
  assert.equal(drifted.phase, "fresh_review_required");
  assert.throws(
    () => append(drifted, { type: "permit_attached", permit: permit(drifted) }, "unsafe-repermit"),
    /permit_state_invalid/,
  );
});

test("partial cleanup preserves observations and requires exact superseding permit", () => {
  const prepared = prepareReady();
  const first = completeOneEffect(prepared.state, "process");
  let state = append(
    first.state,
    { type: "block_recorded", reason: "authorization_expired", evidenceDigest: digest("clock") },
    "partial-expiry",
  ).state;
  assert.equal(state.phase, "partial_review");
  assert.equal(state.observations.length, 1);

  const remaining = state.requiredEffects.slice(1);
  const supersedingIssuedAt = nextTime(state);
  const bad = permit(state, {
    issuedAt: supersedingIssuedAt,
    expiresAt: "2026-07-17T14:00:00.000Z",
    nonce: "superseding-bad",
    effects: remaining,
    supersedesPermitDigest: state.cleanupPermit.permitDigest,
    priorObservationsDigest: digest("wrong-observations"),
  });
  assert.throws(
    () => append(state, { type: "permit_attached", permit: bad }, "bad-supersession"),
    /permit_prior_observations_mismatch/,
  );

  const replacement = permit(state, {
    issuedAt: supersedingIssuedAt,
    expiresAt: "2026-07-17T14:00:00.000Z",
    nonce: "superseding-good",
    effects: remaining,
    supersedesPermitDigest: state.cleanupPermit.permitDigest,
    priorObservationsDigest: digestCloseoutValue(state.observations),
  });
  state = append(
    state,
    { type: "permit_attached", permit: replacement },
    "good-supersession",
  ).state;
  assert.equal(state.phase, "ready");
  assert.deepEqual(state.cleanupPermit.effects, remaining);
  assert.equal(state.observations.length, 1);
});

test("block after intent retains uncertainty until that exact postcondition is observed", () => {
  const { state } = prepareReady();
  const intended = intendNext(state, "intent-uncertain");
  let partial = append(
    intended.state,
    { type: "block_recorded", reason: "hold_changed", evidenceDigest: digest("hold-change") },
    "hold-change",
  ).state;
  assert.equal(partial.phase, "partial_review");
  assert.ok(partial.pendingIntent);
  assert.throws(
    () =>
      append(
        partial,
        {
          type: "remaining_effects_waived",
          waiver: waiver(partial, partial.requiredEffectKeys, "cannot waive an unresolved attempt"),
        },
        "unsafe-waiver",
      ),
    /pending_intent_blocks_waiver/,
  );
  partial = observePending(partial, intended.entry, "probe-after-block").state;
  assert.equal(partial.phase, "partial_review");
  assert.equal(partial.observations.length, 1);
});

test("owner can terminally retain only the exact remaining effects after partial review", () => {
  const { state } = prepareReady();
  const first = completeOneEffect(state, "process");
  let partial = append(
    first.state,
    {
      type: "block_recorded",
      reason: "authorization_expired",
      evidenceDigest: digest("expired-after-process"),
    },
    "expired-after-process",
  ).state;
  const remainingKeys = partial.requiredEffectKeys.slice(1);
  assert.throws(
    () =>
      append(
        partial,
        {
          type: "remaining_effects_waived",
          waiver: waiver(partial, [remainingKeys[0]], "incomplete retained inventory"),
        },
        "bad-waiver",
      ),
    /waiver_effects_not_exact_remaining/,
  );
  partial = append(
    partial,
    {
      type: "remaining_effects_waived",
      waiver: waiver(partial, remainingKeys, "owner intentionally retains worktree and branch"),
    },
    "good-waiver",
  ).state;
  assert.equal(partial.phase, "closed_with_retained_effects");
  assert.deepEqual(partial.retainedEffectKeys, remainingKeys);
  assert.match(partial.terminalReceiptDigest, /^[0-9a-f]{64}$/);
});

test("fence rotation is monotonic and invalidates permits without erasing receipts", () => {
  const prepared = prepareReady();
  const first = completeOneEffect(prepared.state, "process");
  const oldFenceEntry = createCloseoutJournalEntry(first.state, {
    eventId: "old-holder",
    occurredAt: T5,
    payload: {
      type: "block_recorded",
      reason: "runtime_stale",
      evidenceDigest: digest("old-holder-evidence"),
    },
  });
  const rotated = append(
    first.state,
    {
      type: "fence_rotated",
      newEpoch: 5,
      newTokenDigest: digest("fence-5"),
      recoveryReceiptDigest: digest("stale-holder-proof"),
    },
    "rotate-fence",
    T5,
  ).state;
  assert.equal(rotated.phase, "partial_review");
  assert.equal(rotated.observations.length, 1);
  assert.throws(
    () => applyCloseoutJournalEntry(rotated, oldFenceEntry),
    /journal_sequence_mismatch/,
  );
  assert.throws(
    () =>
      append(
        prepared.state,
        {
          type: "fence_rotated",
          newEpoch: 6,
          newTokenDigest: digest("fence-6"),
          recoveryReceiptDigest: digest("skip-epoch"),
        },
        "skip-fence",
      ),
    /fence_epoch_not_monotonic/,
  );
});

test("artifact sealing is canonical and journal replay detects corruption", () => {
  assert.equal(
    canonicalCloseoutJson({ z: 1, a: { d: 2, c: 3 } }),
    canonicalCloseoutJson({ a: { c: 3, d: 2 }, z: 1 }),
  );
  const prepared = prepareReady();
  const corrupted = structuredClone(prepared.entries);
  corrupted[1].payload.receipt.archiveDigest = digest("corrupt-after-seal");
  assert.throws(
    () => reduceCloseoutJournal(prepared.genesisState, corrupted),
    /journal_hash_mismatch|archive_receipt_digest_mismatch/,
  );
});

test("capsule construction rejects missing worktree effect, wrong order, duplicate effects, and scope ambiguity", () => {
  const base = genesis().bindings;
  for (const requiredEffects of [
    [effects()[0], effects()[2]],
    [effects()[1], effects()[0]],
    [effects()[0], effects()[1], effects()[1]],
  ]) {
    assert.throws(
      () =>
        createCloseoutCapsule({
          bindings: base,
          requiredEffects,
          fence: { epoch: 1, tokenDigest: digest("new-fence") },
        }),
      /candidate_closeout_/,
    );
  }
  assert.throws(
    () =>
      createCloseoutCapsule({
        bindings: {
          ...base,
          disposition: "rejected",
          acceptedScopeDigest: base.acceptedScopeDigest,
        },
        requiredEffects: effects(),
        fence: { epoch: 1, tokenDigest: digest("new-fence") },
      }),
    /accepted_scope_for_nonaccepted/,
  );
});

test("owner artifacts bind the capsule, configured authority, registered target, and authentication receipt", () => {
  let state = genesis();
  for (const certificate of [
    promotion(state, { capsuleId: digest("other-capsule") }),
    promotion(state, { authorityConfigDigest: digest("untrusted-target-owner") }),
    promotion(state, { registeredTargetConfigDigest: digest("unregistered-target") }),
    promotion(state, { targetRepositoryDigest: digest("other-repository") }),
    promotion(state, { authenticationReceiptDigest: "not-a-digest" }),
  ]) {
    assert.throws(
      () => append(state, { type: "promotion_attached", certificate }, "untrusted-promotion", T1),
      /candidate_closeout_/,
    );
  }
  state = append(
    state,
    { type: "promotion_attached", certificate: promotion(state) },
    "trusted-promotion",
    T1,
  ).state;
  assert.throws(
    () =>
      append(
        state,
        {
          type: "archive_attached",
          receipt: archive(state, { authorityConfigDigest: digest("untrusted-pi-owner") }),
        },
        "untrusted-archive",
        T2,
      ),
    /archive_authority_mismatch/,
  );
  state = append(
    state,
    { type: "archive_attached", receipt: archive(state) },
    "trusted-archive",
    T2,
  ).state;
  assert.throws(
    () =>
      append(
        state,
        {
          type: "permit_attached",
          permit: permit(state, { authenticationReceiptDigest: "not-a-digest" }),
        },
        "untrusted-permit",
        T3,
      ),
    /permit_authentication_receipt_invalid/,
  );
});

test("runtime validation rejects malformed disposition, event, observation, and blocker enums", () => {
  const acceptedBindings = genesis().bindings;
  assert.throws(
    () =>
      createCloseoutCapsule({
        bindings: { ...acceptedBindings, disposition: "deferred", acceptedScopeDigest: undefined },
        requiredEffects: effects(),
        fence: { epoch: 1, tokenDigest: digest("runtime-fence") },
      }),
    /disposition_invalid/,
  );
  const prepared = prepareReady();
  const unknown = createCloseoutJournalEntry(prepared.state, {
    eventId: "unknown-event",
    occurredAt: nextTime(prepared.state),
    payload: { type: "v1_cleanup_success" },
  });
  assert.throws(() => applyCloseoutJournalEntry(prepared.state, unknown), /event_type_invalid/);

  const intended = intendNext(prepared.state, "runtime-outcome-intent");
  assert.throws(
    () =>
      append(
        intended.state,
        {
          type: "effect_observed",
          observation: {
            effectKey: intended.state.pendingIntent.effectKey,
            intentEntryHash: intended.entry.entryHash,
            outcome: "failed",
            observationDigest: digest("failed-effect"),
          },
        },
        "invalid-outcome",
      ),
    /observation_outcome_invalid/,
  );
  assert.throws(
    () =>
      append(
        prepared.state,
        { type: "block_recorded", reason: "ignore_safety", evidenceDigest: digest("bad-reason") },
        "invalid-block",
      ),
    /block_reason_invalid/,
  );
});

test("materialized state and applied artifacts cannot be mutated outside the journal", () => {
  const state = genesis();
  const certificate = promotion(state);
  const applied = append(
    state,
    { type: "promotion_attached", certificate },
    "immutable-promotion",
    T1,
  );
  const originalOutput = applied.state.promotionCertificate.validationAttestations[0].outputDigest;
  certificate.validationAttestations[0].outputDigest = digest("mutated-caller-object");
  applied.entry.payload.certificate.validationAttestations[0].outputDigest =
    digest("mutated-entry");
  assert.equal(
    applied.state.promotionCertificate.validationAttestations[0].outputDigest,
    originalOutput,
  );
  assert.doesNotThrow(() =>
    createCloseoutJournalEntry(applied.state, {
      eventId: "state-still-valid",
      occurredAt: T2,
      payload: { type: "archive_attached", receipt: archive(applied.state) },
    }),
  );

  const tampered = structuredClone(applied.state);
  tampered.phase = "cleaned";
  assert.throws(
    () =>
      createCloseoutJournalEntry(tampered, {
        eventId: "forged-state",
        occurredAt: T2,
        payload: { type: "archive_attached", receipt: archive(applied.state) },
      }),
    /capsule_state_digest_mismatch/,
  );
});

test("journal rejects duplicate event ids, regressed time, and a backdated guard", () => {
  const { state } = prepareReady();
  assert.throws(
    () =>
      append(
        state,
        { type: "block_recorded", reason: "runtime_stale", evidenceDigest: digest("duplicate") },
        "permit",
      ),
    /journal_event_id_replayed/,
  );
  assert.throws(
    () =>
      append(
        state,
        { type: "block_recorded", reason: "runtime_stale", evidenceDigest: digest("regressed") },
        "regressed",
        T2,
      ),
    /journal_time_regressed/,
  );
  const late = "2026-07-17T14:00:00.000Z";
  assert.throws(
    () =>
      append(
        state,
        {
          type: "effect_intended",
          intent: {
            effectKey: state.requiredEffectKeys[0],
            permitDigest: state.cleanupPermit.permitDigest,
            guard: guard(state, T4),
          },
        },
        "backdated-guard",
        late,
      ),
    /guard_event_time_mismatch/,
  );
});

test("a not-applied crash probe clears uncertainty without claiming an effect", () => {
  const prepared = prepareReady();
  const intended = intendNext(prepared.state, "intent-before-no-effect-crash");
  let state = observePending(
    intended.state,
    intended.entry,
    "probe-not-applied",
    "not_applied",
  ).state;
  assert.equal(state.phase, "partial_review");
  assert.equal(state.pendingIntent, undefined);
  assert.equal(state.observations.length, 0);

  const replacement = permit(state, {
    issuedAt: nextTime(state),
    expiresAt: "2026-07-17T14:00:00.000Z",
    nonce: "retry-after-no-effect",
    effects: state.requiredEffects,
    supersedesPermitDigest: state.cleanupPermit.permitDigest,
    priorObservationsDigest: digestCloseoutValue([]),
  });
  state = append(
    state,
    { type: "permit_attached", permit: replacement },
    "permit-after-no-effect",
  ).state;
  assert.equal(state.phase, "ready");
  assert.equal(state.observations.length, 0);
});

test("superseding authorization may contain only the branch after worktree removal", () => {
  let state = prepareReady().state;
  state = completeOneEffect(state, "process-before-branch-only").state;
  state = completeOneEffect(state, "worktree-before-branch-only").state;
  state = append(
    state,
    {
      type: "block_recorded",
      reason: "authorization_expired",
      evidenceDigest: digest("expired-before-branch"),
    },
    "expired-before-branch",
  ).state;
  const replacement = permit(state, {
    issuedAt: nextTime(state),
    expiresAt: "2026-07-17T14:00:00.000Z",
    nonce: "branch-only",
    effects: [state.requiredEffects[2]],
    supersedesPermitDigest: state.cleanupPermit.permitDigest,
    priorObservationsDigest: digestCloseoutValue(state.observations),
  });
  state = append(
    state,
    { type: "permit_attached", permit: replacement },
    "branch-only-permit",
  ).state;
  assert.equal(state.phase, "ready");
  assert.deepEqual(state.cleanupPermit.effects, [state.requiredEffects[2]]);
});

test("binding, target, or archive drift after an effect requires fresh lineage", () => {
  for (const reason of ["binding_drift", "target_diverged", "archive_corrupt"]) {
    const first = completeOneEffect(prepareReady().state, `first-${reason}`);
    const state = append(
      first.state,
      { type: "block_recorded", reason, evidenceDigest: digest(reason) },
      `block-${reason}`,
    ).state;
    assert.equal(state.phase, "fresh_review_required");
    assert.equal(state.observations.length, 1);
    assert.throws(
      () => append(state, { type: "permit_attached", permit: permit(state) }, `repermit-${reason}`),
      /permit_state_invalid/,
    );
  }
});

test("authority artifacts cannot be attached before issuance, after expiry, or before validation", () => {
  const genesisState = genesis();
  assert.throws(
    () =>
      append(
        genesisState,
        { type: "promotion_attached", certificate: promotion(genesisState, { issuedAt: T2 }) },
        "future-promotion",
        T1,
      ),
    /promotion_issued_in_future/,
  );
  assert.throws(
    () =>
      append(
        genesisState,
        {
          type: "promotion_attached",
          certificate: promotion(genesisState, {
            validationAttestations: [validation({ finishedAt: T2 })],
          }),
        },
        "premature-promotion",
        T1,
      ),
    /promotion_precedes_validation/,
  );
  const ready = prepareReady().state;
  const expiredPermit = permit(ready, {
    issuedAt: T3,
    expiresAt: T4,
    nonce: "already-expired-at-attachment",
    supersedesPermitDigest: ready.cleanupPermit.permitDigest,
    priorObservationsDigest: digestCloseoutValue([]),
  });
  const blocked = append(
    ready,
    { type: "block_recorded", reason: "authorization_expired", evidenceDigest: digest("expired") },
    "expiry-observed",
    T5,
  ).state;
  assert.throws(
    () => append(blocked, { type: "permit_attached", permit: expiredPermit }, "expired-attach", T5),
    /permit_not_current_at_attachment/,
  );
});

// Guard that this test slice stays pure: the module exposes data reduction only and never accepts adapters.
test("public reducer inputs contain no operational adapter or path-to-live-state hooks", async () => {
  const moduleKeys = Object.keys(await import("../src/candidatePeerCloseoutReducer.ts")).sort();
  assert.deepEqual(moduleKeys, [
    "CLOSEOUT_ARTIFACT_SCHEMA_VERSION",
    "CLOSEOUT_CAPSULE_SCHEMA_VERSION",
    "applyCloseoutJournalEntry",
    "canonicalCloseoutJson",
    "closeoutEffectKey",
    "createCloseoutCapsule",
    "createCloseoutJournalEntry",
    "digestCloseoutValue",
    "reduceCloseoutJournal",
    "sealArchiveReceipt",
    "sealCleanupPermit",
    "sealCloseoutEffectReceipt",
    "sealPendingEffectRecovery",
    "sealPromotionCertificate",
    "sealRemainingEffectsWaiver",
    "sealValidationAttestation",
  ]);
});
