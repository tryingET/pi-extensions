// ---
// summary: derives telemetry events from persisted session JSONL into backfill shards (idempotent, pre-live-cutoff only).
// read_when:
//   - changing historical backfill derivation, the live/backfill overlap guard, or backfill shard naming.
// ---

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  deriveErrorSignature,
  normalizeSkillName,
  normalizeToolName,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEvent,
} from "./events.ts";

interface PendingToolCall {
  tool: string;
  skill?: string;
}

import { resolveTelemetryDir } from "./store.ts";

const SKILL_PATH_PATTERN = /(^|\/)([^/]+)\/SKILL\.md$/u;

export interface BackfillOptions {
  sessionsDir?: string;
  telemetryDir?: string;
  days?: number;
  force?: boolean;
  now?: number;
}

export interface BackfillResult {
  filesScanned: number;
  filesBackfilled: number;
  filesSkippedAlreadyBackfilled: number;
  filesSkippedLiveOverlap: number;
  events: number;
  byKind: Array<{ kind: string; n: number }>;
  shardDays: string[];
}

export function resolveSessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_TELEMETRY_SESSIONS_DIR?.trim();
  if (override) return override;
  return path.join(homedir(), ".pi", "agent", "sessions");
}

/**
 * Derive telemetry from persisted session JSONL into `<day>.backfill.jsonl` shards.
 *
 * Derivation rules (honest coverage):
 * - compaction: from compaction entries (tokensBefore, summary chars, fromHook).
 * - tool_call: from toolResult messages (name, isError, error signature). Durations are
 *   not reconstructible and are omitted.
 * - skill_load: from read tool calls whose path matches `<skill>/SKILL.md`.
 * - turn: from user messages.
 * - follow_up / vault_query / subagent / compaction_failure / compaction_begin are live-only
 *   kinds: they leave no complete artifact in session JSONL and are never backfilled.
 *
 * Overlap guard: sessions whose newest entry timestamp is at/after the first live shard
 * event are skipped (the live collector already covers them), unless force is set.
 */
