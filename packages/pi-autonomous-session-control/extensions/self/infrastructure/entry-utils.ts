/**
 * Session entry utilities.
 * Helpers for describing, summarizing, and manipulating session entries.
 */

import type { SessionEntry } from "@mariozechner/pi-coding-agent";

type TextBlock = { type: string; text?: string; name?: string };

type MessageLike = {
  role?: string;
  content?: unknown;
  toolName?: string;
  command?: string;
  customType?: string;
  summary?: string;
};

function asTextBlocks(content: unknown): TextBlock[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(
      (block): block is Record<string, unknown> => typeof block === "object" && block !== null,
    )
    .map((block) => ({
      type: typeof block.type === "string" ? block.type : "unknown",
      text: typeof block.text === "string" ? block.text : undefined,
      name: typeof block.name === "string" ? block.name : undefined,
    }));
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Truncate and normalize text for display.
 */
export function safeText(value: string, max = 140): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

/**
 * Sanitize a string for use in labels (remove special chars, limit length).
 */
export function sanitizeLabelChunk(value: string, max = 36): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return "item";
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max);
}

// ============================================================================
// CHECKPOINT LABELS
// ============================================================================

/**
 * Generate a timestamped checkpoint label.
 */
export function makeCheckpointLabel(): string {
  return `checkpoint-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

/**
 * Generate a risk checkpoint label with reason and optional file path.
 */
export function makeRiskCheckpointLabel(reason: string, filePath?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reasonChunk = sanitizeLabelChunk(reason, 24);
  if (!filePath) return `pre-risk-${reasonChunk}-${ts}`;
  return `pre-risk-${reasonChunk}-${sanitizeLabelChunk(filePath)}-${ts}`;
}

// ============================================================================
// MESSAGE PREVIEW HELPERS
// ============================================================================

/**
 * Get a short preview of a user message.
 */
export function previewUserMessage(msg: MessageLike): string {
  if (typeof msg.content === "string") return safeText(msg.content);
  for (const block of asTextBlocks(msg.content)) {
    if (block.type === "text" && block.text) return safeText(block.text);
  }
  return "[non-text content]";
}

/**
 * Get a short preview of an assistant message.
 */
export function previewAssistantMessage(msg: MessageLike): string {
  const texts: string[] = [];
  const calls: string[] = [];

  for (const block of asTextBlocks(msg.content)) {
    if (block.type === "text" && block.text) texts.push(block.text);
    if (block.type === "toolCall" && block.name) calls.push(block.name);
  }

  if (texts.length > 0) return safeText(texts.join(" "));
  if (calls.length > 0) return `tool calls: ${calls.join(", ")}`;
  return "[assistant message]";
}

/**
 * Get a short preview of a tool result message.
 */
export function previewToolResult(msg: MessageLike): string {
  const texts: string[] = [];
  for (const block of asTextBlocks(msg.content)) {
    if (block.type === "text" && block.text) texts.push(block.text);
  }
  if (texts.length > 0) return safeText(texts.join(" "));
  return `${msg.toolName ?? "tool"} result`;
}

// ============================================================================
// ENTRY DESCRIPTION
// ============================================================================

/**
 * Get a human-readable description of a session entry.
 * Useful for logging, summaries, and debugging.
 */
export function describeEntry(entry: SessionEntry): string {
  if (entry.type === "message") {
    const msg = entry.message as MessageLike;
    const role = msg.role ?? "unknown";

    if (role === "user") return `[user] ${previewUserMessage(msg)}`;
    if (role === "assistant") return `[assistant] ${previewAssistantMessage(msg)}`;
    if (role === "toolResult")
      return `[tool:${msg.toolName ?? "unknown"}] ${previewToolResult(msg)}`;
    if (role === "bashExecution") return `[bash] ${safeText(msg.command ?? "")}`;
    if (role === "custom") return `[custom:${msg.customType ?? "unknown"}]`;
    if (role === "compactionSummary") return `[compaction-summary] ${safeText(msg.summary ?? "")}`;
    if (role === "branchSummary") return `[branch-summary] ${safeText(msg.summary ?? "")}`;
    return `[${role}]`;
  }

  if (entry.type === "compaction") return `[compaction] ${safeText(entry.summary)}`;
  if (entry.type === "branch_summary") return `[branch_summary] ${safeText(entry.summary)}`;
  if (entry.type === "label") return `[label] ${entry.label ?? "(cleared)"}`;
  if (entry.type === "model_change") return `[model] ${entry.provider}/${entry.modelId}`;
  if (entry.type === "thinking_level_change") return `[thinking] ${entry.thinkingLevel}`;
  if (entry.type === "session_info") return `[session] ${entry.name ?? "(unnamed)"}`;
  if (entry.type === "custom_message") return `[custom_message:${entry.customType}]`;
  if (entry.type === "custom") return `[custom:${entry.customType}]`;
  return `[${(entry as { type: string }).type}]`;
}

// ============================================================================
// ENTRY EXTRACTION
// ============================================================================

/**
 * Extract text content from a user message.
 */
export function extractUserText(entry: SessionEntry): string {
  if (entry.type !== "message") return "";

  const message = entry.message as MessageLike;
  if (message.role !== "user") return "";

  if (typeof message.content === "string") return message.content;
  return asTextBlocks(message.content)
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Extract text content from an assistant message.
 */
export function extractAssistantText(message?: MessageLike): string {
  if (!message) return "";

  return asTextBlocks(message.content)
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Check if an assistant message contains tool calls.
 */
export function messageHasToolCalls(message?: MessageLike): boolean {
  if (!message) return false;
  return asTextBlocks(message.content).some((block) => block.type === "toolCall");
}
