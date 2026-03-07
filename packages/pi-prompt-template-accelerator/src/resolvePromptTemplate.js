/**
 * Resolve a slash command name to a prompt-template command definition.
 */
export function resolvePromptTemplate(commands, commandName) {
  return commands.find((command) => command.name === commandName && command.source === "prompt");
}
