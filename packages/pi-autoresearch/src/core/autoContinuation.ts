import type { AutoresearchCampaignGoalBudget, AutoresearchCampaignGoalStatusView } from "./goal.ts";

export const AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX = 1;

export type AutoresearchAutoContinuationBlockedReason =
  | "auto_continuation_disabled"
  | "campaign_goal_missing"
  | "campaign_goal_invalid"
  | "campaign_goal_not_active"
  | "campaign_goal_budget_limited"
  | "campaign_goal_complete"
  | "campaign_goal_has_no_remaining_budget"
  | "campaign_goal_missing_continuation_call"
  | "campaign_goal_auto_continue_not_consented"
  | "runtime_blocked"
  | "runtime_completed"
  | "runtime_not_ready"
  | "operator_control_blocking"
  | "max_auto_continue_count_reached";

export interface AutoresearchAutoContinuationRuntimeGate {
  machineState: string;
  controlKind: string;
  blockedReason?: string | null;
  completionReason?: string | null;
}

export interface AutoresearchAutoContinuationSessionGate {
  enabled: boolean;
  autoContinueCount: number;
  maxAutoContinueCount?: number;
  envValue?: string | null;
}

export interface AutoresearchAutoContinuationSessionGateView {
  enabled: boolean;
  envVariable: "PI_AUTORESEARCH_AUTO_CONTINUE";
  envValue: string | null;
  enabledWhen: "1";
  autoContinueCount: number;
  maxAutoContinueCount: number;
  remainingAutoContinueCount: number;
}

export interface AutoresearchAutoContinuationRuntimeGateView
  extends AutoresearchAutoContinuationRuntimeGate {
  ready: boolean;
}

export interface AutoresearchAutoContinuationCampaignGoalGateView {
  exists: boolean;
  status: AutoresearchCampaignGoalStatusView["status"];
  hasRemainingBudget: boolean;
  hasContinuationCall: boolean;
  continuationConsented: boolean;
}

export interface AutoresearchAutoContinuationDecisionInput {
  cwd: string;
  campaignGoal: AutoresearchCampaignGoalStatusView;
  runtime: AutoresearchAutoContinuationRuntimeGate;
  session: AutoresearchAutoContinuationSessionGate;
}

export interface AutoresearchAutoContinuationDecision {
  eligible: boolean;
  blockedReasons: AutoresearchAutoContinuationBlockedReason[];
  cwd: string;
  goalId: string | null;
  objective: string | null;
  sessionGate: AutoresearchAutoContinuationSessionGateView;
  runtimeGate: AutoresearchAutoContinuationRuntimeGateView;
  campaignGoalGate: AutoresearchAutoContinuationCampaignGoalGateView;
  exactContinuationCall: string | null;
  visibleFollowUpMessage: string | null;
}

export function buildAutoresearchAutoContinuationSessionGateFromEnv(
  input: {
    env?: Record<string, string | undefined>;
    autoContinueCount?: number;
    maxAutoContinueCount?: number;
  } = {},
): AutoresearchAutoContinuationSessionGate {
  const env = input.env ?? process.env;
  const envValue = env.PI_AUTORESEARCH_AUTO_CONTINUE ?? null;
  return {
    enabled: envValue === "1",
    envValue,
    autoContinueCount: input.autoContinueCount ?? 0,
    maxAutoContinueCount:
      input.maxAutoContinueCount ??
      parseMaxAutoContinueCount(env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX),
  };
}

