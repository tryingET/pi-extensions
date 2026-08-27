// ---
// summary: "Renders the static self-contained corpus/index.html switcher table over the corpus index."
// read_when:
//   - "Changing the corpus switcher HTML, its embedded JSON escaping, or the summary columns."
// ---

/**
 * Render corpus/index.html from an index object.
 * Static, self-contained, no external assets. Sessions link to their per-session
 * context-strata.html when present. The index JSON is embedded with `<` escaped
 * exactly like the overlay template (\\u003c) so labels can never terminate the block.
 */
export function renderIndexHtml(index) {
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const dash = (value) => (value === null || value === undefined ? "—" : String(value));
  const fixed = (value, digits = 2) =>
    value === null || value === undefined || Number.isNaN(Number(value))
      ? "—"
      : Number(value).toFixed(digits);
  const pct = (value) =>
    value === null || value === undefined ? "—" : `${(Number(value) * 100).toFixed(1)}%`;

  const statusClass = { ok: "ok", empty: "empty", failed: "failed", unsupported: "failed" };
  const rows = index.sessions
    .map((s) => {
      const idCell = s.html
        ? `<a href="${esc(s.html)}">${esc(s.id)}</a>`
        : `<span class="plain">${esc(s.id)}</span>`;
      const cwdCell = s.cwd
        ? `<span class="cwd" title="${esc(s.cwd)}">${esc(s.cwd.length > 42 ? `…${s.cwd.slice(-41)}` : s.cwd)}</span>`
        : "—";
      const occupancy =
        s.lastResidentEst === null || s.lastResidentEst === undefined
          ? "—"
          : `${fixed(s.lastResidentEst, 0)} / ${fixed(s.contextWindow, 0)}`;
      const topCats = (s.topCategories ?? []).map((c) => `${esc(c.id)} ${pct(c.share)}`).join(", ");
      return [
        `<tr class="${statusClass[s.replayStatus] ?? "failed"}">`,
        `<td class="id">${idCell}</td>`,
        `<td class="cwdcell">${cwdCell}</td>`,
        `<td>${esc(s.replayStatus)}${s.replayStatus === "failed" && s.error ? ` <span class="err">${esc(String(s.error).slice(0, 80))}</span>` : ""}</td>`,
        `<td>${esc((s.models ?? []).join(", ")) || "—"}</td>`,
        `<td class="num">${dash(s.requests)}</td>`,
        `<td class="num">${dash(s.turns)}</td>`,
        `<td class="num">${dash(s.faults)}</td>`,
        `<td class="num">${fixed(s.onChainCostUsd)}</td>`,
        `<td class="num">${pct(s.cacheHitShare)}</td>`,
        `<td class="num">${pct(s.ghostShareOfToolTokenTurns)}</td>`,
        `<td class="num">${occupancy}</td>`,
        `<td class="num">${dash(s.runwayRequestsRemaining)}</td>`,
        `<td class="cats">${topCats || "—"}</td>`,
        "</tr>",
      ].join("");
    })
    .join("\n");

  const embedded = JSON.stringify(index).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>context corpus</title>
<style>
  :root { color-scheme: dark; }
  body { font: 13px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace; margin: 24px auto; max-width: 1180px; padding: 0 16px; color: #d8dce4; background: #16181d; }
  h1 { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa3b2; }
  p.note { color: #7a8296; margin: 4px 0 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #262a33; white-space: nowrap; }
  th { color: #9aa3b2; font-weight: 400; border-bottom: 1px solid #3a4150; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.id a { color: #6fbf9f; text-decoration: none; }
  td.id a:hover { text-decoration: underline; }
  td.cats, td.cats * { white-space: normal; }
  span.cwd { color: #7a8296; }
  tr.failed td { color: #b06a5a; }
  tr.empty td { color: #8a8f9c; }
  .err { color: #7a5a52; }
  span.plain { color: #d8dce4; }
</style>
</head>
<body>
<h1>context corpus</h1>
<p class="note">Multi-session index over strata.json artifacts. On-chain $ is sum-of-reported per session; numeric facts inherit their strata epistemic class. Derived aggregates and path/label metadata only — no message content.</p>
<table>
<thead><tr><th>session</th><th>cwd</th><th>status</th><th>models</th><th>reqs</th><th>turns</th><th>faults</th><th>on-chain $</th><th>cache hit</th><th>ghost share</th><th>last resident / window</th><th>runway reqs</th><th>top categories (token-turns)</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<script id="corpus-index-data" type="application/json">${embedded}</script>
</body>
</html>
`;
}
