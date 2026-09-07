// summary: verifies account-bound multi-pass reset spending, restrictions, and recovery against real helpers.
// read_when: changing reset account targeting or the confirmation/retry boundary.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createCodexResetExtension, requirePersistedReset } from "../extensions/codex-reset.ts";
import { parseLimitsAccountConfig } from "../lib/codex-accounts.ts";
import { consumeCodexResetCredit, fetchCodexResetCredits } from "../lib/codex-reset.ts";

const stateType = "pi-little-helpers.codex-reset-state";
function jwt(accountId, nonce = "signature") {
  return `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } })).toString("base64url")}.${nonce}`;
}
function harness(options = {}) {
  const calls = [],
    authCalls = [],
    confirms = [],
    notifications = [],
    entries = [];
  const handlers = new Map();
  let command;
  const state = {
    accountId: "account-two",
    config: {},
    confirm: async () => true,
    nonce: "initial",
    ...options,
  };
  const ctx = {
    cwd: "/virtual-project",
    model: { provider: "openai-codex-2" },
    hasUI: true,
    modelRegistry: {
      async getApiKeyAndHeaders(model) {
        authCalls.push(model.provider);
        await state.onAuth?.();
        return { ok: true, apiKey: state.token ?? jwt(state.accountId, state.nonce) };
      },
    },
    ui: {
      setStatus() {},
      notify(message, type) {
        notifications.push({ message, type });
      },
      async confirm(title, message) {
        confirms.push({ title, message });
        return state.confirm(title, message);
      },
    },
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), ...init });
    if (init.method === "GET")
      return new Response(JSON.stringify({ available_count: state.available ?? 1, credits: [] }));
    const result = await state.post?.(init);
    return result ?? new Response(JSON.stringify({ code: "reset", windows_reset: 2 }));
  };
  const dependencies = {
    loadAccountConfig: () =>
      parseLimitsAccountConfig(
        { subscriptions: [{ provider: "openai-codex", index: 2, label: "Personal\u001b\u202e" }] },
        state.config,
      ),
    requirePersisted: () => {},
    fetchCredits: (ctx, target) => fetchCodexResetCredits(ctx, fetchImpl, target),
    consumeCredit: (ctx, requestId, target) =>
      consumeCodexResetCredit(ctx, requestId, fetchImpl, target),
    createRequestId: () => `request-${entries.length + 1}`,
    ...options.dependencies,
  };
  function register() {
    createCodexResetExtension(dependencies)({
      on(name, handler) {
        handlers.set(name, handler);
      },
      registerCommand(name, definition) {
        if (name === "codex-reset") command = definition;
      },
      appendEntry(customType, data) {
        entries.push({ type: "custom", customType, data });
        state.manager?.appendCustomEntry(customType, data);
      },
    });
  }
  register();
  return {
    ctx,
    calls,
    authCalls,
    confirms,
    notifications,
    entries,
    state,
    posts: () => calls.filter((call) => call.method === "POST"),
    run: (action = "use") => command.handler(action, ctx),
    reload(history = entries) {
      register();
      handlers.get("session_start")(
        {},
        { sessionManager: { getEntries: () => history, getBranch: () => [] } },
      );
    },
  };
}

test("numbered account status/use resolve exact credentials, identify confirmation, and never borrow base auth", async () => {
  const h = harness();
  await h.run("status");
  assert.equal(h.confirms.length, 0);
  assert.equal(h.posts().length, 0);
  assert.match(h.notifications.at(-1).message, /Personal \(openai-codex-2\) · account account-two/);
  await h.run();
  assert.equal(h.posts().length, 1);
  assert.deepEqual(new Set(h.authCalls), new Set(["openai-codex-2"]));
  assert.equal(h.posts()[0].headers.get("chatgpt-account-id"), "account-two");
  assert.match(h.confirms[0].message, /Personal \(openai-codex-2\).*account-two/);
  assert.equal(h.confirms[0].message.includes("\u001b"), false);
  assert.equal(JSON.stringify(h.entries).includes("signature"), false);
  assert.equal(JSON.stringify(h.entries).includes("Bearer"), false);
  assert.match(h.notifications.at(-1).message, /2 windows/);
});

