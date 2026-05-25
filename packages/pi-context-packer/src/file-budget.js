import { closeSync, lstatSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

export const FILE_BUDGETS = Object.freeze({
  code: Object.freeze({ lines: 500, bytes: 50 * 1024 }),
  test: Object.freeze({ lines: 1000, bytes: 80 * 1024 }),
  markdown: Object.freeze({ lines: 800, bytes: 60 * 1024 }),
});

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const EXCLUDED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".tmp",
  "tmp",
  "vendor",
]);
const EXCLUDED_SUFFIXES = [".d.ts", ".min.js", ".bundle.js", ".map"];

const toPosix = (value) => value.split(path.sep).join("/");

function pathIsInside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function fileBudgetKindForPath(relativePath) {
  const normalized = toPosix(relativePath).toLowerCase();
  if (normalized.split("/").some((segment) => EXCLUDED_DIRS.has(segment))) return null;
  if (EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return null;
  const ext = path.extname(normalized).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (!CODE_EXTENSIONS.has(ext)) return null;
  const base = path.basename(normalized);
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

function lineCountFile(filePath) {
  const fd = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytesReadTotal = 0;
  let lines = 0;
  let lastByte;

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

export function analyzeFileBudgetForPath({ displayPath, absolutePath }) {
  const kind = fileBudgetKindForPath(displayPath);
  if (!kind) return null;
  const budget = FILE_BUDGETS[kind];

  try {
    if (lstatSync(absolutePath).isSymbolicLink()) return null;
    const stats = statSync(absolutePath);
    if (!stats.isFile()) return null;
    const bytes = stats.size;
    const lines = lineCountFile(absolutePath);
    if (lines <= budget.lines && bytes <= budget.bytes) return null;
    return {
      path: toPosix(displayPath),
      kind,
      lines,
      bytes,
      maxLines: budget.lines,
      maxBytes: budget.bytes,
    };
  } catch {
    return null;
  }
}

export function fileBudgetRisksForPathSeeds({ seeds = [], cwd, repoRoot }) {
  const root = repoRoot || cwd;
  if (!root || !path.isAbsolute(root)) return [];

  const risks = [];
  const seen = new Set();
  for (const seed of seeds) {
    if (seed?.kind !== "path" || typeof seed.value !== "string") continue;
    const absolutePath = path.resolve(root, seed.value);
    if (!pathIsInside(root, absolutePath)) continue;
    const key = toPosix(seed.value);
    if (seen.has(key)) continue;
    seen.add(key);
    const analysis = analyzeFileBudgetForPath({ displayPath: key, absolutePath });
    if (analysis) risks.push(analysis);
  }
  return risks;
}
