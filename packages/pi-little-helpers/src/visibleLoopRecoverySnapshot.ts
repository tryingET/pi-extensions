// summary: serializes durable visible-loop controller snapshots and continuation/delegation identity.
// read_when:
//   - changing active snapshot schemas or fields restored across same-process reload.

import type { VisibleLoopGovernedPreflightReceipt } from "./governedDeepReviewPreflight.ts";
import type { VisibleLoopDelegatedCommitRuntime } from "./visibleLoopCommitDelegation.ts";
import type { VisibleLoopChildStartProof } from "./visibleLoopContinuationIdentity.ts";
import type { VisibleLoopPlanProgress } from "./visibleLoopPlan.ts";
import type { ActiveVisibleLoopState } from "./visibleLoopRecovery.ts";

export interface PersistedActiveVisibleLoopState {
  schemaVersion: 6 | 7 | 8;
  ownerSessionId: string;
  runId: string;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  plan: VisibleLoopPlanProgress | null;
  hostProcessId: number;
  hostProcessIncarnation: string;
  stopped: boolean;
  governedDeepReviewPreflight?: VisibleLoopGovernedPreflightReceipt;
  delegatedCommit?: VisibleLoopDelegatedCommitRuntime;
  continuationStartProof?: VisibleLoopChildStartProof | null;
}

export function serializeActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
): PersistedActiveVisibleLoopState {
  return {
    schemaVersion: 8,
    ownerSessionId: state.ownerSessionId,
    runId: state.config.runId,
    configPath: state.configPath,
    completedPromptCount: state.completedPromptCount,
    completedIterations: state.completedIterations,
    plan: state.plan,
    hostProcessId: state.hostProcessId,
    hostProcessIncarnation: state.hostProcessIncarnation,
    stopped: state.stopped,
    delegatedCommit: state.delegatedCommit,
    continuationStartProof: state.continuationStartProof,
    ...(state.governedDeepReviewPreflight
      ? { governedDeepReviewPreflight: state.governedDeepReviewPreflight }
      : {}),
  };
}
