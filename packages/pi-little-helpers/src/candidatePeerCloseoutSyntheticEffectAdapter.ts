import {
  assertCloseoutCapsuleState,
  type CloseoutCapsule,
  type CloseoutEffectOutcome,
  type CloseoutEffectSpec,
  type CloseoutJournalEntryV1,
  canonicalCloseoutJson,
  digestCloseoutValue,
  sealCloseoutEffectReceipt,
} from "./candidatePeerCloseoutArtifacts.ts";
import {
  applyCloseoutJournalEntry,
  createCloseoutJournalEntry,
} from "./candidatePeerCloseoutReducer.ts";

export const SYNTHETIC_CLOSEOUT_WORLD_SCHEMA_VERSION = 1 as const;
export const SYNTHETIC_CLOSEOUT_ADAPTER_ID = "candidate-closeout-synthetic-effect/v1" as const;

export type SyntheticCloseoutEffectRecordV1 = {
  effect: CloseoutEffectSpec;
  present: boolean;
  applicationCount: number;
  appliedIntentEntryHash?: string;
};

export type SyntheticCloseoutWorldV1 = {
  schemaVersion: 1;
  capsuleId: string;
  records: Record<string, SyntheticCloseoutEffectRecordV1>;
};

export type SyntheticCloseoutFaultPoint =
  | "before_probe"
  | "after_probe_before_effect"
  | "after_effect_before_observation";

export type SyntheticCloseoutStep =
  | {
      status: "fault_injected";
      faultAt: SyntheticCloseoutFaultPoint;
      capsule: CloseoutCapsule;
      world: SyntheticCloseoutWorldV1;
    }
  | {
      status: "blocked";
      reason: "binding_drift";
      entry: CloseoutJournalEntryV1;
      capsule: CloseoutCapsule;
      world: SyntheticCloseoutWorldV1;
    }
  | {
      status: "observed";
      outcome: CloseoutEffectOutcome;
      entry: CloseoutJournalEntryV1;
      capsule: CloseoutCapsule;
      world: SyntheticCloseoutWorldV1;
    };

function syntheticFail(message: string): never {
  throw new Error(`candidate_closeout_synthetic_${message}`);
}

function exactEffectMatches(left: CloseoutEffectSpec, right: CloseoutEffectSpec): boolean {
  return canonicalCloseoutJson(left) === canonicalCloseoutJson(right);
}

function validSyntheticRecordState(record: SyntheticCloseoutEffectRecordV1): boolean {
  if (typeof record.present !== "boolean" || !Number.isInteger(record.applicationCount)) {
    return false;
  }
  if (record.present) {
    return record.applicationCount === 0 && record.appliedIntentEntryHash === undefined;
  }
  if (record.appliedIntentEntryHash === undefined) return record.applicationCount === 0;
  return record.applicationCount === 1 && /^[0-9a-f]{64}$/.test(record.appliedIntentEntryHash);
}

function expectedPendingEffect(capsule: CloseoutCapsule): {
  effectKey: string;
  effect: CloseoutEffectSpec;
  intentEntryHash: string;
  permitDigest: string;
} {
  assertCloseoutCapsuleState(capsule);
  const pending = capsule.pendingIntent;
  if (!pending) syntheticFail("pending_intent_required");
  const effectIndex = capsule.requiredEffectKeys.indexOf(pending.effectKey);
  if (effectIndex < 0) syntheticFail("pending_effect_unknown");
  return {
    effectKey: pending.effectKey,
    effect: capsule.requiredEffects[effectIndex],
    intentEntryHash: pending.intentEntryHash,
    permitDigest: pending.permitDigest,
  };
}

export function createSyntheticCloseoutWorld(capsule: CloseoutCapsule): SyntheticCloseoutWorldV1 {
  assertCloseoutCapsuleState(capsule);
  const records: Record<string, SyntheticCloseoutEffectRecordV1> = {};
  for (let index = 0; index < capsule.requiredEffects.length; index += 1) {
    records[capsule.requiredEffectKeys[index]] = {
      effect: structuredClone(capsule.requiredEffects[index]),
      present: true,
      applicationCount: 0,
    };
  }
  return {
    schemaVersion: SYNTHETIC_CLOSEOUT_WORLD_SCHEMA_VERSION,
    capsuleId: capsule.capsuleId,
    records,
  };
}

