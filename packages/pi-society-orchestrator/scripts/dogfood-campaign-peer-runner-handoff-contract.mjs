#!/usr/bin/env node
// Dogfood contract: campaign-style implementation must route through visible candidate runners.
// This catches the failure mode where a controller directly patches an implementation target
// instead of launching candidate_peer_spawn lanes and measuring candidate worktrees.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  planAutoresearchCandidateWave,
  planAutoresearchMatrixCampaign,
  reviewAutoresearchCandidateWave,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const addBlocker = (name) => {
  if (!blockers.includes(name)) blockers.push(name);
};

function includesAll(text, fragments, prefix) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) addBlocker(`${prefix}_missing_${fragment}`);
  }
}

const taskId = 2815;
const cwd = "/tmp/campaign-peer-runner-contract";
const objective =
  "fix a designmd-foundry campaign blocker without controller-inline implementation";
const filesInScope = ["packages/pi-designmd-foundry/src/**"];
const constraints = [
  "recent failure mode: controller directly patched designmd-foundry inline",
  "campaign implementation must use visible candidate runners",
];

const matrix = planAutoresearchMatrixCampaign({
  taskId,
  cwd,
  objective,
  direction: "lower",
  scenarios: ["designmd-foundry target patch"],
  hypotheses: ["candidate worktree handoff catches controller-inline bypasses"],
  candidateCountPerCell: 2,
  parentPeerTarget: "controller-peer-contract",
  filesInScope,
  constraints,
});

