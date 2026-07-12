// ---
// summary: "Verifies autoresearch self-hosting contracts and evaluator snapshots, then optionally records task-anchored promotion-posture evidence."
// read_when:
//   - "Changing self-hosting artifact verification, projection keys, promotion observation, or AK evidence supervision."
// ---

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AutoresearchSelfHostingContractV1,
  type AutoresearchSelfHostingEvaluatorLockV1,
  type AutoresearchSelfHostingPromotionRecordV1,
  type LoadedAutoresearchSelfHostingArtifacts,
  loadAutoresearchSelfHostingArtifacts,
  loadAutoresearchSelfHostingPromotionRecord,
  validateAutoresearchSelfHostingPromotionRecordPair,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
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

export type AutoresearchSelfHostingSupervisionAction = "observe" | "record_evidence";
export type AutoresearchSelfHostingPromotionPosture =
  | "missing"
  | AutoresearchSelfHostingPromotionRecordV1["status"];

export interface AutoresearchSelfHostingEvaluatorSnapshotObservation {
  snapshotRootPath: string;
  manifestPath: string;
  manifestHash: string;
  evaluatorFileCount: number;
  suiteCount: number;
  suiteIds: string[];
}

export interface AutoresearchSelfHostingObservation {
  cwd: string;
  observedAt: number;
  contractPath: string;
  lockPath: string;
  promotionRecordPath: string;
  campaignId: string;
  executionModel: AutoresearchSelfHostingContractV1["controller"]["executionModel"];
  candidate: AutoresearchSelfHostingContractV1["candidate"];
  controller: AutoresearchSelfHostingContractV1["controller"];
  evaluator: AutoresearchSelfHostingEvaluatorSnapshotObservation;
  contract: AutoresearchSelfHostingContractV1;
  evaluatorLock: AutoresearchSelfHostingEvaluatorLockV1;
  promotionRecord: AutoresearchSelfHostingPromotionRecordV1 | null;
  promotionPosture: AutoresearchSelfHostingPromotionPosture;
  projectionKey: string;
  evidenceReady: boolean;
  nextStep: string;
}

export interface AutoresearchSelfHostingEvidencePayload {
  taskId: number;
  checkType: string;
  result: "pass";
  details: Record<string, unknown>;
}

export interface AutoresearchSelfHostingEvidenceCandidate {
  kind: "projectable" | "noop" | "blocked";
  observation: AutoresearchSelfHostingObservation;
  payload: AutoresearchSelfHostingEvidencePayload | null;
  reason: string;
}

export interface AutoresearchSelfHostingTaskAnchor {
  id: number;
  repo: string;
  title?: string;
  status?: string;
  entityVersion?: number;
}

export interface AutoresearchSelfHostingEvidenceResult {
  ok: boolean;
  action: "recorded" | "already-projected" | "noop" | "blocked";
  observation: AutoresearchSelfHostingObservation;
  candidate: AutoresearchSelfHostingEvidenceCandidate;
  task?: AutoresearchSelfHostingTaskAnchor;
  existingEvidenceId?: number;
  evidence?: EvidenceWriteResult;
  nextStep: string;
  error?: string;
}

export interface AutoresearchSelfHostingSupervisionRequest {
  cwd: string;
  taskId?: number;
}

export interface AutoresearchSelfHostingSupervisionConfig {
  akPath?: string;
  societyDb?: string;
  now?: () => number;
  loadArtifacts?: (cwd: string) => LoadedAutoresearchSelfHostingArtifacts;
  loadPromotionRecord?: (
    cwd: string,
    promotionRecordPath?: string,
  ) => AutoresearchSelfHostingPromotionRecordV1;
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

export class AutoresearchSelfHostingSupervisor {
  private readonly config: AutoresearchSelfHostingSupervisionConfig;
  private readonly now: () => number;

  constructor(config: AutoresearchSelfHostingSupervisionConfig = {}) {
    this.config = config;
    this.now = config.now || (() => Date.now());
  }

