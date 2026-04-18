import * as os from "node:os";
import * as path from "node:path";
import {
  buildLlamacppCampaignAkBindingDetails,
  type InspectLlamacppCampaignControlResult,
  inspectLlamacppCampaignControl,
  type LlamacppCampaignAkBindingDetailsV1,
  type LlamacppCampaignAkBindingV1,
  type PersistLlamacppCampaignProjectionResult,
  persistDerivedLlamacppCampaignProjection,
} from "../../../pi-autoresearch/src/runtime.ts";
import { type RunAkCommandResult, runAkCommandAsync } from "./ak.ts";
import {
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  querySqliteJsonAsync,
} from "./boundaries.ts";
import { type EvidenceWriteResult, recordEvidence } from "./evidence.ts";

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");

export type AutoresearchManifestCampaignSupervisionAction = "observe" | "record_evidence";

export interface AutoresearchManifestCampaignObservation {
  cwd: string;
  manifestPath: string;
  taskId: number | null;
  observedAt: number;
  controlResult: InspectLlamacppCampaignControlResult;
  projectionPath: string;
  nextStep: string;
}

export interface AutoresearchManifestCampaignEvidencePayload {
  taskId: number;
  checkType: string;
  result: "pass";
  details: LlamacppCampaignAkBindingDetailsV1;
  binding: LlamacppCampaignAkBindingV1;
}

export interface AutoresearchManifestCampaignEvidenceCandidate {
  kind: "projectable" | "noop" | "blocked";
  observation: AutoresearchManifestCampaignObservation;
  payload: AutoresearchManifestCampaignEvidencePayload | null;
  reason: string;
}

export interface AutoresearchManifestCampaignTaskAnchor {
  id: number;
  repo: string;
  title?: string;
  status?: string;
  entityVersion?: number;
}

export interface AutoresearchManifestCampaignEvidenceResult {
  ok: boolean;
  action: "recorded" | "already-projected" | "noop" | "blocked";
  observation: AutoresearchManifestCampaignObservation;
  candidate: AutoresearchManifestCampaignEvidenceCandidate;
  task?: AutoresearchManifestCampaignTaskAnchor;
  existingEvidenceId?: number;
  evidence?: EvidenceWriteResult;
  nextStep: string;
  error?: string;
}

export interface AutoresearchManifestCampaignSupervisionRequest {
  cwd: string;
  manifestPath: string;
  taskId?: number;
}

export interface AutoresearchManifestCampaignSupervisionConfig {
  akPath?: string;
  societyDb?: string;
  now?: () => number;
  inspectControl?: (input: {
    cwd: string;
    manifestPath: string;
    taskId?: number;
    updatedAt?: number;
  }) => InspectLlamacppCampaignControlResult;
  persistProjection?: (input: {
    cwd: string;
    projection: InspectLlamacppCampaignControlResult["projection"];
  }) => PersistLlamacppCampaignProjectionResult;
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

interface LatestProjectionRow {
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

export class AutoresearchManifestCampaignSupervisor {
  private readonly config: AutoresearchManifestCampaignSupervisionConfig;
  private readonly now: () => number;

  constructor(config: AutoresearchManifestCampaignSupervisionConfig = {}) {
    this.config = config;
    this.now = config.now || (() => Date.now());
  }

  observe(
    input: AutoresearchManifestCampaignSupervisionRequest,
  ): AutoresearchManifestCampaignObservation {
    const cwd = path.resolve(input.cwd);
    const observedAt = this.now();
    const controlResult = withAkDbEnv(this.resolveSocietyDbPath(), () =>
      (this.config.inspectControl || inspectLlamacppCampaignControl)({
        cwd,
        manifestPath: input.manifestPath,
        taskId: input.taskId,
        updatedAt: observedAt,
      }),
    );
    const projection = (this.config.persistProjection || persistDerivedLlamacppCampaignProjection)({
      cwd,
      projection: controlResult.projection,
    });
    const persistedControlResult = {
      ...controlResult,
      projectionPath: projection.path,
      projection: projection.projection,
    } satisfies InspectLlamacppCampaignControlResult;

    return {
      cwd,
      manifestPath: persistedControlResult.control.autonomy.manifest.path,
      taskId: input.taskId ?? null,
      observedAt,
      controlResult: persistedControlResult,
      projectionPath: projection.path,
      nextStep: describeObservationNextStep(persistedControlResult),
    };
  }

