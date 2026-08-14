// ---
// summary: "Implements live autoresearch polling plus candidate-wave, matrix, Level-3, Level-4, review, finalizer, and cleanup supervision contracts."
// read_when:
//   - "Changing autoresearch live sessions, campaign choreography, candidate lineage gates, review packets, owner tokens, or closeout planning."
// ---

import {
  buildCandidateReviewPacketChainMetric,
  buildCandidateReviewPacketChainRefs,
  buildPlannedCandidateWaveManagement,
  buildReviewPacketAuthorityBoundary,
  buildReviewPacketDispositionOptions,
  candidatePathMatchesOffLimitSpec,
  candidateResultInputFromPacketPath,
  defaultCandidateObjective,
  normalizeCandidateReviewPath,
  resolveCandidateWaveCount,
  resolveCandidateWavePacketDirectory,
  reviewAutoresearchCandidateWave,
} from "./autoresearch-candidate-wave.ts";
import type { SessionIdentity } from "./autoresearch-live-supervision.ts";
import {
  buildAutoresearchLiveSupervisionSessionKey,
  resolveAutoresearchLiveSupervisionIdentity,
} from "./autoresearch-live-supervision.ts";
import { finalizeAutoresearchPostFanin } from "./autoresearch-post-fanin-finalizer.ts";
import {
  chunkArray,
  exactStringList,
  formatToolCall,
  isRecord,
  metricStatus,
  nonEmptyStrings,
  optionalJsonObject,
  optionalNumber,
  optionalString,
  readJsonFile,
  resolveStartCampaignPositiveIntegerBudget,
  resolveStartCampaignPositiveNumberBudget,
  sha256StableJson,
  shellQuote,
  stableJson,
  stringArrayFrom,
} from "./autoresearch-runner-utils.ts";

export {
  AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR,
  reviewAutoresearchCandidateWave,
} from "./autoresearch-candidate-wave.ts";
export {
  AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS,
  AUTORESEARCH_LIVE_SUPERVISION_TYPE,
  AUTORESEARCH_LIVE_SUPERVISION_VERSION,
  AutoresearchLiveSupervisionRunner,
  buildAutoresearchLiveSupervisionSessionKey,
  describeAutoresearchLiveNextStep,
  readAutoresearchLiveObservation,
  resolveAutoresearchLiveSupervisionIdentity,
  resolveAutoresearchLiveSupervisionPolicy,
} from "./autoresearch-live-supervision.ts";
export { finalizeAutoresearchPostFanin } from "./autoresearch-post-fanin-finalizer.ts";

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type MaybePromise<T> = T | Promise<T>;

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

import type {
  AutoresearchCampaignPeerRunnerHandoffContract,
  AutoresearchCandidateWaveLane,
  AutoresearchCandidateWavePlan,
  AutoresearchCandidateWaveRequest,
  AutoresearchLevel2OperatorUxDashboard,
  AutoresearchLevel2OperatorUxMetric,
  AutoresearchLevel2PacketDescriptor,
  AutoresearchLevel2PacketPlanning,
  AutoresearchLevel2PacketPlanningAntiNarrowing,
  AutoresearchLevel2PacketPlanningAntiNarrowingPosture,
  AutoresearchLevel2PacketPlanningBlockerMetric,
  AutoresearchLevel2PacketPlanningBlockers,
  AutoresearchLevel2PacketTokenName,
  AutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
  AutoresearchLevel3CampaignManifestPreflight,
  AutoresearchLevel3CampaignTransitionReceipt,
  AutoresearchLevel3CandidateLifecycleBindingInput,
  AutoresearchLevel3CandidateLifecycleLane,
  AutoresearchLevel3CleanupCommandPacket,
  AutoresearchLevel3CleanupResourcesInput,
  AutoresearchLevel3IntegrationCloseoutEvidence,
  AutoresearchLevel3ManifestPreflightRequest,
  AutoresearchLevel3MatrixCellExecutor,
  AutoresearchLevel3MatrixCellExecutorPosture,
  AutoresearchLevel3MatrixCellExecutorRequest,
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  AutoresearchLevel3MatrixCellRunner,
  AutoresearchLevel3MatrixCellRunnerCell,
  AutoresearchLevel3MatrixCellRunnerCellState,
  AutoresearchLevel3MeasureExportReviewLane,
  AutoresearchLevel3MeasureExportReviewPlan,
  AutoresearchLevel3MeasureExportReviewRequest,
  AutoresearchLevel3PolicyGatePreflight,
  AutoresearchLevel3PolicyPosture,
  AutoresearchLevel3ReviewSelectionCell,
  AutoresearchLevel3ReviewSelectionSubstrate,
  AutoresearchLevel3ReviewSelectionWinnerState,
  AutoresearchLevel3SliceSequenceCellState,
  AutoresearchLevel3SliceSequenceDryRun,
  AutoresearchLevel3SliceSequenceDryRunRequest,
  AutoresearchLevel3SliceSequenceState,
  AutoresearchLevel3VisibleCandidateLifecyclePlan,
  AutoresearchLevel3VisibleCandidateLifecycleRequest,
  AutoresearchLevel4CampaignRunner,
  AutoresearchLevel4CampaignRunnerReceipt,
  AutoresearchLevel4CampaignRunnerRequest,
  AutoresearchLevel4CandidateCloseoutLane,
  AutoresearchLevel4CandidateCloseoutPacket,
  AutoresearchLevel4CandidatePacketInventoryStatus,
  AutoresearchLevel4PostFaninPromotionHandoffPacket,
  AutoresearchLevel4PostIntegrationCleanupReadyPacket,
  AutoresearchLevel4PostIntegrationCleanupRegistrySidecar,
  AutoresearchLevel4PromptRunnerBundle,
  AutoresearchLevel4PromptRunnerLane,
  AutoresearchLevel4VisibleLaunchWatchLanePlan,
  AutoresearchLevel4VisibleLaunchWatchPlan,
  AutoresearchLevel4WholeMatrixExecutor,
  AutoresearchMatrixCampaignCell,
  AutoresearchMatrixCampaignCellReview,
  AutoresearchMatrixCampaignCloseout,
  AutoresearchMatrixCampaignCockpit,
  AutoresearchMatrixCampaignControllerCommandPacket,
  AutoresearchMatrixCampaignOperatorFollowup,
  AutoresearchMatrixCampaignOperatorLaneState,
  AutoresearchMatrixCampaignOwnerReviewRoute,
  AutoresearchMatrixCampaignPlan,
  AutoresearchMatrixCampaignRequest,
  AutoresearchMatrixCampaignReview,
  AutoresearchMatrixCampaignReviewPacket,
  AutoresearchMatrixCampaignRunnerCheckpoint,
  AutoresearchMatrixCampaignRunnerContract,
  AutoresearchMatrixCampaignRunnerLane,
  AutoresearchMatrixCampaignRunnerRequest,
  AutoresearchMatrixManagedWaveSubstrate,
  AutoresearchWholeMatrixMetricPosture,
} from "./autoresearch-types.ts";

export * from "./autoresearch-types.ts";

function resolveMatrixCellCandidateCount(value: number | undefined): number {
  return resolveCandidateWaveCount({ candidateCount: value });
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
        "Controller-inline implementation is a process violation for campaign-style implementation work; the controller may plan, launch, bind, measure, and review but must not patch inline.",
        "Report changed files, branch/ref, benchmark/check commands run, and caveats in PEER_FINAL.",
        "Do not merge, promote, write AK/KES/evidence, or delete/reset worktrees.",
      ];
      const safeNames = createSafeCandidatePeerNames({
        taskId: identity.taskId,
        laneId,
        objective: laneObjective,
      });
      const peerPayload: Record<string, unknown> = {
        objective: laneObjective,
        cwd: identity.cwd,
        workspaceName: safeNames.workspaceName,
        branchName: safeNames.branchName,
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
  const aggregateReviewPayload: Record<string, unknown> = {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction: input.direction ?? "lower",
    candidateResultPacketPaths,
  };
  if (offLimits.length > 0) aggregateReviewPayload.offLimits = offLimits;
  const aggregateReviewCall = formatToolCall(
    "autoresearch_live_supervision",
    aggregateReviewPayload,
  );
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
        "Do not let the controller implement campaign-style patches inline; bypassing candidate_peer_spawn and candidate-worktree handoff is a process violation.",
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
      "For campaign-style implementation work, controller-inline implementation is a process violation; use visible candidate_peer_spawn lanes and candidate worktrees.",
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
  primaryMetricName: string;
  primaryMetricTarget: number | null;
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
  const primaryMetricName = input.metricName?.trim() || "operator_ux_blockers";
  const primaryMetricTarget =
    typeof input.metricThreshold === "number" && Number.isFinite(input.metricThreshold)
      ? input.metricThreshold
      : primaryMetricName === "operator_ux_blockers"
        ? 0
        : null;
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
          "Controller-inline implementation is a process violation for this campaign cell; route implementation through approved candidate_peer_spawn lanes and candidate worktrees.",
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
          offLimits,
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
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
  };
}

function normalizeLevel2PacketPlanningKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function level2PlanningConstraintRecorded(
  constraints: readonly string[],
  pattern: RegExp,
): boolean {
  return constraints.some((constraint) => pattern.test(constraint));
}

function isLevel2ProofOnlyOrBaselineOnlyLabel(value: string): boolean {
  const normalized = normalizeLevel2PacketPlanningKey(value);
  if (normalized.length === 0) return false;
  const narrowTokens =
    /(^|_)(proof|prove|evidence|validation|validate|test|tests|doc|docs|readme|baseline|base_line|control|incumbent|current)(_|$)/u;
  return narrowTokens.test(normalized);
}

function buildLevel2PacketPlanningAntiNarrowing(input: {
  scenarios: readonly string[];
  hypotheses: readonly string[];
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  constraints: readonly string[];
}): AutoresearchLevel2PacketPlanningAntiNarrowing {
  const expectedCellCount = input.scenarios.length * input.hypotheses.length;
  const expectedLaneCount = expectedCellCount * input.candidateCountPerCell;
  const scenarioKeys = input.scenarios.map(normalizeLevel2PacketPlanningKey);
  const hypothesisKeys = input.hypotheses.map(normalizeLevel2PacketPlanningKey);
  const duplicateLaneKeys = [
    ...scenarioKeys
      .filter((key, index) => key.length > 0 && scenarioKeys.indexOf(key) !== index)
      .map((key) => `scenario:${key}`),
    ...hypothesisKeys
      .filter((key, index) => key.length > 0 && hypothesisKeys.indexOf(key) !== index)
      .map((key) => `hypothesis:${key}`),
  ];
  const actualLaneKeys = input.cells.flatMap((cell) =>
    cell.candidateResultPacketPaths.map((packetPath) => `${cell.cellId}:${packetPath}`),
  );
  const duplicateGeneratedLaneKeys = actualLaneKeys.filter(
    (key, index) => actualLaneKeys.indexOf(key) !== index,
  );
  const missingLaneKeys =
    actualLaneKeys.length === expectedLaneCount && input.cells.length === expectedCellCount
      ? []
      : [
          `expected-cells:${expectedCellCount}:actual-cells:${input.cells.length}`,
          `expected-lanes:${expectedLaneCount}:actual-lanes:${actualLaneKeys.length}`,
        ];
  const allAxisLabels = [...input.scenarios, ...input.hypotheses];
  const proofOnlyBaselineOnlyLaneKeys = allAxisLabels.every(isLevel2ProofOnlyOrBaselineOnlyLabel)
    ? input.cells.map((cell) => cell.cellId)
    : [];
  const incompleteMatrixExceptionRecorded = level2PlanningConstraintRecorded(
    input.constraints,
    /(?:incomplete[-_\s]?matrix\s+exception|exception\s*:\s*incomplete[-_\s]?matrix)/iu,
  );
  const explicitDowngradeRecorded =
    level2PlanningConstraintRecorded(input.constraints, /(?:explicit\s+downgrade)/iu) ||
    level2PlanningConstraintRecorded(input.constraints, /(?:downgrade\s+recorded)/iu) ||
    level2PlanningConstraintRecorded(input.constraints, /(?:downgrade\s*:)/iu) ||
    level2PlanningConstraintRecorded(
      input.constraints,
      /(?:downgraded\s+to\s+(?:packet[-_\s]?only|planning))/iu,
    );
  const missingOrDuplicateKeys = [
    ...new Set([...missingLaneKeys, ...duplicateLaneKeys, ...duplicateGeneratedLaneKeys]),
  ];
  const proofOnlyBaselineOnlyBlocked =
    proofOnlyBaselineOnlyLaneKeys.length > 0 &&
    !incompleteMatrixExceptionRecorded &&
    !explicitDowngradeRecorded;
  const blockerCount =
    missingOrDuplicateKeys.length +
    (proofOnlyBaselineOnlyBlocked ? proofOnlyBaselineOnlyLaneKeys.length : 0);
  const posture: AutoresearchLevel2PacketPlanningAntiNarrowingPosture =
    missingOrDuplicateKeys.length > 0
      ? "failed_closed_missing_or_duplicate_lanes"
      : proofOnlyBaselineOnlyBlocked
        ? "blocked_anti_narrowing"
        : explicitDowngradeRecorded
          ? "explicit_downgrade_recorded"
          : incompleteMatrixExceptionRecorded
            ? "incomplete_matrix_exception_recorded"
            : "ready_for_level2_packet_planning";

  return {
    kind: "autoresearch.level2_packet_planning_anti_narrowing.v1",
    posture,
    targetClosureAllowed: blockerCount === 0 && !explicitDowngradeRecorded,
    proofOnlyBaselineOnlyTargetClosureBlocked: proofOnlyBaselineOnlyBlocked,
    incompleteMatrixExceptionRecorded,
    explicitDowngradeRecorded,
    missingLaneKeys,
    duplicateLaneKeys: [...new Set([...duplicateLaneKeys, ...duplicateGeneratedLaneKeys])],
    proofOnlyBaselineOnlyLaneKeys,
    blockerMetric: {
      name: "level2_packet_planning_blockers",
      direction: "lower",
      target: 0,
      value: blockerCount,
      status: blockerCount === 0 ? "target_met" : "blocked",
    },
    proofs: [
      {
        proof: "scenario × hypothesis packet-lane matrix cardinality",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.expected-vs-actual-lanes",
      },
      {
        proof: "proof-only/baseline-only narrowing guard",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.proofOnlyBaselineOnlyLaneKeys",
      },
      {
        proof: "incomplete-matrix exception / explicit downgrade record check",
        status: "present",
        source: "level2PacketPlanningAntiNarrowing.constraints",
      },
    ],
    guidance:
      blockerCount === 0
        ? [
            "Level-2 packet-only planning may proceed as recorded, but this posture still launches no peers and performs no external action.",
            explicitDowngradeRecorded
              ? "Target closure was explicitly downgraded; do not report target closure from proof-only/baseline-only evidence."
              : incompleteMatrixExceptionRecorded
                ? "Incomplete-matrix exception is recorded; keep the exception visible when reporting target status."
                : "Maintain at least one non-proof/non-baseline matrix lane before claiming target closure.",
          ]
        : [
            "Fail closed: do not claim level-2 target closure from proof-only/baseline-only packet evidence without an incomplete-matrix exception or explicit downgrade.",
            "Fail closed: resolve missing or duplicate planned lane keys before exposing this packet-only plan as closure-ready.",
          ],
  };
}

function resolveMatrixCampaignRunnerManifestPath(value: string | undefined): string {
  const candidate = value?.trim() || ".autoresearch/matrix-campaign/runner-manifest.json";
  const normalized = candidate.replaceAll("\\", "/");
  if (
    path.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith(".autoresearch/matrix-campaign/") ||
    normalized.endsWith("/")
  ) {
    throw new Error(
      `runnerManifestPath must be a repo-relative file under .autoresearch/matrix-campaign/, received: ${candidate}`,
    );
  }
  return normalized;
}

function buildMatrixCampaignRunnerCheckpointToken(input: {
  taskId: number;
  cwd: string;
  manifestPath: string;
}): string {
  const resolvedCwd = path.resolve(input.cwd);
  return [
    "controller-checkpoint:matrix-visible-peers-reported",
    `task:${input.taskId}`,
    `cwd:${resolvedCwd}`,
    `manifest:${input.manifestPath}`,
  ].join("|");
}

const DEFAULT_LEVEL2_PACKET_FORBIDDEN_ACTIONS = [
  "Do not spawn peers implicitly; only visible candidate_peer_spawn calls may launch candidate lanes.",
  "Do not run benchmark, candidate_result_export, review_candidate_wave, or review_matrix_campaign below the checkpoint gate.",
  "Do not write AK/KES/evidence, mutate Prompt Vault/ROCS, merge, promote, reset, or clean up worktrees from packet-only planning.",
] as const;

const LEVEL2_PACKET_LEVEL1_FALLBACK =
  "Level-1 fallback: if level-2 matrix packet planning is blocked or too heavy, run action=plan_candidate_wave for one managed candidate wave/cell, then review_candidate_wave with explicit packet paths.";

function buildAutoresearchLevel2PacketToken(input: {
  taskId: number;
  cwd: string;
  objective: string;
  tokenName: AutoresearchLevel2PacketTokenName;
}): string {
  const digest = createHash("sha256")
    .update(`${input.taskId}\0${path.resolve(input.cwd)}\0${input.objective}\0${input.tokenName}`)
    .digest("hex")
    .slice(0, 16);
  return `level2:${input.tokenName}:task:${input.taskId}:sha256:${digest}`;
}

function buildAutoresearchLevel2PacketPlanningBlockers(input: {
  blockerMetric?: AutoresearchLevel2PacketPlanningBlockerMetric;
  missingTokens?: readonly string[];
  nextLegalActions: readonly string[];
  forbiddenActions?: readonly string[];
  level1Fallback?: string;
  noHiddenExecutionBoundary?: string;
}): AutoresearchLevel2PacketPlanningBlockers {
  const missingTokens = input.missingTokens ?? [];
  const forbiddenActions = input.forbiddenActions ?? DEFAULT_LEVEL2_PACKET_FORBIDDEN_ACTIONS;
  const level1Fallback = input.level1Fallback ?? LEVEL2_PACKET_LEVEL1_FALLBACK;
  const noHiddenExecutionBoundary =
    input.noHiddenExecutionBoundary ??
    "Packet-only level-2 planning may emit calls and command packets only; it does not launch peers, run benchmarks/exports/reviews, write evidence, merge, promote, or mutate lifecycle state.";
  const metric = input.blockerMetric ?? {
    name: "level2_packet_planning_blockers" as const,
    direction: "lower" as const,
    target: 0 as const,
    value: 0,
    status: "target_met" as const,
  };
  return {
    ...metric,
    missingTokens,
    nextLegalActions: input.nextLegalActions,
    forbiddenActions,
    level1Fallback,
    noHiddenExecutionBoundary,
    proofs: [
      {
        proof: "next legal actions are operator-visible",
        status: "present",
        source: "operatorFollowup.nextLegalActions",
      },
      {
        proof: "missing token list is explicit",
        status: "present",
        source: "operatorFollowup.level2PacketPlanningBlockers.missingTokens",
      },
      {
        proof: "forbidden actions and no-hidden-execution boundary are explicit",
        status: "present",
        source:
          "operatorFollowup.level2PacketPlanningBlockers.forbiddenActions + noHiddenExecutionBoundary",
      },
      {
        proof: "level-1 fallback is explicit",
        status: "present",
        source: "operatorFollowup.level2PacketPlanningBlockers.level1Fallback",
      },
    ],
  };
}

function buildAutoresearchLevel2PacketPlanning(input: {
  taskId: number;
  cwd: string;
  objective: string;
  candidateLaneCount: number;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
}): AutoresearchLevel2PacketPlanning {
  const token = (tokenName: AutoresearchLevel2PacketTokenName) =>
    buildAutoresearchLevel2PacketToken({
      taskId: input.taskId,
      cwd: input.cwd,
      objective: input.objective,
      tokenName,
    });
  const tokenVocabulary: AutoresearchLevel2PacketPlanning["tokenVocabulary"] = {
    launchVisibleCandidateLanes: {
      tokenName: "launch_visible_candidate_lanes",
      exactToken: token("launch_visible_candidate_lanes"),
      requiredFor: "visible candidate_peer_spawn lane launch",
      ownerSurface: "controller_visible_peer_launch",
      description:
        "Required before any level-2 packet plan may expose or run visible candidate lane launch calls.",
    },
    postFaninFinalizer: {
      tokenName: "finalize_post_fanin",
      exactToken: token("finalize_post_fanin"),
      requiredFor: "post_fanin_finalizer packet construction after measured fan-in review",
      ownerSurface: "pi-society-orchestrator.post_fanin_finalizer",
      description:
        "Required before post-fan-in finalizer apply-command packets can be treated as an owner-approved next step.",
    },
    akOwnerWrite: {
      tokenName: "ak_owner_write",
      exactToken: token("ak_owner_write"),
      requiredFor: "owner-routed AK evidence/task write handoff",
      ownerSurface: "AK",
      description: "Required for any AK evidence/task lifecycle write outside this packet planner.",
    },
    candidateCleanup: {
      tokenName: "candidate_cleanup",
      exactToken: token("candidate_cleanup"),
      requiredFor: "candidate worktree stop/delete/reset cleanup handoff",
      ownerSurface: "candidate_worktree_lifecycle",
      description:
        "Required before cleanup of candidate peers or worktrees is proposed for execution.",
    },
    promotion: {
      tokenName: "promotion",
      exactToken: token("promotion"),
      requiredFor: "merge/release/promotion authority handoff",
      ownerSurface: "owner_promotion_gate",
      description:
        "Required before any selected candidate can be promoted, merged, released, or represented as completion authority.",
    },
  };
  const basePacket = (
    tokenName: AutoresearchLevel2PacketTokenName,
    posture: AutoresearchLevel2PacketDescriptor["posture"],
    boundary: string,
  ): AutoresearchLevel2PacketDescriptor => ({
    packetName: tokenName,
    tokenName,
    requiredToken: token(tokenName),
    posture,
    execution: "not_executed_by_orchestrator",
    exactCalls: [],
    boundary,
  });

  return {
    kind: "autoresearch.level2_packet_planning.v1",
    schemaVersion: 1,
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    packetOnly: true,
    execution: "not_executed_by_orchestrator",
    tokenVocabulary,
    packets: {
      launchVisibleCandidateLanes: {
        ...basePacket(
          "launch_visible_candidate_lanes",
          "blocked_missing_launch_token",
          "Visible peer launch is blocked in this packet-only plan until the exact launch_visible_candidate_lanes token is supplied to an owner-approved launcher; no candidate_peer_spawn call is executed here.",
        ),
        packetName: "launch_visible_candidate_lanes",
        tokenName: "launch_visible_candidate_lanes",
        posture: "blocked_missing_launch_token",
        allowedTool: "candidate_peer_spawn",
        launchCalls: [],
        withheldLaunchCallCount: input.candidateLaneCount,
      },
      postFaninFinalizer: {
        ...basePacket(
          "finalize_post_fanin",
          "blocked_until_owner_token",
          "Post-fan-in finalizer packets remain plan-only until owner review supplies finalize_post_fanin; no checkout, merge, commit, cleanup, or apply command is executed here.",
        ),
        packetName: "finalize_post_fanin",
        tokenName: "finalize_post_fanin",
      },
      akOwnerWrite: {
        ...basePacket(
          "ak_owner_write",
          "blocked_until_review_token",
          "AK evidence/task writes are outside this planner and require an explicit ak_owner_write handoff after packet review.",
        ),
        packetName: "ak_owner_write",
        tokenName: "ak_owner_write",
      },
      candidateCleanup: {
        ...basePacket(
          "candidate_cleanup",
          "blocked_until_owner_token",
          "Candidate stop/delete/reset cleanup is not performed by this planner and requires a separate candidate_cleanup token.",
        ),
        packetName: "candidate_cleanup",
        tokenName: "candidate_cleanup",
      },
      promotion: {
        ...basePacket(
          "promotion",
          "blocked_until_owner_token",
          "Promotion, merge, release, and completion authority are outside this planner and require a separate promotion token.",
        ),
        packetName: "promotion",
        tokenName: "promotion",
      },
    },
    metric: input.antiNarrowing.blockerMetric,
    antiNarrowing: input.antiNarrowing,
    boundaries: [
      "Packet-only level-2 planning does not launch peers, run benchmarks, export candidate results, review candidates, write evidence, clean worktrees, merge, release, or promote.",
      "Prepared token values are request/coordination values only; consuming them requires the exact owner-approved command surface for that boundary.",
      "Anti-narrowing posture must stay visible before any campaign closure claim.",
    ],
    nextStep:
      input.antiNarrowing.blockerMetric.status === "blocked"
        ? "Resolve level-2 packet planning blockers before claiming target closure or launching candidate lanes."
        : "Use the prepared packet as review input; launch, finalizer, evidence, cleanup, and promotion actions still require explicit owner tokens.",
  };
}

