import {
  detail,
  escapeHtml as e,
  list,
  formatAutoresearchDashboardNumber as number,
  outcomeLabel,
  outcomeTone,
  rawDetail,
} from "./runtime-dashboard-format.ts";
import {
  formatAutoresearchAuthorityHandoffLines,
  formatAutoresearchGuidedCandidateJourneyLines,
  formatAutoresearchSetupGuideLines,
} from "./runtime-dashboard-guidance.ts";
import type { ResearchObservatoryModel } from "./runtime-dashboard-model.ts";
import { buildPerformanceScopes } from "./runtime-dashboard-performance-model.ts";
import type {
  DashboardAttempt,
  DashboardCampaign,
  DashboardComparisonGroup,
} from "./runtime-matrix-model.ts";
import { buildAutoresearchMetricReadinessReview } from "./runtime-metric-readiness.ts";
import type { AutoresearchRuntimeStatus, AutoresearchSegmentCloseout } from "./runtime-model.ts";

export function renderLevelGuide(): string {
  const levels = [
    [
      "01",
      "Measured substrate",
      "Explicit visible lanes and controller measurement. Local packets remain review inputs.",
      "Decision 42",
    ],
    [
      "02",
      "Checkpointed glue",
      "Checkpointed bind / measure / export / review. Launch and dangerous transitions require exact owner gates.",
      "Decision 44",
    ],
    [
      "03",
      "Manifest-governed",
      "Accepted task/cwd manifest, typed policy, hashed transition receipts. No inferred authorization.",
      "Decision 45",
    ],
    [
      "04",
      "Matrix coordination",
      "Current runner returns plans, blockers and controller cursor assertions. It does not dispatch actions.",
      "Current owner contract",
    ],
  ];
  return `<section aria-labelledby="levels"><h2 id="levels" class="guide-title">Levels 1 → 4 <span>Requirements, not permissions</span></h2><ol class="levels">${levels.map(([n, title, copy, source]) => `<li><span class="folio">${n}</span><h3>${e(title)}</h3><p>${e(copy)}</p><small>${e(source)}</small></li>`).join("")}</ol></section>`;
}

export function renderAttempt(a: DashboardAttempt): string {
  const trust = a.validMeasurement ? "Valid local measurement" : "Unverified / not scoreable";
  return `<li class="attempt"><div class="attempt-heading"><strong class="${outcomeTone(a.outcome)}">${e(outcomeLabel(a.outcome))}</strong><span class="measurement">${e(number(a.metric, a.identity.metricUnit ?? ""))}</span></div>
  <p>${e(a.description)}</p><p class="caption">${e(trust)} · metric ${e(a.identity.metricName ?? "unknown")} · ${e(a.identity.direction ?? "unknown direction")} · lifecycle disposition: <b>${e(a.disposition)}</b></p>
  <p class="caption">${e(a.timestamp !== null && a.timestamp > 0 && a.timestamp <= 8.64e15 ? new Date(a.timestamp).toISOString() : "Time not recorded")} · iteration ${e(a.iteration ?? "not recorded")} · checks: ${e(a.checks ?? "unverified")}</p>
  ${a.hypothesis ? `<p><b>Run hypothesis.</b> ${e(a.hypothesis)}</p>` : ""}${a.prediction ? `<p><b>Run prediction.</b> ${e(a.prediction)}</p>` : ""}
  ${a.comparisonWithheld.length ? `<p class="caption uncertain">${e(a.comparisonWithheld.join(" "))}</p>` : ""}
  ${detail("Attempt source & validation", `<p>${e(a.verificationReport)}</p><p>Schema: ${a.schemaValid ? "owner validator passed" : "invalid"}; run lineage: ${a.lineageValid ? "structurally matched" : "unverified"}. Provenance: local, unauthenticated projection.</p>${list(a.sources)}${list(a.issues)}${rawDetail("Raw run report", a.raw)}`)}</li>`;
}

