// ---
// summary: "binds a running agy (Antigravity CLI) process to its conversation and reads that conversation's live steps"
// read_when:
//   - "changing agy session identification, its presence-lock evidence, or the conversation store reader"
// ---

import { createRequire } from "node:module";
import path from "node:path";
import { parseAgyAnnotationTitle, parseAgySteps } from "../common/agy-conversation.mjs";

const requireBuiltin = createRequire(import.meta.url);

/**
 * agy marks the conversation a process is running by holding `<home>/presence/<id>.lock` open with
 * an exclusive flock, and it holds `<home>/conversations/<id>.db` open while the conversation is
 * loaded. The home is `~/.gemini/antigravity-cli`; the paths are matched by shape so a relocated
 * home still binds.
 */
const PRESENCE_LOCK =
  /^(.*\/antigravity-cli)\/presence\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.lock$/;
const CONVERSATION_DB =
  /^(.*\/antigravity-cli)\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.db$/;
/** Enough newest steps to see the current turn's prompt and its latest step. */
export const AGY_STEP_WINDOW = 24;
const CACHE_LIMIT = 64;

/** A step payload larger than this is not parsed: real payloads stay under 200 KB, and the wire
 * reader runs on the panel's main thread. */
export const AGY_PAYLOAD_LIMIT = 1024 * 1024;

/** @typedef {{readFile: (filePath: string) => string; readLink: (filePath: string) => string; readDir: (filePath: string) => string[]; statMtimeMs: (filePath: string) => number}} AgyProcfs */
/** @typedef {{conversationId: string; home: string; databasePath: string; evidence: "presence-lock-held" | "presence-lock-open" | "conversation-open"}} AgySession */

/**
 * A file's inode as the decimal string {@link heldLockInodes} answers. The device is not part of
 * the match: on btrfs `stat` reports the subvolume's anonymous device (0:36) while `/proc/locks`
 * names the superblock's (00:23), so a `major:minor:inode` key never matches there. The inode is
 * compared only with files the lock-holding process itself has open, which the kernel ties to
 * that process; that binding, not the device, is what makes the match exact.
 * @param {number | bigint | string} ino
 */
export function lockInode(ino) {
  return String(BigInt(ino));
}

/**
 * The inodes of every flock /proc/locks says one process HOLDS. A line marked `->` is a process
 * blocked waiting for that lock, not its holder, and is skipped. The line's device is checked for
 * shape only (see {@link lockInode}).
 * @param {string} locks
 * @param {number} processId
 */
export function heldLockInodes(locks, processId) {
  const keys = new Set();
  for (const line of String(locks ?? "").split("\n")) {
    // holder: "41: FLOCK  ADVISORY  WRITE 1282735 00:23:1050664902 0 EOF"
    // waiter: "41: -> FLOCK  ADVISORY  WRITE 1446865 00:23:1050664902 0 EOF"
    const fields = line.trim().split(/\s+/);
    const at = fields.indexOf("FLOCK");
    if (at < 0 || fields[at - 1] === "->") continue;
    if (Number(fields[at + 3]) !== processId) continue;
    const parts = String(fields[at + 4] ?? "").split(":");
    if (
      parts.length !== 3 ||
      !parts.every((part, i) => (i < 2 ? /^[0-9a-f]+$/i : /^\d+$/).test(part))
    )
      continue;
    keys.add(lockInode(parts[2] ?? "0"));
  }
  return keys;
}

/**
 * Bind one agy process to the conversation it is running. A presence lock the process holds under
 * flock is exact evidence and wins; an open presence lock or an open conversation store binds only
 * when it names one conversation. Anything ambiguous binds nothing.
 * @param {number} processId
 * @param {AgyProcfs} procfs
 * @param {{locks?: string; lockInodeOf?: (filePath: string) => string}} [options]  `lockInodeOf` answers
 *   {@link lockInode} of a descriptor's target
 * @returns {AgySession | null}
 */
export function resolveAgySession(processId, procfs, options = {}) {
  const fdDir = path.join("/proc", String(processId), "fd");
  /** @type {Map<string, {home: string; fd: string}>} */
  const presence = new Map();
  /** @type {Map<string, string>} */
  const conversations = new Map();
  for (const entry of procfs.readDir(fdDir)) {
    const target = procfs.readLink(path.join(fdDir, entry));
    const lock = PRESENCE_LOCK.exec(target);
    if (lock) presence.set(lock[2] ?? "", { home: lock[1] ?? "", fd: path.join(fdDir, entry) });
    const store = CONVERSATION_DB.exec(target);
    if (store) conversations.set(store[2] ?? "", store[1] ?? "");
  }
  /** @param {string} conversationId @param {string} home @param {AgySession["evidence"]} evidence */
  const session = (conversationId, home, evidence) => ({
    conversationId,
    home,
    databasePath: path.join(home, "conversations", `${conversationId}.db`),
    evidence,
  });
  if (presence.size > 0 && options.locks !== undefined && options.lockInodeOf) {
    const held = heldLockInodes(options.locks, processId);
    const locked = [...presence].filter(([, { fd }]) => held.has(options.lockInodeOf?.(fd) ?? ""));
    const [only] = locked;
    if (locked.length === 1 && only) return session(only[0], only[1].home, "presence-lock-held");
    if (locked.length > 1) return null;
  }
  if (presence.size === 1) {
    const [[id, { home }]] = /** @type {[[string, {home: string; fd: string}]]} */ ([...presence]);
    return session(id, home, "presence-lock-open");
  }
  if (presence.size === 0 && conversations.size === 1) {
    const [[id, home]] = /** @type {[[string, string]]} */ ([...conversations]);
    return session(id, home, "conversation-open");
  }
  return null;
}

