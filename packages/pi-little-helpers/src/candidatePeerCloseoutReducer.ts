import {
  type ArchiveReceiptV1,
  assertCloseoutArtifactDigest as assertArtifactDigest,
  assertCloseoutDigest as assertDigest,
  assertCloseoutOid as assertOid,
  assertCloseoutCapsuleState as assertState,
  assertCloseoutText as assertText,
  CLOSEOUT_ARTIFACT_SCHEMA_VERSION,
  CLOSEOUT_CAPSULE_SCHEMA_VERSION,
  type CleanupPermitV1,
  type CloseoutBindings,
  type CloseoutCapsule,
  type CloseoutEffectIntent,
  type CloseoutEffectSpec,
  type CloseoutJournalEntryV1,
  type CloseoutPayload,
  canonicalCloseoutJson,
  closeoutEffectKey,
  digestCloseoutValue,
  closeoutFail as fail,
  nextCloseoutEffectKey as nextEffectKey,
  type PromotionCertificateV1,
  remainingCloseoutEffects as remainingEffects,
  sealCloseoutCapsuleState as sealState,
  closeoutTimestampMillis as timestampMillis,
  validateCloseoutValidationAttestation as validateAttestation,
  validateCloseoutEffects as validateEffects,
} from "./candidatePeerCloseoutArtifacts.ts";

export {
  CLOSEOUT_ARTIFACT_SCHEMA_VERSION,
  CLOSEOUT_CAPSULE_SCHEMA_VERSION,
  canonicalCloseoutJson,
  closeoutEffectKey,
  digestCloseoutValue,
  sealArchiveReceipt,
  sealCleanupPermit,
  sealPromotionCertificate,
  sealValidationAttestation,
} from "./candidatePeerCloseoutArtifacts.ts";

export function createCloseoutCapsule(input: {
  bindings: CloseoutBindings;
  requiredEffects: CloseoutEffectSpec[];
  fence: { epoch: number; tokenDigest: string };
}): CloseoutCapsule {
  const { bindings, requiredEffects, fence } = structuredClone(input);
  assertText(bindings.resourceId, "resource_id");
  assertText(bindings.generationId, "generation_id");
  if (!Number.isInteger(bindings.sourceLifecycleVersion) || bindings.sourceLifecycleVersion < 0) {
    fail("source_lifecycle_version_invalid");
  }
  if (!["accepted", "rejected", "superseded"].includes(bindings.disposition)) {
    fail("disposition_invalid");
  }
  assertDigest(bindings.sourceRecordDigest, "source_record");
  assertDigest(bindings.reviewSnapshotDigest, "review_snapshot");
  assertDigest(bindings.targetOwnerAuthorityDigest, "target_owner_authority");
  assertDigest(bindings.piOwnerAuthorityDigest, "pi_owner_authority");
  assertDigest(bindings.registeredTargetConfigDigest, "registered_target_config");
  assertDigest(bindings.targetRepositoryDigest, "target_repository");
  assertDigest(bindings.clockAuthorityDigest, "clock_authority");
  if (bindings.disposition === "accepted") {
    assertDigest(bindings.acceptedScopeDigest ?? "", "accepted_scope");
  } else if (bindings.acceptedScopeDigest !== undefined) {
    fail("accepted_scope_for_nonaccepted");
  }
  if (!Number.isInteger(fence.epoch) || fence.epoch < 1) fail("fence_epoch_invalid");
  assertDigest(fence.tokenDigest, "fence_token");
  validateEffects(requiredEffects, bindings.generationId);
  const bindingsDigest = digestCloseoutValue(bindings);
  const capsuleId = digestCloseoutValue({
    domain: "candidate-closeout-capsule/v1",
    resourceId: bindings.resourceId,
    generationId: bindings.generationId,
    reviewSnapshotDigest: bindings.reviewSnapshotDigest,
    bindingsDigest,
  });
  const requiredEffectKeys = requiredEffects.map((effect) => closeoutEffectKey(capsuleId, effect));
  const genesis = { capsuleId, bindingsDigest, requiredEffectKeys, fence };
  return sealState({
    schemaVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
    capsuleId,
    capsuleVersion: 0,
    sequence: 0,
    chainHead: digestCloseoutValue({ domain: "candidate-closeout-genesis/v1", genesis }),
    stateDigest: "",
    eventIds: [],
    bindings,
    bindingsDigest,
    requiredEffects,
    requiredEffectKeys,
    fence,
    phase:
      bindings.disposition === "accepted"
        ? "awaiting_promotion_certificate"
        : "awaiting_archive_receipt",
    observations: [],
    blockers: [],
    retainedEffectKeys: [],
  });
}

