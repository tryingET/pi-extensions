/** Synthetic view fixture ONLY. No owner packet writes, candidate launches or production imports. */
import { readdirSync } from "node:fs";
import {
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  discoverAutoresearchMatrixCampaignArtifacts,
} from "../src/core/runtime.ts";
import { renderAutoresearchDashboardHtml } from "../src/core/runtime-dashboard-html.ts";
import { buildResearchObservatoryModel } from "../src/core/runtime-dashboard-model.ts";
import { cellFor, createCampaign, laneFor } from "../src/core/runtime-matrix-cells.ts";
import type { DashboardAttempt } from "../src/core/runtime-matrix-model.ts";

export const SYNTHETIC_ATLAS_TIME = "2026-09-10T12:00:00.000Z";
const hypotheses = [
  "Batch the index; keep the edges precise.",
  "A smaller invalidation frontier avoids repeated work.",
  "Cache the shape, not the answer.",
];
export function syntheticAtlasFixture(cwd: string, variant: "rich" | "empty" = "rich") {
  if (readdirSync(cwd).length)
    throw new Error("Synthetic fixture requires an empty scratch directory.");
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const matrix = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  matrix.cwd = "/SYNTHETIC-FIXTURE/not-a-live-repository";
  if (variant === "rich") {
    for (const ci of [0, 1]) {
      const campaign = createCampaign(
        `synthetic-campaign-${ci}`,
        matrix.cwd,
        900001 + ci,
        `SYNTHETIC FIXTURE · ${ci === 0 ? "Index latency observatory" : "Independent memory study"}`,
      );
      campaign.observedAt = SYNTHETIC_ATLAS_TIME;
      campaign.sourcePaths = [`/SYNTHETIC-FIXTURE/campaign-${ci}/plan.json`];
      for (const ni of [0, 1, 2]) {
        const cell = cellFor(campaign, `experiment-${ni + 1}`);
        cell.hypothesis = hypotheses[ni];
        cell.scenario = ni === 1 ? "50k symbols / nested rename" : "50k symbols / cold index";
        cell.prediction = "Lower reported latency without changing checks.";
        cell.rejectionCriteria = ni === 2 ? null : "Reject if correctness checks fail.";
        cell.sources = campaign.sourcePaths;
        for (const li of [0, 1]) {
          const lane = laneFor(cell, li === 0 ? "reference" : "bounded alternative");
          if (ni === 2) continue;
          for (const ai of [0, 1, 2]) {
            const outcome = (
              [
                "baseline_reference",
                "improvement",
                "regression",
                "correctness_failure",
                "inconclusive",
                "resource_censored",
              ] as const
            )[(ni * 3 + ai + li) % 6];
            const candidate = {
              source: "candidate_peer_spawn",
              worktreePath: `/SYNTHETIC-FIXTURE/candidate-${ni}`,
              branch: `synthetic-${ni}`,
              baseRef: "a".repeat(40),
              diffSummary: "Synthetic changes for UI testing only",
              filesChanged: ni === 0 ? ["src/index.ts"] : ["src/invalidation.ts"],
            };
            const attempt: DashboardAttempt = {
              id: `synthetic-${ci}-${ni}-${li}-${ai}`,
              sources: [`/SYNTHETIC-FIXTURE/${ci}/${ni}/${li}/packet.json`],
              timestamp: Date.parse(SYNTHETIC_ATLAS_TIME) + ai,
              iteration: ai + 1,
              description: `SYNTHETIC report ${ai + 1} · ${outcome.replaceAll("_", " ")}`,
              hypothesis: cell.hypothesis,
              prediction: cell.prediction,
              disposition: "keep",
              decision: outcome,
              outcome,
              metric: 100 + ci * 40 + ni * 20 + li * 10 - ai * 7,
              checks: outcome === "correctness_failure" ? "failed" : "passed",
              schemaValid: true,
              lineageValid: true,
              packetBinding: "matched",
              validMeasurement: !["correctness_failure", "resource_censored"].includes(outcome),
              verificationReport: "SYNTHETIC view seam; not owner or runtime evidence.",
              provenance: "local_unauthenticated_projection",
              identity: {
                metricName: ci ? "peak_memory" : "total_ms",
                metricUnit: ci ? "MiB" : "ms",
                direction: "lower",
                scenario: cell.scenario,
                subject: JSON.stringify(candidate),
                base: candidate.baseRef,
                evaluator: null,
              },
              comparisonKey: null,
              comparisonWithheld: [
                "Unknown evaluator; comparison withheld. Actual per-run commands are not preserved by the owner closeout.",
              ],
              issues: [],
              raw: { syntheticFixture: true, experiment: { candidate } },
            };
            lane.attempts.push(attempt);
          }
        }
      }
      matrix.campaigns.push(campaign);
    }
    matrix.cells = matrix.campaigns.flatMap((c) => c.cells);
    matrix.campaignCount = matrix.campaigns.length;
    matrix.cellCount = matrix.cells.length;
    matrix.candidateLaneCount = matrix.cells.flatMap((c) => c.lanes).length;
    matrix.observedMeasurementCount = matrix.cells
      .flatMap((c) => c.lanes.flatMap((l) => l.attempts))
      .filter((a) => a.validMeasurement).length;
  }
  const model = buildResearchObservatoryModel(status, closeout, matrix, SYNTHETIC_ATLAS_TIME);
  return { status, closeout, matrix, model };
}
export function renderSyntheticAtlasFixture(
  cwd: string,
  variant: "rich" | "empty" = "rich",
): string {
  const { status, closeout, matrix } = syntheticAtlasFixture(cwd, variant);
  return renderAutoresearchDashboardHtml(status, closeout, matrix, SYNTHETIC_ATLAS_TIME).replace(
    '<header class="masthead">',
    '<p class="status-line"><b>SYNTHETIC FIXTURE — UI TEST DATA ONLY.</b> No real experiments, owner evidence or execution. Never mix this page into a live dashboard.</p><header class="masthead">',
  );
}
