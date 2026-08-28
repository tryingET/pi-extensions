import assert from "node:assert/strict";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import {
  createLevel3Manifest,
  createToolContext,
  registerAutoresearchLiveTool,
  withTempDir,
} from "./helpers.mjs";

test("autoresearch_live_supervision plan_candidate_wave prepares visible parallel candidate lanes", async () => {
  const cwd = "/tmp/candidate-wave";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.candidateCount, "schema exposes candidateCount");
  assert.ok(tool.parameters.properties.candidateObjectives, "schema exposes candidateObjectives");
  assert.ok(
    tool.parameters.properties.candidatePacketDirectory,
    "schema exposes candidatePacketDirectory",
  );
  assert.ok(tool.parameters.properties.parentPeerTarget, "schema exposes parentPeerTarget");

  const result = await tool.execute(
    "tc-plan-candidate-wave",
    {
      action: "plan_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "make autoresearch campaign behavior feel like candidate racing",
      candidateCount: 2,
      candidateObjectives: [
        "Implement a minimal candidate wave planning surface.",
        "Implement a candidate result comparison surface.",
      ],
      parentPeerTarget: "controller-peer-1",
      filesInScope: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      offLimits: ["packages/pi-autoresearch/.autoresearch/**"],
      constraints: ["no hidden peer launch", "owner chooses winners"],
      maxIterations: 1,
      maxWallClockMinutes: 10,
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "plan_candidate_wave");
  assert.equal(result.details.candidateWave.kind, "autoresearch.candidate_wave_plan.v1");
  assert.equal(result.details.candidateWave.candidateCount, 2);
  assert.equal(result.details.candidateWave.parentPeerTargetRequired, false);
  assert.equal(result.details.candidateWave.lanes.length, 2);
  assert.match(result.details.candidateWave.lanes[0].candidatePeerCall, /candidate_peer_spawn/);
  assert.match(result.details.candidateWave.lanes[0].candidatePeerCall, /controller-peer-1/);
  assert.match(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /"workspaceName": "ar-2674-candidate-01-[a-f0-9]{8}"/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /"branchName": "candidatepeer\/ar-2674-candidate-01-[a-f0-9]{8}"/,
  );
  assert.doesNotMatch(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /make autoresearch campaign behavior feel like candidate racing/,
    "safe workspace/branch names must not reuse the long campaign objective",
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /autoresearch_candidate_bind/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /autoresearch_runtime_run/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /candidate_result_export/,
  );
  assert.doesNotMatch(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /candidate-aware benchmark command/,
  );
  assert.match(
    result.details.candidateWave.lanes[0].measurementPlan.join("\n"),
    /\.autoresearch\/candidate-wave\/candidate-01\.candidate-result\.json/,
  );
  assert.equal(
    result.details.candidateWave.lanes[0].candidateResultPacketPath,
    ".autoresearch/candidate-wave/candidate-01.candidate-result.json",
  );
  assert.match(
    result.details.candidateWave.ownerSelection.aggregateReviewCall,
    /review_candidate_wave/,
  );
  assert.deepEqual(result.details.candidateWave.ownerSelection.candidateResultPacketPaths, [
    ".autoresearch/candidate-wave/candidate-01.candidate-result.json",
    ".autoresearch/candidate-wave/candidate-02.candidate-result.json",
  ]);
  assert.equal(
    result.details.candidateWave.management.kind,
    "autoresearch.candidate_wave_management.v1",
  );
  assert.equal(result.details.candidateWave.management.posture, "planned_not_launched");
  assert.equal(result.details.candidateWave.management.expectedLaneCount, 2);
  assert.equal(result.details.candidateWave.management.completedLaneCount, 0);
  assert.equal(result.details.candidateWave.management.finalOnlyScoring, true);
  assert.equal(result.details.candidateWave.management.controllerMeasurementRequired, true);
  assert.equal(
    result.details.candidateWave.management.handoffContract.requiredRunner,
    "candidate_peer_spawn",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.handoff,
    "candidate_peer_spawn_to_candidate_worktree",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.controllerInlineImplementation,
    "process_violation",
  );
  assert.equal(
    result.details.candidateWave.management.handoffContract.piAutoresearchPeerSpawning,
    "forbidden_below_seam",
  );
  assert.deepEqual(
    result.details.candidateWave.management.handoffContract.requiredMeasurementSequence,
    [
      "candidate_peer_spawn",
      "autoresearch_candidate_bind",
      "autoresearch_runtime_run",
      "candidate_result_export",
      "review_candidate_wave",
    ],
  );
  assert.match(
    result.details.candidateWave.lanes[0].candidatePeerCall,
    /Controller-inline implementation is a process violation/,
  );
  assert.deepEqual(
    result.details.candidateWave.management.laneStates.map((lane) => lane.state),
    ["planned", "planned"],
  );
  assert.match(result.content[0].text, /Candidate lanes: 2/);
  assert.match(result.content[0].text, /aggregate review/);
  assert.match(result.content[0].text, /Wave fan-in management/);
  assert.match(result.content[0].text, /final-only scoring: yes/);
  assert.match(result.content[0].text, /controller measurement required: yes/);
  assert.match(result.content[0].text, /required runner: candidate_peer_spawn/);
  assert.match(result.content[0].text, /controller-inline implementation: process_violation/);
  assert.match(result.content[0].text, /This plan does not spawn peers by itself/);
  assert.match(result.content[0].text, /explicit_owner_decision_required|Owner selection/);
});

