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
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
}

function readSessionStatus(path: string): SubagentSessionStatus | null {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.sessionName !== "string" ||
      typeof parsed.status !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.ppid !== "number" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as SubagentSessionStatus;
  } catch {
    return null;
  }
}

function reconcileAbandonedSessionStatuses(sessionsDir: string): void {
  if (!existsSync(sessionsDir)) return;

  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const path = join(sessionsDir, f);
    const status = readSessionStatus(path);
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
  mtime: number;
}

function getSessionBaseName(fileName: string): string | null {
  if (fileName.endsWith(".status.json")) return null;
  if (fileName.endsWith(".jsonl")) return fileName.slice(0, -".jsonl".length);
  if (fileName.endsWith(".json")) return fileName.slice(0, -".json".length);
  return null;
}

function getSubagentArtifactPaths(sessionsDir: string): string[] {
  const paths = new Set<string>();

  for (const f of readdirSync(sessionsDir)) {
    if (f.endsWith(".status.json")) {
      const base = f.slice(0, -".status.json".length);
      paths.add(join(sessionsDir, f));
      paths.add(join(sessionsDir, `${base}.jsonl`));
      paths.add(join(sessionsDir, `${base}.json`));
      paths.add(join(sessionsDir, `${base}.lock`));
      continue;
    }

    if (f.endsWith(".lock")) {
      paths.add(join(sessionsDir, f));
    }
  }

  return [...paths].filter((path) => existsSync(path));
}

export function listSubagentSessionStatuses(sessionsDir: string): SubagentSessionStatus[] {
  if (!existsSync(sessionsDir)) return [];

  const statuses: SubagentSessionStatus[] = [];
  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const status = readSessionStatus(join(sessionsDir, f));
    if (status) statuses.push(status);
  }
  return statuses;
}

function getSessionFiles(sessionsDir: string): SessionFileInfo[] {
  if (!existsSync(sessionsDir)) return [];

  const files: SessionFileInfo[] = [];
  for (const f of readdirSync(sessionsDir)) {
    const baseName = getSessionBaseName(f);
    if (!baseName) continue;

    const isNativeJsonl = f.endsWith(".jsonl");
    if (isNativeJsonl && !existsSync(getSessionStatusPath(sessionsDir, baseName))) {
      continue;
    }

    const path = join(sessionsDir, f);
    try {
      const stats = statSync(path);
      files.push({ path, name: f, mtime: stats.mtimeMs });
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

    if (shouldRemove) {
      sessionBasesToRemove.add(file.path.replace(/\.jsonl?$/, ""));
    }
  }

  let removedFiles = 0;
  for (const base of sessionBasesToRemove) {
    for (const path of [`${base}.jsonl`, `${base}.json`, `${base}.lock`, `${base}.status.json`]) {
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
