/**
summary: "Read regular source files within an allocation bound and verify descriptor freshness."
read_when:
  - "Changing source read limits, race checks, or nonblocking file acquisition."
*/
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

export const sameFile = (a, b) =>
  ["dev", "ino", "size", "mtimeNs", "ctimeNs", "mode"].every((key) => a[key] === b[key]);

export async function stableRead(path, maxBytes, { expected, requireNoFollow = true } = {}) {
  if (requireNoFollow && typeof constants.O_NOFOLLOW !== "number")
    throw new Error("no_follow_unavailable");
  const before = await lstat(path, { bigint: true });
  if (expected && !sameFile(expected, before)) throw new Error("source_changed");
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maxBytes))
    throw new Error("unsupported_or_oversize_file");
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
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
