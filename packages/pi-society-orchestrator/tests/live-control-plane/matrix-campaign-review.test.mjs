import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import {
  createToolContext,
  registerAutoresearchLiveTool,
  withTempDir,
  writeCandidateResultPacket,
} from "./helpers.mjs";

test("autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves", async () => {
  await withTempDir(async (cwd) => {
    const packetDir = path.join(cwd, ".autoresearch", "matrix-campaign");
    for (const cellId of ["cell-01-01", "cell-02-01"]) {
      for (const [laneId, metric] of [
        ["candidate-01", 1],
        ["candidate-02", 3],
      ]) {
        const packetPath = path.join(packetDir, cellId, `${laneId}.candidate-result.json`);
        mkdirSync(path.dirname(packetPath), { recursive: true });
        writeFileSync(
          packetPath,
          JSON.stringify({
            packetKind: "autoresearch.candidate_result.v1",
            adapterContractVersion: 1,
            cwd,
            campaign: "matrix-review",
            candidate: {
              source: "candidate_peer_spawn",
              worktreePath: path.join(cwd, ".worktrees", `${cellId}-${laneId}`),
              branch: `candidate/${cellId}-${laneId}`,
              baseRef: "HEAD",
              diffSummary: `${cellId} ${laneId}`,
              filesChanged: ["src/runtime/autoresearch-supervisor-runner.ts"],
            },
            candidateRun: {
              iteration: 1,
              status: "candidate",
              runKind: "ordinary",
              empiricalDecisionClass: "candidate_improvement",
              metric,
              description: `Measure ${cellId} ${laneId}`,
              timestamp: 1,
              checks: "pass",
              experiment: {
                hypothesisId: laneId,
                hypothesis: `${cellId} ${laneId}`,
              },
            },
            empiricalDecisionClass: "candidate_improvement",
            resultSummary: `${cellId} ${laneId} improved`,
            closeout: { status: { confidence: 2.1 } },
            adapterBoundary: "packet boundary",
          }),
        );
      }
    }

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-matrix-campaign",
      {
        action: "review_matrix_campaign",
        taskId: 2774,
        cwd,
        objective: "aggregate matrix managed cell-wave reviews",
        direction: "lower",
        metricName: "operator_ux_blockers",
        metricThreshold: 0,
        scenarios: ["operator happy path", "missing planned lane recovery"],
        hypotheses: ["managed fan-in beats loose sidequests"],
        candidateCountPerCell: 2,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.action, "review_matrix_campaign");
    assert.equal(
      result.details.matrixCampaignReview.kind,
      "autoresearch.matrix_campaign_review.v1",
    );
    assert.equal(result.details.matrixCampaignReview.posture, "ready_for_matrix_owner_review");
    assert.equal(result.details.matrixCampaignReview.completedCellCount, 2);
    assert.equal(result.details.matrixCampaignReview.expectedCellCount, 2);
    assert.equal(result.details.matrixCampaignReview.selectedCellCount, 2);
    const reviewFollowup = result.details.matrixCampaignReview.operatorFollowup;
    assert.equal(reviewFollowup.currentState, "ready_for_matrix_owner_review");
    assert.equal(reviewFollowup.primaryMetric.name, "operator_ux_blockers");
    assert.equal(reviewFollowup.measurementReviewState.completedCells, 2);
    assert.equal(reviewFollowup.measurementReviewState.selectedCells, 2);
    assert.equal(reviewFollowup.lanePacketPaths.length, 4);
    assert.equal(reviewFollowup.lanePacketPaths[0].state, "measured_exported_selectable");
    assert.ok(
      reviewFollowup.nextLegalActions.some((call) =>
        call.includes("autoresearch_candidate_decision"),
      ),
    );
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.primaryUi.surface,
      "pi-autoresearch_html_dashboard",
    );
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.primaryUi.slashCommand,
      "/autoresearch export",
    );
    assert.equal(
      result.details.matrixCampaignReview.ownerReview.decisionUi.slashCommand,
      "/autoresearch review",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.kind,
      "autoresearch.matrix_campaign_closeout.v1",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.posture,
      "ak_ready_after_owner_review",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceProjection.posture,
      "ready_for_external_projection",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceProjection.requiredAnchor,
      "taskId:2774",
    );
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.projectionKey,
      /^matrix-closeout\|task:2774\|/,
    );
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.exactRecordCall,
      /evidence_record/,
    );
    assert.match(
      result.details.matrixCampaignReview.closeout.evidenceProjection.exactRecordCall,
      /autoresearch:matrix-campaign:closeout/,
    );
    const cockpit = result.details.matrixCampaignReview.cockpit;
    assert.equal(cockpit.kind, "autoresearch.matrix_campaign_cockpit.v1");
    assert.equal(cockpit.source, "review_matrix_campaign");
    const level3 = result.details.matrixCampaignReview.level3ReviewSelection;
    assert.equal(level3.kind, "autoresearch.level3_review_selection_substrate.v1");
    assert.equal(level3.source, "level3_matrix_cell_runner_visible_candidate_lanes");
    assert.equal(level3.aggregationInput, "controller_verified_candidate_result_packets");
    assert.equal(level3.blockerMetric.name, "level3_review_selection_blockers");
    assert.equal(level3.blockerMetric.value, 0);
    assert.equal(level3.blockerMetric.status, "target_met");
    assert.deepEqual(
      level3.cellSelections.map((cell) => cell.winnerState),
      ["selected_for_owner_review", "selected_for_owner_review"],
    );
    assert.deepEqual(
      level3.cellSelections.map((cell) => cell.recommendedLaneId),
      ["candidate-01", "candidate-01"],
    );
    assert.equal(level3.cellSelections[0].nonSelectedSelectableLaneIds[0], "candidate-02");
    assert.equal(
      level3.finalizerReadiness.posture,
      "ready_for_validation_and_finalize_token_request",
    );
    assert.equal(level3.finalizerReadiness.selectedLaneCount, 2);
    assert.equal(level3.finalizerReadiness.applyCommandsExposed, false);
    assert.equal(level3.finalizerReadiness.promotionAuthority, false);
    assert.equal(level3.finalizerReadiness.cleanupAuthority, false);
    assert.match(
      level3.finalizerReadiness.exactFinalizePostFaninHandoffCall,
      /finalize_post_fanin/,
    );
    assert.match(
      level3.finalizerReadiness.exactFinalizePostFaninHandoffCall,
      /"sourceReview": "review_matrix_campaign"/,
    );
    assert.equal(level3.dangerousActionGates.promotion, "separate_promotion_token_required");
    const reviewPacket = result.details.matrixCampaignReview.reviewPacket;
    assert.equal(reviewPacket.kind, "autoresearch.review_matrix_campaign_packet.v1");
    assert.equal(reviewPacket.authorityBoundary.durableEvidence, false);
    assert.equal(reviewPacket.authorityBoundary.promotionAuthority, false);
    assert.deepEqual(
      reviewPacket.laneDispositionOptions.map((option) => option.option),
      [
        "ignore",
        "inspect further",
        "fold into synthesis",
        "cherry-pick after review",
        "merge after review",
      ],
    );
    assert.equal(
      reviewPacket.wholeMatrixMetricPosture.name,
      "level2_review_packet_generation_blockers",
    );
    assert.equal(reviewPacket.wholeMatrixMetricPosture.value, 0);
    assert.equal(reviewPacket.wholeMatrixMetricPosture.status, "target_met");
    assert.equal(reviewPacket.packetChainMetric.name, "candidate_review_packet_chain_blockers");
    assert.equal(reviewPacket.packetChainMetric.value, 0);
    assert.equal(reviewPacket.packetChainMetric.status, "target_met");
    assert.equal(reviewPacket.candidateResultPacketRefs.length, 4);
    assert.deepEqual(
      reviewPacket.candidateResultPacketRefs
        .filter((ref) => ref.selected)
        .map((ref) => `${ref.cellId}/${ref.laneId}`),
      ["cell-01-01/candidate-01", "cell-02-01/candidate-01"],
    );
    assert.equal(reviewPacket.canCloseMatrixTarget, true);
    assert.equal(cockpit.matrixCockpitBlockers.name, "matrix_cockpit_blockers");
    assert.equal(cockpit.matrixCockpitBlockers.value, 0);
    assert.equal(cockpit.progress.completedCells, 2);
    assert.equal(cockpit.progress.expectedCells, 2);
    assert.equal(cockpit.progress.selectedCells, 2);
    assert.equal(cockpit.cellRows.length, 2);
    assert.equal(cockpit.cellRows[0].selectedLaneId, "candidate-01");
    assert.match(cockpit.cellRows[0].nextLegalAction, /autoresearch_candidate_decision/);
    assert.equal(cockpit.packetInventory.length, 4);
    assert.equal(cockpit.selectedLanes.length, 2);
    assert.equal(cockpit.ownerDecisionRoute.dashboardFirst, "/autoresearch export");
    assert.equal(cockpit.operatorUxDashboard.primaryMetric.name, "level2_operator_ux_blockers");
    assert.equal(cockpit.operatorUxDashboard.primaryMetric.value, 0);
    assert.equal(
      cockpit.operatorUxDashboard.tokenAndAuthorityLegend.candidateResultPackets,
      "review_inputs_not_durable_evidence",
    );
    assert.equal(
      cockpit.operatorUxDashboard.tokenAndAuthorityLegend.finalizerCleanupPromotion,
      "separate_token_gates_required",
    );
    assert.match(cockpit.operatorUxDashboard.packetInventorySummary, /4 packet lane/);
    assert.ok(
      cockpit.operatorUxDashboard.fallbackAndRecovery.some((item) =>
        /Duplicate lane recovery/.test(item),
      ),
    );
    assert.ok(
      cockpit.matrixCockpitBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning matrix_cockpit_blockers"),
      ),
    );
    assert.ok(
      cockpit.noHiddenExecutionBoundaries.some((boundary) =>
        /does not launch peers/.test(boundary),
      ),
    );
    assert.equal(result.details.matrixCampaignReview.closeout.selectedLanes.length, 2);
    assert.equal(result.details.matrixCampaignReview.closeout.packetInventory.length, 4);
    assert.equal(
      result.details.matrixCampaignReview.closeout.packetInventory.filter((lane) => lane.selected)
        .length,
      2,
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.dashboardFirst,
      "/autoresearch export",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.overlayFallback,
      "/autoresearch overlay",
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.finalDecision,
      "/autoresearch review",
    );
    assert.deepEqual(result.details.matrixCampaignReview.closeout.ownerDecisionRoute.routeOrder, [
      "/autoresearch export",
      "/autoresearch review",
      "evidence_record",
    ]);
    assert.equal(
      result.details.matrixCampaignReview.closeout.ownerDecisionRoute.evidenceAfterReview,
      true,
    );
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.name,
      "evidence_handoff_blockers",
    );
    assert.equal(result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.value, 0);
    assert.equal(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.status,
      "target_met",
    );
    assert.ok(
      result.details.matrixCampaignReview.closeout.evidenceHandoffBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning evidence_handoff_blockers"),
      ),
    );
    const learningActivation = result.details.matrixCampaignReview.closeout.learningActivation;
    assert.equal(learningActivation.posture, "ready_for_owner_routed_learning_handoff");
    assert.equal(learningActivation.ownerSurface, "autoresearch_learning_kes_adapter");
    assert.equal(learningActivation.requiredPacketKind, "autoresearch.learning.v1");
    assert.match(learningActivation.exactLearningExportCall, /learning_export/);
    assert.match(learningActivation.exactAdapterPlanCall, /"action": "plan"/);
    assert.match(learningActivation.exactAdapterMaterializeCall, /"action": "materialize"/);
    assert.deepEqual(learningActivation.routeOrder, [
      "autoresearch_runtime_status.learning_export",
      "autoresearch_learning_kes_adapter.plan",
      "owner_review",
      "autoresearch_learning_kes_adapter.materialize",
    ]);
    assert.equal(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.name,
      "learning_activation_blockers",
    );
    assert.equal(result.details.matrixCampaignReview.closeout.learningActivationBlockers.value, 0);
    assert.equal(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.status,
      "target_met",
    );
    assert.ok(
      result.details.matrixCampaignReview.closeout.learningActivationBlockers.proofs.some((proof) =>
        proof.proof.includes("docs/tests alignment mentioning learning_activation_blockers"),
      ),
    );
    assert.deepEqual(
      result.details.matrixCampaignReview.cells.map((cell) => cell.selectedLaneId),
      ["candidate-01", "candidate-01"],
    );
    assert.match(result.content[0].text, /review_matrix_campaign/);
    assert.match(result.content[0].text, /ready_for_matrix_owner_review/);
    assert.match(result.content[0].text, /Operator follow-up\/current-state summary/);
    assert.match(
      result.content[0].text,
      /measurement\/review state: ready_for_matrix_owner_review/,
    );
    assert.match(result.content[0].text, /UX proof checklist/);
    assert.match(result.content[0].text, /Managed cell reviews/);
    assert.match(result.content[0].text, /Cell progress: 2\/2/);
    assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
    assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
    assert.match(result.content[0].text, /Matrix campaign cockpit\/dashboard/);
    assert.match(result.content[0].text, /matrix_cockpit_blockers: 0/);
    assert.match(result.content[0].text, /level-2 operator UX dashboard/);
    assert.match(result.content[0].text, /level2_operator_ux_blockers: 0/);
    assert.match(result.content[0].text, /dashboard_readiness_summary_blockers: 0/);
    assert.match(
      result.content[0].text,
      /candidate-result packets: review_inputs_not_durable_evidence/,
    );
    assert.match(result.content[0].text, /review packets: owner_review_inputs_not_promotion/);
    assert.match(result.content[0].text, /Level-1 fallback/);
    assert.match(result.content[0].text, /Review matrix-campaign packet/);
    assert.match(result.content[0].text, /Level-3 review\/selection substrate/);
    assert.match(result.content[0].text, /level3_review_selection_blockers: 0/);
    assert.match(result.content[0].text, /level2_review_packet_generation_blockers=0/);
    assert.match(result.content[0].text, /promotion authority: no/);
    assert.match(result.content[0].text, /compact cell table/);
    assert.match(result.content[0].text, /selected lane inventory/);
    assert.match(result.content[0].text, /next legal action: autoresearch_candidate_decision/);
    assert.match(
      result.content[0].text,
      /dashboard-first owner route: \/autoresearch export -> \/autoresearch review -> evidence_record/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning matrix_cockpit_blockers/,
    );
    assert.match(result.content[0].text, /Campaign closeout/);
    assert.match(result.content[0].text, /autoresearch\.matrix_campaign_closeout\.v1/);
    assert.match(result.content[0].text, /closeout packet inventory/);
    assert.match(result.content[0].text, /evidence_handoff_blockers: 0/);
    assert.match(
      result.content[0].text,
      /evidence projection: ready_for_external_projection via AK/,
    );
    assert.match(result.content[0].text, /evidence handoff: evidence_record/);
    assert.match(result.content[0].text, /evidence record call: evidence_record/);
    assert.match(
      result.content[0].text,
      /owner route order: \/autoresearch export -> \/autoresearch review -> evidence_record/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning evidence_handoff_blockers/,
    );
    assert.match(result.content[0].text, /learning_activation_blockers: 0/);
    assert.match(result.content[0].text, /learning export call: autoresearch_runtime_status/);
    assert.match(result.content[0].text, /adapter plan call: autoresearch_learning_kes_adapter/);
    assert.match(
      result.content[0].text,
      /adapter materialize call: autoresearch_learning_kes_adapter/,
    );
    assert.match(
      result.content[0].text,
      /autoresearch_runtime_status\.learning_export -> autoresearch_learning_kes_adapter\.plan -> owner_review -> autoresearch_learning_kes_adapter\.materialize/,
    );
    assert.match(
      result.content[0].text,
      /docs\/tests alignment mentioning learning_activation_blockers/,
    );
    assert.match(result.content[0].text, /No peer was launched/);
    assert.match(result.content[0].text, /Raw peer messages are communication only/);
  });
});

