import { createHash } from "node:crypto";

export const CLOSEOUT_CAPSULE_SCHEMA_VERSION = 1 as const;
export const CLOSEOUT_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type CandidateCloseoutDisposition = "accepted" | "rejected" | "superseded";
export type CandidateCloseoutPhase =
  | "awaiting_promotion_certificate"
  | "awaiting_archive_receipt"
  | "awaiting_cleanup_permit"
  | "ready"
  | "effect_intended"
  | "effect_reconciliation_required"
  | "blocked"
  | "fresh_review_required"
  | "partial_review"
  | "cleaned"
  | "closed_with_retained_effects";

export type CloseoutEffectSpec =
  | { kind: "close_process"; processIdentityDigest: string }
  | {
      kind: "remove_worktree";
      generationId: string;
      worktreeRealPath: string;
      gitCommonDirDigest: string;
    }
  | {
      kind: "delete_branch";
      fullRef: string;
      expectedOid: string;
      gitCommonDirDigest: string;
    };

export type CloseoutBindings = {
  resourceId: string;
  generationId: string;
  sourceLifecycleVersion: number;
  sourceRecordDigest: string;
  disposition: CandidateCloseoutDisposition;
  reviewSnapshotDigest: string;
  acceptedScopeDigest?: string;
  targetOwnerAuthorityDigest: string;
  piOwnerAuthorityDigest: string;
  registeredTargetConfigDigest: string;
  targetRepositoryDigest: string;
  clockAuthorityDigest: string;
};

export type ValidationAttestationV1 = {
  schemaVersion: 1;
  issuer: string;
  targetOid: string;
  targetTreeDigest: string;
  argv: string[];
  cwd: string;
  policyDigest: string;
  toolchainDigest: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  outputDigest: string;
  attestationDigest: string;
};

export type PromotionCertificateV1 = {
  schemaVersion: 1;
  capsuleId: string;
  resourceId: string;
  generationId: string;
  issuer: string;
  authorityConfigDigest: string;
  authenticationReceiptDigest: string;
  issuedAt: string;
  registeredTargetConfigDigest: string;
  targetRepositoryDigest: string;
  fullTargetRef: string;
  observedTargetOid: string;
  acceptedScopeDigest: string;
  integrationProofDigest: string;
  validationAttestations: ValidationAttestationV1[];
  certificateDigest: string;
};

export type ArchiveReceiptV1 = {
  schemaVersion: 1;
  capsuleId: string;
  resourceId: string;
  generationId: string;
  issuer: string;
  authorityConfigDigest: string;
  authenticationReceiptDigest: string;
  verifiedAt: string;
  reviewSnapshotDigest: string;
  promotionCertificateDigest?: string;
  archiveDigest: string;
  restorationManifestDigest: string;
  receiptDigest: string;
};

export type CleanupPermitV1 = {
  schemaVersion: 1;
  capsuleId: string;
  resourceId: string;
  generationId: string;
  issuer: string;
  authorityConfigDigest: string;
  authenticationReceiptDigest: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  bindingsDigest: string;
  archiveReceiptDigest: string;
  promotionCertificateDigest?: string;
  policyDigest: string;
  holdDigest: string;
  runtimeDigest: string;
  fenceEpoch: number;
  fenceTokenDigest: string;
  effects: CloseoutEffectSpec[];
  supersedesPermitDigest?: string;
  priorObservationsDigest?: string;
  permitDigest: string;
};

export type CloseoutGuardSnapshot = {
  observedAt: string;
  clockAuthorityDigest: string;
  clockReceiptDigest: string;
  bindingsDigest: string;
  archiveReceiptDigest: string;
  policyDigest: string;
  holdDigest: string;
  runtimeDigest: string;
  targetRelation: "same" | "descendant" | "diverged" | "not_applicable";
  targetFullRef?: string;
  targetObservedOid?: string;
  targetObservationDigest?: string;
};

export type CloseoutEffectIntent = {
  effectKey: string;
  permitDigest: string;
  guard: CloseoutGuardSnapshot;
};

export type CloseoutEffectOutcome = "completed" | "already_satisfied_after_intent" | "not_applied";

export type CloseoutEffectReceiptV1 = {
  schemaVersion: 1;
  adapterId: string;
  adapterSchemaVersion: string;
  capsuleId: string;
  effectKey: string;
  effectKind: CloseoutEffectSpec["kind"];
  effectSpecDigest: string;
  intentEntryHash: string;
  permitDigest: string;
  fenceEpoch: number;
  fenceTokenDigest: string;
  observedAt: string;
  preconditionDigest: string;
  postconditionDigest: string;
  outcome: CloseoutEffectOutcome;
  receiptDigest: string;
};

