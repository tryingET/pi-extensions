// ---
// summary: "Persists secure loop-run checkpoints and validates locks, retention, effects, artifacts, and resume lineage."
// read_when:
//   - "Changing loop checkpoint storage, pruning, effect receipts, artifact hashing, or fail-closed resume validation."
// ---

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LOOP_RUN_SCHEMA = "society_orchestrator.loop_run.v2";
const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;
export const LOOP_CHECKPOINT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PRUNE_LIMIT = 100;
const DEFAULT_PRUNE_SCAN_LIMIT = 1_000;

export type LoopRunStatus = "running" | "retryable" | "failed" | "aborted" | "done";
export type LoopAttemptStatus = "done" | "error" | "timed_out" | "aborted";
export type LoopAttemptEffectDisposition =
  | "settled"
  | "confirmed_no_effects"
  | "effect_indeterminate";

export interface OwnerEffectReceipt {
  schema: "asc.dispatch_effect_receipt.v1";
  dispatchId: string;
  attemptId: string;
  sessionName: string;
  consumerCorrelationId: string;
  disposition: LoopAttemptEffectDisposition;
  recordedAt: string;
  receiptPath: string;
}

export interface LoopPhaseAttemptCheckpoint {
  attemptId: string;
  phase: string;
  agent: string;
  cognitiveTool: string;
  status: LoopAttemptStatus;
  effectDisposition: LoopAttemptEffectDisposition;
  ownerEffectReceipt?: OwnerEffectReceipt;
  output: string;
  outputBytes: number;
  outputSha256: string;
  outputTruncated: boolean;
  claimLineCount?: number;
  learningClaimSha256?: string;
  stderr?: string;
  exitCode: number;
  failureKind?: string;
  elapsed: number;
  artifactPaths: string[];
  timestamp: string;
}

export interface LoopTerminalPublicationArtifact {
  type: "kes_diary" | "kes_learning_candidate";
  path: string;
  hash: string;
}

export interface LoopTerminalPublication {
  state: "prepared" | "published";
  preparedId: string;
  outcome: "done" | "failed" | "aborted";
  elapsed: number;
  resumed: boolean;
  preparedAt: string;
  artifacts: LoopTerminalPublicationArtifact[];
}

export interface LoopRunCheckpoint {
  schema: typeof LOOP_RUN_SCHEMA;
  runId: string;
  plugin: string;
  pluginSemanticsHash: string;
  phases: string[];
  objective: string;
  cwd: string;
  status: LoopRunStatus;
  effectReceiptContract?: "asc.dispatch_effect_receipt.v1";
  attempts: LoopPhaseAttemptCheckpoint[];
  artifactHashes: Record<string, string>;
  terminalPublication?: LoopTerminalPublication;
  stateFingerprint: string;
  resumeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoopRunLock {
  release(): void;
}

export interface LoopCheckpointPruneResult {
  retentionMs: number;
  cutoff: string;
  dryRun: boolean;
  entriesExamined: number;
  scanned: number;
  candidates: string[];
  deleted: string[];
  skippedActive: string[];
  skippedLocked: string[];
  skippedInvalid: string[];
  limitReached: boolean;
  scanLimitReached: boolean;
}

export class LoopResumeError extends Error {
  readonly failureKind: string;

  constructor(failureKind: string, message: string) {
    super(message);
    this.name = "LoopResumeError";
    this.failureKind = failureKind;
  }
}

export class LoopRunCheckpointStore {
  readonly rootDir: string;

  constructor(
    rootDir: string = process.env.PI_ORCH_LOOP_RUNS_DIR?.trim() ||
      path.join(os.homedir(), ".pi", "agent", "state", "pi-society-orchestrator", "loop-runs"),
  ) {
    this.rootDir = rootDir;
  }