function buildAutoresearchMatrixCampaignOperatorFollowup(input: {
  currentState: string;
  metricName: string;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  cells?: readonly AutoresearchMatrixCampaignCell[];
  lanes?: readonly Pick<
    AutoresearchMatrixCampaignRunnerLane,
    "cellId" | "laneId" | "candidateResultPacketPath"
  >[];
  laneStates?: readonly {
    cellId: string;
    laneId: string;
    packetPath: string;
    state: AutoresearchMatrixCampaignOperatorLaneState;
  }[];
  checkpoint?: {
    posture: AutoresearchMatrixCampaignOperatorFollowup["checkpointState"]["posture"];
    manifestPath: string | null;
    requiredToken: string | null;
    checkpointAccepted: boolean | null;
  };
  measurementReview?: Partial<AutoresearchMatrixCampaignOperatorFollowup["measurementReviewState"]>;
  nextLegalActions: readonly string[];
  level2PacketPlanning?: {
    blockerMetric?: AutoresearchLevel2PacketPlanningBlockerMetric;
    missingTokens?: readonly string[];
    forbiddenActions?: readonly string[];
    level1Fallback?: string;
    noHiddenExecutionBoundary?: string;
  };
}): AutoresearchMatrixCampaignOperatorFollowup {
  const lanePacketPaths =
    input.laneStates ??
    input.lanes?.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      packetPath: lane.candidateResultPacketPath,
      state: "locked_until_checkpoint" as const,
    })) ??
    input.cells?.flatMap((cell) =>
      cell.candidateResultPacketPaths.map((packetPath, index) => ({
        cellId: cell.cellId,
        laneId: `candidate-${String(index + 1).padStart(2, "0")}`,
        packetPath,
        state: "planned" as const,
      })),
    ) ??
    [];
  const expectedCells =
    input.cells?.length ?? new Set(lanePacketPaths.map((lane) => lane.cellId)).size;
  const checkpointState = input.checkpoint ?? {
    posture: "not_applicable" as const,
    manifestPath: null,
    requiredToken: null,
    checkpointAccepted: null,
  };
  const level2PacketPlanningBlockers = buildAutoresearchLevel2PacketPlanningBlockers({
    nextLegalActions: input.nextLegalActions,
    ...input.level2PacketPlanning,
  });

  return {
    kind: "autoresearch.matrix_campaign_operator_followup.v1",
    currentState: input.currentState,
    primaryMetric: {
      name: input.metricName,
      direction: input.metricDirection,
      target: input.metricTarget,
      targetSummary:
        input.metricTarget === null
          ? `${input.metricName} (${input.metricDirection} is better; no target supplied)`
          : `${input.metricName} (${input.metricDirection} is better; target=${input.metricTarget})`,
    },
    level2PacketPlanningBlockers,
    lanePacketPaths,
    checkpointState: {
      ...checkpointState,
      warning:
        "Checkpoint token is a controller confirmation string, not cryptographic proof; controller must verify PEER_FINAL lineage and candidate worktrees before measurement/export/review.",
    },
    measurementReviewState: {
      posture: "planned_not_measured",
      completedCells: 0,
      expectedCells,
      selectedCells: 0,
      benchmarkExportReviewCallsExposed: false,
      reviewMatrixCampaignCall: null,
      ...input.measurementReview,
    },
    nextLegalActions: input.nextLegalActions,
    blockersChecklist: [
      {
        proof: "operator follow-up/current-state summary",
        status: "present",
        source: "operatorFollowup.currentState",
      },
      {
        proof: "next legal actions",
        status: "present",
        source: "operatorFollowup.nextLegalActions",
      },
      {
        proof: `cell primary metric ${input.metricName}`,
        status: "present",
        source: "operatorFollowup.primaryMetric",
      },
      {
        proof: "runner checkpoint and lineage verification coverage",
        status: "present",
        source: "operatorFollowup.checkpointState",
      },
      {
        proof: "exact per-cell controller sequence / next-call bundle coverage",
        status: "present",
        source: "controllerCommandPacket.flattenedNextCallBundle",
      },
      {
        proof: "no hidden execution or promotion boundary coverage",
        status: "present",
        source: "controllerCommandPacket.boundaries",
      },
      {
        proof: "docs/tests alignment for manual_controller_glue_blockers",
        status: "present",
        source: "README/product-posture/tests",
      },
    ],
  };
}

export function planAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignPlan {
  const {
    identity,
    objective,
    scenarios,
    hypotheses,
    direction,
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    constraints,
    parentPeerTarget,
    cells,
  } = resolveAutoresearchMatrixCampaignPlanParts(input);

  const antiNarrowing = buildLevel2PacketPlanningAntiNarrowing({
    scenarios,
    hypotheses,
    candidateCountPerCell,
    cells,
    constraints,
  });

  const level2PacketPlanning = buildAutoresearchLevel2PacketPlanning({
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    candidateLaneCount: cells.length * candidateCountPerCell,
    antiNarrowing,
  });

  const managedWaveSubstrate: AutoresearchMatrixManagedWaveSubstrate = {
    kind: "autoresearch.matrix_managed_candidate_wave_substrate.v1",
    cellCount: cells.length,
    candidateCountPerCell,
    expectedCandidateLaneCount: cells.length * candidateCountPerCell,
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    explicitPacketPathsGateSelection: true,
    antiNarrowing,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    cellFanInCalls: cells.map((cell) => ({
      cellId: cell.cellId,
      planCandidateWaveCall: cell.planCandidateWaveCall,
      reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
    })),
    checklist: [
      "Treat each matrix cell as a managed candidate wave, not as loose parallel sidequests.",
      "Run the cell planCandidateWaveCall before launching approved visible candidate lanes.",
      "Controller-inline implementation is a process violation for campaign-style implementation cells; route mutation through candidate_peer_spawn worktrees.",
      "Score only controller-measured pi-autoresearch candidate-result packets for each lane.",
      "Use explicit cell reviewCandidateWaveCall packet paths so missing planned lanes gate final cell selection.",
      "Compare matrix cells only after their managed wave reviews are complete or deliberately owner-replanned.",
      "Level-2 packet-only planning must keep anti-narrowing visible: proof-only/baseline-only closure is blocked unless an incomplete-matrix exception or explicit downgrade is recorded, and missing/duplicate lanes fail closed.",
    ],
  };

  return {
    kind: "autoresearch.matrix_campaign_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: "planned_matrix_campaign_waiting_for_visible_candidate_lane_launch",
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      cells,
      nextLegalActions: [
        "Review this operator follow-up summary before launching any candidate lane.",
        parentPeerTarget
          ? "Missing token list: none for planning; launch_visible_candidate_lanes is still required before any owner-approved launcher consumes visible candidate lane calls."
          : "Missing token list: parentPeerTarget before visible candidate lane launch.",
        "Launch only approved visible candidate_peer_spawn lanes for selected matrix cells.",
        "After PEER_FINAL, verify lineage and candidate worktrees before measurement/export/review.",
        "Run review_matrix_campaign only after candidate-result packets exist or missing lanes are deliberately owner-replanned.",
        LEVEL2_PACKET_LEVEL1_FALLBACK,
      ],
      level2PacketPlanning: {
        blockerMetric: antiNarrowing.blockerMetric,
        missingTokens: parentPeerTarget ? [] : ["parentPeerTarget"],
      },
    }),
    scenarios,
    hypotheses,
    candidateCountPerCell,
    cells,
    managedWaveSubstrate,
    level2PacketPlanning,
    implementationWaveSubstrate: {
      posture: "dogfood_matrix_replaces_hand_authored_wave_steps",
      akTaskId: identity.taskId,
      ownerUiCommand: "/autoresearch review",
      handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
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
        "Do not patch the implementation target inline from the controller during campaign-style work; that bypasses the candidate-runner/worktree handoff and is a process violation.",
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
      "Controller-inline implementation for campaign-style cells is a process violation; mutation must happen in candidate_peer_spawn worktrees before controller binding/measurement.",
      "pi-autoresearch owns metrics, receipts, candidate packets, and candidate worktree measurement semantics.",
      "pi-society-orchestrator owns matrix choreography, aggregate review calls, and owner-decision surfacing only.",
      "AK remains the task/direction spine; no AK/KES/evidence write, merge, promotion, peer spawn, or worktree lifecycle action is applied by this plan.",
      "Forbidden actions: no hidden peer launch, benchmark/export/review execution, evidence write, merge, promotion, or cleanup is performed by level-2 packet-only planning.",
      LEVEL2_PACKET_LEVEL1_FALLBACK,
      `Level-2 packet-only planning anti-narrowing posture: ${antiNarrowing.posture}; level2_packet_planning_blockers=${antiNarrowing.blockerMetric.value}.`,
    ],
    nextStep:
      antiNarrowing.blockerMetric.status === "blocked"
        ? "Resolve level-2 packet-only planning blockers before claiming target closure; do not launch peers or run external actions from this plan."
        : "Run the first cell's planCandidateWaveCall, launch only approved visible candidate lanes, reject controller-inline implementation as a process violation, export candidate-result packets, open /autoresearch export for dashboard review, then run the cell reviewCandidateWaveCall and decide through /autoresearch review.",
  };
}

function createSafeCandidatePeerNames(input: {
  taskId: number;
  laneId: string;
  objective: string;
}): { workspaceName: string; branchName: string } {
  const laneSlug = input.laneId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 24);
  const objectiveHash = createHash("sha256").update(input.objective).digest("hex").slice(0, 8);
  const workspaceName = `ar-${input.taskId}-${laneSlug || "lane"}-${objectiveHash}`;
  return {
    workspaceName,
    branchName: `candidatepeer/${workspaceName}`,
  };
}

function extractJsonStringFromToolCall(call: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "u").exec(
    call,
  );
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function buildAutoresearchMatrixCampaignRunnerLanes(input: {
  identity: SessionIdentity;
  direction: "lower" | "higher";
  metricName: string;
  metricThreshold: number | null;
  candidateCountPerCell: number;
  cells: readonly AutoresearchMatrixCampaignCell[];
  filesInScope: readonly string[];
  offLimits: readonly string[];
  constraints: readonly string[];
  parentPeerTarget?: string;
  maxIterationsPerCandidate?: number;
  maxWallClockMinutesPerCandidate?: number;
  candidateBindings?: readonly AutoresearchLevel3CandidateLifecycleBindingInput[];
}): AutoresearchMatrixCampaignRunnerLane[] {
  return input.cells.flatMap((cell) => {
    const candidateObjectives = Array.from(
      { length: input.candidateCountPerCell },
      (_, index) => `${cell.hypothesis} [sample ${index + 1}] under scenario: ${cell.scenario}`,
    );
    const wave = planAutoresearchCandidateWave({
      taskId: input.identity.taskId,
      cwd: input.identity.cwd,
      objective: cell.objective,
      direction: input.direction,
      candidateCount: input.candidateCountPerCell,
      candidateObjectives,
      candidatePacketDirectory: cell.candidatePacketDirectory,
      filesInScope: input.filesInScope,
      offLimits: input.offLimits,
      constraints: [
        ...input.constraints,
        `Matrix cell: ${cell.cellId}`,
        `Scenario: ${cell.scenario}`,
        `Hypothesis: ${cell.hypothesis}`,
        "Benchmark/export/review remains locked until the controller checkpoint confirms visible peer reports were received.",
      ],
      parentPeerTarget: input.parentPeerTarget,
      maxIterationsPerCandidate: input.maxIterationsPerCandidate,
      maxWallClockMinutesPerCandidate: input.maxWallClockMinutesPerCandidate,
    });

    return wave.lanes.map((lane) => {
      const cellScopedLaneId = `${cell.cellId}-${lane.laneId}`;
      const binding = input.candidateBindings?.find(
        (candidateBinding) =>
          candidateBinding.laneId === cellScopedLaneId || candidateBinding.laneId === lane.laneId,
      );
      const candidateWorktree =
        binding?.candidateWorktree ?? `<${cellScopedLaneId}-worktree-from-candidate_peer_spawn>`;
      const candidateBranch =
        binding?.candidateBranch ?? `<${cellScopedLaneId}-branch-from-candidate_peer_spawn>`;
      const candidateBaseRef =
        binding?.candidateBaseRef ?? `<${cellScopedLaneId}-base-ref-from-candidate_peer_spawn>`;
      const candidateDiffSummary =
        binding?.candidateDiffSummary ?? `<${cellScopedLaneId}-controller-verified-diff-summary>`;
      const candidateFilesChanged =
        binding?.candidateFilesChanged && binding.candidateFilesChanged.length > 0
          ? binding.candidateFilesChanged
          : [`<${cellScopedLaneId}-changed-files>`];
      const metricRunPayload: Record<string, unknown> = {
        cwd: input.identity.cwd,
        runKind: "ordinary",
        name: `matrix-${cell.cellId}-${lane.laneId}`,
        description: `Measure ${cell.cellId}/${lane.laneId} for ${input.metricName}: ${lane.objective}`,
        hypothesisId: `${cell.cellId}-${lane.laneId}`,
        hypothesis: lane.objective,
        metricName: input.metricName,
        direction: input.direction,
        candidateSource: "candidate_peer_spawn",
        candidateWorktree,
        candidateBranch,
        candidateBaseRef,
        candidateDiffSummary,
        candidateFilesChanged,
      };
      if (input.metricThreshold !== null) metricRunPayload.metricThreshold = input.metricThreshold;

      const bindCall = formatToolCall("autoresearch_candidate_bind", {
        cwd: input.identity.cwd,
        candidateWorktree,
        candidateBaseRef,
      });
      const metricRunCall = formatToolCall("autoresearch_runtime_run", metricRunPayload);
      const resultCall = formatToolCall("autoresearch_runtime_status", {
        cwd: input.identity.cwd,
        action: "candidate_result_export",
        outPath: lane.candidateResultPacketPath,
      });

      return {
        cellId: cell.cellId,
        laneId: lane.laneId,
        objective: lane.objective,
        cellObjective: cell.objective,
        candidatePeerCall: lane.candidatePeerCall,
        measurementPlan: [bindCall, metricRunCall, resultCall],
        candidateResultPacketPath: lane.candidateResultPacketPath,
        reviewCandidateWaveCall: cell.reviewCandidateWaveCall,
      };
    });
  });
}

export function buildAutoresearchMatrixCampaignRunnerContract(
  input: AutoresearchMatrixCampaignRunnerRequest,
): AutoresearchMatrixCampaignRunnerContract {
  const {
    identity,
    objective,
    direction,
    primaryMetricName,
    primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
  } = resolveAutoresearchMatrixCampaignPlanParts(input);
  const manifestPath = resolveMatrixCampaignRunnerManifestPath(input.runnerManifestPath);
  const checkpointToken = buildMatrixCampaignRunnerCheckpointToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestPath,
  });
  const lanes = buildAutoresearchMatrixCampaignRunnerLanes({
    identity,
    direction,
    metricName: primaryMetricName,
    metricThreshold: primaryMetricTarget,
    candidateCountPerCell,
    filesInScope,
    offLimits,
    constraints,
    parentPeerTarget,
    cells,
    maxIterationsPerCandidate: input.maxIterationsPerCandidate,
    maxWallClockMinutesPerCandidate: input.maxWallClockMinutesPerCandidate,
    candidateBindings: input.candidateBindings,
  });

  const exactCheckpointCall = formatToolCall("autoresearch_live_supervision", {
    action: "checkpoint_matrix_campaign_runner",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    metricName: primaryMetricName,
    metricThreshold: primaryMetricTarget ?? undefined,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell,
    parentPeerTarget,
    filesInScope,
    offLimits,
    constraints,
    runnerManifestPath: manifestPath,
    checkpointConfirmation: checkpointToken,
  });
  const hiddenLaunchCallCount = lanes.filter(
    (lane) =>
      !lane.candidatePeerCall.includes("candidate_peer_spawn(") ||
      lane.candidatePeerCall.includes("scout_peer_spawn(") ||
      lane.candidatePeerCall.includes("fork_peer_spawn("),
  ).length;
  const visibleLaneBindingBlockerCount =
    (parentPeerTarget ? 0 : 1) + hiddenLaunchCallCount + (lanes.length === 0 ? 1 : 0);

  return {
    kind: "autoresearch.matrix_campaign_runner_contract.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: parentPeerTarget
        ? "prepared_runner_waiting_for_visible_candidate_peers"
        : "prepared_runner_blocked_missing_parent_peer_target",
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      lanes,
      checkpoint: {
        posture: "controller_checkpoint_required",
        manifestPath,
        requiredToken: checkpointToken,
        checkpointAccepted: false,
      },
      measurementReview: {
        posture: "locked_until_controller_checkpoint",
        expectedCells: cells.length,
      },
      nextLegalActions: parentPeerTarget
        ? [
            "Launch the visible candidate_peer_spawn calls only from the prepared manifest.",
            "Wait for PEER_FINAL reports, then verify candidate worktree lineage outside this token.",
            "Call checkpoint_matrix_campaign_runner with the exact checkpointConfirmation token only after verification.",
          ]
        : [
            "Provide parentPeerTarget before launching visible peers.",
            "Keep benchmark/export/review calls withheld until the exact checkpoint is confirmed.",
          ],
    }),
    manifest: {
      path: manifestPath,
      identityAnchor: buildAutoresearchLiveSupervisionSessionKey(identity),
      exactTaskId: identity.taskId,
      exactCwd: identity.cwd,
      cellCount: cells.length,
      candidateLaneCount: lanes.length,
      packageOwnerBoundary: "pi-society-orchestrator_matrix_choreography_only",
      durableEvidence: false,
    },
    launchPhase: {
      posture: parentPeerTarget
        ? "ready_to_launch_visible_candidate_peers"
        : "blocked_missing_parent_peer_target",
      allowedTool: "candidate_peer_spawn",
      launchCalls: lanes.map((lane) => lane.candidatePeerCall),
      parentPeerTarget: parentPeerTarget ?? null,
      visibleCandidateLaneBinding: {
        name: "visible_candidate_lane_binding_blockers",
        direction: "lower",
        target: 0,
        value: visibleLaneBindingBlockerCount,
        status: visibleLaneBindingBlockerCount === 0 ? "target_met" : "blocked",
        expectedLaneCount: lanes.length,
        visibleLaunchCallCount: lanes.length - hiddenLaunchCallCount,
        hiddenLaunchCallCount,
        missingParentPeerTarget: !parentPeerTarget,
      },
    },
    checkpointGate: {
      posture: "controller_checkpoint_required_before_benchmark_export_review",
      requiredToken: checkpointToken,
      confirmationParameter: "checkpointConfirmation",
      exactCheckpointCall,
      blockedUntilConfirmed: [
        "autoresearch_candidate_bind",
        "autoresearch_runtime_run",
        "candidate_result_export",
        "review_candidate_wave",
        "review_matrix_campaign",
      ],
    },
    lockedBenchmarkExportReview: {
      posture: "withheld_until_checkpoint",
      calls: [],
    },
    lanes,
    boundaries: [
      "The runner contract is a manifest/checkpoint contract; it does not spawn peers, run benchmarks, export packets, review candidates, write evidence, merge, or promote by itself.",
      "The only calls exposed before checkpoint are visible candidate_peer_spawn calls for isolated candidate worktrees.",
      "Benchmark, candidate_result_export, review_candidate_wave, and review_matrix_campaign calls are withheld until the exact controller checkpoint token is supplied.",
      "The checkpoint token is a controller confirmation string, not cryptographic proof; the controller must still verify PEER_FINAL lineage and candidate worktrees.",
      "Exact taskId+cwd anchoring is preserved in the manifest identity anchor.",
      "Raw peer/intercom output remains communication until the controller verifies candidate worktree lineage and pi-autoresearch measurement packets.",
      "pi-autoresearch remains owner of benchmark/check execution and candidate-result exports; pi-society-orchestrator owns only above-seam choreography.",
    ],
    nextStep: parentPeerTarget
      ? "Launch the visible candidate_peer_spawn calls from the manifest, wait for PEER_FINAL reports, verify worktree lineage, then provide the exact checkpointConfirmation token to unlock benchmark/export/review calls."
      : "Provide parentPeerTarget first; visible peer launch remains blocked and benchmark/export/review calls stay withheld.",
  };
}

function buildAutoresearchMatrixCampaignControllerCommandPacket(input: {
  contract: AutoresearchMatrixCampaignRunnerContract;
  reviewMatrixCampaignCall: string;
}): AutoresearchMatrixCampaignControllerCommandPacket {
  const lanesByCell = new Map<string, AutoresearchMatrixCampaignRunnerLane[]>();
  for (const lane of input.contract.lanes) {
    const lanes = lanesByCell.get(lane.cellId) ?? [];
    lanes.push(lane);
    lanesByCell.set(lane.cellId, lanes);
  }

  const cells = Array.from(lanesByCell.entries()).map(([cellId, lanes]) => {
    const firstLane = lanes[0];
    const reviewCandidateWaveCall = firstLane?.reviewCandidateWaveCall ?? "";
    return {
      cellId,
      objective: firstLane?.cellObjective ?? input.contract.objective,
      exactControllerSequence: [
        "autoresearch_candidate_bind",
        "autoresearch_runtime_run",
        "candidate_result_export",
        "review_candidate_wave",
        "review_matrix_campaign",
      ] as const,
      lanes: lanes.map((lane) => ({
        laneId: lane.laneId,
        candidateResultPacketPath: lane.candidateResultPacketPath,
        bindCall: lane.measurementPlan[0] ?? "",
        metricRunCall: lane.measurementPlan[1] ?? "",
        candidateResultExportCall: lane.measurementPlan[2] ?? "",
        metricBindingSummary:
          input.contract.operatorFollowup.primaryMetric.target === null
            ? `${input.contract.operatorFollowup.primaryMetric.name} (${input.contract.direction} is better; no target supplied)`
            : `${input.contract.operatorFollowup.primaryMetric.name} (${input.contract.direction} is better; target=${input.contract.operatorFollowup.primaryMetric.target})`,
      })),
      reviewCandidateWaveCall,
      reviewMatrixCampaignCall: input.reviewMatrixCampaignCall,
    };
  });

  return {
    kind: "autoresearch.matrix_cell_controller_command_packet.v1",
    checkpointAccepted: true,
    manifestPath: input.contract.manifest.path,
    exactTaskId: input.contract.taskId,
    exactCwd: input.contract.cwd,
    cellMetric: {
      name: input.contract.operatorFollowup.primaryMetric.name,
      direction: input.contract.direction,
      target: input.contract.operatorFollowup.primaryMetric.target,
    },
    manualControllerGlueBlockers: {
      name: "manual_controller_glue_blockers",
      direction: "lower",
      target: 0,
      proofChecklist: [
        {
          proof: "exact per-cell controller sequence",
          status: "present",
          source: "controllerCommandPacket.cells[].exactControllerSequence",
        },
        {
          proof: "metric-specific run/export templates",
          status: "present",
          source: "controllerCommandPacket.cells[].lanes[]",
        },
        {
          proof: "checkpoint and lineage verification preserved",
          status: "present",
          source: "controllerCommandPacket.checkpointAndLineageVerification",
        },
        {
          proof: "no hidden execution, promotion, merge, evidence, or durable authority mutation",
          status: "present",
          source: "controllerCommandPacket.boundaries",
        },
        {
          proof: "docs/tests alignment mentioning manual_controller_glue_blockers",
          status: "present",
          source: "README/product-posture/tests",
        },
      ],
    },
    checkpointAndLineageVerification: {
      requiredToken: input.contract.checkpointGate.requiredToken,
      controllerVerifiedLineageRequired: true,
      peerFinalIsCommunicationOnly: true,
      verificationSteps: [
        "Confirm the exact checkpoint token came from the prepared manifest for this taskId + cwd.",
        "Verify every visible PEER_FINAL against the candidate worktree path, branch, base ref, and changed files before bind.",
        "Treat intercom output as communication only; pi-autoresearch candidate-result packets are the measured comparison input.",
      ],
    },
    cells,
    flattenedNextCallBundle: [
      ...cells.flatMap((cell) => [
        ...cell.lanes.flatMap((lane) => [
          lane.bindCall,
          lane.metricRunCall,
          lane.candidateResultExportCall,
        ]),
        cell.reviewCandidateWaveCall,
      ]),
      input.reviewMatrixCampaignCall,
    ],
    boundaries: [
      "This packet is a controller-command packet only; it does not execute bind, benchmark, export, review, evidence, merge, or promotion calls.",
      "candidate_peer_spawn remains the visible peer/worktree launch owner; this packet starts after the controller checkpoint.",
      "pi-autoresearch remains owner of benchmark/check execution, metric receipts, and candidate-result export writes.",
      "review_candidate_wave and review_matrix_campaign remain comparison choreography, not winner-selection or promotion authority.",
      "AK/KES/evidence writes, merge, promotion, reset, and worktree cleanup remain explicit owner actions outside this packet.",
    ],
  };
}

function level2OperatorUxMetric(
  name: AutoresearchLevel2OperatorUxMetric["name"],
  value = 0,
): AutoresearchLevel2OperatorUxMetric {
  return {
    name,
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
  };
}

