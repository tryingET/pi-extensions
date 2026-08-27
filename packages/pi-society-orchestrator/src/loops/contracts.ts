// ---
// summary: "Stable public contracts for loop plugins, execution state, updates, and dispatch."
// read_when:
//   - "Changing loop public types or dispatch receipt semantics."
// ---

import type { ExecutionLike, ExecutionStatus } from "../runtime/execution-status.ts";
import type {
  AscExecutionObservationContext,
  VerifiedDispatchEffectReceipt,
} from "../runtime/subagent.ts";

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
     *
     * MAINTENANCE: every early-return path added to a dispatch()
     * implementation that fails before subagentExecutor.execute must set
     * this marker (failureKind + reason naming the boundary); post-spawn
     * failures must not. See
     * docs/project/standing-maintenance-notes.md for the full contract.
     */
    preDispatchNoEffects?: {
      failureKind: string;
      reason: string;
    };
  }
>;
