import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  atomicJson,
  type CandidateLifecycleRecord,
  digestObject,
  lexicalPathExists,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import {
  readLifecycleRecord,
  withCandidateRegistryMutationLock,
  withResourceLock,
} from "./candidatePeerLifecycleV2State.ts";
import {
  assertTerminalCompactionSourceManifest,
  durableTerminalJson,
  getTerminalRetentionGenerationDir,
  readTerminalCompactionMarker,
  sha256File,
  syncTerminalPath,
  type TerminalCandidateState,
  type TerminalCompactionSource,
} from "./candidatePeerTerminalRetentionCore.ts";
import {
  assertExactTerminalCompactionSources,
  collectTerminalCompactionSources,
  copyTerminalCompactionSources,
  verifyPreparedTerminalCapsule,
} from "./candidatePeerTerminalRetentionSources.ts";
import {
  assertTerminalInventoryBinding,
  assertTerminalState,
  verifyTerminalCandidateRecord,
} from "./candidatePeerTerminalRetentionVerification.ts";

const MAX_AUTHORIZATION_MS = 30 * 60 * 1000;
const HEX64 = /^[a-f0-9]{64}$/;

export type TerminalCompactionPreparation = {
  schemaVersion: 1;
  type: "candidate_terminal_compaction_preparation";
  resourceId: string;
  generationId: string;
  terminalState: TerminalCandidateState;
  terminalRecordDigest: string;
  terminalProofDigest: string;
  aliases: string[];
  capsulePath: string;
  capsuleSha256: string;
  capsuleSize: number;
  capsuleMetadataDigest: string;
  sourceBytes: number;
  sourceManifest: TerminalCompactionSource[];
  sourceManifestDigest: string;
  preparedAt: string;
  preparationDigest: string;
};

export type TerminalCompactionAuthorization = {
  schemaVersion: 1;
  type: "candidate_terminal_compaction_authorization";
  resourceId: string;
  generationId: string;
  actor: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  preparationDigest: string;
  terminalRecordDigest: string;
  sourceManifestDigest: string;
  capsuleSha256: string;
  authorizationDigest: string;
};

export function canonicalTerminalTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return parsed;
}

export function terminalRetentionPaths(record: CandidateLifecycleRecord, env: NodeJS.ProcessEnv) {
  const root = getTerminalRetentionGenerationDir(record.resourceId, record.generationId, env);
  return {
    root,
    capsule: join(root, "terminal-capsule.tar.gz"),
    preparation: join(root, "preparation.json"),
    authorization: join(root, "authorization.json"),
    gcReceipt: join(root, "gc-receipt.json"),
    eventsQuarantine: join(root, "events.jsonl.gc"),
    archiveQuarantine: join(root, "archive.gc"),
  };
}

function retireOrphanedPreparationArtifacts(root: string): void {
  let removed = false;
  for (const name of readdirSync(root)) {
    const isStage = name.startsWith(".prepare.");
    const isTemporaryCapsule = name.startsWith("terminal-capsule.tar.gz.") && name.endsWith(".tmp");
    if (!isStage && !isTemporaryCapsule) continue;
    const path = join(root, name);
    const info = lstatSync(path);
    if (
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid()) ||
      (isStage ? !info.isDirectory() : !info.isFile())
    ) {
      throw new Error("orphaned terminal preparation artifact is not owner-only and exact");
    }
    rmSync(path, { recursive: isStage });
    removed = true;
  }
  if (removed) syncTerminalPath(root);
}

function preparationUnsigned(
  value: TerminalCompactionPreparation,
): Omit<TerminalCompactionPreparation, "preparationDigest"> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "preparationDigest"),
  ) as Omit<TerminalCompactionPreparation, "preparationDigest">;
}

export function readTerminalCompactionPreparation(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
): TerminalCompactionPreparation {
  const paths = terminalRetentionPaths(record, env);
  const prepared = JSON.parse(
    readFileSync(paths.preparation, "utf8"),
  ) as TerminalCompactionPreparation;
  assertTerminalCompactionSourceManifest(prepared.sourceManifest);
  if (
    prepared.schemaVersion !== 1 ||
    prepared.type !== "candidate_terminal_compaction_preparation" ||
    prepared.resourceId !== record.resourceId ||
    prepared.generationId !== record.generationId ||
    prepared.terminalState !== record.state ||
    prepared.terminalRecordDigest !== digestObject(record) ||
    prepared.capsulePath !== paths.capsule ||
    stableJson(prepared.aliases) !== stableJson([...record.aliases].sort()) ||
    prepared.sourceManifestDigest !== digestObject(prepared.sourceManifest) ||
    prepared.sourceBytes !== prepared.sourceManifest.reduce((sum, item) => sum + item.size, 0) ||
    prepared.preparationDigest !== digestObject(preparationUnsigned(prepared)) ||
    !HEX64.test(prepared.capsuleSha256) ||
    !HEX64.test(prepared.capsuleMetadataDigest) ||
    !HEX64.test(prepared.terminalProofDigest)
  ) {
    throw new Error("terminal compaction preparation binding or digest mismatch");
  }
  const info = lstatSync(prepared.capsulePath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    info.size !== prepared.capsuleSize ||
    sha256File(prepared.capsulePath) !== prepared.capsuleSha256
  ) {
    throw new Error("terminal compaction prepared capsule drifted");
  }
  return prepared;
}