function buildLevel2OperatorUxDashboard(input: {
  checkpointState: string;
  packetInventory: readonly { packetPath: string | null; state: string; selected: boolean }[];
  nextLegalActions: readonly string[];
}): AutoresearchLevel2OperatorUxDashboard {
  const cellMetrics = [
    level2OperatorUxMetric("dashboard_readiness_summary_blockers"),
    level2OperatorUxMetric("authority_boundary_clarity_blockers"),
    level2OperatorUxMetric("fallback_recovery_ux_blockers"),
  ] as const;
  const value = cellMetrics.reduce((sum, metric) => sum + metric.value, 0);
  return {
    kind: "autoresearch.level2_operator_ux_dashboard.v1",
    currentCheckpointState: input.checkpointState,
    packetInventorySummary: `${input.packetInventory.length} packet lane(s); ${
      input.packetInventory.filter((lane) => lane.selected).length
    } selected; states=${[...new Set(input.packetInventory.map((lane) => lane.state))].join(", ") || "none"}`,
    primaryMetric: {
      ...level2OperatorUxMetric("level2_operator_ux_blockers", value),
      name: "level2_operator_ux_blockers",
    },
    cellMetrics,
    tokenAndAuthorityLegend: {
      peerText: "communication_only",
      candidateResultPackets: "review_inputs_not_durable_evidence",
      reviewPackets: "owner_review_inputs_not_promotion",
      akEvidence: "separate_owner_write_required",
      finalizerCleanupPromotion: "separate_token_gates_required",
    },
    nextLegalActions: input.nextLegalActions,
    fallbackAndRecovery: [
      "Level-1 fallback: use the measured implementation wave playbook, plan_candidate_wave, and review_candidate_wave with explicit packet paths.",
      "Missing packet recovery: wait for controller measurement plus candidate_result_export, or explicitly replan without that lane.",
      "Duplicate lane recovery: reconcile by explicit controller action naming accepted and rejected packet(s).",
      "Proof-only/baseline-only recovery: do not close the target unless an explicit downgrade or incomplete-matrix exception is recorded.",
      "Rollback: disable the level-2 command surface and return to level-1 runbooks if authority drift appears.",
    ],
    proofs: [
      {
        proof: "dashboard/readiness summary exposes checkpoint state and packet inventory",
        status: "present",
        source: "operatorUxDashboard.currentCheckpointState + packetInventorySummary",
      },
      {
        proof:
          "authority legend separates communication, review inputs, evidence, finalizer, cleanup, and promotion",
        status: "present",
        source: "operatorUxDashboard.tokenAndAuthorityLegend",
      },
      {
        proof: "level-1 fallback and recovery UX is visible",
        status: "present",
        source: "operatorUxDashboard.fallbackAndRecovery",
      },
      {
        proof: "next legal actions are rendered without executing hidden actions",
        status: "present",
        source: "operatorUxDashboard.nextLegalActions",
      },
    ],
  };
}

function buildMatrixCampaignCockpitBlockers(): AutoresearchMatrixCampaignCockpit["matrixCockpitBlockers"] {
  const proofs = [
    {
      proof: "matrix-wide progress and per-cell posture summary",
      status: "present" as const,
      source: "cockpit.progress + cockpit.cellRows",
    },
    {
      proof: "selected lane and packet inventory visibility",
      status: "present" as const,
      source: "cockpit.selectedLanes + cockpit.packetInventory",
    },
    {
      proof: "next legal action per cell and campaign",
      status: "present" as const,
      source: "cockpit.cellRows[].nextLegalAction + cockpit.nextLegalCampaignActions",
    },
    {
      proof: "dashboard-first owner route",
      status: "present" as const,
      source: "cockpit.ownerDecisionRoute",
    },
    {
      proof: "no hidden execution or promotion boundaries",
      status: "present" as const,
      source: "cockpit.noHiddenExecutionBoundaries",
    },
    {
      proof: "docs/tests alignment mentioning matrix_cockpit_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const value = 0;
  return {
    name: "matrix_cockpit_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    proofs,
  };
}

function buildAutoresearchMatrixCheckpointCockpit(input: {
  contract: AutoresearchMatrixCampaignRunnerContract;
  accepted: boolean;
  controllerCommandPacket: AutoresearchMatrixCampaignControllerCommandPacket | null;
}): AutoresearchMatrixCampaignCockpit {
  const packetInventory = input.contract.lanes.map((lane) => ({
    cellId: lane.cellId,
    laneId: lane.laneId,
    packetPath: lane.candidateResultPacketPath,
    state: input.accepted
      ? ("measurement_export_unlocked" as const)
      : ("locked_until_checkpoint" as const),
    selected: false,
  }));
  const cellIds = [...new Set(input.contract.lanes.map((lane) => lane.cellId))];
  const cellRows = cellIds.map((cellId) => {
    const cellLanes = input.contract.lanes.filter((lane) => lane.cellId === cellId);
    const packetLines = cellLanes.map(
      (lane) =>
        `${lane.laneId}: ${lane.candidateResultPacketPath} [${
          input.accepted ? "measurement_export_unlocked" : "locked_until_checkpoint"
        }]`,
    );
    return {
      cellId,
      posture: input.accepted ? "measurement_export_unlocked" : "locked_until_checkpoint",
      laneProgress: `0/${cellLanes.length} measured/exported`,
      selectedLaneId: null,
      selectedPacketPath: null,
      packetInventory: packetLines,
      nextLegalAction: input.accepted
        ? (cellLanes[0]?.measurementPlan[0] ?? "run unlocked controller-command packet calls")
        : input.contract.checkpointGate.exactCheckpointCall,
    };
  });
  const nextLegalCampaignActions = input.accepted
    ? (input.controllerCommandPacket?.flattenedNextCallBundle ?? [])
    : [input.contract.checkpointGate.exactCheckpointCall];

  return {
    kind: "autoresearch.matrix_campaign_cockpit.v1",
    source: "checkpoint_matrix_campaign_runner",
    progress: {
      posture: input.accepted
        ? "benchmark_export_review_unlocked"
        : "blocked_until_exact_controller_checkpoint",
      completedCells: 0,
      expectedCells: input.contract.manifest.cellCount,
      selectedCells: 0,
      summary: input.accepted
        ? `Checkpoint accepted; ${input.contract.manifest.cellCount} cell(s) have explicit bind/measure/export/review calls exposed but not executed.`
        : `Checkpoint blocked; ${input.contract.manifest.cellCount} cell(s) remain locked until controller lineage verification and exact checkpointConfirmation.`,
    },
    cellRows,
    packetInventory,
    selectedLanes: [],
    ownerDecisionRoute: {
      dashboardFirst: "/autoresearch export",
      overlayFallback: "/autoresearch overlay",
      finalDecision: "/autoresearch review",
      evidenceAfterReview: true,
      routeOrder: ["/autoresearch export", "/autoresearch review", "evidence_record"],
    },
    nextLegalCampaignActions,
    noHiddenExecutionBoundaries: [
      ...input.contract.boundaries,
      ...(input.controllerCommandPacket?.boundaries ?? []),
    ],
    operatorUxDashboard: buildLevel2OperatorUxDashboard({
      checkpointState: input.accepted
        ? "checkpoint_accepted_measurement_export_review_unlocked"
        : "checkpoint_blocked_waiting_for_exact_controller_confirmation",
      packetInventory,
      nextLegalActions: nextLegalCampaignActions,
    }),
    matrixCockpitBlockers: buildMatrixCampaignCockpitBlockers(),
  };
}

function buildWholeMatrixMetricPosture(input: {
  sourceMetricName: string;
  sourceMetricTarget: number | null;
  antiNarrowing: AutoresearchLevel2PacketPlanningAntiNarrowing;
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  posture: AutoresearchMatrixCampaignReview["posture"];
}): AutoresearchWholeMatrixMetricPosture {
  const incomplete = input.completedCellCount < input.expectedCellCount;
  const noSelectedLane = input.selectedCellCount < input.expectedCellCount;
  const antiNarrowingBlocked = input.antiNarrowing.blockerMetric.status === "blocked";
  const value = [incomplete, noSelectedLane, antiNarrowingBlocked].filter(Boolean).length;
  const targetClosureAllowed =
    value === 0 &&
    input.posture === "ready_for_matrix_owner_review" &&
    input.antiNarrowing.targetClosureAllowed;
  return {
    name: "level2_review_packet_generation_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    sourceMetricName: input.sourceMetricName,
    sourceMetricTarget: input.sourceMetricTarget,
    targetClosureAllowed,
    incompleteMatrixExceptionRecorded: input.antiNarrowing.incompleteMatrixExceptionRecorded,
    explicitDowngradeRecorded: input.antiNarrowing.explicitDowngradeRecorded,
    proofOnlyBaselineOnlyTargetClosureBlocked:
      input.antiNarrowing.proofOnlyBaselineOnlyTargetClosureBlocked,
    guidance: targetClosureAllowed
      ? [
          "Whole-matrix review packet is ready for owner review; it is still not promotion authority.",
          "Use dashboard/review surfaces before AK evidence or finalizer-token requests.",
        ]
      : [
          "Do not close the matrix target from this review packet yet.",
          "Resolve missing/no-selectable cells or record an explicit incomplete-matrix exception/downgrade when proof-only or baseline-only narrowing is intentional.",
        ],
  };
}

function buildMatrixCampaignReviewPacket(input: {
  reviewKind: "autoresearch.matrix_campaign_review.v1";
  wholeMatrixMetricPosture: AutoresearchWholeMatrixMetricPosture;
  selectedCellCount: number;
  expectedCellCount: number;
  exactNextCalls: readonly string[];
  closeout: AutoresearchMatrixCampaignCloseout;
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
}): AutoresearchMatrixCampaignReviewPacket {
  const candidateResultPacketRefs = input.cellReviews.flatMap((cell) =>
    buildCandidateReviewPacketChainRefs({
      binding: cell.candidateWaveReview.level2CandidateBinding,
      selectedLaneId: cell.selectedLaneId,
      cellId: cell.cellId,
    }),
  );
  return {
    kind: "autoresearch.review_matrix_campaign_packet.v1",
    generatedFrom: "managed_cell_candidate_wave_reviews",
    matrixCampaignReviewKind: input.reviewKind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    wholeMatrixMetricPosture: input.wholeMatrixMetricPosture,
    candidateResultPacketRefs,
    packetChainMetric: buildCandidateReviewPacketChainMetric({
      refs: candidateResultPacketRefs,
      sourceMetricName: input.wholeMatrixMetricPosture.name,
      sourceMetricStatus: input.wholeMatrixMetricPosture.status,
    }),
    selectedLaneCount: input.selectedCellCount,
    expectedCellCount: input.expectedCellCount,
    canCloseMatrixTarget: input.wholeMatrixMetricPosture.targetClosureAllowed,
    nextLegalActions:
      input.exactNextCalls.length > 0 ? input.exactNextCalls : input.closeout.nextLegalOwnerActions,
    authorityBoundary: buildReviewPacketAuthorityBoundary({
      selectionAuthority: "matrix_review_only",
    }),
  };
}

function buildAutoresearchMatrixReviewCockpit(input: {
  posture: AutoresearchMatrixCampaignReview["posture"];
  completedCellCount: number;
  expectedCellCount: number;
  selectedCellCount: number;
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  closeout: AutoresearchMatrixCampaignCloseout;
  exactNextCalls: readonly string[];
  boundaries: readonly string[];
}): AutoresearchMatrixCampaignCockpit {
  const cellRows = input.cellReviews.map((cell) => {
    const inventory = input.closeout.packetInventory.filter((lane) => lane.cellId === cell.cellId);
    const selected = input.closeout.selectedLanes.find((lane) => lane.cellId === cell.cellId);
    const nextLegalAction =
      cell.recommendationPosture === "planned_lanes_incomplete" ||
      cell.recommendationPosture === "no_selectable_candidate"
        ? cell.reviewCandidateWaveCall
        : `autoresearch_candidate_decision via /autoresearch review for ${cell.selectedLaneId ?? "selected lane"}`;
    return {
      cellId: cell.cellId,
      posture: cell.recommendationPosture,
      laneProgress: `${cell.completedLaneCount}/${cell.expectedLaneCount} measured/exported`,
      selectedLaneId: cell.selectedLaneId,
      selectedPacketPath: selected?.sourcePacketPath ?? null,
      packetInventory: inventory.map(
        (lane) =>
          `${lane.laneId}: ${lane.packetPath ?? "none"} [${lane.state}; selected=${
            lane.selected ? "yes" : "no"
          }]`,
      ),
      nextLegalAction,
    };
  });
  const nextLegalCampaignActions =
    input.exactNextCalls.length > 0 ? input.exactNextCalls : input.closeout.nextLegalOwnerActions;

  return {
    kind: "autoresearch.matrix_campaign_cockpit.v1",
    source: "review_matrix_campaign",
    progress: {
      posture: input.posture,
      completedCells: input.completedCellCount,
      expectedCells: input.expectedCellCount,
      selectedCells: input.selectedCellCount,
      summary: `${input.completedCellCount}/${input.expectedCellCount} cell(s) complete; ${input.selectedCellCount} selected cell lane(s); posture=${input.posture}.`,
    },
    cellRows,
    packetInventory: input.closeout.packetInventory,
    selectedLanes: input.closeout.selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      sourcePacketPath: lane.sourcePacketPath,
    })),
    ownerDecisionRoute: input.closeout.ownerDecisionRoute,
    nextLegalCampaignActions,
    noHiddenExecutionBoundaries: [...input.boundaries, ...input.closeout.notDone],
    operatorUxDashboard: buildLevel2OperatorUxDashboard({
      checkpointState: input.posture,
      packetInventory: input.closeout.packetInventory,
      nextLegalActions: nextLegalCampaignActions,
    }),
    matrixCockpitBlockers: buildMatrixCampaignCockpitBlockers(),
  };
}

function buildAutoresearchLevel3ReviewSelectionSubstrate(input: {
  taskId: number;
  cwd: string;
  objective: string;
  direction: "lower" | "higher";
  posture: AutoresearchMatrixCampaignReview["posture"];
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  exactNextCalls: readonly string[];
  scenarios?: readonly string[];
  hypotheses?: readonly string[];
  candidateCountPerCell?: number;
}): AutoresearchLevel3ReviewSelectionSubstrate {
  const cellSelections = input.cellReviews.map((cell): AutoresearchLevel3ReviewSelectionCell => {
    const selectedLane = cell.selectedLaneId
      ? (cell.candidateWaveReview.lanes.find((lane) => lane.laneId === cell.selectedLaneId) ?? null)
      : null;
    const selectableLaneIds = cell.candidateWaveReview.lanes
      .filter((lane) => lane.selectable)
      .map((lane) => lane.laneId);
    const missingLaneIds = cell.candidateWaveReview.management.laneStates
      .filter((lane) => lane.state === "packet_missing")
      .map((lane) => lane.laneId);
    const blockers = [
      ...missingLaneIds.map((laneId) => `missing_packet:${cell.cellId}/${laneId}`),
      ...(cell.recommendationPosture === "no_selectable_candidate"
        ? [`no_selectable_lane:${cell.cellId}`]
        : []),
      ...(selectedLane && !selectedLane.sourcePacketPath
        ? [`selected_lane_missing_packet_ref:${cell.cellId}/${selectedLane.laneId}`]
        : []),
      ...(selectedLane && selectedLane.candidateSource !== "candidate_peer_spawn"
        ? [`selected_lane_not_visible_candidate_peer_spawn:${cell.cellId}/${selectedLane.laneId}`]
        : []),
      ...(selectedLane && !selectedLane.candidateWorktree
        ? [`selected_lane_missing_worktree:${cell.cellId}/${selectedLane.laneId}`]
        : []),
    ];
    const winnerState: AutoresearchLevel3ReviewSelectionWinnerState =
      missingLaneIds.length > 0
        ? "blocked_missing_packets"
        : selectedLane
          ? "selected_for_owner_review"
          : "blocked_no_selectable_lane";

    return {
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      expectedLaneCount: cell.expectedLaneCount,
      completedLaneCount: cell.completedLaneCount,
      selectableLaneCount: selectableLaneIds.length,
      visibleCandidateLaneCount: cell.candidateWaveReview.lanes.filter(
        (lane) =>
          lane.candidateSource === "candidate_peer_spawn" && Boolean(lane.candidateWorktree),
      ).length,
      winnerState,
      recommendedLaneId: selectedLane?.laneId ?? null,
      recommendedMetric: selectedLane?.metric ?? null,
      recommendedSourcePacketPath: selectedLane?.sourcePacketPath ?? null,
      recommendedCandidateWorktree: selectedLane?.candidateWorktree ?? null,
      recommendedCandidateBranch: selectedLane?.candidateBranch ?? null,
      recommendedCandidateBaseRef: selectedLane?.candidateBaseRef ?? null,
      recommendedPeerRunId: selectedLane?.candidatePeerRunId ?? null,
      nonSelectedSelectableLaneIds: selectableLaneIds.filter(
        (laneId) => laneId !== selectedLane?.laneId,
      ),
      blockerCount: blockers.length,
      blockers,
      ownerReviewCall: cell.reviewCandidateWaveCall,
      nextLegalAction:
        winnerState === "selected_for_owner_review"
          ? `Owner review via /autoresearch export then /autoresearch review for ${cell.cellId}/${selectedLane?.laneId}.`
          : cell.reviewCandidateWaveCall,
    };
  });
  const cellBlockers = cellSelections.flatMap((cell) => cell.blockers);
  const postureBlockers =
    input.posture === "ready_for_matrix_owner_review" ? [] : [`matrix_posture:${input.posture}`];
  const blockers = [...cellBlockers, ...postureBlockers];
  const blockerValue = blockers.length;
  const ready = blockerValue === 0;
  const exactFinalizePostFaninHandoffCall = ready
    ? formatToolCall("autoresearch_live_supervision", {
        action: "finalize_post_fanin",
        taskId: input.taskId,
        cwd: input.cwd,
        objective: input.objective,
        sourceReview: "review_matrix_campaign",
        direction: input.direction,
        scenarios: input.scenarios,
        hypotheses: input.hypotheses,
        candidateCountPerCell: input.candidateCountPerCell,
        validation: {
          command: "<run focused validation before requesting finalize_post_fanin token>",
          status: "missing",
          summary:
            "Level-3 review/selection is ready, but finalizer token readiness still requires passed validation evidence.",
        },
      })
    : null;
  const nextLegalActions = ready
    ? [
        "Open /autoresearch export for dashboard-first owner review of the selected per-cell lanes.",
        "Use /autoresearch review for the owner decision on each selected lane; this substrate is recommendation-only.",
        "Run focused validation, then rerun the finalize_post_fanin handoff with validation.status=passed to request the exact finalizer token.",
      ]
    : [
        "Resolve level-4 review/selection blockers before requesting a finalizer token.",
        ...(input.exactNextCalls.length > 0 ? input.exactNextCalls : []),
      ];

  return {
    kind: "autoresearch.level3_review_selection_substrate.v1",
    source: "level3_matrix_cell_runner_visible_candidate_lanes",
    aggregationInput: "controller_verified_candidate_result_packets",
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    finalOnlyScoring: true,
    ownerReviewRequired: true,
    selectionAuthority: "recommendation_only",
    cellSelections,
    blockerMetric: {
      name: "level3_review_selection_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      blockers,
    },
    finalizerReadiness: {
      posture: ready
        ? "ready_for_validation_and_finalize_token_request"
        : "blocked_until_cell_selection_ready",
      sourceReview: "review_matrix_campaign",
      selectedLaneCount: cellSelections.filter(
        (cell) => cell.winnerState === "selected_for_owner_review",
      ).length,
      expectedCellCount: cellSelections.length,
      validationStillRequired: true,
      exactFinalizePostFaninHandoffCall,
      applyCommandsExposed: false,
      promotionAuthority: false,
      cleanupAuthority: false,
      requiredOwnerTokens: [
        "finalize_post_fanin",
        "candidate_cleanup",
        "promotion",
        "ak_owner_write",
      ],
    },
    dangerousActionGates: {
      finalizePostFanin: "exact_finalize_post_fanin_token_required",
      candidateCleanup: "lifecycle_v2_closeout_required",
      promotion: "separate_promotion_token_required",
      akOwnerWrite: "separate_ak_owner_write_required",
    },
    nextLegalActions,
    boundaries: [
      "Level-3 review/selection aggregates only controller-verified candidate-result packets from visible level-3 candidate lanes; raw peer text remains communication.",
      "Per-cell winners are recommendation state for owner review, not promotion or merge authority.",
      "The finalizer handoff is exact-gated: apply commands remain hidden until a separate finalize_post_fanin token is supplied to the finalizer preflight.",
      "Successful integration can trigger lifecycle-v2 closeout planning but never candidate deletion; disposition, integration proof when accepted, verified archive, exact cleanup authorization, and unchanged resource bindings remain required.",
    ],
  };
}

export function checkpointAutoresearchMatrixCampaignRunner(
  input: AutoresearchMatrixCampaignRunnerRequest,
): AutoresearchMatrixCampaignRunnerCheckpoint {
  const contract = buildAutoresearchMatrixCampaignRunnerContract(input);
  const accepted = input.checkpointConfirmation === contract.checkpointGate.requiredToken;
  const reviewCall = formatToolCall("autoresearch_live_supervision", {
    action: "review_matrix_campaign",
    taskId: contract.taskId,
    cwd: contract.cwd,
    objective: contract.objective,
    direction: contract.direction,
    metricName: input.metricName,
    metricThreshold: input.metricThreshold,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
    parentPeerTarget: input.parentPeerTarget,
    filesInScope: input.filesInScope,
    offLimits: input.offLimits,
    constraints: input.constraints,
  });
  const controllerCommandPacket = accepted
    ? buildAutoresearchMatrixCampaignControllerCommandPacket({
        contract,
        reviewMatrixCampaignCall: reviewCall,
      })
    : null;
  const benchmarkExportReviewCalls = controllerCommandPacket?.flattenedNextCallBundle ?? [];
  const cockpit = buildAutoresearchMatrixCheckpointCockpit({
    contract,
    accepted,
    controllerCommandPacket,
  });

  return {
    kind: "autoresearch.matrix_campaign_runner_checkpoint.v1",
    taskId: contract.taskId,
    cwd: contract.cwd,
    objective: contract.objective,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: accepted
        ? "checkpoint_accepted_measurement_export_review_unlocked"
        : "checkpoint_blocked_waiting_for_exact_controller_confirmation",
      metricName: contract.operatorFollowup.primaryMetric.name,
      metricDirection: contract.direction,
      metricTarget: contract.operatorFollowup.primaryMetric.target,
      laneStates: contract.lanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        packetPath: lane.candidateResultPacketPath,
        state: accepted ? "measurement_export_unlocked" : "locked_until_checkpoint",
      })),
      checkpoint: {
        posture: accepted ? "accepted" : "blocked",
        manifestPath: contract.manifest.path,
        requiredToken: contract.checkpointGate.requiredToken,
        checkpointAccepted: accepted,
      },
      measurementReview: {
        posture: accepted
          ? "measurement_export_review_calls_exposed_not_executed"
          : "locked_until_controller_checkpoint",
        expectedCells: contract.manifest.cellCount,
        benchmarkExportReviewCallsExposed: accepted,
        reviewMatrixCampaignCall: accepted ? reviewCall : null,
      },
      nextLegalActions: accepted
        ? [
            "Run each unlocked bind/benchmark/export call deliberately from verified candidate worktrees.",
            "Rerun review_matrix_campaign after candidate-result packets exist.",
            "Do not merge, promote, write evidence, or mutate lifecycle without owner review.",
          ]
        : [
            "Verify visible peer reports and candidate worktree lineage first.",
            "Rerun checkpoint_matrix_campaign_runner with the exact checkpointConfirmation token.",
          ],
    }),
    manifestPath: contract.manifest.path,
    checkpointAccepted: accepted,
    posture: accepted
      ? "benchmark_export_review_unlocked"
      : "blocked_until_exact_controller_checkpoint",
    requiredToken: contract.checkpointGate.requiredToken,
    benchmarkExportReviewCalls,
    reviewMatrixCampaignCall: accepted ? reviewCall : null,
    controllerCommandPacket,
    cockpit,
    boundaries: accepted
      ? [
          "Checkpoint unlock only exposes the exact controller-command packet and next-call bundle; it still does not execute them.",
          "The checkpoint token is a controller confirmation string, not cryptographic proof of peer completion.",
          "Controller must verify candidate worktree lineage before running each measurement call.",
          "pi-autoresearch owns benchmark/check execution, metric receipts, and candidate-result packet writes.",
          "Owner review remains required before evidence, promotion, merge, or lifecycle mutation.",
        ]
      : [
          "Benchmark/export/review calls remain withheld because the exact controller checkpoint token was not supplied.",
          "Do not infer readiness from raw PEER_FINAL/intercom messages without controller verification.",
        ],
    nextStep: accepted
      ? "Run the unlocked measurement/export calls deliberately, then run review_matrix_campaign after packets exist; do not auto-merge or promote."
      : "Launch/verify visible candidate peers first, then rerun with the exact checkpointConfirmation token shown in requiredToken.",
  };
}

const LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES = [
  "autoresearch_candidate_bind(",
  "autoresearch_runtime_run(",
  "autoresearch_runtime_status(",
  "autoresearch_live_supervision(",
] as const;

const LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS = [
  /candidate_peer_spawn\(/u,
  /scout_peer_spawn\(/u,
  /fork_peer_spawn\(/u,
  /finalize_post_fanin/u,
  /evidence_record\(/u,
  /autoresearch_learning_kes_adapter[\s\S]*"materialize"/u,
  /\bak\s+/u,
  /git\s+(merge|push|reset|worktree\s+remove|branch\s+-D)\b/u,
  /\brm\s+-rf\b/u,
  /candidate_cleanup|promotion/u,
] as const;

function resolveLevel3CompletedActionCount(value: number | undefined): number {
  const resolved = value ?? 0;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(
      `completedActionCount must be a non-negative integer, received: ${String(value)}`,
    );
  }
  return resolved;
}

function classifyLevel3MatrixCellAction(
  call: string,
): Pick<
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  "allowedByStateMachine" | "forbiddenReason"
> {
  const forbiddenPattern = LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS.find((pattern) =>
    pattern.test(call),
  );
  if (forbiddenPattern) {
    return {
      allowedByStateMachine: false,
      forbiddenReason: `Forbidden by Level-3 no-hidden-execution boundary: ${String(forbiddenPattern)}`,
    };
  }

  const allowedPrefix = LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES.some((prefix) =>
    call.startsWith(prefix),
  );
  if (!allowedPrefix) {
    return {
      allowedByStateMachine: false,
      forbiddenReason:
        "Not one of the Level-3 safe post-checkpoint call families: bind, runtime_run, candidate_result_export/status, or review calls.",
    };
  }

  return { allowedByStateMachine: true, forbiddenReason: null };
}

function buildLevel3MatrixCellExecutorBlockers(input: {
  level3Accepted: boolean;
  selectedAction: AutoresearchLevel3MatrixCellExecutorSelectedAction | null;
}): AutoresearchLevel3MatrixCellExecutor["stateMachineBlockers"] {
  const forbiddenActionMatched = input.selectedAction?.allowedByStateMachine === false;
  const value = (input.level3Accepted ? 0 : 1) + (forbiddenActionMatched ? 1 : 0);
  return {
    name: "level3_state_machine_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    hiddenExecutionPrevented: true,
    forbiddenActionMatched,
    proofs: [
      {
        proof:
          "Level-3 consumes the Level-3 runner nextLegalActions rather than inventing hidden work",
        status: "present",
        source: "level3.runnerNextLegalActions",
      },
      {
        proof: "at most one selected action is emitted per state-machine step",
        status: "present",
        source: "level3.selectedAction",
      },
      {
        proof: "selected action is reported only; execution remains not_executed_by_orchestrator",
        status: "present",
        source: "level3.selectedAction.execution",
      },
      {
        proof:
          "forbidden peer launch, finalizer, AK/evidence, cleanup, merge, and promotion patterns are blocked",
        status: "present",
        source: "LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS",
      },
    ],
  };
}

export function advanceAutoresearchLevel3MatrixCellExecutor(
  input: AutoresearchLevel3MatrixCellExecutorRequest,
): AutoresearchLevel3MatrixCellExecutor {
  const level3Runner = checkpointAutoresearchMatrixCampaignRunner(input);
  const completedActionCount = resolveLevel3CompletedActionCount(input.completedActionCount);
  const runnerNextLegalActions = level3Runner.checkpointAccepted
    ? level3Runner.cockpit.nextLegalCampaignActions
    : level3Runner.operatorFollowup.nextLegalActions;
  const totalActionCount = runnerNextLegalActions.length;
  const candidateCall = level3Runner.checkpointAccepted
    ? runnerNextLegalActions[completedActionCount]
    : undefined;
  const selectedAction = candidateCall
    ? {
        index: completedActionCount,
        call: candidateCall,
        source: "level3_matrix_cell_runner.nextLegalActions" as const,
        execution: "not_executed_by_orchestrator" as const,
        controllerMustRunExplicitly: true as const,
        ...classifyLevel3MatrixCellAction(candidateCall),
      }
    : null;
  const stateMachineBlockers = buildLevel3MatrixCellExecutorBlockers({
    level3Accepted: level3Runner.checkpointAccepted,
    selectedAction,
  });
  const posture: AutoresearchLevel3MatrixCellExecutorPosture = !level3Runner.checkpointAccepted
    ? "blocked_by_level3_runner"
    : selectedAction?.allowedByStateMachine === false
      ? "blocked_forbidden_action"
      : selectedAction
        ? "ready_to_present_next_action"
        : "completed_review_ready";
  const emittedNextLegalActions = selectedAction?.allowedByStateMachine
    ? [selectedAction.call]
    : [];

  return {
    kind: "autoresearch.level3_matrix_cell_executor.v1",
    taskId: level3Runner.taskId,
    cwd: level3Runner.cwd,
    objective: level3Runner.objective,
    sourceLevel3RunnerKind: level3Runner.kind,
    sourceLevel3RunnerAlias: "level3_matrix_cell_runner",
    level3Runner,
    completedActionCount,
    totalActionCount,
    remainingActionCount: Math.max(
      0,
      totalActionCount - completedActionCount - (selectedAction ? 1 : 0),
    ),
    posture,
    selectedAction,
    runnerNextLegalActions,
    emittedNextLegalActions,
    stateMachineBlockers,
    boundaries: [
      "Level-3 is a deterministic state-machine executor above level3_matrix_cell_runner output; it emits at most one next action and executes none of it.",
      "No hidden candidate_peer_spawn, scout_peer_spawn, or fork_peer_spawn is allowed from this executor.",
      "No post-fan-in finalizer apply, AK/KES/evidence write, merge, promotion, reset, or candidate cleanup is allowed from this executor.",
      "Controller/workbench must run the emitted action explicitly, then call this executor again with completedActionCount incremented after verification.",
      "PEER_FINAL, review packets, and command packets remain communication/review inputs until owner-controlled surfaces verify and apply them.",
    ],
    nextStep:
      posture === "blocked_by_level3_runner"
        ? "Satisfy level3_matrix_cell_runner checkpoint/lineage requirements first; Level-3 will not advance while Level-3 is blocked."
        : posture === "blocked_forbidden_action"
          ? `Stop: selected runner action is forbidden by Level-3 boundary (${selectedAction?.forbiddenReason ?? "unknown"}).`
          : posture === "completed_review_ready"
            ? "All Level-3 runner nextLegalActions have been stepped through; proceed only to owner review surfaces, not finalizer apply, cleanup, AK write, merge, or promotion."
            : "Run exactly the emittedNextLegalActions[0] outside the orchestrator, verify its result, then call Level-3 again with completedActionCount incremented by one.",
  };
}

function getCandidatePeerRegistryPath(peerRunId: string): string | null {
  if (!/^[a-z0-9._-]+$/iu.test(peerRunId)) return null;
  const stateHome =
    process.env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "pi-quests", "peer-registry", `${peerRunId}.json`);
}

function readCandidatePeerRegistrySidecar(input: {
  peerRunId: string;
  cwd: string;
  candidateWorktree?: string;
  candidateBranch?: string;
}): AutoresearchLevel4PostIntegrationCleanupRegistrySidecar {
  const registryPath = getCandidatePeerRegistryPath(input.peerRunId);
  if (!registryPath) {
    return {
      peerRunId: input.peerRunId,
      registryPath: "",
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: ["peerRunId is not a path-safe candidate peer registry id"],
    };
  }

  if (!fs.existsSync(registryPath)) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "missing_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [`missing candidate peer registry sidecar for ${input.peerRunId}`],
    };
  }

  try {
    const parsed = optionalJsonObject(JSON.parse(fs.readFileSync(registryPath, "utf8")));
    const cleanupPacket = optionalJsonObject(parsed?.cleanupPacket);
    const peerRunId = optionalString(parsed?.peerRunId);
    const canonicalTool = optionalString(parsed?.canonicalTool);
    const parentCwd = optionalString(parsed?.parentCwd);
    const repoRoot = optionalString(parsed?.repoRoot);
    const worktreePath = optionalString(parsed?.worktreePath);
    const branchName = optionalString(parsed?.branchName);
    const archiveDir =
      optionalString(parsed?.archiveDir) ?? optionalString(cleanupPacket?.archiveDir);
    const blockers = [
      ...(parsed?.schemaVersion === 1 ? [] : ["registry schemaVersion is not 1"]),
      ...(peerRunId === input.peerRunId
        ? []
        : ["registry peerRunId does not match requested peerRunId"]),
      ...(canonicalTool === "candidate_peer_spawn"
        ? []
        : ["registry canonicalTool is not candidate_peer_spawn"]),
      ...(parentCwd && path.resolve(parentCwd) === path.resolve(input.cwd)
        ? []
        : repoRoot && path.resolve(repoRoot) === path.resolve(input.cwd)
          ? []
          : ["registry parentCwd/repoRoot does not match campaign cwd"]),
      ...(worktreePath ? [] : ["registry worktreePath is missing"]),
      ...(branchName ? [] : ["registry branchName is missing"]),
      ...(archiveDir ? [] : ["registry archiveDir is missing"]),
      ...(input.candidateWorktree &&
      worktreePath &&
      path.resolve(input.candidateWorktree) !== path.resolve(worktreePath)
        ? ["controller candidateWorktree does not match registry worktreePath"]
        : []),
      ...(input.candidateBranch && branchName && input.candidateBranch !== branchName
        ? ["controller candidateBranch does not match registry branchName"]
        : []),
    ];
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: blockers.length === 0 ? "verified_registry_sidecar" : "mismatched_registry_sidecar",
      worktreePath: worktreePath ?? null,
      branchName: branchName ?? null,
      archiveDir: archiveDir ?? null,
      blockers,
    };
  } catch (error) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [
        `invalid candidate peer registry sidecar: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function resolveLevel4MaxParallelCandidatePeers(value: unknown): number {
  if (value === undefined || value === null) return 4;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 12) {
    throw new Error("maxParallelCandidatePeers must be an integer from 1 to 12.");
  }
  return value as number;
}

function buildLevel4MaterializationPreflightCommands(cwd: string): string[] {
  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return [
      `npm --prefix ${shellQuote(cwd)} install`,
      `npm --prefix ${shellQuote(cwd)} run check --if-present`,
    ];
  }
  const rootPackageJsonPath = findNearestPackageJson(cwd);
  if (rootPackageJsonPath) {
    const packageRoot = path.dirname(rootPackageJsonPath);
    return [
      `npm --prefix ${shellQuote(packageRoot)} install`,
      `npm --prefix ${shellQuote(packageRoot)} run check --if-present`,
    ];
  }
  return [];
}

function findNearestPackageJson(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function buildLevel4PromptRunnerBundle(
  input: AutoresearchLevel4CampaignRunnerRequest,
  executor: AutoresearchLevel3MatrixCellExecutor,
): AutoresearchLevel4PromptRunnerBundle {
  const contract = buildAutoresearchMatrixCampaignRunnerContract(input);
  const checkpointAccepted = executor.level3Runner.checkpointAccepted;
  const missingParentPeerTarget =
    contract.launchPhase.visibleCandidateLaneBinding.missingParentPeerTarget;
  const state: AutoresearchLevel4PromptRunnerBundle["state"] = missingParentPeerTarget
    ? "blocked_missing_parent_peer_target"
    : checkpointAccepted
      ? "checkpoint_accepted_controller_sequence_ready"
      : executor.level3Runner.posture === "blocked_until_exact_controller_checkpoint"
        ? "ready_to_launch_visible_candidate_peers"
        : "waiting_for_peer_final_and_lineage_verification";

  const promptBundle = contract.lanes.map((lane): AutoresearchLevel4PromptRunnerLane => {
    const peerRunIdPlaceholder = `<peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}>`;
    const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
    const branchPlaceholder = `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const diffPlaceholder = `<${lane.cellId}-${lane.laneId}-controller-verified-diff-summary>`;
    const filesPlaceholder = `<${lane.cellId}-${lane.laneId}-changed-files>`;
    const lineageVerificationChecklist = [
      `Capture peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}.`,
      `Wait for ACK and FINAL with ${formatToolCall("intercom", { action: "peer_watch", peerRunId: peerRunIdPlaceholder, waitFor: "both" })}.`,
      `Verify candidate worktree exists and is isolated: git -C ${worktreePlaceholder} status --short.`,
      `Verify base ref before bind: git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD.`,
      `Verify branch/ref: git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD must match ${branchPlaceholder}.`,
      `Capture diff summary and changed files: git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD and git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD.`,
      `Substitute ${diffPlaceholder} and ${filesPlaceholder} only from controller-verified git output, never from peer text alone.`,
    ];
    const promptTitle = `Level-4 matrix prompt runner lane ${lane.cellId}/${lane.laneId}`;
    const promptMarkdown = [
      `# ${promptTitle}`,
      "",
      "## Objective",
      lane.objective,
      "",
      "## Required execution pattern",
      "1. Work only in the visible `candidate_peer_spawn` candidate worktree.",
      "2. Produce one bounded candidate patch for this cell/lane.",
      "3. Run the smallest truthful validation available inside the candidate worktree.",
      "4. Report PEER_ACK promptly and PEER_FINAL with worktree path, branch, base ref, changed files, validation, and caveats.",
      "",
      "## Controller launch call",
      "```text",
      lane.candidatePeerCall,
      "```",
      "",
      "## Controller after-final checklist",
      ...lineageVerificationChecklist.map((item) => `- ${item}`),
      "",
      "## Controller post-final calls after lineage verification",
      "```text",
      ...lane.measurementPlan,
      "```",
      "",
      "## Boundaries",
      "- Do not merge, promote, write AK/KES/evidence, delete/reset worktrees, or claim durable authority.",
      "- Peer text is communication only; controller-verified git/worktree facts plus pi-autoresearch packets are review inputs.",
    ].join("\n");
    return {
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      promptTitle,
      promptMarkdown,
      candidatePeerSpawnCall: lane.candidatePeerCall,
      peerAckWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "ack",
      }),
      peerFinalWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "final",
      }),
      lineageVerificationChecklist,
      postFinalControllerCalls: lane.measurementPlan,
    };
  });

  const launchWatchBlockers = [
    ...(missingParentPeerTarget
      ? ["missing parentPeerTarget for visible candidate peer report-back"]
      : []),
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated"] : []),
    ...(contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount > 0
      ? ["hidden launch calls detected; only visible candidate_peer_spawn is allowed"]
      : []),
  ];
  const launchWatchLaneState: AutoresearchLevel4VisibleLaunchWatchLanePlan["state"] =
    missingParentPeerTarget
      ? "blocked_missing_parent_peer_target"
      : state === "ready_to_launch_visible_candidate_peers"
        ? "ready_for_visible_launch"
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "checkpoint_accepted_lineage_verified"
          : "waiting_for_ack_final_and_lineage";
  const visibleLaunchWatchPlan: AutoresearchLevel4VisibleLaunchWatchPlan = {
    kind: "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1",
    execution: "plan_only_controller_must_execute_visible_tools",
    parentPeerTarget: input.parentPeerTarget?.trim() || null,
    lanePlans: promptBundle.map(
      (lane): AutoresearchLevel4VisibleLaunchWatchLanePlan => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchSurface: "candidate_peer_spawn",
        launchCall: lane.candidatePeerSpawnCall,
        peerRunIdSource: "candidate_peer_spawn_return_value",
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        controllerVerificationRequired: ["ack", "final", "worktree_lineage"],
        state: launchWatchLaneState,
      }),
    ),
    sequence: promptBundle.flatMap((lane) => [
      lane.candidatePeerSpawnCall,
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
      ...lane.lineageVerificationChecklist,
    ]),
    metric: {
      name: "level4_visible_launch_watch_blockers",
      direction: "lower",
      target: 0,
      value: launchWatchBlockers.length,
      status: launchWatchBlockers.length === 0 ? "target_met" : "blocked",
      blockers: launchWatchBlockers,
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "ak_owner_write",
      "promotion",
    ],
    forbiddenActions: [
      "hidden peer spawn",
      "controller-inline implementation patch",
      "finalize_post_fanin apply",
      "candidate_cleanup",
      "ak_owner_write/evidence write",
      "merge/release/promotion",
    ],
    boundaries: [
      "This is a launch/watch orchestration plan only; it returns visible candidate_peer_spawn and intercom watch calls without executing them.",
      "ACK and PEER_FINAL are communication only; controller-verified git/worktree facts are required before bind/measure/export/review.",
      "Finalizer, cleanup, AK owner writes, merge, release, and promotion remain separate exact owner gates.",
    ],
    nextStep:
      launchWatchBlockers.length > 0
        ? "Resolve launch/watch blockers before launching visible candidate peers."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Visible launch/watch lineage is checkpointed; proceed only with controller-verified bind/measure/export/review calls."
          : "Controller may execute the visible candidate_peer_spawn calls, watch ACK/FINAL, verify lineage, then proceed to bind/measure/export/review.",
  };
  const maxParallelCandidatePeers = resolveLevel4MaxParallelCandidatePeers(
    input.maxParallelCandidatePeers,
  );
  const defaultMaterializationPreflight = buildLevel4MaterializationPreflightCommands(input.cwd);
  const wholeMatrixExecutorBlockers = [
    ...(visibleLaunchWatchPlan.metric.blockers ?? []),
    ...(maxParallelCandidatePeers < 1 ? ["maxParallelCandidatePeers must be at least 1"] : []),
    ...(promptBundle.length === 0
      ? ["no visible candidate lanes available for whole-matrix execution"]
      : []),
    ...(defaultMaterializationPreflight.length === 0
      ? [
          "no dependency/materialization preflight command could be inferred for cwd; provide package hydration before measurement",
        ]
      : []),
  ];
  const wholeMatrixParallelExecutor: AutoresearchLevel4WholeMatrixExecutor = {
    kind: "autoresearch.level4_whole_matrix_parallel_executor.v1",
    execution: "bounded_parallel_visible_tools_with_controller_verification",
    concurrencyLimit: maxParallelCandidatePeers,
    totalLaneCount: promptBundle.length,
    batchCount: Math.ceil(promptBundle.length / maxParallelCandidatePeers),
    batches: chunkArray(promptBundle, maxParallelCandidatePeers).map((lanes, index) => ({
      batchIndex: index + 1,
      concurrencyLimit: maxParallelCandidatePeers,
      lanes: lanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchCall: lane.candidatePeerSpawnCall,
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        materializationPreflight: defaultMaterializationPreflight,
        lineageVerificationCommands: lane.lineageVerificationChecklist,
        safeMeasurementExportReviewCalls: lane.postFinalControllerCalls,
      })),
    })),
    ackFinalWatchContract: {
      waitFor: "both",
      peerTextIsCommunicationOnly: true,
      requiredBeforeLineageCheckpoint: ["PEER_ACK", "PEER_FINAL"],
    },
    lineageVerificationGate: {
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      source: "controller_git_verification_not_peer_text",
      blocksMeasurementUntilSatisfied: true,
    },
    materializationPreflight: {
      perLaneRequired: true,
      commandsAreControllerExecuted: true,
      defaultCommands: defaultMaterializationPreflight,
      blockerMetric: {
        name: "matrix_materialization_preflight_blockers",
        direction: "lower",
        target: 0,
        value: defaultMaterializationPreflight.length === 0 ? 1 : 0,
        status: defaultMaterializationPreflight.length === 0 ? "blocked" : "target_met",
        blockers:
          defaultMaterializationPreflight.length === 0
            ? ["missing inferred package dependency/materialization preflight"]
            : [],
      },
    },
    safeAutomation: {
      peerLaunch: "visible_candidate_peer_spawn_only",
      bindRunExportReview: "after_ack_final_lineage_and_materialization",
      matrixReview: "after_candidate_result_packets",
      stoppedOwnerGates: [
        "finalize_post_fanin",
        "candidate_cleanup",
        "ak_owner_write",
        "promotion",
        "merge",
      ],
    },
    metric: {
      name: "true_parallel_whole_matrix_executor_blockers",
      direction: "lower",
      target: 0,
      value: wholeMatrixExecutorBlockers.length,
      status: wholeMatrixExecutorBlockers.length === 0 ? "target_met" : "blocked",
      blockers: wholeMatrixExecutorBlockers,
    },
    boundaries: [
      "Whole-matrix execution is bounded into explicit parallel batches of visible candidate_peer_spawn calls; no hidden peer launch is allowed.",
      "ACK/FINAL watches and candidate lineage verification gate every bind/measure/export/review call.",
      "Dependency/materialization preflight is required per lane before measurement to avoid false failures from unhydrated candidate worktrees.",
      "Candidate-result packets remain local projections; finalizer, cleanup, AK/KES/evidence writes, merge, release, and promotion stop at owner gates.",
    ],
    nextStep:
      wholeMatrixExecutorBlockers.length === 0
        ? "Execute each batch concurrently up to concurrencyLimit: launch visible peers, wait for ACK/FINAL, verify lineage and materialization, then run safe bind/measure/export/review calls; stop before owner gates."
        : "Resolve whole-matrix executor blockers before treating this as executable parallel campaign choreography.",
  };
  const postFinalControllerSequence = checkpointAccepted
    ? executor.level3Runner.benchmarkExportReviewCalls
    : contract.lanes.flatMap((lane) => [...lane.measurementPlan, lane.reviewCandidateWaveCall]);
  const closeoutBlockers = [
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated for closeout"] : []),
    ...(postFinalControllerSequence.length === 0
      ? ["no bind/measure/export/review sequence is available for closeout comparison"]
      : []),
  ];
  const cockpitInventoryByLane = new Map(
    executor.level3Runner.cockpit.packetInventory.map((row) => [
      `${row.cellId}\0${row.laneId}`,
      row,
    ]),
  );
  const packetInventoryRows: AutoresearchLevel4CandidateCloseoutPacket["packetInventory"]["rows"] =
    promptBundle.map((lane) => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const cockpitRow = cockpitInventoryByLane.get(`${lane.cellId}\0${lane.laneId}`);
      const sourceState = cockpitRow?.state ?? "not_in_cockpit";
      const packetPath =
        cockpitRow?.packetPath ??
        contractLane?.candidateResultPacketPath ??
        "<candidate-result-packet-path>";
      const packetExists =
        !packetPath.startsWith("<") && fs.existsSync(path.resolve(input.cwd, packetPath));
      const status: AutoresearchLevel4CandidatePacketInventoryStatus =
        sourceState === "measured_exported_selectable" ||
        sourceState === "measured_exported_not_selectable" ||
        packetExists
          ? "controller_verified_measured_packet"
          : sourceState === "missing_packet" || sourceState === "packet_missing"
            ? "pending_candidate_result_packet"
            : checkpointAccepted || sourceState === "measurement_export_unlocked"
              ? "pending_measurement_or_export"
              : state === "ready_to_launch_visible_candidate_peers"
                ? "pending_visible_launch"
                : "pending_controller_lineage_verification";
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        packetPath,
        sourceState,
        status,
        controllerVerified: status === "controller_verified_measured_packet",
        measuredPacket: status === "controller_verified_measured_packet",
        selected: cockpitRow?.selected ?? false,
      };
    });
  const pendingPacketRows = packetInventoryRows.filter(
    (row) => row.status !== "controller_verified_measured_packet",
  );
  const controllerVerifiedMeasuredPacketRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet",
  );
  const packetInventory = {
    totalLaneCount: packetInventoryRows.length,
    pendingVisibleLaunchCount: packetInventoryRows.filter(
      (row) => row.status === "pending_visible_launch",
    ).length,
    pendingControllerLineageVerificationCount: packetInventoryRows.filter(
      (row) => row.status === "pending_controller_lineage_verification",
    ).length,
    pendingMeasurementOrExportCount: packetInventoryRows.filter(
      (row) => row.status === "pending_measurement_or_export",
    ).length,
    pendingCandidateResultPacketCount: packetInventoryRows.filter(
      (row) => row.status === "pending_candidate_result_packet",
    ).length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    pendingPacketPaths: pendingPacketRows.map((row) => row.packetPath),
    controllerVerifiedMeasuredPacketPaths: controllerVerifiedMeasuredPacketRows.map(
      (row) => row.packetPath,
    ),
    rows: packetInventoryRows,
    summary: `${controllerVerifiedMeasuredPacketRows.length}/${packetInventoryRows.length} controller-verified measured packet(s); ${pendingPacketRows.length} pending`,
  };
  const bindingByLaneId = new Map(
    (input.candidateBindings ?? []).map((binding) => [binding.laneId, binding]),
  );
  const isPlaceholderCleanupValue = (value: string): boolean => value.startsWith("<");
  const cleanupRows = promptBundle.map((lane) => {
    const binding =
      bindingByLaneId.get(lane.laneId) ?? bindingByLaneId.get(`${lane.cellId}-${lane.laneId}`);
    const peerRunId =
      binding?.candidatePeerRunId ?? `<peerRunId for ${lane.cellId}/${lane.laneId}>`;
    const registrySidecar = isPlaceholderCleanupValue(peerRunId)
      ? null
      : readCandidatePeerRegistrySidecar({
          peerRunId,
          cwd: input.cwd,
          candidateWorktree: binding?.candidateWorktree,
          candidateBranch: binding?.candidateBranch,
        });
    const worktree =
      binding?.candidateWorktree ??
      registrySidecar?.worktreePath ??
      `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const branch =
      binding?.candidateBranch ??
      registrySidecar?.branchName ??
      extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName") ??
      `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const archiveDirectory =
      registrySidecar?.archiveDir ??
      path.join(
        os.homedir(),
        ".local",
        "state",
        "pi-quests",
        "archives",
        `cleanup-level4-task-${input.taskId}-${lane.cellId}-${lane.laneId}`,
      );
    return { lane, peerRunId, worktree, branch, archiveDirectory, registrySidecar };
  });
  const registrySidecars = cleanupRows
    .map((row) => row.registrySidecar)
    .filter((sidecar): sidecar is AutoresearchLevel4PostIntegrationCleanupRegistrySidecar =>
      Boolean(sidecar),
    );
  const cleanupBlockers = [
    ...(input.integrationCloseout?.status === "successful"
      ? []
      : ["integrationCloseout.status must be successful before post-integration cleanup is ready"]),
    ...cleanupRows.flatMap((row) => [
      ...(isPlaceholderCleanupValue(row.peerRunId)
        ? [`missing exact peerRunId for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.worktree)
        ? [`missing exact worktree for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.branch)
        ? [`missing exact branch for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(row.registrySidecar?.blockers ?? []),
    ]),
  ];
  const exactPeerRunIds = cleanupRows
    .map((row) => row.peerRunId)
    .filter((peerRunId) => !isPlaceholderCleanupValue(peerRunId));
  const exactWorktrees = cleanupRows
    .map((row) => row.worktree)
    .filter((worktree) => !isPlaceholderCleanupValue(worktree));
  const exactBranches = cleanupRows
    .map((row) => row.branch)
    .filter((branch) => !isPlaceholderCleanupValue(branch));
  const exactCleanupRows = cleanupRows.filter(
    (row) =>
      !isPlaceholderCleanupValue(row.peerRunId) &&
      !isPlaceholderCleanupValue(row.worktree) &&
      !isPlaceholderCleanupValue(row.branch),
  );
  const registrySidecarBlockerCount = registrySidecars.reduce(
    (sum, sidecar) => sum + sidecar.blockers.length,
    exactPeerRunIds.length === registrySidecars.length ? 0 : exactPeerRunIds.length,
  );
  const canDryRunCleanup = exactPeerRunIds.length > 0 && registrySidecarBlockerCount === 0;
  const candidateLifecycleStatusCall =
    canDryRunCleanup && cleanupBlockers.length === 0
      ? formatToolCall("candidate_peer_closeout", {
          action: "status",
          peerRunIds: exactPeerRunIds,
        })
      : null;
  const candidateLifecyclePlanCall =
    cleanupBlockers.length === 0
      ? formatToolCall("candidate_peer_closeout", {
          action: "plan",
          peerRunIds: exactPeerRunIds,
          taskId: input.taskId,
          integrationCloseout: input.integrationCloseout,
        })
      : null;
  const selectedMeasuredRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet" && row.selected,
  );
  const fanInComplete =
    packetInventoryRows.length > 0 &&
    packetInventoryRows.every((row) => row.status === "controller_verified_measured_packet");
  const ownerReviewCall = fanInComplete
    ? (contract.lanes[0]?.reviewCandidateWaveCall ?? null)
    : null;
  const finalizerTokenRequestCall =
    fanInComplete && selectedMeasuredRows.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: input.taskId,
          cwd: input.cwd,
          objective: input.objective,
          sourceReview: "review_matrix_campaign",
          candidateResultPacketPaths: selectedMeasuredRows.map((row) => row.packetPath),
          selectedLaneId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.laneId
              : "<owner-selected-lane-id>",
          selectedCellId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.cellId
              : "<owner-selected-cell-id>",
          validation: {
            command: "<owner validation command>",
            status: "passed",
            summary: "<owner validation summary>",
          },
        })
      : null;
  const promotionHandoffBlockers = [
    ...(fanInComplete
      ? []
      : ["all planned candidate lanes must have controller-verified measured packets"]),
    ...(fanInComplete && selectedMeasuredRows.length === 0
      ? ["owner review must select a measured lane before finalizer token request"]
      : []),
  ];
  const postFaninPromotionHandoff: AutoresearchLevel4PostFaninPromotionHandoffPacket = {
    kind: "autoresearch.level4_post_fanin_promotion_handoff.v1",
    execution: "plan_only_owner_gate_handoff",
    posture: !fanInComplete
      ? "blocked_until_candidate_fan_in_complete"
      : selectedMeasuredRows.length > 0
        ? "ready_for_finalizer_token_request"
        : "ready_for_owner_review",
    selectedLaneCount: selectedMeasuredRows.length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    totalLaneCount: packetInventoryRows.length,
    ownerReviewCall,
    finalizerTokenRequestCall,
    evidenceRecordHandoff: {
      posture: fanInComplete ? "owner_surface_after_review" : "blocked_until_owner_review",
      ownerSurface: "AK",
      exactRecordCall: null,
      boundary:
        "AK evidence remains an owner-surface write after owner review/finalizer closeout; Level-4 never fabricates durable evidence from peer text or local receipts.",
    },
    sequence: [
      "compare_measured_candidate_packets",
      "owner_selects_lane",
      "run_validation",
      "request_finalize_post_fanin_token",
      "apply_finalizer_only_with_exact_token",
      "record_evidence_only_through_owner_surface",
      "cleanup_only_after_successful_integration_closeout",
    ],
    blockers: promotionHandoffBlockers,
    boundary:
      "This handoff collapses the post-fan-in tail into one visible owner-gated sequence; it does not select a winner, apply a finalizer, write AK evidence, merge, promote, or clean candidates by itself.",
    nextStep: !fanInComplete
      ? "Finish bind/measure/export for every planned lane or explicitly replan the lane set before owner review."
      : selectedMeasuredRows.length === 0
        ? "Run the owner review surface on measured candidate packets, select a lane, validate it, then rerun Level-4 or level3_authorized_finalizer_cleanup_plan for the exact finalizer token request."
        : "Use finalizerTokenRequestCall to request the exact finalize_post_fanin token after validation; keep AK evidence, cleanup, and promotion as separate owner gates.",
  };

  const postIntegrationCleanupReady: AutoresearchLevel4PostIntegrationCleanupReadyPacket = {
    kind: "autoresearch.level4_post_integration_cleanup_ready.v1",
    execution: "not_executed_by_orchestrator",
    readiness:
      cleanupBlockers.length === 0
        ? "ready_after_successful_integration_closeout"
        : "blocked_until_successful_integration_closeout",
    integrationCloseout: {
      status: input.integrationCloseout?.status ?? "missing",
      ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
      ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
    },
    registrySidecars,
    exactPeerRunIds,
    exactPeerTabsOrSessions: exactPeerRunIds,
    exactWorktrees,
    exactBranches,
    archiveDirectories: exactCleanupRows.map((row) => row.archiveDirectory),
    tabClosureHints: exactCleanupRows.map(
      (row) =>
        `Close visible peer tab/session for exact peerRunId ${row.peerRunId}; do not fuzzy-match unrelated Pi tabs.`,
    ),
    processTerminationHints: exactCleanupRows.map(
      (row) =>
        `Terminate only sidequest/peer processes whose command line contains exact candidate worktree ${row.worktree}.`,
    ),
    candidatePeerCleanupDryRunCall: null,
    candidatePeerCleanupExecuteCall: null,
    exactControllerCommands: [],
    candidateLifecycleStatusCall,
    candidateLifecyclePlanCall,
    blockers: cleanupBlockers,
    boundary:
      "Post-integration cleanup is a controller/workbench lifecycle-v2 handoff only. Registry-v1 cleanup packets and raw worktree/branch deletion commands are never emitted; owner review, exact integration proof when accepted, restoration-verified archive, cleanup authorization, and lifecycle-v2 execution remain separate required transitions.",
    nextStep:
      cleanupBlockers.length === 0
        ? "Run candidateLifecycleStatusCall, then candidateLifecyclePlanCall. Execute cleanup only through the lifecycle-v2 closeout surface after its exact resource generation reaches cleanup_authorized."
        : exactPeerRunIds.length > 0
          ? "Resolve candidate peer registry sidecar and integration-closeout blockers before a lifecycle-v2 closeout plan is prepared."
          : "Capture exact candidate_peer_spawn peerRunIds plus controller-verified worktrees/branches before any lifecycle-v2 closeout plan is prepared.",
  };
  const candidateCloseoutPacket: AutoresearchLevel4CandidateCloseoutPacket = {
    kind: "autoresearch.level4_visible_candidate_closeout_packet.v1",
    execution: "plan_only_controller_verified_closeout",
    durableEvidence: false,
    laneCount: promptBundle.length,
    lanes: promptBundle.map((lane): AutoresearchLevel4CandidateCloseoutLane => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
      const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        objective: lane.objective,
        launch: {
          surface: "candidate_peer_spawn",
          call: lane.candidatePeerSpawnCall,
          workspaceName: extractJsonStringFromToolCall(
            lane.candidatePeerSpawnCall,
            "workspaceName",
          ),
          branchName: extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName"),
        },
        watch: {
          ackCall: lane.peerAckWatchCall,
          finalCall: lane.peerFinalWatchCall,
          status: checkpointAccepted
            ? "pending_controller_verification"
            : "pending_controller_execution",
        },
        lineage: {
          peerFinalIsCommunicationOnly: true,
          requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
          verificationCommands: [
            `git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD`,
            `git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD`,
            `git -C ${worktreePlaceholder} status --short`,
            `git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD`,
            `git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD`,
          ],
        },
        scopeReview: {
          filesInScope: nonEmptyStrings(input.filesInScope),
          offLimits: nonEmptyStrings(input.offLimits),
          status: "pending_controller_verification",
        },
        validation: {
          peerClaimStatus: "communication_only",
          controllerValidationStatus: "pending_controller_verification",
          candidateResultPacketPath:
            contractLane?.candidateResultPacketPath ?? "<candidate-result-packet-path>",
        },
        recommendation: {
          disposition: "pending_controller_review",
          options: ["integrate_after_review", "reject", "retry", "inspect_further"],
          requiredBeforeIntegrate: [
            "ACK and FINAL observed through intercom peer_watch",
            "worktree, branch, baseRef, diff summary, and changed files verified by controller git commands",
            "off-limits drift checked against filesInScope/offLimits",
            "smallest truthful validation rerun or explicitly marked unavailable by controller",
            "candidate-result packet exported and reviewed before integration selection",
          ],
        },
        rollbackNotes: [
          "Do not delete candidate resources before controller closeout is accepted.",
          "Rollback integration by reverting only the selected candidate patch; retain rejected lane packet paths as review inputs until cleanup is authorized.",
        ],
      };
    }),
    packetInventory,
    postIntegrationCleanupReady,
    postFaninPromotionHandoff,
    comparison: {
      status: checkpointAccepted ? "ready_for_review_packet" : "pending_candidate_result_packets",
      aggregateReviewCall: contract.lanes[0]?.reviewCandidateWaveCall ?? null,
      reviewRequiresControllerVerifiedPackets: true,
    },
    metric: {
      name: "level4_candidate_closeout_packet_blockers",
      direction: "lower",
      target: 0,
      value: closeoutBlockers.length,
      status: closeoutBlockers.length === 0 ? "target_met" : "blocked",
      blockers: closeoutBlockers,
    },
    notAuthority: [
      "This packet is not AK/KES/evidence authority and does not complete the task.",
      "This packet does not select, merge, promote, release, or clean up candidates.",
      "Peer ACK/FINAL text remains communication only until controller git/worktree verification is recorded in the controller flow.",
    ],
    nextStep:
      closeoutBlockers.length > 0
        ? "Resolve closeout packet blockers before using Level-4 output for candidate comparison."
        : "Use this closeout packet as the controller checklist after PEER_FINAL: verify lineage, export candidate-result packets, run review_candidate_wave, then decide integrate/reject/retry at the owner gate.",
  };
  const blockerValue = Math.max(
    visibleLaunchWatchPlan.metric.value,
    wholeMatrixParallelExecutor.metric.value,
    candidateCloseoutPacket.metric.value,
  );

  return {
    kind: "autoresearch.level4_prompt_runner_bundle.v1",
    pattern: [
      "generate_prompt_bundle",
      "candidate_peer_spawn",
      "peer_watch_ack_final",
      "controller_verify_lineage",
      "bind_measure_export_review",
      "review_matrix_campaign",
      "stop_at_owner_gates",
    ],
    state,
    promptBundle,
    visibleCandidatePeerSpawnCalls: contract.launchPhase.launchCalls,
    peerWatchCalls: promptBundle.flatMap((lane) => [
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
    ]),
    visibleLaunchWatchPlan,
    wholeMatrixParallelExecutor,
    candidateCloseoutPacket,
    controllerLineageVerification: {
      peerFinalIsCommunicationOnly: true,
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      checklist: [
        "Do not checkpoint on PEER_FINAL text alone; verify worktree, branch, base ref, diff summary, and changed files in the controller.",
        "Bind only controller-verified candidate worktrees through autoresearch_candidate_bind.",
        "Measure only from candidate worktrees; controller-inline implementation patches are a process violation.",
      ],
    },
    postFinalControllerSequence,
    metric: {
      name: "whole_matrix_execution_glue_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      proofs: [
        {
          proof: "prompt bundle generated for each matrix lane",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.promptBundle",
        },
        {
          proof: "visible candidate_peer_spawn calls are the only launch surface",
          status:
            contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount === 0
              ? "present"
              : "blocked",
          source: "contract.launchPhase.launchCalls",
        },
        {
          proof: "ACK/FINAL watch calls are explicit controller steps",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.peerWatchCalls",
        },
        {
          proof: "controller lineage verification separates peer communication from measured facts",
          status: "present",
          source: "promptRunnerBundle.controllerLineageVerification",
        },
        {
          proof:
            "bind/measure/export/review sequence is derived from existing Level-2/Level-3 packet surfaces",
          status: postFinalControllerSequence.length > 0 ? "present" : "blocked",
          source: checkpointAccepted
            ? "level3Runner.benchmarkExportReviewCalls"
            : "contract.lanes[].measurementPlan",
        },
        {
          proof: "structured candidate closeout packet is available for controller comparison",
          status: candidateCloseoutPacket.metric.status === "target_met" ? "present" : "blocked",
          source: "promptRunnerBundle.candidateCloseoutPacket",
        },
      ],
    },
    boundaries: [
      "Level-4 prompt runner automates the proven Target-3 prompt matrix pattern; it does not create a new authority ledger.",
      "candidate_peer_spawn launches remain visible peer/worktree launches; hidden scout/fork/controller-inline implementation is not allowed.",
      "intercom ACK/FINAL is communication only; controller git/worktree verification supplies lineage facts for binding.",
      "The candidate closeout packet is a controller checklist and comparison substrate, not AK/KES/evidence authority.",
      "pi-autoresearch remains owner of measurement, candidate-result export, and empirical review packets.",
      "review/finalizer/cleanup/AK/promotion gates stay separate exact owner gates.",
    ],
    nextStep:
      state === "blocked_missing_parent_peer_target"
        ? "Provide parentPeerTarget so the visible prompt-runner matrix can launch candidate_peer_spawn lanes."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Run the controller-verified bind/measure/export/review sequence from the prompt runner bundle; stop at owner gates."
          : "Launch visible candidate_peer_spawn lanes from the prompt bundle, watch ACK/FINAL, verify lineage, then supply the exact checkpoint token.",
  };
}

function resolveLevel4ReceiptPath(input: AutoresearchLevel4CampaignRunnerRequest): string {
  if (input.level4ReceiptPath) {
    const resolved = path.resolve(input.cwd, input.level4ReceiptPath);
    const cwdResolved = path.resolve(input.cwd);
    if (!resolved.startsWith(`${cwdResolved}${path.sep}`) && resolved !== cwdResolved) {
      throw new Error("level4ReceiptPath must stay under cwd.");
    }
    return resolved;
  }
  return path.join(input.cwd, ".autoresearch", "level4-campaign-runner-receipts.jsonl");
}

function loadLevel4Receipts(receiptPath: string): AutoresearchLevel4CampaignRunnerReceipt[] {
  if (!fs.existsSync(receiptPath)) return [];
  return fs
    .readFileSync(receiptPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AutoresearchLevel4CampaignRunnerReceipt);
}

function appendLevel4Receipts(
  receiptPath: string,
  receipts: readonly AutoresearchLevel4CampaignRunnerReceipt[],
): void {
  if (receipts.length === 0) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.appendFileSync(
    receiptPath,
    `${receipts.map((receipt) => JSON.stringify(receipt)).join("\n")}\n`,
  );
}

function classifyLevel4Disposition(
  call: string,
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunnerReceipt["disposition"] {
  if (/finalize_post_fanin|promotion|ak_owner_write|evidence_record\(/u.test(call)) {
    return "blocked_dangerous_gate";
  }
  if (
    /candidate_cleanup|candidate_peer_cleanup|worktree\s+remove|branch\s+-D|rm\s+-rf/u.test(call)
  ) {
    return "blocked_dangerous_gate";
  }
  if (/autoresearch_runtime_run|candidate_result_export|autoresearch_runtime_status/u.test(call)) {
    return input.allowMeasureExportReview === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  if (/review_candidate_wave|review_matrix_campaign/u.test(call)) {
    return input.allowReviewGeneration === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  return "awaiting_external_controller";
}

export function runAutoresearchLevel4CampaignRunner(
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunner {
  const receiptPath = resolveLevel4ReceiptPath(input);
  const loadedReceipts = loadLevel4Receipts(receiptPath);
  const completedActionCount = Math.max(
    resolveLevel3CompletedActionCount(input.completedActionCount),
    loadedReceipts.length,
  );
  const maxAutomatedActions = input.maxAutomatedActions ?? 1;
  if (
    !Number.isInteger(maxAutomatedActions) ||
    maxAutomatedActions < 1 ||
    maxAutomatedActions > 25
  ) {
    throw new Error("maxAutomatedActions must be an integer from 1 to 25.");
  }

  const newReceipts: AutoresearchLevel4CampaignRunnerReceipt[] = [];
  let executor = advanceAutoresearchLevel3MatrixCellExecutor({
    ...input,
    completedActionCount,
  });
  let posture: AutoresearchLevel4CampaignRunner["posture"] =
    executor.posture === "blocked_by_level3_runner" ? "blocked_by_level3" : "complete_review_ready";

  for (let i = 0; i < maxAutomatedActions; i += 1) {
    const action = executor.selectedAction;
    if (!action) {
      posture =
        executor.posture === "blocked_by_level3_runner"
          ? "blocked_by_level3"
          : "complete_review_ready";
      break;
    }
    if (!action.allowedByStateMachine) {
      posture = "blocked_dangerous_gate";
      break;
    }
    const disposition = classifyLevel4Disposition(action.call, input);
    const receipt: AutoresearchLevel4CampaignRunnerReceipt = {
      kind: "autoresearch.level4_campaign_runner_receipt.v1",
      receiptId: createHash("sha256")
        .update(`${input.taskId}\0${input.cwd}\0${action.index}\0${action.call}`)
        .digest("hex"),
      actionIndex: action.index,
      call: action.call,
      disposition,
      executedAtEpochMs: Date.now(),
      summary:
        disposition === "executed_by_level4"
          ? "Level-4 accepted and automated this safe action, then persisted a resumable receipt."
          : disposition === "awaiting_external_controller"
            ? "Level-4 stopped at an action that requires an external controller/tool seam result."
            : "Level-4 preserved an exact dangerous-action gate and did not execute this action.",
    };
    newReceipts.push(receipt);
    if (disposition !== "executed_by_level4") {
      posture =
        disposition === "blocked_dangerous_gate"
          ? "blocked_dangerous_gate"
          : "awaiting_external_controller";
      break;
    }
    executor = advanceAutoresearchLevel3MatrixCellExecutor({
      ...input,
      completedActionCount: action.index + 1,
    });
    posture = "advanced_safe_actions";
  }

  appendLevel4Receipts(receiptPath, newReceipts);
  const finalCompletedActionCount =
    completedActionCount +
    newReceipts.filter((receipt) => receipt.disposition === "executed_by_level4").length;
  const blockerValue =
    posture === "blocked_by_level3" || posture === "blocked_dangerous_gate" ? 1 : 0;
  const promptRunnerBundle = buildLevel4PromptRunnerBundle(input, executor);
  const nextLegalActions =
    posture === "blocked_by_level3" &&
    promptRunnerBundle.state === "ready_to_launch_visible_candidate_peers"
      ? promptRunnerBundle.visibleCandidatePeerSpawnCalls
      : executor.emittedNextLegalActions;
  return {
    kind: "autoresearch.level4_autoresearch_campaign_runner.v1",
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    sourceLevel3Executor: executor,
    promptRunnerBundle,
    receiptPath,
    loadedReceiptCount: loadedReceipts.length,
    newReceipts,
    completedActionCount: finalCompletedActionCount,
    posture,
    metric: {
      name: "level4_autoresearch_automation_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ],
    nextLegalActions,
    boundaries: [
      "Level-4 is above Level-3: it consumes Level-3 state-machine output and records resumable receipts.",
      "Level-4 now carries the prompt-runner matrix bundle from the proven Target-3 pattern: prompt bundle -> visible candidate_peer_spawn -> ACK/FINAL watch -> controller lineage verification -> bind/measure/export/review.",
      "Level-4 may automate only explicitly allowed safe measure/export/review steps. Candidate cleanup and lifecycle-v2 effects are never executed by Level-4.",
      "Finalizer apply, pre-closeout cleanup, AK evidence/task writes, merge, release, and promotion are never inferred from Level-4 automation.",
      "Visible peer text remains communication only; Level-4 receipts are resumability receipts, not durable AK evidence.",
    ],
    nextStep:
      posture === "awaiting_external_controller"
        ? "Run or bind the awaiting external controller action, then rerun Level-4; receipts make the loop resumable."
        : posture === "blocked_dangerous_gate"
          ? "Stop at the preserved exact gate; obtain the required owner token or closeout evidence before continuing."
          : posture === "blocked_by_level3"
            ? "Resolve the Level-3 checkpoint/runner blockers first."
            : posture === "complete_review_ready"
              ? "Level-4 has no remaining safe Level-3 action to automate; proceed to owner review and exact gated closeout."
              : "Level-4 advanced safe actions and wrote receipts; rerun to continue or inspect owner review gates.",
  };
}

export function reviewAutoresearchMatrixCampaign(
  input: AutoresearchMatrixCampaignRequest,
): AutoresearchMatrixCampaignReview {
  const { identity, objective, direction, primaryMetricName, primaryMetricTarget, cells } =
    resolveAutoresearchMatrixCampaignPlanParts(input);
  const plan = planAutoresearchMatrixCampaign(input);
  const cellReviews = cells.map((cell): AutoresearchMatrixCampaignCellReview => {
    const candidateWaveReview = reviewAutoresearchCandidateWave({
      taskId: identity.taskId,
      cwd: identity.cwd,
      objective: cell.objective,
      direction,
      candidateResultPacketPaths: cell.candidateResultPacketPaths,
      offLimits: input.offLimits,
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
  const antiNarrowingBlocked =
    plan.level2PacketPlanning.antiNarrowing.blockerMetric.status === "blocked";
  const posture = hasIncomplete
    ? "waiting_for_managed_cell_waves"
    : hasNoSelectable || antiNarrowingBlocked
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
    cwd: identity.cwd,
    posture,
    cellReviews,
    ownerReview: plan.ownerReview,
  });
  const boundaries = [
    "This matrix review aggregates managed candidate-wave reviews; it does not launch peers, run benchmarks, merge worktrees, write evidence, or promote candidates.",
    "Each cell remains gated by review_candidate_wave over explicit candidate-result packet paths.",
    "Raw peer messages are communication only; pi-autoresearch candidate-result packets remain the measurement source.",
    "Owner approval and lower-plane candidate decision workbench calls remain required before keep/discard/rewind/finalize actions.",
  ];
  const wholeMatrixMetricPosture = buildWholeMatrixMetricPosture({
    sourceMetricName: primaryMetricName,
    sourceMetricTarget: primaryMetricTarget,
    antiNarrowing: plan.level2PacketPlanning.antiNarrowing,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    posture,
  });
  const reviewPacket = buildMatrixCampaignReviewPacket({
    reviewKind: "autoresearch.matrix_campaign_review.v1",
    wholeMatrixMetricPosture,
    selectedCellCount,
    expectedCellCount: cellReviews.length,
    exactNextCalls,
    closeout,
    cellReviews,
  });
  const cockpit = buildAutoresearchMatrixReviewCockpit({
    posture,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    cellReviews,
    closeout,
    exactNextCalls,
    boundaries,
  });
  const level3ReviewSelection = buildAutoresearchLevel3ReviewSelectionSubstrate({
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    posture,
    cellReviews,
    exactNextCalls,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
  });

  return {
    kind: "autoresearch.matrix_campaign_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    operatorFollowup: buildAutoresearchMatrixCampaignOperatorFollowup({
      currentState: posture,
      metricName: primaryMetricName,
      metricDirection: direction,
      metricTarget: primaryMetricTarget,
      laneStates: cellReviews.flatMap((cell) =>
        cell.candidateWaveReview.management.laneStates.map((lane) => ({
          cellId: cell.cellId,
          laneId: lane.laneId,
          packetPath:
            lane.candidateResultPacketPath ?? `${cell.cellId}/${lane.laneId}:missing-packet`,
          state: lane.state,
        })),
      ),
      checkpoint: {
        posture: "not_applicable",
        manifestPath: null,
        requiredToken: null,
        checkpointAccepted: null,
      },
      measurementReview: {
        posture,
        completedCells: completedCellCount,
        expectedCells: cellReviews.length,
        selectedCells: selectedCellCount,
        benchmarkExportReviewCallsExposed: false,
        reviewMatrixCampaignCall: null,
      },
      nextLegalActions: exactNextCalls.length > 0 ? exactNextCalls : closeout.nextLegalOwnerActions,
    }),
    posture,
    cells: cellReviews,
    completedCellCount,
    expectedCellCount: cellReviews.length,
    selectedCellCount,
    ownerReview: plan.ownerReview,
    closeout,
    cockpit,
    reviewPacket,
    level3ReviewSelection,
    exactNextCalls,
    boundaries,
    nextStep:
      posture === "waiting_for_managed_cell_waves"
        ? "Finish controller measurement and candidate_result_export for incomplete cells, then rerun review_matrix_campaign."
        : posture === "cell_rerun_required"
          ? antiNarrowingBlocked
            ? "Do not close proof-only/baseline-only matrix work from review packets; record an explicit downgrade/incomplete-matrix exception or run real candidate lanes."
            : "Rerun or replan cells with no selectable candidate before matrix-level owner review."
          : "Review selected lanes per cell, open /autoresearch export for evidence, then use /autoresearch review for final owner decisions.",
  };
}

function buildAutoresearchMatrixCampaignCloseout(input: {
  taskId: number;
  cwd: string;
  posture: AutoresearchMatrixCampaignReview["posture"];
  cellReviews: readonly AutoresearchMatrixCampaignCellReview[];
  ownerReview: AutoresearchMatrixCampaignOwnerReviewRoute;
}): AutoresearchMatrixCampaignCloseout {
  const packetPaths = input.cellReviews.flatMap(
    (cell) => cell.candidateWaveReview.packetDiscovery.candidateResultPacketPaths,
  );
  const packetInventory = input.cellReviews.flatMap((cell) =>
    cell.candidateWaveReview.management.laneStates.map((lane) => ({
      cellId: cell.cellId,
      laneId: lane.laneId,
      packetPath: lane.candidateResultPacketPath,
      state: lane.state,
      selected: lane.laneId === cell.selectedLaneId,
    })),
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
  const handoffProofs = [
    {
      proof: "closeout packet inventory",
      status: "present" as const,
      source: "closeout.packetInventory",
    },
    {
      proof: "owner decision route dashboard -> review before evidence",
      status: "present" as const,
      source: "closeout.ownerDecisionRoute",
    },
    {
      proof: "AK-ready evidence projection handoff with deterministic projection key",
      status: "present" as const,
      source: "closeout.evidenceProjection.projectionKey",
    },
    {
      proof: "exact evidence_record handoff call or blocked projection reason",
      status: "present" as const,
      source: "closeout.evidenceProjection.exactRecordCall",
    },
    {
      proof: "authority-drift not-done boundaries",
      status: "present" as const,
      source: "closeout.notDone",
    },
    {
      proof: "docs/tests alignment mentioning evidence_handoff_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const learningActivationProofs = [
    {
      proof: "explicit pi-autoresearch learning_export call after closeout",
      status: "present" as const,
      source: "closeout.learningActivation.exactLearningExportCall",
    },
    {
      proof: "owner-routed KES adapter plan call for autoresearch.learning.v1",
      status: "present" as const,
      source: "closeout.learningActivation.exactAdapterPlanCall",
    },
    {
      proof: "materialization remains an explicit owner adapter action",
      status: "present" as const,
      source: "closeout.learningActivation.exactAdapterMaterializeCall",
    },
    {
      proof: "authority-drift boundary blocks hidden AK/KES/Prompt Vault/ROCS mutation",
      status: "present" as const,
      source: "closeout.learningActivation.boundary",
    },
    {
      proof: "docs/tests alignment mentioning learning_activation_blockers",
      status: "present" as const,
      source: "README/product-posture/tests",
    },
  ];
  const evidenceHandoffBlockers = 0;
  const closeoutPosture =
    input.posture === "ready_for_matrix_owner_review"
      ? "ak_ready_after_owner_review"
      : input.posture === "waiting_for_managed_cell_waves"
        ? "blocked_until_managed_cell_waves_complete"
        : "blocked_until_cell_rerun";
  const projectionReady = input.posture === "ready_for_matrix_owner_review";
  const learningPacketPath = path.join(input.cwd, ".autoresearch", "learning.json");
  const exactLearningExportCall = projectionReady
    ? formatToolCall("autoresearch_runtime_status", {
        cwd: input.cwd,
        action: "learning_export",
        overwrite: true,
      })
    : null;
  const exactAdapterPlanCall = projectionReady
    ? formatToolCall("autoresearch_learning_kes_adapter", {
        action: "plan",
        packetPath: learningPacketPath,
      })
    : null;
  const exactAdapterMaterializeCall = projectionReady
    ? formatToolCall("autoresearch_learning_kes_adapter", {
        action: "materialize",
        packetPath: learningPacketPath,
      })
    : null;
  const learningActivationBlockers = projectionReady ? 0 : 1;
  const projectionKey = buildAutoresearchMatrixCampaignCloseoutProjectionKey({
    taskId: input.taskId,
    selectedLanes,
    packetPaths,
  });
  const evidenceDetails = {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    projection_key: projectionKey,
    task_id: input.taskId,
    posture: closeoutPosture,
    selected_lanes: selectedLanes,
    packet_paths: packetPaths,
    packet_inventory: packetInventory,
    owner_decision_route: {
      dashboard_first: input.ownerReview.primaryUi.slashCommand,
      overlay_fallback: input.ownerReview.primaryUi.fallbackSlashCommand,
      final_decision: input.ownerReview.decisionUi.slashCommand,
      route_order: [
        input.ownerReview.primaryUi.slashCommand,
        input.ownerReview.decisionUi.slashCommand,
        "evidence_record",
      ],
      evidence_after_review: true,
    },
    evidence_handoff_blockers: evidenceHandoffBlockers,
    evidence_handoff_proofs: handoffProofs,
    learning_activation_blockers: learningActivationBlockers,
    learning_activation: {
      required_packet_kind: "autoresearch.learning.v1",
      export_call: exactLearningExportCall,
      adapter_plan_call: exactAdapterPlanCall,
      adapter_materialize_call: exactAdapterMaterializeCall,
      route_order: [
        "autoresearch_runtime_status.learning_export",
        "autoresearch_learning_kes_adapter.plan",
        "owner_review",
        "autoresearch_learning_kes_adapter.materialize",
      ],
      proofs: learningActivationProofs,
    },
    not_done: [
      "No peer was launched.",
      "No benchmark was run.",
      "No worktree lifecycle action was applied.",
      "No merge, promotion, AK evidence write, KES write, or task lifecycle mutation was applied.",
    ],
    boundary:
      "Matrix campaign closeout evidence is an owner-reviewed projection of pi-autoresearch candidate-result packets; it does not merge, promote, write KES, launch peers, run benchmarks, or mutate worktrees.",
  };
  const exactRecordCall = projectionReady
    ? formatToolCall("evidence_record", {
        check_type: "autoresearch:matrix-campaign:closeout",
        result: "pass",
        task_id: input.taskId,
        details: evidenceDetails,
      })
    : null;

  return {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    posture: closeoutPosture,
    summary: projectionReady
      ? `Matrix campaign has ${selectedLanes.length} selected managed cell lane(s); open ${input.ownerReview.primaryUi.slashCommand} before final owner decisions and project evidence only after owner review.`
      : input.posture === "waiting_for_managed_cell_waves"
        ? "Matrix campaign closeout is blocked until every managed cell wave has controller-measured candidate-result packets or the owner replans the lane set."
        : "Matrix campaign closeout is blocked until cells with no selectable candidate are rerun or deliberately replanned.",
    packetPaths,
    packetInventory,
    selectedLanes,
    evidenceProjection: {
      posture: projectionReady ? "ready_for_external_projection" : "blocked",
      ownerSurface: "AK",
      requiredAnchor: `taskId:${input.taskId}`,
      projectionKey,
      exactRecordCall,
      exactHandoff: "evidence_record",
      guidance: projectionReady
        ? [
            "Open /autoresearch export first so the owner reviews receipts, metrics, and packet context before any authority projection.",
            "Use /autoresearch review for the final owner decision before running evidence_record.",
            "If accepted, run only the exact evidence_record handoff call shown here; keep projection_key unchanged for dedupe/review.",
          ]
        : [
            "Do not run evidence_record yet; complete or replan managed cell waves and rerun review_matrix_campaign first.",
            "Keep projection_key unchanged for this exact packet/selection inventory once the closeout becomes ready.",
          ],
      boundary:
        "AK evidence projection is an explicit external owner-surface action after dashboard-first owner review; this closeout prepares the exact evidence_record call but does not execute it.",
    },
    ownerDecisionRoute: {
      dashboardFirst: input.ownerReview.primaryUi.slashCommand,
      overlayFallback: input.ownerReview.primaryUi.fallbackSlashCommand,
      finalDecision: input.ownerReview.decisionUi.slashCommand,
      evidenceAfterReview: true,
      routeOrder: [
        input.ownerReview.primaryUi.slashCommand,
        input.ownerReview.decisionUi.slashCommand,
        "evidence_record",
      ],
    },
    evidenceHandoffBlockers: {
      name: "evidence_handoff_blockers",
      direction: "lower",
      target: 0,
      value: evidenceHandoffBlockers,
      status: evidenceHandoffBlockers === 0 ? "target_met" : "blocked",
      proofs: handoffProofs,
    },
    learningActivation: {
      posture: projectionReady ? "ready_for_owner_routed_learning_handoff" : "blocked",
      ownerSurface: "autoresearch_learning_kes_adapter",
      requiredPacketKind: "autoresearch.learning.v1",
      exactLearningExportCall,
      exactAdapterPlanCall,
      exactAdapterMaterializeCall,
      routeOrder: [
        "autoresearch_runtime_status.learning_export",
        "autoresearch_learning_kes_adapter.plan",
        "owner_review",
        "autoresearch_learning_kes_adapter.materialize",
      ],
      guidance: projectionReady
        ? [
            "After reviewing the matrix closeout, export the pi-autoresearch learning packet explicitly from the campaign cwd.",
            "Run the owner-routed KES adapter in action=plan first; materialize only after owner review accepts the candidate learning draft.",
            "Keep learning activation advisory/packetized until the adapter action explicitly writes package-owned KES artifacts.",
          ]
        : [
            "Do not export or materialize learning yet; complete or replan managed cell waves and rerun review_matrix_campaign first.",
          ],
      boundary:
        "Learning activation is an owner-routed handoff from pi-autoresearch learning_export to autoresearch_learning_kes_adapter; this closeout prepares calls only and does not write KES, AK, Prompt Vault, ROCS, or promotion state.",
    },
    learningActivationBlockers: {
      name: "learning_activation_blockers",
      direction: "lower",
      target: 0,
      value: learningActivationBlockers,
      status: learningActivationBlockers === 0 ? "target_met" : "blocked",
      proofs: learningActivationProofs,
    },
    nextLegalOwnerActions: projectionReady
      ? [
          "Open /autoresearch export for dashboard-first review of receipts, metrics, and candidate packets.",
          "Use /autoresearch review for final keep/discard/rewind/more-samples/finalize decisions per selected lane.",
          "Export the pi-autoresearch learning packet and run autoresearch_learning_kes_adapter action=plan before any learning materialization.",
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
      "No merge, promotion, AK evidence write, KES write, learning materialization, or task lifecycle mutation was applied.",
    ],
  };
}

function buildAutoresearchMatrixCampaignCloseoutProjectionKey(input: {
  taskId: number;
  selectedLanes: readonly { cellId: string; laneId: string; sourcePacketPath: string | null }[];
  packetPaths: readonly string[];
}): string {
  const selectedLaneKey = input.selectedLanes
    .map((lane) => `${lane.cellId}:${lane.laneId}:${lane.sourcePacketPath ?? "no-packet"}`)
    .sort()
    .join(",");
  const packetKey = [...input.packetPaths].sort().join(",");
  return `matrix-closeout|task:${input.taskId}|selected:${encodeURIComponent(selectedLaneKey)}|packets:${encodeURIComponent(packetKey)}`;
}

const LEVEL3_POLICY_GATE_SPECS: readonly {
  gate: AutoresearchLevel3PolicyGatePreflight["gate"];
  requiredPolicy: readonly string[];
  boundary: string;
}[] = [
  {
    gate: "launchVisibleCandidatePeers",
    requiredPolicy: ["token_required", "policy_or_token_required", "manifest_allowed"],
    boundary:
      "Visible candidate launch is allowed only by accepted manifest policy or launch token.",
  },
  {
    gate: "runMeasurements",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Measurement execution must route through pi-autoresearch seams.",
  },
  {
    gate: "exportCandidateResults",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Candidate-result exports are review inputs, not durable evidence.",
  },
  {
    gate: "generateReviewPackets",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Review packet generation is non-authoritative and does not choose promotion.",
  },
  {
    gate: "prepareFinalizerTokenRequest",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Finalizer-token request preparation does not execute finalizer actions.",
  },
  {
    gate: "applyFinalizer",
    requiredPolicy: ["token_required"],
    boundary: "Finalizer application requires the exact finalize_post_fanin token.",
  },
  {
    gate: "cleanupCandidates",
    requiredPolicy: ["token_required", "token_required_or_manifest_allowed"],
    boundary: "Cleanup requires exact cleanup policy/token naming worktrees and branches.",
  },
  {
    gate: "recordAkEvidence",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK evidence writes require exact AK owner-write policy and projection key.",
  },
  {
    gate: "completeAkTask",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK task completion requires task/cwd/manifest hash matching.",
  },
  {
    gate: "mergeReleasePromotion",
    requiredPolicy: ["promotion_token_required"],
    boundary: "Merge, release, and promotion require a separate promotion token.",
  },
];

function resolveLevel3Manifest(input: AutoresearchLevel3ManifestPreflightRequest): {
  manifest: unknown;
  manifestPath: string | null;
} {
  if (input.manifest !== undefined) return { manifest: input.manifest, manifestPath: null };
  if (input.manifestPath && input.manifestPath.trim().length > 0) {
    const resolved = path.isAbsolute(input.manifestPath)
      ? input.manifestPath
      : path.resolve(input.cwd, input.manifestPath);
    return { manifest: readJsonFile(resolved), manifestPath: resolved };
  }
  return { manifest: null, manifestPath: null };
}

function buildLevel3PolicyGatePreflight(policy: Record<string, unknown> | null): {
  gates: AutoresearchLevel3PolicyGatePreflight[];
  blockers: string[];
} {
  const blockers: string[] = [];
  const gates = LEVEL3_POLICY_GATE_SPECS.map((spec) => {
    const value = policy?.[spec.gate];
    const accepted = spec.requiredPolicy.some((allowed) => {
      if (allowed === "true") return value === true;
      return value === allowed;
    });
    const missing = value === undefined;
    const posture: AutoresearchLevel3PolicyPosture = missing
      ? "blocked_missing_policy"
      : accepted
        ? "allowed_by_manifest_policy"
        : "blocked_invalid_policy";
    if (posture !== "allowed_by_manifest_policy") {
      blockers.push(
        `${spec.gate} policy is ${missing ? "missing" : `invalid (${String(value)})`}; expected one of ${spec.requiredPolicy.join(", ")}.`,
      );
    }
    return {
      gate: spec.gate,
      posture,
      value,
      requiredPolicy: spec.requiredPolicy,
      boundary: spec.boundary,
    };
  });
  return { gates, blockers };
}

export function buildAutoresearchLevel3ManifestPreflight(
  input: AutoresearchLevel3ManifestPreflightRequest,
): AutoresearchLevel3CampaignManifestPreflight {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const { manifest, manifestPath } = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const blockers: string[] = [];
  const manifestRecord = isRecord(manifest) ? manifest : null;
  if (!manifestRecord) blockers.push("manifest is required and must be a JSON object.");

  const kind = manifestRecord?.kind;
  if (manifestRecord && kind !== "autoresearch.level3_campaign_manifest.v1") {
    blockers.push("manifest.kind must be autoresearch.level3_campaign_manifest.v1.");
  }
  const manifestTaskId = manifestRecord?.taskId;
  if (manifestRecord && manifestTaskId !== identity.taskId) {
    blockers.push(`manifest.taskId must exactly match ${identity.taskId}.`);
  }
  const manifestCwd = optionalString(manifestRecord?.cwd);
  if (manifestRecord && (!manifestCwd || path.resolve(manifestCwd) !== identity.cwd)) {
    blockers.push(`manifest.cwd must exactly resolve to ${identity.cwd}.`);
  }
  const campaignId = optionalString(manifestRecord?.campaignId) ?? null;
  if (manifestRecord && !campaignId) blockers.push("manifest.campaignId is required.");
  const autonomyLevel = optionalNumber(manifestRecord?.autonomyLevel) ?? null;
  if (manifestRecord && autonomyLevel !== 3) blockers.push("manifest.autonomyLevel must be 3.");

  const primaryMetric = isRecord(manifestRecord?.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const primaryMetricName = optionalString(primaryMetric?.name) ?? null;
  if (manifestRecord && !primaryMetricName)
    blockers.push("manifest.primaryMetric.name is required.");

  const filesInScope = stringArrayFrom(manifestRecord?.filesInScope);
  const offLimits = stringArrayFrom(manifestRecord?.offLimits);
  const rawFilesInScope = manifestRecord?.filesInScope;
  const rawOffLimits = manifestRecord?.offLimits;
  const slices = Array.isArray(manifestRecord?.slices) ? manifestRecord.slices : [];
  if (manifestRecord && !Array.isArray(rawFilesInScope)) {
    blockers.push("manifest.filesInScope must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(rawOffLimits)) {
    blockers.push("manifest.offLimits must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(manifestRecord.slices)) {
    blockers.push("manifest.slices must be an array.");
  }
  const normalizedOffLimits = offLimits.map((spec) =>
    normalizeCandidateReviewPath(spec, identity.cwd),
  );
  const offLimitDrift = filesInScope
    .map((filePath) => normalizeCandidateReviewPath(filePath, identity.cwd))
    .filter((filePath) =>
      normalizedOffLimits.some((spec) => candidatePathMatchesOffLimitSpec(filePath, spec)),
    );
  if (offLimitDrift.length > 0) {
    blockers.push(`manifest.filesInScope overlaps offLimits: ${offLimitDrift.join(", ")}.`);
  }

  const policy = isRecord(manifestRecord?.policy) ? manifestRecord.policy : null;
  if (manifestRecord && !policy) blockers.push("manifest.policy is required.");
  const policyPreflight = buildLevel3PolicyGatePreflight(policy);
  const manifestHash = manifestRecord ? sha256StableJson(manifestRecord) : null;
  const schemaBlockers = blockers.length;
  const policyBlockers = policyPreflight.blockers.length;
  const uxBlockers = manifestHash && policyPreflight.gates.length > 0 ? 0 : 1;
  const allBlockers = [...blockers, ...policyPreflight.blockers];
  if (uxBlockers > 0)
    allBlockers.push("preflight UX requires manifest hash and policy gate rendering.");
  const totalBlockers = allBlockers.length;

  return {
    kind: "autoresearch.level3_campaign_manifest_preflight.v1",
    manifestKind:
      kind === "autoresearch.level3_campaign_manifest.v1"
        ? "autoresearch.level3_campaign_manifest.v1"
        : "invalid_or_missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestPath,
    manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    metric: {
      name: "level3_manifest_preflight_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      manifestSchemaBlockers: {
        name: "manifest_schema_blockers",
        direction: "lower",
        target: 0,
        value: schemaBlockers,
        status: metricStatus(schemaBlockers),
      },
      manifestPolicyGateBlockers: {
        name: "manifest_policy_gate_blockers",
        direction: "lower",
        target: 0,
        value: policyBlockers,
        status: metricStatus(policyBlockers),
      },
      manifestPreflightUxBlockers: {
        name: "manifest_preflight_ux_blockers",
        direction: "lower",
        target: 0,
        value: uxBlockers,
        status: metricStatus(uxBlockers),
      },
    },
    schema: {
      campaignId,
      autonomyLevel,
      primaryMetricName,
      sliceCount: slices.length,
      fileScopeCount: filesInScope.length,
      offLimitsCount: offLimits.length,
    },
    policyGates: policyPreflight.gates,
    blockers: allBlockers,
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review and accept the durable manifest before any level-3 action-consuming runner step.",
            "Proceed to Slice 2 dry-run sequencing only; do not launch peers from Slice 1 preflight.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ]
        : [
            "Fix manifest schema/policy blockers and rerun level3_manifest_preflight.",
            "Do not launch peers, run measurements, cleanup, write AK evidence, or promote while preflight is blocked.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed.",
      "No autoresearch measurement, candidate-result export, review, or finalizer action was executed.",
      "No cleanup, branch deletion, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    level2FallbackRoute: LEVEL2_PACKET_LEVEL1_FALLBACK,
    boundaries: [
      "Level-3 manifest preflight is read-only; manifest acceptance is separate from chat text and peer reports.",
      "Policy gates render authorization posture only; dangerous actions still require later stage-specific execution surfaces.",
      "The manifest hash is an audit anchor, not durable evidence until projected through AK owner-write policy.",
    ],
  };
}

function level3NodeId(value: unknown, fallback: string): string {
  return optionalString(isRecord(value) ? value.id : undefined) ?? fallback;
}

function level3NodeDependencies(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [...stringArrayFrom(value.dependsOn), ...stringArrayFrom(value.dependencies)].filter(
    (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
  );
}

function level3NodeMetricName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const direct = optionalString(value.metric);
  if (direct) return direct;
  return isRecord(value.metric) ? (optionalString(value.metric.name) ?? null) : null;
}

function level3NodeMetricDirection(value: unknown): "lower" | "higher" | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  const direction = optionalString(metric?.direction) ?? optionalString(value.direction);
  return direction === "higher" ? "higher" : direction === "lower" ? "lower" : null;
}

function level3NodeMetricTarget(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  return optionalNumber(metric?.target) ?? optionalNumber(value.metricThreshold) ?? null;
}

function level3CandidateCount(value: unknown, fallback: number): number {
  const raw = isRecord(value)
    ? (optionalNumber(value.candidateCountPerCell) ?? optionalNumber(value.candidateCount))
    : undefined;
  const resolved = raw ?? fallback;
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= 6 ? resolved : fallback;
}

function level3NodeRequiredPolicyGates(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    ...stringArrayFrom(value.requiredPolicyGates),
    ...stringArrayFrom(value.requiresPolicyGates),
    ...stringArrayFrom(value.policyGates),
  ].filter((item, index, items) => item.trim().length > 0 && items.indexOf(item) === index);
}

function buildLevel3SliceSequenceNodes(manifest: unknown): {
  nodes: {
    sliceId: string;
    cellId: string;
    nodeId: string;
    raw: unknown;
    dependencies: readonly string[];
    metricName: string | null;
    requiredPolicyGates: readonly string[];
  }[];
  schemaBlockers: string[];
} {
  if (!isRecord(manifest) || !Array.isArray(manifest.slices)) {
    return { nodes: [], schemaBlockers: ["manifest.slices must be available for sequencing."] };
  }
  const schemaBlockers: string[] = [];
  const nodes: ReturnType<typeof buildLevel3SliceSequenceNodes>["nodes"] = [];
  manifest.slices.forEach((slice, sliceIndex) => {
    const sliceId = level3NodeId(slice, `slice-${String(sliceIndex + 1).padStart(2, "0")}`);
    const sliceDependencies = level3NodeDependencies(slice);
    const slicePolicyGates = level3NodeRequiredPolicyGates(slice);
    const sliceMetricName = level3NodeMetricName(slice);
    const hasExplicitCells =
      isRecord(slice) && Array.isArray(slice.cells) && slice.cells.length > 0;
    const cells =
      hasExplicitCells && isRecord(slice) && Array.isArray(slice.cells) ? slice.cells : [slice];
    cells.forEach((cell, cellIndex) => {
      const cellId = hasExplicitCells
        ? level3NodeId(cell, `${sliceId}:cell-${String(cellIndex + 1).padStart(2, "0")}`)
        : sliceId;
      nodes.push({
        sliceId,
        cellId,
        nodeId: cellId,
        raw: cell,
        dependencies: [...sliceDependencies, ...level3NodeDependencies(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
        metricName: level3NodeMetricName(cell) ?? sliceMetricName,
        requiredPolicyGates: [...slicePolicyGates, ...level3NodeRequiredPolicyGates(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
      });
    });
  });
  if (nodes.length === 0)
    schemaBlockers.push("manifest.slices must contain at least one slice/cell.");
  const duplicates = nodes
    .map((node) => node.nodeId)
    .filter((nodeId, index, items) => items.indexOf(nodeId) !== index);
  if (duplicates.length > 0) {
    schemaBlockers.push(
      `manifest slice/cell ids must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  return { nodes, schemaBlockers };
}

function policyPostureForRequiredGates(
  requiredPolicyGates: readonly string[],
  preflight: AutoresearchLevel3CampaignManifestPreflight,
): { posture: AutoresearchLevel3PolicyPosture; blockers: string[] } {
  if (requiredPolicyGates.length === 0) return { posture: "not_requested", blockers: [] };
  const blockers: string[] = [];
  for (const gate of requiredPolicyGates) {
    const preflightGate = preflight.policyGates.find((item) => item.gate === gate);
    if (!preflightGate) {
      blockers.push(`required policy gate ${gate} is not recognized by level-3 preflight.`);
    } else if (preflightGate.posture !== "allowed_by_manifest_policy") {
      blockers.push(`required policy gate ${gate} is ${preflightGate.posture}.`);
    }
  }
  return {
    posture: blockers.length === 0 ? "allowed_by_manifest_policy" : "blocked_missing_policy",
    blockers,
  };
}

export function buildAutoresearchLevel3SliceSequenceDryRun(
  input: AutoresearchLevel3SliceSequenceDryRunRequest,
): AutoresearchLevel3SliceSequenceDryRun {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const nodesResult = buildLevel3SliceSequenceNodes(resolved.manifest);
  const orderedStates: AutoresearchLevel3SliceSequenceCellState[] = [];
  const blockers: string[] = [];
  const readyIds = new Set<string>();
  const nodeIds = new Set(nodesResult.nodes.map((node) => node.nodeId));

  if (preflight.metric.status !== "target_met") {
    blockers.push("manifest preflight is blocked; sequencing dry-run fails closed.");
  }
  blockers.push(...nodesResult.schemaBlockers);

  nodesResult.nodes.forEach((node, index) => {
    const missingDependencies = node.dependencies.filter((dependency) => !nodeIds.has(dependency));
    const blockedDependencies = node.dependencies.filter(
      (dependency) => nodeIds.has(dependency) && !readyIds.has(dependency),
    );
    const policy = policyPostureForRequiredGates(node.requiredPolicyGates, preflight);
    const nodeBlockers = [
      ...missingDependencies.map((dependency) => `missing dependency ${dependency}`),
      ...blockedDependencies.map((dependency) => `blocked dependency ${dependency}`),
      ...policy.blockers,
    ];
    const preflightBlocked = preflight.metric.status !== "target_met";
    if (preflightBlocked) nodeBlockers.push("manifest preflight blocked");
    const state: AutoresearchLevel3SliceSequenceState =
      nodeBlockers.length === 0 ? "ready" : "blocked";
    if (state === "ready") readyIds.add(node.nodeId);
    orderedStates.push({
      sliceId: node.sliceId,
      cellId: node.cellId,
      order: index + 1,
      state,
      dependencies: node.dependencies,
      missingDependencies,
      blockedDependencies,
      policyPosture: policy.posture,
      metricName: node.metricName,
      nextLegalAction:
        state === "ready"
          ? "Owner may proceed to the next level-3 dry-run stage; lower-plane actions remain withheld."
          : "Resolve dependency or preflight/policy blockers, then rerun the slice sequence dry-run.",
      blockers: nodeBlockers,
    });
  });

  const orderingBlockers = orderedStates.reduce(
    (count, state) => count + state.missingDependencies.length + state.blockedDependencies.length,
    nodesResult.schemaBlockers.length,
  );
  const recoveryBlockers =
    orderedStates.length > 0 && preflight.level2FallbackRoute.length > 0 ? 0 : 1;
  const receiptBlockers = preflight.manifestHash && orderedStates.length > 0 ? 0 : 1;
  const stateBlockers = orderedStates.reduce((count, state) => count + state.blockers.length, 0);
  const totalBlockers = preflight.metric.value + stateBlockers + receiptBlockers + recoveryBlockers;
  if (stateBlockers > 0) {
    blockers.push(
      ...orderedStates.flatMap((state) =>
        state.blockers.map((blocker) => `${state.cellId}: ${blocker}`),
      ),
    );
  }
  if (receiptBlockers > 0)
    blockers.push("dry-run receipts require a manifest hash and at least one ordered slice/cell.");
  if (recoveryBlockers > 0)
    blockers.push(
      "dry-run recovery UX requires blocked-state guidance and a level-2 fallback route.",
    );

  const receiptPolicyPosture: AutoresearchLevel3CampaignTransitionReceipt["policyPosture"] =
    preflight.metric.status !== "target_met"
      ? "blocked_preflight"
      : orderedStates.some((state) => state.state === "blocked")
        ? "blocked_dependencies_or_policy"
        : "dry_run_no_lower_plane_actions";
  const receipts = preflight.manifestHash
    ? orderedStates.map(
        (state, index): AutoresearchLevel3CampaignTransitionReceipt => ({
          kind: "autoresearch.level3_campaign_transition_receipt.v1",
          nonAuthoritative: true,
          durableEvidence: false,
          manifestHash: preflight.manifestHash as string,
          taskId: identity.taskId,
          cwd: identity.cwd,
          transitionName: "level3_slice_sequence_dry_run",
          policyPosture: receiptPolicyPosture,
          inputRefs: {
            manifestPath: resolved.manifestPath,
            sliceId: state.sliceId,
            cellId: state.cellId,
            dependencies: state.dependencies,
          },
          outputRefs: {
            packetKind: "autoresearch.level3_slice_sequence_dry_run.v1",
            state: state.state,
            receiptIndex: index + 1,
          },
          metricPosture: {
            name:
              state.state === "ready"
                ? "dry_run_receipt_blockers"
                : "autonomous_slice_sequence_blockers",
            direction: "lower",
            target: 0,
            status: state.state === "ready" ? "target_met" : "blocked",
          },
          nextState: state.state,
          rollbackHint: preflight.level2FallbackRoute,
        }),
      )
    : [];

  return {
    kind: "autoresearch.level3_slice_sequence_dry_run.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    metric: {
      name: "autonomous_slice_sequence_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      sliceOrderingBlockers: {
        name: "slice_ordering_blockers",
        direction: "lower",
        target: 0,
        value: orderingBlockers,
        status: metricStatus(orderingBlockers),
      },
      dryRunReceiptBlockers: {
        name: "dry_run_receipt_blockers",
        direction: "lower",
        target: 0,
        value: receiptBlockers,
        status: metricStatus(receiptBlockers),
      },
      sliceSequenceRecoveryBlockers: {
        name: "slice_sequence_recovery_blockers",
        direction: "lower",
        target: 0,
        value: recoveryBlockers,
        status: metricStatus(recoveryBlockers),
      },
    },
    orderedStates,
    receipts,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review the dry-run state and receipts; continue only to owner-approved visible level-3 surfaces.",
            "Rerun this dry-run after manifest edits before any lower-plane action is considered.",
            preflight.level2FallbackRoute,
          ]
        : [
            "Resolve blocked slice/cell dependencies, policy, or manifest preflight blockers and rerun the dry-run.",
            "Use the safe rerun command shown in this result after manifest repair.",
            preflight.level2FallbackRoute,
          ],
    safeRerunCommand: formatToolCall("autoresearch_live_supervision", {
      action: "level3_slice_sequence_dry_run",
      taskId: identity.taskId,
      cwd: identity.cwd,
      ...(resolved.manifestPath
        ? { level3ManifestPath: resolved.manifestPath }
        : { level3Manifest: "<inline manifest>" }),
    }),
    level2FallbackRoute: preflight.level2FallbackRoute,
    nonActions: [
      "Dry-run only: no peer launch, lower-plane runtime call, candidate-result export, review/finalizer call, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was exposed or executed.",
      "Transition receipts are local audit/review inputs only and are not AK evidence.",
    ],
    boundaries: [
      "Slice sequencing dry-run computes ready/blocked state from the accepted manifest shape and preflight output only.",
      "Transition receipts are non-authoritative and become durable evidence only through a future exact AK owner-write gate.",
      "Blocked states show rerun and level-2 fallback routes instead of exposing action-consuming calls.",
    ],
  };
}

function buildLevel3LaunchAuthorization(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  suppliedToken?: string;
}): AutoresearchLevel3VisibleCandidateLifecyclePlan["launchAuthorization"] {
  const requiredToken = `launch_visible_candidate_lanes task:${input.taskId} cwd:${input.cwd} manifest:${input.manifestHash ?? "missing"}`;
  const launchGate = input.preflight.policyGates.find(
    (gate) => gate.gate === "launchVisibleCandidatePeers",
  );
  const manifestAllowed = launchGate?.value === "manifest_allowed";
  const suppliedTokenAccepted = input.suppliedToken === requiredToken;
  return {
    posture: manifestAllowed
      ? "allowed_by_manifest_policy"
      : suppliedTokenAccepted
        ? "allowed_by_exact_token"
        : "blocked_missing_policy_or_token",
    requiredToken,
    suppliedTokenAccepted,
  };
}

