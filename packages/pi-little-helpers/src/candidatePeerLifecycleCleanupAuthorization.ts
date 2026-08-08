import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import {
  activeProcessPids,
  branchOid,
  candidateGitCommonDir,
  canonicalTimestamp,
  exactCleanupEffects,
  verifyPublishedArchive,
} from "./candidatePeerLifecycleArchiveShared.ts";
import type {
  CandidateCleanupAuthorization,
  CandidateCleanupEffect,
} from "./candidatePeerLifecycleArchiveTypes.ts";
import { readCleanupEvents } from "./candidatePeerLifecycleCleanupEvents.ts";
import type { CandidateLifecycleRecord } from "./candidatePeerLifecycleV2.ts";
import {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  assertIntegrationProofCoversDisposition,
  captureCandidateReviewSnapshot,
  digestObject,
  readLifecycleRecord,
  stableJson,
  updateLifecycleRecord,
  withResourceLock,
  writeLockedLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";

export function authorizeCandidateCleanup({
  record,
  expectedVersion,
  actor,
  expiresAt,
  effects,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  expiresAt: string;
  effects: CandidateCleanupEffect[];
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (!actor.trim()) throw new Error("cleanup authorization requires an actor");
  const issuedAt = new Date().toISOString();
  if (canonicalTimestamp(expiresAt, "cleanup authorization expiry") <= Date.now()) {
    throw new Error("cleanup authorization expiry must be in the future");
  }
  const authorizedEffects = exactCleanupEffects(effects);
  if (
    record.state !== "archive_verified" ||
    !record.archive ||
    !record.reviewSnapshot ||
    !record.disposition
  ) {
    throw new Error("cleanup authorization requires archive_verified record");
  }
  const ownerRepoRoot = record.repoRoots[0] ?? record.worktreePath;
  const currentBranchOid = branchOid(ownerRepoRoot, record.reviewSnapshot.branchName);
  if (currentBranchOid !== record.reviewSnapshot.headOid) {
    throw new Error("branch ref drifted before cleanup authorization");
  }
  const unsigned = {
    schemaVersion: 2 as const,
    resourceId: record.resourceId,
    generationId: record.generationId,
    authorizedResourceVersion: expectedVersion + 1,
    aliases: [...record.aliases].sort(),
    actor: actor.trim(),
    issuedAt,
    expiresAt,
    nonce: randomUUID(),
    dispositionDigest: record.disposition.receiptDigest,
    reviewSnapshotDigest: record.reviewSnapshot.snapshotDigest,
    integrationProofDigest: record.integrationProof?.proofDigest,
    targetOid: record.integrationProof?.targetOid,
    archiveDigest: record.archive.archiveDigest,
    expectedWorktreeRealPath: record.reviewSnapshot.worktreeRealPath,
    expectedGitCommonDir: record.reviewSnapshot.gitCommonDir,
    branchName: record.reviewSnapshot.branchName,
    branchOid: currentBranchOid,
    effects: authorizedEffects,
  };
  const authorization: CandidateCleanupAuthorization = {
    ...unsigned,
    authorizationDigest: digestObject(unsigned),
  };
  return updateLifecycleRecord({
    resourceId: record.resourceId,
    expectedVersion,
    event: "cleanup_authorized",
    env,
    mutate(current) {
      if (current.state !== "archive_verified") {
        throw new Error(`invalid authorization state: ${current.state}`);
      }
      current.state = "cleanup_authorized";
      current.cleanupAuthorization = authorization;
      return current;
    },
  });
}

export function reissueExpiredCandidateCleanupAuthorization({
  record,
  expectedVersion,
  actor,
  expiresAt,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  expiresAt: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  return withResourceLock(record.resourceId, "cleanup_authorization_reissue", env, () => {
    const current = readLifecycleRecord(record.resourceId, env);
    if (
      current.resourceVersion !== expectedVersion ||
      digestObject(current) !== digestObject(record)
    ) {
      throw new Error("cleanup reissue supplied record or expectedVersion is stale");
    }
    if (current.state !== "cleanup_authorized") {
      throw new Error("cleanup authorization reissue requires cleanup_authorized state");
    }
    if (!actor.trim()) throw new Error("cleanup authorization reissue requires an actor");
    const issuedAt = new Date().toISOString();
    const issuedAtMs = canonicalTimestamp(issuedAt, "cleanup authorization reissue time");
    const expiryMs = canonicalTimestamp(expiresAt, "reissued cleanup authorization expiry");
    if (expiryMs <= issuedAtMs) {
      throw new Error("reissued cleanup authorization expiry must be in the future");
    }
    if (expiryMs - issuedAtMs > 30 * 60 * 1000) {
      throw new Error("reissued cleanup authorization expiry exceeds the 30 minute bound");
    }

    const prior = current.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
    if (!prior) throw new Error("cleanup authorization reissue requires a prior authorization");
    const priorUnsigned = Object.fromEntries(
      Object.entries(prior).filter(([key]) => key !== "authorizationDigest"),
    );
    if (prior.authorizationDigest !== digestObject(priorUnsigned)) {
      throw new Error("expired cleanup authorization digest mismatch");
    }
    exactCleanupEffects(prior.effects);
    if (
      prior.resourceId !== current.resourceId ||
      prior.generationId !== current.generationId ||
      prior.authorizedResourceVersion !== current.resourceVersion ||
      stableJson(prior.aliases) !== stableJson([...current.aliases].sort())
    ) {
      throw new Error("expired cleanup authorization identity or lineage mismatch");
    }
    if (canonicalTimestamp(prior.expiresAt, "expired cleanup authorization expiry") > issuedAtMs) {
      throw new Error("cleanup authorization cannot be reissued before expiry");
    }
    if (
      !current.reviewSnapshot ||
      !current.archive ||
      current.disposition?.disposition !== "accepted" ||
      !current.integrationProof
    ) {
      throw new Error("cleanup authorization reissue bindings are incomplete");
    }
    if (current.terminalReceipt) {
      throw new Error("cleanup authorization cannot be reissued after any terminal effect receipt");
    }
    if (
      prior.reviewSnapshotDigest !== current.reviewSnapshot.snapshotDigest ||
      prior.dispositionDigest !== current.disposition.receiptDigest ||
      prior.integrationProofDigest !== current.integrationProof.proofDigest ||
      prior.targetOid !== current.integrationProof.targetOid ||
      prior.archiveDigest !== current.archive.archiveDigest ||
      prior.expectedWorktreeRealPath !== current.reviewSnapshot.worktreeRealPath ||
      prior.expectedGitCommonDir !== current.reviewSnapshot.gitCommonDir ||
      prior.branchName !== current.reviewSnapshot.branchName ||
      prior.branchOid !== current.reviewSnapshot.headOid
    ) {
      throw new Error("cleanup authorization reissue binding mismatch");
    }
    assertIntegrationProofCoversDisposition(
      current.disposition,
      current.reviewSnapshot,
      current.integrationProof,
    );
    verifyPublishedArchive(current);
    const eventScan = readCleanupEvents(current.resourceId, env);
    if (eventScan.events.length > 0) {
      throw new Error("cleanup authorization cannot be reissued after cleanup effect activity");
    }
    if (!existsSync(current.worktreePath)) {
      throw new Error("cleanup authorization reissue requires the exact candidate worktree");
    }
    if (realpathSync(current.worktreePath) !== prior.expectedWorktreeRealPath) {
      throw new Error("candidate worktree realpath drifted before cleanup authorization reissue");
    }
    if (candidateGitCommonDir(current.worktreePath) !== prior.expectedGitCommonDir) {
      throw new Error(
        "candidate Git common directory drifted before cleanup authorization reissue",
      );
    }
    const repoRoot = current.repoRoots[0];
    if (!repoRoot) throw new Error("cleanup authorization reissue owner repo root is missing");
    const currentBranchOid = branchOid(repoRoot, prior.branchName);
    if (!currentBranchOid || currentBranchOid !== prior.branchOid) {
      throw new Error("candidate branch identity drifted before cleanup authorization reissue");
    }
    const currentSnapshot = captureCandidateReviewSnapshot(current);
    if (
      currentSnapshot.contentDigest !== current.reviewSnapshot.contentDigest ||
      currentSnapshot.headOid !== prior.branchOid ||
      currentSnapshot.branchName !== prior.branchName ||
      currentSnapshot.worktreeRealPath !== prior.expectedWorktreeRealPath ||
      currentSnapshot.gitCommonDir !== prior.expectedGitCommonDir
    ) {
      throw new Error("candidate drifted before cleanup authorization reissue");
    }
    const pids = activeProcessPids(prior.expectedWorktreeRealPath);
    if (pids.length > 0) {
      throw new Error(`candidate has active process leases: ${pids.join(",")}`);
    }
    if (expiryMs <= Date.now()) {
      throw new Error("reissued cleanup authorization expired during validation");
    }

    const unsigned = {
      schemaVersion: 2 as const,
      resourceId: current.resourceId,
      generationId: current.generationId,
      authorizedResourceVersion: expectedVersion + 1,
      aliases: [...current.aliases].sort(),
      actor: actor.trim(),
      issuedAt,
      expiresAt,
      nonce: randomUUID(),
      dispositionDigest: current.disposition.receiptDigest,
      reviewSnapshotDigest: current.reviewSnapshot.snapshotDigest,
      integrationProofDigest: current.integrationProof.proofDigest,
      targetOid: current.integrationProof.targetOid,
      archiveDigest: current.archive.archiveDigest,
      expectedWorktreeRealPath: prior.expectedWorktreeRealPath,
      expectedGitCommonDir: prior.expectedGitCommonDir,
      branchName: prior.branchName,
      branchOid: prior.branchOid,
      reissuedFromAuthorizationDigest: prior.authorizationDigest,
      effects: exactCleanupEffects(prior.effects),
    };
    const authorization: CandidateCleanupAuthorization = {
      ...unsigned,
      authorizationDigest: digestObject(unsigned),
    };
    const next = structuredClone(current);
    next.resourceVersion = current.resourceVersion + 1;
    next.cleanupAuthorization = authorization;
    return writeLockedLifecycleRecord(current, next, "cleanup_authorization_reissued", env);
  });
}
