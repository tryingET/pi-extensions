// ---
// summary: "derives live Claude Code session state from the tail of its transcript"
// read_when:
//   - "changing Claude Code card telemetry or the transcript records it depends on"
// ---

/**
 * Claude Code appends newline-delimited records to a per-session transcript. The format is internal
 * to Claude Code and carries no stability guarantee, so every field is optional here and a record
 * that does not parse is skipped. When nothing usable is found the caller keeps the process-only
 * card rather than inventing activity.
 */

const PREVIEW_LIMIT = 100;
const DETAIL_LIMIT = 100;

/** @typedef {"idle" | "thinking" | "tool"} ClaudeState */
/**
 * @typedef {{
 *   title: string; lastPrompt: string; assistantPreview: string; state: ClaudeState;
 *   toolName: string; toolTarget: string; turnIndex: number; lastEventAt: number;
 *   mode: string; permissionMode: string; sessionId: string; cwd: string; gitBranch: string;
 * }} ClaudeTelemetry
 */

/** @param {unknown} value @param {number} limit */
function preview(value, limit) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** @param {unknown} value */
function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** @param {any} record */
function contentBlocks(record) {
  const content = record?.message?.content;
  return Array.isArray(content) ? content : [];
}

/**
 * Name the thing a tool call is acting on, preferring the fields that read well on a card.
 * @param {any} block
 */
export function describeToolTarget(block) {
  const input = block?.input ?? {};
  for (const key of ["description", "command", "file_path", "path", "pattern", "query", "url"]) {
    const value = input?.[key];
    if (typeof value === "string" && value.trim()) return preview(value, DETAIL_LIMIT);
  }
  return "";
}

/** @returns {ClaudeTelemetry} */
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
 * Read the tail of a transcript. The first line is usually a fragment and is skipped by the parse
 * failure path. State comes from the newest record that carries a timestamp, because the latched
 * records Claude Code rewrites after every turn have none and would otherwise mask real activity.
 * @param {string} tail
 * @returns {ClaudeTelemetry}
 */
export function parseClaudeTranscriptTail(tail) {
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
      // A truncated first line or a partially written last line is not evidence.
    }
  }
  if (records.length === 0) return telemetry;

  for (const record of records) {
    switch (record?.type) {
      case "ai-title":
        if (typeof record.aiTitle === "string") telemetry.title = record.aiTitle;
        break;
      case "last-prompt":
        telemetry.lastPrompt = preview(record.lastPrompt, PREVIEW_LIMIT);
        break;
      case "mode":
        telemetry.mode = String(record.mode ?? "");
        break;
      case "permission-mode":
        telemetry.permissionMode = String(record.permissionMode ?? "");
        break;
      case "system":
        if (record.subtype === "turn_duration" && Number.isFinite(Number(record.messageCount))) {
          telemetry.turnIndex = Number(record.messageCount);
        }
        break;
      default:
        break;
    }
    if (typeof record?.sessionId === "string") telemetry.sessionId = record.sessionId;
    if (typeof record?.cwd === "string") telemetry.cwd = record.cwd;
    if (typeof record?.gitBranch === "string") telemetry.gitBranch = record.gitBranch;
    if (record?.type === "assistant") {
      const text = contentBlocks(record)
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join(" ");
      if (text.trim()) telemetry.assistantPreview = preview(text, PREVIEW_LIMIT);
    }
  }

  const timed = records.filter(
    (record) => record?.type !== "attachment" && timestampMs(record?.timestamp) > 0,
  );
  const latest = timed.at(-1);
  if (!latest) return telemetry;
  telemetry.lastEventAt = timestampMs(latest.timestamp);

  if (latest.type === "system" && latest.subtype === "turn_duration") {
    telemetry.state = "idle";
    return telemetry;
  }
  if (latest.type === "assistant") {
    const toolBlock = contentBlocks(latest).find((block) => block?.type === "tool_use");
    if (toolBlock) {
      telemetry.state = "tool";
      telemetry.toolName = String(toolBlock.name ?? "");
      telemetry.toolTarget = describeToolTarget(toolBlock);
      return telemetry;
    }
    telemetry.state = latest.message?.stop_reason === "end_turn" ? "idle" : "thinking";
    return telemetry;
  }
  if (latest.type === "user") {
    telemetry.state = "thinking";
    return telemetry;
  }
  return telemetry;
}