function validatePromotion(
  capsule: CloseoutCapsule,
  certificate: PromotionCertificateV1,
  occurredAt: string,
): void {
  if (certificate.schemaVersion !== 1) fail("promotion_schema_unsupported");
  if (capsule.bindings.disposition !== "accepted") fail("promotion_for_nonaccepted");
  if (capsule.promotionCertificate) fail("promotion_already_attached");
  if (certificate.capsuleId !== capsule.capsuleId) fail("promotion_capsule_mismatch");
  if (certificate.resourceId !== capsule.bindings.resourceId) fail("promotion_resource_mismatch");
  if (certificate.generationId !== capsule.bindings.generationId) {
    fail("promotion_generation_mismatch");
  }
  assertText(certificate.issuer, "promotion_issuer");
  if (certificate.authorityConfigDigest !== capsule.bindings.targetOwnerAuthorityDigest) {
    fail("promotion_authority_mismatch");
  }
  assertDigest(certificate.authenticationReceiptDigest, "promotion_authentication_receipt");
  const issued = timestampMillis(certificate.issuedAt, "promotion_issued_at");
  if (issued > timestampMillis(occurredAt, "event_occurred_at")) fail("promotion_issued_in_future");
  if (certificate.registeredTargetConfigDigest !== capsule.bindings.registeredTargetConfigDigest) {
    fail("promotion_registered_target_mismatch");
  }
  if (certificate.targetRepositoryDigest !== capsule.bindings.targetRepositoryDigest) {
    fail("promotion_target_repository_mismatch");
  }
  if (!certificate.fullTargetRef.startsWith("refs/heads/")) fail("promotion_full_ref_invalid");
  assertOid(certificate.observedTargetOid, "promotion_target_oid");
  if (certificate.acceptedScopeDigest !== capsule.bindings.acceptedScopeDigest) {
    fail("promotion_scope_mismatch");
  }
  assertDigest(certificate.integrationProofDigest, "integration_proof");
  if (
    !Array.isArray(certificate.validationAttestations) ||
    certificate.validationAttestations.length === 0
  ) {
    fail("validation_attestation_required");
  }
  for (const attestation of certificate.validationAttestations) {
    validateAttestation(attestation, certificate.observedTargetOid);
    if (timestampMillis(attestation.finishedAt, "attestation_finished_at") > issued) {
      fail("promotion_precedes_validation");
    }
  }
  assertArtifactDigest(
    certificate as unknown as Record<string, unknown>,
    "certificateDigest",
    "promotion",
  );
}

