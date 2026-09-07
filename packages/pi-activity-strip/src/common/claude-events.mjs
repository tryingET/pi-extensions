// ---
// summary: "maps Claude Code hook payloads to activity-strip state and stores one record per session"
// read_when:
//   - "changing Claude Code hook events, their state mapping, or the event record on disk"
// ---

import fs from "node:fs";
import path from "node:path";
import { ACTIVITY_STRIP_SOCKET_DIR } from "./constants.mjs";

export const CLAUDE_EVENT_SCHEMA = "pi-activity-strip-claude-event.v1";
export const CLAUDE_EVENT_DIR = path.join(ACTIVITY_STRIP_SOCKET_DIR, "claude-events");
/** Hook events older than this are ignored; the transcript remains the fallback. */
export const CLAUDE_EVENT_MAX_AGE_MS = 6 * 60 * 60_000;
/**
 * A session that dies without firing `SessionEnd` leaves its record behind. Such a record can never
 * produce a card, because a card needs a live process, but the files would accumulate forever. They
 * are retired once no live session claims them and they have stopped being recent, so a session
 * that publishes before the scan first sees it is never swept away mid-startup.
 */
export const CLAUDE_EVENT_ORPHAN_GRACE_MS = 10 * 60_000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_LIMIT = 100;

/** @typedef {"idle" | "thinking" | "tool" | "waiting" | "error"} ClaudeEventState */

/** @param {unknown} value */
function preview(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT - 1)}…` : text;
}

/** @param {unknown} sessionId */
export function claudeEventPath(sessionId, directory = CLAUDE_EVENT_DIR) {
  const normalized = String(sessionId ?? "")
    .trim()
    .toLowerCase();
  return SESSION_ID.test(normalized) ? path.join(directory, `${normalized}.json`) : "";
}

/**
 * Name what a tool call is acting on, preferring fields that read well on a card.
 * @param {Record<string, unknown>} toolInput
 */
export function describeHookToolTarget(toolInput) {
  for (const key of ["description", "command", "file_path", "path", "pattern", "query", "url"]) {
    const value = /** @type {any} */ (toolInput ?? {})[key];
    if (typeof value === "string" && value.trim()) return preview(value);
  }
  return "";
}

/**
 * Translate one hook payload into the record the ribbon stores. `null` means the event carries no
 * usable identity and must be dropped rather than guessed.
 * @param {Record<string, unknown>} payload
 * @param {{now?: number; env?: NodeJS.ProcessEnv}} [options]
 */
export function claudeEventRecord(payload, { now = Date.now(), env = process.env } = {}) {
  const sessionId = String(payload?.session_id ?? "")
    .trim()
    .toLowerCase();
  if (!SESSION_ID.test(sessionId)) return null;
  const event = String(payload?.hook_event_name ?? "").trim();
  if (!event) return null;

  const toolName = String(payload?.tool_name ?? "").trim();
  const toolInput = /** @type {Record<string, unknown>} */ (payload?.tool_input ?? {});
  const notification = String(payload?.notification_type ?? "").trim();

  /** @type {ClaudeEventState} */
  let state = "thinking";
  let detail = "";
  if (event === "PreToolUse") {
    state = "tool";
    detail = describeHookToolTarget(toolInput);
  } else if (event === "PostToolUseFailure") {
    state = "error";
    detail = `${toolName || "tool"} failed`;
  } else if (event === "PostToolUse") {
    state = "thinking";
  } else if (event === "Notification") {
    state = "waiting";
    detail =
      notification === "permission_prompt"
        ? "waiting for approval"
        : notification === "idle_prompt" || notification === "agent_needs_input"
          ? "waiting for input"
          : preview(notification) || "waiting";
  } else if (event === "Stop" || event === "SubagentStop") {
    state = "idle";
    detail = preview(payload?.last_assistant_message);
  } else if (event === "UserPromptSubmit") {
    state = "thinking";
  } else if (event === "SessionStart") {
    state = "idle";
  } else if (event === "SessionEnd") {
    state = "idle";
  }

  return {
    schema: CLAUDE_EVENT_SCHEMA,
    sessionId,
    event,
    state,
    toolName: state === "tool" || state === "error" ? toolName : "",
    toolTarget: state === "tool" ? detail : "",
    detail,
    notificationType: notification,
    cwd: String(payload?.cwd ?? ""),
    transcriptPath: String(payload?.transcript_path ?? ""),
    surfaceId: String(env.GHOSTTY_SURFACE_ID ?? ""),
    processId: Number(env.PI_ACTIVITY_STRIP_HOOK_PID ?? 0) || 0,
    at: now,
  };
}

/**
 * `SessionEnd` retires a session, so its record is removed rather than left behind.
 * @param {{event?: unknown} | null} record
 */
export function isSessionEndEvent(record) {
  return record?.event === "SessionEnd";
}

/**
 * Fold a stored hook record into transcript telemetry. The newer of the two wins, so a live hook
 * event overrides a stale transcript read and a transcript that moved after the last hook still
 * shows current work.
 * @param {import("./claude-transcript.mjs").ClaudeTelemetry} telemetry
 * @param {ReturnType<typeof claudeEventRecord>} record
 * @param {number} [now]
 */
export function mergeClaudeEvent(telemetry, record, now = Date.now()) {
  if (!record || record.schema !== CLAUDE_EVENT_SCHEMA) return telemetry;
  const at = Number(record.at ?? 0);
  if (!Number.isFinite(at) || at <= 0 || now - at > CLAUDE_EVENT_MAX_AGE_MS) return telemetry;
  if (at <= Number(telemetry?.lastEventAt ?? 0)) return telemetry;
  return {
    ...telemetry,
    state: /** @type {any} */ (record.state),
    toolName: String(record.toolName ?? ""),
    toolTarget: String(record.toolTarget ?? ""),
    assistantPreview: record.detail || telemetry.assistantPreview,
    lastEventAt: at,
  };
}

/**
 * Remove hook records that no live session claims. Returns the retired session ids.
 * @param {Iterable<string>} activeSessionIds
 * @param {{fs?: Pick<typeof fs, "readdirSync" | "readFileSync" | "unlinkSync">; directory?: string; now?: number}} [options]
 */
export function pruneClaudeEventRecords(
  activeSessionIds,
  { fs: fsImpl = fs, directory = CLAUDE_EVENT_DIR, now = Date.now() } = {},
) {
  const active = new Set(activeSessionIds ?? []);
  /** @type {string[]} */
  const retired = [];
  let entries;
  try {
    entries = fsImpl.readdirSync(directory);
  } catch {
    return retired;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const sessionId = entry.slice(0, -".json".length);
    if (active.has(sessionId)) continue;
    let publishedAt = 0;
    try {
      publishedAt = Number(
        JSON.parse(String(fsImpl.readFileSync(path.join(directory, entry), "utf8"))).at ?? 0,
      );
    } catch {
      publishedAt = 0;
    }
    if (publishedAt > 0 && now - publishedAt < CLAUDE_EVENT_ORPHAN_GRACE_MS) continue;
    try {
      fsImpl.unlinkSync(path.join(directory, entry));
      retired.push(sessionId);
    } catch {
      // Another writer removed it first.
    }
  }
  return retired;
}
