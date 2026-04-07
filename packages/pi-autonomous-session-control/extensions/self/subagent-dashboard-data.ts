import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listSubagentSessionStatuses, type SubagentSessionStatus } from "./subagent-session.ts";

export interface SubagentDashboardRow {
  sessionName: string;
  status: SubagentSessionStatus["status"];
  objectivePreview: string;
  resultPreview?: string;
  recommendedActionHint: string;
  sessionScope: "current" | "other" | "recorded" | "unknown";
  sessionScopeLabel: string;
  sessionScopeBadge?: string;
  updatedAt: string;
  ageMs: number;
  ageLabel: string;
}

export interface SubagentDashboardSnapshot {
  rows: SubagentDashboardRow[];
  total: number;
  counts: Record<SubagentSessionStatus["status"], number>;
}

export interface SubagentSessionArtifactSummary {
  path: string;
  exists: boolean;
  bytes?: number;
  modifiedAt?: string;
}

export interface SubagentSessionInspection {
  sessionName: string;
  found: boolean;
  status?: SubagentSessionStatus["status"];
  objective?: string;
  resultPreview?: string;
  recommendedActionHint: string;
  currentSessionKey?: string;
  parentSessionKey?: string;
  sessionScope: "current" | "other" | "recorded" | "unknown";
  sessionScopeLabel: string;
  historyBoundaryNote: string;
  createdAt?: string;
  updatedAt?: string;
  ageMs?: number;
  ageLabel?: string;
  elapsedMs?: number;
  elapsedLabel?: string;
  exitCode?: number;
  pid?: number;
  ppid?: number;
  pidState: "alive" | "dead" | "not-applicable" | "unknown";
  statusArtifact: SubagentSessionArtifactSummary;
  sessionArtifact: SubagentSessionArtifactSummary;
  rawStatusJson?: string;
  warnings: string[];
  recentSessionSuggestions: string[];
}

const OBJECTIVE_PREVIEW_LENGTH = 52;
const RECENT_SESSION_SUGGESTION_LIMIT = 5;
const HISTORY_BOUNDARY_NOTE =
  "This view summarizes bounded local subagent artifacts for replay/inspection only; Pi's native session tree remains the live session authority.";

function summarizeObjective(objective?: string): string {
  const normalized = objective?.replace(/\s+/g, " ").trim();
  if (!normalized) return "(objective unavailable)";
  if (normalized.length <= OBJECTIVE_PREVIEW_LENGTH) return normalized;
  return `${normalized.slice(0, OBJECTIVE_PREVIEW_LENGTH - 1)}…`;
}

