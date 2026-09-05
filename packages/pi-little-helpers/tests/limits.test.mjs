// summary: verifies /limits account binding, read-only requests, partial failures and expiry output.
// read_when: changing /limits or multi-pass credential selection.
import assert from "node:assert/strict";
import test from "node:test";
import { createLimitsExtension } from "../extensions/limits.ts";
import { fetchCodexLimits, formatCodexUsage } from "../lib/codex-limits.ts";

function context(provider = "openai-codex-2") {
  const selected = [];
  return {
    selected,
    model: { provider },
    modelRegistry: {
      async getApiKeyAndHeaders(model) {
        selected.push(model.provider);
        const payload = { "https://api.openai.com/auth": { chatgpt_account_id: model.provider } };
        return {
          ok: true,
          apiKey: `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`,
        };
      },
    },
  };
}
const usage = {
  plan_type: "pro",
  rate_limit: {
    primary_window: { used_percent: 15, limit_window_seconds: 18000, reset_at: 1788600000 },
    secondary_window: { used_percent: 40, limit_window_seconds: 604800 },
  },
  additional_rate_limits: [
    {
      limit_name: "Spark",
      rate_limit: {
        primary_window: { used_percent: 100, limit_window_seconds: 18000 },
      },
    },
  ],
};
const credits = {
  available_count: 2,
  credits: [
    { status: "available", expires_at: "2026-09-20T00:00:00Z" },
    { status: "available" },
    { status: "redeemed", expires_at: "2026-09-10T00:00:00Z" },
  ],
};

test("limits resolves the selected alias once and only GETs usage and reset credits", async () => {
  const ctx = context();
  const calls = [];
  const output = await fetchCodexLimits(ctx, async (url, init) => {
    calls.push({ url, init });
    ctx.model = { provider: "openai-codex-3" }; // switch mid-flight
    assert.equal(init.headers.get("chatgpt-account-id"), "openai-codex-2");
    return Response.json(url.endsWith("/usage") ? usage : credits);
  });
  assert.deepEqual(ctx.selected, ["openai-codex-2"]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url, init }) => init.method === "GET" && !url.includes("consume")));
  assert.match(output, /openai-codex-2 \(current subscription\)/);
  assert.match(output, /5h: 85% left/);
  assert.match(output, /7d: 60% left/);
  assert.match(output, /Spark · 5h: 0% left/);
  assert.match(output, /banked resets: 2/);
  assert.match(output, /2026-09-20 00:00:00 UTC/);
  assert.match(output, /2\. expiry unknown/);
  assert.doesNotMatch(output, /2026-09-10|Bearer/);
});

test("base account and partial HTTP failures are shown without losing successful data", async () => {
  const output = await fetchCodexLimits(context("openai-codex"), async (url) =>
    url.endsWith("/usage")
      ? Response.json(usage)
      : new Response("secret error body", { status: 403 }),
  );
  assert.match(output, /85% left/);
  assert.match(output, /Banked resets unavailable: HTTP 403/);
  assert.doesNotMatch(output, /secret error body/);
  const other = await fetchCodexLimits(context(), async (url) =>
    url.endsWith("/usage")
      ? new Response("bad", { status: 500 })
      : Response.json({ available_count: 0 }),
  );
  assert.match(other, /Usage unavailable: HTTP 500/);
  assert.match(other, /banked resets: 0/);
});

test("malformed or missing usage never means 100 percent remaining", () => {
  assert.throws(() => formatCodexUsage({}), /no rate-limit data/);
  assert.match(formatCodexUsage({ rate_limit: { primary_window: {} } }), /remaining unknown/);
  assert.match(formatCodexUsage({ rate_limit: {} }), /No usage windows reported/);
  for (const used_percent of [-1, -100, NaN, Infinity, "0"])
    assert.match(
      formatCodexUsage({ rate_limit: { primary_window: { used_percent } } }),
      /remaining unknown/,
    );
});

test("malformed JSON is reported without echoing response content", async () => {
  const output = await fetchCodexLimits(context(), async () => new Response("secret invalid JSON"));
  assert.match(output, /Unrecognized JSON response/);
  assert.doesNotMatch(output, /secret/);
});

test("unknown provider never resolves credentials or fetches", async () => {
  const ctx = context("openai");
  await assert.rejects(
    fetchCodexLimits(ctx, () => assert.fail("must not fetch")),
    /subscription model/,
  );
  assert.deepEqual(ctx.selected, []);
});

test("command registration supports UI, argument guards and headless output without model calls", async () => {
  let command;
  let fetches = 0;
  createLimitsExtension({
    fetchCurrent: async () => {
      fetches++;
      return "limits result";
    },
    accounts: () => [{ provider: "openai-codex-2", authenticated: true }],
  })({
    on() {},
    registerCommand(name, spec) {
      assert.equal(name, "limits");
      command = spec;
    },
  });
  const notices = [];
  const statuses = [];
  const ctx = {
    ...context(),
    hasUI: true,
    ui: {
      notify: (message) => notices.push(message),
      setStatus: (...value) => statuses.push(value),
    },
  };
  await command.handler("current", ctx);
  assert.deepEqual(notices, ["limits result"]);
  assert.deepEqual(statuses.at(-1), ["limits", undefined]);
  await command.handler("use", ctx);
  await command.handler("current", { ...ctx, model: { provider: "anthropic" } });
  assert.equal(fetches, 1);
  const logs = [];
  const original = console.log;
  try {
    console.log = (line) => logs.push(line);
    await command.handler("current", { ...ctx, hasUI: false });
  } finally {
    console.log = original;
  }
  assert.deepEqual(logs, ["limits result"]);
});
