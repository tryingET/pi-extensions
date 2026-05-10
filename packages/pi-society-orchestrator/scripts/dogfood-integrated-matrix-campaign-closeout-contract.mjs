#!/usr/bin/env node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planAutoresearchMatrixCampaign,
  reviewAutoresearchMatrixCampaign,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const cwd = mkdtempSync(path.join(os.tmpdir(), "orchestrator-integrated-matrix-closeout-"));
const taskId = 2786;
const objective = "prove integrated supervised matrix campaign closeout";
const scenarios = ["dashboard-first owner review", "evidence projection handoff"];
const hypotheses = ["managed matrix closeout beats chat-local glue"];
const candidateCountPerCell = 2;

function addBlocker(blocker) {
  blockers.push(blocker);
}

function writeCandidatePacket({ cellId, laneId, metric, empiricalDecisionClass }) {
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
        campaign: "integrated-matrix-closeout-dogfood",
        candidate: {
          source: "controller_verified_synthetic_dogfood_packet",
          worktreePath: path.join(cwd, ".worktrees", `${cellId}-${laneId}`),
          branch: `candidate/${cellId}-${laneId}`,
          baseRef: "HEAD",
          diffSummary: `${cellId} ${laneId} dogfood candidate packet`,
          filesChanged: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass,
          metric,
          description: `Measure ${cellId} ${laneId}`,
          timestamp: Date.now(),
          checks: "pass",
          experiment: {
            hypothesisId: laneId,
            hypothesis: `${cellId} ${laneId}`,
          },
        },
        empiricalDecisionClass,
        resultSummary: `${cellId} ${laneId} measured for integrated closeout`,
        closeout: { status: { confidence: 2.4 } },
        adapterBoundary:
          "candidate packet is measurement evidence only; promotion remains external",
      },
      null,
      2,
    ),
  );
}

const request = {
  taskId,
  cwd,
  objective,
  direction: "lower",
  scenarios,
  hypotheses,
  candidateCountPerCell,
  maxIterationsPerCandidate: 1,
  maxWallClockMinutesPerCandidate: 10,
};

const plan = planAutoresearchMatrixCampaign(request);
for (const cell of plan.cells) {
  writeCandidatePacket({
    cellId: cell.cellId,
    laneId: "candidate-01",
    metric: 1,
    empiricalDecisionClass: "candidate_improvement",
  });
  writeCandidatePacket({
    cellId: cell.cellId,
    laneId: "candidate-02",
    metric: 4,
    empiricalDecisionClass: "candidate_improvement",
  });
}

const review = reviewAutoresearchMatrixCampaign(request);

if (plan.managedWaveSubstrate?.kind !== "autoresearch.matrix_managed_candidate_wave_substrate.v1") {
  addBlocker("plan_missing_managed_wave_substrate");
}
if (!plan.cells.every((cell) => cell.planCandidateWaveCall.includes("plan_candidate_wave"))) {
  addBlocker("plan_missing_cell_candidate_wave_calls");
}
if (!plan.cells.every((cell) => cell.reviewCandidateWaveCall.includes("review_candidate_wave"))) {
  addBlocker("plan_missing_cell_review_candidate_wave_calls");
}
if (!plan.ownerReview.reviewFlow.some((step) => /export/i.test(step))) {
  addBlocker("plan_missing_dashboard_first_owner_review_flow");
}

if (review.kind !== "autoresearch.matrix_campaign_review.v1") {
  addBlocker("review_wrong_kind");
}
if (review.posture !== "ready_for_matrix_owner_review") {
  addBlocker(`review_not_ready:${review.posture}`);
}
if (review.selectedCellCount !== plan.cells.length) {
  addBlocker(
    `review_selected_cell_count_mismatch:${review.selectedCellCount}:${plan.cells.length}`,
  );
}
if (!review.cells.every((cell) => cell.selectedLaneId === "candidate-01")) {
  addBlocker("review_selected_unexpected_lane");
}

