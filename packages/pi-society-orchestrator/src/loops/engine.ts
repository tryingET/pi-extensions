// ---
// summary: "Defines and executes cognitive loop plugins with agent dispatch, evidence, KES capture, checkpoints, resume gates, and loop UI commands."
// read_when:
//   - "Changing loop phase semantics, dispatch execution, checkpoint continuation, vault bindings, or loop command displays."
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
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  ensureKesRoots,
  isKesMaterializationError,
  KES_MATERIALIZATION_FAILURE_KIND,
} from "../kes/index.ts";
import { AGENT_PROFILES, type AgentDef } from "../runtime/agent-profiles.ts";
import type { AgentResolution } from "../runtime/agent-routing.ts";
import { resolveAkPath, runAkCommandAsync } from "../runtime/ak.ts";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import { getCognitiveToolByName, probeCognitiveToolSeam } from "../runtime/cognitive-tools.ts";
import {
  consumeD2EExecutionMemory,
  D2E_EXECUTION_MEMORY_OWNER,
  D2E_EXECUTION_MEMORY_TEMPLATE,
  D2EExecutionMemoryConsumerError,
} from "../runtime/d2e-execution-memory.ts";
import { inspectD2ERepository } from "../runtime/d2e-transfer-effects.ts";
import {
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  D2ETransferError,
  executeD2ETransferWorkflow,
} from "../runtime/d2e-transfer-workflow.ts";
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
import type { GovernedDeepReviewPreflightRuntime } from "../runtime/governed-deep-review-preflight.ts";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObservation,
  type AscExecutionObservationContext,
  createOrchestratorSubagentExecutor,
  isVerifiedDispatchEffectReceipt,
  projectAscExecutionGroupTerminal,
  toExecutionLike,
  type VerifiedDispatchEffectReceipt,
} from "../runtime/subagent.ts";
import { resolveSessionIdentity, type TeamScopedContext } from "../runtime/team-state.ts";
import { createWorkflowExecutor } from "../runtime/workflow-execution.ts";
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

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

function emitExecutionObservation(
  pi: ExtensionAPI,
  observation: AscExecutionObservation | undefined,
): void {
  if (!observation) return;
  try {
    pi.events.emit(ASC_EXECUTION_OBSERVATION_EVENT, observation);
  } catch {
    // A visibility listener is best-effort and must never perturb loop execution.
  }
}

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
// Whole-loop emergency deadman. Per-phase activity is visible and classified separately.
const DEFAULT_LOOP_TIMEOUT_MS = parsePositiveMilliseconds(
  process.env.PI_ORCH_LOOP_TIMEOUT_MS,
  24 * 60 * 60 * 1000,
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
  /** Required stable identity whenever executable plugin hooks are present. */
  producerHookSemantics?: string;
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
  stderr?: string;
  outputTruncated?: boolean;
  exitCode: number;
  status: ExecutionStatus;
  failureKind?: string;
  effectDisposition?: VerifiedDispatchEffectReceipt["disposition"];
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
  retryable?: boolean;
  elapsed: number;
}