export type CloseoutEffectObservation = {
  effectKey: string;
  intentEntryHash: string;
  outcome: CloseoutEffectOutcome;
  receipt: CloseoutEffectReceiptV1;
};

export type PendingEffectRecoveryV1 = {
  schemaVersion: 1;
  capsuleId: string;
  resourceId: string;
  generationId: string;
  issuer: string;
  authorityConfigDigest: string;
  authenticationReceiptDigest: string;
  issuedAt: string;
  pendingIntentEntryHash: string;
  priorFenceEpoch: number;
  priorFenceTokenDigest: string;
  newFenceEpoch: number;
  newFenceTokenDigest: string;
  recoveryDigest: string;
};

export type RemainingEffectsWaiverV1 = {
  schemaVersion: 1;
  capsuleId: string;
  resourceId: string;
  generationId: string;
  issuer: string;
  authorityConfigDigest: string;
  authenticationReceiptDigest: string;
  issuedAt: string;
  bindingsDigest: string;
  archiveReceiptDigest: string;
  promotionCertificateDigest?: string;
  cleanupPermitDigest: string;
  expectedCapsuleVersion: number;
  expectedChainHead: string;
  fenceEpoch: number;
  fenceTokenDigest: string;
  observationsDigest: string;
  retainedEffectKeys: string[];
  rationale: string;
  waiverDigest: string;
};

export type CloseoutBlockReason =
  | "authorization_expired"
  | "authorization_revoked"
  | "binding_drift"
  | "target_diverged"
  | "archive_corrupt"
  | "hold_changed"
  | "runtime_stale"
  | "fence_lost";

export type CloseoutPayload =
  | { type: "promotion_attached"; certificate: PromotionCertificateV1 }
  | { type: "archive_attached"; receipt: ArchiveReceiptV1 }
  | { type: "permit_attached"; permit: CleanupPermitV1 }
  | { type: "effect_intended"; intent: CloseoutEffectIntent }
  | { type: "effect_observed"; observation: CloseoutEffectObservation }
  | { type: "block_recorded"; reason: CloseoutBlockReason; evidenceDigest: string }
  | {
      type: "fence_rotated";
      newEpoch: number;
      newTokenDigest: string;
      recoveryReceiptDigest: string;
    }
  | { type: "pending_effect_recovered"; recovery: PendingEffectRecoveryV1 }
  | { type: "remaining_effects_waived"; waiver: RemainingEffectsWaiverV1 };

export type CloseoutJournalEntryV1 = {
  schemaVersion: 1;
  capsuleId: string;
  eventId: string;
  sequence: number;
  expectedCapsuleVersion: number;
  occurredAt: string;
  fenceEpoch: number;
  fenceTokenDigest: string;
  previousHash: string;
  payload: CloseoutPayload;
  entryHash: string;
};

export type CloseoutCapsule = {
  schemaVersion: 1;
  capsuleId: string;
  capsuleVersion: number;
  sequence: number;
  chainHead: string;
  stateDigest: string;
  eventIds: string[];
  lastEventAt?: string;
  bindings: CloseoutBindings;
  bindingsDigest: string;
  requiredEffects: CloseoutEffectSpec[];
  requiredEffectKeys: string[];
  fence: { epoch: number; tokenDigest: string };
  phase: CandidateCloseoutPhase;
  promotionCertificate?: PromotionCertificateV1;
  archiveReceipt?: ArchiveReceiptV1;
  cleanupPermit?: CleanupPermitV1;
  pendingIntent?: CloseoutEffectIntent & { intentEntryHash: string };
  observations: CloseoutEffectObservation[];
  blockers: Array<{ reason: CloseoutBlockReason; evidenceDigest: string; entryHash: string }>;
  retainedEffectKeys: string[];
  terminalReceiptDigest?: string;
};

type WithoutDigest<T, K extends keyof T> = Omit<T, K>;

function canonicalKeyOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) closeoutFail("canonical_number_invalid");
    return Object.is(value, -0) ? 0 : value;
  }
  if (!value || typeof value !== "object") closeoutFail("canonical_value_invalid");
  if (ancestors.has(value)) closeoutFail("canonical_cycle_invalid");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === "symbol") || keys.length !== value.length + 1) {
        closeoutFail("canonical_array_invalid");
      }
      const items: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) {
          closeoutFail("canonical_array_invalid");
        }
        items.push(canonicalValue(descriptor.value, ancestors));
      }
      return items;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      closeoutFail("canonical_object_invalid");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) closeoutFail("canonical_object_invalid");
    const entries = (keys as string[]).map((key): [string, unknown] => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) {
        closeoutFail("canonical_value_invalid");
      }
      return [key, descriptor.value];
    });
    return Object.fromEntries(
      entries
        .sort(([left], [right]) => canonicalKeyOrder(left, right))
        .map(([key, item]) => [key, canonicalValue(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalCloseoutJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function digestCloseoutValue(value: unknown): string {
  return createHash("sha256").update(canonicalCloseoutJson(value)).digest("hex");
}

export function closeoutFail(message: string): never {
  throw new Error(`candidate_closeout_${message}`);
}

export function assertCloseoutText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim() === "") closeoutFail(`${name}_required`);
}

export function assertCloseoutDigest(value: string, name: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) closeoutFail(`${name}_invalid`);
}

export function assertCloseoutOid(value: string, name: string): void {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) closeoutFail(`${name}_invalid`);
}

export function closeoutTimestampMillis(value: string, name: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    closeoutFail(`${name}_invalid`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    closeoutFail(`${name}_invalid`);
  }
  return millis;
}

export function closeoutCapsuleStateDigest(capsule: CloseoutCapsule): string {
  const state = structuredClone(capsule) as Partial<CloseoutCapsule>;
  delete state.stateDigest;
  return digestCloseoutValue(state);
}

export function sealCloseoutCapsuleState(capsule: CloseoutCapsule): CloseoutCapsule {
  capsule.stateDigest = closeoutCapsuleStateDigest(capsule);
  return capsule;
}

export function assertCloseoutCapsuleState(capsule: CloseoutCapsule): void {
  if (capsule.stateDigest !== closeoutCapsuleStateDigest(capsule)) {
    closeoutFail("capsule_state_digest_mismatch");
  }
}

function digestArtifact<T extends Record<string, unknown>>(
  artifact: T,
  digestKey: keyof T,
): string {
  const copy = { ...artifact };
  delete copy[digestKey];
  return digestCloseoutValue(copy);
}

export function assertCloseoutArtifactDigest<T extends Record<string, unknown>>(
  artifact: T,
  digestKey: keyof T,
  name: string,
): void {
  const actual = artifact[digestKey];
  if (typeof actual !== "string" || actual !== digestArtifact(artifact, digestKey)) {
    closeoutFail(`${name}_digest_mismatch`);
  }
}

export function validateCloseoutValidationAttestation(
  attestation: ValidationAttestationV1,
  targetOid: string,
): void {
  if (attestation.schemaVersion !== 1) closeoutFail("attestation_schema_unsupported");
  assertCloseoutText(attestation.issuer, "attestation_issuer");
  if (attestation.targetOid !== targetOid) closeoutFail("attestation_target_mismatch");
  assertCloseoutDigest(attestation.targetTreeDigest, "target_tree");
  if (!Array.isArray(attestation.argv) || attestation.argv.length === 0) {
    closeoutFail("attestation_argv_required");
  }
  for (const arg of attestation.argv) assertCloseoutText(arg, "attestation_argv");
  assertCloseoutText(attestation.cwd, "attestation_cwd");
  assertCloseoutDigest(attestation.policyDigest, "attestation_policy");
  assertCloseoutDigest(attestation.toolchainDigest, "attestation_toolchain");
  const started = closeoutTimestampMillis(attestation.startedAt, "attestation_started_at");
  const finished = closeoutTimestampMillis(attestation.finishedAt, "attestation_finished_at");
  if (finished < started) closeoutFail("attestation_time_order_invalid");
  if (attestation.exitCode !== 0) closeoutFail("attestation_not_successful");
  assertCloseoutDigest(attestation.outputDigest, "attestation_output");
  assertCloseoutArtifactDigest(
    attestation as unknown as Record<string, unknown>,
    "attestationDigest",
    "attestation",
  );
}

function sealArtifact<T extends Record<string, unknown>, K extends keyof T>(
  input: Omit<T, K>,
  digestKey: K,
): T {
  const cloned = structuredClone(input) as Record<string, unknown>;
  cloned[digestKey as string] = digestCloseoutValue(cloned);
  return cloned as T;
}

export function sealValidationAttestation(
  input: WithoutDigest<ValidationAttestationV1, "attestationDigest">,
): ValidationAttestationV1 {
  return sealArtifact(input, "attestationDigest");
}

export function sealPromotionCertificate(
  input: WithoutDigest<PromotionCertificateV1, "certificateDigest">,
): PromotionCertificateV1 {
  return sealArtifact(input, "certificateDigest");
}

export function sealArchiveReceipt(
  input: WithoutDigest<ArchiveReceiptV1, "receiptDigest">,
): ArchiveReceiptV1 {
  return sealArtifact(input, "receiptDigest");
}

