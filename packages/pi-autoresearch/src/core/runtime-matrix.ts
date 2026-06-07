import { statSync } from "node:fs";
import path from "node:path";

import { isRecord } from "./runtime-common.ts";
import {
  addCandidateResultMatrixChartPoint,
  addMatrixCloseoutChartPoints,
  buildMatrixCampaignDashboardChart,
} from "./runtime-matrix-chart.ts";
import {
  collectJsonFiles,
  extractMatrixArtifactsFromJson,
  getArrayField,
  getNumberField,
  getRecordField,
  getStringArrayField,
  getStringField,
  inferMatrixCellIdFromPath,
  readMatrixArtifactJson,
  relativeAutoresearchPath,
} from "./runtime-matrix-fields.ts";
import type {
  AutoresearchDashboardChartPoint,
  AutoresearchMatrixCampaignArtifactReference,
  AutoresearchMatrixCampaignArtifactSummary,
  AutoresearchMatrixCampaignCellSummary,
  AutoresearchOpenCandidateReviewPosture,
  MetricDirection,
} from "./runtime-matrix-model.ts";

export type {
  AutoresearchDashboardChartPoint,
  AutoresearchMatrixCampaignArtifactKind,
  AutoresearchMatrixCampaignArtifactReference,
  AutoresearchMatrixCampaignArtifactSummary,
  AutoresearchMatrixCampaignCellSummary,
  AutoresearchMatrixCampaignDashboardChart,
  AutoresearchOpenCandidateReviewPosture,
} from "./runtime-matrix-model.ts";

export const AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_ROOTS = [
  ".autoresearch/campaigns",
  ".autoresearch/matrix-campaign",
] as const;

function matrixCellPostureRank(posture: string | null | undefined): number {
  switch (posture) {
    case "ready_for_matrix_owner_review":
      return 50;
    case "measurement_export_unlocked":
      return 40;
    case "measured_exported_selectable":
      return 30;
    case "locked_until_checkpoint":
      return 20;
    case "managed_candidate_wave_required":
      return 10;
    case "planned":
      return 0;
    default:
      return 5;
  }
}

function chooseMatrixCellPosture(existing: string, incoming: string | undefined): string {
  if (!incoming) return existing;
  return matrixCellPostureRank(incoming) >= matrixCellPostureRank(existing) ? incoming : existing;
}

function upsertMatrixCampaignCellSummary(
  cells: Map<string, AutoresearchMatrixCampaignCellSummary>,
  input: Partial<AutoresearchMatrixCampaignCellSummary> & { cellId: string },
): void {
  const existing = cells.get(input.cellId) ?? {
    cellId: input.cellId,
    scenario: null,
    hypothesis: null,
    posture: "planned",
    laneProgress: "0/0",
    selectedLaneId: null,
    selectedPacketPath: null,
    candidatePacketDirectory: null,
    packetInventory: [],
    nextLegalAction: "Review matrix campaign artifacts before acting.",
  };
  const packetInventory = Array.from(
    new Set([...(existing.packetInventory ?? []), ...(input.packetInventory ?? [])]),
  );
  const posture = chooseMatrixCellPosture(existing.posture, input.posture);
  const incomingPostureWon = posture === input.posture;
  cells.set(input.cellId, {
    ...existing,
    ...input,
    scenario: input.scenario ?? existing.scenario,
    hypothesis: input.hypothesis ?? existing.hypothesis,
    posture,
    laneProgress: input.laneProgress ?? existing.laneProgress,
    selectedLaneId: input.selectedLaneId ?? existing.selectedLaneId,
    selectedPacketPath: input.selectedPacketPath ?? existing.selectedPacketPath,
    candidatePacketDirectory: input.candidatePacketDirectory ?? existing.candidatePacketDirectory,
    packetInventory,
    nextLegalAction: incomingPostureWon
      ? (input.nextLegalAction ?? existing.nextLegalAction)
      : existing.nextLegalAction,
  });
}

function summarizeMatrixPlanArtifact(
  artifact: Record<string, unknown>,
  cells: Map<string, AutoresearchMatrixCampaignCellSummary>,
  nextLegalActions: Set<string>,
): void {
  for (const cell of getArrayField(artifact, "cells")) {
    if (!isRecord(cell)) continue;
    const cellId = getStringField(cell, "cellId");
    if (!cellId) continue;
    const packets = getStringArrayField(cell, "candidateResultPacketPaths");
    upsertMatrixCampaignCellSummary(cells, {
      cellId,
      scenario: getStringField(cell, "scenario"),
      hypothesis: getStringField(cell, "hypothesis"),
      posture: getStringField(cell, "managedWavePosture") ?? "planned",
      laneProgress: `0/${packets.length}`,
      candidatePacketDirectory: getStringField(cell, "candidatePacketDirectory"),
      packetInventory: packets,
      nextLegalAction:
        getStringField(cell, "planCandidateWaveCall") ??
        getStringField(cell, "reviewCandidateWaveCall") ??
        "Launch/review the planned matrix cell through orchestrator surfaces.",
    });
  }
  const nextStep = getStringField(artifact, "nextStep");
  if (nextStep) nextLegalActions.add(nextStep);
}

