import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AutoresearchAutoplanPlanner,
  type AutoresearchLedgerLoadResult,
  type AutoresearchLedgerProjection,
  type AutoresearchOracleEvidencePacket,
  type AutoresearchRuntimeStatus,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchRuntimeStatus,
  type ExecuteAutoresearchCampaignStartResult,
  executeAutoresearchCampaignStart,
  type InspectAutoresearchFinalizationResult,
  inspectAutoresearchFinalization,
  loadAutoresearchLedger,
  projectAutoresearchLedgerEntries,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchSupervisorLedgerLike } from "../loops/autoresearch-supervisor.ts";
import { resolveAkPath } from "./ak.ts";
import { evaluateAutoresearchAkLifecycle } from "./autoresearch-ak-lifecycle.ts";
import {
  type AutoresearchAkProjectorResult,
  projectAutoresearchAkMilestone,
} from "./autoresearch-ak-projector.ts";

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");

type MaybePromise<T> = T | Promise<T>;

type TimerHandle = unknown;

export const AUTORESEARCH_LIVE_SUPERVISION_TYPE = "autoresearch_live_supervision" as const;
export const AUTORESEARCH_LIVE_SUPERVISION_VERSION = 1 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS = 30 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS = 5 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS = 300 as const;
export const AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR =
  ".autoresearch/candidate-wave" as const;

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

export interface AutoresearchCandidateWaveRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  candidateCount?: number;
  candidateObjectives?: readonly string[];
  candidatePacketDirectory?: string;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
}

export type AutoresearchCandidateWaveManagementLaneState =
  | "planned"
  | "packet_missing"
  | "measured_exported_selectable"
  | "measured_exported_not_selectable";

export interface AutoresearchCandidateWaveManagementLane {
  laneId: string;
  state: AutoresearchCandidateWaveManagementLaneState;
  candidateResultPacketPath: string | null;
  selectable: boolean;
  metric: number | null;
  nextStep: string;
}

export interface AutoresearchCandidateWaveManagement {
  kind: "autoresearch.candidate_wave_management.v1";
  waveId: string;
  posture:
    | "planned_not_launched"
    | "waiting_for_planned_lanes"
    | "ready_for_owner_selection"
    | "no_selectable_candidate";
  completedLaneCount: number;
  expectedLaneCount: number;
  laneStates: readonly AutoresearchCandidateWaveManagementLane[];
  finalOnlyScoring: true;
  controllerMeasurementRequired: true;
  nonSelectedLanePolicy: string;
  fanInChecklist: readonly string[];
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveLane {
  laneId: string;
  objective: string;
  candidatePeerCall: string;
  measurementPlan: string[];
  candidateResultPacketPath: string;
  ownerReviewCall: string;
}

export interface AutoresearchCandidateWavePlan {
  kind: "autoresearch.candidate_wave_plan.v1";
  taskId: number;
  cwd: string;
  objective: string;
  candidateCount: number;
  candidatePacketDirectory: string;
  parentPeerTargetRequired: boolean;
  parentPeerTarget: string | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  lanes: AutoresearchCandidateWaveLane[];
  ownerSelection: {
    posture: "explicit_owner_decision_required";
    candidateResultPacketPaths: readonly string[];
    aggregateReviewCall: string;
    reviewInstructions: string[];
  };
  management: AutoresearchCandidateWaveManagement;
  boundaries: string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
}

export interface AutoresearchMatrixCampaignCell {
  cellId: string;
  scenario: string;
  hypothesis: string;
  objective: string;
  candidatePacketDirectory: string;
  candidateResultPacketPaths: readonly string[];
  planCandidateWaveCall: string;
  reviewCandidateWaveCall: string;
  ownerUiCommand: "/autoresearch review";
  managedWavePosture: "managed_candidate_wave_required";
  fanInGate: string;
}

export interface AutoresearchMatrixManagedWaveSubstrate {
  kind: "autoresearch.matrix_managed_candidate_wave_substrate.v1";
  cellCount: number;
  candidateCountPerCell: number;
  expectedCandidateLaneCount: number;
  finalOnlyScoring: true;
  controllerMeasurementRequired: true;
  explicitPacketPathsGateSelection: true;
  cellFanInCalls: readonly {
    cellId: string;
    planCandidateWaveCall: string;
    reviewCandidateWaveCall: string;
  }[];
  checklist: readonly string[];
}

export interface AutoresearchMatrixCampaignOwnerReviewRoute {
  primaryUi: {
    surface: "pi-autoresearch_html_dashboard";
    slashCommand: "/autoresearch export";
    fallbackSlashCommand: "/autoresearch overlay";
    summary: string;
  };
  decisionUi: {
    surface: "pi-autoresearch_candidate_decision_workbench";
    slashCommand: "/autoresearch review";
    summary: string;
  };
  reviewFlow: readonly string[];
  cellReviewCalls: readonly {
    cellId: string;
    reviewCandidateWaveCall: string;
  }[];
  boundary: string;
}

export interface AutoresearchMatrixCampaignPlan {
  kind: "autoresearch.matrix_campaign_plan.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  scenarios: readonly string[];
  hypotheses: readonly string[];
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  managedWaveSubstrate: AutoresearchMatrixManagedWaveSubstrate;
  implementationWaveSubstrate: {
    posture: "dogfood_matrix_replaces_hand_authored_wave_steps";
    akTaskId: number;
    ownerUiCommand: "/autoresearch review";
    nextExactCalls: readonly string[];
  };
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchMatrixCampaignCellReview {
  cellId: string;
  scenario: string;
  hypothesis: string;
  objective: string;
  recommendationPosture: AutoresearchCandidateWaveReview["recommendation"]["posture"];
  selectedLaneId: string | null;
  completedLaneCount: number;
  expectedLaneCount: number;
  reviewCandidateWaveCall: string;
  candidateWaveReview: AutoresearchCandidateWaveReview;
}

export interface AutoresearchMatrixCampaignCloseout {
  kind: "autoresearch.matrix_campaign_closeout.v1";
  posture:
    | "ak_ready_after_owner_review"
    | "blocked_until_managed_cell_waves_complete"
    | "blocked_until_cell_rerun";
  summary: string;
  packetPaths: readonly string[];
  selectedLanes: readonly {
    cellId: string;
    scenario: string;
    hypothesis: string;
    laneId: string;
    sourcePacketPath: string | null;
  }[];
  evidenceProjection: {
    posture: "ready_for_external_projection" | "blocked";
    ownerSurface: "AK";
    requiredAnchor: string;
    boundary: string;
  };
  ownerDecisionRoute: {
    dashboardFirst: "/autoresearch export";
    overlayFallback: "/autoresearch overlay";
    finalDecision: "/autoresearch review";
  };
  nextLegalOwnerActions: readonly string[];
  notDone: readonly string[];
}

export interface AutoresearchMatrixCampaignReview {
  kind: "autoresearch.matrix_campaign_review.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  posture:
    | "waiting_for_managed_cell_waves"
    | "ready_for_matrix_owner_review"
    | "cell_rerun_required";
  cells: readonly AutoresearchMatrixCampaignCellReview[];
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
  closeout: AutoresearchMatrixCampaignCloseout;
  exactNextCalls: readonly string[];
  boundaries: readonly string[];
  nextStep: string;
}

export interface AutoresearchCandidateWaveResultInput {
  laneId: string;
  objective?: string;
  metric?: number;
  status?: string;
  checksStatus?: string;
  confidence?: number;
  candidateWorktree?: string;
  candidateBranch?: string;
  candidateBaseRef?: string;
  candidateDiffSummary?: string;
  candidateFilesChanged?: readonly string[];
  sourcePacketPath?: string;
  caveat?: string;
}

export interface AutoresearchCandidateWaveReviewRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  direction?: "lower" | "higher";
  candidateResults?: readonly AutoresearchCandidateWaveResultInput[];
  candidateResultPacketPaths?: readonly string[];
}

export interface AutoresearchCandidateWaveReviewLane {
  laneId: string;
  objective: string | null;
  metric: number | null;
  status: string;
  checksStatus: string;
  confidence: number | null;
  candidateWorktree: string | null;
  candidateBranch: string | null;
  candidateBaseRef: string | null;
  candidateDiffSummary: string | null;
  candidateFilesChanged: readonly string[];
  sourcePacketPath: string | null;
  caveat: string | null;
  rank: number | null;
  selectable: boolean;
  selectionReason: string;
}

export interface AutoresearchCandidateWavePacketDiscovery {
  mode: "explicit" | "default" | "manual";
  defaultDirectory: string;
  candidateResultPacketPaths: readonly string[];
  message: string;
}

export interface AutoresearchCandidateWaveOwnerDecisionOption {
  optionId: string;
  laneId: string;
  label: string;
  posture: "owner_gate_required";
  rationale: string;
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionFormOption {
  optionId: string;
  label: string;
  recommended: boolean;
  rationale: string;
  exactNextCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionInterviewPayload {
  title: string;
  description: string;
  questions: readonly [
    {
      id: "candidate_wave_owner_decision";
      type: "single";
      question: string;
      options: readonly {
        label: string;
        value: string;
        content: {
          source: string;
          lang: "md";
        };
      }[];
      recommended?: {
        optionId: string;
        rationale: string;
      };
      weight: "critical";
    },
  ];
}

export interface AutoresearchCandidateWaveOwnerDecisionPrimaryUi {
  surface: "pi-autoresearch_candidate_decision_workbench";
  summary: string;
  slashCommand: string;
  exactPreparationCalls: readonly string[];
}

export interface AutoresearchCandidateWaveOwnerDecisionForm {
  kind: "autoresearch.candidate_wave_owner_decision_form.v1";
  title: string;
  description: string;
  questionId: "candidate_wave_owner_decision";
  recommendedOptionId: string | null;
  options: readonly AutoresearchCandidateWaveOwnerDecisionFormOption[];
  primaryUi: AutoresearchCandidateWaveOwnerDecisionPrimaryUi;
  interviewQuestions: AutoresearchCandidateWaveOwnerDecisionInterviewPayload;
  interviewCall: string;
  boundary: string;
}

export interface AutoresearchOwnerReviewRoute {
  primaryUi: {
    surface: "pi-autoresearch_html_dashboard";
    slashCommand: "/autoresearch export";
    fallbackSlashCommand: "/autoresearch overlay";
    summary: string;
  };
  decisionUi: {
    surface: "pi-autoresearch_candidate_decision_workbench";
    slashCommand: "/autoresearch review";
    summary: string;
  };
  reviewFlow: readonly string[];
  boundary: string;
}

export interface AutoresearchCandidateWaveReview {
  kind: "autoresearch.candidate_wave_review.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  lanes: AutoresearchCandidateWaveReviewLane[];
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery;
  recommendation: {
    posture: "owner_selection_required" | "planned_lanes_incomplete" | "no_selectable_candidate";
    laneId: string | null;
    reason: string;
    exactNextCalls: string[];
    ownerDecisionOptions: readonly AutoresearchCandidateWaveOwnerDecisionOption[];
    ownerDecisionForm: AutoresearchCandidateWaveOwnerDecisionForm | null;
  };
  management: AutoresearchCandidateWaveManagement;
  ownerReviewRoute: AutoresearchOwnerReviewRoute;
  nextStep: string;
  boundaries: string[];
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

interface SessionIdentity {
  taskId: number;
  cwd: string;
  sessionKey: string;
}

interface SessionRecord {
  identity: SessionIdentity;
  persistent: boolean;
  keepRunning: boolean;
  session: AutoresearchLiveSupervisionSessionV1;
  timer: TimerHandle | null;
  inFlight: Promise<AutoresearchLivePollResult> | null;
}

export function buildAutoresearchLiveSupervisionSessionKey(input: {
  taskId: number;
  cwd: string;
}): string {
  return `${input.taskId}|${path.resolve(input.cwd)}`;
}

export function resolveAutoresearchLiveSupervisionPolicy(
  intervalSeconds?: number,
): AutoresearchLiveSupervisionPolicyV1 {
  const resolvedInterval =
    intervalSeconds ?? AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS;

  if (
    !Number.isInteger(resolvedInterval) ||
    resolvedInterval < AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS ||
    resolvedInterval > AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS
  ) {
    throw new Error(
      `intervalSeconds must be an integer between ${AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS} and ${AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS}, received: ${String(intervalSeconds)}`,
    );
  }

  return {
    intervalSeconds: resolvedInterval,
    autoStopOnTerminal: true,
    lifecycleMode: "complete_on_verified_completion",
  };
}

export function resolveAutoresearchLiveSupervisionIdentity(
  input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
): SessionIdentity {
  if (!Number.isInteger(input.taskId) || input.taskId <= 0) {
    throw new Error(`taskId must be a positive integer, received: ${String(input.taskId)}`);
  }

  if (typeof input.cwd !== "string" || input.cwd.trim().length === 0) {
    throw new Error("cwd is required for live autoresearch supervision");
  }

  const cwd = path.resolve(input.cwd);
  return {
    taskId: input.taskId,
    cwd,
    sessionKey: buildAutoresearchLiveSupervisionSessionKey({
      taskId: input.taskId,
      cwd,
    }),
  };
}

function resolveStartCampaignPositiveIntegerBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer, received: ${String(value)}`);
  }
  return resolved;
}

function resolveStartCampaignPositiveNumberBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number, received: ${String(value)}`);
  }
  return resolved;
}

function resolveCandidateWaveCount(
  input: Pick<AutoresearchCandidateWaveRequest, "candidateObjectives" | "candidateCount">,
): number {
  const fromObjectives = input.candidateObjectives?.length ?? 0;
  const resolved = input.candidateCount ?? (fromObjectives > 0 ? fromObjectives : 3);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 6) {
    throw new Error(
      `candidateCount must be an integer between 1 and 6, received: ${String(input.candidateCount)}`,
    );
  }
  return resolved;
}

