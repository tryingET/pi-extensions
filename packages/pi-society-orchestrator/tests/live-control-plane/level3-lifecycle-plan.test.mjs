import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import {
  createLevel3Manifest,
  createToolContext,
  registerAutoresearchLiveTool,
  withTempDir,
  writeCandidateResultPacket,
} from "./helpers.mjs";

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan exposes authorized visible launch and bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.launchAuthorizationToken, "schema exposes launch token");
    assert.ok(tool.parameters.properties.level3CandidateBindings, "schema exposes bindings");

    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice3-test",
      primaryMetric: {
        name: "candidate_lifecycle_automation_blockers",
        direction: "lower",
        target: 0,
      },
      candidateLanes: [
        {
          id: "lane-a",
          objective: "Implement visible lifecycle candidate A",
          filesInScope: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
          offLimits: ["packages/pi-toolbox-discovery/**"],
        },
        { id: "lane-b", objective: "Implement visible lifecycle candidate B" },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const result = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidatePeerRunId: "peer-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a"),
            candidateBranch: "candidate/lane-a",
            candidateBaseRef: "HEAD",
          },
          {
            laneId: "lane-b",
            candidatePeerRunId: "peer-b",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-b"),
            candidateBranch: "candidate/lane-b",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_visible_candidate_lifecycle_plan");
    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(plan.kind, "autoresearch.level3_visible_candidate_lifecycle_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.name, "candidate_lifecycle_automation_blockers");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.visibleLaunchPolicyBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateCleanupPolicyBlockers.value, 0);
    assert.equal(plan.launchAuthorization.posture, "allowed_by_manifest_policy");
    assert.equal(plan.lanes.length, 2);
    assert.ok(
      plan.lanes.every((lane) => lane.launchPosture === "ready_visible_candidate_peer_spawn_call"),
    );
    assert.ok(plan.lanes.every((lane) => /candidate_peer_spawn/.test(lane.candidatePeerCall)));
    assert.ok(
      plan.lanes.every((lane) => lane.bindingPosture === "bound_visible_candidate_worktree"),
    );
    assert.ok(
      plan.lanes.every((lane) => lane.cleanupPosture === "plan_only_cleanup_token_required"),
    );
    assert.match(result.content[0].text, /candidate_lifecycle_automation_blockers: 0/);
    assert.match(result.content[0].text, /candidate_peer_spawn/);
    assert.match(result.content[0].text, /cleanup plan/);
  });
});

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan blocks missing launch policy and missing bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan-blocked",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: createLevel3Manifest(cwd, {
          candidateLanes: [{ id: "lane-a", objective: "blocked lane" }],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const plan = blocked.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(plan.launchAuthorization.posture, "blocked_missing_policy_or_token");
    assert.equal(plan.cellMetrics.visibleLaunchPolicyBlockers.status, "blocked");
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.status, "blocked");
    assert.equal(plan.lanes[0].candidatePeerCall, null);
    assert.equal(plan.lanes[0].launchPosture, "blocked_missing_launch_policy_or_token");
    assert.equal(plan.lanes[0].bindingPosture, "blocked_missing_binding");
    assert.ok(
      plan.blockers.some((blocker) => /missing accepted launchVisibleCandidatePeers/.test(blocker)),
    );
    assert.ok(plan.blockers.some((blocker) => /missing candidate worktree binding/.test(blocker)));
    assert.match(blocked.content[0].text, /withheld/);
  });
});

test("autoresearch_live_supervision level3_visible_candidate_lifecycle_plan fails closed on duplicate bindings and keeps cleanup plan-only", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      candidateLanes: [{ id: "lane-a", objective: "duplicate binding lane" }],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const result = await tool.execute(
      "tc-level3-visible-candidate-lifecycle-plan-duplicate-binding",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a-1"),
            candidateBranch: "candidate/lane-a-1",
            candidateBaseRef: "HEAD",
          },
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a-2"),
            candidateBranch: "candidate/lane-a-2",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.equal(result.details.ok, false);
    assert.equal(plan.cellMetrics.candidateBindingLifecycleBlockers.status, "blocked");
    assert.equal(plan.lanes[0].bindingPosture, "blocked_duplicate_binding");
    assert.ok(plan.blockers.some((blocker) => /duplicate candidate binding/.test(blocker)));
    assert.ok(plan.nonActions.some((item) => /No candidate_peer_spawn/.test(item)));
    assert.ok(plan.nonActions.some((item) => /No autoresearch_runtime_run/.test(item)));
    assert.ok(plan.boundaries.some((item) => /Cleanup is a plan-only posture/.test(item)));
    assert.ok(
      plan.lanes[0].cleanupPlan.every((item) => !/worktree remove|branch -D|rm -rf/.test(item)),
    );
  });
});

