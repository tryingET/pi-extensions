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

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { isKesMaterializationError, KES_MATERIALIZATION_FAILURE_KIND } from "../kes/index.ts";
import { AGENT_PROFILES } from "../runtime/agent-profiles.ts";
import type { AgentResolution } from "../runtime/agent-routing.ts";
import { resolveAkPath, runAkCommandAsync } from "../runtime/ak.ts";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import { getCognitiveToolByName } from "../runtime/cognitive-tools.ts";
import { D2ETransferError, executeD2ETransferWorkflow } from "../runtime/d2e-transfer-workflow.ts";
import {
  type EvidenceEntry,
  type EvidenceWriteResult,
  finalizeExecutionEffects,
  recordEvidence,
} from "../runtime/evidence.ts";
import {
  type ExecutionLike,
  type ExecutionStatus,
  getExecutionStatus,
} from "../runtime/execution-status.ts";
import {
  createOrchestratorSubagentExecutor,
  isVerifiedDispatchEffectReceipt,
  toExecutionLike,
  type VerifiedDispatchEffectReceipt,
} from "../runtime/subagent.ts";
import type { TeamScopedContext } from "../runtime/team-state.ts";
import { createWorkflowExecutor } from "../runtime/workflow-execution.ts";
import { LoopKesWriter, resolveLoopKesPackageRoot } from "./kes.ts";
import {
  captureLoopArtifactHashes,
  type LoopPhaseAttemptCheckpoint,
  LoopResumeError,
  type LoopRunCheckpoint,
  LoopRunCheckpointStore,
  validateResumeCheckpoint,
} from "./run-checkpoint.ts";
import { captureLoopStateFingerprint } from "./run-state-fingerprint.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
const DEFAULT_LOOP_TIMEOUT_MS = parsePositiveMilliseconds(
  process.env.PI_ORCH_LOOP_TIMEOUT_MS,
  30 * 60 * 1000,
);

// ============================================================================
// TYPES
// ============================================================================

export interface LoopPlugin {
  name: string;
  phases: string[];
  description: string;
  cognitiveTools: Record<string, string[]>;
  agents: Record<string, string>;
  continueOnFailure?: boolean;
  onEnter?(phase: string, context: LoopContext): Promise<void>;
  onExit?(phase: string, context: LoopContext): Promise<Artifact[]>;
  validate?(from: string, to: string, context: LoopContext): boolean;
}

export interface LoopContext {
  sessionId: string;
  pluginName: string;
  objective: string;
  currentPhase: string;
  history: PhaseResult[];
  artifacts: Artifact[];
  cwd: string;
}

export interface PhaseResult {
  phase: string;
  attemptId?: string;
  output: string;
  exitCode: number;
  status: ExecutionStatus;
  failureKind?: string;
  elapsed: number;
  artifacts: Artifact[];
  timestamp: Date;
}

export interface Artifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface LoopResult {
  plugin: string;
  sessionId: string;
  objective: string;
  resumed: boolean;
  resumedPhase?: string;
  phases: PhaseResult[];
  artifacts: Artifact[];
  success: boolean;
  elapsed: number;
}

export interface CompactPhaseResult {
  phase: string;
  status: ExecutionStatus;
  exitCode: number;
  elapsed: number;
  failureKind?: string;
  artifactPaths: string[];
}

export interface CompactLoopResult {
  plugin: string;
  sessionId: string;
  objective: string;
  resumed: boolean;
  resumedPhase?: string;
  phases: CompactPhaseResult[];
  artifactPaths: string[];
  success: boolean;
  elapsed: number;
}

export type LoopExecutionUpdate =
  | {
      event: "phase_start";
      plugin: string;
      sessionId: string;
      phase: string;
      phaseIndex: number;
      phaseCount: number;
      agent: string;
      primaryTool: string;
    }
  | {
      event: "phase_update";
      plugin: string;
      sessionId: string;
      phase: string;
      update: unknown;
    }
  | {
      event: "phase_complete";
      plugin: string;
      sessionId: string;
      phase: string;
      status: ExecutionStatus;
      elapsed: number;
      failureKind?: string;
    };

export interface LoopExecutionOptions {
  continueAfterFailure?: boolean;
  phaseTimeoutSeconds?: number;
  onUpdate?: (update: LoopExecutionUpdate) => void;
  resumeRunId?: string;
  expectedFailedPhase?: string;
  recoveryMode?: "validate_then_retry";
}

export type LoopDispatchFn = (params: {
  agent: string;
  cognitiveTool: string;
  context: string;
  effectCorrelationId: string;
  timeoutSeconds?: number;
  onUpdate?: (update: unknown) => void;
}) => Promise<
  ExecutionLike & {
    output: string;
    elapsed: number;
    failureKind?: string;
    effectReceipt?: VerifiedDispatchEffectReceipt;
  }
>;

// ============================================================================
// BUILT-IN PLUGINS
// ============================================================================

export const OODA_PLUGIN: LoopPlugin = {
  name: "ooda",
  phases: ["observe", "orient", "decide", "act"],
  description: "OODA Loop — Observe, Orient, Decide, Act. Military-grade decision cycle.",
  cognitiveTools: {
    observe: ["telescopic", "dependency-cartography"],
    orient: ["inversion", "audit", "evidence-matrix"],
    decide: ["nexus", "constraint-inventory"],
    act: ["controlled", "atomic-completion"],
  },
  agents: {
    observe: "scout",
    orient: "reviewer",
    decide: "researcher",
    act: "builder",
  },
};

export const STRATEGIC_PLUGIN: LoopPlugin = {
  name: "strategic",
  phases: ["mission", "intelligence", "tooling", "operations"],
  description:
    "Strategic loop — Mission, Intelligence, Tooling, Operations. Strategic execution frame.",
  cognitiveTools: {
    mission: ["first-principles", "nexus"],
    intelligence: ["telescopic", "inversion"],
    tooling: ["audit", "blast-radius"],
    operations: ["controlled", "atomic-completion"],
  },
  agents: {
    mission: "researcher",
    intelligence: "scout",
    tooling: "reviewer",
    operations: "builder",
  },
};

export const KAIZEN_PLUGIN: LoopPlugin = {
  name: "kaizen",
  phases: ["plan", "do", "check", "act"],
  description: "Kaizen (PDCA) — Plan, Do, Check, Act. Continuous improvement cycle.",
  cognitiveTools: {
    plan: ["first-principles", "nexus", "constraint-inventory"],
    do: ["controlled", "atomic-completion"],
    check: ["audit", "inversion", "mirror"],
    act: ["knowledge-crystallization", "elevate"],
  },
  agents: {
    plan: "researcher",
    do: "builder",
    check: "reviewer",
    act: "researcher",
  },
};

export const ADKAR_PLUGIN: LoopPlugin = {
  name: "adkar",
  phases: ["awareness", "desire", "knowledge", "ability", "reinforcement"],
  description: "ADKAR — Awareness, Desire, Knowledge, Ability, Reinforcement. Change management.",
  cognitiveTools: {
    awareness: ["telescopic", "dependency-cartography"],
    desire: ["nexus", "decision"],
    knowledge: ["knowledge-crystallization", "first-principles"],
    ability: ["controlled", "atomic-completion"],
    reinforcement: ["elevate", "temporal-degradation"],
  },
  agents: {
    awareness: "scout",
    desire: "researcher",
    knowledge: "researcher",
    ability: "builder",
    reinforcement: "reviewer",
  },
};

export const TRANSCENDENT_PLUGIN: LoopPlugin = {
  name: "transcendent",
  phases: [
    "diagnose",
    "first-100x",
    "second-100x",
    "debt-targeting",
    "dissolve",
    "rebuild",
    "alien-pass",
    "closure-gate",
  ],
  description:
    "Transcendent Iteration v4 — Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Alien Pass → Closure Gate",
  continueOnFailure: false,
  cognitiveTools: {
    diagnose: ["first-principles", "constraint-inventory", "inversion"],
    "first-100x": ["nexus", "simplification", "telescopic"],
    "second-100x": ["audit", "inversion", "telescopic"],
    "debt-targeting": ["audit", "constraint-inventory", "inversion"],
    dissolve: ["first-principles", "scaffold"],
    rebuild: ["first-principles", "scaffold", "recursion-engine"],
    "alien-pass": ["elevate", "telescopic", "nexus"],
    "closure-gate": ["knowledge-crystallization", "audit", "elevate"],
  },
  agents: {
    diagnose: "scout",
    "first-100x": "builder",
    "second-100x": "reviewer",
    "debt-targeting": "reviewer",
    dissolve: "researcher",
    rebuild: "builder",
    "alien-pass": "builder",
    "closure-gate": "researcher",
  },
};

export const BUILT_IN_PLUGINS: Record<string, LoopPlugin> = {
  ooda: OODA_PLUGIN,
  strategic: STRATEGIC_PLUGIN,
  kaizen: KAIZEN_PLUGIN,
  adkar: ADKAR_PLUGIN,
  transcendent: TRANSCENDENT_PLUGIN,
};