function validateArchive(
  capsule: CloseoutCapsule,
  receipt: ArchiveReceiptV1,
  occurredAt: string,
): void {
  if (receipt.schemaVersion !== 1) fail("archive_schema_unsupported");
  if (capsule.archiveReceipt) fail("archive_already_attached");
  if (receipt.capsuleId !== capsule.capsuleId) fail("archive_capsule_mismatch");
  if (receipt.resourceId !== capsule.bindings.resourceId) fail("archive_resource_mismatch");
  if (receipt.generationId !== capsule.bindings.generationId) fail("archive_generation_mismatch");
  assertText(receipt.issuer, "archive_issuer");
  if (receipt.authorityConfigDigest !== capsule.bindings.piOwnerAuthorityDigest) {
    fail("archive_authority_mismatch");
  }
  assertDigest(receipt.authenticationReceiptDigest, "archive_authentication_receipt");
  const verified = timestampMillis(receipt.verifiedAt, "archive_verified_at");
  if (verified > timestampMillis(occurredAt, "event_occurred_at"))
    fail("archive_verified_in_future");
  if (receipt.reviewSnapshotDigest !== capsule.bindings.reviewSnapshotDigest) {
    fail("archive_review_mismatch");
  }
  const expectedPromotion = capsule.promotionCertificate?.certificateDigest;
  if (receipt.promotionCertificateDigest !== expectedPromotion) fail("archive_promotion_mismatch");
  if (
    capsule.promotionCertificate &&
    verified < timestampMillis(capsule.promotionCertificate.issuedAt, "promotion_issued_at")
  ) {
    fail("archive_precedes_promotion");
  }
  assertDigest(receipt.archiveDigest, "archive");
  assertDigest(receipt.restorationManifestDigest, "restoration_manifest");
  assertArtifactDigest(
    receipt as unknown as Record<string, unknown>,
    "receiptDigest",
    "archive_receipt",
  );
}

function validatePermit(
  capsule: CloseoutCapsule,
  permit: CleanupPermitV1,
  occurredAt: string,
): void {
  if (permit.schemaVersion !== 1) fail("permit_schema_unsupported");
  if (!capsule.archiveReceipt) fail("archive_required_before_permit");
  if (capsule.pendingIntent) fail("pending_intent_blocks_permit");
  if (permit.capsuleId !== capsule.capsuleId) fail("permit_capsule_mismatch");
  if (permit.resourceId !== capsule.bindings.resourceId) fail("permit_resource_mismatch");
  if (permit.generationId !== capsule.bindings.generationId) fail("permit_generation_mismatch");
  assertText(permit.issuer, "permit_issuer");
  if (permit.authorityConfigDigest !== capsule.bindings.piOwnerAuthorityDigest) {
    fail("permit_authority_mismatch");
  }
  assertDigest(permit.authenticationReceiptDigest, "permit_authentication_receipt");
  const issued = timestampMillis(permit.issuedAt, "permit_issued_at");
  const expires = timestampMillis(permit.expiresAt, "permit_expires_at");
  if (expires <= issued) fail("permit_expiry_invalid");
  const attached = timestampMillis(occurredAt, "event_occurred_at");
  if (attached < issued || attached >= expires) fail("permit_not_current_at_attachment");
  if (issued < timestampMillis(capsule.archiveReceipt.verifiedAt, "archive_verified_at")) {
    fail("permit_precedes_archive");
  }
  assertText(permit.nonce, "permit_nonce");
  if (permit.bindingsDigest !== capsule.bindingsDigest) fail("permit_bindings_mismatch");
  if (permit.archiveReceiptDigest !== capsule.archiveReceipt.receiptDigest) {
    fail("permit_archive_mismatch");
  }
  const expectedPromotion = capsule.promotionCertificate?.certificateDigest;
  if (permit.promotionCertificateDigest !== expectedPromotion) fail("permit_promotion_mismatch");
  assertDigest(permit.policyDigest, "permit_policy");
  assertDigest(permit.holdDigest, "permit_hold");
  assertDigest(permit.runtimeDigest, "permit_runtime");
  if (
    permit.fenceEpoch !== capsule.fence.epoch ||
    permit.fenceTokenDigest !== capsule.fence.tokenDigest
  ) {
    fail("permit_fence_mismatch");
  }
  const superseding = capsule.cleanupPermit !== undefined;
  validateEffects(permit.effects, capsule.bindings.generationId, {
    requireWorktree: !superseding,
  });
  if (canonicalCloseoutJson(permit.effects) !== canonicalCloseoutJson(remainingEffects(capsule))) {
    fail("permit_effects_not_exact_remaining");
  }
  if (capsule.cleanupPermit) {
    if (permit.supersedesPermitDigest !== capsule.cleanupPermit.permitDigest) {
      fail("permit_supersession_mismatch");
    }
    if (permit.priorObservationsDigest !== digestCloseoutValue(capsule.observations)) {
      fail("permit_prior_observations_mismatch");
    }
  } else if (permit.supersedesPermitDigest || permit.priorObservationsDigest) {
    fail("initial_permit_has_supersession");
  }
  assertArtifactDigest(permit as unknown as Record<string, unknown>, "permitDigest", "permit");
}

