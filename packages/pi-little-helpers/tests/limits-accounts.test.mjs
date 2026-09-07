// summary: all-account discovery and explicit account switching safety for /limits.
// read_when: changing account scope, multi-pass metadata projection, or switching.
import assert from "node:assert/strict";
import test from "node:test";
import { switchLimitsAccount } from "../extensions/limits.ts";
import { collectCodexAccounts, parseLimitsAccountConfig } from "../lib/codex-accounts.ts";

const model = (provider, id = "gpt-test") => ({ provider, id });
function context() {
  const models = [
    model("openai-codex"),
    model("openai-codex-2"),
    model("openai-codex-3"),
    model("anthropic"),
  ];
  return {
    model: models[0],
    isIdle: () => true,
    modelRegistry: {
      getAll: () => models,
      hasConfiguredAuth: (model) => model.provider !== "openai-codex-3",
    },
    ui: { confirm: async () => true },
  };
}
const empty = () => parseLimitsAccountConfig({}, {});

test("enumerates registered aliases including environment-only and signed-out accounts; projects labels", () => {
  const config = parseLimitsAccountConfig(
    {
      subscriptions: [
        { provider: "openai-codex", index: 2, label: "Personal\u001b\u202e" },
        { provider: "openai-codex", index: 9, label: "Not loaded" },
      ],
    },
    {},
  );
  const accounts = collectCodexAccounts(context(), config);
  assert.deepEqual(
    accounts.map((account) => account.provider),
    ["openai-codex", "openai-codex-2", "openai-codex-3", "openai-codex-9"],
  );
  assert.equal(accounts[1].label, "Personal");
  assert.equal(accounts[2].authenticated, false);
  assert.equal(accounts[3].models.length, 0);
});

test("project allowlist is exact, excludes even the current base account, and malformed scope fails closed", () => {
  const config = parseLimitsAccountConfig(
    {},
    { allowedSubs: [" openai-codex-2 ", "openai-codex-2"] },
  );
  assert.deepEqual(
    collectCodexAccounts(context(), config).map((account) => account.provider),
    ["openai-codex-2"],
  );
  assert.equal(
    collectCodexAccounts(context(), parseLimitsAccountConfig({}, { allowedSubs: ["anthropic"] }))
      .length,
    0,
  );
  assert.equal(
    collectCodexAccounts(context(), parseLimitsAccountConfig({}, { allowedSubs: [] })).length,
    3,
  );
  assert.throws(() => parseLimitsAccountConfig({}, { allowedSubs: "openai-codex" }), /Invalid/);
  assert.throws(() => parseLimitsAccountConfig({}, { allowedSubs: [42] }), /Invalid/);
});

test("all subscriptions are inspectable while the session is on a non-Codex model", () => {
  const ctx = context();
  ctx.model = model("anthropic");
  assert.equal(collectCodexAccounts(ctx, empty()).length, 3);
});

test("switch preserves model and never switches when busy, signed out or excluded", async () => {
  const ctx = context();
  const calls = [];
  const pi = {
    setModel: async (model) => {
      calls.push(model);
      ctx.model = model;
      return true;
    },
  };
  const accounts = () => collectCodexAccounts(ctx, empty());
  assert.match(await switchLimitsAccount(pi, ctx, "openai-codex-2", accounts), /Now using/);
  assert.deepEqual(calls, [model("openai-codex-2")]);
  assert.match(await switchLimitsAccount(pi, ctx, "openai-codex-2", accounts), /Already/);
  assert.match(await switchLimitsAccount(pi, ctx, "openai-codex-3", accounts), /Sign in/);
  assert.match(await switchLimitsAccount(pi, ctx, "openai-codex-9", accounts), /no longer allowed/);
  ctx.isIdle = () => false;
  assert.match(await switchLimitsAccount(pi, ctx, "openai-codex", accounts), /Wait/);
  assert.equal(calls.length, 1);
});

test("model fallback needs confirmation and rechecks restrictions after that confirmation", async () => {
  const ctx = context();
  const target = {
    provider: "openai-codex-2",
    label: "Personal",
    authenticated: true,
    models: [model("openai-codex-2", "other-model")],
  };
  let allowed = [target];
  let calls = 0;
  const pi = {
    setModel: async () => {
      calls++;
      return true;
    },
  };
  ctx.ui.confirm = async () => false;
  assert.match(await switchLimitsAccount(pi, ctx, target.provider, () => allowed), /cancelled/);
  ctx.ui.confirm = async () => {
    allowed = [];
    return true;
  };
  assert.match(
    await switchLimitsAccount(pi, ctx, target.provider, () => allowed),
    /availability changed/,
  );
  assert.equal(calls, 0);
});
