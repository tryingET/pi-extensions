// Read-only helpers, extracted and hardened from the a0411c361 spike.
// Canonical-path checks prevent stable symlink escapes, not hostile filesystem races.
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { throwIfAborted } from "./runner.ts";

// Leave room for the truncation marker within the 16 KiB result byte limit.
export const DEFAULT_READ_BYTES = 16_000;
export const MAX_READ_BYTES = 65_536;
export const MAX_LIST_ENTRIES = 500;
export const MAX_FS_CALLS = 128;
export const MAX_TOTAL_READ_BYTES = 1_048_576;

export interface CapabilityLease {
  capabilities: ToolCapabilities;
  close(): void;
}

export async function createCapabilities(
  root: string,
  signal?: AbortSignal,
): Promise<CapabilityLease> {
  throwIfAborted(signal);
  const canonicalRoot = await realpath(root);
  let closed = false;
  let calls = 0;
  let reservedBytes = 0;
  const active = () => {
    throwIfAborted(signal);
    if (closed) throw new Error("TypeScript capabilities are closed");
  };
  const reserve = (bytes = 0) => {
    active();
    if (++calls > MAX_FS_CALLS) throw new Error(`Filesystem call limit: ${MAX_FS_CALLS}`);
    if (reservedBytes + bytes > MAX_TOTAL_READ_BYTES)
      throw new Error("Filesystem read budget exceeded (1 MiB)");
    reservedBytes += bytes;
  };
  const assertInside = (target: string) => {
    const rel = relative(canonicalRoot, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error("Path escapes the workspace root");
    }
    return target;
  };
  const inside = async (path: string) => {
    active();
    if (typeof path !== "string" || path.length > 4096 || path.includes("\0")) {
      throw new Error("Path must be a string of at most 4096 characters without NUL");
    }
    const lexical = assertInside(resolve(canonicalRoot, path.replace(/^@/, "")));
    const canonical = assertInside(await realpath(lexical));
    active();
    return canonical;
  };
  const capabilities: ToolCapabilities = {
    fs: {
      async list(path = ".") {
        reserve();
        const target = await inside(path);
        const directory = await opendir(target);
        const entries: ToolDirectoryEntry[] = [];
        // Async iteration closes the directory even on throw; no unbounded readdir array.
        for await (const entry of directory) {
          active();
          if (entries.length === MAX_LIST_ENTRIES)
            throw new Error(`Directory exceeds ${MAX_LIST_ENTRIES} entries`);
          const info = await lstat(await insideEntry(target, entry.name));
          const kind = info.isFile() ? "file" : info.isDirectory() ? "directory" : "other";
          entries.push({ name: entry.name, kind, size: kind === "file" ? info.size : null });
        }
        active();
        return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      },
      async read(path, maxBytes = DEFAULT_READ_BYTES) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_READ_BYTES) {
          throw new Error(`maxBytes must be an integer from 1 to ${MAX_READ_BYTES}`);
        }
        reserve(maxBytes);
        const target = await inside(path);
        // Nonblocking avoids a FIFO open hanging; nofollow guards a replaced final symlink.
        const handle = await open(
          target,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          if (!(await handle.stat()).isFile()) throw new Error("Only regular files can be read");
          const buffer = Buffer.alloc(maxBytes + 1);
          let used = 0;
          while (used < buffer.length) {
            active();
            const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
            if (bytesRead === 0) break;
            used += bytesRead;
          }
          active();
          const decoder = new StringDecoder("utf8");
          const text = decoder.write(buffer.subarray(0, Math.min(used, maxBytes)));
          return used > maxBytes ? `${text}\n… truncated` : text + decoder.end();
        } finally {
          await handle.close();
        }
      },
    },
  };
  // lstat must not follow leaf symlinks merely to display directory metadata.
  async function insideEntry(directory: string, name: string): Promise<string> {
    assertInside(await realpath(directory));
    active();
    return assertInside(join(directory, name));
  }
  active();
  return {
    capabilities,
    close: () => {
      closed = true;
    },
  };
}
