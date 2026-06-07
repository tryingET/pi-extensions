import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  discoverAutoresearchMatrixCampaignArtifacts,
  exportAutoresearchDashboardHtml,
  formatAutoresearchDashboard,
} from "../src/core/runtime.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("exportAutoresearchDashboardHtml writes a browser dashboard artifact", () =>
  withTempDir((cwd) => {
    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");

    assert.equal(result.cwd, cwd);
    assert.match(result.fileUrl, /^file:/);
    assert.match(html, /pi-autoresearch live dashboard/);
    assert.match(html, /Auto-refreshes every 2s/);
    assert.match(html, /Metric readiness \/ trust/);
    assert.match(html, /metric readiness blockers=1/);
    assert.match(html, /Metric trajectory/);
    assert.match(html, /"chartMode":"runtime_segment"/);
    assert.match(html, /Resume plan/);
    assert.match(html, /autoresearch\.resume_plan\.v1/);
    assert.match(html, /Read-only: no benchmark run/);
    assert.match(html, /Resume apply plan-only proposal/);
    assert.match(html, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(html, /autoresearch_runtime_resume_apply/);
    assert.match(html, /Authority handoff/);
    assert.match(html, /closeout/);
    assert.match(html, /ak_evidence/);
    assert.match(html, /evidence_record/);
    assert.match(html, /learning_export\/KES adapter/);
    assert.match(html, /autoresearch_learning_kes_adapter/);
    assert.match(html, /oracle_evidence_export/);
    assert.match(html, /DSPx owner preflight/);
    assert.match(html, /does not run exports, call AK\/KES\/Oracle/);
    assert.equal(existsSync(path.join(cwd, AUTORESEARCH_LEARNING_EXPORT_FILE)), false);
    assert.equal(existsSync(path.join(cwd, AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE)), false);
    assert.match(html, /Learning handoff/);
    assert.match(html, /learning_export/);
    assert.match(html, /autoresearch_learning_kes_adapter/);
    assert.match(html, /Setup guide/);
    assert.match(html, /autoresearch_campaign_start/);
    assert.match(html, /autoresearch_runtime_setup/);
    assert.match(html, /Bind → measure → candidate_result_export journey/);
    assert.match(html, /export inspects measured packet inventory before owner review/);
    assert.match(html, /Measured packet inventory before owner review/);
    assert.match(html, /autoresearch_candidate_bind/);
    assert.match(html, /autoresearch_runtime_run/);
    assert.match(html, /candidate_result_export/);
    assert.match(html, /autoresearch_live_supervision/);
    assert.match(html, /taskId/);
    assert.match(html, /Measured packet inventory before owner review/);
    assert.match(html, /export_visibility_blockers=0/);
    assert.match(html, /No matrix campaign artifacts discovered/);
    assert.match(html, /Browser export is read-only measured packet inventory inspection/);
  }));

test("browser dashboard export surfaces metric-readiness trust posture", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "long-running-metric-readiness",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline duration sample",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 96,
        description: "candidate duration sample during long campaign",
        timestamp: 3,
      }),
    );

    const dashboard = formatAutoresearchDashboard(buildAutoresearchRuntimeStatus(cwd));
    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");
    const metricReadinessVisibilityBlockers = [
      dashboard.includes("## Metric readiness / trust") ? null : "text dashboard missing section",
      html.includes("Metric readiness / trust") ? null : "browser export missing card",
      html.includes("duration_under_sampled") ? null : "browser export missing readiness class",
      html.includes("metric readiness blockers=1") ? null : "browser export missing blocker count",
      html.includes("duration metric is under-sampled")
        ? null
        : "browser export missing blocked reason",
    ].filter((blocker): blocker is string => blocker !== null);

    assert.deepEqual(metricReadinessVisibilityBlockers, []);
  }));

