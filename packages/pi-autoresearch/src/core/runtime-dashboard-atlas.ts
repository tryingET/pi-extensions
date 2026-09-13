import {
  type AtlasNode,
  atlasAttemptId,
  buildAtlasNodes,
  contribution,
} from "./runtime-dashboard-atlas-model.ts";
import {
  detail,
  escapeHtml as e,
  list,
  formatAutoresearchDashboardNumber as number,
  outcomeLabel,
} from "./runtime-dashboard-format.ts";
import { renderAttempt } from "./runtime-dashboard-html-sections.ts";
import type { ResearchObservatoryModel } from "./runtime-dashboard-model.ts";

const CATEGORY = {
  signal: "Reported signal",
  against: "Evidence against",
  unknown: "Open / unknown",
};
function mapNode(node: AtlasNode, index: number): string {
  const attempts = node.lanes.flatMap((l) => l.attempts);
  const categories = [...new Set(attempts.map(contribution))];
  if (!attempts.length) categories.push("unknown");
  return `<li class="atlas-cell" data-atlas-cell="${node.id}" data-categories="${categories.join(" ")}">
  <div class="atlas-cell-heading"><span class="atlas-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><a class="atlas-node" id="${node.id}-link" data-atlas-node="${node.id}" href="#${node.id}"><span class="eyebrow">${e(node.kind)} / ${e(node.label)}</span><strong>${e(node.hypothesis ?? (node.kind === "experiment" ? "Hypothesis not specified" : "Inspect source observations"))}</strong><span class="caption">${e(node.scenario ?? "Scenario unknown")}</span></a></div>
  <ul class="atlas-lanes">${node.lanes.map((lane, li) => `<li><span class="atlas-lane-label">${e(lane.label)}</span><div class="atlas-attempts">${lane.attempts.map((a, ai) => `<a class="atlas-mark ${contribution(a)}" id="${atlasAttemptId(node, li, ai)}-link" data-atlas-node="${node.id}" data-atlas-attempt="${atlasAttemptId(node, li, ai)}" href="#${atlasAttemptId(node, li, ai)}" aria-label="${e(`${node.label} / ${lane.label} / attempt ${ai + 1}: ${outcomeLabel(a.outcome)}${a.packetBinding === "quarantined" ? "; quarantined source history" : ""}`)}"><span aria-hidden="true">${contribution(a) === "signal" ? "●" : contribution(a) === "against" ? "×" : "?"}</span><span class="atlas-mark-label">${ai + 1} · ${e(outcomeLabel(a.outcome))}${a.packetBinding === "quarantined" ? " · quarantined" : ""}</span></a>`).join("") || '<span class="atlas-unobserved">○ No attempts · untested</span>'}</div></li>`).join("") || '<li class="atlas-unobserved">No lane inventory · coverage unknown</li>'}</ul>
  <label class="atlas-pick" data-atlas-enhanced hidden><input type="checkbox" id="${node.id}-pick" data-stack-pick="${node.id}" ${node.kind !== "experiment" ? "disabled" : ""}> ${node.kind === "experiment" ? "Add to stack lab" : "Source collection · not stackable experiment identity"}</label></li>`;
}
function panel(node: AtlasNode): string {
  return `<details class="atlas-panel" data-atlas-panel="${node.id}" id="${node.id}" data-atlas-facts="${e(JSON.stringify({ campaign: node.campaign, campaignLabel: node.campaignLabel, label: node.label, facts: node.facts }))}"><summary id="${node.id}-summary">${e(node.label)} · evidence inspector</summary><div class="detail-body"><p class="eyebrow">${e(node.campaignLabel)}</p><h3>${e(node.hypothesis ?? "Hypothesis not specified")}</h3><dl class="propositions"><div><dt>Prediction</dt><dd>${e(node.prediction ?? "not specified")}</dd></div><div><dt>Rejection criteria</dt><dd>${e(node.rejection ?? "not specified; no falsification inferred")}</dd></div><div><dt>Scenario</dt><dd>${e(node.scenario ?? "unknown")}</dd></div></dl><p class="caption">Every mark is a source report, not an independent sample. Lifecycle disposition is not an empirical verdict.</p>${node.lanes.map((lane, li) => `<section><h4>${e(lane.label)}</h4><p class="caption">${e(lane.note)}. Not live execution.</p>${lane.attempts.map((a, ai) => `<details id="${atlasAttemptId(node, li, ai)}" data-atlas-attempt-detail><summary id="${atlasAttemptId(node, li, ai)}-summary">Attempt ${ai + 1} · ${e(outcomeLabel(a.outcome))}</summary><p class="atlas-raw">Individual raw value: ${e(number(a.metric, a.identity.metricUnit ?? ""))} · ${a.comparisonKey && a.validMeasurement ? "see exact comparison group in measurement notebook" : "non-comparable"}</p>${a.packetBinding === "quarantined" ? '<p class="against">Quarantined source history — not evidence for this lane.</p>' : ""}<ol class="attempts">${renderAttempt(a)}</ol></details>`).join("") || '<p class="empty">No attempts recorded. The hypothesis remains untested.</p>'}</section>`).join("")}${detail(
    "Structured stack evidence",
    `<p>Subject, base and files use only matched valid measurements with valid schema and lineage. Excluded reports or empty lanes keep completeness unknown; raw history remains inspectable. Neither completeness nor compatibility is established.</p><dl class="propositions">${Object.entries(
      node.facts,
    )
      .map(
        ([name, fact]) =>
          `<div><dt>${e(name)}</dt><dd>${e(fact.values.join(" · ") || (fact.complete ? "Explicit empty list" : "unknown"))}${fact.complete ? "" : " · incomplete / unknown"}</dd></div>`,
      )
      .join("")}</dl>`,
  )}${detail("Atlas source paths", list(node.sources))}</div></details>`;
}
function contributions(nodes: AtlasNode[]): string {
  const attempts = nodes.flatMap((n) => n.lanes.flatMap((l) => l.attempts));
  return `<section class="atlas-contributions" aria-labelledby="contributions-title"><div><p class="eyebrow">Contribution index / qualitative</p><h3 id="contributions-title">What did we learn?</h3><p class="caption">Signal includes baseline and threshold reports, not just improvements. No hypothesis verdicts or summed gains. Repeated source appearances are not independent samples.</p></div><div class="atlas-tally">${Object.entries(
    CATEGORY,
  )
    .map(
      ([key, label]) =>
        `<div class="${key}"><strong>${attempts.filter((a) => contribution(a) === key).length}</strong><span>${label}</span></div>`,
    )
    .join("")}</div></section>`;
}
export function renderExperimentAtlas(model: ResearchObservatoryModel): string {
  const nodes = buildAtlasNodes(model);
  const islands = new Map<string, AtlasNode[]>();
  for (const node of nodes)
    islands.set(node.campaign, [...(islands.get(node.campaign) ?? []), node]);
  let index = 0;
  return `<section class="atlas" id="atlas" aria-labelledby="atlas-title"><div class="atlas-heading"><div><p class="eyebrow">01 / Experiment atlas</p><h2 id="atlas-title">Follow the evidence.<br><em>Not the hype.</em></h2></div><p class="caption">Campaign → experiment → lane → attempt.<br>Lines show containment only, never causality.<br>Select a node to read its evidence.</p></div>
  <div class="atlas-toolbar" data-atlas-enhanced hidden><label>Find an experiment<input type="search" id="atlas-search" placeholder="Hypothesis, scenario, lane…" autocomplete="off"></label><label>Contribution<select id="atlas-filter"><option value="all">All reports</option><option value="signal">Reported signal</option><option value="against">Evidence against</option><option value="unknown">Open / unknown</option></select></label><button type="button" id="atlas-reset">Reset filters</button><span id="atlas-count" role="status" class="caption"></span></div>
  <p class="caption">Filters locate experiments; all their attempts stay visible. The full notebook is never filtered.</p><div class="atlas-legend"><span class="signal">● Reported signal</span><span class="against">× Evidence against</span><span class="unknown">? Open / unknown</span><span>○ Untested</span></div>
  <div class="atlas-workspace"><div class="atlas-map" id="atlas-map" data-reading-scroll aria-label="Experiment containment map">${[...islands.values()].map((group) => `<section class="atlas-island" data-atlas-island><header><span class="atlas-root" aria-hidden="true">◎</span><h3>${e(group[0].campaignLabel)}</h3></header><ol class="atlas-cells">${group.map((node) => mapNode(node, index++)).join("")}</ol></section>`).join("") || `<div class="atlas-empty"><span class="atlas-empty-symbol" aria-hidden="true">◎</span><p class="eyebrow">An uncharted question</p><h3>No experiment evidence yet.</h3><p>The atlas draws only discovered experiments and source observations. No decorative runs, imagined links or invented wins.</p><a href="#research">Inspect the source notebook →</a></div>`}<p id="atlas-no-results" class="atlas-empty" hidden>No matching experiments. Reset filters to reveal the map; the full notebook below is never filtered.</p></div>
  <aside class="atlas-inspector" id="atlas-inspector" data-reading-scroll aria-label="Selected experiment evidence"><div class="atlas-inspector-heading"><p class="eyebrow">Field lens / evidence inspector</p><span id="atlas-selection-notice" class="caption" role="status">Select a map node, or open an evidence panel below.</span></div>${nodes.map(panel).join("") || '<p class="empty">Nothing to inspect yet. Plans will appear without implying launch; measurements will appear without implying success.</p>'}</aside></div>${contributions(nodes)}
  <section class="atlas-stack" id="stack-lab" aria-labelledby="stack-title"><div><p class="eyebrow">02 / Stack lab · exploration only</p><h2 id="stack-title">Better together?<br><em>Still a question.</em></h2><p>Compare ideas without pretending they compose. Same base or disjoint files do not establish stackability.</p></div><div><p class="atlas-compatibility">Compatibility unknown — not tested together.</p><noscript><p>Enable JavaScript to select pairs. Structured evidence is available in every inspector without it.</p></noscript><div data-atlas-enhanced hidden><p id="stack-count" role="status">Select at least two experiments from the map.</p><div class="stack-pair-controls"><label>First experiment<select id="stack-left" aria-label="First experiment"></select></label><label>Second experiment<select id="stack-right" aria-label="Second experiment"></select></label></div><button type="button" id="stack-clear">Clear stack selection</button><div id="stack-evidence" aria-live="polite"></div></div><p class="caption">No joint-test owner evidence is exposed by this projection. No combined metric, promotion, mutation or execution.</p></div></section></section>`;
}
