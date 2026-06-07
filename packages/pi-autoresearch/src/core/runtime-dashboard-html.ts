import path from "node:path";
import { buildAutoresearchCandidateDecisionWorkbench } from "./runtime-candidate-decision.ts";
import {
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
} from "./runtime-constants.ts";
import {
  computeAutoresearchDashboardImprovement,
  cssClassToken,
  escapeHtml,
  escapeScriptJson,
  formatAutoresearchDashboardNumber,
  renderAutoresearchDashboardShareSvg,
} from "./runtime-dashboard-format.ts";
import {
  formatAutoresearchAuthorityHandoffLines,
  formatAutoresearchDashboardMode,
  formatAutoresearchGuidedCandidateJourneyLines,
  formatAutoresearchSetupGuideLines,
} from "./runtime-dashboard-guidance.ts";
import { formatMetricThresholdValue } from "./runtime-format.ts";
import type {
  AutoresearchDashboardChartPoint,
  AutoresearchMatrixCampaignArtifactSummary,
} from "./runtime-matrix.ts";
import { buildAutoresearchMetricReadinessReview } from "./runtime-metric-readiness.ts";
import type { AutoresearchRuntimeStatus, AutoresearchSegmentCloseout } from "./runtime-model.ts";
import {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlanFromStatus,
} from "./runtime-resume-plan.ts";