function summarizeMatrixRunnerArtifact(
  artifact: Record<string, unknown>,
  cells: Map<string, AutoresearchMatrixCampaignCellSummary>,
  nextLegalActions: Set<string>,
): void {
  const lanesByCell = new Map<string, string[]>();
  for (const lane of getArrayField(artifact, "lanes")) {
    if (!isRecord(lane)) continue;
    const cellId = getStringField(lane, "cellId");
    const packet = getStringField(lane, "candidateResultPacketPath");
    if (!cellId) continue;
    const packets = lanesByCell.get(cellId) ?? [];
    if (packet) packets.push(packet);
    lanesByCell.set(cellId, packets);
  }
  for (const [cellId, packets] of lanesByCell) {
    upsertMatrixCampaignCellSummary(cells, {
      cellId,
      posture: "locked_until_checkpoint",
      laneProgress: `0/${packets.length}`,
      packetInventory: packets,
      nextLegalAction:
        "Wait for visible PEER_FINAL reports, verify lineage, then checkpoint before measurement/export/review.",
    });
  }
  const launchPhase = getRecordField(artifact, "launchPhase");
  for (const call of getStringArrayField(launchPhase, "launchCalls").slice(0, 3)) {
    nextLegalActions.add(call);
  }
  const nextStep = getStringField(artifact, "nextStep");
  if (nextStep) nextLegalActions.add(nextStep);
}

function summarizeMatrixFollowupArtifact(
  artifact: Record<string, unknown>,
  cells: Map<string, AutoresearchMatrixCampaignCellSummary>,
  nextLegalActions: Set<string>,
): void {
  for (const action of getStringArrayField(artifact, "nextLegalActions"))
    nextLegalActions.add(action);
  for (const lane of getArrayField(artifact, "lanePacketPaths")) {
    if (!isRecord(lane)) continue;
    const cellId = getStringField(lane, "cellId");
    const packet = getStringField(lane, "packetPath");
    if (!cellId) continue;
    upsertMatrixCampaignCellSummary(cells, {
      cellId,
      posture: getStringField(lane, "state") ?? "planned",
      packetInventory: packet ? [packet] : [],
      nextLegalAction: "Follow the operator follow-up next legal actions for this matrix cell.",
    });
  }
}

function summarizeMatrixCockpitArtifact(
  artifact: Record<string, unknown>,
  cells: Map<string, AutoresearchMatrixCampaignCellSummary>,
  nextLegalActions: Set<string>,
): void {
  for (const action of getStringArrayField(artifact, "nextLegalCampaignActions")) {
    nextLegalActions.add(action);
  }
  for (const row of getArrayField(artifact, "cellRows")) {
    if (!isRecord(row)) continue;
    const cellId = getStringField(row, "cellId");
    if (!cellId) continue;
    upsertMatrixCampaignCellSummary(cells, {
      cellId,
      posture: getStringField(row, "posture") ?? "planned",
      laneProgress: getStringField(row, "laneProgress") ?? "0/0",
      selectedLaneId: getStringField(row, "selectedLaneId"),
      selectedPacketPath: getStringField(row, "selectedPacketPath"),
      packetInventory: getStringArrayField(row, "packetInventory"),
      nextLegalAction:
        getStringField(row, "nextLegalAction") ?? "Review the cockpit row before acting.",
    });
  }
}