test("autoresearch_live_supervision review_matrix_campaign blocks proof-only review packet closure without downgrade", async () => {
  await withTempDir(async (cwd) => {
    const packetPath = path.join(
      cwd,
      ".autoresearch",
      "matrix-campaign",
      "cell-01-01",
      "candidate-01.candidate-result.json",
    );
    mkdirSync(path.dirname(packetPath), { recursive: true });
    writeFileSync(
      packetPath,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "proof-only-matrix-review",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "proof-only-candidate"),
          branch: "candidate/proof-only",
          baseRef: "HEAD",
          diffSummary: "proof-only candidate packet",
          filesChanged: ["packages/pi-society-orchestrator/README.md"],
          peerRunId: "candidatepeer-proof-only",
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure proof-only lane",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "baseline-only target",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "baseline-only packet exists but must not close target",
        closeout: { status: { confidence: 1.1 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-matrix-campaign-proof-only-blocked",
      {
        action: "review_matrix_campaign",
        taskId: 2981,
        cwd,
        objective: "level-2 review-packet generation proof-only closure",
        direction: "lower",
        metricName: "level2_review_packet_generation_blockers",
        metricThreshold: 0,
        scenarios: ["proof-only closure"],
        hypotheses: ["baseline-only target"],
        candidateCountPerCell: 1,
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    const review = result.details.matrixCampaignReview;
    assert.equal(review.posture, "cell_rerun_required");
    assert.equal(review.reviewPacket.kind, "autoresearch.review_matrix_campaign_packet.v1");
    assert.equal(review.reviewPacket.canCloseMatrixTarget, false);
    assert.equal(review.reviewPacket.wholeMatrixMetricPosture.status, "blocked");
    assert.equal(
      review.reviewPacket.wholeMatrixMetricPosture.proofOnlyBaselineOnlyTargetClosureBlocked,
      true,
    );
    assert.equal(review.closeout.evidenceProjection.posture, "blocked");
    assert.equal(review.closeout.evidenceProjection.exactRecordCall, null);
    assert.match(review.nextStep, /Do not close proof-only\/baseline-only matrix work/);
    assert.match(result.content[0].text, /can close matrix target: no/);
    assert.match(result.content[0].text, /proof-only\/baseline-only closure blocked: yes/);
  });
});

test("post-fan-in finalizer prepares token request while withholding apply packet until authorization", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.candidate-result.json");
    const packetB = path.join(cwd, "candidate-02.candidate-result.json");
    writeCandidateResultPacket(cwd, packetA, { laneId: "candidate-01", metric: 4 });
    writeCandidateResultPacket(cwd, packetB, { laneId: "candidate-02", metric: 2 });

    const runner = new AutoresearchLiveSupervisionRunner();
    const preflight = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      direction: "lower",
      candidateResultPacketPaths: [packetA, packetB],
      selectedLaneId: "candidate-02",
      validation: {
        command:
          "pnpm --filter @tryinget/pi-society-orchestrator test -- autoresearch-live-control-plane",
        status: "passed",
        summary: "focused finalizer checks passed",
      },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: ["packages/pi-society-orchestrator/README.md"],
      reviewedAtEpochMs: Date.now() + 60_000,
    });

    assert.equal(preflight.kind, "autoresearch.post_fanin_finalizer_result.v1");
    assert.equal(preflight.outcome, "review_blocked");
    assert.equal(preflight.preflight.status, "passed");
    assert.equal(preflight.manualPostFaninResidue.value, 1);
    assert.equal(
      preflight.finalizerTokenRequest.kind,
      "autoresearch.post_fanin_finalizer_token_request.v1",
    );
    assert.equal(preflight.finalizerTokenRequest.requiredTokenName, "finalize_post_fanin");
    assert.equal(
      preflight.finalizerTokenRequest.metricPosture.name,
      "level2_finalizer_token_request_blockers",
    );
    assert.equal(preflight.finalizerTokenRequest.metricPosture.value, 0);
    assert.equal(preflight.finalizerTokenRequest.metricPosture.status, "target_met");
    assert.equal(
      preflight.finalizerTokenRequest.packetChainTrace.sourceReviewPacketKind,
      "autoresearch.review_candidate_wave_packet.v1",
    );
    assert.equal(
      preflight.finalizerTokenRequest.packetChainTrace.metric.name,
      "candidate_review_packet_chain_blockers",
    );
    assert.equal(preflight.finalizerTokenRequest.packetChainTrace.metric.value, 0);
    assert.equal(preflight.finalizerTokenRequest.packetChainTrace.metric.status, "target_met");
    assert.deepEqual(
      preflight.finalizerTokenRequest.packetChainTrace.selectedCandidateResultPacketRefs,
      [packetB],
    );
    assert.equal(
      preflight.finalizerTokenRequest.permittedFinalizerScope.applyCommandsWithheldUntilToken,
      true,
    );
    assert.deepEqual(preflight.finalizerTokenRequest.separateOwnerTokensRequired, [
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ]);
    assert.equal(
      preflight.authorizedFinalizerCleanupGate.name,
      "authorized_finalizer_cleanup_blockers",
    );
    assert.equal(preflight.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(preflight.authorizedFinalizerCleanupGate.status, "target_met");
    assert.equal(preflight.authorizedFinalizerCleanupGate.finalizedWithToken, false);
    assert.equal(preflight.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(
      preflight.authorizedFinalizerCleanupGate.candidatePeerTabClosureIncludedInCleanup,
      true,
    );
    assert.equal(preflight.authorizedFinalizerCleanupGate.cleanupEvidenceRequired, false);
    assert.equal(preflight.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.deepEqual(preflight.authorizedFinalizerCleanupGate.requiredSeparateTokens, [
      "candidate_cleanup",
      "promotion",
    ]);
    assert.deepEqual(preflight.authorizedFinalizerCleanupGate.forbiddenCommandMatches, []);
    assert.ok(
      preflight.finalizerTokenRequest.nextLegalActions.some((action) =>
        /candidate cleanup.*candidate_cleanup/i.test(action),
      ),
    );
    assert.equal(preflight.exactApplyCommandPacket, null);
    assert.equal(
      preflight.closeoutReceipt.kind,
      "autoresearch.post_fanin_finalizer_closeout_receipt.v1",
    );
    assert.equal(preflight.closeoutReceipt.status, "review_blocked");
    assert.equal(preflight.closeoutReceipt.execution, "receipt_only_no_mutation");
    assert.equal(preflight.closeoutReceipt.validation.status, "passed");
    assert.equal(preflight.closeoutReceipt.finalizerApply.posture, "withheld");
    assert.equal(preflight.closeoutReceipt.evidenceHandoff.posture, "owner_surface_required");
    assert.equal(
      preflight.closeoutReceipt.cleanupHandoff.posture,
      "separate_candidate_cleanup_gate_required",
    );
    assert.ok(preflight.closeoutReceipt.nonActions.some((action) => /No AK evidence/.test(action)));

    const authorized = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      direction: "lower",
      candidateResultPacketPaths: [packetA, packetB],
      selectedLaneId: "candidate-02",
      validation: {
        command:
          "pnpm --filter @tryinget/pi-society-orchestrator test -- autoresearch-live-control-plane",
        status: "passed",
      },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: ["packages/pi-society-orchestrator/README.md"],
      reviewedAtEpochMs: Date.now() + 60_000,
      applyAuthorizationToken: preflight.contract.exactAuthorizationToken,
    });

    assert.equal(authorized.outcome, "committed_cleaned");
    assert.equal(
      authorized.exactApplyCommandPacket.kind,
      "autoresearch.post_fanin_finalizer_apply_command_packet.v1",
    );
    assert.equal(authorized.exactApplyCommandPacket.applyExecution, "not_executed_by_orchestrator");
    assert.match(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      /git -C .* checkout .*candidate\/candidate-02/,
    );
    assert.match(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      /git -C .* commit -m/,
    );
    const forbiddenCleanupPromotionCommands =
      /\b(?:merge|push|rebase|tag|release|publish)\b|worktree remove|branch -d|branch -D|rm -rf|candidate_cleanup|promotion/i;
    assert.doesNotMatch(
      authorized.exactApplyCommandPacket.exactCommands.join("\n"),
      forbiddenCleanupPromotionCommands,
    );
    assert.equal(authorized.closeoutReceipt.status, "committed_cleaned");
    assert.equal(
      authorized.closeoutReceipt.finalizerApply.posture,
      "commands_prepared_not_executed",
    );
    assert.equal(
      authorized.closeoutReceipt.finalizerApply.commandCount,
      authorized.exactApplyCommandPacket.exactCommands.length,
    );
    assert.equal(authorized.closeoutReceipt.finalizerApply.authorizationTokenAccepted, true);
    assert.equal(authorized.closeoutReceipt.blockedReasons.length, 0);
    assert.equal(authorized.manualPostFaninResidue.name, "manual_post_fanin_residue");
    assert.equal(authorized.manualPostFaninResidue.value, 0);
    assert.equal(authorized.manualPostFaninResidue.status, "target_met");
    assert.equal(authorized.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(authorized.authorizedFinalizerCleanupGate.status, "target_met");
    assert.equal(authorized.authorizedFinalizerCleanupGate.finalizedWithToken, true);
    assert.equal(authorized.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(
      authorized.authorizedFinalizerCleanupGate.candidatePeerTabClosureIncludedInCleanup,
      true,
    );
    assert.equal(authorized.authorizedFinalizerCleanupGate.cleanupEvidenceRequired, false);
    assert.equal(authorized.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.deepEqual(authorized.authorizedFinalizerCleanupGate.forbiddenCommandMatches, []);
    assert.match(authorized.nextStep, /Cleanup requires candidate_cleanup/);
    assert.match(authorized.nextStep, /promotion requires promotion/);
    assert.ok(
      authorized.exactApplyCommandPacket.rollbackNotes.some((note) =>
        /candidate_cleanup token/.test(note),
      ),
    );
    assert.ok(
      authorized.exactApplyCommandPacket.rollbackNotes.some((note) => /promotion token/.test(note)),
    );
    assert.ok(
      authorized.boundaries.some((boundary) => /No checkout, merge, commit/.test(boundary)),
    );
    assert.ok(
      authorized.authorizedFinalizerCleanupGate.proofs.some((proof) =>
        /peer tab\/session closure/.test(proof),
      ),
    );
    assert.ok(
      authorized.authorizedFinalizerCleanupGate.proofs.some((proof) =>
        /does not require separate AK evidence/.test(proof),
      ),
    );
    assert.ok(
      authorized.boundaries.some((boundary) =>
        /candidate_cleanup authority, or promotion authority/.test(boundary),
      ),
    );
  });
});

test("post-fan-in finalizer fails closed on missing finals, off-limits drift, dirty overlap, stale review, and wrong authorization", async () => {
  await withTempDir(async (cwd) => {
    const packet = path.join(cwd, "candidate-01.candidate-result.json");
    writeCandidateResultPacket(cwd, packet, {
      laneId: "candidate-01",
      filesChanged: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
        "packages/pi-toolbox-discovery/src/index.ts",
      ],
    });
    const runner = new AutoresearchLiveSupervisionRunner();

    const blocked = runner.finalizePostFanin({
      action: "post_fanin_finalizer",
      taskId: 2959,
      cwd,
      objective: "finalize blocked post-fan-in campaign",
      sourceReview: "review_candidate_wave",
      candidateResultPacketPaths: [packet, path.join(cwd, "candidate-02.candidate-result.json")],
      selectedLaneId: "candidate-01",
      validation: { command: "pnpm test", status: "failed", summary: "validation failed" },
      offLimits: ["packages/pi-toolbox-discovery/**"],
      dirtyFiles: [
        "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
      ],
      reviewedAtEpochMs: 1,
      applyAuthorizationToken: "authorize-post-fanin-finalizer:wrong",
    });

    assert.equal(blocked.outcome, "failed_closed");
    assert.equal(blocked.finalizerTokenRequest.metricPosture.status, "blocked");
    assert.equal(blocked.authorizedFinalizerCleanupGate.value, 0);
    assert.equal(blocked.authorizedFinalizerCleanupGate.cleanupAuthorized, false);
    assert.equal(blocked.authorizedFinalizerCleanupGate.promotionAuthorized, false);
    assert.equal(blocked.exactApplyCommandPacket, null);
    assert.equal(blocked.closeoutReceipt.status, "failed_closed");
    assert.equal(blocked.closeoutReceipt.finalizerApply.posture, "withheld");
    assert.ok(blocked.closeoutReceipt.blockedReasons.length >= 5);
    assert.ok(
      blocked.closeoutReceipt.recoveryNotes.some((note) => /Do not run finalizer apply/.test(note)),
    );
    assert.equal(blocked.preflight.status, "blocked");
    assert.ok(blocked.preflight.blockerCount >= 5);
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "finals_present").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "validation_passed").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "off_limits_clean").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "dirty_overlap_clean").status,
      "blocked",
    );
    assert.equal(
      blocked.preflight.checks.find((check) => check.name === "review_artifacts_current").status,
      "blocked",
    );
    assert.match(blocked.nextStep, /Fail closed/);
    assert.ok(blocked.boundaries.some((boundary) => /Missing finals.*fail closed/.test(boundary)));
  });
});