  async recordEvidence(
    input: AutoresearchManifestCampaignSupervisionRequest & { signal?: AbortSignal },
  ): Promise<AutoresearchManifestCampaignEvidenceResult> {
    const observation = this.observe(input);
    const candidate = deriveAutoresearchManifestCampaignEvidenceCandidate({ observation });

    if (candidate.kind === "blocked") {
      return {
        ok: false,
        action: "blocked",
        observation,
        candidate,
        nextStep: describeEvidenceNextStep({ action: "blocked", candidate }),
        error: candidate.reason,
      };
    }

    if (candidate.kind === "noop" || !candidate.payload) {
      return {
        ok: true,
        action: "noop",
        observation,
        candidate,
        nextStep: describeEvidenceNextStep({ action: "noop", candidate }),
      };
    }

    const task = await loadTaskAnchor(
      {
        akPath: this.resolveAkPath(),
        societyDb: this.resolveSocietyDbPath(),
        runAk: this.config.runAk,
        signal: input.signal,
      },
      candidate.payload.taskId,
      observation.cwd,
    );
    if (isBoundaryFailure(task)) {
      return {
        ok: false,
        action: "blocked",
        observation,
        candidate,
        nextStep: describeEvidenceNextStep({ action: "blocked", candidate, error: task.error }),
        error: task.error,
      };
    }

    if (!isWithinRepo(observation.cwd, task.value.repo)) {
      const error = `campaign cwd ${observation.cwd} is outside anchored task repo ${task.value.repo}`;
      return {
        ok: false,
        action: "blocked",
        observation,
        candidate,
        task: task.value,
        nextStep: describeEvidenceNextStep({ action: "blocked", candidate, error }),
        error,
      };
    }

    const latestProjection = await readLatestProjection(
      {
        societyDb: this.resolveSocietyDbPath(),
        querySqliteJson: this.config.querySqliteJson,
        signal: input.signal,
      },
      {
        taskId: candidate.payload.taskId,
        checkType: candidate.payload.checkType,
      },
    );
    if (isBoundaryFailure(latestProjection)) {
      return {
        ok: false,
        action: "blocked",
        observation,
        candidate,
        task: task.value,
        nextStep: describeEvidenceNextStep({
          action: "blocked",
          candidate,
          error: latestProjection.error,
        }),
        error: latestProjection.error,
      };
    }

    if (latestProjection.value?.projection_key === candidate.payload.details.projection_key) {
      return {
        ok: true,
        action: "already-projected",
        observation,
        candidate,
        task: task.value,
        existingEvidenceId: latestProjection.value.id,
        nextStep: describeEvidenceNextStep({
          action: "already-projected",
          candidate,
          existingEvidenceId: latestProjection.value.id,
        }),
      };
    }

    const evidence = await recordEvidence(
      {
        task_id: candidate.payload.taskId,
        check_type: candidate.payload.checkType,
        result: candidate.payload.result,
        details: candidate.payload.details as unknown as Record<string, unknown>,
      },
      input.signal,
      {
        akPath: this.resolveAkPath(),
        societyDb: this.resolveSocietyDbPath(),
        cwd: observation.cwd,
        runAk: this.config.runAk,
        runRepoBootstrap: this.config.runRepoBootstrap,
        runSql: this.config.runSql,
        querySqliteJson: this.config.querySqliteJson,
      },
    );

    if (!evidence.ok) {
      const error =
        evidence.akError || evidence.sqlError || "failed to record manifest campaign evidence";
      return {
        ok: false,
        action: "blocked",
        observation,
        candidate,
        task: task.value,
        evidence,
        nextStep: describeEvidenceNextStep({ action: "blocked", candidate, error }),
        error,
      };
    }

    return {
      ok: true,
      action: "recorded",
      observation,
      candidate,
      task: task.value,
      evidence,
      nextStep: describeEvidenceNextStep({ action: "recorded", candidate, evidence }),
    };
  }

  private resolveAkPath(): string {
    return this.config.akPath || "ak";
  }

