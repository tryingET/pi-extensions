/**
 * User prompt and slash-command preservation helpers for compaction summaries.
 *
 * Adapted from legacy pi-user-prompt-compaction, with package-local support for
 * preserving `/compact` customInstructions before the live hook is wired.
 */

export const TIMESTAMP_MATCH_WINDOW_MS = 3000;
export const MAX_TRACKED_COMMANDS = 100;
export const ESSENTIAL_USER_PROMPTS_HEADING =
  "## Essential user prompts / commands + arguments used";

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function timestampOf(message) {
  const value = message?.timestamp;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstTextContent(content) {
  if (typeof content === "string") return content || undefined;
  if (!Array.isArray(content)) return undefined;

  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");

  return text || undefined;
}

function isSamePromptText(a, b) {
  return a.text === b.text;
}

function sortPromptEntries(prompts) {
  return [...prompts].sort((a, b) => a.timestamp - b.timestamp);
}

function uniqueByText(prompts) {
  const out = [];
  for (const prompt of sortPromptEntries(prompts)) {
    if (!out.some((existing) => isSamePromptText(existing, prompt))) {
      out.push(prompt);
    }
  }
  return out;
}

export function validateAndExtractText(response, context) {
  if (response?.stopReason === "error") {
    throw new Error(`${context} failed: ${response.errorMessage || "Unknown error"}`);
  }
  if (response?.stopReason === "rate_limited") {
    throw new Error(`${context} failed: Rate limited. Please retry.`);
  }
  if (response?.stopReason === "content_filter") {
    throw new Error(`${context} failed: Content filter triggered.`);
  }

  return Array.isArray(response?.content)
    ? response.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
    : "";
}

export function parseSkillBlock(text) {
  const match = String(text ?? "").match(
    /^<skill\s+name="([^"]+)"\s+location="[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/skill>(?:\s*([\s\S]+))?$/,
  );
  if (!match) return null;

  const userMessage = normalizeText(match[3]);
  return {
    name: match[1],
    userMessage,
  };
}

export function extractTextContent(content) {
  return firstTextContent(content) ?? null;
}

function findMatchingTrackedCommand(messageTimestamp, trackedCommands, timestampMatchWindowMs) {
  return trackedCommands.find(
    (command) => Math.abs(command.timestamp - messageTimestamp) < timestampMatchWindowMs,
  );
}

export function extractUserPrompts(
  messages,
  trackedCommands = [],
  timestampMatchWindowMs = TIMESTAMP_MATCH_WINDOW_MS,
) {
  const prompts = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "user") continue;

    const content = extractTextContent(message.content);
    if (!content) continue;

    const messageTimestamp = timestampOf(message);
    const skillBlock = parseSkillBlock(content);
    if (skillBlock) {
      prompts.push({
        text: skillBlock.userMessage
          ? `/skill:${skillBlock.name} ${skillBlock.userMessage}`
          : `/skill:${skillBlock.name}`,
        timestamp: messageTimestamp,
        isSkill: true,
        skillName: skillBlock.name,
      });
      continue;
    }

    const matchingCommand = findMatchingTrackedCommand(
      messageTimestamp,
      trackedCommands,
      timestampMatchWindowMs,
    );
    if (matchingCommand) {
      prompts.push({
        text: matchingCommand.original,
        timestamp: messageTimestamp,
        isTemplate: !matchingCommand.original.startsWith("/skill:"),
      });
      continue;
    }

    prompts.push({
      text: content,
      timestamp: messageTimestamp,
    });
  }

  return sortPromptEntries(prompts);
}

export function formatCompactInstruction(customInstructions) {
  const text = normalizeText(customInstructions);
  return text ? `/compact ${text}` : undefined;
}

export function extractCustomInstructionPrompt(customInstructions, timestamp = Date.now()) {
  const text = formatCompactInstruction(customInstructions);
  return text
    ? {
        text,
        timestamp,
        isCommand: true,
        commandName: "compact",
      }
    : undefined;
}

