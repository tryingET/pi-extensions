// ---
// summary: "Loads and writes digest-bound telemetry review snapshot files."
// read_when:
//   - "Changing snapshot file limits, no-follow reads, filenames, or durability."
// ---

import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
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
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error("telemetry review snapshot is not a regular file");
    if (before.size > TELEMETRY_REVIEW_SNAPSHOT_MAX_BYTES) {
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
    return parseTelemetryReviewSnapshotJson(text);
  } finally {
    await handle.close();
  }
}

export async function writeTelemetryReviewSnapshot(
  telemetryDir: string,
  snapshot: TelemetryReviewSnapshot,
): Promise<string> {
  const validated = validateTelemetryReviewSnapshot(snapshot);
  const reviewDir = path.join(telemetryDir, "reviews");
  await mkdir(reviewDir, { recursive: true });
  const stamp = validated.generatedAt.replace(/[:.]/g, "-");
  const target = path.join(reviewDir, `${stamp}-${validated.snapshotSha256.slice(0, 16)}.json`);
  const content = `${JSON.stringify(validated, null, 2)}\n`;

  try {
    const handle = await open(target, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
    if ((await readFile(target, "utf8")) !== content) {
      throw new Error("existing telemetry review snapshot does not match its digest");
    }
  }
  return target;
}

function isErrno(value: unknown, code: string): boolean {
  return (
    value instanceof Error &&
    "code" in value &&
    (value as NodeJS.ErrnoException).code === code
  );
}
