// ---
// summary: "Executes cognitive loop plugins with evidence, KES capture, checkpoints, and resume gates."
// read_when:
//   - "Changing loop execution, evidence, KES, checkpoint, resume, or terminal projection behavior."
// ---

/**
 * Loop Engine — Pluggable iteration frameworks (OODA, Strategic, Kaizen, ADKAR)
 *
 * Each plugin defines phases, cognitive tools per phase, and transition hooks.
 * The engine executes phases sequentially, recording evidence and package-owned KES artifacts.
 *
 * Note: the former `mito` loop name was retired because it collided with
 * Prof. Binner's MITO terminology already used elsewhere in the workspace.
 *
 * Usage:
 *   /loop ooda "Fix the authentication bug"
 *   /loop strategic "Plan the migration strategy"
 *   /loop kaizen "Improve test coverage"
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AGENT_PROFILES, type AgentDef } from "../runtime/agent-profiles.ts";
import { resolveAkPath } from "../runtime/ak.ts";
import {
  type EvidenceEntry,
  type EvidenceWriteResult,
  finalizeExecutionEffects,
} from "../runtime/evidence.ts";
import { getExecutionStatus } from "../runtime/execution-status.ts";
import { resolveSocietyDbPath } from "../runtime/society-db-path.ts";
import {
  type AscExecutionObservation,
  isVerifiedDispatchEffectReceipt,
  projectAscExecutionGroupTerminal,
  type VerifiedDispatchEffectReceipt,
} from "../runtime/subagent.ts";
import { LoopKesWriter, resolveLoopKesPackageRoot } from "./kes.ts";
import {
  captureLoopArtifactHashes,
  type LoopPhaseAttemptCheckpoint,
  LoopResumeError,
  type LoopRunCheckpoint,
  LoopRunCheckpointStore,
  validateResumeCheckpoint,
  validateTerminalPublicationResume,
  validateTerminalSynthesisResume,
} from "./run-checkpoint.ts";
import { captureLoopStateFingerprint } from "./run-state-fingerprint.ts";

const DEFAULT_SOCIETY_DB = resolveSocietyDbPath();

import { AgentKernel } from "./agent-kernel.ts";
import type {
  Artifact,
  CompactLoopResult,
  CompactPhaseResult,
  LoopContext,
  LoopDispatchFn,
  LoopExecutionOptions,
  LoopPlugin,
  LoopResult,
  PhaseResult,
} from "./contracts.ts";

export interface LoopEvidenceRecorder {
  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult>;
}

export interface LoopExecutorOptions {
  akPath?: string;
  packageRoot?: string;
  allowUnverifiedKesRoot?: boolean;
  ak?: LoopEvidenceRecorder;
  checkpointStore?: LoopRunCheckpointStore;
  captureStateFingerprint?: (cwd: string, excludedPaths?: string[]) => string;
  verifyEffectReceipt?: (receipt: VerifiedDispatchEffectReceipt | undefined) => boolean;
  afterTerminalMemberDurable?: (relativePath: string, memberIndex: number) => void;
}

export class LoopExecutor {
  private plugin: LoopPlugin;
  private kes: LoopKesWriter;
  private ak: LoopEvidenceRecorder;
  private cwd: string;
  private checkpointStore: LoopRunCheckpointStore;
  private captureStateFingerprint: (cwd: string, excludedPaths?: string[]) => string;
  private verifyEffectReceipt: (receipt: VerifiedDispatchEffectReceipt | undefined) => boolean;
  private kesPackageRoot: string;

  constructor(
    plugin: LoopPlugin,
    cwd: string,
    _vaultDir: string,
    options: LoopExecutorOptions = {},
  ) {
    this.plugin = plugin;
    this.cwd = cwd;
    this.kesPackageRoot = resolveLoopKesPackageRoot(options.packageRoot);
    this.kes = new LoopKesWriter(this.kesPackageRoot, {
      allowUnverifiedPackageRoot: options.allowUnverifiedKesRoot,
      afterMemberDurable: options.afterTerminalMemberDurable,
    });
    this.ak =
      options.ak ||
      new AgentKernel(
        options.akPath || resolveAkPath({ cwd: process.cwd() }),
        DEFAULT_SOCIETY_DB,
        cwd,
      );
    this.checkpointStore = options.checkpointStore || new LoopRunCheckpointStore();
    this.captureStateFingerprint = options.captureStateFingerprint || captureLoopStateFingerprint;
    this.verifyEffectReceipt = options.verifyEffectReceipt || isVerifiedDispatchEffectReceipt;
    const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "loops");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  async execute(
    objective: string,
    dispatchFn: LoopDispatchFn,
    signal?: AbortSignal,
    options: LoopExecutionOptions = {},
  ): Promise<LoopResult> {
    const resumeFields = [options.resumeRunId, options.expectedFailedPhase, options.recoveryMode];
    const resumeRequested = resumeFields.some((value) => value !== undefined);
    if (
      resumeRequested &&
      (!options.resumeRunId ||
        !options.expectedFailedPhase ||
        options.recoveryMode !== "validate_then_retry")
    ) {
      throw new LoopResumeError(
        "loop_resume_contract_incomplete",
        "Loop resume requires resume_run_id, expected_failed_phase, and recovery_mode=validate_then_retry.",
      );
    }

    const runId = options.resumeRunId || `${this.plugin.name}-${Date.now()}`;
    this.checkpointStore.pruneExpired({ excludeRunIds: [runId] });
    const lock = this.checkpointStore.acquire(runId);
    try {
      return await this.executeRun(objective, dispatchFn, signal, options, runId);
    } finally {
      lock.release();
    }
  }

  private async executeRun(
    objective: string,
    dispatchFn: LoopDispatchFn,
    signal: AbortSignal | undefined,
    options: LoopExecutionOptions,
    runId: string,
  ): Promise<LoopResult> {
    const startTime = Date.now();
    const resumed = Boolean(options.resumeRunId);
    let sessionId = runId;
    let resumedPhase: string | undefined;
    let startPhaseIndex = 0;
    let checkpoint: LoopRunCheckpoint | undefined;

    if (signal?.aborted) {
      return {
        plugin: this.plugin.name,
        sessionId,
        objective,
        resumed,
        phases: [],
        artifacts: [],
        success: false,
        elapsed: 0,
      };
    }

    const context: LoopContext = {
      sessionId,
      pluginName: this.plugin.name,
      objective,
      currentPhase: "",
      history: [],
      artifacts: [],
      cwd: this.cwd,
    };

    if (options.resumeRunId) {
      checkpoint = this.checkpointStore.load(options.resumeRunId);
      if (!checkpoint.terminalPublication) {
        let synthesis: ReturnType<typeof validateTerminalSynthesisResume> | undefined;
        try {
          synthesis = validateTerminalSynthesisResume({
            checkpoint,
            plugin: this.plugin.name,
            pluginSemanticsHash: captureLoopPluginSemanticsHash(this.plugin),
            phases: this.plugin.phases,
            objective,
            cwd: this.cwd,
            expectedFailedPhase: options.expectedFailedPhase || "",
            currentStateFingerprint: this.captureStateFingerprint(this.cwd),
            artifactRoot: this.kesPackageRoot,
          });
        } catch (error) {
          if (
            !(error instanceof LoopResumeError) ||
            error.failureKind !== "loop_terminal_synthesis_not_terminal"
          ) {
            throw error;
          }
        }
        if (synthesis) {
          const prepared = this.kes.prepareTerminal(
            this.buildTerminalKesEntry({
              sessionId: checkpoint.runId,
              objective,
              success: synthesis.outcome === "done",
              elapsed: synthesis.elapsed,
              resumed: synthesis.resumed,
              attempts: checkpoint.attempts,
              timestamp: new Date(synthesis.preparedAt),
            }),
          );
          checkpoint.terminalPublication = {
            state: "prepared",
            preparedId: prepared.preparedId,
            outcome: synthesis.outcome,
            elapsed: synthesis.elapsed,
            resumed: synthesis.resumed,
            preparedAt: synthesis.preparedAt,
            artifacts: prepared.artifacts.map((artifact) => ({
              type: artifact.type as "kes_diary" | "kes_learning_candidate",
              path: artifact.content,
              hash: prepared.hashes[artifact.content],
            })),
          };
          checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
          this.checkpointStore.save(checkpoint);
        }
      }
      if (checkpoint.terminalPublication) {
        this.kes.reconcilePreparedTemps(checkpoint.terminalPublication.artifacts);
        const publication = validateTerminalPublicationResume({
          checkpoint,
          plugin: this.plugin.name,
          pluginSemanticsHash: captureLoopPluginSemanticsHash(this.plugin),
          phases: this.plugin.phases,
          objective,
          cwd: this.cwd,
          currentStateFingerprint: this.captureTerminalPublicationFingerprint(
            checkpoint.terminalPublication.artifacts,
          ),
          artifactRoot: this.kesPackageRoot,
        });
        const history = checkpoint.attempts.map(phaseResultFromCheckpoint);
        const prepared = this.kes.prepareTerminal(
          this.buildTerminalKesEntry({
            sessionId: checkpoint.runId,
            objective,
            success: publication.outcome === "done",
            elapsed: publication.elapsed,
            resumed: publication.resumed,
            attempts: checkpoint.attempts,
            timestamp: new Date(publication.preparedAt),
          }),
          publication.artifacts,
        );
        if (
          prepared.preparedId !== publication.preparedId ||
          JSON.stringify(prepared.hashes) !==
            JSON.stringify(
              Object.fromEntries(
                publication.artifacts.map((artifact) => [artifact.path, artifact.hash]),
              ),
            )
        ) {
          throw new LoopResumeError(
            "loop_terminal_publication_drift",
            `Prepared terminal publication ${checkpoint.runId} no longer renders identically.`,
          );
        }
        const terminalArtifacts = this.kes.commitTerminal(prepared);
        checkpoint.terminalPublication.state = "published";
        checkpoint.status = publication.outcome;
        checkpoint.artifactHashes = { ...checkpoint.artifactHashes, ...prepared.hashes };
        checkpoint.resumeCount += 1;
        this.checkpointStore.save(checkpoint);
        return {
          plugin: this.plugin.name,
          sessionId: checkpoint.runId,
          objective,
          resumed: true,
          phases: history,
          artifacts: terminalArtifacts,
          success: publication.outcome === "done",
          elapsed: publication.elapsed,
        };
      }
      resumedPhase = validateResumeCheckpoint({
        checkpoint,
        plugin: this.plugin.name,
        pluginSemanticsHash: captureLoopPluginSemanticsHash(this.plugin),
        phases: this.plugin.phases,
        objective,
        cwd: this.cwd,
        expectedFailedPhase: options.expectedFailedPhase || "",
        currentStateFingerprint: this.captureStateFingerprint(this.cwd),
        artifactRoot: this.kesPackageRoot,
      });
      startPhaseIndex = this.plugin.phases.indexOf(resumedPhase);
      sessionId = checkpoint.runId;
      context.sessionId = sessionId;
      context.history = checkpoint.attempts.map(phaseResultFromCheckpoint);
      context.artifacts = checkpoint.attempts.flatMap((attempt) =>
        attempt.artifactPaths.map((artifactPath) => ({
          type: "resume-reference",
          content: artifactPath,
          metadata: {
            runId: checkpoint?.runId,
            phase: attempt.phase,
            attemptId: attempt.attemptId,
          },
        })),
      );
      checkpoint.status = "running";
      checkpoint.resumeCount += 1;
      this.checkpointStore.save(checkpoint);
    } else {
      checkpoint = this.checkpointStore.create({
        runId: sessionId,
        plugin: this.plugin.name,
        pluginSemanticsHash: captureLoopPluginSemanticsHash(this.plugin),
        phases: this.plugin.phases,
        objective,
        cwd: this.cwd,
        artifactHashes: {},
        stateFingerprint: this.captureStateFingerprint(this.cwd),
      });
    }

    let success = true;

    for (let i = startPhaseIndex; i < this.plugin.phases.length; i++) {
      if (signal?.aborted) {
        success = false;
        break;
      }

      const phase = this.plugin.phases[i];
      const tools = this.plugin.cognitiveTools[phase] || [];
      const agent = this.plugin.agents[phase] || "scout";
      const primaryTool = tools[0] || "first-principles";
      const previousPhase = [...context.history]
        .reverse()
        .find(
          (result) => result.status === "done" && this.plugin.phases.indexOf(result.phase) < i,
        )?.phase;
      context.currentPhase = phase;

      if (
        previousPhase &&
        this.plugin.validate &&
        !this.plugin.validate(previousPhase, phase, context)
      ) {
        const validationFailure: PhaseResult = {
          phase,
          attemptId: randomUUID(),
          output: `Transition validation failed: ${previousPhase} -> ${phase}`,
          exitCode: 1,
          status: "error",
          elapsed: 0,
          artifacts: [],
          timestamp: new Date(),
        };
        context.history.push(validationFailure);
        checkpoint.attempts.push(
          toCheckpointAttempt(
            validationFailure,
            "confirmed_no_effects",
            agent,
            primaryTool,
            objective,
          ),
        );
        checkpoint.status = "failed";
        checkpoint.artifactHashes = {
          ...checkpoint.artifactHashes,
          ...this.captureKesArtifactHashes(context.artifacts),
        };
        checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
        this.checkpointStore.save(checkpoint);
        success = false;
        break;
      }

      // Persist an indeterminate attempt before any phase hook or dispatch can emit effects.
      // A crash or timeout after this point must reconcile through the effect owner before retry.
      const attemptId = randomUUID();
      const pendingOutput = "Phase attempt began but has no conclusive execution receipt.";
      const pendingAttempt: LoopPhaseAttemptCheckpoint = {
        attemptId,
        phase,
        agent,
        cognitiveTool: primaryTool,
        status: "error",
        effectDisposition: "effect_indeterminate",
        output: pendingOutput,
        outputBytes: Buffer.byteLength(pendingOutput, "utf8"),
        outputSha256: createHash("sha256").update(pendingOutput).digest("hex"),
        outputTruncated: false,
        exitCode: 1,
        failureKind: "loop_attempt_in_progress",
        elapsed: 0,
        artifactPaths: [],
        timestamp: new Date().toISOString(),
      };
      checkpoint.attempts.push(pendingAttempt);
      checkpoint.status = "running";
      checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
      this.checkpointStore.save(checkpoint);

      // Phase enter hook
      if (this.plugin.onEnter) {
        await this.plugin.onEnter(phase, context);
      }

      // Build context for this phase
      const phaseContext = this.buildPhaseContext(phase, objective, context);

      options.onUpdate?.({
        event: "phase_start",
        plugin: this.plugin.name,
        sessionId,
        phase,
        phaseIndex: i + 1,
        phaseCount: this.plugin.phases.length,
        agent,
        primaryTool,
      });

      // Dispatch agent with cognitive tool
      const _phaseStart = Date.now();
      let rawResult: Awaited<ReturnType<LoopDispatchFn>>;
      try {
        rawResult = await dispatchFn({
          agent,
          cognitiveTool: primaryTool,
          context: phaseContext,
          effectCorrelationId: attemptId,
          observation: {
            producer: "loop_execute",
            cwd: this.cwd,
            group: {
              id: sessionId,
              kind: "loop",
              label: `${this.plugin.name.toUpperCase()} loop`,
            },
            phase: {
              name: phase,
              index: i + 1,
              count: this.plugin.phases.length,
              agent,
              cognitiveTool: primaryTool,
            },
          },
          timeoutSeconds: options.phaseTimeoutSeconds,
          onUpdate: (update) =>
            options.onUpdate?.({
              event: "phase_update",
              plugin: this.plugin.name,
              sessionId,
              phase,
              update,
            }),
        });
      } catch (cause) {
        rawResult = {
          output: "Dispatch rejected without a settled owner effect receipt.",
          stderr: cause instanceof Error ? cause.message : String(cause),
          exitCode: 1,
          elapsed: Date.now() - _phaseStart,
          failureKind: "dispatch_rejected",
        };
      }
      const result = applyLoopPhaseSemanticOutcome(this.plugin.name, phase, rawResult);
      const verifiedOwnerReceipt =
        isValidOwnerEffectReceipt(result.effectReceipt, attemptId) &&
        this.verifyEffectReceipt(result.effectReceipt)
          ? result.effectReceipt
          : undefined;
      // ASC's receipt covers dispatch effects only. A pre-dispatch plugin hook is a
      // separate owner surface, so it prevents phase-wide confirmed-no-effects retry.
      const ownerReceipt =
        verifiedOwnerReceipt?.disposition === "confirmed_no_effects" && this.plugin.onEnter
          ? undefined
          : verifiedOwnerReceipt;

      // Dispatcher-owned pre-spawn attestation (agent resolution, cognitive-tool
      // load, or another boundary before any child launch). ASC was never
      // invoked, so no ASC receipt can exist; the dispatcher is the only
      // possible effect owner at this boundary and owns none. This must not
      // degrade to effect_indeterminate: a pre-spawn failure cannot become a
      // durable-effect question. Evidence is kept as internal bookkeeping via
      // the same attempt records; the disposition claims no effects only at the
      // effectful dispatch boundary.
      if (
        !ownerReceipt &&
        result.preDispatchNoEffects &&
        result.effectReceipt === undefined &&
        !this.plugin.onEnter
      ) {
        const preDispatch = result.preDispatchNoEffects;
        const phaseResult: PhaseResult = {
          phase,
          attemptId,
          output: result.output,
          stderr: result.stderr,
          outputTruncated: result.outputTruncated === true,
          exitCode: result.exitCode,
          status: "error",
          effectDisposition: "confirmed_no_effects",
          failureKind: preDispatch.failureKind,
          elapsed: result.elapsed,
          artifacts: [],
          timestamp: new Date(),
        };
        context.history.push(phaseResult);
        const preDispatchAttemptIndex = checkpoint.attempts.findIndex(
          (attempt) => attempt.attemptId === attemptId,
        );
        checkpoint.attempts[preDispatchAttemptIndex] = toCheckpointAttempt(
          phaseResult,
          "confirmed_no_effects",
          agent,
          primaryTool,
          objective,
        );
        checkpoint.status = "retryable";
        checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
        this.checkpointStore.save(checkpoint);
        options.onUpdate?.({
          event: "phase_complete",
          plugin: this.plugin.name,
          sessionId,
          phase,
          status: "error",
          elapsed: result.elapsed,
          failureKind: preDispatch.failureKind,
        });
        success = false;
        break;
      }

      if (ownerReceipt?.disposition === "confirmed_no_effects") {
        const phaseResult: PhaseResult = {
          phase,
          attemptId,
          output: result.output,
          stderr: result.stderr,
          outputTruncated: result.outputTruncated === true,
          exitCode: result.exitCode,
          status: getExecutionStatus(result),
          effectDisposition: "confirmed_no_effects",
          failureKind:
            result.failureKind ||
            (getExecutionStatus(result) === "done" ? "effect_receipt_not_settled" : undefined),
          elapsed: result.elapsed,
          artifacts: [],
          timestamp: new Date(),
        };
        context.history.push(phaseResult);
        const confirmedAttemptIndex = checkpoint.attempts.findIndex(
          (attempt) => attempt.attemptId === attemptId,
        );
        checkpoint.attempts[confirmedAttemptIndex] = toCheckpointAttempt(
          phaseResult,
          "confirmed_no_effects",
          agent,
          primaryTool,
          objective,
          ownerReceipt,
        );
        checkpoint.status = "retryable";
        checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
        this.checkpointStore.save(checkpoint);
        options.onUpdate?.({
          event: "phase_complete",
          plugin: this.plugin.name,
          sessionId,
          phase,
          status: phaseResult.status,
          elapsed: result.elapsed,
          failureKind: phaseResult.failureKind,
        });
        success = false;
        break;
      }

      const executionOutcome = await finalizeExecutionEffects({
        result,
        signal,
        createEvidenceEntry: ({ status, success }) => ({
          check_type: `loop:${this.plugin.name}:${phase}`,
          result: success ? "pass" : "fail",
          details: {
            sessionId,
            objective: objective.slice(0, 100),
            elapsed: result.elapsed,
            status,
          },
        }),
        recordEvidence: (entry, activeSignal) => this.ak.evidenceRecord(entry, activeSignal),
      });

      const effectDisposition = ownerReceipt?.disposition ?? "effect_indeterminate";
      const phaseResult: PhaseResult = {
        phase,
        attemptId,
        output: result.output,
        stderr: result.stderr,
        outputTruncated: result.outputTruncated === true,
        exitCode: result.exitCode,
        status: executionOutcome.status,
        effectDisposition,
        failureKind:
          result.failureKind ||
          (executionOutcome.success && !ownerReceipt
            ? "effect_receipt_unverified"
            : executionOutcome.success && effectDisposition !== "settled"
              ? "effect_receipt_not_settled"
              : undefined),
        elapsed: result.elapsed,
        artifacts: [],
        timestamp: new Date(),
      };

      if (!executionOutcome.evidence.ok || effectDisposition !== "settled") {
        success = false;
      }

      // Phase exit hook
      if (executionOutcome.status !== "aborted" && this.plugin.onExit) {
        const artifacts = await this.plugin.onExit(phase, context);
        phaseResult.artifacts = artifacts;
      }

      context.history.push(phaseResult);
      context.artifacts.push(...phaseResult.artifacts);
      const checkpointAttemptIndex = checkpoint.attempts.findIndex(
        (attempt) => attempt.attemptId === attemptId,
      );
      checkpoint.attempts[checkpointAttemptIndex] = toCheckpointAttempt(
        phaseResult,
        effectDisposition,
        agent,
        primaryTool,
        objective,
        ownerReceipt,
      );
      checkpoint.status =
        executionOutcome.status === "aborted"
          ? "aborted"
          : executionOutcome.success &&
              executionOutcome.evidence.ok &&
              effectDisposition === "settled"
            ? "running"
            : "failed";
      checkpoint.artifactHashes = {
        ...checkpoint.artifactHashes,
        ...this.captureKesArtifactHashes(context.artifacts),
      };
      checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
      this.checkpointStore.save(checkpoint);

      options.onUpdate?.({
        event: "phase_complete",
        plugin: this.plugin.name,
        sessionId,
        phase,
        status: executionOutcome.status,
        elapsed: result.elapsed,
        failureKind: phaseResult.failureKind,
      });

      if (executionOutcome.status === "aborted") {
        success = false;
        break;
      }

      if (effectDisposition !== "settled") {
        success = false;
        break;
      }

      if (!executionOutcome.success) {
        success = false;
        const continueAfterFailure =
          options.continueAfterFailure ?? this.plugin.continueOnFailure ?? true;
        if (!continueAfterFailure) {
          break;
        }
        // Continue to next phase when the loop policy explicitly allows resilient execution.
      }
    }

    const elapsed = Date.now() - startTime;
    const outcome = success
      ? "done"
      : context.history.at(-1)?.status === "aborted" ||
          (context.history.length === 0 && signal?.aborted)
        ? "aborted"
        : "failed";
    if (outcome === "aborted" && context.history.length === 0) {
      checkpoint.status = "aborted";
      checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
      this.checkpointStore.save(checkpoint);
      return {
        plugin: this.plugin.name,
        sessionId,
        objective,
        resumed,
        ...(resumedPhase ? { resumedPhase } : {}),
        phases: [],
        artifacts: [],
        success: false,
        elapsed,
      };
    }
    const latestAttempt = checkpoint.attempts.at(-1);
    const retryableConfirmedNoEffects =
      latestAttempt?.effectDisposition === "confirmed_no_effects" &&
      latestAttempt.attemptId === context.history.at(-1)?.attemptId &&
      checkpoint.attempts.filter((attempt) => attempt.phase === latestAttempt.phase).length < 2;
    if (retryableConfirmedNoEffects) {
      // This lineage is still resumable: publishing a failure now would make a later
      // successful terminal outcome produce a second public bundle for the same run.
      checkpoint.status = "retryable";
      checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
      this.checkpointStore.save(checkpoint);
      return {
        plugin: this.plugin.name,
        sessionId,
        objective,
        resumed,
        ...(resumedPhase ? { resumedPhase } : {}),
        phases: context.history,
        artifacts: context.artifacts,
        success: false,
        retryable: true,
        elapsed,
      };
    }
    const preparedAt = new Date();
    const prepared = this.kes.prepareTerminal(
      this.buildTerminalKesEntry({
        sessionId,
        objective,
        success,
        elapsed,
        resumed,
        attempts: checkpoint.attempts,
        timestamp: preparedAt,
      }),
    );
    checkpoint.terminalPublication = {
      state: "prepared",
      preparedId: prepared.preparedId,
      outcome,
      elapsed,
      resumed,
      preparedAt: preparedAt.toISOString(),
      artifacts: prepared.artifacts.map((artifact) => ({
        type: artifact.type as "kes_diary" | "kes_learning_candidate",
        path: artifact.content,
        hash: prepared.hashes[artifact.content],
      })),
    };
    checkpoint.stateFingerprint = this.captureStateFingerprint(this.cwd);
    this.checkpointStore.save(checkpoint);

    context.artifacts.push(...this.kes.commitTerminal(prepared));
    checkpoint.terminalPublication.state = "published";
    checkpoint.status = outcome;
    checkpoint.artifactHashes = { ...checkpoint.artifactHashes, ...prepared.hashes };
    this.checkpointStore.save(checkpoint);

    return {
      plugin: this.plugin.name,
      sessionId,
      objective,
      resumed,
      ...(resumedPhase ? { resumedPhase } : {}),
      phases: context.history,
      artifacts: context.artifacts,
      success,
      elapsed,
    };
  }

  private buildTerminalKesEntry(input: {
    sessionId: string;
    objective: string;
    success: boolean;
    elapsed: number;
    resumed: boolean;
    attempts: LoopPhaseAttemptCheckpoint[];
    timestamp: Date;
  }) {
    return {
      plugin: this.plugin.name,
      sessionId: input.sessionId,
      objective: input.objective,
      success: input.success,
      elapsed: input.elapsed,
      resumed: input.resumed,
      timestamp: input.timestamp,
      phases: input.attempts.map((attempt) => ({
        phase: attempt.phase,
        agent: attempt.agent,
        primaryTool: attempt.cognitiveTool,
        status: attempt.status,
        effectDisposition: attempt.effectDisposition,
        exitCode: attempt.exitCode,
        elapsed: attempt.elapsed,
        failureKind: attempt.failureKind,
        attemptId: attempt.attemptId,
        outputBytes: attempt.outputBytes,
        outputSha256: attempt.outputSha256,
        outputTruncated: attempt.outputTruncated,
        claimLineCount: attempt.claimLineCount ?? 0,
        learningClaimSha256: attempt.learningClaimSha256,
      })),
    };
  }

  private captureTerminalPublicationFingerprint(artifacts: Array<{ path: string }>): string {
    return this.captureStateFingerprint(
      this.cwd,
      artifacts.map((artifact) => path.resolve(this.kesPackageRoot, artifact.path)),
    );
  }

  private captureKesArtifactHashes(artifacts: Artifact[]): Record<string, string> {
    return captureLoopArtifactHashes(
      this.kesPackageRoot,
      artifacts
        .filter((artifact) => artifact.type.startsWith("kes_"))
        .map((artifact) => artifact.content),
    );
  }

  private buildPhaseContext(phase: string, objective: string, context: LoopContext): string {
    const phaseAttemptCounts = new Map<string, number>();
    const previousResults = context.history
      .map((historyEntry) => {
        const attempt = (phaseAttemptCounts.get(historyEntry.phase) || 0) + 1;
        phaseAttemptCounts.set(historyEntry.phase, attempt);
        return `## ${historyEntry.phase} — attempt ${attempt} — ${historyEntry.status}\n${historyEntry.output.slice(0, 500)}`;
      })
      .join("\n\n");

    return `# Loop: ${this.plugin.name.toUpperCase()}
## Phase: ${phase}
## Session: ${context.sessionId}

## Objective
${objective}

${previousResults ? `## Previous Phases\n${previousResults}` : ""}

## Phase Protocol
${this.buildPhaseProtocol(phase)}

## Your Task
Execute the **${phase}** phase of the ${this.plugin.name.toUpperCase()} loop.
Focus on what this phase requires. Use the cognitive tools available to you.
`;
  }

  private buildPhaseProtocol(phase: string): string {
    if (this.plugin.name !== "transcendent") return STANDARD_PHASE_PROTOCOL;
    return (
      TRANSCENDENT_PHASE_PROTOCOLS[phase] || "Use the transcendent loop semantics for this phase."
    );
  }
}

function applyLoopPhaseSemanticOutcome(
  pluginName: string,
  phase: string,
  result: Awaited<ReturnType<LoopDispatchFn>>,
): Awaited<ReturnType<LoopDispatchFn>> {
  if (pluginName !== "transcendent" || phase !== "closure-gate" || result.exitCode !== 0) {
    return result;
  }
  const verdicts = [...result.output.matchAll(/^CLOSURE_GATE:\s*(PASS|INCOMPLETE)\s*$/gim)].map(
    (match) => match[1]?.toUpperCase(),
  );
  if (verdicts.length !== 1) {
    return forceLoopSemanticFailure(
      result,
      "closure_gate_verdict_missing",
      "Transcendent closure gate omitted its required machine verdict.",
    );
  }
  if (verdicts[0] === "INCOMPLETE") {
    return forceLoopSemanticFailure(
      result,
      "closure_gate_incomplete",
      "Transcendent closure gate reported blocking incomplete work.",
    );
  }
  return result;
}

function forceLoopSemanticFailure(
  result: Awaited<ReturnType<LoopDispatchFn>>,
  failureKind: string,
  errorMessage: string,
): Awaited<ReturnType<LoopDispatchFn>> {
  return {
    ...result,
    exitCode: 1,
    assistantStopReason: "error",
    assistantErrorMessage: errorMessage,
    executionState: {
      transport: {
        kind: "transport",
        exitCode: 1,
        aborted: false,
        timedOut: false,
      },
      protocol: {
        kind: "assistant_protocol",
        stopReason: "error",
        errorMessage,
      },
    },
    failureKind,
  };
}

function isValidOwnerEffectReceipt(
  receipt: Awaited<ReturnType<LoopDispatchFn>>["effectReceipt"],
  expectedCorrelationId: string,
): receipt is NonNullable<Awaited<ReturnType<LoopDispatchFn>>["effectReceipt"]> {
  return Boolean(
    receipt &&
      receipt.schema === "asc.dispatch_effect_receipt.v1" &&
      receipt.dispatchId &&
      receipt.attemptId &&
      receipt.consumerCorrelationId === expectedCorrelationId &&
      receipt.recordedAt &&
      receipt.receiptPath &&
      ["settled", "confirmed_no_effects", "effect_indeterminate"].includes(receipt.disposition),
  );
}

function toCheckpointAttempt(
  result: PhaseResult,
  effectDisposition: LoopPhaseAttemptCheckpoint["effectDisposition"],
  agent: string,
  cognitiveTool: string,
  objective: string,
  ownerEffectReceipt?: LoopPhaseAttemptCheckpoint["ownerEffectReceipt"],
): LoopPhaseAttemptCheckpoint {
  const evidence = createBoundedOutputEvidence(
    result.output,
    objective,
    MAX_CHECKPOINT_OUTPUT_BYTES,
    result.outputTruncated === true,
  );
  const boundedStderr = result.stderr
    ? createBoundedOutputEvidence(result.stderr, objective, 4 * 1024).output
    : undefined;
  return {
    attemptId: result.attemptId || randomUUID(),
    phase: result.phase,
    agent,
    cognitiveTool,
    status: result.status,
    effectDisposition,
    ...(ownerEffectReceipt ? { ownerEffectReceipt } : {}),
    output: evidence.output,
    outputBytes: evidence.outputBytes,
    outputSha256: evidence.outputSha256,
    outputTruncated: evidence.outputTruncated,
    claimLineCount: evidence.claimLineCount,
    ...(evidence.learningClaimSha256 ? { learningClaimSha256: evidence.learningClaimSha256 } : {}),
    ...(boundedStderr ? { stderr: boundedStderr } : {}),
    exitCode: result.exitCode,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    elapsed: result.elapsed,
    artifactPaths: result.artifacts
      .filter((artifact) => artifact.type.startsWith("kes_"))
      .map((artifact) => artifact.content),
    timestamp: result.timestamp.toISOString(),
  };
}

const MAX_CHECKPOINT_OUTPUT_BYTES = 512 * 1024;
const MAX_LEARNING_CLAIM_CHARS = 500;
const PRODUCER_SEMANTICS_VERSION = "loop-producer-semantics.v2";
const STANDARD_PHASE_PROTOCOL =
  "Use the loop's standard phase semantics and produce bounded, evidence-bearing output.";
const TRANSCENDENT_PHASE_PROTOCOLS: Record<string, string> = {
  diagnose:
    "Find the current ceiling. Name the limiting assumption, avoided ugliness, 100x precondition, and likely hidden debt.",
  "first-100x":
    "Attack the diagnosed ceiling directly. Prefer deletion over addition and identify the new ceiling revealed by the change.",
  "second-100x":
    "Attack the newly revealed ceiling and run the compound check: did the first 100x make this easier, harder, or unchanged? Surface visible debt.",
  "debt-targeting":
    "Classify remaining debt as blocking, accepted/deferred, or new opportunity. Blocking in-scope debt must become dissolve/rebuild input, not a terminal note.",
  dissolve:
    "Dissolve the assumptions, inherited constraints, scaffolding, or structures causing the targeted blocking debt.",
  rebuild:
    "Rebuild from first principles without reintroducing targeted debt. Show evidence that the targeted debt is gone rather than merely renamed.",
  "alien-pass":
    "Make the rebuilt result feel alien because the old problem no longer appears as a problem. Optimize outcome leverage and directness, not aesthetic novelty.",
  "closure-gate":
    "Apply the Definition of Done. Close only if no blocking in-scope debt remains; otherwise emit the next-loop ceiling or stop incomplete when continuation is not authorized. End with exactly one standalone machine verdict line: `CLOSURE_GATE: PASS` or `CLOSURE_GATE: INCOMPLETE`.",
};

function createBoundedOutputEvidence(
  rawOutput: string,
  _objective: string,
  maxBytes = MAX_CHECKPOINT_OUTPUT_BYTES,
  inputTruncated = false,
): {
  output: string;
  outputBytes: number;
  outputSha256: string;
  outputTruncated: boolean;
  claimLineCount: number;
  learningClaimSha256?: string;
} {
  if (inputTruncated) {
    throw new LoopResumeError(
      "loop_private_evidence_truncated",
      "The execution owner reported truncated phase output; exact private evidence was not checkpointed or published.",
    );
  }
  const rawBytes = Buffer.byteLength(rawOutput, "utf8");
  if (rawBytes > maxBytes) {
    throw new LoopResumeError(
      "loop_private_evidence_too_large",
      `Exact private phase evidence exceeds the ${maxBytes}-byte per-attempt policy; it was not truncated or published.`,
    );
  }
  const claimLines = rawOutput.split(/\r?\n/u).filter((line) => line.startsWith("KES_CLAIM:"));
  const rawClaim =
    claimLines.length === 1 ? claimLines[0].slice("KES_CLAIM:".length).trim() : undefined;
  const learningClaimSha256 =
    rawClaim && isAdmissibleClaimMarker(rawClaim)
      ? `sha256:${createHash("sha256").update(rawClaim).digest("hex")}`
      : undefined;
  return {
    output: rawOutput,
    outputBytes: rawBytes,
    outputSha256: createHash("sha256").update(rawOutput).digest("hex"),
    outputTruncated: false,
    claimLineCount: claimLines.length,
    ...(learningClaimSha256 ? { learningClaimSha256 } : {}),
  };
}

function isAdmissibleClaimMarker(claim: string): boolean {
  if (!claim || claim.length > MAX_LEARNING_CLAIM_CHARS || !/^[\x20-\x7e]+$/u.test(claim)) {
    return false;
  }
  const forbidden = [
    /\bauthorization\b/iu,
    /\bbearer\b/iu,
    /\b(?:api[_-]?key|secret|password|passphrase|token|credential)\b/iu,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bASIA[0-9A-Z]{16}\b/u,
    /\bnpm_[A-Za-z0-9]{20,}\b/u,
    /\bgh[pousr]_[A-Za-z0-9_]{8,}\b/u,
    /\bsk-[A-Za-z0-9_-]{8,}\b/u,
    /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/u,
    /(?:^|[^A-Za-z0-9])[A-Za-z0-9_+/=.-]{40,}(?:$|[^A-Za-z0-9])/u,
  ];
  return forbidden.every((pattern) => !pattern.test(claim));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function captureLoopPluginSemanticsHash(
  plugin: LoopPlugin,
  agentProfiles: Record<string, Pick<AgentDef, "name" | "tools" | "systemPrompt">> = AGENT_PROFILES,
): string {
  const hasHooks = Boolean(plugin.onEnter || plugin.onExit || plugin.validate);
  if (hasHooks && !plugin.producerHookSemantics) {
    throw new Error("Loop plugins with executable hooks require producerHookSemantics.");
  }
  const contract = {
    schema: PRODUCER_SEMANTICS_VERSION,
    phaseGraph: plugin.phases,
    routing: { agents: plugin.agents, cognitiveTools: plugin.cognitiveTools },
    resolvedAgentProfiles: Object.fromEntries(
      [...new Set(Object.values(plugin.agents))].sort().map((agent) => {
        const profile = agentProfiles[agent] || agentProfiles.scout;
        return [
          agent,
          {
            name: profile.name,
            tools: profile.tools,
            systemPromptSha256: createHash("sha256").update(profile.systemPrompt).digest("hex"),
          },
        ];
      }),
    ),
    phaseContext: {
      version: "loop-phase-context.v1",
      objective: "full-verbatim",
      previousOutput: "private-first-500-characters",
      protocols:
        plugin.name === "transcendent" ? TRANSCENDENT_PHASE_PROTOCOLS : STANDARD_PHASE_PROTOCOL,
    },
    outputClaimPolicy: {
      version: "loop-output-claim.v1",
      privateOutput: {
        encoding: "utf8",
        maxBytes: MAX_CHECKPOINT_OUTPUT_BYTES,
        truncation: "reject",
      },
      publicOutput: "attribution-digests-only",
      claim: "exactly-one-run-wide-explicit-admissible-final-successful-settled-attempt",
    },
    terminalization: {
      version: "loop-terminalization.v1",
      terminalBundle: "one-diary-at-most-one-candidate",
      retryableConfirmedNoEffects: "nonterminal-zero-kes",
      preAbort: "zero-kes",
      continueOnFailure: plugin.continueOnFailure ?? false,
      semanticOutcome:
        plugin.name === "transcendent" ? "closure-gate-exact-single-verdict.v1" : "exit-status.v1",
    },
    hooks: hasHooks ? plugin.producerHookSemantics : null,
  };
  return `sha256:${createHash("sha256").update(canonicalJson(contract)).digest("hex")}`;
}

function phaseResultFromCheckpoint(attempt: LoopPhaseAttemptCheckpoint): PhaseResult {
  return {
    phase: attempt.phase,
    attemptId: attempt.attemptId,
    output: attempt.output,
    stderr: attempt.stderr,
    outputTruncated: attempt.outputTruncated,
    exitCode: attempt.exitCode,
    status: attempt.status,
    ...(attempt.failureKind ? { failureKind: attempt.failureKind } : {}),
    elapsed: attempt.elapsed,
    artifacts: attempt.artifactPaths.map((artifactPath) => ({
      type: "resume-reference",
      content: artifactPath,
      metadata: { attemptId: attempt.attemptId, phase: attempt.phase },
    })),
    timestamp: new Date(attempt.timestamp),
  };
}

const PUBLIC_LOOP_FAILURE_SUMMARIES: Readonly<Record<string, string>> = Object.freeze({
  subagent_helper_bootstrap_failed:
    "The subagent helper could not start. Verify the installed package and child-runtime compatibility.",
  transport_exited_before_settlement:
    "The child transport exited before settlement. Inspect the private checkpoint and owner runtime logs.",
  assistant_protocol_parse_error:
    "The child response did not satisfy the assistant protocol. Inspect the private checkpoint.",
  assistant_protocol_incomplete:
    "The child response ended before the assistant protocol settled. Inspect the private checkpoint.",
  startup_timed_out:
    "The child runtime did not start before its bounded deadline. Inspect owner runtime diagnostics.",
  transport_error:
    "The child transport failed. Inspect the private checkpoint and owner runtime diagnostics.",
  effect_receipt_write_failed:
    "The execution owner could not durably record its effect receipt. Do not retry mechanically.",
});

/**
 * Public loop diagnostics are a closed taxonomy. `stderr` and assistant output are arbitrary
 * private evidence and must never influence rendered tool text, even through redaction.
 */
