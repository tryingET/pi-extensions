// ---
// summary: "Autoresearch type contracts split from autoresearch-types.ts (see that barrel for the public surface)."
// read_when:
//   - "Changing autoresearch live-core type contracts."
// ---
import type {
  AutoresearchAutoplanPlanner,
  AutoresearchLedgerLoadResult,
  AutoresearchLedgerProjection,
  AutoresearchOracleEvidencePacket,
  AutoresearchRuntimeStatus,
  ExecuteAutoresearchCampaignStartResult,
  executeAutoresearchCampaignStart,
  InspectAutoresearchFinalizationResult,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchSupervisorLedgerLike } from "../loops/autoresearch-supervisor.ts";
import type { AutoresearchAkProjectorResult } from "./autoresearch-ak-projector.ts";
import type { AutoresearchCampaignPeerRunnerHandoffContract } from "./autoresearch-candidate-wave-types.ts";

type MaybePromise<T> = T | Promise<T>;

type TimerHandle = unknown;

export const AUTORESEARCH_LIVE_SUPERVISION_TYPE = "autoresearch_live_supervision" as const;

export const AUTORESEARCH_LIVE_SUPERVISION_VERSION = 1 as const;

export const AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS = 30 as const;

export const AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS = 5 as const;

export const AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS = 300 as const;

export const AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR =
  ".autoresearch/candidate-wave" as const;

const CAMPAIGN_PEER_RUNNER_VIOLATION_REASON =
  "Campaign-style implementation work must be launched as visible candidate_peer_spawn lanes and measured from candidate worktrees; controller-inline implementation patches bypass the handoff and are a process violation.";

export function buildAutoresearchCampaignPeerRunnerHandoffContract(): AutoresearchCampaignPeerRunnerHandoffContract {
  return {
    requiredRunner: "candidate_peer_spawn",
    handoff: "candidate_peer_spawn_to_candidate_worktree",
    controllerInlineImplementation: "process_violation",
    controllerRole: "plan_launch_bind_measure_review_only",
    piAutoresearchPeerSpawning: "forbidden_below_seam",
    requiredMeasurementSequence: [
      "candidate_peer_spawn",
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
    ],
    violationReason: CAMPAIGN_PEER_RUNNER_VIOLATION_REASON,
  };
}

export type AutoresearchLiveSessionState = "running" | "blocked" | "stopped" | "completed";

export type AutoresearchLiveProjectionAction =
  | "recorded"
  | "already-projected"
  | "noop"
  | "blocked";

export type AutoresearchLiveLifecycleAction =
  | "none"
  | "completed_task"
  | "already_terminal"
  | "stopped"
  | "blocked";

export interface AutoresearchLiveSupervisionPolicyV1 {
  intervalSeconds: number;
  autoStopOnTerminal: true;
  lifecycleMode: "complete_on_verified_completion";
}

export interface AutoresearchLiveSupervisionSessionV1 {
  type: typeof AUTORESEARCH_LIVE_SUPERVISION_TYPE;
  version: typeof AUTORESEARCH_LIVE_SUPERVISION_VERSION;
  taskId: number;
  cwd: string;
  policy: AutoresearchLiveSupervisionPolicyV1;
  state: AutoresearchLiveSessionState;
  startedAt: number;
  lastPolledAt: number | null;
  pollCount: number;
  lastRuntimeState: string | null;
  lastProjectionAction: AutoresearchLiveProjectionAction | null;
  lastLifecycleAction: AutoresearchLiveLifecycleAction;
  lastSummary: string | null;
  lastError: string | null;
}

export interface AutoresearchLiveSupervisionRequest {
  taskId: number;
  cwd: string;
  intervalSeconds?: number;
  signal?: AbortSignal;
}

export interface AutoresearchLiveObservation {
  cwd: string;
  runtime: AutoresearchRuntimeStatus;
  ledgerLoad: AutoresearchLedgerLoadResult;
  ledger: AutoresearchSupervisorLedgerLike;
  finalization: InspectAutoresearchFinalizationResult;
  oracleEvidence: AutoresearchOracleEvidencePacket;
}

export interface AutoresearchLiveLifecycleInput {
  taskId: number;
  sessionKey: string;
  session: Readonly<AutoresearchLiveSupervisionSessionV1>;
  observation: AutoresearchLiveObservation;
  projector: AutoresearchAkProjectorResult;
  signal?: AbortSignal;
}

export interface AutoresearchLiveLifecycleOutcome {
  ok: boolean;
  action: AutoresearchLiveLifecycleAction;
  summary: string;
  error?: string;
}

export interface AutoresearchLivePollResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  observation: AutoresearchLiveObservation | null;
  projector: AutoresearchAkProjectorResult | null;
  lifecycle: AutoresearchLiveLifecycleOutcome | null;
  nextStep: string;
}

export interface AutoresearchLiveStartResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  reused: boolean;
  poll: AutoresearchLivePollResult | null;
}

export interface AutoresearchLiveStartCampaignRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  maxIterations?: number;
  maxWallClockMinutes?: number;
  benchmarkCommand?: string;
  checksCommand?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: "lower" | "higher";
  metricThreshold?: number;
  reconfigure?: boolean;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  planner?: AutoresearchAutoplanPlanner;
  materializeDspxIntent?: boolean;
  runDspxProgramGen?: boolean;
  dspxProgramGenTimeoutSeconds?: number;
  dspxIntentPath?: string;
  dspxOutdir?: string;
  dspxBehaviorPath?: string;
}

export interface AutoresearchLiveStartCampaignResult {
  campaign: ExecuteAutoresearchCampaignStartResult;
  supervision: AutoresearchLiveStartResult;
}

export interface AutoresearchLiveStopResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1 | null;
  stopped: boolean;
  nextStep: string;
}

export interface AutoresearchLiveSupervisionRunnerConfig {
  akPath?: string;
  societyDb?: string;
  now?: () => number;
  setTimeout?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  observeRuntime?: (
    cwd: string,
    options: { persistSnapshot: false },
  ) => MaybePromise<AutoresearchRuntimeStatus>;
  loadLedger?: (cwd: string) => MaybePromise<AutoresearchLedgerLoadResult>;
  projectLedgerEntries?: (
    entries: AutoresearchLedgerLoadResult["entries"],
  ) => MaybePromise<Pick<AutoresearchLedgerProjection, "context">>;
  inspectFinalization?: (input: {
    cwd: string;
    status: AutoresearchRuntimeStatus;
  }) => MaybePromise<InspectAutoresearchFinalizationResult>;
  observeOracleEvidence?: (cwd: string) => MaybePromise<AutoresearchOracleEvidencePacket>;
  projectMilestone?: (input: {
    taskId: number;
    observation: AutoresearchLiveObservation;
    akPath: string;
    societyDb: string;
    signal?: AbortSignal;
  }) => MaybePromise<AutoresearchAkProjectorResult>;
  evaluateLifecycle?: (
    input: AutoresearchLiveLifecycleInput,
  ) => MaybePromise<AutoresearchLiveLifecycleOutcome>;
  startCampaign?: typeof executeAutoresearchCampaignStart;
}
