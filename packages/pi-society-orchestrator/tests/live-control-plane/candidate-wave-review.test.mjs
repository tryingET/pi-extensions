import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import { createToolContext, registerAutoresearchLiveTool, withTempDir } from "./helpers.mjs";

test("autoresearch_live_supervision review_candidate_wave compares measured lanes for owner selection", async () => {
  const cwd = "/tmp/candidate-wave-review";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);
  assert.ok(tool.parameters.properties.candidateResults, "schema exposes candidateResults");

  const result = await tool.execute(
    "tc-review-candidate-wave",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "choose the best campaign-behavior candidate",
      direction: "lower",
      candidateResults: [
        {
          laneId: "candidate-01",
          objective: "minimal plan surface",
          metric: 12,
          status: "candidate_review_ready",
          checksStatus: "pass",
          confidence: 2.3,
          candidateSource: "candidate_peer_spawn",
          candidateWorktree: path.join(cwd, ".worktrees", "candidate-01"),
          candidateBranch: "candidate/candidate-01",
          candidateBaseRef: "HEAD",
          candidateFilesChanged: ["src/a.ts"],
          candidatePeerRunId: "candidatepeer-positive-01",
        },
        {
          laneId: "candidate-02",
          objective: "review surface",
          metric: 9,
          status: "candidate_review_ready",
          checksStatus: "pass",
          confidence: 1.8,
          candidateSource: "candidate_peer_spawn",
          candidateWorktree: path.join(cwd, ".worktrees", "candidate-02"),
          candidateBranch: "candidate/candidate-02",
          candidateBaseRef: "HEAD",
          candidateFilesChanged: ["src/b.ts"],
          candidatePeerRunId: "candidatepeer-positive-02",
        },
        {
          laneId: "candidate-03",
          objective: "risky auto-launch",
          metric: 7,
          status: "blocked",
          checksStatus: "pass",
        },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "review_candidate_wave");
  assert.equal(result.details.candidateWaveReview.kind, "autoresearch.candidate_wave_review.v1");
  assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-02");
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.kind,
    "autoresearch.review_candidate_wave_packet.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.generatedFrom,
    "bound_candidate_results",
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.authorityBoundary.durableEvidence,
    false,
  );
  assert.equal(
    result.details.candidateWaveReview.reviewPacket.authorityBoundary.promotionAuthority,
    false,
  );
  assert.deepEqual(
    result.details.candidateWaveReview.reviewPacket.laneDispositionOptions.map(
      (option) => option.option,
    ),
    [
      "ignore",
      "inspect further",
      "fold into synthesis",
      "cherry-pick after review",
      "merge after review",
    ],
  );
  assert.equal(
    result.details.candidateWaveReview.management.kind,
    "autoresearch.candidate_wave_management.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.primaryUi.surface,
    "pi-autoresearch_html_dashboard",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.primaryUi.slashCommand,
    "/autoresearch export",
  );
  assert.equal(
    result.details.candidateWaveReview.ownerReviewRoute.decisionUi.slashCommand,
    "/autoresearch review",
  );
  assert.equal(result.details.candidateWaveReview.management.posture, "ready_for_owner_selection");
  assert.equal(result.details.candidateWaveReview.management.completedLaneCount, 3);
  assert.equal(result.details.candidateWaveReview.management.expectedLaneCount, 3);
  assert.deepEqual(
    result.details.candidateWaveReview.management.laneStates.map((lane) => lane.state),
    [
      "measured_exported_selectable",
      "measured_exported_selectable",
      "measured_exported_not_selectable",
    ],
  );
  assert.equal(
    result.details.candidateWaveReview.reliabilityRecovery.kind,
    "autoresearch.candidate_wave_reliability_recovery.v1",
  );
  assert.equal(
    result.details.candidateWaveReview.reliabilityRecovery.posture,
    "selection_ready_with_non_selected_lane_guidance",
  );
  assert.deepEqual(result.details.candidateWaveReview.reliabilityRecovery.nonSelectedLaneIds, [
    "candidate-01",
  ]);
  assert.match(
    result.details.candidateWaveReview.reliabilityRecovery.laneRecovery.find(
      (lane) => lane.laneId === "candidate-01",
    ).guidance,
    /stop\/cancel/,
  );
  assert.match(
    result.details.candidateWaveReview.reliabilityRecovery.latePacketPolicy,
    /late candidate-result packet.*rerun/i,
  );
  assert.equal(
    result.details.candidateWaveReview.lanes.find((lane) => lane.laneId === "candidate-03")
      .selectable,
    false,
  );
  assert.match(
    result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
    /autoresearch_candidate_decision/,
  );
  assert.match(
    result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
    /autoresearch_runtime_run/,
  );
  assert.match(result.content[0].text, /Candidate comparison/);
  assert.match(result.content[0].text, /Recommendation: owner_selection_required — candidate-02/);
  assert.match(result.content[0].text, /Wave fan-in management/);
  assert.match(result.content[0].text, /ready_for_owner_selection/);
  assert.match(result.content[0].text, /Owner review route/);
  assert.match(result.content[0].text, /primary UI command: \/autoresearch export/);
  assert.match(result.content[0].text, /final decision UI command: \/autoresearch review/);
  assert.match(result.content[0].text, /Exact next calls/);
  assert.match(result.content[0].text, /not promotion authority|owner approval/);
});

