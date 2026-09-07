// ---
// summary: "binds a running Codex process to its session thread and rollout file"
// read_when:
//   - "changing Codex session identification or its thread-index reader"
// ---

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireBuiltin = createRequire(import.meta.url);

/**
 * Codex keeps an index of its sessions in a versioned SQLite database under its home, one row per
 * thread with the rollout path, working directory and title. It only opens the rollout once a task
 * runs, so the index is what links a live process to its session before any work starts.
 */

export const CODEX_STATE_DB = /^state_(\d+)\.sqlite$/;
export const CODEX_THREAD_LIMIT = 400;
/** A thread is created moments after its process starts; allow for clock and rounding slack. */
export const CODEX_THREAD_START_SLACK_MS = 5000;

/** @typedef {{id: string; rolloutPath: string; cwd: string; title: string; createdAtMs: number; updatedAtMs: number}} CodexThread */

/**
 * Newest thread-index database in a Codex home. The suffix is a schema version, so the highest one
 * is current; a home with none yields "".
 * @param {string} codexHome
 * @param {Pick<typeof fs, "readdirSync">} [fsImpl]
 */
export function resolveCodexStateDb(codexHome, fsImpl = fs) {
  let best = { version: -1, file: "" };
  let entries = [];
  try {
    entries = fsImpl.readdirSync(codexHome);
  } catch {
    return "";
  }
  for (const entry of entries) {
    const match = CODEX_STATE_DB.exec(entry);
    if (!match) continue;
    const version = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(version) && version > best.version) best = { version, file: entry };
  }
  return best.file ? path.join(codexHome, best.file) : "";
}

/**
 * Read the thread index. The database belongs to a running application, so it is opened read-only
 * and every failure — a missing file, a locked database, or a runtime without `node:sqlite` —
 * yields an empty index rather than an error.
 * @param {string} databasePath
 * @returns {CodexThread[]}
 */
export function readCodexThreads(databasePath) {
  if (!databasePath) return [];
  try {
    // Loaded here so a runtime without the built-in SQLite module simply reports no threads.
    const { DatabaseSync } = requireBuiltin("node:sqlite");
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          "SELECT id, rollout_path, cwd, title, created_at_ms, updated_at_ms FROM threads WHERE archived = 0 ORDER BY created_at_ms DESC LIMIT ?",
        )
        .all(CODEX_THREAD_LIMIT);
      return rows.map(
        /** @param {any} row */ (row) => ({
          id: String(row.id ?? ""),
          rolloutPath: String(row.rollout_path ?? ""),
          cwd: String(row.cwd ?? ""),
          title: String(row.title ?? ""),
          createdAtMs: Number(row.created_at_ms ?? 0),
          updatedAtMs: Number(row.updated_at_ms ?? 0),
        }),
      );
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/**
 * Bind one Codex process to its thread. An open rollout descriptor is exact proof and wins. With
 * no descriptor, a thread qualifies only when it was created after the process started and in the
 * same directory; anything ambiguous binds nothing rather than guessing.
 * @param {{processId: number; cwd: string; startedAt: number; openPaths?: string[]}} process
 * @param {CodexThread[]} threads
 * @returns {CodexThread | null}
 */
export function bindCodexThread({ cwd, startedAt, openPaths = [] }, threads) {
  const open = new Set(openPaths.filter(Boolean));
  if (open.size > 0) {
    const byRollout = threads.filter(
      (thread) => thread.rolloutPath && open.has(thread.rolloutPath),
    );
    if (byRollout.length === 1) return byRollout[0];
    if (byRollout.length > 1) return null;
  }
  const normalizedCwd = String(cwd ?? "").trim();
  if (!normalizedCwd || !Number.isFinite(startedAt) || startedAt <= 0) return null;
  const candidates = threads.filter(
    (thread) =>
      thread.cwd === normalizedCwd &&
      thread.createdAtMs > 0 &&
      thread.createdAtMs >= startedAt - CODEX_THREAD_START_SLACK_MS,
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Rollout files a process currently holds open, which is exact evidence of the session it is
 * running.
 * @param {number} processId
 * @param {{readDir: (path: string) => string[]; readLink: (path: string) => string}} procfs
 */
export function openRolloutPaths(processId, procfs) {
  const fdDir = path.join("/proc", String(processId), "fd");
  const paths = [];
  for (const entry of procfs.readDir(fdDir)) {
    const target = procfs.readLink(path.join(fdDir, entry));
    if (target.includes("/sessions/") && target.endsWith(".jsonl")) paths.push(target);
  }
  return paths;
}
