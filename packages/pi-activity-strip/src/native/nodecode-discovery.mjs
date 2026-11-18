// ---
// summary: "binds a Nodecode terminal shell to its session through Nodecode's shell presence and reads that session's live state"
// read_when:
//   - "changing Nodecode card identity, its shell-presence evidence, or the session directory reader"
// ---

import { createRequire } from "node:module";
import path from "node:path";

const requireBuiltin = createRequire(import.meta.url);
const PREVIEW_LIMIT = 100;

/**
 * A Nodecode shell attached to a session writes `$XDG_RUNTIME_DIR/nodecode/shells/<pid>.json`
 * naming its pid, its /proc start ticks, the session and the Nodecode home that keeps it, and removes
 * the record when it ends. The record is trusted for a tab only when its pid and start ticks are the
 * live process's own, so a record left by an earlier process on a reused pid binds nothing.
 */

/** @typedef {{readFile: (filePath: string) => string}} NodecodeProcfs */
/** @typedef {{sessionId: string; home: string; cwd: string}} NodecodeShell */
/**
 * @typedef {{session_id: string; title: string | null; prompt: string | null; updated_at: string | null;
 *   turn_id: string | null; turn_kind: string | null; waits: string | null; waits_turn: string | null;
 *   open_turn: string | null; last_event_at: string | null}} NodecodeSessionRow
 */

/** @param {NodeJS.ProcessEnv} env */
export function nodecodeShellDirectory(env) {
  const runtime = String(env.XDG_RUNTIME_DIR ?? "");
  return runtime.startsWith("/") ? path.join(runtime, "nodecode", "shells") : "";
}

/**
 * @param {number} processId
 * @param {string} startTicks the live process's own start ticks
 * @param {string} directory
 * @param {NodecodeProcfs} procfs
 * @returns {NodecodeShell | null}
 */
export function readNodecodeShell(processId, startTicks, directory, procfs) {
  if (!directory || !/^\d+$/.test(String(startTicks ?? ""))) return null;
  let row;
  try {
    row = JSON.parse(procfs.readFile(path.join(directory, `${processId}.json`)) || "null");
  } catch {
    return null;
  }
  if (
    !row ||
    row.version !== 1 ||
    row.kind !== "nodecode-shell" ||
    row.pid !== processId ||
    !Number.isSafeInteger(row.start_ticks) ||
    String(row.start_ticks) !== String(startTicks)
  )
    return null;
  const sessionId = String(row.session_id ?? "");
  const home = String(row.home ?? "");
  if (!/^[!-~]{1,128}$/.test(sessionId)) return null;
  return { sessionId, home: path.isAbsolute(home) ? home : "", cwd: String(row.cwd ?? "") };
}

/**
 * The session rows for a set of ids in one Nodecode home. The store belongs to a running gateway,
 * so it is opened read-only and every failure yields no rows rather than an error.
 * @param {string} home
 * @param {string[]} sessionIds
 * @returns {Map<string, NodecodeSessionRow>}
 */
export function readNodecodeSessions(home, sessionIds) {
  /** @type {Map<string, NodecodeSessionRow>} */
  const rows = new Map();
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (!home || ids.length === 0) return rows;
  try {
    const { DatabaseSync } = requireBuiltin("node:sqlite");
    const db = new DatabaseSync(path.join(home, "history.db"), { readOnly: true });
    try {
      const statement = db.prepare(
        `SELECT d.session_id, d.title, d.prompt, d.updated_at, d.turn_id, d.turn_kind, d.waits,
                d.waits_turn,
                (SELECT o.turn_id FROM open_turns o WHERE o.session_id = d.session_id
                  ORDER BY o.log_position DESC LIMIT 1) AS open_turn,
                (SELECT e.occurred_at FROM events e WHERE e.session_id = d.session_id
                  ORDER BY e.log_position DESC LIMIT 1) AS last_event_at
           FROM session_directory d WHERE d.session_id = ?`,
      );
      for (const id of ids) {
        const row = statement.get(id);
        if (row) rows.set(id, /** @type {NodecodeSessionRow} */ (row));
      }
    } finally {
      db.close();
    }
  } catch {
    // No store, an older schema, or no node:sqlite: the card stays process-only.
  }
  return rows;
}

/** @param {unknown} value */
function preview(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
}

/** @param {unknown} value */
function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Card telemetry from one session row. The gateway keeps a turn in `open_turns` until it ends, so
 * an open turn is a session at work; a question the latest turn left for the operator is a session
 * waiting on them. Everything else is idle.
 * @param {NodecodeSessionRow | undefined} row
 * @returns {Omit<import("../common/claude-transcript.mjs").ClaudeTelemetry, "state"> & {state: "idle" | "thinking" | "waiting"}}
 */
export function nodecodeTelemetry(row) {
  const open = Boolean(row?.open_turn);
  const waiting =
    !open && Boolean(String(row?.waits ?? "").trim()) && row?.waits_turn === row?.turn_id;
  return {
    title: preview(row?.title),
    lastPrompt: preview(row?.prompt),
    assistantPreview: waiting ? preview(row?.waits) : "",
    state: open ? "thinking" : waiting ? "waiting" : "idle",
    toolName: "",
    toolTarget: "",
    turnIndex: 0,
    lastEventAt: Math.max(timestampMs(row?.last_event_at), timestampMs(row?.updated_at)),
    mode: "",
    permissionMode: "",
    sessionId: String(row?.session_id ?? ""),
    cwd: "",
    gitBranch: "",
    // The gateway removes a turn from open_turns when it ends, so an open turn is current state.
    stateIsCurrent: open,
  };
}