  observe(input: AutoresearchSelfHostingSupervisionRequest): AutoresearchSelfHostingObservation {
    const cwd = path.resolve(input.cwd);
    const observedAt = this.now();
    const artifacts = (this.config.loadArtifacts || loadAutoresearchSelfHostingArtifacts)(cwd);
    const evaluator = verifyAutoresearchSelfHostingEvaluatorSnapshotForObservation(artifacts);
    const promotionRecordPath = path.resolve(cwd, artifacts.contract.promotion.promotionRecordPath);
    const promotionRecord = this.loadPromotionRecordIfPresent(cwd, artifacts);
    const promotionPosture = promotionRecord?.status ?? "missing";
    const projectionKey = buildAutoresearchSelfHostingProjectionKey({
      contract: artifacts.contract,
      evaluatorLock: artifacts.evaluatorLock,
      promotionRecord,
    });
    const evidenceReady = true;

    return {
      cwd,
      observedAt,
      contractPath: artifacts.contractPath,
      lockPath: artifacts.lockPath,
      promotionRecordPath,
      campaignId: artifacts.contract.campaignId,
      executionModel: artifacts.contract.controller.executionModel,
      candidate: artifacts.contract.candidate,
      controller: artifacts.contract.controller,
      evaluator,
      contract: artifacts.contract,
      evaluatorLock: artifacts.evaluatorLock,
      promotionRecord,
      promotionPosture,
      projectionKey,
      evidenceReady,
      nextStep: describeObservationNextStep({
        taskId: input.taskId,
        promotionPosture,
        projectionKey,
      }),
    };
  }

