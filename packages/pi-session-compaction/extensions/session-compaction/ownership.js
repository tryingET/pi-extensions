/**
summary: "Arbitrates the single custom session_before_compact owner at runtime."
read_when:
  - "Changing duplicate-owner detection, host handler introspection, or ownership status."
*/
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../package.json",
);

function packageIdentity() {
  try {
    const manifest = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
    return {
      ownerId: manifest.name ?? "@tryinget/pi-session-compaction",
      packageName: manifest.name ?? "@tryinget/pi-session-compaction",
      packageVersion: manifest.version,
    };
  } catch {
    return {
      ownerId: "@tryinget/pi-session-compaction",
      packageName: "@tryinget/pi-session-compaction",
      packageVersion: undefined,
    };
  }
}

export const SESSION_BEFORE_COMPACT_EVENT = "session_before_compact";
export const COMPACTION_OWNERSHIP_SYMBOL = Symbol.for(
  "@tryinget/pi-session-compaction/ownership.v1",
);
export const DEFAULT_COMPACTION_OWNER = Object.freeze(packageIdentity());

const fallbackLeases = new WeakMap();

function isObject(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function asHandlerCount(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Set || value instanceof Map) return value.size;
  return undefined;
}

function safeCall(receiver, name, ...args) {
  try {
    return typeof receiver?.[name] === "function" ? receiver[name](...args) : undefined;
  } catch {
    return undefined;
  }
}

export function inspectCompactionHandlers(pi) {
  const probes = [
    {
      source: "listenerCount",
      probe: () => safeCall(pi, "listenerCount", SESSION_BEFORE_COMPACT_EVENT),
    },
    {
      source: "listeners",
      probe: () => safeCall(pi, "listeners", SESSION_BEFORE_COMPACT_EVENT),
    },
    {
      source: "getEventHandlers",
      probe: () => safeCall(pi, "getEventHandlers", SESSION_BEFORE_COMPACT_EVENT),
    },
    {
      source: "getHandlers",
      probe: () => safeCall(pi, "getHandlers", SESSION_BEFORE_COMPACT_EVENT),
    },
  ];

  for (const { source, probe } of probes) {
    const count = asHandlerCount(probe());
    if (count !== undefined) return { known: true, count, source };
  }

  for (const [source, candidate] of [
    ["handlers", pi?.handlers],
    ["_handlers", pi?._handlers],
    ["eventHandlers", pi?.eventHandlers],
  ]) {
    try {
      if (Array.isArray(candidate)) {
        const count = candidate.filter(
          (entry) =>
            entry?.event === SESSION_BEFORE_COMPACT_EVENT ||
            entry?.type === SESSION_BEFORE_COMPACT_EVENT,
        ).length;
        return { known: true, count, source };
      }
      if (candidate instanceof Map) {
        const count = asHandlerCount(candidate.get(SESSION_BEFORE_COMPACT_EVENT));
        if (count !== undefined) return { known: true, count, source };
      }
    } catch {
      // Continue to the cooperative fallback.
    }
  }

  return {
    known: false,
    count: undefined,
    source: "cooperative_lease_only",
  };
}

function readLease(pi) {
  if (!isObject(pi)) return undefined;
  try {
    return pi[COMPACTION_OWNERSHIP_SYMBOL] ?? fallbackLeases.get(pi);
  } catch {
    return fallbackLeases.get(pi);
  }
}

function writeLease(pi, lease) {
  if (!isObject(pi)) return false;
  try {
    if (Object.isExtensible(pi)) {
      Object.defineProperty(pi, COMPACTION_OWNERSHIP_SYMBOL, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: lease,
      });
      return true;
    }
  } catch {
    // Fall through to WeakMap storage for frozen/proxied APIs.
  }
  fallbackLeases.set(pi, lease);
  return true;
}

function deleteLease(pi, expectedLease) {
  if (!isObject(pi)) return false;
  let deleted = false;
  try {
    if (pi[COMPACTION_OWNERSHIP_SYMBOL] === expectedLease) {
      deleted = delete pi[COMPACTION_OWNERSHIP_SYMBOL];
    }
  } catch {
    // WeakMap cleanup below is sufficient for frozen/proxied APIs.
  }
  if (fallbackLeases.get(pi) === expectedLease) {
    fallbackLeases.delete(pi);
    deleted = true;
  }
  return deleted;
}

function normalizeOwner(owner = {}) {
  return {
    ...DEFAULT_COMPACTION_OWNER,
    ...owner,
    ownerId: String(owner.ownerId ?? DEFAULT_COMPACTION_OWNER.ownerId),
  };
}

export function claimCompactionOwnership(pi, owner = {}) {
  if (!isObject(pi)) {
    return {
      ok: false,
      reason: "invalid_runtime",
      message: "Cannot claim compaction ownership without a Pi ExtensionAPI object",
    };
  }

  const requestedOwner = normalizeOwner(owner);
  const existing = readLease(pi);
  const inspection = inspectCompactionHandlers(pi);
  const staleSameOwnerLease =
    existing?.ownerId === requestedOwner.ownerId && inspection.known && inspection.count === 0;
  if (existing && !staleSameOwnerLease) {
    return {
      ok: false,
      reason:
        existing.ownerId === requestedOwner.ownerId
          ? "already_claimed_by_this_owner"
          : "ownership_conflict",
      message:
        existing.ownerId === requestedOwner.ownerId
          ? `${requestedOwner.ownerId} already owns custom compaction in this runtime`
          : `Custom compaction is already owned by ${existing.ownerId}`,
      existing,
    };
  }
  if (staleSameOwnerLease) deleteLease(pi, existing);

  if (inspection.known && inspection.count > 0) {
    return {
      ok: false,
      reason: "existing_compaction_handler",
      message: `Refusing ownership because ${inspection.count} session_before_compact handler(s) already exist (${inspection.source})`,
      inspection,
    };
  }

  const lease = Object.freeze({
    ...requestedOwner,
    event: SESSION_BEFORE_COMPACT_EVENT,
    claimedAt: new Date().toISOString(),
    proof: inspection.known
      ? "host_introspection_and_cooperative_lease"
      : "cooperative_lease_best_effort",
    hostInspection: inspection,
  });
  writeLease(pi, lease);

  return {
    ok: true,
    lease,
    inspection,
    proof: lease.proof,
    bestEffort: !inspection.known,
    message: inspection.known
      ? "Exclusive custom compaction ownership established with host handler introspection"
      : "Exclusive custom compaction ownership established through a cooperative runtime lease; host handler introspection is unavailable",
  };
}

export function releaseCompactionOwnership(pi, lease) {
  return deleteLease(pi, lease);
}

export function getCompactionOwnershipStatus(pi) {
  const lease = readLease(pi);
  const inspection = inspectCompactionHandlers(pi);
  return {
    claimed: Boolean(lease),
    owner: lease,
    inspection,
    proof: lease?.proof ?? (inspection.known ? "host_introspection_only" : "unproven"),
    bestEffort: lease?.proof === "cooperative_lease_best_effort" || !inspection.known,
  };
}

export function formatCompactionOwnershipStatus(status) {
  if (!status?.claimed) {
    const host = status?.inspection?.known
      ? `${status.inspection.count} host handler(s) observed via ${status.inspection.source}`
      : "host handler introspection unavailable";
    return `pi-session-compaction ownership: unclaimed; ${host}.`;
  }
  const owner = status.owner;
  const mode = status.bestEffort ? "best-effort cooperative lease" : "host-verified lease";
  return `pi-session-compaction ownership: ${owner.ownerId} (${owner.packageVersion ?? "unknown version"}); ${mode}.`;
}
