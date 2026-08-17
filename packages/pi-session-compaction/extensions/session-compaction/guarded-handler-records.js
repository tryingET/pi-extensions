/**
summary: "Builds bounded exact prompt and last-assistant records for guarded compaction."
read_when:
  - "Changing exact prompt selection, priority, migration, supersession, or last-assistant preservation."
*/
import {
  collectLastAssistantMessage,
  extractLastAssistantMessage,
} from "./last-assistant-message.js";
import { managedRecordsFromSummary } from "./managed-block-codec.js";
import { dedupePromptsByLatestText } from "./prompt-selection.js";
import {
  extractCustomInstructionPrompt,
  extractPreviousUserPrompts,
  extractUserPrompts,
} from "./user-prompts.js";

export const ESSENTIAL_PROMPTS_TYPE = "essential-prompts";
export const LAST_ASSISTANT_TYPE = "last-assistant";
export const ESSENTIAL_PROMPTS_HEADING = "## Essential user prompts / commands + arguments used";
export const LAST_ASSISTANT_HEADING = "## Last assistant message (verbatim)";

const LOW_VALUE_ACKNOWLEDGEMENT_RE =
  /^(?:ok(?:ay)?|thanks?|thank you|yes|no|continue|go ahead|sounds good|great|got it)[.?!\s]*$/iu;
const CORRECTION_RE =
  /\b(?:actually|correction|instead|must|never|always|do not|don't|prefer|change of plan|new requirement)\b/iu;

function promptFlag(prompt, key) {
  return Boolean(prompt && typeof prompt === "object" && key in prompt && prompt[key] === true);
}

function isCorrection(prompt) {
  return CORRECTION_RE.test(String(prompt?.text ?? ""));
}

function isSpecialPrompt(prompt) {
  return (
    promptFlag(prompt, "isCommand") ||
    promptFlag(prompt, "isSkill") ||
    promptFlag(prompt, "isTemplate")
  );
}

function promptPriority(prompt, sourceIndex, latestSourceIndex) {
  if (promptFlag(prompt, "isCommand")) return 105;
  if (isCorrection(prompt)) return 100;
  if (sourceIndex === latestSourceIndex) return 95;
  if (promptFlag(prompt, "isSkill") || promptFlag(prompt, "isTemplate")) return 90;
  return 75;
}

export function promptRecords({ previousSummary, messages, trackedCommands, customInstructions }) {
  const previousLegacy = extractPreviousUserPrompts(previousSummary).map((prompt, index) => ({
    id: `legacy-prompt-${index}-${prompt.timestamp ?? 0}`,
    kind: promptFlag(prompt, "isCommand") ? "command" : "prompt",
    text: prompt.text,
    timestamp: prompt.timestamp ?? index,
    priority: promptFlag(prompt, "isCommand") ? 90 : 65,
    fromPrevious: true,
  }));
  const previousV2 = managedRecordsFromSummary(previousSummary, ESSENTIAL_PROMPTS_TYPE).map(
    (record) => ({
      ...record,
      fromPrevious: true,
    }),
  );
  const currentPrompts = dedupePromptsByLatestText([
    ...extractUserPrompts(messages, trackedCommands),
    ...(() => {
      const compactPrompt = extractCustomInstructionPrompt(customInstructions, Date.now());
      return compactPrompt ? [compactPrompt] : [];
    })(),
  ]);
  const ordinaryPromptIndices = currentPrompts
    .map((prompt, index) => ({ prompt, index }))
    .filter(({ prompt }) => !isSpecialPrompt(prompt))
    .map(({ index }) => index);
  const firstOrdinaryIndex = ordinaryPromptIndices[0];
  const lastOrdinaryIndex = ordinaryPromptIndices.at(-1);
  const latestSourceIndex = currentPrompts.length - 1;
  const selectedPrompts = currentPrompts
    .map((prompt, sourceIndex) => ({ prompt, sourceIndex }))
    .filter(({ prompt, sourceIndex }) => {
      if (isSpecialPrompt(prompt) || isCorrection(prompt)) return true;
      if (sourceIndex === firstOrdinaryIndex || sourceIndex === lastOrdinaryIndex) return true;
      return !LOW_VALUE_ACKNOWLEDGEMENT_RE.test(String(prompt.text ?? "").trim());
    });
  const currentRecords = selectedPrompts.map(({ prompt, sourceIndex }) => ({
    id: `current-prompt-${sourceIndex}-${prompt.timestamp ?? 0}`,
    kind: promptFlag(prompt, "isCommand")
      ? "command"
      : promptFlag(prompt, "isSkill")
        ? "skill"
        : "prompt",
    text: prompt.text,
    timestamp: prompt.timestamp ?? Date.now() + sourceIndex,
    priority: promptPriority(prompt, sourceIndex, latestSourceIndex),
    pinned:
      sourceIndex === firstOrdinaryIndex ||
      sourceIndex === lastOrdinaryIndex ||
      isCorrection(prompt),
    source: "current_summarized_span",
  }));
  return [...previousLegacy, ...previousV2, ...currentRecords];
}

export function lastAssistantRecords({ previousSummary, messages }) {
  const current = extractLastAssistantMessage(messages, Number.MAX_SAFE_INTEGER);
  if (current?.text) {
    return [
      {
        id: "latest-dropped-assistant",
        kind: "assistant",
        text: current.text,
        timestamp: Date.now(),
        priority: 100,
        pinned: true,
        source: "summarized_span",
        truncated: current.truncated,
      },
    ];
  }
  const previousV2 = managedRecordsFromSummary(previousSummary, LAST_ASSISTANT_TYPE);
  if (previousV2.length > 0) {
    return previousV2.map((record) => ({ ...record, fromPrevious: true }));
  }
  const previous = collectLastAssistantMessage({ messages: [], previousSummary });
  return previous?.text
    ? [
        {
          id: "legacy-previous-assistant",
          kind: "assistant",
          text: previous.text,
          timestamp: 0,
          priority: 100,
          pinned: true,
          source: "previous_summary",
          fromPrevious: true,
        },
      ]
    : [];
}