test("autoresearch_live_supervision plan_candidate_wave rejects packet directories outside autoresearch", async () => {
  const cwd = "/tmp/candidate-wave-bad-packet-dir";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-plan-candidate-wave-bad-packet-dir",
    {
      action: "plan_candidate_wave",
      taskId: 2722,
      cwd,
      objective: "reject packet path escape",
      candidatePacketDirectory: "../outside",
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, false);
  assert.match(result.details.error, /candidatePacketDirectory must stay under \.autoresearch/);
});

test("autoresearch_live_supervision level3_manifest_preflight validates manifest without execution", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3Manifest, "schema exposes level3Manifest");
    assert.ok(tool.parameters.properties.level3ManifestPath, "schema exposes level3ManifestPath");

    const manifest = createLevel3Manifest(cwd);
    const result = await tool.execute(
      "tc-level3-manifest-preflight",
      {
        action: "level3_manifest_preflight",
        taskId: 2996,
        cwd,
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_manifest_preflight");
    const preflight = result.details.level3ManifestPreflight;
    assert.equal(preflight.kind, "autoresearch.level3_campaign_manifest_preflight.v1");
    assert.equal(preflight.manifestKind, "autoresearch.level3_campaign_manifest.v1");
    assert.match(preflight.manifestHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(preflight.readOnly, true);
    assert.equal(preflight.execution, "not_executed_by_orchestrator");
    assert.equal(preflight.metric.name, "level3_manifest_preflight_blockers");
    assert.equal(preflight.metric.value, 0);
    assert.equal(preflight.cellMetrics.manifestSchemaBlockers.value, 0);
    assert.equal(preflight.cellMetrics.manifestPolicyGateBlockers.value, 0);
    assert.equal(preflight.cellMetrics.manifestPreflightUxBlockers.value, 0);
    assert.equal(preflight.schema.campaignId, "level3-slice1-test");
    assert.equal(preflight.policyGates.length, 10);
    assert.ok(preflight.nonActions.some((item) => /No candidate_peer_spawn/.test(item)));
    assert.ok(preflight.nonActions.some((item) => /No cleanup/.test(item)));
    assert.match(result.content[0].text, /level3_manifest_preflight_blockers: 0/);
    assert.match(result.content[0].text, /Policy gates/);
    assert.match(result.content[0].text, /Level-2 fallback/);
  });
});

