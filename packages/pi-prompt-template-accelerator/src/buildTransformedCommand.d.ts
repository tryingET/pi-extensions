/**
summary: "Declares command argument quoting and transformed slash-command construction."
read_when:
  - "Consuming or changing the public command-building type contract."
*/
export function quoteArgument(arg: string): string;
export function buildTransformedCommand(commandName: string, args: readonly string[]): string;
