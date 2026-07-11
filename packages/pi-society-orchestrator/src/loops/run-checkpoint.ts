import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LOOP_RUN_SCHEMA = "society_orchestrator.loop_run.v1";
const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;

export type LoopRunStatus = "running" | "failed" | "aborted" | "done";
export type LoopAttemptStatus = "done" | "error" | "timed_out" | "aborted";
export type LoopAttemptEffectDisposition =
  | "settled"
  | "confirmed_no_effects"
  | "effect_indeterminate";

export interface LoopPhaseAttemptCheckpoint {
  attemptId: string;
  phase: string;
  status: LoopAttemptStatus;
  effectDisposition: LoopAttemptEffectDisposition;
  output: string;
  exitCode: number;
  failureKind?: string;
  elapsed: number;
  artifactPaths: string[];
  timestamp: string;
}

export interface LoopRunCheckpoint {
  schema: typeof LOOP_RUN_SCHEMA;
  runId: string;
  plugin: string;
  phases: string[];
  objective: string;
  cwd: string;
  status: LoopRunStatus;
  attempts: LoopPhaseAttemptCheckpoint[];
  artifactHashes: Record<string, string>;
  stateFingerprint: string;
  resumeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoopRunLock {
  release(): void;
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
    rootDir: string = path.join(
      os.homedir(),
      ".pi",
      "agent",
      "state",
      "pi-society-orchestrator",
      "loop-runs",
    ),
  ) {
    this.rootDir = rootDir;
  }

  create(input: {
    runId: string;
    plugin: string;
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
      phases: [...input.phases],
      objective: input.objective,
      cwd: fs.realpathSync(input.cwd),
      status: "running",
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
    if (latest?.status === "done") continue;

    const laterAttempts = checkpoint.attempts.filter(
      (attempt) => checkpoint.phases.indexOf(attempt.phase) > phaseIndex,
    );
    if (laterAttempts.length > 0) {
      throw new LoopResumeError(
        "loop_resume_non_linear_history",
        `Loop run ${checkpoint.runId} has attempts after unresolved phase ${phase}; restart or reconcile the run instead of resuming mechanically.`,
      );
    }
    if (!latest || latest.effectDisposition === "confirmed_no_effects") return phase;
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

export function validateResumeCheckpoint(input: {
  checkpoint: LoopRunCheckpoint;
  plugin: string;
  phases: string[];
  objective: string;
  cwd: string;
  expectedFailedPhase: string;
  currentStateFingerprint: string;
  artifactRoot: string;
}): string {
  const { checkpoint } = input;
  if (checkpoint.plugin !== input.plugin) {
    throw new LoopResumeError(
      "loop_resume_plugin_mismatch",
      `Loop run ${checkpoint.runId} belongs to ${checkpoint.plugin}, not ${input.plugin}.`,
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
  const statuses = new Set<LoopRunStatus>(["running", "failed", "aborted", "done"]);
  if (
    record.schema !== LOOP_RUN_SCHEMA ||
    record.runId !== expectedRunId ||
    typeof record.plugin !== "string" ||
    !Array.isArray(record.phases) ||
    record.phases.length === 0 ||
    new Set(record.phases).size !== record.phases.length ||
    record.phases.some((phase) => typeof phase !== "string" || !phase) ||
    typeof record.objective !== "string" ||
    typeof record.cwd !== "string" ||
    !statuses.has(record.status as LoopRunStatus) ||
    !Array.isArray(record.attempts) ||
    !record.artifactHashes ||
    typeof record.artifactHashes !== "object" ||
    Array.isArray(record.artifactHashes) ||
    Object.keys(record.artifactHashes).length === 0 ||
    Object.entries(record.artifactHashes).some(
      ([artifactPath, hash]) =>
        !artifactPath || typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash),
    ) ||
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
      !attemptStatuses.has(attempt.status) ||
      !dispositions.has(attempt.effectDisposition) ||
      (attempt.status === "done" && attempt.effectDisposition !== "settled") ||
      typeof attempt.output !== "string" ||
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
    const phaseIndex = record.phases.indexOf(attempt.phase);
    if (phaseIndex < highestPhaseIndex) throw invalidCheckpoint(expectedRunId);
    highestPhaseIndex = phaseIndex;
  }

  return record as LoopRunCheckpoint;
}

function ensureStateRoot(rootDir: string): void {
  fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(rootDir);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(rootDir) !== path.resolve(rootDir)
  ) {
    throw new LoopResumeError(
      "loop_resume_state_root_invalid",
      `Loop checkpoint root must be a real directory: ${rootDir}.`,
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