  private resolveSocietyDbPath(): string {
    return this.config.societyDb || DEFAULT_SOCIETY_DB;
  }
}

export function deriveAutoresearchManifestCampaignEvidenceCandidate(input: {
  observation: AutoresearchManifestCampaignObservation;
}): AutoresearchManifestCampaignEvidenceCandidate {
  const control = input.observation.controlResult.control;
  const taskContext = control.taskContext;

  if (taskContext.suppliedTaskId === null) {
    return {
      kind: "noop",
      observation: input.observation,
      payload: null,
      reason:
        "No exact taskId was supplied, so manifest campaign supervision remains observation-only.",
    };
  }

  if (taskContext.verificationState !== "verified_live" || taskContext.verifiedTaskId === null) {
    return {
      kind: "blocked",
      observation: input.observation,
      payload: null,
      reason: `AK evidence requires verified_live task context; ${taskContext.reason}`,
    };
  }

  if (!control.akBinding) {
    return {
      kind: "blocked",
      observation: input.observation,
      payload: null,
      reason:
        "Verified live task context did not yield a package-derived AK binding for the manifest campaign.",
    };
  }

  return {
    kind: "projectable",
    observation: input.observation,
    payload: {
      taskId: taskContext.verifiedTaskId,
      checkType: control.akBinding.ak.checkType,
      result: control.akBinding.ak.result,
      details: buildLlamacppCampaignAkBindingDetails(control.akBinding),
      binding: control.akBinding,
    },
    reason: control.akBinding.ak.summary,
  };
}

async function loadTaskAnchor(
  params: {
    akPath: string;
    societyDb: string;
    runAk?: (params: {
      akPath: string;
      societyDb: string;
      args: string[];
      cwd?: string;
      signal?: AbortSignal;
    }) => Promise<RunAkCommandResult>;
    signal?: AbortSignal;
  },
  taskId: number,
  cwd: string,
): Promise<BoundaryResult<AutoresearchManifestCampaignTaskAnchor>> {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return {
      ok: false,
      error: `taskId must be a positive integer, received: ${taskId}`,
    };
  }

  const result = await (params.runAk || runAkCommandAsync)({
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
): BoundaryResult<AutoresearchManifestCampaignTaskAnchor> {
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

async function readLatestProjection(
  params: {
    societyDb: string;
    querySqliteJson?: <T>(
      dbPath: string,
      sql: string,
      signal?: AbortSignal,
    ) => Promise<BoundaryResult<T[]>>;
    signal?: AbortSignal;
  },
  input: { taskId: number; checkType: string },
): Promise<BoundaryResult<LatestProjectionRow | null>> {
  const rows = await (params.querySqliteJson || querySqliteJsonAsync)<LatestProjectionRow>(
    params.societyDb,
    [
      "SELECT id, json_extract(details, '$.projection_key') AS projection_key",
      "FROM evidence",
      `WHERE task_id = ${input.taskId} AND check_type = '${escapeSqlLiteral(input.checkType)}'`,
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

function describeObservationNextStep(result: InspectLlamacppCampaignControlResult): string {
  const { taskContext, akBinding } = result.control;

  if (taskContext.verificationState === "verified_live" && akBinding) {
    return `Exact task ${taskContext.verifiedTaskId} is verified. Re-run with action=record_evidence to attach bounded AK evidence for ${akBinding.ak.milestone}.`;
  }

  if (taskContext.suppliedTaskId !== null) {
    return `Resolve task verification first, then re-run with action=record_evidence. ${taskContext.reason}`;
  }

  return "Observation is complete. Provide an exact taskId and re-run with action=record_evidence if bounded AK evidence should be attached.";
}

function describeEvidenceNextStep(input: {
  action: AutoresearchManifestCampaignEvidenceResult["action"];
  candidate: AutoresearchManifestCampaignEvidenceCandidate;
  evidence?: EvidenceWriteResult;
  existingEvidenceId?: number;
  error?: string;
}): string {
  switch (input.action) {
    case "recorded":
      return `Manifest campaign evidence was recorded via ${input.evidence?.via || "ak"}. Re-run observe or record_evidence after the package-derived projection changes again.`;
    case "already-projected":
      return `No new AK evidence is needed until the manifest campaign projection key changes again${input.existingEvidenceId ? ` (latest evidence id ${input.existingEvidenceId})` : ""}.`;
    case "noop":
      return "Observation stayed evidence-free. Supply an exact taskId if this manifest campaign should anchor bounded AK evidence.";
    case "blocked":
      return `Resolve the blocking issue, then re-run record_evidence. ${input.error || input.candidate.reason}`;
  }
}

function withAkDbEnv<T>(societyDb: string, run: () => T): T {
  const previousAkDb = process.env.AK_DB;
  if (societyDb) {
    process.env.AK_DB = societyDb;
  }

  try {
    return run();
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
  }
}

function isWithinRepo(cwd: string, repoRoot: string): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRepoRoot = path.resolve(repoRoot);
  return (
    resolvedCwd === resolvedRepoRoot || resolvedCwd.startsWith(`${resolvedRepoRoot}${path.sep}`)
  );
}
