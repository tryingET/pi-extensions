// ---
// summary: "provides canonical rendering, revision aliases, and stable line identifiers"
// read_when:
//   - "changing shared protocol identity or text rendering primitives"
// ---
import { createHash } from "node:crypto";

const aliasWords = [
  "amber",
  "birch",
  "cedar",
  "dawn",
  "elm",
  "fern",
  "gold",
  "hazel",
  "iris",
  "jade",
  "kite",
  "lilac",
  "maple",
  "north",
  "opal",
  "pine",
];

export const CANONICAL_BASE_ALIAS = "amber";

export function render(lines) {
  return `${lines.join("\n")}\n`;
}

export function revisionAlias(lines) {
  const digest = createHash("sha256").update(render(lines)).digest();
  return aliasWords[digest[0] % aliasWords.length];
}

export function lineIds(lines, base) {
  return lines.map((line, index) =>
    createHash("sha256")
      .update(`${base}:${index + 1}:${line}`)
      .digest("base64url")
      .slice(0, 6),
  );
}