function recordBindingDrift(input: {
  capsule: CloseoutCapsule;
  world: SyntheticCloseoutWorldV1;
  eventId: string;
  occurredAt: string;
  effectKey: string;
  record?: SyntheticCloseoutEffectRecordV1;
}): SyntheticCloseoutStep {
  const evidenceDigest = digestCloseoutValue({
    domain: "candidate-closeout-synthetic-binding-drift/v1",
    capsuleId: input.capsule.capsuleId,
    worldCapsuleId: input.world.capsuleId,
    effectKey: input.effectKey,
    record: input.record ?? null,
  });
  const entry = createCloseoutJournalEntry(input.capsule, {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    payload: { type: "block_recorded", reason: "binding_drift", evidenceDigest },
  });
  return {
    status: "blocked",
    reason: "binding_drift",
    entry,
    capsule: applyCloseoutJournalEntry(input.capsule, entry),
    world: structuredClone(input.world),
  };
}

export function stepSyntheticCloseoutEffect(input: {
  capsule: CloseoutCapsule;
  world: SyntheticCloseoutWorldV1;
  eventId: string;
  occurredAt: string;
  faultAt?: SyntheticCloseoutFaultPoint;
}): SyntheticCloseoutStep {
  const capsule = structuredClone(input.capsule);
  const world = structuredClone(input.world);
  const pending = expectedPendingEffect(capsule);
  if (
    input.faultAt !== undefined &&
    !["before_probe", "after_probe_before_effect", "after_effect_before_observation"].includes(
      input.faultAt,
    )
  ) {
    syntheticFail("fault_point_invalid");
  }
  if (input.faultAt === "before_probe") {
    return { status: "fault_injected", faultAt: input.faultAt, capsule, world };
  }
  if (world.schemaVersion !== 1 || world.capsuleId !== capsule.capsuleId) {
    return recordBindingDrift({ ...input, capsule, world, effectKey: pending.effectKey });
  }
  const record = world.records[pending.effectKey];
  if (
    !record ||
    !validSyntheticRecordState(record) ||
    !exactEffectMatches(record.effect, pending.effect)
  ) {
    return recordBindingDrift({
      ...input,
      capsule,
      world,
      effectKey: pending.effectKey,
      record,
    });
  }
  if (input.faultAt === "after_probe_before_effect") {
    return { status: "fault_injected", faultAt: input.faultAt, capsule, world };
  }

  const preconditionDigest = digestCloseoutValue(record);
  let outcome: CloseoutEffectOutcome;
  if (record.present) {
    record.present = false;
    record.applicationCount += 1;
    record.appliedIntentEntryHash = pending.intentEntryHash;
    outcome = "completed";
  } else if (record.appliedIntentEntryHash === pending.intentEntryHash) {
    outcome = "already_satisfied_after_intent";
  } else {
    outcome = "not_applied";
  }
  if (input.faultAt === "after_effect_before_observation") {
    return { status: "fault_injected", faultAt: input.faultAt, capsule, world };
  }

  const receipt = sealCloseoutEffectReceipt({
    schemaVersion: 1,
    adapterId: SYNTHETIC_CLOSEOUT_ADAPTER_ID,
    adapterSchemaVersion: "1",
    capsuleId: capsule.capsuleId,
    effectKey: pending.effectKey,
    effectKind: pending.effect.kind,
    effectSpecDigest: digestCloseoutValue(pending.effect),
    intentEntryHash: pending.intentEntryHash,
    permitDigest: pending.permitDigest,
    fenceEpoch: capsule.fence.epoch,
    fenceTokenDigest: capsule.fence.tokenDigest,
    observedAt: input.occurredAt,
    preconditionDigest,
    postconditionDigest: digestCloseoutValue(record),
    outcome,
  });
  const entry = createCloseoutJournalEntry(capsule, {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    payload: {
      type: "effect_observed",
      observation: {
        effectKey: pending.effectKey,
        intentEntryHash: pending.intentEntryHash,
        outcome,
        receipt,
      },
    },
  });
  return {
    status: "observed",
    outcome,
    entry,
    capsule: applyCloseoutJournalEntry(capsule, entry),
    world,
  };
}
