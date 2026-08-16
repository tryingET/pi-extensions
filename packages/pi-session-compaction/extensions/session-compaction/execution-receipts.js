/**
summary: "Captures bounded observed command, validation, failure, and file-activity receipts."
read_when:
  - "Changing negative-evidence preservation, validation receipts, or observed file activity."
*/
import { formatManifestOperations } from "./files-touched.js";
import { buildManagedBlock, managedRecordsFromSummary } from "./managed-block-codec.js";
import { redactStructuredValue, sanitizeDisplayText } from "./redaction.js";

export const EXECUTION_RECEIPTS_HEADING = "## Execution receipts (observed)";
export const EXECUTION_RECEIPTS_TYPE = "execution-receipts";
export const FILE_ACTIVITY_HEADING = "## Files touched (observed session activity)";
export const FILE_ACTIVITY_TYPE = "file-activity";

const VALIDATION_RE =
  /\b(?:npm|pnpm|yarn|bun|node|pytest|cargo|go|mvn|gradle)\b[^\n]*(?:test|spec|check|lint|build|typecheck|tsc)|\b(?:test|lint|typecheck|build)\b/iu;
const FAILURE_RE =
  /\b(?:error|failed|failure|exception|permission denied|not found|timed out|timeout)\b/iu;
const NOOP_RE =
  /applied:\s*0|no changes applied|nothing to (?:do|change)|already up[- ]to[- ]date/iu;

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function entryId(entry) {
  return entry?.id ?? entry?.uuid;
}

function toolCallId(value) {
  return value?.id ?? value?.toolCallId ?? value?.tool_call_id ?? value?.tool_use_id;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.output === "string") return part.output;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function argumentSummary(args) {
  const sanitized = redactStructuredValue(args, {
    maxStringChars: 600,
    maxDepth: 3,
    maxArrayItems: 20,
    maxObjectEntries: 40,
  });
  const value = sanitized.value;
  const path =
    value && typeof value === "object"
      ? ["path", "filePath", "file_path", "file", "new_path"]
          .map((key) => value[key])
          .find((candidate) => typeof candidate === "string")
      : undefined;
  const command =
    value && typeof value === "object" && typeof value.command === "string"
      ? value.command
      : undefined;
  let compact = "";
  try {
    compact = JSON.stringify(value);
  } catch {
    compact = "[unserializable arguments]";
  }
  return {
    path,
    command,
    compact: compact.length > 800 ? `${compact.slice(0, 800)}…` : compact,
    redactions: sanitized.redactions,
  };
}

function statusForResult(message, text) {
  if (message?.isError === true) return "failed";
  if (Number.isFinite(message?.exitCode) && message.exitCode !== 0) return "failed";
  if (NOOP_RE.test(text)) return "noop";
  if (
    FAILURE_RE.test(text) &&
    !/0 failures|no failures|0 errors|no errors|0 failed/iu.test(text)
  ) {
    return "failed";
  }
  return "success";
}

function priorityForReceipt(receipt) {
  if (receipt.status === "failed") return 100;
  if (receipt.isValidation) return 90;
  if (/^(?:edit|write|apply_patch|quick_edit|multiedit|bash)$/iu.test(receipt.toolName)) {
    return 70;
  }
  return 45;
}

