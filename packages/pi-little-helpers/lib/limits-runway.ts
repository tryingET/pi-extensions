// summary: provider-neutral runway cards, monetary detail, and chronological reset/expiry overview.
// read_when: changing /limits overview semantics, attention filtering, or provider detail presentation.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { isCodexProvider } from "./codex-accounts.ts";
import { limitsDate } from "./codex-limits.ts";
import {
  creditExpiryTone,
  duration,
  fit,
  meter,
  money,
  percent,
  snapshotAge,
} from "./limits-dashboard-format.ts";
import { baseHeadroom, type LimitsAccountRow, nextCreditExpiry } from "./limits-dashboard-store.ts";
import type { LimitsSnapshot } from "./limits-types.ts";

/** Presentation facts stay separate: available count is not an expiry or a quota renewal. */
export function bankedResetFacts(row: LimitsAccountRow, now: number) {
  if (!isCodexProvider(row.account?.provider ?? row.snapshot?.provider ?? "")) return undefined;
  const credits = row.snapshot?.credits;
  const count = credits?.availableCount;
  const expiry = nextCreditExpiry(row);
  const dated = (credits?.credits ?? []).filter(
    (credit) =>
      (!credit.status || credit.status === "available") &&
      Number.isFinite(Date.parse(credit.expiresAt ?? "")),
  ).length;
  return {
    count,
    expiry,
    partialDates: count !== undefined && dated < count,
    tone: creditExpiryTone(expiry, now),
  };
}
function expiryText(facts: NonNullable<ReturnType<typeof bankedResetFacts>>, now: number) {
  if (facts.count === 0) return "none";
  if (facts.expiry === undefined) return "unknown ?";
  if (facts.expiry <= now) return `!!past${facts.partialDates ? "?" : ""} ↻`;
  return `${facts.tone === "error" ? "!!" : facts.tone === "warning" ? "!" : ""}${duration(facts.expiry - now)}${facts.partialDates ? "?" : ""}`;
}
export function bankedResetSummary(row: LimitsAccountRow, now: number) {
  const facts = bankedResetFacts(row, now);
  if (!facts) return undefined;
  if (facts.count === undefined) return { text: "↺? expiry?", tone: facts.tone };
  if (facts.count === 0) return { text: "↺0 · none", tone: facts.tone };
  const when =
    facts.expiry === undefined
      ? "expiry?"
      : facts.expiry <= now
        ? "!!past"
        : `${facts.tone === "text" ? "next " : ""}${expiryText(facts, now)}`;
  return { text: `↺${facts.count} ${when}`, tone: facts.tone };
}

function hasPartialBalance(row: LimitsAccountRow): boolean {
  const balance = row.snapshot?.money;
  return Boolean(
    balance &&
      (balance.walletUnavailable ||
        balance.walletRemaining === undefined ||
        (balance.keyLimit !== null && balance.keyRemaining === undefined)),
  );
}

export function needsAttention(row: LimitsAccountRow): boolean {
  return Boolean(
    row.error ||
      row.status === "error" ||
      row.snapshot?.usageError ||
      row.snapshot?.creditsError ||
      hasPartialBalance(row) ||
      row.snapshot?.money?.keyRemaining === 0 ||
      row.snapshot?.money?.walletRemaining === 0 ||
      ["warning", "error"].includes(bankedResetSummary(row, Date.now())?.tone ?? "") ||
      (baseHeadroom(row) ?? 100) <= 25,
  );
}
export function nextReset(row: LimitsAccountRow, now: number): number | undefined {
  const values = (row.snapshot?.usage?.windows ?? [])
    .map((w) => Date.parse(w.resetAt ?? ""))
    .filter((value) => Number.isFinite(value) && value > now);
  return values.length ? Math.min(...values) : undefined;
}
function bottleneck(row: LimitsAccountRow) {
  return row.snapshot?.usage?.windows
    .filter((w) => w.primary && w.remainingPercent !== undefined)
    .sort((a, b) => (a.remainingPercent ?? 100) - (b.remainingPercent ?? 100))[0];
}

