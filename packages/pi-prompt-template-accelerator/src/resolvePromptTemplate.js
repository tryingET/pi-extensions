function normalizeCommandName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\/+/, "");
}

function hasTemplatePath(command) {
  return typeof command?.path === "string" && command.path.trim().length > 0;
}

function isPromptCommandMatch(command, commandName) {
  return Boolean(
    command &&
      command.source === "prompt" &&
      normalizeCommandName(command.name) === commandName,
  );
}

/**
 * Resolve a slash command name to a prompt-template command definition.
 *
 * Rules:
 * - unique prompt-name match => resolve directly
 * - duplicate prompt-name matches with exactly one prefillable template path => use that match
 * - duplicate prefillable matches => return explicit ambiguity
 */
export function resolvePromptTemplate(commands, commandName) {
  const normalizedName = normalizeCommandName(commandName);
  const matches = Array.isArray(commands)
    ? commands.filter((command) => isPromptCommandMatch(command, normalizedName))
    : [];

  if (matches.length === 0) {
    return {
      status: "not-found",
      matches: [],
      prefillableMatches: [],
    };
  }

  if (matches.length === 1) {
    return {
      status: "ok",
      templateCommand: matches[0],
      matches,
      prefillableMatches: hasTemplatePath(matches[0]) ? [matches[0]] : [],
      resolution: "unique-match",
    };
  }

  const prefillableMatches = matches.filter(hasTemplatePath);
  if (prefillableMatches.length === 1) {
    return {
      status: "ok",
      templateCommand: prefillableMatches[0],
      matches,
      prefillableMatches,
      resolution: "single-prefillable-match",
    };
  }

  return {
    status: "ambiguous",
    matches,
    prefillableMatches,
    resolution: "duplicate-name",
  };
}
