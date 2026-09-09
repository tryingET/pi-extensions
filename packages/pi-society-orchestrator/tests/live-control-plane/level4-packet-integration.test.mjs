import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("Given a controller-asserted terminal cursor, When resumed, Then it never reoffers the final review", async () => {
  await withTempDir(async (cwd) => {
    const { input } = fixture(cwd);
    const initial = run(input);
    const end = initial.sourceLevel3Executor.totalActionCount;
    run({ ...input, completedActionCount: end - 1 });
    const terminal = run({ ...input, completedActionCount: end });
    assert.equal(terminal.posture, "complete_review_ready");
    const resumed = run(input);
    assert.equal(resumed.completedActionCount, end);
    assert.equal(resumed.sourceLevel3Executor.selectedAction, null);
    assert.deepEqual(resumed.nextLegalActions, []);
  });
});

test("Given two cells and only the first cell measured, When its review is selected, Then it is emitted before the second cell measurements", async () => {
  await withTempDir(async (cwd) => {
    const { input, rows } = fixture(cwd, 1, ["first", "second"]);
    rmSync(path.join(cwd, rows[1].packetPath));
    const initial = run(input);
    const actions = initial.sourceLevel3Executor.runnerNextLegalActions;
    const index = actions.findIndex((call) => call.includes('"review_candidate_wave"'));
    assert.ok(index > 0);
    const review = run({ ...input, completedActionCount: index });
    assert.deepEqual(review.nextLegalActions, [actions[index]]);
    assert.equal(
      review.promptRunnerBundle.candidateCloseoutPacket.comparison.status,
      "pending_candidate_result_packets",
    );
    assert.equal(
      review.promptRunnerBundle.candidateCloseoutPacket.postFaninPromotionHandoff.ownerReviewCall,
      null,
    );
    const next = run({ ...input, completedActionCount: index + 1 });
    assert.match(next.nextLegalActions[0], /^autoresearch_candidate_bind\(/);
  });
});

import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  writeAutoresearchCandidateResultPacket,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import { runAutoresearchLevel4CampaignRunner as run } from "../../src/runtime/autoresearch-level4-runner.ts";
import { AutoresearchLiveSupervisionRunner } from "../../src/runtime/autoresearch-supervisor-runner.ts";
import { createToolContext, registerAutoresearchLiveTool, withTempDir } from "./helpers.mjs";

function fixture(cwd, count = 1, scenarios = ["safety"]) {
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { check: "true" } }));
  const input = {
    taskId: 5582,
    cwd,
    objective: "verify measured packet fan-in",
    metricName: "blockers",
    direction: "lower",
    metricThreshold: 0,
    scenarios,
    hypotheses: ["verified measurements"],
    candidateCountPerCell: count,
    parentPeerTarget: "controller",
  };
  const initial = run(input);
  const rows = initial.promptRunnerBundle.candidateCloseoutPacket.packetInventory.rows;
  const bindings = rows.map((row) => ({
    laneId: `${row.cellId}-${row.laneId}`,
    candidateWorktree: path.join(cwd, "candidates", `${row.cellId}-${row.laneId}`),
    candidateBranch: `candidate/${row.cellId}-${row.laneId}`,
    candidateBaseRef: "abc1234",
    candidateDiffSummary: "controller verified diff",
    candidateFilesChanged: ["src/a.ts"],
  }));
  for (const [i, row] of rows.entries()) {
    const binding = bindings[i];
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: `matrix-${binding.laneId}`,
        metricName: "blockers",
        direction: "lower",
        createdAt: 1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({ status: "baseline", metric: 10, timestamp: 2, description: "baseline" }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "discard",
        metric: 12,
        timestamp: 3,
        description: "measured regression",
        runKind: "ordinary",
        empiricalDecisionClass: "candidate_regression",
        experiment: {
          hypothesisId: binding.laneId,
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: binding.candidateWorktree,
            branch: binding.candidateBranch,
            baseRef: binding.candidateBaseRef,
            diffSummary: binding.candidateDiffSummary,
            filesChanged: binding.candidateFilesChanged,
          },
        },
      }),
    );
    writeAutoresearchCandidateResultPacket({ cwd, outPath: row.packetPath });
  }
  const runner = initial.sourceLevel3Executor.level3Runner;
  return {
    input: {
      ...input,
      candidateBindings: bindings,
      checkpointConfirmation: runner.checkpointGate?.requiredToken ?? runner.requiredToken,
    },
    rows,
  };
}

