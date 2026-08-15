// ---
// summary: day-sharded append-only NDJSON telemetry store with rotation, retention, and window reads.
// read_when:
//   - changing telemetry shard layout, size caps, retention, or read windows.
// ---

import { appendFile, mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { TelemetryEvent } from "./events.ts";
import { TELEMETRY_SCHEMA_VERSION } from "./events.ts";

export const TELEMETRY_SHARD_MAX_BYTES = 2 * 1024 * 1024;
export const TELEMETRY_RETENTION_DAYS = 30;
const SHARD_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveTelemetryDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_TELEMETRY_DIR?.trim();
  if (override) return override;
  return path.join(homedir(), ".pi", "agent", "telemetry");
}

function shardNameFor(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shardPathFor(dir: string, timestamp: number): string {
  return path.join(dir, `${shardNameFor(timestamp)}.jsonl`);
}

export async function appendTelemetryEvent(
  dir: string,
  event: TelemetryEvent,
  options: { maxShardBytes?: number; retentionDays?: number; now?: number } = {},
): Promise<void> {
  const maxShardBytes = options.maxShardBytes ?? TELEMETRY_SHARD_MAX_BYTES;
  const retentionDays = options.retentionDays ?? TELEMETRY_RETENTION_DAYS;
  const now = options.now ?? Date.now();

  await mkdir(dir, { recursive: true });
  const shard = shardPathFor(dir, event.ts);
  let rotateSuffix = "";
  try {
    const existing = await stat(shard);
    if (existing.size >= maxShardBytes) {
      rotateSuffix = "-1";
    }
  } catch {
    // First write of the day shard.
  }

  const target = rotateSuffix ? `${shard}${rotateSuffix}` : shard;
  await appendFile(target, `${JSON.stringify(event)}\n`, "utf8");
  await pruneTelemetryShards(dir, retentionDays, now);
}

export async function pruneTelemetryShards(
  dir: string,
  retentionDays: number,
  now = Date.now(),
): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }

  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const day = entry.replace(/-1$/, "").replace(/\.jsonl$/, "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const shardTime = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(shardTime) && shardTime < cutoff) {
      try {
        await unlink(path.join(dir, entry));
        pruned += 1;
      } catch {
        // Best-effort prune.
      }
    }
  }
  return pruned;
}

export async function readTelemetryEvents(
  dir: string,
  windowDays: number,
  now = Date.now(),
): Promise<TelemetryEvent[]> {
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const events: TelemetryEvent[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".jsonl")) continue;
    const day = entry
      .replace(/\.jsonl$/, "")
      .replace(/\.backfill$/, "")
      .replace(/-1$/, "");
    if (!SHARD_DAY_PATTERN.test(day)) continue;
    const shardTime = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(shardTime) && shardTime < cutoff) continue;

    let content: string;
    try {
      content = await readFile(path.join(dir, entry), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as TelemetryEvent;
        if (parsed && parsed.v === TELEMETRY_SCHEMA_VERSION && typeof parsed.kind === "string") {
          if (parsed.ts >= cutoff) events.push(parsed);
        }
      } catch {
        // Skip malformed shard lines; the store is best-effort observability.
      }
    }
  }
  return events.sort((left, right) => left.ts - right.ts);
}
