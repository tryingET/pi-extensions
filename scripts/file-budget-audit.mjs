#!/usr/bin/env node
/**
summary: "Audits code, test, and Markdown files against advisory line and byte budgets with bounded diagnostics and owner-scoped exceptions."
read_when:
  - "Changing file classification, excluded artifacts, readability thresholds, warn-versus-fail reporting, or the exceptions policy contract."
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverExceptionsPolicyPath,
  exceptionsPolicyRepoRoot,
  FILE_BUDGET_EXCEPTIONS_POLICY,
  loadFileBudgetExceptionsPolicy,
} from "./file-budget-exceptions.mjs";

export { discoverExceptionsPolicyPath, exceptionsPolicyRepoRoot, FILE_BUDGET_EXCEPTIONS_POLICY };

export const FILE_BUDGET_POLICY = Object.freeze({
  boundary: "package-local-runtime-copy/root-parity-test",
  budgets: Object.freeze({
    code: Object.freeze({ lines: 500, bytes: 50 * 1024 }),
    test: Object.freeze({ lines: 1000, bytes: 80 * 1024 }),
    markdown: Object.freeze({ lines: 800, bytes: 60 * 1024 }),
  }),
  codeExtensions: Object.freeze([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]),
  markdownExtensions: Object.freeze([".md", ".mdx"]),
  excludedDirs: Object.freeze([
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
  ]),
  excludedFileSuffixes: Object.freeze([
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
  ]),
});

const DEFAULT_THRESHOLDS = FILE_BUDGET_POLICY.budgets;
const CODE_EXTENSIONS = new Set(FILE_BUDGET_POLICY.codeExtensions);
const MARKDOWN_EXTENSIONS = new Set(FILE_BUDGET_POLICY.markdownExtensions);
const EXCLUDED_DIRS = new Set(FILE_BUDGET_POLICY.excludedDirs);
const EXCLUDED_FILE_SUFFIXES = FILE_BUDGET_POLICY.excludedFileSuffixes;

function usage() {
  console.error(`Usage: node ./scripts/file-budget-audit.mjs [--root <path>] [--warn-only|--fail] [--max-warnings N] [--exceptions <path>]

Default budgets:
  code:     ${DEFAULT_THRESHOLDS.code.lines} LOC / ${DEFAULT_THRESHOLDS.code.bytes} bytes
  tests:    ${DEFAULT_THRESHOLDS.test.lines} LOC / ${DEFAULT_THRESHOLDS.test.bytes} bytes
  markdown: ${DEFAULT_THRESHOLDS.markdown.lines} LOC / ${DEFAULT_THRESHOLDS.markdown.bytes} bytes

Exceptions:
  Auto-discovered at ${FILE_BUDGET_EXCEPTIONS_POLICY.relativePath} relative to the
  audit root or any ancestor directory. Entries require path (repo-relative),
  owner, reason, and reopen_trigger. An invalid, stale, duplicate, or
  unknown-file exceptions manifest is rejected with a non-zero exit in both
  warn-only and fail modes. Override discovery with --exceptions <path>.`);
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    warnOnly: true,
    maxWarnings: Number.parseInt(process.env.PI_FILE_BUDGET_MAX_WARNINGS ?? "12", 10),
    exceptionsPath: null,
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
    } else if (arg === "--exceptions") {
      const value = argv[++i];
      if (!value) throw new Error("--exceptions requires a path");
      args.exceptionsPath = value;
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

export function classifyFileBudgetPath(relativePath) {
  const normalized = normalizeRelative(relativePath).toLowerCase();
  if (normalized.split("/").some((segment) => EXCLUDED_DIRS.has(segment))) return null;
  if (EXCLUDED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return null;
  const ext = path.extname(normalized).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (!CODE_EXTENSIONS.has(ext)) return null;
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

function applyExceptions({ violations, root, exceptionsSource, policyEntries, policyErrors }) {
  const repoRoot = exceptionsPolicyRepoRoot(exceptionsSource);
  const exceptionByAbsPath = new Map();
  for (const entry of policyEntries) {
    exceptionByAbsPath.set(path.join(repoRoot, ...entry.path.split("/")), entry);
  }

  // Every manifest entry must reference an existing file, regardless of
  // whether the current audit run covers its subtree.
  for (const entry of policyEntries) {
    if (!fs.existsSync(path.join(repoRoot, ...entry.path.split("/")))) {
      policyErrors.push({
        path: entry.path,
        category: "unknown_file",
        message: "exception path does not exist in the repository",
      });
    }
  }

  const excepted = [];
  const remaining = [];
  const violatingAbsPaths = new Set();
  for (const violation of violations) violatingAbsPaths.add(path.resolve(root, violation.path));

  const rootAbs = path.resolve(root);
  const insideAuditRoot = (absolute) => {
    const relative = path.relative(rootAbs, absolute);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };

  for (const violation of violations) {
    const entry = exceptionByAbsPath.get(path.resolve(root, violation.path));
    if (!entry) {
      remaining.push(violation);
      continue;
    }
    excepted.push({ ...violation, owner: entry.owner });
  }

  // In-scope manifest entries whose files no longer violate a budget (or are
  // no longer audited) are stale and must be removed from the manifest.
  // Nonexistent paths are already reported as unknown_file above.
  for (const [absolute, entry] of exceptionByAbsPath) {
    if (!insideAuditRoot(absolute)) continue;
    if (!fs.existsSync(absolute)) continue;
    if (!violatingAbsPaths.has(absolute)) {
      const classified = classifyFileBudgetPath(path.relative(rootAbs, absolute));
      policyErrors.push({
        path: entry.path,
        category: "stale",
        message: classified
          ? "file no longer exceeds a budget; remove this exception"
          : "file is not audited by the file-budget classifier; remove this exception",
      });
    }
  }

  return { violations: remaining, excepted };
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
  const policyErrors = [];

  for (const filePath of collectFiles(root, errors)) {
    const relativePath = normalizeRelative(path.relative(root, filePath));
    const kind = classifyFileBudgetPath(relativePath);
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

  let exceptionsSource = null;
  if (typeof input.exceptionsPath === "string" && input.exceptionsPath.length > 0) {
    exceptionsSource = path.resolve(input.exceptionsPath);
    if (!fs.existsSync(exceptionsSource)) {
      policyErrors.push({
        path: input.exceptionsPath,
        category: "unknown_file",
        message: "explicit --exceptions policy file does not exist",
      });
    }
  } else {
    exceptionsSource = discoverExceptionsPolicyPath(root);
  }

  let excepted = [];
  if (exceptionsSource && policyErrors.length === 0) {
    const { entries, errors: loadErrors } = loadFileBudgetExceptionsPolicy(exceptionsSource);
    policyErrors.push(...loadErrors);
    if (loadErrors.length === 0) {
      const applied = applyExceptions({
        violations,
        root,
        exceptionsSource,
        policyEntries: entries,
        policyErrors,
      });
      violations.splice(0, violations.length, ...applied.violations);
      excepted = applied.excepted;
    }
  }

  violations.sort((a, b) => {
    const aScore = a.overLines / Math.max(1, a.maxLines) + a.overBytes / Math.max(1, a.maxBytes);
    const bScore = b.overLines / Math.max(1, b.maxLines) + b.overBytes / Math.max(1, b.maxBytes);
    return bScore - aScore || a.path.localeCompare(b.path);
  });

  return { root, violations, errors, excepted, policyErrors, exceptionsSource };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}KB`;
}

function printPolicyErrors(result) {
  console.error(
    `file-budget: error: exceptions policy rejected (${result.exceptionsSource ?? "unknown policy"}): ${result.policyErrors.length} problem(s)`,
  );
  for (const item of result.policyErrors) {
    console.error(`file-budget: error: [${item.category}] ${item.path}: ${item.message}`);
  }
  console.error(
    "file-budget: error: fix or remove the invalid exception entries; violations are reported without exception suppression",
  );
}

function printReport(result, { maxWarnings, warnOnly }) {
  const mode = warnOnly ? "warning" : "error";
  const policyProblem = result.policyErrors.length > 0;
  if (
    result.violations.length === 0 &&
    result.errors.length === 0 &&
    result.excepted.length === 0 &&
    !policyProblem
  ) {
    console.log("file-budget: ok");
    return;
  }

  if (policyProblem) printPolicyErrors(result);

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

  if (result.violations.length > 0) {
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
        maxWarnings === 0
          ? `file-budget: ... ${hidden} over-budget file(s) omitted by summary-only output`
          : `file-budget: ... ${hidden} more over-budget file(s) omitted; rerun with --max-warnings 0 for summary-only or a larger value for detail`,
      );
    }
  }

  if (result.excepted.length > 0) {
    console.error(
      `file-budget: ${result.excepted.length} over-budget file(s) carry explicit owner-scoped exceptions (${result.exceptionsSource})`,
    );
    for (const item of result.excepted.slice(0, maxWarnings)) {
      console.error(
        `file-budget: ${item.path} (${item.kind}) ${item.lines}/${item.maxLines} LOC, ${formatBytes(item.bytes)}/${formatBytes(item.maxBytes)} — excepted, owner: ${item.owner}`,
      );
    }
    const hiddenExcepted = result.excepted.length - Math.min(result.excepted.length, maxWarnings);
    if (hiddenExcepted > 0) {
      console.error(`file-budget: ... ${hiddenExcepted} more excepted file(s) omitted`);
    }
  }

  if (result.violations.length > 0) {
    console.error(
      warnOnly
        ? `file-budget: current posture is warn-only; split touched/growing oversized files or record an explicit exception in ${FILE_BUDGET_EXCEPTIONS_POLICY.relativePath} before ratcheting to hard fail`
        : `file-budget: hard-fail posture is active; split oversized files or record an explicit owner-scoped exception in ${FILE_BUDGET_EXCEPTIONS_POLICY.relativePath} before retrying`,
    );
    return;
  }

  if (result.errors.length > 0) {
    console.error(
      warnOnly
        ? "file-budget: current posture is warn-only; audit errors should be resolved before ratcheting to hard fail"
        : "file-budget: hard-fail posture is active; resolve audit errors before retrying",
    );
    return;
  }

  if (!policyProblem) {
    console.log(
      result.excepted.length > 0
        ? `file-budget: ok (${result.excepted.length} over-budget file(s) carry explicit owner-scoped exceptions)`
        : "file-budget: ok",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = auditFileBudgets({
      root: args.root,
      exceptionsPath: args.exceptionsPath ?? null,
    });
    printReport(result, args);
    if (result.policyErrors.length > 0) process.exit(1);
    if (!args.warnOnly && (result.violations.length > 0 || result.errors.length > 0)) process.exit(1);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    usage();
    process.exit(1);
  }
}
