#!/usr/bin/env node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planAutoresearchMatrixCampaign } from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const addBlocker = (name) => {
  if (!blockers.includes(name)) blockers.push(name);
};

const cwd = mkdtempSync(path.join(tmpdir(), "orchestrator-matrix-managed-wave-"));
const taskId = 2768;
const objective = "prove matrix campaign cells use managed candidate-wave fan-in";

const plan = planAutoresearchMatrixCampaign({
  taskId,
  cwd,
  objective,
  direction: "lower",
  scenarios: ["operator happy path", "missing planned lane recovery"],
  hypotheses: ["managed fan-in beats loose sidequests"],
  candidateCountPerCell: 2,
  parentPeerTarget: "controller-peer-dogfood",
  filesInScope: ["packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts"],
  constraints: ["no hidden peer launch", "matrix cells must not score raw PEER_FINAL text"],
});

if (plan.kind !== "autoresearch.matrix_campaign_plan.v1") {
  addBlocker("matrix_plan_wrong_kind");
}
if (plan.managedWaveSubstrate?.kind !== "autoresearch.matrix_managed_candidate_wave_substrate.v1") {
  addBlocker("matrix_missing_managed_wave_substrate");
}
if (plan.managedWaveSubstrate?.cellCount !== 2) {
  addBlocker("matrix_wrong_cell_count");
}
if (plan.managedWaveSubstrate?.candidateCountPerCell !== 2) {
  addBlocker("matrix_wrong_candidate_count_per_cell");
}
if (plan.managedWaveSubstrate?.expectedCandidateLaneCount !== 4) {
  addBlocker("matrix_wrong_expected_candidate_lane_count");
}
if (plan.managedWaveSubstrate?.finalOnlyScoring !== true) {
  addBlocker("matrix_missing_final_only_scoring");
}
if (plan.managedWaveSubstrate?.controllerMeasurementRequired !== true) {
  addBlocker("matrix_missing_controller_measurement_requirement");
}
if (plan.managedWaveSubstrate?.explicitPacketPathsGateSelection !== true) {
  addBlocker("matrix_missing_explicit_packet_gate");
}
if (plan.managedWaveSubstrate?.handoffContract?.requiredRunner !== "candidate_peer_spawn") {
  addBlocker("matrix_missing_required_candidate_peer_runner");
}
if (
  plan.managedWaveSubstrate?.handoffContract?.handoff !==
  "candidate_peer_spawn_to_candidate_worktree"
) {
  addBlocker("matrix_missing_candidate_worktree_handoff");
}
if (
  plan.managedWaveSubstrate?.handoffContract?.controllerInlineImplementation !== "process_violation"
) {
  addBlocker("matrix_missing_inline_implementation_violation_policy");
}
if (!plan.managedWaveSubstrate?.checklist?.some((item) => /managed candidate wave/i.test(item))) {
  addBlocker("matrix_missing_managed_wave_checklist");
}
if (!plan.managedWaveSubstrate?.checklist?.some((item) => /controller-measured/i.test(item))) {
  addBlocker("matrix_missing_controller_measured_checklist");
}
if (!plan.managedWaveSubstrate?.checklist?.some((item) => /process violation/i.test(item))) {
  addBlocker("matrix_missing_inline_violation_checklist");
}
if (
  !plan.managedWaveSubstrate?.checklist?.some((item) => /missing planned lanes gate/i.test(item))
) {
  addBlocker("matrix_missing_missing_lane_gate_checklist");
}
if (plan.managedWaveSubstrate?.cellFanInCalls?.length !== 2) {
  addBlocker("matrix_missing_cell_fan_in_calls");
}

for (const cell of plan.cells) {
  if (cell.managedWavePosture !== "managed_candidate_wave_required") {
    addBlocker(`cell_${cell.cellId}_missing_managed_wave_posture`);
  }
  if (!cell.fanInGate.includes("review_candidate_wave")) {
    addBlocker(`cell_${cell.cellId}_missing_review_gate`);
  }
  if (!cell.fanInGate.includes("missing planned lane packets gate")) {
    addBlocker(`cell_${cell.cellId}_missing_missing_lane_gate`);
  }
  if (!cell.planCandidateWaveCall.includes("plan_candidate_wave")) {
    addBlocker(`cell_${cell.cellId}_missing_plan_candidate_wave_call`);
  }
  if (!cell.reviewCandidateWaveCall.includes("review_candidate_wave")) {
    addBlocker(`cell_${cell.cellId}_missing_review_candidate_wave_call`);
  }
  if (!cell.reviewCandidateWaveCall.includes("candidateResultPacketPaths")) {
    addBlocker(`cell_${cell.cellId}_missing_explicit_packet_paths`);
  }
}

if (!plan.ownerReview.reviewFlow.some((step) => /bind, measure, and export/i.test(step))) {
  addBlocker("owner_review_missing_bind_measure_export_flow");
}
if (!plan.boundaries.some((boundary) => /plan_candidate_wave/i.test(boundary))) {
  addBlocker("boundaries_missing_candidate_wave_delegation");
}

const unresolved = blockers.length;
console.log(`METRIC unresolved_matrix_managed_wave_blockers=${unresolved}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved,
      matrix: {
        cells: plan.cells.length,
        candidateCountPerCell: plan.candidateCountPerCell,
        expectedCandidateLaneCount: plan.managedWaveSubstrate?.expectedCandidateLaneCount,
        managedWaveKind: plan.managedWaveSubstrate?.kind,
        firstCell: {
          cellId: plan.cells[0]?.cellId,
          managedWavePosture: plan.cells[0]?.managedWavePosture,
          candidateResultPacketPaths: plan.cells[0]?.candidateResultPacketPaths,
        },
      },
    },
    null,
    2,
  ),
);

process.exitCode = unresolved === 0 ? 0 : 1;
