import path from "node:path";

import { isRecord } from "./runtime-common.ts";
import {
  getNumberField,
  getRecordField,
  getStringField,
  inferMatrixCellIdFromPath,
} from "./runtime-matrix-fields.ts";
import type {
  AutoresearchDashboardChartPoint,
  AutoresearchMatrixCampaignDashboardChart,
  MetricDirection,
} from "./runtime-matrix-model.ts";

function addMatrixCampaignChartPoint(
  points: AutoresearchDashboardChartPoint[],
  point: AutoresearchDashboardChartPoint,
): void {
  const duplicate = points.some(
    (existing) =>
      existing.source === point.source &&
      existing.label === point.label &&
      existing.metric === point.metric &&
      existing.description === point.description,
  );
  if (!duplicate) points.push(point);
}

export function addCandidateResultMatrixChartPoint(
  json: unknown,
  relativePath: string,
  points: AutoresearchDashboardChartPoint[],
): void {
  if (
    !isRecord(json) ||
    getStringField(json, "packetKind") !== "autoresearch.candidate_result.v1"
  ) {
    return;
  }
  const candidateRun = getRecordField(json, "candidateRun");
  const metric = getNumberField(candidateRun, "metric");
  if (metric === null) return;
  const cellId = inferMatrixCellIdFromPath(relativePath) ?? "matrix-cell";
  const candidate = getRecordField(json, "candidate");
  const laneId =
    getStringField(candidate, "branch") ??
    getStringField(candidate, "worktreePath") ??
    path.basename(relativePath).replace(/\.candidate-result\.json$/u, "");
  addMatrixCampaignChartPoint(points, {
    iteration: getNumberField(candidateRun, "iteration"),
    label: `${cellId} ${laneId}`,
    status: getStringField(candidateRun, "status") ?? "candidate",
    runKind: getStringField(candidateRun, "runKind") ?? "matrix_candidate_result",
    decision: getStringField(json, "empiricalDecisionClass") ?? "candidate_result",
    metric,
    description:
      getStringField(candidateRun, "description") ??
      getStringField(json, "resultSummary") ??
      `Candidate-result metric from ${relativePath}`,
    source: "matrix_candidate_result",
  });
}

export function addMatrixCloseoutChartPoints(
  artifact: Record<string, unknown>,
  relativePath: string,
  points: AutoresearchDashboardChartPoint[],
): { name: string | null; direction: MetricDirection | null; target: number | null } {
  const closeoutMetric = getRecordField(getRecordField(artifact, "closeout"), "metric");
  if (!closeoutMetric) return { name: null, direction: null, target: null };
  const name = getStringField(closeoutMetric, "name");
  const directionValue = getStringField(closeoutMetric, "direction");
  const direction: MetricDirection | null =
    directionValue === "lower" || directionValue === "higher" ? directionValue : null;
  const target = getNumberField(closeoutMetric, "target");
  const baseline = getNumberField(closeoutMetric, "baseline");
  const final = getNumberField(closeoutMetric, "final");
  if (baseline !== null) {
    addMatrixCampaignChartPoint(points, {
      iteration: 1,
      label: "matrix baseline",
      status: "baseline",
      runKind: "matrix_closeout",
      decision: "baseline",
      metric: baseline,
      description: `${name ?? "matrix closeout metric"} baseline from ${relativePath}`,
      source: "matrix_closeout",
    });
  }
  if (final !== null) {
    addMatrixCampaignChartPoint(points, {
      iteration: baseline !== null ? 2 : 1,
      label: "matrix final",
      status: target !== null && final === target ? "keep" : "candidate",
      runKind: "matrix_closeout",
      decision: target !== null && final === target ? "threshold_satisfied" : "candidate_result",
      metric: final,
      description: `${name ?? "matrix closeout metric"} final from ${relativePath}`,
      source: "matrix_closeout",
    });
  }
  return { name, direction, target };
}

export function buildMatrixCampaignDashboardChart(input: {
  metricPoints: AutoresearchDashboardChartPoint[];
  completedCellCount: number;
  resolvedCellCount: number;
  metricName: string | null;
  metricDirection: MetricDirection | null;
}): AutoresearchMatrixCampaignDashboardChart {
  if (input.metricPoints.length > 0) {
    return {
      kind: "autoresearch.matrix_campaign_dashboard_chart.v1",
      mode: "metric",
      metricName: input.metricName ?? "matrix_metric",
      metricUnit: "",
      direction: input.metricDirection ?? "lower",
      sourceDescription:
        "Derived from matrix closeout metrics and candidate-result packet metrics discovered in local .autoresearch artifacts.",
      emptyMessage: "No matrix metric points were discovered yet.",
      points: input.metricPoints.map((point, index) => ({
        ...point,
        iteration: point.iteration ?? index + 1,
      })),
    };
  }

  if (input.resolvedCellCount > 0) {
    return {
      kind: "autoresearch.matrix_campaign_dashboard_chart.v1",
      mode: "cell_progress",
      metricName: "matrix_cells_completed",
      metricUnit: " cell(s)",
      direction: "higher",
      sourceDescription:
        "Derived from matrix plan/cockpit/review cell-progress artifacts because no metric receipt series was available.",
      emptyMessage: "No matrix cell progress was discovered yet.",
      points: [
        {
          iteration: 1,
          label: "matrix planned",
          status: "planned",
          runKind: "matrix_progress",
          decision: "planned",
          metric: 0,
          description: `${input.resolvedCellCount} matrix cell(s) planned`,
          source: "matrix_progress",
        },
        {
          iteration: 2,
          label: "matrix discovered progress",
          status:
            input.completedCellCount >= input.resolvedCellCount
              ? "keep"
              : input.completedCellCount > 0
                ? "candidate"
                : "planned",
          runKind: "matrix_progress",
          decision:
            input.completedCellCount >= input.resolvedCellCount
              ? "threshold_satisfied"
              : "in_progress",
          metric: input.completedCellCount,
          description: `${input.completedCellCount}/${input.resolvedCellCount} matrix cell(s) complete`,
          source: "matrix_progress",
        },
      ],
    };
  }

  return {
    kind: "autoresearch.matrix_campaign_dashboard_chart.v1",
    mode: "empty",
    metricName: input.metricName ?? "matrix_progress",
    metricUnit: "",
    direction: input.metricDirection ?? "higher",
    sourceDescription:
      "No chartable matrix closeout, candidate-result, or cell-progress points were discovered.",
    emptyMessage:
      "No matrix chart data yet; export candidate-result packets or matrix review/cockpit artifacts to fill this graph.",
    points: [],
  };
}
