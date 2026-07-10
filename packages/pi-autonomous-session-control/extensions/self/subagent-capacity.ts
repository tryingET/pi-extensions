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
import { getProcessStartTicks } from "./subagent-session.ts";

const MALFORMED_CAPACITY_LOCK_RECLAIM_AGE_MS = 5_000;

interface CapacityLeasePayload {
  kind: "asc.subagent_capacity_lease.v1";
  slot: number;
  pid: number;
  pidStartedAt: number;
  token: string;
  createdAt: string;
}

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

export interface SharedSubagentCapacityLease {
  slot: number;
  release(): void;
}

export function reserveSharedSubagentCapacity(
  sessionsDir: string,
  maxConcurrent: number,
  hooks?: { afterStaleLeaseClaim?: () => void },
): SharedSubagentCapacityLease | null {
  for (let slot = 0; slot < maxConcurrent; slot += 1) {
    const path = getCapacityPath(sessionsDir, slot);
    const created = tryCreateCapacityLease(path, slot);
    if (created) return created;
    if (!existsSync(path)) continue;

    const reclaimed = tryReclaimAndCreateCapacityLease(path, slot, hooks);
    if (reclaimed) return reclaimed;
  }
  return null;
}

function tryCreateCapacityLease(path: string, slot: number): SharedSubagentCapacityLease | null {
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
  };
  if (!tryPublishCapacityPayload(path, payload, pidStartedAt)) return null;

  return {
    slot,
    release() {
      releaseOwnedCapacityPath(path, slot, token, readCapacityLease);
    },
  };
}

function tryReclaimAndCreateCapacityLease(
  path: string,
  slot: number,
  hooks?: { afterStaleLeaseClaim?: () => void },
): SharedSubagentCapacityLease | null {
  const reclaim = tryAcquireCapacityReclaim(`${path}.reclaim`, slot);
  if (!reclaim) return null;

  try {
    if (!tryRemoveStaleCapacityLease(path, slot, hooks)) return null;

    // Keep the per-slot reclaim lock until replacement is attempted. A normal acquirer may win
    // after unlink; in that case this create fails closed without deleting the new owner.
    return tryCreateCapacityLease(path, slot);
  } finally {
    reclaim.release();
  }
}

function tryRemoveStaleCapacityLease(
  path: string,
  slot: number,
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
    const stale = observed
      ? capacityLeaseIsStale(observed)
      : malformedCapacityLockIsStale(claimPath, MALFORMED_CAPACITY_LOCK_RECLAIM_AGE_MS);
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
): void {
  const pidStartedAt = getProcessStartTicks(process.pid);
  if (pidStartedAt === null) return;
  const claimPath = `${path}.release-${process.pid}-${pidStartedAt}-${randomUUID()}`;

  try {
    linkSync(path, claimPath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return;
    throw error;
  }

  try {
    if (read(claimPath, slot)?.token !== token) return;
    const claimStat = statSync(claimPath);
    const ownerStat = statSync(path);
    if (
      claimStat.dev !== ownerStat.dev ||
      claimStat.ino !== ownerStat.ino ||
      claimStat.nlink !== 2
    ) {
      return;
    }
    unlinkSync(path);
  } catch {
    // Best effort release; an exact dead owner is reclaimed on the next reservation.
  } finally {
    try {
      unlinkSync(claimPath);
    } catch {
      // Another cleanup path may already have removed the release claim.
    }
  }
}

function getCapacityPath(sessionsDir: string, slot: number): string {
  return join(sessionsDir, `.asc-subagent-capacity-${slot}.lock`);
}

function readCapacityLease(path: string, expectedSlot: number): CapacityLeasePayload | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CapacityLeasePayload>;
    return parsed.kind === "asc.subagent_capacity_lease.v1" &&
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
      ? (parsed as CapacityLeasePayload)
      : undefined;
  } catch {
    return undefined;
  }
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

function capacityLeaseIsStale(payload: CapacityLeasePayload): boolean {
  return processOwnerIsStale(payload);
}

function processOwnerIsStale(payload: { pid: number; pidStartedAt: number }): boolean {
  try {
    process.kill(payload.pid, 0);
  } catch {
    return true;
  }
  return getProcessStartTicks(payload.pid) !== payload.pidStartedAt;
}

function malformedCapacityLockIsStale(path: string, reclaimAgeMs: number): boolean {
  try {
    const ageMs = Date.now() - statSync(path).mtimeMs;
    return Number.isFinite(ageMs) && ageMs >= reclaimAgeMs;
  } catch {
    return false;
  }
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}
