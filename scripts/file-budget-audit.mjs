#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_THRESHOLDS = Object.freeze({
  code: { lines: 500, bytes: 50 * 1024 },
  test: { lines: 1000, bytes: 80 * 1024 },
  markdown: { lines: 800, bytes: 60 * 1024 },
});

const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
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
const EXCLUDED_FILE_SUFFIXES = [
  ".d.ts",
  ".min.js",
  ".bundle.js",
  ".map",
  ".tgz",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".lock",
];

function usage() {
  console.error(`Usage: node ./scripts/file-budget-audit.mjs [--root <path>] [--warn-only|--fail] [--max-warnings N]

Default budgets:
  code:     ${DEFAULT_THRESHOLDS.code.lines} LOC / ${DEFAULT_THRESHOLDS.code.bytes} bytes
  tests:    ${DEFAULT_THRESHOLDS.test.lines} LOC / ${DEFAULT_THRESHOLDS.test.bytes} bytes
  markdown: ${DEFAULT_THRESHOLDS.markdown.lines} LOC / ${DEFAULT_THRESHOLDS.markdown.bytes} bytes`);
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    warnOnly: true,
    maxWarnings: Number.parseInt(process.env.PI_FILE_BUDGET_MAX_WARNINGS ?? "12", 10),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root requires a path");
      args.root = value;
    } else if (arg === "--warn-only") {
      args.warnOnly = true;
    } else if (arg === "--fail") {
      args.warnOnly = false;
    } else if (arg === "--max-warnings") {
      const value = argv[++i];
      if (!value) throw new Error("--max-warnings requires a number");
      args.maxWarnings = Number.parseInt(value, 10);
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.maxWarnings) || args.maxWarnings < 0) args.maxWarnings = 12;
  return args;
}

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join("/");
}

function isExcludedFile(filePath) {
  const normalized = filePath.toLowerCase();
  return EXCLUDED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function classifyFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (!CODE_EXTENSIONS.has(ext)) return null;
  const normalized = normalizeRelative(relativePath).toLowerCase();
  const base = path.basename(normalized);
  if (
    normalized.includes("/tests/") ||
    normalized.startsWith("tests/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(base) ||
    /\.(?:test|spec)\.m?js$/u.test(base)
  ) {
    return "test";
  }
  return "code";
}

function lineCountFile(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytesReadTotal = 0;
  let lines = 0;
  let lastByte;

  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      bytesReadTotal += bytesRead;
      lastByte = buffer[bytesRead - 1];
      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === 10) lines += 1;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  if (bytesReadTotal === 0) return 0;
  return lastByte === 10 ? lines : lines + 1;
}

function auditPathLabel(root, filePath) {
  const relativePath = normalizeRelative(path.relative(root, filePath));
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function collectFiles(root, auditErrors) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      auditErrors.push({
        path: auditPathLabel(root, current),
        operation: "read_dir",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isExcludedFile(entry.name)) continue;
      files.push(fullPath);
    }
  }
  return files.sort();
}

export function auditFileBudgets(input = {}) {
  const root = path.resolve(input.root ?? process.cwd());
  const rootStats = fs.statSync(root);
  if (!rootStats.isDirectory()) {
    throw new Error(`file-budget root is not a directory: ${root}`);
  }
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const violations = [];
  const errors = [];

  for (const filePath of collectFiles(root, errors)) {
    const relativePath = normalizeRelative(path.relative(root, filePath));
    const kind = classifyFile(relativePath);
    if (!kind) continue;
    const budget = thresholds[kind];
    if (!budget) continue;

    let stats;
    let lines;
    try {
      stats = fs.statSync(filePath);
      lines = lineCountFile(filePath);
    } catch (error) {
      errors.push({
        path: relativePath,
        operation: "read_file",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const bytes = stats.size;
    if (lines <= budget.lines && bytes <= budget.bytes) continue;
    violations.push({
      path: relativePath,
      kind,
      lines,
      bytes,
      maxLines: budget.lines,
      maxBytes: budget.bytes,
      overLines: Math.max(0, lines - budget.lines),
      overBytes: Math.max(0, bytes - budget.bytes),
    });
  }

  violations.sort((a, b) => {
    const aScore = a.overLines / Math.max(1, a.maxLines) + a.overBytes / Math.max(1, a.maxBytes);
    const bScore = b.overLines / Math.max(1, b.maxLines) + b.overBytes / Math.max(1, b.maxBytes);
    return bScore - aScore || a.path.localeCompare(b.path);
  });

  return { root, violations, errors };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}KB`;
}

function printReport(result, { maxWarnings, warnOnly }) {
  const mode = warnOnly ? "warning" : "error";
  if (result.violations.length === 0 && result.errors.length === 0) {
    console.log("file-budget: ok");
    return;
  }

  if (result.errors.length > 0) {
    console.error(
      `file-budget: ${mode}: ${result.errors.length} path(s) could not be audited under ${result.root}`,
    );
    for (const item of result.errors.slice(0, maxWarnings)) {
      console.error(`file-budget: ${item.path} (${item.operation}) ${item.message}`);
    }
    const hiddenErrors = result.errors.length - Math.min(result.errors.length, maxWarnings);
    if (hiddenErrors > 0) {
      console.error(`file-budget: ... ${hiddenErrors} more audit error(s) omitted`);
    }
  }

  if (result.violations.length === 0) {
    console.error(
      warnOnly
        ? "file-budget: current posture is warn-only; audit errors should be resolved before ratcheting to hard fail"
        : "file-budget: hard-fail posture is active; resolve audit errors before retrying",
    );
    return;
  }

  const shown = result.violations.slice(0, maxWarnings);
  console.error(
    `file-budget: ${mode}: ${result.violations.length} file(s) exceed brownfield readability budgets under ${result.root}`,
  );
  for (const item of shown) {
    console.error(
      `file-budget: ${item.path} (${item.kind}) ${item.lines}/${item.maxLines} LOC, ${formatBytes(item.bytes)}/${formatBytes(item.maxBytes)}`,
    );
  }
  const hidden = result.violations.length - shown.length;
  if (hidden > 0) {
    console.error(
      `file-budget: ... ${hidden} more over-budget file(s) omitted; rerun with --max-warnings 0 for summary-only or a larger value for detail`,
    );
  }
  console.error(
    warnOnly
      ? "file-budget: current posture is warn-only; split touched/growing oversized files or record an explicit exception before ratcheting to hard fail"
      : "file-budget: hard-fail posture is active; split oversized files or record an explicit owner-scoped exception before retrying",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = auditFileBudgets({ root: args.root });
    printReport(result, args);
    if (!args.warnOnly && (result.violations.length > 0 || result.errors.length > 0)) process.exit(1);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    usage();
    process.exit(1);
  }
}
