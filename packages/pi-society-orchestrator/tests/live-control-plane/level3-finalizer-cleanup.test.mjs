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

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan accepts exact finalizer and cleanup tokens", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(tool.parameters.properties.finalizerAuthorizationToken);
    assert.ok(tool.parameters.properties.cleanupAuthorizationToken);
    assert.ok(tool.parameters.properties.cleanupPeerRunIds);
    assert.equal(
      tool.parameters.properties.allowAutomaticCleanupAfterIntegrationCloseout,
      undefined,
    );
    assert.ok(tool.parameters.properties.cleanupPeerTabsOrSessions);
    assert.ok(tool.parameters.properties.integrationCloseout);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      metric: 1,
      candidate: {
        worktreePath: path.join(cwd, ".worktrees", "lane-a"),
        branch: "candidate/lane-a",
        baseRef: "HEAD",
        peerRunId: "candidatepeer-lane-a",
      },
    });
    const reviewedAtEpochMs = Date.now() + 60_000;
    const manifest = createLevel3Manifest(cwd, {
      campaignId: "level3-slice5-token-test",
      taskId: 2996,
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
      slices: [
        {
          id: "slice-5",
          metric: "authorized_finalizer_cleanup_blockers",
          cells: [
            { id: "cell-01", metric: "finalizer_token_application_blockers" },
            { id: "cell-02", dependsOn: ["cell-01"], metric: "cleanup_execution_gate_blockers" },
            { id: "cell-03", dependsOn: ["cell-02"], metric: "post_fanin_rollback_blockers" },
          ],
        },
      ],
    });

    const probe = await tool.execute(
      "tc-level3-finalizer-cleanup-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "finalize slice 5 test lane",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed", summary: "ok" },
        reviewedAtEpochMs,
        cleanupPeerRunIds: ["candidatepeer-lane-a"],
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(probe.details.ok, false);
    const requiredFinalizer =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const requiredCleanup =
      probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupAuthorization.requiredToken;
    assert.match(requiredFinalizer, /level3:finalize_post_fanin:task:2996/);
    assert.match(requiredCleanup, /level3:candidate_cleanup:task:2996/);
    assert.equal(
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerApplyCommandPacket,
      null,
    );
    assert.equal(probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupCommandPacket, null);

    const result = await tool.execute(
      "tc-level3-finalizer-cleanup-authorized",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "finalize slice 5 test lane",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed", summary: "ok" },
        reviewedAtEpochMs,
        finalizerAuthorizationToken: requiredFinalizer,
        cleanupAuthorizationToken: requiredCleanup,
        cleanupPeerRunIds: ["candidatepeer-lane-a"],
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.kind, "autoresearch.level3_authorized_finalizer_cleanup_plan.v1");
    assert.equal(plan.execution, "not_executed_by_orchestrator");
    assert.equal(plan.metric.value, 0);
    assert.equal(plan.cellMetrics.finalizerTokenApplicationBlockers.value, 0);
    assert.equal(plan.cellMetrics.cleanupExecutionGateBlockers.value, 0);
    assert.equal(plan.cellMetrics.postFaninRollbackBlockers.value, 0);
    assert.equal(plan.finalizerAuthorization.suppliedTokenAccepted, true);
    assert.equal(plan.cleanupAuthorization.suppliedTokenAccepted, true);
    assert.ok(plan.finalizerApplyCommandPacket);
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(
      plan.cleanupCommandPacket.kind,
      "autoresearch.level3_candidate_lifecycle_closeout_handoff.v2",
    );
    assert.equal(plan.cleanupCommandPacket.cleanupExecution, "not_executed_by_orchestrator");
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "candidate_cleanup_token");
    assert.deepEqual(plan.cleanupCommandPacket.exactPeerRunIds, ["candidatepeer-lane-a"]);
    assert.deepEqual(plan.cleanupCommandPacket.exactCommands, []);
    assert.deepEqual(plan.cleanupCommandPacket.forbiddenPromotionCommandMatches, []);
    assert.match(
      plan.cleanupCommandPacket.candidateLifecycleStatusCall,
      /^candidate_peer_closeout\(/,
    );
    assert.match(plan.cleanupCommandPacket.candidateLifecycleStatusCall, /"action": "status"/);
    assert.match(
      plan.cleanupCommandPacket.candidateLifecyclePlanCall,
      /^candidate_peer_closeout\(/,
    );
    assert.match(plan.cleanupCommandPacket.candidateLifecyclePlanCall, /"action": "plan"/);
    assert.doesNotMatch(
      `${plan.cleanupCommandPacket.candidateLifecycleStatusCall}\n${plan.cleanupCommandPacket.candidateLifecyclePlanCall}`,
      /candidate_peer_cleanup|worktree remove|branch -D|kill -TERM/,
    );
    assert.equal(plan.rollbackReceipt.nonAuthoritative, true);
    assert.equal(plan.rollbackReceipt.durableEvidence, false);
    assert.match(result.content[0].text, /level3_authorized_finalizer_cleanup_plan/);
    assert.match(result.content[0].text, /Rollback receipt/);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan rejects peer ids not bound to reviewed packets", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, { laneId: "lane-a" });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const baseParams = {
      action: "level3_authorized_finalizer_cleanup_plan",
      taskId: 2996,
      cwd,
      objective: "reject mismatched candidate peer identity",
      level3Manifest: manifest,
      candidateResultPacketPaths: [packetPath],
      selectedLaneId: "lane-a",
      validation: { command: "npm test", status: "passed" },
      reviewedAtEpochMs: Date.now() + 60_000,
      cleanupPeerRunIds: ["candidatepeer-not-the-reviewed-lane"],
      cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
      cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
      cleanupBranches: ["candidate/lane-a"],
    };
    const probe = await tool.execute(
      "tc-level3-peer-identity-mismatch-probe",
      baseParams,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const probePlan = probe.details.level3AuthorizedFinalizerCleanupPlan;
    const result = await tool.execute(
      "tc-level3-peer-identity-mismatch-authorized",
      {
        ...baseParams,
        finalizerAuthorizationToken: probePlan.finalizerAuthorization.requiredToken,
        cleanupAuthorizationToken: probePlan.cleanupAuthorization.requiredToken,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, false);
    assert.equal(plan.finalizerAuthorization.suppliedTokenAccepted, true);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.equal(plan.cleanupAuthorization.posture, "blocked_missing_exact_resources");
    assert.ok(
      plan.blockers.some((blocker) =>
        /peer run ids matching reviewed candidate packets/.test(blocker),
      ),
    );
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan blocks wrong or missing finalizer token", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, { laneId: "lane-a" });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const baseParams = {
      action: "level3_authorized_finalizer_cleanup_plan",
      taskId: 2996,
      cwd,
      objective: "finalizer token mismatch test",
      level3Manifest: manifest,
      candidateResultPacketPaths: [packetPath],
      selectedLaneId: "lane-a",
      validation: { command: "npm test", status: "passed" },
      reviewedAtEpochMs: Date.now() + 60_000,
      cleanupPeerRunIds: ["candidatepeer-lane-a"],
      cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
      cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
      cleanupBranches: ["candidate/lane-a"],
    };

    const missing = await tool.execute(
      "tc-level3-finalizer-missing-token",
      baseParams,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(missing.details.ok, false);
    let plan = missing.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.finalizerAuthorization.posture, "blocked_missing_token");
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.ok(plan.blockers.some((blocker) => /missing exact finalize_post_fanin/.test(blocker)));

    const wrong = await tool.execute(
      "tc-level3-finalizer-wrong-token",
      { ...baseParams, finalizerAuthorizationToken: "wrong-token" },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    assert.equal(wrong.details.ok, false);
    plan = wrong.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(plan.finalizerAuthorization.posture, "blocked_wrong_token");
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.equal(plan.cleanupAuthorization.posture, "blocked_missing_token_or_exact_policy");
    assert.equal(plan.finalizer.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(plan.finalizer.authorizedFinalizerCleanupGate.promotionAuthorized, false);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan accepts exact manifest cleanup policy", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const worktree = path.join(cwd, ".worktrees", "lane-a");
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      candidate: { worktreePath: worktree, branch: "candidate/lane-a", baseRef: "HEAD" },
    });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
      cleanupPolicy: {
        exactPeerRunIds: ["candidatepeer-lane-a"],
        exactPeerTabsOrSessions: ["peer-tab-lane-a"],
        exactWorktrees: [worktree],
        exactBranches: ["candidate/lane-a"],
      },
    });
    const probe = await tool.execute(
      "tc-level3-manifest-cleanup-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "manifest cleanup policy test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        reviewedAtEpochMs: Date.now() + 60_000,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-manifest-cleanup-authorized",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "manifest cleanup policy test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        reviewedAtEpochMs: Date.now() + 60_000,
        finalizerAuthorizationToken: token,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, true);
    assert.equal(plan.cleanupAuthorization.manifestPolicyAccepted, true);
    assert.equal(plan.cleanupAuthorization.posture, "accepted_exact_manifest_policy");
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "exact_manifest_policy");
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan emits only lifecycle-v2 handoff after successful integration closeout", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const worktree = path.join(cwd, ".worktrees", "lane-a");
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, {
      laneId: "lane-a",
      candidate: { worktreePath: worktree, branch: "candidate/lane-a", baseRef: "HEAD" },
    });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const baseParams = {
      action: "level3_authorized_finalizer_cleanup_plan",
      taskId: 2996,
      cwd,
      objective: "successful integration closeout cleanup test",
      level3Manifest: manifest,
      candidateResultPacketPaths: [packetPath],
      selectedLaneId: "lane-a",
      validation: { command: "npm test", status: "passed" },
      reviewedAtEpochMs: Date.now() + 60_000,
      cleanupPeerRunIds: ["candidatepeer-lane-a"],
      cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
      cleanupWorktrees: [worktree],
      cleanupBranches: ["candidate/lane-a"],
    };
    const probe = await tool.execute(
      "tc-level3-integration-cleanup-probe",
      baseParams,
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-integration-cleanup-authorized",
      {
        ...baseParams,
        finalizerAuthorizationToken: token,
        integrationCloseout: {
          status: "successful",
          commit: "abc1234",
          summary: "Selected lane integrated and validation passed.",
        },
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, true);
    assert.equal(plan.cleanupAuthorization.posture, "lifecycle_plan_ready_successful_integration");
    assert.equal(plan.cleanupAuthorization.cleanupExecutionAuthorized, false);
    assert.equal(plan.integrationCloseout.status, "successful");
    assert.equal(plan.integrationCloseout.commit, "abc1234");
    assert.ok(plan.cleanupCommandPacket);
    assert.equal(plan.cleanupCommandPacket.cleanupTrigger, "successful_integration_closeout");
    assert.equal(plan.cleanupCommandPacket.cleanupExecution, "not_executed_by_orchestrator");
    assert.equal(plan.cleanupCommandPacket.cleanupExecutionAuthorized, false);
    assert.deepEqual(plan.cleanupCommandPacket.exactCommands, []);
    assert.match(plan.cleanupCommandPacket.candidateLifecycleStatusCall, /candidate_peer_closeout/);
    assert.match(plan.cleanupCommandPacket.candidateLifecyclePlanCall, /candidate_peer_closeout/);
    assert.doesNotMatch(
      plan.cleanupCommandPacket.candidateLifecyclePlanCall,
      /candidate_peer_cleanup|worktree remove|branch -D|sidequest-pi|kill/,
    );
    assert.match(result.content[0].text, /trigger=successful_integration_closeout/);
  });
});

