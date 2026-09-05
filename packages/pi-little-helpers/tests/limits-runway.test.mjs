// summary: provider-general command safety and Runway viewport, attention, and horizon interactions.
// read_when: changing /limits all/current dispatch, generic refresh lifecycle or new cockpit views.
import assert from "node:assert/strict";
import test from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import { createLimitsExtension } from "../extensions/limits.ts";
import { LimitsDashboard } from "../lib/limits-dashboard.ts";
import { renderAccountDetails } from "../lib/limits-dashboard-render.ts";
import { LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";
import { LIMITS_PROVIDERS } from "../lib/limits-providers.ts";
import { nextReset, renderTimeline } from "../lib/limits-runway.ts";
import { normalizeProviderUsage } from "../lib/limits-sub-core.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const model = (provider) => ({ provider, id: "model" });
const account = (provider) => ({
  provider,
  label: provider,
  authenticated: true,
  models: [model(provider)],
});
const snapshot = (provider) =>
  normalizeProviderUsage(provider, {
    provider: LIMITS_PROVIDERS[provider].core,
    windows: [{ label: "Week", usedPercent: 80, resetAt: "2026-10-01T00:00:00Z" }],
    ...(provider === "openrouter" ? { keyLimit: null, creditRemaining: 25 } : {}),
  });
const theme = { fg: (_c, t) => t, bg: (_c, t) => t, bold: (t) => t };
function harness(options) {
  let command;
  const handlers = new Map(),
    switches = [];
  const pi = {
    events: { emit: () => assert.fail("injected provider fetch should own bus") },
    registerCommand: (_name, spec) => {
      command = spec;
    },
    on: (event, fn) => handlers.set(event, fn),
    setModel: async (m) => {
      switches.push(m);
      return true;
    },
  };
  createLimitsExtension(options)(pi);
  return { command, handlers, switches };
}
async function output(run) {
  const lines = [];
  const original = console.log;
  try {
    console.log = (text) => lines.push(text);
    await run();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

test("headless all uses exactly selected provider identities and keeps Codex on dedicated fetch lane", async () => {
  const calls = [];
  const accounts = [account("openai-codex-2"), ...Object.keys(LIMITS_PROVIDERS).map(account)];
  const h = harness({
    accounts: () => accounts,
    fetchProvider: async (_events, provider) => {
      calls.push(provider);
      return snapshot(provider);
    },
    fetchSnapshot: async (ctx) => {
      calls.push(ctx.model.provider);
      return { provider: ctx.model.provider, fetchedAt: 0, usage: { windows: [] } };
    },
  });
  const current = model("xai");
  const text = await output(() =>
    h.command.handler("all", { model: current, modelRegistry: {}, mode: "print", hasUI: false }),
  );
  assert.deepEqual(calls.sort(), accounts.map((a) => a.provider).sort());
  assert.equal(h.switches.length, 0);
  assert.equal(current.provider, "xai");
  assert.match(text, /Limits — xai \(current subscription\)/);
  assert.match(text, /ACCOUNT WALLET · USD/);
  const router = text.slice(text.indexOf("Limits — openrouter"));
  assert.doesNotMatch(router.split("────────────────────")[0], /BANKED RESETS/);
});
test("current supports every configured base provider, but excluded, signed-out and alias current are never fetched", async () => {
  for (const provider of Object.keys(LIMITS_PROVIDERS)) {
    const calls = [];
    const h = harness({
      accounts: () => [account(provider)],
      fetchProvider: async (_events, id) => {
        calls.push(id);
        return snapshot(id);
      },
    });
    const text = await output(() =>
      h.command.handler("current", {
        model: model(provider),
        modelRegistry: {},
        mode: "print",
        hasUI: false,
      }),
    );
    assert.deepEqual(calls, [provider]);
    assert.match(text, new RegExp(`Limits — ${provider}`));
  }
  for (const accounts of [
    [],
    [{ ...account("xai"), authenticated: false }],
    [{ ...account("xai"), unsupportedReason: "unsupported alias" }],
  ]) {
    const h = harness({
      accounts: () => accounts,
      fetchProvider: () => assert.fail("must not query"),
    });
    await output(() =>
      h.command.handler("current", {
        model: model("xai"),
        modelRegistry: {},
        mode: "print",
        hasUI: false,
      }),
    );
  }
});
test("queued provider gets project restrictions rechecked immediately before dispatch", async () => {
  let allowed = [account("xai"), account("zai"), account("openrouter")];
  const calls = [],
    release = [];
  const h = harness({
    accounts: () => allowed,
    fetchProvider: async (_events, id) => {
      calls.push(id);
      await new Promise((resolve) => release.push(resolve));
      return snapshot(id);
    },
  });
  const running = output(() =>
    h.command.handler("all", {
      model: model("xai"),
      modelRegistry: {},
      mode: "print",
      hasUI: false,
    }),
  );
  await tick();
  assert.equal(calls.length, 2);
  allowed = allowed.filter((a) => a.provider !== "openrouter");
  for (const resolve of release) resolve();
  const text = await running;
  assert.deepEqual(calls.sort(), ["xai", "zai"]);
  assert.match(text, /Account check failed/);
});
test("session shutdown aborts current non-Codex bridge and prevents stale context presentation", async () => {
  let requestSignal;
  const h = harness({
    accounts: () => [account("xai")],
    fetchProvider: (_events, _id, signal) => {
      requestSignal = signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  });
  const ctx = { model: model("xai"), modelRegistry: {}, mode: "print", hasUI: false };
  const running = output(() => h.command.handler("current", ctx));
  await tick();
  h.handlers.get("session_shutdown")();
  Object.defineProperty(ctx, "hasUI", { get: () => assert.fail("must not read stale context") });
  assert.equal(await running, "");
  assert.equal(requestSignal.aborted, true);
});

test("runway separates provider details, attention filters and horizon without model changes", async () => {
  const store = new LimitsDashboardStore(
    [account("xai"), account("openrouter"), account("opencode-go")],
    async (a) => snapshot(a.provider),
    () => {},
  );
  store.activeProvider = "xai";
  const switches = [];
  const view = new LimitsDashboard(store, theme, new KeybindingsManager(TUI_KEYBINDINGS), {
    rows: () => 48,
    render: () => {},
    close: () => store.dispose(),
    switchAccount: async (p) => {
      switches.push(p);
      return "switched";
    },
  });
  store.refresh();
  await store.waitForIdle();
  assert.match(view.render(120).join("\n"), /LIMITS \/ RUNWAY/);
  assert.doesNotMatch(
    renderAccountDetails(store.rows[0], theme, true, 0).join("\n"),
    /BANKED RESETS/,
  );
  view.handleInput("!");
  assert.deepEqual(
    view.filteredRows().map((r) => r.account.provider),
    ["xai", "opencode-go"],
  );
  view.handleInput("t");
  assert.match(view.render(120).join("\n"), /ON THE HORIZON/);
  assert.equal(switches.length, 0);
  view.handleInput("a");
  assert.equal(view.filteredRows().length, 3);
  assert.equal(view.selected().account.provider, "xai");
});
test("new horizon and attention views respect tiny, narrow, wide and short viewports", async () => {
  for (const terminalRows of [8, 15, 24, 48, 120]) {
    const store = new LimitsDashboardStore(
      Object.keys(LIMITS_PROVIDERS).map(account),
      async (a) => snapshot(a.provider),
      () => {},
    );
    const view = new LimitsDashboard(store, theme, new KeybindingsManager(TUI_KEYBINDINGS), {
      rows: () => terminalRows,
      render: () => {},
      close: () => store.dispose(),
      switchAccount: async () => assert.fail("no switch"),
    });
    store.refresh();
    await store.waitForIdle();
    for (const width of [1, 18, 31, 32, 50, 87, 88, 120, 200]) {
      for (const key of ["t", "\u001b[6~", "!", "?", "?", "a"]) {
        view.handleInput(key);
        const lines = view.render(width);
        assert.ok(
          lines.every((line) => visibleWidth(line) <= width),
          `width ${width}`,
        );
        assert.ok(lines.length <= Math.max(5, Math.min(42, Math.floor(terminalRows * 0.85))));
      }
    }
    store.dispose();
  }
});
test("timeline keeps quota resets and credit expiry distinct and never implies past renewal", () => {
  const rows = [
    {
      account: account("xai"),
      status: "ready",
      snapshot: {
        provider: "xai",
        fetchedAt: 0,
        usage: {
          windows: [
            { label: "Week", primary: true, remainingPercent: 10, resetAt: "2026-09-01T00:00:00Z" },
          ],
        },
      },
    },
    {
      account: account("openai-codex"),
      status: "ready",
      snapshot: {
        provider: "openai-codex",
        fetchedAt: 0,
        credits: {
          availableCount: 2,
          credits: [
            { status: "available", expiresAt: "2026-10-01T00:00:00Z" },
            { status: "available" },
          ],
        },
      },
    },
  ];
  const text = renderTimeline(rows, theme, Date.parse("2026-09-05T00:00:00Z")).join("\n");
  assert.match(text, /time passed {2}· {2}quota resets/);
  assert.match(text, /credit expires/);
  assert.doesNotMatch(text, /renewed/);
  assert.match(text, /Unknown dates are omitted/);
  assert.equal(nextReset(rows[0], Date.parse("2026-09-05T00:00:00Z")), undefined);
  rows[0].error = "failed";
  assert.doesNotMatch(renderTimeline(rows, theme, 0).join("\n"), /xai/);
});

async function overviewHarness(count = 8) {
  const providers = [
    "anthropic",
    "github-copilot",
    "zai",
    "xai",
    "opencode-go",
    "openrouter",
    "openai-codex",
    "openai-codex-2",
  ];
  let terminalRows = 24,
    closes = 0;
  const switches = [];
  const store = new LimitsDashboardStore(
    Array.from({ length: count }, (_, i) => account(providers[i] ?? `openai-codex-${i}`)),
    async (a) => ({
      provider: a.provider,
      fetchedAt: Date.now(),
      usage: {
        windows: Array.from({ length: 12 }, (_, i) => ({
          label: `Window ${i}`,
          primary: true,
          remainingPercent: 80,
          resetAt: `2026-12-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        })),
      },
      ...(a.provider === "openrouter"
        ? { money: { currency: "USD", keyLimit: null, walletRemaining: 12 } }
        : {}),
    }),
    () => {},
  );
  store.activeProvider = "openai-codex-2";
  const view = new LimitsDashboard(store, theme, new KeybindingsManager(TUI_KEYBINDINGS), {
    rows: () => terminalRows,
    render: () => {},
    close: () => {
      closes++;
      store.dispose();
    },
    switchAccount: async (provider) => {
      switches.push(provider);
      return "switched";
    },
  });
  store.refresh();
  await store.waitForIdle();
  return {
    store,
    view,
    switches,
    setRows: (rows) => {
      terminalRows = rows;
    },
    get closes() {
      return closes;
    },
  };
}

test("Overview is the landing tab and all eight subscriptions fit at 75 columns by 24 terminal rows", async () => {
  const h = await overviewHarness();
  const lines = h.view.render(75),
    text = lines.join("\n");
  assert.match(text, /\[Overview\]/);
  assert.match(text, /SUBSCRIPTION.*LEFT.*RENEWS.*BANKED.*EXPIRES/);
  assert.doesNotMatch(text, /RESET \/ EXPIRY/);
  for (const row of h.store.rows)
    assert.ok(
      lines.some((line) => line.includes(` ${row.account.label} `)),
      row.account.provider,
    );
  assert.match(text, /1–8 of 8/);
  assert.match(text, /● openai-codex-2/);
  assert.equal(lines.length, 20);
  assert.ok(lines.every((line) => visibleWidth(line) <= 75));
  assert.doesNotMatch(text, /QUOTA WINDOWS|BANKED RESETS|ON THE HORIZON/);
  assert.equal(h.view.selected().account.provider, "openai-codex-2");
  assert.equal(h.switches.length, 0);
  h.store.dispose();
});

test("tabs, Enter, left and back preserve selection and never switch subscriptions", async () => {
  const h = await overviewHarness();
  h.view.handleInput("\u001b[B");
  const selected = h.view.selected().account.provider;
  h.view.handleInput("\r");
  assert.match(h.view.render(75).join("\n"), /\[Subscription\]/);
  h.view.handleInput("\t");
  assert.match(h.view.render(75).join("\n"), /\[Horizon\]/);
  h.view.handleInput("\t");
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  h.view.handleInput("\u001b[Z");
  assert.match(h.view.render(75).join("\n"), /\[Horizon\]/);
  h.view.handleInput("\u001b[D");
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  h.view.handleInput("\u001b[C");
  assert.match(h.view.render(75).join("\n"), /\[Subscription\]/);
  h.view.handleInput("\u001b");
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  assert.equal(h.closes, 0);
  assert.equal(h.view.selected().account.provider, selected);
  assert.deepEqual(h.switches, []);
  h.view.handleInput("\u001b");
  assert.equal(h.closes, 1);
});

test("search returns to compact Overview, inspects a result and preserves it on back and clear", async () => {
  const h = await overviewHarness();
  h.view.handleInput("\r");
  h.view.handleInput("/");
  h.view.handleInput("openrouter");
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  assert.equal(h.view.filteredRows().length, 1);
  h.view.handleInput("\r");
  assert.match(h.view.render(75).join("\n"), /\[Subscription\]/);
  h.view.handleInput("\u001b");
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  assert.equal(h.view.filteredRows().length, 1);
  h.view.handleInput("\u001b");
  assert.equal(h.view.filteredRows().length, 8);
  assert.equal(h.view.selected().account.provider, "openrouter");
  assert.equal(h.closes, 0);
  assert.deepEqual(h.switches, []);
  h.store.dispose();
});

test("Subscription and Horizon preserve independent scroll positions across tab changes", async () => {
  const h = await overviewHarness();
  const footer = () =>
    h.view
      .render(75)
      .join("\n")
      .match(/\d+–\d+ \/ \d+ lines/)?.[0];
  h.view.handleInput("\r");
  h.view.render(75);
  h.view.handleInput("\u001b[6~");
  const subscription = footer();
  assert.ok(subscription && !subscription.startsWith("1–"));
  h.view.handleInput("\t");
  h.view.render(75);
  h.view.handleInput("\u001b[6~");
  h.view.handleInput("\u001b[6~");
  const horizon = footer();
  assert.ok(horizon && !horizon.startsWith("1–"));
  h.view.handleInput("\u001b[Z");
  assert.equal(footer(), subscription);
  h.view.handleInput("\t");
  assert.equal(footer(), horizon);
  assert.deepEqual(h.switches, []);
  h.store.dispose();
});

test("compact Overview pages only when needed and keeps selection across narrow and wide resizing", async () => {
  const h = await overviewHarness(18);
  h.view.render(75);
  h.view.handleInput("G");
  const selected = h.view.selected().account.provider;
  for (const height of [15, 24, 48]) {
    h.setRows(height);
    for (const width of [32, 50, 75, 120, 180]) {
      const lines = h.view.render(width),
        text = lines.join("\n");
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      assert.ok(lines.length <= Math.max(5, Math.min(42, Math.floor(height * 0.85))));
      assert.match(text, /\[Overview\]/);
      assert.equal(h.view.selected().account.provider, selected);
    }
  }
  h.setRows(24);
  h.view.render(75);
  h.view.handleInput("\u001b[5~");
  assert.notEqual(h.view.selected().account.provider, selected);
  assert.match(h.view.render(75).join("\n"), /\[Overview\]/);
  assert.deepEqual(h.switches, []);
  h.store.dispose();
});
