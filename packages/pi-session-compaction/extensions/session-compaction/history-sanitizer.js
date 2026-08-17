/**
summary: "Redacts and normalizes untrusted session messages and branch entries."
read_when:
  - "Changing thinking omission, tool-call redaction, message caps, or branch sanitization."
*/
import { redactStructuredValue, sanitizeDisplayText } from "./redaction.js";

const FAILURE_RE =
  /\b(?:error|failed|failure|exception|permission denied|not found|timed out|timeout)\b/iu;

function entryId(entry) {
  return entry?.id ?? entry?.uuid;
}

function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function toolCallId(value) {
  return value?.id ?? value?.toolCallId ?? value?.tool_call_id ?? value?.tool_use_id;
}

export function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.thinking === "string") return part.thinking;
      if (typeof part.output === "string") return part.output;
      if (part.type === "toolCall") {
        try {
          return `${part.name ?? "unknown_tool"} ${JSON.stringify(part.arguments ?? {})}`;
        } catch {
          return String(part.name ?? "unknown_tool");
        }
      }
      if (part.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function messageFromEntry(entry) {
  if (entry?.type === "message") return { ...entry.message, _entryId: entryId(entry) };
  if (entry?.type === "custom_message") {
    return {
      role: "custom",
      customType: entry.customType,
      content: entry.content,
      display: entry.display,
      details: entry.details,
      timestamp: entry.timestamp,
      _entryId: entryId(entry),
    };
  }
  if (entry?.type === "branch_summary") {
    return {
      role: "branchSummary",
      summary: entry.summary,
      timestamp: entry.timestamp,
      _entryId: entryId(entry),
    };
  }
  return undefined;
}

export function messagesFromEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map(messageFromEntry).filter(Boolean);
}

export function estimateMessageChars(message) {
  if (!message || typeof message !== "object") return 0;
  return (
    contentText(message.content).length +
    normalizeText(message.summary).length +
    normalizeText(message.command).length +
    normalizeText(message.output).length
  );
}

export function estimateMessagesChars(messages) {
  return (Array.isArray(messages) ? messages : []).reduce(
    (sum, message) => sum + estimateMessageChars(message),
    0,
  );
}

function sanitizeText(value, maxChars) {
  return sanitizeDisplayText(value, { maxChars });
}

function sanitizeContentParts(content, options, stats) {
  const out = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "thinking") {
      stats.omittedThinkingChars += normalizeText(part.thinking).length;
      continue;
    }
    if (part.type === "text") {
      const sanitized = sanitizeText(part.text, options.maxMessageChars);
      stats.redactionCount += sanitized.redactions.length;
      stats.truncatedCount += Number(sanitized.truncated);
      if (sanitized.text) out.push({ ...part, text: sanitized.text });
      continue;
    }
    if (part.type === "toolCall") {
      const sanitized = redactStructuredValue(part.arguments ?? {}, {
        maxStringChars: options.maxArgumentChars,
        maxDepth: 4,
        maxArrayItems: 30,
        maxObjectEntries: 60,
      });
      stats.redactionCount += sanitized.redactions.length;
      out.push({ ...part, arguments: sanitized.value });
      continue;
    }
    if (part.type === "image") {
      out.push({ type: "text", text: `[image omitted: ${part.mimeType ?? "unknown"}]` });
      stats.omittedImageCount += 1;
      continue;
    }
    const text = contentText([part]);
    if (!text) continue;
    const sanitized = sanitizeText(text, options.maxToolResultChars);
    stats.redactionCount += sanitized.redactions.length;
    stats.truncatedCount += Number(sanitized.truncated);
    if (sanitized.text) out.push({ type: "text", text: sanitized.text });
  }
  return out;
}