test("dashboard export discovers and renders matrix campaign artifacts", () =>
  withTempDir((cwd) => {
    const campaignDir = path.join(cwd, ".autoresearch", "campaigns", "2921");
    const cellDir = path.join(cwd, ".autoresearch", "matrix-campaign", "cell-01-01");
    mkdirSync(campaignDir, { recursive: true });
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(
      path.join(campaignDir, "matrix-plan.json"),
      JSON.stringify({
        kind: "autoresearch.matrix_campaign_plan.v1",
        taskId: 2921,
        cwd,
        objective: "Matrix endurance dashboard export",
        direction: "lower",
        operatorFollowup: {
          primaryMetric: { name: "export_visibility_blockers", direction: "lower", target: 0 },
          nextLegalActions: ["Open /autoresearch export before review_matrix_campaign."],
        },
        cells: [
          {
            cellId: "cell-01-01",
            scenario: "long-running campaign",
            hypothesis: "dashboard watch surface",
            candidatePacketDirectory: ".autoresearch/matrix-campaign/cell-01-01",
            candidateResultPacketPaths: [
              ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
              ".autoresearch/matrix-campaign/cell-01-01/candidate-02.candidate-result.json",
            ],
            managedWavePosture: "managed_candidate_wave_required",
            planCandidateWaveCall:
              'autoresearch_live_supervision({ action: "plan_candidate_wave" })',
            reviewCandidateWaveCall:
              'autoresearch_live_supervision({ action: "review_candidate_wave" })',
          },
        ],
        nextStep: "Launch approved visible candidate lanes, then export candidate-result packets.",
      }),
    );
    writeFileSync(
      path.join(campaignDir, "matrix-review.json"),
      JSON.stringify({
        kind: "autoresearch.matrix_campaign_review.v1",
        taskId: 2921,
        cwd,
        objective: "Matrix endurance dashboard export",
        direction: "lower",
        completedCellCount: 1,
        expectedCellCount: 1,
        selectedCellCount: 1,
        operatorFollowup: {
          primaryMetric: { name: "export_visibility_blockers", direction: "lower", target: 0 },
          nextLegalActions: ["Review selected lane in /autoresearch review after dashboard scan."],
          lanePacketPaths: [
            {
              cellId: "cell-01-01",
              laneId: "candidate-01",
              packetPath:
                ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
              state: "measured_exported_selectable",
            },
          ],
        },
        cockpit: {
          kind: "autoresearch.matrix_campaign_cockpit.v1",
          progress: { completedCells: 1, expectedCells: 1, selectedCells: 1 },
          cellRows: [
            {
              cellId: "cell-01-01",
              posture: "ready_for_matrix_owner_review",
              laneProgress: "1/2",
              selectedLaneId: "candidate-01",
              selectedPacketPath:
                ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
              packetInventory: [
                ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json",
              ],
              nextLegalAction: "Run review_matrix_campaign, then /autoresearch review.",
            },
          ],
          nextLegalCampaignActions: ["Run review_matrix_campaign for task 2921."],
        },
        closeout: {
          kind: "autoresearch.matrix_campaign_closeout.v1",
          metric: {
            name: "export_visibility_blockers",
            baseline: 2,
            final: 0,
            target: 0,
            direction: "lower",
          },
        },
        nextStep: "Owner reviews the matrix cockpit, then records evidence after review.",
      }),
    );
    writeFileSync(
      path.join(cellDir, "candidate-01.candidate-result.json"),
      JSON.stringify({ packetKind: "autoresearch.candidate_result.v1" }),
    );

    const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(summary.exportVisibilityBlockers.value, 0);
    assert.equal(summary.metricName, "export_visibility_blockers");
    assert.equal(summary.completedCellCount, 1);
    assert.equal(summary.selectedCellCount, 1);
    assert.equal(summary.exportedPacketCount, 1);
    assert.equal(summary.openCandidateReview.status, "owner_review_required");
    assert.equal(summary.openCandidateReview.openCellCount, 1);
    assert.equal(summary.openCandidateReview.selectedReviewCellCount, 1);
    assert.equal(summary.openCandidateReview.unselectedMeasuredCellCount, 0);
    assert.equal(summary.openCandidateReview.uniqueExportedPacketCount, 1);
    assert.match(summary.openCandidateReview.summary, /Packet counts are review inventory/);
    assert.equal(summary.cells[0]?.cellId, "cell-01-01");
    assert.equal(summary.cells[0]?.selectedLaneId, "candidate-01");
    assert.equal(summary.chart.mode, "metric");
    assert.equal(summary.chart.metricName, "export_visibility_blockers");
    assert.deepEqual(
      summary.chart.points.map((point) => point.metric),
      [2, 0],
    );

    const textDashboard = formatAutoresearchDashboard(buildAutoresearchRuntimeStatus(cwd));
    assert.match(textDashboard, /mode: matrix_campaign/);
    assert.match(textDashboard, /## Matrix campaign progress/);
    assert.match(textDashboard, /Open candidate review posture/);
    assert.match(textDashboard, /open candidate next legal action/);
    assert.ok(
      textDashboard.indexOf("## Matrix campaign progress") <
        textDashboard.indexOf("## Local runtime segment snapshot"),
    );

    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");
    assert.match(html, /mode: matrix_campaign/);
    assert.match(html, /Dashboard mode/);
    assert.match(html, /Matrix campaign progress/);
    assert.match(html, /Matrix progress trajectory/);
    assert.match(html, /Derived from matrix closeout metrics/);
    assert.match(html, /"chartMode":"matrix_campaign"/);
    assert.match(html, /"rows":\[\{"iteration":1,"label":"matrix baseline"/);
    assert.match(html, /"metric":2/);
    assert.match(html, /"metric":0/);
    assert.match(html, /Matrix cells/);
    assert.match(html, /1\/1/);
    assert.match(html, /Local runtime segment snapshot/);
    assert.ok(
      html.indexOf("Matrix campaign progress") < html.indexOf("Local runtime segment snapshot"),
    );
    assert.match(html, /Measured packet inventory before owner review/);
    assert.match(html, /Open candidate review posture/);
    assert.match(html, /1 open review cell\(s\)/);
    assert.match(html, /Packet counts are review inventory/);
    assert.match(html, /export_visibility_blockers=0/);
    assert.match(html, /cell-01-01/);
    assert.match(html, /ready_for_matrix_owner_review/);
    assert.match(html, /candidate-01\.candidate-result\.json/);
    assert.match(html, /Run review_matrix_campaign, then \/autoresearch review/);
    assert.match(html, /Matrix campaign discovery is read-only/);
  }));

test("matrix dashboard chart falls back to cell progress when metric points are absent", () =>
  withTempDir((cwd) => {
    const campaignDir = path.join(cwd, ".autoresearch", "campaigns", "2922");
    mkdirSync(campaignDir, { recursive: true });
    writeFileSync(
      path.join(campaignDir, "matrix-review.json"),
      JSON.stringify({
        kind: "autoresearch.matrix_campaign_review.v1",
        taskId: 2922,
        cwd,
        objective: "Matrix progress fallback",
        direction: "higher",
        completedCellCount: 2,
        expectedCellCount: 3,
        selectedCellCount: 1,
        cockpit: {
          kind: "autoresearch.matrix_campaign_cockpit.v1",
          progress: { completedCells: 2, expectedCells: 3, selectedCells: 1 },
          cellRows: [
            { cellId: "cell-01-01", posture: "ready_for_matrix_owner_review", laneProgress: "1/1" },
            { cellId: "cell-02-01", posture: "ready_for_matrix_owner_review", laneProgress: "1/1" },
            { cellId: "cell-03-01", posture: "planned", laneProgress: "0/1" },
          ],
        },
      }),
    );

    const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(summary.chart.mode, "cell_progress");
    assert.equal(summary.chart.metricName, "matrix_cells_completed");
    assert.deepEqual(
      summary.chart.points.map((point) => point.metric),
      [0, 2],
    );

    const result = exportAutoresearchDashboardHtml({ cwd });
    const html = readFileSync(result.path, "utf8");
    assert.match(html, /Matrix progress trajectory/);
    assert.match(html, /matrix_cells_completed/);
    assert.match(html, /"chartMode":"matrix_campaign"/);
    assert.match(html, /"metric":2/);
    assert.match(html, /Derived from matrix plan\/cockpit\/review cell-progress artifacts/);
  }));
