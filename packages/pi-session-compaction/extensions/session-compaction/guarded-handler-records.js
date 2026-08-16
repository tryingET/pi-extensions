/**
summary: "Builds bounded exact prompt and last-assistant records for guarded compaction."
read_when:
  - "Changing exact prompt selection, priority, migration, or last-assistant preservation."
*/
import {
  collectLastAssistantMessage,
  extractLastAssistantMessage,
} from "./last-assistant-message.js";
import { managedRecordsFromSummary } from "./managed-block-codec.js";
import {
  collectCurrentUserPrompts,
  extractPreviousUserPrompts,
} from "./user-prompts.js";

export const ESSENTIAL_PROMPTS_TYPE = "essential-prompts";
export const LAST_ASSISTANT_TYPE = "last-assistant";
export const ESSENTIAL_PROMPTS_HEADING =
  "## Essential user prompts / commands + arguments used";
export const LAST_ASSISTANT_HEADING = "## Last assistant message (verbatim)";

function promptFlag(prompt, key) {
  return Boolean(
    prompt && typeof prompt === "object" && key in prompt && prompt[key] === true,
  );
}

function promptPriority(prompt, index, latestIndex) {
  if (promptFlag(prompt, "isCommand")) return 105;
  if (/\b(?:actually|correction|instead|must|never|always|do not|don't|prefer)\b/iu.test(prompt.text)) {
    return 100;
  }
  if (index === latestIndex) return 95;
  if (promptFlag(prompt, "isSkill") || promptFlag(prompt, "isTemplate")) return 90;
  return 75;
}

export function promptRecords({
  previousSummary,
  messages,
  trackedCommands,
  customInstructions,
}) {
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
  const currentPrompts = collectCurrentUserPrompts({
    messages,
    trackedCommands,
    customInstructions,
  });
  const ordinaryPromptIndices = currentPrompts
    .map((prompt, index) => ({ prompt, index }))
    .filter(
      ({ prompt }) =>
        !promptFlag(prompt, "isCommand") &&
        !promptFlag(prompt, "isSkill") &&
        !promptFlag(prompt, "isTemplate"),
    )
    .map(({ index }) => index);
  const firstOrdinaryIndex = ordinaryPromptIndices[0];
  const lastOrdinaryIndex = ordinaryPromptIndices.at(-1);
  const latestIndex = currentPrompts.length - 1;
  const currentRecords = currentPrompts.map((prompt, index) => ({
    id: `current-prompt-${index}-${prompt.timestamp ?? 0}`,
    kind: promptFlag(prompt, "isCommand")
      ? "command"
      : promptFlag(prompt, "isSkill")
        ? "skill"
        : "prompt",
    text: prompt.text,
    timestamp: prompt.timestamp ?? Date.now() + index,
    priority: promptPriority(prompt, index, latestIndex),
    pinned: index === firstOrdinaryIndex || index === lastOrdinaryIndex,
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