/** Sort the displayed quota window, not other windows, credit expiries, or USD balances. */
export function compareOverviewRows(a: LimitsAccountRow, b: LimitsAccountRow): number {
  const quotaA = a.snapshot?.money ? undefined : bottleneck(a);
  const quotaB = b.snapshot?.money ? undefined : bottleneck(b);
  const resetA = Date.parse(quotaA?.resetAt ?? "");
  const resetB = Date.parse(quotaB?.resetAt ?? "");
  // Passed dates retain their chronological position and the renderer's refresh warning.
  const renewal =
    (Number.isFinite(resetA) ? resetA : Infinity) - (Number.isFinite(resetB) ? resetB : Infinity);
  return (
    renewal || (quotaA?.remainingPercent ?? Infinity) - (quotaB?.remainingPercent ?? Infinity) || 0
  );
}

/** Cell widths include no separators; default 71-inner-column layout fits eight rows. */
export function overviewWidths(width: number): number[] {
  if (width >= 100) {
    const name = Math.min(28, Math.floor(width * 0.25));
    return [name, 18, 12, 6, 15];
  }
  if (width >= 71) return [18, 15, 10, 6, 15];
  return [14, Math.min(15, width - 46), 8, 6, 14];
}
function healthMarker(row: LimitsAccountRow): string {
  if (row.error || row.status === "error") return row.snapshot ? "old " : "! ";
  if (row.status === "loading") return "↻ ";
  if (row.status === "queued") return "… ";
  if (row.snapshot?.usageError || row.snapshot?.creditsError || hasPartialBalance(row)) return "~ ";
  if (!row.snapshot) return "? ";
  return "";
}
function compactMoney(value: number | undefined, width: number): string {
  if (value === undefined) return "?";
  const exact = money(value);
  if (exact.length <= width) return exact;
  const scaled = `~${new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 }).format(value)}`;
  return scaled.length <= width ? scaled : `~${value.toExponential(0).replace("+", "")}`;
}
/** Ordered presentation cells: name, quota/balance, quota renewal, count, credit expiry. */
export function overviewCells(
  row: LimitsAccountRow,
  selected: boolean,
  theme: Theme,
  activeProvider: string | undefined,
  now: number,
  balanceWidth: number,
): string[] {
  const window = bottleneck(row);
  const dollars = row.snapshot?.money;
  const facts = bankedResetFacts(row, now);
  const health = healthMarker(row);
  const marker = `${selected ? "▸" : " "} ${row.account.provider === activeProvider ? "●" : "○"} `;
  const name =
    theme.fg(selected ? "accent" : "text", marker) +
    theme.fg(row.status === "loading" || row.status === "queued" ? "accent" : "warning", health) +
    theme.fg(
      selected ? "accent" : "text",
      selected ? theme.bold(row.account.label) : row.account.label,
    );
  const tokenWidth = Math.floor((balanceWidth - 3) / 2);
  const quota = dollars
    ? `K${dollars.keyLimit === null ? "∞" : compactMoney(dollars.keyRemaining, tokenWidth)} W${dollars.walletUnavailable ? "?" : compactMoney(dollars.walletRemaining, tokenWidth)}`
    : window?.remainingPercent === undefined
      ? "— quota unknown"
      : `${percent(theme, window.remainingPercent)} ${window.label}`;
  // A balance is not a quota window; an unknown bottleneck date cannot borrow another date.
  const reset = dollars ? NaN : Date.parse(window?.resetAt ?? "");
  const renewal = dollars
    ? "—"
    : Number.isFinite(reset)
      ? reset > now
        ? duration(reset - now)
        : "past ↻"
      : "unknown";
  return [
    name,
    quota,
    theme.fg("dim", renewal),
    theme.fg("dim", facts ? `↺${facts.count ?? "?"}` : "—"),
    theme.fg(facts?.tone ?? "dim", facts ? expiryText(facts, now) : "—"),
  ];
}
function narrowOverview(
  rows: LimitsAccountRow[],
  selected: LimitsAccountRow | undefined,
  theme: Theme,
  width: number,
  height: number,
  activeProvider: string | undefined,
  now: number,
): string[] {
  const row = selected && rows.includes(selected) ? selected : rows[0];
  const cells = row
    ? overviewCells(row, true, theme, activeProvider, now, Math.max(15, width - 9))
    : [];
  const result = !row
    ? ["No matches. / changes search."]
    : height < 7
      ? ["Widen to 64 cols for all", "five Overview fields."]
      : [
          theme.fg("muted", "Narrow: selected only · ↑↓"),
          cells[0],
          `Left     ${cells[1]}`,
          `Renews   ${cells[2]}`,
          `Banked   ${cells[3]}`,
          `Expires  ${cells[4]}`,
        ];
  while (result.length < height - 1) result.push("");
  result.push(
    theme.fg(
      "dim",
      row
        ? `${rows.indexOf(row) + 1} of ${rows.length} · widen for table`
        : "No matching subscriptions",
    ),
  );
  return result.slice(0, height).map((line) => fit(line, width));
}

