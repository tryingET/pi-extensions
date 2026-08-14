// ---
// summary: "Implements live autoresearch polling plus candidate-wave, matrix, Level-3, Level-4, review, finalizer, and cleanup supervision contracts."
// read_when:
//   - "Changing autoresearch live sessions, campaign choreography, candidate lineage gates, review packets, owner tokens, or closeout planning."
// ---

import {
  buildPlannedCandidateWaveManagement,
  defaultCandidateObjective,
  resolveCandidateWaveCount,
  resolveCandidateWavePacketDirectory,
} from "./autoresearch-candidate-wave.ts";
import { resolveAutoresearchLiveSupervisionIdentity } from "./autoresearch-live-supervision.ts";
import {
  formatToolCall,
  nonEmptyStrings,
  resolveStartCampaignPositiveIntegerBudget,
  resolveStartCampaignPositiveNumberBudget,
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

import type {
  AutoresearchCandidateWaveLane,
  AutoresearchCandidateWavePlan,
  AutoresearchCandidateWaveRequest,
} from "./autoresearch-types.ts";

export {
  buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  buildAutoresearchLevel3ManifestPreflight,
  buildAutoresearchLevel3MatrixCellRunner,
  buildAutoresearchLevel3MeasureExportReviewPlan,
  buildAutoresearchLevel3SliceSequenceDryRun,
  buildAutoresearchLevel3VisibleCandidateLifecyclePlan,
} from "./autoresearch-level3-planning.ts";
export {
  advanceAutoresearchLevel3MatrixCellExecutor,
  runAutoresearchLevel4CampaignRunner,
} from "./autoresearch-level4-runner.ts";
export {
  buildAutoresearchCampaignPeerRunnerHandoffContract,
  buildAutoresearchMatrixCampaignRunnerContract,
  checkpointAutoresearchMatrixCampaignRunner,
  planAutoresearchMatrixCampaign,
  reviewAutoresearchMatrixCampaign,
} from "./autoresearch-matrix-campaign.ts";
export * from "./autoresearch-types.ts";

import { createSafeCandidatePeerNames } from "./autoresearch-matrix-campaign.ts";

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
