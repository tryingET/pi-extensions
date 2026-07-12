/**
summary: "Defines command provenance shapes and helpers for identifying prompt-backed commands and paths."
read_when:
  - "Changing the typed command source or path resolution contract."
*/
export type CommandSource = "extension" | "prompt" | "skill";

export interface CommandLike {
  name?: unknown;
  description?: unknown;
  path?: unknown;
  source?: unknown;
  sourceInfo?: {
    source?: unknown;
    path?: unknown;
  } | null;
}

export function getCommandSource(command: CommandLike | null | undefined): CommandSource | undefined;
export function getCommandPath(command: CommandLike | null | undefined): string | undefined;
export function isPromptCommand(command: CommandLike | null | undefined): boolean;
