import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getCapacityCustodyPath,
  readSubagentCapacityCustody,
  type SubagentCapacityCustodyBinding,
} from "./subagent-capacity-custody.ts";
import {
  getProcessStartTicks,
  listSubagentSessionStatuses,
  type SubagentSessionStatus,
} from "./subagent-session.ts";

const MAX_HOLDER_DIAGNOSTICS = 8;
const MAX_LEGACY_SESSION_CANDIDATES = 3;
const MAX_IDENTITY_CHARS = 240;

export interface CapacityLeaseMetadata {
  dispatchId?: string;
  attemptId?: string;
  sessionName?: string;
  custodyMode?: "helper_owned" | "parent_owned";
}

export interface LinuxProcessGroupProbe {
  signalZero(processGroupId: number): void;
}

export interface CapacityLeasePayload extends CapacityLeaseMetadata {
  kind: "asc.subagent_capacity_lease.v1";
  slot: number;
  pid: number;
  pidStartedAt: number;
  token: string;
  createdAt: string;
}

export interface SharedSubagentCapacityHolder {
  slot: number;
  parentPid?: number;
  parentProcessState?: string;
  createdAt: string;
  ageMs: number;
  stale: boolean;
  unreadable?: boolean;
  dispatchId?: string;
  attemptId?: string;
  sessionName?: string;
  status?: SubagentSessionStatus["status"];
  helperPid?: number;
  helperProcessState?: string;
  rawChildPid?: number;
  rawChildProcessState?: string;
  rawChildGroupQuiescent?: boolean;
  legacySessionCandidates?: string[];
}

export function getCapacityPath(sessionsDir: string, slot: number): string {
  return join(sessionsDir, `.asc-subagent-capacity-${slot}.lock`);
}

export function getCapacityLimitPath(sessionsDir: string): string {
  return join(sessionsDir, ".asc-subagent-capacity-limit.v1");
}

export function getCapacitySpawnCommittedPath(
  sessionsDir: string,
  payload: Pick<CapacityLeasePayload, "slot" | "token">,
): string {
  return `${getCapacityPath(sessionsDir, payload.slot)}.spawn-${payload.token}`;
}

export function getCapacityCustodyBinding(
  sessionsDir: string,
  payload: CapacityLeasePayload,
): SubagentCapacityCustodyBinding | undefined {
  if (!payload.dispatchId || !payload.attemptId || payload.custodyMode === "parent_owned") {
    return undefined;
  }
  const capacityPath = getCapacityPath(sessionsDir, payload.slot);
  return {
    capacityPath,
    path: getCapacityCustodyPath(capacityPath, payload.token),
    spawnCommittedPath: getCapacitySpawnCommittedPath(sessionsDir, payload),
    slot: payload.slot,
    token: payload.token,
    dispatchId: payload.dispatchId,
    attemptId: payload.attemptId,
    parentPid: payload.pid,
    parentPidStartedAt: payload.pidStartedAt,
  };
}

export function readCapacityLease(
  path: string,
  expectedSlot: number,
): CapacityLeasePayload | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CapacityLeasePayload>;
    return parsed.kind === "asc.subagent_capacity_lease.v1" &&
      typeof parsed.slot === "number" &&
      Number.isSafeInteger(parsed.slot) &&
      parsed.slot === expectedSlot &&
      processIdentityIsValid(parsed.pid, parsed.pidStartedAt) &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      typeof parsed.createdAt === "string" &&
      Number.isFinite(Date.parse(parsed.createdAt)) &&
      optionalIdentityIsValid(parsed.dispatchId) &&
      optionalIdentityIsValid(parsed.attemptId) &&
      optionalIdentityIsValid(parsed.sessionName) &&
      optionalCustodyModeIsValid(parsed.custodyMode)
      ? (parsed as CapacityLeasePayload)
      : undefined;
  } catch {
    return undefined;
  }
}

export function readCapacityStatusSnapshot(sessionsDir: string): SubagentSessionStatus[] {
  return listSubagentSessionStatuses(sessionsDir);
}

