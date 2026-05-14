#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HELP_TEXT = `Export evalset JSON report to a standalone HTML file.

Usage:
  node ./scripts/export-evalset-report-html.mjs --in <report.json> [--out <report.html>] [--title <text>]

Options:
  --in, -i       Input report path (.json) [required]
  --out, -o      Output HTML path (default: input path with .html extension)
  --title        Custom report title
  --help, -h     Show this help
`;

function parseArgs(argv) {
  /** @type {{input?: string; output?: string; title?: string; help?: boolean}} */
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    switch (token) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--in":
      case "--input":
      case "-i":
        result.input = argv[i + 1];
        i += 1;
        break;
      case "--out":
      case "--output":
      case "-o":
        result.output = argv[i + 1];
        i += 1;
        break;
      case "--title":
        result.title = argv[i + 1];
        i += 1;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return result;
}

function requireValue(value, flag) {
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function money(value) {
  return `$${Number(value ?? 0).toFixed(6)}`;
}

function ms(value) {
  return `${Number(value ?? 0).toFixed(0)} ms`;
}

function passPill(pass) {
  return pass ? '<span class="pill ok">PASS</span>' : '<span class="pill bad">FAIL</span>';
}

function outcomePill(outcome) {
  if (outcome === "improved") {
    return '<span class="pill imp">Improved</span>';
  }
  if (outcome === "regressed") {
    return '<span class="pill reg">Regressed</span>';
  }
  return '<span class="pill same">No change</span>';
}

function checksText(entry) {
  const lines = toArray(entry?.checks).map((check) => {
    const marker = check?.pass ? "✅" : "❌";
    return `${marker} ${check?.details ?? ""}`;
  });
  return lines.length > 0 ? lines.join("\n") : "None";
}

function pageTemplate({ title, subtitle, summaryCards, tableHeader, tableRows }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #111a33;
      --line: #24335f;
      --txt: #e8eeff;
      --muted: #9fb0d8;
      --ok: #2ecc71;
      --bad: #ff6b6b;
      --same: #7f8ea3;
      --imp: #49dcb1;
      --reg: #ff8f70;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu; background: var(--bg); color: var(--txt); }
    .wrap { max-width: 1240px; margin: 0 auto; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
    .muted { color: var(--muted); font-size: 0.92rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .card { background: #0e1630; border: 1px solid #2a3a66; border-radius: 10px; padding: 10px; }
    .label { color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-size: .75rem; }
    .val { margin-top: 4px; font-size: 1.06rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: .91rem; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); }
    .pill { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: .74rem; font-weight: 700; border: 1px solid transparent; }
    .ok { background: rgba(46, 204, 113, .14); color: #9df7c5; border-color: rgba(46, 204, 113, .45); }
    .bad { background: rgba(255, 107, 107, .14); color: #ffc2c2; border-color: rgba(255, 107, 107, .45); }
    .same { background: rgba(127, 142, 163, .14); color: #d4dcf2; border-color: rgba(127, 142, 163, .45); }
    .imp { background: rgba(73, 220, 177, .14); color: #abf6df; border-color: rgba(73, 220, 177, .45); }
    .reg { background: rgba(255, 143, 112, .14); color: #ffd0c2; border-color: rgba(255, 143, 112, .45); }
    .meta { color: var(--muted); font-size: .8rem; margin-top: 6px; }
    pre { white-space: pre-wrap; background: #0d152b; border: 1px solid #2a3a66; border-radius: 8px; padding: 8px; max-height: 220px; overflow: auto; }
    details summary { cursor: pointer; color: #9dc2ff; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 980px) { .split { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1 style="margin:0 0 8px; font-size:1.32rem;">${esc(title)}</h1>
      <div class="muted">${esc(subtitle)}</div>
    </div>

    <div class="panel grid">
      ${summaryCards}
    </div>

    <div class="panel">
      <table>
        <thead>${tableHeader}</thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function summaryCard(label, value) {
  return `<div class="card"><div class="label">${esc(label)}</div><div class="val">${esc(value)}</div></div>`;
}

function renderRun(report, options) {
  const cases = toArray(report?.cases);

  const summaryCards = [
    summaryCard(
      "Pass rate",
      `${pct(report?.totals?.passRate)} (${report?.totals?.passedCases ?? 0}/${report?.totals?.scoredCases ?? 0})`,
    ),
    summaryCard("Avg latency", ms(report?.totals?.avgLatencyMs)),
    summaryCard("Total cost", money(report?.totals?.usage?.cost?.total)),
    summaryCard("Dataset", report?.dataset?.name ?? "n/a"),
    summaryCard("Variant", report?.variant?.name ?? "n/a"),
    summaryCard("Run ID", report?.run?.runId ?? "n/a"),
  ].join("\n");

  const rows = cases
    .map((entry, index) => {
      const checks = checksText(entry);
      return `<tr>
  <td>${index + 1}</td>
  <td><code>${esc(entry?.id ?? `case-${index + 1}`)}</code></td>
  <td>${passPill(Boolean(entry?.pass))}<div class="meta">${ms(entry?.latencyMs)}</div></td>
  <td><details><summary>checks + output</summary>
    <h4 style="margin:8px 0 6px;">Checks</h4><pre>${esc(checks)}</pre>
    <h4 style="margin:8px 0 6px;">Output preview</h4><pre>${esc(entry?.outputPreview ?? "")}</pre>
  </details></td>
