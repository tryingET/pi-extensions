import { escapeHtml as e, outcomeLabel } from "./runtime-dashboard-format.ts";
import type {
  AutoresearchMatrixCampaignCellSummary,
  DashboardCampaign,
  DashboardLane,
} from "./runtime-matrix-model.ts";

interface WorkloadRow {
  cell: AutoresearchMatrixCampaignCellSummary;
  lane: DashboardLane;
}
interface ImplementationCoverage {
  id: string;
  hypothesis: string;
  rows: WorkloadRow[];
  hypotheses: string[];
  conflict: boolean;
}
/** Only exact structured owner declarations: no grouping by sample prose or inferred patch count. */
export function buildImplementationCoverage(campaign: DashboardCampaign): ImplementationCoverage[] {
  const implementations = new Map<string, ImplementationCoverage>();
  if (!campaign.identityResolved) return [];
  for (const cell of campaign.cells)
    for (const lane of cell.lanes) {
      const context = lane.segmentIdentity?.matrixContext;
      if (
        !context ||
        cell.issues.length ||
        context.taskId !== campaign.taskId ||
        context.objective !== campaign.objective ||
        context.cellId !== cell.cellId ||
        context.laneId !== lane.laneId ||
        context.hypothesis !== cell.hypothesis
      )
        continue;
      // A reused implementation label with another hypothesis is a conflict, not a merged lane.
      const key = context.implementationId;
      const entry = implementations.get(key) ?? {
        id: context.implementationId,
        hypothesis: context.hypothesis,
        hypotheses: [],
        conflict: false,
        rows: [],
      };
      entry.rows.push({ cell, lane });
      entry.hypotheses = [...new Set([...entry.hypotheses, context.hypothesis])].sort();
      entry.conflict = entry.hypotheses.length > 1;
      entry.hypothesis = entry.conflict
        ? "Conflicting implementation declarations"
        : entry.hypotheses[0];
      implementations.set(key, entry);
    }
  return [...implementations.values()];
}
function reportState({ cell, lane }: WorkloadRow): string {
  const eligible = lane.attempts.filter((a) => a.validMeasurement);
  const outcomes = [...new Set(lane.attempts.map((a) => outcomeLabel(a.outcome)))];
  if (!lane.attempts.length)
    return `No data · ${cell.stageNote} Plan/report: ${lane.reportedState}. Admission and launch unverified.`;
  const quarantined = lane.attempts.filter((a) => !a.validMeasurement).length;
  return `${eligible.length} eligible local report(s) · ${quarantined} unscoreable/quarantined report(s) · ${outcomes.join("; ")}. ${lane.missingMeasurementPaths.length ? "Partial coverage — expected slot lacks a valid measurement." : "Reported coverage, not success or independent samples."}`;
}
export function renderImplementationCoverage(campaigns: DashboardCampaign[]): string {
  return `<details id="workload-coverage"><summary>Implementation lanes & nested workload coverage</summary><p class="caption">Declared implementations ≠ comparison cells ≠ patches ≠ effects. Each workload remains separate; no pooled gain or implied admission. Segment-level empirical reports are not independent implementation verdicts.</p>${
    campaigns
      .map((campaign) => {
        const groups = buildImplementationCoverage(campaign);
        return `<section><h3>${e(campaign.taskId ? `AK${campaign.taskId}` : "Unresolved task")} · ${e(campaign.objective)}</h3>${groups.length ? groups.map((group) => `<details data-implementation="${e(group.id)}"><summary>${e(group.id)} · ${e(group.hypothesis)} · ${new Set(group.rows.map((r) => r.cell.cellId)).size} workload row(s)</summary><table><caption>Exact declared workload rows; source reports only</caption><thead><tr><th scope="col">Workload / cell / sample lane</th><th scope="col">Observation & coverage</th></tr></thead><tbody>${group.rows.map((row) => `<tr data-workload-row><th scope="row">${e(row.cell.scenario ?? "Scenario unknown")}<small> · ${e(row.cell.cellId)} / ${e(row.lane.laneId)}</small></th><td>${e(group.conflict ? `Conflicting implementation declarations — coverage withheld. Hypotheses: ${group.hypotheses.join("; ")}.` : reportState(row))}</td></tr>`).join("")}</tbody></table></details>`).join("") : '<p class="empty">Implementation/workload declarations unavailable. Historical unknowns are not inferred from prompts or packet counts.</p>'}</section>`;
      })
      .join("") || '<p class="empty">No campaign data. Coverage unknown.</p>'
  }</details>`;
}
