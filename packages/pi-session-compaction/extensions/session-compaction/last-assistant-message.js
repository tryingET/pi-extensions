/**
summary: "Preserves the last assistant message verbatim across compaction as a managed summary block."
read_when:
  - "Changing last-assistant-message extraction, truncation, previous-summary fallback, or managed-block rendering."
 * Last assistant message preservation for compaction summaries.
 *
 * keepRecentTokens=0 means no assistant output survives compaction verbatim.
 * The model-generated summary paraphrases; this managed block keeps the exact
 * final assistant message so the continuation starts from the precise last
 * state (code, findings, or instructions the assistant last delivered).
 */

export const LAST_ASSISTANT_MESSAGE_HEADING = "## Last assistant message (verbatim)";
export const MAX_LAST_ASSISTANT_MESSAGE_CHARS = 4000;

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function assistantTextContent(content) {
  if (typeof content === "string") return content || undefined;
  if (!Array.isArray(content)) return undefined;

  // Prefer visible text parts; thinking blocks and tool calls are not the
  // assistant's delivered message.
  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");

  return text || undefined;
}

export function extractLastAssistantMessage(messages, maxChars = MAX_LAST_ASSISTANT_MESSAGE_CHARS) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role !== "assistant") continue;
    const text = normalizeText(assistantTextContent(message.content));
    if (!text) continue;
    return {
      text:
        text.length > maxChars
          ? `${text.slice(0, maxChars)}

[... truncated at ${maxChars} characters ...]`
          : text,
      truncated: text.length > maxChars,
      fromPrevious: false,
    };
  }
  return undefined;
}

export function extractPreviousLastAssistantMessage(previousSummary) {
  const summary = String(previousSummary ?? "");
  if (!summary.trim()) return undefined;

  const lines = summary.split(/\r?\n/);
  const headingPattern = /^##\s+Last assistant message \(verbatim\)\s*$/i;
  const anyHeadingPattern = /^#{1,6}\s+/;
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (startIndex < 0) return undefined;

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (anyHeadingPattern.test(line.trim())) break;
    sectionLines.push(line);
  }

  const text = normalizeText(sectionLines.join("\n"));
  if (!text) return undefined;
  return { text, truncated: false, fromPrevious: true };
}

export function collectLastAssistantMessage({ messages, previousSummary }) {
  return (
    extractLastAssistantMessage(messages) ?? extractPreviousLastAssistantMessage(previousSummary)
  );
}

export function renderLastAssistantMessageBlock(entry, heading = LAST_ASSISTANT_MESSAGE_HEADING) {
  const text = typeof entry === "string" ? entry : entry?.text;
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  return `${heading}\n${normalized}`;
}
