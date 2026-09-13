import * as fs from "node:fs";
import path from "node:path";
import type { AutoresearchMatrixCampaignArtifactKind } from "./runtime-matrix-model.ts";

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function getStringField(value: unknown, field: string): string | null {
  const v = record(value)?.[field];
  return typeof v === "string" && v.trim() ? v : null;
}
export function getNumberField(value: unknown, field: string): number | null {
  const v = record(value)?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function getRecordField(value: unknown, field: string): Record<string, unknown> | null {
  return record(record(value)?.[field]);
}
export function getArrayField(value: unknown, field: string): unknown[] {
  const v = record(value)?.[field];
  return Array.isArray(v) ? v : [];
}
export function getStringArrayField(value: unknown, field: string): string[] {
  return getArrayField(value, field).filter(
    (v): v is string => typeof v === "string" && !!v.trim(),
  );
}
export function relativeAutoresearchPath(cwd: string, file: string): string {
  return path.relative(cwd, file).split(path.sep).join("/");
}
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const MAX_DISCOVERY_FILES = 512;
export const MAX_DISCOVERY_BYTES = 32 * 1024 * 1024;

/** Bounded traversal, no symbolic/hard links. Never follows references outside discovery roots. */
export function collectJsonFiles(
  cwd: string,
  roots: readonly string[],
  issues: string[],
): string[] {
  const files: string[] = [];
  let visited = 0;
  const visit = (file: string, depth: number) => {
    if (++visited > 4096 || files.length >= MAX_DISCOVERY_FILES || depth > 12) {
      if (!issues.includes("Discovery limit reached; inventory is incomplete."))
        issues.push("Discovery limit reached; inventory is incomplete.");
      return;
    }
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("symlink rejected");
      if (stat.isDirectory()) {
        const dir = fs.opendirSync(file);
        try {
          for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
            visit(path.join(file, entry.name), depth + 1);
            if (visited > 4096 || files.length >= MAX_DISCOVERY_FILES) break;
          }
        } finally {
          dir.closeSync();
        }
      } else if (file.endsWith(".json")) {
        if (!stat.isFile() || stat.nlink !== 1) throw new Error("not a regular single-link file");
        files.push(file);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        issues.push(`${relativeAutoresearchPath(cwd, file)}: ${String(e)}`);
    }
  };
  for (const root of roots) {
    try {
      let parent = cwd;
      for (const part of root.split("/").slice(0, -1)) {
        parent = path.join(parent, part);
        if (!fs.lstatSync(parent).isDirectory())
          throw new Error("parent is not a real directory (symlinks rejected)");
      }
      visit(path.join(cwd, root), 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") issues.push(`${root}: ${String(e)}`);
    }
  }
  return [...new Set(files)].sort();
}

/** Recheck every parent and descriptor; cap bytes even if the file grows while open. */
export function readMatrixArtifactJson(
  cwd: string,
  file: string,
): { value: unknown; bytes: number; modifiedAt: number } {
  const relative = path.relative(cwd, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("path escapes cwd");
  let parent = cwd;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, part);
    if (!fs.lstatSync(parent).isDirectory())
      throw new Error("symlink/non-directory parent rejected");
  }
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_ARTIFACT_BYTES)
      throw new Error("not a bounded regular single-link artifact (8 MiB cap)");
    const buffer = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const after = fs.fstatSync(fd);
    if (size !== before.size || after.mtimeMs !== before.mtimeMs || after.size !== before.size)
      throw new Error("artifact changed during read");
    return {
      value: JSON.parse(buffer.subarray(0, size).toString("utf8")),
      bytes: size,
      modifiedAt: before.mtimeMs,
    };
  } finally {
    fs.closeSync(fd);
  }
}

const KINDS = new Set([
  "autoresearch.matrix_campaign_plan.v1",
  "autoresearch.matrix_campaign_runner_contract.v1",
  "autoresearch.matrix_campaign_runner_checkpoint.v1",
  "autoresearch.matrix_campaign_review.v1",
  "autoresearch.matrix_campaign_cockpit.v1",
  "autoresearch.matrix_campaign_operator_followup.v1",
]);
export function extractMatrixArtifactsFromJson(value: unknown): Array<{
  kind: AutoresearchMatrixCampaignArtifactKind;
  artifact: Record<string, unknown>;
  source: string;
}> {
  const found: ReturnType<typeof extractMatrixArtifactsFromJson> = [];
  const visit = (v: unknown, source: string, depth: number) => {
    if (!record(v) || depth > 3) return;
    const kind = getStringField(v, "kind");
    if (kind && KINDS.has(kind)) {
      found.push({
        kind: kind as AutoresearchMatrixCampaignArtifactKind,
        artifact: record(v) ?? {},
        source,
      });
      return;
    }
    for (const key of [
      "details",
      "matrixCampaign",
      "matrixCampaignRunner",
      "matrixCampaignRunnerCheckpoint",
      "matrixCampaignReview",
      "cockpit",
      "operatorFollowup",
    ])
      visit(record(v)?.[key], `${source}.${key}`, depth + 1);
  };
  visit(value, "root", 0);
  return found;
}