export function collectCurrentUserPrompts(options = {}) {
  const prompts = extractUserPrompts(
    options.messages ?? [],
    options.trackedCommands ?? [],
    options.timestampMatchWindowMs ?? TIMESTAMP_MATCH_WINDOW_MS,
  );

  const compactPrompt = extractCustomInstructionPrompt(
    options.customInstructions,
    options.customInstructionsTimestamp ?? Date.now(),
  );
  if (compactPrompt) prompts.push(compactPrompt);

  return uniqueByText(prompts);
}

export function extractPreviousUserPrompts(previousSummary) {
  const summary = String(previousSummary ?? "");
  if (!summary.trim()) return [];

  const lines = summary.split(/\r?\n/);
  const headingPattern =
    /^#{2,3}\s+(?:Essential user prompts \/ commands \+ arguments used|User prompts in this turn)\s*$/i;
  const anyHeadingPattern = /^#{1,6}\s+/;
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (startIndex < 0) return [];

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (anyHeadingPattern.test(line.trim())) break;
    sectionLines.push(line);
  }

  const prompts = [];
  const baseTimestamp = new Date().setMinutes(0, 0, 0) - 3600000;
  let itemIndex = 1;
  for (const line of sectionLines) {
    const match = line.match(/^\s*\d+\.\s+(.+)$/);
    if (!match) continue;

    const text = match[1].trim();
    prompts.push({
      text,
      timestamp: baseTimestamp + itemIndex * 1000,
      isSkill: text.startsWith("/skill:"),
      isCommand: text.startsWith("/"),
      commandName: text.startsWith("/") ? text.slice(1).split(/\s|:/, 1)[0] : undefined,
    });
    itemIndex += 1;
  }

  return prompts;
}

export function mergeUserPrompts(previousPrompts = [], currentPrompts = []) {
  return uniqueByText([...previousPrompts, ...currentPrompts]);
}

export function formatUserPrompts(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return "1. (none)";
  }

  return sortPromptEntries(prompts)
    .map((prompt, index) => `${index + 1}. ${prompt.text}`)
    .join("\n");
}

export function renderEssentialUserPromptsBlock(prompts, heading = ESSENTIAL_USER_PROMPTS_HEADING) {
  return `${heading}\n${formatUserPrompts(prompts)}`;
}

export function createTrackedCommandStore(options = {}) {
  const maxTrackedCommands = options.maxTrackedCommands ?? MAX_TRACKED_COMMANDS;
  const timestampMatchWindowMs = options.timestampMatchWindowMs ?? TIMESTAMP_MATCH_WINDOW_MS;
  const trackedCommands = [];

  function prune() {
    if (trackedCommands.length <= maxTrackedCommands) return;
    trackedCommands.sort((a, b) => b.timestamp - a.timestamp);
    trackedCommands.splice(maxTrackedCommands);
  }

  return {
    get trackedCommands() {
      return trackedCommands;
    },
    trackInput(text, timestamp = Date.now()) {
      const normalized = normalizeText(text);
      if (!normalized || !normalized.startsWith("/")) return false;
      trackedCommands.push({ original: normalized, timestamp });
      prune();
      return true;
    },
    clearMatched(messages) {
      const userMessageTimestamps = new Set(
        (Array.isArray(messages) ? messages : [])
          .filter((message) => message?.role === "user")
          .map((message) => timestampOf(message)),
      );

      for (let index = trackedCommands.length - 1; index >= 0; index -= 1) {
        const command = trackedCommands[index];
        const hasMatch = [...userMessageTimestamps].some(
          (timestamp) => Math.abs(command.timestamp - timestamp) < timestampMatchWindowMs,
        );
        if (hasMatch) trackedCommands.splice(index, 1);
      }
      prune();
    },
  };
}