if (review.closeout?.kind !== "autoresearch.matrix_campaign_closeout.v1") {
  addBlocker("closeout_missing_or_wrong_kind");
}
if (review.closeout?.posture !== "ak_ready_after_owner_review") {
  addBlocker(`closeout_not_ak_ready_after_owner_review:${review.closeout?.posture ?? "missing"}`);
}
if (review.closeout?.evidenceProjection?.posture !== "ready_for_external_projection") {
  addBlocker(
    `closeout_evidence_projection_not_ready:${review.closeout?.evidenceProjection?.posture ?? "missing"}`,
  );
}
if (review.closeout?.evidenceProjection?.requiredAnchor !== `taskId:${taskId}`) {
  addBlocker("closeout_missing_exact_task_anchor");
}
if (
  !review.closeout?.evidenceProjection?.projectionKey?.startsWith(`matrix-closeout|task:${taskId}|`)
) {
  addBlocker("closeout_missing_projection_key");
}
if (!review.closeout?.evidenceProjection?.exactRecordCall?.includes("evidence_record")) {
  addBlocker("closeout_missing_exact_evidence_record_call");
}
if (
  !review.closeout?.evidenceProjection?.exactRecordCall?.includes(
    "autoresearch:matrix-campaign:closeout",
  )
) {
  addBlocker("closeout_evidence_record_call_missing_check_type");
}
if (review.closeout?.ownerDecisionRoute?.dashboardFirst !== "/autoresearch export") {
  addBlocker("closeout_missing_dashboard_first_route");
}
if (review.closeout?.ownerDecisionRoute?.overlayFallback !== "/autoresearch overlay") {
  addBlocker("closeout_missing_overlay_fallback_route");
}
if (review.closeout?.ownerDecisionRoute?.finalDecision !== "/autoresearch review") {
  addBlocker("closeout_missing_final_decision_route");
}
if (review.closeout?.selectedLanes?.length !== plan.cells.length) {
  addBlocker("closeout_selected_lane_count_mismatch");
}
if (
  !review.closeout?.packetPaths?.every((packetPath) =>
    packetPath.includes(".autoresearch/matrix-campaign"),
  )
) {
  addBlocker("closeout_missing_matrix_packet_paths");
}
if (!review.closeout?.notDone?.some((item) => /No peer was launched/i.test(item))) {
  addBlocker("closeout_missing_no_peer_boundary");
}
if (!review.closeout?.notDone?.some((item) => /No benchmark was run/i.test(item))) {
  addBlocker("closeout_missing_no_benchmark_boundary");
}
if (
  !review.closeout?.notDone?.some((item) =>
    /No merge, promotion, AK evidence write, KES write/i.test(item),
  )
) {
  addBlocker("closeout_missing_external_write_boundary");
}
if (
  !review.boundaries.some((boundary) => /Raw peer messages are communication only/i.test(boundary))
) {
  addBlocker("review_missing_peer_message_boundary");
}

console.log(`METRIC unresolved_integrated_matrix_campaign_closeout_blockers=${blockers.length}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved: blockers.length,
      plan: {
        cells: plan.cells.length,
        candidateCountPerCell: plan.candidateCountPerCell,
        managedWaveSubstrate: plan.managedWaveSubstrate.kind,
      },
      review: {
        posture: review.posture,
        selectedCellCount: review.selectedCellCount,
        closeoutPosture: review.closeout?.posture ?? null,
        evidenceProjection: review.closeout?.evidenceProjection?.posture ?? null,
        projectionKey: review.closeout?.evidenceProjection?.projectionKey ?? null,
        evidenceRecordCall: review.closeout?.evidenceProjection?.exactRecordCall ?? null,
        dashboardFirst: review.closeout?.ownerDecisionRoute?.dashboardFirst ?? null,
      },
    },
    null,
    2,
  ),
);

if (blockers.length > 0) {
  process.exitCode = 1;
}
