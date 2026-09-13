import {
  escapeHtml as e,
  outcomeLabel,
  outcomeTone,
  rawDetail,
} from "./runtime-dashboard-format.ts";
import type { ResearchObservatoryModel } from "./runtime-dashboard-model.ts";
import {
  buildPerformanceScopes,
  type PerformanceRow,
  type PerformanceScope,
} from "./runtime-dashboard-performance-model.ts";

const exact = (n: number) => (Object.is(n, -0) ? "-0" : String(n));
function number(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const magnitude = Math.abs(n);
  if (magnitude !== 0 && (magnitude < 1e-6 || magnitude >= 1e9)) {
    const compact = n.toExponential(3);
    return Number.isFinite(Number(compact)) && Number(compact) !== 0 ? compact : n.toExponential();
  }
  return new Intl.NumberFormat(
    "en",
    magnitude !== 0 && magnitude < 0.01
      ? { maximumSignificantDigits: 4 }
      : { maximumFractionDigits: 2 },
  ).format(n);
}
function numeric(n: number | null, unit = "", signed = false): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  const label = e(`Exact value: ${sign}${exact(n)}${unit}`);
  return `<span class="perf-numeric" title="${label}" aria-label="${label}">${e(sign + number(n) + unit)}</span>`;
}
const unit = (s: PerformanceScope) => (s.identity?.metricUnit ? ` ${s.identity.metricUnit}` : "");
const metric = (s: PerformanceScope, n: number | null) => numeric(n, unit(s));
const metricLabel = (s: PerformanceScope, n: number | null) =>
  e(n === null || !Number.isFinite(n) ? "not measured" : exact(n) + unit(s));
