import path from "node:path";
import {
  getArrayField as arr,
  getNumberField as num,
  getRecordField as rec,
  getStringField as str,
  getStringArrayField as strings,
} from "./runtime-matrix-fields.ts";
import {
  type AutoresearchMatrixCampaignCellSummary,
  classifyAutoresearchMatrixCellStage,
  type DashboardCampaign,
  type DashboardLane,
} from "./runtime-matrix-model.ts";

import {
  declareMatrixLaneSegment,
  finalizeMatrixLaneObservations,
  inspectMatrixMeasurementCall,
} from "./runtime-matrix-segment.ts";

export function createCampaign(
  key: string,
  cwd: string,
  taskId: number | null,
  objective: string | null,
): DashboardCampaign {
  return {
    key,
    taskId,
    cwd,
    objective,
    identityResolved: taskId !== null && objective !== null,
    declaredLevel: taskId !== null && objective !== null ? "Level 1/2 artifacts" : "unresolved",
    execution: "unverified",
    observedAt: null,
    sourcePaths: [],
    reportedPosture: null,
    controllerCompletedActionCount: null,
    controllerCompletedCellCount: 0,
    nextActor: "Controller / operator",
    nextAction: "Inspect source identity and owner gates before acting.",
    cells: [],
    issues: [],
    ownerReports: [],
  };
}
export function cellFor(
  campaign: DashboardCampaign,
  id: string,
): AutoresearchMatrixCampaignCellSummary {
  let cell = campaign.cells.find((v) => v.cellId === id);
  if (!cell) {
    cell = {
      campaignKey: campaign.key,
      cellId: id,
      scenario: null,
      hypothesis: null,
      prediction: null,
      rejectionCriteria: null,
      objective: null,
      sources: [],
      lanes: [],
      issues: [],
      posture: "planned",
      stage: "planned_not_launched",
      stageNote: "No launch evidence.",
      laneProgress: "not reported",
      selectedLaneId: null,
      selectedPacketPath: null,
      candidatePacketDirectory: null,
      packetInventory: [],
      measuredPacketCount: 0,
      latestOutcomeClass: null,
      latestOutcomeLabel: null,
      latestMetric: null,
      nextLegalAction: "Controller: inspect prepared gates; launch unverified.",
    };
    campaign.cells.push(cell);
  }
  return cell;
}
export function laneFor(
  cell: AutoresearchMatrixCampaignCellSummary,
  id: string,
  packet?: string | null,
): DashboardLane {
  let lane = cell.lanes.find(
    (v) => v.laneId === id || (!!packet && v.expectedPacketPaths.includes(packet)),
  );
  if (!lane) {
    lane = {
      laneId: id,
      segmentIdentity: null,
      objective: null,
      promptTitle: null,
      promptMarkdown: null,
      expectedPacketPaths: [],
      historyPacketPaths: [],
      reportedState: "planned",
      verificationReport: "No controller verification report.",
      attempts: [],
      missingMeasurementPaths: [],
    };
    cell.lanes.push(lane);
  }
  if (packet && !lane.expectedPacketPaths.includes(packet)) lane.expectedPacketPaths.push(packet);
  return lane;
}
export function packetPath(campaign: DashboardCampaign, value: string | null): string | null {
  if (!value) return null;
  const relative = path
    .relative(campaign.cwd, path.resolve(campaign.cwd, value))
    .split(path.sep)
    .join("/");
  if (!relative.startsWith(".autoresearch/") || relative.includes("../")) {
    campaign.issues.push(`Packet reference outside bounded discovery: ${value}`);
    return null;
  }
  return relative;
}
function addPackets(
  campaign: DashboardCampaign,
  cell: AutoresearchMatrixCampaignCellSummary,
  packets: string[],
) {
  for (const value of packets) {
    const packet = packetPath(campaign, value);
    if (packet)
      laneFor(
        cell,
        path.basename(packet).replace(/\.candidate-result\.json$|\.json$/u, ""),
        packet,
      );
  }
}
function mergeText(
  cell: AutoresearchMatrixCampaignCellSummary,
  key: "scenario" | "hypothesis" | "objective" | "prediction" | "rejectionCriteria",
  incoming: string | null,
) {
  if (cell[key] && incoming && cell[key] !== incoming)
    cell.issues.push(`Conflicting ${key}; source reconciliation required.`);
  else if (incoming) cell[key] = incoming;
}

