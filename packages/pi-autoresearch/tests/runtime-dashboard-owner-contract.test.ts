import assert from "node:assert/strict";
import test from "node:test";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  loadReceiptLog,
} from "../src/core/runtime.ts";
import { validateAutoresearchAdapterPacket } from "../src/core/runtime-adapter.ts";
import { buildAutoresearchCandidateResultPacket } from "../src/core/runtime-candidate-result.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../src/core/runtime-matrix.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import {
  getArrayField as arr,
  getRecordField as rec,
  getStringField as str,
} from "../src/core/runtime-matrix-fields.ts";
import { OBJECTIVE, withDashboardDir, writeDashboardSource } from "./runtime-dashboard-fixtures.ts";

// Actual read-only owner producers. No launch, measurement, checkpoint application or journal writer.
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
function requiredString(value: unknown, key: string): string {
  const s = str(value, key);
  assert.ok(s);
  return s;
}
function fixture(cwd: string) {
  const input = {
    taskId: 5621,
    cwd,
    objective: OBJECTIVE,
    scenarios: ["nested rename"],
    hypotheses: ["batch indexing"],
    candidateCountPerCell: 1,
    parentPeerTarget: "test-controller",
    metricName: "total_ms",
    direction: "lower",
  };
  const contract = owner.buildAutoresearchMatrixCampaignRunnerContract(input);
  const checkpoint = owner.checkpointAutoresearchMatrixCampaignRunner(input);
  const lane = arr(contract, "lanes")[0];
  assert.ok(lane);
  const call = arr(lane, "measurementPlan").find(
    (v) => typeof v === "string" && v.startsWith("autoresearch_runtime_run("),
  );
  assert.equal(typeof call, "string");
  const payload = JSON.parse(String(call).slice("autoresearch_runtime_run(".length, -1)) as Record<
    string,
    unknown
  >;
  const packetPath = requiredString(lane, "candidateResultPacketPath");
  const name = requiredString(payload, "name");
  appendReceipt(
    cwd,
    createConfigReceipt({
      name,
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "node configured.mjs",
      checksCommand: "node checks.mjs",
      createdAt: 1,
    }),
  );
  const candidate = {
    source: "candidate_peer_spawn" as const,
    worktreePath: `${cwd}/candidate`,
    branch: "candidate-01",
    baseRef: "a".repeat(40),
    diffSummary: "Index only",
    filesChanged: ["index.ts"],
  };
  const experiment = {
    hypothesisId: requiredString(payload, "hypothesisId"),
    hypothesis: requiredString(payload, "hypothesis"),
    candidate,
  };
  const appendSuccess = () =>
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 80,
        timestamp: 3,
        iteration: 3,
        description: "latest successful lane attempt",
        empiricalDecisionClass: "candidate_improvement",
        checksCommand: "node actual-checks-override.mjs",
        checksPassed: true,
        benchmarkCommand: "node actual-benchmark-override.mjs",
        experiment,
      }),
    );
  return {
    contract,
    checkpoint,
    input,
    lane,
    payload,
    packetPath,
    name,
    experiment,
    appendSuccess,
  };
}

test("owner segment name, not campaign objective, binds its exact lane measurement", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    f.appendSuccess();
    const packet = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(packet.campaign, "matrix-cell-01-01-candidate-01");
    assert.notEqual(packet.campaign, OBJECTIVE);
    assert.equal(validateAutoresearchAdapterPacket(packet).valid, true);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", f.contract);
    writeDashboardSource(cwd, f.packetPath, packet);
    const model = discover(cwd);
    assert.equal(
      model.observedMeasurementCount,
      1,
      model.exportVisibilityBlockers.blockers.join("\n"),
    );
    assert.equal(model.coverageGapLaneCount, 0);
  }));

test("all owner closeout history survives: baseline and different-binding failure are quarantined, not dropped", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        timestamp: 1,
        description: "original baseline",
        checksCommand: "node checks.mjs",
        checksPassed: true,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "checks_failed",
        metric: 200,
        timestamp: 2,
        description: "earlier different-candidate correctness failure",
        checksCommand: "node checks.mjs",
        checksPassed: false,
        experiment: {
          ...f.experiment,
          candidate: {
            ...f.experiment.candidate,
            branch: "earlier-candidate",
            worktreePath: `${cwd}/earlier`,
          },
        },
      }),
    );
    f.appendSuccess();
    const packet = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(validateAutoresearchAdapterPacket(packet).valid, true);
    assert.equal(packet.closeout.runs.length, 3);
    const projection = projectCandidatePacket(packet, f.packetPath, "nested rename");
    assert.equal(projection.attempts.length, 3);
    assert.deepEqual(
      projection.attempts.map((a) => a.outcome),
      ["baseline_reference", "correctness_failure", "improvement"],
    );
    assert.ok(
      projection.attempts
        .slice(0, 2)
        .every(
          (a) => !a.validMeasurement && a.comparisonWithheld.some((s) => s.includes("Quarantined")),
        ),
    );
    assert.equal(projection.attempts[2].validMeasurement, true);
    assert.deepEqual(
      projection.attempts.map((a) => a.raw),
      packet.closeout.runs,
    );
  }));

