import * as path from "node:path";
import {
  type RepoBootstrapReport,
  type RunAkCommandResult,
  type RunAkRepoBootstrapResult,
  runAkCommandAsync,
  runAkRepoBootstrap,
} from "./ak.ts";
import {
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  querySqliteJsonAsync,
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
  via: "ak" | "failed";
  akError?: string;
}

export interface SkippedEvidenceWriteResult {
  ok: false;
  via: "skipped";
  reason: "aborted";
}

export interface RecordEvidenceConfig {
  akPath: string;
  societyDb: string;
  cwd?: string;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
  runRepoBootstrap?: (params: {
    akPath: string;
    societyDb: string;
    requestedPath: string;
    signal?: AbortSignal;
  }) => Promise<RunAkRepoBootstrapResult>;
  runSql?: (dbPath: string, sql: string, signal?: AbortSignal) => Promise<BoundaryResult<void>>;
  querySqliteJson?: <T>(
    dbPath: string,
    sql: string,
    signal?: AbortSignal,
  ) => Promise<BoundaryResult<T[]>>;
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

const repoBootstrapCache = new Map<string, RepoBootstrapReport>();

function truncateAkError(error: string | undefined, fallback: string): string {
  const normalized = (error || "").trim();
  return (normalized.length > 0 ? normalized : fallback).slice(0, 500);
}

function describeRepoBootstrapFailure(report: RepoBootstrapReport): string {
  const prefix =
    report.outcome === "explicit_only"
      ? "ak repo bootstrap requires explicit repo registration before evidence can be recorded"
      : report.outcome === "excluded"
        ? "ak repo bootstrap excluded the current cwd from canonical repo registration"
        : "ak repo bootstrap did not establish canonical repo registration";

  return [prefix, report.reason?.trim(), report.guidance?.trim()].filter(Boolean).join(". ");
}

async function findRegisteredRepoAncestor(
  config: RecordEvidenceConfig,
  signal: AbortSignal | undefined,
  repoPath: string,
): Promise<BoundaryResult<string | null>> {
  const repoPathSql = escapeSqlLiteral(repoPath);
  const repoPathWithSlashSql = escapeSqlLiteral(`${repoPath}/`);
  const queryResult = await (config.querySqliteJson || querySqliteJsonAsync)<{ path?: string }>(
    config.societyDb,
    [
      "SELECT path",
      "FROM repos",
      `WHERE path = '${repoPathSql}' OR instr('${repoPathWithSlashSql}', path || '/') = 1`,
      "ORDER BY length(path) DESC",
      "LIMIT 1",
    ].join(" "),
    signal,
  );

  if (isBoundaryFailure(queryResult)) {
    return queryResult;
  }

  return {
    ok: true,
    value: queryResult.value[0]?.path || null,
  };
}

async function determineEvidenceWriteMode(
  config: RecordEvidenceConfig,
  signal: AbortSignal | undefined,
  repoPath: string,
): Promise<{ mode: "ak" | "failed"; akError?: string }> {
  const registeredRepo = await findRegisteredRepoAncestor(config, signal, repoPath);
  if (isBoundaryFailure(registeredRepo)) {
    return { mode: "ak" };
  }

  if (registeredRepo.value) {
    return { mode: "ak" };
  }

  const cachedBootstrap = repoBootstrapCache.get(repoPath);
  if (cachedBootstrap) {
    if (
      cachedBootstrap.outcome === "registered" ||
      cachedBootstrap.outcome === "already_registered"
    ) {
      return { mode: "ak" };
    }
    return {
      mode: "failed",
      akError: describeRepoBootstrapFailure(cachedBootstrap),
    };
  }

  const bootstrapResult = await (config.runRepoBootstrap || runAkRepoBootstrap)({
    akPath: config.akPath,
    societyDb: config.societyDb,
    requestedPath: repoPath,
    signal,
  });

  if (!bootstrapResult.ok) {
    return {
      mode: "failed",
      akError: truncateAkError(bootstrapResult.stderr, "ak repo bootstrap failed"),
    };
  }

  if (!bootstrapResult.report) {
    return {
      mode: "failed",
      akError: "ak repo bootstrap did not return a structured report",
    };
  }

  repoBootstrapCache.set(repoPath, bootstrapResult.report);

  if (
    bootstrapResult.report.outcome === "registered" ||
    bootstrapResult.report.outcome === "already_registered"
  ) {
    return { mode: "ak" };
  }

  return {
    mode: "failed",
    akError: describeRepoBootstrapFailure(bootstrapResult.report),
  };
}

export async function recordEvidence(
  entry: EvidenceEntry,
  signal: AbortSignal | undefined,
  config: RecordEvidenceConfig,
): Promise<EvidenceWriteResult> {
  const repoPath = path.resolve(config.cwd || process.cwd());
  const akArgs = ["evidence", "record", "--check-type", entry.check_type, "--result", entry.result];
  if (typeof entry.task_id === "number") {
    akArgs.push("--task", String(entry.task_id));
  }
  if (entry.details) {
    akArgs.push("--details", JSON.stringify(entry.details));
  }

  const mode = await determineEvidenceWriteMode(config, signal, repoPath);
  if (mode.mode === "failed") {
    return {
      ok: false,
      via: "failed",
      akError: mode.akError,
    };
  }

  const akResult = await (config.runAk || runAkCommandAsync)({
    akPath: config.akPath,
    societyDb: config.societyDb,
    args: akArgs,
    cwd: repoPath,
    signal,
  });
  if (akResult.ok) {
    return { ok: true, via: "ak" };
  }

  return {
    ok: false,
    via: "failed",
    akError: truncateAkError(akResult.stderr, "ak evidence record failed"),
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