function validateIntent(
  capsule: CloseoutCapsule,
  intent: CloseoutEffectIntent,
  occurredAt: string,
): void {
  const permit = capsule.cleanupPermit;
  const archive = capsule.archiveReceipt;
  if (!permit || !archive) fail("permit_required_before_intent");
  if (capsule.pendingIntent) fail("effect_already_intended");
  if (intent.effectKey !== nextEffectKey(capsule)) fail("effect_not_next");
  if (intent.permitDigest !== permit.permitDigest) fail("intent_permit_mismatch");
  const guard = intent.guard;
  if (guard.observedAt !== occurredAt) fail("guard_event_time_mismatch");
  const observed = timestampMillis(guard.observedAt, "guard_observed_at");
  if (observed < timestampMillis(permit.issuedAt, "permit_issued_at")) fail("guard_before_permit");
  if (observed >= timestampMillis(permit.expiresAt, "permit_expires_at")) fail("permit_expired");
  if (guard.clockAuthorityDigest !== capsule.bindings.clockAuthorityDigest) {
    fail("guard_clock_authority_mismatch");
  }
  assertDigest(guard.clockReceiptDigest, "guard_clock_receipt");
  if (guard.bindingsDigest !== capsule.bindingsDigest) fail("guard_bindings_drift");
  if (guard.archiveReceiptDigest !== archive.receiptDigest) fail("guard_archive_drift");
  if (guard.policyDigest !== permit.policyDigest) fail("guard_policy_drift");
  if (guard.holdDigest !== permit.holdDigest) fail("guard_hold_drift");
  if (guard.runtimeDigest !== permit.runtimeDigest) fail("guard_runtime_drift");
  if (capsule.bindings.disposition === "accepted" && guard.targetRelation !== "same") {
    fail("guard_target_moved");
  }
  if (capsule.bindings.disposition !== "accepted" && guard.targetRelation !== "not_applicable") {
    fail("guard_target_relation_invalid");
  }
}

export function createCloseoutJournalEntry(
  capsule: CloseoutCapsule,
  input: {
    eventId: string;
    occurredAt: string;
    payload: CloseoutPayload;
    fenceEpoch?: number;
    fenceTokenDigest?: string;
  },
): CloseoutJournalEntryV1 {
  assertState(capsule);
  assertText(input.eventId, "event_id");
  timestampMillis(input.occurredAt, "event_occurred_at");
  const body = {
    schemaVersion: CLOSEOUT_ARTIFACT_SCHEMA_VERSION,
    capsuleId: capsule.capsuleId,
    eventId: input.eventId,
    sequence: capsule.sequence + 1,
    expectedCapsuleVersion: capsule.capsuleVersion,
    occurredAt: input.occurredAt,
    fenceEpoch: input.fenceEpoch ?? capsule.fence.epoch,
    fenceTokenDigest: input.fenceTokenDigest ?? capsule.fence.tokenDigest,
    previousHash: capsule.chainHead,
    payload: structuredClone(input.payload),
  };
  return { ...body, entryHash: digestCloseoutValue(body) };
}

