import type { AutoresearchDashboardOutcomeClass } from "./runtime-matrix-model.ts";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function formatAutoresearchDashboardNumber(value: number | null, unit = ""): string {
  return value === null || !Number.isFinite(value)
    ? "not measured"
    : `${String(value)}${unit ? ` ${unit}` : ""}`;
}
export function outcomeLabel(outcome: AutoresearchDashboardOutcomeClass): string {
  const labels: Record<AutoresearchDashboardOutcomeClass, string> = {
    improvement: "Reported improvement",
    regression: "Regression",
    correctness_failure: "Correctness failure",
    resource_censored: "Resource censored",
    inconclusive: "Inconclusive / under-sampled",
    measurement_invalid: "Invalid measurement / crash",
    baseline_reference: "Baseline reference",
    threshold_preserved: "Threshold preserved — not improvement",
    threshold_satisfied: "Threshold satisfied — not improvement",
    not_evaluated: "Not evaluated",
    progress_count: "Controller workflow count",
    unclassified: "Unclassified report",
  };
  return labels[outcome];
}
export function outcomeTone(outcome: AutoresearchDashboardOutcomeClass): string {
  if (["regression", "correctness_failure", "measurement_invalid"].includes(outcome))
    return "against";
  if (outcome === "improvement") return "supported";
  return "uncertain";
}
export function detail(title: string, body: string): string {
  return `<details><summary>${escapeHtml(title)}</summary><div class="detail-body">${body}</div></details>`;
}
export function rawDetail(title: string, value: unknown): string {
  return detail(title, `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`);
}
export function list(items: readonly string[]): string {
  return `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
}
