import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  removeSubagentCapacityCustody,
  type SubagentCapacityCustodyBinding,
} from "./subagent-capacity-custody.ts";
import { ensureSharedSubagentCapacityLimit } from "./subagent-capacity-limit.ts";
import {
  type CapacityLeaseMetadata,
  type CapacityLeasePayload,
  capacityLeaseIsStale,
  getCapacityCustodyBinding,
  getCapacityPath,
  getCapacitySpawnCommittedPath,
  processOwnerIsStale,
  readCapacityLease,
  readCapacityStatusSnapshot,
} from "./subagent-capacity-record.ts";
import { getProcessStartTicks } from "./subagent-session.ts";

export {
  formatSharedSubagentCapacityHolders,
  inspectSharedSubagentCapacity,
  parseLinuxProcessState,
  type SharedSubagentCapacityHolder,
} from "./subagent-capacity-record.ts";

const MALFORMED_CAPACITY_LOCK_RECLAIM_AGE_MS = 5_000;

interface CapacityReclaimPayload {
  kind: "asc.subagent_capacity_reclaim.v1";
  slot: number;
  pid: number;
  pidStartedAt: number;
  token: string;
  createdAt: string;
}

interface OwnedCapacityReclaim {
  release(): void;
}

export interface SharedSubagentCapacityTransition {
  release(): void;
}

export interface SharedSubagentCapacityLease {
  slot: number;
  custodyBinding?: SubagentCapacityCustodyBinding;
  markSpawnCommitted(): void;
  release(options?: { parentOwnedCompletion?: boolean; confirmedNoEffects?: boolean }): boolean;
}

export function reserveSharedSubagentCapacity(
  sessionsDir: string,
  maxConcurrent: number,
  options?: {
    afterStaleLeaseClaim?: () => void;
    leaseMetadata?: CapacityLeaseMetadata;
  },
): SharedSubagentCapacityLease | null {
  let statusSnapshot: ReturnType<typeof readCapacityStatusSnapshot> | undefined;
  if (!ensureSharedSubagentCapacityLimit(sessionsDir, maxConcurrent)) return null;
  for (let slot = 0; slot < maxConcurrent; slot += 1) {
    const path = getCapacityPath(sessionsDir, slot);
    const created = tryCreateCapacityLease(path, slot, options?.leaseMetadata);
    if (created) return created;
    if (!existsSync(path)) continue;

    statusSnapshot ??= readCapacityStatusSnapshot(sessionsDir);
    const reclaimed = tryReclaimAndCreateCapacityLease(
      path,
      slot,
      sessionsDir,
      statusSnapshot,
      options,
    );
    if (reclaimed) return reclaimed;
  }
  return null;
}

export function acquireSharedSubagentCapacityTransition(
  binding: SubagentCapacityCustodyBinding,
): SharedSubagentCapacityTransition | null {
  const reclaim = tryAcquireCapacityReclaim(`${binding.capacityPath}.reclaim`, binding.slot);
  if (!reclaim) return null;

  const current = readCapacityLease(binding.capacityPath, binding.slot);
  if (
    current?.token !== binding.token ||
    current.dispatchId !== binding.dispatchId ||
    current.attemptId !== binding.attemptId ||
    current.pid !== binding.parentPid ||
    current.pidStartedAt !== binding.parentPidStartedAt
  ) {
    reclaim.release();
    return null;
  }
  return reclaim;
}

