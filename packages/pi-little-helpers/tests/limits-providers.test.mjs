// summary: exact subscription discovery, defensive provider normalization, and cancellable scoped bridge regressions.
// read_when: changing provider mappings, project restrictions, balances, or sub-core event transport.
import assert from "node:assert/strict";
import test from "node:test";
import { collectCodexAccounts, parseLimitsAccountConfig } from "../lib/codex-accounts.ts";
import { baseHeadroom, LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";
import { collectLimitsAccounts, LIMITS_PROVIDERS } from "../lib/limits-providers.ts";
import {
  needsAttention,
  overviewCells,
  providerDetailLines,
  renderRunwayCard,
} from "../lib/limits-runway.ts";
import {
  fetchSubCoreLimits,
  LIMITS_USAGE_EVENT,
  normalizeProviderUsage,
} from "../lib/limits-sub-core.ts";

const model = (provider) => ({ provider, id: "test-model" });
const account = (provider) => ({
  provider,
  authenticated: true,
  label: provider,
  models: [model(provider)],
});
const usage = (provider, extra = {}) => ({
  provider: LIMITS_PROVIDERS[provider].core,
  windows: [{ label: "Week", usedPercent: 30, resetAt: "2026-10-01T00:00:00Z" }],
  ...extra,
});
const theme = { fg: (_c, t) => t, bg: (_c, t) => t, bold: (t) => t };
const config = (global = {}, project = {}) => parseLimitsAccountConfig(global, project);
function ctx(providers, signedOut = []) {
  return {
    model: model("openai-codex"),
    modelRegistry: {
      getAll: () => providers.map(model),
      hasConfiguredAuth: (m) => !signedOut.includes(m.provider),
    },
  };
}

test("discovers six exact supported provider families alongside independent Codex accounts", () => {
  const providers = ["openai-codex", "openai-codex-2", ...Object.keys(LIMITS_PROVIDERS)];
  assert.deepEqual(
    collectLimitsAccounts(ctx(providers), config())
      .map((a) => a.provider)
      .sort(),
    providers.sort(),
  );
  assert.equal(collectCodexAccounts(ctx(providers), config()).length, 2);
  assert.equal(
    collectLimitsAccounts(
      ctx(["google", "google-gemini-cli", "cursor", "command-code", "x-ai", "x.ai"]),
      config(),
    ).length,
    0,
  );
});
test("project restriction gates all families exactly, including active provider and numbered aliases", () => {
  const context = ctx(["openai-codex", "xai", "openrouter", "openrouter-2", "opencode-go"]);
  context.model = model("xai");
  assert.deepEqual(
    collectLimitsAccounts(context, config({}, { allowedSubs: ["openrouter-2"] })).map(
      (a) => a.provider,
    ),
    ["openrouter-2"],
  );
  assert.equal(collectLimitsAccounts(context, config({}, { allowedSubs: [] })).length, 5);
  assert.throws(
    () => collectLimitsAccounts(context, config({}, { allowedSubs: [null] })),
    /Invalid/,
  );
});
test("non-Codex labels are projected without contaminating Codex discovery", () => {
  const c = config({
    subscriptions: [
      { provider: "openrouter", index: 2, label: "Team\u001b\u202e" },
      { provider: "xai", index: 7, label: "Not loaded" },
    ],
  });
  const rows = collectLimitsAccounts(ctx(["openai-codex", "openrouter-2"]), c);
  const router = rows.find((a) => a.provider === "openrouter-2");
  assert.equal(router.label, "Team");
  assert.match(router.unsupportedReason, /never borrowed/);
  assert.equal(rows.find((a) => a.provider === "xai-7").models.length, 0);
  assert.deepEqual(
    collectCodexAccounts(ctx(["openai-codex"]), c).map((a) => a.provider),
    ["openai-codex"],
  );
});
test("unconfigured base providers are hidden unless active, while configured aliases remain visible", () => {
  const context = ctx(["xai", "openrouter", "openrouter-2"], ["xai", "openrouter", "openrouter-2"]);
  context.model = model("xai");
  const c = config({ subscriptions: [{ provider: "openrouter", index: 2, label: "Team" }] });
  assert.deepEqual(
    collectLimitsAccounts(context, c)
      .map((a) => a.provider)
      .sort(),
    ["openrouter-2", "xai"],
  );
});
test("unsupported aliases never enter the refresh queue or emit a provider request", async () => {
  const rows = collectLimitsAccounts(ctx(["xai-2", "openrouter-3"]), config());
  let calls = 0;
  const store = new LimitsDashboardStore(
    rows,
    async () => {
      calls++;
    },
    () => {},
  );
  store.refresh();
  await store.waitForIdle();
  assert.equal(calls, 0);
  assert.ok(store.rows.every((row) => row.status === "error" && /never borrowed/.test(row.error)));
});

test("normalization binds Pi and core identities without trusting display names", () => {
  for (const provider of Object.keys(LIMITS_PROVIDERS)) {
    const snapshot = normalizeProviderUsage(
      provider,
      usage(provider, { displayName: "SECRET\u001b" }),
    );
    assert.equal(snapshot.provider, provider);
    assert.doesNotMatch(JSON.stringify(snapshot), /SECRET/);
  }
  for (const value of [null, {}, [], usage("xai"), { provider: "opencode", windows: "bad" }])
    assert.throws(() => normalizeProviderUsage("opencode-go", value), /identity|shape/);
});
test("invalid percentages stay unknown; zero, overrun, malicious labels and invalid reset dates are distinct", () => {
  const snapshot = normalizeProviderUsage(
    "xai",
    usage("xai", {
      windows: [
        { label: "Zero", usedPercent: 100, resetAt: "2026-10-01T00:00:00Z" },
        { label: "Over", usedPercent: 150 },
        { label: "Unknown", usedPercent: NaN },
        { label: "Negative", usedPercent: -1 },
        { label: "Safe\u001b\u202e".repeat(100), usedPercent: "20", resetAt: "tomorrow" },
      ],
    }),
  );
  assert.deepEqual(
    snapshot.usage.windows.map((w) => w.remainingPercent),
    [0, 0, undefined, undefined, undefined],
  );
  assert.equal(snapshot.usage.windows[0].resetAt, "2026-10-01T00:00:00.000Z");
  assert.equal(snapshot.usage.windows[4].resetAt, undefined);
  assert.ok(snapshot.usage.windows[4].label.length <= 160);
  assert.equal(snapshot.usage.windows[4].label.includes("\u001b"), false);
  assert.equal(snapshot.usage.windows[4].label.includes("\u202e"), false);
});
test("normalization bounds provider windows and ignores raw error details", () => {
  assert.equal(
    normalizeProviderUsage(
      "xai",
      usage("xai", {
        windows: Array.from({ length: 200 }, () => ({ usedPercent: 20, label: "Week" })),
      }),
    ).usage.windows.length,
    100,
  );
  const snapshot = normalizeProviderUsage(
    "xai",
    usage("xai", { error: { code: "HTTP_ERROR", message: "SECRET-BEARER" } }),
  );
  assert.equal(snapshot.usage, undefined);
  assert.match(snapshot.usageError, /Provider check failed/);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET/);
});
test("Anthropic extra spending utilization never drives base quota headroom", () => {
  const snapshot = normalizeProviderUsage(
    "anthropic",
    usage("anthropic", {
      windows: [
        { label: "5h", usedPercent: 20 },
        { label: "Extra [on] $1/$1", usedPercent: 100 },
      ],
    }),
  );
  assert.equal(baseHeadroom({ snapshot }), 80);
  assert.equal(snapshot.usage.windows[1].primary, false);
});
test("OpenRouter keeps capped zero, uncapped and unknown allowance distinct from wallet", () => {
  for (const keyLimit of [0, null, undefined]) {
    const snapshot = normalizeProviderUsage(
      "openrouter",
      usage("openrouter", {
        keyLimit,
        keyRemaining: keyLimit === 0 ? 0 : undefined,
        creditRemaining: 25,
      }),
    );
    assert.equal(snapshot.money.keyLimit, keyLimit);
    assert.equal(snapshot.money.walletRemaining, 25);
    assert.equal(snapshot.usage.windows.length, 0);
    assert.equal(baseHeadroom({ snapshot }), undefined);
    const text = providerDetailLines(snapshot, theme, 0).join("\n");
    assert.doesNotMatch(text, /\d+%|BANKED RESETS/);
    assert.match(text, /KEY ALLOWANCE/);
    assert.match(text, /ACCOUNT WALLET/);
    if (keyLimit === null) assert.match(text, /uncapped/);
    if (keyLimit === undefined) assert.match(text, /Cap unknown/);
  }
});
test("walletUnavailable discards contradictory stale wallet fields, not good key data", () => {
  const snapshot = normalizeProviderUsage(
    "openrouter",
    usage("openrouter", {
      keyLimit: 10,
      keyRemaining: 7,
      creditUnavailable: true,
      creditRemaining: 9876,
      creditTotal: 9999,
      creditUsage: 123,
    }),
  );
  assert.equal(snapshot.money.keyRemaining, 7);
  assert.equal(snapshot.money.walletRemaining, undefined);
  assert.equal(snapshot.money.walletTotal, undefined);
  assert.equal(snapshot.money.walletUsage, undefined);
  const row = { account: account("openrouter"), status: "ready", snapshot };
  const text = [
    ...providerDetailLines(snapshot, theme, 0),
    ...renderRunwayCard(row, theme, 120, false, false, 0),
  ].join("\n");
  assert.doesNotMatch(text, /9876|9999|123\.00/);
  assert.match(text, /unavailable/i);
  assert.match(text, /\$7\.00/);
  assert.equal(needsAttention(row), true);
});
test("attention includes known empty money balances without manufacturing headroom", () => {
  for (const extra of [{ keyRemaining: 0 }, { creditRemaining: 0 }]) {
    const snapshot = normalizeProviderUsage("openrouter", usage("openrouter", extra));
    assert.equal(needsAttention({ snapshot, status: "ready" }), true);
    assert.equal(baseHeadroom({ snapshot }), undefined);
  }
  assert.equal(
    needsAttention({
      snapshot: normalizeProviderUsage(
        "openrouter",
        usage("openrouter", { keyLimit: null, creditRemaining: 12 }),
      ),
      status: "ready",
    }),
    false,
  );
});

