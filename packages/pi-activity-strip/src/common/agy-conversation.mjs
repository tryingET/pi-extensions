// ---
// summary: "derives live agy (Antigravity CLI) session state from the newest steps of its conversation store"
// read_when:
//   - "changing agy card telemetry or the conversation step fields it depends on"
// ---

import { protoString, protoTimestampsMs, protoValues } from "./protobuf-wire.mjs";

/**
 * agy keeps one SQLite file per conversation, `conversations/<id>.db`, with a `steps` table: one row
 * per step, its type and status as integer columns and its detail as protobuf blobs. The numbers
 * below are the values of agy's own CortexStepStatus and CortexStepType enums, read from the enum
 * descriptors embedded in the agy 1.5.11 binary. The format belongs to agy and carries no stability
 * guarantee, so every unknown value degrades to "not busy" and an unreadable blob to an empty field.
 */
export const AGY_STEP_STATUS = Object.freeze({
  UNSPECIFIED: 0,
  PENDING: 1,
  RUNNING: 2,
  DONE: 3,
  INVALID: 4,
  CLEARED: 5,
  CANCELED: 6,
  ERROR: 7,
  GENERATING: 8,
  WAITING: 9,
  QUEUED: 11,
  INTERRUPTED: 12,
});

export const AGY_STEP_TYPE = Object.freeze({
  FINISH: 2,
  USER_INPUT: 14,
  PLANNER_RESPONSE: 15,
  ERROR_MESSAGE: 17,
  CHECKPOINT: 23,
  EPHEMERAL_MESSAGE: 90,
  CONVERSATION_HISTORY: 98,
  SYSTEM_MESSAGE: 101,
  GENERIC: 132,
});

/** Step metadata (`steps.metadata`): when it was created and each status change, and its tool call. */
const METADATA_TIMESTAMP_PATHS = [[1], [6], [7], [8], [26, 1, 2]];
const METADATA_TOOL_NAME = [4, 2];
const METADATA_TOOL_ARGS = [4, 3];
/** Step payload (`steps.step_payload`): a user prompt, or a planner response and its tool calls. */
const PAYLOAD_USER_TEXT = [19, 2];
const PAYLOAD_PLANNER_TOOL_CALLS = [20, 7];
const PAYLOAD_PLANNER_TEXT_PATHS = [
  [20, 1],
  [20, 3],
];

/** @type {Set<number>} */
const BUSY = new Set([
  AGY_STEP_STATUS.PENDING,
  AGY_STEP_STATUS.RUNNING,
  AGY_STEP_STATUS.GENERATING,
  AGY_STEP_STATUS.QUEUED,
]);
/** Steps after which the model is still expected to act: its own next step has not landed yet. */
/** @type {Set<number>} */
const CONTINUES_TURN = new Set([
  AGY_STEP_TYPE.USER_INPUT,
  AGY_STEP_TYPE.SYSTEM_MESSAGE,
  AGY_STEP_TYPE.CHECKPOINT,
  AGY_STEP_TYPE.CONVERSATION_HISTORY,
  AGY_STEP_TYPE.EPHEMERAL_MESSAGE,
]);
const TOOL_ARGUMENT_KEYS = [
  "CommandLine",
  "TargetFile",
  "AbsolutePath",
  "File",
  "Path",
  "DirectoryPath",
  "SearchPath",
  "Query",
  "Url",
  "Action",
];
const PREVIEW_LIMIT = 100;

/** @typedef {"idle" | "thinking" | "tool" | "waiting" | "error"} AgyState */
/** @typedef {Omit<import("./claude-transcript.mjs").ClaudeTelemetry, "state"> & {state: AgyState}} AgentTelemetry */
/** @typedef {{idx: number; stepType: number; status: number; metadata?: Uint8Array | null; payload?: Uint8Array | null}} AgyStepRow */

/** @param {unknown} value */
function preview(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
}

/**
 * Name what a tool call is acting on. agy passes its arguments as a JSON object with capitalized
 * keys; a call whose arguments do not parse reports its tool name only.
 * @param {string} raw
 */
export function describeAgyToolTarget(raw) {
  if (!raw) return "";
  try {
    const args = JSON.parse(raw);
    if (!args || typeof args !== "object") return "";
    for (const key of TOOL_ARGUMENT_KEYS) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return preview(value);
    }
  } catch {
    // Not JSON: no target.
  }
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

