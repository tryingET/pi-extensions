// ---
// summary: "derives live Codex session state from the tail of its rollout file"
// read_when:
//   - "changing Codex card telemetry or the rollout records it depends on"
// ---

/**
 * Codex appends newline-delimited records to a per-session rollout. Every record carries a
 * top-level `timestamp`, a `type` of `session_meta`, `turn_context`, `event_msg` or
 * `response_item`, and a `payload` whose own `type` names the event. The format belongs to Codex
 * and carries no stability guarantee, so every field is optional here and an unparseable record is
 * skipped. When nothing usable is found the caller keeps the process-only card.
 */

const PREVIEW_LIMIT = 100;
const TOOL_ARGUMENT_KEYS = ["cmd", "command", "query", "path", "file_path", "pattern", "workdir"];

/** @typedef {import("./claude-transcript.mjs").ClaudeTelemetry} AgentTelemetry */

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
 * Name what a Codex tool call is acting on. Arguments arrive as a JSON string, and a call whose
 * arguments do not parse still reports its tool name.
 * @param {any} payload
 */
export function describeCodexToolTarget(payload) {
  let args = payload?.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return preview(args);
    }
  }
  if (!args || typeof args !== "object") return "";
  for (const key of TOOL_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return preview(value);
    if (Array.isArray(value) && value.length > 0) return preview(value.join(" "));
  }
  return "";
}

/** @param {any} payload */
function toolNameFor(payload) {
  const type = String(payload?.type ?? "");
  if (type === "function_call" || type === "custom_tool_call") {
    return String(payload?.name ?? "") || "tool";
  }
  if (type === "local_shell_call") return "shell";
  if (type === "web_search_call") return "web_search";
  return "";
}

/** @returns {AgentTelemetry} */
function emptyTelemetry() {
  return {
    title: "",
    lastPrompt: "",
    assistantPreview: "",
    state: "idle",
    toolName: "",
    toolTarget: "",
    turnIndex: 0,
    lastEventAt: 0,
    mode: "",
    permissionMode: "",
    sessionId: "",
    cwd: "",
    gitBranch: "",
  };
}

/**
 * Read the tail of a rollout. The first line is usually a fragment and is skipped by the parse
 * failure path. State comes from the newest record that carries a timestamp, so a tool call is
 * reported as running only while it is still the newest record; its output lands after it.
 * @param {string} tail
 * @returns {AgentTelemetry}
 */
export function parseCodexRolloutTail(tail) {
  const telemetry = emptyTelemetry();
  if (!tail) return telemetry;

  /** @type {any[]} */
  const records = [];
  for (const line of String(tail).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // A truncated first or last line is not evidence.
    }
  }
  if (records.length === 0) return telemetry;

  for (const record of records) {
    const payload = record?.payload;
    const payloadType = String(payload?.type ?? "");
    if (record?.type === "session_meta") {
      telemetry.sessionId = String(payload?.id ?? telemetry.sessionId);
      telemetry.cwd = String(payload?.cwd ?? telemetry.cwd);
      const branch = payload?.git?.branch;
      if (typeof branch === "string") telemetry.gitBranch = branch;
    } else if (record?.type === "turn_context") {
      telemetry.cwd = String(payload?.cwd ?? telemetry.cwd);
      telemetry.mode = String(payload?.approval_policy ?? telemetry.mode);
      const sandbox = payload?.sandbox_policy?.type;
      if (typeof sandbox === "string") telemetry.permissionMode = sandbox;
    } else if (payloadType === "user_message") {
      telemetry.lastPrompt = preview(payload?.message);
    } else if (payloadType === "agent_message") {
      telemetry.assistantPreview = preview(payload?.message);
    } else if (payloadType === "task_complete") {
      telemetry.turnIndex += 1;
      if (payload?.last_agent_message) {
        telemetry.assistantPreview = preview(payload.last_agent_message);
      }
    }
  }

  const timed = records.filter((record) => timestampMs(record?.timestamp) > 0);
  const latest = timed.at(-1);
  if (!latest) return telemetry;
  telemetry.lastEventAt = timestampMs(latest.timestamp);

  const payload = latest.payload;
  const payloadType = String(payload?.type ?? "");
  // A tool call that is the newest record is still running: its output would appear after it.
  const toolName = toolNameFor(payload);
  if (toolName) {
    telemetry.state = "tool";
    telemetry.toolName = toolName;
    telemetry.toolTarget = describeCodexToolTarget(payload);
    return telemetry;
  }
  telemetry.state = payloadType === "task_complete" ? "idle" : "thinking";
  return telemetry;
}
