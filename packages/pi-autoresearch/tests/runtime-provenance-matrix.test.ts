import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAutoresearchAdapterPacket } from "../src/core/runtime-adapter.ts";
import { buildAutoresearchSegmentCloseout } from "../src/core/runtime-closeout.ts";
import { buildImplementationCoverage } from "../src/core/runtime-dashboard-coverage.ts";
import { exportAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-export.ts";
import { buildResearchObservatoryModel } from "../src/core/runtime-dashboard-model.ts";
import { buildPerformanceScopes } from "../src/core/runtime-dashboard-performance-model.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../src/core/runtime-matrix.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import { withDashboardDir, writeDashboardSource } from "./runtime-dashboard-fixtures.ts";
import { provenanceFixture } from "./runtime-provenance-fixtures.ts";

for (const key of [
  "taskId",
  "objective",
  "cellId",
  "laneId",
  "hypothesis",
  "implementationId",
] as const)
  test(`new matrix provenance rejects foreign ${key} independently without blessing history`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const packet = structuredClone(f.packet);
      const run = packet.candidateRun!;
      assert.ok(run.provenance?.matrix);
      Object.assign(run.provenance.matrix, { [key]: key === "taskId" ? 5622 : "foreign" });
      packet.closeout.runs[packet.closeout.runs.length - 1] = run;
      writeDashboardSource(cwd, f.lane.candidateResultPacketPath, packet);
      const m = discover(cwd);
      assert.equal(m.observedMeasurementCount, 0);
      assert.ok(m.cells[0].lanes[0].attempts.length === 3);
      assert.ok(m.cells[0].lanes[0].attempts.every((a) => !a.validMeasurement));
    }));

test("new contract missing provenance cannot downgrade to legacy; matching latest run cannot bless unknown history", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const packet = structuredClone(f.packet);
    delete packet.closeout.runs[0].provenance;
    writeDashboardSource(cwd, f.lane.candidateResultPacketPath, packet);
    const m = discover(cwd);
    assert.deepEqual(
      m.cells[0].lanes[0].attempts.map((a) => a.packetBinding),
      ["quarantined", "matched", "matched"],
    );
    assert.equal(m.observedMeasurementCount, 2);
    assert.equal(m.comparisonGroups[0].attempts.length, 2);
  }));

test("fully bound new evidence exports nested three implementation lanes by nine workload rows, not27patches", () =>
  withDashboardDir((cwd) => {
    provenanceFixture(cwd);
    const exported = exportAutoresearchDashboardHtml({ cwd });
    const m = exported.matrixSummary!;
    assert.equal(m.campaignCount, 1);
    assert.equal(m.cellCount, 27);
    assert.equal(m.observedMeasurementCount, 3);
    assert.equal(m.comparisonGroups.length, 1);
    const scopes = buildPerformanceScopes(
      buildResearchObservatoryModel(exported.status, buildAutoresearchSegmentCloseout(cwd), m),
    );
    const comparable = scopes.find((s) => s.comparable);
    assert.ok(
      comparable,
      "A single report mirrored in the runtime view must not invalidate its matrix group.",
    );
    assert.equal(comparable.rows.filter((r) => r.measurable).length, 3);
    const implementations = buildImplementationCoverage(m.campaigns[0]);
    assert.equal(implementations.length, 3);
    assert.deepEqual(
      implementations.map((i) => i.rows.length),
      [9, 9, 9],
    );
    const html = readFileSync(exported.path, "utf8");
    assert.match(html, /id="workload-coverage"/);
    assert.equal((html.match(/data-implementation=/g) ?? []).length, 3);
    assert.equal((html.match(/data-workload-row/g) ?? []).length, 27);
    assert.match(html, /No data/);
    assert.match(html, /inconclusive/i);
    assert.match(html, /Admission and launch unverified/);
    assert.doesNotMatch(html, /configured default never used/);
    assert.match(html, /printf/);
  }));

test("planned scenario and default commands never become actual protocol identity", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const good = projectCandidatePacket(f.packet, "fixture", "1k/flat").attempts.at(-1)!;
    assert.ok(good.comparisonKey);
    for (const field of ["provenance", "execution", "benchmarkCommand", "checksCommand"] as const) {
      const packet = structuredClone(f.packet);
      delete packet.candidateRun![field];
      packet.closeout.runs[packet.closeout.runs.length - 1] = packet.candidateRun!;
      const attempt = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1)!;
      assert.equal(attempt.comparisonKey, null, field);
    }
    const changed = structuredClone(f.packet);
    changed.candidateRun!.provenance!.measurement!.scenario = "10k/nested8";
    changed.closeout.runs[changed.closeout.runs.length - 1] = changed.candidateRun!;
    const attempt = projectCandidatePacket(changed, "fixture", "1k/flat").attempts.at(-1)!;
    assert.equal(attempt.validMeasurement, false);
    assert.ok(attempt.issues.some((s) => s.includes("Measured scenario")));
  }));

test("changed evaluator/subject/workload pin or command separates groups; identical labels are insufficient", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const original = projectCandidatePacket(f.packet, "fixture", "1k/flat").attempts.at(
      -1,
    )!.comparisonKey;
    for (const field of ["evaluatorRevision", "subjectRevision", "workloadRevision"] as const) {
      const packet = structuredClone(f.packet);
      packet.candidateRun!.provenance!.measurement![field] = `sha256:${"b".repeat(64)}`;
      packet.closeout.runs[packet.closeout.runs.length - 1] = packet.candidateRun!;
      assert.notEqual(
        projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1)!.comparisonKey,
        original,
      );
    }
  }));

test("malformed/forged execution, failed/censored/partial/noisy records remain unscoreable or explicitly uncertain", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    for (const state of ["skipped", "failed"] as const) {
      const packet = structuredClone(f.packet);
      packet.candidateRun!.execution!.checks.state = state;
      packet.closeout.runs[packet.closeout.runs.length - 1] = packet.candidateRun!;
      const a = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1)!;
      assert.equal(a.validMeasurement, false);
      assert.equal(a.comparisonKey, null);
    }
    const packet = structuredClone(f.packet);
    Object.assign(packet.candidateRun!, {
      status: "resource_censored",
      empiricalDecisionClass: "resource_censored",
      metric: 0,
    });
    packet.closeout.runs[packet.closeout.runs.length - 1] = packet.candidateRun!;
    const a = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1)!;
    assert.equal(a.outcome, "resource_censored");
    assert.equal(a.validMeasurement, false);
    Object.assign(packet.candidateRun!, { provenance: { matrix: null } });
    assert.equal(validateAutoresearchAdapterPacket(packet).valid, false);
  }));
