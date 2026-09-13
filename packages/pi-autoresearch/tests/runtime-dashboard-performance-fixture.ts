/** SYNTHETIC presentation fixture only. Never emits owner packets or launches a candidate. */
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import { buildResearchObservatoryModel } from "../src/core/runtime-dashboard-model.ts";
import { cellFor, createCampaign, laneFor } from "../src/core/runtime-matrix-cells.ts";
import { buildComparisonGroups } from "../src/core/runtime-matrix-chart.ts";
import type { DashboardAttempt } from "../src/core/runtime-matrix-model.ts";
import { SYNTHETIC_ATLAS_TIME, syntheticAtlasFixture } from "./runtime-dashboard-atlas-fixture.ts";

export type PerformanceFixtureVariant = "showcase" | "unsafe" | "empty";
export function syntheticPerformanceFixture(
  cwd: string,
  variant: PerformanceFixtureVariant = "showcase",
) {
  const fixture = syntheticAtlasFixture(cwd, "empty");
  const { matrix, status, closeout } = fixture;
  const campaign = createCampaign(
    "synthetic-performance",
    matrix.cwd,
    900626,
    "SYNTHETIC · Index performance",
  );
  const cell = cellFor(campaign, "cold-index");
  cell.hypothesis = "SYNTHETIC hypothesis: batch index traversal without changing correctness.";
  cell.prediction = "Lower runtime with unchanged checks.";
  cell.scenario = "SYNTHETIC fixed corpus / cold index";
  cell.rejectionCriteria = "Reject on correctness failure.";
  const lane = laneFor(cell, "bounded-search");
  const metrics = [19.1, 16.8, 17.6, 14.2, 12.9, 13.7, 10.8, 9.6, 10.1, 8.2, 7.4, 6.68];
  const descriptions = [
    "Baseline reference",
    "Batch file reads",
    "Aggressive prefetch",
    "Reuse parse buffers",
    "Reduce allocations",
    "Wider worker pool",
    "Cache symbol shapes",
    "Incremental invalidation",
    "Speculative path cache",
    "Compact lookup tables",
    "Avoid duplicate traversal",
    "Bounded index batching",
  ];
  if (variant !== "empty")
    metrics.forEach((metric, index) => {
      const discarded = [2, 5, 8].includes(index);
      const attempt: DashboardAttempt = {
        id: `synthetic-performance-run-${index + 1}`,
        sources: ["/SYNTHETIC-FIXTURE/run-reports.json"],
        timestamp: Date.parse(SYNTHETIC_ATLAS_TIME) - (12 - index) * 60000,
        iteration: index + 1,
        description: descriptions[index],
        hypothesis: cell.hypothesis,
        prediction: cell.prediction,
        disposition: discarded ? "discard" : "keep",
        decision: index === 0 ? "baseline" : "candidate_improvement",
        outcome: index === 0 ? "baseline_reference" : "improvement",
        metric,
        checks: "passed",
        schemaValid: true,
        lineageValid: true,
        packetBinding: "matched",
        validMeasurement: true,
        verificationReport:
          "SYNTHETIC UI fixture; compatible typed view seam, not production protocol evidence.",
        provenance: "local_unauthenticated_projection",
        identity: {
          metricName: "runtime",
          metricUnit: "s",
          direction: "lower",
          scenario: cell.scenario,
          subject: "SYNTHETIC fixed subject",
          base: "a".repeat(40),
          evaluator: "SYNTHETIC exact per-run evaluator protocol",
        },
        comparisonKey: "synthetic-compatible-key",
        comparisonWithheld: [],
        issues: [],
        raw: { syntheticFixture: true },
      };
      if (variant === "unsafe") {
        attempt.identity.evaluator = null;
        attempt.comparisonKey = null;
        attempt.comparisonWithheld = [
          "Unknown evaluator; comparison withheld. Production closeouts omit per-run protocol.",
        ];
        if (index === 10) {
          attempt.packetBinding = "quarantined";
          attempt.validMeasurement = false;
        }
        if (index === 11) {
          attempt.outcome = "correctness_failure";
          attempt.checks = "failed";
          attempt.validMeasurement = false;
          attempt.metric = 0.01;
        }
      }
      lane.attempts.push(attempt);
    });
  matrix.campaigns = [campaign];
  matrix.cells = [cell];
  matrix.campaignCount = 1;
  matrix.cellCount = 1;
  matrix.candidateLaneCount = 1;
  matrix.observedMeasurementCount = lane.attempts.filter((a) => a.validMeasurement).length;
  matrix.comparisonGroups = buildComparisonGroups(matrix.campaigns);
  return {
    status,
    closeout,
    matrix,
    model: buildResearchObservatoryModel(status, closeout, matrix, SYNTHETIC_ATLAS_TIME),
  };
}
/** Parent reusable renderer; cwd must be an empty owned scratch directory. */
export function renderSyntheticPerformanceFixture(
  cwd: string,
  variant: PerformanceFixtureVariant = "showcase",
): string {
  const { status, closeout, matrix } = syntheticPerformanceFixture(cwd, variant);
  return renderAutoresearchDashboardHtml(status, closeout, matrix, SYNTHETIC_ATLAS_TIME).replace(
    '<header class="masthead">',
    '<p class="perf-badge"><b>SYNTHETIC PERFORMANCE FIXTURE</b> · UI test data only.</p><header class="masthead">',
  );
}