/** One subscription per row: the default overview must not bury accounts behind cards. */
export function renderOverview(
  rows: LimitsAccountRow[],
  selected: LimitsAccountRow | undefined,
  theme: Theme,
  width: number,
  height: number,
  activeProvider: string | undefined,
  sort: string,
  attention: boolean,
  now: number,
): string[] {
  // Below 60 inner columns use a labelled selected-row panel, never hide one of the dates.
  if (width < 60) return narrowOverview(rows, selected, theme, width, height, activeProvider, now);
  const widths = overviewWidths(width);
  const columns = (cells: string[]) => cells.map((cell, i) => fit(cell, widths[i])).join(" ");
  const result = [
    theme.fg(
      "muted",
      columns([
        "SUBSCRIPTION",
        "LEFT",
        width >= 100 ? "QUOTA RENEWS" : "RENEWS",
        "BANKED",
        "EXPIRES",
      ]),
    ),
  ];
  const count = Math.max(1, height - 2);
  const index = Math.max(0, rows.indexOf(selected as LimitsAccountRow));
  const start = Math.max(0, Math.min(index - Math.floor(count / 2), rows.length - count));
  for (const row of rows.slice(start, start + count)) {
    const line = columns(
      overviewCells(row, row === selected, theme, activeProvider, now, widths[1]),
    );
    result.push(row === selected ? theme.bg("selectedBg", line) : line);
  }
  if (!rows.length) result.push(theme.fg("muted", "No matches. / changes search."));
  while (result.length < height - 1) result.push("");
  result.push(
    theme.fg(
      "dim",
      rows.length
        ? `${start + 1}–${Math.min(rows.length, start + count)} of ${rows.length} · ${selected?.account.provider ?? ""} · ${isCodexProvider(selected?.account.provider ?? "") ? "expiry ! ≤3d · !! ≤1d" : selected?.snapshot?.money ? "K key · W wallet USD · ∞ uncapped key" : `${attention ? "attention" : sort} · ● active`}`
        : "No matching subscriptions",
    ),
  );
  return result.slice(0, height).map((line) => fit(line, width));
}

