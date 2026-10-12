import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const MAX_CHANNEL_BYTES = 1024 * 1024;

// Reject symlinks at every component, not just the final pathname. This is a
// same-UID private channel, not a sandbox against a malicious same-UID process.
export function safeDirectory(path: string, privateDirectory = false): string {
  if (!isAbsolute(path)) throw new Error("Absolute directory required");
  const full = resolve(path);
  for (let current = full; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe directory");
    if (
      current === full &&
      privateDirectory &&
      ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())
    ) {
      throw new Error("Channel directory is not private");
    }
    if (dirname(current) === current) break;
  }
  return full;
}

export function readBoundedFile(path: string, maxBytes: number, privateFile = false): string {
  safeDirectory(dirname(path));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > maxBytes ||
      (privateFile && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
    ) {
      throw new Error("Unsafe or oversized file");
    }
    // Reading through the descriptor avoids following a replacement symlink.
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > maxBytes) throw new Error("File grew beyond bound");
    return bytes.subarray(0, length).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export function readPrivateJson(path: string): unknown {
  return JSON.parse(readBoundedFile(path, MAX_CHANNEL_BYTES, true));
}

export function publishPrivateJson(dir: string, value: unknown): void {
  safeDirectory(dir, true);
  const target = join(dir, "channel.json");
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error("Unsafe channel file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > MAX_CHANNEL_BYTES) throw new Error("Channel exceeds bound");
  const temporary = join(dir, `.publish-${randomUUID()}`);
  try {
    writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* renamed or unavailable */
    }
  }
}

export function channelIsBusy(dir: string): boolean {
  try {
    lstatSync(join(dir, "lock"));
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export function withChannelLock<T>(dir: string, action: () => T): T {
  safeDirectory(dir, true);
  const path = join(dir, "lock");
  // No stale-lock takeover: a crashed writer makes control unavailable rather
  // than risking duplicate delivery. This critical section never awaits.
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const identity = fstatSync(fd);
  try {
    return action();
  } finally {
    closeSync(fd);
    const current = lstatSync(path);
    if (current.ino === identity.ino && current.dev === identity.dev) unlinkSync(path);
  }
}

const TERMINAL_ESCAPES =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip terminal escape protocols from inert local text.
  /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[PX^_][\s\S]*?\x1b\\|.)/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Controls and bidi overrides must not enter the terminal or literal guidance.
const UNSAFE_CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/gu;

export function inertText(value: unknown, limit = 2048): string {
  if (typeof value !== "string") return "";
  return value
    .slice(0, limit * 2)
    .replace(TERMINAL_ESCAPES, "")
    .replace(UNSAFE_CONTROLS, "")
    .slice(0, limit);
}

export function literalGuidance(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Buffer.byteLength(value) <= 4096 &&
    Buffer.from(value, "utf8").toString("utf8") === value &&
    value.search(UNSAFE_CONTROLS) === -1
  );
}

export function boundedDescription(value: unknown): string {
  let budget = 80;
  function trim(item: unknown, depth: number): unknown {
    if (--budget < 0 || depth > 4) return "[bounded]";
    if (typeof item === "string") return inertText(item, 1024);
    if (item === null || typeof item === "number" || typeof item === "boolean") return item;
    if (Array.isArray(item)) return item.slice(0, 16).map((child) => trim(child, depth + 1));
    if (typeof item === "object" && item) {
      return Object.fromEntries(
        Object.entries(item)
          .slice(0, 16)
          .map(([key, child]) => [inertText(key, 80), trim(child, depth + 1)]),
      );
    }
    return "";
  }
  return inertText(JSON.stringify(trim(value, 0)), 4096);
}
