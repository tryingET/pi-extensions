/**
 * Subagent session management.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

export interface SubagentState {
  sessionsDir: string;
  activeCount: number;
  completedCount: number;
  maxConcurrent: number;
  reservedSessionNames: Set<string>;
}

export interface SessionCleanupOptions {
  maxAgeMs?: number; // Remove sessions older than this
  maxCount?: number; // Keep only the N most recent sessions
}

export interface SubagentSessionStatus {
  sessionName: string;
  status: "running" | "done" | "error" | "timeout" | "aborted" | "abandoned";
  pid: number;
  ppid: number;
  createdAt: string;
  updatedAt: string;
  objective?: string;
  exitCode?: number;
  elapsed?: number;
  parentSessionKey?: string;
  parentRepoRoot?: string;
  resultPreview?: string;
  sessionKind?: "subagent";
  sessionFile?: string;
  profile?: string;
  model?: string;
  tools?: string;
}

const DEFAULT_MAX_CONCURRENT = 5;
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

  return candidate as unknown as SubagentSessionStatus;
}

export function getSessionStatusPath(sessionsDir: string, sessionName: string): string {
  return join(sessionsDir, `${sessionName}.status.json`);
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

export function writeSessionStatus(
  sessionsDir: string,
  sessionName: string,
  status: Omit<SubagentSessionStatus, "sessionName" | "updatedAt">,
): void {
  const path = getSessionStatusPath(sessionsDir, sessionName);
  const payload: SubagentSessionStatus = {
    ...status,
    sessionName,
    updatedAt: new Date().toISOString(),
    sessionKind: "subagent",
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
}

function readSessionStatus(path: string): SubagentSessionStatus | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return parseSubagentSessionStatusPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readMatchingSessionStatus(
  sessionsDir: string,
  sessionName: string,
): SubagentSessionStatus | null {
  const status = readSessionStatus(getSessionStatusPath(sessionsDir, sessionName));
  if (!status || status.sessionName !== sessionName) return null;
  return status;
}

function readLifecycleOwnedSessionStatus(
  sessionsDir: string,
  sessionName: string,
): SubagentSessionStatus | null {
  const status = readMatchingSessionStatus(sessionsDir, sessionName);
  if (!status || status.sessionKind !== "subagent") return null;
  return status;
}

function getExistingSessionArtifactPaths(sessionsDir: string, sessionName: string): string[] {
  return [
    join(sessionsDir, `${sessionName}.jsonl`),
    join(sessionsDir, `${sessionName}.json`),
    join(sessionsDir, `${sessionName}.lock`),
    getSessionStatusPath(sessionsDir, sessionName),
  ].filter((path) => existsSync(path));
}

function reconcileAbandonedSessionStatuses(sessionsDir: string): void {
  if (!existsSync(sessionsDir)) return;

  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const base = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, base);
    if (!status || status.status !== "running") continue;
    if (processIsAlive(status.pid)) continue;

    writeSessionStatus(sessionsDir, status.sessionName, {
      ...status,
      status: "abandoned",
    });
  }
}

export function createSubagentState(
  sessionsDir: string,
  options?: { maxConcurrent?: number },
): SubagentState {
  // Ensure sessions directory exists
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  reconcileAbandonedSessionStatuses(sessionsDir);

  return {
    sessionsDir,
    activeCount: 0,
    completedCount: 0,
    maxConcurrent: options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    reservedSessionNames: new Set(),
  };
}

export function clearSubagentSessions(state: SubagentState): void {
  if (existsSync(state.sessionsDir)) {
    for (const path of getSubagentArtifactPaths(state.sessionsDir)) {
      try {
        unlinkSync(path);
      } catch (err) {
        // Log but don't fail - session cleanup is best-effort
        console.error(`[subagent] Failed to delete session artifact ${basename(path)}:`, err);
      }
    }
  }
  state.completedCount = 0;
  state.reservedSessionNames.clear();
}

interface SessionFileInfo {
  path: string;
  name: string;
  baseName: string;
  mtime: number;
  status: SubagentSessionStatus;
}

function getSubagentArtifactPaths(sessionsDir: string): string[] {
  const paths = new Set<string>();

  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const base = f.slice(0, -".status.json".length);
    if (!readLifecycleOwnedSessionStatus(sessionsDir, base)) continue;

    for (const path of getExistingSessionArtifactPaths(sessionsDir, base)) {
      paths.add(path);
    }
  }

  return [...paths];
}

export function listSubagentSessionStatuses(sessionsDir: string): SubagentSessionStatus[] {
  if (!existsSync(sessionsDir)) return [];

  const statuses: SubagentSessionStatus[] = [];
  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const base = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, base);
    if (status) statuses.push(status);
  }
  return statuses;
}

function getPrimarySessionArtifactPath(sessionsDir: string, sessionName: string): string {
  const jsonlPath = join(sessionsDir, `${sessionName}.jsonl`);
  if (existsSync(jsonlPath)) return jsonlPath;

  const legacyJsonPath = join(sessionsDir, `${sessionName}.json`);
  if (existsSync(legacyJsonPath)) return legacyJsonPath;

  return getSessionStatusPath(sessionsDir, sessionName);
}

function getSessionFiles(sessionsDir: string): SessionFileInfo[] {
  if (!existsSync(sessionsDir)) return [];

  const files: SessionFileInfo[] = [];
  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const baseName = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, baseName);
    if (!status) continue;

    const path = getPrimarySessionArtifactPath(sessionsDir, baseName);
    try {
      const stats = statSync(path);
      files.push({ path, name: basename(path), baseName, mtime: stats.mtimeMs, status });
    } catch {
      // Skip files we can't stat
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime); // Newest first
}

export function cleanupOldSessions(
  state: SubagentState,
  options: SessionCleanupOptions,
): { removedSessions: number; removedFiles: number; kept: number } {
  const files = getSessionFiles(state.sessionsDir);
  const now = Date.now();
  const sessionBasesToRemove = new Set<string>();

  for (const [index, file] of files.entries()) {
    let shouldRemove = false;

    // Check age-based cleanup
    if (options.maxAgeMs && now - file.mtime > options.maxAgeMs) {
      shouldRemove = true;
    }

    // Check count-based cleanup (files are sorted newest first)
    if (options.maxCount && index >= options.maxCount) {
      shouldRemove = true;
    }

    if (shouldRemove && !(file.status.status === "running" && processIsAlive(file.status.pid))) {
      sessionBasesToRemove.add(file.baseName);
    }
  }

  let removedFiles = 0;
  for (const base of sessionBasesToRemove) {
    for (const path of getExistingSessionArtifactPaths(state.sessionsDir, base)) {
      try {
        unlinkSync(path);
        removedFiles++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("ENOENT")) {
          console.error(`[subagent] Failed to delete session file ${path}:`, err);
        }
      }
    }
  }

  return {
    removedSessions: sessionBasesToRemove.size,
    removedFiles,
    kept: Math.max(0, files.length - sessionBasesToRemove.size),
  };
}

export function canSpawnSubagent(state: SubagentState): boolean {
  return state.activeCount < state.maxConcurrent;
}

export interface SubagentExecutionSlotReservation {
  release(): void;
}

export function reserveSubagentExecutionSlot(
  state: SubagentState,
): SubagentExecutionSlotReservation | null {
  if (!canSpawnSubagent(state)) {
    return null;
  }

  state.activeCount += 1;
  let released = false;

  return {
    release() {
      if (released) {
        return;
      }
      released = true;
      state.activeCount = Math.max(0, state.activeCount - 1);
      state.completedCount += 1;
    },
  };
}

export function getSubagentStats(state: SubagentState): {
  active: number;
  completed: number;
  maxConcurrent: number;
  sessionFiles: number;
  oldestSessionAge?: number;
  statusCounts: Record<SubagentSessionStatus["status"], number>;
} {
  const files = getSessionFiles(state.sessionsDir);
  const statuses = listSubagentSessionStatuses(state.sessionsDir);
  const now = Date.now();
  const oldest = files.length > 0 ? files[files.length - 1] : null;
  const statusCounts: Record<SubagentSessionStatus["status"], number> = {
    running: 0,
    done: 0,
    error: 0,
    timeout: 0,
    aborted: 0,
    abandoned: 0,
  };

  for (const status of statuses) {
    statusCounts[status.status]++;
  }

  return {
    active: state.activeCount,
    completed: state.completedCount,
    maxConcurrent: state.maxConcurrent,
    sessionFiles: files.length,
    oldestSessionAge: oldest ? now - oldest.mtime : undefined,
    statusCounts,
  };
}