export function capacityLeaseIsStale(
  sessionsDir: string,
  payload: CapacityLeasePayload,
  statuses: SubagentSessionStatus[] = readCapacityStatusSnapshot(sessionsDir),
): boolean {
  const parentStale = processOwnerIsStale(payload);
  const status = findExactLeaseStatusFromList(statuses, payload);

  // Legacy leases have no child-custody identity. Preserve their historical parent-owned
  // semantics, but never infer a child match from timestamps for reclamation.
  if (!payload.dispatchId || !payload.attemptId) return parentStale;

  const spawnCommitted = existsSync(getCapacitySpawnCommittedPath(sessionsDir, payload));
  if (payload.custodyMode === "parent_owned") {
    return status ? status.status !== "running" : parentStale && !spawnCommitted;
  }

  const custodyBinding = getCapacityCustodyBinding(sessionsDir, payload);
  const custody = custodyBinding ? readSubagentCapacityCustody(custodyBinding) : undefined;

  if (payload.custodyMode === "helper_owned" && !custody) {
    if (spawnCommitted || !parentStale) return false;
    if (
      status &&
      processIdentityIsValid(status.pid, status.pidStartedAt) &&
      !processOwnerIsStale({ pid: status.pid, pidStartedAt: status.pidStartedAt as number })
    ) {
      return false;
    }
    return true;
  }

  // Compatibility for leases created before custodyMode existed: terminal custom sidecars remain
  // parent-owned, while owned legacy sidecars retain their exact status custody fallback.
  if (!custody && status?.cancelSupported !== true) {
    if (!status) return parentStale && !spawnCommitted;
    return status.status !== "running";
  }

  const helperPid = custody?.helperPid ?? status?.pid;
  const helperPidStartedAt = custody?.helperPidStartedAt ?? status?.pidStartedAt;
  const rawChildPid = custody?.rawChildPid ?? status?.rawChildPid;
  const rawChildPidStartedAt = custody?.rawChildPidStartedAt ?? status?.rawChildPidStartedAt;
  const rawGroupId = custody?.rawChildProcessGroupId ?? status?.rawChildProcessGroupId;

  // Missing exact post-spawn custody remains fail-closed. The helper-written custody record closes
  // the parent-transport window without treating transport output as durable effect authority.
  if (
    !processIdentityIsValid(helperPid, helperPidStartedAt) ||
    !processIdentityIsValid(rawChildPid, rawChildPidStartedAt) ||
    !Number.isSafeInteger(rawGroupId) ||
    (rawGroupId as number) <= 0
  ) {
    return false;
  }

  const rawChildStale = processOwnerIsStale({
    pid: rawChildPid as number,
    pidStartedAt: rawChildPidStartedAt as number,
  });
  if (!rawChildStale || !processGroupIsQuiescent(rawGroupId as number)) return false;

  const helperStale = processOwnerIsStale({
    pid: helperPid as number,
    pidStartedAt: helperPidStartedAt as number,
  });
  if (!helperStale) return false;
  return true;
}

