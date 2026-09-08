/**
summary: "Copy an explicitly bounded code corpus without following source symlinks."
read_when:
  - "Changing approved source scope, snapshot identity, or copy race checks."
*/
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";

import { hasControlCharacter } from "./context-intake-safety.js";

export const CORPUS_POLICY_VERSION = "ripwire-code-corpus-v1";
const EXTENSIONS = new Set([
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".cxx",
  ".cu",
  ".cuh",
  ".m",
  ".mm",
  ".metal",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".phtml",
  ".lua",
  ".sh",
  ".swift",
  ".cs",
]);
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
  "coverage",
  "target",
]);
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const safeRelative = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 4096 &&
  !isAbsolute(value) &&
  !/[\\:]/u.test(value) &&
  !hasControlCharacter(value) &&
  value.split("/").every((part) => part && part !== "." && part !== "..");
const sameFile = (a, b) =>
  ["dev", "ino", "size", "mtimeNs", "ctimeNs", "mode"].every((key) => a[key] === b[key]);

export async function stableRead(path, maxBytes) {
  if (typeof constants.O_NOFOLLOW !== "number") throw new Error("no_follow_unavailable");
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maxBytes))
    throw new Error("unsupported_or_oversize_file");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) throw new Error("source_changed");
    // Never let concurrent file growth turn a bounded read into an unbounded allocation.
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const data = buffer.subarray(0, length);
    if (
      !sameFile(opened, await handle.stat({ bigint: true })) ||
      BigInt(data.length) !== before.size
    )
      throw new Error("source_changed");
    return data;
  } finally {
    await handle.close();
  }
}

export async function copyApprovedCorpus(root, destination, options = {}) {
  const realRoot = await realpath(root);
  if (realRoot !== resolve(root) || realRoot === sep || !(await lstat(realRoot)).isDirectory())
    throw new Error("invalid_root");
  const excluded = options.excludePaths ?? [];
  if (!Array.isArray(excluded) || excluded.length > 256 || !excluded.every(safeRelative))
    throw new Error("invalid_exclusion_policy");
  const files = new Map();
  const skipped = { policy: 0, symlink: 0, unsupported: 0, oversize: 0, binary: 0 };
  let totalBytes = 0;
  let visited = 0;
  // Descriptor-relative traversal prevents intermediate-directory symlink swaps.
  // This first supported profile deliberately requires Linux /proc; unsupported hosts fail closed.
  if (process.platform !== "linux") throw new Error("anchored_reads_unavailable");
  const rootBefore = await lstat(realRoot, { bigint: true });
  const rootHandle = await open(
    realRoot,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  async function walk(handle, prefix = "") {
    options.signal?.throwIfAborted();
    const anchor = `/proc/self/fd/${handle.fd}`;
    const entries = (await readdir(anchor, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      if (++visited > 30000) throw new Error("corpus_entry_limit");
      const path = join(anchor, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!safeRelative(rel)) {
        skipped.policy++;
        continue;
      }
      if (
        entry.name.startsWith(".") ||
        excluded.some((part) => rel === part || rel.startsWith(`${part}/`)) ||
        (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name))
      ) {
        skipped.policy++;
        continue;
      }
      if (entry.isSymbolicLink()) {
        skipped.symlink++;
        continue;
      }
      if (entry.isDirectory()) {
        const child = await open(
          path,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          await walk(child, rel);
        } finally {
          await child.close();
        }
        continue;
      }
      if (!entry.isFile() || !EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        skipped.unsupported++;
        continue;
      }
      if ((await lstat(path)).size > 512 * 1024) {
        skipped.oversize++;
        continue;
      }
      const content = await stableRead(path, 512 * 1024);
      if (content.includes(0)) {
        skipped.binary++;
        continue;
      }
      totalBytes += content.length;
      if (files.size >= 10000 || totalBytes > 64 * 1024 * 1024)
        throw new Error("corpus_size_limit");
      const target = resolve(destination, rel);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, content, { flag: "wx", mode: 0o400 });
      files.set(rel, { sha256: digest(content), bytes: content.length });
    }
  }
  try {
    if (!sameFile(rootBefore, await rootHandle.stat({ bigint: true })))
      throw new Error("directory_changed");
    if ((await realpath(`/proc/self/fd/${rootHandle.fd}`)) !== realRoot)
      throw new Error("source_path_changed");
    await walk(rootHandle);
  } finally {
    await rootHandle.close();
  }
  const identity = {
    policy: CORPUS_POLICY_VERSION,
    excluded: [...excluded].sort(),
    files: [...files],
  };
  return {
    root: realRoot,
    files,
    skipped,
    totalBytes,
    snapshotId: digest(JSON.stringify(identity)),
  };
}
