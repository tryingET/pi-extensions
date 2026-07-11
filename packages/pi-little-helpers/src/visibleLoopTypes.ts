import type { SelfEvolutionExecutionEnvelope } from "./selfEvolutionEnvelope.ts";

export const VISIBLE_LOOP_COMMAND = "visible-loop";
export const NEXUS_LOOP_COMMAND = "nexus-loop";
export const VISIBLE_LOOP_CHILD_COMMAND = "visible-loop-child";
export const VISIBLE_LOOP_CHILD_COMPLETE_COMMAND = "visible-loop-child-complete";

export type VisibleLoopReportBack = "intercom" | "manual" | "none";

export type VisibleLoopControllerEventKind =
  | "child_started"
  | "initial_prompt_delivered"
  | "followup_prompt_delivered"
  | "completion_checkpoint_delivered"
  | "delegated_completion_requested"
  | "prompt_delivery_failed"
  | "completion_requested"
  | "iteration_completed"
  | "continuation_failed";

export interface VisibleLoopAdaptiveControllerConfig {
  mode: "adaptive-v1";
  maxWeightedCost: number;
  weights: Record<VisibleLoopControllerEventKind, number>;
}

export interface VisibleLoopControllerProof {
  id: string;
  kind: "prompt_delivered" | "completion_checkpoint_delivered" | "delegated_completion_requested";
  iteration: number;
  promptIndex?: number;
  eventSequence: number;
}

export interface VisibleLoopControllerInvalidation {
  proofId: string;
  reason: string;
  eventSequence: number;
}

export interface VisibleLoopControllerState {
  schemaVersion: 1;
  sequence: number;
  weightedCost: number;
  proofs: VisibleLoopControllerProof[];
  invalidations: VisibleLoopControllerInvalidation[];
}

export type VisibleLoopContinuationDecision =
  | { method: "complete"; reason: "loop_count_reached" }
  | { method: "same_session"; reason: "fresh_proof_within_budget" }
  | { method: "new_session"; reason: "fresh_proof_within_budget" }
  | { method: "baseline_fallback"; reason: "budget_exceeded" };

export interface VisibleLoopRunConfig {
  schemaVersion: 1;
  runId: string;
  loopCount: number;
  cwd: string;
  commandName?: string;
  prompts: string[];
  reportBack: VisibleLoopReportBack;
  parentPeerTarget?: string;
  commitDelegation?: VisibleLoopCommitDelegation;
  adaptiveController?: VisibleLoopAdaptiveControllerConfig;
  productPostureTarget?: VisibleLoopProductPostureTarget;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
  title?: string;
  createdAt: string;
}

export interface VisibleLoopProductPostureTarget {
  cwd: string;
  productPosturePath: string;
  productPostureExists: boolean;
  visionPath: string;
  visionExists: boolean;
}

export interface VisibleLoopCommitDelegation {
  mode: "dispatch_subagent";
  promptTemplate: "commit";
}

export type VisibleLoopCommandParseResult =
  | {
      ok: true;
      loopCount: number;
      reportBack: VisibleLoopReportBack;
      parentPeerTarget?: string;
      delegateCommit?: boolean;
      candidateId?: string;
    }
  | { ok: false; error: string; usage: string };

export type VisibleLoopCompletionParseResult =
  | { ok: true; configPath?: string; iteration?: number }
  | { ok: false; error: string };
