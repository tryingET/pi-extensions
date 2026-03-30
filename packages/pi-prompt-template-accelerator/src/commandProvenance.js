export function getCommandSource(command) {
  const sourceInfoSource = command?.sourceInfo?.source;
  if (typeof sourceInfoSource === "string" && sourceInfoSource.trim().length > 0) {
    return sourceInfoSource.trim();
  }

  if (typeof command?.source === "string" && command.source.trim().length > 0) {
    return command.source.trim();
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