export function buildAutoresearchAutoContinuationDecision(
  input: AutoresearchAutoContinuationDecisionInput,
): AutoresearchAutoContinuationDecision {
  const blockedReasons: AutoresearchAutoContinuationBlockedReason[] = [];
  const maxAutoContinueCount = normalizeMaxAutoContinueCount(input.session.maxAutoContinueCount);
  const remainingAutoContinueCount = Math.max(
    maxAutoContinueCount - input.session.autoContinueCount,
    0,
  );
  const sessionGate: AutoresearchAutoContinuationSessionGateView = {
    enabled: input.session.enabled,
    envVariable: "PI_AUTORESEARCH_AUTO_CONTINUE",
    envValue: input.session.envValue ?? (input.session.enabled ? "1" : null),
    enabledWhen: "1",
    autoContinueCount: input.session.autoContinueCount,
    maxAutoContinueCount,
    remainingAutoContinueCount,
  };
  const runtimeGate: AutoresearchAutoContinuationRuntimeGateView = {
    ...input.runtime,
    ready: input.runtime.machineState === "ready",
  };
  const campaignGoalGate: AutoresearchAutoContinuationCampaignGoalGateView = {
    exists: input.campaignGoal.exists,
    status: input.campaignGoal.status,
    hasRemainingBudget: hasAnyRemainingBudget(input.campaignGoal.remainingBudget),
    hasContinuationCall: input.campaignGoal.nextContinuationCall !== null,
    continuationConsented:
      input.campaignGoal.nextContinuationCall?.includes("campaignGoalAutoContinue: true") ?? false,
  };

  if (!input.session.enabled) blockedReasons.push("auto_continuation_disabled");
  if (input.session.autoContinueCount >= maxAutoContinueCount) {
    blockedReasons.push("max_auto_continue_count_reached");
  }

  if (!input.campaignGoal.exists) blockedReasons.push("campaign_goal_missing");
  if (input.campaignGoal.status === "invalid") blockedReasons.push("campaign_goal_invalid");
  if (input.campaignGoal.status === "budget_limited") {
    blockedReasons.push("campaign_goal_budget_limited");
  }
  if (input.campaignGoal.status === "complete") blockedReasons.push("campaign_goal_complete");
  if (input.campaignGoal.exists && input.campaignGoal.status !== "active") {
    blockedReasons.push("campaign_goal_not_active");
  }
  if (!hasAnyRemainingBudget(input.campaignGoal.remainingBudget)) {
    blockedReasons.push("campaign_goal_has_no_remaining_budget");
  }
  if (!input.campaignGoal.nextContinuationCall) {
    blockedReasons.push("campaign_goal_missing_continuation_call");
  }
  if (
    input.campaignGoal.nextContinuationCall &&
    !input.campaignGoal.nextContinuationCall.includes("campaignGoalAutoContinue: true")
  ) {
    blockedReasons.push("campaign_goal_auto_continue_not_consented");
  }

  if (input.runtime.machineState === "blocked") blockedReasons.push("runtime_blocked");
  if (input.runtime.machineState === "completed") blockedReasons.push("runtime_completed");
  if (input.runtime.machineState !== "ready") {
    blockedReasons.push("runtime_not_ready");
  }
  if (
    input.runtime.controlKind === "awaiting_operator" ||
    input.runtime.controlKind === "stop" ||
    input.runtime.controlKind === "rebaseline" ||
    input.runtime.controlKind === "finalize"
  ) {
    blockedReasons.push("operator_control_blocking");
  }

  const uniqueBlockedReasons = [...new Set(blockedReasons)];
  const eligible = uniqueBlockedReasons.length === 0;
  return {
    eligible,
    blockedReasons: uniqueBlockedReasons,
    cwd: input.cwd,
    goalId: input.campaignGoal.goalId,
    objective: input.campaignGoal.objective,
    sessionGate,
    runtimeGate,
    campaignGoalGate,
    exactContinuationCall: eligible ? input.campaignGoal.nextContinuationCall : null,
    visibleFollowUpMessage: eligible
      ? formatAutoresearchAutoContinuationFollowUp({
          cwd: input.cwd,
          goalId: input.campaignGoal.goalId,
          objective: input.campaignGoal.objective,
          exactContinuationCall: input.campaignGoal.nextContinuationCall,
          autoContinueCount: input.session.autoContinueCount + 1,
          maxAutoContinueCount,
        })
      : null,
  };
}

export function formatAutoresearchAutoContinuationDecision(
  decision: AutoresearchAutoContinuationDecision,
): string {
  return [
    "# PI-AUTORESEARCH AUTO-CONTINUATION DECISION",
    "",
    `- cwd: ${decision.cwd}`,
    `- goal id: ${decision.goalId ?? "(none)"}`,
    `- objective: ${decision.objective ?? "(none)"}`,
    `- eligible: ${decision.eligible ? "yes" : "no"}`,
    `- follow-up: ${decision.eligible ? "will be sent after settle window" : "will not be sent"}`,
    `- exact continuation call: ${decision.exactContinuationCall ?? "(none)"}`,
    "",
    "## Gates",
    ...formatAutoresearchAutoContinuationGateLines(decision),
    "",
    "## Blocked reasons",
    ...(decision.blockedReasons.length > 0
      ? decision.blockedReasons.map((reason) => `- ${reason}`)
      : ["- (none)"]),
    "",
    "## Boundary",
    "- This decision only prepares a visible follow-up call for the current Pi session.",
    "- It does not run the continuation, spawn peers, start a daemon, mutate AK/KES/Oracle, use ASC rewind, or promote candidates.",
  ].join("\n");
}

