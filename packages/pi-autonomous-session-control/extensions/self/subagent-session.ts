/**
 * Subagent session management.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

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

export interface SubagentSessionClearOptions {
  parentSessionKey?: string;
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
  pidStartedAt?: number;
  profile?: string;
  model?: string;
  tools?: string;
}

const DEFAULT_MAX_CONCURRENT = 5;
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

  return candidate as unknown as SubagentSessionStatus;
}

export function getSessionStatusPath(sessionsDir: string, sessionName: string): string {
  return join(sessionsDir, `${sessionName}.status.json`);
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

function runningStatusHasLiveOwner(status: SubagentSessionStatus): boolean {
  if (!processIsAlive(status.pid)) return false;
  if (typeof status.pidStartedAt !== "number") {
    const updatedAtMs = Date.parse(status.updatedAt);
    const ageMs = Date.now() - updatedAtMs;
    return (
      Number.isFinite(updatedAtMs) && ageMs >= 0 && ageMs <= UNVERIFIED_RUNNING_STATUS_GRACE_MS
    );
  }
  return getProcessStartTicks(status.pid) === status.pidStartedAt;
}

export function writeSessionStatus(
  sessionsDir: string,
  sessionName: string,
  status: Omit<SubagentSessionStatus, "sessionName" | "updatedAt">,
  options: { updatedAt?: string } = {},
): void {
  const path = getSessionStatusPath(sessionsDir, sessionName);
  const payload: SubagentSessionStatus = {
    ...status,
    sessionName,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
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

function pathIsWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveContainedSessionPath(
  sessionsDir: string,
  path: unknown,
  options: { requireExisting?: boolean } = {},
): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  const root = resolve(sessionsDir);
  const resolved = resolve(root, trimmed);
  if (!pathIsWithin(root, resolved)) return null;

  try {
    const realRoot = realpathSync(root);
    const realResolved = realpathSync(resolved);
    if (!pathIsWithin(realRoot, realResolved)) return null;
    if (lstatSync(resolved).isSymbolicLink()) return null;
  } catch {
    return options.requireExisting === false ? resolved : null;
  }

  return resolved;
}

function isExpectedSessionTracePath(path: string, sessionName: string): boolean {
  const name = basename(path);
  return name === `${sessionName}.jsonl` || name === `${sessionName}.json`;
}

function getRecordedSessionTracePath(
  sessionsDir: string,
  status: SubagentSessionStatus,
): string | null {
  const recorded = resolveContainedSessionPath(sessionsDir, status.sessionFile);
  if (recorded && isExpectedSessionTracePath(recorded, status.sessionName)) return recorded;

  if (typeof status.sessionFile === "string" && status.sessionFile.trim()) {
    return null;
  }

  const jsonlPath = join(sessionsDir, `${status.sessionName}.jsonl`);
  if (existsSync(jsonlPath)) return jsonlPath;

  const legacyJsonPath = join(sessionsDir, `${status.sessionName}.json`);
  if (existsSync(legacyJsonPath)) return legacyJsonPath;

  return null;
}

function getExistingSessionArtifactPaths(
  sessionsDir: string,
  status: SubagentSessionStatus,
): string[] {
  const paths = new Set<string>();
  const tracePath = getRecordedSessionTracePath(sessionsDir, status);
  if (tracePath && existsSync(tracePath)) paths.add(tracePath);

  const lockPath = join(sessionsDir, `${status.sessionName}.lock`);
  if (existsSync(lockPath)) paths.add(lockPath);

  paths.add(getSessionStatusPath(sessionsDir, status.sessionName));
  return [...paths].filter((path) => existsSync(path));
}

function lockHasAscOwnershipMarker(sessionsDir: string, sessionName: string): boolean {
  try {
    const raw = readFileSync(join(sessionsDir, `${sessionName}.lock`), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed.sessionName === sessionName && parsed.sessionKind === "subagent";
  } catch {
    return false;
  }
}

function reconcileAbandonedSessionStatuses(sessionsDir: string): void {
  if (!existsSync(sessionsDir)) return;

  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const base = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, base);
    if (!status || status.status !== "running") continue;
    if (runningStatusHasLiveOwner(status)) continue;

    writeSessionStatus(
      sessionsDir,
      status.sessionName,
      {
        ...status,
        status: "abandoned",
      },
      { updatedAt: status.updatedAt },
    );
  }
}

function countLiveRunningSessionStatuses(sessionsDir: string): number {
  return listSubagentSessionStatuses(sessionsDir).filter(
    (status) => status.status === "running" && runningStatusHasLiveOwner(status),
  ).length;
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
    activeCount: countLiveRunningSessionStatuses(sessionsDir),
    completedCount: 0,
    maxConcurrent: options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    reservedSessionNames: new Set(),
  };
}

export function clearSubagentSessions(
  state: SubagentState,
  options: SubagentSessionClearOptions = {},
): void {
  if (existsSync(state.sessionsDir)) {
    for (const path of getSubagentArtifactPaths(state.sessionsDir, options)) {
      try {
        unlinkSync(path);
      } catch (err) {
        // Log but don't fail - session cleanup is best-effort
        console.error(`[subagent] Failed to delete session artifact ${basename(path)}:`, err);
      }
    }
  }
  state.activeCount = countLiveRunningSessionStatuses(state.sessionsDir);
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

function statusMatchesClearOptions(
  status: SubagentSessionStatus,
  options: SubagentSessionClearOptions,
): boolean {
  const parentSessionKey = options.parentSessionKey?.trim();
  if (!parentSessionKey) return true;
  return status.parentSessionKey?.trim() === parentSessionKey;
}

function getSubagentArtifactPaths(
  sessionsDir: string,
  options: SubagentSessionClearOptions,
): string[] {
  const paths = new Set<string>();

  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const base = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, base);
    if (!status || !statusMatchesClearOptions(status, options)) continue;
    if (status.status === "running" && runningStatusHasLiveOwner(status)) continue;

    for (const path of getExistingSessionArtifactPaths(sessionsDir, status)) {
      paths.add(path);
    }
  }

  if (!options.parentSessionKey?.trim()) {
    for (const f of readdirSync(sessionsDir)) {
      if (!f.endsWith(".lock")) continue;
      const base = f.slice(0, -".lock".length);
      if (lockHasAscOwnershipMarker(sessionsDir, base)) paths.add(join(sessionsDir, f));
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

function getPrimarySessionArtifactPath(sessionsDir: string, status: SubagentSessionStatus): string {
  return (
    getRecordedSessionTracePath(sessionsDir, status) ??
    getSessionStatusPath(sessionsDir, status.sessionName)
  );
}

function getSessionFiles(sessionsDir: string): SessionFileInfo[] {
  if (!existsSync(sessionsDir)) return [];

  const files: SessionFileInfo[] = [];
  for (const f of readdirSync(sessionsDir)) {
    if (!f.endsWith(".status.json")) continue;
    const baseName = f.slice(0, -".status.json".length);
    const status = readLifecycleOwnedSessionStatus(sessionsDir, baseName);
    if (!status) continue;

    const path = getPrimarySessionArtifactPath(sessionsDir, status);
    try {
      const stats = statSync(path);
      const updatedAtMs = Date.parse(status.updatedAt);
      const lifecycleMtime = Number.isNaN(updatedAtMs) ? stats.mtimeMs : updatedAtMs;
      files.push({
        path,
        name: basename(path),
        baseName,
        mtime: Math.max(stats.mtimeMs, lifecycleMtime),
        status,
      });
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
    if (options.maxAgeMs !== undefined && now - file.mtime > options.maxAgeMs) {
      shouldRemove = true;
    }

    // Check count-based cleanup (files are sorted newest first)
    if (options.maxCount !== undefined && index >= options.maxCount) {
      shouldRemove = true;
    }

    if (
      shouldRemove &&
      !(file.status.status === "running" && runningStatusHasLiveOwner(file.status))
    ) {
      sessionBasesToRemove.add(file.baseName);
    }
  }

  let removedFiles = 0;
  for (const base of sessionBasesToRemove) {
    const status = readLifecycleOwnedSessionStatus(state.sessionsDir, base);
    if (!status) continue;
    for (const path of getExistingSessionArtifactPaths(state.sessionsDir, status)) {
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
