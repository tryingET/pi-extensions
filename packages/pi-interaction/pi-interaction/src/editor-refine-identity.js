// summary: Resolves exact Pi publisher, process, socket, presence, and Niri focus identity.
// read_when:
//   - Changing editor refine target binding or focused-session proof.

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const EDITOR_REFINE_SOCKET_DIR = "pi-editor-refine";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLISHER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GHOSTTY_APP_IDS = new Map([
  ["main", "com.mitchellh.ghostty"],
  ["legacy", "com.tryinget.ghosttysidequest"],
]);
const MAX_PRESENCE_FILES = 512;

/** @param {unknown} error @returns {string|undefined} */
function errorCode(error) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return String(error.code);
}

/** @param {string} text @returns {string} */
export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** @param {string} sessionId @returns {string} */
export function sessionToken(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error("invalid session id");
  return sessionId.replaceAll("-", "");
}

/** @param {string} publisherId @returns {string} */
export function publisherToken(publisherId) {
  if (!PUBLISHER_ID.test(publisherId)) throw new Error("invalid publisher id");
  return sha256Text(publisherId).slice(0, 12);
}

/** @param {string} runtimeDir @param {string} sessionId @param {string} publisherId @returns {string} */
export function socketPathFor(runtimeDir, sessionId, publisherId) {
  sessionToken(sessionId);
  const sessionSocketId = sha256Text(sessionId).slice(0, 20);
  return join(
    runtimeDir,
    EDITOR_REFINE_SOCKET_DIR,
    `${sessionSocketId}-${publisherToken(publisherId)}.sock`,
  );
}

/** @param {number} [pid] @returns {Promise<string>} */
export async function linuxProcessStartTime(pid = process.pid) {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const close = stat.lastIndexOf(")");
  if (close < 0) throw new Error("cannot parse process identity");
  const fields = stat
    .slice(close + 2)
    .trim()
    .split(/\s+/);
  const startTime = fields[19];
  if (!startTime || !/^\d+$/.test(startTime)) {
    throw new Error("cannot establish process start time");
  }
  return startTime;
}

/**
 * @typedef {{
 *   pid: number,
 *   cwd: string,
 *   ghosttyAncestorPid: number,
 *   ghosttyFamily: "main"|"legacy",
 *   ghosttySurfaceIdNormalized: string,
 *   terminalKey: string
 * }} SessionPresenceProof
 */

/**
 * @param {string} sessionId
 * @param {SessionPresenceProof} presence
 * @param {{ execFile?: (...args: any[]) => Promise<{ stdout: string }>, timeoutMs?: number }} [options]
 * @returns {Promise<{windowId: number, focusEpoch: string, terminalKey: string}|null>}
 */
export async function niriSessionFocusProof(sessionId, presence, options = {}) {
  const token = sessionToken(sessionId);
  const run = options.execFile ?? execFile;
  const expectedAppId = GHOSTTY_APP_IDS.get(presence?.ghosttyFamily);
  const expectedTitleSuffix = ` · gs:${presence?.ghosttyFamily}:${presence?.ghosttySurfaceIdNormalized} · ${token}`;
  if (
    !expectedAppId ||
    !Number.isInteger(presence?.ghosttyAncestorPid) ||
    presence.ghosttyAncestorPid <= 0 ||
    presence?.terminalKey !==
      `ghostty:${presence?.ghosttyFamily}:${presence?.ghosttySurfaceIdNormalized}`
  ) {
    return null;
  }

  try {
    const { stdout } = await run("/usr/bin/niri", ["msg", "-j", "focused-window"], {
      encoding: "utf8",
      timeout: options.timeoutMs ?? 300,
      maxBuffer: 32 * 1024,
    });
    const window = JSON.parse(stdout);
    const title = typeof window?.title === "string" ? window.title : "";
    const secs = Number(window?.focus_timestamp?.secs);
    const nanos = Number(window?.focus_timestamp?.nanos);
    if (
      window?.is_focused !== true ||
      String(window?.app_id ?? "") !== expectedAppId ||
      Number(window?.pid) !== presence.ghosttyAncestorPid ||
      !Number.isInteger(window?.id) ||
      Number(window.id) <= 0 ||
      !Number.isSafeInteger(secs) ||
      secs < 0 ||
      !Number.isSafeInteger(nanos) ||
      nanos < 0 ||
      !title.endsWith(expectedTitleSuffix)
    ) {
      return null;
    }
    return {
      windowId: Number(window.id),
      focusEpoch: `${secs}:${nanos}`,
      terminalKey: presence.terminalKey,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} runtimeDir
 * @param {string} sessionId
 * @param {number} processId
 * @param {string} cwd
 * @returns {Promise<SessionPresenceProof|null>}
 */
export async function resolveUniqueSessionPresence(runtimeDir, sessionId, processId, cwd) {
  const directory = join(runtimeDir, "pi-session-presence");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
  if (entries.length > MAX_PRESENCE_FILES) return null;

  /** @type {SessionPresenceProof[]} */
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(directory, entry.name), "utf8");
      if (Buffer.byteLength(raw, "utf8") > 32 * 1024) return null;
      const presence = JSON.parse(raw);
      if (presence?.sessionId !== sessionId) continue;
      const pid = Number(presence?.pid);
      const ancestorPid = Number(presence?.ghosttyAncestorPid);
      const family = String(presence?.ghosttyFamily ?? "");
      const surface = String(presence?.ghosttySurfaceIdNormalized ?? "");
      const terminalKey = String(presence?.terminalKey ?? "");
      if (
        Number(presence?.schemaVersion) < 2 ||
        presence?.source !== "@tryinget/pi-little-helpers/session-presence" ||
        !Number.isInteger(pid) ||
        pid <= 0 ||
        entry.name !== `${pid}.json` ||
        String(presence?.cwd ?? "") !== cwd ||
        presence?.terminalBound !== true ||
        !Number.isInteger(ancestorPid) ||
        ancestorPid <= 0 ||
        !GHOSTTY_APP_IDS.has(family) ||
        !/^\d+$/.test(surface) ||
        terminalKey !== `ghostty:${family}:${surface}`
      ) {
        return null;
      }
      const processMetadata = await lstat(`/proc/${pid}`);
      if (!processMetadata.isDirectory()) return null;
      matches.push({
        pid,
        cwd,
        ghosttyAncestorPid: ancestorPid,
        ghosttyFamily: /** @type {"main"|"legacy"} */ (family),
        ghosttySurfaceIdNormalized: surface,
        terminalKey,
      });
    } catch {
      return null;
    }
  }
  return matches.length === 1 && matches[0]?.pid === processId ? matches[0] : null;
}

/** @param {string} runtimeDir @param {string} sessionId @param {number} processId @param {string} cwd @returns {Promise<boolean>} */
export async function isUniqueSessionPresence(runtimeDir, sessionId, processId, cwd) {
  return Boolean(await resolveUniqueSessionPresence(runtimeDir, sessionId, processId, cwd));
}
