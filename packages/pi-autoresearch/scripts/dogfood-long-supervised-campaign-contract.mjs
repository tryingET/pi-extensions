#!/usr/bin/env node
// summary: Exercises a multi-segment campaign, candidate matrix review, and external evidence handoff end to end.
// read_when:
//   - Validating long supervised campaign continuation, candidate comparison, or closeout boundaries.
// Long supervised campaign dogfood contract.
// Exercises the intended "greater campaign" path in an isolated controller repo:
// campaign_start bounded loop -> resume_apply continuation -> visible candidate packets
// -> orchestrator matrix review closeout -> exact evidence handoff. The contract runs real
// pi-autoresearch runtime functions, but does not launch peers, merge worktrees, write AK/KES
// evidence, or promote candidates.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const orchestratorRuntimeUrl = pathToFileURL(
  path.join(
    repoRoot,
    "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
  ),
).href;
const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";
const tempRoot = process.env.PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-long-campaign-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT;
const tsxTsconfigPath = path.join(tempRoot, "tsx-tsconfig.json");
writeFileSync(
  tsxTsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        baseUrl: repoRoot,
        paths: {
          "@tryinget/pi-autoresearch/*": ["packages/pi-autoresearch/*"],
        },
      },
    },
    null,
    2,
  ),
);

