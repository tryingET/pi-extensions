import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRepoRoot } from "./git-snapshot.ts";
import type { GitRunner } from "./types.ts";

const DEFAULT_SOURCE = "asc-rewind";
const DEFAULT_TIMEOUT_MS = 3_000;
const MANIFEST_DIR = join(".git", "pi-rewind", "manifests");
const BOUNDARY_NOTE =
  "ASC owns local rewind execution; Replay Fabric stores bounded recovery history and guidance only.";

export interface ReplayFabricProjectionConfig {
  baseUrl?: string;
  source: string;
  timeoutMs: number;
}

export interface ReplayFabricRecoveryProjectionInput {
  git: GitRunner;
  eventKind: "restore.started" | "restore.completed" | "restore.failed" | "restore.undo";
  sessionId: string;
  checkpointRef: string;
  restoreMode?: string;
  status?: "success" | "failure";
  targetEntryId?: string;
  targetCommitSha?: string;
  undoCommitSha?: string;
  failureReason?: string;
}

function sanitizeChunk(value: string, max = 48): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) {
    return "item";
  }
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max);
}

function toPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.trunc(parsed);
}

export function getReplayFabricProjectionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ReplayFabricProjectionConfig {
  const baseUrl =
    env.ASC_REWIND_REPLAY_FABRIC_URL?.trim() || env.REPLAY_FABRIC_URL?.trim() || undefined;
  const source = env.ASC_REWIND_REPLAY_FABRIC_SOURCE?.trim() || DEFAULT_SOURCE;
  const timeoutMs =
    toPositiveInteger(env.ASC_REWIND_REPLAY_FABRIC_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;

  return {
    baseUrl,
    source,
    timeoutMs,
  };
}

export function buildRewindCorrelationId(sessionId: string): string {
  return `asc-rewind:${sessionId}`;
}

export function buildRewindCheckpointRef(options: {
  sessionId: string;
  targetEntryId?: string;
  targetCommitSha?: string;
  mode: string;
}): string {
  const mode = sanitizeChunk(options.mode, 24);
  const entryChunk = options.targetEntryId
    ? sanitizeChunk(options.targetEntryId)
    : options.targetCommitSha
      ? sanitizeChunk(options.targetCommitSha.slice(0, 12))
      : "current";
  return `asc-rewind/${sanitizeChunk(options.sessionId, 24)}/${mode}/${entryChunk}`;
}

async function writeRecoveryManifest(
  repoRoot: string,
  config: ReplayFabricProjectionConfig,
  input: ReplayFabricRecoveryProjectionInput,
): Promise<string> {
  const manifestDir = join(repoRoot, MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${sanitizeChunk(input.eventKind, 24)}-${timestamp}.json`;
  const relativePath = join(MANIFEST_DIR, fileName);
  const absolutePath = join(repoRoot, relativePath);

  const manifest = {
    source: config.source,
    eventKind: input.eventKind,
    checkpointRef: input.checkpointRef,
    restoreMode: input.restoreMode ?? null,
    sessionId: input.sessionId,
    correlationId: buildRewindCorrelationId(input.sessionId),
    status: input.status ?? null,
    targetEntryId: input.targetEntryId ?? null,
    targetCommitSha: input.targetCommitSha ?? null,
    undoCommitSha: input.undoCommitSha ?? null,
    failureReason: input.failureReason ?? null,
    boundary: BOUNDARY_NOTE,
    recordedAt: new Date().toISOString(),
  };

  await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return relativePath.replace(/\\/g, "/");
}

async function postRecoveryMilestone(
  baseUrl: string,
  timeoutMs: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("/api/milestones/recovery", baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Replay Fabric responded with ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function projectRecoveryMilestoneIfConfigured(
  input: ReplayFabricRecoveryProjectionInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = getReplayFabricProjectionConfig(env);
  if (!config.baseUrl) {
    return;
  }

  const repoRoot = await getRepoRoot(input.git);
  const artifactRef = await writeRecoveryManifest(repoRoot, config, input);
  await postRecoveryMilestone(config.baseUrl, config.timeoutMs, {
    eventKind: input.eventKind,
    source: config.source,
    sessionId: input.sessionId,
    checkpointRef: input.checkpointRef,
    restoreMode: input.restoreMode,
    correlationId: buildRewindCorrelationId(input.sessionId),
    status: input.status,
    artifactRef,
    metadata: {
      guidanceOnly: true,
      boundary: BOUNDARY_NOTE,
      targetEntryId: input.targetEntryId,
      targetCommitSha: input.targetCommitSha,
      undoCommitSha: input.undoCommitSha,
      failureReason: input.failureReason,
    },
  });
}
