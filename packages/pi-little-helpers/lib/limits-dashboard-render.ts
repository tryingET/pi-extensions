// summary: theme-native account cards, quota meters and expiry details for the limits dashboard.
// read_when: changing dashboard presentation, remaining-quota semantics, or date labels.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { isCodexProvider } from "./codex-accounts.ts";
import { creditExpiryTone, duration, percent, snapshotAge } from "./limits-dashboard-format.ts";
import { providerDetailLines, renderRunwayCard } from "./limits-runway.ts";

export { duration, fit, percent, snapshotAge } from "./limits-dashboard-format.ts";

import { limitsDate } from "./codex-limits.ts";
import type { LimitsAccountRow } from "./limits-dashboard-store.ts";
export function renderAccountCard(
  row: LimitsAccountRow,
  theme: Theme,
  width: number,
  active: boolean,
  selected: boolean,
  now: number,
): string[] {
  return renderRunwayCard(row, theme, width, active, selected, now);
}
export function renderAccountDetails(
  row: LimitsAccountRow | undefined,
  theme: Theme,
  active: boolean,
  now: number,
): string[] {
  if (!row)
    return [
      theme.fg("muted", "No matching subscriptions."),
      "",
      "Change your search or press Esc to clear it.",
    ];
  const snapshot = row.snapshot;
  const lines = [
    theme.fg("accent", theme.bold(row.account.label)),
    theme.fg(
      "muted",
      `${row.account.provider}  ·  ${active ? "● ACTIVE IN THIS SESSION" : "viewing only"}`,
    ),
    theme.fg(
      "dim",
      `${snapshot?.usage?.plan ? `${snapshot.usage.plan.toUpperCase()}  ·  ` : ""}Checked ${snapshotAge(row, now)}`,
    ),
    "",
  ];
  if (row.status === "loading" || row.status === "queued")
    lines.push(
      theme.fg(
        "accent",
        `↻ ${row.status === "loading" ? "Checking this account…" : "Queued for refresh…"}${snapshot ? " Previous snapshot below." : ""}`,
      ),
      "",
    );
  if (row.error)
    lines.push(
      theme.fg("warning", row.error),
      ...(snapshot ? ["Previous snapshot below — not a successful refresh."] : []),
      "",
    );
  if (!snapshot) {
    if (!row.error)
      lines.push(theme.fg("muted", "Usage loads independently for each subscription."));
    return lines;
  }
  if (!isCodexProvider(row.account.provider))
    return [...lines, ...providerDetailLines(snapshot, theme, now)];
  lines.push(theme.fg("text", theme.bold("USAGE WINDOWS")));
  if (snapshot.usageError)
    lines.push(theme.fg("warning", `Usage unavailable · ${snapshot.usageError}`));
  if (snapshot.usage?.windows.length === 0) lines.push("No usage windows reported.");
  for (const window of snapshot.usage?.windows ?? []) {
    const remaining = window.remainingPercent;
    const filled = remaining === undefined ? 0 : Math.round((remaining / 100) * 18);
    const meter =
      remaining === undefined
        ? theme.fg("dim", "─".repeat(18))
        : theme.fg(
            remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success",
            "━".repeat(filled),
          ) + theme.fg("dim", "─".repeat(18 - filled));
    lines.push(
      "",
      theme.fg("text", `${window.label}${window.primary ? " · base" : ""}`),
      `  ${meter}  ${percent(theme, remaining)} ${remaining === undefined ? "unknown" : "left"}`,
    );
    const resetMs = Date.parse(window.resetAt ?? "");
    lines.push(
      theme.fg(
        "dim",
        `  ${Number.isFinite(resetMs) ? (resetMs > now ? `Resets in ${duration(resetMs - now)}` : "Reset time passed · refresh to update") : "Reset time unknown"}`,
      ),
    );
    if (window.resetAt) lines.push(theme.fg("dim", `  ${limitsDate(window.resetAt)}`));
  }
  lines.push(
    "",
    theme.fg("text", theme.bold(`BANKED RESETS  ${snapshot.credits?.availableCount ?? "—"}`)),
  );
  if (snapshot.creditsError)
    lines.push(theme.fg("warning", `Resets unavailable · ${snapshot.creditsError}`));
  if (snapshot.credits) {
    const count = snapshot.credits.availableCount;
    if (count === 0) lines.push(theme.fg("muted", "No banked resets available."));
    const expiries = snapshot.credits.credits
      .filter((credit) => !credit.status || credit.status === "available")
      .map((credit) => Date.parse(credit.expiresAt ?? ""))
      .sort((a, b) => (Number.isFinite(a) ? a : Infinity) - (Number.isFinite(b) ? b : Infinity));
    for (let i = 0; i < Math.min(count, 100); i++) {
      const expiry = expiries[i];
      lines.push(
        "",
        theme.fg(
          creditExpiryTone(expiry, now),
          `${i + 1}. ${Number.isFinite(expiry) ? (expiry > now ? `Expires in ${duration(expiry - now)}` : "Expiry date passed") : "Expiry unknown"}`,
        ),
      );
      if (Number.isFinite(expiry))
        lines.push(theme.fg("dim", `   ${limitsDate(new Date(expiry).toISOString())}`));
    }
    if (count > 100) lines.push(`${count - 100} more reset credits not expanded.`);
  }
  lines.push(
    "",
    theme.fg("dim", "Window reset dates and credit expiry dates are different."),
    theme.fg("dim", "This dashboard never spends a reset credit."),
  );
  return lines;
}
