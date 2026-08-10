// ---
// summary: "Provides checkout-root recovery election and owner-state serialization locks."
// read_when:
//   - "Changing per-checkout exclusion, stale gate handling, or recovery election."
// ---
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { identitiesMatch, identityOf, IntegrityError } from "./integrity.mjs";
import { CANONICAL_ROOT } from "./paths.mjs";
import {
  createExclusiveStateRecord,
  fsyncDirectory,
  MAX_LOCK_BYTES,
  processIdentity,
  processLiveness,
  readStateRecord as readRawStateRecord,
  recoveryStatePaths,
  removeStateFile,
} from "./state-files.mjs";
import { validateStatePayload } from "./state-schema.mjs";

export const LOCK_KIND = "pi-host-compatibility-canary-mutation-lock";
export const GATE_KIND = "pi-host-compatibility-canary-state-gate";

function readStateRecord(filePath, expectedKind, maxBytes) {
  const record = readRawStateRecord(filePath, expectedKind, maxBytes);
  validateStatePayload(record.payload, expectedKind);
  return record;
}

export class ConcurrentCanaryError extends IntegrityError {
  constructor(message) {
    super(message);
    this.name = "ConcurrentCanaryError";
    this.code = "PI_HOST_COMPAT_CONCURRENT";
  }
}

export function rootBinding() {
  return {
    canonicalPath: CANONICAL_ROOT,
    identity: identityOf(statSync(CANONICAL_ROOT, { bigint: true })),
  };
}

export function bindingsMatch(left, right) {
  return left?.canonicalPath === right?.canonicalPath &&
    identitiesMatch(left?.identity, right?.identity);
}

export function ownersMatch(left, right) {
  return left?.token === right?.token &&
    JSON.stringify(left?.identity) === JSON.stringify(right?.identity);
}

export function newOwner() {
  return { token: randomBytes(32).toString("hex"), identity: processIdentity() };
}

function gatePayload(owner) {
  return {
    kind: GATE_KIND,
    runId: randomUUID(),
    owner,
    root: rootBinding(),
    createdAt: new Date().toISOString(),
  };
}

export function verifyGate(record, expectedOwner) {
  if (!bindingsMatch(record.payload.root, rootBinding())) {
    throw new IntegrityError("state gate belongs to a different checkout identity");
  }
  if (expectedOwner && !ownersMatch(record.payload.owner, expectedOwner)) {
    throw new ConcurrentCanaryError("state gate ownership changed");
  }
}

export function acquireStateGate(env = process.env) {
  const paths = recoveryStatePaths(env, { create: true });
  const owner = newOwner();
  const payload = gatePayload(owner);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (createExclusiveStateRecord(paths.gatePath, payload, MAX_LOCK_BYTES)) {
      const owned = readStateRecord(paths.gatePath, GATE_KIND, MAX_LOCK_BYTES);
      verifyGate(owned, owner);
      return {
        paths,
        owner,
        record: owned,
        assertOwned() {
          const current = readStateRecord(paths.gatePath, GATE_KIND, MAX_LOCK_BYTES);
          verifyGate(current, owner);
          if (
            !identitiesMatch(current.identity, owned.identity) ||
            JSON.stringify(current.payload) !== JSON.stringify(owned.payload)
          ) throw new ConcurrentCanaryError("state gate record changed");
          return current;
        },
        release() {
          const current = this.assertOwned();
          removeStateFile(paths.gatePath, current.identity, GATE_KIND, MAX_LOCK_BYTES);
        },
      };
    }
    const existing = readStateRecord(paths.gatePath, GATE_KIND, MAX_LOCK_BYTES);
    verifyGate(existing);
    const liveness = processLiveness(existing.payload.owner?.identity);
    if (liveness === "active") throw new ConcurrentCanaryError("another canary state operation is active");
    if (liveness !== "dead") throw new IntegrityError("canary state gate owner identity cannot be proven stale");
    const stalePath = path.join(paths.checkoutDir, `.gate.stale.${randomUUID()}.json`);
    try {
      renameSync(paths.gatePath, stalePath);
      fsyncDirectory(paths.checkoutDir);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const moved = readStateRecord(stalePath, GATE_KIND, MAX_LOCK_BYTES);
    if (!identitiesMatch(moved.identity, existing.identity)) {
      throw new IntegrityError("state gate identity drifted during stale-owner claim");
    }
    removeStateFile(stalePath, moved.identity, GATE_KIND, MAX_LOCK_BYTES);
  }
  throw new ConcurrentCanaryError("could not acquire the canary state gate");
}

export function acquireCheckoutRecoveryLock(paths) {
  if (existsSync(paths.recoveryLockPath)) {
    const existing = readStateRecord(paths.recoveryLockPath, GATE_KIND, MAX_LOCK_BYTES);
    verifyGate(existing);
    const liveness = processLiveness(existing.payload.owner.identity);
    if (liveness === "active") throw new ConcurrentCanaryError("another checkout recovery is active");
    throw new IntegrityError("a stale checkout recovery claim requires manual review");
  }
  const owner = newOwner();
  const payload = gatePayload(owner);
  if (!createExclusiveStateRecord(
    paths.recoveryLockPath,
    payload,
    MAX_LOCK_BYTES,
    { privateDirectory: false },
  )) throw new ConcurrentCanaryError("another checkout recovery acquired the recovery lock");
  const owned = readStateRecord(paths.recoveryLockPath, GATE_KIND, MAX_LOCK_BYTES);
  verifyGate(owned, owner);
  return {
    owner,
    record: owned,
    assertOwned() {
      const current = readStateRecord(paths.recoveryLockPath, GATE_KIND, MAX_LOCK_BYTES);
      verifyGate(current, owner);
      if (
        !identitiesMatch(current.identity, owned.identity) ||
        JSON.stringify(current.payload) !== JSON.stringify(owned.payload)
      ) throw new ConcurrentCanaryError("checkout recovery lock record changed");
      return current;
    },
    release() {
      const current = this.assertOwned();
      removeStateFile(paths.recoveryLockPath, current.identity, GATE_KIND, MAX_LOCK_BYTES);
    },
  };
}
