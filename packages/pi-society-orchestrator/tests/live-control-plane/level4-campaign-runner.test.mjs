import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import {
  createToolContext,
  registerAutoresearchLiveTool,
  withTempDir,
  writeCandidatePeerRegistrySidecar,
  writeCandidateResultPacket,
} from "./helpers.mjs";

test("autoresearch_live_supervision level4_autoresearch_campaign_runner persists resumable receipts and preserves gates", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.level4ReceiptPath, "schema exposes level4ReceiptPath");
    assert.ok(tool.parameters.properties.maxAutomatedActions, "schema exposes maxAutomatedActions");
    assert.ok(
      tool.parameters.properties.allowMeasureExportReview,
      "schema exposes Level-4 safe automation switch",
    );
    assert.ok(
      tool.parameters.properties.maxParallelCandidatePeers,
      "schema exposes Level-4 whole-matrix concurrency limit",
    );
    writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({ scripts: { check: 'node -e "process.exit(0)"' } }),
    );

    const baseRequest = {
      action: "level4_autoresearch_campaign_runner",
      taskId: 2804,
      cwd,
      objective: "automate safe Level-4 controller glue above Level-3",
      direction: "lower",
      metricName: "level4_autoresearch_automation_blockers",
      metricThreshold: 0,
      scenarios: ["safety"],
      hypotheses: ["resumable safe automation"],
      candidateCountPerCell: 1,
      parentPeerTarget: "controller-peer-1",
      runnerManifestPath: ".autoresearch/matrix-campaign/level4-runner.json",
      level4ReceiptPath: ".autoresearch/level4-test-receipts.jsonl",
      maxParallelCandidatePeers: 2,
    };

    const blocked = await tool.execute(
      "tc-level4-blocked",
      baseRequest,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.action, "level4_autoresearch_campaign_runner");
    assert.equal(
      blocked.details.level4CampaignRunner.kind,
      "autoresearch.level4_autoresearch_campaign_runner.v1",
    );
    assert.equal(blocked.details.level4CampaignRunner.posture, "blocked_by_level3");
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.kind,
      "autoresearch.level4_prompt_runner_bundle.v1",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.state,
      "ready_to_launch_visible_candidate_peers",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.metric.name,
      "whole_matrix_execution_glue_blockers",
    );
    assert.equal(blocked.details.level4CampaignRunner.promptRunnerBundle.metric.value, 0);
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /^candidate_peer_spawn\(/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /"workspaceName": "ar-2804-candidate-01-[a-f0-9]{8}"/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /"branchName": "candidatepeer\/ar-2804-candidate-01-[a-f0-9]{8}"/,
    );
    assert.doesNotMatch(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleCandidatePeerSpawnCalls[0],
      /workspaceName": "automate safe Level-4 controller glue/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.peerWatchCalls[0],
      /^intercom\(/,
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.kind,
      "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.execution,
      "plan_only_controller_must_execute_visible_tools",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.metric.name,
      "level4_visible_launch_watch_blockers",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.metric.value,
      0,
    );
    const wholeMatrixExecutor =
      blocked.details.level4CampaignRunner.promptRunnerBundle.wholeMatrixParallelExecutor;
    assert.equal(wholeMatrixExecutor.kind, "autoresearch.level4_whole_matrix_parallel_executor.v1");
    assert.equal(
      wholeMatrixExecutor.execution,
      "bounded_parallel_visible_tools_with_controller_verification",
    );
    assert.equal(wholeMatrixExecutor.concurrencyLimit, 2);
    assert.equal(wholeMatrixExecutor.totalLaneCount, 1);
    assert.equal(wholeMatrixExecutor.batchCount, 1);
    assert.equal(
      wholeMatrixExecutor.batches[0].lanes[0].launchCall.startsWith("candidate_peer_spawn("),
      true,
    );
    assert.equal(
      wholeMatrixExecutor.batches[0].lanes[0].ackWatchCall.startsWith("intercom("),
      true,
    );
    assert.equal(
      wholeMatrixExecutor.batches[0].lanes[0].finalWatchCall.startsWith("intercom("),
      true,
    );
    assert.equal(wholeMatrixExecutor.ackFinalWatchContract.peerTextIsCommunicationOnly, true);
    assert.equal(wholeMatrixExecutor.lineageVerificationGate.blocksMeasurementUntilSatisfied, true);
    assert.equal(wholeMatrixExecutor.materializationPreflight.perLaneRequired, true);
    assert.match(
      wholeMatrixExecutor.materializationPreflight.defaultCommands.join("\n"),
      /npm --prefix/,
    );
    assert.equal(wholeMatrixExecutor.materializationPreflight.blockerMetric.value, 0);
    assert.equal(wholeMatrixExecutor.metric.name, "true_parallel_whole_matrix_executor_blockers");
    assert.equal(wholeMatrixExecutor.metric.value, 0);
    assert.deepEqual(wholeMatrixExecutor.safeAutomation.stoppedOwnerGates, [
      "finalize_post_fanin",
      "candidate_cleanup",
      "ak_owner_write",
      "promotion",
      "merge",
    ]);
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .launchSurface,
      "candidate_peer_spawn",
    );
    assert.equal(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .state,
      "ready_for_visible_launch",
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0]
        .ackWatchCall,
      /^intercom\(/,
    );
    assert.deepEqual(
      blocked.details.level4CampaignRunner.promptRunnerBundle.visibleLaunchWatchPlan
        .exactGatesPreserved,
      ["finalize_post_fanin", "candidate_cleanup", "ak_owner_write", "promotion"],
    );
    const closeoutPacket =
      blocked.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket;
    assert.equal(closeoutPacket.kind, "autoresearch.level4_visible_candidate_closeout_packet.v1");
    assert.equal(closeoutPacket.execution, "plan_only_controller_verified_closeout");
    assert.equal(closeoutPacket.durableEvidence, false);
    assert.equal(closeoutPacket.metric.name, "level4_candidate_closeout_packet_blockers");
    assert.equal(closeoutPacket.metric.value, 0);
    assert.equal(closeoutPacket.laneCount, 1);
    assert.equal(closeoutPacket.packetInventory.totalLaneCount, 1);
    assert.equal(closeoutPacket.packetInventory.pendingVisibleLaunchCount, 1);
    assert.equal(closeoutPacket.packetInventory.pendingControllerLineageVerificationCount, 0);
    assert.equal(closeoutPacket.packetInventory.pendingMeasurementOrExportCount, 0);
    assert.equal(closeoutPacket.packetInventory.pendingCandidateResultPacketCount, 0);
    assert.equal(closeoutPacket.packetInventory.controllerVerifiedMeasuredPacketCount, 0);
    assert.equal(closeoutPacket.packetInventory.rows[0].status, "pending_visible_launch");
    assert.match(
      closeoutPacket.packetInventory.summary,
      /0\/1 controller-verified measured packet/,
    );
    assert.equal(
      closeoutPacket.postIntegrationCleanupReady.kind,
      "autoresearch.level4_post_integration_cleanup_ready.v1",
    );
    assert.equal(
      closeoutPacket.postFaninPromotionHandoff.kind,
      "autoresearch.level4_post_fanin_promotion_handoff.v1",
    );
    assert.equal(
      closeoutPacket.postFaninPromotionHandoff.posture,
      "blocked_until_candidate_fan_in_complete",
    );
    assert.equal(closeoutPacket.postFaninPromotionHandoff.finalizerTokenRequestCall, null);
    assert.equal(
      closeoutPacket.postIntegrationCleanupReady.readiness,
      "blocked_until_successful_integration_closeout",
    );
    assert.match(
      closeoutPacket.postIntegrationCleanupReady.blockers.join("\n"),
      /integrationCloseout\.status must be successful/,
    );
    assert.equal(closeoutPacket.postIntegrationCleanupReady.candidatePeerCleanupDryRunCall, null);
    assert.equal(closeoutPacket.postIntegrationCleanupReady.candidatePeerCleanupExecuteCall, null);
    assert.deepEqual(closeoutPacket.postIntegrationCleanupReady.exactPeerRunIds, []);
    assert.deepEqual(closeoutPacket.postIntegrationCleanupReady.exactWorktrees, []);
    assert.match(
      closeoutPacket.postIntegrationCleanupReady.exactBranches[0],
      /^candidatepeer\/ar-2804-candidate-01-[a-f0-9]{8}$/,
    );
    assert.deepEqual(closeoutPacket.postIntegrationCleanupReady.exactControllerCommands, []);
    assert.match(
      closeoutPacket.postIntegrationCleanupReady.nextStep,
      /Capture exact candidate_peer_spawn peerRunIds/,
    );
    assert.match(closeoutPacket.lanes[0].launch.call, /^candidate_peer_spawn\(/);
    assert.match(
      closeoutPacket.lanes[0].launch.workspaceName,
      /^ar-2804-candidate-01-[a-f0-9]{8}$/,
    );
    assert.match(
      closeoutPacket.lanes[0].launch.branchName,
      /^candidatepeer\/ar-2804-candidate-01-[a-f0-9]{8}$/,
    );
    assert.equal(closeoutPacket.lanes[0].lineage.peerFinalIsCommunicationOnly, true);
    assert.deepEqual(closeoutPacket.lanes[0].lineage.requiredFacts, [
      "worktree",
      "branch",
      "baseRef",
      "diffSummary",
      "filesChanged",
    ]);
    assert.match(closeoutPacket.lanes[0].lineage.verificationCommands.join("\n"), /git -C/);
    assert.equal(closeoutPacket.lanes[0].scopeReview.status, "pending_controller_verification");
    assert.equal(closeoutPacket.lanes[0].validation.peerClaimStatus, "communication_only");
    assert.equal(closeoutPacket.lanes[0].recommendation.disposition, "pending_controller_review");
    assert.equal(closeoutPacket.comparison.reviewRequiresControllerVerifiedPackets, true);
    assert.match(closeoutPacket.notAuthority.join("\n"), /not AK\/KES\/evidence authority/);
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.promptBundle[0].promptMarkdown,
      /Required execution pattern/,
    );
    assert.match(
      blocked.details.level4CampaignRunner.promptRunnerBundle.promptBundle[0].promptMarkdown,
      /Controller post-final calls after lineage verification/,
    );
    assert.match(blocked.content[0].text, /whole_matrix_execution_glue_blockers: 0/);
    assert.match(blocked.content[0].text, /level4_visible_launch_watch_blockers: 0/);
    assert.match(blocked.content[0].text, /Visible launch\/watch orchestration/);
    assert.match(blocked.content[0].text, /candidate_peer_spawn/);
    assert.deepEqual(blocked.details.level4CampaignRunner.exactGatesPreserved, [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ]);

    const requiredToken =
      blocked.details.level4CampaignRunner.sourceLevel3Executor.level3Runner.checkpointGate
        ?.requiredToken ??
      blocked.details.level4CampaignRunner.sourceLevel3Executor.level3Runner.requiredToken;
    const awaiting = await tool.execute(
      "tc-level4-awaiting-external",
      { ...baseRequest, checkpointConfirmation: requiredToken, maxAutomatedActions: 2 },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(awaiting.details.ok, true);
    const level4 = awaiting.details.level4CampaignRunner;
    assert.equal(level4.posture, "awaiting_external_controller");
    assert.equal(level4.metric.value, 0);
    assert.equal(level4.promptRunnerBundle.state, "checkpoint_accepted_controller_sequence_ready");
    assert.equal(
      level4.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans[0].state,
      "checkpoint_accepted_lineage_verified",
    );
    assert.equal(
      level4.promptRunnerBundle.candidateCloseoutPacket.packetInventory
        .pendingMeasurementOrExportCount,
      1,
    );
    assert.equal(
      level4.promptRunnerBundle.candidateCloseoutPacket.packetInventory.rows[0].status,
      "pending_measurement_or_export",
    );
    assert.match(
      level4.promptRunnerBundle.postFinalControllerSequence[0],
      /^autoresearch_candidate_bind\(/,
    );
    assert.equal(level4.newReceipts.length, 1);
    assert.equal(level4.newReceipts[0].disposition, "awaiting_external_controller");
    assert.match(level4.newReceipts[0].call, /^autoresearch_candidate_bind\(/);
    assert.equal(level4.loadedReceiptCount, 0);
    assert.match(awaiting.content[0].text, /level4_autoresearch_automation_blockers: 0/);
    assert.match(awaiting.content[0].text, /Exact gates preserved/);

    const measuredPacketRelativePath = closeoutPacket.packetInventory.rows[0].packetPath;
    writeCandidateResultPacket(cwd, path.join(cwd, measuredPacketRelativePath), {
      laneId: "cell-01-01-candidate-01",
    });
    const measuredPackets = await tool.execute(
      "tc-level4-measured-packet-inventory",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-measured-packet-inventory.jsonl",
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const measuredCloseout =
      measuredPackets.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket;
    const measuredInventory = measuredCloseout.packetInventory;
    assert.equal(measuredInventory.controllerVerifiedMeasuredPacketCount, 1);
    assert.equal(measuredInventory.pendingMeasurementOrExportCount, 0);
    assert.equal(measuredInventory.pendingPacketPaths.length, 0);
    assert.deepEqual(measuredInventory.controllerVerifiedMeasuredPacketPaths, [
      measuredPacketRelativePath,
    ]);
    assert.equal(measuredInventory.rows[0].status, "controller_verified_measured_packet");
    assert.equal(measuredCloseout.postFaninPromotionHandoff.posture, "ready_for_owner_review");
    assert.equal(
      measuredCloseout.postFaninPromotionHandoff.ownerReviewCall?.startsWith(
        "autoresearch_live_supervision(",
      ),
      true,
    );
    assert.equal(measuredCloseout.postFaninPromotionHandoff.finalizerTokenRequestCall, null);
    assert.match(measuredPackets.content[0].text, /Post-fan-in promotion handoff:/);
    assert.match(measuredPackets.content[0].text, /ready_for_owner_review/);

    const receiptText = readFileSync(
      path.join(cwd, ".autoresearch", "level4-test-receipts.jsonl"),
      "utf8",
    );
    assert.match(receiptText, /autoresearch\.level4_campaign_runner_receipt\.v1/);
    assert.match(receiptText, /awaiting_external_controller/);

    const resumed = await tool.execute(
      "tc-level4-resume",
      { ...baseRequest, checkpointConfirmation: requiredToken },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(resumed.details.level4CampaignRunner.loadedReceiptCount, 1);
    assert.match(
      resumed.details.level4CampaignRunner.sourceLevel3Executor.selectedAction.call,
      /^autoresearch_runtime_run\(/,
    );

    const concreteWorktree = path.join(cwd, ".worktrees", "cell-01-01-candidate-01");
    const concrete = await tool.execute(
      "tc-level4-concrete-binding",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-concrete-binding-receipts.jsonl",
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const concreteCall = concrete.details.level4CampaignRunner.newReceipts[0].call;
    assert.match(concreteCall, /autoresearch_candidate_bind/);
    assert.match(concreteCall, new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(concreteCall, /worktree-from-candidate_peer_spawn/);

    const concreteResumed = await tool.execute(
      "tc-level4-concrete-binding-resume",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-concrete-binding-receipts.jsonl",
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const runCall =
      concreteResumed.details.level4CampaignRunner.sourceLevel3Executor.selectedAction.call;
    assert.match(runCall, /^autoresearch_runtime_run\(/);
    assert.match(runCall, new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(runCall, /candidate\/cell-01-01-candidate-01/);
    assert.doesNotMatch(runCall, /branch-from-candidate_peer_spawn/);

    const previousStateHome = process.env.XDG_STATE_HOME;
    const cleanupStateHome = path.join(cwd, ".state");
    process.env.XDG_STATE_HOME = cleanupStateHome;
    writeCandidatePeerRegistrySidecar({
      stateHome: cleanupStateHome,
      cwd,
      peerRunId: "candidatepeer-test-cleanup",
      worktreePath: concreteWorktree,
      branchName: "candidate/cell-01-01-candidate-01",
    });

    const cleanupReady = await tool.execute(
      "tc-level4-post-integration-cleanup-ready",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-cleanup-ready-receipts.jsonl",
        integrationCloseout: {
          status: "successful",
          commit: "abc1234",
          summary: "integrated test lane",
        },
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidatePeerRunId: "candidatepeer-test-cleanup",
            candidateWorktree: concreteWorktree,
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const cleanupPacket =
      cleanupReady.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket
        .postIntegrationCleanupReady;
    assert.equal(cleanupPacket.kind, "autoresearch.level4_post_integration_cleanup_ready.v1");
    assert.equal(cleanupPacket.readiness, "ready_after_successful_integration_closeout");
    assert.deepEqual(cleanupPacket.exactPeerRunIds, ["candidatepeer-test-cleanup"]);
    assert.deepEqual(cleanupPacket.exactWorktrees, [concreteWorktree]);
    assert.deepEqual(cleanupPacket.exactBranches, ["candidate/cell-01-01-candidate-01"]);
    assert.match(cleanupPacket.archiveDirectories[0], /archives\/candidatepeer-test-cleanup/);
    assert.match(cleanupPacket.tabClosureHints[0], /candidatepeer-test-cleanup/);
    assert.match(
      cleanupPacket.processTerminationHints[0],
      new RegExp(concreteWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.equal(cleanupPacket.candidatePeerCleanupDryRunCall, null);
    assert.equal(cleanupPacket.candidatePeerCleanupExecuteCall, null);
    assert.deepEqual(cleanupPacket.exactControllerCommands, []);
    assert.match(cleanupPacket.candidateLifecycleStatusCall, /^candidate_peer_closeout\(/);
    assert.match(cleanupPacket.candidateLifecycleStatusCall, /candidatepeer-test-cleanup/);
    assert.match(cleanupPacket.candidateLifecyclePlanCall, /^candidate_peer_closeout\(/);
    assert.match(cleanupPacket.candidateLifecyclePlanCall, /"action": "plan"/);
    assert.doesNotMatch(
      `${cleanupPacket.candidateLifecycleStatusCall}\n${cleanupPacket.candidateLifecyclePlanCall}`,
      /candidate_peer_cleanup|worktree remove|branch -D|--force/,
    );
    assert.equal(cleanupPacket.registrySidecars[0].status, "verified_registry_sidecar");
    assert.equal(cleanupPacket.registrySidecars[0].registryPath.includes(cleanupStateHome), true);
    assert.equal(cleanupPacket.blockers.length, 0);
    assert.match(cleanupReady.content[0].text, /Post-integration cleanup operator posture:/);
    assert.match(cleanupReady.content[0].text, /LIFECYCLE PLAN READY/);
    assert.match(cleanupReady.content[0].text, /lifecycle status call: prepared/);
    assert.match(cleanupReady.content[0].text, /lifecycle plan call: prepared/);
    assert.match(cleanupReady.content[0].text, /registry-v1 cleanup call: permanently withheld/);
    assert.match(cleanupReady.content[0].text, /Post-integration cleanup registry sidecars:/);
    assert.match(
      cleanupReady.content[0].text,
      /candidatepeer-test-cleanup: verified_registry_sidecar/,
    );

    const mismatch = await tool.execute(
      "tc-level4-post-integration-cleanup-registry-mismatch",
      {
        ...baseRequest,
        checkpointConfirmation: requiredToken,
        level4ReceiptPath: ".autoresearch/level4-cleanup-mismatch-receipts.jsonl",
        integrationCloseout: {
          status: "successful",
          commit: "abc1234",
          summary: "integrated test lane",
        },
        level3CandidateBindings: [
          {
            laneId: "cell-01-01-candidate-01",
            candidatePeerRunId: "candidatepeer-test-cleanup",
            candidateWorktree: path.join(cwd, ".worktrees", "wrong-worktree"),
            candidateBranch: "candidate/cell-01-01-candidate-01",
            candidateBaseRef: "HEAD",
            candidateDiffSummary: "controller verified test diff",
            candidateFilesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
          },
        ],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const mismatchPacket =
      mismatch.details.level4CampaignRunner.promptRunnerBundle.candidateCloseoutPacket
        .postIntegrationCleanupReady;
    assert.equal(mismatchPacket.readiness, "blocked_until_successful_integration_closeout");
    assert.equal(mismatchPacket.registrySidecars[0].status, "mismatched_registry_sidecar");
    assert.match(mismatchPacket.blockers.join("\n"), /candidateWorktree does not match/);
    assert.equal(mismatchPacket.candidatePeerCleanupDryRunCall, null);
    assert.equal(mismatchPacket.candidatePeerCleanupExecuteCall, null);
    assert.deepEqual(mismatchPacket.exactControllerCommands, []);
    assert.match(mismatch.content[0].text, /Post-integration cleanup operator posture:/);
    assert.match(mismatch.content[0].text, /BLOCKED/);
    assert.match(mismatch.content[0].text, /lifecycle status call: withheld/);
    assert.match(mismatch.content[0].text, /lifecycle plan call: withheld/);
    assert.match(
      mismatch.content[0].text,
      /candidatepeer-test-cleanup: mismatched_registry_sidecar/,
    );
    assert.match(mismatch.content[0].text, /blocker: controller candidateWorktree does not match/);

    if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
  });
});
