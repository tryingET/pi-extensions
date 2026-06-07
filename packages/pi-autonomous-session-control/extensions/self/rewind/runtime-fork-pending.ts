import { readFile } from "node:fs/promises";
import type { ParsedCustomEntryLike } from "./runtime-state.ts";
import type { AscRewindForkPendingData } from "./session-ledger.ts";
import { isAscRewindForkPendingData } from "./session-ledger.ts";

export async function readPendingForkState(
  sessionFile: string,
): Promise<AscRewindForkPendingData | null> {
  let raw: string;
  try {
    raw = await readFile(sessionFile, "utf8");
  } catch {
    return null;
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      const parsed = JSON.parse(lines[index]) as ParsedCustomEntryLike;
      if (parsed.type === "custom" && isAscRewindForkPendingData(parsed.data)) {
        return parsed.data;
      }
      if (
        parsed.customType === "asc.rewind.fork_pending" &&
        isAscRewindForkPendingData(parsed.data)
      ) {
        return parsed.data;
      }
    } catch {}
  }

  return null;
}
