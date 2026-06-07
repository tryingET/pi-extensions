import type { CampaignMachineContext } from "./campaign-model.ts";
import type { CampaignEvent } from "./events.ts";

type GuardArgs = {
  context: CampaignMachineContext;
  event: CampaignEvent;
};

export const campaignMachineGuards = {
  isCompleted: ({ context }: GuardArgs) => context.completionReason !== null,
  isBlocked: ({ context }: GuardArgs) => context.blockedReason !== null,
  needsConfiguration: ({ context }: GuardArgs) => context.segment === null,
  isAwaitingDecision: ({ context }: GuardArgs) => context.awaitingDecision,
  benchmarkRequiresChecks: ({ event }: GuardArgs) =>
    event.type === "BENCHMARK_SUCCEEDED" && event.requiresChecks,
  decisionIsIterate: ({ event }: GuardArgs) =>
    event.type === "DECIDE_NEXT_ACTION" && event.decision === "iterate",
  decisionIsRebaseline: ({ event }: GuardArgs) =>
    event.type === "DECIDE_NEXT_ACTION" && event.decision === "rebaseline",
  decisionIsFinalize: ({ event }: GuardArgs) =>
    event.type === "DECIDE_NEXT_ACTION" && event.decision === "finalize",
  decisionIsBlock: ({ event }: GuardArgs) =>
    event.type === "DECIDE_NEXT_ACTION" && event.decision === "block",
  resumeToSegmentUnconfigured: ({ context }: GuardArgs) =>
    context.resumeState === "segment_unconfigured",
  resumeToReady: ({ context }: GuardArgs) => context.resumeState === "ready",
  resumeToRunningBenchmark: ({ context }: GuardArgs) => context.resumeState === "running_benchmark",
  resumeToRunningChecks: ({ context }: GuardArgs) => context.resumeState === "running_checks",
  resumeToRecordingReceipt: ({ context }: GuardArgs) => context.resumeState === "recording_receipt",
  resumeToAwaitingDecision: ({ context }: GuardArgs) => context.resumeState === "awaiting_decision",
  resumeToRebaselineNeeded: ({ context }: GuardArgs) => context.resumeState === "rebaseline_needed",
  resumeToFinalizeCandidate: ({ context }: GuardArgs) =>
    context.resumeState === "finalize_candidate",
};