test("autoresearch_live_supervision level3_authorized_finalizer_cleanup_plan blocks dirty off-limits and stale review", async () => {
  await withTempDir(async (cwd) => {
    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "lane-a.candidate-result.json",
    );
    writeCandidateResultPacket(cwd, packetPath, { laneId: "lane-a" });
    const manifest = createLevel3Manifest(cwd, {
      primaryMetric: {
        name: "authorized_finalizer_cleanup_blockers",
        direction: "lower",
        target: 0,
      },
    });
    const probe = await tool.execute(
      "tc-level3-dirty-stale-probe",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "dirty stale off-limits test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        dirtyFiles: [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
        offLimits: ["packages/pi-society-orchestrator/src/runtime/**"],
        reviewedAtEpochMs: 1,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const token =
      probe.details.level3AuthorizedFinalizerCleanupPlan.finalizerAuthorization.requiredToken;
    const cleanup =
      probe.details.level3AuthorizedFinalizerCleanupPlan.cleanupAuthorization.requiredToken;
    const result = await tool.execute(
      "tc-level3-dirty-stale-blocked",
      {
        action: "level3_authorized_finalizer_cleanup_plan",
        taskId: 2996,
        cwd,
        objective: "dirty stale off-limits test",
        level3Manifest: manifest,
        candidateResultPacketPaths: [packetPath],
        selectedLaneId: "lane-a",
        validation: { command: "npm test", status: "passed" },
        dirtyFiles: [
          "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        ],
        offLimits: ["packages/pi-society-orchestrator/src/runtime/**"],
        reviewedAtEpochMs: 1,
        finalizerAuthorizationToken: token,
        cleanupAuthorizationToken: cleanup,
        cleanupPeerTabsOrSessions: ["peer-tab-lane-a"],
        cleanupWorktrees: [path.join(cwd, ".worktrees", "lane-a")],
        cleanupBranches: ["candidate/lane-a"],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );
    const plan = result.details.level3AuthorizedFinalizerCleanupPlan;
    assert.equal(result.details.ok, false);
    assert.equal(plan.finalizerApplyCommandPacket, null);
    assert.equal(plan.cleanupCommandPacket, null);
    assert.equal(plan.metric.status, "blocked");
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "dirty_overlap_clean" && check.status === "blocked",
      ),
    );
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "off_limits_clean" && check.status === "blocked",
      ),
    );
    assert.ok(
      plan.finalizer.preflight.checks.some(
        (check) => check.name === "review_artifacts_current" && check.status === "blocked",
      ),
    );
    assert.equal(plan.rollbackReceipt.nonAuthoritative, true);
    assert.match(result.content[0].text, /rollback hint/i);
  });
});
