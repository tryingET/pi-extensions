#!/usr/bin/env node

import { pathToFileURL } from "node:url";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonStringEnd(text, start) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return index + 1;
  }
  return -1;
}

function assertUniqueTopLevelObjectKeys(raw) {
  const text = String(raw ?? "");
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };

  skipWhitespace();
  if (text[index] !== "{") return;
  index += 1;
  const keys = new Set();

  while (index < text.length) {
    skipWhitespace();
    if (text[index] === "}") return;
    if (text[index] !== '"') return;

    const keyEnd = readJsonStringEnd(text, index);
    if (keyEnd < 0) return;
    let key;
    try {
      key = JSON.parse(text.slice(index, keyEnd));
    } catch {
      return;
    }
    if (keys.has(key)) {
      throw new Error(`npm 12 pack JSON contains duplicate package key: ${key}`);
    }
    keys.add(key);
    index = keyEnd;
    skipWhitespace();
    if (text[index] !== ":") return;
    index += 1;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{" || character === "[") {
        depth += 1;
        continue;
      }
      if (character === "}" || character === "]") {
        if (depth > 0) {
          depth -= 1;
          continue;
        }
        if (character === "}") return;
      }
      if (character === "," && depth === 0) {
        index += 1;
        break;
      }
    }
  }
}

function validatePackEntry(entry) {
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    throw new Error("npm pack JSON entry must include a non-empty name.");
  }
  if (typeof entry.version !== "string" || entry.version.trim().length === 0) {
    throw new Error("npm pack JSON entry must include a non-empty version.");
  }
  if (entry.id !== `${entry.name}@${entry.version}`) {
    throw new Error("npm pack JSON entry id must match its name and version.");
  }
  if (
    typeof entry.filename !== "string" ||
    entry.filename.trim().length === 0 ||
    entry.filename.includes("/") ||
    entry.filename.includes("\\")
  ) {
    throw new Error("npm pack JSON entry must include a safe package-local filename.");
  }
  if (!Array.isArray(entry.files)) {
    throw new Error("npm pack JSON entry must include a files array.");
  }
  const filePaths = new Set();
  for (const file of entry.files) {
    if (!isRecord(file) || typeof file.path !== "string" || file.path.trim().length === 0) {
      throw new Error("npm pack JSON files entries must include a non-empty path.");
    }
    const normalizedPath = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (filePaths.has(normalizedPath)) {
      throw new Error(`npm pack JSON contains duplicate file path: ${normalizedPath}`);
    }
    filePaths.add(normalizedPath);
  }
  return entry;
}

export function parseNpmPackJson(raw) {
  assertUniqueTopLevelObjectKeys(raw);
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch (error) {
    throw new Error(
      `npm pack output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (Array.isArray(parsed)) {
    if (parsed.length !== 1 || !isRecord(parsed[0])) {
      throw new Error("npm pack JSON array must contain exactly one package entry.");
    }
    return validatePackEntry(parsed[0]);
  }

  if (!isRecord(parsed)) {
    throw new Error("npm pack JSON must be an npm 10/11 array or npm 12 package-keyed object.");
  }

  const entries = Object.entries(parsed);
  if (entries.length !== 1) {
    throw new Error("npm 12 pack JSON object must contain exactly one package entry.");
  }

  const [packageName, entry] = entries[0];
  if (!isRecord(entry)) {
    throw new Error("npm 12 pack JSON package entry must be an object.");
  }
  if (typeof entry.name !== "string" || entry.name !== packageName) {
    throw new Error("npm 12 pack JSON package key must match the entry name.");
  }
  return validatePackEntry(entry);
}

export function normalizeNpmPackJson(raw) {
  return JSON.stringify([parseNpmPackJson(raw)]);
}

export async function runNpmPackJsonCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.stdout.write(`${normalizeNpmPackJson(Buffer.concat(chunks).toString("utf8"))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runNpmPackJsonCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
