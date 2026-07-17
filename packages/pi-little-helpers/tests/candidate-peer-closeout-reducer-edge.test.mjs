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
        },
      },
    },
    eventId,
    occurredAt,
  );
}

function observe(state, intentEntry, outcome, eventId) {
  return append(
    state,
    {
      type: "effect_observed",
      observation: {
        effectKey: state.pendingIntent.effectKey,
        intentEntryHash: intentEntry.entryHash,
        outcome,
        observationDigest: digest(eventId),
      },
    },
    eventId,
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
