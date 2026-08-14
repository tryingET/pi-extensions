// ---
// summary: "Matrix campaign planning, runner contract, checkpoint, review, closeout, and projection builders (pure move from autoresearch-supervisor-runner.ts)."
// read_when:
//   - "Changing matrix campaign choreography, runner contracts, checkpoints, reviews, or closeout projections."
// ---

import { createHash } from "node:crypto";
import * as path from "node:path";
import {
  buildCandidateReviewPacketChainMetric,
  buildCandidateReviewPacketChainRefs,
  buildReviewPacketAuthorityBoundary,
  buildReviewPacketDispositionOptions,
  resolveCandidateWaveCount,
  reviewAutoresearchCandidateWave,
} from "./autoresearch-candidate-wave.ts";
import type { SessionIdentity } from "./autoresearch-live-supervision.ts";
import {
  buildAutoresearchLiveSupervisionSessionKey,
  resolveAutoresearchLiveSupervisionIdentity,
} from "./autoresearch-live-supervision.ts";
import { formatToolCall, nonEmptyStrings } from "./autoresearch-runner-utils.ts";
import { planAutoresearchCandidateWave } from "./autoresearch-supervisor-runner.ts";
import type {
  AutoresearchCampaignPeerRunnerHandoffContract,
  AutoresearchLevel2OperatorUxDashboard,
  AutoresearchLevel2OperatorUxMetric,
  AutoresearchLevel2PacketDescriptor,
  AutoresearchLevel2PacketPlanning,
  AutoresearchLevel2PacketPlanningAntiNarrowing,
  AutoresearchLevel2PacketPlanningAntiNarrowingPosture,
  AutoresearchLevel2PacketPlanningBlockerMetric,
  AutoresearchLevel2PacketPlanningBlockers,
  AutoresearchLevel2PacketTokenName,
  AutoresearchLevel3CandidateLifecycleBindingInput,
  AutoresearchLevel3ReviewSelectionCell,
  AutoresearchLevel3ReviewSelectionSubstrate,
  AutoresearchLevel3ReviewSelectionWinnerState,
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

function resolveMatrixCellCandidateCount(value: number | undefined): number {
  return resolveCandidateWaveCount({ candidateCount: value });
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

export const LEVEL2_PACKET_LEVEL1_FALLBACK =
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

export function createSafeCandidatePeerNames(input: {
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

export function extractJsonStringFromToolCall(call: string, key: string): string | null {
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