export function discoverAutoresearchMatrixCampaignArtifacts(
  cwdInput: string,
): AutoresearchMatrixCampaignArtifactSummary {
  const cwd = path.resolve(cwdInput);
  const artifactRoots = AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_ROOTS.map((root) =>
    path.join(cwd, root),
  );
  const artifacts: AutoresearchMatrixCampaignArtifactReference[] = [];
  const cells = new Map<string, AutoresearchMatrixCampaignCellSummary>();
  const nextLegalActions = new Set<string>();
  const exportedPackets = new Set<string>();
  const campaignKeys = new Set<string>();
  const blockers: string[] = [];
  const matrixChartMetricPoints: AutoresearchDashboardChartPoint[] = [];
  let completedCellCount = 0;
  let selectedCellCount = 0;
  let expectedCellCount = 0;
  let candidateLaneCount = 0;
  let metricName: string | null = null;
  let metricDirection: MetricDirection | null = null;
  let metricTarget: number | null = null;
  let latestArtifactPath: string | null = null;
  let latestMtime = 0;

  for (const root of artifactRoots) {
    for (const filePath of collectJsonFiles(root)) {
      const relativePath = relativeAutoresearchPath(cwd, filePath);
      const mtime = statSync(filePath).mtimeMs;
      if (mtime >= latestMtime) {
        latestMtime = mtime;
        latestArtifactPath = relativePath;
      }
      const json = readMatrixArtifactJson(filePath);
      if (json === null) {
        blockers.push(`unreadable JSON artifact: ${relativePath}`);
        continue;
      }
      const extracted = extractMatrixArtifactsFromJson(json);
      if (extracted.length === 0) {
        if (getStringField(json, "packetKind") === "autoresearch.candidate_result.v1") {
          exportedPackets.add(relativePath);
          addCandidateResultMatrixChartPoint(json, relativePath, matrixChartMetricPoints);
          const cellId = inferMatrixCellIdFromPath(relativePath);
          if (cellId) {
            upsertMatrixCampaignCellSummary(cells, {
              cellId,
              posture: "measured_exported_selectable",
              packetInventory: [relativePath],
              nextLegalAction:
                "Run review_candidate_wave/review_matrix_campaign after packet review.",
            });
          }
        }
        continue;
      }

      for (const item of extracted) {
        artifacts.push({ kind: item.kind, path: relativePath, source: item.source });
        campaignKeys.add(
          getStringField(item.artifact, "objective") ??
            getStringField(item.artifact, "manifestPath") ??
            relativePath,
        );
        const direction = getStringField(item.artifact, "direction");
        if ((direction === "lower" || direction === "higher") && metricDirection === null) {
          metricDirection = direction;
        }
        const followup = getRecordField(item.artifact, "operatorFollowup");
        const primaryMetric = getRecordField(followup, "primaryMetric");
        metricName ??= getStringField(primaryMetric, "name");
        const followupDirection = getStringField(primaryMetric, "direction");
        if (
          (followupDirection === "lower" || followupDirection === "higher") &&
          metricDirection === null
        ) {
          metricDirection = followupDirection;
        }
        metricTarget ??= getNumberField(primaryMetric, "target");

        if (item.kind === "autoresearch.matrix_campaign_plan.v1") {
          summarizeMatrixPlanArtifact(item.artifact, cells, nextLegalActions);
        }
        if (item.kind === "autoresearch.matrix_campaign_runner_contract.v1") {
          summarizeMatrixRunnerArtifact(item.artifact, cells, nextLegalActions);
        }
        if (item.kind === "autoresearch.matrix_campaign_operator_followup.v1") {
          summarizeMatrixFollowupArtifact(item.artifact, cells, nextLegalActions);
        }
        if (item.kind === "autoresearch.matrix_campaign_cockpit.v1") {
          summarizeMatrixCockpitArtifact(item.artifact, cells, nextLegalActions);
        }
        if (
          item.kind === "autoresearch.matrix_campaign_runner_checkpoint.v1" ||
          item.kind === "autoresearch.matrix_campaign_review.v1"
        ) {
          summarizeMatrixFollowupArtifact(followup ?? {}, cells, nextLegalActions);
          const closeoutMetric = addMatrixCloseoutChartPoints(
            item.artifact,
            relativePath,
            matrixChartMetricPoints,
          );
          metricName ??= closeoutMetric.name;
          metricDirection ??= closeoutMetric.direction;
          metricTarget ??= closeoutMetric.target;
          const cockpit = getRecordField(item.artifact, "cockpit");
          if (cockpit) summarizeMatrixCockpitArtifact(cockpit, cells, nextLegalActions);
          completedCellCount = Math.max(
            completedCellCount,
            getNumberField(item.artifact, "completedCellCount") ??
              getNumberField(getRecordField(cockpit, "progress"), "completedCells") ??
              0,
          );
          selectedCellCount = Math.max(
            selectedCellCount,
            getNumberField(item.artifact, "selectedCellCount") ??
              getNumberField(getRecordField(cockpit, "progress"), "selectedCells") ??
              0,
          );
        }

        expectedCellCount = Math.max(
          expectedCellCount,
          getArrayField(item.artifact, "cells").length,
          getNumberField(
            getRecordField(getRecordField(item.artifact, "cockpit"), "progress"),
            "expectedCells",
          ) ?? 0,
          getNumberField(getRecordField(followup, "measurementReviewState"), "expectedCells") ?? 0,
        );
        candidateLaneCount = Math.max(
          candidateLaneCount,
          getArrayField(item.artifact, "lanes").length,
          getArrayField(followup, "lanePacketPaths").length,
        );
      }
    }
  }

  const cellList = [...cells.values()].sort((left, right) =>
    left.cellId.localeCompare(right.cellId),
  );
  const resolvedCellCount = Math.max(expectedCellCount, cellList.length);
  const resolvedCandidateLaneCount = Math.max(
    candidateLaneCount,
    cellList.reduce((total, cell) => total + cell.packetInventory.length, 0),
  );
  const blockerValue = blockers.length;
  const openCandidateReview = buildAutoresearchOpenCandidateReviewPosture({
    cells: cellList,
    exportedPacketCount: exportedPackets.size,
  });
  const chart = buildMatrixCampaignDashboardChart({
    metricPoints: matrixChartMetricPoints,
    completedCellCount,
    resolvedCellCount,
    metricName,
    metricDirection,
  });

  return {
    kind: "autoresearch.matrix_campaign_artifact_summary.v1",
    cwd,
    artifactRoots: artifactRoots.map((root) => relativeAutoresearchPath(cwd, root)),
    artifacts,
    campaignCount: campaignKeys.size,
    cellCount: resolvedCellCount,
    completedCellCount,
    selectedCellCount,
    candidateLaneCount: resolvedCandidateLaneCount,
    exportedPacketCount: exportedPackets.size,
    openCandidateReview,
    metricName,
    metricDirection,
    metricTarget,
    latestArtifactPath,
    cells: cellList,
    chart,
    nextLegalActions: [...nextLegalActions].slice(0, 8),
    exportVisibilityBlockers: {
      name: "export_visibility_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      blockers,
    },
    boundary:
      "Matrix campaign discovery is read-only: it parses local .autoresearch artifacts and never launches peers, runs benchmarks, exports packets, writes evidence, merges, or promotes.",
  };
}