const runnerSource = `
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchCandidateBindPlan,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  executeAutoresearchCampaignStart,
  executeAutoresearchResumeApply,
  executeAutoresearchRun,
  writeAutoresearchCandidateResultPacket,
} from ${JSON.stringify(runtimeUrl)};
import {
  planAutoresearchMatrixCampaign,
  reviewAutoresearchMatrixCampaign,
} from ${JSON.stringify(orchestratorRuntimeUrl)};

const root = ${JSON.stringify(tempRoot)};
const taskId = 2790;
const controller = path.join(root, "controller");
const blockers = [];
const objective =
  "Prove a long supervised pi-extensions campaign can run multiple tries, resume explicitly, compare candidates, and hand off evidence without hidden autonomy.";
const metricName = "unresolved_long_campaign_blockers";

function addBlocker(id, details = undefined) {
  blockers.push(details === undefined ? id : id + ":" + JSON.stringify(details));
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeNodeCommand(scriptPath, ...args) {
  return ["node", JSON.stringify(scriptPath), ...args.map((arg) => JSON.stringify(arg))].join(" ");
}

function createCandidate({ cellId, laneId, score }) {
  const worktree = path.join(root, "worktrees", cellId + "-" + laneId);
  const branch = "candidate/" + cellId + "-" + laneId;
  git(controller, ["worktree", "add", "-b", branch, worktree, "HEAD"]);
  writeFileSync(path.join(worktree, "score.txt"), String(score) + "\\n");
  git(worktree, ["add", "score.txt"]);
  git(worktree, ["commit", "-m", "candidate " + cellId + " " + laneId + " score " + score]);
  return { worktree, branch };
}

function formatMetricTrail(metrics) {
  return metrics.length === 0 ? "none" : metrics.join(" -> ");
}

function printOperatorCheckpointSummary({
  campaign,
  firstMetrics,
  resumePlan,
  resumeApply,
  resumeMetrics,
  postResumeStatus,
  matrixPlan,
  matrixReview,
  packetPaths,
  closeout,
  learning,
  akEvidence,
  decision,
  blockers,
}) {
  const selectedLanes = matrixReview.cells.map((cell) => cell.cellId + ":" + cell.selectedLaneId).join(", ");
  const boundarySummary = ["peer launch off", "candidate lifecycle plan-only", "no merge/promotion", "AK/KES handoff packets only"].join("; ");

  console.log("LONG SUPERVISED CAMPAIGN CHECKPOINTS");
  console.log("1. campaign_start: " + (campaign.loopResult?.completedIterations ?? 0) + " iteration(s), metric trail " + formatMetricTrail(firstMetrics));
  console.log("2. resume gate: " + (resumePlan.planReady ? "ready" : "blocked") + ", executor confirmation " + (resumePlan.futureForegroundCall?.includes('operatorConfirmation: "RUN FOREGROUND RESUME"') ? "present" : "missing"));
  console.log("3. foreground resume: " + (resumeApply?.loopResult.completedIterations ?? 0) + " iteration(s), metric trail " + formatMetricTrail(resumeMetrics));
  console.log("4. final controller posture: " + postResumeStatus.currentSegment.runCount + " run(s), best " + postResumeStatus.currentSegment.bestMetric);
  console.log("5. candidate matrix: " + matrixPlan.cells.length + " cell(s), " + packetPaths.length + " candidate-result packet(s), selected " + selectedLanes);
  console.log("6. closeout handoff: " + matrixReview.closeout.posture + ", evidence projection " + matrixReview.closeout.evidenceProjection.posture + ", learning " + learning.packetKind + ", AK evidence " + akEvidence.packetKind + ", owner decision " + decision.recommendedDecision);
  console.log("7. closeout history: " + closeout.runs.length + " total measured run(s); " + boundarySummary);
  console.log("Result: unresolved_long_supervised_campaign_blockers=" + blockers.length);
}

function printFailedOperatorCheckpointSummary({ blockers }) {
  console.log("LONG SUPERVISED CAMPAIGN CHECKPOINTS");
  console.log("1. campaign aborted before the full checkpoint timeline could be built.");
  console.log("Result: unresolved_long_supervised_campaign_blockers=" + blockers.length);
}

try {
  mkdirSync(controller, { recursive: true });
  git(controller, ["init"]);
  git(controller, ["config", "user.email", "pi-autoresearch@example.invalid"]);
  git(controller, ["config", "user.name", "Pi Autoresearch Dogfood"]);
  writeFileSync(path.join(controller, "score.txt"), "3\\n");
  writeFileSync(path.join(controller, "README.md"), "# Long supervised campaign dogfood\\n");
  git(controller, ["add", "score.txt", "README.md"]);
  git(controller, ["commit", "-m", "baseline long campaign"]);
  const baseRef = git(controller, ["rev-parse", "HEAD"]);

  const longBenchmark = path.join(controller, "long-benchmark.mjs");
  const checksScript = path.join(controller, "checks.mjs");
  const candidateBenchmark = path.join(controller, "candidate-benchmark.mjs");
  writeFileSync(
    longBenchmark,
    [
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const statePath = '.long-campaign-attempt.json';",
      "const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { attempt: 0 };",
      "state.attempt += 1;",
      "writeFileSync(statePath, JSON.stringify(state));",
      "const metric = Math.max(0, 4 - state.attempt);",
      "console.log('METRIC " + metricName + "=' + metric);",
    ].join("\\n"),
  );
  writeFileSync(checksScript, "console.log('checks pass');\\n");
  writeFileSync(
    candidateBenchmark,
    [
      "import { readFileSync } from 'node:fs';",
      "const scorePath = process.argv[2];",
      "const score = Number(readFileSync(scorePath, 'utf8'));",
      "console.log('METRIC " + metricName + "=' + score);",
    ].join("\\n"),
  );

  const campaign = await executeAutoresearchCampaignStart({
    cwd: controller,
    objective,
    setupMode: "autoplan",
    runMode: "bounded_loop",
    maxIterations: 2,
    maxWallClockMinutes: 3,
    reconfigure: true,
    benchmarkCommand: makeNodeCommand(longBenchmark),
    checksCommand: makeNodeCommand(checksScript),
    metricName,
    metricUnit: "blocker(s)",
    direction: "lower",
    metricThreshold: 0,
    candidatePolicy: "plan_only",
    peerMode: "off",
    stopOn: ["crash", "checks_failed", "blocked"],
    timeoutSeconds: 30,
    checksTimeoutSeconds: 30,
  });

  if (campaign.loopResult?.completedIterations !== 2) {
    addBlocker("campaign_start_did_not_run_two_iterations", {
      completed: campaign.loopResult?.completedIterations ?? null,
    });
  }
  if (campaign.loopResult?.peerMode !== "off") {
    addBlocker("campaign_start_peer_mode_not_off", campaign.loopResult?.peerMode ?? null);
  }
  const firstMetrics = campaign.loopResult?.runs.map((run) => run.primaryMetric) ?? [];
  if (firstMetrics.length !== 2 || firstMetrics[0] !== 3 || firstMetrics[1] !== 2) {
    addBlocker("campaign_start_unexpected_metric_sequence", firstMetrics);
  }

  const resumePlan = buildAutoresearchResumeApplyPlan(controller);
  if (!resumePlan.planReady) {
    addBlocker("resume_apply_plan_not_ready", resumePlan.blockedReasons);
  }
  if (!resumePlan.futureForegroundCall?.includes("autoresearch_runtime_resume_apply")) {
    addBlocker("resume_apply_plan_missing_foreground_call");
  }
  if (!resumePlan.futureForegroundCall?.includes('operatorConfirmation: "RUN FOREGROUND RESUME"')) {
    addBlocker("resume_apply_plan_missing_confirmation");
  }

  let resumeApply = null;
  if (blockers.length === 0) {
    resumeApply = await executeAutoresearchResumeApply({
      cwd: controller,
      segmentKey: resumePlan.resumePlan.segmentKey,
      runtimeKey: resumePlan.resumePlan.runtimeKey,
      maxIterations: 2,
      maxWallClockMinutes: 3,
      operatorConfirmation: "RUN FOREGROUND RESUME",
      description: "Continue the long supervised campaign as an explicit foreground resume segment.",
      timeoutSeconds: 30,
      checksTimeoutSeconds: 30,
    });
  }

  if (resumeApply?.loopResult.completedIterations !== 2) {
    addBlocker("resume_apply_did_not_run_two_iterations", {
      completed: resumeApply?.loopResult.completedIterations ?? null,
    });
  }
  if (resumeApply?.loopResult.peerMode !== "off") {
    addBlocker("resume_apply_peer_mode_not_off", resumeApply?.loopResult.peerMode ?? null);
  }
  const resumeMetrics = resumeApply?.loopResult.runs.map((run) => run.primaryMetric) ?? [];
  if (resumeMetrics.length !== 2 || resumeMetrics[0] !== 1 || resumeMetrics[1] !== 0) {
    addBlocker("resume_apply_unexpected_metric_sequence", resumeMetrics);
  }

  const postResumeStatus = buildAutoresearchRuntimeStatus(controller);
  if (postResumeStatus.currentSegment.runCount < 4) {
    addBlocker("campaign_did_not_accumulate_four_runs", postResumeStatus.currentSegment.runCount);
  }
  if (postResumeStatus.currentSegment.bestMetric !== 0) {
    addBlocker("campaign_best_metric_not_zero", postResumeStatus.currentSegment.bestMetric);
  }

  const scenarios = ["resume continuation", "candidate comparison"];
  const hypotheses = ["explicit long campaign gates beat chat-local glue"];
  const matrixPlan = planAutoresearchMatrixCampaign({
    taskId,
    cwd: controller,
    objective,
    direction: "lower",
    scenarios,
    hypotheses,
    candidateCountPerCell: 2,
    maxIterationsPerCandidate: 1,
    maxWallClockMinutesPerCandidate: 2,
  });

  const packetPaths = [];
  for (const cell of matrixPlan.cells) {
    const candidateInputs = [
      { laneId: "candidate-01", score: 0 },
      { laneId: "candidate-02", score: 2 },
    ];
    for (const candidateInput of candidateInputs) {
      const candidate = createCandidate({
        cellId: cell.cellId,
        laneId: candidateInput.laneId,
        score: candidateInput.score,
      });
      const bind = buildAutoresearchCandidateBindPlan({
        cwd: controller,
        action: "plan_run",
        candidateWorktree: candidate.worktree,
        candidateSource: "candidate_peer_spawn",
        candidateBaseRef: baseRef,
        description: "Measure " + cell.cellId + " " + candidateInput.laneId,
      });
      if (bind.inspection.readiness !== "ready") {
        addBlocker("candidate_bind_not_ready", {
          cellId: cell.cellId,
          laneId: candidateInput.laneId,
          readiness: bind.inspection.readiness,
          reasons: bind.inspection.readinessReasons,
        });
      }
      if (!bind.inspection.filesChanged.includes("score.txt")) {
        addBlocker("candidate_bind_missing_score_file", { cellId: cell.cellId, laneId: candidateInput.laneId });
      }

      await executeAutoresearchRun({
        cwd: controller,
        runKind: "ordinary",
        description: "Measure " + cell.cellId + " " + candidateInput.laneId + " after controller-verified bind facts.",
        experiment: {
          hypothesisId: candidateInput.laneId,
          hypothesis: cell.objective + " | lane " + candidateInput.laneId,
          interventionSummary: "Candidate score.txt value is " + candidateInput.score + ".",
          expectedPrimaryEffect: metricName + " should be lower for better candidates.",
          targetFiles: ["score.txt"],
          risk: "Synthetic long-campaign candidate wave; lifecycle remains external.",
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: candidate.worktree,
            branch: candidate.branch,
            baseRef,
            diffSummary: bind.inspection.diffSummary,
            filesChanged: bind.inspection.filesChanged,
          },
        },
        benchmarkCommand: makeNodeCommand(candidateBenchmark, path.join(candidate.worktree, "score.txt")),
        checksCommand: makeNodeCommand(checksScript),
        timeoutSeconds: 30,
        checksTimeoutSeconds: 30,
      });

      const outPath = path.join(
        cell.candidatePacketDirectory,
        candidateInput.laneId + ".candidate-result.json",
      );
      const exportResult = writeAutoresearchCandidateResultPacket({
        cwd: controller,
        outPath,
        overwrite: true,
      });
      packetPaths.push(exportResult.path);
      if (exportResult.effect.akCalled || exportResult.effect.kesWritten || exportResult.effect.promotionStateChanged) {
        addBlocker("candidate_export_mutated_external_authority", exportResult.effect);
      }
    }
  }

  const matrixReview = reviewAutoresearchMatrixCampaign({
    taskId,
    cwd: controller,
    objective,
    direction: "lower",
    scenarios,
    hypotheses,
    candidateCountPerCell: 2,
  });
  if (matrixReview.posture !== "ready_for_matrix_owner_review") {
    addBlocker("matrix_review_not_ready", matrixReview.posture);
  }
  if (matrixReview.selectedCellCount !== matrixPlan.cells.length) {
    addBlocker("matrix_review_selected_cell_count_mismatch", {
      selected: matrixReview.selectedCellCount,
      expected: matrixPlan.cells.length,
    });
  }
  if (!matrixReview.cells.every((cell) => cell.selectedLaneId === "candidate-01")) {
    addBlocker("matrix_review_did_not_select_best_lanes", matrixReview.cells.map((cell) => cell.selectedLaneId));
  }
  if (matrixReview.closeout.posture !== "ak_ready_after_owner_review") {
    addBlocker("matrix_closeout_not_ak_ready", matrixReview.closeout.posture);
  }
  if (!matrixReview.closeout.evidenceProjection.exactRecordCall?.includes("evidence_record")) {
    addBlocker("matrix_closeout_missing_evidence_record_call");
  }
  if (!matrixReview.closeout.notDone.some((item) => /No peer was launched/i.test(item))) {
    addBlocker("matrix_closeout_missing_no_peer_boundary");
  }

  const closeout = buildAutoresearchSegmentCloseout(controller);
  const learning = buildAutoresearchKnowledgeExportPacket(controller);
  const akEvidence = buildAutoresearchAkEvidencePacket({ cwd: controller, taskId });
  const decision = buildAutoresearchCandidateDecisionWorkbench({ cwd: controller, action: "plan_keep" });
  if (closeout.runs.length < 8) {
    addBlocker("closeout_missing_long_run_history", closeout.runs.length);
  }
  if (learning.packetKind !== "autoresearch.learning.v1") {
    addBlocker("learning_packet_wrong_kind", learning.packetKind);
  }
  if (akEvidence.packetKind !== "autoresearch.ak_evidence.v1") {
    addBlocker("ak_evidence_packet_wrong_kind", akEvidence.packetKind);
  }
  if (decision.recommendedDecision !== "keep") {
    addBlocker("candidate_decision_not_keep", decision.recommendedDecision);
  }
  if (!decision.confirmation.checklist.join("\\n").match(/durable evidence|external/i)) {
    addBlocker("candidate_decision_missing_external_evidence_checklist");
  }

  printOperatorCheckpointSummary({
    campaign,
    firstMetrics,
    resumePlan,
    resumeApply,
    resumeMetrics,
    postResumeStatus,
    matrixPlan,
    matrixReview,
    packetPaths,
    closeout,
    learning,
    akEvidence,
    decision,
    blockers,
  });
  console.log("METRIC unresolved_long_supervised_campaign_blockers=" + blockers.length);
  console.log(
    JSON.stringify(
      {
        cwd: controller,
        blockers,
        unresolved: blockers.length,
        campaign: {
          initialIterations: campaign.loopResult?.completedIterations ?? 0,
          initialMetrics: firstMetrics,
          resumePlanReady: resumePlan.planReady,
          resumeIterations: resumeApply?.loopResult.completedIterations ?? 0,
          resumeMetrics,
          finalRunCount: postResumeStatus.currentSegment.runCount,
          bestMetric: postResumeStatus.currentSegment.bestMetric,
        },
        candidates: {
          packetCount: packetPaths.length,
          selectedCellCount: matrixReview.selectedCellCount,
          selectedLanes: matrixReview.cells.map((cell) => [cell.cellId, cell.selectedLaneId]),
        },
        closeout: {
          runCount: closeout.runs.length,
          matrixPosture: matrixReview.closeout.posture,
          evidenceProjection: matrixReview.closeout.evidenceProjection.posture,
          evidenceRecordCall: matrixReview.closeout.evidenceProjection.exactRecordCall,
          learningPacket: learning.packetKind,
          akEvidencePacket: akEvidence.packetKind,
          ownerDecision: decision.recommendedDecision,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  addBlocker("exception", error instanceof Error ? error.stack ?? error.message : String(error));
  printFailedOperatorCheckpointSummary({ blockers });
  console.log("METRIC unresolved_long_supervised_campaign_blockers=" + blockers.length);
  console.log(JSON.stringify({ cwd: controller, blockers, unresolved: blockers.length }, null, 2));
}

if (process.env.DOGFOOD_CONTRACT_STRICT !== "0" && blockers.length > 0) {
  process.exitCode = 1;
}
`;

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "--eval", runnerSource],
  {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DOGFOOD_CONTRACT_STRICT: strictDefault,
      TSX_TSCONFIG_PATH: tsxTsconfigPath,
    },
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (shouldCleanup) {
  rmSync(tempRoot, { recursive: true, force: true });
}
process.exitCode = result.status ?? (result.error ? 1 : 0);
