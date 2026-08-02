import { readFileSync } from "node:fs";

export interface SubagentSessionStatus {
  sessionName: string;
  status: "running" | "done" | "error" | "timeout" | "aborted" | "abandoned";
  pid: number;
  ppid: number;
  createdAt: string;
  updatedAt: string;
  objective?: string;
  dispatchId?: string;
  attemptId?: string;
  resumed?: boolean;
  configuredThinking?: string;
  startupTimeoutMs?: number;
  executionTimeoutMs?: number;
  timeoutPhase?: "startup" | "execution";
  cancelRequestedAt?: string;
  cancelRequestedBy?: string;
  cancelReason?: string;
  cancelSupported?: boolean;
  exitCode?: number;
  exitSignal?: string;
  failureKind?: "subagent_helper_bootstrap_failed" | "transport_exited_before_settlement";
  elapsed?: number;
  parentSessionKey?: string;
  parentRepoRoot?: string;
  resultPreview?: string;
  stderrPreview?: string;
  sessionKind?: "subagent";
  sessionFile?: string;
  pidStartedAt?: number;
  pidIdentity?: "proc-start-ticks" | "unsupported";
  profile?: string;
  model?: string;
  tools?: string;
}

const UNVERIFIED_RUNNING_STATUS_GRACE_MS = 60 * 60 * 1000;
const SUBAGENT_STATUS_VALUES = new Set<SubagentSessionStatus["status"]>([
  "running",
  "done",
  "error",
  "timeout",
  "aborted",
  "abandoned",
]);

export function isSubagentSessionStatusValue(
  value: unknown,
): value is SubagentSessionStatus["status"] {
  return (
    typeof value === "string" &&
    SUBAGENT_STATUS_VALUES.has(value as SubagentSessionStatus["status"])
  );
}

export function parseSubagentSessionStatusPayload(parsed: unknown): SubagentSessionStatus | null {
  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.sessionName !== "string" ||
    !isSubagentSessionStatusValue(candidate.status) ||
    typeof candidate.pid !== "number" ||
    typeof candidate.ppid !== "number" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  if (candidate.sessionKind !== undefined && candidate.sessionKind !== "subagent") {
    return null;
  }

  if (candidate.sessionFile !== undefined && typeof candidate.sessionFile !== "string") {
    return null;
  }

  if (candidate.pidStartedAt !== undefined && typeof candidate.pidStartedAt !== "number") {
    return null;
  }

  if (
    candidate.pidIdentity !== undefined &&
    candidate.pidIdentity !== "proc-start-ticks" &&
    candidate.pidIdentity !== "unsupported"
  ) {
    return null;
  }
  for (const key of [
    "dispatchId",
    "attemptId",
    "configuredThinking",
    "cancelRequestedAt",
    "cancelRequestedBy",
    "cancelReason",
    "exitSignal",
    "resultPreview",
    "stderrPreview",
  ] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== "string") return null;
  }
  for (const key of ["startupTimeoutMs", "executionTimeoutMs"] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== "number") return null;
  }
  if (candidate.resumed !== undefined && typeof candidate.resumed !== "boolean") return null;
  if (candidate.cancelSupported !== undefined && typeof candidate.cancelSupported !== "boolean") {
    return null;
  }
  if (
    candidate.failureKind !== undefined &&
    candidate.failureKind !== "subagent_helper_bootstrap_failed" &&
    candidate.failureKind !== "transport_exited_before_settlement"
  ) {
    return null;
  }
  if (
    candidate.timeoutPhase !== undefined &&
    candidate.timeoutPhase !== "startup" &&
    candidate.timeoutPhase !== "execution"
  ) {
    return null;
  }

  return candidate as unknown as SubagentSessionStatus;
}

export function getProcessStartTicks(pid: number): number | null {
  if (!Number.isInteger(pid) || pid <= 0 || process.platform !== "linux") return null;

  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const closingParen = stat.lastIndexOf(")");
    if (closingParen < 0) return null;
    const fields = stat
      .slice(closingParen + 2)
      .trim()
      .split(/\s+/);
    const startTicks = Number(fields[19]);
    return Number.isFinite(startTicks) ? startTicks : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function runningStatusHasLiveOwner(status: SubagentSessionStatus): boolean {
  if (!processIsAlive(status.pid)) return false;
  if (typeof status.pidStartedAt !== "number") {
    if (status.pidIdentity === "unsupported") return false;

    const updatedAtMs = Date.parse(status.updatedAt);
    const ageMs = Date.now() - updatedAtMs;
    return (
      Number.isFinite(updatedAtMs) && ageMs >= 0 && ageMs <= UNVERIFIED_RUNNING_STATUS_GRACE_MS
    );
  }
  return getProcessStartTicks(status.pid) === status.pidStartedAt;
}