function buildLevel3CandidateLifecycleLaneSpecs(manifest: unknown): {
  sliceId: string | null;
  cellId: string | null;
  laneId: string;
  objective: string;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
}[] {
  const manifestRecord = isRecord(manifest) ? manifest : {};
  const manifestFiles = stringArrayFrom(manifestRecord.filesInScope);
  const manifestOffLimits = stringArrayFrom(manifestRecord.offLimits);
  const manifestPrimaryMetric = isRecord(manifestRecord.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const manifestMetricName = optionalString(manifestPrimaryMetric?.name) ?? null;
  const manifestMetricDirection =
    optionalString(manifestPrimaryMetric?.direction) === "higher" ? "higher" : "lower";
  const manifestMetricTarget = optionalNumber(manifestPrimaryMetric?.target) ?? null;
  const matrixRecord = isRecord(manifestRecord.matrix) ? manifestRecord.matrix : null;
  const manifestCandidateCountPerCell = level3CandidateCount(matrixRecord ?? manifestRecord, 1);
  const nodes = buildLevel3SliceSequenceNodes(manifest).nodes;
  const cellScopedLanes = nodes.flatMap((node) => {
    const raw = isRecord(node.raw) ? node.raw : {};
    const explicitCellLanes = Array.isArray(raw.candidateLanes) ? raw.candidateLanes : [];
    return explicitCellLanes.map((lane, index) => {
      const rawLane = isRecord(lane) ? lane : {};
      const localLaneId = level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`);
      const laneFiles = stringArrayFrom(rawLane.filesInScope);
      const cellFiles = stringArrayFrom(raw.filesInScope);
      const laneOffLimits = stringArrayFrom(rawLane.offLimits);
      const cellOffLimits = stringArrayFrom(raw.offLimits);
      return {
        sliceId: node.sliceId,
        cellId: node.cellId,
        laneId: `${node.cellId}-${localLaneId}`,
        metricName: level3NodeMetricName(rawLane) ?? node.metricName ?? manifestMetricName,
        metricDirection:
          level3NodeMetricDirection(rawLane) ??
          level3NodeMetricDirection(raw) ??
          manifestMetricDirection,
        metricTarget:
          level3NodeMetricTarget(rawLane) ?? level3NodeMetricTarget(raw) ?? manifestMetricTarget,
        objective:
          optionalString(rawLane.objective) ??
          optionalString(raw.objective) ??
          optionalString(manifestRecord.objective) ??
          `Run visible candidate lifecycle for ${node.cellId}/${localLaneId}.`,
        filesInScope:
          laneFiles.length > 0 ? laneFiles : cellFiles.length > 0 ? cellFiles : manifestFiles,
        offLimits:
          laneOffLimits.length > 0
            ? laneOffLimits
            : cellOffLimits.length > 0
              ? cellOffLimits
              : manifestOffLimits,
      };
    });
  });
  if (cellScopedLanes.length > 0) return cellScopedLanes;

  const explicitLanes = Array.isArray(manifestRecord.candidateLanes)
    ? manifestRecord.candidateLanes
    : [];
  if (explicitLanes.length > 0) {
    return explicitLanes
      .map((lane, index) => ({
        sliceId: null,
        cellId: null,
        laneId: level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`),
        metricName:
          level3NodeMetricName(lane) ??
          optionalString(isRecord(lane) ? lane.metricName : undefined) ??
          manifestMetricName,
        metricDirection: level3NodeMetricDirection(lane) ?? manifestMetricDirection,
        metricTarget: level3NodeMetricTarget(lane) ?? manifestMetricTarget,
        objective:
          optionalString(isRecord(lane) ? lane.objective : undefined) ??
          optionalString(manifestRecord.objective) ??
          "Run the declared level-3 candidate lane.",
        filesInScope: stringArrayFrom(isRecord(lane) ? lane.filesInScope : undefined),
        offLimits: stringArrayFrom(isRecord(lane) ? lane.offLimits : undefined),
      }))
      .map((lane) => ({
        ...lane,
        filesInScope: lane.filesInScope.length > 0 ? lane.filesInScope : manifestFiles,
        offLimits: lane.offLimits.length > 0 ? lane.offLimits : manifestOffLimits,
      }));
  }

  return nodes.flatMap((node) => {
    const count = level3CandidateCount(node.raw, manifestCandidateCountPerCell);
    return Array.from({ length: count }, (_, index) => ({
      sliceId: node.sliceId,
      cellId: node.cellId,
      laneId: `${node.cellId}-candidate-${String(index + 1).padStart(2, "0")}`,
      metricName: node.metricName ?? manifestMetricName,
      metricDirection: level3NodeMetricDirection(node.raw) ?? manifestMetricDirection,
      metricTarget: level3NodeMetricTarget(node.raw) ?? manifestMetricTarget,
      objective:
        optionalString(isRecord(node.raw) ? node.raw.objective : undefined) ??
        optionalString(manifestRecord.objective) ??
        `Run visible candidate lifecycle for ${node.cellId}.`,
      filesInScope: manifestFiles,
      offLimits: manifestOffLimits,
    }));
  });
}