function resolveMatrixCellCandidateCount(value: number | undefined): number {
  return resolveCandidateWaveCount({ candidateCount: value });
}

function resolveCandidateWavePacketDirectory(value: string | undefined): string {
  const raw = value?.trim() || AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR;
  if (path.isAbsolute(raw)) {
    throw new Error("candidatePacketDirectory must be repo-relative under .autoresearch/.");
  }
  const normalized = path.posix.normalize(raw.replace(/\\/gu, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !(normalized === ".autoresearch" || normalized.startsWith(".autoresearch/"))
  ) {
    throw new Error("candidatePacketDirectory must stay under .autoresearch/.");
  }
  return normalized;
}

function nonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

function defaultCandidateObjective(index: number, objective: string): string {
  const templates = [
    `Try the smallest surgical candidate patch for: ${objective}`,
    `Try an alternative implementation strategy for: ${objective}`,
    `Try a UX/status/evidence-oriented candidate patch for: ${objective}`,
    `Try a risk-reducing simplification candidate for: ${objective}`,
    `Try a measurement/instrumentation candidate that improves confidence for: ${objective}`,
    `Try a conservative cleanup candidate that removes friction for: ${objective}`,
  ];
  return templates[index] ?? `Try bounded candidate ${index + 1} for: ${objective}`;
}

function formatToolCall(name: string, payload: Record<string, unknown>): string {
  return `${name}(${JSON.stringify(payload, null, 2)})`;
}

function normalizeReviewToken(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/gu, "_")
    : "";
}

function candidateWaveChecksAcceptable(checksStatus: unknown): boolean {
  const normalized = normalizeReviewToken(checksStatus);
  if (normalized.length === 0) return true;
  return ["pass", "passed", "ok", "success", "succeeded", "none", "no_checks"].includes(normalized);
}

function candidateWaveStatusDecision(
  status: unknown,
): "keep" | "more_samples" | "discard" | "rewind" | "blocked" | "unknown" {
  const normalized = normalizeReviewToken(status);
  if (normalized.length === 0) return "unknown";
  if (
    [
      "candidate_improvement",
      "threshold_satisfied",
      "threshold_preserved",
      "candidate_review_ready",
      "keep",
      "candidate",
    ].includes(normalized)
  ) {
    return "keep";
  }
  if (["insufficient_samples", "possible_noise", "calibration_signal"].includes(normalized)) {
    return "more_samples";
  }
  if (normalized === "candidate_neutral") return "rewind";
  if (
    normalized.includes("regression") ||
    normalized.includes("fail") ||
    normalized.includes("crash") ||
    normalized.includes("blocked") ||
    normalized.includes("discard") ||
    normalized === "measurement_invalid" ||
    normalized === "threshold_regressed" ||
    normalized === "checks_failed" ||
    normalized === "missing_packet" ||
    normalized === "baseline_drift"
  ) {
    return "discard";
  }
  return "unknown";
}

function candidateWaveLaneSelectable(input: AutoresearchCandidateWaveResultInput): {
  selectable: boolean;
  reason: string;
} {
  if (typeof input.metric !== "number" || !Number.isFinite(input.metric)) {
    return { selectable: false, reason: "missing finite metric" };
  }
  if (!candidateWaveChecksAcceptable(input.checksStatus)) {
    return { selectable: false, reason: `checks status is ${input.checksStatus}` };
  }
  const decision = candidateWaveStatusDecision(input.status);
  if (
    decision === "discard" ||
    decision === "rewind" ||
    decision === "blocked" ||
    decision === "unknown"
  ) {
    return { selectable: false, reason: `status is ${input.status ?? "unknown"}` };
  }
  return { selectable: true, reason: `finite metric with ${decision} decision posture` };
}

function sortCandidateWaveReviewLanes(
  lanes: AutoresearchCandidateWaveReviewLane[],
  direction: "lower" | "higher",
): AutoresearchCandidateWaveReviewLane[] {
  const selectable = lanes
    .filter((lane) => lane.selectable && lane.metric !== null)
    .sort((a, b) =>
      direction === "lower" ? (a.metric ?? 0) - (b.metric ?? 0) : (b.metric ?? 0) - (a.metric ?? 0),
    );
  const rankByLane = new Map(selectable.map((lane, index) => [lane.laneId, index + 1]));
  return lanes.map((lane) => ({ ...lane, rank: rankByLane.get(lane.laneId) ?? null }));
}

function candidateWaveSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug || "candidate-wave";
}

function candidateWaveId(input: { taskId: number; objective: string }): string {
  return `task-${input.taskId}-${candidateWaveSlug(input.objective)}`;
}

function buildPlannedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveLane[];
  aggregateReviewCall: string;
}): AutoresearchCandidateWaveManagement {
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture: "planned_not_launched",
    completedLaneCount: 0,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => ({
      laneId: lane.laneId,
      state: "planned",
      candidateResultPacketPath: lane.candidateResultPacketPath,
      selectable: false,
      metric: null,
      nextStep:
        "Launch only if explicitly approved, then bind, measure, and export the lane packet.",
    })),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    nonSelectedLanePolicy:
      "After owner selection, send explicit stop/cancel guidance for non-selected visible peers; do not merge, delete, or reset their worktrees from this plan.",
    fanInChecklist: [
      "Use visible candidate_peer_spawn calls only for approved lanes.",
      "Treat PEER_FINAL as communication until the controller binds and measures the worktree through pi-autoresearch.",
      "Export one autoresearch.candidate_result.v1 packet per planned lane before final scoring.",
      "Run the explicit aggregate review call so missing planned lanes remain visible and gate selection.",
    ],
    exactNextCalls: [input.aggregateReviewCall],
  };
}

function buildReviewedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveReviewLane[];
  plannedLanesIncomplete: boolean;
  winner: AutoresearchCandidateWaveReviewLane | null;
  exactNextCalls: readonly string[];
}): AutoresearchCandidateWaveManagement {
  const completedLaneCount = input.lanes.filter(
    (lane) => normalizeReviewToken(lane.status) !== "missing_packet",
  ).length;
  const posture = input.plannedLanesIncomplete
    ? "waiting_for_planned_lanes"
    : input.winner
      ? "ready_for_owner_selection"
      : "no_selectable_candidate";
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture,
    completedLaneCount,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => {
      const missing = normalizeReviewToken(lane.status) === "missing_packet";
      return {
        laneId: lane.laneId,
        state: missing
          ? "packet_missing"
          : lane.selectable
            ? "measured_exported_selectable"
            : "measured_exported_not_selectable",
        candidateResultPacketPath: lane.sourcePacketPath,
        selectable: lane.selectable,
        metric: lane.metric,
        nextStep: missing
          ? "Wait for controller measurement and candidate_result_export, or explicitly replan the wave without this lane."
          : lane.selectable
            ? "Eligible for final-only scoring after all explicit planned lanes are exported."
            : "Not selectable; inspect status/check posture before rerun or discard planning.",
      };
    }),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    nonSelectedLanePolicy: input.winner
      ? `After owner approval for ${input.winner.laneId}, stop/cancel non-selected visible peers explicitly and leave cleanup/merge/reset to owner-approved lifecycle plans.`
      : "No selected lane yet; do not stop/cancel or clean up lanes as if a winner exists.",
    fanInChecklist: [
      "Score only controller-measured pi-autoresearch candidate-result packets, never raw peer claims.",
      "Do not recommend owner selection while any explicit planned lane is missing its packet.",
      "Keep missing, failed, blocked, and non-selectable lanes visible in the review report.",
      "After owner selection, issue explicit stop/cancel guidance for non-selected active peers before any merge/promotion work.",
    ],
    exactNextCalls: input.exactNextCalls,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveCandidateResultPacketPath(cwd: string, packetPath: string): string {
  const trimmed = packetPath.trim();
  if (trimmed.length === 0) {
    throw new Error("candidateResultPacketPaths cannot contain empty paths.");
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function laneIdFromCandidateResultPacketPath(resolvedPath: string): string {
  const base = path.basename(resolvedPath);
  return base.endsWith(".candidate-result.json")
    ? base.slice(0, -".candidate-result.json".length)
    : path.basename(resolvedPath, path.extname(resolvedPath));
}

function candidateResultInputFromPacketPath(
  cwd: string,
  packetPath: string,
): AutoresearchCandidateWaveResultInput {
  const resolvedPath = resolveCandidateResultPacketPath(cwd, packetPath);
  if (!fs.existsSync(resolvedPath)) {
    const laneId = laneIdFromCandidateResultPacketPath(resolvedPath);
    return {
      laneId,
      objective: `Missing candidate-result packet for ${laneId}`,
      status: "missing_packet",
      checksStatus: "unknown",
      sourcePacketPath: resolvedPath,
      caveat:
        "Candidate-result packet was not found. The lane may still be running, failed before export, or was not approved/launched.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read candidate result packet at ${resolvedPath}: ${message}`);
  }

  if (!isRecord(parsed) || parsed.packetKind !== "autoresearch.candidate_result.v1") {
    throw new Error(
      `Candidate result packet at ${resolvedPath} must have packetKind=autoresearch.candidate_result.v1.`,
    );
  }

  const candidate = isRecord(parsed.candidate) ? parsed.candidate : null;
  const candidateRun = isRecord(parsed.candidateRun) ? parsed.candidateRun : null;
  const experiment =
    candidateRun && isRecord(candidateRun.experiment) ? candidateRun.experiment : null;
  const closeout = isRecord(parsed.closeout) ? parsed.closeout : null;
  const closeoutStatus = closeout && isRecord(closeout.status) ? closeout.status : null;
  const status =
    optionalString(parsed.empiricalDecisionClass) ?? optionalString(candidateRun?.status);
  const checks = optionalString(candidateRun?.checks);
  const laneId =
    optionalString(experiment?.hypothesisId) ??
    optionalString(candidate?.branch) ??
    laneIdFromCandidateResultPacketPath(resolvedPath);

  return {
    laneId,
    objective:
      optionalString(experiment?.hypothesis) ??
      optionalString(candidateRun?.description) ??
      optionalString(parsed.resultSummary),
    metric: optionalNumber(candidateRun?.metric),
    status,
    checksStatus: checks,
    confidence: optionalNumber(closeoutStatus?.confidence),
    candidateWorktree: optionalString(candidate?.worktreePath),
    candidateBranch: optionalString(candidate?.branch),
    candidateBaseRef: optionalString(candidate?.baseRef),
    candidateDiffSummary: optionalString(candidate?.diffSummary),
    candidateFilesChanged: stringArrayFrom(candidate?.filesChanged),
    sourcePacketPath: resolvedPath,
    caveat: optionalString(parsed.resultSummary),
  };
}

function buildCandidateWaveBindCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string | null {
  if (!winner.candidateWorktree) return null;
  return formatToolCall("autoresearch_candidate_bind", {
    cwd,
    action: "plan_run",
    candidateWorktree: winner.candidateWorktree,
    candidateBaseRef: winner.candidateBaseRef ?? "<verify-base-ref>",
  });
}

function buildCandidateWaveMoreSamplesCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string {
  const candidateWorktree = winner.candidateWorktree ?? "<candidate-worktree>";
  return formatToolCall("autoresearch_runtime_run", {
    cwd,
    runKind: "ordinary",
    description: `Collect another sample for ${winner.laneId}`,
    hypothesisId: winner.laneId,
    hypothesis: winner.objective ?? `More samples for ${winner.laneId}`,
    candidateSource: winner.candidateWorktree ? "candidate_peer_spawn" : "manual",
    candidateWorktree,
    candidateBranch: winner.candidateBranch ?? "<candidate-branch>",
    candidateBaseRef: winner.candidateBaseRef ?? "<candidate-base-ref>",
    candidateDiffSummary: winner.candidateDiffSummary ?? "<controller-verified-diff-summary>",
    candidateFilesChanged:
      winner.candidateFilesChanged.length > 0 ? winner.candidateFilesChanged : ["<changed-files>"],
  });
}

function buildCandidateWaveReviewNextCalls(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): string[] {
  const { cwd, winner } = input;
  if (!winner) return [];

  const calls: string[] = [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  if (bindCall) calls.push(bindCall);
  const targetCurrentLaneCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_keep",
    }),
  );
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_discard",
    }),
  );
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    calls.push(targetCurrentLaneCall);
    calls.push(
      formatToolCall("autoresearch_candidate_decision", {
        cwd,
        action: "plan_rewind",
      }),
    );
  }
  return calls;
}

function buildCandidateWaveOwnerDecisionOptions(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): AutoresearchCandidateWaveOwnerDecisionOption[] {
  const { cwd, winner } = input;
  if (!winner) return [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  const moreSamplesCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  const targetCurrentLaneCall = moreSamplesCall;
  const keepCalls = [
    ...(bindCall ? [bindCall] : []),
    targetCurrentLaneCall,
    formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_keep" }),
  ];
  const options: AutoresearchCandidateWaveOwnerDecisionOption[] = [
    {
      optionId: "plan_keep_recommended",
      laneId: winner.laneId,
      label: `Plan keep for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner accepts this candidate after reviewing packet evidence and local diff; run the included measurement call first if this lane is not already the latest pi-autoresearch candidate.",
      exactNextCalls: keepCalls,
    },
    {
      optionId: "collect_more_samples",
      laneId: winner.laneId,
      label: `Collect another measured sample for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the metric/check evidence is promising but still under-sampled or noisy.",
      exactNextCalls: [moreSamplesCall],
    },
    {
      optionId: "plan_discard",
      laneId: winner.laneId,
      label: `Plan discard for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner rejects this candidate; run the included measurement call first if this lane is not already current, then discard planning remains non-mutating.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_discard" }),
      ],
    },
  ];
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    options.push({
      optionId: "plan_rewind",
      laneId: winner.laneId,
      label: `Plan rewind for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner wants a plan to reset the candidate worktree; run the included measurement call first if this lane is not already current, then rewind remains plan-only here.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_rewind" }),
      ],
    });
  }
  return options;
}

function buildAutoresearchOwnerReviewRoute(input: {
  scopeLabel: string;
  aggregateReviewCall?: string;
}): AutoresearchOwnerReviewRoute {
  return {
    primaryUi: {
      surface: "pi-autoresearch_html_dashboard",
      slashCommand: "/autoresearch export",
      fallbackSlashCommand: "/autoresearch overlay",
      summary:
        "Open the pi-autoresearch HTML dashboard first for run history, receipts, metrics, candidate context, and packet evidence; use the overlay when a browser export is not desirable.",
    },
    decisionUi: {
      surface: "pi-autoresearch_candidate_decision_workbench",
      slashCommand: "/autoresearch review",
      summary:
        "Use pi-autoresearch's candidate decision workbench only for final plan-only keep, discard, rewind, more-samples, or finalize decisions after dashboard and packet review.",
    },
    reviewFlow: [
      `Review ${input.scopeLabel} through /autoresearch export before lifecycle decisions.`,
      "Use /autoresearch overlay only as the live TUI fallback when browser export is not desirable.",
      ...(input.aggregateReviewCall
        ? [
            `Run aggregate review after dashboard inspection if the packet set changed: ${input.aggregateReviewCall}`,
          ]
        : []),
      "Use /autoresearch review only for the final candidate lifecycle decision; no merge, cleanup, evidence write, or promotion is implied.",
    ],
    boundary:
      "Dashboard/export/overlay/review surfaces are owner-review affordances only; they do not launch peers, run benchmarks, mutate worktrees, write AK/KES/evidence, merge, or promote.",
  };
}