test("autoresearch_live_supervision review_candidate_wave reads candidate result packet paths", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.json");
    const packetB = path.join(cwd, "candidate-02.json");
    writeFileSync(
      packetA,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/candidate-01",
          baseRef: "HEAD",
          diffSummary: "first candidate",
          filesChanged: ["src/a.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 15,
          description: "Measure candidate 01",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "First candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 01 improved",
        closeout: { status: { confidence: 2.1 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      packetB,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-02"),
          branch: "candidate/candidate-02",
          baseRef: "HEAD",
          diffSummary: "second candidate",
          filesChanged: ["src/b.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 10,
          description: "Measure candidate 02",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-02",
            hypothesis: "Second candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 02 improved more",
        closeout: { status: { confidence: 2.4 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    assert.ok(
      tool.parameters.properties.candidateResultPacketPaths,
      "schema exposes candidateResultPacketPaths",
    );

    const result = await tool.execute(
      "tc-review-candidate-wave-packets",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "choose from packetized candidate results",
        direction: "lower",
        candidateResultPacketPaths: [packetA, packetB],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.packetDiscovery.mode, "explicit");
    assert.equal(
      result.details.candidateWaveReview.packetDiscovery.candidateResultPacketPaths.length,
      2,
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-02");
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.kind,
      "autoresearch.level2_candidate_binding.v1",
    );
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.metric.name,
      "level2_candidate_binding_blockers",
    );
    assert.equal(result.details.candidateWaveReview.level2CandidateBinding.metric.value, 0);
    assert.equal(
      result.details.candidateWaveReview.reviewPacket.packetChainMetric.name,
      "candidate_review_packet_chain_blockers",
    );
    assert.equal(result.details.candidateWaveReview.reviewPacket.packetChainMetric.value, 0);
    assert.equal(
      result.details.candidateWaveReview.reviewPacket.packetChainMetric.status,
      "target_met",
    );
    assert.deepEqual(
      result.details.candidateWaveReview.reviewPacket.candidateResultPacketRefs.map((ref) => ({
        laneId: ref.laneId,
        sourcePacketPath: ref.sourcePacketPath,
        packetPresent: ref.packetPresent,
        selected: ref.selected,
      })),
      [
        { laneId: "candidate-01", sourcePacketPath: packetA, packetPresent: true, selected: false },
        { laneId: "candidate-02", sourcePacketPath: packetB, packetPresent: true, selected: true },
      ],
    );
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.controllerVerifiedLaneCount,
      2,
    );
    assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.missingLaneIds, []);
    assert.deepEqual(
      result.details.candidateWaveReview.level2CandidateBinding.duplicateLaneIds,
      [],
    );
    assert.deepEqual(
      result.details.candidateWaveReview.level2CandidateBinding.peerAssertionOnlyLaneIds,
      [],
    );
    assert.deepEqual(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions.map(
        (option) => option.optionId,
      ),
      ["plan_keep_recommended", "collect_more_samples", "plan_discard", "plan_rewind"],
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.kind,
      "autoresearch.candidate_wave_owner_decision_form.v1",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.recommendedOptionId,
      "plan_keep_recommended",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.options[0].recommended,
      true,
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.surface,
      "pi-autoresearch_candidate_decision_workbench",
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.slashCommand,
      "/autoresearch review",
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.primaryUi.exactPreparationCalls.join(
        "\n",
      ),
      /candidateWorktree/,
    );
    assert.equal(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewQuestions
        .questions[0].id,
      "candidate_wave_owner_decision",
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewCall,
      /interview/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionForm.interviewCall,
      /candidate_wave_owner_decision/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions[0].exactNextCalls.join(
        "\n",
      ),
      /plan_keep/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.ownerDecisionOptions[1].exactNextCalls.join(
        "\n",
      ),
      /candidateWorktree/,
    );
    const candidate02 = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-02",
    );
    assert.equal(candidate02.candidateBranch, "candidate/candidate-02");
    assert.equal(candidate02.candidateBaseRef, "HEAD");
    assert.deepEqual(candidate02.candidateFilesChanged, ["src/b.ts"]);
    assert.equal(candidate02.sourcePacketPath, packetB);
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /autoresearch_candidate_bind/,
    );
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /candidate\/candidate-02/,
    );
    assert.ok(result.content[0].text.includes(packetB));
    assert.match(
      result.content[0].text,
      /candidate: source=candidate_peer_spawn; branch=candidate\/candidate-02/,
    );
    assert.match(result.content[0].text, /worktree=.*candidate-02/);
    assert.match(result.content[0].text, /caveat: candidate 02 improved more/);
    assert.match(result.content[0].text, /Packet discovery: explicit/);
    assert.match(result.content[0].text, /Level-2 candidate binding/);
    assert.match(result.content[0].text, /level2_candidate_binding_blockers: 0/);
    assert.match(result.content[0].text, /controller-verified lanes: 2/);
    assert.match(result.content[0].text, /binding candidate-02: bound_controller_verified_packet/);
    assert.match(result.content[0].text, /Owner decision form/);
    assert.match(
      result.content[0].text,
      /primary UI: pi-autoresearch_candidate_decision_workbench/,
    );
    assert.match(result.content[0].text, /primary UI command: \/autoresearch review/);
    assert.match(result.content[0].text, /fallback interview call: interview/);
    assert.match(result.content[0].text, /candidate_wave_owner_decision/);
    assert.match(result.content[0].text, /Owner decision options/);
    assert.match(result.content[0].text, /plan_keep_recommended/);
    assert.match(result.content[0].text, /collect_more_samples/);
    assert.match(result.content[0].text, /candidate-result packets/);
    assert.match(result.content[0].text, /Exact next calls/);
  });
});

