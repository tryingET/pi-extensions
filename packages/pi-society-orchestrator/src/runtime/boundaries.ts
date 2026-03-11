import { execFileSync } from "node:child_process";

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

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

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

export function querySqliteJson<T>(dbPath: string, sql: string): BoundaryResult<T[]> {
  const result = execFileText("sqlite3", [dbPath, "-json", sql]);
  if (isBoundaryFailure(result)) {
    return fail(result.error, {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }

  if (!result.value.trim()) {
    return { ok: true, value: [] };
  }

  try {
    return { ok: true, value: JSON.parse(result.value) as T[] };
  } catch (error) {
    return fail(
      `Failed to parse sqlite3 JSON output: ${error instanceof Error ? error.message : String(error)}`,
      {
        stdout: result.value.slice(0, 1000),
      },
    );
  }
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

export function queryDoltJson(
  vaultDir: string,
  sql: string,
): BoundaryResult<{ rows: Record<string, unknown>[] }> {
  const result = execFileText("dolt", ["sql", "-r", "json", "-q", sql], {
    cwd: vaultDir,
  });
  if (isBoundaryFailure(result)) {
    return fail(result.error, {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
  }

  if (!result.value.trim()) {
    return { ok: true, value: { rows: [] } };
  }

  try {
    return { ok: true, value: JSON.parse(result.value) as { rows: Record<string, unknown>[] } };
  } catch (error) {
    return fail(
      `Failed to parse dolt JSON output: ${error instanceof Error ? error.message : String(error)}`,
      {
        stdout: result.value.slice(0, 1000),
      },
    );
  }
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

export function isReadOnlySql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql).trim();
  if (!normalized) {
    return false;
  }

  const withoutTrailingSemicolon = normalized.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return false;
  }

  return /^(select|pragma|explain)\b/i.test(withoutTrailingSemicolon);
}