export function sealCleanupPermit(
  input: WithoutDigest<CleanupPermitV1, "permitDigest">,
): CleanupPermitV1 {
  return sealArtifact(input, "permitDigest");
}

export function sealCloseoutEffectReceipt(
  input: WithoutDigest<CloseoutEffectReceiptV1, "receiptDigest">,
): CloseoutEffectReceiptV1 {
  return sealArtifact(input, "receiptDigest");
}

export function sealPendingEffectRecovery(
  input: WithoutDigest<PendingEffectRecoveryV1, "recoveryDigest">,
): PendingEffectRecoveryV1 {
  return sealArtifact(input, "recoveryDigest");
}

export function sealRemainingEffectsWaiver(
  input: WithoutDigest<RemainingEffectsWaiverV1, "waiverDigest">,
): RemainingEffectsWaiverV1 {
  return sealArtifact(input, "waiverDigest");
}

export function closeoutEffectKey(capsuleId: string, effect: CloseoutEffectSpec): string {
  return digestCloseoutValue({ domain: "candidate-closeout-effect/v1", capsuleId, effect });
}

export function remainingCloseoutEffects(capsule: CloseoutCapsule): CloseoutEffectSpec[] {
  const observed = new Set(capsule.observations.map((item) => item.effectKey));
  return capsule.requiredEffects.filter(
    (effect) => !observed.has(closeoutEffectKey(capsule.capsuleId, effect)),
  );
}

export function nextCloseoutEffectKey(capsule: CloseoutCapsule): string | undefined {
  const observed = new Set(capsule.observations.map((item) => item.effectKey));
  return capsule.requiredEffectKeys.find((key) => !observed.has(key));
}

function effectOrder(effect: CloseoutEffectSpec): number {
  return { close_process: 0, remove_worktree: 1, delete_branch: 2 }[effect.kind];
}

function hasUnsafeBranchRefCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f || "~^:?*[\\".includes(character);
  });
}

export function validateCloseoutEffects(
  effects: CloseoutEffectSpec[],
  generationId: string,
  options: { requireWorktree?: boolean } = {},
): void {
  if (!Array.isArray(effects) || effects.length === 0) closeoutFail("effects_required");
  let priorOrder = -1;
  const digests = new Set<string>();
  for (const effect of effects) {
    if (!effect || !["close_process", "remove_worktree", "delete_branch"].includes(effect.kind)) {
      closeoutFail("effect_kind_invalid");
    }
    const order = effectOrder(effect);
    if (order <= priorOrder) closeoutFail("effects_order_invalid");
    priorOrder = order;
    const digest = digestCloseoutValue(effect);
    if (digests.has(digest)) closeoutFail("effects_duplicate");
    digests.add(digest);
    if (effect.kind === "close_process") {
      assertCloseoutDigest(effect.processIdentityDigest, "process_identity");
    } else if (effect.kind === "remove_worktree") {
      if (effect.generationId !== generationId) closeoutFail("worktree_generation_mismatch");
      assertCloseoutText(effect.worktreeRealPath, "worktree_real_path");
      if (
        !effect.worktreeRealPath.startsWith("/") ||
        effect.worktreeRealPath === "/" ||
        effect.worktreeRealPath.includes("\0") ||
        effect.worktreeRealPath.endsWith("/") ||
        effect.worktreeRealPath.includes("//") ||
        effect.worktreeRealPath.split("/").some((part) => part === "." || part === "..")
      ) {
        closeoutFail("worktree_real_path_unsafe");
      }
      assertCloseoutDigest(effect.gitCommonDirDigest, "git_common_dir");
    } else {
      const refParts = effect.fullRef.split("/");
      if (
        !effect.fullRef.startsWith("refs/heads/") ||
        effect.fullRef.endsWith("/") ||
        effect.fullRef.endsWith(".") ||
        effect.fullRef.includes("//") ||
        effect.fullRef.includes("..") ||
        effect.fullRef.includes("@{") ||
        refParts.some((part) => part === "" || part.startsWith(".") || part.endsWith(".lock")) ||
        hasUnsafeBranchRefCharacter(effect.fullRef)
      ) {
        closeoutFail("branch_full_ref_invalid");
      }
      assertCloseoutOid(effect.expectedOid, "branch_oid");
      assertCloseoutDigest(effect.gitCommonDirDigest, "git_common_dir");
    }
  }
  const requireWorktree = options.requireWorktree ?? true;
  if (requireWorktree && !effects.some((effect) => effect.kind === "remove_worktree")) {
    closeoutFail("remove_worktree_effect_required");
  }
}
