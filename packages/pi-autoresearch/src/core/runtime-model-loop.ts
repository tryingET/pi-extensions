import type {
  AutoresearchDecisionRuntime,
  FinalizeDecisionOutcome,
  FinalizeDecisionPacket,
  SetupDecisionOutcome,
  SetupDecisionPacket,
} from "./decisions.ts";
import type { AutoresearchCampaignGoalStatusView } from "./goal.ts";
import type { AutoresearchControlStateV1, AutoresearchOperatorAction } from "./resume.ts";
import type { MetricDirection, RunStatus } from "./runtime-model-basic.ts";
import type { AutoresearchRuntimeStatus } from "./runtime-model-packets.ts";
import type { ExecuteAutoresearchRunResult } from "./runtime-model-run.ts";

export type AutoresearchPeerAssistLane = "none" | "scout" | "candidate" | "fork";
export type AutoresearchPeerAssistReportBack = "intercom" | "manual" | "none";
export type AutoresearchLoopPeerMode =
  | "off"
  | "plan"
  | "launch_scout"
  | "launch_candidate"
  | "launch_fork";
export type AutoresearchLoopProgressPhase =
  | "loop_start"
  | "iteration_start"
  | "iteration_complete"
  | "loop_stop"
  | "loop_complete";

export interface BuildAutoresearchPeerAssistInput {
  cwd: string;
  lane?: AutoresearchPeerAssistLane | "auto";
  objective?: string;
  goal?: string;
  targetFiles?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  reportBack?: AutoresearchPeerAssistReportBack;
  parentPeerTarget?: string;
}

export interface AutoresearchPeerAssistPlan {
  cwd: string;
  lane: AutoresearchPeerAssistLane;
  reason: string;
  objective: string;
  toolName: string | null;
  toolCall: string | null;
  reportBack: AutoresearchPeerAssistReportBack;
  parentPeerTargetRequired: boolean;
  status: AutoresearchRuntimeStatus;
  evidenceWarning: string;
}

export interface AutoresearchLoopPeerHandoff {
  mode: AutoresearchLoopPeerMode;
  requested: boolean;
  status: "not_requested" | "handoff_required" | "unavailable";
  toolName: string | null;
  toolCall: string | null;
  note: string;
}

export interface AutoresearchLoopProgressEvent {
  phase: AutoresearchLoopProgressPhase;
  cwd: string;
  goal: string;
  iteration: number | null;
  maxIterations: number;
  elapsedSeconds: number;
  stopReason?: string;
  runStatus?: RunStatus;
  primaryMetricName?: string;
  primaryMetric?: number;
  bestMetric?: number | null;
  nextHypothesis?: string | null;
  peerLane?: AutoresearchPeerAssistLane;
  message: string;
}

export interface ExecuteAutoresearchLoopInput {
  cwd: string;
  goal: string;
  maxIterations: number;
  maxWallClockMinutes?: number;
  description?: string;
  name?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  reconfigure?: boolean;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  decisionGoal?: string;
  decisionRuntime?: AutoresearchDecisionRuntime;
  decisionConstraints?: readonly string[];
  decisionFilesInScope?: readonly string[];
  decisionOffLimits?: readonly string[];
  decisionIdeasBacklog?: readonly string[];
  decisionAsiNotes?: readonly string[];
  decisionDeadEndMemory?: readonly string[];
  model?: string;
  stopOn?: readonly (RunStatus | "blocked" | "rebaseline" | "finalize")[];
  peerMode?: AutoresearchLoopPeerMode;
  campaignGoalId?: string;
  campaignGoalIterationBudget?: number;
  campaignGoalWallClockMinutesBudget?: number;
  campaignGoalTokenBudget?: number;
  campaignGoalAutoContinue?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchLoopResult {
  cwd: string;
  goal: string;
  requestedIterations: number;
  completedIterations: number;
  stopReason: string;
  elapsedSeconds: number;
  runs: ExecuteAutoresearchRunResult[];
  peerMode: AutoresearchLoopPeerMode;
  peerAssist: AutoresearchPeerAssistPlan;
  peerLaunchHandoff: AutoresearchLoopPeerHandoff;
  campaignGoal: AutoresearchCampaignGoalStatusView;
  status: AutoresearchRuntimeStatus;
}

export interface InspectAutoresearchRuntimeControlResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface SetAutoresearchRuntimeControlInput {
  cwd: string;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt?: number;
  signal?: AbortSignal;
}

export interface SetAutoresearchRuntimeControlResult {
  cwd: string;
  decision: AutoresearchOperatorAction;
  previousControl: AutoresearchControlStateV1;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface ExecuteAutoresearchSetupDecisionInput {
  cwd: string;
  packet: SetupDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchSetupDecisionResult {
  cwd: string;
  outcome: SetupDecisionOutcome;
  status: AutoresearchRuntimeStatus;
}

export interface ExecuteAutoresearchFinalizeDecisionInput {
  cwd: string;
  packet: FinalizeDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchFinalizeDecisionResult {
  cwd: string;
  outcome: FinalizeDecisionOutcome;
  status: AutoresearchRuntimeStatus;
}
