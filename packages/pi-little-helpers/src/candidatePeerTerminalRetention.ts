import { renameSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleEventsPath,
  lexicalPathExists,
} from "./candidatePeerLifecycleV2Core.ts";
import {
  readLifecycleRecord,
  withCandidateRegistryMutationLock,
  withResourceLock,
} from "./candidatePeerLifecycleV2State.ts";
import { getCandidatePeerRegistryPath } from "./candidatePeerRegistry.ts";
import {
  durableTerminalJson,
  getTerminalCompactionMarkerPath,
  readTerminalCompactionGarbageCollectionReceipt,
  readTerminalCompactionMarker,
  sha256File,
  syncTerminalPath,
  type TerminalCompactionGarbageCollectionReceipt,
  type TerminalCompactionMarker,
} from "./candidatePeerTerminalRetentionCore.ts";
import { materializeTerminalCompaction } from "./candidatePeerTerminalRetentionMaterialization.ts";
import {
  canonicalTerminalTimestamp,
  readTerminalCompactionAuthorization,
  readTerminalCompactionPreparation,
  terminalRetentionPaths,
} from "./candidatePeerTerminalRetentionPrepare.ts";
import {
  assertExactTerminalCompactionSources,
  assertRecoverableTerminalCompactionSources,
  assertTerminalCompactionSourceAt,
  terminalArchiveSourcesAt,
  verifyPreparedTerminalCapsule,
} from "./candidatePeerTerminalRetentionSources.ts";
import {
  assertTerminalInventoryBinding,
  assertTerminalState,
  verifyTerminalCandidateRecord,
} from "./candidatePeerTerminalRetentionVerification.ts";

export {
  authorizeTerminalCandidateCompaction,
  prepareTerminalCandidateCompaction,
  type TerminalCompactionAuthorization,
  type TerminalCompactionPreparation,
} from "./candidatePeerTerminalRetentionPrepare.ts";
export {
  recoverTerminalCandidateCompactionLocks,
  type TerminalCompactionLockRecoveryReceipt,
} from "./candidatePeerTerminalRetentionRecovery.ts";
export { verifyTerminalCandidateRecord } from "./candidatePeerTerminalRetentionVerification.ts";
export type { TerminalCompactionGarbageCollectionReceipt };

export type TerminalCompactionResult = {
  marker: TerminalCompactionMarker;
  garbageCollectionReceipt: TerminalCompactionGarbageCollectionReceipt;
};

type TerminalCompactionTestHooks = {
  beforeMarkerCommit?: () => void;
  beforeMarkerPublication?: () => void;
  afterMarkerCommit?: () => void;
  beforeGarbageCollection?: () => void;
  afterCapsuleMaterialization?: () => void;
  afterArchiveQuarantine?: () => void;
  afterArchiveMemberRemoval?: (name: string, index: number) => void;
};

function assertAuthorizationValidAt(
  authorization: { issuedAt: string; expiresAt: string },
  at: string,
): void {
  const atMs = canonicalTerminalTimestamp(at, "terminal compaction execution time");
  const issuedAtMs = canonicalTerminalTimestamp(
    authorization.issuedAt,
    "terminal compaction authorization issue time",
  );
  const expiresAtMs = canonicalTerminalTimestamp(
    authorization.expiresAt,
    "terminal compaction authorization expiry",
  );
  if (atMs < issuedAtMs || atMs >= expiresAtMs) {
    throw new Error("terminal compaction authorization expired or not yet valid");
  }
}

