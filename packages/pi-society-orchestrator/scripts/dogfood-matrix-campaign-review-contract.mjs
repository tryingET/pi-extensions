#!/usr/bin/env node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { reviewAutoresearchMatrixCampaign } from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const addBlocker = (name) => {
  if (!blockers.includes(name)) blockers.push(name);
};

function writePacket(cwd, cellId, laneId, metric) {
  const packetPath = path.join(
    cwd,
    ".autoresearch",
    "matrix-campaign",
    cellId,
    `${laneId}.candidate-result.json`,
  );
  mkdirSync(path.dirname(packetPath), { recursive: true });
  writeFileSync(
    packetPath,
    JSON.stringify(
      {
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "matrix-review-dogfood",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", `${cellId}-${laneId}`),
          branch: `candidate/${cellId}-${laneId}`,
          baseRef: "HEAD",
          diffSummary: `${cellId} ${laneId}`,
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
          description: `Measure ${cellId} ${laneId}`,
          timestamp: Date.now(),
          checks: "pass",
          experiment: {
            hypothesisId: laneId,
            hypothesis: `${cellId} ${laneId}`,
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: `${cellId} ${laneId} measured by controller`,
        closeout: { status: { confidence: 2.2 } },
        adapterBoundary: "packet boundary",
      },
      null,
      2,
    ),
  );
}

const cwd = mkdtempSync(path.join(tmpdir(), "orchestrator-matrix-review-"));
const common = {
  taskId: 2774,
  cwd,
  objective: "prove matrix aggregate review waits for managed cell waves",
  direction: "lower",
  scenarios: ["operator happy path", "missing planned lane recovery"],
  hypotheses: ["managed fan-in beats loose sidequests"],
  candidateCountPerCell: 2,
};

writePacket(cwd, "cell-01-01", "candidate-01", 0);
writePacket(cwd, "cell-01-01", "candidate-02", 2);

const incomplete = reviewAutoresearchMatrixCampaign(common);
if (incomplete.posture !== "waiting_for_managed_cell_waves") {
  addBlocker("incomplete_matrix_does_not_wait_for_cell_waves");
}
if (incomplete.completedCellCount !== 1) {
  addBlocker("incomplete_matrix_wrong_completed_cell_count");
}
if (!incomplete.exactNextCalls.some((call) => call.includes("cell-02-01"))) {
  addBlocker("incomplete_matrix_missing_cell_review_next_call");
}

writePacket(cwd, "cell-02-01", "candidate-01", 1);
writePacket(cwd, "cell-02-01", "candidate-02", 3);

const complete = reviewAutoresearchMatrixCampaign(common);
if (complete.kind !== "autoresearch.matrix_campaign_review.v1") {
  addBlocker("matrix_review_wrong_kind");
}
if (complete.posture !== "ready_for_matrix_owner_review") {
  addBlocker("complete_matrix_not_ready_for_owner_review");
}
if (complete.completedCellCount !== 2 || complete.expectedCellCount !== 2) {
  addBlocker("complete_matrix_wrong_cell_counts");
}
if (complete.selectedCellCount !== 2) {
  addBlocker("complete_matrix_wrong_selected_cell_count");
}
if (!complete.cells.every((cell) => cell.selectedLaneId === "candidate-01")) {
  addBlocker("complete_matrix_wrong_selected_lanes");
}
if (
  !complete.boundaries.some((boundary) =>
    /Raw peer messages are communication only/i.test(boundary),
  )
) {
  addBlocker("matrix_review_missing_peer_message_boundary");
}
if (!complete.boundaries.some((boundary) => /does not launch peers/i.test(boundary))) {
  addBlocker("matrix_review_missing_non_mutation_boundary");
}

const unresolved = blockers.length;
console.log(`METRIC unresolved_matrix_campaign_review_blockers=${unresolved}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved,
      incomplete: {
        posture: incomplete.posture,
        completedCellCount: incomplete.completedCellCount,
        expectedCellCount: incomplete.expectedCellCount,
      },
      complete: {
        posture: complete.posture,
        completedCellCount: complete.completedCellCount,
        expectedCellCount: complete.expectedCellCount,
        selectedCellCount: complete.selectedCellCount,
        selectedLanes: complete.cells.map((cell) => [cell.cellId, cell.selectedLaneId]),
      },
    },
    null,
    2,
  ),
);

process.exitCode = unresolved === 0 ? 0 : 1;
