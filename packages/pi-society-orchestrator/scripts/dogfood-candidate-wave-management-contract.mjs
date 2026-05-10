#!/usr/bin/env node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  planAutoresearchCandidateWave,
  reviewAutoresearchCandidateWave,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

const blockers = [];
const addBlocker = (name) => {
  if (!blockers.includes(name)) blockers.push(name);
};

function writeCandidatePacket(filePath, input) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd: input.cwd,
        campaign: "candidate-wave-management-dogfood",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(input.cwd, ".worktrees", input.laneId),
          branch: `candidate/${input.laneId}`,
          baseRef: "HEAD",
          diffSummary: `${input.laneId} bounded candidate patch`,
          filesChanged: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: input.status,
          metric: input.metric,
          description: `Measure ${input.laneId}`,
          timestamp: Date.now(),
          checks: input.checks,
          experiment: {
            hypothesisId: input.laneId,
            hypothesis: input.hypothesis,
          },
        },
        empiricalDecisionClass: input.status,
        resultSummary: `${input.laneId} measured by controller`,
        closeout: { status: { confidence: 2.2 } },
        adapterBoundary: "packet boundary",
      },
      null,
      2,
    ),
  );
}

const cwd = mkdtempSync(path.join(tmpdir(), "orchestrator-candidate-wave-management-"));
const taskId = 2763;
const objective = "prove managed candidate-wave fan-in before matrix automation";

const plan = planAutoresearchCandidateWave({
  taskId,
  cwd,
  objective,
  candidateCount: 2,
  parentPeerTarget: "controller-peer-dogfood",
  candidateObjectives: [
    "candidate lane one improves fan-in status",
    "candidate lane two improves selection accounting",
  ],
});

if (plan.management?.kind !== "autoresearch.candidate_wave_management.v1") {
  addBlocker("plan_missing_management_packet");
}
if (plan.management?.posture !== "planned_not_launched") {
  addBlocker("plan_missing_planned_not_launched_posture");
}
if (plan.management?.finalOnlyScoring !== true) {
  addBlocker("plan_missing_final_only_scoring_contract");
}
if (plan.management?.controllerMeasurementRequired !== true) {
  addBlocker("plan_missing_controller_measurement_requirement");
}
if (!plan.management?.fanInChecklist?.some((item) => /PEER_FINAL.*communication/i.test(item))) {
  addBlocker("plan_missing_peer_final_not_evidence_boundary");
}
if (!plan.ownerSelection.aggregateReviewCall.includes("review_candidate_wave")) {
  addBlocker("plan_missing_aggregate_review_call");
}

const packetA = path.join(
  cwd,
  ".autoresearch",
  "candidate-wave",
  "candidate-01.candidate-result.json",
);
const packetB = path.join(
  cwd,
  ".autoresearch",
  "candidate-wave",
  "candidate-02.candidate-result.json",
);
writeCandidatePacket(packetA, {
  cwd,
  laneId: "candidate-01",
  metric: 0,
  status: "candidate_improvement",
  checks: "pass",
  hypothesis: "candidate one is best",
});

const incompleteReview = reviewAutoresearchCandidateWave({
  taskId,
  cwd,
  objective,
  direction: "lower",
  candidateResultPacketPaths: [packetA, packetB],
});
if (incompleteReview.recommendation.posture !== "planned_lanes_incomplete") {
  addBlocker("incomplete_review_does_not_gate_selection");
}
if (incompleteReview.management?.posture !== "waiting_for_planned_lanes") {
  addBlocker("incomplete_review_missing_waiting_posture");
}
if (incompleteReview.management?.completedLaneCount !== 1) {
  addBlocker("incomplete_review_wrong_completed_count");
}
if (incompleteReview.recommendation.exactNextCalls.length !== 0) {
  addBlocker("incomplete_review_still_emits_selection_calls");
}

writeCandidatePacket(packetB, {
  cwd,
  laneId: "candidate-02",
  metric: 2,
  status: "candidate_improvement",
  checks: "pass",
  hypothesis: "candidate two is a backup",
});

const completeReview = reviewAutoresearchCandidateWave({
  taskId,
  cwd,
  objective,
  direction: "lower",
  candidateResultPacketPaths: [packetA, packetB],
});
if (completeReview.recommendation.posture !== "owner_selection_required") {
  addBlocker("complete_review_missing_owner_selection_posture");
}
if (completeReview.recommendation.laneId !== "candidate-01") {
  addBlocker("complete_review_wrong_winner");
}
if (completeReview.management?.posture !== "ready_for_owner_selection") {
  addBlocker("complete_review_missing_ready_posture");
}
if (completeReview.management?.completedLaneCount !== 2) {
  addBlocker("complete_review_wrong_completed_count");
}
if (!completeReview.management?.nonSelectedLanePolicy?.includes("stop/cancel")) {
  addBlocker("complete_review_missing_non_selected_stop_policy");
}
if (!completeReview.management?.fanInChecklist?.some((item) => /controller-measured/i.test(item))) {
  addBlocker("complete_review_missing_controller_measured_scoring_rule");
}

const unresolved = blockers.length;
console.log(`METRIC unresolved_candidate_wave_management_blockers=${unresolved}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved,
      plan: {
        posture: plan.management?.posture,
        waveId: plan.management?.waveId,
        laneStates: plan.management?.laneStates?.map((lane) => lane.state),
      },
      incompleteReview: {
        posture: incompleteReview.recommendation.posture,
        managementPosture: incompleteReview.management?.posture,
        completed: incompleteReview.management?.completedLaneCount,
        expected: incompleteReview.management?.expectedLaneCount,
      },
      completeReview: {
        posture: completeReview.recommendation.posture,
        managementPosture: completeReview.management?.posture,
        winner: completeReview.recommendation.laneId,
        completed: completeReview.management?.completedLaneCount,
        expected: completeReview.management?.expectedLaneCount,
      },
    },
    null,
    2,
  ),
);

process.exitCode = unresolved === 0 ? 0 : 1;