</tr>`;
    })
    .join("\n");

  const title = options.title || `Evalset run report: ${report?.dataset?.name ?? "dataset"}`;
  const subtitle = [
    report?.dataset?.path,
    `model ${report?.model?.provider ?? "unknown"}/${report?.model?.id ?? "unknown"}`,
    `run ${report?.run?.runId ?? "n/a"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return pageTemplate({
    title,
    subtitle,
    summaryCards,
    tableHeader: `<tr><th>#</th><th>Case</th><th>Result</th><th>Details</th></tr>`,
    tableRows: rows,
  });
}

function renderCompare(report, options) {
  const baselineCases = toArray(report?.baseline?.cases);
  const candidateById = new Map(
    toArray(report?.candidate?.cases).map((entry) => [String(entry?.id ?? ""), entry]),
  );

  const summaryCards = [
    summaryCard(
      "Baseline pass",
      `${pct(report?.baseline?.totals?.passRate)} (${report?.baseline?.totals?.passedCases ?? 0}/${report?.baseline?.totals?.scoredCases ?? 0})`,
    ),
    summaryCard(
      "Candidate pass",
      `${pct(report?.candidate?.totals?.passRate)} (${report?.candidate?.totals?.passedCases ?? 0}/${report?.candidate?.totals?.scoredCases ?? 0})`,
    ),
    summaryCard("Δ pass rate", pct(report?.delta?.passRate)),
    summaryCard("Δ avg latency", ms(report?.delta?.avgLatencyMs)),
    summaryCard("Δ total cost", money(report?.delta?.totalCost)),
    summaryCard("Dataset hash", (report?.run?.datasetHash ?? "n/a").slice(0, 12)),
  ].join("\n");

  const rows = baselineCases
    .map((baselineEntry, index) => {
      const candidateEntry = candidateById.get(String(baselineEntry?.id ?? "")) ?? {};

      let outcome = "same";
      if (!baselineEntry?.pass && candidateEntry?.pass) {
        outcome = "improved";
      } else if (baselineEntry?.pass && !candidateEntry?.pass) {
        outcome = "regressed";
      }

      return `<tr>
  <td>${index + 1}</td>
  <td><code>${esc(baselineEntry?.id ?? `case-${index + 1}`)}</code></td>
  <td>${passPill(Boolean(baselineEntry?.pass))}<div class="meta">${ms(baselineEntry?.latencyMs)}</div></td>
  <td>${passPill(Boolean(candidateEntry?.pass))}<div class="meta">${ms(candidateEntry?.latencyMs)}</div></td>
  <td>${outcomePill(outcome)}</td>
  <td><details><summary>checks + output</summary>
    <div class="split">
      <div>
        <h4 style="margin:8px 0 6px;">Baseline checks</h4><pre>${esc(checksText(baselineEntry))}</pre>
        <h4 style="margin:8px 0 6px;">Baseline output</h4><pre>${esc(baselineEntry?.outputPreview ?? "")}</pre>
      </div>
      <div>
        <h4 style="margin:8px 0 6px;">Candidate checks</h4><pre>${esc(checksText(candidateEntry))}</pre>
        <h4 style="margin:8px 0 6px;">Candidate output</h4><pre>${esc(candidateEntry?.outputPreview ?? "")}</pre>
      </div>
    </div>
  </details></td>
</tr>`;
    })
    .join("\n");

  const title = options.title || `Evalset compare report: ${report?.dataset?.name ?? "dataset"}`;
  const subtitle = [
    report?.dataset?.path,
    `model ${report?.model?.provider ?? "unknown"}/${report?.model?.id ?? "unknown"}`,
    `run ${report?.run?.runId ?? "n/a"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return pageTemplate({
    title,
    subtitle,
    summaryCards,
    tableHeader: `<tr><th>#</th><th>Case</th><th>Baseline</th><th>Candidate</th><th>Outcome</th><th>Details</th></tr>`,
    tableRows: rows,
  });
}

function renderUnknown(report, options) {
  const title = options.title || "Evalset report (raw JSON)";
  const subtitle = `Unsupported report kind: ${report?.kind ?? "unknown"}`;
  const summaryCards = summaryCard("Kind", report?.kind ?? "unknown");
  const tableRows = `<tr><td><pre>${esc(JSON.stringify(report, null, 2))}</pre></td></tr>`;
  return pageTemplate({
    title,
    subtitle,
    summaryCards,
    tableHeader: `<tr><th>Report JSON</th></tr>`,
    tableRows,
  });
}

function defaultOutputPath(inputPath) {
  if (inputPath.toLowerCase().endsWith(".json")) {
    return inputPath.replace(/\.json$/i, ".html");
  }
  return `${inputPath}.html`;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    console.log(HELP_TEXT.trimEnd());
    return;
  }

  const input = resolve(process.cwd(), requireValue(cli.input, "--in"));
  const output = resolve(
    process.cwd(),
    cli.output ? requireValue(cli.output, "--out") : defaultOutputPath(input),
  );

  const raw = await readFile(input, "utf8");
  const parsed = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("Report JSON must be an object.");
  }

  let html;
  if (parsed.kind === "evalset-run") {
    html = renderRun(parsed, { title: cli.title });
  } else if (parsed.kind === "evalset-compare") {
    html = renderCompare(parsed, { title: cli.title });
  } else {
    html = renderUnknown(parsed, { title: cli.title });
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${html}\n`, "utf8");

  console.log(`Exported HTML report: ${output}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`export-evalset-report-html error: ${message}`);
  process.exit(1);
});
