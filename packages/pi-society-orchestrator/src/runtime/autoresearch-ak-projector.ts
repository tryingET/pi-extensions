import * as path from "node:path";
import {
  type AutoresearchSupervisorEvidenceResult,
  type AutoresearchSupervisorLedgerLike,
  type AutoresearchSupervisorMilestone,
  type AutoresearchSupervisorRuntimeStatusLike,
  type AutoresearchSupervisorSnapshot,
  observeAutoresearchSupervisor,
} from "../loops/autoresearch-supervisor.ts";
import { type RunAkCommandResult, runAkCommandAsync } from "./ak.ts";
import {
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  querySqliteJsonAsync,
} from "./boundaries.ts";
import { type EvidenceWriteResult, recordEvidence } from "./evidence.ts";

export const AUTORESEARCH_AK_PROJECTION_CONTRACT_VERSION = 1 as const;
export const AUTORESEARCH_AK_PROJECTION_OWNER = "pi-society-orchestrator" as const;
export const AUTORESEARCH_AK_RUNTIME_OWNER = "pi-autoresearch" as const;
export const AUTORESEARCH_AK_MILESTONE_CHECK_TYPE_PREFIX = "autoresearch:milestone:" as const;

export interface AutoresearchAkRuntimeStatusLike extends AutoresearchSupervisorRuntimeStatusLike {
  receiptPath?: string;
}

export interface AutoresearchAkMilestoneEvidenceDetails extends Record<string, unknown> {
  contract_version: typeof AUTORESEARCH_AK_PROJECTION_CONTRACT_VERSION;
  projection_owner: typeof AUTORESEARCH_AK_PROJECTION_OWNER;
  runtime_owner: typeof AUTORESEARCH_AK_RUNTIME_OWNER;
  milestone: AutoresearchSupervisorMilestone;
  projection_key: string;
  cwd: string;
  segment: {
    name: string;
    metric_name: string;
    metric_unit: string;
    direction: "lower" | "higher";
  };
  runtime: {
    state: string;
    run_count: number;
    successful_run_count: number;
    baseline_metric: number | null;
    best_metric: number | null;
    last_run_status: string | null;
    last_run_metric: number | null;
    blocked_reason: string | null;
    completion_reason: string | null;
  };
  ledger: {
    path: string;
    event_count: number;
    replayed_event_count: number;
    invalid_line_count: number;
    rejected_event_count: number;
  };
  receipts: {
    path: string;
  };
  task_anchor?: {
    id: number;
    repo: string;
    title?: string;
    status?: string;
    entity_version?: number;
  };
  summary: string;
}

export interface AutoresearchAkMilestonePayload {
  checkType: string;
  result: AutoresearchSupervisorEvidenceResult;
  details: AutoresearchAkMilestoneEvidenceDetails;
}

export interface AutoresearchAkMilestoneCandidate {
  kind: "projectable" | "noop" | "blocked";
  snapshot: AutoresearchSupervisorSnapshot;
  payload: AutoresearchAkMilestonePayload | null;
  reason: string;
}

export interface AutoresearchAkTaskAnchor {
  id: number;
  repo: string;
  title?: string;
  status?: string;
  entityVersion?: number;
}

export interface AutoresearchAkProjectorParams {
  taskId: number;
  akPath: string;
  societyDb: string;
  runtime: AutoresearchAkRuntimeStatusLike;
  ledger?: AutoresearchSupervisorLedgerLike;
  signal?: AbortSignal;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
  runRepoBootstrap?: Parameters<typeof recordEvidence>[2]["runRepoBootstrap"];
  runSql?: Parameters<typeof recordEvidence>[2]["runSql"];
  querySqliteJson?: <T>(
    dbPath: string,
    sql: string,
    signal?: AbortSignal,
  ) => Promise<BoundaryResult<T[]>>;
}

export interface AutoresearchAkProjectorResult {
  ok: boolean;
  action: "recorded" | "already-projected" | "noop" | "blocked";
  candidate: AutoresearchAkMilestoneCandidate;
  task?: AutoresearchAkTaskAnchor;
  existingEvidenceId?: number;
  evidence?: EvidenceWriteResult;
  error?: string;
}

interface ProjectionRow {
  id?: number;
  projection_key?: string | null;
}

interface RawTaskAnchor {
  id?: unknown;
  repo?: unknown;
  title?: unknown;
  status?: unknown;
  entity_version?: unknown;
}

export function buildAutoresearchAkMilestoneCheckType(
  milestone: AutoresearchSupervisorMilestone,
): string {
  return `${AUTORESEARCH_AK_MILESTONE_CHECK_TYPE_PREFIX}${milestone}`;
}

