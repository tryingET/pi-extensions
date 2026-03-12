import { type RunAkCommandResult, runAkCommandAsync } from "./ak.ts";
import {
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  runSqliteStatementAsync,
} from "./boundaries.ts";
import {
  type ExecutionLike,
  type ExecutionStatus,
  getExecutionStatus,
  isExecutionSuccess,
} from "./execution-status.ts";

export interface EvidenceEntry {
  task_id?: number;
  check_type: string;
  result: "pass" | "fail" | "skip";
  details?: Record<string, unknown>;
}

export interface EvidenceWriteResult {
  ok: boolean;
  via: "ak" | "sql-fallback" | "failed";
  akError?: string;
  sqlError?: string;
}

export interface SkippedEvidenceWriteResult {
  ok: false;
  via: "skipped";
  reason: "aborted";
}

export interface RecordEvidenceConfig {
  akPath: string;
  societyDb: string;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
  runSql?: (dbPath: string, sql: string, signal?: AbortSignal) => Promise<BoundaryResult<void>>;
}

export interface FinalizeExecutionEffectsParams {
  result: ExecutionLike;
  signal?: AbortSignal;
  createEvidenceEntry: (context: { status: ExecutionStatus; success: boolean }) => EvidenceEntry;
  recordEvidence: (entry: EvidenceEntry, signal?: AbortSignal) => Promise<EvidenceWriteResult>;
}

export interface FinalizeExecutionEffectsResult {
  status: ExecutionStatus;
  success: boolean;
  evidence: EvidenceWriteResult | SkippedEvidenceWriteResult;
}

export async function recordEvidence(
  entry: EvidenceEntry,
  signal: AbortSignal | undefined,
  config: RecordEvidenceConfig,
): Promise<EvidenceWriteResult> {
  const akArgs = ["evidence", "record", "--check-type", entry.check_type, "--result", entry.result];
  if (typeof entry.task_id === "number") {
    akArgs.push("--task", String(entry.task_id));
  }
  if (entry.details) {
    akArgs.push("--details", JSON.stringify(entry.details));
  }

  const akResult = await (config.runAk || runAkCommandAsync)({
    akPath: config.akPath,
    societyDb: config.societyDb,
    args: akArgs,
    signal,
  });
  if (akResult.ok) {
    return { ok: true, via: "ak" };
  }

  if (signal?.aborted || akResult.aborted || akResult.timedOut) {
    return {
      ok: false,
      via: "failed",
      akError: akResult.stderr.slice(0, 500),
    };
  }

  const taskIdSql = typeof entry.task_id === "number" ? `${entry.task_id}` : "NULL";
  const detailsJson = entry.details ? escapeSqlLiteral(JSON.stringify(entry.details)) : "{}";
  const checkTypeSql = escapeSqlLiteral(entry.check_type);
  const resultSql = escapeSqlLiteral(entry.result);
  const sql = `INSERT INTO evidence (task_id, check_type, result, details) VALUES (${taskIdSql}, '${checkTypeSql}', '${resultSql}', '${detailsJson}')`;
  const sqlResult = await (config.runSql || runSqliteStatementAsync)(config.societyDb, sql, signal);

  if (isBoundaryFailure(sqlResult)) {
    return {
      ok: false,
      via: "failed",
      akError: akResult.stderr.slice(0, 500),
      sqlError: sqlResult.error.slice(0, 500),
    };
  }

  return {
    ok: true,
    via: "sql-fallback",
    akError: akResult.stderr.slice(0, 500),
  };
}

export async function finalizeExecutionEffects(
  params: FinalizeExecutionEffectsParams,
): Promise<FinalizeExecutionEffectsResult> {
  const status = getExecutionStatus(params.result);
  const success = isExecutionSuccess(params.result);

  if (status === "aborted") {
    return {
      status,
      success,
      evidence: {
        ok: false,
        via: "skipped",
        reason: "aborted",
      },
    };
  }

  return {
    status,
    success,
    evidence: await params.recordEvidence(
      params.createEvidenceEntry({ status, success }),
      params.signal,
    ),
  };
}
