import assert from "node:assert/strict";
import test from "node:test";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  loadReceiptLog,
} from "../src/core/runtime.ts";
import { buildAutoresearchCandidateResultPacket } from "../src/core/runtime-candidate-result.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../src/core/runtime-matrix.ts";
import {
  getArrayField as arr,
  getRecordField as rec,
  getStringField as str,
} from "../src/core/runtime-matrix-fields.ts";
import { OBJECTIVE, withDashboardDir, writeDashboardSource } from "./runtime-dashboard-fixtures.ts";

const ownerUrl = new URL(
  "../../pi-society-orchestrator/src/runtime/autoresearch-matrix-campaign.ts",
  import.meta.url,
).href;
const owner = (await import(ownerUrl)) as {
  buildAutoresearchMatrixCampaignRunnerContract(
    input: Record<string, unknown>,
  ): Record<string, unknown>;
  checkpointAutoresearchMatrixCampaignRunner(
    input: Record<string, unknown>,
  ): Record<string, unknown>;
};
const request = (cwd: string) => ({
  taskId: 5621,
  cwd,
  objective: OBJECTIVE,
  scenarios: ["nested rename"],
  hypotheses: ["batch indexing"],
  candidateCountPerCell: 2,
  parentPeerTarget: "test-controller",
  metricName: "total_ms",
  direction: "lower",
});
function required(value: unknown, key: string): string {
  const s = str(value, key);
  assert.ok(s);
  return s;
}
function emittedRun(lane: unknown): Record<string, unknown> {
  const call = arr(lane, "measurementPlan").find(
    (v) => typeof v === "string" && v.startsWith("autoresearch_runtime_run("),
  );
  assert.equal(typeof call, "string");
  return JSON.parse(String(call).slice("autoresearch_runtime_run(".length, -1));
}
function appendLane(cwd: string, lane: unknown, iteration: number, hypothesis?: string) {
  const run = emittedRun(lane);
  const id = required(lane, "laneId");
  appendReceipt(
    cwd,
    createRunReceipt({
      status: "candidate",
      metric: 100 - iteration,
      iteration,
      timestamp: iteration + 1,
      description: `Run ${id}`,
      empiricalDecisionClass: "candidate_improvement",
      checksCommand: "node checks.mjs",
      checksPassed: true,
      experiment: {
        hypothesisId: required(run, "hypothesisId"),
        hypothesis: hypothesis ?? required(run, "hypothesis"),
        candidate: {
          source: "candidate_peer_spawn",
          worktreePath: `${cwd}/${id}`,
          branch: id,
          baseRef: "a".repeat(40),
          diffSummary: "index only",
          filesChanged: ["index.ts"],
        },
      },
    }),
  );
  const packet = buildAutoresearchCandidateResultPacket(cwd);
  writeDashboardSource(cwd, required(lane, "candidateResultPacketPath"), packet);
  return packet;
}
function initialize(cwd: string, name: string) {
  appendReceipt(
    cwd,
    createConfigReceipt({
      name,
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      createdAt: 1,
      benchmarkCommand: "node bench.mjs",
      checksCommand: "node checks.mjs",
    }),
  );
}
for (const preconfigured of [false, true])
  test(`owner two-lane packets retain ${preconfigured ? "user-preconfigured" : "lane-01"} config without merging lane evidence`, () =>
    withDashboardDir((cwd) => {
      const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(request(cwd));
      const lanes = arr(contract, "lanes");
      assert.equal(lanes.length, 2);
      const firstName = required(emittedRun(lanes[0]), "name");
      const secondName = required(emittedRun(lanes[1]), "name");
      assert.notEqual(firstName, secondName);
      const retained = preconfigured ? "user's existing runtime segment" : firstName;
      initialize(cwd, retained);
      writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", contract);
      appendLane(cwd, lanes[0], 1);
      const second = appendLane(cwd, lanes[1], 2);
      assert.equal(second.campaign, retained);
      assert.equal(second.closeout.status.currentSegment.name, retained);
      assert.equal(loadReceiptLog(cwd).entries.filter((e) => e.type === "config").length, 1);
      const model = discover(cwd);
      assert.equal(
        model.observedMeasurementCount,
        2,
        model.exportVisibilityBlockers.blockers.join("\n"),
      );
      assert.equal(model.coverageGapLaneCount, 0);
      const lane2 = model.cells[0].lanes.find((l) => l.laneId === "candidate-02");
      assert.ok(lane2);
      assert.deepEqual(
        lane2.attempts.map((a) => a.packetBinding),
        ["quarantined", "matched"],
      );
      assert.equal(lane2.attempts[0].validMeasurement, false);
      assert.equal(lane2.attempts[1].validMeasurement, true);
      assert.match(lane2.attempts[1].verificationReport, /Shared\/preconfigured segment/);
      assert.ok(lane2.attempts[1].verificationReport.includes(retained));
      assert.equal(model.comparisonGroups.length, 0);
    }));