/** @param {any} row */
function stepRow(row) {
  const payload = row.step_payload instanceof Uint8Array ? row.step_payload : null;
  return {
    idx: Number(row.idx),
    stepType: Number(row.step_type),
    status: Number(row.status),
    metadata: row.metadata instanceof Uint8Array ? row.metadata : null,
    payload: payload && payload.length <= AGY_PAYLOAD_LIMIT ? payload : null,
  };
}

/**
 * The newest steps of one conversation, plus the newest operator prompt when it lies outside that
 * window (real turns run hundreds of steps). The store belongs to a running agy, so it is opened
 * read-only with a short busy timeout. A failed read — a missing file, a store locked past the
 * timeout, or a runtime without `node:sqlite` — answers null, never an empty conversation, so the
 * caller does not cache it.
 * @param {string} databasePath
 * @returns {import("../common/agy-conversation.mjs").AgyStepRow[] | null}
 */
export function readAgySteps(databasePath) {
  if (!databasePath) return null;
  try {
    const { DatabaseSync } = requireBuiltin("node:sqlite");
    const db = new DatabaseSync(databasePath, { readOnly: true, timeout: 250 });
    try {
      const select = "SELECT idx, step_type, status, metadata, step_payload FROM steps";
      const rows = db
        .prepare(`${select} ORDER BY idx DESC LIMIT ?`)
        .all(AGY_STEP_WINDOW)
        .map(stepRow);
      const oldest = rows.at(-1);
      if (oldest && !rows.some((/** @type {{stepType: number}} */ row) => row.stepType === 14)) {
        const prompt = db
          .prepare(`${select} WHERE step_type = 14 AND idx < ? ORDER BY idx DESC LIMIT 1`)
          .get(oldest.idx);
        if (prompt) rows.push(stepRow(prompt));
      }
      return rows;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * A step row agy left before this process started was written by an earlier process (a resumed
 * conversation, or a killed one): its RUNNING, WAITING or ERROR status says nothing about now.
 * @param {import("../common/claude-transcript.mjs").ClaudeTelemetry & {stateIsCurrent?: boolean}} telemetry
 * @param {number} processStartedAtMs
 */
export function agyTelemetryForProcess(telemetry, processStartedAtMs) {
  const stepAt = Number(telemetry?.lastEventAt) || 0;
  // The process start is known to about a second (boot time has whole seconds), hence the margin.
  if (stepAt <= 0 || !(processStartedAtMs > 0) || stepAt >= processStartedAtMs - 2000)
    return telemetry;
  return { ...telemetry, stateIsCurrent: false, state: "idle", toolName: "", toolTarget: "" };
}

/**
 * The conversation's title: agy's own annotation, else the summary cache's title or first prompt.
 * @param {string} home
 * @param {string} conversationId
 * @param {AgyProcfs} procfs
 */
export function readAgyTitle(home, conversationId, procfs) {
  const annotated = parseAgyAnnotationTitle(
    procfs.readFile(path.join(home, "annotations", `${conversationId}.pbtxt`)),
  );
  if (annotated) return annotated;
  try {
    const cache = JSON.parse(
      procfs.readFile(path.join(home, "cache", "conversation_metadata.json")) || "{}",
    );
    const summary = cache?.conversations?.[conversationId]?.summary;
    return String(summary?.Title ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Live telemetry for one agy tab. The store and its write-ahead log move on every step, so their
 * modification times key the cache and an idle conversation is read once.
 * @param {AgySession} session
 * @param {AgyProcfs} procfs
 * @param {Map<string, any>} cache
 * @param {(databasePath: string) => import("../common/agy-conversation.mjs").AgyStepRow[] | null} [readSteps]
 */
export function readAgyTelemetry(session, procfs, cache, readSteps = readAgySteps) {
  const { databasePath } = session;
  const mtime = Math.max(
    procfs.statMtimeMs(databasePath),
    procfs.statMtimeMs(`${databasePath}-wal`),
  );
  const key = `agy:${databasePath}`;
  const cached = cache.get(key);
  let telemetry = cached && cached.mtime === mtime ? cached.telemetry : null;
  if (!telemetry) {
    const steps = readSteps(databasePath);
    telemetry = parseAgySteps(steps ?? []);
    if (steps && mtime > 0) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, { mtime, telemetry });
    }
  }
  const title = readAgyTitle(session.home, session.conversationId, procfs);
  return {
    ...telemetry,
    sessionId: session.conversationId,
    title: title || telemetry.title,
    lastEventAt: telemetry.lastEventAt || mtime,
  };
}