export function applyCloseoutJournalEntry(
  capsule: CloseoutCapsule,
  entry: CloseoutJournalEntryV1,
): CloseoutCapsule {
  assertState(capsule);
  if (capsule.phase === "cleaned" || capsule.phase === "closed_with_retained_effects") {
    fail("terminal_capsule_immutable");
  }
  if (entry.schemaVersion !== 1) fail("journal_schema_unsupported");
  if (entry.capsuleId !== capsule.capsuleId) fail("journal_capsule_mismatch");
  if (entry.sequence !== capsule.sequence + 1) fail("journal_sequence_mismatch");
  if (entry.expectedCapsuleVersion !== capsule.capsuleVersion) fail("journal_cas_mismatch");
  if (entry.previousHash !== capsule.chainHead) fail("journal_previous_hash_mismatch");
  assertText(entry.eventId, "event_id");
  if (capsule.eventIds.includes(entry.eventId)) fail("journal_event_id_replayed");
  if (
    entry.fenceEpoch !== capsule.fence.epoch ||
    entry.fenceTokenDigest !== capsule.fence.tokenDigest
  ) {
    fail("journal_fence_mismatch");
  }
  const eventTime = timestampMillis(entry.occurredAt, "event_occurred_at");
  if (capsule.lastEventAt && eventTime < timestampMillis(capsule.lastEventAt, "last_event_at")) {
    fail("journal_time_regressed");
  }
  const { entryHash, ...body } = entry;
  if (entryHash !== digestCloseoutValue(body)) fail("journal_hash_mismatch");

  const next = structuredClone(capsule);
  const payload = structuredClone(entry.payload) as CloseoutPayload;
  if (payload.type === "promotion_attached") {
    if (next.phase !== "awaiting_promotion_certificate") fail("promotion_state_invalid");
    validatePromotion(next, payload.certificate, entry.occurredAt);
    next.promotionCertificate = structuredClone(payload.certificate);
    next.phase = "awaiting_archive_receipt";
  } else if (payload.type === "archive_attached") {
    if (next.phase !== "awaiting_archive_receipt") fail("archive_state_invalid");
    validateArchive(next, payload.receipt, entry.occurredAt);
    next.archiveReceipt = structuredClone(payload.receipt);
    next.phase = "awaiting_cleanup_permit";
  } else if (payload.type === "permit_attached") {
    if (
      next.phase !== "awaiting_cleanup_permit" &&
      next.phase !== "partial_review" &&
      next.phase !== "blocked"
    ) {
      fail("permit_state_invalid");
    }
    validatePermit(next, payload.permit, entry.occurredAt);
    next.cleanupPermit = structuredClone(payload.permit);
    next.phase = "ready";
  } else if (payload.type === "effect_intended") {
    if (next.phase !== "ready") fail("intent_state_invalid");
    validateIntent(next, payload.intent, entry.occurredAt);
    next.pendingIntent = { ...structuredClone(payload.intent), intentEntryHash: entry.entryHash };
    next.phase = "effect_intended";
  } else if (payload.type === "effect_observed") {
    const pending = next.pendingIntent;
    if (!pending) fail("observation_without_intent");
    if (payload.observation.effectKey !== pending.effectKey) fail("observation_effect_mismatch");
    if (payload.observation.intentEntryHash !== pending.intentEntryHash) {
      fail("observation_intent_hash_mismatch");
    }
    if (
      !["completed", "already_satisfied_after_intent", "not_applied"].includes(
        payload.observation.outcome,
      )
    ) {
      fail("observation_outcome_invalid");
    }
    assertDigest(payload.observation.observationDigest, "observation");
    if (next.observations.some((item) => item.effectKey === payload.observation.effectKey)) {
      fail("observation_replayed");
    }
    const recoveringFromReview = next.phase === "partial_review";
    const freshReviewRequired = next.phase === "fresh_review_required";
    next.pendingIntent = undefined;
    if (payload.observation.outcome === "not_applied") {
      next.phase = freshReviewRequired ? "fresh_review_required" : "partial_review";
    } else {
      next.observations.push(structuredClone(payload.observation));
      if (freshReviewRequired) {
        next.phase = "fresh_review_required";
      } else if (next.observations.length === next.requiredEffects.length) {
        next.phase = "cleaned";
        next.terminalReceiptDigest = digestCloseoutValue({
          type: "cleaned",
          capsuleId: next.capsuleId,
          observations: next.observations,
          entryHash: entry.entryHash,
        });
      } else {
        next.phase = recoveringFromReview ? "partial_review" : "ready";
      }
    }
  } else if (payload.type === "block_recorded") {
    if (
      ![
        "authorization_expired",
        "authorization_revoked",
        "binding_drift",
        "target_diverged",
        "archive_corrupt",
        "hold_changed",
        "runtime_stale",
        "fence_lost",
      ].includes(payload.reason)
    ) {
      fail("block_reason_invalid");
    }
    assertDigest(payload.evidenceDigest, "block_evidence");
    next.blockers.push({
      reason: payload.reason,
      evidenceDigest: payload.evidenceDigest,
      entryHash: entry.entryHash,
    });
    const lineageInvalid = ["binding_drift", "target_diverged", "archive_corrupt"].includes(
      payload.reason,
    );
    if (next.phase === "fresh_review_required" || lineageInvalid) {
      next.phase = "fresh_review_required";
    } else if (next.pendingIntent || next.observations.length > 0) {
      next.phase = "partial_review";
    } else if (
      payload.reason === "authorization_expired" ||
      payload.reason === "authorization_revoked"
    ) {
      next.phase = "awaiting_cleanup_permit";
    } else {
      next.phase = "blocked";
    }
  } else if (payload.type === "fence_rotated") {
    if (next.pendingIntent) fail("pending_intent_blocks_fence_rotation");
    if (!Number.isInteger(payload.newEpoch) || payload.newEpoch !== next.fence.epoch + 1) {
      fail("fence_epoch_not_monotonic");
    }
    assertDigest(payload.newTokenDigest, "new_fence_token");
    assertDigest(payload.recoveryReceiptDigest, "fence_recovery_receipt");
    const freshReviewRequired = next.phase === "fresh_review_required";
    next.fence = { epoch: payload.newEpoch, tokenDigest: payload.newTokenDigest };
    if (next.cleanupPermit && !freshReviewRequired) {
      next.phase = next.observations.length > 0 ? "partial_review" : "blocked";
    }
  } else if (payload.type === "remaining_effects_waived") {
    if (next.phase !== "partial_review") fail("waiver_state_invalid");
    if (next.pendingIntent) fail("pending_intent_blocks_waiver");
    assertText(payload.rationale, "waiver_rationale");
    assertDigest(payload.ownerReceiptDigest, "waiver_owner_receipt");
    const expected = remainingEffects(next).map((effect) =>
      closeoutEffectKey(next.capsuleId, effect),
    );
    if (canonicalCloseoutJson(payload.retainedEffectKeys) !== canonicalCloseoutJson(expected)) {
      fail("waiver_effects_not_exact_remaining");
    }
    next.retainedEffectKeys = [...payload.retainedEffectKeys];
    next.phase = "closed_with_retained_effects";
    next.terminalReceiptDigest = digestCloseoutValue({
      type: "closed_with_retained_effects",
      capsuleId: next.capsuleId,
      observations: next.observations,
      retainedEffectKeys: next.retainedEffectKeys,
      rationale: payload.rationale,
      ownerReceiptDigest: payload.ownerReceiptDigest,
      entryHash: entry.entryHash,
    });
  } else {
    fail("event_type_invalid");
  }

  next.capsuleVersion += 1;
  next.sequence = entry.sequence;
  next.chainHead = entry.entryHash;
  next.eventIds.push(entry.eventId);
  next.lastEventAt = entry.occurredAt;
  return sealState(next);
}

export function reduceCloseoutJournal(
  genesis: CloseoutCapsule,
  entries: CloseoutJournalEntryV1[],
): CloseoutCapsule {
  return entries.reduce(applyCloseoutJournalEntry, structuredClone(genesis));
}
