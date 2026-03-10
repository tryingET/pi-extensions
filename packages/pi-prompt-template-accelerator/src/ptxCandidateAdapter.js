function truncate(value, max = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function normalizePath(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return text.replace(/\\/g, "/");
}

function summarizePath(value) {
  const normalized = normalizePath(value);
  if (!normalized) return undefined;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return parts.join("/");
  return parts.slice(-3).join("/");
}

function buildCandidateId(command, index) {
  const name = String(command?.name ?? "").trim();
  const normalizedPath = normalizePath(command?.path);
  if (normalizedPath) return `${name}::${normalizedPath}`;
  return `${name}::index:${index}`;
}

function buildCandidateDetail(command, duplicateNames) {
  const baseDetail = truncate(command.description || "prompt template");
  if (!duplicateNames.has(command.name)) return baseDetail;

  const origin = summarizePath(command.path);
  if (origin) {
    return truncate(`${baseDetail} · ${origin}`, 110);
  }

  return truncate(`${baseDetail} · no template path`, 110);
}

export function toPtxCandidates(commands) {
  if (!Array.isArray(commands)) return [];

  const promptCommands = commands.filter(
    (command) =>
      command &&
      command.source === "prompt" &&
      typeof command.name === "string" &&
      command.name.trim().length > 0 &&
      normalizePath(command.path),
  );

  const nameCounts = new Map();
  for (const command of promptCommands) {
    const normalizedName = command.name.trim();
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
  }

  const duplicateNames = new Set(
    [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );

  return promptCommands
    .map((command, index) => ({
      id: buildCandidateId(command, index),
      label: `/${command.name}`,
      detail: buildCandidateDetail(command, duplicateNames),
      preview: undefined,
      source: "ptx",
      commandName: command.name,
      commandPath: normalizePath(command.path),
      commandDescription:
        typeof command.description === "string" && command.description.trim().length > 0
          ? command.description.trim()
          : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.detail.localeCompare(b.detail) || a.id.localeCompare(b.id));
}
