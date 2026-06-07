import { isBetter } from "./runtime-metrics.ts";
import type { MetricDirection } from "./runtime-model.ts";

export function computeAutoresearchDashboardImprovement(input: {
  baseline: number | null;
  best: number | null;
  direction: MetricDirection | null;
}): { label: string; className: string } {
  if (input.baseline === null || input.best === null || input.baseline === 0) {
    return { label: "—", className: "" };
  }
  const rawPercent = ((input.best - input.baseline) / input.baseline) * 100;
  const improved = input.direction ? isBetter(input.best, input.baseline, input.direction) : false;
  const signed = rawPercent > 0 ? `+${rawPercent.toFixed(1)}%` : `${rawPercent.toFixed(1)}%`;
  return { label: signed, className: improved ? "good" : rawPercent === 0 ? "warn" : "bad" };
}

export function formatAutoresearchDashboardNumber(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted =
    Math.abs(value) >= 100
      ? value.toFixed(0)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);
  return `${formatted}${unit}`;
}

export function cssClassToken(value: string): string {
  return value.replace(/[^a-z0-9_-]/giu, "_").toLowerCase();
}

export function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderAutoresearchDashboardShareSvg(input: {
  metricName: string;
  posture: string;
  improvement: string;
  baseline: string;
  best: string;
  recommendedNext: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1117"/><circle cx="1020" cy="-40" r="280" fill="#58a6ff" opacity="0.16"/><text x="48" y="82" fill="#fff" font-size="34" font-family="system-ui">pi-autoresearch</text><text x="48" y="132" fill="#8b949e" font-size="18" font-family="system-ui">${escapeHtml(input.metricName)} · ${escapeHtml(input.posture)}</text><text x="48" y="240" fill="#3fb950" font-size="64" font-family="monospace">${escapeHtml(input.improvement)}</text><text x="48" y="310" fill="#c9d1d9" font-size="24" font-family="monospace">${escapeHtml(input.baseline)} → ${escapeHtml(input.best)}</text><text x="48" y="550" fill="#58a6ff" font-size="18" font-family="system-ui">${escapeHtml(input.recommendedNext).slice(0, 120)}</text></svg>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
