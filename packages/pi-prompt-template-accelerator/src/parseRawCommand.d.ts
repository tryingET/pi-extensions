export class RawCommandParseError extends Error {
  constructor(message: string);
}

export interface ParsedRawCommand {
  commandName: string;
  args: string[];
}

export function tokenizeCommand(rawInput: string): string[];
export function parseRawCommand(rawInput: string): ParsedRawCommand | null;
