// summary: dashboard queue, cancellation, keyboard navigation, responsive rendering and partial-data semantics.
// read_when: changing all-account limits dashboard state or interaction.
import assert from "node:assert/strict";
import test from "node:test";
import {
  KeybindingsManager,
  stripTerminalSequences,
  TUI_KEYBINDINGS,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { LimitsDashboard } from "../lib/limits-dashboard.ts";
import { renderAccountDetails } from "../lib/limits-dashboard-render.ts";
import { baseHeadroom, LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";

const account = (index) => ({
  provider: `openai-codex-${index}`,
  label: `Account ${index} 🦉 日本語`,
  authenticated: true,
  models: [{ provider: `openai-codex-${index}`, id: "gpt-test" }],
});
const snapshot = (provider, remaining = 75) => ({
  provider,
  fetchedAt: Date.now(),
  usage: {
    plan: "pro",
    windows: [
      {
        label: "7d",
        primary: true,
        remainingPercent: remaining,
        resetAt: "2026-12-01T12:00:00.000Z",
      },
      { label: "Spark 5h", primary: false, remainingPercent: 0 },
    ],
  },
  credits: {
    availableCount: 2,
    credits: [{ status: "available", expiresAt: "2026-12-10T12:00:00Z" }, { status: "available" }],
  },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const theme = {
  fg: (_color, text) => `\u001b[32m${text}\u001b[39m`,
  bg: (_color, text) => `\u001b[44m${text}\u001b[49m`,
  bold: (text) => `\u001b[1m${text}\u001b[22m`,
};

function dashboard(count = 4) {
  let renders = 0,
    closes = 0;
  const switches = [];
  const store = new LimitsDashboardStore(
    Array.from({ length: count }, (_, i) => account(i + 2)),
    async (a) => snapshot(a.provider),
    () => {
      renders++;
    },
  );
  store.activeProvider = "openai-codex-3";
  const view = new LimitsDashboard(store, theme, new KeybindingsManager(TUI_KEYBINDINGS), {
    close: () => {
      closes++;
      store.dispose();
    },
    render: () => {
      renders++;
    },
    rows: () => 48,
    switchAccount: async (provider) => {
      switches.push(provider);
      return "Switched";
    },
  });
  return {
    store,
    view,
    switches,
    get renders() {
      return renders;
    },
    get closes() {
      return closes;
    },
  };
}

test("refresh queue bounds concurrency, coalesces repeated requests, and binds returned identity", async () => {
  let active = 0,
    maximum = 0,
    calls = 0;
  const pending = [];
  const store = new LimitsDashboardStore(
    [account(2), account(3), account(4)],
    async (a) => {
      active++;
      maximum = Math.max(maximum, active);
      calls++;
      await new Promise((resolve) => pending.push(resolve));
      active--;
      return snapshot(a.provider);
    },
    () => {},
  );
  store.refresh();
  store.refresh();
  store.refresh("openai-codex-2");
  await tick();
  assert.equal(calls, 2);
  assert.equal(maximum, 2);
  pending.shift()();
  await tick();
  assert.equal(calls, 3);
  for (const resolve of pending.splice(0)) resolve();
  await store.waitForIdle();
  assert.ok(store.rows.every((row) => row.status === "ready"));
  assert.equal(baseHeadroom(store.rows[0]), 75, "Spark zero must not masquerade as base quota");
  store.dispose();
  const wrong = new LimitsDashboardStore(
    [account(2)],
    async () => snapshot("openai-codex"),
    () => {},
  );
  wrong.refresh();
  await wrong.waitForIdle();
  assert.equal(wrong.rows[0].status, "error");
  assert.equal(wrong.rows[0].snapshot, undefined);
});

test("closing aborts active checks, skips queued accounts and ignores late completions", async () => {
  let calls = 0,
    changes = 0;
  const signals = [],
    pending = [];
  const store = new LimitsDashboardStore(
    [account(2), account(3), account(4)],
    (a, signal) => {
      calls++;
      signals.push(signal);
      return new Promise((resolve) => pending.push(() => resolve(snapshot(a.provider))));
    },
    () => {
      changes++;
    },
  );
  store.refresh();
  await tick();
  const idle = store.waitForIdle();
  store.dispose();
  await idle;
  const before = changes;
  for (const resolve of pending) resolve();
  await tick();
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(calls, 2);
  assert.equal(changes, before);
  assert.ok(store.rows.every((row) => !row.snapshot));
});

test("signed-out and unavailable accounts remain visible without network requests", async () => {
  const store = new LimitsDashboardStore(
    [
      { ...account(2), authenticated: false },
      { ...account(3), models: [] },
    ],
    () => assert.fail("must not fetch"),
    () => {},
  );
  store.refresh();
  await store.waitForIdle();
  assert.match(store.rows[0].error, /Not signed in/);
  assert.match(store.rows[1].error, /not loaded/);
});

test("fuzzy search and inspection never switch accounts; only the explicit switch hotkey does", async () => {
  const h = dashboard();
  assert.equal(h.view.selected().account.provider, "openai-codex-3");
  h.view.handleInput("/");
  h.view.handleInput("Account 4");
  assert.deepEqual(
    h.view.filteredRows().map((row) => row.account.provider),
    ["openai-codex-4"],
  );
  h.view.handleInput("\r"); // inspect
  assert.equal(h.switches.length, 0);
  h.view.handleInput("s");
  await tick();
  assert.deepEqual(h.switches, ["openai-codex-4"]);
  h.view.handleInput("a");
  assert.equal(h.view.selected().account.provider, "openai-codex-3");
  h.view.handleInput("\u001b");
  assert.equal(h.closes, 1);
});

test("empty-result refresh is a no-op, while explicit refresh-all remains available", () => {
  const h = dashboard();
  const refreshes = [];
  h.store.refresh = (provider) => refreshes.push(provider);
  h.view.handleInput("/");
  h.view.handleInput("no-such-account");
  h.view.handleInput("\r");
  h.view.handleInput("r");
  assert.deepEqual(refreshes, []);
  h.view.handleInput("R");
  assert.deepEqual(refreshes, [undefined]);
});

test("Kitty printable hotkeys work, but never fire while typing into search", async () => {
  const h = dashboard();
  h.view.handleInput("/");
  h.view.handleInput("\u001b[115u");
  assert.equal(h.switches.length, 0);
  h.view.handleInput("\u001b");
  h.view.handleInput("\u001b[115u");
  await tick();
  // Empty search falls back to the first stable row, not an active-first sort.
  assert.deepEqual(h.switches, ["openai-codex-2"]);
});

test("rendering stays inside every viewport with ANSI, Unicode, long labels, empty search and scrolling", async () => {
  const h = dashboard(30);
  h.store.rows[0].account.label = "Long 🦉 account 日本語 ".repeat(12);
  h.store.refresh();
  await h.store.waitForIdle();
  for (const width of [18, 31, 32, 50, 87, 88, 100, 160]) {
    for (const key of ["", "\t", "\u001b[6~", "G", "?", "?"]) {
      if (key) h.view.handleInput(key);
      const lines = h.view.render(width);
      assert.ok(lines.length <= 40, `height at width ${width}`);
      assert.ok(
        lines.every((line) => visibleWidth(line) <= width),
        `width ${width}`,
      );
    }
  }
  h.view.handleInput("/");
  h.view.handleInput("no-such-account");
  assert.match(stripTerminalSequences(h.view.render(100).join("\n")), /No match/);
  h.store.dispose();
});

test("details distinguish zero, unknown, partial errors and credit expiry from quota resets", () => {
  const row = { account: account(2), status: "ready", snapshot: snapshot("openai-codex-2", 0) };
  let text = stripTerminalSequences(renderAccountDetails(row, theme, true, 0).join("\n"));
  assert.match(text, /0% left/);
  assert.match(text, /BANKED RESETS {2}2/);
  assert.match(text, /Expiry unknown/);
  row.snapshot.usage = undefined;
  row.snapshot.usageError = "HTTP 403";
  text = stripTerminalSequences(renderAccountDetails(row, theme, false, 0).join("\n"));
  assert.match(text, /Usage unavailable · HTTP 403/);
  assert.match(text, /BANKED RESETS {2}2/);
  assert.doesNotMatch(text, /100%/);
});
