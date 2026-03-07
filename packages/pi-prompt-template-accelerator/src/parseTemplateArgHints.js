function isEscapedOrDoubled(text, index) {
  if (index <= 0) return false;
  const previous = text[index - 1];
  return previous === "\\" || previous === "$";
}

function normalizeHintLine(line) {
  const withoutPlaceholders = line
    .replace(/\$(\d+)/g, " ")
    .replace(/\$\{@:(\d+)(?::(\d+))?\}/g, " ")
    .replace(/\$@/g, " ")
    .replace(/\$ARGUMENTS\b/g, " ");

  const normalized = withoutPlaceholders
    .replace(/^[\s>*-]+/, "")
    .replace(/^[0-9]+[.)]\s*/, "")
    .replace(/[`*_#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : undefined;
}

function addUniqueRestHint(restHints, start, hint) {
  if (!hint) return;
  if (!Number.isFinite(start) || start < 1) return;
  if (restHints.some((entry) => entry.start === start && entry.hint === hint)) return;
  restHints.push({ start, hint });
}

/**
 * Parse lightweight line-level hints around placeholders.
 * Used to decide how missing args should be inferred.
 */
export function parseTemplateArgHints(templateText) {
  const positionalHints = {};
  const restHints = [];

  const lines = templateText.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.trim().length === 0) continue;

    const hint = normalizeHintLine(line);
    if (!hint) continue;

    let match;

    const positionalRegex = /\$(\d+)/g;
    while ((match = positionalRegex.exec(line)) !== null) {
      if (isEscapedOrDoubled(line, match.index)) continue;
      const index = Number.parseInt(match[1], 10);
      if (!Number.isFinite(index) || index < 1) continue;
      if (positionalHints[index] === undefined) {
        positionalHints[index] = hint;
      }
    }

    const allArgsRegex = /\$@|\$ARGUMENTS\b/g;
    while ((match = allArgsRegex.exec(line)) !== null) {
      if (isEscapedOrDoubled(line, match.index)) continue;
      addUniqueRestHint(restHints, 1, hint);
    }

    const sliceRegex = /\$\{@:(\d+)(?::(\d+))?\}/g;
    while ((match = sliceRegex.exec(line)) !== null) {
      if (isEscapedOrDoubled(line, match.index)) continue;
      const start = Number.parseInt(match[1], 10);
      addUniqueRestHint(restHints, start, hint);
    }
  }

  return {
    positionalHints,
    restHints,
  };
}
