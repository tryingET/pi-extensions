// summary: Overview orders the visible renewal then remaining quota, independently of expiry.
// read_when: changing default limits ordering, search, or displayed quota selection.
import assert from "node:assert/strict";
import test from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { LimitsDashboard } from "../lib/limits-dashboard.ts";
import { LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";
import { compareOverviewRows, overviewCells } from "../lib/limits-runway.ts";

const theme = { fg: (_c, text) => text, bg: (_c, text) => text, bold: (text) => text };
const at = (hour) => `2099-01-01T${String(hour).padStart(2, "0")}:00:00Z`;
function row(provider, remainingPercent, resetAt) {
  return {
    account: { provider, label: provider, authenticated: true, models: [] },
    status: "ready",
    snapshot: {
      provider,
      fetchedAt: 0,
      usage: { windows: [{ label: "Week", primary: true, remainingPercent, resetAt }] },
    },
  };
}
const ids = (rows) => rows.map((r) => r.account.provider);
function harness(rows) {
  const store = new LimitsDashboardStore(
    [],
    () => assert.fail("no fetch"),
    () => {},
  );
  store.rows.push(...rows);
  store.activeProvider = rows[0].account.provider;
  const view = new LimitsDashboard(store, theme, new KeybindingsManager(TUI_KEYBINDINGS), {
    rows: () => 24,
    render: () => {},
    close: () => store.dispose(),
    switchAccount: () => assert.fail("sorting must not switch"),
  });
  return { store, view };
}

test("default Overview sorts renewal ascending, then left ascending, without pinning active", () => {
  const rows = [
    row("later", 0, at(3)),
    row("higher", 80, at(1)),
    row("zero", 0, at(1)),
    row("low", 5, at(1)),
  ];
  const { store, view } = harness(rows);
  assert.deepEqual(ids(view.filteredRows()), ["zero", "low", "higher", "later"]);
  assert.equal(view.selected().account.provider, "later");
  assert.deepEqual(ids(store.rows), ids(rows));
  const text = view.render(100).join("\n");
  const lines = text.split("\n").filter((line) => /[○●]/.test(line) && line.includes("Week"));
  assert.deepEqual(
    lines.map((line) => rows.find((r) => line.includes(` ${r.account.label} `)).account.provider),
    ["zero", "low", "higher", "later"],
  );
  // Cycling the existing controls still returns to the new default ordering.
  for (let i = 0; i < 4; i++) view.handleInput("o");
  assert.deepEqual(ids(view.filteredRows()), ["zero", "low", "higher", "later"]);
  store.dispose();
});

test("sort uses exactly the displayed primary bottleneck, never another reset or credit expiry", () => {
  const other = row("openai-codex", 5, at(8));
  other.snapshot.usage.windows.push(
    { label: "5h", primary: true, remainingPercent: 90, resetAt: at(1) },
    { label: "Model", primary: false, remainingPercent: 0, resetAt: at(0) },
  );
  other.snapshot.credits = {
    availableCount: 1,
    credits: [{ status: "available", expiresAt: at(0) }],
  };
  const first = row("first", 10, at(4));
  assert.deepEqual(ids([other, first].sort(compareOverviewRows)), ["first", "openai-codex"]);
  assert.match(overviewCells(other, false, theme, undefined, Date.parse(at(0)), 15)[2], /8h/);
  other.snapshot.usage.windows[0].resetAt = undefined;
  assert.deepEqual(ids([other, first].sort(compareOverviewRows)), ["first", "openai-codex"]);
  assert.equal(overviewCells(other, false, theme, undefined, 0, 15)[2], "unknown");
});

test("unknowns last, zero is known, past dates stay chronological, money is not percentage quota", () => {
  const wallet = row("wallet", 0, at(0));
  wallet.snapshot.money = { currency: "USD", keyRemaining: 0, walletRemaining: 0 };
  const empty = { account: { provider: "empty", label: "empty", models: [] }, status: "error" };
  const rows = [
    wallet,
    empty,
    row("missing-left", undefined, at(0)),
    row("invalid-date", 50, "bad"),
    row("missing-date-zero", 0, undefined),
    row("future", 100, at(2)),
    row("past", 80, "2000-01-01T00:00:00Z"),
  ];
  assert.deepEqual(ids(rows.sort(compareOverviewRows)), [
    "past",
    "future",
    "missing-date-zero",
    "invalid-date",
    "wallet",
    "empty",
    "missing-left",
  ]);
  assert.equal(compareOverviewRows(empty, empty), 0);
  assert.equal(compareOverviewRows(wallet, empty), 0);
  assert.equal(compareOverviewRows(row("tie-a", 5, at(1)), row("tie-b", 5, at(1))), 0);
});

test("search and attention keep renewal ordering; refreshed values reorder without changing selection", () => {
  const rows = [row("match", 20, at(3)), row("matching", 10, at(2)), row("matcher", 15, at(1))];
  const { store, view } = harness(rows);
  view.handleInput("/");
  for (const key of "match") view.handleInput(key);
  assert.deepEqual(ids(view.filteredRows()), ["matcher", "matching", "match"]);
  view.handleInput("\u001b");
  view.handleInput("!");
  assert.deepEqual(ids(view.filteredRows()), ["matcher", "matching", "match"]);
  const selected = view.selected().account.provider;
  rows[0].snapshot.usage.windows[0].resetAt = at(0);
  assert.deepEqual(ids(view.filteredRows()), ["match", "matcher", "matching"]);
  assert.equal(view.selected().account.provider, selected);
  store.dispose();
});
