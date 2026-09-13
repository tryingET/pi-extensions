import { createHash } from "node:crypto";
import { renderExperimentAtlas } from "./runtime-dashboard-atlas.ts";
import { DASHBOARD_ATLAS_SCRIPT } from "./runtime-dashboard-atlas-script.ts";
import { ATLAS_CSS } from "./runtime-dashboard-atlas-style.ts";
import { detail, escapeHtml as e, list, rawDetail } from "./runtime-dashboard-format.ts";
import {
  renderAgainst,
  renderAttempt,
  renderCampaign,
  renderLevelGuide,
  renderMeasurements,
  renderOwnerGuidance,
} from "./runtime-dashboard-html-sections.ts";
import { buildResearchObservatoryModel } from "./runtime-dashboard-model.ts";
import { renderPerformanceDashboard } from "./runtime-dashboard-performance.ts";
import { DASHBOARD_PERFORMANCE_SCRIPT } from "./runtime-dashboard-performance-script.ts";
import { PERFORMANCE_CSS } from "./runtime-dashboard-performance-style.ts";
import { DASHBOARD_REFRESH_SCRIPT } from "./runtime-dashboard-refresh.ts";
import type { AutoresearchMatrixCampaignArtifactSummary } from "./runtime-matrix.ts";
import type { AutoresearchRuntimeStatus, AutoresearchSegmentCloseout } from "./runtime-model.ts";

