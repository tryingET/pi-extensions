import { randomUUID } from "node:crypto";
import os from "node:os";
/** @typedef {import("./contracts.ts").SessionSnapshot} SessionSnapshot */
/** @typedef {import("./contracts.ts").ToolCallDescription} ToolCallDescription */
/** @typedef {import("./contracts.ts").ToolResultSummary} ToolResultSummary */
import {
  basenameLabel,
  compactWhitespace,
  formatRepoLabel,
  previewCommand,
  previewPath,
  previewText,
  truncate,
} from "./format.mjs";

/** @param {unknown} value */
function asRecord(value) {
  return value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : null;
}

export function createSessionId() {
  return `${os.hostname()}-${process.pid}-${Date.now()}-${randomUUID().slice(0, 6)}`;
}

/** @param {{ cwd?: string; sessionName?: string }} [options] @returns {SessionSnapshot} */
export function createInitialSnapshot({ cwd = process.cwd(), sessionName = "" } = {}) {
  const now = Date.now();
  return {
    sessionId: createSessionId(),
    processId: process.pid,
    cwd,
    repoLabel: formatRepoLabel(cwd, sessionName),
    sessionName: compactWhitespace(sessionName),
    phase: "Idle",
    detail: previewPath(cwd, 72) || "Ready",
    assistantPreview: "",
    toolName: "",
    toolTarget: "",
    state: "idle",
    turnIndex: 0,
    updatedAt: now,
    startedAt: now,
    agentStartedAt: null,
    agentActive: false,
    lastPromptPreview: "",
    errorMessage: "",
  };
}

/** @param {string} toolName @param {Record<string, unknown>} [args] @returns {ToolCallDescription} */
export function describeToolCall(toolName, args = {}) {
  switch (toolName) {
    case "bash":
      return {
        state: "tool",
        phase: "Running bash",
        detail: previewCommand(args.command, 104) || "Running shell command",
        toolTarget: previewCommand(args.command, 72),
      };
    case "read":
      return {
        state: "tool",
        phase: "Reading file",
        detail: previewPath(args.path, 104) || "Reading file",
        toolTarget: previewPath(args.path, 72),
      };
    case "write":
      return {
        state: "tool",
        phase: "Writing file",
        detail: previewPath(args.path, 104) || "Writing file",
        toolTarget: previewPath(args.path, 72),
      };
    case "edit":
      return {
        state: "tool",
        phase: "Editing file",
        detail: previewPath(args.path, 104) || "Editing file",
        toolTarget: previewPath(args.path, 72),
      };
    case "interview":
      return {
        state: "waiting",
        phase: "Waiting for input",
        detail: truncate("Interactive form is open", 104),
        toolTarget: "form",
      };
    case "copy_to_clipboard":
      return {
        state: "tool",
        phase: "Copying to clipboard",
        detail: truncate("Preparing clipboard payload", 104),
        toolTarget: "clipboard",
      };
    default:
      return {
        state: "tool",
        phase: `Running ${toolName}`,
        detail: previewText(JSON.stringify(args), 104) || `Running ${toolName}`,
        toolTarget: basenameLabel(toolName),
      };
  }
}

/** @param {string} toolName @param {unknown} result @param {boolean} [isError] @returns {ToolResultSummary} */
export function summarizeToolResult(toolName, result, isError = false) {
  const record = asRecord(result);
  if (isError) {
    const errorValue = record?.errorMessage ?? record?.message ?? result;
    return {
      state: "error",
      phase: `${toolName} failed`,
      detail: previewText(errorValue, 104) || `${toolName} failed`,
      errorMessage: previewText(errorValue, 104),
    };
  }

  if (toolName === "bash") {
    const outputValue = record?.stdout ?? record?.stderr ?? result;
    return {
      state: "thinking",
      phase: "Processing output",
      detail: previewText(outputValue, 104) || "Command finished",
      errorMessage: "",
    };
  }

  return {
    state: "thinking",
    phase: "Continuing",
    detail: previewText(result, 104) || `${toolName} finished`,
    errorMessage: "",
  };
}