function receiptText(receipt) {
  const parts = [
    `${receipt.status.toUpperCase()}: ${receipt.toolName}`,
    receipt.command ? `command=${receipt.command}` : undefined,
    receipt.path ? `path=${receipt.path}` : undefined,
    receipt.resultSummary ? `result=${receipt.resultSummary}` : undefined,
    receipt.sourceEntryId ? `evidence=${receipt.sourceEntryId}` : undefined,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function collectExecutionReceipts(entries, options = {}) {
  const calls = new Map();
  const receipts = [];
  const maxResultChars = Number.isFinite(options.maxResultChars)
    ? Math.max(0, Math.floor(options.maxResultChars))
    : 1_200;

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type !== "toolCall") continue;
        const id = toolCallId(part);
        if (!id) continue;
        const args = argumentSummary(part.arguments ?? {});
        calls.set(id, {
          id,
          toolName: normalizeText(part.name) ?? "unknown_tool",
          path: args.path,
          command: args.command,
          argumentSummary: args.compact,
          redactions: args.redactions,
          callEntryId: entryId(entry),
          timestamp: message.timestamp ?? 0,
        });
      }
      continue;
    }

    if (message?.role === "bashExecution") {
      const sanitizedOutput = sanitizeDisplayText(message.output ?? message.content ?? "", {
        maxChars: maxResultChars,
      });
      const sanitizedCommand = sanitizeDisplayText(message.command ?? "", {
        maxChars: 1_000,
      });
      const receipt = {
        id: `bash-${entryId(entry) ?? receipts.length}`,
        toolName: "bash",
        command: sanitizedCommand.text,
        status: statusForResult(message, sanitizedOutput.text),
        resultSummary: sanitizedOutput.text,
        timestamp: message.timestamp ?? 0,
        sourceEntryId: entryId(entry),
        redactions: [...sanitizedCommand.redactions, ...sanitizedOutput.redactions],
      };
      receipt.isValidation = VALIDATION_RE.test(receipt.command ?? "");
      receipt.priority = priorityForReceipt(receipt);
      receipt.text = receiptText(receipt);
      receipts.push(receipt);
      continue;
    }

    if (message?.role !== "toolResult") continue;
    const id = toolCallId(message);
    const call = calls.get(id) ?? {
      id,
      toolName: "unknown_tool",
      timestamp: message.timestamp ?? 0,
      redactions: [],
    };
    const result = sanitizeDisplayText(contentText(message.content), {
      maxChars: maxResultChars,
    });
    const receipt = {
      ...call,
      id: id ? `tool-${id}` : `tool-result-${entryId(entry) ?? receipts.length}`,
      status: statusForResult(message, result.text),
      resultSummary: result.text,
      timestamp: message.timestamp ?? call.timestamp ?? 0,
      sourceEntryId: entryId(entry),
      redactions: [...(call.redactions ?? []), ...result.redactions],
    };
    receipt.isValidation = VALIDATION_RE.test(
      `${receipt.command ?? ""} ${receipt.resultSummary ?? ""}`,
    );
    receipt.priority = priorityForReceipt(receipt);
    receipt.text = receiptText(receipt);
    receipts.push(receipt);
  }

  return receipts;
}

export function extractPreviousExecutionReceipts(previousSummary) {
  return managedRecordsFromSummary(previousSummary, EXECUTION_RECEIPTS_TYPE).map((record) => ({
    ...record,
    fromPrevious: true,
  }));
}

export function renderExecutionReceiptsBlock(receipts, options = {}) {
  return buildManagedBlock({
    type: EXECUTION_RECEIPTS_TYPE,
    heading: EXECUTION_RECEIPTS_HEADING,
    records: (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
      id: receipt.id,
      kind:
        receipt.status === "failed"
          ? "failure"
          : receipt.isValidation
            ? "validation"
            : "receipt",
      text: receipt.text ?? receiptText(receipt),
      timestamp: receipt.timestamp,
      sourceEntryId: receipt.sourceEntryId,
      priority: receipt.priority ?? priorityForReceipt(receipt),
      pinned: receipt.status === "failed",
      truncated: receipt.truncated,
      fromPrevious: receipt.fromPrevious,
    })),
    maxItems: options.maxItems ?? 16,
    maxChars: options.maxChars ?? 6_000,
    maxRecordChars: options.maxRecordChars ?? 1_500,
  });
}

export function renderFileActivityBlock(files, options = {}) {
  const list = Array.isArray(files) ? files : [];
  return buildManagedBlock({
    type: FILE_ACTIVITY_TYPE,
    heading: FILE_ACTIVITY_HEADING,
    records: list.map((file, index) => ({
      id: `file-${index}-${file.displayPath ?? file.path ?? "unknown"}`,
      kind: "file_activity",
      text: `${formatManifestOperations(file)} ${file.displayPath ?? file.path ?? "unknown"}`,
      timestamp: Number.isFinite(file.lastTimestamp) ? file.lastTimestamp : index,
      source: "observed_successful_tool_activity",
      priority: file.operations?.has?.("delete")
        ? 95
        : file.operations?.has?.("edit") || file.operations?.has?.("write")
          ? 85
          : 50,
      pinned: file.operations?.has?.("delete") === true,
    })),
    maxItems: options.maxItems ?? 60,
    maxChars: options.maxChars ?? 5_000,
    maxRecordChars: 500,
  });
}
