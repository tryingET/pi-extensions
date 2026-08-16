import { randomUUID } from "node:crypto";
import { linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const MAX_IDENTITY_CHARS = 240;

export interface SubagentCapacityCustodyBinding {
  capacityPath: string;
  path: string;
  spawnCommittedPath: string;
  slot: number;
  token: string;
  dispatchId: string;
  attemptId: string;
  parentPid: number;
  parentPidStartedAt: number;
}

export interface SubagentCapacityCustodyPayload {
  kind: "asc.subagent_capacity_custody.v1";
  slot: number;
  token: string;
  dispatchId: string;
  attemptId: string;
  parentPid: number;
  parentPidStartedAt: number;
  helperPid: number;
  helperPidStartedAt: number;
  rawChildPid: number;
  rawChildPidStartedAt: number;
  rawChildProcessGroupId: number;
  createdAt: string;
}

export function getCapacityCustodyPath(capacityPath: string, token: string): string {
  return `${capacityPath}.custody-${token}`;
}

export function writeSubagentCapacityCustody(
  binding: SubagentCapacityCustodyBinding,
  custody: Pick<
    SubagentCapacityCustodyPayload,
    | "helperPid"
    | "helperPidStartedAt"
    | "rawChildPid"
    | "rawChildPidStartedAt"
    | "rawChildProcessGroupId"
  >,
): void {
  const payload: SubagentCapacityCustodyPayload = {
    kind: "asc.subagent_capacity_custody.v1",
    slot: binding.slot,
    token: binding.token,
    dispatchId: binding.dispatchId,
    attemptId: binding.attemptId,
    parentPid: binding.parentPid,
    parentPidStartedAt: binding.parentPidStartedAt,
    ...custody,
    createdAt: new Date().toISOString(),
  };
  if (!capacityCustodyIsValid(payload, binding)) {
    throw new Error("Invalid ASC capacity custody payload.");
  }

  publishExclusive(binding.path, JSON.stringify(payload));
}

export function writeSubagentCapacitySpawnCommitted(binding: SubagentCapacityCustodyBinding): void {
  publishExclusive(
    binding.spawnCommittedPath,
    JSON.stringify({
      kind: "asc.subagent_capacity_spawn_committed.v1",
      slot: binding.slot,
      token: binding.token,
      committedAt: new Date().toISOString(),
    }),
  );
}

export function readSubagentCapacityCustody(
  binding: SubagentCapacityCustodyBinding,
): SubagentCapacityCustodyPayload | undefined {
  try {
    const parsed = JSON.parse(readFileSync(binding.path, "utf8")) as unknown;
    return capacityCustodyIsValid(parsed, binding) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function removeSubagentCapacityCustody(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Exact-token custody cleanup is best effort and cannot name a replacement lease.
  }
}

function publishExclusive(path: string, content: string): void {
  const temporaryPath = `${path}.publish-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    // The contested name is single-writer: a duplicate helper must never replace the first raw
    // custody identity. Complete private inode publication also avoids partial visible records.
    linkSync(temporaryPath, path);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // A published hard link remains; a failed publication has no contested-path effect.
    }
  }
}

function capacityCustodyIsValid(
  value: unknown,
  binding: SubagentCapacityCustodyBinding,
): value is SubagentCapacityCustodyPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SubagentCapacityCustodyPayload>;
  return (
    candidate.kind === "asc.subagent_capacity_custody.v1" &&
    candidate.slot === binding.slot &&
    candidate.token === binding.token &&
    candidate.dispatchId === binding.dispatchId &&
    candidate.attemptId === binding.attemptId &&
    candidate.parentPid === binding.parentPid &&
    candidate.parentPidStartedAt === binding.parentPidStartedAt &&
    processIdentityIsValid(candidate.helperPid, candidate.helperPidStartedAt) &&
    processIdentityIsValid(candidate.rawChildPid, candidate.rawChildPidStartedAt) &&
    typeof candidate.rawChildProcessGroupId === "number" &&
    Number.isSafeInteger(candidate.rawChildProcessGroupId) &&
    candidate.rawChildProcessGroupId > 0 &&
    typeof candidate.createdAt === "string" &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    identityIsValid(candidate.dispatchId) &&
    identityIsValid(candidate.attemptId) &&
    identityIsValid(candidate.token)
  );
}

function processIdentityIsValid(pid: unknown, startedAt: unknown): boolean {
  return (
    typeof pid === "number" &&
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    typeof startedAt === "number" &&
    Number.isSafeInteger(startedAt) &&
    startedAt >= 0
  );
}

function identityIsValid(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_IDENTITY_CHARS;
}
