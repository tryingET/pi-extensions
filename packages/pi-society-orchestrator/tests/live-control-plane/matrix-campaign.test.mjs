import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import { createToolContext, registerAutoresearchLiveTool } from "./helpers.mjs";

test("autoresearch_live_supervision plan_matrix_campaign makes matrix cells the implementation-wave substrate", async () => {
  const cwd = "/tmp/matrix-campaign";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.scenarios, "schema exposes scenarios");
  assert.ok(tool.parameters.properties.hypotheses, "schema exposes hypotheses");
  assert.ok(
    tool.parameters.properties.candidateCountPerCell,
    "schema exposes candidateCountPerCell",
  );

  const result = await tool.execute(
    "tc-plan-matrix-campaign",
    {
      action: "plan_matrix_campaign",
      taskId: 2722,
      cwd,
      objective: "dogfood matrix campaigns instead of hand-authored implementation waves",
      direction: "lower",
      metricName: "operator_ux_blockers",
      metricThreshold: 0,
      scenarios: ["operator happy path", "missing packet recovery"],
      hypotheses: ["cell-scoped candidate waves"],
      candidateCountPerCell: 2,
      parentPeerTarget: "controller-peer-1",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      constraints: ["no hidden peer launch"],
      maxIterations: 1,
      maxWallClockMinutes: 10,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "plan_matrix_campaign");
  assert.equal(result.details.matrixCampaign.kind, "autoresearch.matrix_campaign_plan.v1");
  assert.equal(result.details.matrixCampaign.taskId, 2722);
  assert.equal(result.details.matrixCampaign.cells.length, 2);
  assert.equal(result.details.matrixCampaign.candidateCountPerCell, 2);
  const planFollowup = result.details.matrixCampaign.operatorFollowup;
  assert.equal(planFollowup.kind, "autoresearch.matrix_campaign_operator_followup.v1");
  assert.equal(
    planFollowup.currentState,
    "planned_matrix_campaign_waiting_for_visible_candidate_lane_launch",
  );
  assert.equal(planFollowup.primaryMetric.name, "operator_ux_blockers");
  assert.equal(planFollowup.primaryMetric.target, 0);
  assert.equal(planFollowup.level2PacketPlanningBlockers.name, "level2_packet_planning_blockers");
  assert.equal(planFollowup.level2PacketPlanningBlockers.value, 0);
  assert.deepEqual(planFollowup.level2PacketPlanningBlockers.missingTokens, []);
  assert.match(planFollowup.level2PacketPlanningBlockers.level1Fallback, /plan_candidate_wave/);
  assert.equal(planFollowup.lanePacketPaths.length, 4);
  assert.deepEqual(
    planFollowup.blockersChecklist.map((item) => item.proof),
    [
      "operator follow-up/current-state summary",
      "next legal actions",
      "cell primary metric operator_ux_blockers",
      "runner checkpoint and lineage verification coverage",
      "exact per-cell controller sequence / next-call bundle coverage",
      "no hidden execution or promotion boundary coverage",
      "docs/tests alignment for manual_controller_glue_blockers",
    ],
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.kind,
    "autoresearch.matrix_managed_candidate_wave_substrate.v1",
  );
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.cellCount, 2);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.candidateCountPerCell, 2);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.expectedCandidateLaneCount, 4);
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.finalOnlyScoring, true);
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.controllerMeasurementRequired,
    true,
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.explicitPacketPathsGateSelection,
    true,
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract.requiredRunner,
    "candidate_peer_spawn",
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract
      .controllerInlineImplementation,
    "process_violation",
  );
  assert.equal(
    result.details.matrixCampaign.managedWaveSubstrate.handoffContract.piAutoresearchPeerSpawning,
    "forbidden_below_seam",
  );
  assert.equal(result.details.matrixCampaign.managedWaveSubstrate.cellFanInCalls.length, 2);
  const level2PacketPlanning = result.details.matrixCampaign.level2PacketPlanning;
  assert.equal(level2PacketPlanning.kind, "autoresearch.level2_packet_planning.v1");
  assert.equal(level2PacketPlanning.packetOnly, true);
  assert.equal(level2PacketPlanning.execution, "not_executed_by_orchestrator");
  assert.equal(level2PacketPlanning.metric.name, "level2_packet_planning_blockers");
  assert.equal(level2PacketPlanning.metric.value, 0);
  assert.equal(level2PacketPlanning.metric.status, "target_met");
  assert.deepEqual(
    Object.values(level2PacketPlanning.tokenVocabulary).map((entry) => entry.tokenName),
    [
      "launch_visible_candidate_lanes",
      "finalize_post_fanin",
      "ak_owner_write",
      "candidate_cleanup",
      "promotion",
    ],
  );
  assert.equal(
    level2PacketPlanning.packets.launchVisibleCandidateLanes.posture,
    "blocked_missing_launch_token",
  );
  assert.equal(
    level2PacketPlanning.packets.launchVisibleCandidateLanes.execution,
    "not_executed_by_orchestrator",
  );
  assert.deepEqual(level2PacketPlanning.packets.launchVisibleCandidateLanes.launchCalls, []);
  assert.equal(level2PacketPlanning.packets.launchVisibleCandidateLanes.withheldLaunchCallCount, 4);
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.posture,
    "dogfood_matrix_replaces_hand_authored_wave_steps",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.ownerUiCommand,
    "/autoresearch review",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.handoffContract.handoff,
    "candidate_peer_spawn_to_candidate_worktree",
  );
  assert.equal(
    result.details.matrixCampaign.implementationWaveSubstrate.handoffContract.controllerRole,
    "plan_launch_bind_measure_review_only",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.surface,
    "pi-autoresearch_html_dashboard",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.slashCommand,
    "/autoresearch export",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.primaryUi.fallbackSlashCommand,
    "/autoresearch overlay",
  );
  assert.match(result.details.matrixCampaign.ownerReview.primaryUi.summary, /HTML dashboard/);
  assert.equal(
    result.details.matrixCampaign.ownerReview.decisionUi.surface,
    "pi-autoresearch_candidate_decision_workbench",
  );
  assert.equal(
    result.details.matrixCampaign.ownerReview.decisionUi.slashCommand,
    "/autoresearch review",
  );
  assert.equal(result.details.matrixCampaign.ownerReview.cellReviewCalls.length, 2);
  assert.match(
    result.details.matrixCampaign.ownerReview.cellReviewCalls[0].reviewCandidateWaveCall,
    /review_candidate_wave/,
  );
  assert.match(
    result.details.matrixCampaign.ownerReview.boundary,
    /existing pi-autoresearch candidate decision workbench/,
  );
  assert.match(
    result.details.matrixCampaign.cells[0].candidatePacketDirectory,
    /^\.autoresearch\/matrix-campaign\/cell-01-01$/,
  );
  assert.deepEqual(result.details.matrixCampaign.cells[0].candidateResultPacketPaths, [
    ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
    ".autoresearch/matrix-campaign/cell-01-01/candidate-02.candidate-result.json",
  ]);
  assert.equal(
    result.details.matrixCampaign.cells[0].managedWavePosture,
    "managed_candidate_wave_required",
  );
  assert.match(
    result.details.matrixCampaign.cells[0].fanInGate,
    /missing planned lane packets gate/,
  );
  assert.match(result.details.matrixCampaign.cells[0].planCandidateWaveCall, /plan_candidate_wave/);
  assert.match(
    result.details.matrixCampaign.cells[0].planCandidateWaveCall,
    /candidatePacketDirectory/,
  );
  assert.match(
    result.details.matrixCampaign.cells[0].reviewCandidateWaveCall,
    /review_candidate_wave/,
  );
  assert.match(result.content[0].text, /plan_matrix_campaign/);
  assert.match(result.content[0].text, /2 scenario\(s\) × 1 hypothesis/);
  assert.match(result.content[0].text, /Implementation-wave substrate/);
  assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
  assert.match(result.content[0].text, /cell primary metric: operator_ux_blockers/);
  assert.match(result.content[0].text, /level2_packet_planning_blockers: 0/);
  assert.match(result.content[0].text, /Missing token list: none/);
  assert.match(result.content[0].text, /Level-1 fallback:.*plan_candidate_wave/);
  assert.match(result.content[0].text, /next legal actions/);
  assert.match(result.content[0].text, /Managed candidate-wave substrate/);
  assert.match(result.content[0].text, /expected candidate lanes: 4/);
  assert.match(result.content[0].text, /explicit packet paths gate selection: yes/);
  assert.match(result.content[0].text, /Level-2 packet-only planning/);
  assert.match(result.content[0].text, /launch token: launch_visible_candidate_lanes/);
  assert.match(result.content[0].text, /finalizer token: finalize_post_fanin/);
  assert.match(result.content[0].text, /evidence token: ak_owner_write/);
  assert.match(result.content[0].text, /cleanup token: candidate_cleanup/);
  assert.match(result.content[0].text, /promotion token: promotion/);
  assert.match(result.content[0].text, /withheld launch calls: 4/);
  assert.match(result.content[0].text, /required runner: candidate_peer_spawn/);
  assert.match(result.content[0].text, /handoff: candidate_peer_spawn_to_candidate_worktree/);
  assert.match(result.content[0].text, /controller-inline implementation: process_violation/);
  assert.match(result.content[0].text, /owner decision UI: \/autoresearch review/);
  assert.match(result.content[0].text, /Owner review route/);
  assert.match(result.content[0].text, /primary UI: pi-autoresearch_html_dashboard/);
  assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
  assert.match(result.content[0].text, /primary UI fallback: \/autoresearch overlay/);
  assert.match(
    result.content[0].text,
    /final decision UI: pi-autoresearch_candidate_decision_workbench/,
  );
  assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
  assert.match(result.content[0].text, /HTML dashboard/);
  assert.match(result.content[0].text, /cell-01-01 review call:/);
  assert.match(result.content[0].text, /cell-01-01/);
  assert.match(result.content[0].text, /managed wave posture: managed_candidate_wave_required/);
  assert.match(result.content[0].text, /fan-in gate:/);
  assert.match(result.content[0].text, /This matrix plan is a non-mutating/);
});

