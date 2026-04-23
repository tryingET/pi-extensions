function isEscapedOrDoubled(text, index) {
  if (index <= 0) return false;
  const previous = text[index - 1];
  return previous === "\\" || previous === "$";
}

function hasUnescapedMatch(text, regex) {
  let match = regex.exec(text);
  while (match !== null) {
    if (!isEscapedOrDoubled(text, match.index)) {
      return true;
    }
    match = regex.exec(text);
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

  const positionalRegex = /\$(\d+)/g;
  let match = positionalRegex.exec(templateText);
  while (match !== null) {
    if (!isEscapedOrDoubled(templateText, match.index)) {
      const index = Number.parseInt(match[1], 10);
      if (Number.isFinite(index) && index > 0) positional.add(index);
    }
    match = positionalRegex.exec(templateText);
  }

  const sliceRegex = /\$\{@:(\d+)(?::(\d+))?\}/g;
  match = sliceRegex.exec(templateText);
  while (match !== null) {
    if (!isEscapedOrDoubled(templateText, match.index)) {
      const start = Number.parseInt(match[1], 10);
      const length = match[2] === undefined ? undefined : Number.parseInt(match[2], 10);

      if (Number.isFinite(start) && start >= 1) {
        slices.push({
          start,
          ...(Number.isFinite(length) && length > 0 ? { length } : {}),
        });
      }
    }
    match = sliceRegex.exec(templateText);
  }

  const usesAllArgs =
    hasUnescapedMatch(templateText, /\$@/g) || hasUnescapedMatch(templateText, /\$ARGUMENTS\b/g);

  const positionalIndexes = [...positional].sort((a, b) => a - b);

  return {
    positionalIndexes,
    highestPositionalIndex:
      positionalIndexes.length > 0 ? positionalIndexes[positionalIndexes.length - 1] : 0,
    usesAllArgs,
    slices,
  };
}
