import { existsSync } from "node:fs";
import {
  branchOid,
  canonicalTimestamp,
  exactCleanupEffects,
  REQUIRED_CLEANUP_EFFECTS,
  verifyPublishedArchive,
} from "./candidatePeerLifecycleArchiveShared.ts";
import type { CandidateCleanupAuthorization } from "./candidatePeerLifecycleArchiveTypes.ts";
import {
  type CleanupEffectEvent,
  cleanupObservations,
  readCleanupEvents,
} from "./candidatePeerLifecycleCleanupEvents.ts";
import type { CandidateLifecycleRecord } from "./candidatePeerLifecycleV2.ts";
import {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  digestObject,
} from "./candidatePeerLifecycleV2.ts";
import { materializeTerminalCompaction } from "./candidatePeerTerminalRetentionMaterialization.ts";

function verifyCleanedCandidateTerminalRecordAt(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
  archiveDir?: string,
  eventsPath?: string,
): string {
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (record.state !== "cleaned" || !record.archive || !record.cleanupAuthorization) {
    throw new Error("candidate terminal record is not a cleaned lifecycle-v2 record");
  }
  const auth = record.cleanupAuthorization as CandidateCleanupAuthorization;
  if (
    auth.authorizationDigest !==
    digestObject(
      Object.fromEntries(Object.entries(auth).filter(([key]) => key !== "authorizationDigest")),
    )
  ) {
    throw new Error("candidate terminal cleanup authorization digest mismatch");
  }
  exactCleanupEffects(auth.effects);
  const receipt = record.terminalReceipt as Record<string, unknown> | undefined;
  if (!receipt || receipt.type !== "cleaned" || receipt.schemaVersion !== 2) {
    throw new Error("candidate terminal receipt schema mismatch");
  }
  const receiptDigest = receipt.receiptDigest;
  const unsigned = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptDigest"),
  );
  if (receiptDigest !== digestObject(unsigned)) {
    throw new Error("candidate terminal receipt digest mismatch");
  }
  if (
    receipt.archiveDigest !== record.archive.archiveDigest ||
    receipt.authorizationDigest !== auth.authorizationDigest
  ) {
    throw new Error("candidate terminal receipt binding mismatch");
  }
  if (
    receipt.resourceId !== record.resourceId ||
    receipt.generationId !== record.generationId ||
    !Array.isArray(receipt.effects) ||
    canonicalTimestamp(String(receipt.at), "candidate terminal receipt time") <
      canonicalTimestamp(auth.issuedAt, "cleanup authorization issue time")
  ) {
    throw new Error("candidate terminal receipt identity or chronology mismatch");
  }
  verifyPublishedArchive(record, archiveDir);
  const eventScan = readCleanupEvents(record.resourceId, env, eventsPath, record);
  const cleanedEvents = eventScan.events.filter((event) => event.event === "cleaned");
  if (cleanedEvents.length !== 1) {
    throw new Error("candidate terminal cleaned lifecycle event is not unique");
  }
  const observations = cleanupObservations(eventScan.events, auth.authorizationDigest);
  for (const effect of REQUIRED_CLEANUP_EFFECTS) {
    const observation = observations.get(effect);
    if (!observation) {
      throw new Error(`candidate terminal effect observation missing: ${effect}`);
    }
    const unsignedObservation = Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== "observationDigest"),
    );
    if (observation.observationDigest !== digestObject(unsignedObservation)) {
      throw new Error(`candidate terminal effect observation digest mismatch: ${effect}`);
    }
    const receiptedObservation = (receipt.effects as CleanupEffectEvent[]).find(
      (item) => item.effect === effect,
    );
    if (
      !receiptedObservation ||
      receiptedObservation.observationDigest !== observation.observationDigest
    ) {
      throw new Error(`candidate terminal receipt omits exact effect observation: ${effect}`);
    }
  }
  const finalEvent = eventScan.finalEvent;
  if (finalEvent?.event !== "cleaned" || digestObject(finalEvent.record) !== digestObject(record)) {
    throw new Error("candidate terminal record is not the final cleaned lifecycle event");
  }
  const repoRoot = record.repoRoots[0];
  if (!repoRoot || existsSync(record.worktreePath) || branchOid(repoRoot, auth.branchName)) {
    throw new Error("candidate terminal cleanup postconditions are not satisfied");
  }
  return digestObject(record);
}

export function verifyCleanedCandidateTerminalRecord(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv = process.env,
  options: { allowPendingCompaction?: boolean } = {},
): string {
  const compacted = materializeTerminalCompaction(record, env, {
    allowPending: options.allowPendingCompaction,
  });
  try {
    return verifyCleanedCandidateTerminalRecordAt(
      record,
      env,
      compacted?.archiveDir,
      compacted?.eventsPath,
    );
  } finally {
    compacted?.cleanup();
  }
}