test("autoresearch_live_supervision level3 candidate lifecycle keeps matrix cells first-class", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-matrix-cell-lanes-test",
      primaryMetric: {
        name: "matrix_cell_autonomy_blockers",
        direction: "lower",
        target: 0,
      },
      matrix: { candidateCountPerCell: 2 },
      slices: [
        {
          id: "slice-matrix",
          cells: [
            {
              id: "cell-a",
              objective: "cell A objective",
              metric: { name: "cell_a_latency_blockers", direction: "lower", target: 0 },
            },
            {
              id: "cell-b",
              objective: "cell B objective",
              metric: { name: "cell_b_quality_score", direction: "higher", target: 10 },
            },
          ],
        },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });
    const level3CandidateBindings = [
      {
        laneId: "cell-a-candidate-01",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-a-candidate-01"),
        candidateBranch: "candidate/cell-a-candidate-01",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-a-candidate-02",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-a-candidate-02"),
        candidateBranch: "candidate/cell-a-candidate-02",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-b-candidate-01",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-b-candidate-01"),
        candidateBranch: "candidate/cell-b-candidate-01",
        candidateBaseRef: "HEAD",
      },
      {
        laneId: "cell-b-candidate-02",
        candidateWorktree: path.join(cwd, ".worktrees", "cell-b-candidate-02"),
        candidateBranch: "candidate/cell-b-candidate-02",
        candidateBaseRef: "HEAD",
      },
    ];
    const result = await tool.execute(
      "tc-level3-matrix-cell-lanes",
      {
        action: "level3_visible_candidate_lifecycle_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, true);
    const plan = result.details.level3VisibleCandidateLifecyclePlan;
    assert.deepEqual(
      plan.lanes.map((lane) => `${lane.cellId}:${lane.laneId}:${lane.metricName}`),
      [
        "cell-a:cell-a-candidate-01:cell_a_latency_blockers",
        "cell-a:cell-a-candidate-02:cell_a_latency_blockers",
        "cell-b:cell-b-candidate-01:cell_b_quality_score",
        "cell-b:cell-b-candidate-02:cell_b_quality_score",
      ],
    );
    assert.deepEqual(
      plan.lanes.map((lane) => `${lane.metricDirection}:${lane.metricTarget}`),
      ["lower:0", "lower:0", "higher:10", "higher:10"],
    );
    assert.equal(new Set(plan.lanes.map((lane) => lane.laneId)).size, 4);
    assert.ok(
      plan.lanes.every((lane) => lane.bindingPosture === "bound_visible_candidate_worktree"),
    );
    assert.match(result.content[0].text, /metric: cell_a_latency_blockers/);

    const measure = await tool.execute(
      "tc-level3-matrix-cell-measure-packets",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(measure.details.ok, true);
    const measurePlan = measure.details.level3MeasureExportReviewPlan;
    assert.deepEqual(
      measurePlan.lanes.map(
        (lane) => `${lane.cellId}:${lane.metricName}:${lane.reviewInputPacketPath}`,
      ),
      [
        "cell-a:cell_a_latency_blockers:.autoresearch/level3-measure-export-review/cell-a/cell-a-candidate-01.candidate-result.json",
        "cell-a:cell_a_latency_blockers:.autoresearch/level3-measure-export-review/cell-a/cell-a-candidate-02.candidate-result.json",
        "cell-b:cell_b_quality_score:.autoresearch/level3-measure-export-review/cell-b/cell-b-candidate-01.candidate-result.json",
        "cell-b:cell_b_quality_score:.autoresearch/level3-measure-export-review/cell-b/cell-b-candidate-02.candidate-result.json",
      ],
    );
    assert.match(measurePlan.lanes[2].runtimeRunCall, /cell_b_quality_score/);
    assert.match(measurePlan.lanes[2].runtimeRunCall, /"direction": "higher"/);
    assert.match(measure.content[0].text, /metric: cell_b_quality_score/);
  });
});

