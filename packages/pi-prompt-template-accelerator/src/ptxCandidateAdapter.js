function truncate(value, max = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export function toPtxCandidates(commands) {
  if (!Array.isArray(commands)) return [];

  return commands
    .filter((command) => command && command.source === "prompt" && typeof command.name === "string" && command.name.trim().length > 0)
    .map((command) => ({
      id: command.name,
      label: `/${command.name}`,
      detail: truncate(command.description || "prompt template"),
      preview: undefined,
      source: "ptx",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