test("autoresearch_live_supervision level3_manifest_preflight blocks invalid policy and scope drift", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-manifest-preflight-blocked",
      {
        action: "level3_manifest_preflight",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          taskId: 1,
          filesInScope: ["packages/pi-toolbox-discovery/src/index.ts"],
          policy: {
            launchVisibleCandidatePeers: true,
            runMeasurements: true,
            exportCandidateResults: true,
            generateReviewPackets: true,
            prepareFinalizerTokenRequest: true,
            applyFinalizer: true,
            cleanupCandidates: true,
            recordAkEvidence: true,
            completeAkTask: true,
            mergeReleasePromotion: true,
          },
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const preflight = blocked.details.level3ManifestPreflight;
    assert.equal(preflight.metric.status, "blocked");
    assert.ok(preflight.cellMetrics.manifestSchemaBlockers.value >= 2);
    assert.ok(preflight.cellMetrics.manifestPolicyGateBlockers.value >= 8);
    assert.ok(preflight.blockers.some((item) => /manifest.taskId/.test(item)));
    assert.ok(preflight.blockers.some((item) => /overlaps offLimits/.test(item)));
    assert.ok(
      preflight.blockers.some((item) => /launchVisibleCandidatePeers policy.*invalid/.test(item)),
    );
    assert.ok(preflight.nonActions.some((item) => /No autoresearch measurement/.test(item)));
    assert.match(blocked.content[0].text, /Do not launch peers/);
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run orders slices and emits non-authoritative receipts", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level3Manifest, "schema exposes level3Manifest");

    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice2-test",
      primaryMetric: {
        name: "autonomous_slice_sequence_blockers",
        direction: "lower",
        target: 0,
      },
      slices: [
        {
          id: "slice-1",
          metric: "slice_ordering_blockers",
          requiredPolicyGates: ["generateReviewPackets"],
          cells: [
            { id: "cell-01", metric: "slice_ordering_blockers" },
            { id: "cell-02", dependsOn: ["cell-01"], metric: "dry_run_receipt_blockers" },
          ],
        },
        {
          id: "slice-2",
          dependsOn: ["cell-02"],
          metric: "slice_sequence_recovery_blockers",
        },
      ],
    });

    const result = await tool.execute(
      "tc-level3-slice-sequence-dry-run",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: manifest,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "level3_slice_sequence_dry_run");
    const dryRun = result.details.level3SliceSequenceDryRun;
    assert.equal(dryRun.kind, "autoresearch.level3_slice_sequence_dry_run.v1");
    assert.equal(dryRun.execution, "not_executed_by_orchestrator");
    assert.equal(dryRun.metric.name, "autonomous_slice_sequence_blockers");
    assert.equal(dryRun.metric.value, 0);
    assert.equal(dryRun.cellMetrics.sliceOrderingBlockers.value, 0);
    assert.equal(dryRun.cellMetrics.dryRunReceiptBlockers.value, 0);
    assert.equal(dryRun.cellMetrics.sliceSequenceRecoveryBlockers.value, 0);
    assert.deepEqual(
      dryRun.orderedStates.map((state) => `${state.order}:${state.cellId}:${state.state}`),
      ["1:cell-01:ready", "2:cell-02:ready", "3:slice-2:ready"],
    );
    assert.equal(dryRun.receipts.length, 3);
    assert.ok(dryRun.receipts.every((receipt) => receipt.nonAuthoritative === true));
    assert.ok(dryRun.receipts.every((receipt) => receipt.durableEvidence === false));
    assert.ok(
      dryRun.receipts.every(
        (receipt) => receipt.kind === "autoresearch.level3_campaign_transition_receipt.v1",
      ),
    );
    assert.match(dryRun.receipts[0].manifestHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(result.content[0].text, /autonomous_slice_sequence_blockers: 0/);
    assert.match(result.content[0].text, /Dry-run transition receipts/);
    assert.match(result.content[0].text, /non-authoritative=yes/);
    assert.match(result.content[0].text, /Level-2 fallback/);
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run fails closed for blocked preflight and missing dependencies", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const blocked = await tool.execute(
      "tc-level3-slice-sequence-dry-run-blocked",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          taskId: 1,
          slices: [
            { id: "cell-01", metric: "slice_ordering_blockers" },
            { id: "cell-02", dependsOn: ["missing-cell"], metric: "dry_run_receipt_blockers" },
          ],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(blocked.details.ok, false);
    const dryRun = blocked.details.level3SliceSequenceDryRun;
    assert.equal(dryRun.metric.status, "blocked");
    assert.ok(dryRun.preflight.metric.value > 0);
    assert.ok(dryRun.cellMetrics.sliceOrderingBlockers.value >= 1);
    assert.ok(
      dryRun.orderedStates.some((state) => state.missingDependencies.includes("missing-cell")),
    );
    assert.ok(dryRun.blockers.some((blocker) => /manifest preflight is blocked/.test(blocker)));
    assert.ok(dryRun.blockers.some((blocker) => /missing dependency missing-cell/.test(blocker)));
    assert.match(blocked.content[0].text, /Resolve blocked slice\/cell dependencies/);
    assert.match(blocked.content[0].text, /Safe rerun/);
    assert.match(blocked.content[0].text, /Level-2 fallback/);
    assert.ok(dryRun.nonActions.some((item) => /Dry-run only/.test(item)));
  });
});

test("autoresearch_live_supervision level3_slice_sequence_dry_run withholds lower-plane action calls", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);

    const result = await tool.execute(
      "tc-level3-slice-sequence-dry-run-no-actions",
      {
        action: "level3_slice_sequence_dry_run",
        taskId: 2996,
        cwd,
        level3Manifest: createLevel3Manifest(cwd, {
          slices: [{ id: "slice-1", metric: "autonomous_slice_sequence_blockers" }],
        }),
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    const dryRun = result.details.level3SliceSequenceDryRun;
    const exposedActionText = [
      ...dryRun.nextLegalActions.filter((action) => action !== dryRun.level2FallbackRoute),
      dryRun.safeRerunCommand,
      ...dryRun.orderedStates.map((state) => state.nextLegalAction),
    ].join("\n");
    assert.doesNotMatch(exposedActionText, /candidate_peer_spawn/);
    assert.doesNotMatch(exposedActionText, /autoresearch_runtime_run/);
    assert.doesNotMatch(exposedActionText, /candidate_result_export/);
    assert.doesNotMatch(exposedActionText, /review_candidate_wave|review_matrix_campaign/);
    assert.doesNotMatch(exposedActionText, /finalize_post_fanin/);
    assert.doesNotMatch(exposedActionText, /cleanup/);
    assert.doesNotMatch(exposedActionText, /ak_owner_write|evidence_record/);
    assert.doesNotMatch(exposedActionText, /merge|release|promotion/);
    assert.equal(dryRun.receipts[0].durableEvidence, false);
  });
});