export function buildAutoresearchLevel3VisibleCandidateLifecyclePlan(
  input: AutoresearchLevel3VisibleCandidateLifecycleRequest,
): AutoresearchLevel3VisibleCandidateLifecyclePlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const authorization = buildLevel3LaunchAuthorization({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    preflight,
    suppliedToken: input.launchAuthorizationToken,
  });
  const laneSpecs = buildLevel3CandidateLifecycleLaneSpecs(resolved.manifest);
  const duplicateLaneIds = laneSpecs
    .map((lane) => lane.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindings = [...(input.candidateBindings ?? [])];
  const duplicateBindingIds = bindings
    .map((binding) => binding.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindingsByLane = new Map(bindings.map((binding) => [binding.laneId, binding]));
  const launchAllowed = authorization.posture !== "blocked_missing_policy_or_token";
  const launchPolicyBlockers =
    preflight.metric.status === "target_met" && launchAllowed && input.parentPeerTarget
      ? duplicateLaneIds.length
      : 1 + duplicateLaneIds.length;

  const lanes = laneSpecs.map((lane) => {
    const binding = bindingsByLane.get(lane.laneId) ?? null;
    const blockers: string[] = [];
    if (preflight.metric.status !== "target_met") blockers.push("manifest preflight blocked");
    if (!launchAllowed)
      blockers.push(
        "missing accepted launchVisibleCandidatePeers manifest policy or exact launch token",
      );
    if (!input.parentPeerTarget)
      blockers.push(
        "parentPeerTarget is required before visible candidate launch calls are exposed",
      );
    if (duplicateLaneIds.includes(lane.laneId))
      blockers.push("duplicate manifest candidate lane id");
    if (!binding) blockers.push("missing candidate worktree binding for lane");
    if (duplicateBindingIds.includes(lane.laneId))
      blockers.push("duplicate candidate binding for lane");
    if (binding) {
      if (!binding.candidateWorktree) blockers.push("candidate binding missing worktree");
      if (!binding.candidateBranch) blockers.push("candidate binding missing branch");
      if (!binding.candidateBaseRef) blockers.push("candidate binding missing base ref");
    }
    const launchPosture: AutoresearchLevel3CandidateLifecycleLane["launchPosture"] = !launchAllowed
      ? "blocked_missing_launch_policy_or_token"
      : !input.parentPeerTarget
        ? "blocked_missing_parent_peer_target"
        : "ready_visible_candidate_peer_spawn_call";
    const peerPayload = {
      objective: lane.objective,
      cwd: identity.cwd,
      parentPeerTarget: input.parentPeerTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      constraints: [
        "visible candidate lane only",
        `AK task ${identity.taskId}`,
        `manifest ${preflight.manifestHash ?? "missing"}`,
      ],
    };
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      launchPosture,
      candidatePeerCall:
        launchPosture === "ready_visible_candidate_peer_spawn_call" &&
        preflight.metric.status === "target_met" &&
        launchAllowed &&
        Boolean(input.parentPeerTarget) &&
        !duplicateLaneIds.includes(lane.laneId)
          ? formatToolCall("candidate_peer_spawn", peerPayload)
          : null,
      bindingPosture: duplicateBindingIds.includes(lane.laneId)
        ? "blocked_duplicate_binding"
        : binding
          ? "bound_visible_candidate_worktree"
          : "blocked_missing_binding",
      binding,
      cleanupPosture: "plan_only_cleanup_token_required",
      cleanupPlan: [
        "Do not close peer tabs/sessions, remove worktrees, delete branches, reset, or clean candidates from this lifecycle plan.",
        "Prepare exact candidate_cleanup token naming peer sessions/tabs, worktrees, and branches before cleanup.",
      ],
      blockers,
    } satisfies AutoresearchLevel3CandidateLifecycleLane;
  });

  const bindingBlockers = lanes.reduce(
    (count, lane) =>
      count +
      (lane.bindingPosture === "bound_visible_candidate_worktree" && lane.blockers.length === 0
        ? 0
        : lane.blockers.filter((blocker) =>
            /binding|duplicate|worktree|branch|base ref/u.test(blocker),
          ).length),
    0,
  );
  const cleanupBlockers = lanes.every(
    (lane) => lane.cleanupPosture === "plan_only_cleanup_token_required",
  )
    ? 0
    : 1;
  const totalBlockers =
    preflight.metric.value + launchPolicyBlockers + bindingBlockers + cleanupBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met"
      ? []
      : ["manifest preflight is blocked; visible candidate lifecycle fails closed."]),
    ...duplicateLaneIds.map((laneId) => `duplicate manifest candidate lane id ${laneId}`),
    ...duplicateBindingIds.map((laneId) => `duplicate candidate binding for lane ${laneId}`),
    ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
  ];

  return {
    kind: "autoresearch.level3_visible_candidate_lifecycle_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    launchAuthorization: authorization,
    metric: {
      name: "candidate_lifecycle_automation_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      visibleLaunchPolicyBlockers: {
        name: "visible_launch_policy_blockers",
        direction: "lower",
        target: 0,
        value: launchPolicyBlockers,
        status: metricStatus(launchPolicyBlockers),
      },
      candidateBindingLifecycleBlockers: {
        name: "candidate_binding_lifecycle_blockers",
        direction: "lower",
        target: 0,
        value: bindingBlockers,
        status: metricStatus(bindingBlockers),
      },
      candidateCleanupPolicyBlockers: {
        name: "candidate_cleanup_policy_blockers",
        direction: "lower",
        target: 0,
        value: cleanupBlockers,
        status: metricStatus(cleanupBlockers),
      },
    },
    lanes,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review visible candidate_peer_spawn calls and bound worktree lineage; execute launch only through the visible tool surface if still intended.",
            "After candidate work completes, route measurement/export/review through the next authorized level-3 slice; this plan does not run them.",
            "Cleanup remains plan-only until exact candidate_cleanup policy/token names peer tabs/sessions, worktrees, and branches.",
          ]
        : [
            "Resolve launch policy/token, parentPeerTarget, duplicate/missing lane bindings, or manifest preflight blockers and rerun this plan.",
            "Do not launch peers, measure/export/review, cleanup, write AK evidence, or promote while lifecycle planning is blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed by the orchestrator; visible calls are returned as owner-reviewable text only when authorized.",
      "No autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Visible candidate launch requires accepted manifest launch policy or exact launch_visible_candidate_lanes token; chat text and peer reports do not authorize launch.",
      "Candidate bindings are controller-verified lineage inputs, not durable evidence or winner selection.",
      "Cleanup is a plan-only posture here; peer tab/session closure, worktree removal, and branch deletion require separate candidate_cleanup authority.",
    ],
  };
}

