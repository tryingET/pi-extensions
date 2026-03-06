function isEscapedOrDoubled(text, index) {
  if (index <= 0) return false;
  const previous = text[index - 1];
  return previous === "\\" || previous === "$";
}

function hasUnescapedMatch(text, regex) {
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!isEscapedOrDoubled(text, match.index)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse prompt template placeholder usage.
 * Supports:
 * - $1, $2, ...
 * - $@, $ARGUMENTS
 * - ${@:N}, ${@:N:L}
 */
export function parseTemplatePlaceholders(templateText) {
  const positional = new Set();
  const slices = [];

  let match;

  const positionalRegex = /\$(\d+)/g;
  while ((match = positionalRegex.exec(templateText)) !== null) {
    if (isEscapedOrDoubled(templateText, match.index)) continue;
    const index = Number.parseInt(match[1], 10);
    if (Number.isFinite(index) && index > 0) positional.add(index);
  }

  const sliceRegex = /\$\{@:(\d+)(?::(\d+))?\}/g;
  while ((match = sliceRegex.exec(templateText)) !== null) {
    if (isEscapedOrDoubled(templateText, match.index)) continue;
    const start = Number.parseInt(match[1], 10);
    const length = match[2] === undefined ? undefined : Number.parseInt(match[2], 10);

    if (!Number.isFinite(start) || start < 1) continue;

    slices.push({
      start,
      ...(Number.isFinite(length) && length > 0 ? { length } : {}),
    });
  }

  const usesAllArgs =
    hasUnescapedMatch(templateText, /\$@/g) || hasUnescapedMatch(templateText, /\$ARGUMENTS\b/g);

  const positionalIndexes = [...positional].sort((a, b) => a - b);

  return {
    positionalIndexes,
    highestPositionalIndex: positionalIndexes.length > 0 ? positionalIndexes[positionalIndexes.length - 1] : 0,
    usesAllArgs,
    slices,
  };
}
