import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { EXPERIMENT_DIR } from "./experiment-config.mjs";
import { fail, sha256Hex } from "./experiment-process.mjs";

export async function createChecksumManifest(allowedPaths, generated = new Map()) {
  const allowed = new Set(allowedPaths);
  if (allowed.size !== allowedPaths.length) fail("checksum allowlist has duplicates");
  for (const path of generated.keys()) {
    if (!allowed.has(path)) fail(`unexpected generated checksum entry: ${path}`);
  }
  const rows = [];
  for (const relativePath of allowedPaths) {
    const bytes = generated.has(relativePath)
      ? generated.get(relativePath)
      : await readFile(resolve(EXPERIMENT_DIR, relativePath));
    rows.push([sha256Hex(bytes), relativePath]);
  }
  rows.sort((left, right) => left[1].localeCompare(right[1]));
  return `${rows.map(([hash, path]) => `${hash}  ${path}`).join("\n")}\n`;
}

export async function verifyChecksumManifest(manifestPath, allowedPaths) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(manifestPath));
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0")) {
    fail("checksum manifest is not canonical UTF-8");
  }
  const expected = new Set(allowedPaths);
  const entries = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([a-f0-9]{64}) {2}([^\t\n\r\0]+)$/u.exec(line);
    if (!match) fail(`malformed checksum entry: ${JSON.stringify(line)}`);
    if (!expected.has(match[2]) || entries.has(match[2])) {
      fail(`unexpected or duplicate checksum entry: ${match[2]}`);
    }
    entries.set(match[2], match[1]);
  }
  if (entries.size !== expected.size) fail("checksum entry count mismatch");
  for (const path of expected) {
    if (!entries.has(path)) fail(`missing checksum entry: ${path}`);
    const absolute = resolve(EXPERIMENT_DIR, path);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`unsafe checksum target: ${path}`);
    if (sha256Hex(await readFile(absolute)) !== entries.get(path))
      fail(`checksum mismatch: ${path}`);
  }
  return entries;
}