/** Fold only artifacts already bound to one exact task/cwd/objective. No posture ranking. */
export function summarizeMatrixArtifact(
  campaign: DashboardCampaign,
  artifact: unknown,
  source: string,
  depth = 0,
): void {
  if (depth > 3) return;
  if (!campaign.sourcePaths.includes(source)) campaign.sourcePaths.push(source);
  campaign.nextAction = str(artifact, "nextStep") ?? campaign.nextAction;
  const count =
    num(artifact, "completedCellCount") ??
    num(rec(artifact, "progress"), "completedCells") ??
    num(rec(artifact, "measurementReviewState"), "completedCells");
  if (count !== null && Number.isSafeInteger(count) && count >= 0)
    campaign.controllerCompletedCellCount = Math.max(count, campaign.controllerCompletedCellCount);
  for (const row of [...arr(artifact, "cells"), ...arr(artifact, "cellRows")]) {
    const id = str(row, "cellId");
    if (!id) {
      campaign.issues.push(`${source}: cell lacks cellId.`);
      continue;
    }
    const cell = cellFor(campaign, id);
    if (!cell.sources.includes(source)) cell.sources.push(source);
    mergeText(cell, "scenario", str(row, "scenario"));
    mergeText(cell, "hypothesis", str(row, "hypothesis"));
    mergeText(cell, "objective", str(row, "objective"));
    mergeText(cell, "prediction", str(row, "prediction") ?? str(row, "expectedPrimaryEffect"));
    mergeText(cell, "rejectionCriteria", str(row, "rejectionCriteria"));
    cell.posture = str(row, "posture") ?? str(row, "managedWavePosture") ?? cell.posture;
    cell.laneProgress = str(row, "laneProgress") ?? cell.laneProgress;
    cell.selectedLaneId = str(row, "selectedLaneId") ?? cell.selectedLaneId;
    cell.selectedPacketPath = str(row, "selectedPacketPath") ?? cell.selectedPacketPath;
    cell.candidatePacketDirectory =
      str(row, "candidatePacketDirectory") ?? cell.candidatePacketDirectory;
    cell.nextLegalAction = str(row, "nextLegalAction") ?? cell.nextLegalAction;
    // cellRows.packetInventory is owner-formatted display text, never a filesystem path.
    addPackets(campaign, cell, strings(row, "candidateResultPacketPaths"));
  }
  for (const row of [
    ...arr(artifact, "lanes"),
    ...arr(artifact, "lanePacketPaths"),
    ...arr(artifact, "packetInventory"),
  ]) {
    const id = str(row, "cellId");
    if (!id) continue;
    const cell = cellFor(campaign, id);
    if (!cell.sources.includes(source)) cell.sources.push(source);
    const packet = packetPath(
      campaign,
      str(row, "candidateResultPacketPath") ?? str(row, "packetPath"),
    );
    const laneId =
      str(row, "laneId") ??
      (packet
        ? path.basename(packet).replace(/\.candidate-result\.json$|\.json$/u, "")
        : "unspecified lane");
    const lane = laneFor(cell, laneId, packet);
    const kind = str(artifact, "kind");
    if (
      [
        "autoresearch.matrix_campaign_runner_contract.v1",
        "autoresearch.matrix_campaign_cockpit.v1",
        "autoresearch.matrix_campaign_operator_followup.v1",
      ].includes(kind ?? "")
    )
      declareMatrixLaneSegment(cell, lane, source);
    const objective = str(row, "objective");
    if (objective && lane.objective && objective !== lane.objective)
      cell.issues.push(`${source}: conflicting declared lane objective.`);
    else if (objective) lane.objective = objective;
    if (kind === "autoresearch.matrix_campaign_runner_contract.v1") {
      for (const call of strings(row, "measurementPlan"))
        inspectMatrixMeasurementCall(campaign, cell, lane, call, source);
    }
    lane.reportedState = str(row, "state") ?? lane.reportedState;
    if (str(artifact, "kind") === "autoresearch.matrix_campaign_runner_contract.v1")
      cell.posture = "locked_until_checkpoint";
    mergeText(cell, "objective", str(row, "cellObjective"));
  }
  const commandPacket = rec(artifact, "controllerCommandPacket");
  if (str(commandPacket, "kind") === "autoresearch.matrix_cell_controller_command_packet.v1") {
    for (const row of arr(commandPacket, "cells")) {
      const id = str(row, "cellId");
      if (!id) continue;
      const cell = cellFor(campaign, id);
      for (const item of arr(row, "lanes")) {
        const laneId = str(item, "laneId");
        if (!laneId) continue;
        const packet = packetPath(campaign, str(item, "candidateResultPacketPath"));
        const lane = laneFor(cell, laneId, packet);
        const call = str(item, "metricRunCall");
        if (call) inspectMatrixMeasurementCall(campaign, cell, lane, call, source);
      }
    }
  }
  for (const key of ["cockpit", "operatorFollowup"]) {
    const child = rec(artifact, key);
    if (child) summarizeMatrixArtifact(campaign, child, source, depth + 1);
  }
}
export function finalizeCell(cell: AutoresearchMatrixCampaignCellSummary): void {
  for (const lane of cell.lanes) finalizeMatrixLaneObservations(lane);
  cell.packetInventory = [...new Set(cell.lanes.flatMap((l) => l.expectedPacketPaths))];
  cell.measuredPacketCount = new Set(
    cell.lanes.flatMap((l) =>
      l.attempts.filter((a) => a.validMeasurement).flatMap((a) => a.sources),
    ),
  ).size;
  const stage = classifyAutoresearchMatrixCellStage({
    posture: cell.posture,
    measuredPacketCount: cell.measuredPacketCount,
  });
  cell.stage = stage.stage;
  cell.stageNote = stage.note;
}