test("real owner closeout drops per-run overrides: configured commands cannot establish evaluator provenance", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    f.appendSuccess();
    const packet = buildAutoresearchCandidateResultPacket(cwd);
    assert.equal(packet.closeout.status.currentSegment.benchmarkCommand, "node configured.mjs");
    const latest = loadReceiptLog(cwd).entries.at(-1);
    assert.ok(latest?.type === "run");
    assert.equal(latest.benchmarkCommand, "node actual-benchmark-override.mjs");
    assert.equal(latest.checksCommand, "node actual-checks-override.mjs");
    assert.equal(Object.hasOwn(packet.candidateRun ?? {}, "benchmarkCommand"), false);
    assert.equal(Object.hasOwn(packet.candidateRun ?? {}, "checksCommand"), false);
    const attempt = projectCandidatePacket(packet, f.packetPath, "nested rename").attempts[0];
    assert.equal(attempt.validMeasurement, true);
    assert.equal(attempt.identity.evaluator, null);
    assert.equal(attempt.comparisonKey, null);
    assert.ok(
      attempt.comparisonWithheld.some((s) => s.includes("per-run") && s.includes("override")),
    );
  }));

test("actual cockpit display strings are not paths; only structured inventory supplies lane paths", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    const cockpit = rec(f.checkpoint, "cockpit");
    assert.match(
      String(arr(arr(cockpit, "cellRows")[0], "packetInventory")[0]),
      /^candidate-01: .*\[locked_until_checkpoint\]$/,
    );
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/checkpoint.json", f.checkpoint);
    const model = discover(cwd);
    assert.equal(model.candidateLaneCount, 1);
    assert.equal(model.coverageGapLaneCount, 1);
    assert.deepEqual(model.cells[0].packetInventory, [f.packetPath]);
    assert.ok(
      !model.exportVisibilityBlockers.blockers.some((s) => s.includes("outside bounded discovery")),
    );
  }));

test("owner checkpoint binds exact run identity; wrong lane or inconsistent config labels never match", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    f.appendSuccess();
    const accepted = owner.checkpointAutoresearchMatrixCampaignRunner({
      ...f.input,
      checkpointConfirmation: requiredString(rec(f.contract, "checkpointGate"), "requiredToken"),
    });
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/checkpoint.json", accepted);
    const packet = buildAutoresearchCandidateResultPacket(cwd);
    writeDashboardSource(cwd, f.packetPath, packet);
    const good = discover(cwd);
    assert.equal(
      good.observedMeasurementCount,
      1,
      good.exportVisibilityBlockers.blockers.join("\n"),
    );
    assert.equal(good.comparisonGroups.length, 0);
    assert.deepEqual(good.cells[0].packetInventory, [f.packetPath]);
    for (const mutation of ["name", "hypothesis", "config", "source"] as const) {
      const changed = structuredClone(packet);
      if (mutation === "name") {
        changed.campaign = "matrix-cell-01-01-candidate-02";
        changed.closeout.campaign = changed.campaign;
        // Deliberately disagree with the retained config; a coherent shared label is now valid.
      }
      if (mutation === "hypothesis") {
        assert.ok(changed.candidateRun?.experiment);
        changed.candidateRun.experiment.hypothesisId = "cell-01-01-candidate-02";
      }
      if (mutation === "config") changed.closeout.status.currentSegment.name = "other-config";
      if (mutation === "source") {
        assert.ok(changed.candidate);
        changed.candidate.source = "manual";
      }
      writeDashboardSource(cwd, f.packetPath, changed);
      const bad = discover(cwd);
      assert.equal(bad.observedMeasurementCount, 0, mutation);
      assert.equal(bad.coverageGapLaneCount, 1, mutation);
    }
  }));

test("identical real owner lane IDs/path claims across tasks remain ambiguous, never merged", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    f.appendSuccess();
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", f.contract);
    writeDashboardSource(
      cwd,
      ".autoresearch/campaigns/5622/contract.json",
      owner.buildAutoresearchMatrixCampaignRunnerContract({ ...f.input, taskId: 5622 }),
    );
    writeDashboardSource(cwd, f.packetPath, buildAutoresearchCandidateResultPacket(cwd));
    const model = discover(cwd);
    assert.equal(model.campaignCount, 2);
    assert.equal(model.observedMeasurementCount, 0);
    assert.ok(model.exportVisibilityBlockers.blockers.some((s) => s.includes("multiple campaign")));
  }));

test("owner-produced baseline and cross-candidate failures remain available through discovery, not just packet parsing", () =>
  withDashboardDir((cwd) => {
    const f = fixture(cwd);
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        timestamp: 1,
        description: "unbound baseline",
        checksCommand: "node checks.mjs",
        checksPassed: true,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "checks_failed",
        metric: 200,
        timestamp: 2,
        description: "cross-candidate failure",
        checksCommand: "node checks.mjs",
        checksPassed: false,
        experiment: { ...f.experiment, candidate: { ...f.experiment.candidate, branch: "other" } },
      }),
    );
    f.appendSuccess();
    const packet = buildAutoresearchCandidateResultPacket(cwd);
    writeDashboardSource(cwd, ".autoresearch/campaigns/5621/contract.json", f.contract);
    writeDashboardSource(cwd, f.packetPath, packet);
    const model = discover(cwd);
    const attempts = model.cells[0].lanes[0].attempts;
    assert.equal(attempts.length, packet.closeout.runs.length);
    assert.deepEqual(
      attempts.map((a) => a.packetBinding),
      ["quarantined", "quarantined", "matched"],
    );
    assert.equal(model.observedMeasurementCount, 1);
    assert.equal(model.coverageGapLaneCount, 0);
    assert.equal(model.comparisonGroups.length, 0);
  }));
