export const VISIBLE_LOOP_COMMAND = "visible-loop";
export const NEXUS_LOOP_COMMAND = "nexus-loop";
export const VISIBLE_LOOP_CHILD_COMMAND = "visible-loop-child";
export const VISIBLE_LOOP_CHILD_COMPLETE_COMMAND = "visible-loop-child-complete";

export type VisibleLoopReportBack = "intercom" | "manual" | "none";

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
  productPostureTarget?: VisibleLoopProductPostureTarget;
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
    }
  | { ok: false; error: string; usage: string };

export type VisibleLoopCompletionParseResult =
  | { ok: true; configPath?: string; iteration?: number }
  | { ok: false; error: string };
