import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import {
  assertCandidateResourceId,
  assertOwnerOnlyDirectory,
  atomicJson,
  type CandidateLifecycleInventory,
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  git,
  lexicalPathExists,
} from "./candidatePeerLifecycleV2Core.ts";

export function migrateCandidateInventory(
  inventory: CandidateLifecycleInventory,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord[] {
  return withAdoptionLock(env, () => {
    const results: CandidateLifecycleRecord[] = [];
    for (const resource of inventory.resources) {
      const path = getCandidateLifecycleRecordPath(resource.resourceId, env);
      if (existsSync(path)) {
        const existing = JSON.parse(readFileSync(path, "utf8")) as CandidateLifecycleRecord;
        if (
          existing.generationId !== resource.generationId ||
          existing.worktreePath !== resource.worktreePath
        ) {
          throw new Error(`resource identity drift for ${resource.resourceId}`);
        }
        results.push(existing);
        continue;
      }
      const record: CandidateLifecycleRecord = {
        schemaVersion: 2,
        resourceId: resource.resourceId,
        generationId: resource.generationId,
        resourceVersion: 1,
        state: resource.exists ? "review_pending" : "missing_investigation",
        createdAt: resource.createdAt,
        updatedAt: inventory.capturedAt,
        worktreePath: resource.worktreePath,
        aliases: resource.aliases,
        repoRoots: resource.repoRoots,
        branchNames: resource.branchNames,
        migrationInventoryDigest: inventory.digest,
      };
      atomicJson(path, record);
      appendLifecycleEvent(
        record.resourceId,
        { event: "migrated_v1", at: inventory.capturedAt, record },
        env,
      );
      results.push(record);
    }
    return results;
  });
}

export function readLifecycleRecord(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord {
  return JSON.parse(
    readFileSync(getCandidateLifecycleRecordPath(resourceId, env), "utf8"),
  ) as CandidateLifecycleRecord;
}

export function writeLockedLifecycleRecord(
  previous: CandidateLifecycleRecord,
  next: CandidateLifecycleRecord,
  event: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateLifecycleRecord {
  if (next.resourceId !== previous.resourceId || next.generationId !== previous.generationId) {
    throw new Error("immutable resource identity changed");
  }
  if (next.resourceVersion !== previous.resourceVersion + 1) {
    throw new Error("locked lifecycle write must increment resourceVersion exactly once");
  }
  next.updatedAt = new Date().toISOString();
  atomicJson(getCandidateLifecycleRecordPath(next.resourceId, env), next);
  appendLifecycleEvent(
    next.resourceId,
    { event, at: next.updatedAt, fromVersion: previous.resourceVersion, record: next },
    env,
  );
  return next;
}

export function updateLifecycleRecord({
  resourceId,
  expectedVersion,
  event,
  mutate,
  env = process.env,
}: {
  resourceId: string;
  expectedVersion: number;
  event: string;
  mutate: (record: CandidateLifecycleRecord) => CandidateLifecycleRecord;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  return withResourceLock(resourceId, event, env, () => {
    const current = readLifecycleRecord(resourceId, env);
    if (current.resourceVersion !== expectedVersion) {
      throw new Error(
        `resourceVersion CAS failed: expected ${expectedVersion}, found ${current.resourceVersion}`,
      );
    }
    const next = mutate(structuredClone(current));
    if (next.resourceId !== current.resourceId || next.generationId !== current.generationId) {
      throw new Error("immutable resource identity changed");
    }
    next.resourceVersion = current.resourceVersion + 1;
    next.updatedAt = new Date().toISOString();
    atomicJson(getCandidateLifecycleRecordPath(resourceId, env), next);
    appendLifecycleEvent(
      resourceId,
      { event, at: next.updatedAt, fromVersion: current.resourceVersion, record: next },
      env,
    );
    return next;
  });
}

export function appendLifecycleEvent(
  resourceId: string,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = getCandidateLifecycleEventsPath(resourceId, env);
  assertOwnerOnlyDirectory(dirname(path));
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(event)}\n`);
  } finally {
    closeSync(fd);
  }
}

function acquireLeaseDirectory(
  lockPath: string,
  lease: Record<string, unknown>,
  failureMessage: string,
): void {
  const temporary = `${lockPath}.acquire.${process.pid}.${randomUUID()}`;
  try {
    mkdirSync(temporary, { mode: 0o700 });
    atomicJson(join(temporary, "lease.json"), lease);
    if (lexicalPathExists(lockPath)) throw new Error(failureMessage);
    // A legitimate concurrent acquirer also publishes a non-empty directory, so rename cannot
    // replace it. The fixed lock path is never exposed without its complete lease.json.
    renameSync(temporary, lockPath);
  } catch {
    rmSync(temporary, { recursive: true, force: true });
    throw new Error(failureMessage);
  }
}

export function withResourceLock<T>(
  resourceId: string,
  operation: string,
  env: NodeJS.ProcessEnv,
  fn: () => T,
): T {
  const lockDir = join(getCandidateLifecycleRoot(env), "locks");
  assertCandidateResourceId(resourceId);
  assertOwnerOnlyDirectory(lockDir);
  const lockPath = join(lockDir, `${resourceId}.lock`);
  acquireLeaseDirectory(
    lockPath,
    {
      resourceId,
      operation,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    },
    `candidate lifecycle resource is locked: ${resourceId}`,
  );
  try {
    return fn();
  } finally {
    try {
      unlinkSync(join(lockPath, "lease.json"));
    } catch {
      // The lock directory remains fail-closed if its lease unexpectedly disappears.
    }
    try {
      // rmdirSync intentionally omitted from imports until cleanup to keep lock removal exact.
      execFileSync("rmdir", [lockPath]);
    } catch {
      // A non-empty lock is evidence requiring owner recovery, not permission to break it.
    }
  }
}

export function withCandidateRegistryMutationLock<T>(
  operation: string,
  env: NodeJS.ProcessEnv,
  fn: () => T,
): T {
  const lockRoot = join(getCandidateLifecycleRoot(env), "locks");
  assertOwnerOnlyDirectory(lockRoot);
  const lockPath = join(lockRoot, "registry-mutation.lock");
  acquireLeaseDirectory(
    lockPath,
    {
      operation,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    },
    "candidate registry mutation is locked",
  );
  try {
    return fn();
  } finally {
    try {
      unlinkSync(join(lockPath, "lease.json"));
    } catch {
      // A missing lease leaves the global mutation membrane fail-closed for owner recovery.
    }
    try {
      execFileSync("rmdir", [lockPath]);
    } catch {
      // A non-empty lock is evidence requiring owner recovery, not permission to break it.
    }
  }
}

export function withAdoptionLock<T>(env: NodeJS.ProcessEnv, fn: () => T): T {
  const lockRoot = join(getCandidateLifecycleRoot(env), "locks");
  assertOwnerOnlyDirectory(lockRoot);
  const lockPath = join(lockRoot, "adoption.lock");
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch {
    throw new Error("candidate lifecycle adoption is locked");
  }
  try {
    return fn();
  } finally {
    try {
      execFileSync("rmdir", [lockPath]);
    } catch {
      // An unexpected lock payload remains fail-closed for owner recovery.
    }
  }
}

export function reconcileMissingResource({
  record,
  expectedVersion,
  actor,
  recoverable,
  lost,
  evidence,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  actor: string;
  recoverable: string[];
  lost: string[];
  evidence: string[];
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  if (existsSync(record.worktreePath))
    throw new Error("resource is present; cannot reconcile missing");
  return updateLifecycleRecord({
    resourceId: record.resourceId,
    expectedVersion,
    event: "reconciled_missing",
    env,
    mutate(current) {
      if (current.state !== "missing_investigation")
        throw new Error(`invalid state for missing reconciliation: ${current.state}`);
      current.state = "reconciled_missing";
      current.terminalReceipt = {
        type: "reconciled_missing",
        actor,
        at: new Date().toISOString(),
        aliases: current.aliases,
        recoverable,
        lost,
        evidence,
        worktreePath: current.worktreePath,
        receiptDigest: digestObject({
          actor,
          recoverable,
          lost,
          evidence,
          worktreePath: current.worktreePath,
        }),
      };
      return current;
    },
  });
}

export function reconcileCandidateOwnerRoot({
  record,
  expectedVersion,
  ownerRoot,
  actor,
  rationale,
  env = process.env,
}: {
  record: CandidateLifecycleRecord;
  expectedVersion: number;
  ownerRoot: string;
  actor: string;
  rationale: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  if (!actor.trim() || !rationale.trim())
    throw new Error("owner-root reconciliation requires actor and rationale");
  if (!existsSync(record.worktreePath))
    throw new Error("cannot reconcile owner root for missing worktree");
  const ownerRealPath = realpathSync(ownerRoot);
  const worktreeRealPath = realpathSync(record.worktreePath);
  if (ownerRealPath === worktreeRealPath || ownerRealPath.startsWith(`${worktreeRealPath}${sep}`)) {
    throw new Error("durable owner root cannot be the candidate worktree");
  }
  const ownerCommonRaw = String(git(ownerRealPath, ["rev-parse", "--git-common-dir"])).trim();
  const worktreeCommonRaw = String(git(worktreeRealPath, ["rev-parse", "--git-common-dir"])).trim();
  const ownerCommonDir = realpathSync(resolve(ownerRealPath, ownerCommonRaw));
  const worktreeCommonDir = realpathSync(resolve(worktreeRealPath, worktreeCommonRaw));
  if (ownerCommonDir !== worktreeCommonDir) {
    throw new Error("owner root and candidate worktree do not share a Git common directory");
  }
  return updateLifecycleRecord({
    resourceId: record.resourceId,
    expectedVersion,
    event: "owner_root_reconciled",
    env,
    mutate(current) {
      current.repoRoots = [ownerRealPath];
      return current;
    },
  });
}
