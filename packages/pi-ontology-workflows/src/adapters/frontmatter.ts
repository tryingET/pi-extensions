import { parse, stringify } from "yaml";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export interface ParsedFrontmatterDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatterDocument(text: string): ParsedFrontmatterDocument {
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: text.trim() };
  }

  const parsed = parse(match[1]) ?? {};
  return {
    frontmatter: isRecord(parsed) ? parsed : {},
    body: text.slice(match[0].length).trim(),
  };
}

export function renderFrontmatterDocument(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const serialized = stringify(frontmatter).trimEnd();
  return `---\n${serialized}\n---\n\n${body.trim()}\n`;
}

export function ensureStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