export function summarizeLoopPhaseFailure(
  phase: Pick<PhaseResult, "status" | "failureKind" | "stderr">,
): string | undefined {
  if (phase.status === "done" || !phase.failureKind) return undefined;
  return PUBLIC_LOOP_FAILURE_SUMMARIES[phase.failureKind];
}

export function compactLoopResult(result: LoopResult): CompactLoopResult {
  return {
    plugin: result.plugin,
    sessionId: result.sessionId,
    objective: result.objective,
    resumed: result.resumed,
    ...(result.resumedPhase ? { resumedPhase: result.resumedPhase } : {}),
    success: result.success,
    ...(result.retryable ? { retryable: true } : {}),
    elapsed: result.elapsed,
    phases: result.phases.map((phase) => ({
      phase: phase.phase,
      status: phase.status,
      exitCode: phase.exitCode,
      elapsed: phase.elapsed,
      failureKind: phase.failureKind,
      effectDisposition: phase.effectDisposition,
      failureSummary: summarizeLoopPhaseFailure(phase),
      artifactPaths: phase.artifacts.map((artifact) => artifact.content),
    })),
    artifactPaths: result.artifacts.map((artifact) => artifact.content),
  };
}

export function projectLoopGroupTerminalObservation(
  result: Pick<LoopResult, "sessionId" | "phases" | "success" | "retryable" | "elapsed">,
  cwd: string,
  loop: string,
  loopTimedOut = false,
): AscExecutionObservation | undefined {
  if (result.retryable) return undefined;
  const finalPhase = result.phases.at(-1);
  return projectAscExecutionGroupTerminal(
    {
      producer: "loop_execute",
      cwd,
      group: {
        id: result.sessionId,
        kind: "loop",
        label: `${loop.toUpperCase()} loop`,
      },
    },
    {
      ok: result.success,
      status: result.success
        ? "done"
        : loopTimedOut
          ? "timed_out"
          : (finalPhase?.status ?? "error"),
      failureKind: finalPhase?.failureKind,
      effectDisposition: finalPhase?.effectDisposition,
      elapsedMs: result.elapsed,
    },
  );
}

export function formatCompactPhaseResult(phase: CompactPhaseResult): string {
  const statusLine = `- ${phase.phase}: ${phase.status === "done" ? "✓" : "✗"} ${phase.status}${phase.failureKind ? ` (${phase.failureKind})` : ""} (${Math.round(phase.elapsed / 1000)}s)`;
  return phase.failureSummary ? `${statusLine}\n  - cause: ${phase.failureSummary}` : statusLine;
}