const matrixContract = matrix.managedWaveSubstrate?.handoffContract;
if (matrix.kind !== "autoresearch.matrix_campaign_plan.v1") {
  addBlocker("matrix_wrong_kind");
}
if (matrixContract?.requiredRunner !== "candidate_peer_spawn") {
  addBlocker("matrix_missing_candidate_peer_runner");
}
if (matrixContract?.handoff !== "candidate_peer_spawn_to_candidate_worktree") {
  addBlocker("matrix_missing_candidate_worktree_handoff");
}
if (matrixContract?.controllerInlineImplementation !== "process_violation") {
  addBlocker("matrix_missing_inline_process_violation");
}
if (matrixContract?.piAutoresearchPeerSpawning !== "forbidden_below_seam") {
  addBlocker("matrix_missing_autoresearch_below_seam_boundary");
}
if (matrix.implementationWaveSubstrate.nextExactCalls.length !== 1) {
  addBlocker("matrix_missing_single_next_cell_call");
}
const firstNextCall = matrix.implementationWaveSubstrate.nextExactCalls[0] ?? "";
includesAll(
  firstNextCall,
  ["autoresearch_live_supervision", "plan_candidate_wave"],
  "matrix_next_call",
);
if (/^(candidate_peer_spawn|edit|write|bash)\(/m.test(firstNextCall)) {
  addBlocker("matrix_next_call_skips_plan_candidate_wave_or_encourages_inline_patch");
}
if (
  !matrix.boundaries.some((boundary) =>
    /controller-inline implementation.*process violation/i.test(boundary),
  )
) {
  addBlocker("matrix_boundaries_missing_inline_violation_policy");
}
if (
  !matrix.ownerReview.reviewFlow.some((step) =>
    /Do not patch.*inline.*process violation/i.test(step),
  )
) {
  addBlocker("matrix_owner_review_missing_inline_violation_gate");
}

const firstCell = matrix.cells[0];
const candidateWave = planAutoresearchCandidateWave({
  taskId,
  cwd,
  objective: firstCell?.objective ?? objective,
  candidateCount: 2,
  candidateObjectives: [
    "candidate lane one fixes the target inside an isolated worktree",
    "candidate lane two fixes the target inside an isolated worktree",
  ],
  candidatePacketDirectory: firstCell?.candidatePacketDirectory,
  parentPeerTarget: "controller-peer-contract",
  filesInScope,
  constraints,
});

const waveContract = candidateWave.management?.handoffContract;
if (candidateWave.kind !== "autoresearch.candidate_wave_plan.v1") {
  addBlocker("candidate_wave_wrong_kind");
}
if (waveContract?.requiredRunner !== "candidate_peer_spawn") {
  addBlocker("candidate_wave_missing_candidate_peer_runner");
}
if (waveContract?.controllerInlineImplementation !== "process_violation") {
  addBlocker("candidate_wave_missing_inline_process_violation");
}
if (candidateWave.parentPeerTargetRequired !== false) {
  addBlocker("candidate_wave_missing_parent_peer_target");
}
if (candidateWave.lanes.length !== 2) {
  addBlocker("candidate_wave_wrong_lane_count");
}

for (const lane of candidateWave.lanes) {
  includesAll(
    lane.candidatePeerCall,
    [
      "candidate_peer_spawn",
      "controller-peer-contract",
      "Keep mutations inside the candidate worktree only",
      "Controller-inline implementation is a process violation",
    ],
    `${lane.laneId}_spawn_call`,
  );
  const measurement = lane.measurementPlan.join("\n");
  includesAll(
    measurement,
    ["autoresearch_candidate_bind", "autoresearch_runtime_run", "candidate_result_export"],
    `${lane.laneId}_measurement_plan`,
  );
  if (/^candidate_peer_spawn\(/m.test(measurement)) {
    addBlocker(`${lane.laneId}_measurement_plan_spawns_peer_below_seam`);
  }
}

if (!candidateWave.ownerSelection.aggregateReviewCall.includes("review_candidate_wave")) {
  addBlocker("candidate_wave_missing_aggregate_review");
}
if (
  !candidateWave.ownerSelection.reviewInstructions.some((item) =>
    /bypassing candidate_peer_spawn/i.test(item),
  )
) {
  addBlocker("candidate_wave_missing_inline_bypass_instruction");
}
if (
  !candidateWave.boundaries.some((boundary) =>
    /controller-inline implementation.*process violation/i.test(boundary),
  )
) {
  addBlocker("candidate_wave_boundaries_missing_inline_violation_policy");
}

const reviewRoot = mkdtempSync(path.join(tmpdir(), "campaign-peer-runner-review-"));
const inlinePacket = path.join(reviewRoot, "candidate-inline.candidate-result.json");
const peerPacket = path.join(reviewRoot, "candidate-peer.candidate-result.json");
writeFileSync(
  inlinePacket,
  JSON.stringify({
    packetKind: "autoresearch.candidate_result.v1",
    adapterContractVersion: 1,
    cwd: reviewRoot,
    campaign: "campaign-peer-runner-lineage-negative",
    candidate: {
      source: "manual",
      worktreePath: reviewRoot,
      branch: "main",
      baseRef: "HEAD",
      diffSummary: "controller-inline patch that should not be selectable",
      filesChanged: ["packages/pi-designmd-foundry/src/inline.ts"],
    },
    candidateRun: {
      iteration: 1,
      status: "candidate",
      runKind: "ordinary",
      empiricalDecisionClass: "candidate_improvement",
      metric: 0,
      description: "Inline controller patch with best metric",
      timestamp: 1,
      checks: "pass",
      experiment: {
        hypothesisId: "candidate-inline",
        hypothesis:
          "This packet would previously win by metric but lacks candidate runner lineage.",
      },
    },
    empiricalDecisionClass: "candidate_improvement",
    resultSummary: "best metric but controller-inline/manual lineage",
    closeout: { status: { confidence: 3.3 } },
    adapterBoundary: "packet boundary",
  }),
);
writeFileSync(
  peerPacket,
  JSON.stringify({
    packetKind: "autoresearch.candidate_result.v1",
    adapterContractVersion: 1,
    cwd: reviewRoot,
    campaign: "campaign-peer-runner-lineage-positive",
    candidate: {
      source: "candidate_peer_spawn",
      peerRunId: "candidatepeer-contract-positive",
      runnerId: "candidate-runner-contract-positive",
      worktreePath: path.join(reviewRoot, ".worktrees", "candidate-peer"),
      branch: "candidate/candidate-peer",
      baseRef: "HEAD",
      diffSummary: "visible candidate peer worktree patch",
      filesChanged: ["packages/pi-designmd-foundry/src/candidate.ts"],
    },
    candidateRun: {
      iteration: 1,
      status: "candidate",
      runKind: "ordinary",
      empiricalDecisionClass: "candidate_improvement",
      metric: 5,
      description: "Visible candidate runner patch",
      timestamp: 2,
      checks: "pass",
      experiment: {
        hypothesisId: "candidate-peer",
        hypothesis: "This packet keeps selectable candidate runner lineage.",
      },
    },
    empiricalDecisionClass: "candidate_improvement",
    resultSummary: "valid visible candidate runner lineage",
    closeout: { status: { confidence: 2.7 } },
    adapterBoundary: "packet boundary",
  }),
);

const lineageReview = reviewAutoresearchCandidateWave({
  taskId,
  cwd: reviewRoot,
  objective: "reject inline/manual packets even when their metric is best",
  direction: "lower",
  candidateResultPacketPaths: [inlinePacket, peerPacket],
});
const inlineLane = lineageReview.lanes.find((lane) => lane.laneId === "candidate-inline");
const peerLane = lineageReview.lanes.find((lane) => lane.laneId === "candidate-peer");
if (lineageReview.recommendation.laneId !== "candidate-peer") {
  addBlocker("lineage_review_selected_non_peer_candidate");
}
if (
  inlineLane?.selectable !== false ||
  !/process_violation/.test(inlineLane?.selectionReason ?? "")
) {
  addBlocker("lineage_review_did_not_reject_inline_packet");
}
if (peerLane?.selectable !== true) {
  addBlocker("lineage_review_rejected_valid_peer_packet");
}
if (peerLane?.candidatePeerRunId !== "candidatepeer-contract-positive") {
  addBlocker("lineage_review_missing_peer_run_id");
}

const unresolved = blockers.length;
console.log(`METRIC unresolved_campaign_peer_runner_handoff_blockers=${unresolved}`);
console.log(
  JSON.stringify(
    {
      cwd,
      taskId,
      blockers,
      unresolved,
      matrix: {
        nextExactCalls: matrix.implementationWaveSubstrate.nextExactCalls,
        handoffContract: matrix.managedWaveSubstrate.handoffContract,
      },
      candidateWave: {
        laneCount: candidateWave.lanes.length,
        firstLaneLaunch: candidateWave.lanes[0]?.candidatePeerCall ?? null,
        firstLaneMeasurement: candidateWave.lanes[0]?.measurementPlan ?? [],
        handoffContract: candidateWave.management.handoffContract,
      },
      lineageReview: {
        recommendation: lineageReview.recommendation.laneId,
        inlineSelectable: inlineLane?.selectable ?? null,
        inlineReason: inlineLane?.selectionReason ?? null,
        peerSelectable: peerLane?.selectable ?? null,
        peerRunId: peerLane?.candidatePeerRunId ?? null,
      },
    },
    null,
    2,
  ),
);

process.exitCode = unresolved === 0 ? 0 : 1;