// ============================================================================
// AGENT-KERNEL CLI WRAPPER
// ============================================================================

export class AgentKernel {
  private akPath: string;
  private societyDb?: string;
  private cwd?: string;

  constructor(
    akPath: string = resolveAkPath({ cwd: process.cwd() }),
    societyDb?: string,
    cwd?: string,
  ) {
    this.akPath = akPath;
    this.societyDb = societyDb;
    this.cwd = cwd;
  }

  async taskReady(
    signal?: AbortSignal,
  ): Promise<Array<{ id: number; title: string; repo: string }>> {
    const output = await this.run(["task", "ready", "--format", "json"], signal);
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async taskClaim(
    taskId: number,
    agent: string,
    lease: number = 3600,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "claim", String(taskId), "--agent", agent, "--lease", String(lease)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  async taskComplete(
    taskId: number,
    result: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "complete", String(taskId), "--result", JSON.stringify(result)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult> {
    return recordEvidence(params, signal, {
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      cwd: this.cwd,
    });
  }

  private async run(args: string[], signal?: AbortSignal): Promise<string> {
    const result = await runAkCommandAsync({
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      args,
      cwd: this.cwd,
      signal,
    });

    if (!result.ok) {
      throw new Error(result.stderr || `ak exited with error`);
    }

    return result.stdout;
  }
}

// ============================================================================
// LOOP EXECUTOR
// ============================================================================

export interface LoopEvidenceRecorder {
  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult>;
}

export interface LoopExecutorOptions {
  akPath?: string;
  packageRoot?: string;
  allowUnverifiedKesRoot?: boolean;
  ak?: LoopEvidenceRecorder;
  checkpointStore?: LoopRunCheckpointStore;
  captureStateFingerprint?: (cwd: string) => string;
  verifyEffectReceipt?: (receipt: VerifiedDispatchEffectReceipt | undefined) => boolean;
}

export class LoopExecutor {
  private plugin: LoopPlugin;
  private kes: LoopKesWriter;
  private ak: LoopEvidenceRecorder;
  private cwd: string;
  private checkpointStore: LoopRunCheckpointStore;
  private captureStateFingerprint: (cwd: string) => string;
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
      resumedPhase = validateResumeCheckpoint({
        checkpoint,
        plugin: this.plugin.name,
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
      context.artifacts.push(
        ...this.kes.writeStart({
          plugin: this.plugin.name,
          sessionId,
          objective,
          phases: this.plugin.phases,
        }),
      );
      checkpoint = this.checkpointStore.create({
        runId: sessionId,
        plugin: this.plugin.name,
        phases: this.plugin.phases,
        objective,
        cwd: this.cwd,
        artifactHashes: this.captureKesArtifactHashes(context.artifacts),
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
        checkpoint.attempts.push(toCheckpointAttempt(validationFailure, "confirmed_no_effects"));
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
      const pendingAttempt: LoopPhaseAttemptCheckpoint = {
        attemptId,
        phase,
        status: "error",
        effectDisposition: "effect_indeterminate",
        output: "Phase attempt began but has no conclusive execution receipt.",
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

      // Get cognitive tools and agent for this phase
      const tools = this.plugin.cognitiveTools[phase] || [];
      const agent = this.plugin.agents[phase] || "scout";
      const primaryTool = tools[0] || "first-principles";

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
      const rawResult = await dispatchFn({
        agent,
        cognitiveTool: primaryTool,
        context: phaseContext,
        effectCorrelationId: attemptId,
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

      if (ownerReceipt?.disposition === "confirmed_no_effects") {
        const phaseResult: PhaseResult = {
          phase,
          attemptId,
          output: result.output,
          exitCode: result.exitCode,
          status: getExecutionStatus(result),
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
          ownerReceipt,
        );
        checkpoint.status = "failed";
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
        exitCode: result.exitCode,
        status: executionOutcome.status,
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

      const kesArtifacts = this.kes.writePhase({
        plugin: this.plugin.name,
        phase,
        sessionId,
        objective,
        agent,
        primaryTool,
        output: result.output,
        status: executionOutcome.status,
        exitCode: result.exitCode,
        elapsed: result.elapsed,
        failureKind: phaseResult.failureKind,
        evidence: executionOutcome.evidence,
        hookArtifacts: phaseResult.artifacts,
        timestamp: phaseResult.timestamp,
      });
      phaseResult.artifacts = [...phaseResult.artifacts, ...kesArtifacts];
      context.history.push(phaseResult);
      context.artifacts.push(...phaseResult.artifacts);
      const checkpointAttemptIndex = checkpoint.attempts.findIndex(
        (attempt) => attempt.attemptId === attemptId,
      );
      checkpoint.attempts[checkpointAttemptIndex] = toCheckpointAttempt(
        phaseResult,
        effectDisposition,
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
    const latestAttempt = checkpoint.attempts.at(-1);
    const retryableConfirmedNoEffects =
      latestAttempt?.effectDisposition === "confirmed_no_effects" &&
      latestAttempt.attemptId === context.history.at(-1)?.attemptId;
    if (!retryableConfirmedNoEffects) {
      context.artifacts.push(
        ...this.kes.writeComplete({
          plugin: this.plugin.name,
          sessionId,
          objective,
          success,
          elapsed,
          phases: context.history.map((phase) => ({
            phase: phase.phase,
            status: phase.status,
            elapsed: phase.elapsed,
            failureKind: phase.failureKind,
          })),
          emittedArtifacts: context.artifacts,
        }),
      );
    }
    checkpoint.status = success
      ? "done"
      : context.history.at(-1)?.status === "aborted"
        ? "aborted"
        : "failed";
    checkpoint.artifactHashes = {
      ...checkpoint.artifactHashes,
      ...this.captureKesArtifactHashes(context.artifacts),
    };
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
      success,
      elapsed,
    };
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
    if (this.plugin.name !== "transcendent") {
      return "Use the loop's standard phase semantics and produce bounded, evidence-bearing output.";
    }

    const protocols: Record<string, string> = {
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

    return protocols[phase] || "Use the transcendent loop semantics for this phase.";
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
  ownerEffectReceipt?: LoopPhaseAttemptCheckpoint["ownerEffectReceipt"],
): LoopPhaseAttemptCheckpoint {
  return {
    attemptId: result.attemptId || randomUUID(),
    phase: result.phase,
    status: result.status,
    effectDisposition,
    ...(ownerEffectReceipt ? { ownerEffectReceipt } : {}),
    output: result.output,
    exitCode: result.exitCode,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    elapsed: result.elapsed,
    artifactPaths: result.artifacts
      .filter((artifact) => artifact.type.startsWith("kes_"))
      .map((artifact) => artifact.content),
    timestamp: result.timestamp.toISOString(),
  };
}

function phaseResultFromCheckpoint(attempt: LoopPhaseAttemptCheckpoint): PhaseResult {
  return {
    phase: attempt.phase,
    attemptId: attempt.attemptId,
    output: attempt.output,
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

function compactLoopResult(result: LoopResult): CompactLoopResult {
  return {
    plugin: result.plugin,
    sessionId: result.sessionId,
    objective: result.objective,
    resumed: result.resumed,
    ...(result.resumedPhase ? { resumedPhase: result.resumedPhase } : {}),
    success: result.success,
    elapsed: result.elapsed,
    phases: result.phases.map((phase) => ({
      phase: phase.phase,
      status: phase.status,
      exitCode: phase.exitCode,
      elapsed: phase.elapsed,
      failureKind: phase.failureKind,
      artifactPaths: phase.artifacts.map((artifact) => artifact.content),
    })),
    artifactPaths: result.artifacts.map((artifact) => artifact.content),
  };
}

function createLinkedTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let loopTimedOut = false;

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          loopTimedOut = true;
          controller.abort(new Error(`loop timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : undefined;

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    timedOut: () => loopTimedOut,
  };
}

function parsePositiveMilliseconds(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePositiveSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

type LoopToolContext = ExtensionContext & TeamScopedContext;

type LoopToolUpdateCallback = AgentToolUpdateCallback<unknown>;

interface VaultDispatchPostureBinding {
  execution_surface?: string;
  execution_args?: Record<string, unknown>;
}

interface VaultDispatchPostureResult {
  posture: string;
  template_name: string;
  binding?: VaultDispatchPostureBinding | null;
  reason?: string;
}

interface VaultDispatchRuntimeResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: VaultDispatchPostureResult[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}

interface VaultDispatchRuntimeModule {
  createVaultDispatchRuntime: () => {
    checkTemplates: (
      templateNames: string[],
      ctx?: { cwd?: string; currentCompany?: string },
    ) => Promise<VaultDispatchRuntimeResult>;
  };
}

const WORKFLOW_TEMPLATE_OWNER_ROUTES: Record<
  string,
  { owner: string; tool: string; purpose: string; example: (objective: string) => string }
> = {
  "layer12-040-direction-to-execution-ak-native": {
    owner: "Agent Kernel direction-controller through Pi readback",
    tool: "vault_execute_template(transfer_mode=proposal|applied)",
    purpose:
      "read back an exact AK packet/task/decision authorization lineage before any applied workflow handoff",
    example: (objective) =>
      `vault_execute_template({ template_name: "layer12-040-direction-to-execution-ak-native", objective: ${JSON.stringify(objective)}, transfer_mode: "proposal", repo: cwd, packet_key: "<packet-key>", task_id: 1, decision_id: 1 })`,
  },
  "pi-autoresearch-setup": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_status(action=setup)",
    purpose: "request the governed setup packet through the package-owned decision runner",
    example: (objective) =>
      `autoresearch_runtime_status({ action: "setup", cwd, optimizationObjective: ${JSON.stringify(objective)} })`,
  },
  "pi-autoresearch-next-hypothesis": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_run(..., decisionGoal=...) or autoresearch_runtime_loop(..., decisionGoal=...)",
    purpose:
      "request the governed post-run next-hypothesis decision from a concrete runtime segment",
    example: (objective) =>
      `autoresearch_runtime_run({ cwd, description: "<bounded run>", decisionGoal: ${JSON.stringify(objective)} })`,
  },
  "pi-autoresearch-finalize": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_status(action=finalize) or autoresearch_runtime_finalize",
    purpose: "request the governed finalization packet through the package-owned finalization seam",
    example: () =>
      'autoresearch_runtime_status({ action: "finalize", cwd, keptRuns: ["<kept-run>"], campaignContext: ["<context>"] })',
  },
};

function formatWorkflowGateFailure(templateName: string, objective: string): string {
  const ownerRoute = WORKFLOW_TEMPLATE_OWNER_ROUTES[templateName];
  const lines = [
    `Vault template ${templateName} is workflow-grade but has no executable binding in vault_execute_template. Failing closed.`,
    "",
    "Process invariant:",
    "discovery/design -> architecture/UX/AX -> implement -> execute; if execution binding is missing or fails, loop back to discovery/design instead of manually bypassing the gate -> verify -> commit.",
  ];

  if (ownerRoute) {
    lines.push(
      "",
      "Owner-specific lawful route:",
      `- owner: ${ownerRoute.owner}`,
      `- tool: ${ownerRoute.tool}`,
      `- purpose: ${ownerRoute.purpose}`,
      `- example: ${ownerRoute.example(objective)}`,
      "",
      "Do not continue by interpreting the retrieved template as inert text; use the owner route or design a missing execution binding first.",
    );
  } else {
    lines.push(
      "",
      "No owner-specific route is registered for this workflow template.",
      "Stop and design the execution binding or choose a lawful owner surface before continuing.",
    );
  }

  return lines.join("\n");
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

export function registerLoopTools(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
  vaultDir: string = process.env.VAULT_DIR ||
    path.join(os.homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db"),
  resolveAgent?: (agent: string, ctx: TeamScopedContext & { cwd: string }) => AgentResolution,
): void {
  const subagentExecutor = createOrchestratorSubagentExecutor({
    sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "loops"),
  });

  const executeLoopToolRequest = async (
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: LoopToolUpdateCallback | undefined,
    ctx: LoopToolContext,
  ): Promise<AgentToolResult<unknown>> => {
    const {
      loop,
      objective,
      continue_after_failure,
      loop_timeout_seconds,
      phase_timeout_seconds,
      resume_run_id,
      expected_failed_phase,
      recovery_mode,
    } = params as {
      loop: string;
      objective: string;
      continue_after_failure?: boolean;
      loop_timeout_seconds?: number;
      phase_timeout_seconds?: number;
      resume_run_id?: string;
      expected_failed_phase?: string;
      recovery_mode?: "validate_then_retry";
    };

    if (loop === "mito") {
      return {
        content: [
          {
            type: "text",
            text: "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          },
        ],
        details: { ok: false, renamed_to: "strategic" },
      };
    }

    const plugin = plugins[loop];
    if (!plugin) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown loop: ${loop}. Available: ${Object.keys(plugins).join(", ")}`,
          },
        ],
        details: { ok: false },
      };
    }

    if (onUpdate) {
      onUpdate({
        content: [{ type: "text", text: `Starting ${loop.toUpperCase()} loop...` }],
        details: { loop, objective, status: "starting" },
      });
    }

    const resolvedAgents = new Map<string, string>();
    if (resolveAgent) {
      const incompatiblePhases = plugin.phases.flatMap((phase) => {
        const requestedAgent = plugin.agents[phase] || "scout";
        const resolution = resolveAgent(requestedAgent, ctx);
        if (!resolution.ok) {
          return [
            {
              phase,
              agent: requestedAgent,
              error: resolution.error,
            },
          ];
        }

        resolvedAgents.set(requestedAgent, resolution.agent);
        return [];
      });

      if (incompatiblePhases.length > 0) {
        const mismatchReport = incompatiblePhases
          .map((entry) => `- ${entry.phase}: ${entry.agent} — ${entry.error}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Loop '${loop}' is incompatible with the active team:\n${mismatchReport}`,
            },
          ],
          details: { ok: false, error: "loop-agent-team-mismatch", incompatiblePhases },
        };
      }
    }

    const executor = new LoopExecutor(plugin, ctx.cwd, vaultDir);
    const loopTimeoutMs =
      (normalizePositiveSeconds(loop_timeout_seconds) ?? DEFAULT_LOOP_TIMEOUT_MS / 1000) * 1000;
    const effectiveSignal = createLinkedTimeoutSignal(signal, loopTimeoutMs);

    // Create dispatch function using shared agent profiles + vault-loaded cognitive tools.
    const dispatch = async (p: {
      agent: string;
      cognitiveTool: string;
      context: string;
      effectCorrelationId: string;
      timeoutSeconds?: number;
      onUpdate?: (update: unknown) => void;
    }) => {
      let effectiveAgent = resolvedAgents.get(p.agent) || p.agent;
      if (resolveAgent && !resolvedAgents.has(p.agent)) {
        const resolution = resolveAgent(p.agent, ctx);
        if (!resolution.ok) {
          return {
            output: `Agent/team resolution failed for '${p.agent}': ${resolution.error}`,
            exitCode: 1,
            elapsed: 0,
          };
        }
        effectiveAgent = resolution.agent;
        resolvedAgents.set(p.agent, effectiveAgent);
      }

      const agentProfile = AGENT_PROFILES[effectiveAgent] || AGENT_PROFILES.scout;
      const toolResult = await getCognitiveToolByName(
        p.cognitiveTool,
        {
          cwd: ctx.cwd,
        },
        effectiveSignal.signal,
      );
      if (isBoundaryFailure(toolResult)) {
        return {
          output: `Failed to load cognitive tool '${p.cognitiveTool}': ${toolResult.error}`,
          exitCode: 1,
          elapsed: 0,
        };
      }

      if (!toolResult.value) {
        return {
          output: `Cognitive tool not found: ${p.cognitiveTool}`,
          exitCode: 1,
          elapsed: 0,
        };
      }

      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "openrouter/google/gemini-2.5-flash-preview";
      const runtimeResult = await subagentExecutor.execute({
        agentProfile,
        cognitiveToolName: toolResult.value.name,
        cognitiveToolContent: toolResult.value.content,
        objective: p.context,
        model,
        effectCorrelationId: p.effectCorrelationId,
        cwd: ctx.cwd,
        extraSections: [
          `## LOOP EXECUTION CONTEXT\n- Agent profile: ${agentProfile.name}\n- Cognitive tool: ${toolResult.value.name}`,
        ],
        sessionName: `${agentProfile.name}-${toolResult.value.name}`,
        timeoutSeconds: p.timeoutSeconds,
        onUpdate: p.onUpdate as Parameters<typeof subagentExecutor.execute>[0]["onUpdate"],
        signal: effectiveSignal.signal,
      });

      return toExecutionLike(runtimeResult, subagentExecutor.state.sessionsDir);
    };

    try {
      const result = await executor.execute(objective, dispatch, effectiveSignal.signal, {
        continueAfterFailure: continue_after_failure,
        phaseTimeoutSeconds: normalizePositiveSeconds(phase_timeout_seconds),
        resumeRunId: resume_run_id,
        expectedFailedPhase: expected_failed_phase,
        recoveryMode: recovery_mode,
        onUpdate: (update) =>
          onUpdate?.({
            content: [
              {
                type: "text",
                text:
                  update.event === "phase_start"
                    ? `Starting ${loop}.${update.phase} (${update.phaseIndex}/${update.phaseCount}) with ${update.agent}/${update.primaryTool}`
                    : update.event === "phase_complete"
                      ? `Finished ${loop}.${update.phase}: ${update.status}`
                      : `Progress ${loop}.${update.phase}`,
              },
            ],
            details: { loop, objective, status: update.event, update },
          }),
      });
      const compactResult = compactLoopResult(result);
      const loopTimedOut = effectiveSignal.timedOut();

      const summary = `# ${loop.toUpperCase()} Loop Complete

**Run:** ${result.sessionId}${result.resumed ? ` (resumed at ${result.resumedPhase})` : ""}
**Objective:** ${objective}
**Status:** ${result.success ? "✓ Success" : "✗ Completed with failures"}
**Elapsed:** ${Math.round(result.elapsed / 1000)}s
${loopTimedOut ? "**Loop timeout:** yes\n" : ""}
## Phases
${compactResult.phases.map((p) => `- ${p.phase}: ${p.status === "done" ? "✓" : "✗"} ${p.status}${p.failureKind ? ` (${p.failureKind})` : ""} (${Math.round(p.elapsed / 1000)}s)`).join("\n")}

## Artifacts
${compactResult.artifactPaths.map((artifactPath) => `- ${artifactPath}`).join("\n") || "None"}

## Package-owned KES roots
- Raw capture: \`diary/\`
- Candidate-only learning staging: \`docs/learnings/\` (when emitted)
`;

      return {
        content: [{ type: "text", text: summary }],
        details: { ok: result.success, result: compactResult, loopTimedOut },
      };
    } catch (err) {
      if (err instanceof LoopResumeError) {
        return {
          content: [{ type: "text", text: `Loop resume failed closed: ${err.message}` }],
          details: {
            ok: false,
            error: "loop-resume-failed",
            failureKind: err.failureKind,
            resumeRunId: resume_run_id,
            expectedFailedPhase: expected_failed_phase,
          },
        };
      }
      if (isKesMaterializationError(err)) {
        return {
          content: [
            {
              type: "text",
              text: "Loop execution failed before package-owned KES artifacts could be materialized because the configured KES root is invalid or not writable. Check PI_ORCH_KES_ROOT or package write permissions.",
            },
          ],
          details: {
            ok: false,
            error: "loop-kes-root-invalid",
            failureKind: KES_MATERIALIZATION_FAILURE_KIND,
            operation: err.operation,
            kesRootSource: process.env.PI_ORCH_KES_ROOT ? "env" : "package-default",
          },
        };
      }

      return {
        content: [{ type: "text", text: `Loop execution failed: ${err}` }],
        details: { ok: false, loopTimedOut: effectiveSignal.timedOut() },
      };
    } finally {
      effectiveSignal.cleanup();
    }
  };

  registerCompatTool(pi, {
    name: "loop_execute",
    label: "Execute Loop",
    description: `Execute a structured iteration loop with cognitive tools.

Available loops:
- ooda: Observe → Orient → Decide → Act (military-grade decision cycle)
- strategic: Mission → Intelligence → Tooling → Operations (strategic execution; renamed from the old 'mito' label to avoid collision with Prof. Binner's MITO)
- kaizen: Plan → Do → Check → Act (continuous improvement)
- adkar: Awareness → Desire → Knowledge → Ability → Reinforcement (change management)
- transcendent: Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Alien Pass → Closure Gate (debt-resolving 100x improvement)

Checkpointed runs can continue under the same run lineage by supplying resume_run_id, expected_failed_phase, and recovery_mode=validate_then_retry. The runtime derives the lawful continuation phase and fails closed on objective, repository, phase-graph, state, or artifact drift. A dispatched attempt that failed, timed out, aborted, or crashed remains effect-indeterminate and cannot be retried mechanically.

Each phase injects the appropriate cognitive tool and dispatches an agent.
Results are recorded to package-owned KES roots (\`diary/\` and candidate-only \`docs/learnings/\` when applicable) plus the evidence ledger.`,
    promptSnippet:
      "Run a structured cognitive loop such as ooda, strategic, kaizen, adkar, or transcendent.",
    promptGuidelines: [
      "Use loop_execute when the user needs a multi-phase reasoning and execution pattern rather than a single step.",
      "Choose the loop that matches the decision structure instead of inventing an ad-hoc sequence.",
    ],
    parameters: Type.Object({
      loop: Type.Union(
        [
          Type.Literal("ooda"),
          Type.Literal("strategic"),
          Type.Literal("kaizen"),
          Type.Literal("adkar"),
          Type.Literal("transcendent"),
        ],
        { description: "Loop type to execute" },
      ),
      objective: Type.String({ description: "The objective to accomplish through the loop" }),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({ description: "Optional positive loop-level timeout in seconds." }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description: "Optional positive timeout in seconds for each dispatched phase.",
        }),
      ),
      resume_run_id: Type.Optional(
        Type.String({ description: "Exact owned checkpointed loop run id to continue." }),
      ),
      expected_failed_phase: Type.Optional(
        Type.String({
          description:
            "Caller assertion for the lawful continuation phase; the runtime derives and verifies it.",
        }),
      ),
      recovery_mode: Type.Optional(
        Type.Literal("validate_then_retry", {
          description:
            "Validate checkpoint lineage, current state, artifacts, and effect disposition before continuation.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return executeLoopToolRequest(params as Record<string, unknown>, signal, onUpdate, ctx);
    },
    renderCall(args, theme) {
      const a = args as { loop?: string; objective?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("loop_execute ")) +
          theme.fg("accent", a.loop || "?") +
          theme.fg("dim", " — ") +
          theme.fg("muted", (a.objective || "").slice(0, 40)),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as { ok?: boolean; result?: CompactLoopResult } | undefined;
      if (!details?.result) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.result.plugin}`) +
          theme.fg("dim", ` ${Math.round(details.result.elapsed / 1000)}s`),
        0,
        0,
      );
    },
  });

  registerCompatTool(pi, {
    name: "vault_execute_template",
    label: "Execute Vault Template",
    description: `Execute a Prompt Vault template through the orchestrator dispatch gate.

This bridge uses pi-vault-client dispatch posture metadata and refuses to treat loop/workflow templates as inert text.
Known loop bindings execute through loop_execute semantics. The three direction-to-execution workflow templates execute only through the D2E_TRANSFER_COMPLETE_V1 proposal/applied workflow gate.

Unknown templates and workflow-grade templates without an execution binding fail closed with an explicit reason.`,
    promptSnippet: "Execute a Prompt Vault template through its required orchestrator binding.",
    promptGuidelines: [
      "Use vault_execute_template when the operator asks to run/apply/execute a Prompt Vault template by name.",
      "Do not use raw vault_retrieve content as execution when this tool reports an orchestrator gate.",
      "If a workflow-grade template has no bridge binding, stop and use the owning package surface or design the missing binding before continuing.",
    ],
    parameters: Type.Object({
      template_name: Type.String({ description: "Exact Prompt Vault template name to execute" }),
      objective: Type.String({
        description: "Objective to pass to the orchestrator execution binding",
      }),
      transfer_mode: Type.Optional(
        Type.Union([Type.Literal("proposal"), Type.Literal("applied")], {
          description: "Required proposal-only or applied mode for a D2E workflow binding.",
        }),
      ),
      repo: Type.Optional(Type.String({ description: "Exact registered repo for D2E readback." })),
      packet_key: Type.Optional(Type.String({ description: "Exact AK packet key." })),
      task_id: Type.Optional(Type.Number({ description: "Exact AK execution task id." })),
      decision_id: Type.Optional(Type.Number({ description: "Exact governing AK decision id." })),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({ description: "Optional positive loop-level timeout in seconds." }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description: "Optional positive timeout in seconds for each dispatched phase.",
        }),
      ),
      resume_run_id: Type.Optional(
        Type.String({ description: "Exact owned checkpointed loop run id to continue." }),
      ),
      expected_failed_phase: Type.Optional(
        Type.String({ description: "Caller assertion for the lawful continuation phase." }),
      ),
      recovery_mode: Type.Optional(Type.Literal("validate_then_retry")),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const templateName = String((params as Record<string, unknown>).template_name || "").trim();
      const objective = String((params as Record<string, unknown>).objective || "").trim();
      if (!templateName || !objective) {
        return {
          content: [{ type: "text", text: "template_name and objective are required." }],
          details: { ok: false, error: "missing-required-params" },
        };
      }

      let dispatchModule: VaultDispatchRuntimeModule;
      try {
        dispatchModule = (await import(
          "@tryinget/pi-vault-client/dispatch-runtime"
        )) as VaultDispatchRuntimeModule;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Vault dispatch runtime is unavailable: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { ok: false, error: "vault-dispatch-runtime-unavailable" },
        };
      }

      const dispatchRuntime = dispatchModule.createVaultDispatchRuntime();
      const dispatchCheck = await dispatchRuntime.checkTemplates([templateName], { cwd: ctx.cwd });
      const blockedWorkflowPosture = dispatchCheck.results?.find(
        (result) => result.posture === "orchestrator_workflow_gate_required",
      );
      if (blockedWorkflowPosture) {
        return {
          content: [
            {
              type: "text",
              text: formatWorkflowGateFailure(templateName, objective),
            },
          ],
          details: {
            ok: false,
            error: "vault-template-workflow-owner-route-required",
            dispatchCheck,
          },
        };
      }
      if (!dispatchCheck.ok || dispatchCheck.status !== "ready") {
        return {
          content: [
            {
              type: "text",
              text: `Vault dispatch check failed for ${templateName}: ${dispatchCheck.blocking_reason || "unknown error"}`,
            },
          ],
          details: { ok: false, error: "vault-dispatch-check-failed", dispatchCheck },
        };
      }

      if (dispatchCheck.missing?.includes(templateName) || !dispatchCheck.results?.length) {
        return {
          content: [
            {
              type: "text",
              text: `No active visible Prompt Vault template found: ${templateName}`,
            },
          ],
          details: { ok: false, error: "template-not-found", dispatchCheck },
        };
      }

      const posture = dispatchCheck.results[0];
      if (
        posture.posture === "orchestrator_loop_required" &&
        posture.binding?.execution_surface === "loop_execute"
      ) {
        const loop = posture.binding.execution_args?.loop;
        if (typeof loop !== "string" || !loop.trim()) {
          return {
            content: [
              {
                type: "text",
                text: `Vault template ${templateName} requires loop_execute but its binding lacks a string loop argument.`,
              },
            ],
            details: { ok: false, error: "invalid-loop-binding", dispatchCheck },
          };
        }

        return executeLoopToolRequest(
          {
            loop,
            objective,
            continue_after_failure: (params as Record<string, unknown>).continue_after_failure,
            loop_timeout_seconds: (params as Record<string, unknown>).loop_timeout_seconds,
            phase_timeout_seconds: (params as Record<string, unknown>).phase_timeout_seconds,
            resume_run_id: (params as Record<string, unknown>).resume_run_id,
            expected_failed_phase: (params as Record<string, unknown>).expected_failed_phase,
            recovery_mode: (params as Record<string, unknown>).recovery_mode,
          },
          signal,
          onUpdate,
          ctx,
        );
      }

      if (
        posture.posture === "orchestrator_workflow_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate === "D2E_TRANSFER_COMPLETE_V1"
      ) {
        const input = params as Record<string, unknown>;
        const mode = input.transfer_mode;
        const repo = typeof input.repo === "string" && input.repo.trim() ? input.repo : ctx.cwd;
        const packetKey = typeof input.packet_key === "string" ? input.packet_key : "";
        const taskId = Number(input.task_id);
        const decisionId = Number(input.decision_id);
        try {
          const result = await executeD2ETransferWorkflow({
            request: {
              templateName,
              mode: mode as "proposal" | "applied",
              repo,
              packetKey,
              taskId,
              decisionId,
              objective,
            },
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            prepareWorkflow:
              mode === "applied"
                ? async () => {
                    const resolution = resolveAgent?.("builder", { ...ctx, cwd: repo });
                    const toolResult = await getCognitiveToolByName(
                      "controlled",
                      { cwd: repo },
                      signal,
                    );
                    if (isBoundaryFailure(toolResult) || !toolResult.value?.content.trim()) {
                      throw new D2ETransferError(
                        "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
                        "Governed cognitive tool 'controlled' is unavailable.",
                      );
                    }
                    return {
                      workflowExecutor: createWorkflowExecutor({
                        sessionsDir: path.join(
                          os.homedir(),
                          ".pi",
                          "agent",
                          "sessions",
                          "workflows",
                        ),
                        executor: subagentExecutor,
                      }),
                      workflowExecution: {
                        activeTeam: resolution?.team ?? "full",
                        model: ctx.model
                          ? `${ctx.model.provider}/${ctx.model.id}`
                          : "openrouter/google/gemini-2.5-flash-preview",
                        cwd: repo,
                        cognitiveToolContent: toolResult.value.content,
                      },
                    };
                  }
                : undefined,
            signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.receipt, null, 2) }],
            details: {
              ok: result.kind === "complete",
              status: result.kind,
              receipt: result.receipt,
              ...(result.kind === "complete" ? { workflow: result.workflow } : {}),
            },
          };
        } catch (error) {
          const code =
            error instanceof D2ETransferError ? error.code : "D2E_TRANSFER_WORKFLOW_INCOMPLETE";
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `${code}: ${message}` }],
            details: { ok: false, error: code },
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text:
              posture.posture === "missing_execution_binding_fail_closed"
                ? `Vault template ${templateName} has control_mode=loop but no execution binding. Failing closed.`
                : posture.posture === "orchestrator_workflow_gate_required"
                  ? formatWorkflowGateFailure(templateName, objective)
                  : `Vault template ${templateName} does not require an orchestrator execution binding. Use retrieval/preparation surfaces instead of vault_execute_template.`,
          },
        ],
        details: {
          ok: false,
          error: "vault-template-not-executable-through-bridge",
          dispatchCheck,
        },
      };
    },
    renderCall(args, theme) {
      const a = args as { template_name?: string; objective?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_execute_template ")) +
          theme.fg("accent", a.template_name || "?") +
          theme.fg("dim", " — ") +
          theme.fg("muted", (a.objective || "").slice(0, 40)),
        0,
        0,
      );
    },
    renderResult(result) {
      return new Text(formatVaultExecuteTemplateResultLabel(result), 0, 0);
    },
  });
}

export function formatVaultExecuteTemplateResultLabel(result: AgentToolResult<unknown>): string {
  const details = result.details as
    | { ok?: boolean; error?: string; result?: CompactLoopResult }
    | undefined;
  if (details?.result) return `${details.ok ? "✓" : "✗"} ${details.result.plugin}`;
  if (details?.ok === true) return "executed";
  if (details?.error) return details.error;
  const content = result.content[0];
  if (details?.ok === undefined && content?.type === "text" && content.text.trim()) {
    return content.text.trim();
  }
  if (details?.ok === false) return "blocked";
  return "pending";
}

export type LoopTreePhaseStatus = {
  phase: string;
  status: string;
  sessionName?: string;
  statusPath?: string;
  exitCode?: number;
  elapsed?: number;
  resultPreview?: string;
  updatedAt?: string;
  createdAt?: string;
  parentRepoRoot?: string;
};

export type LoopTreeRun = {
  sessionId: string;
  loop: string;
  objective: string;
  status: "running" | "done" | "failed" | "partial";
  currentPhase?: string;
  startedAt?: string;
  updatedAt?: string;
  phases: LoopTreePhaseStatus[];
};

export type LoopTreeSnapshot = {
  generatedAt: string;
  sessionsDir: string;
  runs: LoopTreeRun[];
};

type ParsedLoopStatusRecord = LoopTreePhaseStatus & {
  loop: string;
  loopSessionId: string;
  objective: string;
  statusPath: string;
  sessionName: string;
};

function defaultLoopSessionsDir(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions", "loops");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractLoopObjective(objective: string): string {
  const match = /(?:^|\n)## Objective\n([\s\S]*?)(?=\n## [^\n]+|$)/.exec(objective);
  return (match?.[1] || objective).trim();
}

export function parseLoopStatusRecord(
  statusPath: string,
  raw: string,
): ParsedLoopStatusRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const record = asRecord(parsed);
  if (!record) return null;

  const objective = stringField(record, "objective") || "";
  const loop = /(?:^|\n)# Loop:\s*([^\n]+)/i.exec(objective)?.[1]?.trim().toLowerCase();
  const phase = /(?:^|\n)## Phase:\s*([^\n]+)/i.exec(objective)?.[1]?.trim();
  const loopSessionId = /(?:^|\n)## Session:\s*([^\n]+)/i.exec(objective)?.[1]?.trim();
  if (!loop || !phase || !loopSessionId) return null;

  return {
    loop,
    phase,
    loopSessionId,
    objective: extractLoopObjective(objective),
    status: stringField(record, "status") || "unknown",
    sessionName: stringField(record, "sessionName") || path.basename(statusPath, ".status.json"),
    statusPath,
    exitCode: numberField(record, "exitCode"),
    elapsed: numberField(record, "elapsed"),
    resultPreview: stringField(record, "resultPreview"),
    updatedAt: stringField(record, "updatedAt"),
    createdAt: stringField(record, "createdAt"),
    parentRepoRoot: stringField(record, "parentRepoRoot"),
  };
}

function phaseOrderFor(loop: string, plugins: Record<string, LoopPlugin>): string[] {
  return plugins[loop]?.phases || [];
}

function compareIsoLike(a?: string, b?: string): number {
  return (Date.parse(a || "") || 0) - (Date.parse(b || "") || 0);
}

function timestampFromLoopSessionId(sessionId: string): string | undefined {
  const millis = /-(\d{11,})$/.exec(sessionId)?.[1];
  if (!millis) return undefined;
  const parsed = Number.parseInt(millis, 10);
  if (!Number.isFinite(parsed)) return undefined;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function firstTimestamp(records: ParsedLoopStatusRecord[]): string | undefined {
  return records
    .map((record) => record.createdAt || record.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort(compareIsoLike)[0];
}

function formatTimestamp(value?: string): string {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "";
  return `${new Date(parsed).toISOString().slice(0, 19).replace("T", " ")}Z`;
}

export function buildLoopTreeSnapshotFromStatusRecords(
  records: ParsedLoopStatusRecord[],
  sessionsDir = defaultLoopSessionsDir(),
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): LoopTreeSnapshot {
  const grouped = new Map<string, ParsedLoopStatusRecord[]>();
  for (const record of records) {
    const key = `${record.loop}:${record.loopSessionId}`;
    const group = grouped.get(key) || [];
    group.push(record);
    grouped.set(key, group);
  }

  const runs: LoopTreeRun[] = [...grouped.values()].map((group) => {
    group.sort((a, b) => compareIsoLike(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
    const first = group[0];
    const latestByPhase = new Map<string, ParsedLoopStatusRecord>();
    for (const record of group) {
      const previous = latestByPhase.get(record.phase);
      if (!previous || compareIsoLike(previous.updatedAt, record.updatedAt) <= 0) {
        latestByPhase.set(record.phase, record);
      }
    }

    const knownOrder = phaseOrderFor(first.loop, plugins);
    const discoveredPhases = group.map((record) => record.phase);
    const phasesInOrder = [
      ...knownOrder,
      ...discoveredPhases.filter((phase) => !knownOrder.includes(phase)),
    ].filter((phase, index, phases) => phases.indexOf(phase) === index);

    const phases: LoopTreePhaseStatus[] = phasesInOrder.map((phase) => {
      const record = latestByPhase.get(phase);
      if (record) {
        return {
          phase: record.phase,
          status: record.status,
          sessionName: record.sessionName,
          statusPath: record.statusPath,
          exitCode: record.exitCode,
          elapsed: record.elapsed,
          resultPreview: record.resultPreview,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt,
          parentRepoRoot: record.parentRepoRoot,
        };
      }
      return { phase, status: "pending" };
    });

    const runningPhase = phases.find((phase) => phase.status === "running");
    const completedOrStartedPhases = phases.filter((phase) => phase.status !== "pending");
    const startedAt = firstTimestamp(group) || timestampFromLoopSessionId(first.loopSessionId);
    const latestPhase = completedOrStartedPhases.at(-1);
    const failedPhase = phases.find((phase) =>
      ["error", "timeout", "aborted"].includes(phase.status),
    );
    const status = runningPhase
      ? "running"
      : failedPhase
        ? "failed"
        : phases.length > 0 && phases.every((phase) => phase.status === "done")
          ? "done"
          : "partial";

    return {
      sessionId: first.loopSessionId,
      loop: first.loop,
      objective: first.objective,
      status,
      currentPhase: runningPhase?.phase || latestPhase?.phase || phases[0]?.phase,
      startedAt,
      updatedAt: group.at(-1)?.updatedAt || group.at(-1)?.createdAt || startedAt,
      phases,
    };
  });

  runs.sort((a, b) => compareIsoLike(b.updatedAt, a.updatedAt));
  return { generatedAt: new Date().toISOString(), sessionsDir, runs };
}

export function loadLoopTreeSnapshot(
  sessionsDir = defaultLoopSessionsDir(),
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): LoopTreeSnapshot {
  const records: ParsedLoopStatusRecord[] = [];
  if (fs.existsSync(sessionsDir)) {
    for (const name of fs.readdirSync(sessionsDir)) {
      if (!name.endsWith(".status.json")) continue;
      const statusPath = path.join(sessionsDir, name);
      const parsed = parseLoopStatusRecord(statusPath, fs.readFileSync(statusPath, "utf-8"));
      if (parsed) records.push(parsed);
    }
  }
  return buildLoopTreeSnapshotFromStatusRecords(records, sessionsDir, plugins);
}

export function buildLoopExecuteInvocation(loop: string, objective: string): string {
  return `loop_execute({ loop: ${JSON.stringify(loop)}, objective: ${JSON.stringify(objective)} })`;
}

export function buildVaultExecuteTemplateInvocation(
  templateName: string,
  objective: string,
): string {
  return `vault_execute_template({ template_name: ${JSON.stringify(templateName)}, objective: ${JSON.stringify(objective)} })`;
}

export interface DispatchToolActivationResult {
  ok: boolean;
  requiredTools: string[];
  missingTools: string[];
  activatedTools: string[];
  activeTools: string[];
}

export function ensureToolsActiveForDispatch(
  pi: ExtensionAPI,
  toolNames: string[],
): DispatchToolActivationResult {
  const requiredTools = [...new Set(toolNames)];
  const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  const missingTools = requiredTools.filter((name) => !allToolNames.has(name));
  if (missingTools.length > 0) {
    return {
      ok: false,
      requiredTools,
      missingTools,
      activatedTools: [],
      activeTools: pi.getActiveTools(),
    };
  }

  const activeTools = pi.getActiveTools();
  const activeToolNames = new Set(activeTools);
  const activatedTools = requiredTools.filter((name) => !activeToolNames.has(name));
  if (activatedTools.length === 0) {
    return { ok: true, requiredTools, missingTools: [], activatedTools, activeTools };
  }

  const nextActiveTools = [...activeTools, ...activatedTools];
  pi.setActiveTools(nextActiveTools);
  return {
    ok: true,
    requiredTools,
    missingTools: [],
    activatedTools,
    activeTools: nextActiveTools,
  };
}

interface CommandToolDispatchOptions {
  commandName: string;
  invocation: string;
  requiredTools: string[];
  notifyDispatch: string;
  notifyDispatchQueued?: string;
}

async function dispatchToolInvocationFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: CommandToolDispatchOptions,
): Promise<boolean> {
  const activation = ensureToolsActiveForDispatch(pi, options.requiredTools);
  if (!activation.ok) {
    ctx.ui.notify(
      `Cannot dispatch ${options.commandName}; required tool(s) are not registered: ${activation.missingTools.join(", ")}. Install/enable the owning extension and /reload.`,
      "error",
    );
    return false;
  }

  if (activation.activatedTools.length > 0) {
    ctx.ui.notify(
      `Activated required tool(s) for ${options.commandName}: ${activation.activatedTools.join(", ")}`,
      "info",
    );
  }

  const isIdle = ctx.isIdle();
  ctx.ui.notify(
    isIdle ? options.notifyDispatch : (options.notifyDispatchQueued ?? options.notifyDispatch),
    "info",
  );
  await pi.sendUserMessage(options.invocation, isIdle ? undefined : { deliverAs: "followUp" });
  return true;
}

type SessionTextEntry = {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
};

type TextContentBlock = {
  type?: string;
  text?: string;
};

function extractSessionText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const block = part as TextContentBlock;
      return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
    })
    .join("\n")
    .trim();
}

const ABOVE_REFERENCE_PATTERN = /^(?:the\s+above|above|that|this|previous|last|last\s+output)$/i;
const TRANSCENDENT_ITERATION_PREVIEW_PATTERN = /^\s*\$\$\/transcendent-iteration(?:\s+(.*))?\s*$/i;
const MAX_INFERRED_OBJECTIVE_CHARS = 12_000;

export function parseTranscendentIterationPreviewInput(text: string): string | null {
  const match = TRANSCENDENT_ITERATION_PREVIEW_PATTERN.exec(text);
  if (!match) return null;
  return (match[1] || "").trim();
}

export function resolveTranscendentIterationObjective(
  args: string,
  entries: SessionTextEntry[],
): { ok: true; objective: string; inferred: boolean } | { ok: false; reason: string } {
  const trimmed = args.trim();
  if (trimmed && !ABOVE_REFERENCE_PATTERN.test(trimmed)) {
    return { ok: true, objective: trimmed, inferred: false };
  }

  for (const entry of [...entries].reverse()) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const text = extractSessionText(entry.message.content);
    if (!text) continue;
    const boundedText =
      text.length > MAX_INFERRED_OBJECTIVE_CHARS
        ? `${text.slice(0, MAX_INFERRED_OBJECTIVE_CHARS)}\n\n[truncated: previous assistant output exceeded ${MAX_INFERRED_OBJECTIVE_CHARS} characters]`
        : text;
    return {
      ok: true,
      inferred: true,
      objective: `Apply Transcendent Iteration v4 to the immediately preceding assistant output.\n\n${boundedText}`,
    };
  }

  return { ok: false, reason: "No previous assistant output found to use as the objective." };
}

type LoopTreeDisplayRow =
  | { kind: "run"; run: LoopTreeRun; searchText: string }
  | { kind: "phase"; run: LoopTreeRun; phase: LoopTreePhaseStatus; searchText: string };

type KeybindingsLike = {
  matches?: (data: string, action: string) => boolean;
};

function summarizeObjective(value: string, maxChars = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

function formatElapsed(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder.toString().padStart(2, "0")}s`;
}

function phaseStatusIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "running":
      return "▶";
    case "pending":
      return "○";
    case "timeout":
      return "⏱";
    case "aborted":
      return "■";
    case "error":
      return "✗";
    default:
      return "?";
  }
}

function rowSearchText(row: LoopTreeDisplayRow): string {
  return row.kind === "run"
    ? [
        row.run.loop,
        row.run.sessionId,
        row.run.status,
        row.run.currentPhase,
        row.run.startedAt,
        row.run.updatedAt,
        row.run.objective,
      ]
        .filter(Boolean)
        .join(" ")
    : [
        row.run.loop,
        row.run.sessionId,
        row.phase.phase,
        row.phase.status,
        row.phase.sessionName,
        row.phase.resultPreview,
      ]
        .filter(Boolean)
        .join(" ");
}

function flattenLoopTreeRows(snapshot: LoopTreeSnapshot): LoopTreeDisplayRow[] {
  const rows: LoopTreeDisplayRow[] = [];
  for (const run of snapshot.runs) {
    rows.push({ kind: "run", run, searchText: "" });
    for (const phase of run.phases) rows.push({ kind: "phase", run, phase, searchText: "" });
  }
  return rows.map((row) => ({ ...row, searchText: rowSearchText(row).toLowerCase() }));
}

export function renderLoopTreeSnapshotText(snapshot: LoopTreeSnapshot): string {
  const lines = [
    "# Loop Runs",
    "",
    `generated_at: ${snapshot.generatedAt}`,
    `sessions_dir: ${snapshot.sessionsDir}`,
  ];

  if (snapshot.runs.length === 0) {
    lines.push("", "No loop runs found.");
    return lines.join("\n");
  }

  for (const run of snapshot.runs) {
    const current = run.currentPhase ? ` ${run.currentPhase}` : "";
    const started = formatTimestamp(run.startedAt);
    const updated = formatTimestamp(run.updatedAt);
    lines.push("", `## ${run.loop.toUpperCase()} ${run.sessionId} — ${run.status}${current}`);
    lines.push(
      `started: ${started || "unknown"}${updated && updated !== started ? `  updated: ${updated}` : ""}`,
    );
    const objective = summarizeObjective(run.objective, 240);
    if (objective) lines.push(`objective: ${objective}`);

    for (const phase of run.phases) {
      const elapsed = formatElapsed(phase.elapsed);
      const suffix = [phase.sessionName, elapsed].filter(Boolean).join("  ");
      lines.push(
        `- ${phaseStatusIcon(phase.status)} ${phase.phase}: ${phase.status}${suffix ? `  ${suffix}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

class LoopTreeSelectorComponent implements Component {
  private readonly loadSnapshot: () => LoopTreeSnapshot;
  private readonly maxVisibleLines: number;
  private readonly keybindings: KeybindingsLike;
  private readonly done: () => void;
  private readonly requestRender: () => void;
  private snapshot: LoopTreeSnapshot;
  private rows: LoopTreeDisplayRow[];
  private selectedIndex = 0;
  private searchQuery = "";
  private loopFilter = "all";
  private expanded = false;
  private closed = false;

  constructor(
    loadSnapshot: () => LoopTreeSnapshot,
    maxVisibleLines: number,
    keybindings: KeybindingsLike,
    done: () => void,
    requestRender: () => void = () => {},
  ) {
    this.loadSnapshot = loadSnapshot;
    this.maxVisibleLines = maxVisibleLines;
    this.keybindings = keybindings;
    this.done = done;
    this.requestRender = requestRender;
    this.snapshot = this.loadSnapshot();
    this.rows = flattenLoopTreeRows(this.snapshot);
    this.selectedIndex = this.findInitialSelection();
  }

  invalidate(): void {}

  render(width: number): string[] {
    const filteredRows = this.filteredRows();
    const lines = [
      "",
      "  Loop Tree",
      "  ↑/↓: move. Enter: details. l: loop kind. r: refresh. Backspace: edit filter. Esc/q/Ctrl-C: close.",
      `  Loop kind: ${this.loopFilter}  (${this.availableLoopKinds().join(" | ") || "none"})`,
      this.searchQuery ? `  Filter: ${this.searchQuery}` : "  Filter: (type to search)",
      "",
    ];

    if (filteredRows.length === 0) {
      lines.push("  No loop runs found.");
      lines.push(`  sessions: ${this.snapshot.sessionsDir}`);
      return lines.map((line) => truncateToWidth(line, width));
    }

    const selectedRow = filteredRows[this.selectedIndex];
    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisibleLines / 2),
        filteredRows.length - this.maxVisibleLines,
      ),
    );
    const endIndex = Math.min(startIndex + this.maxVisibleLines, filteredRows.length);

    for (let index = startIndex; index < endIndex; index++) {
      const row = filteredRows[index];
      const cursor = index === this.selectedIndex ? "› " : "  ";
      lines.push(cursor + this.formatRow(row));
    }

    lines.push("");
    lines.push(
      `  (${this.selectedIndex + 1}/${filteredRows.length}) generated ${this.snapshot.generatedAt}`,
    );

    if (this.expanded && selectedRow) {
      lines.push("");
      lines.push(...this.formatDetails(selectedRow));
    }

    return lines.map((line) => truncateToWidth(line, width));
  }

  handleInput(keyData: string): void {
    if (this.closed) return;

    const filteredRows = this.filteredRows();
    let changed = true;
    if (this.isCloseKey(keyData)) {
      this.close();
      return;
    }

    if (this.keyMatches(keyData, "tui.select.up") || matchesKey(keyData, "up")) {
      this.selectedIndex = filteredRows.length
        ? (this.selectedIndex - 1 + filteredRows.length) % filteredRows.length
        : 0;
    } else if (this.keyMatches(keyData, "tui.select.down") || matchesKey(keyData, "down")) {
      this.selectedIndex = filteredRows.length ? (this.selectedIndex + 1) % filteredRows.length : 0;
    } else if (this.keyMatches(keyData, "tui.select.confirm") || matchesKey(keyData, "enter")) {
      this.expanded = !this.expanded;
    } else if (
      this.keyMatches(keyData, "tui.editor.deleteCharBackward") ||
      matchesKey(keyData, "backspace")
    ) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.selectedIndex = 0;
    } else if (keyData === "r" || keyData === "R") {
      this.refresh();
    } else if (keyData === "l" || keyData === "L") {
      this.cycleLoopFilter();
      this.selectedIndex = this.findInitialSelection();
    } else if (this.isPrintableText(keyData)) {
      this.searchQuery += keyData;
      this.selectedIndex = 0;
    } else {
      changed = false;
    }

    if (changed) this.requestRender();
  }

  private refresh(): void {
    const selected = this.filteredRows()[this.selectedIndex];
    const selectedKey = selected ? this.rowKey(selected) : undefined;
    this.snapshot = this.loadSnapshot();
    this.rows = flattenLoopTreeRows(this.snapshot);
    const refreshedRows = this.filteredRows();
    const refreshedIndex = selectedKey
      ? refreshedRows.findIndex((row) => this.rowKey(row) === selectedKey)
      : -1;
    this.selectedIndex = refreshedIndex >= 0 ? refreshedIndex : this.findInitialSelection();
  }

  private findInitialSelection(): number {
    const rows = this.filteredRows();
    const runningIndex = rows.findIndex(
      (row) => row.kind === "phase" && row.phase.status === "running",
    );
    if (runningIndex >= 0) return runningIndex;
    return rows.length > 0 ? 0 : 0;
  }

  private filteredRows(): LoopTreeDisplayRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    return this.rows.filter((row) => {
      if (this.loopFilter !== "all" && row.run.loop !== this.loopFilter) return false;
      return tokens.every((token) => row.searchText.includes(token));
    });
  }

  private availableLoopKinds(): string[] {
    return [...new Set(this.rows.map((row) => row.run.loop))].sort();
  }

  private cycleLoopFilter(): void {
    const options = ["all", ...this.availableLoopKinds()];
    const current = options.indexOf(this.loopFilter);
    this.loopFilter = options[(current + 1) % options.length] || "all";
  }

  private keyMatches(keyData: string, action: string): boolean {
    try {
      return this.keybindings.matches?.(keyData, action) === true;
    } catch {
      return false;
    }
  }

  private isCloseKey(keyData: string): boolean {
    return (
      this.keyMatches(keyData, "tui.select.cancel") ||
      matchesKey(keyData, "escape") ||
      matchesKey(keyData, "ctrl+c") ||
      matchesKey(keyData, "ctrl+d") ||
      keyData === "q" ||
      keyData === "Q"
    );
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.done();
  }

  private isPrintableText(value: string): boolean {
    if (!value) return false;
    return [...value].every((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f);
    });
  }

  private rowKey(row: LoopTreeDisplayRow): string {
    return row.kind === "run"
      ? `run:${row.run.loop}:${row.run.sessionId}`
      : `phase:${row.run.loop}:${row.run.sessionId}:${row.phase.phase}`;
  }

  private formatRow(row: LoopTreeDisplayRow): string {
    if (row.kind === "run") {
      const current = row.run.currentPhase ? ` ${row.run.currentPhase}` : "";
      const started = formatTimestamp(row.run.startedAt) || "unknown date";
      return `${row.run.loop.toUpperCase()} ${started}  ${row.run.sessionId}  ${row.run.status}${current}`;
    }

    const phaseIndex = row.run.phases.findIndex((phase) => phase.phase === row.phase.phase);
    const isLast = phaseIndex === row.run.phases.length - 1;
    const connector = isLast ? "└─" : "├─";
    const elapsed = formatElapsed(row.phase.elapsed);
    const suffix = [row.phase.sessionName, elapsed].filter(Boolean).join("  ");
    return `  ${connector} ${phaseStatusIcon(row.phase.status)} ${row.phase.phase.padEnd(14)} ${row.phase.status}${suffix ? `  ${suffix}` : ""}`;
  }

  private formatDetails(row: LoopTreeDisplayRow): string[] {
    if (row.kind === "run") {
      return [
        `  run: ${row.run.loop}/${row.run.sessionId}`,
        `  status: ${row.run.status}`,
        `  current: ${row.run.currentPhase || "(none)"}`,
        `  started: ${formatTimestamp(row.run.startedAt) || "unknown"}`,
        `  updated: ${formatTimestamp(row.run.updatedAt) || "unknown"}`,
        `  objective: ${summarizeObjective(row.run.objective, 240)}`,
      ];
    }

    return [
      `  phase: ${row.phase.phase}`,
      `  status: ${row.phase.status}`,
      `  child: ${row.phase.sessionName || "(pending)"}`,
      `  elapsed: ${formatElapsed(row.phase.elapsed) || "(none)"}`,
      `  preview: ${row.phase.resultPreview || "(none)"}`,
      `  status file: ${row.phase.statusPath || "(pending)"}`,
    ];
  }
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function registerLoopCommands(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    const previewArgs = parseTranscendentIterationPreviewInput(event.text);
    if (previewArgs === null) return { action: "continue" };

    const objectiveResult = resolveTranscendentIterationObjective(
      previewArgs,
      ctx.sessionManager.getBranch() as SessionTextEntry[],
    );
    if (!objectiveResult.ok) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `${objectiveResult.reason} Usage: $$/transcendent-iteration [objective|above]`,
          "warning",
        );
      }
      return { action: "handled" };
    }

    const invocation = buildVaultExecuteTemplateInvocation(
      "transcendent-iteration",
      objectiveResult.objective,
    );
    if (ctx.hasUI) {
      ctx.ui.setEditorText(invocation);
      ctx.ui.notify(
        objectiveResult.inferred
          ? "Prepared Transcendent Iteration v4 from the previous assistant output. Review/edit, then press Enter."
          : "Prepared Transcendent Iteration v4. Review/edit, then press Enter.",
        "info",
      );
      return { action: "handled" };
    }

    return { action: "transform", text: invocation };
  });

  pi.registerCommand("loop", {
    description: "Execute a loop: /loop <type> <objective>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const parts = (args || "").trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify(
          `Usage: /loop <type> <objective>\n\nAvailable: ${Object.keys(plugins).join(", ")}`,
          "warning",
        );
        return;
      }

      const loopType = parts[0];
      const objective = parts.slice(1).join(" ");

      if (loopType === "mito") {
        ctx.ui.notify(
          "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          "error",
        );
        ctx.ui.setEditorText(buildLoopExecuteInvocation("strategic", objective));
        return;
      }

      const plugin = plugins[loopType];
      if (!plugin) {
        ctx.ui.notify(
          `Unknown loop: ${loopType}. Available: ${Object.keys(plugins).join(", ")}`,
          "error",
        );
        return;
      }

      await dispatchToolInvocationFromCommand(pi, ctx, {
        commandName: `/loop ${loopType}`,
        invocation: buildLoopExecuteInvocation(loopType, objective),
        requiredTools: ["loop_execute"],
        notifyDispatch: `Dispatching ${loopType.toUpperCase()} loop through loop_execute...`,
        notifyDispatchQueued: `Queued ${loopType.toUpperCase()} loop through loop_execute after the current turn...`,
      });
    },
  });

  pi.registerCommand("transcendent-iteration", {
    description: "Dispatch Transcendent Iteration v4 through the governed orchestrator binding",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const objectiveResult = resolveTranscendentIterationObjective(
        args || "",
        ctx.sessionManager.getBranch() as SessionTextEntry[],
      );
      if (!objectiveResult.ok) {
        ctx.ui.notify(
          `${objectiveResult.reason} Usage: /transcendent-iteration <objective>`,
          "warning",
        );
        return;
      }
      const { objective } = objectiveResult;

      await dispatchToolInvocationFromCommand(pi, ctx, {
        commandName: "/transcendent-iteration",
        invocation: buildVaultExecuteTemplateInvocation("transcendent-iteration", objective),
        requiredTools: ["vault_execute_template", "loop_execute"],
        notifyDispatch: objectiveResult.inferred
          ? "Dispatching Transcendent Iteration v4 on the previous assistant output..."
          : "Dispatching Transcendent Iteration v4 through vault_execute_template...",
        notifyDispatchQueued: objectiveResult.inferred
          ? "Queued Transcendent Iteration v4 on the previous assistant output after the current turn..."
          : "Queued Transcendent Iteration v4 through vault_execute_template after the current turn...",
      });
    },
  });