export function renderAutoresearchDashboardHtml(
  status: AutoresearchRuntimeStatus,
  closeout: AutoresearchSegmentCloseout,
  matrixSummary: AutoresearchMatrixCampaignArtifactSummary,
): string {
  const segment = status.currentSegment;
  const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd: closeout.cwd });
  const candidateDecisionLabel = candidateDecision.candidate?.label ?? "no candidate bound yet";
  const metricReadiness =
    candidateDecision.metricReadiness ?? buildAutoresearchMetricReadinessReview(status);
  const metricReadinessBlockers =
    metricReadiness.blockedReasons.length > 0 ? metricReadiness.blockedReasons.join("; ") : "none";
  const metricReadinessChecklist = metricReadiness.checklist
    .slice(0, 4)
    .map((item) => `<div class="card-copy">✓ ${escapeHtml(item)}</div>`)
    .join("\n");
  const resumePlan = buildAutoresearchResumePlanFromStatus(closeout.cwd, status);
  const resumePlanBlockers =
    resumePlan.blockingReasons.length > 0 ? resumePlan.blockingReasons.join("; ") : "none";
  const resumeApplyPlan = buildAutoresearchResumeApplyPlan(closeout.cwd);
  const resumeApplyPlanBlockers =
    resumeApplyPlan.blockedReasons.length > 0 ? resumeApplyPlan.blockedReasons.join("; ") : "none";
  const learningExportCall = `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "learning_export" })`;
  const learningKesAdapterCall =
    'autoresearch_learning_kes_adapter({ action: "plan", packetPath: "<exported-learning-packet>" })';
  const setupGuideLines = formatAutoresearchSetupGuideLines(closeout.cwd);
  const guidedCandidateJourneyLines = formatAutoresearchGuidedCandidateJourneyLines(closeout.cwd);
  const authorityHandoffLines = formatAutoresearchAuthorityHandoffLines(closeout.cwd);
  const generatedAt = new Date().toLocaleString();
  const metricUnit = closeout.metricUnit || segment.metricUnit || "";
  const metricName = closeout.metricName ?? segment.metricName ?? "metric";
  const baselineMetric = closeout.baselineMetric ?? segment.baselineMetric;
  const bestMetric = closeout.bestMetric ?? segment.bestMetric;
  const direction = closeout.direction ?? segment.direction;
  const improvement = computeAutoresearchDashboardImprovement({
    baseline: baselineMetric,
    best: bestMetric,
    direction,
  });
  const rows = closeout.runs.slice(-80);
  const tableRows = rows
    .slice()
    .reverse()
    .map((run) => {
      const statusClass = cssClassToken(run.status);
      const decisionClass = cssClassToken(run.empiricalDecisionClass);
      return `<tr${run.metric === bestMetric && bestMetric !== null ? ` class="best-row"` : ""}><td class="mono">${escapeHtml(String(run.iteration ?? "-"))}</td><td><span class="status ${statusClass}">${escapeHtml(run.status)}</span></td><td>${escapeHtml(run.runKind)}</td><td class="mono metric-cell">${escapeHtml(formatAutoresearchDashboardNumber(run.metric, metricUnit))}</td><td><span class="decision ${decisionClass}">${escapeHtml(run.empiricalDecisionClass)}</span></td><td>${escapeHtml(run.description)}</td></tr>`;
    })
    .join("\n");
  const runtimeChartPoints: AutoresearchDashboardChartPoint[] = rows.map((run) => ({
    iteration: run.iteration,
    label: run.iteration === null ? run.runKind : `run ${run.iteration}`,
    status: run.status,
    runKind: run.runKind,
    decision: run.empiricalDecisionClass,
    metric: run.metric,
    description: run.description,
    source: "runtime_receipt",
  }));
  const matrixCellRows = matrixSummary.cells
    .map(
      (cell) =>
        `<tr><td class="mono">${escapeHtml(cell.cellId)}</td><td>${escapeHtml(cell.posture)}</td><td class="mono">${escapeHtml(cell.laneProgress)}</td><td>${escapeHtml(cell.selectedLaneId ?? "—")}</td><td>${escapeHtml(cell.packetInventory.slice(0, 3).join(", ") || cell.selectedPacketPath || "—")}</td><td>${escapeHtml(cell.nextLegalAction)}</td></tr>`,
    )
    .join("\n");
  const matrixNextLegalActions = matrixSummary.nextLegalActions
    .slice(0, 5)
    .map((action) => `<div class="card-copy"><code>${escapeHtml(action)}</code></div>`)
    .join("\n");
  const dashboardMode = formatAutoresearchDashboardMode(matrixSummary);
  const matrixMode = dashboardMode === "matrix_campaign";
  const chartPoints = matrixMode ? matrixSummary.chart.points : runtimeChartPoints;
  const chartMode = matrixMode ? "matrix_campaign" : "runtime_segment";
  const chartMetricName = matrixMode ? matrixSummary.chart.metricName : metricName;
  const chartMetricUnit = matrixMode ? matrixSummary.chart.metricUnit : metricUnit;
  const chartDirection = matrixMode ? matrixSummary.chart.direction : direction;
  const chartTitle = matrixMode ? "Matrix progress trajectory" : "Metric trajectory";
  const chartSourceDescription = matrixMode
    ? matrixSummary.chart.sourceDescription
    : "Derived from local autoresearch runtime receipts for this cwd.";
  const chartEmptyMessage = matrixMode
    ? matrixSummary.chart.emptyMessage
    : "No local runtime metric data yet.";
  const matrixProgressCards = `<div class="cards">
    <section class="card"><div class="card-label">Matrix cells</div><div class="card-value">${escapeHtml(`${matrixSummary.completedCellCount}/${matrixSummary.cellCount}`)}</div></section>
    <section class="card"><div class="card-label">Selected lanes</div><div class="card-value">${escapeHtml(String(matrixSummary.selectedCellCount))}</div></section>
    <section class="card"><div class="card-label">Open review cells</div><div class="card-value ${matrixSummary.openCandidateReview.status === "owner_review_required" ? "warn" : "good"}">${escapeHtml(String(matrixSummary.openCandidateReview.openCellCount))}</div></section>
    <section class="card"><div class="card-label">Exported packets</div><div class="card-value">${escapeHtml(String(matrixSummary.exportedPacketCount))}</div></section>
    <section class="card"><div class="card-label">Visibility blockers</div><div class="card-value ${matrixSummary.exportVisibilityBlockers.status === "target_met" ? "good" : "warn"}">${escapeHtml(String(matrixSummary.exportVisibilityBlockers.value))}</div></section>
  </div>`;
  const runtimeProgressCards = `<div class="cards">
    <section class="card"><div class="card-label">Baseline → Best</div><div class="card-value">${escapeHtml(formatAutoresearchDashboardNumber(baselineMetric, metricUnit))} → ${escapeHtml(formatAutoresearchDashboardNumber(bestMetric, metricUnit))}</div></section>
    <section class="card"><div class="card-label">Improvement</div><div class="card-value ${improvement.className}">${escapeHtml(improvement.label)}</div></section>
    <section class="card"><div class="card-label">Runs</div><div class="card-value">${closeout.runCount}</div></section>
    <section class="card"><div class="card-label">Confidence</div><div class="card-value ${segment.confidence !== null && segment.confidence < 1 ? "warn" : ""}">${escapeHtml(segment.confidence === null ? "—" : `${segment.confidence.toFixed(1)}×`)}</div></section>
  </div>`;
  const shareSvg = renderAutoresearchDashboardShareSvg({
    metricName,
    posture: status.empiricalPosture.classification,
    improvement: improvement.label,
    baseline: formatAutoresearchDashboardNumber(baselineMetric, metricUnit),
    best: formatAutoresearchDashboardNumber(bestMetric, metricUnit),
    recommendedNext: status.empiricalPosture.recommendedNextAction,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="2" />
<title>pi-autoresearch dashboard</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0d1117;
  --panel: #161b22;
  --panel-2: #11161c;
  --text: #c9d1d9;
  --muted: #8b949e;
  --line: #30363d;
  --good: #3fb950;
  --bad: #f85149;
  --accent: #58a6ff;
  --warn: #d29922;
  --purple: #bc8cff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: radial-gradient(circle at top left, rgba(88,166,255,.12), transparent 34rem), var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.title { margin: 0; font-size: 24px; color: #fff; letter-spacing: -.02em; }
.meta { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.badge { border: 1px solid var(--line); background: rgba(22,27,34,.72); border-radius: 999px; color: var(--muted); font-size: 12px; padding: 5px 9px; }
.badge.good { color: var(--good); border-color: rgba(63,185,80,.42); background: rgba(63,185,80,.1); }
.badge.warn { color: var(--warn); border-color: rgba(210,153,34,.38); background: rgba(210,153,34,.1); }
.share-btn { background: #21262d; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.share-btn:hover { background: #30363d; }
.cards { margin-top: 16px; display: grid; gap: 10px; grid-template-columns: minmax(240px, 2.2fr) minmax(220px, 1.8fr) minmax(120px, .8fr) minmax(120px, .8fr); }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.22); }
.card-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.card-value { margin-top: 8px; font-size: 24px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.card-value.good { color: var(--good); }
.card-value.bad { color: var(--bad); }
.card-value.warn { color: var(--warn); }
.card-copy { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.chart-panel, .table-panel { margin-top: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.chart-panel { padding: 10px; }
.chart-head { display: flex; justify-content: space-between; gap: 12px; padding: 4px 4px 10px; color: var(--muted); font-size: 12px; }
.chart-wrap { height: 300px; position: relative; }
canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
.chart-tooltip { position: absolute; pointer-events: none; opacity: 0; background: rgba(20,20,20,.95); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 10px 12px; min-width: 190px; box-shadow: 0 8px 28px rgba(0,0,0,.45); transform: translateY(4px); transition: opacity .15s ease, transform .15s ease; z-index: 4; }
.chart-tooltip.visible { opacity: 1; transform: translateY(0); }
.chart-tooltip .tt-run { font-size: 10px; color: rgba(255,255,255,.45); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 4px; font-weight: 600; }
.chart-tooltip .tt-metric { font-size: 18px; color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }
.chart-tooltip .tt-status { display: inline-block; margin-top: 6px; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 600; color: var(--accent); background: rgba(88,166,255,.15); }
.chart-tooltip .tt-desc { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.62); font-size: 11px; line-height: 1.35; }
.chart-crosshair { position: absolute; top: 0; width: 1px; background: rgba(255,255,255,.15); pointer-events: none; opacity: 0; transition: opacity .12s ease; z-index: 3; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th { position: sticky; top: 0; text-align: left; background: var(--panel-2); color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
tbody td { border-bottom: 1px solid #222a33; padding: 10px; vertical-align: top; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.metric-cell { color: #fff; }
.status, .decision { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; display: inline-block; background: rgba(88,166,255,.12); color: var(--accent); }
.status.baseline, .decision.baseline { color: var(--muted); background: rgba(139,148,158,.12); }
.status.keep, .status.candidate, .decision.candidate_improvement, .decision.threshold_satisfied, .decision.threshold_preserved, .decision.default_promotion_candidate { color: var(--good); background: rgba(63,185,80,.15); }
.status.discard, .decision.candidate_regression, .decision.threshold_regressed { color: #ff9b95; background: rgba(248,81,73,.15); }
.status.crash, .status.blocked { color: var(--bad); background: rgba(248,81,73,.25); }
.status.checks_failed, .decision.candidate_neutral, .decision.threshold_not_met { color: var(--warn); background: rgba(210,153,34,.18); }
.best-row { background: rgba(63,185,80,.08); }
.best-row td { border-bottom-color: rgba(63,185,80,.22); }
.footer { margin-top: 14px; color: var(--muted); font-size: 13px; line-height: 1.55; }
code { color: #a5d6ff; }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(140px, 1fr)); } .header { flex-direction: column; } }
@media (max-width: 560px) { .cards { grid-template-columns: 1fr; } .page { padding: 16px; } }
</style>
</head>
<body>
<div class="page" id="capture-root">
  <div class="header">
    <div>
      <h1 class="title">🔬 pi-autoresearch live dashboard${segment.name ? `: ${escapeHtml(segment.name)}` : ""}</h1>
      <div class="meta">Auto-refreshes every 2s while Pi rewrites this file. Generated ${escapeHtml(generatedAt)}.</div>
      <div class="badge-row">
        <span class="badge ${matrixMode ? "good" : ""}">mode: ${escapeHtml(dashboardMode)}</span>
        <span class="badge">machine: ${escapeHtml(status.runtimeProjection.state)}</span>
        <span class="badge ${status.empiricalPosture.promotionReady ? "good" : "warn"}">promotion: ${status.empiricalPosture.promotionReady ? "ready" : "not ready"}</span>
        <span class="badge">posture: ${escapeHtml(status.empiricalPosture.classification)}</span>
        <span class="badge">cwd: ${escapeHtml(path.basename(closeout.cwd))}</span>
      </div>
    </div>
    <button class="share-btn" id="share-btn" type="button">Export as image ↓</button>
  </div>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Dashboard mode</div>
    <div class="card-value" style="font-size:18px">${escapeHtml(dashboardMode)}</div>
    <div class="card-copy">${matrixMode ? "Matrix campaign artifacts are the primary visible-progress source. Empty local runtime fields are auxiliary and do not mean the matrix has no progress." : "Local runtime receipts are the primary visible-progress source."}</div>
  </section>

  ${matrixMode ? matrixProgressCards : runtimeProgressCards}

  ${
    matrixMode
      ? `<section class="card" style="margin-top:14px">
    <div class="card-label">Matrix campaign progress</div>
    <div class="card-value ${matrixSummary.exportVisibilityBlockers.status === "target_met" ? "good" : "warn"}" style="font-size:18px">${escapeHtml(matrixSummary.metricName ?? "matrix campaign")}</div>
    <div class="card-copy">cells=${escapeHtml(`${matrixSummary.completedCellCount}/${matrixSummary.cellCount}`)} · selected=${escapeHtml(String(matrixSummary.selectedCellCount))} · lanes=${escapeHtml(String(matrixSummary.candidateLaneCount))} · packets=${escapeHtml(String(matrixSummary.exportedPacketCount))}</div>
    <div class="card-copy">latest=${escapeHtml(matrixSummary.latestArtifactPath ?? "none")}</div>
    ${matrixNextLegalActions || '<div class="card-copy">No matrix next legal actions discovered yet.</div>'}
  </section>`
      : ""
  }

  <section class="card" style="margin-top:14px">
    <div class="card-label">Open candidate review posture</div>
    <div class="card-value ${matrixSummary.openCandidateReview.status === "owner_review_required" ? "warn" : "good"}" style="font-size:18px">${escapeHtml(String(matrixSummary.openCandidateReview.openCellCount))} open review cell(s)</div>
    <div class="card-copy">${escapeHtml(matrixSummary.openCandidateReview.summary)}</div>
    <div class="card-copy"><code>${escapeHtml(matrixSummary.openCandidateReview.nextLegalAction)}</code></div>
    <div class="card-copy">${escapeHtml(matrixSummary.openCandidateReview.boundary)}</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Recommended next</div>
    <div class="card-value" style="font-size:18px; font-family:inherit">${escapeHtml(matrixMode ? (matrixSummary.nextLegalActions[0] ?? "Review matrix campaign artifacts before acting.") : status.empiricalPosture.recommendedNextAction)}</div>
    <div class="card-copy">${escapeHtml(matrixMode ? "Matrix-mode recommendation is derived from discovered local matrix artifacts; durable authority still requires owner review/evidence handoff." : status.empiricalPosture.summary)}</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Candidate decision</div>
    <div class="card-value" style="font-size:18px">${escapeHtml(candidateDecision.recommendedDecision)}</div>
    <div class="card-copy">${escapeHtml(candidateDecisionLabel)} — ${escapeHtml(candidateDecision.recommendationReason)}</div>
    <div class="card-copy"><code>${escapeHtml(candidateDecision.exactNextCalls[0] ?? `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "status" })`)}</code></div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Metric readiness / trust</div>
    <div class="card-value ${metricReadiness.blockedReasons.length === 0 ? "good" : "warn"}" style="font-size:18px">${escapeHtml(metricReadiness.classification)}</div>
    <div class="card-copy">${escapeHtml(metricReadiness.summary)}</div>
    <div class="card-copy">metric readiness blockers=${escapeHtml(String(metricReadiness.blockedReasons.length))}; ${escapeHtml(metricReadinessBlockers)}</div>
    ${metricReadinessChecklist || '<div class="card-copy">No metric readiness checklist items recorded.</div>'}
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Resume plan</div>
    <div class="card-value ${resumePlan.reusable ? "good" : "warn"}" style="font-size:18px">${resumePlan.reusable ? "reusable foreground plan" : "blocked until reviewed"}</div>
    <div class="card-copy">${escapeHtml(resumePlan.packetKind)} · snapshot=${escapeHtml(resumePlan.snapshotReuse)} · control=${escapeHtml(resumePlan.controlState)} · blockers=${escapeHtml(resumePlanBlockers)}</div>
    <div class="card-copy"><code>${escapeHtml(resumePlan.wouldRun ?? `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "resume_plan" })`)}</code></div>
    <div class="card-copy">Read-only: no benchmark run, resume_apply, daemon, peer launch, candidate mutation, or external evidence/learning write.</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Resume apply plan-only proposal</div>
    <div class="card-value ${resumeApplyPlan.planReady ? "warn" : "bad"}" style="font-size:18px">${resumeApplyPlan.planReady ? "proposal ready, execution not authorized" : "proposal blocked"}</div>
    <div class="card-copy">${escapeHtml(resumeApplyPlan.packetKind)} · execution authorized=${resumeApplyPlan.executionAuthorized ? "yes" : "no"} · blockers=${escapeHtml(resumeApplyPlanBlockers)}</div>
    <div class="card-copy"><code>${escapeHtml(resumeApplyPlan.futureForegroundCall ?? `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(closeout.cwd)}, action: "resume_apply_plan" })`)}</code></div>
    <div class="card-copy">Plan-only: execution is not authorized here; use autoresearch_runtime_resume_apply only with exact foreground confirmation and explicit budgets.</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Authority handoff</div>
    <div class="card-value" style="font-size:18px">closeout → AK evidence → learning/KES → Oracle-ready DSPx preflight</div>
    ${authorityHandoffLines.map((line) => `<div class="card-copy"><code>${escapeHtml(line.replace(/^- /u, ""))}</code></div>`).join("\n")}
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Learning handoff</div>
    <div class="card-value" style="font-size:18px">export → owner adapter</div>
    <div class="card-copy"><code>${escapeHtml(learningExportCall)}</code></div>
    <div class="card-copy"><code>${escapeHtml(learningKesAdapterCall)}</code></div>
    <div class="card-copy">Boundary: export is local only; KES/notes/KMS adapters own persistence and promotion.</div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Setup guide</div>
    <div class="card-value" style="font-size:18px">configure a bounded segment</div>
    ${setupGuideLines.map((line) => `<div class="card-copy"><code>${escapeHtml(line.replace(/^- /u, ""))}</code></div>`).join("\n")}
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Bind → measure → candidate_result_export journey</div>
    <div class="card-value" style="font-size:18px">export inspects measured packet inventory before owner review</div>
    ${guidedCandidateJourneyLines.map((line) => `<div class="card-copy"><code>${escapeHtml(line.replace(/^- /u, ""))}</code></div>`).join("\n")}
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">Measured packet inventory before owner review</div>
    <div class="card-value ${matrixSummary.exportVisibilityBlockers.status === "target_met" ? "good" : "warn"}" style="font-size:18px">export_visibility_blockers=${matrixSummary.exportVisibilityBlockers.value}</div>
    <div class="card-copy">campaigns=${matrixSummary.campaignCount} · cells=${matrixSummary.completedCellCount}/${matrixSummary.cellCount} · selected=${matrixSummary.selectedCellCount} · open review cells=${matrixSummary.openCandidateReview.openCellCount} · lanes=${matrixSummary.candidateLaneCount} · exported packets=${matrixSummary.exportedPacketCount}</div>
    <div class="card-copy">${escapeHtml(matrixSummary.openCandidateReview.summary)}</div>
    <div class="card-copy">metric=${escapeHtml(matrixSummary.metricName ?? "(unknown)")} (${escapeHtml(matrixSummary.metricDirection ?? "unknown")} is better; target=${escapeHtml(String(matrixSummary.metricTarget ?? "none"))}) · latest=${escapeHtml(matrixSummary.latestArtifactPath ?? "none")}</div>
    <div class="card-copy">${escapeHtml(matrixSummary.boundary)}</div>
    ${matrixNextLegalActions || '<div class="card-copy">No matrix next legal actions discovered yet.</div>'}
  </section>

  <section class="table-panel">
    <table><thead><tr><th>Cell</th><th>Posture</th><th>Lanes</th><th>Selected</th><th>Packet inventory</th><th>Next legal action</th></tr></thead><tbody>${matrixCellRows || `<tr><td colspan="6" class="muted">No matrix campaign artifacts discovered under .autoresearch/campaigns or .autoresearch/matrix-campaign.</td></tr>`}</tbody></table>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-label">${matrixMode ? "Local runtime segment snapshot" : "Runtime segment"}</div>
    <div class="card-copy">${matrixMode ? "Auxiliary single-segment state for this cwd. Matrix progress above is authoritative for dashboard visibility; blank runtime fields here usually mean the matrix is driven by orchestrator/candidate-wave artifacts instead of one local autoresearch.jsonl segment." : "Primary local runtime segment state for this cwd."}</div>
  </section>

  <div class="cards">
    <section class="card"><div class="card-label">Campaign</div><div class="card-value" style="font-size:16px">${escapeHtml(segment.name ?? "unconfigured")}</div></section>
    <section class="card"><div class="card-label">Metric</div><div class="card-value" style="font-size:16px">★ ${escapeHtml(metricName)} ${escapeHtml(direction ?? "")} ${metricUnit ? `(${escapeHtml(metricUnit)})` : ""}</div></section>
    <section class="card"><div class="card-label">Success threshold</div><div class="card-value" style="font-size:16px">${escapeHtml(formatMetricThresholdValue(segment.metricThreshold, metricUnit))}</div></section>
    <section class="card"><div class="card-label">Benchmark</div><div class="card-value" style="font-size:14px"><code>${escapeHtml(segment.benchmarkCommand ?? "(unset)")}</code></div></section>
    <section class="card"><div class="card-label">Checks</div><div class="card-value" style="font-size:14px"><code>${escapeHtml(segment.checksCommand ?? "(none)")}</code></div></section>
  </div>

  <section class="chart-panel">
    <div class="chart-head"><span>${escapeHtml(chartTitle)}</span><span class="mono">${escapeHtml(chartMetricName)} / ${escapeHtml(chartDirection ?? "direction unset")}</span></div>
    <div class="card-copy">${escapeHtml(chartSourceDescription)}</div>
    <div class="chart-wrap">
      <canvas id="metric-chart" aria-label="Autoresearch metric trajectory"></canvas>
      <div class="chart-crosshair" id="chart-crosshair"></div>
      <div class="chart-tooltip" id="chart-tooltip"></div>
    </div>
  </section>

  <section class="table-panel">
    <table><thead><tr><th>#</th><th>Status</th><th>Kind</th><th>★ ${escapeHtml(metricName)}</th><th>Decision</th><th>Description</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6" class="muted">No runs recorded yet.</td></tr>`}</tbody></table>
  </section>

  <section class="card footer">
    <strong>Boundary:</strong> Browser export is read-only measured packet inventory inspection. It does not run benchmarks, spawn peers, mutate worktrees, write AK/KES evidence, or promote candidates.<br />
    <strong>Candidate policy:</strong> mode=worktree; keep=preserve_branch; discard=suggest_cleanup; rewind=reset_worktree_to_base. Replay Fabric observes history; ASC rewind is live session recovery.<br />
    <strong>Owner review gate:</strong> use <code>autoresearch_live_supervision({ action: "review_candidate_wave", taskId: &lt;ak-task-id&gt;, cwd: ${escapeHtml(JSON.stringify(closeout.cwd))}, objective: "&lt;candidate-wave-objective&gt;", direction: "lower" })</code> only after candidate-result packet inventory is complete (export_visibility_blockers=0); this dashboard does not mutate AK or claim evidence authority.
  </section>
</div>
<script>
const DASHBOARD_DATA = ${escapeScriptJson(JSON.stringify({ rows: chartPoints, metricUnit: chartMetricUnit, metricName: chartMetricName, direction: chartDirection, chartMode, chartTitle, emptyMessage: chartEmptyMessage }))};
const DASHBOARD_SHARE_SVG = ${escapeScriptJson(JSON.stringify(shareSvg))};
const canvas = document.getElementById('metric-chart');
const tooltip = document.getElementById('chart-tooltip');
const crosshair = document.getElementById('chart-crosshair');
function colorForStatus(status) {
  if (status === 'keep' || status === 'candidate') return '#3fb950';
  if (status === 'discard' || status === 'crash' || status === 'blocked') return '#f85149';
  if (status === 'checks_failed') return '#d29922';
  return '#58a6ff';
}
function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const body = Math.abs(n) >= 100 ? n.toFixed(0) : Number.isInteger(n) ? String(n) : n.toFixed(2);
  return body + (DASHBOARD_DATA.metricUnit || '');
}
function escapeClientHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function drawChart() {
  if (!canvas) return;
  const rows = DASHBOARD_DATA.rows || [];
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const pad = { left: 44, right: 16, top: 18, bottom: 34 };
  const plotW = Math.max(1, w - pad.left - pad.right);
  const plotH = Math.max(1, h - pad.top - pad.bottom);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#8b949e';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }
  if (rows.length === 0) {
    ctx.fillText(DASHBOARD_DATA.emptyMessage || 'No metric data yet', pad.left, pad.top + 24);
    return;
  }
  const values = rows.map(r => Number(r.metric)).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const points = rows.map((row, i) => {
    const x = pad.left + (rows.length === 1 ? plotW / 2 : (plotW * i) / (rows.length - 1));
    const y = pad.top + plotH - ((Number(row.metric) - min) / (max - min)) * plotH;
    return { ...row, x, y };
  });
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();
  for (const p of points) {
    ctx.beginPath();
    ctx.fillStyle = colorForStatus(p.status);
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#8b949e';
  ctx.fillText(formatMetric(max), 6, pad.top + 4);
  ctx.fillText(formatMetric(min), 6, pad.top + plotH);
  canvas._points = points;
}
canvas?.addEventListener('mousemove', (event) => {
  const points = canvas._points || [];
  if (points.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  let nearest = points[0];
  for (const p of points) if (Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p;
  crosshair.style.left = nearest.x + 'px';
  crosshair.style.height = rect.height + 'px';
  crosshair.style.opacity = '1';
  tooltip.classList.add('visible');
  tooltip.style.left = Math.min(rect.width - 220, nearest.x + 12) + 'px';
  tooltip.style.top = Math.max(8, nearest.y - 24) + 'px';
  tooltip.innerHTML = '<div class="tt-run">' + escapeClientHtml(nearest.label || ('run ' + (nearest.iteration ?? '—'))) + ' / ' + escapeClientHtml(nearest.runKind) + '</div><div class="tt-metric">' + escapeClientHtml(formatMetric(nearest.metric)) + '</div><span class="tt-status">' + escapeClientHtml(nearest.status) + '</span><div class="tt-desc">' + escapeClientHtml(nearest.description || '') + '</div>';
});
canvas?.addEventListener('mouseleave', () => { tooltip.classList.remove('visible'); crosshair.style.opacity = '0'; });
window.addEventListener('resize', drawChart);
drawChart();
document.getElementById('share-btn')?.addEventListener('click', async () => {
  try {
    const blob = new Blob([DASHBOARD_SHARE_SVG], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pi-autoresearch-share-card.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.warn('share export failed', error);
  }
});
</script>
</body>
</html>\n`;
}