test("autoresearch_live_supervision plan_matrix_campaign fails closed against level-2 packet-only narrowing", async () => {
  const cwd = "/tmp/matrix-campaign-anti-narrowing";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const blocked = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-blocked",
    {
      action: "plan_matrix_campaign",
      taskId: 2910,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["no hidden peer launch"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, true);
  const blockedAntiNarrowing = blocked.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(blockedAntiNarrowing.kind, "autoresearch.level2_packet_planning_anti_narrowing.v1");
  assert.equal(blockedAntiNarrowing.posture, "blocked_anti_narrowing");
  assert.equal(blockedAntiNarrowing.blockerMetric.name, "level2_packet_planning_blockers");
  assert.equal(blockedAntiNarrowing.blockerMetric.status, "blocked");
  assert.equal(blocked.details.matrixCampaign.level2PacketPlanning.metric.status, "blocked");
  assert.equal(
    blocked.details.matrixCampaign.operatorFollowup.level2PacketPlanningBlockers.status,
    "blocked",
  );
  assert.equal(blockedAntiNarrowing.proofOnlyBaselineOnlyTargetClosureBlocked, true);
  assert.equal(blockedAntiNarrowing.targetClosureAllowed, false);
  assert.deepEqual(blockedAntiNarrowing.proofOnlyBaselineOnlyLaneKeys, ["cell-01-01"]);
  assert.match(
    blocked.details.matrixCampaign.nextStep,
    /Resolve level-2 packet-only planning blockers/,
  );

  const downgraded = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-downgraded",
    {
      action: "plan_matrix_campaign",
      taskId: 2911,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["explicit downgrade: packet-only planning report, not target closure"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const downgradedAntiNarrowing =
    downgraded.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(downgradedAntiNarrowing.posture, "explicit_downgrade_recorded");
  assert.equal(downgradedAntiNarrowing.blockerMetric.status, "target_met");
  assert.equal(downgradedAntiNarrowing.explicitDowngradeRecorded, true);
  assert.equal(downgradedAntiNarrowing.targetClosureAllowed, false);

  const incompleteException = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-incomplete-exception",
    {
      action: "plan_matrix_campaign",
      taskId: 2912,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["proof-only closure"],
      hypotheses: ["baseline-only target"],
      candidateCountPerCell: 1,
      constraints: ["incomplete-matrix exception: owner accepted proof/baseline-only slice"],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const exceptionAntiNarrowing =
    incompleteException.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(exceptionAntiNarrowing.posture, "incomplete_matrix_exception_recorded");
  assert.equal(exceptionAntiNarrowing.blockerMetric.value, 0);
  assert.equal(exceptionAntiNarrowing.incompleteMatrixExceptionRecorded, true);
  assert.equal(exceptionAntiNarrowing.targetClosureAllowed, true);

  const duplicated = await tool.execute(
    "tc-plan-matrix-campaign-anti-narrowing-duplicate-lane",
    {
      action: "plan_matrix_campaign",
      taskId: 2913,
      cwd,
      objective: "level-2 packet-only planning closure",
      metricName: "level2_packet_planning_blockers",
      metricThreshold: 0,
      scenarios: ["operator happy path", "operator happy path"],
      hypotheses: ["candidate breadth"],
      candidateCountPerCell: 1,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const duplicateAntiNarrowing =
    duplicated.details.matrixCampaign.managedWaveSubstrate.antiNarrowing;
  assert.equal(duplicateAntiNarrowing.posture, "failed_closed_missing_or_duplicate_lanes");
  assert.equal(duplicateAntiNarrowing.blockerMetric.status, "blocked");
  assert.deepEqual(duplicateAntiNarrowing.duplicateLaneKeys, ["scenario:operator_happy_path"]);
});

test("autoresearch_live_supervision prepare_matrix_campaign_runner exposes only visible peer launch before checkpoint", async () => {
  const cwd = "/tmp/matrix-campaign-runner";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.runnerManifestPath, "schema exposes runnerManifestPath");
  assert.ok(
    tool.parameters.properties.checkpointConfirmation,
    "schema exposes checkpointConfirmation",
  );

  const result = await tool.execute(
    "tc-prepare-matrix-campaign-runner",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      direction: "lower",
      metricName: "operator_ux_blockers",
      metricThreshold: 0,
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      candidateCountPerCell: 2,
      parentPeerTarget: "controller-peer-1",
      runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      constraints: ["do not auto benchmark"],
      maxIterations: 1,
      maxWallClockMinutes: 5,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "prepare_matrix_campaign_runner");
  const contract = result.details.matrixCampaignRunner;
  assert.equal(contract.kind, "autoresearch.matrix_campaign_runner_contract.v1");
  assert.equal(
    contract.operatorFollowup.currentState,
    "prepared_runner_waiting_for_visible_candidate_peers",
  );
  assert.equal(contract.operatorFollowup.primaryMetric.name, "operator_ux_blockers");
  assert.equal(contract.operatorFollowup.checkpointState.posture, "controller_checkpoint_required");
  assert.equal(
    contract.operatorFollowup.measurementReviewState.posture,
    "locked_until_controller_checkpoint",
  );
  assert.equal(contract.operatorFollowup.lanePacketPaths.length, 2);
  assert.equal(contract.operatorFollowup.lanePacketPaths[0].state, "locked_until_checkpoint");
  assert.equal(contract.operatorFollowup.nextLegalActions.length, 3);
  assert.equal(contract.manifest.identityAnchor, `2801|${path.resolve(cwd)}`);
  assert.equal(contract.manifest.path, ".autoresearch/matrix-campaign/checkpoint-runner.json");
  assert.equal(contract.manifest.exactTaskId, 2801);
  assert.equal(contract.manifest.exactCwd, cwd);
  assert.equal(contract.manifest.candidateLaneCount, 2);
  assert.equal(contract.launchPhase.posture, "ready_to_launch_visible_candidate_peers");
  assert.equal(contract.launchPhase.allowedTool, "candidate_peer_spawn");
  assert.equal(contract.launchPhase.launchCalls.length, 2);
  assert.equal(
    contract.launchPhase.visibleCandidateLaneBinding.name,
    "visible_candidate_lane_binding_blockers",
  );
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.value, 0);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.status, "target_met");
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.expectedLaneCount, 2);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.visibleLaunchCallCount, 2);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount, 0);
  assert.equal(contract.launchPhase.visibleCandidateLaneBinding.missingParentPeerTarget, false);
  assert.match(contract.launchPhase.launchCalls[0], /candidate_peer_spawn/);
  assert.doesNotMatch(contract.launchPhase.launchCalls[0], /autoresearch_runtime_run/);
  assert.equal(
    contract.checkpointGate.posture,
    "controller_checkpoint_required_before_benchmark_export_review",
  );
  assert.match(contract.checkpointGate.requiredToken, /task:2801/);
  assert.match(
    contract.checkpointGate.requiredToken,
    /manifest:\.autoresearch\/matrix-campaign\/checkpoint-runner\.json/,
  );
  assert.equal(contract.checkpointGate.confirmationParameter, "checkpointConfirmation");
  assert.deepEqual(contract.checkpointGate.blockedUntilConfirmed, [
    "autoresearch_candidate_bind",
    "autoresearch_runtime_run",
    "candidate_result_export",
    "review_candidate_wave",
    "review_matrix_campaign",
  ]);
  assert.equal(contract.lockedBenchmarkExportReview.posture, "withheld_until_checkpoint");
  assert.deepEqual(contract.lockedBenchmarkExportReview.calls, []);
  assert.match(contract.checkpointGate.exactCheckpointCall, /checkpoint_matrix_campaign_runner/);
  assert.match(result.content[0].text, /prepare_matrix_campaign_runner/);
  assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
  assert.match(result.content[0].text, /checkpoint state: controller_checkpoint_required/);
  assert.match(result.content[0].text, /benchmark\/export\/review calls exposed: no/);
  assert.match(result.content[0].text, /Runner manifest/);
  assert.match(result.content[0].text, /allowed tool: candidate_peer_spawn/);
  assert.match(result.content[0].text, /visible_candidate_lane_binding_blockers: 0/);
  assert.match(result.content[0].text, /visible launch calls: 2\/2/);
  assert.match(result.content[0].text, /hidden launch calls: 0/);
  assert.match(
    result.content[0].text,
    /benchmark\/export\/review calls: withheld_until_checkpoint; count=0/,
  );
  assert.match(result.content[0].text, /exact task id: 2801/);

  const missingParent = await tool.execute(
    "tc-prepare-matrix-campaign-runner-missing-parent",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      direction: "lower",
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      candidateCountPerCell: 1,
      runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding.status,
    "blocked",
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding.value,
    1,
  );
  assert.equal(
    missingParent.details.matrixCampaignRunner.launchPhase.visibleCandidateLaneBinding
      .missingParentPeerTarget,
    true,
  );

  const invalidPath = await tool.execute(
    "tc-prepare-matrix-campaign-runner-invalid-path",
    {
      action: "prepare_matrix_campaign_runner",
      taskId: 2801,
      cwd,
      objective: "checkpoint matrix campaign runner",
      scenarios: ["safety"],
      hypotheses: ["checkpointed launch"],
      runnerManifestPath: "../outside.json",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );
  assert.equal(invalidPath.details.ok, false);
  assert.match(invalidPath.content[0].text, /runnerManifestPath must be a repo-relative file/);
});

test("autoresearch_live_supervision checkpoint_matrix_campaign_runner gates benchmark export review calls", async () => {
  const cwd = "/tmp/matrix-campaign-runner-checkpoint";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  const baseRequest = {
    action: "checkpoint_matrix_campaign_runner",
    taskId: 2802,
    cwd,
    objective: "checkpoint matrix campaign runner",
    direction: "lower",
    metricName: "manual_controller_glue_blockers",
    metricThreshold: 0,
    scenarios: ["safety"],
    hypotheses: ["checkpointed launch"],
    candidateCountPerCell: 1,
    parentPeerTarget: "controller-peer-1",
    runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
  };

  const blocked = await tool.execute(
    "tc-checkpoint-matrix-campaign-runner-blocked",
    baseRequest,
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, true);
  assert.equal(blocked.details.action, "checkpoint_matrix_campaign_runner");
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.checkpointAccepted, false);
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.posture,
    "blocked_until_exact_controller_checkpoint",
  );
  assert.deepEqual(blocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls, []);
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.reviewMatrixCampaignCall, null);
  assert.equal(blocked.details.matrixCampaignRunnerCheckpoint.controllerCommandPacket, null);
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.checkpointState.posture,
    "blocked",
  );
  assert.equal(
    blocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.measurementReviewState
      .benchmarkExportReviewCallsExposed,
    false,
  );
  assert.match(blocked.content[0].text, /checkpoint state: blocked/);
  assert.match(blocked.content[0].text, /Unlocked benchmark\/export\/review calls: none/);

  const requiredToken = blocked.details.matrixCampaignRunnerCheckpoint.requiredToken;
  const unlocked = await tool.execute(
    "tc-checkpoint-matrix-campaign-runner-unlocked",
    { ...baseRequest, checkpointConfirmation: requiredToken },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(unlocked.details.ok, true);
  assert.equal(unlocked.details.matrixCampaignRunnerCheckpoint.checkpointAccepted, true);
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.posture,
    "benchmark_export_review_unlocked",
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("autoresearch_runtime_run"),
    ),
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("candidate_result_export"),
    ),
  );
  assert.ok(
    unlocked.details.matrixCampaignRunnerCheckpoint.benchmarkExportReviewCalls.some((call) =>
      call.includes("review_candidate_wave"),
    ),
  );
  assert.match(
    unlocked.details.matrixCampaignRunnerCheckpoint.reviewMatrixCampaignCall,
    /review_matrix_campaign/,
  );
  const packet = unlocked.details.matrixCampaignRunnerCheckpoint.controllerCommandPacket;
  assert.equal(packet.kind, "autoresearch.matrix_cell_controller_command_packet.v1");
  assert.equal(packet.manualControllerGlueBlockers.name, "manual_controller_glue_blockers");
  assert.equal(packet.manualControllerGlueBlockers.target, 0);
  assert.equal(packet.cellMetric.name, "manual_controller_glue_blockers");
  assert.deepEqual(packet.cells[0].exactControllerSequence, [
    "autoresearch_candidate_bind",
    "autoresearch_runtime_run",
    "candidate_result_export",
    "review_candidate_wave",
    "review_matrix_campaign",
  ]);
  assert.match(
    packet.cells[0].lanes[0].metricRunCall,
    /"metricName": "manual_controller_glue_blockers"/,
  );
  assert.match(packet.cells[0].lanes[0].metricRunCall, /"metricThreshold": 0/);
  assert.match(packet.flattenedNextCallBundle.join("\n"), /review_candidate_wave/);
  assert.match(packet.flattenedNextCallBundle.join("\n"), /review_matrix_campaign/);
  assert.ok(packet.checkpointAndLineageVerification.controllerVerifiedLineageRequired);
  assert.ok(packet.checkpointAndLineageVerification.peerFinalIsCommunicationOnly);
  assert.ok(packet.boundaries.some((boundary) => /does not execute/.test(boundary)));
  assert.ok(packet.boundaries.some((boundary) => /promotion/.test(boundary)));
  const cockpit = unlocked.details.matrixCampaignRunnerCheckpoint.cockpit;
  assert.equal(cockpit.kind, "autoresearch.matrix_campaign_cockpit.v1");
  assert.equal(cockpit.source, "checkpoint_matrix_campaign_runner");
  assert.equal(cockpit.matrixCockpitBlockers.name, "matrix_cockpit_blockers");
  assert.equal(cockpit.matrixCockpitBlockers.value, 0);
  assert.equal(cockpit.progress.expectedCells, 1);
  assert.equal(cockpit.cellRows[0].posture, "measurement_export_unlocked");
  assert.match(cockpit.cellRows[0].nextLegalAction, /autoresearch_candidate_bind/);
  assert.equal(cockpit.ownerDecisionRoute.dashboardFirst, "/autoresearch export");
  assert.equal(cockpit.operatorUxDashboard.kind, "autoresearch.level2_operator_ux_dashboard.v1");
  assert.equal(cockpit.operatorUxDashboard.primaryMetric.name, "level2_operator_ux_blockers");
  assert.equal(cockpit.operatorUxDashboard.primaryMetric.value, 0);
  assert.deepEqual(
    cockpit.operatorUxDashboard.cellMetrics.map((metric) => metric.name),
    [
      "dashboard_readiness_summary_blockers",
      "authority_boundary_clarity_blockers",
      "fallback_recovery_ux_blockers",
    ],
  );
  assert.equal(cockpit.operatorUxDashboard.tokenAndAuthorityLegend.peerText, "communication_only");
  assert.equal(
    cockpit.operatorUxDashboard.tokenAndAuthorityLegend.reviewPackets,
    "owner_review_inputs_not_promotion",
  );
  assert.ok(
    cockpit.operatorUxDashboard.fallbackAndRecovery.some((item) => /Level-1 fallback/.test(item)),
  );
  assert.ok(
    cockpit.noHiddenExecutionBoundaries.some((boundary) => /does not execute/.test(boundary)),
  );
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.checkpointState.posture,
    "accepted",
  );
  assert.equal(
    unlocked.details.matrixCampaignRunnerCheckpoint.operatorFollowup.measurementReviewState
      .benchmarkExportReviewCallsExposed,
    true,
  );
  assert.match(unlocked.content[0].text, /Checkpoint accepted: yes/);
  assert.match(unlocked.content[0].text, /checkpoint state: accepted/);
  assert.match(unlocked.content[0].text, /Unlocked benchmark\/export\/review calls/);
  assert.match(unlocked.content[0].text, /Controller-command packet \/ next-call bundle/);
  assert.match(unlocked.content[0].text, /Matrix campaign cockpit\/dashboard/);
  assert.match(unlocked.content[0].text, /matrix_cockpit_blockers: 0/);
  assert.match(unlocked.content[0].text, /compact cell table/);
  assert.match(unlocked.content[0].text, /dashboard-first owner route/);
  assert.match(unlocked.content[0].text, /manual_controller_glue_blockers/);
  assert.match(
    unlocked.content[0].text,
    /autoresearch_candidate_bind -> autoresearch_runtime_run -> candidate_result_export -> review_candidate_wave -> review_matrix_campaign/,
  );
  assert.match(unlocked.content[0].text, /not cryptographic proof/);
});

