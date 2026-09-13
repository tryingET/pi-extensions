import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverAutoresearchMatrixCampaignArtifacts } from "../src/core/runtime-matrix.ts";
import {
  classifyAutoresearchDashboardOutcomeClass as outcome,
  classifyAutoresearchMatrixCellStage as stage,
} from "../src/core/runtime-matrix-model.ts";

function fixture(fn: (cwd: string, write: (name: string, data: unknown) => void) => void) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "observatory-truth-"));
  const write = (name: string, data: unknown) => {
    const file = path.join(cwd, ".autoresearch", name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  try {
    fn(cwd, write);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("prepared runner and fabricated selectable posture cannot prove launch or measurement", () => {
  assert.equal(
    stage({ posture: "locked_until_checkpoint", measuredPacketCount: 0 }).stage,
    "awaiting_controller_launch",
  );
  assert.notEqual(
    stage({ posture: "measured_exported_selectable", measuredPacketCount: 0 }).stage,
    "measured_awaiting_owner_review",
  );
});

test("empirical verdicts are independent of lifecycle dispositions", () => {
  assert.equal(outcome({ decision: "candidate_regression", status: "keep" }), "regression");
  assert.equal(outcome({ decision: "possible_noise", status: "discard" }), "inconclusive");
  assert.equal(outcome({ decision: "threshold_preserved", status: "keep" }), "threshold_preserved");
  assert.equal(outcome({ decision: null, status: "keep" }), "not_evaluated");
  assert.equal(
    outcome({ decision: "possible_noise", status: "checks_failed" }),
    "correctness_failure",
  );
  assert.equal(
    outcome({ decision: "candidate_improvement", status: "crash" }),
    "measurement_invalid",
  );
  assert.equal(outcome({ decision: "ran out of memory", status: "candidate" }), "unclassified");
});

test("packetKind inventory, empty and malformed packets do not become valid measurements", () =>
  fixture((cwd, write) => {
    write("campaigns/42/plan.json", {
      kind: "autoresearch.matrix_campaign_plan.v1",
      taskId: 42,
      cwd,
      objective: "exact",
      cells: [
        {
          cellId: "cell-01-01",
          candidateResultPacketPaths: [
            ".autoresearch/matrix-campaign/cell-01-01/a.json",
            ".autoresearch/matrix-campaign/cell-01-01/b.json",
          ],
        },
      ],
    });
    write("matrix-campaign/cell-01-01/a.json", { packetKind: "autoresearch.candidate_result.v1" });
    write("matrix-campaign/cell-01-01/b.json", {
      packetKind: "autoresearch.candidate_result.v1",
      candidateRun: { metric: 12, status: "keep" },
    });
    const model = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(model.exportedPacketCount, 2);
    assert.equal(model.observedMeasurementCount, 0);
    assert.equal(model.coverageGapLaneCount, 2);
    assert.equal(model.cells[0]?.measuredPacketCount, 0);
    assert.equal(model.chart.points.length, 0);
    assert.ok(model.exportVisibilityBlockers.value > 0);
  }));

test("identical cell IDs from different exact campaigns never merge", () =>
  fixture((cwd, write) => {
    for (const taskId of [42, 43])
      write(`campaigns/${taskId}/plan.json`, {
        kind: "autoresearch.matrix_campaign_plan.v1",
        taskId,
        cwd,
        objective: `objective ${taskId}`,
        cells: [{ cellId: "cell-01-01", hypothesis: `hypothesis ${taskId}` }],
      });
    const model = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(model.campaignCount, 2);
    assert.equal(model.cells.length, 2);
  }));

test("controller completed count is not a measurement series or inventory coverage", () =>
  fixture((cwd, write) => {
    write("campaigns/42/review.json", {
      kind: "autoresearch.matrix_campaign_review.v1",
      taskId: 42,
      cwd,
      objective: "exact",
      completedCellCount: 9,
      cockpit: {
        packetInventory: [
          {
            cellId: "cell-01-01",
            laneId: "missing",
            packetPath: ".autoresearch/matrix-campaign/cell-01-01/missing.json",
            state: "packet_missing",
            selected: false,
          },
        ],
        cellRows: [
          {
            cellId: "cell-01-01",
            laneProgress: "9/9",
            packetInventory: [
              "missing: .autoresearch/matrix-campaign/cell-01-01/missing.json [packet_missing]",
            ],
          },
        ],
      },
      closeout: {
        metric: { name: "workflow_blockers", baseline: 9, final: 0, direction: "lower", target: 0 },
      },
    });
    const model = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(model.completedCellCount, 9);
    assert.equal(model.observedMeasurementCount, 0);
    assert.equal(model.coverageGapLaneCount, 1);
    assert.equal(model.chart.points.length, 0);
  }));

test("nonexistent cwd is a reported discovery issue, not an uncaught consumer exception", () =>
  fixture((cwd) => {
    const model = discoverAutoresearchMatrixCampaignArtifacts(`${cwd}/missing`);
    assert.equal(model.observedMeasurementCount, 0);
    assert.equal(model.cells.length, 0);
    assert.ok(model.exportVisibilityBlockers.blockers.some((s) => s.includes("cwd unavailable")));
  }));

test("unresolved inventory can require source review without becoming measured or selectable", () =>
  fixture((cwd, write) => {
    write("matrix-campaign/cell-01-01/packet.json", {
      packetKind: "autoresearch.candidate_result.v1",
    });
    const model = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(model.openCandidateReview.status, "owner_review_required");
    assert.equal(model.openCandidateReview.unselectedMeasuredCellCount, 0);
    assert.equal(model.cells[0].measuredPacketCount, 0);
    assert.equal(model.cells[0].posture, "unresolved_inventory");
    assert.equal(model.unresolvedPackets[0].validMeasurement, false);
    assert.equal(model.campaigns.length, 0);
  }));