function buildAutoresearchOpenCandidateReviewPosture(input: {
  cells: AutoresearchMatrixCampaignCellSummary[];
  exportedPacketCount: number;
}): AutoresearchOpenCandidateReviewPosture {
  const selectedReviewCells = input.cells.filter((cell) =>
    isOpenCandidateReviewCell(cell, "selected"),
  );
  const unselectedMeasuredCells = input.cells.filter((cell) =>
    isOpenCandidateReviewCell(cell, "unselected"),
  );
  const openCellCount = selectedReviewCells.length + unselectedMeasuredCells.length;
  const packetInventoryItemCount = input.cells.reduce(
    (total, cell) => total + cell.packetInventory.length,
    0,
  );
  const status = openCellCount > 0 ? "owner_review_required" : "no_open_candidate_review";
  const summary =
    status === "owner_review_required"
      ? `Open candidate review posture: ${openCellCount} cell(s) still need owner review; ${selectedReviewCells.length} selected cell(s), ${unselectedMeasuredCells.length} measured/selectable unselected cell(s), ${packetInventoryItemCount} packet inventory reference(s), ${input.exportedPacketCount} unique exported packet(s). Packet counts are review inventory, not live candidate promotion authority.`
      : "Open candidate review posture: no measured candidate cells with packet inventory are waiting for owner review in discovered local artifacts.";

  return {
    kind: "autoresearch.open_candidate_review_posture.v1",
    status,
    openCellCount,
    selectedReviewCellCount: selectedReviewCells.length,
    unselectedMeasuredCellCount: unselectedMeasuredCells.length,
    packetInventoryItemCount,
    uniqueExportedPacketCount: input.exportedPacketCount,
    summary,
    nextLegalAction:
      status === "owner_review_required"
        ? "Run review_candidate_wave/review_matrix_campaign through the owning review surface after packet review; do not keep, discard, finalize, merge, or record evidence from packet counts alone."
        : "No candidate review action is suggested from discovered local matrix artifacts.",
    boundary:
      "Read-only candidate-review posture: local candidate-result packets and packet inventories are projections until owner review decides keep/discard/finalize/evidence.",
  };
}

function isOpenCandidateReviewCell(
  cell: AutoresearchMatrixCampaignCellSummary,
  mode: "selected" | "unselected",
): boolean {
  if (cell.packetInventory.length === 0 && !cell.selectedPacketPath) return false;
  if (mode === "selected") {
    return cell.selectedLaneId !== null || cell.posture === "ready_for_matrix_owner_review";
  }
  return cell.selectedLaneId === null && cell.posture === "measured_exported_selectable";
}