export function renderCampaign(c: DashboardCampaign, index: number): string {
  return `<article class="campaign" aria-labelledby="campaign-${index}"><header class="campaign-header"><p class="eyebrow">${e(c.taskId ? `AK${c.taskId}` : "Unresolved task")} / ${e(c.declaredLevel)}</p><h2 id="campaign-${index}">${e(c.objective ?? "Objective not specified")}</h2><p class="caption">${e(c.cwd)}</p></header>
  <div class="campaign-posture"><p><b>Declared autonomy.</b> ${e(c.declaredLevel)}. This display grants no execution permission.</p><p><b>Actual execution.</b> ${e(c.execution)}. ${c.execution === "unverified" ? "Prepared contracts do not establish launch." : "Waiting observations and receipts are not executed actions."}</p><p><b>Owner report.</b> ${e(c.reportedPosture ?? "No current owner runtime report")} · observed ${e(c.observedAt ?? "time not reported")}</p>${c.controllerCompletedActionCount !== null ? `<p><b>Controller cursor assertion:</b> ${c.controllerCompletedActionCount} completed actions reported; not verified effects.</p>` : ""}<p><b>Controller-reported completed cells:</b> ${c.controllerCompletedCellCount}. Not packet coverage or success.</p></div>
  <p class="next-inline"><b>${e(c.nextActor)} →</b> ${e(c.nextAction)}</p>
  ${
    c.cells.length
      ? c.cells
          .map(
            (
              cell,
            ) => `<section class="experiment"><p class="eyebrow">Experiment / ${e(cell.cellId)} · ${e(cell.scenario ?? "Scenario not specified")}</p><h3>${e(cell.hypothesis ?? "Hypothesis not specified")}</h3>
  ${cell.objective ? `<p>${e(cell.objective)}</p>` : ""}<dl class="propositions"><div><dt>Prediction</dt><dd>${e(cell.prediction ?? "not specified")}</dd></div><div><dt>Rejection criteria</dt><dd>${e(cell.rejectionCriteria ?? "not specified")}</dd></div></dl><p class="caption">A threshold alone is not a full falsification rule.</p>
  <p class="status-line">${e(cell.stageNote)}</p><p class="caption">Controller lane progress: ${e(cell.laneProgress)} · selected lane assertion: ${e(cell.selectedLaneId ?? "none")}</p>
  <div class="lanes">${cell.lanes.map((lane) => `<section class="lane"><h4>${e(lane.laneId)}</h4>${lane.promptTitle ? `<p><b>${e(lane.promptTitle)}</b></p>` : ""}${lane.objective ? `<p>${e(lane.objective)}</p>` : ""}${lane.promptMarkdown ? detail("Prepared lane prompt (not execution)", `<pre>${e(lane.promptMarkdown)}</pre>`) : ""}<p class="caption">Plan/report: ${e(lane.reportedState)}. Not live execution.</p><p>${lane.expectedPacketPaths.length} expected inventory slot(s) · ${lane.missingMeasurementPaths.length} without valid measurements</p>${lane.attempts.length ? `<ol class="attempts">${lane.attempts.map(renderAttempt).join("")}</ol>` : '<p class="empty">Untested — no attempt evidence discovered.</p>'}${detail("Planned packet paths", list(lane.expectedPacketPaths))}</section>`).join("") || '<p class="empty">No lane inventory specified; coverage unknown.</p>'}</div>
  ${detail("Experiment sources & conflicts", list([...cell.sources, ...cell.issues]))}</section>`,
          )
          .join("")
      : '<p class="empty">No planned experiment inventory in this source.</p>'
  }
  ${detail("Campaign audit & owner-tail reports", `${list(c.sourcePaths)}${list(c.issues)}<p>Embedded calls and tokens are inert source text, not authorization or a resume cursor. Journal row counts are not effects.</p>${rawDetail("Raw owner reports", c.ownerReports)}`)}</article>`;
}