export function renderRunwayCard(
  row: LimitsAccountRow,
  theme: Theme,
  width: number,
  active: boolean,
  selected: boolean,
  now: number,
): string[] {
  const window = bottleneck(row);
  const dollars = row.snapshot?.money;
  const codex = isCodexProvider(row.account.provider);
  const quota = dollars
    ? `${money(dollars.keyRemaining)} key left · ${dollars.walletUnavailable ? "unavailable" : money(dollars.walletRemaining)} wallet`
    : `${percent(theme, baseHeadroom(row))} ${window?.label ?? "quota"} left${codex ? ` · ↺ ${row.snapshot?.credits?.availableCount ?? "—"}` : ""}`;
  const reset = window ? Date.parse(window.resetAt ?? "") : undefined;
  const freshness =
    row.status === "loading"
      ? "↻ checking"
      : row.status === "queued"
        ? "queued"
        : row.error || row.status === "error"
          ? "! check unavailable"
          : needsAttention(row)
            ? "! needs attention"
            : snapshotAge(row, now);
  const name = `${selected ? "▸" : " "} ${active ? "●" : "○"} ${row.account.label}${active ? "  ACTIVE" : ""}`;
  return [
    selected ? theme.fg("accent", theme.bold(name)) : theme.fg("text", name),
    `    ${quota}`,
    theme.fg(
      needsAttention(row) ? "warning" : "dim",
      `    ${freshness}${reset && reset > now ? ` · resets ${duration(reset - now)}` : ""}`,
    ),
  ].map((line) => (selected ? theme.bg("selectedBg", fit(line, width)) : fit(line, width)));
}
export function providerDetailLines(snapshot: LimitsSnapshot, theme: Theme, now: number): string[] {
  const lines: string[] = [];
  if (snapshot.usageError)
    lines.push(theme.fg("warning", `Usage unavailable · ${snapshot.usageError}`), "");
  if (snapshot.money) {
    const m = snapshot.money;
    lines.push(
      theme.fg("text", theme.bold("KEY ALLOWANCE · USD")),
      "",
      `  ${theme.fg("accent", theme.bold(money(m.keyRemaining)))} remaining`,
      `  Cap ${m.keyLimit === null ? "uncapped" : money(m.keyLimit)}  ·  spent ${money(m.keyUsage)}`,
      "",
      theme.fg("text", theme.bold("ACCOUNT WALLET · USD")),
      "",
      `  ${m.walletUnavailable ? theme.fg("warning", "Unavailable") : theme.fg("accent", theme.bold(money(m.walletRemaining)))}${m.walletUnavailable ? "" : " balance"}`,
      m.walletUnavailable
        ? "  No fresh wallet balance reported."
        : `  Total ${money(m.walletTotal)}  ·  used ${money(m.walletUsage)}`,
      "",
    );
  } else if (snapshot.usage) {
    lines.push(theme.fg("text", theme.bold("QUOTA WINDOWS")));
    if (!snapshot.usage.windows.length) lines.push("No usage windows reported.");
    for (const window of snapshot.usage.windows) {
      lines.push(
        "",
        theme.fg("text", window.label),
        `  ${meter(theme, window.remainingPercent)}  ${percent(theme, window.remainingPercent)} ${window.remainingPercent === undefined ? "unknown" : "left"}`,
      );
      const reset = Date.parse(window.resetAt ?? "");
      lines.push(
        theme.fg(
          "dim",
          `  ${Number.isFinite(reset) ? (reset > now ? `Resets in ${duration(reset - now)}` : "Reset time passed · refresh to update") : "Reset time unknown"}`,
        ),
      );
      if (window.resetAt) lines.push(theme.fg("dim", `  ${limitsDate(window.resetAt)}`));
    }
    lines.push("");
  }
  if (snapshot.facts?.length) lines.push(...snapshot.facts, "");
  lines.push(...(snapshot.notes ?? []).map((note) => theme.fg("dim", note)));
  lines.push(
    "",
    theme.fg("dim", "Provider-level snapshot · base identity only."),
    theme.fg(
      "dim",
      "Uses provider-native subscription credentials; model-specific overrides may refer to a different account.",
    ),
    theme.fg("dim", "Browsing never changes the active model or spends credit."),
  );
  return lines;
}
export function formatLimitsSnapshot(snapshot: LimitsSnapshot, current = false): string {
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as Theme;
  return [
    `Limits — ${snapshot.provider}${current ? " (current subscription)" : ""}`,
    ...providerDetailLines(snapshot, theme, Date.now()),
  ].join("\n");
}
export function renderTimeline(rows: LimitsAccountRow[], theme: Theme, now: number): string[] {
  const events = rows
    .flatMap((row) => {
      if (row.error || row.status === "error") return [];
      const windows = (row.snapshot?.usage?.windows ?? []).map((window) => ({
        at: Date.parse(window.resetAt ?? ""),
        label: `${row.account.label} · ${window.label}`,
        kind: "quota resets",
      }));
      const credits = (row.snapshot?.credits?.credits ?? [])
        .filter((credit) => !credit.status || credit.status === "available")
        .map((credit) => ({
          at: Date.parse(credit.expiresAt ?? ""),
          label: row.account.label,
          kind: "credit expires",
        }));
      return [...windows, ...credits].filter((event) => Number.isFinite(event.at));
    })
    .sort((a, b) => a.at - b.at);
  return [
    theme.fg("accent", theme.bold("ON THE HORIZON")),
    theme.fg("muted", "Quota renewals and banked-credit expiries · reported timestamps"),
    "",
    ...(events.length
      ? events.flatMap((event) => [
          theme.fg(
            event.kind === "credit expires" ? creditExpiryTone(event.at, now) : "text",
            `${event.at > now ? `in ${duration(event.at - now)}` : "time passed"}  ·  ${event.kind}`,
          ),
          `  ${event.label}`,
          theme.fg("dim", `  ${limitsDate(new Date(event.at).toISOString())}`),
          "",
        ])
      : ["No reset or expiry dates reported."]),
    theme.fg(
      "dim",
      "Past timestamps need refresh; no renewal is inferred. Unknown dates are omitted.",
    ),
  ];
}