test("a provider switch or credential replacement during confirmation sends no POST", async () => {
  for (const change of [
    (h) => {
      h.ctx.model = { provider: "openai-codex-3" };
    },
    (h) => {
      h.state.accountId = "replacement-account";
    },
  ]) {
    const h = harness();
    h.state.confirm = async () => {
      change(h);
      return true;
    };
    await h.run();
    assert.equal(h.posts().length, 0);
    assert.match(h.notifications.at(-1).message, /changed/);
  }
});

test("auth refresh for the same identity works; unknown identity never reaches the API", async () => {
  const h = harness();
  h.state.confirm = async () => {
    h.state.nonce = "refreshed";
    return true;
  };
  await h.run();
  assert.equal(h.posts().length, 1);
  assert.match(h.posts()[0].headers.get("authorization"), /refreshed$/);
  const unknown = harness({ token: "not-a-codex-jwt" });
  await unknown.run();
  assert.equal(unknown.calls.length, 0);
  assert.match(unknown.notifications.at(-1).message, /identity is missing/);
});

test("unsupported providers fail before authentication", async () => {
  for (const provider of ["openai", "anthropic", "openai-codex-other", "openai-codex-2-extra"]) {
    const h = harness();
    h.ctx.model = { provider };
    await h.run("status");
    assert.equal(h.authCalls.length, 0);
    assert.equal(h.calls.length, 0);
  }
});

test("exact allowedSubs applies even to base; malformed scope fails before auth", async () => {
  for (const config of [
    { allowedSubs: ["openai-codex"] },
    { allowedSubs: "openai-codex-2" },
    { allowedSubs: [42] },
  ]) {
    const h = harness({ config });
    await h.run();
    assert.equal(h.authCalls.length, 0);
    assert.equal(h.calls.length, 0);
    assert.match(h.notifications.at(-1).message, /allowedSubs/);
  }
  const base = harness({ config: { allowedSubs: ["openai-codex-2"] } });
  base.ctx.model = { provider: "openai-codex" };
  await base.run();
  assert.equal(base.authCalls.length, 0);
  for (const allowedSubs of [[], [" "], [" openai-codex-2 "]]) {
    const h = harness({ config: { allowedSubs } });
    await h.run();
    assert.equal(h.posts().length, 1);
  }
});

test("restrictions are rechecked after confirmation and asynchronous auth", async () => {
  const confirmed = harness();
  confirmed.state.confirm = async () => {
    confirmed.state.config = { allowedSubs: ["openai-codex-3"] };
    return true;
  };
  await confirmed.run();
  assert.equal(confirmed.posts().length, 0);
  const refreshing = harness();
  refreshing.state.confirm = async () => {
    refreshing.state.onAuth = async () => {
      refreshing.state.config = { allowedSubs: ["openai-codex-3"] };
    };
    return true;
  };
  await refreshing.run();
  assert.equal(refreshing.posts().length, 0);
});

test("lost response then 401 preserves the original request across reload and branch navigation", async () => {
  const h = harness();
  h.state.post = async () => {
    if (h.posts().length === 1) throw new Error("connection dropped");
    return new Response("unauthorized", { status: 401 });
  };
  await h.run();
  const firstId = JSON.parse(h.posts()[0].body).redeem_request_id;
  assert.equal(JSON.parse(h.posts()[1].body).redeem_request_id, firstId);
  assert.match(h.notifications.at(-1).message, /remains unresolved/);
  h.reload();
  h.state.available = 0;
  h.state.post = async () => new Response(JSON.stringify({ code: "already_redeemed" }));
  await h.run();
  assert.equal(JSON.parse(h.posts().at(-1).body).redeem_request_id, firstId);
  assert.equal(h.entries.at(-1).data.requestId, undefined);
});

test("pending request is never retried on replacement credentials, but can resume on the original account", async () => {
  const h = harness({ confirm: async (title) => title !== "Reset result is uncertain" });
  h.state.post = async () => {
    throw new Error("lost response");
  };
  await h.run();
  const firstId = JSON.parse(h.posts()[0].body).redeem_request_id;
  h.reload();
  h.state.accountId = "other-account";
  await h.run();
  assert.equal(h.posts().length, 1);
  assert.match(h.notifications.at(-1).message, /Restore that account/);
  h.state.accountId = "account-two";
  h.state.post = async () => new Response(JSON.stringify({ code: "already_redeemed" }));
  await h.run();
  assert.equal(h.posts().length, 2);
  assert.equal(JSON.parse(h.posts()[1].body).redeem_request_id, firstId);
});