function renderGroup(group: DashboardComparisonGroup, index: number): string {
  const identity = group.identity;
  const attempts = group.attempts;
  // A labeled dot plot, not a trend across heterogeneous or time-ordered subjects.
  const values = attempts.map((a) => a.metric as number);
  const min = values.reduce((a, b) => Math.min(a, b));
  const max = values.reduce((a, b) => Math.max(a, b));
  const scale = Math.max(1, Math.abs(min), Math.abs(max));
  const range = max / scale - min / scale || 1;
  const svg =
    attempts.length > 1
      ? `<svg class="plot" viewBox="0 0 560 100" role="img" aria-labelledby="plot-${index}"><title id="plot-${index}">Comparable observations of ${e(identity.metricName)} in ${e(identity.metricUnit || "unitless")}; exact values in table below. No inferred uncertainty.</title><line x1="30" x2="530" y1="45" y2="45" class="axis"/>${values.map((v) => `<circle cx="${30 + 500 * ((v / scale - min / scale) / range)}" cy="45" r="5"/>`).join("")}<text x="30" y="80">${e(number(min))}</text><text x="530" y="80" text-anchor="end">${e(number(max))}</text></svg>`
      : "";
  return `<section class="measurement-group"><h3>${e(identity.metricName)} <small>${e(identity.metricUnit || "unitless")} · ${e(identity.direction)} is better</small></h3><p>${e(identity.scenario)}</p><p class="caption">${attempts.length} unique local attempt report(s), not a claim of independent samples. Same campaign, lane, subject, base and evaluator contract only. No global best.</p>${svg}<table><caption>Comparable observations · local reports, not authenticated evidence</caption><thead><tr><th scope="col">Attempt</th><th scope="col">Value</th><th scope="col">Empirical report</th></tr></thead><tbody>${attempts.map((a) => `<tr><th scope="row">${e(a.iteration ?? a.timestamp ?? "unindexed")}</th><td>${e(number(a.metric, identity.metricUnit ?? ""))}</td><td>${e(outcomeLabel(a.outcome))}</td></tr>`).join("")}</tbody></table>${rawDetail("Exact comparison identity", identity)}</section>`;
}
export function renderMeasurements(
  model: ResearchObservatoryModel,
  status: AutoresearchRuntimeStatus,
  closeout: AutoresearchSegmentCloseout,
): string {
  const readiness = buildAutoresearchMetricReadinessReview(status);
  const groups: DashboardComparisonGroup[] = buildPerformanceScopes(model).flatMap((s) =>
    s.comparable && s.identity
      ? [
          {
            key: s.id,
            campaignKey: s.id,
            identity: s.identity,
            attempts: s.rows.map((r) => r.attempt),
          },
        ]
      : [],
  );
  return `<section id="measurements"><p class="eyebrow">02 / Measurement notebook</p><h2>Measure like with like.</h2><p>Workflow blocker counts are not latency. Unknown metric, unit, direction, scenario, subject, base or evaluator identity withholds comparison.</p>${groups.map(renderGroup).join("") || '<p class="empty">No fully comparable groups. Individual reports remain visible with their withheld reasons; no invented win or percentage.</p>'}
  ${detail("Measurement trust / local runtime readiness", `<p>${e(readiness.classification)} — ${e(readiness.summary)}</p>${list(readiness.blockedReasons)}${list(readiness.checklist)}`)}
  ${closeout.timingInterpretation ? detail("Owner timing interpretation (whole local segment, not group uncertainty)", `<p>sampleCount counts eligible segment runs, not independent packet samples. noiseBand is the owner's heuristic duration tolerance in metric units, not a confidence interval. The dashboard does not reinterpret either as statistical uncertainty.</p>${rawDetail("Reported timingInterpretation", closeout.timingInterpretation)}`) : ""}</section>`;
}
export function renderAgainst(model: ResearchObservatoryModel): string {
  const attempts = [
    ...model.runtimeAttempts,
    ...model.matrix.cells.flatMap((c) => c.lanes.flatMap((l) => l.attempts)),
    ...model.matrix.unresolvedPackets,
  ];
  const against = attempts.filter((a) =>
    [
      "regression",
      "correctness_failure",
      "measurement_invalid",
      "resource_censored",
      "inconclusive",
    ].includes(a.outcome),
  );
  return `<aside id="against" class="evidence-against"><p class="eyebrow">03 / Evidence against</p><h2>What resists the claim?</h2><p>Failure, censoring and uncertainty stay visible. A keep/discard disposition does not alter the empirical report.</p>${against.length ? `<ol>${against.map((a) => `<li><strong class="${outcomeTone(a.outcome)}">${e(outcomeLabel(a.outcome))}</strong><p>${e(a.description)}</p><p class="caption">${e(a.sources.join(" · "))} · ${a.validMeasurement ? "valid measurement report" : "unverified report; not scoreable"}</p></li>`).join("")}</ol>` : '<p class="empty">No contrary reports discovered. Absence of evidence against is not support.</p>'}</aside>`;
}
export function renderOwnerGuidance(cwd: string): string {
  return detail(
    "Owner surfaces & next-action reference",
    `<p>Prepared guidance only. Review identity, measurement validity and exact owner gates first; missing=0 is not success or authorization.</p><h3>Setup guide</h3>${list(formatAutoresearchSetupGuideLines(cwd))}<h3>Bind → measure → export</h3>${list(formatAutoresearchGuidedCandidateJourneyLines(cwd))}<h3>Authority handoff</h3>${list(formatAutoresearchAuthorityHandoffLines(cwd))}`,
  );
}