export function sanitizeMessageForCompaction(message, options = {}, statsInput) {
  const normalizedOptions = {
    maxMessageChars: options.maxMessageChars ?? 8_000,
    maxToolResultChars: options.maxToolResultChars ?? 2_000,
    maxFailureChars: options.maxFailureChars ?? 4_000,
    maxArgumentChars: options.maxArgumentChars ?? 1_500,
  };
  const stats = statsInput ?? {
    omittedThinkingChars: 0,
    omittedImageCount: 0,
    redactionCount: 0,
    truncatedCount: 0,
  };
  if (!message || typeof message !== "object") return undefined;
  const role = message.role ?? "unknown";

  if (role === "assistant" && Array.isArray(message.content)) {
    const content = sanitizeContentParts(message.content, normalizedOptions, stats);
    return content.length > 0 ? { ...message, content } : undefined;
  }

  if (role === "toolResult") {
    const raw = contentText(message.content);
    const isFailure = message.isError === true || FAILURE_RE.test(raw);
    const sanitized = sanitizeText(
      raw,
      isFailure ? normalizedOptions.maxFailureChars : normalizedOptions.maxToolResultChars,
    );
    stats.redactionCount += sanitized.redactions.length;
    stats.truncatedCount += Number(sanitized.truncated);
    return {
      ...message,
      content: [{ type: "text", text: sanitized.text }],
    };
  }

  if (role === "bashExecution") {
    const command = sanitizeText(message.command, normalizedOptions.maxArgumentChars);
    const rawOutput = normalizeText(message.output ?? message.content);
    const isFailure = Number.isFinite(message.exitCode) && message.exitCode !== 0;
    const output = sanitizeText(
      rawOutput,
      isFailure ? normalizedOptions.maxFailureChars : normalizedOptions.maxToolResultChars,
    );
    stats.redactionCount += command.redactions.length + output.redactions.length;
    stats.truncatedCount += Number(command.truncated) + Number(output.truncated);
    return {
      ...message,
      command: command.text,
      output: output.text,
      content: output.text,
    };
  }

  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: sanitizeContentParts(message.content, normalizedOptions, stats),
    };
  }

  const raw = message.content ?? message.summary ?? message.command ?? "";
  const sanitized = sanitizeText(raw, normalizedOptions.maxMessageChars);
  stats.redactionCount += sanitized.redactions.length;
  stats.truncatedCount += Number(sanitized.truncated);
  if (message.summary !== undefined) return { ...message, summary: sanitized.text };
  if (message.command !== undefined) return { ...message, command: sanitized.text };
  return { ...message, content: sanitized.text };
}

export function sanitizeMessagesForCompaction(messages, options = {}) {
  const stats = {
    inputMessageCount: Array.isArray(messages) ? messages.length : 0,
    outputMessageCount: 0,
    omittedThinkingChars: 0,
    omittedImageCount: 0,
    redactionCount: 0,
    truncatedCount: 0,
  };
  const sanitized = (Array.isArray(messages) ? messages : [])
    .map((message) => sanitizeMessageForCompaction(message, options, stats))
    .filter(Boolean);
  stats.outputMessageCount = sanitized.length;
  return { messages: sanitized, stats };
}

export function sanitizeBranchEntries(entries, options = {}) {
  const stats = {
    inputMessageCount: 0,
    outputMessageCount: 0,
    omittedThinkingChars: 0,
    omittedImageCount: 0,
    redactionCount: 0,
    truncatedCount: 0,
  };
  const sanitizedEntries = (Array.isArray(entries) ? entries : []).map((entry) => {
    if (entry?.type === "message") {
      stats.inputMessageCount += 1;
      const message = sanitizeMessageForCompaction(entry.message, options, stats);
      if (message) stats.outputMessageCount += 1;
      return {
        ...entry,
        message: message ?? {
          ...entry.message,
          content: [],
        },
      };
    }
    if (entry?.type === "custom_message") {
      const message = sanitizeMessageForCompaction(messageFromEntry(entry), options, stats);
      return {
        ...entry,
        content: message?.content,
        details: undefined,
      };
    }
    if (entry?.type === "branch_summary") {
      const message = sanitizeMessageForCompaction(messageFromEntry(entry), options, stats);
      return { ...entry, summary: message?.summary };
    }
    return entry;
  });
  return { entries: sanitizedEntries, stats };
}