export function formatAutoresearchAutoContinuationGateLines(
  decision: AutoresearchAutoContinuationDecision,
): string[] {
  return [
    `- session env gate: ${decision.sessionGate.enabled ? "enabled" : "disabled"} (${decision.sessionGate.envVariable}=${decision.sessionGate.envValue ?? "(unset)"}; required ${decision.sessionGate.envVariable}=1)`,
    `- session count: ${decision.sessionGate.autoContinueCount}/${decision.sessionGate.maxAutoContinueCount} used; ${decision.sessionGate.remainingAutoContinueCount} remaining`,
    `- runtime gate: machine=${decision.runtimeGate.machineState}; control=${decision.runtimeGate.controlKind}; blocked=${decision.runtimeGate.blockedReason ?? "(none)"}; completion=${decision.runtimeGate.completionReason ?? "(none)"}`,
    `- campaign-goal gate: exists=${decision.campaignGoalGate.exists ? "yes" : "no"}; status=${decision.campaignGoalGate.status}; remaining_budget=${decision.campaignGoalGate.hasRemainingBudget ? "yes" : "no"}; continuation_call=${decision.campaignGoalGate.hasContinuationCall ? "yes" : "no"}; campaignGoalAutoContinue=${decision.campaignGoalGate.continuationConsented ? "yes" : "no"}`,
  ];
}

function formatAutoresearchAutoContinuationFollowUp(input: {
  cwd: string;
  goalId: string | null;
  objective: string | null;
  exactContinuationCall: string | null;
  autoContinueCount: number;
  maxAutoContinueCount: number;
}): string {
  return [
    "# PI-AUTORESEARCH AUTO-CONTINUATION REQUEST",
    "",
    "A session-local, opt-in campaign-goal gate found a runnable foreground continuation.",
    'If the `autoresearch_runtime_loop` tool is not active/available in this live Pi session, first activate the autoresearch mutating toolbox profile with `toolbox({ action: "activate", bundle: "autoresearch", profile: "mutating", riskAcknowledged: true, riskJustification: "activate autoresearch_runtime_loop for this visible foreground auto-continuation" })`.',
    "After the tool is active, run exactly the foreground continuation call below unless a newer operator instruction supersedes it.",
    "",
    `- cwd: ${input.cwd}`,
    `- goal id: ${input.goalId ?? "(none)"}`,
    `- objective: ${input.objective ?? "(none)"}`,
    `- auto-continue count: ${input.autoContinueCount}/${input.maxAutoContinueCount}`,
    "",
    "## Exact continuation call",
    "```ts",
    input.exactContinuationCall ?? "",
    "```",
    "",
    "## Boundaries",
    "- Visible user-message follow-up only: no hidden daemon, background run, automatic peer spawn, ASC rewind, AK/KES/Oracle write, or candidate promotion is performed.",
    "- Stop gates: disabled opt-in, exhausted budget, completed/budget-limited/missing goal, blocking runtime control, non-ready runtime, missing call, or max session count.",
  ].join("\n");
}

function normalizeMaxAutoContinueCount(value: number | undefined): number {
  if (value === undefined) return AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX;
  if (!Number.isFinite(value) || value < 0) return AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX;
  return Math.floor(value);
}

function parseMaxAutoContinueCount(value: string | undefined): number {
  const parsed = Number(value ?? String(AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX));
  return normalizeMaxAutoContinueCount(parsed);
}

function hasAnyRemainingBudget(budget: AutoresearchCampaignGoalBudget): boolean {
  return [budget.iterations, budget.wallClockSeconds, budget.tokenLikeUnits].every(
    (value) => value === null || value > 0,
  );
}