test("immediate ambiguous retry cannot follow a subscription switch", async () => {
  const h = harness();
  h.state.post = async () => {
    throw new Error("lost response");
  };
  h.state.confirm = async (title) => {
    if (title === "Reset result is uncertain") h.ctx.model = { provider: "openai-codex-3" };
    return true;
  };
  await h.run();
  assert.equal(h.posts().length, 1);
  assert.match(h.notifications.at(-1).message, /remains unresolved/);
  assert.equal(h.entries.at(-1).data.provider, "openai-codex-2");
});

test("independent providers retain independent unresolved request IDs", async () => {
  const h = harness({ confirm: async (title) => title !== "Reset result is uncertain" });
  h.state.post = async () => {
    throw new Error("lost response");
  };
  await h.run();
  h.ctx.model = { provider: "openai-codex-3" };
  h.state.accountId = "account-three";
  await h.run();
  const [two, three] = h.posts().map((call) => JSON.parse(call.body).redeem_request_id);
  assert.notEqual(two, three);
  h.reload();
  h.state.post = async () => new Response(JSON.stringify({ code: "already_redeemed" }));
  await h.run();
  assert.equal(JSON.parse(h.posts()[2].body).redeem_request_id, three);
  h.ctx.model = { provider: "openai-codex-2" };
  h.state.accountId = "account-two";
  await h.run();
  assert.equal(JSON.parse(h.posts()[3].body).redeem_request_id, two);
});

test("legacy unbound unresolved IDs block spending rather than adopting the active account", async () => {
  const h = harness();
  h.reload([{ type: "custom", customType: stateType, data: { requestId: "old-unbound-id" } }]);
  await h.run();
  assert.equal(h.posts().length, 0);
  assert.equal(h.confirms.length, 0);
  assert.match(h.notifications.at(-1).message, /no recorded account identity/);
});

test("headless use is status-only; cancellation never writes pending state or consumes", async () => {
  const h = harness({ confirm: async () => false });
  await h.run();
  assert.equal(h.entries.length, 0);
  assert.equal(h.posts().length, 0);
  h.ctx.hasUI = false;
  await h.run();
  assert.equal(h.posts().length, 0);
  assert.equal(h.confirms.length, 1);
});

test("real SessionManager: reject unflushed/in-memory sessions; recover saved requests after reopening", async () => {
  const scratchRoot =
    process.env.TMPDIR ?? join(tmpdir() === "/tmp" ? process.env.HOME : tmpdir(), ".pi", "tmp");
  mkdirSync(scratchRoot, { recursive: true });
  const dir = mkdtempSync(join(scratchRoot, "codex-reset-persistence-"));
  try {
    for (const manager of [SessionManager.create(dir, dir), SessionManager.inMemory(dir)]) {
      const h = harness({
        manager,
        dependencies: { requirePersisted: requirePersistedReset },
        confirm: async (title) => title !== "Reset result is uncertain",
      });
      h.ctx.sessionManager = manager;
      await h.run();
      assert.equal(h.posts().length, 0);
      assert.match(h.notifications.at(-1).message, /recovery state is not saved/);
    }
    const manager = SessionManager.create(dir, dir);
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "ready" }],
      api: "openai-codex-responses",
      provider: "openai-codex-2",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const h = harness({
      manager,
      dependencies: { requirePersisted: requirePersistedReset },
      confirm: async (title) => title !== "Reset result is uncertain",
    });
    h.ctx.sessionManager = manager;
    h.state.post = async () => {
      throw new Error("response lost");
    };
    await h.run();
    assert.equal(h.posts().length, 1);
    const reopened = SessionManager.open(manager.getSessionFile());
    const reloaded = harness({
      manager: reopened,
      dependencies: { requirePersisted: requirePersistedReset },
    });
    reloaded.ctx.sessionManager = reopened;
    reloaded.reload(reopened.getEntries());
    await reloaded.run();
    assert.equal(reloaded.posts().length, 1);
    assert.equal(
      JSON.parse(reloaded.posts()[0].body).redeem_request_id,
      JSON.parse(h.posts()[0].body).redeem_request_id,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
