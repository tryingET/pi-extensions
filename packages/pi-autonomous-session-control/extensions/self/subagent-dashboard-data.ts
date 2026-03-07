import { listSubagentSessionStatuses, type SubagentSessionStatus } from "./subagent-session.ts";

export interface SubagentDashboardRow {
  sessionName: string;
  status: SubagentSessionStatus["status"];
  objectivePreview: string;
  recommendedActionHint: string;
  updatedAt: string;
  ageMs: number;
  ageLabel: string;
}

export interface SubagentDashboardSnapshot {
  rows: SubagentDashboardRow[];
  total: number;
  counts: Record<SubagentSessionStatus["status"], number>;
}

const OBJECTIVE_PREVIEW_LENGTH = 52;

function summarizeObjective(objective?: string): string {
  const normalized = objective?.replace(/\s+/g, " ").trim();
  if (!normalized) return "(objective unavailable)";
  if (normalized.length <= OBJECTIVE_PREVIEW_LENGTH) return normalized;
  return `${normalized.slice(0, OBJECTIVE_PREVIEW_LENGTH - 1)}…`;
}

function formatAgeLabel(ageMs: number): string {
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
    case "abandoned":
      return "Decide whether to resume, rerun, or clean up.";
  }
}

export function createSubagentDashboardSnapshot(
  sessionsDir: string,
  options?: { limit?: number; now?: number },
): SubagentDashboardSnapshot {
  const statuses = listSubagentSessionStatuses(sessionsDir);
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? 5;

  const counts: Record<SubagentSessionStatus["status"], number> = {
    running: 0,
    done: 0,
    error: 0,
    timeout: 0,
    abandoned: 0,
  };

  for (const status of statuses) {
    counts[status.status] += 1;
  }

  const rows = statuses
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
    .map((status) => {
      const updatedAtMs = Date.parse(status.updatedAt);
      const ageMs = Number.isNaN(updatedAtMs) ? 0 : Math.max(0, now - updatedAtMs);
      return {
        sessionName: status.sessionName,
        status: status.status,
        objectivePreview: summarizeObjective(status.objective),
        recommendedActionHint: recommendedActionHint(status.status),
        updatedAt: status.updatedAt,
        ageMs,
        ageLabel: formatAgeLabel(ageMs),
      } satisfies SubagentDashboardRow;
    });

  return {
    rows,
    total: statuses.length,
    counts,
  };
}
