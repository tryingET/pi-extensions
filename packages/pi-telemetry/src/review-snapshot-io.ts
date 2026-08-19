// ---
// summary: "Loads and writes digest-bound telemetry review snapshot files without following final-component links."
// read_when:
//   - "Changing snapshot file limits, no-follow reads, filenames, ownership, or durability."
// ---

import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import {
  TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES,
  type TelemetryReviewSnapshot,
} from "./review-snapshot-types.ts";
import {
  parseTelemetryReviewSnapshotJson,
  validateTelemetryReviewSnapshot,
} from "./review-snapshot-validate.ts";

export async function loadTelemetryReviewSnapshot(
  filePath: string,
): Promise<TelemetryReviewSnapshot> {
  return parseTelemetryReviewSnapshotJson(
    await readStableOwnerFile(filePath, TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES),
  );
}

export async function writeTelemetryReviewSnapshot(
  telemetryDir: string,
  snapshot: TelemetryReviewSnapshot,
): Promise<string> {
  const validated = validateTelemetryReviewSnapshot(snapshot);
  const reviewDir = path.join(telemetryDir, "reviews");
  await mkdir(reviewDir, { recursive: true, mode: 0o700 });
  const reviewDirStat = await lstat(reviewDir);
  if (!reviewDirStat.isDirectory() || reviewDirStat.isSymbolicLink()) {
    throw new Error("telemetry review directory is not a regular directory");
  }

  const stamp = validated.generatedAt.replace(/[:.]/g, "-");
  const target = path.join(reviewDir, `${stamp}-${validated.snapshotSha256.slice(0, 16)}.json`);
  const content = `${JSON.stringify(validated, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES) {
    throw new Error("telemetry review snapshot exceeds the maximum byte size");
  }

  try {
    const flags =
      fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      (fsConstants.O_NOFOLLOW ?? 0);
    const handle = await open(target, flags, 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(reviewDir);
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
    const existing = await readStableOwnerFile(target, TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES);
    if (existing !== content) {
      throw new Error("existing telemetry review snapshot does not match its digest");
    }
  }
  return target;
}

async function readStableOwnerFile(filePath: string, maxBytes: number): Promise<string> {
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) {
      throw new Error("telemetry review snapshot is not a single-link regular file");
    }
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) {
      throw new Error("telemetry review snapshot is not owned by the current user");
    }
    if ((before.mode & 0o077) !== 0) {
      throw new Error("telemetry review snapshot permissions are not owner-only");
    }
    if (before.size > maxBytes) {
      throw new Error("telemetry review snapshot exceeds the maximum byte size");
    }
    const text = await handle.readFile("utf8");
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw new Error("telemetry review snapshot changed while being read");
    }
    return text;
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isErrno(value: unknown, code: string): boolean {
  return (
    value instanceof Error &&
    "code" in value &&
    (value as NodeJS.ErrnoException).code === code
  );
}
