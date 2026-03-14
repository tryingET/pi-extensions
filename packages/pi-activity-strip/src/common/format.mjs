import path from "node:path";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires an ESC control character pattern.
const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function truncate(value, max = 96) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function stripAnsi(value) {
  return String(value ?? "").replaceAll(ANSI_RE, "");
}

export function compactWhitespace(value) {
  return stripAnsi(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function lastNonEmptyLine(value) {
  const lines = String(value ?? "")
    .split(/\r?\n/g)
    .map((line) => compactWhitespace(line))
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

export function basenameLabel(targetPath) {
  const normalized = String(targetPath ?? "").trim();
  if (!normalized) return "(unknown)";
  return path.basename(normalized) || normalized;
}

export function previewPath(targetPath, max = 64) {
  const normalized = compactWhitespace(targetPath);
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;

  const base = path.basename(normalized);
  if (base.length + 4 >= max) {
    return truncate(base, max);
  }

  return truncate(`…/${base}`, max);
}

export function previewCommand(command, max = 72) {
  return truncate(compactWhitespace(command), max);
}

export function previewText(value, max = 96) {
  return truncate(lastNonEmptyLine(value) || compactWhitespace(value), max);
}

export function formatRepoLabel(cwd, explicitSessionName) {
  const sessionName = compactWhitespace(explicitSessionName);
  if (sessionName) return truncate(sessionName, 36);

  const normalized = String(cwd ?? "").trim();
  if (!normalized) return "pi session";

  const repo = path.basename(normalized) || normalized;
  return truncate(repo, 36);
}