function buildCandidateWaveOwnerDecisionForm(input: {
  reviewObjective: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
  ownerDecisionOptions: readonly AutoresearchCandidateWaveOwnerDecisionOption[];
}): AutoresearchCandidateWaveOwnerDecisionForm | null {
  const { reviewObjective, winner, ownerDecisionOptions } = input;
  if (!winner || ownerDecisionOptions.length === 0) return null;
  const recommendedOptionId =
    candidateWaveStatusDecision(winner.status) === "more_samples"
      ? "collect_more_samples"
      : "plan_keep_recommended";
  const title = `Owner decision for candidate wave: ${reviewObjective}`;
  const description =
    "Choose one plan-only next step after reviewing packet evidence, candidate diff, and validation. The form is advisory UI data only; executing calls remains explicit.";
  const options = ownerDecisionOptions.map((option) => ({
    optionId: option.optionId,
    label: option.label,
    recommended: option.optionId === recommendedOptionId,
    rationale: option.rationale,
    exactNextCalls: option.exactNextCalls,
  }));
  const interviewQuestions: AutoresearchCandidateWaveOwnerDecisionInterviewPayload = {
    title,
    description,
    questions: [
      {
        id: "candidate_wave_owner_decision",
        type: "single",
        question: `Select the next plan-only action for ${winner.laneId}.`,
        options: options.map((option) => ({
          label: `${option.label}${option.recommended ? " (recommended)" : ""}`,
          value: option.optionId,
          content: {
            lang: "md",
            source: [
              `**Posture:** owner_gate_required`,
              `**Rationale:** ${option.rationale}`,
              "",
              "**Exact next calls:**",
              ...option.exactNextCalls.map((call) => `- \`${call}\``),
            ].join("\n"),
          },
        })),
        ...(recommendedOptionId
          ? {
              recommended: {
                optionId: recommendedOptionId,
                rationale:
                  "Recommended from candidate-wave packet review; owner must still approve.",
              },
            }
          : {}),
        weight: "critical",
      },
    ],
  };
  const primaryUi: AutoresearchCandidateWaveOwnerDecisionPrimaryUi = {
    surface: "pi-autoresearch_candidate_decision_workbench",
    summary:
      "Use pi-autoresearch's existing candidate decision workbench as the primary owner UI after the reviewed lane is current.",
    slashCommand: "/autoresearch review",
    exactPreparationCalls:
      ownerDecisionOptions.find((option) => option.optionId === "collect_more_samples")
        ?.exactNextCalls ?? [],
  };
  return {
    kind: "autoresearch.candidate_wave_owner_decision_form.v1",
    title,
    description,
    questionId: "candidate_wave_owner_decision",
    recommendedOptionId,
    options,
    primaryUi,
    interviewQuestions,
    interviewCall: formatToolCall("interview", {
      questions: JSON.stringify(interviewQuestions),
    }),
    boundary:
      "This owner-decision form does not apply worktree lifecycle actions, write AK/KES/evidence, merge, promote, or mutate candidate state. The interview payload is a fallback for sessions where the pi-autoresearch candidate decision UI is unavailable.",
  };
}

function discoverDefaultCandidateResultPacketPaths(cwd: string): string[] {
  const defaultDir = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  if (!fs.existsSync(defaultDir)) return [];
  return fs
    .readdirSync(defaultDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".candidate-result.json"))
    .map((entry) => `${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/${entry.name}`)
    .sort();
}

function candidateResultInputsFromReviewRequest(
  input: AutoresearchCandidateWaveReviewRequest,
  cwd: string,
): {
  candidateResults: AutoresearchCandidateWaveResultInput[];
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery;
} {
  const supplied = [...(input.candidateResults ?? [])];
  const explicitPacketPaths = nonEmptyStrings(input.candidateResultPacketPaths);
  const defaultDirectory = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  const discoveredPacketPaths =
    explicitPacketPaths.length === 0 && supplied.length === 0
      ? discoverDefaultCandidateResultPacketPaths(cwd)
      : [];
  const packetPaths = explicitPacketPaths.length > 0 ? explicitPacketPaths : discoveredPacketPaths;
  const fromPackets = packetPaths.map((packetPath) =>
    candidateResultInputFromPacketPath(cwd, packetPath),
  );
  const mode =
    explicitPacketPaths.length > 0 ? "explicit" : supplied.length > 0 ? "manual" : "default";
  const message =
    mode === "explicit"
      ? `Using ${packetPaths.length} explicit candidate-result packet path(s).`
      : mode === "manual"
        ? "Using inline candidate results; default packet discovery was not mixed in."
        : `Discovered ${packetPaths.length} default candidate-result packet(s) under ${defaultDirectory}.`;

  return {
    candidateResults: [...supplied, ...fromPackets],
    packetDiscovery: {
      mode,
      defaultDirectory,
      candidateResultPacketPaths: packetPaths,
      message,
    },
  };
}

