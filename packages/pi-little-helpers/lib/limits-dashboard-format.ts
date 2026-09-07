// summary: terminal-safe formatting shared by provider cards, runway details and timeline.
// read_when: changing dashboard width, duration, money, or percent formatting.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { LimitsAccountRow } from "./limits-dashboard-store.ts";
/** Expiry urgency, not quota renewal: inclusive 72h warning / 24h critical boundaries. */
export function creditExpiryTone(
  expiry: number | undefined,
  now: number,
): "dim" | "text" | "warning" | "error" {
  if (expiry === undefined || !Number.isFinite(expiry)) return "dim";
  const remaining = expiry - now;
  return remaining <= 86400000 ? "error" : remaining <= 3 * 86400000 ? "warning" : "text";
}

export function fit(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
export function snapshotAge(row: LimitsAccountRow, now: number): string {
  if (!row.snapshot) return "not checked";
  const age = now - row.snapshot.fetchedAt;
  return age < 60_000 ? "just now" : `${duration(age)} ago`;
}
export function percent(theme: Theme, value?: number): string {
  if (value === undefined) return theme.fg("dim", "—");
  return theme.fg(value <= 10 ? "error" : value <= 25 ? "warning" : "success", `${value}%`);
}
export function money(value?: number): string {
  return value === undefined ? "unknown" : `$${value.toFixed(2)}`;
}
export function meter(theme: Theme, remaining?: number): string {
  if (remaining === undefined) return theme.fg("dim", "─".repeat(18));
  const filled = Math.max(0, Math.min(18, Math.round((remaining / 100) * 18)));
  return (
    theme.fg(
      remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success",
      "━".repeat(filled),
    ) + theme.fg("dim", "─".repeat(18 - filled))
  );
}