test("same owner lane ID with another declared lane objective is rejected despite retained config", () =>
  withDashboardDir((cwd) => {
    const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(request(cwd));
    const lane = arr(contract, "lanes")[1];
    const foreignContract = owner.buildAutoresearchMatrixCampaignRunnerContract({
      ...request(cwd),
      hypotheses: ["different research objective"],
    });
    const foreignLane = arr(foreignContract, "lanes")[1];
    assert.equal(
      required(emittedRun(lane), "hypothesisId"),
      required(emittedRun(foreignLane), "hypothesisId"),
    );
    assert.notEqual(
      required(emittedRun(lane), "hypothesis"),
      required(emittedRun(foreignLane), "hypothesis"),
    );
    initialize(cwd, required(emittedRun(lane), "name"));
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", contract);
    appendLane(cwd, lane, 1, required(emittedRun(foreignLane), "hypothesis"));
    const model = discover(cwd);
    assert.equal(model.observedMeasurementCount, 0);
    assert.equal(model.coverageGapLaneCount, 2);
  }));

test("inventory-only checkpoint lacks a declared run objective and cannot bind packets", () =>
  withDashboardDir((cwd) => {
    const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(request(cwd));
    const lane = arr(contract, "lanes")[0];
    const checkpoint = owner.checkpointAutoresearchMatrixCampaignRunner(request(cwd));
    assert.equal(rec(checkpoint, "controllerCommandPacket"), null);
    initialize(cwd, required(emittedRun(lane), "name"));
    appendLane(cwd, lane, 1);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/checkpoint.json", checkpoint);
    assert.equal(discover(cwd).observedMeasurementCount, 0);
  }));

test("same candidate and hypothesisId cannot bless earlier history with another hypothesis text", () =>
  withDashboardDir((cwd) => {
    const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(request(cwd));
    const lane = arr(contract, "lanes")[1];
    initialize(cwd, "preconfigured");
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", contract);
    appendLane(cwd, lane, 1, "earlier unrelated objective");
    const packet = appendLane(cwd, lane, 2);
    assert.equal(packet.closeout.runs.length, 2);
    const model = discover(cwd);
    const attempts = model.cells[0].lanes.find((l) => l.laneId === "candidate-02")?.attempts;
    assert.ok(attempts);
    assert.deepEqual(
      attempts.map((a) => a.packetBinding),
      ["quarantined", "matched"],
    );
    assert.equal(model.observedMeasurementCount, 1);
    assert.equal(model.coverageGapLaneCount, 1);
    assert.equal(model.comparisonGroups.length, 0);
  }));

test("different campaign objectives claiming identical owner lane/path remain isolated and ambiguous", () =>
  withDashboardDir((cwd) => {
    const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(request(cwd));
    const other = owner.buildAutoresearchMatrixCampaignRunnerContract({
      ...request(cwd),
      objective: "Another campaign objective",
    });
    const lane = arr(contract, "lanes")[1];
    // Owner's run text includes hypothesis/sample/scenario, not the top-level campaign objective.
    // Never invent a task/objective anchor in that text: simultaneous path claims must fail closed.
    assert.equal(
      required(emittedRun(lane), "hypothesis"),
      required(emittedRun(arr(other, "lanes")[1]), "hypothesis"),
    );
    initialize(cwd, "preconfigured");
    appendLane(cwd, lane, 1);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", contract);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/other.json", other);
    const model = discover(cwd);
    assert.equal(model.campaignCount, 2);
    assert.equal(model.observedMeasurementCount, 0);
    assert.ok(model.exportVisibilityBlockers.blockers.some((s) => s.includes("multiple campaign")));
  }));