// DESIGN.md is the token authority; values below follow the Foundry CSS export.
const CSS = `:root {
  color-scheme: dark;
  --colors-primary:#E7ECEF; --colors-secondary:#9BA8B2; --colors-neutral:#0C1015;
  --colors-surface:#171D23; --colors-muted:#303841; --colors-success:#4ADE80;
  --colors-warning:#F4BC45; --colors-error:#F07878; --colors-accent:#7BACFF;
  --typography-display-font-family:"Aptos","Candara","Trebuchet MS",sans-serif;
  --typography-body-md-font-family:"Aptos","Candara","Trebuchet MS",sans-serif;
  --typography-label-font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;
  --spacing-xs:4px; --spacing-sm:8px; --spacing-md:16px; --spacing-lg:24px;
  --spacing-xl:40px; --spacing-2xl:64px; --rounded-sm:4px;
}
*{box-sizing:border-box}html{scroll-padding-top:var(--spacing-lg)}
body{margin:0;background:var(--colors-neutral);color:var(--colors-primary);font:17px/1.65 var(--typography-body-md-font-family)}
a{color:var(--colors-accent);text-underline-offset:4px}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--colors-accent);outline-offset:3px}
.skip{position:absolute;left:var(--spacing-md);top:-100px;background:var(--colors-surface);padding:var(--spacing-md);z-index:2}.skip:focus{top:var(--spacing-md)}
.page{max-width:1280px;margin:auto;padding:var(--spacing-xl) var(--spacing-lg) var(--spacing-2xl)}
h1,h2,h3{font-family:var(--typography-display-font-family);font-weight:400;line-height:1.2;margin:0 0 var(--spacing-md)}
h1{font-size:clamp(40px,5.4vw,64px);letter-spacing:-.025em;line-height:1.05}h1 em{font-weight:400}
h2{font-size:32px}h3{font-size:26px}h4{font-size:18px;margin:0 0 var(--spacing-sm)}
p{margin:0 0 var(--spacing-md)}small,.caption{font-size:14px;color:var(--colors-secondary)}
.eyebrow,.folio,dt{font:12px/1.5 var(--typography-label-font-family);letter-spacing:.08em;text-transform:uppercase}
.eyebrow{margin-bottom:var(--spacing-md)}.masthead{border-top:3px solid var(--colors-primary);padding-top:var(--spacing-lg)}
.masthead-top{display:flex;justify-content:space-between;gap:var(--spacing-lg);align-items:baseline;margin-bottom:var(--spacing-lg)}
nav{display:flex;gap:var(--spacing-lg);flex-wrap:wrap;font-size:14px}.repo{font-family:var(--typography-label-font-family);font-size:12px}
.watch{display:flex;align-items:center;gap:var(--spacing-md);flex-wrap:wrap;margin:var(--spacing-md) 0}.watch button{font:inherit;background:var(--colors-surface);border:1px solid var(--colors-primary);border-radius:var(--rounded-sm);padding:8px 14px;min-height:44px;color:var(--colors-primary);cursor:pointer}
.identities{margin:var(--spacing-lg) 0;max-width:90ch}.identities p{margin-bottom:var(--spacing-sm)}
.freshness{border-left:3px solid var(--colors-warning);padding-left:var(--spacing-md);margin:var(--spacing-lg) 0 var(--spacing-xl);max-width:90ch}
.guide-title{font-size:20px}.guide-title span{font:14px var(--typography-body-md-font-family);color:var(--colors-secondary);margin-left:var(--spacing-md)}
.levels{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--colors-muted);border-bottom:1px solid var(--colors-muted)}
.levels li{padding:var(--spacing-lg) var(--spacing-md);border-right:1px solid var(--colors-muted)}.levels li:first-child{padding-left:0}.levels li:last-child{border-right:0}
.levels h3{font-size:20px;margin:var(--spacing-sm) 0}.levels p{font-size:14px;line-height:1.5}.levels small{font-size:12px}.folio{color:var(--colors-accent)}
.current{padding:var(--spacing-xl) 0}.current h2{font-size:clamp(32px,4vw,48px);max-width:26ch}
.current-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:var(--spacing-xl)}.gate{border-left:1px solid var(--colors-muted);padding-left:var(--spacing-lg)}
.counts{display:flex;flex-wrap:wrap;gap:var(--spacing-lg);padding:var(--spacing-lg) 0 0;border-top:1px solid var(--colors-muted);margin-top:var(--spacing-lg)}
.counts p{margin:0;font-size:14px}.counts strong{font-size:26px;font-family:var(--typography-display-font-family);margin-right:var(--spacing-sm)}
.research-body{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:var(--spacing-xl);align-items:start}
.research-body>*{min-width:0}article,section,aside{min-width:0}p,li,dd,h1,h2,h3,h4,td,th{overflow-wrap:anywhere}
.campaign{margin-bottom:var(--spacing-xl)}.campaign-header{border-top:2px solid var(--colors-primary);padding-top:var(--spacing-lg)}
.campaign-posture{font-size:14px}.campaign-posture p{margin-bottom:var(--spacing-sm)}.next-inline{font-size:15px;color:var(--colors-accent);padding:var(--spacing-md) 0}
.experiment{background:var(--colors-surface);border:1px solid var(--colors-muted);border-radius:var(--rounded-sm);padding:var(--spacing-lg);margin-bottom:var(--spacing-lg)}
.propositions{margin:var(--spacing-lg) 0;display:grid;gap:var(--spacing-md)}dt{color:var(--colors-secondary);margin-bottom:var(--spacing-xs)}dd{margin:0}
.status-line{border-left:3px solid var(--colors-warning);padding-left:var(--spacing-md);font-size:15px}
.lane{border-top:1px solid var(--colors-muted);padding-top:var(--spacing-lg);margin-top:var(--spacing-lg)}
.attempts{list-style:none;padding:0;margin:0}.attempt{padding:var(--spacing-md) 0;border-top:1px solid var(--colors-muted)}.attempt p{font-size:15px;margin-bottom:var(--spacing-sm)}
.attempt-heading{display:flex;justify-content:space-between;gap:var(--spacing-md);flex-wrap:wrap}.measurement{font-family:var(--typography-label-font-family);font-size:16px}
.supported{color:var(--colors-success)}.against{color:var(--colors-error)}.uncertain{color:var(--colors-warning)}
.empty{color:var(--colors-secondary);font-style:italic;padding:var(--spacing-md) 0}
#measurements{border-top:2px solid var(--colors-primary);padding-top:var(--spacing-lg)}.measurement-group{padding:var(--spacing-lg) 0;border-bottom:1px solid var(--colors-muted)}
.measurement-group h3 small{display:block;margin-top:var(--spacing-sm);font-family:var(--typography-body-md-font-family)}
.plot{display:block;width:100%;height:auto;fill:var(--colors-accent)}.plot text{fill:var(--colors-primary);font:14px var(--typography-label-font-family)}.axis{stroke:var(--colors-muted)}
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px}caption{text-align:left;color:var(--colors-secondary);font-size:12px;padding:var(--spacing-sm) 0}
th,td{text-align:left;vertical-align:top;padding:var(--spacing-sm);border-bottom:1px solid var(--colors-muted)}th{font-weight:600}
.evidence-against{margin-top:var(--spacing-xl);border-top:3px solid var(--colors-error);padding:var(--spacing-lg) 0}.evidence-against h2{color:var(--colors-error)}
.evidence-against ol{padding-left:var(--spacing-lg)}.evidence-against li{padding-bottom:var(--spacing-md)}.evidence-against li p{margin:var(--spacing-sm) 0}
details{border-top:1px solid var(--colors-muted);margin-top:var(--spacing-md);font-size:14px}summary{cursor:pointer;padding:var(--spacing-md) var(--spacing-xs);min-height:44px;font-weight:600}
.detail-body{padding:0 var(--spacing-xs) var(--spacing-md)}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:12px/1.6 var(--typography-label-font-family);max-height:34rem;overflow:auto;background:var(--colors-neutral);padding:var(--spacing-md)}
.audit{margin-top:var(--spacing-xl);border-top:2px solid var(--colors-primary);padding-top:var(--spacing-lg)}footer{margin-top:var(--spacing-xl);color:var(--colors-secondary);font-size:14px}
@media(max-width:900px){.research-body,.current-grid{grid-template-columns:1fr}.levels{grid-template-columns:repeat(2,minmax(0,1fr))}.levels li:nth-child(2){border-right:0}.levels li:nth-child(-n+2){border-bottom:1px solid var(--colors-muted)}.gate{border-left:0;border-top:1px solid var(--colors-muted);padding:var(--spacing-lg) 0 0}}
@media(max-width:480px){.page{padding:var(--spacing-lg) var(--spacing-md) var(--spacing-xl)}.masthead-top{display:block}nav{gap:var(--spacing-md)}.levels li{padding:var(--spacing-md) var(--spacing-sm)}.levels li:first-child{padding-left:var(--spacing-sm)}.experiment{padding:var(--spacing-md)}.guide-title span{display:block;margin:var(--spacing-sm) 0}.counts{gap:var(--spacing-md)}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
@media print{.page{max-width:none}nav,.skip{display:none}.research-body{display:block}.experiment{break-inside:avoid}}
`;

