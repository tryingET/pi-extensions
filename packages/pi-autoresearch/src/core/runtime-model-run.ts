import type { AutoresearchDecisionRuntime } from "./decisions.ts";
import type {
  AutoresearchConfigReceipt,
  AutoresearchExperimentLineageInput,
  AutoresearchRunDecisionSummary,
  AutoresearchRunKind,
  AutoresearchRunReceipt,
  MetricDirection,
  MetricMap,
} from "./runtime-model-basic.ts";
import type { AutoresearchRuntimeStatus } from "./runtime-model-packets.ts";

export interface CommandExecutionSummary {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationSeconds: number;
  stdout: string;
  stderr: string;
  outputTail: string;
}

export interface ExecuteAutoresearchRunLiveDecisionInput {
  runtime: AutoresearchDecisionRuntime;
  goal: string;
  constraints?: readonly string[];
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  ideasBacklog?: readonly string[];
  asiNotes?: readonly string[];
  deadEndMemory?: readonly string[];
  currentCompany?: string;
  model?: string;
}

export interface ExecuteAutoresearchRunInput {
  cwd: string;
  description: string;
  runKind?: AutoresearchRunKind;
  experiment?: AutoresearchExperimentLineageInput;
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
  liveDecision?: ExecuteAutoresearchRunLiveDecisionInput;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchRunResult {
  cwd: string;
  receiptPath: string;
  createdConfig: boolean;
  configReceipt: AutoresearchConfigReceipt;
  runReceipt: AutoresearchRunReceipt;
  benchmark: CommandExecutionSummary;
  checks: CommandExecutionSummary | null;
  parsedMetrics: MetricMap;
  primaryMetricName: string;
  primaryMetric: number;
  decisionSummary: AutoresearchRunDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}