test("autoresearch_live_supervision level3_matrix_cell_executor advances one safe Level-3 runner action", async () => {
  const cwd = "/tmp/matrix-cell-level3-executor";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.completedActionCount, "schema exposes completedActionCount");

  const baseRequest = {
    action: "level3_matrix_cell_executor",
    taskId: 2803,
    cwd,
    objective: "reduce manual controller glue for a checkpointed matrix cell",
    direction: "lower",
    metricName: "manual_controller_glue_blockers",
    metricThreshold: 0,
    scenarios: ["safety"],
    hypotheses: ["one-step deterministic runner"],
    candidateCountPerCell: 1,
    parentPeerTarget: "controller-peer-1",
    runnerManifestPath: ".autoresearch/matrix-campaign/checkpoint-runner.json",
  };

  const blocked = await tool.execute(
    "tc-level3-matrix-cell-executor-blocked",
    baseRequest,
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(blocked.details.ok, false);
  assert.equal(blocked.details.action, "level3_matrix_cell_executor");
  assert.equal(
    blocked.details.level3MatrixCellExecutor.kind,
    "autoresearch.level3_matrix_cell_executor.v1",
  );
  assert.equal(
    blocked.details.level3MatrixCellExecutor.sourceLevel3RunnerAlias,
    "level3_matrix_cell_runner",
  );
  assert.equal(blocked.details.level3MatrixCellExecutor.posture, "blocked_by_level3_runner");
  assert.equal(blocked.details.level3MatrixCellExecutor.selectedAction, null);
  assert.equal(blocked.details.level3MatrixCellExecutor.emittedNextLegalActions.length, 0);
  assert.equal(blocked.details.level3MatrixCellExecutor.stateMachineBlockers.value, 1);
  assert.match(blocked.content[0].text, /level3_matrix_cell_runner/);
  assert.match(blocked.content[0].text, /Hidden execution prevented: yes/);

  const requiredToken =
    blocked.details.level3MatrixCellExecutor.level3Runner.checkpointGate?.requiredToken ??
    blocked.details.level3MatrixCellExecutor.level3Runner.requiredToken;
  const first = await tool.execute(
    "tc-level3-matrix-cell-executor-first",
    { ...baseRequest, checkpointConfirmation: requiredToken, completedActionCount: 0 },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(first.details.ok, true);
  const firstExecutor = first.details.level3MatrixCellExecutor;
  assert.equal(firstExecutor.posture, "ready_to_present_next_action");
  assert.equal(firstExecutor.completedActionCount, 0);
  assert.equal(firstExecutor.selectedAction.index, 0);
  assert.match(firstExecutor.selectedAction.call, /^autoresearch_candidate_bind\(/);
  assert.equal(firstExecutor.selectedAction.execution, "not_executed_by_orchestrator");
  assert.equal(firstExecutor.selectedAction.controllerMustRunExplicitly, true);
  assert.equal(firstExecutor.selectedAction.allowedByStateMachine, true);
  assert.deepEqual(firstExecutor.emittedNextLegalActions, [firstExecutor.selectedAction.call]);
  assert.equal(firstExecutor.stateMachineBlockers.value, 0);
  assert.equal(firstExecutor.stateMachineBlockers.hiddenExecutionPrevented, true);
  assert.doesNotMatch(
    firstExecutor.selectedAction.call,
    /candidate_peer_spawn\(|finalize_post_fanin|evidence_record\(/,
  );
  assert.match(first.content[0].text, /Selected one-step action/);

  const second = await tool.execute(
    "tc-level3-matrix-cell-executor-second",
    { ...baseRequest, checkpointConfirmation: requiredToken, completedActionCount: 1 },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  const secondExecutor = second.details.level3MatrixCellExecutor;
  assert.equal(second.details.ok, true);
  assert.equal(secondExecutor.posture, "ready_to_present_next_action");
  assert.equal(secondExecutor.selectedAction.index, 1);
  assert.match(secondExecutor.selectedAction.call, /^autoresearch_runtime_run\(/);
  assert.equal(secondExecutor.emittedNextLegalActions.length, 1);
});
