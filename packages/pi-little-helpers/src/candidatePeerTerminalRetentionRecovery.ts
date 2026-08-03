import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import {
  assertCandidateResourceId,
  assertOwnerOnlyDirectory,
  digestObject,
  getCandidateLifecycleRoot,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import { readLifecycleRecord } from "./candidatePeerLifecycleV2State.ts";
import {
  durableTerminalJson,
  getTerminalRetentionGenerationDir,
  syncTerminalPath,
  withStableTerminalFile,
} from "./candidatePeerTerminalRetentionCore.ts";

export type TerminalCompactionLockRecoveryReceipt = {
  schemaVersion: 1;
  type: "candidate_terminal_compaction_lock_recovery";
  resourceId: string;
  generationId: string;
  actor: string;
  recoveredAt: string;
  recoveredLocks: Array<{
    kind: "resource" | "registry";
    path: string;
    operation: string;
    pid: number;
    acquiredAt: string;
    leaseDigest: string;
  }>;
  receiptPath: string;
  receiptDigest: string;
};

type LockLease = {
  operation: string;
  pid: number;
  acquiredAt: string;
  resourceId?: string;
};

type RecoveryPlan = {
  kind: "resource" | "registry";
  path: string;
  leasePath: string;
  lease: LockLease;
  leaseDigest: string;
};

function canonicalTimestamp(value: unknown, label: string): void {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    throw new Error(`${label} is not a canonical UTC timestamp`);
  }
}

function processIsDefinitelyAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw new Error(`cannot prove terminal compaction lock process ${pid} is absent`);
  }
}

function planLockRecovery(
  kind: "resource" | "registry",
  path: string,
  resourceId: string,
): RecoveryPlan | undefined {
  if (!existsSync(path)) return undefined;
  const lockInfo = lstatSync(path);
  if (
    !lockInfo.isDirectory() ||
    lockInfo.isSymbolicLink() ||
    realpathSync(path) !== path ||
    (lockInfo.mode & 0o077) !== 0 ||
    (process.getuid && lockInfo.uid !== process.getuid())
  ) {
    throw new Error(`terminal compaction ${kind} lock is not an owner-only canonical directory`);
  }
  assertOwnerOnlyDirectory(path);
  const entries = readdirSync(path).sort();
  if (stableJson(entries) !== stableJson(["lease.json"])) {
    throw new Error(`terminal compaction ${kind} lock has an unexpected member set`);
  }
  const leasePath = join(path, "lease.json");
  return withStableTerminalFile(
    leasePath,
    `terminal compaction ${kind} lock lease`,
    (_path, digest) => {
      // The descriptor-backed /proc path prevents pathname replacement after verification.
      const lease = JSON.parse(readFileSync(_path, "utf8")) as LockLease;
      const expectedKeys =
        kind === "resource"
          ? ["acquiredAt", "operation", "pid", "resourceId"]
          : ["acquiredAt", "operation", "pid"];
      if (
        stableJson(Object.keys(lease).sort()) !== stableJson(expectedKeys) ||
        ![
          `terminal_compaction_prepare:${resourceId}`,
          `terminal_compaction_authorize:${resourceId}`,
          `terminal_compaction_execute:${resourceId}`,
          `terminal_compaction_verify:${resourceId}`,
        ].includes(lease.operation) ||
        !Number.isSafeInteger(lease.pid) ||
        lease.pid <= 0 ||
        (kind === "resource" && lease.resourceId !== resourceId)
      ) {
        throw new Error(`terminal compaction ${kind} lock lease identity is invalid`);
      }
      canonicalTimestamp(lease.acquiredAt, `terminal compaction ${kind} lock acquisition time`);
      if (!processIsDefinitelyAbsent(lease.pid)) {
        throw new Error(
          `terminal compaction ${kind} lock owner process is still present: ${lease.pid}`,
        );
      }
      return { kind, path, leasePath, lease, leaseDigest: digest };
    },
  );
}

function retirePlannedLock(plan: RecoveryPlan, lockRoot: string): void {
  const quarantine = join(lockRoot, `.terminal-lock-recovery.${plan.kind}.${randomUUID()}`);
  renameSync(plan.path, quarantine);
  syncTerminalPath(lockRoot);
  try {
    const entries = readdirSync(quarantine).sort();
    if (stableJson(entries) !== stableJson(["lease.json"])) {
      throw new Error("terminal compaction lock changed during recovery");
    }
    const movedLease = join(quarantine, "lease.json");
    withStableTerminalFile(movedLease, "moved terminal compaction lock lease", (_path, digest) => {
      if (digest !== plan.leaseDigest) {
        throw new Error("terminal compaction lock lease drifted during recovery");
      }
    });
    unlinkSync(movedLease);
    rmdirSync(quarantine);
    syncTerminalPath(lockRoot);
  } catch (error) {
    if (!existsSync(plan.path) && existsSync(quarantine)) {
      renameSync(quarantine, plan.path);
      syncTerminalPath(lockRoot);
    }
    throw error;
  }
}

export function recoverTerminalCandidateCompactionLocks({
  resourceId,
  actor,
  env = process.env,
}: {
  resourceId: string;
  actor: string;
  env?: NodeJS.ProcessEnv;
}): TerminalCompactionLockRecoveryReceipt {
  assertCandidateResourceId(resourceId);
  if (!actor.trim()) throw new Error("terminal compaction lock recovery requires an actor");
  const record = readLifecycleRecord(resourceId, env);
  const lockRoot = join(getCandidateLifecycleRoot(env), "locks");
  assertOwnerOnlyDirectory(lockRoot);
  const resource = planLockRecovery("resource", join(lockRoot, `${resourceId}.lock`), resourceId);
  const registry = planLockRecovery(
    "registry",
    join(lockRoot, "registry-mutation.lock"),
    resourceId,
  );
  if (resource && !registry) {
    throw new Error("terminal compaction resource lock exists without its outer registry lock");
  }
  const plans = [resource, registry].filter((plan): plan is RecoveryPlan => Boolean(plan));
  if (plans.length === 0) throw new Error("no stale terminal compaction locks were found");
  if (
    resource &&
    registry &&
    (resource.lease.pid !== registry.lease.pid ||
      resource.lease.operation !== registry.lease.operation)
  ) {
    throw new Error("terminal compaction nested lock leases do not share one dead owner");
  }
  for (const plan of plans) retirePlannedLock(plan, lockRoot);

  const recoveryRoot = getTerminalRetentionGenerationDir(
    record.resourceId,
    record.generationId,
    env,
  );
  mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
  const receiptPath = join(recoveryRoot, `lock-recovery-${randomUUID()}.json`);
  const recoveredAt = new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    type: "candidate_terminal_compaction_lock_recovery" as const,
    resourceId: record.resourceId,
    generationId: record.generationId,
    actor: actor.trim(),
    recoveredAt,
    recoveredLocks: plans.map((plan) => ({
      kind: plan.kind,
      path: plan.path,
      operation: plan.lease.operation,
      pid: plan.lease.pid,
      acquiredAt: plan.lease.acquiredAt,
      leaseDigest: plan.leaseDigest,
    })),
    receiptPath,
  };
  const receipt = { ...base, receiptDigest: digestObject(base) };
  durableTerminalJson(receiptPath, receipt);
  return receipt;
}