export function deriveAutoresearchAkMilestoneCandidate(input: {
  runtime: AutoresearchAkRuntimeStatusLike;
  ledger?: AutoresearchSupervisorLedgerLike;
}): AutoresearchAkMilestoneCandidate {
  const snapshot = observeAutoresearchSupervisor({
    runtime: input.runtime,
    ledger: input.ledger,
  });

  if (snapshot.action === "fail_closed") {
    return {
      kind: "blocked",
      snapshot,
      payload: null,
      reason: snapshot.projectionBlockedReason ?? snapshot.summary,
    };
  }

  if (
    !snapshot.projectable ||
    !snapshot.milestone ||
    !snapshot.projectionKey ||
    !snapshot.evidenceResult ||
    !snapshot.cwd ||
    !snapshot.runtimeState ||
    !snapshot.segment.name ||
    !snapshot.segment.metricName ||
    !snapshot.segment.direction
  ) {
    return {
      kind: "noop",
      snapshot,
      payload: null,
      reason: snapshot.summary,
    };
  }

  const cwd = path.resolve(snapshot.cwd);
  const receiptPath = resolveCampaignArtifactPath(
    cwd,
    input.runtime.receiptPath,
    "autoresearch.jsonl",
  );
  const ledgerPath = resolveCampaignArtifactPath(
    cwd,
    input.runtime.runtimeProjection.ledgerPath,
    "autoresearch.events.jsonl",
  );

  return {
    kind: "projectable",
    snapshot,
    payload: {
      checkType: buildAutoresearchAkMilestoneCheckType(snapshot.milestone),
      result: snapshot.evidenceResult,
      details: {
        contract_version: AUTORESEARCH_AK_PROJECTION_CONTRACT_VERSION,
        projection_owner: AUTORESEARCH_AK_PROJECTION_OWNER,
        runtime_owner: AUTORESEARCH_AK_RUNTIME_OWNER,
        milestone: snapshot.milestone,
        projection_key: snapshot.projectionKey,
        cwd,
        segment: {
          name: snapshot.segment.name,
          metric_name: snapshot.segment.metricName,
          metric_unit: snapshot.segment.metricUnit,
          direction: snapshot.segment.direction,
        },
        runtime: {
          state: snapshot.runtimeState,
          run_count: snapshot.segment.runCount,
          successful_run_count: snapshot.segment.successfulRunCount,
          baseline_metric: snapshot.segment.baselineMetric,
          best_metric: snapshot.segment.bestMetric,
          last_run_status: snapshot.segment.lastRunStatus,
          last_run_metric: snapshot.segment.lastRunMetric,
          blocked_reason: snapshot.reasons.blockedReason,
          completion_reason: snapshot.reasons.completionReason,
        },
        ledger: {
          path: ledgerPath,
          event_count: input.runtime.runtimeProjection.eventCount,
          replayed_event_count: input.runtime.runtimeProjection.replayedEventCount,
          invalid_line_count: input.runtime.runtimeProjection.invalidLedgerLines,
          rejected_event_count: input.runtime.runtimeProjection.rejectedEvents.length,
        },
        receipts: {
          path: receiptPath,
        },
        summary: snapshot.summary,
      },
    },
    reason: snapshot.summary,
  };
}

export async function projectAutoresearchAkMilestone(
  params: AutoresearchAkProjectorParams,
): Promise<AutoresearchAkProjectorResult> {
  const candidate = deriveAutoresearchAkMilestoneCandidate({
    runtime: params.runtime,
    ledger: params.ledger,
  });

  if (candidate.kind === "blocked") {
    return {
      ok: false,
      action: "blocked",
      candidate,
      error: candidate.reason,
    };
  }

  if (candidate.kind === "noop") {
    return {
      ok: true,
      action: "noop",
      candidate,
    };
  }

  const payload = candidate.payload;
  if (!payload) {
    return {
      ok: false,
      action: "blocked",
      candidate,
      error: "projectable autoresearch candidate is missing payload details",
    };
  }

  const task = await loadTaskAnchor(params, params.taskId, payload.details.cwd);
  if (isBoundaryFailure(task)) {
    return {
      ok: false,
      action: "blocked",
      candidate,
      error: task.error,
    };
  }

  if (!isWithinRepo(payload.details.cwd, task.value.repo)) {
    return {
      ok: false,
      action: "blocked",
      candidate,
      task: task.value,
      error: `campaign cwd ${payload.details.cwd} is outside anchored task repo ${task.value.repo}`,
    };
  }

  const existingProjection = await readExistingProjectionByKey(params, {
    taskId: params.taskId,
    checkType: payload.checkType,
    projectionKey: payload.details.projection_key,
  });
  if (isBoundaryFailure(existingProjection)) {
    return {
      ok: false,
      action: "blocked",
      candidate,
      task: task.value,
      error: existingProjection.error,
    };
  }

  if (existingProjection.value?.projection_key === payload.details.projection_key) {
    return {
      ok: true,
      action: "already-projected",
      candidate,
      task: task.value,
      existingEvidenceId: existingProjection.value.id,
    };
  }

  const anchoredPayload = attachTaskAnchorToPayload(payload, task.value);
  const evidence = await recordEvidence(
    {
      task_id: params.taskId,
      check_type: anchoredPayload.checkType,
      result: anchoredPayload.result,
      details: anchoredPayload.details,
    },
    params.signal,
    {
      akPath: params.akPath,
      societyDb: params.societyDb,
      cwd: payload.details.cwd,
      runAk: params.runAk,
      runRepoBootstrap: params.runRepoBootstrap,
      runSql: params.runSql,
      querySqliteJson: params.querySqliteJson,
    },
  );

  if (!evidence.ok) {
    return {
      ok: false,
      action: "blocked",
      candidate,
      task: task.value,
      evidence,
      error: evidence.akError || "failed to record autoresearch AK milestone evidence",
    };
  }

  return {
    ok: true,
    action: "recorded",
    candidate,
    task: task.value,
    evidence,
  };
}

