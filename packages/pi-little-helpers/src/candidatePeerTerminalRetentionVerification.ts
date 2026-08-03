import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listCandidateAdmissionPermits } from "./candidatePeerAdmissionState.ts";
import { verifyCleanedCandidateTerminalRecord } from "./candidatePeerLifecycleArchive.ts";
import { candidateCurrentInventoryBindingBlockers } from "./candidatePeerLifecycleV2Binding.ts";
import {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleEventsPath,
  lexicalPathExists,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import { inventoryCandidatePeerResources } from "./candidatePeerLifecycleV2Inventory.ts";
import { withCandidateRegistryMutationLock } from "./candidatePeerLifecycleV2State.ts";
import { getCandidatePeerRegistryDir } from "./candidatePeerRegistry.ts";
import {
  readTerminalCompactionMarker,
  type TerminalCandidateState,
} from "./candidatePeerTerminalRetentionCore.ts";
import { materializeTerminalCompaction } from "./candidatePeerTerminalRetentionMaterialization.ts";

const RECONCILED_RECEIPT_KEYS = [
  "actor",
  "aliases",
  "at",
  "evidence",
  "lost",
  "receiptDigest",
  "recoverable",
  "type",
  "worktreePath",
];
const TERMINAL_EVENT_KEYS = ["at", "event", "fromVersion", "record"];

export function assertTerminalInventoryBinding(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
): void {
  const inventory = inventoryCandidatePeerResources({
    registryDir: getCandidatePeerRegistryDir(env),
  });
  const blockers = candidateCurrentInventoryBindingBlockers(record, inventory);
  const resource = inventory.resources.find((item) => item.resourceId === record.resourceId);
  if (resource?.exists) {
    blockers.push("terminal candidate worktree is present in current registry inventory");
  }
  const unregisteredEntrants = listCandidateAdmissionPermits(env).filter(
    (permit) =>
      permit.status === "reserved" &&
      permit.peerRunId &&
      permit.worktreePath &&
      resolve(permit.worktreePath) === resolve(record.worktreePath) &&
      !record.aliases.includes(permit.peerRunId),
  );
  if (unregisteredEntrants.length > 0) {
    blockers.push(
      `candidate admission entered before registry publication: ${unregisteredEntrants
        .map((permit) => permit.peerRunId)
        .sort()
        .join(",")}`,
    );
  }
  if (blockers.length > 0) {
    throw new Error(`terminal compaction registry identity drifted: ${blockers.join("; ")}`);
  }
}

export function assertTerminalState(
  record: CandidateLifecycleRecord,
): asserts record is CandidateLifecycleRecord & { state: TerminalCandidateState } {
  if (record.schemaVersion !== 2) throw new Error("candidate terminal record schema mismatch");
  assertCandidateResourceId(record.resourceId);
  assertCandidateGenerationId(record.generationId);
  if (
    !("cleaned reconciled_missing closed_with_retained_effects".split(" ") as string[]).includes(
      record.state,
    )
  ) {
    throw new Error(
      `candidate terminal compaction requires a terminal record, found ${record.state}`,
    );
  }
  if (record.state === "closed_with_retained_effects") {
    throw new Error("closed_with_retained_effects compaction awaits its terminal verifier");
  }
}

function canonicalTimestamp(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return parsed;
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return stableJson(Object.keys(value).sort()) === stableJson(expected);
}

function finalEvent(record: CandidateLifecycleRecord, eventsPath: string): Record<string, unknown> {
  if (lexicalPathExists(record.worktreePath)) {
    throw new Error("reconciled-missing candidate worktree has reappeared");
  }
  const raw = readFileSync(eventsPath, "utf8");
  if (!raw.endsWith("\n") || raw.includes("\n\n")) {
    throw new Error("candidate terminal events must be canonical nonblank JSONL");
  }
  const lines = raw.slice(0, -1).split("\n");
  let result: Record<string, unknown> | undefined;
  for (const line of lines) {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (JSON.stringify(event) !== line) {
      throw new Error("candidate terminal events are not canonical JSONL");
    }
    result = event;
  }
  canonicalTimestamp(record.updatedAt, "candidate terminal record update time");
  if (
    !result ||
    !exactKeys(result, TERMINAL_EVENT_KEYS) ||
    result.event !== record.state ||
    result.at !== record.updatedAt ||
    result.fromVersion !== record.resourceVersion - 1 ||
    digestObject(result.record) !== digestObject(record)
  ) {
    throw new Error("candidate terminal record is not the exact final lifecycle event");
  }
  return result;
}

export function verifyTerminalCandidateRecord(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv = process.env,
  options: { allowPendingCompaction?: boolean; registryLockHeld?: boolean } = {},
): string {
  assertTerminalState(record);
  if (!options.registryLockHeld) {
    return withCandidateRegistryMutationLock(
      `terminal_compaction_verify:${record.resourceId}`,
      env,
      () => verifyTerminalCandidateRecord(record, env, { ...options, registryLockHeld: true }),
    );
  }
  if (readTerminalCompactionMarker(record, env)) {
    assertTerminalInventoryBinding(record, env);
  }
  if (record.state === "cleaned") {
    return verifyCleanedCandidateTerminalRecord(record, env, options);
  }
  const compacted = materializeTerminalCompaction(record, env, {
    allowPending: options.allowPendingCompaction,
  });
  try {
    const receipt = record.terminalReceipt as Record<string, unknown> | undefined;
    const createdAt = canonicalTimestamp(record.createdAt, "candidate terminal creation time");
    const updatedAt = canonicalTimestamp(record.updatedAt, "candidate terminal update time");
    if (!receipt || !exactKeys(receipt, RECONCILED_RECEIPT_KEYS)) {
      throw new Error("reconciled-missing terminal receipt schema mismatch");
    }
    const receiptAt = canonicalTimestamp(receipt.at, "reconciled-missing receipt time");
    if (
      receipt.type !== "reconciled_missing" ||
      typeof receipt.actor !== "string" ||
      !receipt.actor.trim() ||
      receiptAt < createdAt ||
      receiptAt > updatedAt ||
      receipt.worktreePath !== record.worktreePath ||
      stableJson(receipt.aliases) !== stableJson(record.aliases) ||
      !Array.isArray(receipt.recoverable) ||
      !Array.isArray(receipt.lost) ||
      !Array.isArray(receipt.evidence) ||
      ![receipt.recoverable, receipt.lost, receipt.evidence].every((items) =>
        (items as unknown[]).every((item) => typeof item === "string"),
      ) ||
      receipt.receiptDigest !==
        digestObject({
          actor: receipt.actor,
          recoverable: receipt.recoverable,
          lost: receipt.lost,
          evidence: receipt.evidence,
          worktreePath: receipt.worktreePath,
        })
    ) {
      throw new Error("reconciled-missing terminal receipt digest or identity mismatch");
    }
    finalEvent(
      record,
      compacted?.eventsPath ?? getCandidateLifecycleEventsPath(record.resourceId, env),
    );
    return digestObject(record);
  } finally {
    compacted?.cleanup();
  }
}
