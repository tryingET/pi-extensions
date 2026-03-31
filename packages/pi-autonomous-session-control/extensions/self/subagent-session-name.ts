import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SessionNameReservation {
  sessionName: string;
  release: () => void;
}

interface SessionLockPayload {
  pid: number;
  ppid: number;
  sessionName: string;
  createdAt: string;
}

/**
 * Reserve a unique subagent session name.
 *
 * Mechanisms:
 * - in-memory reservation for concurrent calls in the same process
 * - optional file-lock reservation for concurrent calls across processes
 * - stale lock reclamation for abruptly terminated parent processes
 */

const DEFAULT_LOCK_STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

function normalizeSessionName(raw: string): string {
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return safe.length > 0 ? safe : "subagent";
}

function getLockPath(sessionName: string, sessionsDir: string): string {
  return join(sessionsDir, `${sessionName}.lock`);
}

function getSessionJsonPath(sessionName: string, sessionsDir: string): string {
  return join(sessionsDir, `${sessionName}.json`);
}

function getSessionStatusPath(sessionName: string, sessionsDir: string): string {
  return join(sessionsDir, `${sessionName}.status.json`);
}

function sessionArtifactExists(sessionName: string, sessionsDir: string): boolean {
  return (
    existsSync(getSessionJsonPath(sessionName, sessionsDir)) ||
    existsSync(getSessionStatusPath(sessionName, sessionsDir))
  );
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

function readLockPayload(lockPath: string): SessionLockPayload | null {
  try {
    const raw = readFileSync(lockPath, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.pid !== "number" ||
      typeof parsed.ppid !== "number" ||
      typeof parsed.sessionName !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    return parsed as SessionLockPayload;
  } catch {
    return null;
  }
}

function staleAfterMs(): number {
  const env = process.env.PI_SUBAGENT_LOCK_STALE_AFTER_MS?.trim();
  if (!env) return DEFAULT_LOCK_STALE_AFTER_MS;
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LOCK_STALE_AFTER_MS;
}

function lockIsStale(lockPath: string, payload: SessionLockPayload | null): boolean {
  if (!existsSync(lockPath)) return false;
  if (!payload) return true;
  if (payload.pid && processIsAlive(payload.pid)) return false;
  if (payload.pid && !processIsAlive(payload.pid)) return true;

  const createdAtMs = Date.parse(payload.createdAt);
  if (Number.isNaN(createdAtMs)) return true;
  return Date.now() - createdAtMs > staleAfterMs();
}

function tryRemoveStaleLock(lockPath: string): boolean {
  const payload = readLockPayload(lockPath);
  if (!lockIsStale(lockPath, payload)) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function formatFsError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function acquireSessionNameLock(sessionName: string, sessionsDir: string): (() => void) | null {
  const lockPath = getLockPath(sessionName, sessionsDir);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        const payload: SessionLockPayload = {
          pid: process.pid,
          ppid: process.ppid,
          sessionName,
          createdAt: new Date().toISOString(),
        };
        writeFileSync(fd, JSON.stringify(payload), "utf-8");
      } catch (error) {
        try {
          closeSync(fd);
        } catch {
          // Best effort cleanup.
        }
        try {
          unlinkSync(lockPath);
        } catch {
          // Best effort cleanup.
        }
        throw error;
      }
      closeSync(fd);

      return () => {
        try {
          unlinkSync(lockPath);
        } catch {
          // Best effort cleanup.
        }
      };
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as NodeJS.ErrnoException).code || "")
          : "";

      if (errorCode !== "EEXIST") {
        throw new Error(`Failed to create session lock '${lockPath}': ${formatFsError(error)}`);
      }

      if (!tryRemoveStaleLock(lockPath)) {
        return null;
      }
    }
  }

  return null;
}

export function reserveUniqueSessionName(
  baseName: string,
  sessionsDir: string,
  reservedSessionNames: Set<string>,
  options: {
    useInMemoryReservation: boolean;
    useFileLockReservation: boolean;
  },
): SessionNameReservation {
  const normalized = normalizeSessionName(baseName);
  let candidate = normalized;
  let suffix = 0;

  while (true) {
    if (
      (options.useInMemoryReservation && reservedSessionNames.has(candidate)) ||
      sessionArtifactExists(candidate, sessionsDir)
    ) {
      suffix++;
      const suffixStr = `-${suffix}`;
      candidate = `${normalized.slice(0, 80 - suffixStr.length)}${suffixStr}`;
      continue;
    }

    let releaseLock: (() => void) | null = null;
    if (options.useFileLockReservation) {
      releaseLock = acquireSessionNameLock(candidate, sessionsDir);
      if (!releaseLock) {
        suffix++;
        const suffixStr = `-${suffix}`;
        candidate = `${normalized.slice(0, 80 - suffixStr.length)}${suffixStr}`;
        continue;
      }
    }

    if (options.useInMemoryReservation) {
      reservedSessionNames.add(candidate);
    }

    return {
      sessionName: candidate,
      release: () => {
        if (options.useInMemoryReservation) {
          reservedSessionNames.delete(candidate);
        }
        releaseLock?.();
      },
    };
  }
}