export function reviewAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveReviewRequest,
): AutoresearchCandidateWaveReview {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("review_candidate_wave requires a non-empty objective.");
  }
  const { candidateResults, packetDiscovery } = candidateResultInputsFromReviewRequest(
    input,
    identity.cwd,
  );
  if (candidateResults.length === 0) {
    throw new Error(
      `review_candidate_wave requires at least one candidate result or packet path; no default candidate-result packets were found under ${packetDiscovery.defaultDirectory}. Export lanes with candidate_result_export to ${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/<lane>.candidate-result.json or pass candidateResultPacketPaths explicitly.`,
    );
  }
  const direction = input.direction ?? "lower";
  const lanes = sortCandidateWaveReviewLanes(
    candidateResults.map((candidate) => {
      const selectable = candidateWaveLaneSelectable(candidate);
      return {
        laneId: candidate.laneId || "candidate-unknown",
        objective: candidate.objective?.trim() || null,
        metric:
          typeof candidate.metric === "number" && Number.isFinite(candidate.metric)
            ? candidate.metric
            : null,
        status: candidate.status || "unknown",
        checksStatus: candidate.checksStatus || "unknown",
        confidence:
          typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
            ? candidate.confidence
            : null,
        candidateWorktree: candidate.candidateWorktree || null,
        candidateBranch: candidate.candidateBranch || null,
        candidateBaseRef: candidate.candidateBaseRef || null,
        candidateDiffSummary: candidate.candidateDiffSummary || null,
        candidateFilesChanged: [...(candidate.candidateFilesChanged ?? [])],
        sourcePacketPath: candidate.sourcePacketPath || null,
        caveat: candidate.caveat || null,
        rank: null,
        selectable: selectable.selectable,
        selectionReason: selectable.reason,
      };
    }),
    direction,
  );
  const winner = lanes.find((lane) => lane.rank === 1) ?? null;
  const missingPlannedLanes =
    packetDiscovery.mode === "explicit"
      ? lanes.filter((lane) => normalizeReviewToken(lane.status) === "missing_packet")
      : [];
  const plannedLanesIncomplete = missingPlannedLanes.length > 0;
  const selectableWinner = plannedLanesIncomplete ? null : winner;
  const exactNextCalls = buildCandidateWaveReviewNextCalls({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionOptions = buildCandidateWaveOwnerDecisionOptions({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionForm = buildCandidateWaveOwnerDecisionForm({
    reviewObjective: objective,
    winner: selectableWinner,
    ownerDecisionOptions,
  });
  const management = buildReviewedCandidateWaveManagement({
    taskId: identity.taskId,
    objective,
    lanes,
    plannedLanesIncomplete,
    winner: selectableWinner,
    exactNextCalls,
  });
  const aggregateReviewPayload: Record<string, unknown> = {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
  };
  if (packetDiscovery.candidateResultPacketPaths.length > 0) {
    aggregateReviewPayload.candidateResultPacketPaths = packetDiscovery.candidateResultPacketPaths;
  }
  const ownerReviewRoute = buildAutoresearchOwnerReviewRoute({
    scopeLabel: `candidate wave ${objective}`,
    aggregateReviewCall: formatToolCall("autoresearch_live_supervision", aggregateReviewPayload),
  });

  return {
    kind: "autoresearch.candidate_wave_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    lanes,
    packetDiscovery,
    recommendation: plannedLanesIncomplete
      ? {
          posture: "planned_lanes_incomplete",
          laneId: null,
          reason: `${missingPlannedLanes.length} explicit planned lane(s) are missing candidate-result packets: ${missingPlannedLanes.map((lane) => lane.laneId).join(", ")}. Final owner selection is gated until every planned lane is measured/exported or the owner replans the wave without that lane.`,
          exactNextCalls,
          ownerDecisionOptions,
          ownerDecisionForm,
        }
      : winner
        ? {
            posture: "owner_selection_required",
            laneId: winner.laneId,
            reason: `Best selectable ${direction}-is-better metric is ${winner.metric}. Owner must still approve keep/finalize.`,
            exactNextCalls,
            ownerDecisionOptions,
            ownerDecisionForm,
          }
        : {
            posture: "no_selectable_candidate",
            laneId: null,
            reason: "No candidate had finite metrics with passing status/check gates.",
            exactNextCalls,
            ownerDecisionOptions,
            ownerDecisionForm,
          },
    management,
    ownerReviewRoute,
    nextStep: plannedLanesIncomplete
      ? "Wait for every explicit planned lane to reach controller-measured candidate_result_export, or rerun review_candidate_wave with a deliberately revised packet path set after owner replanning."
      : winner
        ? `Review ${winner.laneId}, then use autoresearch_candidate_decision plan_keep/plan_discard/plan_rewind or collect more samples.`
        : "Reject or rerun candidate lanes; no winner is selectable from the supplied results.",
    boundaries: [
      "This review compares supplied candidate-result summaries and/or exported pi-autoresearch candidate-result packets; it does not verify raw peer output by itself.",
      "When no inline results or packet paths are supplied, review_candidate_wave only auto-discovers existing packets under the default candidate-wave packet directory.",
      "Missing candidate-result packet paths are surfaced as non-selectable missing_packet lanes when paths are supplied explicitly, so partial candidate waves remain reviewable.",
      "Explicit planned packet paths gate final owner selection until every planned lane has a controller-measured pi-autoresearch candidate-result packet or the owner deliberately replans the lane set.",
      "pi-autoresearch receipts and candidate-result packets remain the measurement source for each candidate.",
      "The recommendation is not promotion authority; owner approval and external promotion gates remain required.",
    ],
  };
}

export function planAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveRequest,
): AutoresearchCandidateWavePlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("plan_candidate_wave requires a non-empty objective.");
  }

  const candidateCount = resolveCandidateWaveCount(input);
  const candidatePacketDirectory = resolveCandidateWavePacketDirectory(
    input.candidatePacketDirectory,
  );
  const suppliedObjectives = nonEmptyStrings(input.candidateObjectives);
  const filesInScope = nonEmptyStrings(input.filesInScope);
  const offLimits = nonEmptyStrings(input.offLimits);
  const constraints = nonEmptyStrings(input.constraints);
  const parentPeerTarget = input.parentPeerTarget?.trim() || null;
  const maxIterationsPerCandidate = resolveStartCampaignPositiveIntegerBudget(
    "maxIterationsPerCandidate",
    input.maxIterationsPerCandidate,
    1,
  );
  const maxWallClockMinutesPerCandidate = resolveStartCampaignPositiveNumberBudget(
    "maxWallClockMinutesPerCandidate",
    input.maxWallClockMinutesPerCandidate,
    20,
  );

  const lanes = Array.from(
    { length: candidateCount },
    (_, index): AutoresearchCandidateWaveLane => {
      const laneId = `candidate-${String(index + 1).padStart(2, "0")}`;
      const laneObjective =
        suppliedObjectives[index] ?? defaultCandidateObjective(index, objective);
      const baseConstraints = [
        ...constraints,
        `Per-candidate budget: at most ${maxIterationsPerCandidate} measured iteration(s) and ${maxWallClockMinutesPerCandidate} wall-clock minute(s) before controller review.`,
        "Keep mutations inside the candidate worktree only.",
        "Report changed files, branch/ref, benchmark/check commands run, and caveats in PEER_FINAL.",
        "Do not merge, promote, write AK/KES/evidence, or delete/reset worktrees.",
      ];
      const peerPayload: Record<string, unknown> = {
        objective: laneObjective,
        cwd: identity.cwd,
        filesInScope,
        offLimits,
        constraints: baseConstraints,
        dod: [
          "Produce at most one bounded candidate patch in the isolated worktree.",
          "Run the smallest truthful local validation for the patch if available.",
          "Return worktree path, branch name, base ref, changed files, and validation result for controller measurement.",
        ],
      };
      if (parentPeerTarget) peerPayload.parentPeerTarget = parentPeerTarget;
      else peerPayload.parentPeerTarget = "<required-parent-peer-target>";

      const bindCall = formatToolCall("autoresearch_candidate_bind", {
        cwd: identity.cwd,
        candidateWorktree: `<${laneId}-worktree-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${laneId}-base-ref-from-candidate_peer_spawn>`,
      });
      const candidateWorktreePlaceholder = `<${laneId}-worktree-from-candidate_peer_spawn>`;
      const runCall = formatToolCall("autoresearch_runtime_run", {
        cwd: identity.cwd,
        runKind: "ordinary",
        description: `Measure ${laneId}: ${laneObjective}`,
        hypothesisId: laneId,
        hypothesis: laneObjective,
        candidateSource: "candidate_peer_spawn",
        candidateWorktree: candidateWorktreePlaceholder,
        candidateBranch: `<${laneId}-branch-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${laneId}-base-ref-from-candidate_peer_spawn>`,
        candidateDiffSummary: `<${laneId}-controller-verified-diff-summary>`,
        candidateFilesChanged: [`<${laneId}-changed-files>`],
      });
      const candidateResultPacketPath = `${candidatePacketDirectory}/${laneId}.candidate-result.json`;
      const resultCall = formatToolCall("autoresearch_runtime_status", {
        cwd: identity.cwd,
        action: "candidate_result_export",
        outPath: candidateResultPacketPath,
      });
      return {
        laneId,
        objective: laneObjective,
        candidatePeerCall: formatToolCall("candidate_peer_spawn", peerPayload),
        measurementPlan: [bindCall, runCall, resultCall],
        candidateResultPacketPath,
        ownerReviewCall: formatToolCall("autoresearch_candidate_decision", {
          cwd: identity.cwd,
          action: "status",
        }),
      };
    },
  );

  const candidateResultPacketPaths = lanes.map((lane) => lane.candidateResultPacketPath);
  const aggregateReviewCall = formatToolCall("autoresearch_live_supervision", {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction: input.direction ?? "lower",
    candidateResultPacketPaths,
  });
  const management = buildPlannedCandidateWaveManagement({
    taskId: identity.taskId,
    objective,
    lanes,
    aggregateReviewCall,
  });

  return {
    kind: "autoresearch.candidate_wave_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    candidateCount,
    candidatePacketDirectory,
    parentPeerTargetRequired: parentPeerTarget === null,
    parentPeerTarget,
    filesInScope,
    offLimits,
    constraints,
    lanes,
    ownerSelection: {
      posture: "explicit_owner_decision_required",
      candidateResultPacketPaths,
      aggregateReviewCall,
      reviewInstructions: [
        "Launch only the lanes the owner/controller explicitly approves.",
        "After each PEER_FINAL, bind and measure the candidate through pi-autoresearch before comparing claims.",
        "When candidateWorktree is supplied, pi-autoresearch executes benchmark/check commands from that candidate worktree before recording candidate metadata.",
        "Run each lane's candidate_result_export call, then run aggregateReviewCall for owner-visible comparison.",
        "If lanes exported to .autoresearch/candidate-wave/<lane>.candidate-result.json, review_candidate_wave can also be called without candidateResultPacketPaths; it will discover existing default packets.",
        "Use the explicit aggregateReviewCall when you want missing planned lanes surfaced as missing_packet; explicit missing planned lanes gate final selection until measured/exported or owner-replanned.",
        "Use the dashboard/candidate decision surface to choose keep, discard, rewind, more samples, or finalize; do not auto-merge.",
      ],
    },
    management,
    boundaries: [
      "This plan does not spawn peers by itself.",
      "candidate_peer_spawn / pi-little-helpers owns visible isolated worktree launch.",
      "pi-autoresearch owns measurement receipts and candidate-result packets.",
      "pi-society-orchestrator owns above-seam supervision and comparison choreography only.",
      "AK/KES/evidence/promotion remain external owner-surface actions.",
    ],
    nextStep: parentPeerTarget
      ? "Review the candidate_peer_spawn calls and launch the approved lanes in parallel."
      : "Fill parentPeerTarget with the current controller peer id, then launch only the approved candidate_peer_spawn calls.",
  };
}

function resolveAutoresearchMatrixCampaignPlanParts(input: AutoresearchMatrixCampaignRequest): {
  identity: SessionIdentity;
  objective: string;
  scenarios: string[];
  hypotheses: string[];
  direction: "lower" | "higher";
  candidateCountPerCell: number;
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  parentPeerTarget: string | undefined;
  cells: AutoresearchMatrixCampaignCell[];
} {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("plan_matrix_campaign requires a non-empty objective.");
  }

  const scenarios = nonEmptyStrings(input.scenarios);
  const hypotheses = nonEmptyStrings(input.hypotheses);
  if (scenarios.length === 0) {
    throw new Error("plan_matrix_campaign requires at least one scenario.");
  }
  if (hypotheses.length === 0) {
    throw new Error("plan_matrix_campaign requires at least one hypothesis.");
  }

  const direction = input.direction ?? "lower";
  const candidateCountPerCell = resolveMatrixCellCandidateCount(input.candidateCountPerCell);
  const filesInScope = nonEmptyStrings(input.filesInScope);
  const offLimits = nonEmptyStrings(input.offLimits);
  const constraints = nonEmptyStrings(input.constraints);
  const parentPeerTarget = input.parentPeerTarget?.trim() || undefined;

  const cells = scenarios.flatMap((scenario, scenarioIndex) =>
    hypotheses.map((hypothesis, hypothesisIndex): AutoresearchMatrixCampaignCell => {
      const cellId = `cell-${String(scenarioIndex + 1).padStart(2, "0")}-${String(
        hypothesisIndex + 1,
      ).padStart(2, "0")}`;
      const cellObjective = `${objective} | scenario: ${scenario} | hypothesis: ${hypothesis}`;
      const candidatePacketDirectory = `.autoresearch/matrix-campaign/${cellId}`;
      const candidateObjectives = Array.from(
        { length: candidateCountPerCell },
        (_, index) => `${hypothesis} [sample ${index + 1}] under scenario: ${scenario}`,
      );
      const candidateResultPacketPaths = candidateObjectives.map(
        (_, index) =>
          `${candidatePacketDirectory}/candidate-${String(index + 1).padStart(2, "0")}.candidate-result.json`,
      );
      const commonPayload = {
        taskId: identity.taskId,
        cwd: identity.cwd,
        objective: cellObjective,
        direction,
      };
      const planCandidateWavePayload: Record<string, unknown> = {
        action: "plan_candidate_wave",
        ...commonPayload,
        candidateCount: candidateCountPerCell,
        candidateObjectives,
        candidatePacketDirectory,
        filesInScope,
        offLimits,
        constraints: [
          ...constraints,
          `Matrix cell: ${cellId}`,
          `Scenario: ${scenario}`,
          `Hypothesis: ${hypothesis}`,
          "Treat this matrix cell as the implementation-wave execution unit; do not mutate AK direction from inside the cell.",
        ],
        maxIterations: input.maxIterationsPerCandidate,
        maxWallClockMinutes: input.maxWallClockMinutesPerCandidate,
      };
      if (parentPeerTarget) planCandidateWavePayload.parentPeerTarget = parentPeerTarget;

      return {
        cellId,
        scenario,
        hypothesis,
        objective: cellObjective,
        candidatePacketDirectory,
        candidateResultPacketPaths,
        planCandidateWaveCall: formatToolCall(
          "autoresearch_live_supervision",
          planCandidateWavePayload,
        ),
        reviewCandidateWaveCall: formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          ...commonPayload,
          candidateResultPacketPaths,
        }),
        ownerUiCommand: "/autoresearch review",
        managedWavePosture: "managed_candidate_wave_required",
        fanInGate:
          "Run this cell through plan_candidate_wave, then review_candidate_wave with explicit candidateResultPacketPaths; missing planned lane packets gate final owner selection until measured/exported or owner-replanned.",
      };
    }),
  );

  return {
    identity,
    objective,
    scenarios,
    hypotheses,
    direction,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
  };
}

