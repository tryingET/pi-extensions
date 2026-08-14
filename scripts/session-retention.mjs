#!/usr/bin/env node
// Session storage archival for ~/.pi/agent/sessions.
//
// POLICY: session JSONL is retained data (training corpus + session history).
// This tool NEVER deletes content. It compresses old session files into
// verifiable archives and removes the originals ONLY after the archive entry
// round-trips byte-for-byte. Original bytes remain fully recoverable from the
// archive (plain zstd frames, no solid compression across files).
//
// Modes:
//   (default)          dry-run: report what --apply would archive
//   --apply            archive files older than the window, then remove originals
//   --older-than DAYS  window (default 365, minimum 30)
//   --archive-dir DIR  archive root (default ~/.pi/agent/sessions-archive)
//   --restore FILE     restore one archived file back into place
//   --list             list archive contents
//   --json             machine-readable report
//
// Exit codes: 0 ok, 1 nothing to do / not found, 2 tool failure.

import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const apply = args.includes("--apply");
const restoreIdx = args.indexOf("--restore");
const archiveDirArg = args.indexOf("--archive-dir");
const olderThanIdx = args.indexOf("--older-than");

const SESSIONS_DIR = resolve(homedir(), ".pi/agent/sessions");
const ARCHIVE_DIR =
  archiveDirArg >= 0 ? resolve(args[archiveDirArg + 1]) : resolve(homedir(), ".pi/agent/sessions-archive");
const MANIFEST = join(ARCHIVE_DIR, "manifest.jsonl");

function argDays() {
  if (olderThanIdx < 0) return 365;
  const days = Number(args[olderThanIdx + 1]);
  if (!Number.isFinite(days) || days < 30) {
    console.error("session-archival: --older-than must be >= 30 days");
    process.exit(2);
  }
  return days;
}

function zstd(argsList, opts = {}) {
  const run = spawnSync("zstd", argsList, { encoding: "buffer", ...opts });
  if (run.status !== 0) {
    console.error(`session-archival: zstd ${argsList.join(" ")} failed (exit ${run.status})`);
    process.exit(2);
  }
  return run;
}

function requireZstd() {
  const check = spawnSync("zstd", ["--version"], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error("session-archival: zstd is required but not available on PATH");
    process.exit(2);
  }
}

function loadManifest() {
  if (!existsSync(MANIFEST)) return [];
  return readFileSync(MANIFEST, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendManifest(entry) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(entry) + "\n", { flag: "a" });
}

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

// --- restore / list modes ---
if (restoreIdx >= 0) {
  requireZstd();
  const wanted = resolve(args[restoreIdx + 1]);
  const entry = loadManifest().find((e) => e.original === wanted || e.original.endsWith(args[restoreIdx + 1]));
  if (!entry) {
    console.error(`session-archival: no archive entry for ${args[restoreIdx + 1]}`);
    process.exit(1);
  }
  const run = zstd(["-d", "-c", entry.archivePath], { maxBuffer: 1024 * 1024 * 1024 });
  mkdirSync(dirname(entry.original), { recursive: true });
  writeFileSync(entry.original, run.stdout);
  chmodSync(entry.original, 0o600);
  utimesSync(entry.original, entry.mtime / 1000, entry.mtime / 1000);
  const restored = statSync(entry.original);
  if (restored.size !== entry.bytes || restored.mtimeMs !== entry.mtime) {
    console.error("session-archival: restore size/mtime mismatch — archive integrity suspect");
    process.exit(2);
  }
  console.log(`restored: ${entry.original} (${human(entry.bytes)})`);
  process.exit(0);
}

if (args.includes("--list")) {
  const entries = loadManifest();
  for (const entry of entries.slice(-50)) {
    console.log(`${entry.archivedAt}  ${human(entry.originalBytes ?? entry.bytes ?? 0).padStart(9)}  ${entry.original}`);
  }
  console.log(`total archived: ${entries.length}`);
  process.exit(0);
}

// --- archive mode ---
requireZstd();
const olderThanDays = argDays();
const cutoff = Date.now() - olderThanDays * 86_400_000;

const candidates = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walk(child);
      continue;
    }
    if (!entry.isFile() || !child.endsWith(".jsonl")) continue;
    const stat = statSync(child);
    if (stat.mtimeMs < cutoff) candidates.push({ path: child, stat });
  }
}
if (existsSync(SESSIONS_DIR)) walk(SESSIONS_DIR);

const alreadyArchived = new Set(loadManifest().map((e) => e.original));
const pending = candidates.filter((c) => !alreadyArchived.has(c.path));
const pendingBytes = pending.reduce((acc, c) => acc + c.stat.size, 0);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        apply,
        olderThanDays,
        archiveDir: ARCHIVE_DIR,
        pendingFiles: pending.length,
        pendingBytes,
        archivedAlready: alreadyArchived.size,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `session-archival: ${apply ? "APPLY" : "dry-run"} window=${olderThanDays}d pending=${pending.length} files (${human(pendingBytes)}); ${alreadyArchived.size} already archived`,
  );
  console.log(`  archive: ${ARCHIVE_DIR}`);
  console.log("  policy: content is never deleted; originals removed only after verified decompression");
}

if (!apply || pending.length === 0) process.exit(pending.length === 0 ? 1 : 0);

let archived = 0;
let archivedBytes = 0;
let removed = 0;
for (const candidate of pending) {
  const relPath = relative(SESSIONS_DIR, candidate.path);
  const archivePath = join(ARCHIVE_DIR, "zst", `${relPath}.zst`);
  mkdirSync(dirname(archivePath), { recursive: true });

  // Compress (long mode for JSONL), then verify byte-for-byte round-trip
  // before the original is ever removed.
  const compressed = zstd(["-19", "--long=27", "-c", candidate.path], { maxBuffer: 2 * 1024 * 1024 * 1024 });
  writeFileSync(archivePath, compressed.stdout);
  chmodSync(archivePath, 0o600);

  const verify = spawnSync("zstd", ["-d", "-c", archivePath], { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 * 1024 });
  const original = readFileSync(candidate.path);
  if (verify.status !== 0 || Buffer.compare(verify.stdout, original) !== 0) {
    console.error(`  VERIFY FAILED, keeping original: ${candidate.path}`);
    continue;
  }

  appendManifest({
    original: candidate.path,
    archivePath,
    bytes: candidate.stat.size,
    mtime: candidate.stat.mtimeMs,
    originalBytes: candidate.stat.size,
    sha256: null,
    archivedAt: new Date().toISOString(),
  });
  unlinkSync(candidate.path);
  archived += 1;
  archivedBytes += candidate.stat.size;
  removed += 1;
}
console.log(`  archived+verified+removed: ${archived} files (${human(archivedBytes)})`);
