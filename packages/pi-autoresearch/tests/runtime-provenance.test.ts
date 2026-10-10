import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAutoresearchSegmentCloseout } from "../src/core/runtime-closeout.ts";
import { projectCandidatePacket } from "../src/core/runtime-matrix-chart.ts";
import { parseRunProvenance } from "../src/core/runtime-provenance.ts";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  parseReceiptLine,
  serializeReceipt,
} from "../src/core/runtime-receipts.ts";
import { withDashboardDir } from "./runtime-dashboard-fixtures.ts";

const pin = `sha256:${"a".repeat(64)}`;
export const context = {
  matrix: {
    taskId: 6426,
    objective: "Synthetic provenance check",
    cellId: "cell-01-01",
    laneId: "candidate-01",
    hypothesis: "reuse derived data",
    implementationId: "hypothesis-01",
  },
  measurement: {
    scenario: "1k/nested8",
    evaluator: "synthetic only",
    evaluatorRevision: pin,
    subject: "test source",
    subjectRevision: pin,
    workloadRevision: pin,
  },
};

test("actual per-run commands and provenance round-trip into closeout, never configured defaults", () =>
  withDashboardDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "retained",
        metricName: "ms",
        metricUnit: "ms",
        direction: "lower",
        benchmarkCommand: "configured",
        checksCommand: "configured checks",
      }),
    );
    const run = createRunReceipt({
      status: "candidate",
      metric: 1.21,
      description: "synthetic",
      provenance: context,
      benchmarkCommand: "actual override",
      checksCommand: null,
      checksPassed: null,
    });
    assert.deepEqual(parseReceiptLine(serializeReceipt(run)), run);
    appendReceipt(cwd, run);
    const exported = buildAutoresearchSegmentCloseout(cwd).runs[0];
    assert.equal(exported.benchmarkCommand, "actual override");
    assert.equal(exported.checksCommand, null);
    assert.deepEqual(exported.provenance, context);
  }));

test("historical commands stay unknown rather than using configuration", () =>
  withDashboardDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "historical",
        metricName: "ms",
        direction: "lower",
        benchmarkCommand: "configured",
        checksCommand: "configured checks",
      }),
    );
    appendReceipt(cwd, createRunReceipt({ status: "baseline", metric: 1, description: "old" }));
    const run = buildAutoresearchSegmentCloseout(cwd).runs[0];
    assert.equal(run.benchmarkCommand, null);
    assert.equal(run.checksCommand, undefined);
    assert.equal(run.provenance, undefined);
  }));

test("malformed present provenance fails closed; absent historical provenance stays absent", () => {
  assert.equal(parseRunProvenance(undefined), undefined);
  for (const value of [
    null,
    {},
    { matrix: {} },
    { ...context, matrix: { ...context.matrix, taskId: 0 } },
    { ...context, measurement: { ...context.measurement, evaluatorRevision: "latest" } },
  ])
    assert.throws(() => parseRunProvenance(value));
  assert.deepEqual(parseRunProvenance(context), context);
});

test("frozen real pilot stays unknown and mismatched, failures never become zero-time wins", () => {
  const packetBytes = readFileSync(
    new URL("./fixtures/ak6426/pilot.candidate-result.json.txt", import.meta.url),
  );
  const packet = JSON.parse(packetBytes.toString("utf8"));
  const declaration = JSON.parse(
    readFileSync(new URL("./fixtures/ak6426/pilot-declaration.json", import.meta.url), "utf8"),
  );
  const call = declaration.metricRunCall;
  assert.equal(
    createHash("sha256").update(packetBytes).digest("hex"),
    declaration.packetSourceSha256,
  );
  assert.equal(
    declaration.packetSourceSha256,
    "ab9fdddef5faaf343be8dedf8a6d71d1c33140361774f6f5f9a870147e187b18",
  );
  // This is the source observation hash, not the hash of its reduced call projection.
  assert.equal(
    declaration.observationSourceSha256,
    "9e8cbeb8141b42fb1f46bcdfb323e83e12de9206d5c00bb38ffd2e27f2b465df",
  );
  const plan = JSON.parse(call.slice("autoresearch_runtime_run(".length, -1));
  assert.notEqual(packet.candidateRun.experiment.hypothesis, plan.hypothesis);
  const projection = projectCandidatePacket(packet, "pilot", null);
  assert.equal(projection.attempts.length, 5);
  assert.ok(
    projection.attempts
      .slice(0, 2)
      .every((a) => a.outcome === "measurement_invalid" && !a.validMeasurement),
  );
  const last = projection.attempts.at(-1)!;
  assert.equal(last.outcome, "inconclusive");
  assert.equal(last.identity.evaluator, null);
  assert.equal(last.comparisonKey, null);
});
