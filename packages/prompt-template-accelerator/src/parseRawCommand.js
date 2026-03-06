export class RawCommandParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "RawCommandParseError";
  }
}

/**
 * Tokenize slash-command style input with simple shell-like quotes/escapes.
 * Supports:
 * - whitespace separation
 * - single and double quoted args
 * - backslash escaping
 * - empty quoted args (e.g. "")
 */
export function tokenizeCommand(rawInput) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let tokenStarted = false;

  const pushToken = () => {
    if (!tokenStarted) return;
    tokens.push(current);
    current = "";
    tokenStarted = false;
  };

  for (const char of rawInput) {
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
        tokenStarted = true;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaped) {
    current += "\\";
  }

  if (quote) {
    throw new RawCommandParseError(`Unclosed quote: ${quote}`);
  }

  pushToken();
  return tokens;
}

/**
 * Parse command text like: /name "arg one" arg2
 * Returns null if input does not start with a slash command.
 */
export function parseRawCommand(rawInput) {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const tokens = tokenizeCommand(trimmed);
  if (tokens.length === 0) return null;

  const commandToken = tokens[0];
  if (!commandToken.startsWith("/") || commandToken.length < 2) return null;

  const commandName = commandToken.slice(1).trim();
  if (!commandName) return null;

  return {
    commandName,
    args: tokens.slice(1),
  };
}
