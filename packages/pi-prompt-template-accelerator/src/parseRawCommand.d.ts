/**
summary: "Declares raw slash-command tokenization results, parse errors, and parser functions."
read_when:
  - "Using or changing the typed raw-command parsing API."
*/
export class RawCommandParseError extends Error {
  constructor(message: string);
}

export interface ParsedRawCommand {
  commandName: string;
  args: string[];
}

export function tokenizeCommand(rawInput: string): string[];
export function parseRawCommand(rawInput: string): ParsedRawCommand | null;
