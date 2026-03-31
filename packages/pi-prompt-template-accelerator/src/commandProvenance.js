const COMMAND_KINDS = new Set(["extension", "prompt", "skill"]);

export function getCommandSource(command) {
  const commandSource = command?.source;
  if (typeof commandSource === "string" && commandSource.trim().length > 0) {
    return commandSource.trim();
  }

  const sourceInfoSource = command?.sourceInfo?.source;
  if (
    typeof sourceInfoSource === "string" &&
    sourceInfoSource.trim().length > 0 &&
    COMMAND_KINDS.has(sourceInfoSource.trim())
  ) {
    return sourceInfoSource.trim();
  }

  return undefined;
}

export function getCommandPath(command) {
  const sourceInfoPath = command?.sourceInfo?.path;
  if (typeof sourceInfoPath === "string" && sourceInfoPath.trim().length > 0) {
    return sourceInfoPath.trim();
  }

  if (typeof command?.path === "string" && command.path.trim().length > 0) {
    return command.path.trim();
  }

  return undefined;
}

export function isPromptCommand(command) {
  return getCommandSource(command) === "prompt";
}