export function prepareTerminalCandidateCompaction({
  resourceId,
  env = process.env,
  now = new Date().toISOString(),
  testHooks,
}: {
  resourceId: string;
  env?: NodeJS.ProcessEnv;
  now?: string;
  testHooks?: { afterCapsuleCommit?: () => void };
}): TerminalCompactionPreparation {
  canonicalTerminalTimestamp(now, "terminal compaction preparation time");
  return withCandidateRegistryMutationLock(`terminal_compaction_prepare:${resourceId}`, env, () =>
    withResourceLock(resourceId, `terminal_compaction_prepare:${resourceId}`, env, () => {
      const record = readLifecycleRecord(resourceId, env);
      assertTerminalState(record);
      assertTerminalInventoryBinding(record, env);
      if (readTerminalCompactionMarker(record, env)) {
        throw new Error("terminal resource is already compacted");
      }
      const terminalProofDigest = verifyTerminalCandidateRecord(record, env, {
        registryLockHeld: true,
      });
      const sources = collectTerminalCompactionSources(record, env);
      const paths = terminalRetentionPaths(record, env);
      mkdirSync(paths.root, { recursive: true, mode: 0o700 });
      retireOrphanedPreparationArtifacts(paths.root);
      if (lexicalPathExists(paths.preparation)) {
        const existing = readTerminalCompactionPreparation(record, env);
        assertExactTerminalCompactionSources(record, env, existing.sourceManifest);
        verifyPreparedTerminalCapsule(existing);
        return existing;
      }
      if (lexicalPathExists(paths.eventsQuarantine) || lexicalPathExists(paths.archiveQuarantine)) {
        throw new Error("terminal compaction has uncommitted quarantine state");
      }
      if (lexicalPathExists(paths.capsule)) {
        const orphan = lstatSync(paths.capsule);
        if (
          !orphan.isFile() ||
          orphan.isSymbolicLink() ||
          (orphan.mode & 0o077) !== 0 ||
          (process.getuid && orphan.uid !== process.getuid())
        ) {
          throw new Error("unreceipted terminal capsule is not an owner-only regular file");
        }
        rmSync(paths.capsule);
        syncTerminalPath(paths.root);
      }
      const stage = mkdtempSync(join(paths.root, `.prepare.${process.pid}.`));
      const temporaryCapsule = `${paths.capsule}.${randomUUID()}.tmp`;
      try {
        copyTerminalCompactionSources(stage, sources);
        const metadataBase = {
          schemaVersion: 1 as const,
          type: "candidate_terminal_compaction_capsule" as const,
          resourceId: record.resourceId,
          generationId: record.generationId,
          terminalState: record.state,
          terminalRecordDigest: digestObject(record),
          terminalProofDigest,
          aliases: [...record.aliases].sort(),
          sourceManifest: sources,
          sourceManifestDigest: digestObject(sources),
          preparedAt: now,
        };
        const metadata = { ...metadataBase, metadataDigest: digestObject(metadataBase) };
        atomicJson(join(stage, "capsule-metadata.json"), metadata);
        execFileSync("tar", [
          "-C",
          stage,
          "-czf",
          temporaryCapsule,
          "payload",
          "capsule-metadata.json",
        ]);
        chmodSync(temporaryCapsule, 0o600);
        const capsuleSha256 = sha256File(temporaryCapsule);
        const capsuleSize = statSync(temporaryCapsule).size;
        const base = {
          schemaVersion: 1 as const,
          type: "candidate_terminal_compaction_preparation" as const,
          resourceId: record.resourceId,
          generationId: record.generationId,
          terminalState: record.state,
          terminalRecordDigest: digestObject(record),
          terminalProofDigest,
          aliases: [...record.aliases].sort(),
          capsulePath: paths.capsule,
          capsuleSha256,
          capsuleSize,
          capsuleMetadataDigest: metadata.metadataDigest,
          sourceBytes: sources.reduce((sum, item) => sum + item.size, 0),
          sourceManifest: sources,
          sourceManifestDigest: digestObject(sources),
          preparedAt: now,
        };
        const prepared = { ...base, preparationDigest: digestObject(base) };
        verifyPreparedTerminalCapsule({ ...prepared, capsulePath: temporaryCapsule });
        assertExactTerminalCompactionSources(record, env, sources);
        syncTerminalPath(temporaryCapsule);
        renameSync(temporaryCapsule, paths.capsule);
        syncTerminalPath(paths.root);
        testHooks?.afterCapsuleCommit?.();
        durableTerminalJson(paths.preparation, prepared);
        return prepared;
      } catch (error) {
        rmSync(temporaryCapsule, { force: true });
        if (!lexicalPathExists(paths.preparation)) rmSync(paths.capsule, { force: true });
        throw error;
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    }),
  );
}

function authorizationUnsigned(
  value: TerminalCompactionAuthorization,
): Omit<TerminalCompactionAuthorization, "authorizationDigest"> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "authorizationDigest"),
  ) as Omit<TerminalCompactionAuthorization, "authorizationDigest">;
}

