#!/usr/bin/env node
// Session storage retention for ~/.pi/agent/sessions.
//
// Pi session JSONL is not canonical authority (AK is), but it is the only
// record of full session content, so this policy is conservative:
//   - default retention window is 365 days
//   - dry-run by default; --apply required to delete
//   - --keep-per-day N additionally keeps the newest N files per day for days
//     inside the window (not implemented; reserved for future pruning)
//
// Usage:
//   node scripts/session-retention.mjs                    # dry-run, 365d
//   node scripts/session-retention.mjs --older-than 180   # dry-run, 180d
//   node scripts/session-retention.mjs --apply            # delete
//   node scripts/session-retention.mjs --json

import { readdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const apply = args.includes("--apply");
const olderThanIndex = args.indexOf("--older-than");
const olderThanDays = olderThanIndex >= 0 ? Number(args[olderThanIndex + 1]) : 365;
if (!Number.isFinite(olderThanDays) || olderThanDays < 30) {
  console.error("session-retention: --older-than must be >= 30 days");
  process.exit(2);
}

const sessionsDir = resolve(homedir(), ".pi/agent/sessions");
if (!existsSync(sessionsDir)) {
  console.error(`session-retention: no sessions dir at ${sessionsDir}`);
  process.exit(2);
}

const cutoff = Date.now() - olderThanDays * 86_400_000;
const buckets = { del: [], keep: [] };
let totalBytes = 0;
let deleteBytes = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walk(child);
      continue;
    }
    if (!entry.isFile()) continue;
    let stat;
    try {
      stat = statSync(child);
    } catch {
      continue;
    }
    totalBytes += stat.size;
    if (stat.mtimeMs < cutoff) {
      buckets.del.push({ path: child, bytes: stat.size, mtime: stat.mtimeMs });
      deleteBytes += stat.size;
    } else {
      buckets.keep.push(child);
    }
  }
}
walk(sessionsDir);

function human(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)}${units[unit]}`;
}

const oldest = buckets.del.length
  ? new Date(Math.min(...buckets.del.map((f) => f.mtime))).toISOString().slice(0, 10)
  : null;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        apply,
        olderThanDays,
        totalFiles: buckets.del.length + buckets.keep.length,
        deleteFiles: buckets.del.length,
        deleteBytes,
        totalBytes,
        oldestDeletable: oldest,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `session-retention: ${apply ? "APPLY" : "dry-run"} window=${olderThanDays}d files=${buckets.del.length + buckets.keep.length} (${human(totalBytes)})`,
  );
  console.log(
    `  would delete: ${buckets.del.length} files (${human(deleteBytes)}), oldest ${oldest ?? "n/a"}`,
  );
}

if (apply) {
  let deleted = 0;
  let failed = 0;
  for (const file of buckets.del) {
    try {
      unlinkSync(file.path);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  console.log(`  deleted: ${deleted}${failed > 0 ? `, failed: ${failed}` : ""}`);
}