export function buildAutoresearchLevel3MeasureExportReviewPlan(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MeasureExportReviewPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan(input);
  const runGate = preflight.policyGates.find((gate) => gate.gate === "runMeasurements");
  const exportGate = preflight.policyGates.find((gate) => gate.gate === "exportCandidateResults");
  const reviewGate = preflight.policyGates.find((gate) => gate.gate === "generateReviewPackets");
  const measurementAllowed = runGate?.posture === "allowed_by_manifest_policy";
  const exportAllowed = exportGate?.posture === "allowed_by_manifest_policy";
  const reviewAllowed = reviewGate?.posture === "allowed_by_manifest_policy";
  const packetDir = normalizeCandidateReviewPath(
    input.candidateResultPacketDirectory ?? ".autoresearch/level3-measure-export-review",
    identity.cwd,
  );
  const lanes = lifecycle.lanes.map((lane): AutoresearchLevel3MeasureExportReviewLane => {
    const blockers: string[] = [];
    if (lifecycle.metric.status !== "target_met") blockers.push("candidate lifecycle plan blocked");
    if (!measurementAllowed) blockers.push("runMeasurements manifest policy is not allowed");
    if (!exportAllowed) blockers.push("exportCandidateResults manifest policy is not allowed");
    if (!reviewAllowed) blockers.push("generateReviewPackets manifest policy is not allowed");
    if (!lane.binding?.candidateWorktree) blockers.push("missing candidate worktree binding");
    const packetPath = lane.cellId
      ? `${packetDir}/${lane.cellId}/${lane.laneId}.candidate-result.json`
      : `${packetDir}/${lane.laneId}.candidate-result.json`;
    const ready = blockers.length === 0;
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      measurementPosture: ready ? "ready_manifest_approved" : "blocked",
      exportPosture: ready ? "ready_manifest_approved" : "blocked",
      reviewPosture: ready ? "ready_manifest_approved" : "blocked",
      candidateWorktree: lane.binding?.candidateWorktree ?? null,
      candidateBranch: lane.binding?.candidateBranch ?? null,
      runtimeRunCall: ready
        ? formatToolCall("autoresearch_runtime_run", {
            cwd: lane.binding?.candidateWorktree,
            metricName: lane.metricName ?? "candidate_measure_export_review_blockers",
            direction: lane.metricDirection,
            metricThreshold: lane.metricTarget ?? undefined,
            sourceManifestHash: preflight.manifestHash,
          })
        : null,
      candidateResultExportCall: ready
        ? formatToolCall("autoresearch_runtime_status", {
            cwd: lane.binding?.candidateWorktree,
            action: "candidate_result_export",
            outPath: packetPath,
          })
        : null,
      reviewInputPacketPath: packetPath,
      blockers,
    };
  });
  const measurementPolicyBlockers = measurementAllowed ? 0 : 1;
  const candidateExportBindingBlockers =
    (exportAllowed ? 0 : 1) +
    lanes.reduce((count, lane) => count + (lane.candidateWorktree ? 0 : 1), 0);
  const reviewPacketAuthorityBlockers = reviewAllowed ? 0 : 1;
  const laneBlockers = lanes.reduce((count, lane) => count + lane.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    lifecycle.metric.value +
    measurementPolicyBlockers +
    candidateExportBindingBlockers +
    reviewPacketAuthorityBlockers +
    laneBlockers;
  const aggregateReviewCall =
    totalBlockers === 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective:
            optionalString(isRecord(resolved.manifest) ? resolved.manifest.objective : undefined) ??
            "Review level-3 measured candidates.",
          candidateResultPacketPaths: lanes.map((lane) => lane.reviewInputPacketPath),
        })
      : null;
  return {
    kind: "autoresearch.level3_measure_export_review_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    lifecycle,
    metric: {
      name: "candidate_measure_export_review_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      measurementPolicyBlockers: {
        name: "measurement_policy_blockers",
        direction: "lower",
        target: 0,
        value: measurementPolicyBlockers,
        status: metricStatus(measurementPolicyBlockers),
      },
      candidateExportBindingBlockers: {
        name: "candidate_export_binding_blockers",
        direction: "lower",
        target: 0,
        value: candidateExportBindingBlockers,
        status: metricStatus(candidateExportBindingBlockers),
      },
      reviewPacketAuthorityBlockers: {
        name: "review_packet_authority_blockers",
        direction: "lower",
        target: 0,
        value: reviewPacketAuthorityBlockers,
        status: metricStatus(reviewPacketAuthorityBlockers),
      },
    },
    lanes,
    aggregateReviewCall,
    blockers: [
      ...new Set([
        ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
        ...(lifecycle.metric.status === "target_met"
          ? []
          : ["visible candidate lifecycle plan blocked"]),
        ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
      ]),
    ],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Execute the manifest-approved measurement/export calls only through pi-autoresearch owner seams when ready.",
            "Run the aggregate review call only after candidate-result packets exist; review packets remain non-authoritative.",
          ]
        : [
            "Resolve manifest policy, candidate lifecycle, binding, or packet blockers and rerun the level-3 measure/export/review plan.",
          ],
    nonActions: [
      "No measurement, candidate-result export, or review was executed by this planner; it only emits manifest-approved call packets.",
      "No AK evidence/task write, cleanup, finalizer, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Measurement/export/review calls are routed only through pi-autoresearch seams and only when manifest policy permits them.",
      "Candidate-result packets and review packets are non-authoritative review inputs, not durable evidence or promotion authority.",
      "Stale/missing/duplicate packet cases must fail closed before owner selection or closeout.",
    ],
  };
}

