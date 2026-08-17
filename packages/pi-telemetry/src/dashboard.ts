// ---
// summary: self-contained HTML dashboard renderer for telemetry aggregates (no external assets or servers).
// read_when:
//   - changing dashboard sections, styling, or the inline-data contract.
// ---

import type { TelemetrySummary } from "./aggregate.ts";

export interface DashboardMeta {
  generatedAt: number;
  windowDays: number;
  sourceDir: string;
}

export function renderTelemetryDashboard(summary: TelemetrySummary, meta: DashboardMeta): string {
  const generated = new Date(meta.generatedAt).toISOString();
  const sections = [
    kpis(summary),
    section(
      "compaction",
      "Compaction pressure",
      [
        `<div class="card">${barChart(summary.perDay, "events/day (all kinds)")}</div>`,
        `<div class="card"><table>
          <tr><th>reason</th><th>count</th></tr>
          ${rows(summary.compaction.byReason.map((entry) => [entry.reason, String(entry.n)]))}
        </table></div>`,
        `<div class="card"><table>
          <tr><th>stage</th><th>failures</th><th>top error</th></tr>
          ${rows(summary.compactionFailures.map((entry) => [entry.stage, String(entry.n), entry.topError ?? ""]))}
        </table>
        <p class="muted">emitted by the owning compaction extension; unresolved-begin counts remain the fallback signal</p></div>`,
        `<div class="card"><table>
          <tr><th>metric</th><th>value</th></tr>
          ${rows([
            ["total compactions", String(summary.compaction.total)],
            [
              "avg summary chars",
              summary.compaction.avgSummaryChars === null
                ? "n/a"
                : String(summary.compaction.avgSummaryChars),
            ],
            [
              "max summary chars",
              summary.compaction.maxSummaryChars === null
                ? "n/a"
                : String(summary.compaction.maxSummaryChars),
            ],
            ["unresolved begins (failed/aborted)", String(summary.compaction.unresolvedBegins)],
            [
              "stalled after compaction (>10m idle)",
              String(summary.compaction.stalledAfterCompaction),
            ],
          ])}
        </table></div>`,
      ].join(""),
    ),
    section(
      "compaction-quality",
      "Compaction quality",
      [
        `<div class="card"><table>
          <tr><th>metric</th><th>value</th></tr>
          ${rows([
            ["quality events", String(summary.compactionQuality.total)],
            [
              "validation failures",
              `${summary.compactionQuality.validationFailures} (${summary.compactionQuality.validationFailureRatePct}%)`,
            ],
            [
              "fallbacks",
              `${summary.compactionQuality.fallbacks} (${summary.compactionQuality.fallbackRatePct}%)`,
            ],
            [
              "repairs",
              `${summary.compactionQuality.repairs} (${summary.compactionQuality.repairRatePct}%)`,
            ],
            [
              "split turns",
              `${summary.compactionQuality.splitTurns} (${summary.compactionQuality.splitTurnRatePct}%)`,
            ],
            [
              "verified worktree",
              `${summary.compactionQuality.worktreeVerified} (${summary.compactionQuality.worktreeVerifiedRatePct}%)`,
            ],
            ["message omission rate", `${summary.compactionQuality.messageOmissionRatePct}%`],
            ["avg compacted messages", nullable(summary.compactionQuality.avgCompactedMessages)],
            ["avg selected messages", nullable(summary.compactionQuality.avgSelectedMessages)],
            ["avg omitted messages", nullable(summary.compactionQuality.avgOmittedMessages)],
            ["avg continuity records", nullable(summary.compactionQuality.avgContinuityRecords)],
            ["avg evidence anchors", nullable(summary.compactionQuality.avgEvidenceAnchors)],
            ["avg duration ms", nullable(summary.compactionQuality.avgDurationMs)],
          ])}
        </table></div>`,
        `<div class="card"><table>
          <tr><th>boundedness / safety metric</th><th>value</th></tr>
          ${rows([
            [
              "omitted managed records",
              String(summary.compactionQuality.totalOmittedManagedRecords),
            ],
            ["omitted managed blocks", String(summary.compactionQuality.totalOmittedManagedBlocks)],
            ["redactions", String(summary.compactionQuality.totalRedactions)],
            ["truncated records", String(summary.compactionQuality.totalTruncatedRecords)],
            ["avg summary chars", nullable(summary.compactionQuality.avgSummaryChars)],
            ["avg input token budget", nullable(summary.compactionQuality.avgInputTokenBudget)],
            ["avg final token budget", nullable(summary.compactionQuality.avgFinalTokenBudget)],
          ])}
        </table></div>`,
        `<div class="card"><table>
          <tr><th>mode</th><th>events</th></tr>
          ${rows(summary.compactionQuality.byMode.map((entry) => [entry.mode, String(entry.n)]))}
        </table></div>`,
      ].join(""),
    ),
    section(
      "recall",
      "Compaction recall",
      [
        `<div class="card"><table>
          <tr><th>metric</th><th>value</th></tr>
          ${rows([
            ["recall calls", String(summary.recall.total)],
            ["hits returned", String(summary.recall.hits)],
            ["ranked hits", String(summary.recall.totalRankedHits)],
            ["zero-hit calls", `${summary.recall.zeroHit} (${summary.recall.zeroHitRatePct}%)`],
            [
              "scope widened",
              `${summary.recall.scopeWidened} (${summary.recall.scopeWidenedRatePct}%)`,
            ],
            ["lineage degraded", `${summary.recall.degraded} (${summary.recall.degradedRatePct}%)`],
            ["source omission rate", `${summary.recall.sourceOmissionRatePct}%`],
            ["avg source entries", nullable(summary.recall.avgSourceEntries)],
            ["avg source entries omitted", nullable(summary.recall.avgSourceEntriesOmitted)],
            ["avg candidates", nullable(summary.recall.avgCandidates)],
            ["avg ranked hits", nullable(summary.recall.avgTotalHits)],
            ["avg page hits", nullable(summary.recall.avgHits)],
            ["avg expanded", nullable(summary.recall.avgExpanded)],
            ["avg direct refs", nullable(summary.recall.avgDirectRefs)],
            ["avg duration ms", nullable(summary.recall.avgDurationMs)],
          ])}
        </table></div>`,
        `<div class="card"><table>
          <tr><th>mode</th><th>calls</th></tr>
          ${rows(summary.recall.byMode.map((entry) => [entry.mode, String(entry.n)]))}
        </table></div>`,
        `<div class="card"><table>
          <tr><th>scope</th><th>calls</th></tr>
          ${rows(summary.recall.byScope.map((entry) => [entry.scope, String(entry.n)]))}
        </table>
        <p class="muted">metadata only: no query text, recalled content, file contents, or absolute paths are persisted</p></div>`,
      ].join(""),
    ),
    section(
      "tools",
      "Tool calls",
      `<div class="card"><table>
        <tr><th>tool</th><th>failures</th><th>top error signature</th></tr>
        ${rows(summary.toolCalls.topFailing.map((entry) => [entry.tool, String(entry.n), entry.topError ?? ""]))}
      </table>
      <p class="muted">${summary.toolCalls.total} calls, ${summary.toolCalls.failed} failed (${summary.toolCalls.failureRatePct}%)</p></div>`,
    ),
    section(
      "vault",
      "Prompt Vault",
      `<div class="card"><table>
        <tr><th>metric</th><th>value</th></tr>
        ${rows([
          ["queries", String(summary.vault.total)],
          ["failed", String(summary.vault.failed)],
        ])}
      </table></div>`,
    ),
    section(
      "skills",
      "Skill loads",
      `<div class="card"><table>
        <tr><th>skill</th><th>loads</th></tr>
        ${rows(summary.skills.map((entry) => [entry.skill, String(entry.n)]))}
      </table></div>`,
    ),
    section(
      "selfdriving",
      "Self-driving follow-ups",
      `<div class="card"><table>
        <tr><th>metric</th><th>value</th></tr>
        ${rows([
          ["total follow-up attempts", String(summary.followUps.total)],
          ["sent", String(summary.followUps.sent)],
          ["blocked", String(summary.followUps.blocked)],
        ])}
      </table>
      <table>
        <tr><th>blocked reason</th><th>count</th></tr>
        ${rows(summary.followUps.byBlockedReason.map((entry) => [entry.reason, String(entry.n)]))}
      </table></div>`,
    ),
    section(
      "subagents",
      "Subagents",
      `<div class="card"><table>
        <tr><th>profile</th><th>dispatches</th><th>failed</th></tr>
        ${rows(summary.subagents.byProfile.map((entry) => [entry.profile, String(entry.n), String(entry.failed)]))}
      </table>
      <p class="muted">${summary.subagents.total} dispatches, ${summary.subagents.failed} failed</p></div>`,
    ),
    section(
      "raw",
      "Event kinds",
      `<div class="card"><table>
        <tr><th>kind</th><th>events</th></tr>
        ${rows(summary.perKind.map((entry) => [entry.kind, String(entry.n)]))}
      </table></div>`,
    ),
  ].join("\n");

  const navigation = [
    "compaction",
    "compaction-quality",
    "recall",
    "tools",
    "vault",
    "skills",
    "selfdriving",
    "subagents",
    "raw",
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi telemetry — last ${meta.windowDays}d</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; background: #14171c; color: #d7dce3; }
  header { padding: 20px 28px 8px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .muted { color: #7b8593; font-size: 12px; }
  nav { position: sticky; top: 0; z-index: 2; display: flex; gap: 4px; flex-wrap: wrap; padding: 10px 28px; background: #14171cf2; border-bottom: 1px solid #232933; }
  nav a { color: #9fb3d1; text-decoration: none; padding: 4px 10px; border-radius: 999px; border: 1px solid #2a3140; font-size: 12px; }
  nav a:hover { background: #1d232d; }
  main { padding: 8px 28px 48px; display: grid; gap: 18px; }
  section h2 { font-size: 15px; margin: 0 0 10px; color: #aebacf; letter-spacing: .04em; text-transform: uppercase; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .kpi { background: #1a1f27; border: 1px solid #262d39; border-radius: 10px; padding: 12px 14px; }
  .kpi b { display: block; font-size: 22px; color: #e8edf4; }
  .kpi span { color: #7b8593; font-size: 11px; }
  .card { background: #1a1f27; border: 1px solid #262d39; border-radius: 10px; padding: 14px; overflow-x: auto; }
  section div.card + div.card { margin-top: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid #232933; vertical-align: top; }
  th { color: #7b8593; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .bars { display: flex; align-items: flex-end; gap: 3px; height: 90px; }
  .bar { flex: 1; min-width: 6px; background: #4f83d1; border-radius: 2px 2px 0 0; position: relative; }
  .bar:hover::after { content: attr(data-tip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #0d1014; border: 1px solid #2a3140; padding: 3px 7px; border-radius: 6px; font-size: 11px; white-space: nowrap; }
</style>
</head>
<body>
<header>
  <h1>Pi telemetry</h1>
  <p class="muted">window ${meta.windowDays}d · generated ${generated} · source ${escapeHtml(meta.sourceDir)} · ${escapeHtml(provenance(summary))} · mirror-only observability, not authority</p>
</header>
<nav>${navigation.map((id) => `<a href="#${id}">${id}</a>`).join("")}</nav>
<main>
${sections}
</main>
</body>
</html>`;
}

function provenance(summary: TelemetrySummary): string {
  if (summary.totalEvents === 0) {
    return "no data yet — run /telemetry backfill to seed history from session JSONL";
  }
  const live = summary.sources.find((entry) => entry.source === "live")?.n ?? 0;
  const backfilled = summary.sources.find((entry) => entry.source === "backfill")?.n ?? 0;
  return `measured live ${live} · derived from history ${backfilled}`;
}

function kpis(summary: TelemetrySummary): string {
  const entries: Array<[string, string]> = [
    ["events", String(summary.totalEvents)],
    ["compactions", String(summary.compaction.total)],
    ["quality fallbacks", String(summary.compactionQuality.fallbacks)],
    ["recall calls", String(summary.recall.total)],
    ["recall zero-hit", String(summary.recall.zeroHit)],
    ["stalled >10m", String(summary.compaction.stalledAfterCompaction)],
    ["tool failures", String(summary.toolCalls.failed)],
    ["vault queries", String(summary.vault.total)],
    ["follow-ups sent", String(summary.followUps.sent)],
    ["follow-ups blocked", String(summary.followUps.blocked)],
    ["subagents", String(summary.subagents.total)],
  ];
  return `<div id="overview" class="kpis">${entries.map(([label, value]) => `<div class="kpi"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join("")}</div>`;
}

function nullable(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function section(id: string, title: string, body: string): string {
  return `<section id="${id}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function rows(entries: Array<Array<string>>): string {
  if (entries.length === 0) {
    return `<tr><td class="muted">no data in window</td><td></td></tr>`;
  }
  return entries
    .map((entry) => `<tr>${entry.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
    .join("");
}

function barChart(perDay: Array<{ day: string; n: number }>, label: string): string {
  if (perDay.length === 0) return `<p class="muted">no data in window</p>`;
  const max = Math.max(...perDay.map((entry) => entry.n), 1);
  const bars = perDay
    .map((entry) => {
      const height = Math.max(4, Math.round((entry.n / max) * 100));
      return `<div class="bar" style="height:${height}%" data-tip="${escapeHtml(entry.day)}: ${entry.n}"></div>`;
    })
    .join("");
  return `<div><div class="bars">${bars}</div><p class="muted">${escapeHtml(label)} · ${perDay.length}d covered</p></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
