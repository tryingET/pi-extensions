import { execFileSync } from "node:child_process";
import { superviseProcess } from "./process-supervisor.ts";

export interface BoundaryFailure {
  ok: false;
  error: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

export interface BoundarySuccess<T> {
  ok: true;
  value: T;
}

export type BoundaryResult<T> = BoundaryFailure | BoundarySuccess<T>;

export function isBoundaryFailure<T>(result: BoundaryResult<T>): result is BoundaryFailure {
  return result.ok === false;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

export interface AsyncCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_BOUNDARY_TIMEOUT_MS =
  Number.parseInt(process.env.PI_ORCH_BOUNDARY_TIMEOUT_MS || "", 10) || 30_000;

function fail<T>(
  error: string,
  extras: Omit<BoundaryFailure, "ok" | "error"> = {},
): BoundaryResult<T> {
  return { ok: false, error, ...extras };
}

function getExecErrorField(error: unknown, field: "stderr" | "stdout"): string | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[field];
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function getExecExitCode(error: unknown): number | null | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  if (status === null) {
    return null;
  }
  return undefined;
}

export function execFileText(
  command: string,
  args: string[],
  options: CommandOptions = {},
): BoundaryResult<string> {
  try {
    const value = execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf-8",
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    });
    return { ok: true, value };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), {
      exitCode: getExecExitCode(error),
      stderr: getExecErrorField(error, "stderr"),
      stdout: getExecErrorField(error, "stdout"),
    });
  }
}

export async function execFileTextAsync(
  command: string,
  args: string[],
  options: AsyncCommandOptions = {},
): Promise<BoundaryResult<string>> {
  const result = await superviseProcess({
    command,
    args,
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_BOUNDARY_TIMEOUT_MS,
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULT_MAX_BUFFER,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULT_MAX_BUFFER,
  });

  if (result.exitCode === 0 && !result.aborted && !result.timedOut) {
    return { ok: true, value: result.stdout };
  }

  return fail(result.stderr || result.error || `process exited with code ${result.exitCode}`, {
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  });
}

export function querySqliteJson<T>(dbPath: string, sql: string): BoundaryResult<T[]> {
  const result = execFileText("sqlite3", [dbPath, "-json", sql]);
  return parseJsonBoundaryResult<T[]>(result, "sqlite3", (value) => JSON.parse(value) as T[]);
}

export async function querySqliteJsonAsync<T>(
  dbPath: string,
  sql: string,
  signal?: AbortSignal,
): Promise<BoundaryResult<T[]>> {
  const result = await execFileTextAsync("sqlite3", [dbPath, "-json", sql], { signal });
  return parseJsonBoundaryResult<T[]>(result, "sqlite3", (value) => JSON.parse(value) as T[]);
}

