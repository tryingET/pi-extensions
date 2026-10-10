import assert from "node:assert/strict";
import test from "node:test";
import { validateAutoresearchAdapterPacket } from "../src/core/runtime-adapter.ts";
import {
  buildImplementationCoverage,
  renderImplementationCoverage,
} from "../src/core/runtime-dashboard-coverage.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../src/core/runtime-matrix.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import { parseRunExecution } from "../src/core/runtime-provenance.ts";
import { withDashboardDir, writeDashboardSource } from "./runtime-dashboard-fixtures.ts";
import { provenanceFixture } from "./runtime-provenance-fixtures.ts";

for (const state of ["disabled", "skipped"] as const)
  test(`contradictory ${state} checks cannot hide invocation failure or abort`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const packet = structuredClone(f.packet);
      const run = packet.candidateRun;
      assert.ok(run?.execution);
      run.checksCommand = null;
      run.checks = "not run";
      run.execution.checks = { state, exitCode: 1, timedOut: true, aborted: true };
      packet.closeout.runs[packet.closeout.runs.length - 1] = run;
      assert.throws(() => parseRunExecution(run.execution));
      assert.equal(validateAutoresearchAdapterPacket(packet).valid, false);
      const a = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1);
      assert.ok(a);
      assert.equal(a.validMeasurement, false);
      assert.equal(a.comparisonKey, null);
    }));

for (const location of ["foreign", "controller", "relative"] as const)
  test(`actual execution ${location} cwd cannot become valid candidate-lane coverage`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const packet = structuredClone(f.packet);
      const run = packet.candidateRun;
      assert.ok(run?.execution && run.experiment?.candidate && packet.candidate);
      if (location === "controller") {
        packet.candidate.worktreePath = `${cwd}/candidate`;
        run.experiment.candidate.worktreePath = packet.candidate.worktreePath;
      } else run.execution.cwd = location === "relative" ? "." : `${cwd}/foreign`;
      packet.closeout.runs[packet.closeout.runs.length - 1] = run;
      writeDashboardSource(cwd, f.lane.candidateResultPacketPath, packet);
      const last = discover(cwd).cells[0].lanes[0].attempts.at(-1);
      assert.ok(last);
      assert.equal(last.validMeasurement, false);
      assert.equal(last.comparisonKey, null);
      assert.ok(last.issues.some((i) => /execution|provenance/i.test(i)));
    }));

test("relative candidate binding resolves against exact receipt cwd rather than being rejected or redirected", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const packet = structuredClone(f.packet);
    const run = packet.candidateRun;
    assert.ok(run?.experiment?.candidate && packet.candidate);
    packet.candidate.worktreePath = ".";
    run.experiment.candidate.worktreePath = ".";
    packet.closeout.runs[packet.closeout.runs.length - 1] = run;
    const a = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1);
    assert.ok(a?.validMeasurement && a.comparisonKey);
  }));

test("conflicting implementation-ID definitions are one explicit conflict, not extra implementations or coverage", () =>
  withDashboardDir((cwd) => {
    provenanceFixture(cwd);
    const campaign = discover(cwd).campaigns[0];
    for (const cell of campaign.cells)
      for (const lane of cell.lanes) {
        const context = lane.segmentIdentity?.matrixContext;
        if (context?.implementationId === "hypothesis-02")
          context.implementationId = "hypothesis-01";
      }
    const groups = buildImplementationCoverage(campaign);
    assert.equal(groups.length, 2);
    const conflict = groups.find((g) => g.id === "hypothesis-01");
    assert.ok(conflict?.conflict);
    const html = renderImplementationCoverage([campaign]);
    assert.match(html, /Conflicting implementation declarations/);
    assert.match(html, /coverage withheld/);
    campaign.cells.reverse();
    const reversed = buildImplementationCoverage(campaign).find((g) => g.id === "hypothesis-01");
    assert.deepEqual(reversed?.hypotheses, conflict.hypotheses);
  }));