export function inspectSharedSubagentCapacity(
  sessionsDir: string,
  maxConcurrent: number,
): SharedSubagentCapacityHolder[] {
  const statuses = readCapacityStatusSnapshot(sessionsDir);
  const holders: SharedSubagentCapacityHolder[] = [];

  for (let slot = 0; slot < maxConcurrent && holders.length < MAX_HOLDER_DIAGNOSTICS; slot += 1) {
    const capacityPath = getCapacityPath(sessionsDir, slot);
    const lease = readCapacityLease(capacityPath, slot);
    if (!lease) {
      if (existsSync(capacityPath)) {
        const metadata = unreadableCapacityMetadata(capacityPath);
        holders.push({
          slot,
          createdAt: metadata.createdAt,
          ageMs: metadata.ageMs,
          stale: false,
          unreadable: true,
        });
      }
      continue;
    }
    const exactStatus = findExactLeaseStatusFromList(statuses, lease);
    const custodyBinding = getCapacityCustodyBinding(sessionsDir, lease);
    const custody = custodyBinding ? readSubagentCapacityCustody(custodyBinding) : undefined;
    const helperPid = processIdentityIsValid(
      custody?.helperPid ?? exactStatus?.pid,
      custody?.helperPidStartedAt ?? exactStatus?.pidStartedAt,
    )
      ? (custody?.helperPid ?? exactStatus?.pid)
      : undefined;
    const rawChildPid = processIdentityIsValid(
      custody?.rawChildPid ?? exactStatus?.rawChildPid,
      custody?.rawChildPidStartedAt ?? exactStatus?.rawChildPidStartedAt,
    )
      ? (custody?.rawChildPid ?? exactStatus?.rawChildPid)
      : undefined;
    const legacySessionCandidates = lease.dispatchId
      ? undefined
      : statuses
          .filter(
            (status) =>
              status.status === "running" &&
              status.ppid === lease.pid &&
              createdAtIsNear(status.createdAt, lease.createdAt),
          )
          .slice(0, MAX_LEGACY_SESSION_CANDIDATES)
          .map((status) => status.sessionName);

    holders.push({
      slot,
      parentPid: lease.pid,
      ...stateField("parentProcessState", readLinuxProcessState(lease.pid)),
      createdAt: lease.createdAt,
      ageMs: Math.max(0, Date.now() - Date.parse(lease.createdAt)),
      stale: capacityLeaseIsStale(sessionsDir, lease, statuses),
      ...(lease.dispatchId ? { dispatchId: lease.dispatchId } : {}),
      ...(lease.attemptId ? { attemptId: lease.attemptId } : {}),
      ...(exactStatus?.sessionName || lease.sessionName
        ? { sessionName: exactStatus?.sessionName ?? lease.sessionName }
        : {}),
      ...(exactStatus ? { status: exactStatus.status } : {}),
      ...(helperPid ? { helperPid } : {}),
      ...stateField("helperProcessState", helperPid ? readLinuxProcessState(helperPid) : undefined),
      ...(rawChildPid ? { rawChildPid } : {}),
      ...stateField(
        "rawChildProcessState",
        rawChildPid ? readLinuxProcessState(rawChildPid) : undefined,
      ),
      ...((custody?.rawChildProcessGroupId ?? exactStatus?.rawChildProcessGroupId)
        ? {
            rawChildGroupQuiescent: processGroupIsQuiescent(
              (custody?.rawChildProcessGroupId ?? exactStatus?.rawChildProcessGroupId) as number,
            ),
          }
        : {}),
      ...(legacySessionCandidates?.length ? { legacySessionCandidates } : {}),
    });
  }

  return holders;
}

export function formatSharedSubagentCapacityHolders(
  holders: SharedSubagentCapacityHolder[],
): string {
  if (holders.length === 0) return "No readable holder metadata was available.";
  return holders
    .map((holder) => {
      if (holder.unreadable) {
        return `slot=${holder.slot} lease=unreadable age=${formatAge(holder.ageMs)} stale=false`;
      }
      const session = holder.sessionName
        ? `session=${holder.sessionName}`
        : holder.legacySessionCandidates?.length
          ? `legacyCandidates=${holder.legacySessionCandidates.join("|")}`
          : "session=unknown";
      const helper = holder.helperPid
        ? ` helperPid=${holder.helperPid}${holder.helperProcessState ? `(${holder.helperProcessState})` : ""}`
        : "";
      const raw = holder.rawChildPid
        ? ` rawPid=${holder.rawChildPid}${holder.rawChildProcessState ? `(${holder.rawChildProcessState})` : ""} rawGroupQuiescent=${String(holder.rawChildGroupQuiescent)}`
        : " rawPid=unknown";
      return `slot=${holder.slot} ${session} age=${formatAge(holder.ageMs)} parentPid=${holder.parentPid ?? "unknown"}${holder.parentProcessState ? `(${holder.parentProcessState})` : ""}${helper}${raw}`;
    })
    .join("; ")
    .slice(0, 2_000);
}