test("autoresearch_live_supervision level3_matrix_cell_runner advances cells through launch measure review and finalizer-plan readiness", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-unified-runner-test",
      objective: "Final Level-3 autonomy slice: implement unified matrix/cell campaign runner",
      primaryMetric: {
        name: "level3_matrix_cell_runner_blockers",
        direction: "lower",
        target: 0,
      },
      matrix: { candidateCountPerCell: 2 },
      slices: [
        {
          id: "slice-final-level3",
          cells: [
            {
              id: "cell-runner-loop",
              objective: "Implement deterministic runner state transitions",
              metric: { name: "runner_glue_blockers", direction: "lower", target: 0 },
            },
            {
              id: "cell-review-selection",
              objective: "Implement per-cell review selection state",
              metric: { name: "selection_state_blockers", direction: "lower", target: 0 },
            },
          ],
        },
      ],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });

    const launchReady = await tool.execute(
      "tc-level3-matrix-cell-runner-launch-ready",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(launchReady.details.action, "level3_matrix_cell_runner");
    assert.equal(launchReady.details.ok, false);
    const launchRunner = launchReady.details.level3MatrixCellRunner;
    assert.equal(launchRunner.kind, "autoresearch.level3_matrix_cell_runner.v1");
    assert.equal(launchRunner.cellMetrics.readyToLaunchCells, 2);
    assert.equal(launchRunner.cells.length, 2);
    assert.ok(
      launchRunner.cells.every((cell) => cell.state === "ready_to_launch_visible_candidates"),
    );
    assert.equal(launchRunner.nextLegalActions.length, 4);
    assert.ok(launchRunner.nextLegalActions.every((call) => /candidate_peer_spawn/.test(call)));
    assert.ok(launchRunner.nonActions.some((item) => /did not spawn peers/.test(item)));
    assert.match(launchReady.content[0].text, /level3_matrix_cell_runner_blockers/);

    const bindings = [
      "cell-runner-loop-candidate-01",
      "cell-runner-loop-candidate-02",
      "cell-review-selection-candidate-01",
      "cell-review-selection-candidate-02",
    ].map((laneId) => ({
      laneId,
      candidatePeerRunId: `candidatepeer-${laneId}`,
      candidateWorktree: path.join(cwd, ".worktrees", laneId),
      candidateBranch: `candidate/${laneId}`,
      candidateBaseRef: "HEAD",
    }));

    const measureReady = await tool.execute(
      "tc-level3-matrix-cell-runner-measure-ready",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: bindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const measureRunner = measureReady.details.level3MatrixCellRunner;
    assert.equal(measureRunner.cellMetrics.measureExportReadyCells, 2);
    assert.ok(measureRunner.cells.every((cell) => cell.state === "ready_for_measure_export"));
    assert.ok(measureRunner.nextLegalActions.some((call) => /autoresearch_runtime_run/.test(call)));
    assert.ok(measureRunner.nextLegalActions.some((call) => /candidate_result_export/.test(call)));

    for (const binding of bindings) {
      const cellId = binding.laneId.startsWith("cell-runner-loop")
        ? "cell-runner-loop"
        : "cell-review-selection";
      const packetPath = path.join(
        cwd,
        ".autoresearch",
        "level3-measure-export-review",
        cellId,
        `${binding.laneId}.candidate-result.json`,
      );
      writeCandidateResultPacket(cwd, packetPath, {
        laneId: binding.laneId,
        metric: binding.laneId.endsWith("01") ? 1 : 2,
        candidate: {
          worktreePath: binding.candidateWorktree,
          branch: binding.candidateBranch,
          baseRef: binding.candidateBaseRef,
          peerRunId: binding.candidatePeerRunId,
        },
      });
    }

    const selected = await tool.execute(
      "tc-level3-matrix-cell-runner-selected",
      {
        action: "level3_matrix_cell_runner",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: bindings,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const selectedRunner = selected.details.level3MatrixCellRunner;
    assert.equal(selectedRunner.cellMetrics.packetReadyCells, 2);
    assert.equal(selectedRunner.cellMetrics.selectedCells, 2);
    assert.ok(selectedRunner.cells.every((cell) => cell.state === "selected_for_matrix_review"));
    assert.deepEqual(
      selectedRunner.cells.map((cell) => cell.selectedLaneId),
      ["cell-runner-loop-candidate-01", "cell-review-selection-candidate-01"],
    );
    assert.match(selectedRunner.finalizerPlanCall, /level3_authorized_finalizer_cleanup_plan/);
    assert.match(selectedRunner.finalizerPlanCall, /review_matrix_campaign/);
    assert.ok(
      selectedRunner.boundaries.some((boundary) =>
        /launch -> bind -> measure\/export -> review/.test(boundary),
      ),
    );
  });
});