const best = (s: PerformanceScope, r: PerformanceRow) => s.best.some((b) => b.id === r.id);
function status(s: PerformanceScope, r: PerformanceRow): string {
  const a = r.attempt;
  return `${e(a.disposition)}${best(s, r) ? " · best" : ""}${r.duplicate ? " · duplicate report" : ""}${a.packetBinding === "quarantined" ? " · quarantined history" : ""}${!r.measurable ? ` · ineligible (${e(a.outcome.replaceAll("_", " "))})` : ""}`;
}
function tone(s: PerformanceScope, r: PerformanceRow): string {
  return !r.measurable
    ? "perf-failure"
    : r.attempt.disposition === "discard"
      ? "perf-discard"
      : best(s, r)
        ? "perf-best"
        : "perf-run";
}
export function renderPerformanceChart(s: PerformanceScope, mode: "raw" | "baseline"): string {
  const rows = s.rows.filter((r) => r.measurable);
  if (!rows.length)
    return '<div class="perf-empty-chart"><p>No measurements</p><small>No eligible numeric observations in this exact scope.</small></div>';
  const values = rows.map((r) =>
    mode === "baseline"
      ? ((r.attempt.metric as number) / (s.baseline?.attempt.metric as number)) * 100
      : (r.attempt.metric as number),
  );
  const scale = values.reduce((max, v) => Math.max(max, Math.abs(v)), 1);
  const lo = values.reduce((min, v) => Math.min(min, v / scale), 0);
  const hi = values.reduce(
    (max, v) => Math.max(max, v / scale),
    mode === "baseline" ? 100 / scale : 0,
  );
  const y = (v: number) => 264 - ((v / scale - lo) / (hi - lo || 1)) * 228;
  const x = (r: PerformanceRow) => 64 + (s.rows.indexOf(r) / Math.max(1, s.rows.length - 1)) * 872;
  const points = rows.map((r, i) => `${x(r).toFixed(2)},${y(values[i]).toFixed(2)}`);
  const trend = s.comparable && s.order !== "unknown" && rows.length > 1;
  const titleId = `${s.id}-${mode}-title`;
  return `<svg class="perf-chart" data-perf-chart="${mode}" ${mode === "baseline" ? "hidden" : ""} viewBox="0 0 980 320" role="group" aria-labelledby="${titleId}"><title id="${titleId}">${e(s.identity?.metricName ?? "Metric")} · ${mode === "baseline" ? "Baseline index (100 = reference)" : "raw values"} · ${e(s.order === "unknown" ? "order unknown, positions are not chronology" : `run chronology by ${s.order}`)}</title>${[
    0, 1, 2, 3,
  ]
    .map((i) => {
      const v = (hi - ((hi - lo) * i) / 3) * scale;
      const axisY = 36 + i * 76;
      return `<line x1="64" x2="936" y1="${axisY}" y2="${axisY}" class="perf-grid"/><text x="54" y="${axisY + 4}" text-anchor="end" aria-label="Exact value: ${e(exact(v))}"><title>Exact value: ${e(exact(v))}</title>${e(mode === "baseline" && Math.abs(v) >= 1 && Math.abs(v) < 1e9 ? String(Math.round(v)) : number(v))}</text>`;
    })
    .join(
      "",
    )}${trend ? `<polygon class="perf-area" points="64,264 ${points.join(" ")} 936,264"/><polyline class="perf-line" points="${points.join(" ")}"/>` : ""}${rows.map((r, i) => `<a id="${r.id}-${mode}-point" href="#${r.id}-detail" data-perf-select="${r.id}" tabindex="0" aria-label="Run ${s.rows.indexOf(r) + 1}: ${status(s, r)}; ${metricLabel(s, r.attempt.metric)}; outcome ${e(outcomeLabel(r.attempt.outcome))}"><circle class="perf-hit" cx="${x(r)}" cy="${y(values[i])}" r="32"/><circle class="perf-dot ${tone(s, r)}" cx="${x(r)}" cy="${y(values[i])}" r="5"/><title>${e(r.attempt.description)}</title></a>`).join("")}<text x="64" y="303">${s.order === "unknown" ? "Order unknown · report positions" : "Run 1"}</text><text x="936" y="303" text-anchor="end">${s.order === "unknown" ? `${s.rows.length} reports` : `Run ${s.rows.length}`}</text></svg>`;
}
function inspector(s: PerformanceScope, r: PerformanceRow): string {
  const a = r.attempt;
  return `<details id="${r.id}-detail" data-perf-detail="${r.id}"><summary id="${r.id}-summary">Run ${s.rows.indexOf(r) + 1} · ${e(a.description)}</summary><div class="detail-body"><p>${status(s, r)} · ${metric(s, a.metric)} · checks ${e(a.checks ?? "unknown")} · outcome ${e(a.outcome)}</p><p><b>Hypothesis:</b> ${e(a.hypothesis ?? s.hypothesis ?? "not specified")}</p><p><b>Prediction:</b> ${e(a.prediction ?? "not specified")}</p><p class="caption">${e(a.verificationReport)} · ${e(a.provenance)}</p><p class="caption">Sources: ${a.sources.map(e).join(" · ")}</p><p class="caption">${[...a.comparisonWithheld, ...a.issues].map(e).join(" · ")}</p>${rawDetail("Measurement identity & source run", { identity: a.identity, timestamp: a.timestamp, iteration: a.iteration, run: a.raw })}</div></details>`;
}
function renderScope(s: PerformanceScope): string {
  const baselineBest =
    s.baseline && s.best.length
      ? `${metric(s, s.baseline.attempt.metric)} <span>→</span> ${metric(s, s.best[0].attempt.metric)}`
      : "— → —";
  return `<section id="${s.id}" data-perf-scope data-perf-normalizable="${s.normalizable}" aria-label="${e(s.label)}"><h3 class="perf-scope-title">${e(s.label)}</h3><div class="perf-stats"><div><span>Baseline → Best</span><strong>${baselineBest}</strong><small>${s.baseline ? `${s.best.length > 1 ? `${s.best.length} tied best reports` : "Explicit baseline reference"}` : "Requires unique eligible positive baseline & comparison"}</small></div><div><span>Improvement</span><strong class="supported">${s.improvement === null ? "—" : `${numeric(s.improvement, "%")} ${s.identity?.direction === "higher" ? "higher" : "lower"}`}</strong><small>${s.improvement === null ? "Comparison withheld" : "Relative to baseline · not cumulative"}</small></div><div><span>Runs</span><strong>${s.rows.length}</strong><small>Run reports · not independent samples</small></div><div><span>Kept</span><strong>${s.kept}<span> / ${s.rows.length}</span></strong><small>Keep disposition ≠ best or improvement</small></div></div><div class="perf-chart-card" id="${s.id}-chart" data-reading-scroll tabindex="0" role="region" aria-label="Run chronology chart"><div class="perf-chart-heading"><h3>Run chronology</h3><span class="caption">${e(s.identity?.metricName ?? "Metric not configured")} · ${e(s.identity?.metricUnit ?? "unit unknown")}</span><p class="perf-badge">${e(s.note)}</p></div>${renderPerformanceChart(s, "raw")}${s.normalizable ? renderPerformanceChart(s, "baseline") : ""}<p class="caption perf-legend">Blue: measurement · Amber: discard · Green: best eligible · Failures/history retained below</p></div><div class="perf-table-wrap" id="${s.id}-table" data-reading-scroll tabindex="0" role="region" aria-label="Run reports table"><table class="perf-table"><thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col"><span data-perf-value="raw">Metric</span><span data-perf-value="baseline" hidden>${s.identity?.metricName === "runtime" ? "Runtime Index" : "Baseline Index"}</span></th><th scope="col">Δ baseline</th><th scope="col">Experiment</th></tr></thead><tbody>${
    s.rows
      .map((r, i) => {
        const a = r.attempt;
        const delta =
          s.normalizable && r.measurable
            ? ((a.metric as number) / (s.baseline?.attempt.metric as number) - 1) * 100
            : null;
        return `<tr id="${r.id}-row" data-perf-row="${r.id}"><td><a id="${r.id}-link" href="#${r.id}-detail" data-perf-select="${r.id}">Run ${String(i + 1).padStart(2, "0")}</a></td><td><span class="${a.disposition === "keep" ? "supported" : tone(s, r)}">${e(a.disposition)}</span>${best(s, r) ? " · best" : ""}<small class="perf-outcome ${outcomeTone(a.outcome)}">${e(outcomeLabel(a.outcome))}</small>${r.duplicate ? " · duplicate report" : ""}${a.packetBinding === "quarantined" ? " · quarantined history" : ""}${!r.measurable ? '<small class="perf-outcome uncertain">Ineligible · raw report</small>' : ""}</td><td class="perf-number"><span data-perf-value="raw">${metric(s, a.metric)}</span><span data-perf-value="baseline" hidden>${s.normalizable && r.measurable ? numeric(((a.metric as number) / (s.baseline?.attempt.metric as number)) * 100) : "—"}</span></td><td class="perf-number">${numeric(delta, "%", true)}</td><td>${e(a.description)}${!r.measurable ? '<small class="caption"> · raw report, excluded from chart</small>' : ""}</td></tr>`;
      })
      .join("") ||
    `<tr><td colspan="5"><b>No measurements</b><p>${e(s.hypothesis ?? "No hypothesis recorded.")}</p><small>Planned only · launch unverified</small></td></tr>`
  }</tbody></table></div><aside class="perf-inspector" aria-label="Selected run details"><details id="${s.id}-identity"><summary>Exact scope identity</summary><p>${e(s.label)}</p>${rawDetail("Measurement identity", s.identity)}</details><h3>Run details</h3><p class="caption" data-perf-hint>Select a chart point or run to inspect its source report.</p>${s.rows.map((r) => inspector(s, r)).join("")}</aside></section>`;
}
export function renderPerformanceDashboard(model: ResearchObservatoryModel): string {
  const scopes = buildPerformanceScopes(model);
  return `<section id="performance" tabindex="-1" aria-labelledby="performance-title"><div class="perf-toolbar"><h2 id="performance-title" class="perf-sr">Performance</h2><div class="perf-controls" hidden><label>Scope <select id="performance-scope">${scopes.map((s) => `<option value="${s.id}">${e(s.label)}</option>`).join("")}</select></label><label><span class="perf-sr">View</span><select id="performance-mode"><option value="raw">Raw metric</option><option value="baseline">Baseline = 100</option></select></label></div><div class="watch"><button id="watch-toggle" hidden type="button" aria-label="Pause live view" aria-pressed="true">Pause</button><button id="watch-reload" hidden type="button" aria-label="Reload exported snapshot">Reload</button><span id="watch-notice" class="caption" aria-live="polite">Snapshot · JavaScript enables refresh.</span></div></div><noscript><p class="caption">Snapshot: all exact scopes below. Native run links locate source disclosures; baseline index requires JavaScript.</p></noscript><p id="performance-notice" class="caption" aria-live="polite"></p>${scopes.map(renderScope).join("")}</section>`;
}
