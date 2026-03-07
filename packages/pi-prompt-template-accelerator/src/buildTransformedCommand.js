export function quoteArgument(arg) {
  const escaped = String(arg).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildTransformedCommand(commandName, args) {
  const normalizedName = commandName.replace(/^\/+/, "").trim();
  if (!normalizedName) throw new Error("Missing command name");

  if (!args || args.length === 0) {
    return `/${normalizedName}`;
  }

  return `/${normalizedName} ${args.map(quoteArgument).join(" ")}`;
}