export function formatAgeLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "now";

  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatElapsedLabel(elapsedMs?: number): string | undefined {
  if (!Number.isFinite(elapsedMs) || typeof elapsedMs !== "number" || elapsedMs < 0) {
    return undefined;
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return seconds > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function describeSessionScope(options: { currentSessionKey?: string; parentSessionKey?: string }): {
  scope: SubagentDashboardRow["sessionScope"];
  label: string;
  badge?: string;
} {
  const currentSessionKey = options.currentSessionKey?.trim();
  const parentSessionKey = options.parentSessionKey?.trim();

  if (parentSessionKey && currentSessionKey) {
    if (parentSessionKey === currentSessionKey) {
      return {
        scope: "current",
        label: `Current live session (${parentSessionKey})`,
        badge: "current",
      };
    }

    return {
      scope: "other",
      label: `Other live session (${parentSessionKey})`,
      badge: "other",
    };
  }

  if (parentSessionKey) {
    return {
      scope: "recorded",
      label: `Recorded under live session ${parentSessionKey}`,
      badge: "recorded",
    };
  }

  return {
    scope: "unknown",
    label: currentSessionKey
      ? "Session linkage unavailable for this artifact"
      : "Live session key unavailable; scope cannot be compared",
  };
}

function recommendedActionHint(status: SubagentSessionStatus["status"]): string {
  switch (status) {
    case "running":
      return "Monitor; avoid duplicate dispatch unless blocked.";
    case "done":
      return "Review outcome and decide whether to resume.";
    case "error":
      return "Inspect failure context before retrying.";
    case "timeout":
      return "Retry with a narrower objective or longer timeout.";
    case "aborted":
      return "Confirm cancellation intent before rerunning.";
    case "abandoned":
      return "Decide whether to resume, rerun, or clean up.";
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

function readStatusArtifact(statusPath: string): {
  parsed?: SubagentSessionStatus;
  raw?: string;
  warning?: string;
} {
  if (!existsSync(statusPath)) {
    return {};
  }

  try {
    const raw = readFileSync(statusPath, "utf-8");
    const parsed = JSON.parse(raw) as SubagentSessionStatus;
    return {
      parsed,
      raw: raw.trim(),
    };
  } catch (error) {
    return {
      warning: `Status sidecar could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function summarizeArtifact(path: string): SubagentSessionArtifactSummary {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
    };
  }

  try {
    const stats = statSync(path);
    return {
      path,
      exists: true,
      bytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  } catch {
    return {
      path,
      exists: true,
    };
  }
}

function sortStatusesByUpdatedAt(statuses: SubagentSessionStatus[]): SubagentSessionStatus[] {
  return statuses
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}

function collectRecentSessionSuggestions(
  statuses: SubagentSessionStatus[],
  requestedName: string,
): string[] {
  const orderedNames = sortStatusesByUpdatedAt(statuses).map((status) => status.sessionName);
  const prefixMatches = orderedNames.filter((name) => name.startsWith(requestedName));
  const remaining = orderedNames.filter(
    (name) => name !== requestedName && !name.startsWith(requestedName),
  );
  return [...prefixMatches, ...remaining].slice(0, RECENT_SESSION_SUGGESTION_LIMIT);
}

interface CreateSubagentDashboardSnapshotOptions {
  limit?: number;
  now?: number;
  currentSessionKey?: string;
  sessionScope?: "all" | "current";
  maxAgeMs?: number;
}

function filterDashboardStatuses(
  statuses: SubagentSessionStatus[],
  options: CreateSubagentDashboardSnapshotOptions,
  now: number,
): SubagentSessionStatus[] {
  const normalizedCurrentSessionKey = options.currentSessionKey?.trim() || undefined;
  const maxAgeMs = options.maxAgeMs;

  if (options.sessionScope === "current" && !normalizedCurrentSessionKey) {
    return [];
  }

  return statuses.filter((status) => {
    if (
      options.sessionScope === "current" &&
      status.parentSessionKey?.trim() !== normalizedCurrentSessionKey
    ) {
      return false;
    }

    if (typeof maxAgeMs === "number") {
      const updatedAtMs = Date.parse(status.updatedAt);
      if (Number.isNaN(updatedAtMs)) {
        return false;
      }
      if (Math.max(0, now - updatedAtMs) > maxAgeMs) {
        return false;
      }
    }

    return true;
  });
}

export function createSubagentDashboardSnapshot(
  sessionsDir: string,
  options: CreateSubagentDashboardSnapshotOptions = {},
): SubagentDashboardSnapshot {
  const statuses = listSubagentSessionStatuses(sessionsDir);
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 5;
  const filteredStatuses = filterDashboardStatuses(statuses, options, now);

  const counts: Record<SubagentSessionStatus["status"], number> = {
    running: 0,
    done: 0,
    error: 0,
    timeout: 0,
    aborted: 0,
    abandoned: 0,
  };

  for (const status of filteredStatuses) {
    counts[status.status] += 1;
  }

  const rows = sortStatusesByUpdatedAt(filteredStatuses)
    .slice(0, limit)
    .map((status) => {
      const updatedAtMs = Date.parse(status.updatedAt);
      const ageMs = Number.isNaN(updatedAtMs) ? 0 : Math.max(0, now - updatedAtMs);
      const sessionScope = describeSessionScope({
        currentSessionKey: options.currentSessionKey,
        parentSessionKey: status.parentSessionKey,
      });
      return {
        sessionName: status.sessionName,
        status: status.status,
        objectivePreview: summarizeObjective(status.objective),
        resultPreview: status.resultPreview,
        recommendedActionHint: recommendedActionHint(status.status),
        sessionScope: sessionScope.scope,
        sessionScopeLabel: sessionScope.label,
        sessionScopeBadge: sessionScope.badge,
        updatedAt: status.updatedAt,
        ageMs,
        ageLabel: formatAgeLabel(ageMs),
      } satisfies SubagentDashboardRow;
    });

  return {
    rows,
    total: filteredStatuses.length,
    counts,
  };
}

export function createSubagentSessionInspection(
  sessionsDir: string,
  sessionName: string,
  options?: { now?: number; currentSessionKey?: string },
): SubagentSessionInspection {
  const now = options?.now ?? Date.now();
  const statusPath = join(sessionsDir, `${sessionName}.status.json`);
  const sessionPath = join(sessionsDir, `${sessionName}.json`);
  const warnings: string[] = [];
  const statuses = listSubagentSessionStatuses(sessionsDir);
  const statusArtifact = summarizeArtifact(statusPath);
  const sessionArtifact = summarizeArtifact(sessionPath);
  const statusRead = readStatusArtifact(statusPath);

  if (statusRead.warning) {
    warnings.push(statusRead.warning);
  }

  const parsedStatus = statusRead.parsed;

  if (!statusArtifact.exists) {
    warnings.push("Missing status sidecar; lifecycle state cannot be classified safely.");
  }

  if (!sessionArtifact.exists) {
    warnings.push("Missing session file; inspect historical traces elsewhere before retrying.");
  }

  let pidState: SubagentSessionInspection["pidState"] = "unknown";
  if (!parsedStatus?.pid) {
    pidState = "unknown";
  } else if (parsedStatus.status !== "running") {
    pidState = "not-applicable";
  } else {
    pidState = processIsAlive(parsedStatus.pid) ? "alive" : "dead";
    if (pidState === "dead") {
      warnings.push(
        "Status says running, but the recorded PID is no longer alive. Reconcile before resuming.",
      );
    }
  }

  const updatedAtMs = parsedStatus?.updatedAt ? Date.parse(parsedStatus.updatedAt) : Number.NaN;
  const ageMs = Number.isNaN(updatedAtMs) ? undefined : Math.max(0, now - updatedAtMs);
  const sessionScope = describeSessionScope({
    currentSessionKey: options?.currentSessionKey,
    parentSessionKey: parsedStatus?.parentSessionKey,
  });

  return {
    sessionName,
    found: statusArtifact.exists || sessionArtifact.exists,
    status: parsedStatus?.status,
    objective: parsedStatus?.objective?.trim() || undefined,
    resultPreview: parsedStatus?.resultPreview?.trim() || undefined,
    recommendedActionHint: parsedStatus
      ? recommendedActionHint(parsedStatus.status)
      : "Inspect artifact paths and recent sessions before retrying.",
    currentSessionKey: options?.currentSessionKey?.trim() || undefined,
    parentSessionKey: parsedStatus?.parentSessionKey?.trim() || undefined,
    sessionScope: sessionScope.scope,
    sessionScopeLabel: sessionScope.label,
    historyBoundaryNote: HISTORY_BOUNDARY_NOTE,
    createdAt: parsedStatus?.createdAt,
    updatedAt: parsedStatus?.updatedAt,
    ageMs,
    ageLabel: typeof ageMs === "number" ? formatAgeLabel(ageMs) : undefined,
    elapsedMs: parsedStatus?.elapsed,
    elapsedLabel: formatElapsedLabel(parsedStatus?.elapsed),
    exitCode: parsedStatus?.exitCode,
    pid: parsedStatus?.pid,
    ppid: parsedStatus?.ppid,
    pidState,
    statusArtifact,
    sessionArtifact,
    rawStatusJson: statusRead.raw,
    warnings,
    recentSessionSuggestions: collectRecentSessionSuggestions(statuses, sessionName),
  };
}