export function renderAutoresearchDashboardHtml(
  status: AutoresearchRuntimeStatus,
  closeout: AutoresearchSegmentCloseout,
  matrix: AutoresearchMatrixCampaignArtifactSummary,
  asOf = new Date().toISOString(),
): string {
  const model = buildResearchObservatoryModel(status, closeout, matrix, asOf);
  const scripts = [DASHBOARD_ATLAS_SCRIPT, DASHBOARD_PERFORMANCE_SCRIPT, DASHBOARD_REFRESH_SCRIPT];
  const scriptPolicy = scripts
    .map((script) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`)
    .join(" ");
  const runtimeObjective = status.campaignGoal.objective;
  const identities = matrix.campaigns.length
    ? matrix.campaigns
        .map(
          (c) =>
            `<p><b>${e(c.taskId ? `AK${c.taskId}` : "Task unresolved")}</b> — ${e(c.objective ?? "Objective not specified")}</p>`,
        )
        .join("")
    : `<p><b>Task:</b> not recorded in local runtime receipts</p><p><b>Objective:</b> ${e(runtimeObjective ?? "not specified")}</p>`;
  const runtime = `<section class="experiment"><p class="eyebrow">Local runtime / Level 1 receipt support</p><h3>${e(closeout.campaign ?? "No segment configured")}</h3><p>This local segment is separate from matrix campaigns, even in the same cwd.</p><p><b>Objective:</b> ${e(runtimeObjective ?? "not specified")}</p><p><b>Rejection criteria:</b> not specified. A configured metric threshold is not a falsification rule.</p>${model.runtimeAttempts.length ? `<ol class="attempts">${model.runtimeAttempts.map(renderAttempt).join("")}</ol>` : '<p class="empty">No local runtime attempts recorded.</p>'}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptPolicy}; base-uri 'none'; form-action 'none'"><title>Research Observatory · pi-autoresearch</title><style>${CSS}${ATLAS_CSS}${PERFORMANCE_CSS}</style></head><body><a class="skip" href="#performance">Skip to performance</a><div class="page">
  <header class="masthead"><h1>Research performance</h1><nav aria-label="Dashboard sections"><a href="#exploration">Explore</a><a href="#owner-context" title="Owner projection: ${e(model.execution.state)} · source & as-of; not a heartbeat">Sources</a></nav></header>
  <main>${renderPerformanceDashboard(model)}<details id="exploration" class="exploration"><summary>Explore · Experiment atlas & stack lab</summary>${renderExperimentAtlas(model)}</details><details id="owner-context"><summary>Owner state, identity & freshness · ${e(model.execution.state)} (owner projection, not heartbeat)</summary><p class="repo">Repository / ${e(model.cwd)}</p><p class="caption">Live view reloads every 2 seconds while unattended; interaction pauses it. Pi must be exporting; reloading does not advance work. Resume explicitly when ready. Storage failure disables automatic refresh, not manual reload.</p><p class="caption">Source: ${e(model.execution.source)} · As of ${e(model.asOf)}</p><div class="identities">${identities}</div><p class="caption">Last reported observation: ${e(model.lastObservation ?? "not recorded")}. ${e(model.freshnessWarning)}</p><details class="level-guide"><summary>Levels 1–4 · Requirements, not permissions</summary>${renderLevelGuide()}</details><section class="current" aria-labelledby="current"><div class="current-grid"><div><p class="eyebrow">Current state / read-only projection</p><h2 id="current">${e(model.headline)}</h2><p class="caption">Runtime owner projection: ${e(model.execution.state)}<br>Source: ${e(model.execution.source)}<br>Read as of ${e(model.execution.asOf)}. Live execution is not verified.</p></div><div class="gate"><p class="eyebrow">Next actor / action gate</p><h3>${e(model.nextActor)}</h3><p>${e(model.nextAction)}</p><p class="caption">No action is executed here. Declared level, execution and evidence are separate.</p></div></div><div class="counts"><p><strong>${matrix.exportedPacketCount}</strong>packet files inventoried</p><p><strong>${matrix.observedMeasurementCount}</strong>valid matrix attempt reports</p><p><strong>${matrix.coverageGapLaneCount}</strong>expected slots without valid measurements</p><p><strong>${model.runtimeAttempts.filter((a) => a.validMeasurement).length}</strong>valid local runtime reports</p></div><p class="caption">Inventory ≠ measurements ≠ independent samples. Zero missing slots does not mean success; unspecified inventory has unknown coverage.</p></section>
  </details><details id="evidence-notebook"><summary>Complete evidence notebook & measurements</summary><div class="research-body"><div id="research" tabindex="-1"><p class="eyebrow">01 / Experiments & every attempt</p>${matrix.campaigns.map(renderCampaign).join("")}${runtime}${matrix.unresolvedPackets.length ? `<section class="experiment"><h3>Unresolved packet reports</h3><p>These artifacts have no unambiguous campaign/lane identity. They are retained, not scored or merged.</p><ol class="attempts">${matrix.unresolvedPackets.map(renderAttempt).join("")}</ol></section>` : ""}</div><div>${renderMeasurements(model, status, closeout)}${renderAgainst(model)}</div></div>
  </details><section class="audit" id="audit"><p class="eyebrow">04 / Audit & source notes</p><h2>Trace the observation.</h2>${detail(`Source issues (${model.issues.length})`, model.issues.length ? list(model.issues) : "<p>No issues discovered within the bounded scan. This is not proof of completeness or campaign success.</p>")}${rawDetail("Local runtime owner projection", status.runtimeProjection)}${renderOwnerGuidance(model.cwd)}${detail("Discovery & provenance boundary", `<p>${e(matrix.boundary)}</p><p>Discovery: 512 JSON files, depth 12, 4096 visited entries, 32 MiB total; each file capped at 8 MiB. Links and identity mismatches fail closed. Local filesystem data is not cryptographically authenticated.</p>${list(matrix.artifactRoots)}`)}</section></main><footer>Research Observatory / offline, keyboard accessible, no network assets. Live view pauses on interaction and preserves exact performance scope/run/mode, atlas selections, filters and reading state. AK and empirical owner surfaces retain authority.</footer></div>${scripts.map((script) => `<script>${script}</script>`).join("")}</body></html>`;
}