test("autoresearch_live_supervision review_candidate_wave rejects controller-inline packet lineage", async () => {
  await withTempDir(async (cwd) => {
    const inlinePacket = path.join(cwd, "candidate-inline.json");
    const peerPacket = path.join(cwd, "candidate-peer.json");
    writeFileSync(
      inlinePacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "manual",
          worktreePath: cwd,
          branch: "main",
          baseRef: "HEAD",
          diffSummary: "controller inline patch that would have won on metric alone",
          filesChanged: ["packages/pi-designmd-foundry/src/inline.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure inline controller patch",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-inline",
            hypothesis: "Inline controller patch should be rejected despite best metric",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "inline patch had best metric but bypassed candidate runner handoff",
        closeout: { status: { confidence: 3.1 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      peerPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-positive-lineage",
          runnerId: "candidate-runner-positive-lineage",
          worktreePath: path.join(cwd, ".worktrees", "candidate-peer"),
          branch: "candidate/candidate-peer",
          baseRef: "HEAD",
          diffSummary: "visible candidate runner patch",
          filesChanged: ["packages/pi-designmd-foundry/src/candidate.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 5,
          description: "Measure visible candidate runner patch",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-peer",
            hypothesis: "Visible candidate runner lineage remains selectable",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary:
          "candidate runner packet is selectable even with a worse metric than inline patch",
        closeout: { status: { confidence: 2.8 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-lineage-enforcement",
      {
        action: "review_candidate_wave",
        taskId: 2815,
        cwd,
        objective: "reject controller-inline implementation packets during campaign review",
        direction: "lower",
        candidateResultPacketPaths: [inlinePacket, peerPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-peer");
    const inlineLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-inline",
    );
    const peerLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-peer",
    );
    assert.equal(inlineLane.selectable, false);
    assert.match(inlineLane.selectionReason, /process_violation/);
    assert.match(inlineLane.selectionReason, /manual/);
    assert.equal(peerLane.selectable, true);
    assert.match(peerLane.selectionReason, /verified candidate_peer_spawn worktree lineage/);
    assert.equal(peerLane.candidateSource, "candidate_peer_spawn");
    assert.equal(peerLane.candidatePeerRunId, "candidatepeer-positive-lineage");
    assert.deepEqual(peerLane.candidateFilesChanged, [
      "packages/pi-designmd-foundry/src/candidate.ts",
    ]);
    assert.match(result.content[0].text, /candidate-inline/);
    assert.match(result.content[0].text, /process_violation/);
    assert.match(result.content[0].text, /candidate-peer/);
    assert.match(result.content[0].text, /peerRunId=candidatepeer-positive-lineage/);
  });
});

test("autoresearch_live_supervision review_candidate_wave fails closed on off-limits path drift", async () => {
  await withTempDir(async (cwd) => {
    const driftPacket = path.join(cwd, "candidate-drift.json");
    const cleanPacket = path.join(cwd, "candidate-clean.json");
    writeFileSync(
      driftPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-off-limits-drift",
          worktreePath: path.join(cwd, ".worktrees", "candidate-drift"),
          branch: "candidate/off-limits-drift",
          baseRef: "HEAD",
          diffSummary: "best metric but touched off-limits toolbox package",
          filesChanged: ["packages/pi-toolbox-discovery/src/index.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 0,
          description: "Measure drift candidate",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-drift",
            hypothesis: "Off-limits drift must fail closed despite best metric",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "best metric but illegal changed file",
        closeout: { status: { confidence: 3.0 } },
        adapterBoundary: "packet boundary",
      }),
    );
    writeFileSync(
      cleanPacket,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "candidatepeer-clean",
          worktreePath: path.join(cwd, ".worktrees", "candidate-clean"),
          branch: "candidate/clean",
          baseRef: "HEAD",
          diffSummary: "clean scoped candidate",
          filesChanged: [
            "packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts",
          ],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 5,
          description: "Measure clean candidate",
          timestamp: 2,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-clean",
            hypothesis: "Clean candidate remains selectable",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "clean candidate is selectable",
        closeout: { status: { confidence: 2.0 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-off-limits-drift",
      {
        action: "review_candidate_wave",
        taskId: 2959,
        cwd,
        objective: "fail closed when a candidate result drifts into off-limits paths",
        direction: "lower",
        offLimits: ["packages/pi-toolbox-discovery/**"],
        candidateResultPacketPaths: [driftPacket, cleanPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-clean");
    const driftLane = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-drift",
    );
    assert.equal(driftLane.selectable, false);
    assert.match(driftLane.selectionReason, /process_violation/);
    assert.match(driftLane.selectionReason, /off-limits path drift/);
    assert.match(driftLane.selectionReason, /packages\/pi-toolbox-discovery\/src\/index\.ts/);
    assert.match(
      result.details.candidateWaveReview.recommendation.exactNextCalls.join("\n"),
      /candidate-clean/,
    );
    assert.match(result.content[0].text, /candidate-drift/);
    assert.match(result.content[0].text, /off-limits path drift/);
  });
});

test("autoresearch_live_supervision review_candidate_wave gates explicit incomplete planned lanes", async () => {
  await withTempDir(async (cwd) => {
    const packetA = path.join(cwd, "candidate-01.json");
    const missingPacket = path.join(
      cwd,
      ".autoresearch",
      "candidate-wave",
      "candidate-02.candidate-result.json",
    );
    writeFileSync(
      packetA,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/candidate-01",
          baseRef: "HEAD",
          diffSummary: "first candidate",
          filesChanged: ["src/a.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 1,
          description: "Measure candidate 01",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "First candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "candidate 01 improved",
        closeout: { status: { confidence: 2.1 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-incomplete-explicit",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "avoid premature owner selection while a planned lane is still missing",
        direction: "lower",
        candidateResultPacketPaths: [packetA, missingPacket],
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(
      result.details.candidateWaveReview.recommendation.posture,
      "planned_lanes_incomplete",
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, null);
    assert.deepEqual(result.details.candidateWaveReview.recommendation.exactNextCalls, []);
    assert.equal(result.details.candidateWaveReview.recommendation.ownerDecisionForm, null);
    assert.equal(
      result.details.candidateWaveReview.management.posture,
      "waiting_for_planned_lanes",
    );
    assert.equal(result.details.candidateWaveReview.management.completedLaneCount, 1);
    assert.equal(result.details.candidateWaveReview.management.expectedLaneCount, 2);
    assert.deepEqual(
      result.details.candidateWaveReview.management.laneStates.map((lane) => lane.state),
      ["measured_exported_selectable", "packet_missing"],
    );
    const candidate02 = result.details.candidateWaveReview.lanes.find(
      (lane) => lane.laneId === "candidate-02",
    );
    assert.equal(candidate02.status, "missing_packet");
    assert.equal(candidate02.selectable, false);
    assert.equal(candidate02.sourcePacketPath, missingPacket);
    assert.equal(
      result.details.candidateWaveReview.level2CandidateBinding.metric.status,
      "blocked",
    );
    assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.missingLaneIds, [
      "candidate-02",
    ]);
    assert.equal(
      result.details.candidateWaveReview.reliabilityRecovery.posture,
      "missing_or_stalled_lane_recovery_required",
    );
    assert.deepEqual(
      result.details.candidateWaveReview.reliabilityRecovery.missingOrStalledLaneIds,
      ["candidate-02"],
    );
    const missingRecovery =
      result.details.candidateWaveReview.reliabilityRecovery.laneRecovery.find(
        (lane) => lane.laneId === "candidate-02",
      );
    assert.equal(missingRecovery.kind, "missing_or_stalled_packet");
    assert.match(missingRecovery.guidance, /missing\/stalled\/late lane/);
    assert.match(missingRecovery.guidance, /replan without this lane/);
    assert.match(missingRecovery.exactNextCalls.join("\n"), /candidate_result_export/);
    assert.match(missingRecovery.exactNextCalls.join("\n"), /review_candidate_wave/);
    assert.match(result.details.candidateWaveReview.recommendation.reason, /candidate-02/);
    assert.match(result.content[0].text, /Recommendation: planned_lanes_incomplete/);
    assert.match(result.content[0].text, /waiting_for_planned_lanes/);
    assert.match(result.content[0].text, /level2_candidate_binding_blockers: 1/);
    assert.match(result.content[0].text, /missing lanes: candidate-02/);
    assert.match(result.content[0].text, /missing_packet guidance: verify\/export/);
    assert.match(result.content[0].text, /still running\/failed/);
    assert.match(result.content[0].text, /Wait for every explicit planned lane/);
  });
});

test("autoresearch_live_supervision review_candidate_wave fails closed on duplicate level-2 lane binding", async () => {
  const cwd = "/tmp/candidate-wave-duplicate-binding";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-review-candidate-wave-duplicate-binding",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "detect duplicate candidate binding lanes",
      direction: "lower",
      candidateResults: [
        {
          laneId: "candidate-duplicate",
          metric: 1,
          status: "candidate_review_ready",
          checksStatus: "pass",
          candidateSource: "candidate_peer_spawn",
          candidatePeerRunId: "candidatepeer-duplicate-a",
        },
        {
          laneId: "candidate-duplicate",
          metric: 2,
          status: "candidate_review_ready",
          checksStatus: "pass",
          candidateSource: "candidate_peer_spawn",
          candidatePeerRunId: "candidatepeer-duplicate-b",
        },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.candidateWaveReview.level2CandidateBinding.metric.status, "blocked");
  assert.deepEqual(result.details.candidateWaveReview.level2CandidateBinding.duplicateLaneIds, [
    "candidate-duplicate",
  ]);
  assert.match(result.content[0].text, /duplicate lanes: candidate-duplicate/);
  assert.match(result.content[0].text, /blocked_duplicate_lane/);
});

test("autoresearch_live_supervision review_candidate_wave rejects invalid empirical/check postures", async () => {
  const cwd = "/tmp/candidate-wave-invalid-postures";
  const runner = new AutoresearchLiveSupervisionRunner();
  const tool = registerAutoresearchLiveTool(runner);

  const result = await tool.execute(
    "tc-review-candidate-wave-invalid-postures",
    {
      action: "review_candidate_wave",
      taskId: 2674,
      cwd,
      objective: "reject invalid candidate-wave postures",
      direction: "lower",
      candidateResults: [
        {
          laneId: "measurement-invalid",
          metric: 1,
          status: "measurement_invalid",
          checksStatus: "pass",
        },
        { laneId: "not-ok", metric: 2, status: "candidate_improvement", checksStatus: "not ok" },
        { laneId: "neutral", metric: 3, status: "candidate_neutral", checksStatus: "pass" },
        { laneId: "unknown", metric: 4, status: "mystery_status", checksStatus: "pass" },
      ],
    },
    undefined,
    undefined,
    createToolContext(cwd),
  );

  assert.equal(result.details.ok, true);
  assert.equal(
    result.details.candidateWaveReview.recommendation.posture,
    "no_selectable_candidate",
  );
  assert.equal(result.details.candidateWaveReview.recommendation.ownerDecisionForm, null);
  assert.deepEqual(
    result.details.candidateWaveReview.lanes.map((lane) => [lane.laneId, lane.selectable]),
    [
      ["measurement-invalid", false],
      ["not-ok", false],
      ["neutral", false],
      ["unknown", false],
    ],
  );
});

test("autoresearch_live_supervision review_candidate_wave discovers default candidate-wave packets", async () => {
  await withTempDir(async (cwd) => {
    const packetDir = path.join(cwd, ".autoresearch", "candidate-wave");
    mkdirSync(packetDir, { recursive: true });
    const packetPath = path.join(packetDir, "candidate-01.candidate-result.json");
    writeFileSync(
      packetPath,
      JSON.stringify({
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd,
        campaign: "candidate-wave",
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: path.join(cwd, ".worktrees", "candidate-01"),
          branch: "candidate/discovered",
          baseRef: "HEAD",
          diffSummary: "discovered candidate",
          filesChanged: ["src/discovered.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 8,
          description: "Measure discovered candidate",
          timestamp: 1,
          checks: "pass",
          experiment: {
            hypothesisId: "candidate-01",
            hypothesis: "Default discovery candidate from packet",
          },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "discovered candidate improved",
        closeout: { status: { confidence: 2.2 } },
        adapterBoundary: "packet boundary",
      }),
    );

    const runner = new AutoresearchLiveSupervisionRunner();
    const tool = registerAutoresearchLiveTool(runner);
    const result = await tool.execute(
      "tc-review-candidate-wave-default-discovery",
      {
        action: "review_candidate_wave",
        taskId: 2674,
        cwd,
        objective: "choose from default candidate-result exports",
        direction: "lower",
      },
      undefined,
      undefined,
      createToolContext(cwd),
    );

    assert.equal(result.details.ok, true);
    assert.equal(result.details.candidateWaveReview.packetDiscovery.mode, "default");
    assert.deepEqual(
      result.details.candidateWaveReview.packetDiscovery.candidateResultPacketPaths,
      [".autoresearch/candidate-wave/candidate-01.candidate-result.json"],
    );
    assert.equal(result.details.candidateWaveReview.recommendation.laneId, "candidate-01");
    assert.match(result.content[0].text, /Packet discovery: default/);
    assert.match(result.content[0].text, /candidate-01\.candidate-result\.json/);
  });
});