function compactRedundantSources(
  record: CandidateLifecycleRecord,
  marker: TerminalCompactionMarker,
  env: NodeJS.ProcessEnv,
  testHooks?: TerminalCompactionTestHooks,
): TerminalCompactionGarbageCollectionReceipt {
  const materialized = materializeTerminalCompaction(record, env, { allowPending: true });
  if (!materialized) throw new Error("terminal compaction marker is missing");
  try {
    testHooks?.afterCapsuleMaterialization?.();
    const registryRecordsRetained: string[] = [];
    for (const alias of marker.aliases) {
      const path = getCandidatePeerRegistryPath(alias, env);
      const source = marker.sourceManifest.find(
        (item) => item.capsulePath === join("payload", "registry", `${alias}.json`),
      );
      if (!source || sha256File(path) !== source.sha256) {
        throw new Error(`terminal registry source drifted after marker commit: ${alias}`);
      }
      registryRecordsRetained.push(alias);
    }

    const paths = terminalRetentionPaths(record, env);
    const eventsPath = getCandidateLifecycleEventsPath(record.resourceId, env);
    const eventSource = marker.sourceManifest.find(
      (item) => item.capsulePath === join("payload", "resource", "events.jsonl"),
    );
    if (!eventSource) throw new Error("terminal lifecycle event source is missing from marker");
    if (lexicalPathExists(eventsPath)) {
      if (lexicalPathExists(paths.eventsQuarantine)) {
        throw new Error("terminal lifecycle event source and quarantine both exist");
      }
      if (sha256File(eventsPath) !== eventSource.sha256) {
        throw new Error("terminal lifecycle events drifted after marker commit");
      }
      assertTerminalInventoryBinding(record, env);
      renameSync(eventsPath, paths.eventsQuarantine);
      syncTerminalPath(dirname(eventsPath));
      syncTerminalPath(paths.root);
    }
    if (lexicalPathExists(paths.eventsQuarantine)) {
      if (sha256File(paths.eventsQuarantine) !== eventSource.sha256) {
        throw new Error("terminal lifecycle event quarantine is not capsule-bound");
      }
      assertTerminalInventoryBinding(record, env);
      assertTerminalCompactionSourceAt(
        paths.eventsQuarantine,
        eventSource,
        "terminal lifecycle event quarantine",
      );
      unlinkSync(paths.eventsQuarantine);
      syncTerminalPath(paths.root);
    }

    verifyTerminalCandidateRecord(record, env, {
      allowPendingCompaction: true,
      registryLockHeld: true,
    });

    if (record.archive) {
      const archivePath = record.archive.archiveDir;
      if (lexicalPathExists(archivePath)) {
        if (lexicalPathExists(paths.archiveQuarantine)) {
          throw new Error("terminal archive source and quarantine both exist");
        }
        const current = terminalArchiveSourcesAt(archivePath);
        const expected = marker.sourceManifest.filter((item) =>
          item.capsulePath.startsWith("payload/archive/"),
        );
        if (
          current.length !== expected.length ||
          current.some(
            (item) =>
              !expected.some(
                (source) =>
                  source.capsulePath === item.capsulePath &&
                  source.sha256 === item.sha256 &&
                  source.size === item.size &&
                  source.mode === item.mode,
              ),
          )
        ) {
          throw new Error("terminal archive member set drifted after marker commit");
        }
        assertTerminalInventoryBinding(record, env);
        renameSync(archivePath, paths.archiveQuarantine);
        syncTerminalPath(dirname(archivePath));
        syncTerminalPath(paths.root);
      }
      if (lexicalPathExists(paths.archiveQuarantine)) {
        testHooks?.afterArchiveQuarantine?.();
        verifyTerminalCandidateRecord(record, env, {
          allowPendingCompaction: true,
          registryLockHeld: true,
        });
        const expectedByName = new Map(
          marker.sourceManifest
            .filter((item) => item.capsulePath.startsWith("payload/archive/"))
            .map((item) => [item.capsulePath.slice("payload/archive/".length), item]),
        );
        let removalIndex = 0;
        for (const source of terminalArchiveSourcesAt(paths.archiveQuarantine)) {
          const name = source.capsulePath.slice("payload/archive/".length);
          const expected = expectedByName.get(name);
          if (
            !expected ||
            source.sha256 !== expected.sha256 ||
            source.size !== expected.size ||
            source.mode !== expected.mode
          ) {
            throw new Error(`terminal archive quarantine member is not capsule-bound: ${name}`);
          }
          assertTerminalInventoryBinding(record, env);
          assertTerminalCompactionSourceAt(
            source.originalPath,
            expected,
            `terminal archive quarantine member ${name}`,
          );
          unlinkSync(source.originalPath);
          syncTerminalPath(paths.archiveQuarantine);
          testHooks?.afterArchiveMemberRemoval?.(name, removalIndex);
          removalIndex += 1;
        }
        rmdirSync(paths.archiveQuarantine);
        syncTerminalPath(paths.root);
      }
    }

    if (
      lexicalPathExists(eventsPath) ||
      lexicalPathExists(paths.eventsQuarantine) ||
      lexicalPathExists(paths.archiveQuarantine) ||
      (record.archive ? lexicalPathExists(record.archive.archiveDir) : false)
    ) {
      throw new Error("terminal compaction redundant sources remain after garbage collection");
    }
    verifyTerminalCandidateRecord(record, env, {
      allowPendingCompaction: true,
      registryLockHeld: true,
    });
    const base = {
      schemaVersion: 1 as const,
      type: "candidate_terminal_compaction_gc" as const,
      resourceId: record.resourceId,
      generationId: record.generationId,
      markerDigest: marker.markerDigest,
      registryRecordsRetained,
      removedEvents: true,
      removedArchive: Boolean(record.archive),
      completedAt: new Date().toISOString(),
    };
    const receipt = { ...base, receiptDigest: digestObject(base) };
    durableTerminalJson(paths.gcReceipt, receipt);
    return receipt;
  } finally {
    materialized.cleanup();
  }
}

