import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildAutoresearchCandidateResultPacket } from "../src/core/runtime-candidate-result.ts";
import { runProcessCommand } from "../src/core/runtime-command.ts";
import { discoverAutoresearchMatrixCampaignArtifacts as discover } from "../src/core/runtime-matrix.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import { captureRunExecution, parseRunExecution } from "../src/core/runtime-provenance.ts";
import { withDashboardDir, writeDashboardSource } from "./runtime-dashboard-fixtures.ts";
import { provenanceFixture } from "./runtime-provenance-fixtures.ts";

for (const mutation of ["provenance", "resource_censored", "foreign_decision"]) {
  test(`rejected ${mutation} receipt history cannot clear matrix coverage through surviving runs`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const rejected = { ...f.packet.candidateRun, type: "run", version: 1 };
      if (mutation === "provenance") Object.assign(rejected, { provenance: { matrix: null } });
      else Object.assign(rejected, { empiricalDecisionClass: mutation });
      appendFileSync(path.join(cwd, "autoresearch.jsonl"), `${JSON.stringify(rejected)}\n`);
      const packet = buildAutoresearchCandidateResultPacket(cwd);
      assert.equal(packet.closeout.status.invalidReceiptLines, 1);
      writeDashboardSource(cwd, f.lane.candidateResultPacketPath, packet);
      const summary = discover(cwd);
      assert.equal(summary.observedMeasurementCount, 0);
      assert.equal(summary.comparisonGroups.length, 0);
      assert.ok(summary.cells[0].lanes[0].missingMeasurementPaths.length);
      assert.ok(summary.cells[0].lanes[0].attempts.every((a) => !a.validMeasurement));
      assert.match(summary.exportVisibilityBlockers.blockers.join("\n"), /receipt history/i);
    }));
}

for (const classification of [42, null, ["baseline"], "foreign"]) {
  test(`direct imported history cannot downgrade present classification ${JSON.stringify(classification)}`, () =>
    withDashboardDir((cwd) => {
      const f = provenanceFixture(cwd);
      const packet = structuredClone(f.packet);
      Object.assign(packet.closeout.runs[0], { empiricalDecisionClass: classification });
      const projection = projectCandidatePacket(packet, "synthetic", "1k/flat");
      assert.equal(projection.valid, false);
      assert.ok(projection.attempts.every((a) => !a.validMeasurement && a.comparisonKey === null));
    }));
}

test("direct imported segment cannot hide a non-selected run while retaining original counts", () =>
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const packet = structuredClone(f.packet);
    packet.closeout.runs.shift();
    const projection = projectCandidatePacket(packet, "synthetic", "1k/flat");
    assert.equal(projection.valid, false);
    assert.ok(projection.attempts.every((a) => !a.validMeasurement));
    assert.match(projection.issues.join("\n"), /history.*count|count.*history/i);
  }));

test("output-limit termination survives capture and cannot claim passed checks or comparable measurement", () => {
  const execution = captureRunExecution(
    "/synthetic",
    {
      exitCode: 0,
      timedOut: false,
      aborted: false,
      outputLimitExceeded: true,
    } as Parameters<typeof captureRunExecution>[1],
    null,
    null,
  );
  assert.equal((execution.benchmark as Record<string, unknown>).outputLimitExceeded, true);
  const parsed = parseRunExecution(execution);
  assert.equal((parsed!.benchmark as Record<string, unknown>).outputLimitExceeded, true);
  withDashboardDir((cwd) => {
    const f = provenanceFixture(cwd);
    const packet = structuredClone(f.packet);
    Object.assign(packet.candidateRun!.execution!.benchmark, { outputLimitExceeded: true });
    packet.closeout.runs[packet.closeout.runs.length - 1] = packet.candidateRun!;
    const attempt = projectCandidatePacket(packet, "synthetic", "1k/flat").attempts.at(-1)!;
    assert.equal(attempt.validMeasurement, false);
    assert.equal(attempt.comparisonKey, null);
  });
});

test("actual output-budget termination is explicit even when a synthetic process exits zero on SIGTERM", async () => {
  const result = await runProcessCommand({
    command: "SYNTHETIC output-budget fixture; no research benchmark",
    executable: process.execPath,
    args: [
      "-e",
      "process.on('SIGTERM',()=>process.exit(0));process.stdout.write(Buffer.alloc(17*1024*1024,120));setInterval(()=>{},1000)",
    ],
    cwd: process.cwd(),
    timeoutSeconds: 30,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.outputLimitExceeded, true);
  assert.equal(result.timedOut, false);
  assert.match(result.stderr, /output exceeded/);
  const captured = captureRunExecution(process.cwd(), result, null, null);
  assert.equal(captured.benchmark.outputLimitExceeded, true);
});
