// summary: command-level all-account, project restriction and pending-switch shutdown regressions.
// read_when: changing limits command scope, dashboard lifecycle or abort handling.
import assert from "node:assert/strict";
import test from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { createLimitsExtension, switchLimitsAccount } from "../extensions/limits.ts";
import { fetchCodexLimitsSnapshot } from "../lib/codex-limits.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const account = (provider, id = "gpt-test") => ({
  provider,
  label: provider,
  authenticated: true,
  models: [{ provider, id }],
});
const snapshot = (provider) => ({
  provider,
  fetchedAt: Date.now(),
  usage: { windows: [] },
  credits: { availableCount: 0, credits: [] },
});
function register(options) {
  let command;
  const handlers = new Map(),
    modelChanges = [];
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (_name, value) => {
      command = value;
    },
    setModel: async (value) => {
      modelChanges.push(value);
      return true;
    },
  };
  createLimitsExtension(options)(pi);
  return { pi, command, handlers, modelChanges };
}

test("/limits current never queries an excluded account or ignores malformed project scope", async () => {
  for (const accounts of [
    () => [],
    () => {
      throw new Error("Invalid allowedSubs");
    },
  ]) {
    let calls = 0;
    const h = register({
      accounts,
      fetchCurrent: async () => {
        calls++;
        return "wrong";
      },
    });
    const ctx = {
      model: { provider: "openai-codex" },
      hasUI: true,
      ui: { notify() {}, setStatus() {} },
    };
    await h.command.handler("current", ctx);
    assert.equal(calls, 0);
  }
});

test("headless /limits covers all accounts without switching the active model", async () => {
  const calls = [],
    logs = [];
  const current = { provider: "anthropic", id: "claude-test" };
  const h = register({
    accounts: () => [account("openai-codex"), account("openai-codex-2")],
    fetchSnapshot: async (ctx) => {
      calls.push(ctx.model.provider);
      return snapshot(ctx.model.provider);
    },
  });
  const original = console.log;
  try {
    console.log = (line) => logs.push(line);
    await h.command.handler("", { model: current, modelRegistry: {}, hasUI: false, mode: "print" });
  } finally {
    console.log = original;
  }
  assert.deepEqual(calls.sort(), ["openai-codex", "openai-codex-2"]);
  assert.match(logs[0], /Limits — openai-codex\n/);
  assert.match(logs[0], /Limits — openai-codex-2\n/);
  assert.equal(h.modelChanges.length, 0);
  assert.equal(current.provider, "anthropic");
});

test("pending fallback confirmation cannot switch after dashboard disposal and session shutdown", async () => {
  let finishUI, confirm;
  let dashboard;
  const target = account("openai-codex-2", "other-model");
  const h = register({
    accounts: () => [target],
    fetchSnapshot: async () => snapshot(target.provider),
  });
  const ctx = {
    model: { provider: "openai-codex", id: "current-model" },
    modelRegistry: {},
    hasUI: true,
    mode: "tui",
    isIdle: () => true,
    ui: {
      notify() {},
      setStatus() {},
      confirm: () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
      custom: (factory) =>
        new Promise((resolve) => {
          finishUI = resolve;
          dashboard = factory(
            { requestRender() {}, terminal: { rows: 48 } },
            { fg: (_c, t) => t, bg: (_c, t) => t, bold: (t) => t },
            new KeybindingsManager(TUI_KEYBINDINGS),
            resolve,
          );
        }),
    },
  };
  const running = h.command.handler("", ctx);
  await tick();
  dashboard.handleInput("s");
  await tick();
  assert.ok(confirm);
  h.handlers.get("session_shutdown")();
  dashboard.dispose();
  Object.defineProperty(ctx, "model", {
    get() {
      throw new Error("stale context");
    },
  });
  confirm(true);
  await tick();
  finishUI();
  await running;
  assert.equal(h.modelChanges.length, 0);
});

test("a closed switch never even reads a stale context", async () => {
  const ctx = {
    isIdle() {
      assert.fail("must not touch stale ctx");
    },
  };
  assert.match(
    await switchLimitsAccount(
      {},
      ctx,
      "openai-codex-2",
      () => [],
      () => false,
    ),
    /cancelled/,
  );
});

test("abort releases a stuck auth wait and no late usage GET starts", async () => {
  const abort = new AbortController();
  let releaseAuth;
  let fetches = 0;
  const promise = fetchCodexLimitsSnapshot(
    {
      model: { provider: "openai-codex-2" },
      signal: abort.signal,
      modelRegistry: {
        getApiKeyAndHeaders: () =>
          new Promise((resolve) => {
            releaseAuth = resolve;
          }),
      },
    },
    async () => {
      fetches++;
      return Response.json({});
    },
  );
  abort.abort();
  await assert.rejects(promise, { name: "AbortError" });
  releaseAuth({ ok: true, apiKey: "opaque" });
  await tick();
  assert.equal(fetches, 0);
});
