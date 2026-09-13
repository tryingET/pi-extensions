import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  cellFor,
  createCampaign,
  finalizeCell,
  summarizeMatrixArtifact,
} from "./runtime-matrix-cells.ts";
import {
  bindingIdentity,
  buildComparisonGroups,
  type DashboardPacketProjection,
  digest,
  projectCandidatePacket,
} from "./runtime-matrix-chart.ts";
import {
  collectJsonFiles,
  extractMatrixArtifactsFromJson,
  MAX_DISCOVERY_BYTES,
  getNumberField as num,
  readMatrixArtifactJson,
  getRecordField as rec,
  relativeAutoresearchPath,
  getStringField as str,
} from "./runtime-matrix-fields.ts";
import { projectLevel4Observation } from "./runtime-matrix-level4.ts";
import type {
  AutoresearchMatrixCampaignArtifactReference,
  AutoresearchMatrixCampaignArtifactSummary,
  DashboardAttempt,
  DashboardCampaign,
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
  ".autoresearch/dashboard/level4",
  ".autoresearch/candidate-wave",
] as const;

/** Read-only display projection. Identity is exact task/canonical cwd/objective, never cell ID alone. */
export function discoverAutoresearchMatrixCampaignArtifacts(
  cwdInput: string,
): AutoresearchMatrixCampaignArtifactSummary {
  const issues: string[] = [];
  let cwd = path.resolve(cwdInput);
  try {
    cwd = realpathSync(cwd);
  } catch (error) {
    issues.push(`Campaign cwd unavailable; discovery cannot establish identity: ${String(error)}`);
  }
  const campaigns = new Map<string, DashboardCampaign>();
  const artifacts: AutoresearchMatrixCampaignArtifactReference[] = [];
  const packets = new Map<string, { value: unknown; projection: DashboardPacketProjection }>();
  const observations: DashboardCampaign[] = [];
  let latestArtifactPath: string | null = null;
  let latestMtime = -Infinity;
  let bytes = 0;
  const roots = [
    ...AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_ROOTS,
    ".autoresearch/candidate-result.json",
  ];
  for (const file of collectJsonFiles(cwd, roots, issues)) {
    const source = relativeAutoresearchPath(cwd, file);
    try {
      const read = readMatrixArtifactJson(cwd, file);
      bytes += read.bytes;
      if (bytes > MAX_DISCOVERY_BYTES) {
        issues.push("32 MiB discovery budget reached; inventory is incomplete.");
        break;
      }
      if (read.modifiedAt > latestMtime) {
        latestMtime = read.modifiedAt;
        latestArtifactPath = source;
      }
      const value = read.value;
      if (source.startsWith(".autoresearch/dashboard/level4/")) {
        const observation = projectLevel4Observation(value, cwd, source);
        observations.push(observation);
        artifacts.push({
          kind: "autoresearch.level4_dashboard_observation.v1",
          path: source,
          source: "root",
        });
        continue;
      }
      if (str(value, "packetKind") === "autoresearch.candidate_result.v1") {
        const projection = projectCandidatePacket(value, source, null);
        packets.set(source, { value, projection });
        issues.push(...projection.issues.map((v) => `${source}: ${v}`));
        continue;
      }
      const extracted = extractMatrixArtifactsFromJson(value);
      if (!extracted.length) {
        issues.push(`${source}: unrecognized or malformed artifact; not scoreable.`);
        continue;
      }
      for (const item of extracted) {
        artifacts.push({ kind: item.kind, path: source, source: item.source });
        const task = num(item.artifact, "taskId");
        const taskId = task !== null && Number.isSafeInteger(task) && task > 0 ? task : null;
        const objective = str(item.artifact, "objective");
        const ownerCwd = str(item.artifact, "cwd");
        const matchingCwd =
          ownerCwd !== null && path.isAbsolute(ownerCwd) && realpathSync(ownerCwd) === cwd;
        const resolved = !!(taskId && objective && matchingCwd);
        const key = resolved
          ? JSON.stringify([taskId, cwd, objective])
          : `unresolved:${source}:${item.source}`;
        const campaign =
          campaigns.get(key) ?? createCampaign(key, cwd, resolved ? taskId : null, objective);
        if (!resolved)
          campaign.issues.push(
            `${source}: task/cwd/objective identity unresolved; isolated, not comparable.`,
          );
        campaign.ownerReports.push(item.artifact);
        summarizeMatrixArtifact(campaign, item.artifact, source);
        campaigns.set(key, campaign);
      }
    } catch (e) {
      issues.push(`${source}: ${String(e)}`);
    }
  }
  // Latest observation is one owner snapshot, not a new authority or a merge-by-mtime winner.
  for (const observation of observations) {
    const previous = campaigns.get(observation.key);
    if (previous?.declaredLevel === "Level 4 observation") {
      previous.issues.push("Duplicate Level 4 identity; reconciliation required.");
      previous.identityResolved = false;
    } else if (previous) {
      observation.ownerReports.unshift(...previous.ownerReports);
      observation.sourcePaths.unshift(...previous.sourcePaths);
      // Recover plan narrative without replacing the observed lane/cursor posture.
      for (const cell of previous.cells) {
        const target = observation.cells.find((c) => c.cellId === cell.cellId);
        if (!target) observation.cells.push(cell);
        else {
          target.hypothesis = cell.hypothesis;
          target.prediction = cell.prediction;
          target.rejectionCriteria = cell.rejectionCriteria;
          target.scenario = cell.scenario;
          target.sources.push(...cell.sources);
          target.issues.push(...cell.issues);
          for (const lane of cell.lanes)
            if (
              !target.lanes.some(
                (l) =>
                  l.laneId === lane.laneId ||
                  l.expectedPacketPaths.some((p) => lane.expectedPacketPaths.includes(p)),
              )
            )
              target.lanes.push(lane);
        }
      }
      campaigns.set(observation.key, observation);
    } else campaigns.set(observation.key, observation);
  }
  const list = [...campaigns.values()];
  const unresolvedPackets = attachPackets(list, packets, issues);
  for (const campaign of list) for (const cell of campaign.cells) finalizeCell(cell);
  issues.push(...list.flatMap((c) => [...c.issues, ...c.cells.flatMap((cell) => cell.issues)]));
  const unresolvedInventory = new Map<string, DashboardAttempt[]>();
  for (const attempt of unresolvedPackets)
    for (const source of attempt.sources) {
      const inventory = unresolvedInventory.get(source) ?? [];
      inventory.push(attempt);
      unresolvedInventory.set(source, inventory);
    }
  // Compatibility inventory for review/cleanup consumers. Never promote it to measured/selectable.
  const unresolvedCells = [...unresolvedInventory].map(([source]) => {
    const c = createCampaign(`unresolved:${source}`, cwd, null, null);
    const cell = cellFor(c, `unresolved source: ${source}`);
    cell.packetInventory = [source];
    cell.sources = [source];
    cell.posture = "unresolved_inventory";
    cell.stageNote =
      "Unresolved source inventory; neither planned execution nor a selectable measurement.";
    cell.nextLegalAction =
      "Controller: reconcile packet identity and validation before owner review.";
    return cell;
  });
  const cells = [...list.flatMap((c) => c.cells), ...unresolvedCells];
  const lanes = cells.flatMap((c) => c.lanes);
  const validAttempts = lanes.flatMap((l) => l.attempts).filter((a) => a.validMeasurement);
  const coverageGapLaneCount = lanes.reduce((n, l) => n + l.missingMeasurementPaths.length, 0);
  if (coverageGapLaneCount)
    issues.push(
      `${coverageGapLaneCount} expected packet inventory slot(s) lack a valid measurement.`,
    );
  const blockers = [...new Set(issues)];
  const reviewCells = cells.filter(
    (c) =>
      c.measuredPacketCount > 0 ||
      c.selectedLaneId !== null ||
      c.posture === "unresolved_inventory",
  );
  const selected = cells.filter((c) => c.selectedLaneId !== null).length;
  return {
    kind: "autoresearch.matrix_campaign_artifact_summary.v1",
    cwd,
    artifactRoots: roots,
    artifacts,
    campaigns: list,
    comparisonGroups: buildComparisonGroups(list),
    unresolvedPackets,
    campaignCount: list.length,
    cellCount: cells.length,
    completedCellCount: list.reduce((n, c) => n + c.controllerCompletedCellCount, 0),
    selectedCellCount: selected,
    candidateLaneCount: lanes.length,
    exportedPacketCount: packets.size,
    openCandidateReview: {
      kind: "autoresearch.open_candidate_review_posture.v1",
      status: reviewCells.length ? "owner_review_required" : "no_open_candidate_review",
      openCellCount: reviewCells.length,
      selectedReviewCellCount: selected,
      unselectedMeasuredCellCount: reviewCells.filter(
        (c) => !c.selectedLaneId && c.measuredPacketCount > 0,
      ).length,
      packetInventoryItemCount: cells.reduce((n, c) => n + c.packetInventory.length, 0),
      uniqueExportedPacketCount: packets.size,
      summary:
        "Open candidate review posture: packet counts are review inventory, not effects, independent samples, or selection authority. Unresolved inventory requires source review; it is not measured/selectable.",
      nextLegalAction:
        "Controller: reconcile source identity and valid measurements before owner review.",
      boundary:
        "Owner review, keep/discard, cleanup and evidence writes are separate gated actions.",
    },
    metricName: null,
    metricDirection: null,
    metricTarget: null,
    latestArtifactPath,
    cells,
    chart: {
      kind: "autoresearch.matrix_campaign_dashboard_chart.v1",
      mode: "empty",
      metricName: "",
      metricUnit: "",
      direction: "lower",
      points: [],
      sourceDescription:
        "Aggregate comparison withheld; consume comparisonGroups with exact identities.",
      emptyMessage: "No global best or mixed-metric series.",
    },
    nextLegalActions: list.map((c) => c.nextAction),
    observedMeasurementCount: new Set(validAttempts.map((a) => a.id)).size,
    coverageGapLaneCount,
    exportVisibilityBlockers: {
      name: "export_visibility_blockers",
      direction: "lower",
      target: 0,
      value: blockers.length,
      status: blockers.length ? "blocked" : "target_met",
      blockers,
    },
    boundary:
      "Matrix campaign discovery is read-only. Zero missing packets or visibility issues does not establish campaign success. No launch, benchmark, owner write, or promotion is performed.",
  };
}

