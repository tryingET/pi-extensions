import { closeSync, lstatSync, openSync, readSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const SELF_FILE_BUDGETS = Object.freeze({
  code: Object.freeze({ lines: 500, bytes: 50 * 1024 }),
  test: Object.freeze({ lines: 1000, bytes: 80 * 1024 }),
  markdown: Object.freeze({ lines: 800, bytes: 60 * 1024 }),
});

const CODE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];
const MARKDOWN_EXTENSIONS = [".md", ".mdx"];
const EXCLUDED_SUFFIXES = [".d.ts", ".min.js", ".bundle.js", ".map"];

export interface FileBudgetObservation {
  path: string;
  kind: keyof typeof SELF_FILE_BUDGETS;
  lines: number;
  bytes: number;
  maxLines: number;
  maxBytes: number;
  netLinesDelta: number;
  growing: boolean;
  advisory: string;
}

interface TouchedFileLike {
  path: string;
  netLinesDelta: number;
}

const toPosix = (value: string) => value.replace(/\\/g, "/");

function fileKind(filePath: string): FileBudgetObservation["kind"] | null {
  const normalized = toPosix(filePath).toLowerCase();
  if (EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return null;
  if (MARKDOWN_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return "markdown";
  if (!CODE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return null;
  const base = normalized.split("/").at(-1) ?? normalized;
  if (
    normalized.startsWith("tests/") ||
    normalized.includes("/tests/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(base) ||
    /\.(?:test|spec)\.m?js$/u.test(base)
  ) {
    return "test";
  }
  return "code";
}

function lineCountFile(filePath: string): number {
  const fd = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytesReadTotal = 0;
  let lines = 0;
  let lastByte: number | undefined;

  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      bytesReadTotal += bytesRead;
      lastByte = buffer[bytesRead - 1];
      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === 10) lines += 1;
      }
    }
  } finally {
    closeSync(fd);
  }

  if (bytesReadTotal === 0) return 0;
  return lastByte === 10 ? lines : lines + 1;
}

function resolveTouchedPath(cwd: string | undefined, filePath: string): string | null {
  if (!filePath.trim()) return null;
  if (isAbsolute(filePath)) return resolve(filePath);
  return resolve(cwd || process.cwd(), filePath);
}

export function analyzeTouchedFileBudgets(
  files: readonly TouchedFileLike[],
  options: { cwd?: string } = {},
): FileBudgetObservation[] {
  const observations: FileBudgetObservation[] = [];
  for (const file of files) {
    const kind = fileKind(file.path);
    if (!kind) continue;
    const absolutePath = resolveTouchedPath(options.cwd, file.path);
    if (!absolutePath) continue;

    try {
      if (lstatSync(absolutePath).isSymbolicLink()) continue;
      const stats = statSync(absolutePath);
      if (!stats.isFile()) continue;
      const lines = lineCountFile(absolutePath);
      const bytes = stats.size;
      const budget = SELF_FILE_BUDGETS[kind];
      if (lines <= budget.lines && bytes <= budget.bytes) continue;
      const growing = file.netLinesDelta > 0;
      observations.push({
        path: file.path,
        kind,
        lines,
        bytes,
        maxLines: budget.lines,
        maxBytes: budget.bytes,
        netLinesDelta: file.netLinesDelta,
        growing,
        advisory: `${file.path} exceeds ${kind} budget (${lines}/${budget.lines} LOC, ${bytes}/${budget.bytes} bytes)${growing ? " and grew this session" : ""}; mirror-only cue: split, range-limit future reads, or record an explicit exception before closeout.`,
      });
    } catch {
      // Mirror-only cue: ignore files that cannot be inspected from this runtime cwd.
    }
  }
  return observations;
}