export function processOwnerIsStale(payload: { pid: number; pidStartedAt: number }): boolean {
  try {
    process.kill(payload.pid, 0);
  } catch (error) {
    return getErrorCode(error) === "ESRCH";
  }
  const state = readLinuxProcessState(payload.pid);
  if (state === undefined) return false;
  if (state === "Z" || state === "X") return true;
  const startedAt = getProcessStartTicks(payload.pid);
  return startedAt !== null && startedAt !== payload.pidStartedAt;
}

export function parseLinuxProcessState(statLine: string): string | undefined {
  return parseLinuxProcessStat(statLine)?.state;
}

const linuxProcessGroupProbe: LinuxProcessGroupProbe = {
  signalZero: (processGroupId) => process.kill(-processGroupId, 0),
};

export function processGroupIsQuiescent(
  processGroupId: number,
  probe: LinuxProcessGroupProbe = linuxProcessGroupProbe,
): boolean {
  if (
    process.platform !== "linux" ||
    !Number.isSafeInteger(processGroupId) ||
    processGroupId <= 0
  ) {
    return false;
  }
  try {
    // killpg(..., 0) asks the kernel whether the process-group identity still exists. Unlike a
    // userspace /proc directory snapshot, it cannot miss a same-group fork between observations.
    // Zombies keep the group non-quiescent until their kernel identity is reaped.
    probe.signalZero(processGroupId);
    return false;
  } catch (error) {
    return getErrorCode(error) === "ESRCH";
  }
}

function readLinuxProcessState(pid: number): string | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    return parseLinuxProcessState(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return undefined;
  }
}

function parseLinuxProcessStat(
  statLine: string,
): { state: string; processGroupId: number } | undefined {
  const closeParen = statLine.lastIndexOf(")");
  if (closeParen < 0) return undefined;
  const fields = statLine
    .slice(closeParen + 1)
    .trim()
    .split(/\s+/);
  const state = fields[0];
  const processGroupId = Number(fields[2]);
  return state && /^[A-Z]$/.test(state) && Number.isSafeInteger(processGroupId)
    ? { state, processGroupId }
    : undefined;
}

function findExactLeaseStatusFromList(
  statuses: SubagentSessionStatus[],
  lease: CapacityLeasePayload,
): SubagentSessionStatus | undefined {
  if (!lease.dispatchId || !lease.attemptId) return undefined;
  return statuses.find(
    (status) => status.dispatchId === lease.dispatchId && status.attemptId === lease.attemptId,
  );
}

function processIdentityIsValid(pid: unknown, pidStartedAt: unknown): boolean {
  return (
    typeof pid === "number" &&
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    typeof pidStartedAt === "number" &&
    Number.isSafeInteger(pidStartedAt) &&
    pidStartedAt >= 0
  );
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}

function optionalIdentityIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= MAX_IDENTITY_CHARS);
}

function optionalCustodyModeIsValid(value: unknown): boolean {
  return value === undefined || value === "helper_owned" || value === "parent_owned";
}

function unreadableCapacityMetadata(path: string): { createdAt: string; ageMs: number } {
  try {
    const modifiedAt = statSync(path).mtimeMs;
    return {
      createdAt: new Date(modifiedAt).toISOString(),
      ageMs: Math.max(0, Date.now() - modifiedAt),
    };
  } catch {
    return { createdAt: new Date(0).toISOString(), ageMs: 0 };
  }
}

function createdAtIsNear(left: string, right: string): boolean {
  const delta = Math.abs(Date.parse(left) - Date.parse(right));
  return Number.isFinite(delta) && delta <= 60_000;
}

function stateField<Key extends string>(
  key: Key,
  value: string | undefined,
): Record<Key, string> | object {
  return value ? ({ [key]: value } as Record<Key, string>) : {};
}

function formatAge(ageMs: number): string {
  if (ageMs < 60_000) return `${Math.max(0, Math.round(ageMs / 1_000))}s`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h`;
  return `${Math.round(ageMs / 86_400_000)}d`;
}