for (const count of [1, 2]) {
  test(`Given ${count} owner-exported regressions and exact lineage, When checkpointed, Then measured inventory is verified but not automatically selected`, async () => {
    await withTempDir(async (cwd) => {
      const { input } = fixture(cwd, count);
      const result = run(input);
      const packet = result.promptRunnerBundle.candidateCloseoutPacket;
      assert.equal(packet.packetInventory.controllerVerifiedMeasuredPacketCount, count);
      assert.equal(packet.comparison.status, "ready_for_review_packet");
      assert.equal(packet.postFaninPromotionHandoff.posture, "ready_for_owner_review");
      assert.equal(packet.postFaninPromotionHandoff.finalizerTokenRequestCall, null);
      assert.equal(
        result.newReceipts.some((row) => row.disposition === "executed_by_level4"),
        false,
      );
      assert.ok(
        packet.packetInventory.rows.every(
          (row) => row.verificationIssues.length === 0 && !row.selected,
        ),
      );
    });
  });
}

for (const corruption of [
  "garbage",
  "wrong-lineage",
  "missing",
  "duplicate-binding",
  "no-binding",
  "wrong-lane",
  "reused-packet",
]) {
  test(`Given two lanes with ${corruption}, When the registered tool verifies fan-in, Then review/finalizer readiness and success are withheld`, async () => {
    await withTempDir(async (cwd) => {
      const { input, rows } = fixture(cwd, 2);
      const file = path.join(cwd, rows[0].packetPath);
      if (corruption === "garbage") writeFileSync(file, "{}");
      if (corruption === "missing") rmSync(file);
      if (corruption === "wrong-lineage" || corruption === "wrong-lane") {
        const packet = JSON.parse(readFileSync(file, "utf8"));
        if (corruption === "wrong-lineage") packet.candidate.branch = "foreign";
        else packet.candidateRun.experiment.hypothesisId = "foreign";
        writeFileSync(file, JSON.stringify(packet));
      }
      if (corruption === "reused-packet")
        writeFileSync(file, readFileSync(path.join(cwd, rows[1].packetPath)));
      if (corruption === "duplicate-binding")
        input.candidateBindings.push(input.candidateBindings[0]);
      if (corruption === "no-binding") input.candidateBindings = [];
      const tool = registerAutoresearchLiveTool(new AutoresearchLiveSupervisionRunner());
      const response = await tool.execute(
        "ak5582-packet-integration",
        {
          ...input,
          action: "level4_autoresearch_campaign_runner",
          level3CandidateBindings: input.candidateBindings,
        },
        undefined,
        undefined,
        createToolContext(cwd),
      );
      assert.equal(response.details.ok, false);
      const result = response.details.level4CampaignRunner;
      const packet = result.promptRunnerBundle.candidateCloseoutPacket;
      assert.equal(packet.packetInventory.rows[0].controllerVerified, false);
      assert.equal(packet.packetInventory.rows[0].measuredPacket, false);
      assert.ok(packet.packetInventory.rows[0].verificationIssues.length > 0);
      assert.equal(packet.comparison.status, "pending_candidate_result_packets");
      assert.equal(packet.comparison.aggregateReviewCall, null);
      assert.equal(packet.postFaninPromotionHandoff.ownerReviewCall, null);
      assert.equal(packet.postFaninPromotionHandoff.finalizerTokenRequestCall, null);
      assert.ok(packet.metric.value > 0);
      assert.equal(
        result.nextLegalActions.some((call) =>
          /review_candidate_wave|review_matrix_campaign/.test(call),
        ),
        false,
      );
    });
  });
}

test("Given valid packets but no accepted checkpoint, When inspected, Then owner review remains gated", async () => {
  await withTempDir(async (cwd) => {
    const { input } = fixture(cwd);
    const result = run({ ...input, checkpointConfirmation: undefined });
    assert.equal(
      result.promptRunnerBundle.candidateCloseoutPacket.comparison.status,
      "pending_candidate_result_packets",
    );
    assert.equal(
      result.promptRunnerBundle.candidateCloseoutPacket.postFaninPromotionHandoff.ownerReviewCall,
      null,
    );
  });
});
