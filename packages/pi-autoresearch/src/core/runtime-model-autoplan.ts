import type { AutoresearchDecisionRuntime } from "./decisions.ts";
import type {
  AutoresearchConfigReceipt,
  MetricDirection,
  RunStatus,
} from "./runtime-model-basic.ts";
import type {
  AutoresearchAutoplanPlanner,
  AutoresearchCampaignStartRunMode,
  AutoresearchCampaignStartSetupMode,
  AutoresearchCandidateLifecyclePolicy,
  AutoresearchCandidateLifecyclePolicyInput,
  AutoresearchSetupAction,
} from "./runtime-model-candidate.ts";
import type {
  AutoresearchLoopPeerMode,
  AutoresearchLoopProgressEvent,
  ExecuteAutoresearchLoopResult,
  ExecuteAutoresearchSetupDecisionResult,
} from "./runtime-model-loop.ts";
import type { AutoresearchRuntimeStatus } from "./runtime-model-packets.ts";
import type { CommandExecutionSummary, ExecuteAutoresearchRunResult } from "./runtime-model-run.ts";

export interface AutoresearchSetupConfigInput {
  name: string;
  objectiveDigest?: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  metricThreshold?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}

export interface BuildAutoresearchAutoplanInput {
  cwd: string;
  objective: string;
  name?: string;
  planner?: AutoresearchAutoplanPlanner;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  benchmarkCommand?: string;
  checksCommand?: string | null;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  metricThreshold?: number;
  materializeDspxIntent?: boolean;
  dspxIntentPath?: string;
  dspxOutdir?: string;
  dspxBehaviorPath?: string;
}

export interface AutoresearchDspxAdvisoryProposal {
  campaignName: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  metricThreshold: number | null;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  risks: string | null;
  nextAction: string | null;
}

export interface AutoresearchMeasurementContract {
  metricName: string;
  generatedBy: string;
  freshness: "run_generated" | "static_existing_artifact";
  causalLink:
    | "benchmark_command_declares_metric"
    | "wraps_current_benchmark_command"
    | "reads_prior_advisory_artifact";
  optimizationAuthority: "baseline_allowed" | "advisory_only";
  reason: string;
}

export interface AutoresearchBenchmarkScriptProposal {
  benchmarkCommand: "bash autoresearch.sh";
  benchmarkScript: string;
  allowOverwriteScripts: false;
  reason: string;
  source: "duration_wrapper" | "dspx_behavior_score";
  measurementContract: AutoresearchMeasurementContract;
}

export interface AutoresearchDspxAdvisory {
  authority: "evidence_only_non_authoritative" | "validated_generated_dspy_planner_output";
  behaviorPath: string;
  available: boolean;
  status: string | null;
  total: number;
  passed: number;
  failed: number;
  error: number;
  matchedObjective: boolean;
  selectedExampleIndex: number | null;
  selectedExampleStatus: string | null;
  proposal: AutoresearchDspxAdvisoryProposal | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
  warnings: string[];
  nextToolCall: string | null;
}

export interface AutoresearchDspxProgramGenPlan {
  enabled: boolean;
  intentPath: string;
  outdir: string;
  command: string;
  argv: string[];
  materialized: boolean;
  note: string;
}

export interface AutoresearchAutoplanResult {
  cwd: string;
  objective: string;
  planner: AutoresearchAutoplanPlanner;
  config: AutoresearchConfigReceipt;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  benchmarkScriptPresent: boolean;
  checksScriptPresent: boolean;
  measurementContract: AutoresearchMeasurementContract | null;
  benchmarkScriptProposal: AutoresearchBenchmarkScriptProposal | null;
  packageScripts: Record<string, string>;
  justRecipes: string[];
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  confidence: number;
  risks: string[];
  nextToolCall: string;
  dspxProgramGen: AutoresearchDspxProgramGenPlan | null;
  dspxAdvisory: AutoresearchDspxAdvisory | null;
  status: AutoresearchRuntimeStatus;
}

export interface ExecuteAutoresearchSetupInput extends AutoresearchSetupConfigInput {
  cwd: string;
  action?: AutoresearchSetupAction;
  reconfigure?: boolean;
  description?: string;
  benchmarkScript?: string;
  checksScript?: string | null;
  allowOverwriteScripts?: boolean;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchSetupResult {
  cwd: string;
  action: AutoresearchSetupAction;
  plannedConfig: AutoresearchConfigReceipt;
  appliedConfig: boolean;
  wroteBenchmarkScript: boolean;
  wroteChecksScript: boolean;
  run: ExecuteAutoresearchRunResult | null;
  status: AutoresearchRuntimeStatus;
  nextToolCall: string;
}

export interface ExecuteAutoresearchCampaignStartInput extends BuildAutoresearchAutoplanInput {
  setupMode?: AutoresearchCampaignStartSetupMode;
  runMode?: AutoresearchCampaignStartRunMode;
  maxIterations?: number;
  maxWallClockMinutes?: number;
  runDspxProgramGen?: boolean;
  dspxProgramGenTimeoutSeconds?: number;
  description?: string;
  allowOverwriteScripts?: boolean;
  reconfigure?: boolean;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  postureCommand?: string;
  postureTimeoutSeconds?: number;
  decisionRuntime?: AutoresearchDecisionRuntime;
  decisionGoal?: string;
  decisionConstraints?: readonly string[];
  decisionFilesInScope?: readonly string[];
  decisionOffLimits?: readonly string[];
  decisionIdeasBacklog?: readonly string[];
  decisionAsiNotes?: readonly string[];
  decisionDeadEndMemory?: readonly string[];
  model?: string;
  stopOn?: readonly (RunStatus | "blocked" | "rebaseline" | "finalize")[];
  peerMode?: AutoresearchLoopPeerMode;
  candidatePolicy?: AutoresearchCandidateLifecyclePolicyInput;
  campaignGoalId?: string;
  campaignGoalIterationBudget?: number;
  campaignGoalWallClockMinutesBudget?: number;
  campaignGoalTokenBudget?: number;
  campaignGoalAutoContinue?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: AutoresearchLoopProgressEvent) => void;
}

export interface ExecuteAutoresearchCampaignStartResult {
  cwd: string;
  objective: string;
  setupMode: AutoresearchCampaignStartSetupMode;
  runMode: AutoresearchCampaignStartRunMode;
  maxIterations: number;
  autoplan: AutoresearchAutoplanResult;
  setupDecision: ExecuteAutoresearchSetupDecisionResult | null;
  setupResult: ExecuteAutoresearchSetupResult | null;
  loopResult: ExecuteAutoresearchLoopResult | null;
  dspxProgramGenRun: CommandExecutionSummary | null;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  status: AutoresearchRuntimeStatus;
  nextToolCall: string;
  warnings: string[];
}
