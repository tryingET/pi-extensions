const PREFIX_PATTERNS = [/^(\s*\$\$\s+)/, /^(\s*\/ptx-preview\s+)/];

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function normalizeAutocompleteSuggestions(suggestions) {
  if (!suggestions || typeof suggestions !== "object") return null;
  if (!Array.isArray(suggestions.items)) return null;

  return {
    items: suggestions.items,
    prefix: typeof suggestions.prefix === "string" ? suggestions.prefix : "",
  };
}

function normalizeMaybeAsyncSuggestions(result) {
  if (isPromiseLike(result)) {
    return result.then((value) => normalizeAutocompleteSuggestions(value));
  }

  return normalizeAutocompleteSuggestions(result);
}

function getAutocompleteAdaptationPrefixForLine(line, cursorCol) {
  const textBeforeCursor = line.slice(0, cursorCol);

  for (const pattern of PREFIX_PATTERNS) {
    const match = textBeforeCursor.match(pattern);
    if (!match) continue;

    const prefix = match[1];
    const afterPrefix = textBeforeCursor.slice(prefix.length);
    if (!afterPrefix.startsWith("/")) continue;

    return prefix;
  }

  return null;
}

export function getDollarSlashAdaptation(lines, cursorLine, cursorCol) {
  const line = lines[cursorLine] ?? "";
  const prefix = getAutocompleteAdaptationPrefixForLine(line, cursorCol);
  if (!prefix) return null;

  const adaptedLines = [...lines];
  adaptedLines[cursorLine] = line.slice(prefix.length);

  return {
    prefix,
    cursorLine,
    adaptedLines,
    adaptedCursorCol: Math.max(0, cursorCol - prefix.length),
  };
}

export class DollarPrefixAutocompleteProvider {
  constructor(inner) {
    this.inner = inner;
  }

  getSuggestions(lines, cursorLine, cursorCol, options) {
    const adaptation = getDollarSlashAdaptation(lines, cursorLine, cursorCol);
    if (!adaptation) {
      return normalizeMaybeAsyncSuggestions(
        this.inner.getSuggestions(lines, cursorLine, cursorCol, options),
      );
    }

    return normalizeMaybeAsyncSuggestions(
      this.inner.getSuggestions(
        adaptation.adaptedLines,
        cursorLine,
        adaptation.adaptedCursorCol,
        options,
      ),
    );
  }

  applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
    const adaptation = getDollarSlashAdaptation(lines, cursorLine, cursorCol);
    if (!adaptation) {
      return this.inner.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    }

    const result = this.inner.applyCompletion(
      adaptation.adaptedLines,
      cursorLine,
      adaptation.adaptedCursorCol,
      item,
      prefix,
    );

    const nextLines = [...result.lines];
    const targetLine = nextLines[adaptation.cursorLine] ?? "";
    nextLines[adaptation.cursorLine] = adaptation.prefix + targetLine;

    return {
      lines: nextLines,
      cursorLine: result.cursorLine,
      cursorCol:
        result.cursorLine === adaptation.cursorLine
          ? result.cursorCol + adaptation.prefix.length
          : result.cursorCol,
    };
  }

  getForceFileSuggestions(lines, cursorLine, cursorCol) {
    if (typeof this.inner.getForceFileSuggestions !== "function") return null;

    const adaptation = getDollarSlashAdaptation(lines, cursorLine, cursorCol);
    if (!adaptation) {
      return normalizeMaybeAsyncSuggestions(this.inner.getForceFileSuggestions(lines, cursorLine, cursorCol));
    }

    return normalizeMaybeAsyncSuggestions(
      this.inner.getForceFileSuggestions(
        adaptation.adaptedLines,
        cursorLine,
        adaptation.adaptedCursorCol,
      ),
    );
  }

  shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
    if (typeof this.inner.shouldTriggerFileCompletion !== "function") return true;

    const adaptation = getDollarSlashAdaptation(lines, cursorLine, cursorCol);
    if (!adaptation) {
      return this.inner.shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
    }

    return this.inner.shouldTriggerFileCompletion(adaptation.adaptedLines, cursorLine, adaptation.adaptedCursorCol);
  }
}

export function wrapAutocompleteProviderForDollarPrefix(innerProvider) {
  return new DollarPrefixAutocompleteProvider(innerProvider);
}
