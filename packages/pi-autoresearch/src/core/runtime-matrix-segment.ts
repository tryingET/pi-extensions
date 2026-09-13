import { getRecordField as rec, getStringField as str } from "./runtime-matrix-fields.ts";
import type {
  AutoresearchMatrixCampaignCellSummary,
  DashboardCampaign,
  DashboardLane,
} from "./runtime-matrix-model.ts";

/** Owner-requested config label and run ID; the label need not become the retained runtime config. */
export function declareMatrixLaneSegment(
  cell: AutoresearchMatrixCampaignCellSummary,
  lane: DashboardLane,
  source: string,
): void {
  if (!/^cell-\d{2}-\d{2}$/u.test(cell.cellId) || !/^candidate-\d{2}$/u.test(lane.laneId)) return;
  const hypothesisId = `${cell.cellId}-${lane.laneId}`;
  lane.segmentIdentity ??= {
    name: `matrix-${hypothesisId}`,
    hypothesisId,
    hypothesis: null,
    source,
    observedSegmentLabels: [],
  };
}

/** Parse only inert owner-generated JSON call data; never invoke it or infer a run from config names. */
export function inspectMatrixMeasurementCall(
  campaign: DashboardCampaign,
  cell: AutoresearchMatrixCampaignCellSummary,
  lane: DashboardLane,
  call: string,
  source: string,
): void {
  const match = /^autoresearch_runtime_run\(([\s\S]*)\)$/u.exec(call);
  if (!match) return;
  declareMatrixLaneSegment(cell, lane, source);
  try {
    const payload: unknown = JSON.parse(match[1]);
    const hypothesis = str(payload, "hypothesis");
    if (
      !lane.segmentIdentity ||
      !hypothesis ||
      str(payload, "cwd") !== campaign.cwd ||
      str(payload, "name") !== lane.segmentIdentity.name ||
      str(payload, "hypothesisId") !== lane.segmentIdentity.hypothesisId ||
      str(payload, "candidateSource") !== "candidate_peer_spawn" ||
      (lane.objective !== null && lane.objective !== hypothesis) ||
      (lane.segmentIdentity.hypothesis !== null && lane.segmentIdentity.hypothesis !== hypothesis)
    )
      throw new Error("identity mismatch");
    lane.segmentIdentity.hypothesis = hypothesis;
    lane.segmentIdentity.source = source;
    lane.objective = hypothesis;
  } catch {
    cell.issues.push(`${source}: invalid/conflicting owner matrix measurement call identity.`);
  }
}

function matchesDeclaredRun(lane: DashboardLane, run: unknown): boolean {
  const declared = lane.segmentIdentity;
  const experiment = rec(run, "experiment");
  return (
    !!declared?.hypothesis &&
    lane.objective === declared.hypothesis &&
    str(experiment, "hypothesisId") === declared.hypothesisId &&
    str(experiment, "hypothesis") === declared.hypothesis
  );
}

/** Local correlation only; record observed config labels in the dashboard model, never the owner data. */
export function matchesMatrixPacketSegment(
  campaign: DashboardCampaign,
  cell: AutoresearchMatrixCampaignCellSummary,
  lane: DashboardLane,
  packet: unknown,
): boolean {
  const name = str(packet, "campaign");
  const closeout = rec(packet, "closeout");
  const config = rec(rec(closeout, "status"), "currentSegment");
  if (!name || str(closeout, "campaign") !== name || str(config, "name") !== name) return false;
  if (!lane.segmentIdentity) return [campaign.objective, cell.objective].includes(name);
  // runtime-run preserves existing config unless explicitly reconfigured. A requested name is not
  // campaign identity: bind the actual run to the declared lane text/ID instead. Expected-path unique
  // ownership, cwd, candidate binding, packet validation and objective-digest checks remain upstream.
  if (
    !matchesDeclaredRun(lane, rec(packet, "candidateRun")) ||
    str(rec(packet, "candidate"), "source") !== "candidate_peer_spawn"
  )
    return false;
  if (!lane.segmentIdentity.observedSegmentLabels.includes(name))
    lane.segmentIdentity.observedSegmentLabels.push(name);
  return true;
}

/** Every historical run must independently match its lane; a matching latest run cannot bless history. */
export function finalizeMatrixLaneObservations(lane: DashboardLane): void {
  const declared = lane.segmentIdentity;
  if (declared) {
    const shared = declared.observedSegmentLabels.filter((name) => name !== declared.name);
    const note = shared.length
      ? `Shared/preconfigured segment label(s) in this lane's packet inventory: ${shared.map((name) => JSON.stringify(name)).join(", ")}. Requested label: ${JSON.stringify(declared.name)}. Configuration labels are not campaign identity or permission to combine measurements; evaluator comparisons remain withheld.`
      : null;
    if (note) lane.verificationReport += ` ${note}`;
    for (const attempt of lane.attempts) {
      if (!matchesDeclaredRun(lane, attempt.raw)) {
        const reason =
          "Quarantined source history: exact declared hypothesisId and lane objective/hypothesis are missing or mismatched.";
        attempt.packetBinding = "quarantined";
        attempt.validMeasurement = false;
        attempt.comparisonKey = null;
        if (!attempt.issues.includes(reason)) attempt.issues.push(reason);
        if (!attempt.comparisonWithheld.includes(reason)) attempt.comparisonWithheld.push(reason);
      }
      if (note) attempt.verificationReport += ` ${note}`;
    }
  }
  lane.missingMeasurementPaths = lane.expectedPacketPaths.filter(
    (p) => !lane.attempts.some((a) => a.validMeasurement && a.sources.includes(p)),
  );
}