test("autoresearch_live_supervision level3_measure_export_review_plan emits manifest-approved call packets", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3CandidateResultPacketDirectory);
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "candidate_measure_export_review_blockers",
        direction: "lower",
        target: 0,
      },
      candidateLanes: [{ id: "lane-a", objective: "measure/export/review lane" }],
      policy: {
        launchVisibleCandidatePeers: "manifest_allowed",
        runMeasurements: "manifest_allowed",
        exportCandidateResults: "manifest_allowed",
        generateReviewPackets: true,
        prepareFinalizerTokenRequest: true,
        applyFinalizer: "token_required",
        cleanupCandidates: "token_required_or_manifest_allowed",
        recordAkEvidence: "ak_owner_write_required",
        completeAkTask: "ak_owner_write_required",
        mergeReleasePromotion: "promotion_token_required",
      },
    });
    const result = await tool.execute(
      "tc-level3-measure-export-review-plan",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: manifest,
        level3CandidateBindings: [
          {
            laneId: "lane-a",
            candidateWorktree: path.join(cwd, ".worktrees", "lane-a"),
            candidateBranch: "candidate/lane-a",
            candidateBaseRef: "HEAD",
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, true);
    const plan = result.details.level3MeasureExportReviewPlan;
    assert.equal(plan.kind, "autoresearch.level3_measure_export_review_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.measurementPolicyBlockers.value, 0);
    assert.equal(plan.cellMetrics.candidateExportBindingBlockers.value, 0);
    assert.equal(plan.cellMetrics.reviewPacketAuthorityBlockers.value, 0);
    assert.match(plan.lanes[0].runtimeRunCall, /autoresearch_runtime_run/);
    assert.match(plan.lanes[0].candidateResultExportCall, /candidate_result_export/);
    assert.match(plan.aggregateReviewCall, /review_candidate_wave/);
    assert.ok(plan.nonActions.some((item) => /No measurement/.test(item)));
    assert.ok(plan.boundaries.some((item) => /non-authoritative review inputs/.test(item)));
  });
});

test("autoresearch_live_supervision level3_measure_export_review_plan fails closed without manifest policy or bindings", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-level3-measure-export-review-plan-blocked",
      {
        action: "level3_measure_export_review_plan",
        taskId: 2996,
        cwd,
        parentPeerTarget: "controller-peer-1",
        level3Manifest: createLevel3Manifest(cwd, {
          candidateLanes: [{ id: "lane-a", objective: "blocked measurement lane" }],
          policy: {
            launchVisibleCandidatePeers: "manifest_allowed",
            runMeasurements: "token_required",
            exportCandidateResults: "token_required",
            generateReviewPackets: false,
            prepareFinalizerTokenRequest: true,
            applyFinalizer: "token_required",
            cleanupCandidates: "token_required_or_manifest_allowed",
            recordAkEvidence: "ak_owner_write_required",
            completeAkTask: "ak_owner_write_required",
            mergeReleasePromotion: "promotion_token_required",
          },
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(result.details.ok, false);
    const plan = result.details.level3MeasureExportReviewPlan;
    assert.equal(plan.metric.status, "blocked");
    assert.equal(plan.lanes[0].runtimeRunCall, null);
    assert.equal(plan.lanes[0].candidateResultExportCall, null);
    assert.equal(plan.aggregateReviewCall, null);
    assert.ok(plan.blockers.some((blocker) => /runMeasurements/.test(blocker)));
    assert.ok(plan.blockers.some((blocker) => /missing candidate worktree/.test(blocker)));
    assert.match(result.content[0].text, /withheld/);
  });
});
