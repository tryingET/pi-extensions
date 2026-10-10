import assert from "node:assert/strict";
import test from "node:test";
import { buildImplementationCoverage } from "../../pi-autoresearch/src/core/runtime-dashboard-coverage.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../../pi-autoresearch/src/core/runtime-matrix.ts";
import {
  level4Envelope,
  level4Path,
  withDashboardDir,
  writeDashboardSource,
} from "../../pi-autoresearch/tests/runtime-dashboard-fixtures.ts";
import {
  provenanceFixture,
  provenanceRequest,
} from "../../pi-autoresearch/tests/runtime-provenance-fixtures.ts";
import { runAutoresearchLevel4CampaignRunner } from "../src/runtime/autoresearch-level4-runner.ts";
import {
  buildAutoresearchMatrixCampaignRunnerContract,
  checkpointAutoresearchMatrixCampaignRunner,
} from "../src/runtime/autoresearch-matrix-campaign.ts";

function visitCalls(value, mutate) {
  if (typeof value === "string" && value.startsWith("autoresearch_runtime_run(")) {
    const payload = JSON.parse(value.slice("autoresearch_runtime_run(".length, -1));
    mutate(payload);
    return `autoresearch_runtime_run(${JSON.stringify(payload)})`;
  }
  if (Array.isArray(value)) return value.map((v) => visitCalls(v, mutate));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visitCalls(v, mutate)]));
  return value;
}

test("actual owner producer binds 3 implementations x 9 workloads; no sibling orchestrator import in autoresearch tests", () =>
  withDashboardDir((cwd) => {
    const request = provenanceRequest(cwd);
    provenanceFixture(cwd, buildAutoresearchMatrixCampaignRunnerContract(request));
    const summary = discover(cwd);
    assert.equal(summary.observedMeasurementCount, 3);
    assert.equal(summary.comparisonGroups.length, 1);
    assert.equal(summary.cellCount, 27);
    assert.deepEqual(
      buildImplementationCoverage(summary.campaigns[0]).map((g) => g.rows.length),
      [9, 9, 9],
    );
  }));

test("unmodified default Level4 observation without measurement calls retains stronger contract declaration", () =>
  withDashboardDir((cwd) => {
    const request = {
      ...provenanceRequest(cwd),
      scenarios: ["1k/flat"],
      hypotheses: ["refresh redundancy"],
    };
    const f = provenanceFixture(cwd, buildAutoresearchMatrixCampaignRunnerContract(request));
    const result = runAutoresearchLevel4CampaignRunner(request);
    writeDashboardSource(
      cwd,
      level4Path(request.objective, request.taskId),
      level4Envelope(cwd, result, request.objective, request.taskId),
    );
    const summary = discover(cwd);
    assert.equal(
      summary.observedMeasurementCount,
      3,
      summary.exportVisibilityBlockers.blockers.join("\n"),
    );
    assert.deepEqual(summary.cells[0].lanes[0].segmentIdentity.matrixContext, f.provenance.matrix);
    assert.equal(summary.campaigns[0].execution, "not_executed_by_orchestrator");
  }));

for (const mode of ["legacy", "foreign_context", "foreign_scenario"]) {
  test(`retained Level4 ${mode} snapshot cannot replace stronger contract identity`, () =>
    withDashboardDir((cwd) => {
      const request = {
        ...provenanceRequest(cwd),
        scenarios: ["1k/flat"],
        hypotheses: ["refresh redundancy"],
      };
      const contract = buildAutoresearchMatrixCampaignRunnerContract(request);
      const f = provenanceFixture(cwd, contract);
      let result = runAutoresearchLevel4CampaignRunner(request);
      result.sourceLevel3Executor.level3Runner = checkpointAutoresearchMatrixCampaignRunner({
        ...request,
        checkpointConfirmation: contract.checkpointGate.requiredToken,
      });
      const observationPath = level4Path(request.objective, request.taskId);
      writeDashboardSource(
        cwd,
        observationPath,
        level4Envelope(cwd, result, request.objective, request.taskId),
      );
      const control = discover(cwd);
      assert.equal(
        control.observedMeasurementCount,
        3,
        control.exportVisibilityBlockers.blockers.join("\n"),
      );
      if (mode === "legacy") {
        result = visitCalls(result, (payload) => {
          delete payload.provenance;
        });
        for (const run of f.packet.closeout.runs) delete run.provenance;
        delete f.packet.candidateRun.provenance;
        writeDashboardSource(cwd, f.lane.candidateResultPacketPath, f.packet);
      } else if (mode === "foreign_context") {
        result = visitCalls(result, (payload) => {
          payload.provenance.matrix.implementationId = "foreign";
        });
      } else {
        const change = (value) => {
          if (!value || typeof value !== "object") return;
          if (value.scenario === "1k/flat") value.scenario = "foreign";
          for (const v of Object.values(value)) change(v);
        };
        change(result);
      }
      writeDashboardSource(
        cwd,
        level4Path(request.objective, request.taskId),
        level4Envelope(cwd, result, request.objective, request.taskId),
      );
      const summary = discover(cwd);
      assert.equal(summary.observedMeasurementCount, 0);
      assert.equal(summary.comparisonGroups.length, 0);
      assert.ok(summary.cells[0].lanes[0].missingMeasurementPaths.length);
    }));
}