  create(input: {
    runId: string;
    plugin: string;
    pluginSemanticsHash: string;
    phases: string[];
    objective: string;
    cwd: string;
    artifactHashes: Record<string, string>;
    stateFingerprint: string;
  }): LoopRunCheckpoint {
    assertSafeRunId(input.runId);
    const now = new Date().toISOString();
    const checkpoint: LoopRunCheckpoint = {
      schema: LOOP_RUN_SCHEMA,
      runId: input.runId,
      plugin: input.plugin,
      pluginSemanticsHash: input.pluginSemanticsHash,
      phases: [...input.phases],
      objective: input.objective,
      cwd: fs.realpathSync(input.cwd),
      status: "running",
      effectReceiptContract: "asc.dispatch_effect_receipt.v1",
      attempts: [],
      artifactHashes: { ...input.artifactHashes },
      stateFingerprint: input.stateFingerprint,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.write(checkpoint, true);
    return checkpoint;
  }

  load(runId: string): LoopRunCheckpoint {
    assertSafeRunId(runId);
    const checkpointPath = this.pathFor(runId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readSecureRegularFile(checkpointPath));
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new LoopResumeError(
          "loop_resume_checkpoint_missing",
          `No owned loop checkpoint exists for resume_run_id=${runId}. Legacy uncheckpointed runs cannot be resumed safely.`,
        );
      }
      if (error instanceof LoopResumeError) throw error;
      throw new LoopResumeError(
        "loop_resume_checkpoint_invalid",
        `Failed to read loop checkpoint ${runId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return validateCheckpoint(parsed, runId);
  }

  save(checkpoint: LoopRunCheckpoint): void {
    validateCheckpoint(checkpoint, checkpoint.runId);
    checkpoint.updatedAt = new Date().toISOString();
    this.write(checkpoint, false);
  }

  acquire(runId: string): LoopRunLock {
    assertSafeRunId(runId);
    ensureStateRoot(this.rootDir);
    const lockDir = `${this.pathFor(runId)}.lock`;
    const token = randomUUID();

    try {
      fs.mkdirSync(lockDir, { mode: 0o700 });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const owner = readLockOwner(lockDir);
      const live = owner ? isProcessLive(owner.pid) : true;
      throw new LoopResumeError(
        live ? "loop_resume_already_running" : "loop_resume_stale_lock",
        live
          ? `Loop run ${runId} already has a live execution owner.`
          : `Loop run ${runId} has a stale execution lock. Quarantine it explicitly after confirming the prior owner is gone; automatic reclamation is intentionally disabled.`,
      );
    }

    try {
      writeDurableFile(
        path.join(lockDir, "owner.json"),
        `${JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() })}\n`,
        true,
      );
    } catch (error) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      throw error;
    }

    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        const owner = readLockOwner(lockDir);
        if (!owner || owner.token !== token || owner.pid !== process.pid) {
          throw new LoopResumeError(
            "loop_resume_lock_ownership_lost",
            `Loop run ${runId} lock ownership changed before release; the lock was preserved fail-closed.`,
          );
        }
        fs.rmSync(lockDir, { recursive: true, force: false });
        fsyncDirectory(path.dirname(lockDir));
      },
    };
  }

  pruneExpired(
    options: {
      nowMs?: number;
      retentionMs?: number;
      dryRun?: boolean;
      maxDeletes?: number;
      maxScans?: number;
      excludeRunIds?: string[];
    } = {},
  ): LoopCheckpointPruneResult {
    const nowMs = options.nowMs ?? Date.now();
    const retentionMs = options.retentionMs ?? LOOP_CHECKPOINT_RETENTION_MS;
    const dryRun = options.dryRun ?? false;
    const maxDeletes = options.maxDeletes ?? DEFAULT_PRUNE_LIMIT;
    const maxScans = options.maxScans ?? DEFAULT_PRUNE_SCAN_LIMIT;
    if (!Number.isFinite(nowMs) || !Number.isFinite(retentionMs) || retentionMs <= 0) {
      throw new LoopResumeError(
        "loop_checkpoint_retention_invalid",
        "Loop checkpoint retention requires finite now and positive retention values.",
      );
    }
    if (!Number.isSafeInteger(maxDeletes) || maxDeletes <= 0 || maxDeletes > 1_000) {
      throw new LoopResumeError(
        "loop_checkpoint_prune_limit_invalid",
        "Loop checkpoint pruning requires maxDeletes between 1 and 1000.",
      );
    }
    if (!Number.isSafeInteger(maxScans) || maxScans <= 0 || maxScans > 10_000) {
      throw new LoopResumeError(
        "loop_checkpoint_scan_limit_invalid",
        "Loop checkpoint pruning requires maxScans between 1 and 10000.",
      );
    }

    const cutoffMs = nowMs - retentionMs;
    const result: LoopCheckpointPruneResult = {
      retentionMs,
      cutoff: new Date(cutoffMs).toISOString(),
      dryRun,
      entriesExamined: 0,
      scanned: 0,
      candidates: [],
      deleted: [],
      skippedActive: [],
      skippedLocked: [],
      skippedInvalid: [],
      limitReached: false,
      scanLimitReached: false,
    };
    if (!fs.existsSync(this.rootDir)) return result;
    ensureStateRoot(this.rootDir);
    const excluded = new Set(options.excludeRunIds || []);
    const runIds: string[] = [];
    const directory = fs.opendirSync(this.rootDir);
    try {
      while (result.entriesExamined < maxScans) {
        const entry = directory.readSync();
        if (!entry) break;
        result.entriesExamined += 1;
        if (!entry.name.endsWith(".run.json")) continue;
        const runId = entry.name.slice(0, -".run.json".length);
        if (excluded.has(runId)) continue;
        runIds.push(runId);
      }
      result.scanLimitReached = result.entriesExamined >= maxScans;
    } finally {
      directory.closeSync();
    }

    for (const runId of runIds) {
      result.scanned += 1;
      let checkpoint: LoopRunCheckpoint;
      try {
        checkpoint = this.load(runId);
      } catch {
        result.skippedInvalid.push(runId);
        continue;
      }
      if (checkpoint.status === "running") {
        result.skippedActive.push(runId);
        continue;
      }
      if (checkpointUpdatedAtMs(checkpoint) > cutoffMs) continue;
      if (dryRun && fs.existsSync(`${this.pathFor(runId)}.lock`)) {
        result.skippedLocked.push(runId);
        continue;
      }
      result.candidates.push(runId);
      if (dryRun) continue;
      if (result.deleted.length >= maxDeletes) {
        result.limitReached = true;
        break;
      }

      let lock: LoopRunLock | undefined;
      try {
        lock = this.acquire(runId);
        const current = this.load(runId);
        if (current.status === "running" || checkpointUpdatedAtMs(current) > cutoffMs) {
          result.skippedActive.push(runId);
          continue;
        }
        const checkpointPath = this.pathFor(runId);
        assertSecureCheckpointFile(checkpointPath);
        fs.unlinkSync(checkpointPath);
        fsyncDirectory(this.rootDir);
        result.deleted.push(runId);
      } catch (error) {
        if (
          error instanceof LoopResumeError &&
          ["loop_resume_already_running", "loop_resume_stale_lock"].includes(error.failureKind)
        ) {
          result.skippedLocked.push(runId);
        } else if (errorCode(error) === "ENOENT") {
          // Another owner completed the same cleanup after the initial scan.
        } else {
          result.skippedInvalid.push(runId);
        }
      } finally {
        lock?.release();
      }
    }

    result.candidates.sort();
    result.deleted.sort();
    result.skippedActive.sort();
    result.skippedLocked.sort();
    result.skippedInvalid.sort();
    return result;
  }

  private pathFor(runId: string): string {
    return path.join(this.rootDir, `${runId}.run.json`);
  }

  private write(checkpoint: LoopRunCheckpoint, exclusive: boolean): void {
    ensureStateRoot(this.rootDir);
    const targetPath = this.pathFor(checkpoint.runId);
    if (!exclusive) assertSecureCheckpointFile(targetPath);
    const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      writeDurableFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, true);
      if (exclusive) {
        try {
          fs.linkSync(temporaryPath, targetPath);
        } catch (error) {
          if (errorCode(error) === "EEXIST") {
            throw new LoopResumeError(
              "loop_run_id_collision",
              `Loop checkpoint already exists for ${checkpoint.runId}.`,
            );
          }
          throw error;
        }
        fs.unlinkSync(temporaryPath);
      } else {
        fs.renameSync(temporaryPath, targetPath);
      }
      fsyncDirectory(this.rootDir);
    } finally {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {
        // Publication or prior cleanup already removed the private temporary file.
      }
    }
  }
}

export function deriveResumePhase(checkpoint: LoopRunCheckpoint): string {
  if (checkpoint.status === "done") {
    throw new LoopResumeError(
      "loop_resume_already_complete",
      `Loop run ${checkpoint.runId} is already complete.`,
    );
  }

  for (let phaseIndex = 0; phaseIndex < checkpoint.phases.length; phaseIndex += 1) {
    const phase = checkpoint.phases[phaseIndex];
    const attempts = checkpoint.attempts.filter((attempt) => attempt.phase === phase);
    const latest = attempts.at(-1);
    if (latest?.status === "done" && latest.effectDisposition === "settled") continue;

    const laterAttempts = checkpoint.attempts.filter(
      (attempt) => checkpoint.phases.indexOf(attempt.phase) > phaseIndex,
    );
    if (laterAttempts.length > 0) {
      throw new LoopResumeError(
        "loop_resume_non_linear_history",
        `Loop run ${checkpoint.runId} has attempts after unresolved phase ${phase}; restart or reconcile the run instead of resuming mechanically.`,
      );
    }
    if (!latest) return phase;
    if (latest.effectDisposition === "confirmed_no_effects") {
      if (attempts.length < 2) return phase;
      throw new LoopResumeError(
        "loop_resume_retry_limit_reached",
        `Loop run ${checkpoint.runId} exhausted its one same-lineage retry for ${phase}.`,
      );
    }
    if (latest.effectDisposition === "settled") {
      throw new LoopResumeError(
        "loop_resume_effect_settled",
        `Loop run ${checkpoint.runId} cannot retry ${phase}: attempt ${latest.attemptId} has owner-settled effects. Reorient or restart instead of duplicating the phase.`,
      );
    }
    throw new LoopResumeError(
      "loop_resume_effect_indeterminate",
      `Loop run ${checkpoint.runId} cannot retry ${phase}: attempt ${latest.attemptId} may have emitted effects. Reconcile those effects through their owning surfaces or restart instead of retrying mechanically.`,
    );
  }

  throw new LoopResumeError(
    "loop_resume_no_pending_phase",
    `Loop run ${checkpoint.runId} has no failed or pending phase to resume.`,
  );
}

export function validateTerminalPublicationResume(input: {
  checkpoint: LoopRunCheckpoint;
  plugin: string;
  pluginSemanticsHash: string;
  phases: string[];
  objective: string;
  cwd: string;
  currentStateFingerprint: string;
  artifactRoot: string;
  nowMs?: number;
  retentionMs?: number;
}): LoopTerminalPublication {
  const { checkpoint } = input;
  const publication = checkpoint.terminalPublication;
  if (!publication) {
    throw new LoopResumeError(
      "loop_terminal_publication_missing",
      `Loop run ${checkpoint.runId} has no terminal publication to reconcile.`,
    );
  }
  if (
    checkpoint.plugin !== input.plugin ||
    checkpoint.pluginSemanticsHash !== input.pluginSemanticsHash ||
    JSON.stringify(checkpoint.phases) !== JSON.stringify(input.phases) ||
    checkpoint.objective !== input.objective ||
    checkpoint.cwd !== fs.realpathSync(input.cwd)
  ) {
    throw new LoopResumeError(
      "loop_terminal_publication_identity_mismatch",
      `Prepared terminal publication ${checkpoint.runId} no longer matches its loop identity.`,
    );
  }
  assertCheckpointWithinRetention(
    checkpoint,
    input.nowMs ?? Date.now(),
    input.retentionMs ?? LOOP_CHECKPOINT_RETENTION_MS,
  );
  const terminalPaths = new Set(publication.artifacts.map((artifact) => artifact.path));
  validateLoopArtifactHashes(
    input.artifactRoot,
    Object.fromEntries(
      Object.entries(checkpoint.artifactHashes).filter(
        ([artifactPath]) => !terminalPaths.has(artifactPath),
      ),
    ),
  );
  if (
    checkpoint.stateFingerprint.startsWith("unverifiable:") ||
    input.currentStateFingerprint.startsWith("unverifiable:") ||
    checkpoint.stateFingerprint !== input.currentStateFingerprint
  ) {
    throw new LoopResumeError(
      "loop_resume_state_drift",
      `Repository state changed after terminal publication was prepared for ${checkpoint.runId}.`,
    );
  }
  return publication;
}

export interface LoopTerminalSynthesis {
  outcome: "done" | "failed" | "aborted";
  elapsed: number;
  resumed: boolean;
  preparedAt: string;
}

export function validateTerminalSynthesisResume(
  input: Parameters<typeof validateResumeCheckpoint>[0],
): LoopTerminalSynthesis {
  try {
    validateResumeCheckpoint(input);
    throw new LoopResumeError(
      "loop_terminal_synthesis_not_terminal",
      `Loop run ${input.checkpoint.runId} still has a lawfully retryable or undispatched phase.`,
    );
  } catch (error) {
    if (
      !(error instanceof LoopResumeError) ||
      ![
        "loop_resume_no_pending_phase",
        "loop_resume_effect_settled",
        "loop_resume_retry_limit_reached",
      ].includes(error.failureKind)
    ) {
      throw error;
    }
  }

  const attempts = input.checkpoint.attempts;
  const latest = attempts.at(-1);
  if (!latest || latest.failureKind === "loop_attempt_in_progress") {
    throw new LoopResumeError(
      "loop_terminal_synthesis_incomplete",
      `Loop run ${input.checkpoint.runId} has no complete final attempt from which to synthesize terminal intent.`,
    );
  }
  const finalPhaseAttempts = attempts.filter((attempt) => attempt.phase === latest.phase);
  if (latest.effectDisposition === "confirmed_no_effects" && finalPhaseAttempts.length < 2) {
    throw new LoopResumeError(
      "loop_terminal_synthesis_retryable",
      `Loop run ${input.checkpoint.runId} remains retryable after confirmed no effects.`,
    );
  }
  const finalAttempts = input.checkpoint.phases.map((phase) =>
    attempts.filter((attempt) => attempt.phase === phase).at(-1),
  );
  const success = finalAttempts.every(
    (attempt) => attempt?.status === "done" && attempt.effectDisposition === "settled",
  );
  const outcome = success ? "done" : latest.status === "aborted" ? "aborted" : "failed";
  return {
    outcome,
    elapsed: attempts.reduce((total, attempt) => total + attempt.elapsed, 0),
    resumed: input.checkpoint.resumeCount > 0,
    preparedAt: latest.timestamp,
  };
}

export function validateResumeCheckpoint(input: {
  checkpoint: LoopRunCheckpoint;
  plugin: string;
  pluginSemanticsHash: string;
  phases: string[];
  objective: string;
  cwd: string;
  expectedFailedPhase: string;
  currentStateFingerprint: string;
  artifactRoot: string;
  nowMs?: number;
  retentionMs?: number;
}): string {
  const { checkpoint } = input;
  if (checkpoint.effectReceiptContract !== "asc.dispatch_effect_receipt.v1") {
    throw new LoopResumeError(
      "loop_resume_receipt_contract_missing",
      `Loop run ${checkpoint.runId} predates owner-issued effect receipts and cannot be resumed safely.`,
    );
  }
  if (checkpoint.plugin !== input.plugin) {
    throw new LoopResumeError(
      "loop_resume_plugin_mismatch",
      `Loop run ${checkpoint.runId} belongs to ${checkpoint.plugin}, not ${input.plugin}.`,
    );
  }
  if (checkpoint.pluginSemanticsHash !== input.pluginSemanticsHash) {
    throw new LoopResumeError(
      "loop_resume_plugin_semantic_drift",
      `The ${input.plugin} producer semantics changed since ${checkpoint.runId}; restart instead of resuming under different attribution semantics.`,
    );
  }
  if (JSON.stringify(checkpoint.phases) !== JSON.stringify(input.phases)) {
    throw new LoopResumeError(
      "loop_resume_phase_graph_drift",
      `The ${input.plugin} phase graph changed since ${checkpoint.runId}; restart from diagnose.`,
    );
  }
  if (checkpoint.objective !== input.objective) {
    throw new LoopResumeError(
      "loop_resume_objective_mismatch",
      `The resume objective does not exactly match loop run ${checkpoint.runId}.`,
    );
  }
  const currentCwd = fs.realpathSync(input.cwd);
  if (checkpoint.cwd !== currentCwd) {
    throw new LoopResumeError(
      "loop_resume_repository_mismatch",
      `Loop run ${checkpoint.runId} belongs to ${checkpoint.cwd}, not ${currentCwd}.`,
    );
  }
  assertCheckpointWithinRetention(
    checkpoint,
    input.nowMs ?? Date.now(),
    input.retentionMs ?? LOOP_CHECKPOINT_RETENTION_MS,
  );
  if (
    checkpoint.stateFingerprint.startsWith("unverifiable:") ||
    input.currentStateFingerprint.startsWith("unverifiable:")
  ) {
    throw new LoopResumeError(
      "loop_resume_state_unverifiable",
      `Loop run ${checkpoint.runId} was not executed from a fingerprintable Git state.`,
    );
  }
  validateLoopArtifactHashes(input.artifactRoot, checkpoint.artifactHashes);
  if (checkpoint.stateFingerprint !== input.currentStateFingerprint) {
    throw new LoopResumeError(
      "loop_resume_state_drift",
      `Repository state changed after loop run ${checkpoint.runId}; restart or perform an explicit reorientation instead of retrying a stale phase.`,
    );
  }

  const phase = deriveResumePhase(checkpoint);
  if (phase !== input.expectedFailedPhase) {
    throw new LoopResumeError(
      "loop_resume_phase_mismatch",
      `Loop run ${checkpoint.runId} must resume at ${phase}, not ${input.expectedFailedPhase}.`,
    );
  }
  return phase;
}

export function captureLoopArtifactHashes(
  artifactRoot: string,
  artifactPaths: string[],
): Record<string, string> {
  const root = fs.realpathSync(artifactRoot);
  const hashes: Record<string, string> = {};
  for (const artifactPath of [...new Set(artifactPaths)].sort()) {
    const absolutePath = path.resolve(root, artifactPath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new LoopResumeError(
        "loop_resume_artifact_invalid",
        `Loop artifact escapes the package KES root: ${artifactPath}.`,
      );
    }
    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch {
      throw new LoopResumeError(
        "loop_resume_artifact_missing",
        `Loop artifact is missing: ${artifactPath}.`,
      );
    }
    if (realPath !== root && !realPath.startsWith(`${root}${path.sep}`)) {
      throw new LoopResumeError(
        "loop_resume_artifact_invalid",
        `Loop artifact resolves outside the package KES root: ${artifactPath}.`,
      );
    }
    const stat = fs.statSync(realPath);
    if (!stat.isFile()) {
      throw new LoopResumeError(
        "loop_resume_artifact_invalid",
        `Loop artifact is not a regular file: ${artifactPath}.`,
      );
    }
    hashes[artifactPath] =
      `sha256:${createHash("sha256").update(fs.readFileSync(realPath)).digest("hex")}`;
  }
  return hashes;
}

export function validateLoopArtifactHashes(
  artifactRoot: string,
  expectedHashes: Record<string, string>,
): void {
  const current = captureLoopArtifactHashes(artifactRoot, Object.keys(expectedHashes));
  for (const [artifactPath, expectedHash] of Object.entries(expectedHashes)) {
    if (current[artifactPath] !== expectedHash) {
      throw new LoopResumeError(
        "loop_resume_artifact_drift",
        `Loop artifact changed after checkpointing: ${artifactPath}.`,
      );
    }
  }
}

function validateCheckpoint(value: unknown, expectedRunId: string): LoopRunCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidCheckpoint(expectedRunId);
  }
  const record = value as Partial<LoopRunCheckpoint>;
  const statuses = new Set<LoopRunStatus>(["running", "retryable", "failed", "aborted", "done"]);
  if (
    record.schema !== LOOP_RUN_SCHEMA ||
    record.runId !== expectedRunId ||
    typeof record.plugin !== "string" ||
    typeof record.pluginSemanticsHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(record.pluginSemanticsHash) ||
    !Array.isArray(record.phases) ||
    record.phases.length === 0 ||
    new Set(record.phases).size !== record.phases.length ||
    record.phases.some((phase) => typeof phase !== "string" || !phase) ||
    typeof record.objective !== "string" ||
    typeof record.cwd !== "string" ||
    !statuses.has(record.status as LoopRunStatus) ||
    (record.effectReceiptContract !== undefined &&
      record.effectReceiptContract !== "asc.dispatch_effect_receipt.v1") ||
    !Array.isArray(record.attempts) ||
    !record.artifactHashes ||
    typeof record.artifactHashes !== "object" ||
    Array.isArray(record.artifactHashes) ||
    Object.entries(record.artifactHashes).some(
      ([artifactPath, hash]) =>
        !artifactPath || typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash),
    ) ||
    (record.terminalPublication !== undefined &&
      !isValidTerminalPublication(record.terminalPublication)) ||
    typeof record.stateFingerprint !== "string" ||
    !Number.isSafeInteger(record.resumeCount) ||
    (record.resumeCount ?? -1) < 0 ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    throw invalidCheckpoint(expectedRunId);
  }

  const artifactHashes = record.artifactHashes as Record<string, string>;
  const attemptStatuses = new Set<LoopAttemptStatus>(["done", "error", "timed_out", "aborted"]);
  const dispositions = new Set<LoopAttemptEffectDisposition>([
    "settled",
    "confirmed_no_effects",
    "effect_indeterminate",
  ]);
  const attemptIds = new Set<string>();
  const ownerDispatchIds = new Set<string>();
  const ownerAttemptIds = new Set<string>();
  let highestPhaseIndex = 0;
  for (const attempt of record.attempts) {
    if (
      !attempt ||
      typeof attempt !== "object" ||
      typeof attempt.attemptId !== "string" ||
      !attempt.attemptId ||
      attemptIds.has(attempt.attemptId) ||
      typeof attempt.phase !== "string" ||
      !record.phases.includes(attempt.phase) ||
      typeof attempt.agent !== "string" ||
      !attempt.agent ||
      typeof attempt.cognitiveTool !== "string" ||
      !attempt.cognitiveTool ||
      !attemptStatuses.has(attempt.status) ||
      !dispositions.has(attempt.effectDisposition) ||
      (record.effectReceiptContract === "asc.dispatch_effect_receipt.v1" &&
        attempt.effectDisposition === "settled" &&
        attempt.ownerEffectReceipt === undefined) ||
      (attempt.ownerEffectReceipt !== undefined &&
        !isValidCheckpointOwnerEffectReceipt(
          attempt.ownerEffectReceipt,
          attempt.effectDisposition,
          attempt.attemptId,
        )) ||
      typeof attempt.output !== "string" ||
      !Number.isSafeInteger(attempt.outputBytes) ||
      attempt.outputBytes < 0 ||
      typeof attempt.outputSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(attempt.outputSha256) ||
      typeof attempt.outputTruncated !== "boolean" ||
      Buffer.byteLength(attempt.output, "utf8") !== attempt.outputBytes ||
      createHash("sha256").update(attempt.output).digest("hex") !== attempt.outputSha256 ||
      attempt.outputTruncated ||
      (attempt.claimLineCount !== undefined &&
        (!Number.isSafeInteger(attempt.claimLineCount) || attempt.claimLineCount < 0)) ||
      (attempt.learningClaimSha256 !== undefined &&
        (typeof attempt.learningClaimSha256 !== "string" ||
          !/^sha256:[a-f0-9]{64}$/.test(attempt.learningClaimSha256))) ||
      (attempt.stderr !== undefined && typeof attempt.stderr !== "string") ||
      typeof attempt.exitCode !== "number" ||
      typeof attempt.elapsed !== "number" ||
      !Array.isArray(attempt.artifactPaths) ||
      attempt.artifactPaths.some(
        (artifactPath) => typeof artifactPath !== "string" || !(artifactPath in artifactHashes),
      ) ||
      typeof attempt.timestamp !== "string"
    ) {
      throw invalidCheckpoint(expectedRunId);
    }
    attemptIds.add(attempt.attemptId);
    if (attempt.ownerEffectReceipt) {
      if (
        ownerDispatchIds.has(attempt.ownerEffectReceipt.dispatchId) ||
        ownerAttemptIds.has(attempt.ownerEffectReceipt.attemptId)
      ) {
        throw invalidCheckpoint(expectedRunId);
      }
      ownerDispatchIds.add(attempt.ownerEffectReceipt.dispatchId);
      ownerAttemptIds.add(attempt.ownerEffectReceipt.attemptId);
    }
    const phaseIndex = record.phases.indexOf(attempt.phase);
    if (phaseIndex < highestPhaseIndex) throw invalidCheckpoint(expectedRunId);
    highestPhaseIndex = phaseIndex;
  }

  return record as LoopRunCheckpoint;
}

function isValidTerminalPublication(value: unknown): value is LoopTerminalPublication {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const publication = value as Partial<LoopTerminalPublication>;
  if (
    !["prepared", "published"].includes(publication.state || "") ||
    typeof publication.preparedId !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(publication.preparedId) ||
    !["done", "failed", "aborted"].includes(publication.outcome || "") ||
    typeof publication.elapsed !== "number" ||
    !Number.isFinite(publication.elapsed) ||
    publication.elapsed < 0 ||
    typeof publication.resumed !== "boolean" ||
    typeof publication.preparedAt !== "string" ||
    !Number.isFinite(Date.parse(publication.preparedAt)) ||
    !Array.isArray(publication.artifacts) ||
    publication.artifacts.length < 1 ||
    publication.artifacts.length > 2
  ) {
    return false;
  }
  const paths = new Set<string>();
  return publication.artifacts.every((artifact) => {
    if (
      !artifact ||
      !["kes_diary", "kes_learning_candidate"].includes(artifact.type) ||
      typeof artifact.path !== "string" ||
      !/^(diary|docs\/learnings)\/[^/]+\.md$/.test(artifact.path) ||
      paths.has(artifact.path) ||
      typeof artifact.hash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.hash)
    )
      return false;
    paths.add(artifact.path);
    return true;
  });
}

function isValidCheckpointOwnerEffectReceipt(
  value: unknown,
  expectedDisposition: LoopAttemptEffectDisposition,
  expectedCorrelationId: string,
): value is OwnerEffectReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Partial<OwnerEffectReceipt>;
  return (
    receipt.schema === "asc.dispatch_effect_receipt.v1" &&
    typeof receipt.dispatchId === "string" &&
    Boolean(receipt.dispatchId) &&
    typeof receipt.attemptId === "string" &&
    Boolean(receipt.attemptId) &&
    typeof receipt.sessionName === "string" &&
    Boolean(receipt.sessionName) &&
    receipt.consumerCorrelationId === expectedCorrelationId &&
    receipt.disposition === expectedDisposition &&
    typeof receipt.recordedAt === "string" &&
    Number.isFinite(Date.parse(receipt.recordedAt)) &&
    typeof receipt.receiptPath === "string" &&
    path.isAbsolute(receipt.receiptPath)
  );
}

function assertCheckpointWithinRetention(
  checkpoint: LoopRunCheckpoint,
  nowMs: number,
  retentionMs: number,
): void {
  const updatedAtMs = checkpointUpdatedAtMs(checkpoint);
  if (updatedAtMs <= nowMs - retentionMs) {
    throw new LoopResumeError(
      "loop_resume_checkpoint_expired",
      `Loop checkpoint ${checkpoint.runId} is outside the seven-day rolling continuation window. Restart the loop instead of reviving stale lineage.`,
    );
  }
}

function checkpointUpdatedAtMs(checkpoint: LoopRunCheckpoint): number {
  const updatedAtMs = Date.parse(checkpoint.updatedAt);
  if (!Number.isFinite(updatedAtMs)) throw invalidCheckpoint(checkpoint.runId);
  return updatedAtMs;
}

function ensureStateRoot(rootDir: string): void {
  fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(rootDir);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(rootDir) !== path.resolve(rootDir) ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid())
  ) {
    throw new LoopResumeError(
      "loop_resume_state_root_invalid",
      `Loop checkpoint root must be a real package-owned directory: ${rootDir}.`,
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    fs.chmodSync(rootDir, 0o700);
  }
  if ((fs.lstatSync(rootDir).mode & 0o077) !== 0) {
    throw new LoopResumeError(
      "loop_resume_state_root_invalid",
      `Loop checkpoint root permissions must be 0700: ${rootDir}.`,
    );
  }
}

function assertSecureCheckpointFile(filePath: string): void {
  const stat = fs.lstatSync(filePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > MAX_CHECKPOINT_BYTES ||
    (stat.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid())
  ) {
    throw new LoopResumeError(
      "loop_resume_checkpoint_invalid",
      `Loop checkpoint is not a private, owned, single-link regular file: ${filePath}.`,
    );
  }
}

function readSecureRegularFile(filePath: string): string {
  assertSecureCheckpointFile(filePath);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_CHECKPOINT_BYTES) {
      throw new LoopResumeError(
        "loop_resume_checkpoint_invalid",
        `Loop checkpoint changed while opening: ${filePath}.`,
      );
    }
    const content = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < content.length) {
      const bytesRead = fs.readSync(descriptor, content, offset, content.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== content.length) throw new Error("short checkpoint read");
    return content.toString("utf8");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function writeDurableFile(filePath: string, content: string, exclusive: boolean): void {
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | (exclusive ? fs.constants.O_EXCL : 0),
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fsyncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function invalidCheckpoint(runId: string): LoopResumeError {
  return new LoopResumeError(
    "loop_resume_checkpoint_invalid",
    `Owned loop checkpoint ${runId} is malformed or uses an unsupported schema.`,
  );
}

function assertSafeRunId(runId: string): void {
  if (!/^[a-z][a-z0-9-]*-\d{11,}$/.test(runId)) {
    throw new LoopResumeError(
      "loop_resume_invalid_run_id",
      `Invalid resume_run_id: ${runId || "<empty>"}.`,
    );
  }
}

function readLockOwner(lockDir: string): { pid: number; token: string } | undefined {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8")) as {
      pid?: unknown;
      token?: unknown;
    };
    return typeof owner.pid === "number" &&
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      typeof owner.token === "string" &&
      owner.token
      ? { pid: owner.pid, token: owner.token }
      : undefined;
  } catch {
    return undefined;
  }
}

function isProcessLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}
