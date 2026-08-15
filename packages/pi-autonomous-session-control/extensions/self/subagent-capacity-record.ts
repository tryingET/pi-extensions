import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
}

export interface LinuxProcView {
  listEntries(): string[];
  readStat(pid: string): string;
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
  parentPid: number;
  parentProcessState?: string;
  createdAt: string;
  ageMs: number;
  stale: boolean;
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

export function getCapacitySpawnCommittedPath(
  sessionsDir: string,
  payload: Pick<CapacityLeasePayload, "slot" | "token">,
): string {
  return `${getCapacityPath(sessionsDir, payload.slot)}.spawn-${payload.token}`;
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
      optionalIdentityIsValid(parsed.sessionName)
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
  if (!status) {
    return parentStale && !existsSync(getCapacitySpawnCommittedPath(sessionsDir, payload));
  }

  // Custom spawners never publish owned child custody. A running custom sidecar therefore stays
  // fail-closed even after parent death; only its terminal owner projection permits reclaim.
  if (status.cancelSupported !== true) return status.status !== "running";

  const helperIdentityValid = processIdentityIsValid(status.pid, status.pidStartedAt);
  const rawIdentityValid = processIdentityIsValid(status.rawChildPid, status.rawChildPidStartedAt);
  const rawGroupId = status.rawChildProcessGroupId;

  // An owned helper may die under SIGKILL before its exit handler can reap a detached raw Pi
  // process group. Missing raw-child custody therefore fails closed even when helper/parent dies.
  if (
    !helperIdentityValid ||
    !rawIdentityValid ||
    !Number.isSafeInteger(rawGroupId) ||
    (rawGroupId as number) <= 0
  ) {
    return false;
  }

  const rawChildStale = processOwnerIsStale({
    pid: status.rawChildPid as number,
    pidStartedAt: status.rawChildPidStartedAt as number,
  });
  if (!rawChildStale || !processGroupIsQuiescent(rawGroupId as number)) return false;

  const helperStale = processOwnerIsStale({
    pid: status.pid,
    pidStartedAt: status.pidStartedAt as number,
  });
  return status.status !== "running" || helperStale || parentStale;
}

export function inspectSharedSubagentCapacity(
  sessionsDir: string,
  maxConcurrent: number,
): SharedSubagentCapacityHolder[] {
  const statuses = readCapacityStatusSnapshot(sessionsDir);
  const holders: SharedSubagentCapacityHolder[] = [];

  for (let slot = 0; slot < maxConcurrent && holders.length < MAX_HOLDER_DIAGNOSTICS; slot += 1) {
    const lease = readCapacityLease(getCapacityPath(sessionsDir, slot), slot);
    if (!lease) continue;
    const exactStatus = findExactLeaseStatusFromList(statuses, lease);
    const helperPid =
      exactStatus?.cancelSupported === true &&
      processIdentityIsValid(exactStatus.pid, exactStatus.pidStartedAt)
        ? exactStatus.pid
        : undefined;
    const rawChildPid = processIdentityIsValid(
      exactStatus?.rawChildPid,
      exactStatus?.rawChildPidStartedAt,
    )
      ? exactStatus?.rawChildPid
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
      ...(exactStatus?.rawChildProcessGroupId
        ? {
            rawChildGroupQuiescent: processGroupIsQuiescent(exactStatus.rawChildProcessGroupId),
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
      return `slot=${holder.slot} ${session} age=${formatAge(holder.ageMs)} parentPid=${holder.parentPid}${holder.parentProcessState ? `(${holder.parentProcessState})` : ""}${helper}${raw}`;
    })
    .join("; ")
    .slice(0, 2_000);
}

export function processOwnerIsStale(payload: { pid: number; pidStartedAt: number }): boolean {
  try {
    process.kill(payload.pid, 0);
  } catch {
    return true;
  }
  if (readLinuxProcessState(payload.pid) === "Z") return true;
  return getProcessStartTicks(payload.pid) !== payload.pidStartedAt;
}

export function parseLinuxProcessState(statLine: string): string | undefined {
  return parseLinuxProcessStat(statLine)?.state;
}

const linuxProcView: LinuxProcView = {
  listEntries: () => readdirSync("/proc"),
  readStat: (pid) => readFileSync(`/proc/${pid}/stat`, "utf8"),
};

export function processGroupIsQuiescent(
  processGroupId: number,
  procView: LinuxProcView = linuxProcView,
): boolean {
  if (
    process.platform !== "linux" ||
    !Number.isSafeInteger(processGroupId) ||
    processGroupId <= 0
  ) {
    return false;
  }
  let entries: string[];
  try {
    entries = procView.listEntries();
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let statLine: string;
    try {
      statLine = procView.readStat(entry);
    } catch {
      // The /proc snapshot can churn. A listed process may fork a same-group child before
      // disappearing, so any unreadable listed PID makes this observation inconclusive.
      return false;
    }
    const parsed = parseLinuxProcessStat(statLine);
    if (!parsed) return false;
    if (parsed.processGroupId !== processGroupId) continue;
    if (parsed.state !== "Z" && parsed.state !== "X") return false;
  }
  return true;
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

function optionalIdentityIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= MAX_IDENTITY_CHARS);
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
