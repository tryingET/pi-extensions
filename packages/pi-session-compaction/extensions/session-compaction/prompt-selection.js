/**
summary: "Deterministically deduplicates prompt candidates while preserving renewed recency and metadata."
read_when:
  - "Changing repeated-prompt priority or exact prompt selection across compaction."
*/

function timestamp(value, fallback) {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function mergeBooleanFlag(previous, current, key) {
  return previous?.[key] === true || current?.[key] === true ? true : undefined;
}

/**
 * Keep one record per exact prompt text, but let a repeated prompt renew its
 * timestamp and priority. This prevents an early occurrence from masking a
 * later explicit restatement of the same instruction.
 */
export function dedupePromptsByLatestText(prompts = []) {
  const byText = new Map();
  for (const [sourceIndex, candidate] of (Array.isArray(prompts) ? prompts : []).entries()) {
    const text = typeof candidate?.text === "string" ? candidate.text.trim() : "";
    if (!text) continue;
    const normalized = {
      ...candidate,
      text,
      timestamp: timestamp(candidate.timestamp, sourceIndex),
      sourceIndex,
    };
    const previous = byText.get(text);
    if (
      previous &&
      (previous.timestamp > normalized.timestamp ||
        (previous.timestamp === normalized.timestamp && previous.sourceIndex > sourceIndex))
    ) {
      continue;
    }
    byText.set(text, {
      ...previous,
      ...normalized,
      isCommand: mergeBooleanFlag(previous, normalized, "isCommand"),
      isSkill: mergeBooleanFlag(previous, normalized, "isSkill"),
      isTemplate: mergeBooleanFlag(previous, normalized, "isTemplate"),
      commandName: normalized.commandName ?? previous?.commandName,
      skillName: normalized.skillName ?? previous?.skillName,
    });
  }
  return [...byText.values()]
    .sort((left, right) => left.timestamp - right.timestamp || left.sourceIndex - right.sourceIndex)
    .map(({ sourceIndex: _sourceIndex, ...prompt }) => prompt);
}
