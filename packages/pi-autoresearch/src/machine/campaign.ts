import { assign, setup } from "xstate";
import { campaignMachineGuards } from "./campaign-guards.ts";
import {
  createInitialContext,
  isSuccessfulRecordedRun,
  normalizeMetric,
  normalizeSegment,
  pickBestMetric,
} from "./campaign-helpers.ts";
import type { CampaignMachineContext, CampaignMachineInput } from "./campaign-model.ts";

export * from "./campaign-model.ts";

import type { CampaignEvent } from "./events.ts";

export const campaignMachine = setup({
  types: {
    context: {} as CampaignMachineContext,
    events: {} as CampaignEvent,
    input: {} as CampaignMachineInput | undefined,
  },
  guards: campaignMachineGuards,
  actions: {
    applySegmentConfig: assign(({ event }) => {
      if (event.type !== "CONFIGURE_SEGMENT") {
        return {};
      }

      return {
        segment: normalizeSegment(event.segment),
        runCount: 0,
        successfulRunCount: 0,
        baselineMetric: null,
        bestMetric: null,
        lastRunStatus: null,
        lastRunMetric: null,
        awaitingDecision: false,
        blockedReason: null,
        completionReason: null,
        lastDecision: null,
        activeRun: null,
        resumeState: null,
      };
    }),

    startRun: assign(({ context, event }) => {
      if (event.type !== "START_RUN") {
        return {};
      }

      return {
        activeRun: {
          description: event.description,
          benchmarkCommand: event.benchmarkCommand ?? context.segment?.benchmarkCommand ?? "",
          checksCommand: event.checksCommand ?? context.segment?.checksCommand ?? null,
          metric: null,
          requiresChecks: false,
          checksPassed: null,
          failureReason: null,
        },
        awaitingDecision: false,
      };
    }),

    captureBenchmarkSuccess: assign(({ context, event }) => {
      if (event.type !== "BENCHMARK_SUCCEEDED") {
        return {};
      }

      return {
        activeRun: {
          description: context.activeRun?.description ?? "",
          benchmarkCommand: context.activeRun?.benchmarkCommand ?? "",
          checksCommand: context.activeRun?.checksCommand ?? null,
          metric: event.metric,
          requiresChecks: event.requiresChecks,
          checksPassed: event.requiresChecks ? null : true,
          failureReason: null,
        },
      };
    }),

    captureBenchmarkFailure: assign(({ context, event }) => {
      if (event.type !== "BENCHMARK_FAILED") {
        return {};
      }

      return {
        activeRun: {
          description: context.activeRun?.description ?? "",
          benchmarkCommand: context.activeRun?.benchmarkCommand ?? "",
          checksCommand: context.activeRun?.checksCommand ?? null,
          metric: null,
          requiresChecks: false,
          checksPassed: null,
          failureReason: event.reason,
        },
      };
    }),

    captureChecksSuccess: assign(({ context }) => {
      if (!context.activeRun) {
        return {};
      }

      return {
        activeRun: {
          ...context.activeRun,
          checksPassed: true,
          failureReason: null,
        },
      };
    }),

    captureChecksFailure: assign(({ context, event }) => {
      if (event.type !== "CHECKS_FAILED" || !context.activeRun) {
        return {};
      }

      return {
        activeRun: {
          ...context.activeRun,
          checksPassed: false,
          failureReason: event.reason,
        },
      };
    }),

    applyReceipt: assign(({ context, event }) => {
      if (event.type !== "RECEIPT_RECORDED") {
        return {};
      }

      const metric = normalizeMetric(event.metric);
      const successfulRun = isSuccessfulRecordedRun(event.status) && metric !== null;
      const baselineMetric =
        successfulRun && context.successfulRunCount === 0 ? metric : context.baselineMetric;
      const bestMetric =
        successfulRun && metric !== null
          ? pickBestMetric(metric, context.bestMetric, context.segment?.direction ?? "lower")
          : context.bestMetric;

      return {
        activeRun: null,
        awaitingDecision: true,
        lastDecision: null,
        runCount: context.runCount + 1,
        successfulRunCount: context.successfulRunCount + (successfulRun ? 1 : 0),
        lastRunStatus: event.status,
        lastRunMetric: metric,
        baselineMetric,
        bestMetric,
      };
    }),

    applyDecision: assign(({ event }) => {
      if (event.type !== "DECIDE_NEXT_ACTION") {
        return {};
      }

      return {
        awaitingDecision: false,
        lastDecision: event.decision,
      };
    }),

    applyBlockedReason: assign(({ event }) => {
      if (event.type !== "BLOCK") {
        return {};
      }

      return {
        blockedReason: event.reason,
      };
    }),

    applyBlockedDecisionReason: assign(({ event }) => {
      if (event.type !== "DECIDE_NEXT_ACTION") {
        return {};
      }

      return {
        blockedReason: event.reason ?? "campaign blocked pending operator action",
      };
    }),

    rememberSegmentUnconfiguredResumeState: assign(() => ({
      resumeState: "segment_unconfigured" as const,
    })),

    rememberReadyResumeState: assign(() => ({
      resumeState: "ready" as const,
    })),

    rememberRunningBenchmarkResumeState: assign(() => ({
      resumeState: "running_benchmark" as const,
    })),

    rememberRunningChecksResumeState: assign(() => ({
      resumeState: "running_checks" as const,
    })),

    rememberRecordingReceiptResumeState: assign(() => ({
      resumeState: "recording_receipt" as const,
    })),

    rememberAwaitingDecisionResumeState: assign(() => ({
      resumeState: "awaiting_decision" as const,
    })),

    rememberRebaselineNeededResumeState: assign(() => ({
      resumeState: "rebaseline_needed" as const,
    })),

    rememberFinalizeCandidateResumeState: assign(() => ({
      resumeState: "finalize_candidate" as const,
    })),

    clearDecision: assign(() => ({
      awaitingDecision: false,
      lastDecision: null,
    })),

    acceptRebaseline: assign(({ context, event }) => {
      if (event.type !== "ACCEPT_REBASELINE") {
        return {};
      }

      return {
        baselineMetric:
          normalizeMetric(event.baselineMetric) ?? context.lastRunMetric ?? context.baselineMetric,
        lastDecision: "rebaseline" as const,
        awaitingDecision: false,
      };
    }),

    acceptFinalize: assign(({ event }) => {
      if (event.type !== "ACCEPT_FINALIZE") {
        return {};
      }

      return {
        completionReason: event.reason ?? "campaign finalized",
        awaitingDecision: false,
        blockedReason: null,
        resumeState: null,
      };
    }),

    applyCompletion: assign(({ event }) => {
      if (event.type !== "COMPLETE") {
        return {};
      }

      return {
        completionReason: event.reason ?? "campaign completed",
        awaitingDecision: false,
        blockedReason: null,
        resumeState: null,
      };
    }),

    clearBlockState: assign(() => ({
      blockedReason: null,
      resumeState: null,
    })),

    resetLifecycle: assign(({ context }) => ({
      segment: context.segment,
      runCount: context.runCount,
      successfulRunCount: context.successfulRunCount,
      baselineMetric: context.baselineMetric,
      bestMetric: context.bestMetric,
      lastRunStatus: context.lastRunStatus,
      lastRunMetric: context.lastRunMetric,
      awaitingDecision: false,
      blockedReason: null,
      completionReason: null,
      lastDecision: null,
      activeRun: null,
      resumeState: null,
    })),
  },
}).createMachine({
  id: "piAutoresearchCampaign",
  initial: "idle",
  context: ({ input }) => createInitialContext(input),
  states: {
    idle: {
      always: [
        { guard: "isCompleted", target: "completed" },
        { guard: "isBlocked", target: "blocked" },
        { guard: "resumeToRebaselineNeeded", target: "rebaseline_needed" },
        { guard: "resumeToFinalizeCandidate", target: "finalize_candidate" },
        { guard: "needsConfiguration", target: "segment_unconfigured" },
        { guard: "isAwaitingDecision", target: "awaiting_decision" },
        { target: "ready" },
      ],
    },

    segment_unconfigured: {
      on: {
        CONFIGURE_SEGMENT: { target: "ready", actions: "applySegmentConfig" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberSegmentUnconfiguredResumeState", "applyBlockedReason"],
        },
        COMPLETE: { target: "completed", actions: "applyCompletion" },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    ready: {
      on: {
        CONFIGURE_SEGMENT: { target: "ready", actions: "applySegmentConfig" },
        START_RUN: { target: "running_benchmark", actions: "startRun" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberReadyResumeState", "applyBlockedReason"],
        },
        COMPLETE: { target: "completed", actions: "applyCompletion" },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    running_benchmark: {
      on: {
        BENCHMARK_SUCCEEDED: [
          {
            guard: "benchmarkRequiresChecks",
            target: "running_checks",
            actions: "captureBenchmarkSuccess",
          },
          { target: "recording_receipt", actions: "captureBenchmarkSuccess" },
        ],
        BENCHMARK_FAILED: {
          target: "recording_receipt",
          actions: "captureBenchmarkFailure",
        },
        BLOCK: {
          target: "blocked",
          actions: ["rememberRunningBenchmarkResumeState", "applyBlockedReason"],
        },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    running_checks: {
      on: {
        CHECKS_SUCCEEDED: { target: "recording_receipt", actions: "captureChecksSuccess" },
        CHECKS_FAILED: { target: "recording_receipt", actions: "captureChecksFailure" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberRunningChecksResumeState", "applyBlockedReason"],
        },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    recording_receipt: {
      on: {
        RECEIPT_RECORDED: { target: "awaiting_decision", actions: "applyReceipt" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberRecordingReceiptResumeState", "applyBlockedReason"],
        },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    awaiting_decision: {
      on: {
        CONFIGURE_SEGMENT: { target: "ready", actions: "applySegmentConfig" },
        DECIDE_NEXT_ACTION: [
          { guard: "decisionIsRebaseline", target: "rebaseline_needed", actions: "applyDecision" },
          { guard: "decisionIsFinalize", target: "finalize_candidate", actions: "applyDecision" },
          {
            guard: "decisionIsBlock",
            target: "blocked",
            actions: [
              "rememberAwaitingDecisionResumeState",
              "applyDecision",
              "applyBlockedDecisionReason",
            ],
          },
          { guard: "decisionIsIterate", target: "ready", actions: "applyDecision" },
        ],
        BLOCK: {
          target: "blocked",
          actions: ["rememberAwaitingDecisionResumeState", "applyBlockedReason"],
        },
        COMPLETE: { target: "completed", actions: "applyCompletion" },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    rebaseline_needed: {
      on: {
        CONFIGURE_SEGMENT: { target: "ready", actions: "applySegmentConfig" },
        ACCEPT_REBASELINE: { target: "ready", actions: "acceptRebaseline" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberRebaselineNeededResumeState", "applyBlockedReason"],
        },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    finalize_candidate: {
      on: {
        CONFIGURE_SEGMENT: { target: "ready", actions: "applySegmentConfig" },
        ACCEPT_FINALIZE: { target: "completed", actions: "acceptFinalize" },
        REJECT_FINALIZE: { target: "ready", actions: "clearDecision" },
        BLOCK: {
          target: "blocked",
          actions: ["rememberFinalizeCandidateResumeState", "applyBlockedReason"],
        },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    blocked: {
      on: {
        UNBLOCK: [
          {
            guard: "resumeToRunningBenchmark",
            target: "running_benchmark",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToRunningChecks",
            target: "running_checks",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToRecordingReceipt",
            target: "recording_receipt",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToAwaitingDecision",
            target: "awaiting_decision",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToRebaselineNeeded",
            target: "rebaseline_needed",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToFinalizeCandidate",
            target: "finalize_candidate",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToSegmentUnconfigured",
            target: "segment_unconfigured",
            actions: "clearBlockState",
          },
          {
            guard: "resumeToReady",
            target: "ready",
            actions: "clearBlockState",
          },
          { target: "idle", actions: "clearBlockState" },
        ],
        CONFIGURE_SEGMENT: {
          target: "ready",
          actions: ["clearBlockState", "applySegmentConfig"],
        },
        COMPLETE: { target: "completed", actions: "applyCompletion" },
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },

    completed: {
      on: {
        RESET: { target: "idle", actions: "resetLifecycle" },
      },
    },
  },
});