export function planAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignPlan {
  const { identity, objective, scenarios, hypotheses, direction, candidateCountPerCell, cells } =
    resolveAutoresearchMatrixCampaignPlanParts(input);

  const managedWaveSubstrate: AutoresearchMatrixManagedWaveSubstrate = {
    kind: "autoresearch.matrix_managed_candidate_wave_substrate.v1",
    cellCount: cells.length,
    candidateCountPerCell,
    expectedCandidateLaneCount: cells.length * candidateCountPerCell,
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    explicitPacketPathsGateSelection: true,
    cellFanInCalls: cells.map((cell) => ({
      cellId: cell.cellId,
      planCandidateWaveCall: cell.planCandidateWaveCall,
      reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
    })),
    checklist: [
      "Treat each matrix cell as a managed candidate wave, not as loose parallel sidequests.",
      "Run the cell planCandidateWaveCall before launching approved visible candidate lanes.",
      "Score only controller-measured pi-autoresearch candidate-result packets for each lane.",
      "Use explicit cell reviewCandidateWaveCall packet paths so missing planned lanes gate final cell selection.",
      "Compare matrix cells only after their managed wave reviews are complete or deliberately owner-replanned.",
    ],
  };

  return {
    kind: "autoresearch.matrix_campaign_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    scenarios,
    hypotheses,
    candidateCountPerCell,
    cells,
    managedWaveSubstrate,
    implementationWaveSubstrate: {
      posture: "dogfood_matrix_replaces_hand_authored_wave_steps",
      akTaskId: identity.taskId,
      ownerUiCommand: "/autoresearch review",
      nextExactCalls: cells.slice(0, 1).map((cell) => cell.planCandidateWaveCall),
    },
    ownerReview: {
      primaryUi: {
        surface: "pi-autoresearch_html_dashboard",
        slashCommand: "/autoresearch export",
        fallbackSlashCommand: "/autoresearch overlay",
        summary:
          "Open pi-autoresearch's HTML dashboard first for run history, receipts, metrics, and candidate context; use the overlay when a browser export is not desirable.",
      },
      decisionUi: {
        surface: "pi-autoresearch_candidate_decision_workbench",
        slashCommand: "/autoresearch review",
        summary:
          "Use pi-autoresearch's existing candidate decision workbench only for the final keep/discard/rewind/more-samples decision after reviewing dashboard and packet evidence.",
      },
      reviewFlow: [
        "Approve and launch only the matrix cell candidate lanes the owner/controller explicitly selects.",
        "After each visible candidate reports back, bind, measure, and export candidate-result packets through pi-autoresearch before comparing lanes.",
        "Open /autoresearch export for the HTML dashboard with run history, receipts, metrics, and candidate context; use /autoresearch overlay as the live TUI fallback.",
        "Run the cell reviewCandidateWaveCall to build the owner-visible comparison from candidate-result packets.",
        "Use /autoresearch review only for the final keep, discard, rewind, more samples, or finalize decision; matrix choreography is advisory and plan-only.",
      ],
      cellReviewCalls: cells.map((cell) => ({
        cellId: cell.cellId,
        reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      })),
      boundary:
        "Owner decision routing stays on the existing pi-autoresearch candidate decision workbench; this matrix report adds no new primary UI and applies no lifecycle action.",
    },
    boundaries: [
      "This matrix plan is a non-mutating implementation-wave substrate, not a direction mutation.",
      "Each matrix cell delegates candidate execution to the existing plan_candidate_wave and pi-autoresearch measurement/candidate-result packet surfaces.",
      "pi-autoresearch owns metrics, receipts, candidate packets, and candidate worktree measurement semantics.",
      "pi-society-orchestrator owns matrix choreography, aggregate review calls, and owner-decision surfacing only.",
      "AK remains the task/direction spine; no AK/KES/evidence write, merge, promotion, peer spawn, or worktree lifecycle action is applied by this plan.",
    ],
    nextStep:
      "Run the first cell's planCandidateWaveCall, launch only approved visible candidate lanes, export candidate-result packets, open /autoresearch export for dashboard review, then run the cell reviewCandidateWaveCall and decide through /autoresearch review.",
  };
}

export function reviewAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignReview {
  const { identity, objective, direction, cells } =
    resolveAutoresearchMatrixCampaignPlanParts(input);
  const plan = planAutoresearchMatrixCampaign(input);
  const cellReviews = cells.map((cell): AutoresearchMatrixCampaignCellReview => {
    const candidateWaveReview = reviewAutoresearchCandidateWave({
      taskId: identity.taskId,
      cwd: identity.cwd,
      objective: cell.objective,
      direction,
      candidateResultPacketPaths: cell.candidateResultPacketPaths,
    });
    return {
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      objective: cell.objective,
      recommendationPosture: candidateWaveReview.recommendation.posture,
      selectedLaneId: candidateWaveReview.recommendation.laneId,
      completedLaneCount: candidateWaveReview.management.completedLaneCount,
      expectedLaneCount: candidateWaveReview.management.expectedLaneCount,
      reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      candidateWaveReview,
    };
  });
  const completedCellCount = cellReviews.filter(
    (cell) => cell.recommendationPosture !== "planned_lanes_incomplete",
  ).length;
  const selectedCellCount = cellReviews.filter(
    (cell) => cell.recommendationPosture === "owner_selection_required",
  ).length;
  const hasIncomplete = cellReviews.some(
    (cell) => cell.recommendationPosture === "planned_lanes_incomplete",
  );
  const hasNoSelectable = cellReviews.some(
    (cell) => cell.recommendationPosture === "no_selectable_candidate",
  );
  const posture = hasIncomplete
    ? "waiting_for_managed_cell_waves"
    : hasNoSelectable
      ? "cell_rerun_required"
      : "ready_for_matrix_owner_review";
  const exactNextCalls =
    posture === "waiting_for_managed_cell_waves"
      ? cellReviews
          .filter((cell) => cell.recommendationPosture === "planned_lanes_incomplete")
          .map((cell) => cell.reviewCandidateWaveCall)
      : posture === "ready_for_matrix_owner_review"
        ? cellReviews.flatMap((cell) => cell.candidateWaveReview.recommendation.exactNextCalls)
        : cellReviews
            .filter((cell) => cell.recommendationPosture === "no_selectable_candidate")
            .map((cell) => cell.reviewCandidateWaveCall);
  const closeout = buildAutoresearchMatrixCampaignCloseout({
    taskId: identity.taskId,
    posture,
    cellReviews,
    ownerReview: plan.ownerReview,
  });

  return {
    kind: "autoresearch.matrix_campaign_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    posture,
    cells: cellReviews,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    ownerReview: plan.ownerReview,
    closeout,
    exactNextCalls,
    boundaries: [
      "This matrix review aggregates managed candidate-wave reviews; it does not launch peers, run benchmarks, merge worktrees, write evidence, or promote candidates.",
      "Each cell remains gated by review_candidate_wave over explicit candidate-result packet paths.",
      "Raw peer messages are communication only; pi-autoresearch candidate-result packets remain the measurement source.",
      "Owner approval and lower-plane candidate decision workbench calls remain required before keep/discard/rewind/finalize actions.",
    ],
    nextStep:
      posture === "waiting_for_managed_cell_waves"
        ? "Finish controller measurement and candidate_result_export for incomplete cells, then rerun review_matrix_campaign."
        : posture === "cell_rerun_required"
          ? "Rerun or replan cells with no selectable candidate before matrix-level owner review."
          : "Review selected lanes per cell, open /autoresearch export for evidence, then use /autoresearch review for final owner decisions.",
  };
}