import { matchesMatrixPacketSegment } from "./runtime-matrix-segment.ts";

function invalidate(attempt: DashboardAttempt, reason: string): void {
  attempt.validMeasurement = false;
  attempt.comparisonKey = null;
  attempt.issues.push(reason);
  attempt.comparisonWithheld.push(reason);
}
function attachPackets(
  campaigns: DashboardCampaign[],
  packets: Map<string, { value: unknown; projection: DashboardPacketProjection }>,
  issues: string[],
): DashboardAttempt[] {
  const used = new Set<string>();
  attachHistoricalPacketPaths(campaigns, packets);
  const owners = new Map<string, Set<string>>();
  for (const c of campaigns)
    for (const cell of c.cells)
      for (const lane of cell.lanes)
        for (const p of lane.expectedPacketPaths) {
          const refs = owners.get(p) ?? new Set<string>();
          refs.add(`${c.key}:${cell.cellId}:${lane.laneId}`);
          owners.set(p, refs);
        }
  // Identical exported packet bodies are duplicates, not additional samples.
  const duplicates = new Map<string, string[]>();
  for (const [p, packet] of packets) {
    const key = packetDuplicateKey(packet.value);
    const paths = duplicates.get(key) ?? [];
    paths.push(p);
    duplicates.set(key, paths);
  }
  for (const c of campaigns)
    for (const cell of c.cells)
      for (const lane of cell.lanes) {
        for (const p of [...lane.expectedPacketPaths, ...lane.historyPacketPaths]) {
          const data = packets.get(p);
          if (!data) continue;
          used.add(p);
          const packet = projectCandidatePacket(data.value, p, cell.scenario);
          const reasons: string[] = [];
          if (!c.identityResolved || packet.cwd !== c.cwd)
            reasons.push("Campaign/packet identity unresolved or cwd mismatch.");
          if ((owners.get(p)?.size ?? 0) > 1)
            reasons.push("Packet path claimed by multiple campaign/cell/lane identities.");
          if ((duplicates.get(packetDuplicateKey(data.value))?.length ?? 0) > 1)
            reasons.push("Duplicate packet source; controller reconciliation required.");
          if (cell.issues.length)
            reasons.push("Conflicting cell identity; source reconciliation required.");
          // Owner packets don't carry AK taskId: exact expected path is correlation, never authentication.
          if (!matchesMatrixPacketSegment(c, cell, lane, data.value))
            reasons.push(
              "Packet segment does not match the exact declared campaign/cell/lane identity; historical source unresolved.",
            );
          if (
            packet.objectiveDigest &&
            ![c.objective, cell.objective]
              .filter((o): o is string => o !== null)
              .some((o) => createHash("sha256").update(o).digest("hex") === packet.objectiveDigest)
          )
            reasons.push("Stale/mismatched objective digest.");
          for (const a of packet.attempts) {
            if (
              lane.segmentIdentity &&
              str(rec(a.raw, "experiment"), "hypothesisId") !== lane.segmentIdentity.hypothesisId
            ) {
              a.packetBinding = "quarantined";
              invalidate(
                a,
                "Quarantined source history: hypothesisId does not match this exact matrix lane.",
              );
            }
            a.verificationReport = lane.verificationReport;
            for (const reason of reasons) invalidate(a, reason);
            const previous = lane.attempts.find((v) => v.id === a.id);
            if (previous) {
              previous.sources = [...new Set([...previous.sources, ...a.sources])];
              if (!a.validMeasurement) for (const reason of a.issues) invalidate(previous, reason);
            } else lane.attempts.push(a);
          }
          issues.push(...reasons.map((r) => `${p}: ${r}`));
        }
        lane.attempts.sort(
          (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.id.localeCompare(b.id),
        );
        lane.missingMeasurementPaths = lane.expectedPacketPaths.filter(
          (p) => !lane.attempts.some((a) => a.validMeasurement && a.sources.includes(p)),
        );
      }
  return [...packets]
    .filter(([p]) => !used.has(p))
    .flatMap(([p, data]) => {
      issues.push(`${p}: no unambiguous planned campaign/lane binding; comparison withheld.`);
      return data.projection.attempts.map((a) => {
        invalidate(a, "Unresolved campaign/lane identity.");
        return a;
      });
    });
}

function packetDuplicateKey(value: unknown): string {
  // Changing report prose cannot turn the same measured run into another independent export.
  return digest({
    cwd: str(value, "cwd"),
    campaign: str(value, "campaign"),
    candidate: rec(value, "candidate"),
    run: rec(value, "candidateRun"),
  });
}
function attachHistoricalPacketPaths(
  campaigns: DashboardCampaign[],
  packets: Map<string, { value: unknown; projection: DashboardPacketProjection }>,
): void {
  const allExpected = new Set(
    campaigns.flatMap((c) =>
      c.cells.flatMap((cell) => cell.lanes.flatMap((lane) => lane.expectedPacketPaths)),
    ),
  );
  for (const [source, packet] of packets) {
    if (allExpected.has(source)) continue;
    const identity = bindingIdentity(rec(packet.value, "candidate"));
    if (!identity) continue;
    const matches = campaigns.flatMap((c) =>
      c.cells.flatMap((cell) =>
        cell.lanes.filter(
          (lane) =>
            c.identityResolved &&
            packet.projection.cwd === c.cwd &&
            matchesMatrixPacketSegment(c, cell, lane, packet.value) &&
            lane.expectedPacketPaths.some((p) => {
              const anchor = packets.get(p);
              return (
                anchor?.projection.valid &&
                bindingIdentity(rec(anchor.value, "candidate")) === identity
              );
            }),
        ),
      ),
    );
    if (matches.length === 1) matches[0].historyPacketPaths.push(source);
  }
}
