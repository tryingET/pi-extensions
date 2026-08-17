/**
summary: "Selects bounded, high-value history while preserving user and tool-result closures."
read_when:
  - "Changing history priorities, recent-tail preservation, or tool call/result coupling."
*/
import { estimateTextTokens, fitTextToTokenBudget, tokenBudgetToChars } from "./budget.js";
import {
  contentText,
  estimateMessageChars,
  sanitizeMessagesForCompaction,
  toolCallId,
} from "./history-sanitizer.js";
import { sanitizeDisplayText } from "./redaction.js";

const FAILURE_RE =
  /\b(?:error|failed|failure|exception|permission denied|not found|timed out|timeout)\b/iu;
const VALIDATION_RE =
  /\b(?:npm|pnpm|yarn|bun|node|pytest|cargo|go|mvn|gradle)\b[^\n]*(?:test|spec|check|lint|build|typecheck|tsc)|\b(?:test|lint|typecheck|build)\b/iu;
const CORRECTION_RE =
  /\b(?:actually|correction|instead|must|never|always|do not|don't|prefer|constraint|scope change)\b/iu;
const CHANGE_TOOL_RE = /^(?:edit|write|apply_patch|quick_edit|multiedit|move|delete)$/iu;

function messagePriority(message, index, total) {
  const role = message?.role ?? "unknown";
  const text = `${contentText(message?.content)} ${message?.command ?? ""} ${message?.output ?? ""}`;
  const recency = total <= 1 ? 0 : Math.round((index / (total - 1)) * 15);
  if (role === "user") return (CORRECTION_RE.test(text) ? 100 : 90) + recency;
  if (role === "toolResult") {
    if (message?.isError === true || FAILURE_RE.test(text)) return 100 + recency;
    if (VALIDATION_RE.test(text)) return 88 + recency;
    return 28 + recency;
  }
  if (role === "bashExecution") {
    if (Number.isFinite(message.exitCode) && message.exitCode !== 0) return 100 + recency;
    if (VALIDATION_RE.test(text)) return 88 + recency;
    return 55 + recency;
  }
  if (role === "assistant") {
    const toolCalls = Array.isArray(message.content)
      ? message.content.filter((part) => part?.type === "toolCall")
      : [];
    if (toolCalls.some((part) => CHANGE_TOOL_RE.test(part.name ?? ""))) return 82 + recency;
    if (toolCalls.length > 0) return 60 + recency;
    return 68 + recency;
  }
  if (role === "custom" || role === "branchSummary") return 65 + recency;
  return 30 + recency;
}

function buildToolCoupling(messages) {
  const callIndexById = new Map();
  const resultIndexById = new Map();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type !== "toolCall") continue;
        const id = toolCallId(part);
        if (id) callIndexById.set(id, index);
      }
    }
    if (message?.role === "toolResult") {
      const id = toolCallId(message);
      if (id) resultIndexById.set(id, index);
    }
  }

  const indicesByCallMessage = new Map();
  for (const [id, callIndex] of callIndexById) {
    const resultIndex = resultIndexById.get(id);
    if (resultIndex === undefined) continue;
    const indices = indicesByCallMessage.get(callIndex) ?? new Set([callIndex]);
    indices.add(resultIndex);
    indicesByCallMessage.set(callIndex, indices);
  }

  const coupled = new Map();
  for (const [callIndex, indices] of indicesByCallMessage) {
    coupled.set(callIndex, indices);
    for (const index of indices) coupled.set(index, indices);
  }
  return coupled;
}

function closureFor(index, coupled) {
  return coupled.get(index) ?? new Set([index]);
}

function addClosure(selected, closure, costs, usedChars, maxChars) {
  const missing = [...closure].filter((index) => !selected.has(index));
  const addedCost = missing.reduce((sum, index) => sum + costs[index], 0);
  if (usedChars + addedCost > maxChars) return { added: false, usedChars };
  for (const index of missing) selected.add(index);
  return { added: true, usedChars: usedChars + addedCost };
}

function fitMessageToCharBudget(message, maxChars, charsPerToken) {
  const maxContentChars = Math.max(1, maxChars - 24);
  const maxContentTokens = Math.max(1, Math.floor(maxContentChars / charsPerToken));
  const sanitized = sanitizeDisplayText(contentText(message?.content)).text;
  const fitted = fitTextToTokenBudget(sanitized, maxContentTokens, {
    charsPerToken,
    preserveTailFraction: 0.2,
    marker: "\n\n[... latest user request truncated to fit input budget ...]\n\n",
  }).text;
  return {
    ...message,
    content: typeof message?.content === "string" ? fitted : [{ type: "text", text: fitted }],
  };
}

export function selectMessagesWithinBudget(messages, maxTokens, options = {}) {
  const charsPerToken = options.charsPerToken ?? 4;
  const maxChars = tokenBudgetToChars(maxTokens, charsPerToken);
  const sanitized = sanitizeMessagesForCompaction(messages, {
    ...options,
    maxMessageChars: Math.min(options.maxMessageChars ?? 8_000, Math.max(1, maxChars - 24)),
  });
  const list = sanitized.messages;
  const latestUserIndex = list.findLastIndex((message) => message?.role === "user");
  if (latestUserIndex >= 0 && estimateMessageChars(list[latestUserIndex]) + 24 > maxChars) {
    list[latestUserIndex] = fitMessageToCharBudget(list[latestUserIndex], maxChars, charsPerToken);
  }
  const preserveRecentMessages = Math.max(0, Math.floor(options.preserveRecentMessages ?? 12));
  const costs = list.map((message) => Math.max(1, estimateMessageChars(message) + 24));
  const coupled = buildToolCoupling(list);
  const selected = new Set();
  let usedChars = 0;

  for (
    let index = list.length - 1;
    index >= Math.max(0, list.length - preserveRecentMessages);
    index -= 1
  ) {
    const result = addClosure(selected, closureFor(index, coupled), costs, usedChars, maxChars);
    if (result.added) usedChars = result.usedChars;
  }

  if (latestUserIndex >= 0) {
    const result = addClosure(
      selected,
      closureFor(latestUserIndex, coupled),
      costs,
      usedChars,
      maxChars,
    );
    if (result.added) usedChars = result.usedChars;
  }

  const ranked = list
    .map((message, index) => ({
      index,
      score: messagePriority(message, index, list.length),
    }))
    .sort((left, right) => right.score - left.score || right.index - left.index);

  for (const candidate of ranked) {
    if (selected.has(candidate.index)) continue;
    const result = addClosure(
      selected,
      closureFor(candidate.index, coupled),
      costs,
      usedChars,
      maxChars,
    );
    if (result.added) usedChars = result.usedChars;
  }

  const selectedIndices = [...selected].sort((left, right) => left - right);
  const selectedMessages = selectedIndices.map((index) => list[index]);
  return {
    messages: selectedMessages,
    selectedIndices,
    omittedCount: Math.max(0, list.length - selectedMessages.length),
    usedChars,
    maxChars,
    estimatedTokens: estimateTextTokens(
      selectedMessages.map((message) => contentText(message.content)).join("\n\n"),
      charsPerToken,
    ),
    sanitization: sanitized.stats,
  };
}