function tryCreateCapacityLease(
  path: string,
  slot: number,
  metadata?: CapacityLeaseMetadata,
): SharedSubagentCapacityLease | null {
  const pidStartedAt = getProcessStartTicks(process.pid);
  if (pidStartedAt === null) return null;

  const token = randomUUID();
  const payload: CapacityLeasePayload = {
    kind: "asc.subagent_capacity_lease.v1",
    slot,
    pid: process.pid,
    pidStartedAt,
    token,
    createdAt: new Date().toISOString(),
    ...normalizeCapacityLeaseMetadata(metadata),
  };
  if (!tryPublishCapacityPayload(path, payload, pidStartedAt)) return null;

  const sessionsDir = dirname(path);
  const spawnCommittedPath = getCapacitySpawnCommittedPath(sessionsDir, payload);
  const custodyBinding = getCapacityCustodyBinding(sessionsDir, payload);
  let spawnCommitted = false;
  return {
    slot,
    custodyBinding,
    markSpawnCommitted() {
      if (spawnCommitted) return;
      writeFileSync(
        spawnCommittedPath,
        JSON.stringify({
          kind: "asc.subagent_capacity_spawn_committed.v1",
          slot,
          token,
          committedAt: new Date().toISOString(),
        }),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      spawnCommitted = true;
    },
    release(options = {}) {
      if (
        (spawnCommitted || existsSync(spawnCommittedPath)) &&
        options.parentOwnedCompletion !== true &&
        options.confirmedNoEffects !== true &&
        !capacityLeaseIsStale(sessionsDir, payload)
      ) {
        return false;
      }
      const released = releaseOwnedCapacityPath(path, slot, token, readCapacityLease);
      if (!released) return false;
      removeCapacitySpawnCommittedMarker(spawnCommittedPath);
      if (custodyBinding) removeSubagentCapacityCustody(custodyBinding.path);
      return true;
    },
  };
}

function tryReclaimAndCreateCapacityLease(
  path: string,
  slot: number,
  sessionsDir: string,
  statuses: ReturnType<typeof readCapacityStatusSnapshot>,
  options?: {
    afterStaleLeaseClaim?: () => void;
    leaseMetadata?: CapacityLeaseMetadata;
  },
): SharedSubagentCapacityLease | null {
  const reclaim = tryAcquireCapacityReclaim(`${path}.reclaim`, slot);
  if (!reclaim) return null;

  try {
    if (!tryRemoveStaleCapacityLease(path, slot, sessionsDir, statuses, options)) return null;

    // Keep the per-slot reclaim lock until replacement is attempted. A normal acquirer may win
    // after unlink; in that case this create fails closed without deleting the new owner.
    return tryCreateCapacityLease(path, slot, options?.leaseMetadata);
  } finally {
    reclaim.release();
  }
}

function tryRemoveStaleCapacityLease(
  path: string,
  slot: number,
  sessionsDir: string,
  statuses: ReturnType<typeof readCapacityStatusSnapshot>,
  hooks?: { afterStaleLeaseClaim?: () => void },
): boolean {
  const contenderStartedAt = getProcessStartTicks(process.pid);
  if (contenderStartedAt === null) return false;
  const claimPath = `${path}.takeover-${process.pid}-${contenderStartedAt}-${randomUUID()}`;

  try {
    linkSync(path, claimPath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return false;
    throw error;
  }

  try {
    const observed = readCapacityLease(claimPath, slot);
    // An unreadable capacity lease may still represent a live effect owner. Atomic publication
    // prevents ASC writers from creating partial payloads, so malformed effect-bearing leases stay
    // fail-closed instead of being reclaimed by age alone.
    const stale = observed ? capacityLeaseIsStale(sessionsDir, observed, statuses) : false;
    if (!stale) return false;

    hooks?.afterStaleLeaseClaim?.();
    const claimStat = statSync(claimPath);
    const ownerStat = statSync(path);
    // Claim the observed lease inode before deletion. A concurrent exact release or replacement
    // either raises the link count or changes the pathname inode, so this contender fails closed
    // instead of unlinking the replacement.
    if (
      claimStat.dev !== ownerStat.dev ||
      claimStat.ino !== ownerStat.ino ||
      claimStat.nlink !== 2
    ) {
      return false;
    }

    unlinkSync(path);
    if (observed) {
      removeCapacitySpawnCommittedMarker(getCapacitySpawnCommittedPath(sessionsDir, observed));
    }
    if (observed) {
      const custodyBinding = getCapacityCustodyBinding(sessionsDir, observed);
      if (custodyBinding) removeSubagentCapacityCustody(custodyBinding.path);
    }
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return false;
    throw error;
  } finally {
    try {
      unlinkSync(claimPath);
    } catch {
      // The observed stale inode may already have lost its final name.
    }
  }
}

function tryAcquireCapacityReclaim(path: string, slot: number): OwnedCapacityReclaim | null {
  const created = tryCreateCapacityReclaim(path, slot);
  if (created) return created;
  if (!tryRemoveStaleCapacityReclaim(path, slot)) return null;
  return tryCreateCapacityReclaim(path, slot);
}

function tryRemoveStaleCapacityReclaim(path: string, slot: number): boolean {
  removeAbandonedCapacityReclaimClaims(path);
  const contenderStartedAt = getProcessStartTicks(process.pid);
  if (contenderStartedAt === null) return false;
  const claimPath = `${path}.claim-${process.pid}-${contenderStartedAt}-${randomUUID()}`;

  try {
    linkSync(path, claimPath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT" || getErrorCode(error) === "EEXIST") return false;
    throw error;
  }

  try {
    const current = readCapacityReclaim(claimPath, slot);
    const stale = current
      ? processOwnerIsStale(current)
      : malformedCapacityLockIsStale(claimPath, MALFORMED_CAPACITY_LOCK_RECLAIM_AGE_MS);
    if (!stale) return false;

    const claimStat = statSync(claimPath);
    const ownerStat = statSync(path);
    // The hard link is a compare-and-delete claim. Exactly two links means this contender is the
    // sole claimant for the observed inode. A later contender can raise nlink after this check,
    // but it will then see nlink > 2 or an inode mismatch and cannot delete our replacement.
    if (
      claimStat.dev !== ownerStat.dev ||
      claimStat.ino !== ownerStat.ino ||
      claimStat.nlink !== 2
    ) {
      return false;
    }

    unlinkSync(path);
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return false;
    throw error;
  } finally {
    try {
      unlinkSync(claimPath);
    } catch {
      // A crashed contender's identity-bearing claim name is cleaned on the next takeover.
    }
  }
}

function removeAbandonedCapacityReclaimClaims(path: string): void {
  const directory = dirname(path);
  const prefix = `${basename(path)}.claim-`;
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const match = entry.slice(prefix.length).match(/^(\d+)-(\d+)-/);
    if (!match) continue;
    const pid = Number(match[1]);
    const pidStartedAt = Number(match[2]);
    if (
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      !Number.isSafeInteger(pidStartedAt) ||
      pidStartedAt < 0 ||
      !processOwnerIsStale({ pid, pidStartedAt })
    ) {
      continue;
    }
    try {
      unlinkSync(join(directory, entry));
    } catch {
      // Another contender may already have cleaned this abandoned hard-link claim.
    }
  }
}

function tryCreateCapacityReclaim(path: string, slot: number): OwnedCapacityReclaim | null {
  const pidStartedAt = getProcessStartTicks(process.pid);
  if (pidStartedAt === null) return null;

  const token = randomUUID();
  const payload: CapacityReclaimPayload = {
    kind: "asc.subagent_capacity_reclaim.v1",
    slot,
    pid: process.pid,
    pidStartedAt,
    token,
    createdAt: new Date().toISOString(),
  };
  if (!tryPublishCapacityPayload(path, payload, pidStartedAt)) return null;

  return {
    release() {
      releaseOwnedCapacityPath(path, slot, token, readCapacityReclaim);
    },
  };
}

function tryPublishCapacityPayload(
  path: string,
  payload: CapacityLeasePayload | CapacityReclaimPayload,
  pidStartedAt: number,
): boolean {
  const publishPath = `${path}.publish-${process.pid}-${pidStartedAt}-${randomUUID()}`;
  try {
    // Write and close a complete private inode before atomically linking it into the contested
    // lock name. Contenders can therefore observe either no lock or a complete identity-bearing
    // payload, never the empty open("wx") publication window.
    writeFileSync(publishPath, JSON.stringify(payload), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    try {
      linkSync(publishPath, path);
      return true;
    } catch (error) {
      if (getErrorCode(error) === "EEXIST") return false;
      throw error;
    }
  } finally {
    try {
      unlinkSync(publishPath);
    } catch {
      // The published hard link remains valid; an unlinked or already-cleaned staging name is safe.
    }
  }
}

function releaseOwnedCapacityPath<T extends { token: string }>(
  path: string,
  slot: number,
  token: string,
  read: (path: string, expectedSlot: number) => T | undefined,
): boolean {
  const pidStartedAt = getProcessStartTicks(process.pid);
  if (pidStartedAt === null) return false;
  const claimPath = `${path}.release-${process.pid}-${pidStartedAt}-${randomUUID()}`;

  try {
    linkSync(path, claimPath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return true;
    throw error;
  }

  let released = false;
  try {
    if (read(claimPath, slot)?.token !== token) return false;
    const claimStat = statSync(claimPath);
    const ownerStat = statSync(path);
    if (
      claimStat.dev !== ownerStat.dev ||
      claimStat.ino !== ownerStat.ino ||
      claimStat.nlink !== 2
    ) {
      return false;
    }
    unlinkSync(path);
    released = true;
  } catch {
    // Best effort release; an exact dead owner is reclaimed on the next reservation.
    released = false;
  } finally {
    try {
      unlinkSync(claimPath);
    } catch {
      // Another cleanup path may already have removed the release claim.
    }
  }
  return released;
}

function readCapacityReclaim(
  path: string,
  expectedSlot: number,
): CapacityReclaimPayload | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CapacityReclaimPayload>;
    return parsed.kind === "asc.subagent_capacity_reclaim.v1" &&
      typeof parsed.slot === "number" &&
      Number.isSafeInteger(parsed.slot) &&
      parsed.slot === expectedSlot &&
      typeof parsed.pid === "number" &&
      Number.isSafeInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.pidStartedAt === "number" &&
      Number.isSafeInteger(parsed.pidStartedAt) &&
      parsed.pidStartedAt >= 0 &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      typeof parsed.createdAt === "string" &&
      Number.isFinite(Date.parse(parsed.createdAt))
      ? (parsed as CapacityReclaimPayload)
      : undefined;
  } catch {
    return undefined;
  }
}

function removeCapacitySpawnCommittedMarker(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Exact-token marker cleanup is best effort; it cannot name a replacement lease.
  }
}

function malformedCapacityLockIsStale(path: string, reclaimAgeMs: number): boolean {
  try {
    const ageMs = Date.now() - statSync(path).mtimeMs;
    return Number.isFinite(ageMs) && ageMs >= reclaimAgeMs;
  } catch {
    return false;
  }
}

function normalizeCapacityLeaseMetadata(
  metadata: CapacityLeaseMetadata | undefined,
): CapacityLeaseMetadata {
  const bound = (value: string | undefined) =>
    typeof value === "string" ? value.slice(0, 240) : undefined;
  return {
    ...(bound(metadata?.dispatchId) ? { dispatchId: bound(metadata?.dispatchId) } : {}),
    ...(bound(metadata?.attemptId) ? { attemptId: bound(metadata?.attemptId) } : {}),
    ...(bound(metadata?.sessionName) ? { sessionName: bound(metadata?.sessionName) } : {}),
    ...(metadata?.custodyMode === "helper_owned" || metadata?.custodyMode === "parent_owned"
      ? { custodyMode: metadata.custodyMode }
      : {}),
  };
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}