export function authorizeTerminalCandidateCompaction({
  resourceId,
  actor,
  expiresAt,
  env = process.env,
}: {
  resourceId: string;
  actor: string;
  expiresAt: string;
  env?: NodeJS.ProcessEnv;
}): TerminalCompactionAuthorization {
  return withCandidateRegistryMutationLock(`terminal_compaction_authorize:${resourceId}`, env, () =>
    withResourceLock(resourceId, `terminal_compaction_authorize:${resourceId}`, env, () => {
      if (!actor.trim()) throw new Error("terminal compaction authorization requires an actor");
      const issuedAt = new Date().toISOString();
      const issuedAtMs = canonicalTerminalTimestamp(
        issuedAt,
        "terminal compaction authorization issue time",
      );
      const expiresAtMs = canonicalTerminalTimestamp(
        expiresAt,
        "terminal compaction authorization expiry",
      );
      if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_AUTHORIZATION_MS) {
        throw new Error("terminal compaction authorization expiry must be within 30 minutes");
      }
      const record = readLifecycleRecord(resourceId, env);
      assertTerminalState(record);
      assertTerminalInventoryBinding(record, env);
      if (readTerminalCompactionMarker(record, env)) {
        throw new Error("terminal resource is already compacted");
      }
      const prepared = readTerminalCompactionPreparation(record, env);
      assertExactTerminalCompactionSources(record, env, prepared.sourceManifest);
      verifyPreparedTerminalCapsule(prepared);
      const base = {
        schemaVersion: 1 as const,
        type: "candidate_terminal_compaction_authorization" as const,
        resourceId: record.resourceId,
        generationId: record.generationId,
        actor: actor.trim(),
        issuedAt,
        expiresAt,
        nonce: randomUUID(),
        preparationDigest: prepared.preparationDigest,
        terminalRecordDigest: prepared.terminalRecordDigest,
        sourceManifestDigest: prepared.sourceManifestDigest,
        capsuleSha256: prepared.capsuleSha256,
      };
      const authorization = { ...base, authorizationDigest: digestObject(base) };
      durableTerminalJson(terminalRetentionPaths(record, env).authorization, authorization);
      return authorization;
    }),
  );
}

export function readTerminalCompactionAuthorization(
  record: CandidateLifecycleRecord,
  prepared: TerminalCompactionPreparation,
  env: NodeJS.ProcessEnv,
): TerminalCompactionAuthorization {
  const authorization = JSON.parse(
    readFileSync(terminalRetentionPaths(record, env).authorization, "utf8"),
  ) as TerminalCompactionAuthorization;
  const issuedAtMs = canonicalTerminalTimestamp(
    authorization.issuedAt,
    "terminal compaction authorization issue time",
  );
  const expiresAtMs = canonicalTerminalTimestamp(
    authorization.expiresAt,
    "terminal compaction authorization expiry",
  );
  if (
    authorization.schemaVersion !== 1 ||
    authorization.type !== "candidate_terminal_compaction_authorization" ||
    authorization.resourceId !== record.resourceId ||
    authorization.generationId !== record.generationId ||
    !authorization.actor?.trim() ||
    issuedAtMs >= expiresAtMs ||
    expiresAtMs - issuedAtMs > MAX_AUTHORIZATION_MS ||
    authorization.preparationDigest !== prepared.preparationDigest ||
    authorization.terminalRecordDigest !== prepared.terminalRecordDigest ||
    authorization.sourceManifestDigest !== prepared.sourceManifestDigest ||
    authorization.capsuleSha256 !== prepared.capsuleSha256 ||
    authorization.authorizationDigest !== digestObject(authorizationUnsigned(authorization))
  ) {
    throw new Error("terminal compaction authorization binding or digest mismatch");
  }
  return authorization;
}
