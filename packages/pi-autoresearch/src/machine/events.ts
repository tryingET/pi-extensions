import type { MetricDirection, RunStatus } from "../core/runtime.ts";

export const CAMPAIGN_DECISIONS = ["iterate", "rebaseline", "finalize", "block"] as const;
export type CampaignDecision = (typeof CAMPAIGN_DECISIONS)[number];

export interface CampaignSegmentConfig {
  name: string;
  objectiveDigest?: string;
  metricName: string;
  metricUnit: string;
  direction: MetricDirection;
  metricThreshold?: number | null;
  benchmarkCommand: string;
  checksCommand: string | null;
}

export interface ConfigureSegmentEvent {
  type: "CONFIGURE_SEGMENT";
  segment: CampaignSegmentConfig;
}

export interface StartRunEvent {
  type: "START_RUN";
  description: string;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}

export interface BenchmarkSucceededEvent {
  type: "BENCHMARK_SUCCEEDED";
  metric: number;
  requiresChecks: boolean;
}

export interface BenchmarkFailedEvent {
  type: "BENCHMARK_FAILED";
  reason: string;
}

export interface ChecksSucceededEvent {
  type: "CHECKS_SUCCEEDED";
}

export interface ChecksFailedEvent {
  type: "CHECKS_FAILED";
  reason: string;
}

export interface ReceiptRecordedEvent {
  type: "RECEIPT_RECORDED";
  status: RunStatus;
  metric: number | null;
}

export interface DecideNextActionEvent {
  type: "DECIDE_NEXT_ACTION";
  decision: CampaignDecision;
  reason?: string;
}

export interface AcceptRebaselineEvent {
  type: "ACCEPT_REBASELINE";
  baselineMetric?: number | null;
}

export interface AcceptFinalizeEvent {
  type: "ACCEPT_FINALIZE";
  reason?: string;
}

export interface RejectFinalizeEvent {
  type: "REJECT_FINALIZE";
}

export interface BlockEvent {
  type: "BLOCK";
  reason: string;
}

export interface UnblockEvent {
  type: "UNBLOCK";
}

export interface CompleteEvent {
  type: "COMPLETE";
  reason?: string;
}

export interface ResetEvent {
  type: "RESET";
}

export type CampaignEvent =
  | ConfigureSegmentEvent
  | StartRunEvent
  | BenchmarkSucceededEvent
  | BenchmarkFailedEvent
  | ChecksSucceededEvent
  | ChecksFailedEvent
  | ReceiptRecordedEvent
  | DecideNextActionEvent
  | AcceptRebaselineEvent
  | AcceptFinalizeEvent
  | RejectFinalizeEvent
  | BlockEvent
  | UnblockEvent
  | CompleteEvent
  | ResetEvent;

export function isCampaignDecision(value: string): value is CampaignDecision {
  return CAMPAIGN_DECISIONS.includes(value as CampaignDecision);
}

export const campaignEvents = {
  configureSegment(segment: CampaignSegmentConfig): ConfigureSegmentEvent {
    return {
      type: "CONFIGURE_SEGMENT",
      segment,
    };
  },

  startRun(input: {
    description: string;
    benchmarkCommand?: string;
    checksCommand?: string | null;
  }): StartRunEvent {
    return {
      type: "START_RUN",
      description: input.description,
      benchmarkCommand: input.benchmarkCommand,
      checksCommand: input.checksCommand,
    };
  },

  benchmarkSucceeded(input: { metric: number; requiresChecks?: boolean }): BenchmarkSucceededEvent {
    return {
      type: "BENCHMARK_SUCCEEDED",
      metric: input.metric,
      requiresChecks: input.requiresChecks ?? false,
    };
  },

  benchmarkFailed(reason: string): BenchmarkFailedEvent {
    return {
      type: "BENCHMARK_FAILED",
      reason,
    };
  },

  checksSucceeded(): ChecksSucceededEvent {
    return { type: "CHECKS_SUCCEEDED" };
  },

  checksFailed(reason: string): ChecksFailedEvent {
    return {
      type: "CHECKS_FAILED",
      reason,
    };
  },

  receiptRecorded(input: { status: RunStatus; metric?: number | null }): ReceiptRecordedEvent {
    return {
      type: "RECEIPT_RECORDED",
      status: input.status,
      metric: input.metric ?? null,
    };
  },

  decideNextAction(decision: CampaignDecision, reason?: string): DecideNextActionEvent {
    return {
      type: "DECIDE_NEXT_ACTION",
      decision,
      reason,
    };
  },

  acceptRebaseline(baselineMetric?: number | null): AcceptRebaselineEvent {
    return {
      type: "ACCEPT_REBASELINE",
      baselineMetric,
    };
  },

  acceptFinalize(reason?: string): AcceptFinalizeEvent {
    return {
      type: "ACCEPT_FINALIZE",
      reason,
    };
  },

  rejectFinalize(): RejectFinalizeEvent {
    return { type: "REJECT_FINALIZE" };
  },

  block(reason: string): BlockEvent {
    return {
      type: "BLOCK",
      reason,
    };
  },

  unblock(): UnblockEvent {
    return { type: "UNBLOCK" };
  },

  complete(reason?: string): CompleteEvent {
    return {
      type: "COMPLETE",
      reason,
    };
  },

  reset(): ResetEvent {
    return { type: "RESET" };
  },
};