  async recordEvidence(
    input: AutoresearchSelfHostingSupervisionRequest & { signal?: AbortSignal },
  ): Promise<AutoresearchSelfHostingEvidenceResult> {
    const observation = this.observe(input);
    const candidate = deriveAutoresearchSelfHostingEvidenceCandidate({
      observation,
      taskId: input.taskId,
    });

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
      const error = `self-hosting cwd ${observation.cwd} is outside anchored task repo ${task.value.repo}`;
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

    if (latestProjection.value?.projection_key === observation.projectionKey) {
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
        details: candidate.payload.details,
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
      const error = evidence.akError || "failed to record self-hosting evidence";
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

  private loadPromotionRecordIfPresent(
    cwd: string,
    artifacts: LoadedAutoresearchSelfHostingArtifacts,
  ): AutoresearchSelfHostingPromotionRecordV1 | null {
    const promotionRecordPath = path.resolve(cwd, artifacts.contract.promotion.promotionRecordPath);
    if (!existsSync(promotionRecordPath)) {
      return null;
    }

    const record = (this.config.loadPromotionRecord || loadAutoresearchSelfHostingPromotionRecord)(
      cwd,
      artifacts.contract.promotion.promotionRecordPath,
    );
    validateAutoresearchSelfHostingPromotionRecordPair(
      artifacts.contract,
      artifacts.evaluatorLock,
      record,
    );
    return record;
  }

  private resolveAkPath(): string {
    return this.config.akPath || "ak";
  }

  private resolveSocietyDbPath(): string {
    return this.config.societyDb || DEFAULT_SOCIETY_DB;
  }
}

export function deriveAutoresearchSelfHostingEvidenceCandidate(input: {
  observation: AutoresearchSelfHostingObservation;
  taskId?: number;
}): AutoresearchSelfHostingEvidenceCandidate {
  if (input.taskId === undefined) {
    return {
      kind: "noop",
      observation: input.observation,
      payload: null,
      reason: "No exact taskId was supplied, so self-hosting supervision remains observation-only.",
    };
  }

  if (!Number.isInteger(input.taskId) || input.taskId <= 0) {
    return {
      kind: "blocked",
      observation: input.observation,
      payload: null,
      reason: `taskId must be a positive integer, received: ${input.taskId}`,
    };
  }

  if (!input.observation.evidenceReady) {
    return {
      kind: "blocked",
      observation: input.observation,
      payload: null,
      reason: "Self-hosting observation is not evidence-ready.",
    };
  }

  return {
    kind: "projectable",
    observation: input.observation,
    payload: {
      taskId: input.taskId,
      checkType: buildAutoresearchSelfHostingCheckType(input.observation),
      result: "pass",
      details: buildAutoresearchSelfHostingEvidenceDetails(input.observation),
    },
    reason: `Self-hosting campaign ${input.observation.campaignId} is observable with promotion posture ${input.observation.promotionPosture}.`,
  };
}

function buildAutoresearchSelfHostingCheckType(
  observation: AutoresearchSelfHostingObservation,
): string {
  return `autoresearch:self-hosting:${observation.promotionPosture}`;
}

function buildAutoresearchSelfHostingEvidenceDetails(
  observation: AutoresearchSelfHostingObservation,
): Record<string, unknown> {
  return {
    kind: "autoresearch.self_hosting_supervision.v1",
    projection_key: observation.projectionKey,
    campaign_id: observation.campaignId,
    cwd: observation.cwd,
    contract_path: observation.contractPath,
    evaluator_lock_path: observation.lockPath,
    promotion_record_path: observation.promotionRecordPath,
    promotion_status: observation.promotionPosture,
    approved_by: observation.promotionRecord?.approvedBy ?? [],
    approved_at: observation.promotionRecord?.approvedAt ?? null,
    promoted_candidate_ref: observation.promotionRecord?.promotedCandidateRef ?? null,
    rollback_controller_ref:
      observation.promotionRecord?.rollbackControllerRef ??
      observation.contract.promotion.rollbackControllerRef,
    rollback_reason: observation.promotionRecord?.rollbackReason ?? null,
    rolled_back_at: observation.promotionRecord?.rolledBackAt ?? null,
    controller_ref: observation.controller.ref,
    candidate_worktree: observation.candidate.worktreePath,
    candidate_branch: observation.candidate.branchName,
    candidate_base_ref: observation.candidate.baseRef,
    evaluator_manifest_hash: observation.evaluator.manifestHash,
    evaluator_suite_count: observation.evaluator.suiteCount,
    evaluator_suite_ids: observation.evaluator.suiteIds,
    execution_model: observation.executionModel,
    boundary: "evidence_only_observation_no_candidate_execution_no_promotion_authority",
  };
}

function buildAutoresearchSelfHostingProjectionKey(input: {
  contract: AutoresearchSelfHostingContractV1;
  evaluatorLock: AutoresearchSelfHostingEvaluatorLockV1;
  promotionRecord: AutoresearchSelfHostingPromotionRecordV1 | null;
}): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      campaignId: input.contract.campaignId,
      controllerRef: input.contract.controller.ref,
      candidate: input.contract.candidate,
      evaluatorManifestHash: input.evaluatorLock.manifestHash,
      suiteIds: input.evaluatorLock.suites.map((suite) => suite.id).sort(),
      promotionStatus: input.promotionRecord?.status ?? "missing",
      approvedBy: input.promotionRecord?.approvedBy ?? [],
      approvedAt: input.promotionRecord?.approvedAt ?? null,
      promotedCandidateRef: input.promotionRecord?.promotedCandidateRef ?? null,
      rollbackReason: input.promotionRecord?.rollbackReason ?? null,
      rolledBackAt: input.promotionRecord?.rolledBackAt ?? null,
    }),
  );
  return `autoresearch:self-hosting:${input.contract.campaignId}:${hash.digest("hex")}`;
}