export async function backfillSessionsTelemetry(
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const now = options.now ?? Date.now();
  const days = Math.min(90, Math.max(1, options.days ?? 30));
  const sessionsDir = options.sessionsDir ?? resolveSessionsDir();
  const telemetryDir = options.telemetryDir ?? resolveTelemetryDir();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  const liveCutoff = options.force
    ? Number.POSITIVE_INFINITY
    : await firstLiveEventTimestamp(telemetryDir);

  const repoDirs = await listSessionDirs(sessionsDir);
  const eventsByDay = new Map<string, TelemetryEvent[]>();
  const result: BackfillResult = {
    filesScanned: 0,
    filesBackfilled: 0,
    filesSkippedAlreadyBackfilled: 0,
    filesSkippedLiveOverlap: 0,
    events: 0,
    byKind: [],
    shardDays: [],
  };

  for (const file of await listSessionFiles(repoDirs, now, days)) {
    result.filesScanned += 1;

    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const derived: TelemetryEvent[] = [];
    const pendingCalls = new Map<string, PendingToolCall>();
    let newestTs = 0;
    let sessionId: string | undefined;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const ts = entryTimestamp(entry);
      if (ts > newestTs) newestTs = ts;
      if (entry.type === "session") sessionId = typeof entry.id === "string" ? entry.id : sessionId;
      if (!ts || ts < cutoff) continue;

      if (entry.type === "compaction") {
        derived.push({
          v: TELEMETRY_SCHEMA_VERSION,
          kind: "compaction",
          ts,
          source: "backfill",
          ...(sessionId ? { sessionId } : {}),
          reason: "backfilled",
          willRetry: false,
          fromExtension: entry.fromHook === true,
          ...(typeof entry.tokensBefore === "number" ? { tokensBefore: entry.tokensBefore } : {}),
          ...(typeof entry.summary === "string" ? { summaryChars: entry.summary.length } : {}),
        });
        continue;
      }

      if (entry.type !== "message") continue;
      const message = (entry as { message?: Record<string, unknown> }).message;
      if (!message || typeof message !== "object") continue;
      const messageTs = typeof message.timestamp === "number" ? message.timestamp : ts;
      const role = message.role;

      if (role === "assistant" && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (
            !block ||
            typeof block !== "object" ||
            (block as { type?: string }).type !== "toolCall"
          )
            continue;
          const callBlock = block as { id?: unknown; name?: unknown; arguments?: unknown };
          if (typeof callBlock.id !== "string") continue;
          const tool = normalizeToolName(callBlock.name);
          const args = (callBlock.arguments ?? {}) as Record<string, unknown>;
          const rawPath = typeof args.path === "string" ? args.path : undefined;
          const skillMatch = rawPath ? SKILL_PATH_PATTERN.exec(rawPath) : null;
          pendingCalls.set(callBlock.id, {
            tool,
            ...(skillMatch ? { skill: normalizeSkillName(skillMatch[2]) } : {}),
          });
        }
        continue;
      }

      if (role === "user") {
        derived.push({
          v: TELEMETRY_SCHEMA_VERSION,
          kind: "turn",
          ts: messageTs,
          source: "backfill",
          ...(sessionId ? { sessionId } : {}),
          index: -1,
        });
        continue;
      }

      if (role === "toolResult") {
        const ok = message.isError !== true;
        const pending =
          typeof message.toolCallId === "string" ? pendingCalls.get(message.toolCallId) : undefined;
        if (typeof message.toolCallId === "string") pendingCalls.delete(message.toolCallId);
        if (pending?.skill) {
          derived.push({
            v: TELEMETRY_SCHEMA_VERSION,
            kind: "skill_load",
            ts: messageTs,
            source: "backfill",
            ...(sessionId ? { sessionId } : {}),
            skill: pending.skill,
          });
        }
        derived.push({
          v: TELEMETRY_SCHEMA_VERSION,
          kind: "tool_call",
          ts: messageTs,
          source: "backfill",
          ...(sessionId ? { sessionId } : {}),
          tool: normalizeToolName(message.toolName),
          ok,
          ...(ok
            ? {}
            : { errorSignature: deriveErrorSignature(message.content) ?? "unknown error" }),
        });
      }
    }

    if (newestTs === 0) continue;
    if (newestTs >= liveCutoff) {
      result.filesSkippedLiveOverlap += 1;
      continue;
    }

    const shard = backfillShardMarkerFor(telemetryDir, file);
    if (!options.force && (await exists(shard))) {
      result.filesSkippedAlreadyBackfilled += 1;
      continue;
    }

    if (derived.length > 0) {
      for (const event of derived) {
        const day = new Date(event.ts).toISOString().slice(0, 10);
        const bucket = eventsByDay.get(day) ?? [];
        bucket.push(event);
        eventsByDay.set(day, bucket);
      }
    }
    await mkdir(path.dirname(shard), { recursive: true });
    await writeFile(shard, `${JSON.stringify({ file })}\n`, "utf8");
    result.filesBackfilled += 1;
  }

  const kindCounts = new Map<string, number>();
  await mkdir(telemetryDir, { recursive: true });
  for (const [day, events] of eventsByDay) {
    const shardPath = path.join(telemetryDir, `${day}.backfill.jsonl`);
    const existing = await exists(shardPath);
    const previous = existing ? await readFile(shardPath, "utf8") : "";
    const merged = `${previous}${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    await writeFile(shardPath, merged, "utf8");
    result.shardDays.push(day);
    for (const event of events) {
      kindCounts.set(event.kind, (kindCounts.get(event.kind) ?? 0) + 1);
      result.events += 1;
    }
  }

  result.byKind = [...kindCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([kind, n]) => ({ kind, n }));
  result.shardDays.sort();
  return result;
}

function entryTimestamp(entry: Record<string, unknown>): number {
  const raw = entry.timestamp;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function firstLiveEventTimestamp(telemetryDir: string): Promise<number> {
  let earliest = Number.POSITIVE_INFINITY;
  let entries: string[];
  try {
    entries = await readdir(telemetryDir);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") || entry.endsWith(".backfill.jsonl")) continue;
    let content: string;
    try {
      content = await readFile(path.join(telemetryDir, entry), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as TelemetryEvent;
        if (parsed.v === TELEMETRY_SCHEMA_VERSION && typeof parsed.ts === "number") {
          if (parsed.source === "backfill") continue;
          earliest = Math.min(earliest, parsed.ts);
        }
      } catch {
        // Ignore malformed lines; earliest live event is a lower bound guard.
      }
    }
  }
  return earliest;
}

function backfillShardMarkerFor(telemetryDir: string, sessionFile: string): string {
  const base = path.basename(sessionFile, ".jsonl").replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(telemetryDir, "backfill-done", `${base}.done`);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function listSessionDirs(sessionsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(sessionsDir, entry.name));
  } catch {
    return [];
  }
}

async function listSessionFiles(dirs: string[], now: number, days: number): Promise<string[]> {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const files: string[] = [];
  for (const dir of dirs) {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const file = path.join(dir, entry.name);
      try {
        const info = await stat(file);
        if (info.mtimeMs >= cutoff) files.push(file);
      } catch {
        // Skip unreadable files.
      }
    }
  }
  return files.sort();
}
