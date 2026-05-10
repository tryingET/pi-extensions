#!/usr/bin/env node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  reviewAutoresearchCandidateWave,
  reviewAutoresearchMatrixCampaign,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const addBlocker = (name) => {
  if (!blockers.includes(name)) blockers.push(name);
};

function writePacket(cwd, packetPath, laneId, metric) {
  mkdirSync(path.dirname(packetPath), { recursive: true });
  writeFileSync(
    packetPath,
    JSON.stringify({
      packetKind: "autoresearch.candidate_result.v1",
      adapterContractVersion: 1,
      cwd,
      campaign: "owner-review-route-dogfood",
      candidate: {
        source: "candidate_peer_spawn",
        worktreePath: path.join(cwd, ".worktrees", laneId),
        branch: `candidate/${laneId}`,
        baseRef: "HEAD",
        diffSummary: `${laneId} patch`,
        filesChanged: [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
      },
      candidateRun: {
        iteration: 1,
        status: "candidate",
        runKind: "ordinary",
        empiricalDecisionClass: "candidate_improvement",
        metric,
        description: `Measure ${laneId}`,
        timestamp: Date.now(),
        checks: "pass",
        experiment: { hypothesisId: laneId, hypothesis: `${laneId} hypothesis` },
      },
      empiricalDecisionClass: "candidate_improvement",
      resultSummary: `${laneId} measured by controller`,
      closeout: { status: { confidence: 2.2 } },
      adapterBoundary: "packet boundary",
    }),
  );
}

const cwd = mkdtempSync(path.join(tmpdir(), "orchestrator-owner-review-route-"));
const candidatePacketA = path.join(
  cwd,
  ".autoresearch",
  "candidate-wave",
  "candidate-01.candidate-result.json",
);
const candidatePacketB = path.join(
  cwd,
  ".autoresearch",
  "candidate-wave",
  "candidate-02.candidate-result.json",
);
writePacket(cwd, candidatePacketA, "candidate-01", 0);
writePacket(cwd, candidatePacketB, "candidate-02", 2);

const waveReview = reviewAutoresearchCandidateWave({
  taskId: 2777,
  cwd,
  objective: "prove dashboard-first owner review route",
  direction: "lower",
  candidateResultPacketPaths: [candidatePacketA, candidatePacketB],
});

if (waveReview.ownerReviewRoute?.primaryUi?.slashCommand !== "/autoresearch export") {
  addBlocker("candidate_wave_missing_dashboard_first_review_route");
}
if (waveReview.ownerReviewRoute?.primaryUi?.fallbackSlashCommand !== "/autoresearch overlay") {
  addBlocker("candidate_wave_missing_overlay_fallback");
}
if (waveReview.ownerReviewRoute?.decisionUi?.slashCommand !== "/autoresearch review") {
  addBlocker("candidate_wave_missing_final_decision_workbench");
}
if (
  !waveReview.ownerReviewRoute?.reviewFlow?.some((step) => /export before lifecycle/i.test(step))
) {
  addBlocker("candidate_wave_missing_dashboard_before_lifecycle_flow");
}
if (!/do(?:es)? not launch peers/i.test(waveReview.ownerReviewRoute?.boundary ?? "")) {
  addBlocker("candidate_wave_missing_non_mutation_boundary");
}

for (const cellId of ["cell-01-01", "cell-02-01"]) {
  writePacket(
    cwd,
    path.join(
      cwd,
      ".autoresearch",
      "matrix-campaign",
      cellId,
      "candidate-01.candidate-result.json",
    ),
    "candidate-01",
    0,
  );
  writePacket(
    cwd,
    path.join(
      cwd,
      ".autoresearch",
      "matrix-campaign",
      cellId,
      "candidate-02.candidate-result.json",
    ),
    "candidate-02",
    2,
  );
}

const matrixReview = reviewAutoresearchMatrixCampaign({
  taskId: 2777,
  cwd,
  objective: "prove matrix dashboard-first owner review route",
  direction: "lower",
  scenarios: ["happy path", "missing-lane recovery"],
  hypotheses: ["dashboard-first review"],
  candidateCountPerCell: 2,
});

if (matrixReview.ownerReview?.primaryUi?.slashCommand !== "/autoresearch export") {
  addBlocker("matrix_review_missing_dashboard_first_review_route");
}
if (matrixReview.ownerReview?.primaryUi?.fallbackSlashCommand !== "/autoresearch overlay") {
  addBlocker("matrix_review_missing_overlay_fallback");
}
if (matrixReview.ownerReview?.decisionUi?.slashCommand !== "/autoresearch review") {
  addBlocker("matrix_review_missing_final_decision_workbench");
}
if (
  !matrixReview.ownerReview?.reviewFlow?.some((step) => /Open \/autoresearch export/i.test(step))
) {
  addBlocker("matrix_review_missing_dashboard_first_flow");
}
if (!matrixReview.boundaries.some((boundary) => /does not launch peers/i.test(boundary))) {
  addBlocker("matrix_review_missing_non_mutation_boundary");
}

const unresolved = blockers.length;
console.log(`METRIC unresolved_owner_review_route_blockers=${unresolved}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved,
      candidateWave: {
        posture: waveReview.recommendation.posture,
        primaryUi: waveReview.ownerReviewRoute?.primaryUi?.slashCommand,
        decisionUi: waveReview.ownerReviewRoute?.decisionUi?.slashCommand,
      },
      matrix: {
        posture: matrixReview.posture,
        primaryUi: matrixReview.ownerReview?.primaryUi?.slashCommand,
        decisionUi: matrixReview.ownerReview?.decisionUi?.slashCommand,
      },
    },
    null,
    2,
  ),
);

process.exitCode = unresolved === 0 ? 0 : 1;