export function runSqliteStatement(dbPath: string, sql: string): BoundaryResult<void> {
  const result = execFileText("sqlite3", [dbPath, sql]);
  if (isBoundaryFailure(result)) {
    return fail(result.error, {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }
  return { ok: true, value: undefined };
}

export async function runSqliteStatementAsync(
  dbPath: string,
  sql: string,
  signal?: AbortSignal,
): Promise<BoundaryResult<void>> {
  const result = await execFileTextAsync("sqlite3", [dbPath, sql], { signal });
  if (isBoundaryFailure(result)) {
    return fail(result.error, {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }
  return { ok: true, value: undefined };
}

export function queryDoltJson(
  vaultDir: string,
  sql: string,
): BoundaryResult<{ rows: Record<string, unknown>[] }> {
  const result = execFileText("dolt", ["sql", "-r", "json", "-q", sql], {
    cwd: vaultDir,
  });
  return parseJsonBoundaryResult<{ rows: Record<string, unknown>[] }>(
    result,
    "dolt",
    parseDoltJsonRows,
  );
}

export async function queryDoltJsonAsync(
  vaultDir: string,
  sql: string,
  signal?: AbortSignal,
): Promise<BoundaryResult<{ rows: Record<string, unknown>[] }>> {
  const result = await execFileTextAsync("dolt", ["sql", "-r", "json", "-q", sql], {
    cwd: vaultDir,
    signal,
  });
  return parseJsonBoundaryResult<{ rows: Record<string, unknown>[] }>(
    result,
    "dolt",
    parseDoltJsonRows,
  );
}

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function escapeSqlLikePattern(value: string): string {
  return escapeSqlLiteral(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function buildSqlContainsExpression(column: string, value: string): string {
  return `${column} LIKE '%${escapeSqlLikePattern(value)}%' ESCAPE '\\'`;
}

function parseJsonBoundaryResult<T>(
  result: BoundaryResult<string>,
  source: "sqlite3" | "dolt",
  parse: (value: string) => T,
): BoundaryResult<T> {
  if (isBoundaryFailure(result)) {
    return fail(result.error, {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }

  if (!result.value.trim()) {
    return { ok: true, value: source === "sqlite3" ? ([] as T) : ({ rows: [] } as T) };
  }

  try {
    return { ok: true, value: parse(result.value) };
  } catch (error) {
    return fail(
      `Failed to parse ${source} JSON output: ${error instanceof Error ? error.message : String(error)}`,
      {
        stdout: result.value.slice(0, 1000),
      },
    );
  }
}

function parseDoltJsonRows(value: string): { rows: Record<string, unknown>[] } {
  const parsed = JSON.parse(value) as { rows?: Record<string, unknown>[] };
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
  };
}

function stripLeadingSqlComments(sql: string): string {
  let current = sql.trimStart();

  while (current.length > 0) {
    if (current.startsWith("--")) {
      const newlineIndex = current.indexOf("\n");
      if (newlineIndex === -1) {
        return "";
      }
      current = current.slice(newlineIndex + 1).trimStart();
      continue;
    }

    if (current.startsWith("/*")) {
      const commentEnd = current.indexOf("*/");
      if (commentEnd === -1) {
        return "";
      }
      current = current.slice(commentEnd + 2).trimStart();
      continue;
    }

    break;
  }

  return current;
}

function isReadOnlyPragma(sql: string): boolean {
  const match = sql.match(/^pragma\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const body = match[1].trim();
  if (!body || body.includes("=")) {
    return false;
  }

  return /^([a-z_][\w]*\.)?[a-z_][\w]*(\s*\([^;]*\))?$/i.test(body);
}

export function isReadOnlySql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql).trim();
  if (!normalized) {
    return false;
  }

  const withoutTrailingSemicolon = normalized.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return false;
  }

  if (/^pragma\b/i.test(withoutTrailingSemicolon)) {
    return isReadOnlyPragma(withoutTrailingSemicolon);
  }

  if (/^(select|explain)\b/i.test(withoutTrailingSemicolon)) {
    return true;
  }

  if (/^with\b/i.test(withoutTrailingSemicolon)) {
    const statementKeyword = getMainStatementKeywordAfterWith(withoutTrailingSemicolon);
    return statementKeyword === "select" || statementKeyword === "explain";
  }

  return false;
}

function getMainStatementKeywordAfterWith(sql: string): string | null {
  let index = 0;
  const withKeyword = readIdentifier(sql, index);
  if (!withKeyword || withKeyword.value.toLowerCase() !== "with") {
    return null;
  }
  index = skipWhitespaceAndComments(sql, withKeyword.nextIndex);

  const maybeRecursive = readIdentifier(sql, index);
  if (maybeRecursive?.value.toLowerCase() === "recursive") {
    index = skipWhitespaceAndComments(sql, maybeRecursive.nextIndex);
  }

  let completedCteBody = false;
  let awaitingCteBody = false;
  let cteBodyDepth = 0;

  while (index < sql.length) {
    index = skipWhitespaceAndComments(sql, index);
    if (index >= sql.length) {
      return null;
    }

    const char = sql[index];

    if (cteBodyDepth > 0) {
      const nextIndex = skipQuotedOrComment(sql, index);
      if (nextIndex !== index) {
        index = nextIndex;
        continue;
      }

      if (char === "(") {
        cteBodyDepth += 1;
        index += 1;
        continue;
      }

      if (char === ")") {
        cteBodyDepth -= 1;
        index += 1;
        if (cteBodyDepth === 0) {
          completedCteBody = true;
        }
        continue;
      }

      index += 1;
      continue;
    }

    if (awaitingCteBody) {
      if (char === "(") {
        cteBodyDepth = 1;
        awaitingCteBody = false;
        index += 1;
        continue;
      }

      const nextIndex = skipQuotedOrComment(sql, index);
      if (nextIndex !== index) {
        index = nextIndex;
        continue;
      }

      const token = readIdentifier(sql, index);
      if (token) {
        index = token.nextIndex;
        continue;
      }

      index += 1;
      continue;
    }

    if (char === ",") {
      completedCteBody = false;
      index += 1;
      continue;
    }

    if (char === "(") {
      index = skipBalancedGroup(sql, index);
      continue;
    }

    const nextIndex = skipQuotedOrComment(sql, index);
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }

    const token = readIdentifier(sql, index);
    if (!token) {
      index += 1;
      continue;
    }

    const keyword = token.value.toLowerCase();
    index = token.nextIndex;

    if (!completedCteBody) {
      if (keyword === "as") {
        awaitingCteBody = true;
      }
      continue;
    }

    return keyword;
  }

  return null;
}

function skipWhitespaceAndComments(sql: string, start: number): number {
  let index = start;

  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (sql.startsWith("--", index)) {
      const newlineIndex = sql.indexOf("\n", index + 2);
      return newlineIndex === -1 ? sql.length : skipWhitespaceAndComments(sql, newlineIndex + 1);
    }

    if (sql.startsWith("/*", index)) {
      const commentEnd = sql.indexOf("*/", index + 2);
      return commentEnd === -1 ? sql.length : skipWhitespaceAndComments(sql, commentEnd + 2);
    }

    break;
  }

  return index;
}

function readIdentifier(sql: string, start: number): { value: string; nextIndex: number } | null {
  const index = skipWhitespaceAndComments(sql, start);
  const first = sql[index];
  if (!first || !/[A-Za-z_]/.test(first)) {
    return null;
  }

  let nextIndex = index + 1;
  while (nextIndex < sql.length && /[A-Za-z0-9_]/.test(sql[nextIndex])) {
    nextIndex += 1;
  }

  return {
    value: sql.slice(index, nextIndex),
    nextIndex,
  };
}

function skipQuotedOrComment(sql: string, start: number): number {
  if (sql.startsWith("--", start)) {
    const newlineIndex = sql.indexOf("\n", start + 2);
    return newlineIndex === -1 ? sql.length : newlineIndex + 1;
  }

  if (sql.startsWith("/*", start)) {
    const commentEnd = sql.indexOf("*/", start + 2);
    return commentEnd === -1 ? sql.length : commentEnd + 2;
  }

  const quote = sql[start];
  if (quote === "'" || quote === '"' || quote === "`") {
    return skipDelimited(sql, start, quote, quote);
  }

  if (quote === "[") {
    return skipDelimited(sql, start, "[", "]");
  }

  return start;
}

function skipDelimited(sql: string, start: number, open: string, close: string): number {
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] === close) {
      if (close === open && sql[index + 1] === close) {
        index += 2;
        continue;
      }
      return index + 1;
    }

    if (sql[index] === "\\" && close !== "]") {
      index += 2;
      continue;
    }

    index += 1;
  }

  return sql.length;
}

function skipBalancedGroup(sql: string, start: number): number {
  let depth = 0;
  let index = start;

  while (index < sql.length) {
    const nextIndex = skipQuotedOrComment(sql, index);
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }

    if (sql[index] === "(") {
      depth += 1;
      index += 1;
      continue;
    }

    if (sql[index] === ")") {
      depth -= 1;
      index += 1;
      if (depth <= 0) {
        return index;
      }
      continue;
    }

    index += 1;
  }

  return sql.length;
}