/** @param {AgyStepRow} step */
function toolCallOf(step) {
  const name = protoString(step.metadata, METADATA_TOOL_NAME);
  const args = protoString(step.metadata, METADATA_TOOL_ARGS);
  return name || args ? { name: name || "tool", target: describeAgyToolTarget(args) } : null;
}

/** @param {AgyStepRow} step */
function requestedTools(step) {
  return protoValues(step.payload, PAYLOAD_PLANNER_TOOL_CALLS).filter(
    (value) => value instanceof Uint8Array,
  );
}

/**
 * Live state from the newest steps of one conversation, oldest first. The newest step decides:
 * a step still running is the model generating or a tool executing; a step waiting is a prompt for
 * the operator; a planner response that requested tools hands over to them, while one that
 * requested none ends the turn.
 * @param {AgyStepRow[]} steps
 * @returns {AgentTelemetry}
 */
export function parseAgySteps(steps) {
  const telemetry = emptyTelemetry();
  const ordered = [...(Array.isArray(steps) ? steps : [])]
    .filter((step) => step && Number.isInteger(step.idx))
    .sort((a, b) => a.idx - b.idx);
  const latest = ordered.at(-1);
  if (!latest) return telemetry;

  for (const step of ordered) {
    if (step.stepType === AGY_STEP_TYPE.USER_INPUT) {
      const prompt = preview(protoString(step.payload, PAYLOAD_USER_TEXT));
      if (prompt) {
        telemetry.lastPrompt = prompt;
        telemetry.turnIndex += 1;
      }
    } else if (step.stepType === AGY_STEP_TYPE.PLANNER_RESPONSE) {
      for (const path of PAYLOAD_PLANNER_TEXT_PATHS) {
        const text = preview(protoString(step.payload, path));
        if (text) {
          telemetry.assistantPreview = text;
          break;
        }
      }
    }
  }
  telemetry.lastEventAt = Math.max(
    0,
    ...METADATA_TIMESTAMP_PATHS.flatMap((path) => protoTimestampsMs(latest.metadata, path)),
  );

  const status = Number(latest.status);
  const tool = toolCallOf(latest);
  // agy rewrites a step's status as it moves, so a busy status is the process's own current state.
  telemetry.stateIsCurrent = BUSY.has(status);
  // A failed tool step is ordinary work the model recovers from (26 of 2 756 stored steps here),
  // so only agy's own error message or a failed model step stops the session in `error`.
  const failedTurn =
    latest.stepType === AGY_STEP_TYPE.ERROR_MESSAGE ||
    (status === AGY_STEP_STATUS.ERROR && latest.stepType === AGY_STEP_TYPE.PLANNER_RESPONSE);
  if (status === AGY_STEP_STATUS.WAITING) {
    telemetry.state = "waiting";
  } else if (failedTurn) {
    telemetry.state = "error";
  } else if (status === AGY_STEP_STATUS.ERROR) {
    // Not current: it decays to idle through the liveness window when no next step lands.
    telemetry.state = "thinking";
  } else if (BUSY.has(status)) {
    telemetry.state = tool ? "tool" : "thinking";
  } else if (status === AGY_STEP_STATUS.DONE) {
    if (tool || CONTINUES_TURN.has(latest.stepType)) telemetry.state = "thinking";
    else if (latest.stepType === AGY_STEP_TYPE.PLANNER_RESPONSE && requestedTools(latest).length)
      telemetry.state = "thinking";
    else telemetry.state = "idle";
  } else {
    telemetry.state = "idle";
  }
  if (tool && (telemetry.state === "tool" || telemetry.state === "waiting")) {
    telemetry.toolName = tool.name;
    telemetry.toolTarget = tool.target;
  }
  return telemetry;
}

/**
 * A conversation title from agy's own annotation file (`title:"..."`, protobuf text format).
 * @param {string} text
 */
export function parseAgyAnnotationTitle(text) {
  const match = /^\s*title:\s*"((?:[^"\\]|\\.)*)"/m.exec(String(text ?? ""));
  if (!match) return "";
  // Text format escapes non-ASCII as octal bytes (`\303\244`), so the bytes are rebuilt first.
  const bytes = [];
  const raw = match[1] ?? "";
  const named = /** @type {Record<string, number>} */ ({ n: 10, t: 9, r: 13 });
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? "";
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(raw.slice(index + 1))?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8) & 0xff);
      index += octal.length;
      continue;
    }
    const next = raw[index + 1] ?? "";
    bytes.push(named[next] ?? next.charCodeAt(0));
    index += 1;
  }
  return preview(Buffer.from(bytes).toString("utf8"));
}
