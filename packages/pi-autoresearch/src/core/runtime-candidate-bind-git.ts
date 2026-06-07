import { spawnSync } from "node:child_process";

import { AUTORESEARCH_LOCAL_ARTIFACTS } from "./runtime-constants.ts";

export function runGitForCandidateBind(
  cwd: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

export function filterAutoresearchLocalArtifactPaths(files: string[]): string[] {
  return files.filter((file) => !isAutoresearchLocalArtifactPath(file));
}

function isAutoresearchLocalArtifactPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.startsWith(".autoresearch/")) return true;
  return AUTORESEARCH_LOCAL_ARTIFACTS.some(
    (artifact) => normalized === artifact || normalized.startsWith(`${artifact}/`),
  );
}

export function parseGitStatusPath(line: string): string | null {
  const raw = line.length >= 3 ? line.slice(3).trim() : line.trim();
  if (!raw) return null;
  const renameMarker = " -> ";
  return raw.includes(renameMarker)
    ? raw.slice(raw.lastIndexOf(renameMarker) + renameMarker.length)
    : raw;
}

export function splitNonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(isNonEmptyString);
}

export function splitNonEmptyStatusLines(value: string): string[] {
  return value.split(/\r?\n/u).filter((line) => line.trim().length > 0);
}

export function isNonEmptyString(value: string | null): value is string {
  return Boolean(value && value.trim().length > 0);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