export function executeAuthorizedTerminalCandidateCompaction({
  resourceId,
  env = process.env,
  testHooks,
}: {
  resourceId: string;
  env?: NodeJS.ProcessEnv;
  testHooks?: TerminalCompactionTestHooks;
}): TerminalCompactionResult {
  const operation = `terminal_compaction_execute:${resourceId}`;
  return withCandidateRegistryMutationLock(operation, env, () =>
    withResourceLock(resourceId, operation, env, () => {
      const record = readLifecycleRecord(resourceId, env);
      assertTerminalState(record);
      assertTerminalInventoryBinding(record, env);
      let marker = readTerminalCompactionMarker(record, env);
      if (!marker) {
        const prepared = readTerminalCompactionPreparation(record, env);
        const authorization = readTerminalCompactionAuthorization(record, prepared, env);
        assertAuthorizationValidAt(authorization, new Date().toISOString());
        const paths = terminalRetentionPaths(record, env);
        if (
          lexicalPathExists(paths.eventsQuarantine) ||
          lexicalPathExists(paths.archiveQuarantine)
        ) {
          throw new Error("terminal compaction has uncommitted quarantine state");
        }
        testHooks?.beforeMarkerCommit?.();
        assertTerminalInventoryBinding(record, env);
        assertExactTerminalCompactionSources(record, env, prepared.sourceManifest);
        verifyPreparedTerminalCapsule(prepared);
        verifyTerminalCandidateRecord(record, env, { registryLockHeld: true });
        const committedAt = new Date().toISOString();
        assertAuthorizationValidAt(authorization, committedAt);
        const base = {
          schemaVersion: 1 as const,
          type: "candidate_terminal_compaction" as const,
          resourceId: record.resourceId,
          generationId: record.generationId,
          terminalState: record.state,
          terminalRecordDigest: prepared.terminalRecordDigest,
          aliases: prepared.aliases,
          capsulePath: prepared.capsulePath,
          capsuleSha256: prepared.capsuleSha256,
          capsuleSize: prepared.capsuleSize,
          capsuleMetadataDigest: prepared.capsuleMetadataDigest,
          sourceBytes: prepared.sourceBytes,
          sourceManifest: prepared.sourceManifest,
          sourceManifestDigest: prepared.sourceManifestDigest,
          preparationDigest: prepared.preparationDigest,
          authorizationDigest: authorization.authorizationDigest,
          committedAt,
        };
        marker = { ...base, markerDigest: digestObject(base) };
        durableTerminalJson(getTerminalCompactionMarkerPath(record.resourceId, env), marker, {
          beforeCommit() {
            testHooks?.beforeMarkerPublication?.();
            assertAuthorizationValidAt(authorization, new Date().toISOString());
          },
        });
        testHooks?.afterMarkerCommit?.();
      }

      assertTerminalInventoryBinding(record, env);
      const prepared = readTerminalCompactionPreparation(record, env);
      verifyPreparedTerminalCapsule(prepared);
      const paths = terminalRetentionPaths(record, env);
      assertRecoverableTerminalCompactionSources(record, marker.sourceManifest, paths);
      verifyTerminalCandidateRecord(record, env, {
        allowPendingCompaction: true,
        registryLockHeld: true,
      });

      const existingReceipt = readTerminalCompactionGarbageCollectionReceipt(record, marker, env);
      if (existingReceipt) {
        verifyTerminalCandidateRecord(record, env, { registryLockHeld: true });
        return { marker, garbageCollectionReceipt: existingReceipt };
      }
      testHooks?.beforeGarbageCollection?.();
      assertTerminalInventoryBinding(record, env);
      assertRecoverableTerminalCompactionSources(record, marker.sourceManifest, paths);
      verifyTerminalCandidateRecord(record, env, {
        allowPendingCompaction: true,
        registryLockHeld: true,
      });
      const receipt = compactRedundantSources(record, marker, env, testHooks);
      const committedReceipt = readTerminalCompactionGarbageCollectionReceipt(record, marker, env);
      if (!committedReceipt || committedReceipt.receiptDigest !== receipt.receiptDigest) {
        throw new Error("terminal compaction GC receipt publication verification failed");
      }
      verifyTerminalCandidateRecord(record, env, { registryLockHeld: true });
      return { marker, garbageCollectionReceipt: committedReceipt };
    }),
  );
}