export interface CompactPhaseResult {
  phase: string;
  status: ExecutionStatus;
  exitCode: number;
  elapsed: number;
  failureKind?: string;
  effectDisposition?: VerifiedDispatchEffectReceipt["disposition"];
  artifactPaths: string[];
  failureSummary?: string;
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
  retryable?: boolean;
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
  observation: AscExecutionObservationContext;
  timeoutSeconds?: number;
  onUpdate?: (update: unknown) => void;
}) => Promise<
  ExecutionLike & {
    output: string;
    stderr?: string;
    outputTruncated?: boolean;
    elapsed: number;
    failureKind?: string;
    effectReceipt?: VerifiedDispatchEffectReceipt;
    /**
     * Dispatcher-owned attestation: this attempt failed before any child
     * process was launched (agent resolution, cognitive-tool load, or another
     * pre-spawn boundary). No ASC receipt can exist because ASC was never
     * invoked; the dispatcher itself is the only possible effect owner at this
     * boundary and owns no durable effects here. Treated as
     * confirmed_no_effects for the effectful dispatch boundary; the
     * orchestrator checkpoint keeps the failure evidence as internal
     * bookkeeping (it does not claim literally nothing was ever written).
     */
    preDispatchNoEffects?: {
      failureKind: string;
      reason: string;
    };
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
interface VaultDispatchTemplate {
  id?: number;
  name: string;
  content: string;
  artifact_kind?: string;
  owner_company?: string;
  version?: number;
  control_mode: string;
  formalization_level: string;
  visibility_companies?: string[];
  controlled_vocabulary?: unknown;
  status?: string;
  export_to_pi?: boolean;
}
interface VaultClaimedExecution {
  authorizationId: string;
  disposition: string;
  sealedText: string;
  binding: VaultDispatchPostureBinding | null;
  aggregate: {
    primary: {
      templateId: number;
      templateName: string;
      templateVersion: number;
      contentSha256: string;
      governedMetadataSha256: string;
    };
  };
}
interface VaultDispatchRuntimeResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: VaultDispatchPostureResult[];
  templates?: VaultDispatchTemplate[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}
interface VaultDispatchRuntimeLike {
  checkTemplates: (
    templateNames: string[],
    ctx?: { cwd?: string; currentCompany?: string },
  ) => Promise<VaultDispatchRuntimeResult>;
}

interface VaultDispatchRuntime extends VaultDispatchRuntimeLike {
  checkTemplates(
    templateNames: string[],
    ctx?: { cwd?: string; currentCompany?: string },
  ): Promise<VaultDispatchRuntimeResult>;
  authorizePreparedExecution(request: {
    templates: VaultDispatchTemplate[];
    primaryTemplateName: string;
    finalPreparedText: string;
    compositionKind: "single";
    surface: "orchestrator_adapter";
    currentCompany: string;
    renderer: string;
    rendererVersion: string;
    wrapper: string;
    context: string;
    args: string[];
  }):
    | { disposition: "blocked"; reason: string; safeMessage: string }
    | {
        disposition: "dispatch_required" | "text_ready";
        authorizationId: string;
        binding?: VaultDispatchPostureBinding;
      };
  claimPreparedExecution(
    authorizationId: string,
  ): { ok: true; value: VaultClaimedExecution } | { ok: false; reason: string; error: string };
  settlePreparedExecution(authorizationId: string, outcome: "handed_off" | "failed"): boolean;
}
interface VaultDispatchRuntimeModule {
  createVaultDispatchRuntime: () => VaultDispatchRuntime;
}

interface VaultPromptPlaneRuntimeModule {
  createVaultPromptPlaneRuntime: (options: { dispatchRuntime: VaultDispatchRuntimeLike }) => {
    prepareSelectionV2: (
      request: { query: string; context: string },
      ctx?: { cwd?: string },
    ) => Promise<{
      ok: boolean;
      status: "text_ready" | "dispatch_required" | "ambiguous" | "blocked";
      blocking_reason?: string;
      authorization?: { authorizationId?: string; disposition?: string };
    }>;
  };
}

interface VaultDispatchGuardModule {
  createDispatchActivationPolicy: (enabled: boolean) => unknown;
  createDispatchHandoffStore: (options?: { filePath?: string }) => unknown;
  dispatchAuthorizedExecution: (options: {
    runtime: VaultDispatchRuntimeLike;
    authorizationId: string;
    intendedExecutor: "workflow_execute";
    activation: unknown;
    receiptStore: unknown;
    execute: (input: {
      handoffId: string;
      authorizationId: string;
      sealedText: string;
      binding: Readonly<{
        execution_surface: string;
        execution_args: Record<string, unknown>;
      }>;
    }) => Promise<VaultWorkflowExecutorResult>;
  }) => Promise<
    | { ok: true; handoffId: string; result: VaultWorkflowExecutorResult }
    | { ok: false; error: string; handoffId?: string }
  >;
}

export interface VaultWorkflowExecutorResult {
  accepted: boolean;
  handoffId: string;
  runId?: string;
  status?: string;
  output?: string;
  details?: Record<string, unknown>;
}

export interface VaultWorkflowExecutionRequest {
  templateName: string;
  objective: string;
  cwd: string;
  sealedText: string;
  handoffId: string;
  authorizationId: string;
  executionArgs: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  ctx: LoopToolContext;
}

export interface RegisterLoopToolsOptions {
  executeVaultWorkflow?: (
    request: VaultWorkflowExecutionRequest,
  ) => Promise<VaultWorkflowExecutorResult>;
  gatedDispatchEnabled?: boolean;
  dispatchReceiptPath?: string;
  governedDeepReviewPreflight?: GovernedDeepReviewPreflightRuntime;
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
      `vault_execute_template({ template_name: "layer12-040-direction-to-execution-ak-native", objective: ${JSON.stringify(objective)}, transfer_mode: "proposal", repo: cwd, packet_key: "<packet-key>", task_id: 1, decision_id: 1, actor: "<current-task-claimant>" })`,
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
  options: RegisterLoopToolsOptions = {},
): void {
  const subagentExecutor = createOrchestratorSubagentExecutor({
    sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "loops"),
    onObservation: (observation) => emitExecutionObservation(pi, observation),
  });
  const gatedDispatchEnabled =
    options.gatedDispatchEnabled ?? process.env.PI_VAULT_GATED_DISPATCH !== "0";

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

    // Validate the KES root before anything effectful can happen: an invalid
    // PI_ORCH_KES_ROOT must surface as loop-kes-root-invalid here, not be
    // discovered later as a mid-run failure (or masked as a retryable
    // cognitive-tool failure when the broken root is what breaks the vault
    // seam). ensureKesRoots only creates/validates directories; it emits no
    // loop effects and is safe before the pre-dispatch boundary.
    try {
      ensureKesRoots(resolveLoopKesPackageRoot());
    } catch (err) {
      if (isKesMaterializationError(err)) {
        return {
          content: [
            {
              type: "text",
              text: "Loop execution failed before dispatch because the configured KES root is invalid or not writable. Check PI_ORCH_KES_ROOT or package write permissions.",
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
      throw err;
    }

    // Fail fast when the cognitive-tool seam is currently unresolvable (for
    // example a concurrent install rebuilding a linked neighbor's compiled
    // runtime). Refusing here keeps the loop undispatched — retryable without
    // any effect question — instead of letting the first phase discover the
    // breakage mid-dispatch.
    const seamProbe = await probeCognitiveToolSeam();
    if (isBoundaryFailure(seamProbe)) {
      const message = `Loop ${loop} refused to start: the cognitive-tool seam is currently unavailable (${seamProbe.error}). Retry once installs settle.`;
      onUpdate?.({
        content: [{ type: "text", text: message }],
        details: { loop, objective, status: "pre_dispatch_seam_unavailable" },
      });
      return {
        content: [
          {
            type: "text",
            text: `${message}\nNo phase was dispatched and no effects were attempted; this is safely retryable.`,
          },
        ],
        details: { loop, objective, status: "pre_dispatch_seam_unavailable", retryable: true },
      };
    }

    const executor = new LoopExecutor(plugin, ctx.cwd, vaultDir);
    const loopTimeoutMs =
      (normalizePositiveSeconds(loop_timeout_seconds) ?? DEFAULT_LOOP_TIMEOUT_MS / 1000) * 1000;
    const effectiveSignal = createLinkedTimeoutSignal(signal, loopTimeoutMs);
    let activeObservationContext: AscExecutionObservationContext | undefined;

    // Create dispatch function using shared agent profiles + vault-loaded cognitive tools.
    const dispatch = async (p: {
      agent: string;
      cognitiveTool: string;
      context: string;
      effectCorrelationId: string;
      observation: AscExecutionObservationContext;
      timeoutSeconds?: number;
      onUpdate?: (update: unknown) => void;
    }) => {
      activeObservationContext = p.observation;
      let effectiveAgent = resolvedAgents.get(p.agent) || p.agent;
      if (resolveAgent && !resolvedAgents.has(p.agent)) {
        const resolution = resolveAgent(p.agent, ctx);
        if (!resolution.ok) {
          return {
            output: `Agent/team resolution failed for '${p.agent}': ${resolution.error}`,
            exitCode: 1,
            elapsed: 0,
            failureKind: "agent_resolution_failed",
            preDispatchNoEffects: {
              failureKind: "agent_resolution_failed",
              reason: `Agent/team resolution failed before any child launch: ${resolution.error}`,
            },
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
          failureKind: "cognitive_tool_load_failed",
          preDispatchNoEffects: {
            failureKind: "cognitive_tool_load_failed",
            reason: `Cognitive tool load failed before any child launch: ${toolResult.error}`,
          },
        };
      }

      if (!toolResult.value) {
        return {
          output: `Cognitive tool not found: ${p.cognitiveTool}`,
          exitCode: 1,
          elapsed: 0,
          failureKind: "cognitive_tool_not_found",
          preDispatchNoEffects: {
            failureKind: "cognitive_tool_not_found",
            reason: `Cognitive tool '${p.cognitiveTool}' is not visible; no child was launched.`,
          },
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
        observation: p.observation,
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

    const loopStartedAt = Date.now();

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
      emitExecutionObservation(
        pi,
        projectLoopGroupTerminalObservation(result, ctx.cwd, loop, loopTimedOut),
      );

      const summary = `# ${loop.toUpperCase()} Loop ${result.retryable ? "Paused" : "Complete"}

**Run:** ${result.sessionId}${result.resumed ? ` (resumed at ${result.resumedPhase})` : ""}
**Objective:** ${objective}
**Status:** ${result.success ? "✓ Success" : result.retryable ? "↻ Retryable after confirmed no effects" : "✗ Completed with failures"}
**Elapsed:** ${Math.round(result.elapsed / 1000)}s
${loopTimedOut ? "**Loop timeout:** yes\n" : ""}
## Phases
${compactResult.phases.map(formatCompactPhaseResult).join("\n")}

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
      if (activeObservationContext) {
        emitExecutionObservation(
          pi,
          projectAscExecutionGroupTerminal(
            { ...activeObservationContext, phase: undefined },
            {
              ok: false,
              status: effectiveSignal.timedOut() ? "timed_out" : "error",
              failureKind: effectiveSignal.timedOut()
                ? "loop_deadman_timeout"
                : "loop_execution_error",
              elapsedMs: Date.now() - loopStartedAt,
            },
          ),
        );
      }
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

Each phase injects the appropriate cognitive tool and dispatches an agent. In an interactive Ghostty session with pi-little-helpers loaded, all phases share one automatic read-only progress observer tab; ASC remains execution/effect truth and closing the observer does not cancel work. Quiet/stall visibility is separate from the long emergency deadman.
Results are recorded to package-owned KES roots (\`diary/\` and candidate-only \`docs/learnings/\` when applicable) plus the evidence ledger.`,
    promptSnippet:
      "Run a structured cognitive loop such as ooda, strategic, kaizen, adkar, or transcendent.",
    promptGuidelines: [
      "Use loop_execute when the user needs a multi-phase reasoning and execution pattern rather than a single step.",
      "Choose the loop that matches the decision structure instead of inventing an ad-hoc sequence.",
      "Do not set routine 5–10 minute wall-clock cutoffs for healthy modern-agent work; omit timeout overrides unless the operator requested an explicit shorter deadman.",
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
        Type.Number({
          description:
            "Optional absolute whole-loop deadman override in seconds (default: 86400 / 24 hours). Omit for ordinary supervised work.",
        }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute per-phase deadman override in seconds (default: 14400 / 4 hours). Omit for ordinary supervised work; observer quiet/stall state does not auto-cancel.",
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
Known loop bindings execute through loop_execute semantics. The two legacy D2E transfer templates retain the D2E_TRANSFER_COMPLETE_V1 gate. The execution-memory template uses the separate default-disabled, proposal-only D2E_EXECUTION_MEMORY_V1 consumer.

Unknown templates and workflow-grade templates without an execution binding fail closed with an explicit reason.`,
    promptSnippet: "Execute a Prompt Vault template through its required orchestrator binding.",
    promptGuidelines: [
      "Use vault_execute_template when the operator asks to run/apply/execute a Prompt Vault template by name.",
      "Do not use raw vault_retrieve content as execution when this tool reports an orchestrator gate.",
      "If a workflow-grade template has no bridge binding, stop and use the owning package surface or design the missing binding before continuing.",
      "Treat legacy D2E proposal receipts as lawful read-only success. The execution-memory consumer is separately default-disabled, consumes one coherent AK machine envelope, and can never authorize or perform applied execution.",
    ],
    parameters: Type.Object({
      template_name: Type.String({ description: "Exact Prompt Vault template name to execute" }),
      objective: Type.String({
        description:
          "For D2E, exact live task title or non-null description selector; task-native contract remains authoritative.",
      }),
      transfer_mode: Type.Optional(
        Type.Union([Type.Literal("proposal"), Type.Literal("applied")], {
          description: "Proposal-only or applied D2E caller mode; defaults to proposal.",
        }),
      ),
      repo: Type.Optional(Type.String({ description: "Exact registered repo for D2E readback." })),
      packet_key: Type.Optional(Type.String({ description: "Exact AK packet key." })),
      packet_id: Type.Optional(Type.Number({ description: "Exact selected AK packet id." })),
      packet_source: Type.Optional(
        Type.String({ description: "Immutable GitHub blob coordinate consumed by Decision 100." }),
      ),
      packet_source_sha256: Type.Optional(
        Type.String({ description: "Expected raw packet Git blob SHA-256." }),
      ),
      expected_task_ids: Type.Optional(
        Type.Array(Type.Number(), {
          description: "Sorted complete expected execution-task id set.",
        }),
      ),
      expected_dependencies: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "One sorted `<task-id>:<none|comma-separated-task-ids>` declaration per expected task.",
        }),
      ),
      authorization_block_ref: Type.Optional(
        Type.String({ description: "Optional exact negative authorization block reference." }),
      ),
      task_id: Type.Optional(Type.Number({ description: "Exact AK execution task id." })),
      decision_id: Type.Optional(Type.Number({ description: "Exact governing AK decision id." })),
      actor: Type.Optional(
        Type.String({ description: "Exact invoking actor; must own the live AK task claim." }),
      ),
      task_scope_sha256: Type.Optional(
        Type.String({
          description: "Proposal-returned exact task scope digest required to apply.",
        }),
      ),
      task_intent_sha256: Type.Optional(
        Type.String({
          description:
            "Proposal-returned canonical task title/description/done-contract/guardrails digest required to apply.",
        }),
      ),
      template_version: Type.Optional(
        Type.Number({ description: "Proposal-returned exact Prompt Vault template version." }),
      ),
      template_content_sha256: Type.Optional(
        Type.String({ description: "Proposal-returned exact Prompt Vault content digest." }),
      ),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute whole-loop deadman override in seconds (default: 86400 / 24 hours).",
        }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute per-phase deadman override in seconds (default: 14400 / 4 hours).",
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

      if (
        templateName === D2E_EXECUTION_MEMORY_TEMPLATE &&
        process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE !== "enabled"
      ) {
        return {
          content: [
            {
              type: "text",
              text: "D2E_EXECUTION_MEMORY_DISABLED: Decision 100 execution-memory consumption is disabled; no Vault or AK owner read was performed.",
            },
          ],
          details: {
            ok: false,
            error: "D2E_EXECUTION_MEMORY_DISABLED",
            effect: { disposition: "not_materialized" },
            downstream_implementation_authorization: {
              disposition: "not_authorized",
              granted: false,
              basis: "separate_downstream_owner_authorization_required",
            },
          },
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
        (result) =>
          result.posture === "orchestrator_workflow_gate_required" &&
          result.binding?.execution_surface !== "workflow_execute",
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
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate === "D2E_EXECUTION_MEMORY_V1"
      ) {
        const input = params as Record<string, unknown>;
        const template = dispatchCheck.templates?.[0];
        const contentSha256 = template
          ? createHash("sha256").update(template.content, "utf8").digest("hex")
          : "";
        const templateIdentity = {
          templateId: Number(template?.id),
          templateName: template?.name ?? "",
          artifactKind: template?.artifact_kind ?? "",
          controlMode: template?.control_mode ?? "",
          formalizationLevel: template?.formalization_level ?? "",
          ownerCompany: template?.owner_company ?? "",
          templateVersion: Number(template?.version),
          contentSha256,
        };
        try {
          if (
            !template ||
            dispatchCheck.templates?.length !== 1 ||
            templateName !== D2E_EXECUTION_MEMORY_TEMPLATE ||
            template.owner_company !== D2E_EXECUTION_MEMORY_OWNER ||
            posture.binding.execution_args?.template_artifact_kind !== "procedure" ||
            posture.binding.execution_args?.template_control_mode !== "one_shot" ||
            posture.binding.execution_args?.template_formalization_level !== "workflow" ||
            posture.binding.execution_args?.template_owner_company !== D2E_EXECUTION_MEMORY_OWNER
          ) {
            throw new D2EExecutionMemoryConsumerError(
              "D2E_EXECUTION_MEMORY_TEMPLATE_IDENTITY_MISMATCH",
              "Dispatch check did not return the exact execution-memory template identity.",
            );
          }
          const mode = input.transfer_mode === "applied" ? "applied" : "proposal";
          const repo = typeof input.repo === "string" && input.repo.trim() ? input.repo : ctx.cwd;
          const expectedTaskIds = Array.isArray(input.expected_task_ids)
            ? input.expected_task_ids.map(Number)
            : Number.isFinite(Number(input.task_id))
              ? [Number(input.task_id)]
              : [];
          const expectedDependencies = Array.isArray(input.expected_dependencies)
            ? input.expected_dependencies.map(String)
            : [];
          const result = await consumeD2EExecutionMemory({
            request: {
              mode,
              templateIdentity,
              repo,
              decisionId: Number(input.decision_id),
              packetId: Number(input.packet_id),
              packetKey: typeof input.packet_key === "string" ? input.packet_key : "",
              packetSource: typeof input.packet_source === "string" ? input.packet_source : "",
              packetSourceSha256:
                typeof input.packet_source_sha256 === "string" ? input.packet_source_sha256 : "",
              expectedTaskIds,
              expectedDependencies,
              authorizationBlockRef:
                typeof input.authorization_block_ref === "string"
                  ? input.authorization_block_ref
                  : undefined,
            },
            activation:
              process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE === "enabled" ? "enabled" : "disabled",
            akBinaryPath: process.env.PI_ORCH_D2E_AK_BIN ?? "",
            akBinarySha256: process.env.PI_ORCH_D2E_AK_SHA256 ?? "",
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.receipt, null, 2) }],
            details: {
              ok: true,
              kind: result.kind,
              status: result.receipt.status,
              receipt: result.receipt,
            },
          };
        } catch (error) {
          const code =
            error instanceof D2EExecutionMemoryConsumerError
              ? error.code
              : "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED";
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `${code}: ${message}` }],
            details: {
              ok: false,
              error: code,
              effect: { disposition: "not_materialized" },
              downstream_implementation_authorization: {
                disposition: "not_authorized",
                granted: false,
                basis: "separate_downstream_owner_authorization_required",
              },
              ...(error instanceof D2EExecutionMemoryConsumerError && error.producerError
                ? { producerError: error.producerError }
                : {}),
            },
          };
        }
      }

      if (
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate === "D2E_TRANSFER_COMPLETE_V1"
      ) {
        const input = params as Record<string, unknown>;
        const mode = input.transfer_mode === "applied" ? "applied" : "proposal";
        const repo = typeof input.repo === "string" && input.repo.trim() ? input.repo : ctx.cwd;
        const packetKey = typeof input.packet_key === "string" ? input.packet_key : "";
        const taskId = Number(input.task_id);
        const decisionId = Number(input.decision_id);
        const invokingActor = typeof input.actor === "string" ? input.actor.trim() : "";
        const invokingSessionId = resolveSessionIdentity(ctx) ?? "";
        const template = dispatchCheck.templates?.[0];
        const contentSha256 = template
          ? createHash("sha256").update(template.content, "utf8").digest("hex")
          : "";
        const templateIdentity = {
          templateId: Number(template?.id),
          templateName: template?.name ?? "",
          artifactKind: template?.artifact_kind ?? "",
          controlMode: template?.control_mode ?? "",
          formalizationLevel: template?.formalization_level ?? "",
          ownerCompany: template?.owner_company ?? "",
          templateVersion: Number(template?.version),
          contentSha256,
        };

        const inspectRepository = (baselineHead?: string) =>
          inspectD2ERepository({
            repo,
            baselineHead,
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            signal,
          });

        try {
          if (
            !template ||
            dispatchCheck.templates?.length !== 1 ||
            posture.binding.execution_args?.template_artifact_kind !== "procedure" ||
            posture.binding.execution_args?.template_control_mode !== "one_shot" ||
            posture.binding.execution_args?.template_formalization_level !== "workflow" ||
            posture.binding.execution_args?.template_owner_company !== template.owner_company ||
            template.owner_company !==
              D2E_WORKFLOW_TEMPLATE_OWNERS[
                templateName as keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS
              ]
          ) {
            throw new D2ETransferError(
              "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
              "Dispatch check did not return one exact D2E procedure/one_shot/workflow template with its per-template owner.",
            );
          }
          const result = await executeD2ETransferWorkflow({
            request: {
              templateName,
              templateIdentity,
              expectedTemplateVersion: Number(input.template_version),
              expectedTemplateContentSha256:
                typeof input.template_content_sha256 === "string"
                  ? input.template_content_sha256
                  : "",
              mode: mode as "proposal" | "applied",
              repo,
              packetKey,
              taskId,
              decisionId,
              expectedTaskScopeSha256:
                typeof input.task_scope_sha256 === "string" ? input.task_scope_sha256 : "",
              expectedTaskIntentSha256:
                typeof input.task_intent_sha256 === "string" ? input.task_intent_sha256 : "",
              objective,
              invokingActor,
              invokingSessionId,
            },
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            activation:
              process.env.PI_ORCH_D2E_TRANSFER_MODE === "enabled" ? "enabled" : "disabled",
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
            inspectRepository,
            claimPreparedTemplate: (sealedText) => {
              const authorization = dispatchRuntime.authorizePreparedExecution({
                templates: [template],
                primaryTemplateName: templateName,
                finalPreparedText: sealedText,
                compositionKind: "single",
                surface: "orchestrator_adapter",
                currentCompany: dispatchCheck.current_company ?? "",
                renderer: "pi-society-orchestrator/d2e-transfer",
                rendererVersion: "2",
                wrapper: "D2E_PREPARED_EXECUTION_V1",
                context: `${repo}|${packetKey}|${taskId}|${decisionId}|${invokingActor}|${invokingSessionId}`,
                args: [objective],
              });
              if (
                authorization.disposition !== "dispatch_required" ||
                authorization.binding?.execution_surface !== "workflow_execute" ||
                authorization.binding.execution_args?.workflow_gate !== "D2E_TRANSFER_COMPLETE_V1"
              ) {
                throw new D2ETransferError(
                  "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                  authorization.disposition === "blocked"
                    ? authorization.safeMessage
                    : "Vault authorization did not require the exact D2E workflow binding.",
                );
              }
              const claimed = dispatchRuntime.claimPreparedExecution(authorization.authorizationId);
              if (!claimed.ok) {
                throw new D2ETransferError(
                  "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                  claimed.error,
                );
              }
              const value = claimed.value;
              return {
                authorizationId: value.authorizationId,
                sealedText: value.sealedText,
                templateIdentity: {
                  templateId: value.aggregate.primary.templateId,
                  templateName: value.aggregate.primary.templateName,
                  artifactKind: template.artifact_kind ?? "",
                  controlMode: template.control_mode ?? "",
                  formalizationLevel: template.formalization_level ?? "",
                  ownerCompany: template.owner_company ?? "",
                  templateVersion: value.aggregate.primary.templateVersion,
                  contentSha256: value.aggregate.primary.contentSha256,
                  governedMetadataSha256: value.aggregate.primary.governedMetadataSha256,
                },
                settle(outcome: "handed_off" | "failed") {
                  if (!dispatchRuntime.settlePreparedExecution(value.authorizationId, outcome)) {
                    throw new D2ETransferError(
                      "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                      "Vault authorization could not be settled exactly once.",
                    );
                  }
                },
              };
            },
            signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.receipt, null, 2) }],
            details: {
              ok: true,
              kind: result.kind,
              status: result.receipt.status,
              receipt: result.receipt,
              ...(result.kind === "complete" ? { workflow: result.workflow } : {}),
            },
          };
        } catch (error) {
          const code =
            error instanceof D2ETransferError ? error.code : "D2E_TRANSFER_WORKFLOW_INCOMPLETE";
          const message = error instanceof Error ? error.message : String(error);
          const failure =
            error instanceof D2ETransferError && error.failure
              ? error.failure
              : {
                  schema: "D2E_TRANSFER_FAILURE_V1" as const,
                  status: "not_ready" as const,
                  caller_mode: mode,
                  execution_phase: "input_validation" as const,
                  required_packet: { disposition: "unknown" as const },
                  transfer_materialization_authorization: {
                    disposition: "not_authorized" as const,
                    existed_at_dispatch: false,
                  },
                  downstream_implementation_authorization: {
                    disposition: "not_authorized" as const,
                    granted: false as const,
                    basis: "separate_downstream_owner_authorization_required" as const,
                  },
                  effect: { disposition: "not_materialized" as const },
                  error: { code, message },
                };
          const { error: _failureError, ...failureState } = failure;
          return {
            content: [{ type: "text", text: `${code}: ${message}` }],
            details: {
              ok: false,
              error: code,
              ...failureState,
              failure,
            },
          };
        }
      }

      if (
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate !== "D2E_TRANSFER_COMPLETE_V1"
      ) {
        if (!options.executeVaultWorkflow) {
          return {
            content: [
              {
                type: "text",
                text: `Vault template ${templateName} has a verified workflow binding, but the orchestrator workflow executor adapter is unavailable. Failing closed.`,
              },
            ],
            details: { ok: false, error: "vault-workflow-executor-unavailable", dispatchCheck },
          };
        }

        let promptPlaneModule: VaultPromptPlaneRuntimeModule;
        let guardModule: VaultDispatchGuardModule;
        try {
          [promptPlaneModule, guardModule] = (await Promise.all([
            import("@tryinget/pi-vault-client/prompt-plane"),
            import("@tryinget/pi-vault-client/dispatch-guard"),
          ])) as unknown as [VaultPromptPlaneRuntimeModule, VaultDispatchGuardModule];
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Vault authorization runtime is unavailable: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details: { ok: false, error: "vault-authorization-runtime-unavailable" },
          };
        }

        const promptPlane = promptPlaneModule.createVaultPromptPlaneRuntime({ dispatchRuntime });
        const prepared = await promptPlane.prepareSelectionV2(
          { query: templateName, context: objective },
          { cwd: ctx.cwd },
        );
        const authorizationId = prepared.authorization?.authorizationId;
        if (
          !prepared.ok ||
          prepared.status !== "dispatch_required" ||
          prepared.authorization?.disposition !== "dispatch_required" ||
          typeof authorizationId !== "string"
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Vault authorization preparation failed for ${templateName}: ${prepared.blocking_reason || "dispatch authorization was not issued"}`,
              },
            ],
            details: {
              ok: false,
              error: "vault-workflow-authorization-failed",
              preparedStatus: prepared.status,
            },
          };
        }

        const preflightClaim = options.governedDeepReviewPreflight?.claimForExecution({
          templateName,
          cwd: ctx.cwd,
          toolCallId: _toolCallId,
        }) ?? { ok: true as const, receipt: null };
        if (!preflightClaim.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Governed workflow preflight claim failed for ${templateName}: ${preflightClaim.error}`,
              },
            ],
            details: {
              ok: false,
              error: "governed-deep-review-preflight-claim-failed",
              templateName,
            },
          };
        }
        const preflightReceipt = preflightClaim.receipt;

        let dispatched: Awaited<
          ReturnType<VaultDispatchGuardModule["dispatchAuthorizedExecution"]>
        >;
        try {
          dispatched = await guardModule.dispatchAuthorizedExecution({
            runtime: dispatchRuntime,
            authorizationId,
            intendedExecutor: "workflow_execute",
            activation: guardModule.createDispatchActivationPolicy(gatedDispatchEnabled),
            receiptStore: guardModule.createDispatchHandoffStore(
              options.dispatchReceiptPath ? { filePath: options.dispatchReceiptPath } : undefined,
            ),
            execute: ({
              handoffId,
              authorizationId: claimedAuthorizationId,
              sealedText,
              binding,
            }) =>
              options.executeVaultWorkflow?.({
                templateName,
                objective,
                cwd: ctx.cwd,
                sealedText,
                handoffId,
                authorizationId: claimedAuthorizationId,
                executionArgs: binding.execution_args,
                signal,
                ctx,
              }) ??
              Promise.resolve({
                accepted: false,
                handoffId,
                status: "error",
              }),
          });
        } catch (error) {
          const preflightSettled = preflightReceipt
            ? options.governedDeepReviewPreflight?.settleExecution(
                preflightReceipt.nonce,
                "failed",
              ) === true
            : true;
          return {
            content: [
              {
                type: "text",
                text: preflightSettled
                  ? `Governed workflow dispatch threw for ${templateName}: ${error instanceof Error ? error.message : String(error)}`
                  : `Governed workflow dispatch threw and preflight settlement failed for ${templateName}; reload before governed execution.`,
              },
            ],
            details: {
              ok: false,
              error: preflightSettled
                ? "vault-workflow-dispatch-threw"
                : "governed-deep-review-preflight-settlement-failed",
              templateName,
              preflightNonce: preflightReceipt?.nonce ?? null,
            },
          };
        }

        if (!dispatched.ok) {
          const preflightSettled = preflightReceipt
            ? options.governedDeepReviewPreflight?.settleExecution(
                preflightReceipt.nonce,
                "failed",
              ) === true
            : true;
          return {
            content: [
              {
                type: "text",
                text: preflightSettled
                  ? `Governed workflow dispatch failed for ${templateName}: ${dispatched.error}`
                  : `Governed workflow dispatch and preflight settlement failed for ${templateName}; reload before governed execution.`,
              },
            ],
            details: {
              ok: false,
              error: preflightSettled
                ? "vault-workflow-dispatch-failed"
                : "governed-deep-review-preflight-settlement-failed",
              templateName,
              handoffId: dispatched.handoffId ?? null,
              preflightNonce: preflightReceipt?.nonce ?? null,
            },
          };
        }

        const workflowStatus = dispatched.result.status ?? "unknown";
        const workflowOk = workflowStatus === "done";
        if (preflightReceipt) {
          const settled = options.governedDeepReviewPreflight?.settleExecution(
            preflightReceipt.nonce,
            workflowOk ? "done" : "failed",
          );
          if (!settled) {
            return {
              content: [
                {
                  type: "text",
                  text: `Governed workflow preflight settlement failed for ${templateName}.`,
                },
              ],
              details: {
                ok: false,
                error: "governed-deep-review-preflight-settlement-failed",
                templateName,
                handoffId: dispatched.handoffId,
              },
            };
          }
        }
        return {
          content: [
            {
              type: "text",
              text: `${workflowOk ? "✓" : "✗"} Governed ${templateName} workflow — ${workflowStatus}${dispatched.result.output ? `\n\n${dispatched.result.output}` : ""}`,
            },
          ],
          details: {
            ok: workflowOk,
            templateName,
            executionSurface: "workflow_execute",
            handoffId: dispatched.handoffId,
            authorizationId,
            runId: dispatched.result.runId ?? null,
            status: workflowStatus,
            executorDetails: dispatched.result.details ?? null,
            preflightNonce: preflightReceipt?.nonce ?? null,
            preflightReceiptDigest: preflightReceipt?.receiptDigest ?? null,
            preflightRegistryId: preflightReceipt?.registryId ?? null,
          },
        };
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
    | {
        ok?: boolean;
        error?: string;
        kind?: string;
        status?: string;
        result?: CompactLoopResult;
      }
    | undefined;
  if (details?.result) return `${details.ok ? "✓" : "✗"} ${details.result.plugin}`;
  if (details?.ok === true && details.kind === "proposal") {
    return details.status === "not_ready"
      ? "proposal not ready (read-only)"
      : "proposal ready (read-only)";
  }
  if (details?.ok === true && details.status === "proposal") return "proposal ready (read-only)";
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
