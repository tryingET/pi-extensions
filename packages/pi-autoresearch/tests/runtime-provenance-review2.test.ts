import assert from "node:assert/strict";
import test from "node:test";
import { validateAutoresearchAdapterPacket } from "../src/core/runtime-adapter.ts";
import { buildAutoresearchSegmentCloseout } from "../src/core/runtime-closeout.ts";
import { exportAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-export.ts";
import { buildResearchObservatoryModel } from "../src/core/runtime-dashboard-model.ts";
import { buildPerformanceScopes } from "../src/core/runtime-dashboard-performance-model.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";
import { provenanceFixture } from "./runtime-provenance-fixtures.ts";

test("two runtime reports cannot both be mirrors of one matrix occurrence", () =>
  withDashboardDir((cwd) => {
    provenanceFixture(cwd);
    const exported = exportAutoresearchDashboardHtml({ cwd });
    assert.ok(exported.matrixSummary);
    const model = buildResearchObservatoryModel(
      exported.status,
      buildAutoresearchSegmentCloseout(cwd),
      exported.matrixSummary,
    );
    const original = model.runtimeAttempts[0];
    model.runtimeAttempts.push(structuredClone(original));
    const scopes = buildPerformanceScopes(model);
    assert.ok(scopes.every((s) => !s.comparable));
    const rows = scopes.flatMap((s) => s.rows).filter((r) => r.attempt.id === original.id);
    assert.ok(rows.length >= 3);
    assert.ok(rows.every((r) => r.duplicate && !r.measurable));
  }));

for (const state of ["passed", "failed", "skipped"] as const)
  test(`disabled checks command cannot retain claimed ${state} invocation eligibility`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const packet = structuredClone(f.packet);
      const run = packet.candidateRun;
      assert.ok(run?.execution);
      run.checksCommand = null;
      run.execution.checks.state = state;
      if (state === "failed") run.execution.checks.exitCode = 1;
      if (state === "skipped") run.execution.checks.exitCode = null;
      packet.closeout.runs[packet.closeout.runs.length - 1] = run;
      assert.equal(validateAutoresearchAdapterPacket(packet).valid, false);
      const a = projectCandidatePacket(packet, "fixture", "1k/flat").attempts.at(-1);
      assert.ok(a);
      assert.equal(a.validMeasurement, false);
      assert.equal(a.comparisonKey, null);
    }));
