// summary: declares shared visible-loop commands, configuration, controller proofs, and parse-result contracts.
// read_when:
//   - changing visible-loop serialized shapes, controller event types, or command parsing interfaces.
import type { SelfEvolutionExecutionEnvelope } from "./selfEvolutionEnvelope.ts";

export const VISIBLE_LOOP_COMMAND = "visible-loop";
export const NEXUS_LOOP_COMMAND = "nexus-loop";
export const VISIBLE_LOOP_CHILD_COMMAND = "visible-loop-child";
export const VISIBLE_LOOP_CHILD_COMPLETE_COMMAND = "visible-loop-child-complete";

export type VisibleLoopReportBack = "intercom" | "manual" | "none";

export type VisibleLoopExecutionBinding =
  | { mode: "operator_objective"; objective: string }
  | { mode: "ak_task"; taskId: number }
  | { mode: "self_evolution_candidate"; candidateId: string };

export interface VisibleLoopRunConfig {
  schemaVersion: 1;
  runId: string;
  loopCount: number;
  cwd: string;
  commandName?: string;
  prompts: string[];
  reportBack: VisibleLoopReportBack;
  executionBinding: VisibleLoopExecutionBinding;
  parentPeerTarget?: string;
  commitDelegation?: VisibleLoopCommitDelegation;
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
      objective?: string;
      taskId?: number;
    }
  | { ok: false; error: string; usage: string };

export type VisibleLoopCompletionParseResult =
  | { ok: true; configPath?: string; iteration?: number }
  | { ok: false; error: string };

export type VisibleLoopChildParseResult =
  | { ok: true; configPath: string; claimToken?: string }
  | { ok: false; error: string; usage: string };
