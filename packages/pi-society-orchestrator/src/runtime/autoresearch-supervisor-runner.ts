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
  candidateCount?: number;
  candidateObjectives?: readonly string[];
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  constraints?: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
}

export interface AutoresearchCandidateWaveLane {
  laneId: string;
  objective: string;
  candidatePeerCall: string;
  measurementPlan: string[];
  ownerReviewCall: string;
}

export interface AutoresearchCandidateWavePlan {
  kind: "autoresearch.candidate_wave_plan.v1";
  taskId: number;
  cwd: string;
  objective: string;
  candidateCount: number;
  parentPeerTargetRequired: boolean;
  parentPeerTarget: string | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  lanes: AutoresearchCandidateWaveLane[];
  ownerSelection: {
    posture: "explicit_owner_decision_required";
    reviewInstructions: string[];
  };
  boundaries: string[];
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
  caveat: string | null;
  rank: number | null;
  selectable: boolean;
  selectionReason: string;
}

export interface AutoresearchCandidateWaveReview {
  kind: "autoresearch.candidate_wave_review.v1";
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  lanes: AutoresearchCandidateWaveReviewLane[];
  recommendation: {
    posture: "owner_selection_required" | "no_selectable_candidate";
    laneId: string | null;
    reason: string;
  };
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

function resolveCandidateWaveCount(input: AutoresearchCandidateWaveRequest): number {
  const fromObjectives = input.candidateObjectives?.length ?? 0;
  const resolved = input.candidateCount ?? (fromObjectives > 0 ? fromObjectives : 3);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 6) {
    throw new Error(
      `candidateCount must be an integer between 1 and 6, received: ${String(input.candidateCount)}`,
    );
  }
  return resolved;
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

function candidateWaveLaneSelectable(input: AutoresearchCandidateWaveResultInput): {
  selectable: boolean;
  reason: string;
} {
  if (typeof input.metric !== "number" || !Number.isFinite(input.metric)) {
    return { selectable: false, reason: "missing finite metric" };
  }
  const status = input.status?.toLowerCase() ?? "";
  const checksStatus = input.checksStatus?.toLowerCase() ?? "";
  if (/regression|fail|crash|blocked|discard/u.test(status)) {
    return { selectable: false, reason: `status is ${input.status}` };
  }
  if (checksStatus.length > 0 && !/pass|ok|success|none/u.test(checksStatus)) {
    return { selectable: false, reason: `checks status is ${input.checksStatus}` };
  }
  return { selectable: true, reason: "finite metric with no failing status/check gate" };
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

function candidateResultInputFromPacketPath(
  cwd: string,
  packetPath: string,
): AutoresearchCandidateWaveResultInput {
  const resolvedPath = resolveCandidateResultPacketPath(cwd, packetPath);
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
    path.basename(resolvedPath, path.extname(resolvedPath));

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
    caveat: optionalString(parsed.resultSummary),
  };
}

function candidateResultInputsFromReviewRequest(
  input: AutoresearchCandidateWaveReviewRequest,
  cwd: string,
): AutoresearchCandidateWaveResultInput[] {
  const supplied = [...(input.candidateResults ?? [])];
  const fromPackets = (input.candidateResultPacketPaths ?? []).map((packetPath) =>
    candidateResultInputFromPacketPath(cwd, packetPath),
  );
  return [...supplied, ...fromPackets];
}

export function reviewAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveReviewRequest,
): AutoresearchCandidateWaveReview {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("review_candidate_wave requires a non-empty objective.");
  }
  const candidateResults = candidateResultInputsFromReviewRequest(input, identity.cwd);
  if (candidateResults.length === 0) {
    throw new Error("review_candidate_wave requires at least one candidate result or packet path.");
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
        caveat: candidate.caveat || null,
        rank: null,
        selectable: selectable.selectable,
        selectionReason: selectable.reason,
      };
    }),
    direction,
  );
  const winner = lanes.find((lane) => lane.rank === 1) ?? null;

  return {
    kind: "autoresearch.candidate_wave_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    lanes,
    recommendation: winner
      ? {
          posture: "owner_selection_required",
          laneId: winner.laneId,
          reason: `Best selectable ${direction}-is-better metric is ${winner.metric}. Owner must still approve keep/finalize.`,
        }
      : {
          posture: "no_selectable_candidate",
          laneId: null,
          reason: "No candidate had finite metrics with passing status/check gates.",
        },
    nextStep: winner
      ? `Review ${winner.laneId}, then use autoresearch_candidate_decision plan_keep/plan_discard/plan_rewind or collect more samples.`
      : "Reject or rerun candidate lanes; no winner is selectable from the supplied results.",
    boundaries: [
      "This review compares supplied candidate-result summaries and/or exported pi-autoresearch candidate-result packets; it does not verify raw peer output by itself.",
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
      const runCall = formatToolCall("autoresearch_runtime_run", {
        cwd: identity.cwd,
        runKind: "ordinary",
        description: `Measure ${laneId}: ${laneObjective}`,
        hypothesisId: laneId,
        hypothesis: laneObjective,
        candidateSource: "candidate_peer_spawn",
        candidateWorktree: `<${laneId}-worktree-from-candidate_peer_spawn>`,
        candidateBranch: `<${laneId}-branch-from-candidate_peer_spawn>`,
        candidateBaseRef: `<${laneId}-base-ref-from-candidate_peer_spawn>`,
        candidateDiffSummary: `<${laneId}-controller-verified-diff-summary>`,
        candidateFilesChanged: [`<${laneId}-changed-files>`],
      });
      const resultCall = formatToolCall("autoresearch_runtime_status", {
        cwd: identity.cwd,
        action: "candidate_result",
      });
      return {
        laneId,
        objective: laneObjective,
        candidatePeerCall: formatToolCall("candidate_peer_spawn", peerPayload),
        measurementPlan: [bindCall, runCall, resultCall],
        ownerReviewCall: formatToolCall("autoresearch_candidate_decision", {
          cwd: identity.cwd,
          action: "status",
        }),
      };
    },
  );

  return {
    kind: "autoresearch.candidate_wave_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    candidateCount,
    parentPeerTargetRequired: parentPeerTarget === null,
    parentPeerTarget,
    filesInScope,
    offLimits,
    constraints,
    lanes,
    ownerSelection: {
      posture: "explicit_owner_decision_required",
      reviewInstructions: [
        "Launch only the lanes the owner/controller explicitly approves.",
        "After each PEER_FINAL, bind and measure the candidate through pi-autoresearch before comparing claims.",
        "Use the dashboard/candidate decision surface to choose keep, discard, rewind, more samples, or finalize; do not auto-merge.",
      ],
    },
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