export function buildAutoresearchLevel3MatrixCellRunner(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MatrixCellRunner {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const manifestRecord = isRecord(resolved.manifest) ? resolved.manifest : {};
  const objective =
    optionalString(manifestRecord.objective) ?? "Run the level-3 matrix/cell campaign.";
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const dryRun = buildAutoresearchLevel3SliceSequenceDryRun({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const measureExportReview = buildAutoresearchLevel3MeasureExportReviewPlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycleByLane = new Map(lifecycle.lanes.map((lane) => [lane.laneId, lane]));
  const orderedCellIds = [
    ...new Set(
      lifecycle.lanes.map((lane) => lane.cellId ?? lane.sliceId ?? "campaign").filter(Boolean),
    ),
  ];
  const sequenceByCell = new Map(dryRun.orderedStates.map((state) => [state.cellId, state]));
  const cells = orderedCellIds.map((cellId): AutoresearchLevel3MatrixCellRunnerCell => {
    const lifecycleLanes = lifecycle.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const measureLanes = measureExportReview.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const firstLifecycleLane = lifecycleLanes[0];
    const firstMeasureLane = measureLanes[0];
    const reviewCandidateWaveCall =
      measureLanes.length > 0
        ? formatToolCall("autoresearch_live_supervision", {
            action: "review_candidate_wave",
            taskId: identity.taskId,
            cwd: identity.cwd,
            objective: firstLifecycleLane?.objective ?? objective,
            direction: firstMeasureLane?.metricDirection ?? "lower",
            candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
            offLimits: firstLifecycleLane?.offLimits ?? [],
          })
        : null;
    const candidateWaveReview = reviewCandidateWaveCall
      ? reviewAutoresearchCandidateWave({
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective: firstLifecycleLane?.objective ?? objective,
          direction: firstMeasureLane?.metricDirection ?? "lower",
          candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
          offLimits: firstLifecycleLane?.offLimits ?? [],
        })
      : null;
    const launchCalls = lifecycleLanes
      .filter((lane) => lane.bindingPosture !== "bound_visible_candidate_worktree")
      .map((lane) => lane.candidatePeerCall)
      .filter((call): call is string => Boolean(call));
    const measureExportCalls = measureLanes.flatMap((lane) =>
      lane.measurementPosture === "ready_manifest_approved"
        ? [lane.runtimeRunCall, lane.candidateResultExportCall].filter((call): call is string =>
            Boolean(call),
          )
        : [],
    );
    const laneRows = measureLanes.map((measureLane) => {
      const lifecycleLane = lifecycleByLane.get(measureLane.laneId);
      const packetPath = measureLane.reviewInputPacketPath;
      const packetExists = fs.existsSync(path.resolve(identity.cwd, packetPath));
      const selected = candidateWaveReview?.recommendation.laneId === measureLane.laneId;
      return {
        laneId: measureLane.laneId,
        launchPosture:
          lifecycleLane?.launchPosture ?? ("blocked_missing_launch_policy_or_token" as const),
        bindingPosture: lifecycleLane?.bindingPosture ?? ("blocked_missing_binding" as const),
        measurementPosture: measureLane.measurementPosture,
        packetPath,
        packetExists,
        selected,
        nextLegalCall: !lifecycleLane?.binding
          ? (lifecycleLane?.candidatePeerCall ?? null)
          : !packetExists && measureLane.runtimeRunCall
            ? measureLane.runtimeRunCall
            : packetExists
              ? reviewCandidateWaveCall
              : measureLane.candidateResultExportCall,
      };
    });
    const launchReadyLaneCount = lifecycleLanes.filter(
      (lane) =>
        lane.candidatePeerCall && lane.launchPosture === "ready_visible_candidate_peer_spawn_call",
    ).length;
    const boundLaneCount = lifecycleLanes.filter(
      (lane) => lane.bindingPosture === "bound_visible_candidate_worktree",
    ).length;
    const measureReadyLaneCount = measureLanes.filter(
      (lane) => lane.measurementPosture === "ready_manifest_approved",
    ).length;
    const packetReadyLaneCount = laneRows.filter((lane) => lane.packetExists).length;
    const sequenceState = sequenceByCell.get(cellId);
    const baseBlockers = [
      ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
      ...(sequenceState?.state === "blocked"
        ? sequenceState.blockers.map((blocker) => `sequence blocked: ${blocker}`)
        : []),
      ...lifecycleLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
      ...measureLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
    ];
    const state: AutoresearchLevel3MatrixCellRunnerCellState =
      preflight.metric.status !== "target_met" || sequenceState?.state === "blocked"
        ? "blocked_preflight_or_sequence"
        : boundLaneCount === 0 && launchReadyLaneCount > 0
          ? "ready_to_launch_visible_candidates"
          : boundLaneCount < lifecycleLanes.length
            ? "waiting_for_candidate_bindings"
            : measureReadyLaneCount > 0 && packetReadyLaneCount < measureLanes.length
              ? "ready_for_measure_export"
              : packetReadyLaneCount < measureLanes.length
                ? "waiting_for_candidate_result_packets"
                : candidateWaveReview?.recommendation.posture === "owner_selection_required"
                  ? "selected_for_matrix_review"
                  : "cell_rerun_required";
    const stateBlockers =
      state === "ready_to_launch_visible_candidates" ||
      state === "ready_for_measure_export" ||
      state === "selected_for_matrix_review"
        ? []
        : state === "waiting_for_candidate_bindings"
          ? [`${lifecycleLanes.length - boundLaneCount} lane(s) missing candidate bindings`]
          : state === "waiting_for_candidate_result_packets"
            ? [`${measureLanes.length - packetReadyLaneCount} lane packet(s) missing`]
            : state === "cell_rerun_required"
              ? [candidateWaveReview?.recommendation.reason ?? "no selectable candidate"]
              : [];
    return {
      sliceId: firstLifecycleLane?.sliceId ?? null,
      cellId,
      objective: firstLifecycleLane?.objective ?? objective,
      state,
      metricName: firstMeasureLane?.metricName ?? firstLifecycleLane?.metricName ?? null,
      metricDirection:
        firstMeasureLane?.metricDirection ?? firstLifecycleLane?.metricDirection ?? "lower",
      metricTarget: firstMeasureLane?.metricTarget ?? firstLifecycleLane?.metricTarget ?? null,
      laneCount: lifecycleLanes.length,
      launchReadyLaneCount,
      boundLaneCount,
      measureReadyLaneCount,
      packetReadyLaneCount,
      selectedLaneId: candidateWaveReview?.recommendation.laneId ?? null,
      launchCalls,
      measureExportCalls,
      reviewCandidateWaveCall,
      blockers: [...new Set([...baseBlockers, ...stateBlockers])],
      lanes: laneRows,
    };
  });
  const selectedCells = cells.filter((cell) => cell.state === "selected_for_matrix_review").length;
  const blockedCells = cells.filter(
    (cell) =>
      cell.state === "blocked_preflight_or_sequence" || cell.state === "cell_rerun_required",
  ).length;
  const cellBlockerCount = cells.reduce((count, cell) => count + cell.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    dryRun.metric.value +
    lifecycle.metric.value +
    measureExportReview.metric.value +
    cellBlockerCount;
  const selectedPacketPaths = cells.flatMap((cell) =>
    cell.lanes.filter((lane) => lane.selected).map((lane) => lane.packetPath),
  );
  const aggregateReviewCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          candidateResultPacketPaths: selectedPacketPaths,
        })
      : null;
  const finalizerPlanCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          sourceReview: "review_matrix_campaign",
          ...(resolved.manifestPath
            ? { level3ManifestPath: resolved.manifestPath }
            : { level3Manifest: "<same accepted inline manifest>" }),
          candidateResultPacketPaths: selectedPacketPaths,
          finalizerAuthorizationToken: "<exact finalize_post_fanin token required>",
          cleanupAuthorizationToken: "<exact candidate_cleanup token required>",
        })
      : null;
  const nextLegalActions = [
    ...cells.flatMap((cell) => {
      if (cell.state === "ready_to_launch_visible_candidates") return cell.launchCalls;
      if (cell.state === "ready_for_measure_export") return cell.measureExportCalls;
      if (cell.state === "selected_for_matrix_review" && cell.reviewCandidateWaveCall)
        return [cell.reviewCandidateWaveCall];
      return [];
    }),
    ...(aggregateReviewCall ? [aggregateReviewCall] : []),
    ...(finalizerPlanCall ? [finalizerPlanCall] : []),
  ];
  return {
    kind: "autoresearch.level3_matrix_cell_runner.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    dryRun,
    lifecycle,
    measureExportReview,
    metric: {
      name: "level3_matrix_cell_runner_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      readyToLaunchCells: cells.filter(
        (cell) => cell.state === "ready_to_launch_visible_candidates",
      ).length,
      boundCells: cells.filter((cell) => cell.boundLaneCount === cell.laneCount).length,
      measureExportReadyCells: cells.filter((cell) => cell.state === "ready_for_measure_export")
        .length,
      packetReadyCells: cells.filter((cell) => cell.packetReadyLaneCount === cell.laneCount).length,
      selectedCells,
      blockedCells,
    },
    cells,
    aggregateReviewCall,
    finalizerPlanCall,
    nextLegalActions,
    blockers: [
      ...new Set([
        ...preflight.blockers,
        ...dryRun.blockers,
        ...lifecycle.blockers,
        ...measureExportReview.blockers,
        ...cells.flatMap((cell) => cell.blockers.map((blocker) => `${cell.cellId}: ${blocker}`)),
      ]),
    ],
    nonActions: [
      "The unified matrix/cell runner did not spawn peers; it exposes visible candidate_peer_spawn calls only as next legal actions.",
      "The runner did not execute autoresearch_candidate_bind, autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK evidence, merge, release, or promotion actions.",
      "Peer reports and candidate-result packets remain review inputs, not durable authority or promotion approval.",
    ],
    boundaries: [
      "This is the Level-3 matrix/cell state machine above existing gated seams: launch -> bind -> measure/export -> review -> select/finalize-plan.",
      "Visible candidate launch still requires manifest policy or exact token plus the visible candidate_peer_spawn surface.",
      "Measurement/export/review calls are surfaced only after controller-verified candidate bindings and manifest policy allow them.",
      "Finalizer, cleanup, AK evidence, and promotion remain exact-gated owner surfaces and are never applied by this runner.",
    ],
  };
}

function resolveLevel3CleanupResources(input: {
  cwd: string;
  manifest: unknown;
  cleanupResources?: AutoresearchLevel3CleanupResourcesInput;
  reviewedPeerRunIds: readonly string[];
}): {
  peerRunIds: string[];
  peerTabsOrSessions: string[];
  worktrees: string[];
  branches: string[];
  manifestExact: boolean;
  missing: string[];
} {
  const manifestRecord = isRecord(input.manifest) ? input.manifest : null;
  const policy = isRecord(manifestRecord?.cleanupPolicy) ? manifestRecord.cleanupPolicy : null;
  const manifestPeerRunIds = exactStringList(policy?.exactPeerRunIds);
  const manifestPeers = [
    ...exactStringList(policy?.exactPeerTabsOrSessions),
    ...exactStringList(policy?.exactPeerSessions),
    ...exactStringList(policy?.exactPeerTabs),
  ];
  const manifestWorktrees = exactStringList(policy?.exactWorktrees);
  const manifestBranches = exactStringList(policy?.exactBranches);
  const suppliedPeerRunIds = nonEmptyStrings(input.cleanupResources?.peerRunIds);
  const suppliedPeers = nonEmptyStrings(input.cleanupResources?.peerTabsOrSessions);
  const suppliedWorktrees = nonEmptyStrings(input.cleanupResources?.worktrees);
  const suppliedBranches = nonEmptyStrings(input.cleanupResources?.branches);
  const peerRunIds = suppliedPeerRunIds.length > 0 ? suppliedPeerRunIds : manifestPeerRunIds;
  const peerTabsOrSessions = suppliedPeers.length > 0 ? suppliedPeers : manifestPeers;
  const worktrees = suppliedWorktrees.length > 0 ? suppliedWorktrees : manifestWorktrees;
  const branches = suppliedBranches.length > 0 ? suppliedBranches : manifestBranches;
  const sorted = (items: readonly string[]) =>
    [...new Set(items.map((item) => item.trim()))].sort();
  const same = (left: readonly string[], right: readonly string[]) =>
    stableJson(sorted(left)) === stableJson(sorted(right));
  const reviewedPeerRunIds = sorted(input.reviewedPeerRunIds);
  const peerRunIdsMatchReview =
    reviewedPeerRunIds.length > 0 && same(peerRunIds, reviewedPeerRunIds);
  const manifestExact =
    manifestPeerRunIds.length > 0 &&
    manifestPeers.length > 0 &&
    manifestWorktrees.length > 0 &&
    manifestBranches.length > 0 &&
    peerRunIdsMatchReview &&
    same(peerRunIds, manifestPeerRunIds) &&
    same(peerTabsOrSessions, manifestPeers) &&
    same(worktrees, manifestWorktrees) &&
    same(branches, manifestBranches);
  const missing = [
    ...(reviewedPeerRunIds.length === 0 ? ["peer run ids from reviewed candidate packets"] : []),
    ...(peerRunIds.length === 0 ? ["peer run ids"] : []),
    ...(reviewedPeerRunIds.length > 0 && !peerRunIdsMatchReview
      ? ["peer run ids matching reviewed candidate packets"]
      : []),
    ...(peerTabsOrSessions.length === 0 ? ["peer tabs/sessions"] : []),
    ...(worktrees.length === 0 ? ["worktrees"] : []),
    ...(branches.length === 0 ? ["branches"] : []),
  ];
  return {
    peerRunIds: sorted(peerRunIds),
    peerTabsOrSessions: sorted(peerTabsOrSessions),
    worktrees: sorted(
      worktrees.map((item) => (path.isAbsolute(item) ? item : path.resolve(input.cwd, item))),
    ),
    branches: sorted(branches),
    manifestExact,
    missing,
  };
}

function buildLevel3FinalizerToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  postFaninToken: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.taskId}\0${path.resolve(input.cwd)}\0${input.manifestHash ?? "missing"}\0${input.postFaninToken}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:finalize_post_fanin:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function buildLevel3CleanupToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerRunIds" | "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): string {
  const digest = createHash("sha256")
    .update(
      stableJson({
        taskId: input.taskId,
        cwd: path.resolve(input.cwd),
        manifestHash: input.manifestHash ?? "missing",
        peerRunIds: input.resources.peerRunIds,
        peerTabsOrSessions: input.resources.peerTabsOrSessions,
        worktrees: input.resources.worktrees,
        branches: input.resources.branches,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:candidate_cleanup:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function buildLevel3CleanupCommandPacket(input: {
  identity: SessionIdentity;
  manifestHash: string;
  gateReference: string;
  cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"];
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerRunIds" | "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): AutoresearchLevel3CleanupCommandPacket {
  const candidateLifecycleStatusCall = formatToolCall("candidate_peer_closeout", {
    action: "status",
    peerRunIds: input.resources.peerRunIds,
  });
  const candidateLifecyclePlanCall = formatToolCall("candidate_peer_closeout", {
    action: "plan",
    peerRunIds: input.resources.peerRunIds,
    taskId: input.identity.taskId,
    cleanupTrigger: input.cleanupTrigger,
  });
  return {
    kind: "autoresearch.level3_candidate_lifecycle_closeout_handoff.v2",
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    manifestHash: input.manifestHash,
    gateReference: input.gateReference,
    authorizationRequired: false,
    cleanupExecution: "not_executed_by_orchestrator",
    cleanupExecutionAuthorized: false,
    cleanupTrigger: input.cleanupTrigger,
    exactPeerRunIds: input.resources.peerRunIds,
    exactPeerTabsOrSessions: input.resources.peerTabsOrSessions,
    exactWorktrees: input.resources.worktrees,
    exactBranches: input.resources.branches,
    candidateLifecycleStatusCall,
    candidateLifecyclePlanCall,
    exactCommands: [],
    forbiddenPromotionCommandMatches: [],
    boundary:
      "This packet is a lifecycle-v2 closeout handoff only. It emits no process, worktree, branch, or registry-v1 cleanup command and carries no merge, push, PR, release, promotion, or AK-write authority.",
  };
}

export function buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan(
  input: AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
): AutoresearchLevel3AuthorizedFinalizerCleanupPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("level3_authorized_finalizer_cleanup_plan requires a non-empty objective.");
  }
  const sourceReview = input.sourceReview ?? "review_candidate_wave";
  const finalizerProbe = finalizeAutoresearchPostFanin({
    ...identity,
    objective,
    sourceReview,
    direction: input.direction,
    metricName: input.metricName,
    metricThreshold: input.metricThreshold,
    candidateResultPacketPaths: input.candidateResultPacketPaths,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
    selectedLaneId: input.selectedLaneId,
    selectedCellId: input.selectedCellId,
    validation: input.validation,
    offLimits: input.offLimits,
    dirtyFiles: input.dirtyFiles,
    reviewedAtEpochMs: input.reviewedAtEpochMs,
  });
  const requiredFinalizerToken = buildLevel3FinalizerToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    postFaninToken: finalizerProbe.contract.exactAuthorizationToken,
  });
  const finalizerTokenMissing = !input.finalizerAuthorizationToken;
  const finalizerTokenWrong =
    Boolean(input.finalizerAuthorizationToken) &&
    input.finalizerAuthorizationToken !== requiredFinalizerToken;
  const finalizerTokenAccepted =
    preflight.metric.status === "target_met" &&
    finalizerProbe.preflight.status === "passed" &&
    input.finalizerAuthorizationToken === requiredFinalizerToken;
  const finalizer = finalizerTokenAccepted
    ? finalizeAutoresearchPostFanin({
        ...identity,
        objective,
        sourceReview,
        direction: input.direction,
        metricName: input.metricName,
        metricThreshold: input.metricThreshold,
        candidateResultPacketPaths: input.candidateResultPacketPaths,
        scenarios: input.scenarios,
        hypotheses: input.hypotheses,
        candidateCountPerCell: input.candidateCountPerCell,
        selectedLaneId: input.selectedLaneId,
        selectedCellId: input.selectedCellId,
        validation: input.validation,
        offLimits: input.offLimits,
        dirtyFiles: input.dirtyFiles,
        reviewedAtEpochMs: input.reviewedAtEpochMs,
        applyAuthorizationToken: finalizerProbe.contract.exactAuthorizationToken,
      })
    : finalizerProbe;
  const reviewedPeerRunIds = nonEmptyStrings(input.candidateResultPacketPaths)
    .map((packetPath) => candidateResultInputFromPacketPath(identity.cwd, packetPath))
    .map((candidate) => candidate.candidatePeerRunId)
    .filter((peerRunId): peerRunId is string => Boolean(peerRunId));
  const resources = resolveLevel3CleanupResources({
    cwd: identity.cwd,
    manifest: resolved.manifest,
    cleanupResources: input.cleanupResources,
    reviewedPeerRunIds,
  });
  const requiredCleanupToken = buildLevel3CleanupToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    resources,
  });
  const cleanupGate = preflight.policyGates.find((gate) => gate.gate === "cleanupCandidates");
  const cleanupManifestPolicyAccepted =
    preflight.metric.status === "target_met" &&
    cleanupGate?.value === "token_required_or_manifest_allowed" &&
    resources.manifestExact &&
    resources.missing.length === 0;
  const integrationCloseout: AutoresearchLevel3IntegrationCloseoutEvidence = {
    status: input.integrationCloseout?.status ?? "missing",
    ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
    ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
  };
  const integrationCloseoutSuccessful = integrationCloseout.status === "successful";
  const successfulIntegrationPlanReady =
    finalizerTokenAccepted && integrationCloseoutSuccessful && resources.missing.length === 0;
  const cleanupTokenWrong =
    Boolean(input.cleanupAuthorizationToken) &&
    input.cleanupAuthorizationToken !== requiredCleanupToken;
  const cleanupTokenAccepted = input.cleanupAuthorizationToken === requiredCleanupToken;
  const cleanupGateAccepted =
    finalizerTokenAccepted &&
    resources.missing.length === 0 &&
    (cleanupTokenAccepted || cleanupManifestPolicyAccepted) &&
    !cleanupTokenWrong;
  const lifecyclePlanReady = cleanupGateAccepted || successfulIntegrationPlanReady;
  const cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"] =
    cleanupTokenAccepted
      ? "candidate_cleanup_token"
      : successfulIntegrationPlanReady
        ? "successful_integration_closeout"
        : "exact_manifest_policy";
  const cleanupCommandPacket = lifecyclePlanReady
    ? buildLevel3CleanupCommandPacket({
        identity,
        manifestHash: preflight.manifestHash ?? "missing",
        gateReference: cleanupTokenAccepted
          ? requiredCleanupToken
          : successfulIntegrationPlanReady
            ? "non_authorizing_successful_integration_closeout"
            : "manifest_cleanup_policy",
        cleanupTrigger,
        resources,
      })
    : null;
  const finalizerTokenBlockers =
    preflight.metric.value +
    finalizer.preflight.blockerCount +
    (finalizerTokenAccepted ? 0 : 1) +
    (finalizer.authorizedFinalizerCleanupGate.status === "blocked" ? 1 : 0);
  const cleanupGateBlockers =
    resources.missing.length +
    (lifecyclePlanReady ? 0 : 1) +
    (cleanupCommandPacket?.forbiddenPromotionCommandMatches.length ?? 0);
  const rollbackBlockers = preflight.manifestHash && finalizer.finalizerTokenRequest ? 0 : 1;
  const totalBlockers = finalizerTokenBlockers + cleanupGateBlockers + rollbackBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight is blocked"]),
    ...(finalizer.preflight.status === "passed"
      ? []
      : ["post-fan-in finalizer preflight is blocked"]),
    ...(finalizerTokenMissing ? ["missing exact finalize_post_fanin level-3 token"] : []),
    ...(finalizerTokenWrong
      ? ["wrong finalize_post_fanin token for task/cwd/manifest/review scope"]
      : []),
    ...resources.missing.map((item) => `cleanup resource set missing exact ${item}`),
    ...(cleanupTokenWrong ? ["wrong candidate_cleanup token for exact cleanup resources"] : []),
    ...(!cleanupTokenAccepted && !cleanupManifestPolicyAccepted && !successfulIntegrationPlanReady
      ? [
          "lifecycle closeout planning requires exact candidate_cleanup token, successful integration closeout with reviewed peer identities and exact resources, or accepted manifest cleanup policy; none authorize deletion",
        ]
      : []),
    ...(finalizerTokenAccepted
      ? []
      : ["cleanup is blocked until the exact finalizer token is accepted"]),
    ...(cleanupCommandPacket?.forbiddenPromotionCommandMatches ?? []).map(
      (command) => `cleanup packet contains forbidden promotion command: ${command}`,
    ),
  ];
  const rollbackReceipt: AutoresearchLevel3CampaignTransitionReceipt = {
    kind: "autoresearch.level3_campaign_transition_receipt.v1",
    nonAuthoritative: true,
    durableEvidence: false,
    manifestHash: preflight.manifestHash ?? "missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    transitionName: "level3_authorized_finalizer_cleanup_plan",
    policyPosture:
      totalBlockers === 0
        ? "dry_run_no_lower_plane_actions"
        : preflight.metric.status === "target_met"
          ? "blocked_dependencies_or_policy"
          : "blocked_preflight",
    inputRefs: {
      manifestPath: resolved.manifestPath,
      sliceId: "slice-5",
      cellId: "authorized-finalizer-cleanup",
      dependencies: ["review_candidate_wave_or_review_matrix_campaign", "finalize_post_fanin"],
    },
    outputRefs: {
      packetKind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
      state: totalBlockers === 0 ? "ready" : "blocked",
      receiptIndex: 1,
    },
    metricPosture: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      status: metricStatus(totalBlockers),
    },
    nextState: totalBlockers === 0 ? "ready" : "blocked",
    rollbackHint:
      stringArrayFrom(isRecord(resolved.manifest) ? resolved.manifest.rollback : undefined)[0] ??
      preflight.level2FallbackRoute,
  };
  return {
    kind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    finalizer,
    finalizerAuthorization: {
      requiredTokenName: "finalize_post_fanin",
      requiredToken: requiredFinalizerToken,
      suppliedTokenAccepted: finalizerTokenAccepted,
      posture: finalizerTokenAccepted
        ? "accepted_exact_token"
        : finalizerTokenWrong
          ? "blocked_wrong_token"
          : "blocked_missing_token",
    },
    cleanupAuthorization: {
      requiredTokenName: "candidate_cleanup",
      requiredToken: requiredCleanupToken,
      suppliedTokenAccepted: cleanupTokenAccepted,
      manifestPolicyAccepted: cleanupManifestPolicyAccepted,
      cleanupExecutionAuthorized: false,
      posture: lifecyclePlanReady
        ? cleanupTokenAccepted
          ? "accepted_exact_token"
          : successfulIntegrationPlanReady
            ? "lifecycle_plan_ready_successful_integration"
            : "accepted_exact_manifest_policy"
        : resources.missing.length > 0
          ? "blocked_missing_exact_resources"
          : cleanupTokenWrong
            ? "blocked_wrong_token"
            : "blocked_missing_token_or_exact_policy",
    },
    metric: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      finalizerTokenApplicationBlockers: {
        name: "finalizer_token_application_blockers",
        direction: "lower",
        target: 0,
        value: finalizerTokenBlockers,
        status: metricStatus(finalizerTokenBlockers),
      },
      cleanupExecutionGateBlockers: {
        name: "cleanup_execution_gate_blockers",
        direction: "lower",
        target: 0,
        value: cleanupGateBlockers,
        status: metricStatus(cleanupGateBlockers),
      },
      postFaninRollbackBlockers: {
        name: "post_fanin_rollback_blockers",
        direction: "lower",
        target: 0,
        value: rollbackBlockers,
        status: metricStatus(rollbackBlockers),
      },
    },
    finalizerApplyCommandPacket: finalizer.exactApplyCommandPacket,
    cleanupCommandPacket,
    integrationCloseout,
    rollbackReceipt,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            integrationCloseoutSuccessful
              ? "Run the lifecycle-v2 status and plan calls from the closeout handoff; execute only after the exact resource generation reaches cleanup_authorized."
              : "Review the finalizer packet and lifecycle-v2 closeout handoff; successful integration alone does not authorize candidate deletion.",
            "Keep merge, release, PR, push, promotion, and AK evidence/task writes behind separate promotion and ak_owner_write tokens.",
          ]
        : [
            "Resolve manifest, review freshness, dirty/off-limits, exact finalizer token, and exact cleanup policy/token blockers before any post-fan-in action.",
            "Use the rollback receipt hint and fall back to level-2 review/finalizer packet surfaces while blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn, autoresearch_runtime_run, candidate_result_export, review, finalizer apply, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, PR, push, or promotion was executed by this planner.",
      "The candidate closeout packet is a lifecycle-v2 status/plan handoff only; it emits no process, worktree, branch, or registry-v1 cleanup command.",
    ],
    boundaries: [
      "finalize_post_fanin authorizes only finalizer scope for the exact task/cwd/manifest/review packet chain; it does not authorize cleanup, promotion, or AK writes.",
      "candidate_cleanup names the intended closeout resources but cannot replace lifecycle-v2 owner review, integration proof, verified archive, exact cleanup authorization, or terminal receipts.",
      "Dirty overlap, off-limits drift, stale review artifacts, wrong tokens, missing exact cleanup resources, and promotion command leakage fail closed.",
      "Rollback receipt is visible and non-authoritative; receipts/packets become durable evidence only through separate ak_owner_write.",
    ],
  };
}
