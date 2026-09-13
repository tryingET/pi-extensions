/**
summary: "Keep optional validated ripwire results in a private, root-isolated cache."
read_when:
  - "Changing cached result identity, corruption recovery, or cache permissions."
*/
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { digest, stableRead } from "./ripwire-corpus.js";

const MAX_ENTRY = 3 * 1024 * 1024;
const inside = (root, path) => {
  const rel = relative(root, path);
  return !rel || (!rel.startsWith("..") && !isAbsolute(rel));
};
async function cacheDirectory(cacheRoot, sourceRoot) {
  if (process.platform !== "linux" || typeof cacheRoot !== "string" || !isAbsolute(cacheRoot))
    throw new Error("invalid_cache_root");
  const target = resolve(cacheRoot);
  // Validate all existing ancestors before creating anything, including outside-scope aliases.
  let ancestor = target;
  for (;;) {
    try {
      if ((await realpath(ancestor)) !== ancestor) throw new Error("invalid_cache_root");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = resolve(ancestor, "..");
      if (parent === ancestor) throw new Error("invalid_cache_root");
      ancestor = parent;
    }
  }
  if (inside(sourceRoot, target) || inside(target, sourceRoot))
    throw new Error("invalid_cache_root");
  await mkdir(target, { recursive: true, mode: 0o700 });
  const before = await lstat(target);
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.mode & 0o077
  )
    throw new Error("cache_not_private");
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const now = await handle.stat();
  if (now.ino !== before.ino || now.dev !== before.dev) {
    await handle.close();
    throw new Error("invalid_cache_root");
  }
  return handle;
}
async function prune(anchor) {
  const rows = [];
  for (const name of await readdir(anchor)) {
    if (!/^[a-f0-9]{64}\.json$/u.test(name)) continue;
    const stat = await lstat(`${anchor}/${name}`).catch(() => null);
    if (stat?.isFile()) rows.push({ name, bytes: stat.size, at: stat.mtimeMs });
  }
  rows.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    total += rows[i].bytes;
    if (i >= 32 || total > 32 * 1024 * 1024)
      await unlink(`${anchor}/${rows[i].name}`).catch(() => {});
  }
}
export async function cachedRipwireText({
  cacheRoot,
  sourceRoot,
  identity,
  compute,
  parse,
  signal,
}) {
  if (!cacheRoot) return { value: parse(await compute()), cache: "disabled" };
  const handle = await cacheDirectory(cacheRoot, sourceRoot);
  const anchor = `/proc/self/fd/${handle.fd}`;
  const key = digest(JSON.stringify({ schema: "ripwire-result-v1", root: sourceRoot, identity }));
  const file = `${anchor}/${key}.json`;
  let state = "miss";
  try {
    signal?.throwIfAborted();
    try {
      const entry = JSON.parse((await stableRead(file, MAX_ENTRY)).toString("utf8"));
      if (
        entry.key !== key ||
        typeof entry.text !== "string" ||
        entry.sha256 !== digest(entry.text)
      )
        throw new Error("corrupt_cache");
      return { value: parse(entry.text), cache: "hit" };
    } catch (error) {
      if (error.code !== "ENOENT") state = "corrupt_miss";
    }
    signal?.throwIfAborted();
    const text = await compute();
    const value = parse(text);
    const encoded = JSON.stringify({ key, text, sha256: digest(text) });
    signal?.throwIfAborted();
    if (Buffer.byteLength(encoded) <= MAX_ENTRY) {
      const temp = `${anchor}/write-${randomUUID()}.tmp`;
      try {
        await writeFile(temp, encoded, { flag: "wx", mode: 0o600 });
        await rename(temp, file);
        await prune(anchor);
      } finally {
        await unlink(temp).catch(() => {});
      }
    }
    return { value, cache: state };
  } finally {
    await handle.close();
  }
}
