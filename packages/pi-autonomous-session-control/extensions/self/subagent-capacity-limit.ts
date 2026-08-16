import { randomUUID } from "node:crypto";
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getCapacityLimitPath } from "./subagent-capacity-record.ts";
import { getProcessStartTicks } from "./subagent-session.ts";

interface CapacityLimitPayload {
  kind: "asc.subagent_capacity_limit.v1";
  maxConcurrent: number;
  createdAt: string;
}

export function ensureSharedSubagentCapacityLimit(
  sessionsDir: string,
  maxConcurrent: number,
): boolean {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0) return false;
  const path = getCapacityLimitPath(sessionsDir);
  const existing = readCapacityLimit(path);
  if (existing) return existing.maxConcurrent === maxConcurrent;
  if (existsSync(path)) return false;

  const pidStartedAt = getProcessStartTicks(process.pid);
  if (pidStartedAt === null) return false;
  const payload: CapacityLimitPayload = {
    kind: "asc.subagent_capacity_limit.v1",
    maxConcurrent,
    createdAt: new Date().toISOString(),
  };
  if (tryPublishCapacityLimit(path, payload, pidStartedAt)) return true;
  return readCapacityLimit(path)?.maxConcurrent === maxConcurrent;
}

function readCapacityLimit(path: string): CapacityLimitPayload | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CapacityLimitPayload>;
    return parsed.kind === "asc.subagent_capacity_limit.v1" &&
      Number.isSafeInteger(parsed.maxConcurrent) &&
      (parsed.maxConcurrent as number) > 0 &&
      typeof parsed.createdAt === "string" &&
      Number.isFinite(Date.parse(parsed.createdAt))
      ? (parsed as CapacityLimitPayload)
      : undefined;
  } catch {
    return undefined;
  }
}

function tryPublishCapacityLimit(
  path: string,
  payload: CapacityLimitPayload,
  pidStartedAt: number,
): boolean {
  const publishPath = `${path}.publish-${process.pid}-${pidStartedAt}-${randomUUID()}`;
  try {
    writeFileSync(publishPath, JSON.stringify(payload), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    try {
      linkSync(publishPath, path);
      return true;
    } catch (error) {
      if (getErrorCode(error) === "EEXIST") return false;
      throw error;
    }
  } finally {
    try {
      unlinkSync(publishPath);
    } catch {
      // A published hard link remains; a failed staging name has no contested-path effect.
    }
  }
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}
