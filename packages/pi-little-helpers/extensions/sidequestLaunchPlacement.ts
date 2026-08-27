// summary: verifies post-launch session presence and reports Ghostty controller/child placement mismatches.
// read_when:
//   - changing sidequest placement verification, presence discovery, or Ghostty mismatch reporting.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  findGhosttyAncestor,
  type GhosttyAncestor,
  getGhosttySurfaceId,
} from "./sidequestGhostty.ts";

export type SidequestPlacementOptions = {
  env?: NodeJS.ProcessEnv;
  execProvided: boolean;
  processId?: number;
  presenceDir?: string;
  placementVerificationTimeoutMs?: number;
  currentGhosttyAncestor?: GhosttyAncestor;
};

type SessionPresenceRecord = {
  pid?: number;
  cwd?: string;
  windowTitleBase?: string;
  publishedAt?: string;
  ghosttyAncestorPid?: number;
  ghosttyAncestorExe?: string;
  ghosttySurfaceId?: string;
};

function resolvePresenceDir(env: NodeJS.ProcessEnv, options: SidequestPlacementOptions): string {
  if (options.presenceDir) return options.presenceDir;
  const override = env.PI_SESSION_PRESENCE_DIR?.trim();
  if (override) return override;
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) return join(runtimeDir, "pi-session-presence");
  return join(homedir(), ".local", "state", "pi-session-presence");
}

function resolvePlacementVerificationTimeoutMs(
  env: NodeJS.ProcessEnv,
  options: SidequestPlacementOptions,
): number {
  if (typeof options.placementVerificationTimeoutMs === "number") {
    return Math.max(0, options.placementVerificationTimeoutMs);
  }
  const raw = env.PI_SIDEQUEST_PLACEMENT_VERIFY_MS?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return options.execProvided ? 0 : 1800;
}

function readSessionPresenceRecord(filePath: string): SessionPresenceRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SessionPresenceRecord;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function findMatchingPresenceRecord({
  presenceDir,
  cwd,
  titleBase,
  launchedAfterMs,
  controllerPid,
}: {
  presenceDir: string;
  cwd: string;
  titleBase: string;
  launchedAfterMs: number;
  controllerPid: number;
}): SessionPresenceRecord | undefined {
  let entries: string[] = [];
  try {
    entries = readdirSync(presenceDir);
  } catch {
    return undefined;
  }

  const candidates: { record: SessionPresenceRecord; publishedAtMs: number }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const record = readSessionPresenceRecord(join(presenceDir, entry));
    if (!record?.pid || record.pid === controllerPid) continue;
    if (record.cwd !== cwd || record.windowTitleBase !== titleBase) continue;
    if (!existsSync(join("/proc", String(record.pid)))) continue;
    const publishedAtMs = record.publishedAt ? Date.parse(record.publishedAt) : Number.NaN;
    if (Number.isFinite(publishedAtMs) && publishedAtMs < launchedAfterMs - 2000) continue;
    candidates.push({ record, publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : 0 });
  }

  candidates.sort((left, right) => right.publishedAtMs - left.publishedAtMs);
  return candidates[0]?.record;
}

async function waitForMatchingPresenceRecord(options: {
  env: NodeJS.ProcessEnv;
  sidequestOptions: SidequestPlacementOptions;
  cwd: string;
  titleBase: string;
  launchedAfterMs: number;
  controllerPid: number;
}): Promise<SessionPresenceRecord | undefined> {
  const timeoutMs = resolvePlacementVerificationTimeoutMs(options.env, options.sidequestOptions);
  if (timeoutMs <= 0) return undefined;
  const presenceDir = resolvePresenceDir(options.env, options.sidequestOptions);
  const deadline = Date.now() + timeoutMs;
  do {
    const record = findMatchingPresenceRecord({
      presenceDir,
      cwd: options.cwd,
      titleBase: options.titleBase,
      launchedAfterMs: options.launchedAfterMs,
      controllerPid: options.controllerPid,
    });
    if (record) return record;
    await sleep(100);
  } while (Date.now() < deadline);
  return undefined;
}

function formatGhosttyPlacementMismatch({
  controllerGhostty,
  childRecord,
  requestedSurfaceId,
}: {
  controllerGhostty: GhosttyAncestor;
  childRecord: SessionPresenceRecord;
  requestedSurfaceId?: string;
}): string | undefined {
  const childGhosttyPid = childRecord.ghosttyAncestorPid;
  if (!childGhosttyPid || childGhosttyPid === controllerGhostty.pid) return undefined;
  const details = [
    `controller ghostty pid ${controllerGhostty.pid}`,
    `child ghostty pid ${childGhosttyPid}`,
    requestedSurfaceId ? `requested surface ${requestedSurfaceId}` : undefined,
    childRecord.ghosttySurfaceId ? `child surface ${childRecord.ghosttySurfaceId}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return `post-launch placement mismatch: opened in a different Ghostty window (${details.join(", ")})`;
}

export async function detectPostLaunchPlacementMismatch({
  env,
  options,
  cwd,
  titleBase,
  launchMode,
  launchedAfterMs,
}: {
  env: NodeJS.ProcessEnv;
  options: SidequestPlacementOptions;
  cwd: string;
  titleBase: string;
  launchMode: LaunchMode;
  launchedAfterMs: number;
}): Promise<string | undefined> {
  if (launchMode !== "tab") return undefined;
  const controllerPid = options.processId ?? process.pid;
  const controllerGhostty = options.currentGhosttyAncestor ?? findGhosttyAncestor(controllerPid);
  if (!controllerGhostty) return undefined;
  const childRecord = await waitForMatchingPresenceRecord({
    env,
    sidequestOptions: options,
    cwd,
    titleBase,
    launchedAfterMs,
    controllerPid,
  });
  if (!childRecord) return undefined;
  return formatGhosttyPlacementMismatch({
    controllerGhostty,
    childRecord,
    requestedSurfaceId: getGhosttySurfaceId(env),
  });
}