test("unknown money fields are partial, not healthy or manufactured zero balances", () => {
  for (const extra of [
    { keyLimit: 10, keyRemaining: 7 },
    { keyLimit: null },
    { keyLimit: 10, creditRemaining: 12 },
    { keyLimit: 10, keyRemaining: -1, creditRemaining: 12 },
  ]) {
    const snapshot = normalizeProviderUsage("openrouter", usage("openrouter", extra));
    const row = { account: account("openrouter"), status: "ready", snapshot };
    assert.equal(needsAttention(row), true);
    assert.equal(baseHeadroom(row), undefined);
    const cells = overviewCells(row, false, theme, undefined, 0, 18);
    assert.match(cells[0], /~ /);
    assert.match(cells[1], /\?/);
    assert.doesNotMatch(cells[1], /\$0\.00/);
  }
});

test("bridge sends only the selected exact provider and handles synchronous reply", async () => {
  const emitted = [];
  const events = {
    emit: (event, request) => {
      emitted.push({ event, provider: request.provider });
      request.reply({ version: 1, provider: request.provider, usage: usage(request.provider) });
    },
  };
  const snapshot = await fetchSubCoreLimits(
    events,
    "opencode-go",
    new AbortController().signal,
    100,
  );
  assert.equal(snapshot.provider, "opencode-go");
  assert.deepEqual(emitted, [{ event: LIMITS_USAGE_EVENT, provider: "opencode-go" }]);
});
test("bridge rejects unsupported identities before emission", async () => {
  for (const provider of ["xai-2", "openai-codex", "openrouter-2", "constructor", "google"])
    await assert.rejects(
      fetchSubCoreLimits(
        { emit: () => assert.fail("no event") },
        provider,
        new AbortController().signal,
      ),
      /Unsupported/,
    );
});
test("bridge rejects wrong provider, version and malformed usage instead of accepting another account", async () => {
  for (const response of [
    { version: 2, provider: "xai", usage: usage("xai") },
    { version: 1, provider: "zai", usage: usage("xai") },
    { version: 1, provider: "xai", usage: usage("zai") },
    null,
  ]) {
    await assert.rejects(
      fetchSubCoreLimits(
        { emit: (_event, request) => request.reply(response) },
        "xai",
        new AbortController().signal,
        100,
      ),
      /identity|shape/,
    );
  }
});
test("bridge provider error codes become safe actionable copy, never raw provider messages", async () => {
  const snapshot = await fetchSubCoreLimits(
    {
      emit: (_e, r) =>
        r.reply({
          version: 1,
          provider: r.provider,
          error: { code: "DISABLED", message: "SECRET" },
        }),
    },
    "xai",
    new AbortController().signal,
  );
  assert.match(snapshot.usageError, /disabled/);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET/);
});
test("absent or nonresponding core stays actionable through store and timeout cancels provider signal", async () => {
  const absent = await fetchSubCoreLimits(undefined, "xai", new AbortController().signal, 5);
  assert.match(absent.usageError, /Install.*reload/);
  let request;
  const store = new LimitsDashboardStore(
    [account("xai")],
    (_a, signal) =>
      fetchSubCoreLimits(
        {
          emit: (_e, r) => {
            request = r;
          },
        },
        "xai",
        signal,
        5,
      ),
    () => {},
  );
  store.refresh();
  await store.waitForIdle();
  assert.equal(request.signal.aborted, true);
  assert.equal(store.rows[0].status, "error");
  assert.match(store.rows[0].snapshot.usageError, /compatible sub-core.*reload/);
  request.reply({ version: 1, provider: "xai", usage: usage("xai") });
  assert.equal(store.rows[0].snapshot.usage, undefined);
});
test("closing bridge aborts work, removes wait and ignores late replies", async () => {
  let request;
  const abort = new AbortController();
  const pending = fetchSubCoreLimits(
    {
      emit: (_e, r) => {
        request = r;
      },
    },
    "xai",
    abort.signal,
    1000,
  );
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(request.signal.aborted, true);
  request.reply({ version: 1, provider: "xai", usage: usage("xai") });
  const early = new AbortController();
  early.abort();
  await assert.rejects(
    fetchSubCoreLimits({ emit: () => assert.fail("no event") }, "xai", early.signal),
    { name: "AbortError" },
  );
});