async function loadTaskAnchor(
  params: Pick<AutoresearchAkProjectorParams, "akPath" | "societyDb" | "runAk" | "signal">,
  taskId: number,
  cwd: string,
): Promise<BoundaryResult<AutoresearchAkTaskAnchor>> {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return {
      ok: false,
      error: `taskId must be a positive integer, received: ${taskId}`,
    };
  }

  const runAk = params.runAk || runAkCommandAsync;
  const result = await runAk({
    akPath: params.akPath,
    societyDb: params.societyDb,
    args: ["task", "show", String(taskId), "-F", "json"],
    cwd,
    signal: params.signal,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || `ak task show ${taskId} failed`,
    };
  }

  return parseTaskAnchor(result.stdout, taskId);
}

function parseTaskAnchor(
  stdout: string,
  expectedTaskId: number,
): BoundaryResult<AutoresearchAkTaskAnchor> {
  let parsed: RawTaskAnchor;
  try {
    parsed = JSON.parse(stdout) as RawTaskAnchor;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `failed to parse ak task show output: ${error.message}`
          : "failed to parse ak task show output",
    };
  }

  if (!Number.isInteger(parsed.id) || parsed.id !== expectedTaskId) {
    return {
      ok: false,
      error: `ak task show returned unexpected task id: ${String(parsed.id)}`,
    };
  }

  if (typeof parsed.repo !== "string" || parsed.repo.trim().length === 0) {
    return {
      ok: false,
      error: "ak task show did not include a repo path",
    };
  }

  return {
    ok: true,
    value: {
      id: parsed.id,
      repo: path.resolve(parsed.repo),
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      status: typeof parsed.status === "string" ? parsed.status : undefined,
      entityVersion:
        typeof parsed.entity_version === "number" && Number.isFinite(parsed.entity_version)
          ? parsed.entity_version
          : undefined,
    },
  };
}

async function readExistingProjectionByKey(
  params: Pick<AutoresearchAkProjectorParams, "societyDb" | "querySqliteJson" | "signal">,
  input: { taskId: number; checkType: string; projectionKey: string },
): Promise<BoundaryResult<ProjectionRow | null>> {
  const querySqliteJson = params.querySqliteJson || querySqliteJsonAsync;
  const rows = await querySqliteJson<ProjectionRow>(
    params.societyDb,
    [
      "SELECT id, json_extract(details, '$.projection_key') AS projection_key",
      "FROM evidence",
      `WHERE task_id = ${input.taskId}`,
      `AND check_type = '${escapeSqlLiteral(input.checkType)}'`,
      `AND json_extract(details, '$.projection_key') = '${escapeSqlLiteral(input.projectionKey)}'`,
      "ORDER BY id DESC",
      "LIMIT 1",
    ].join(" "),
    params.signal,
  );

  if (isBoundaryFailure(rows)) {
    return rows;
  }

  return {
    ok: true,
    value: rows.value[0] ?? null,
  };
}

function attachTaskAnchorToPayload(
  payload: AutoresearchAkMilestonePayload,
  task: AutoresearchAkTaskAnchor,
): AutoresearchAkMilestonePayload {
  return {
    ...payload,
    details: {
      ...payload.details,
      task_anchor: {
        id: task.id,
        repo: task.repo,
        ...(task.title ? { title: task.title } : {}),
        ...(task.status ? { status: task.status } : {}),
        ...(typeof task.entityVersion === "number" ? { entity_version: task.entityVersion } : {}),
      },
    },
  };
}

function resolveCampaignArtifactPath(
  cwd: string,
  current: string | undefined,
  fallback: string,
): string {
  if (!current || current.trim().length === 0) {
    return path.join(cwd, fallback);
  }

  return path.isAbsolute(current) ? current : path.resolve(cwd, current);
}

function isWithinRepo(cwd: string, repoRoot: string): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRepoRoot = path.resolve(repoRoot);
  return (
    resolvedCwd === resolvedRepoRoot || resolvedCwd.startsWith(`${resolvedRepoRoot}${path.sep}`)
  );
}