  pi.registerCommand("loop-tree", {
    description:
      "Show loop runs in a /tree-like editor-area navigator. Use /loop-runs for a non-interactive snapshot.",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const snapshot = () => loadLoopTreeSnapshot(defaultLoopSessionsDir(), plugins);
      if (["--text", "text", "snapshot"].includes((args || "").trim().toLowerCase())) {
        await ctx.ui.editor("Loop Runs", renderLoopTreeSnapshotText(snapshot()));
        return;
      }

      ctx.ui.notify(
        "Loop Tree opened. Close with Esc, q, Ctrl-C, or Ctrl-D; use /loop-runs for a safe snapshot.",
        "info",
      );
      try {
        await ctx.ui.custom<void>((tui, _theme, keybindings, done) => {
          const maxVisibleLines = Math.max(6, Math.floor(tui.terminal.rows / 2));
          return new LoopTreeSelectorComponent(
            snapshot,
            maxVisibleLines,
            keybindings as KeybindingsLike,
            () => done(undefined),
            () => tui.requestRender(),
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Loop Tree failed; opening text snapshot instead: ${message}`, "warning");
        await ctx.ui.editor("Loop Runs", renderLoopTreeSnapshotText(snapshot()));
      }
    },
  });

  pi.registerCommand("loop-runs", {
    description: "Show loop runs as a non-interactive text snapshot",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor(
        "Loop Runs",
        renderLoopTreeSnapshotText(loadLoopTreeSnapshot(defaultLoopSessionsDir(), plugins)),
      );
    },
  });

  pi.registerCommand("loop-checkpoints", {
    description:
      "Inspect seven-day checkpoint retention; use /loop-checkpoints prune to apply cleanup",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const apply = ["prune", "apply", "--apply"].includes((args || "").trim().toLowerCase());
      const result = new LoopRunCheckpointStore().pruneExpired({ dryRun: !apply });
      const lines = [
        `# Loop Checkpoint Retention`,
        ``,
        `Mode: ${apply ? "prune" : "dry-run"}`,
        `Rolling window: ${Math.round(result.retentionMs / (24 * 60 * 60 * 1000))} days`,
        `Cutoff: ${result.cutoff}`,
        `Directory entries examined: ${result.entriesExamined}`,
        `Checkpoints scanned: ${result.scanned}`,
        `Candidates: ${result.candidates.length}`,
        `Deleted: ${result.deleted.length}`,
        `Protected active: ${result.skippedActive.length}`,
        `Protected locked/stale: ${result.skippedLocked.length}`,
        `Skipped invalid: ${result.skippedInvalid.length}`,
        `Delete limit reached: ${result.limitReached ? "yes" : "no"}`,
        `Scan limit reached: ${result.scanLimitReached ? "yes" : "no"}`,
        ``,
        ...(result.candidates.length > 0
          ? ["## Expired candidates", ...result.candidates.map((runId) => `- ${runId}`)]
          : ["No expired checkpoint candidates."]),
      ];
      await ctx.ui.editor("Loop Checkpoint Retention", lines.join("\n"));
    },
  });

  pi.registerCommand("loops", {
    description: "List available loop types",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const list = Object.entries(plugins)
        .map(
          ([name, plugin]) =>
            `## ${name}\n${plugin.description}\nPhases: ${plugin.phases.join(" → ")}`,
        )
        .join("\n\n");

      await ctx.ui.editor("Available Loops", list);
    },
  });
}