function buildAutoresearchMatrixCampaignCloseout(input: {
  taskId: number;
  posture: AutoresearchMatrixCampaignReview["posture"];
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
}): AutoresearchMatrixCampaignCloseout {
  const packetPaths = input.cellReviews.flatMap(
    (cell) => cell.candidateWaveReview.packetDiscovery.candidateResultPacketPaths,
  );
  const selectedLanes = input.cellReviews.flatMap((cell) => {
    if (!cell.selectedLaneId) return [];
    const selectedLane = cell.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === cell.selectedLaneId,
    );
    return [
      {
        cellId: cell.cellId,
        scenario: cell.scenario,
        hypothesis: cell.hypothesis,
        laneId: cell.selectedLaneId,
        sourcePacketPath: selectedLane?.sourcePacketPath ?? null,
      },
    ];
  });
  const closeoutPosture =
    input.posture === "ready_for_matrix_owner_review"
      ? "ak_ready_after_owner_review"
      : input.posture === "waiting_for_managed_cell_waves"
        ? "blocked_until_managed_cell_waves_complete"
        : "blocked_until_cell_rerun";
  const projectionReady = input.posture === "ready_for_matrix_owner_review";

  return {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    posture: closeoutPosture,
    summary: projectionReady
      ? `Matrix campaign has ${selectedLanes.length} selected managed cell lane(s); open ${input.ownerReview.primaryUi.slashCommand} before final owner decisions and project evidence only after owner review.`
      : input.posture === "waiting_for_managed_cell_waves"
        ? "Matrix campaign closeout is blocked until every managed cell wave has controller-measured candidate-result packets or the owner replans the lane set."
        : "Matrix campaign closeout is blocked until cells with no selectable candidate are rerun or deliberately replanned.",
    packetPaths,
    selectedLanes,
    evidenceProjection: {
      posture: projectionReady ? "ready_for_external_projection" : "blocked",
      ownerSurface: "AK",
      requiredAnchor: `taskId:${input.taskId}`,
      boundary:
        "AK evidence projection is an explicit external owner-surface action after dashboard-first owner review; this closeout does not write evidence.",
    },
    ownerDecisionRoute: {
      dashboardFirst: input.ownerReview.primaryUi.slashCommand,
      overlayFallback: input.ownerReview.primaryUi.fallbackSlashCommand,
      finalDecision: input.ownerReview.decisionUi.slashCommand,
    },
    nextLegalOwnerActions: projectionReady
      ? [
          "Open /autoresearch export for dashboard-first review of receipts, metrics, and candidate packets.",
          "Use /autoresearch review for final keep/discard/rewind/more-samples/finalize decisions per selected lane.",
          "Record AK/KES/evidence only through explicit owner surfaces after accepting the reviewed closeout.",
        ]
      : [
          "Complete or deliberately replan missing managed cell waves.",
          "Rerun review_matrix_campaign after every required cell has controller-measured packet evidence.",
        ],
    notDone: [
      "No peer was launched.",
      "No benchmark was run.",
      "No worktree lifecycle action was applied.",
      "No merge, promotion, AK evidence write, KES write, or task lifecycle mutation was applied.",
    ],
  };
}

export async function readAutoresearchLiveObservation(
  input: { cwd: string },
  config: Pick<
    AutoresearchLiveSupervisionRunnerConfig,
    | "observeRuntime"
    | "loadLedger"
    | "projectLedgerEntries"
    | "inspectFinalization"
    | "observeOracleEvidence"
  > = {},
): Promise<AutoresearchLiveObservation> {
  const cwd = path.resolve(input.cwd);
  const runtime = await (config.observeRuntime || buildAutoresearchRuntimeStatus)(cwd, {
    persistSnapshot: false,
  });
  const ledgerLoad = await (config.loadLedger || loadAutoresearchLedger)(cwd);
  const ledgerProjection = await (config.projectLedgerEntries || projectAutoresearchLedgerEntries)(
    ledgerLoad.entries,
  );
  const ledger = toSupervisorLedgerLike(ledgerProjection);
  const finalization = await (config.inspectFinalization || inspectAutoresearchFinalization)({
    cwd,
    status: runtime,
  });
  const oracleEvidence = await (
    config.observeOracleEvidence || buildAutoresearchOracleEvidencePacket
  )(cwd);

  return {
    cwd,
    runtime,
    ledgerLoad,
    ledger,
    finalization,
    oracleEvidence,
  };
}

export class AutoresearchLiveSupervisionRunner {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly setTimeoutImpl: (
    callback: () => void | Promise<void>,
    delayMs: number,
  ) => unknown;
  private readonly clearTimeoutImpl: (handle: unknown) => void;
  private readonly config: AutoresearchLiveSupervisionRunnerConfig;

  constructor(config: AutoresearchLiveSupervisionRunnerConfig = {}) {
    this.config = config;
    this.now = config.now || (() => Date.now());
    this.setTimeoutImpl =
      config.setTimeout ||
      ((callback, delayMs) => globalThis.setTimeout(() => void callback(), delayMs));
    this.clearTimeoutImpl =
      config.clearTimeout || ((handle) => globalThis.clearTimeout(handle as NodeJS.Timeout));
  }

