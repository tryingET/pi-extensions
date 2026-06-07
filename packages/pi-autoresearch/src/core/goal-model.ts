export const AUTORESEARCH_CAMPAIGN_GOAL_LEDGER_FILE = "autoresearch.goal.json" as const;

export const AUTORESEARCH_CAMPAIGN_GOAL_STATUSES = [
  "active",
  "paused",
  "budget_limited",
  "complete",
] as const;

export type AutoresearchCampaignGoalStatus = (typeof AUTORESEARCH_CAMPAIGN_GOAL_STATUSES)[number];

export interface AutoresearchCampaignGoalBudget {
  iterations: number | null;
  wallClockSeconds: number | null;
  tokenLikeUnits: number | null;
}

export interface AutoresearchCampaignGoalUsage {
  foregroundSegments: number;
  completedIterations: number;
  elapsedSeconds: number;
  tokenLikeUnits: number;
}

export interface AutoresearchCampaignGoalSegment {
  segmentIndex: number;
  startedAt: number;
  completedAt: number;
  foreground: true;
  requestedIterations: number;
  completedIterations: number;
  elapsedSeconds: number;
  stopReason: string;
  toolName: string;
  toolCall: string;
}

export interface AutoresearchCampaignGoalLedgerV1 {
  type: "campaign_goal_ledger";
  version: 1;
  goalId: string;
  objective: string;
  status: AutoresearchCampaignGoalStatus;
  createdAt: number;
  updatedAt: number;
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
  lastStatusReason: string;
  segments: AutoresearchCampaignGoalSegment[];
  nextContinuationCall: string | null;
  exactControlActions: Record<"pause" | "resume" | "complete", string>;
  authorityWarnings: string[];
}

export interface AutoresearchCampaignGoalStatusView {
  exists: boolean;
  path: string;
  goalId: string | null;
  objective: string | null;
  status: AutoresearchCampaignGoalStatus | "missing" | "invalid";
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
  remainingBudget: AutoresearchCampaignGoalBudget;
  nextContinuationCall: string | null;
  exactControlActions: Record<"pause" | "resume" | "complete", string>;
  authorityWarnings: string[];
  parseError: string | null;
}

export interface BeginAutoresearchCampaignGoalInput {
  cwd: string;
  objective: string;
  goalId?: string;
  iterationBudget?: number;
  wallClockMinutesBudget?: number;
  tokenLikeBudget?: number;
  autoContinue?: boolean;
  now?: number;
}

export interface RecordAutoresearchCampaignGoalSegmentInput {
  cwd: string;
  goalId: string;
  requestedIterations: number;
  completedIterations: number;
  elapsedSeconds: number;
  stopReason: string;
  toolName: string;
  toolCall: string;
  tokenLikeUnits?: number;
  autoContinue?: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface SetAutoresearchCampaignGoalControlInput {
  cwd: string;
  action: "pause" | "resume" | "complete";
  reason?: string;
  now?: number;
}

export const EMPTY_BUDGET: AutoresearchCampaignGoalBudget = {
  iterations: null,
  wallClockSeconds: null,
  tokenLikeUnits: null,
};

export const EMPTY_USAGE: AutoresearchCampaignGoalUsage = {
  foregroundSegments: 0,
  completedIterations: 0,
  elapsedSeconds: 0,
  tokenLikeUnits: 0,
};

export const GOAL_AUTHORITY_WARNINGS = [
  "campaign_goal_ledger is package-local continuity state, not AK task/evidence authority",
  "foreground segments run only when an explicit tool call is made; no daemon or scheduler is installed",
  "AK/KES/Oracle/candidate promotion remains external to this package-local goal ledger",
] as const;