function verifyAutoresearchSelfHostingEvaluatorSnapshotForObservation(
  artifacts: LoadedAutoresearchSelfHostingArtifacts,
): AutoresearchSelfHostingEvaluatorSnapshotObservation {
  const controllerCwd = artifacts.contract.controller.controllerCwd;
  const snapshotRootPath = resolveSnapshotRootPath(
    controllerCwd,
    artifacts.evaluatorLock.snapshotRootPath,
  );
  const manifestPath = assertPathWithinRoot(
    path.resolve(controllerCwd, artifacts.evaluatorLock.manifestPath),
    snapshotRootPath,
    `Locked evaluator manifest ${JSON.stringify(artifacts.evaluatorLock.manifestPath)}`,
  );
  const manifestHash = hashFileSha256(manifestPath);
  if (manifestHash !== artifacts.evaluatorLock.manifestHash) {
    throw new Error(
      `Locked evaluator manifest drift detected at ${JSON.stringify(manifestPath)}: expected sha256 ${artifacts.evaluatorLock.manifestHash}, got ${manifestHash}.`,
    );
  }

  for (const entry of artifacts.evaluatorLock.evaluatorFiles) {
    const absolutePath = assertPathWithinRoot(
      path.resolve(snapshotRootPath, entry.path),
      snapshotRootPath,
      `Locked evaluator file ${JSON.stringify(entry.path)}`,
    );
    const actualHash = hashFileSha256(absolutePath);
    if (actualHash !== entry.sha256) {
      throw new Error(
        `Locked evaluator file drift detected for ${JSON.stringify(entry.path)} at ${JSON.stringify(absolutePath)}: expected sha256 ${entry.sha256}, got ${actualHash}.`,
      );
    }
  }

  return {
    snapshotRootPath,
    manifestPath,
    manifestHash,
    evaluatorFileCount: artifacts.evaluatorLock.evaluatorFiles.length,
    suiteCount: artifacts.evaluatorLock.suites.length,
    suiteIds: artifacts.evaluatorLock.suites.map((suite) => suite.id).sort(),
  };
}

function resolveSnapshotRootPath(controllerCwd: string, snapshotRootPath: string): string {
  const resolvedPath = path.resolve(controllerCwd, snapshotRootPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Locked evaluator snapshot root ${JSON.stringify(resolvedPath)} does not exist.`,
    );
  }
  return realpathSync(resolvedPath);
}

function assertPathWithinRoot(filePath: string, rootPath: string, label: string): string {
  const resolvedRoot = realpathSync(rootPath);
  const resolvedPath = realpathSync(filePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} resolved outside locked evaluator snapshot root.`);
  }
  return resolvedPath;
}

function hashFileSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
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
): Promise<BoundaryResult<AutoresearchSelfHostingTaskAnchor>> {
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
): BoundaryResult<AutoresearchSelfHostingTaskAnchor> {
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

function describeObservationNextStep(input: {
  taskId?: number;
  promotionPosture: AutoresearchSelfHostingPromotionPosture;
  projectionKey: string;
}): string {
  if (input.taskId !== undefined) {
    return `Exact task ${input.taskId} is supplied. Re-run with action=record_evidence to attach bounded self-hosting evidence for promotion posture ${input.promotionPosture}.`;
  }

  return `Observation is complete for self-hosting promotion posture ${input.promotionPosture}. Provide an exact taskId and re-run with action=record_evidence if bounded AK evidence should be attached. Projection key: ${input.projectionKey}.`;
}

function describeEvidenceNextStep(input: {
  action: AutoresearchSelfHostingEvidenceResult["action"];
  candidate: AutoresearchSelfHostingEvidenceCandidate;
  evidence?: EvidenceWriteResult;
  existingEvidenceId?: number;
  error?: string;
}): string {
  switch (input.action) {
    case "recorded":
      return `Self-hosting evidence was recorded via ${input.evidence?.via || "ak"}. Re-run observe or record_evidence after the package-derived projection changes again.`;
    case "already-projected":
      return `No new AK evidence is needed until the self-hosting projection key changes again${input.existingEvidenceId ? ` (latest evidence id ${input.existingEvidenceId})` : ""}.`;
    case "noop":
      return "Observation stayed evidence-free. Supply an exact taskId if this self-hosting campaign should anchor bounded AK evidence.";
    case "blocked":
      return `Resolve the blocking issue, then re-run record_evidence. ${input.error || input.candidate.reason}`;
  }
}

function isWithinRepo(cwd: string, repoRoot: string): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRepoRoot = path.resolve(repoRoot);
  return (
    resolvedCwd === resolvedRepoRoot || resolvedCwd.startsWith(`${resolvedRepoRoot}${path.sep}`)
  );
}