  async observe(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLivePollResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);
    const policy =
      existing?.session.policy ?? resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    return this.executeReadOnlyObservation({
      identity,
      policy,
      previousSession: existing?.session ?? null,
      signal: input.signal,
    });
  }

  async start(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLiveStartResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (existing && existing.session.state === "running") {
      return {
        sessionKey: identity.sessionKey,
        session: cloneSession(existing.session),
        reused: true,
        poll: null,
      };
    }

    const policy = resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    const record = this.createRecord(identity, policy, true);
    this.sessions.set(identity.sessionKey, record);

    const poll = await this.runPoll(record, { signal: input.signal, reschedule: true });
    return {
      sessionKey: identity.sessionKey,
      session: poll.session,
      reused: false,
      poll,
    };
  }

  async startCampaign(
    input: AutoresearchLiveStartCampaignRequest,
  ): Promise<AutoresearchLiveStartCampaignResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const campaignObjective = input.objective.trim();
    if (campaignObjective.length === 0) {
      throw new Error("start_campaign requires a non-empty objective.");
    }

    const maxIterations = resolveStartCampaignPositiveIntegerBudget(
      "maxIterations",
      input.maxIterations,
      3,
    );
    const maxWallClockMinutes = resolveStartCampaignPositiveNumberBudget(
      "maxWallClockMinutes",
      input.maxWallClockMinutes,
      30,
    );

    const campaign = await (this.config.startCampaign || executeAutoresearchCampaignStart)({
      cwd: identity.cwd,
      objective: campaignObjective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations,
      maxWallClockMinutes,
      peerMode: "plan",
      benchmarkCommand: input.benchmarkCommand,
      checksCommand: input.checksCommand,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      direction: input.direction,
      metricThreshold: input.metricThreshold,
      reconfigure: input.reconfigure,
      filesInScope: input.filesInScope,
      offLimits: input.offLimits,
      constraints: input.constraints,
      planner: input.planner,
      materializeDspxIntent: input.materializeDspxIntent,
      runDspxProgramGen: input.runDspxProgramGen,
      dspxProgramGenTimeoutSeconds: input.dspxProgramGenTimeoutSeconds,
      dspxIntentPath: input.dspxIntentPath,
      dspxOutdir: input.dspxOutdir,
      dspxBehaviorPath: input.dspxBehaviorPath,
      signal: input.signal,
    });

    const supervision = await this.start(input);
    return { campaign, supervision };
  }

  planCandidateWave(input: AutoresearchCandidateWaveRequest): AutoresearchCandidateWavePlan {
    return planAutoresearchCandidateWave(input);
  }

  planMatrixCampaign(input: AutoresearchMatrixCampaignRequest): AutoresearchMatrixCampaignPlan {
    return planAutoresearchMatrixCampaign(input);
  }

  reviewMatrixCampaign(input: AutoresearchMatrixCampaignRequest): AutoresearchMatrixCampaignReview {
    return reviewAutoresearchMatrixCampaign(input);
  }

  reviewCandidateWave(
    input: AutoresearchCandidateWaveReviewRequest,
  ): AutoresearchCandidateWaveReview {
    return reviewAutoresearchCandidateWave(input);
  }

  stop(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveStopResult {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (!existing) {
      return {
        sessionKey: identity.sessionKey,
        session: null,
        stopped: false,
        nextStep: "No live supervision session is active for this task/cwd pair.",
      };
    }

    existing.keepRunning = false;
    this.cancelTimer(existing);
    existing.session = {
      ...existing.session,
      state: "stopped",
      lastLifecycleAction: "stopped",
      lastSummary: "Live supervision stopped by operator.",
      lastError: null,
    };

    return {
      sessionKey: identity.sessionKey,
      session: cloneSession(existing.session),
      stopped: true,
      nextStep: "Live supervision is stopped. Start it again to resume polling.",
    };
  }

  getSession(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveSupervisionSessionV1 | null {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const session = this.sessions.get(identity.sessionKey)?.session;
    return session ? cloneSession(session) : null;
  }

  listSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return [...this.sessions.values()].map((record) => cloneSession(record.session));
  }

  listActiveSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return this.listSessions().filter((session) => session.state === "running");
  }

  dispose(): void {
    for (const record of this.sessions.values()) {
      record.keepRunning = false;
      this.cancelTimer(record);
      if (record.session.state === "running") {
        record.session = {
          ...record.session,
          state: "stopped",
          lastLifecycleAction: "stopped",
          lastSummary: "Live supervision stopped because the runner was disposed.",
          lastError: null,
        };
      }
    }
  }

  private createRecord(
    identity: SessionIdentity,
    policy: AutoresearchLiveSupervisionPolicyV1,
    persistent: boolean,
  ): SessionRecord {
    return {
      identity,
      persistent,
      keepRunning: persistent,
      session: {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: identity.taskId,
        cwd: identity.cwd,
        policy: { ...policy },
        state: persistent ? "running" : "stopped",
        startedAt: this.now(),
        lastPolledAt: null,
        pollCount: 0,
        lastRuntimeState: null,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary: null,
        lastError: null,
      },
      timer: null,
      inFlight: null,
    };
  }

  private runPoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    if (record.inFlight) {
      return record.inFlight;
    }

    const promise = this.executePoll(record, options).finally(() => {
      if (record.inFlight === promise) {
        record.inFlight = null;
      }
    });

    record.inFlight = promise;
    return promise;
  }

  private async executeReadOnlyObservation(input: {
    identity: SessionIdentity;
    policy: AutoresearchLiveSupervisionPolicyV1;
    previousSession: AutoresearchLiveSupervisionSessionV1 | null;
    signal?: AbortSignal;
  }): Promise<AutoresearchLivePollResult> {
    try {
      const observation = await readAutoresearchLiveObservation(
        { cwd: input.identity.cwd },
        {
          observeRuntime: this.config.observeRuntime,
          loadLedger: this.config.loadLedger,
          projectLedgerEntries: this.config.projectLedgerEntries,
          inspectFinalization: this.config.inspectFinalization,
          observeOracleEvidence: this.config.observeOracleEvidence,
        },
      );
      const previous = input.previousSession;
      const state = deriveReadOnlyObservationState(observation);
      const session: AutoresearchLiveSupervisionSessionV1 = {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: input.identity.taskId,
        cwd: input.identity.cwd,
        policy: { ...input.policy },
        state,
        startedAt: previous?.startedAt ?? this.now(),
        lastPolledAt: this.now(),
        pollCount: (previous?.pollCount ?? 0) + 1,
        lastRuntimeState: observation.runtime.runtimeProjection.state,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary:
          "Read-only observation only; no milestone projection or lifecycle mutation was attempted.",
        lastError: null,
      };
      return {
        sessionKey: input.identity.sessionKey,
        session,
        observation,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const session: AutoresearchLiveSupervisionSessionV1 = {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: input.identity.taskId,
        cwd: input.identity.cwd,
        policy: { ...input.policy },
        state: "blocked",
        startedAt: input.previousSession?.startedAt ?? this.now(),
        lastPolledAt: this.now(),
        pollCount: (input.previousSession?.pollCount ?? 0) + 1,
        lastRuntimeState: null,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary: message,
        lastError: message,
      };
      return {
        sessionKey: input.identity.sessionKey,
        session,
        observation: null,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    }
  }

  private async executePoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    this.cancelTimer(record);

    try {
      const observation = await readAutoresearchLiveObservation(
        { cwd: record.identity.cwd },
        {
          observeRuntime: this.config.observeRuntime,
          loadLedger: this.config.loadLedger,
          projectLedgerEntries: this.config.projectLedgerEntries,
          inspectFinalization: this.config.inspectFinalization,
          observeOracleEvidence: this.config.observeOracleEvidence,
        },
      );

      const projector = await this.projectMilestone(
        record.identity.taskId,
        observation,
        options.signal,
      );
      const lifecycle = isBlockedProjectorResult(projector)
        ? blockedLifecycleOutcome(projector.error || projector.candidate.reason)
        : await this.evaluateLifecycle(record, observation, projector, options.signal);

      const session = this.applyPollOutcome(record, observation, projector, lifecycle);
      if (
        record.persistent &&
        options.reschedule &&
        record.keepRunning &&
        session.state === "running"
      ) {
        this.scheduleNext(record);
      }

      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation,
        projector,
        lifecycle,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const session = this.applyUnexpectedFailure(record, message);
      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation: null,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    }
  }

  private applyPollOutcome(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    lifecycle: AutoresearchLiveLifecycleOutcome,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested = record.persistent && !record.keepRunning;
    const nextState = stopRequested ? "stopped" : deriveSessionState(projector, lifecycle);
    const lifecycleAction = stopRequested ? "stopped" : lifecycle.action;
    const summary = stopRequested
      ? "Live supervision stopped by operator."
      : deriveSessionSummary(projector, lifecycle);
    const error = stopRequested ? null : deriveSessionError(projector, lifecycle, nextState);

    if (nextState !== "running") {
      record.keepRunning = false;
    }

    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: nextState,
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastRuntimeState: observation.runtime.runtimeProjection.state,
      lastProjectionAction: projector.action,
      lastLifecycleAction: lifecycleAction,
      lastSummary: summary,
      lastError: error,
    };

    record.session = nextSession;
    return nextSession;
  }

  private applyUnexpectedFailure(
    record: SessionRecord,
    message: string,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested =
      record.persistent && (record.session.state === "stopped" || !record.keepRunning);
    record.keepRunning = false;
    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: stopRequested ? "stopped" : "blocked",
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastProjectionAction: "blocked",
      lastLifecycleAction: stopRequested ? "stopped" : "blocked",
      lastSummary: stopRequested ? "Live supervision stopped by operator." : message,
      lastError: stopRequested ? null : message,
    };

    record.session = nextSession;
    return nextSession;
  }

  private async projectMilestone(
    taskId: number,
    observation: AutoresearchLiveObservation,
    signal?: AbortSignal,
  ): Promise<AutoresearchAkProjectorResult> {
    if (this.config.projectMilestone) {
      return this.config.projectMilestone({
        taskId,
        observation,
        akPath: this.resolveAkPathForCwd(observation.cwd),
        societyDb: this.resolveSocietyDbPath(),
        signal,
      });
    }

    return projectAutoresearchAkMilestone({
      taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      runtime: observation.runtime,
      ledger: observation.ledger,
      signal,
    });
  }

  private async evaluateLifecycle(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    signal?: AbortSignal,
  ): Promise<AutoresearchLiveLifecycleOutcome> {
    if (this.config.evaluateLifecycle) {
      return this.config.evaluateLifecycle({
        taskId: record.identity.taskId,
        sessionKey: record.identity.sessionKey,
        session: cloneSession(record.session),
        observation,
        projector,
        signal,
      });
    }

    return evaluateAutoresearchAkLifecycle({
      taskId: record.identity.taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      observation,
      projector,
      signal,
    });
  }

  private scheduleNext(record: SessionRecord): void {
    this.cancelTimer(record);
    record.timer = this.setTimeoutImpl(
      () => this.runPoll(record, { reschedule: true }).then(() => undefined),
      record.session.policy.intervalSeconds * 1000,
    );
  }

  private cancelTimer(record: SessionRecord): void {
    if (!record.timer) {
      return;
    }

    this.clearTimeoutImpl(record.timer);
    record.timer = null;
  }

  private resolveAkPathForCwd(cwd: string): string {
    return this.config.akPath || resolveAkPath({ cwd });
  }

  private resolveSocietyDbPath(): string {
    return this.config.societyDb || DEFAULT_SOCIETY_DB;
  }
}

function deriveReadOnlyObservationState(
  observation: AutoresearchLiveObservation,
): AutoresearchLiveSessionState {
  const runtimeState = observation.runtime.runtimeProjection.state;
  if (runtimeState === "completed") return "completed";
  if (runtimeState === "blocked") return "blocked";
  return "running";
}

function deriveSessionState(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): AutoresearchLiveSessionState {
  if (isBlockedProjectorResult(projector) || !lifecycle.ok || lifecycle.action === "blocked") {
    return "blocked";
  }

  if (lifecycle.action === "completed_task" || lifecycle.action === "already_terminal") {
    return "completed";
  }

  return "running";
}

function deriveSessionSummary(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): string {
  if (
    lifecycle.summary.trim().length > 0 &&
    (lifecycle.action !== "none" || lifecycle.summary !== projector.candidate.reason)
  ) {
    return lifecycle.summary;
  }

  return projector.candidate.reason;
}

function deriveSessionError(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
  state: AutoresearchLiveSessionState,
): string | null {
  if (state !== "blocked") {
    return null;
  }

  return lifecycle.error || projector.error || lifecycle.summary || projector.candidate.reason;
}

function blockedLifecycleOutcome(reason: string): AutoresearchLiveLifecycleOutcome {
  return {
    ok: false,
    action: "blocked",
    summary: reason,
    error: reason,
  };
}

function isBlockedProjectorResult(projector: AutoresearchAkProjectorResult): boolean {
  return projector.action === "blocked" || projector.ok === false;
}

function toSupervisorLedgerLike(
  projection: Pick<AutoresearchLedgerProjection, "context"> | null | undefined,
): AutoresearchSupervisorLedgerLike {
  return {
    context: {
      blockedReason: projection?.context.blockedReason ?? null,
      completionReason: projection?.context.completionReason ?? null,
    },
  };
}

function cloneSession(
  session: AutoresearchLiveSupervisionSessionV1,
): AutoresearchLiveSupervisionSessionV1 {
  return {
    ...session,
    policy: { ...session.policy },
  };
}

export function describeAutoresearchLiveNextStep(
  session: Pick<
    AutoresearchLiveSupervisionSessionV1,
    "state" | "lastProjectionAction" | "lastLifecycleAction"
  >,
): string {
  switch (session.state) {
    case "running":
      switch (session.lastProjectionAction) {
        case "recorded":
          return "Milestone evidence was recorded. Continue monitoring until the runtime changes again.";
        case "already-projected":
          return "No new durable change was detected. Continue monitoring.";
        case "noop":
        case null:
          return "No coarse milestone is ready yet. Continue monitoring.";
        case "blocked":
          return "Resolve the blocking error, then restart live supervision.";
      }
      return "Continue monitoring the live supervision session.";
    case "blocked":
      return "Resolve the blocking error, then start a new live supervision session.";
    case "completed":
      return "Live supervision reached a terminal state. No further polling is scheduled.";
    case "stopped":
      return "Live supervision is stopped. Start it again to resume polling.";
  }
}
