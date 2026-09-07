// summary: machine reset queries, strict bus validation, and scoped dashboard counts.
// read_when: changing reset inventory admission, error states, or multi-window semantics.

import assert from "node:assert/strict";
import test from "node:test";
import resetInventoryExtension, {
  createResetInventoryExtension,
} from "../extensions/reset-inventory.ts";
import { LimitsDashboardStore } from "../lib/limits-dashboard-store.ts";
import {
  bankedResetFacts,
  needsAttention,
  overviewCells,
  renderTimeline,
} from "../lib/limits-runway.ts";
import {
  fetchResetInventory,
  normalizeResetInventory,
  queryResetInventory,
  RESET_INVENTORY_EVENT,
  resetInventoryLines,
} from "../lib/reset-inventory.ts";

const now = Date.now(),
  expiresAt = new Date(now + 86400000).toISOString();
const response = (provider = "xai", count = 1) => ({
  version: 1,
  provider,
  checkedAt: now,
  inventory: {
    windows: [
      {
        scope: "weekly",
        availableCount: count,
        resets: Array.from({ length: count }, () => ({ expiresAt, tokenId: "must-not-escape" })),
      },
    ],
  },
});
const theme = { fg: (_, text) => text, bold: (text) => text };

test("core responses are exact-provider, strict per-scope and stripped of token IDs", () => {
  const good = normalizeResetInventory("xai", response());
  assert.equal(good.windows[0].availableCount, 1);
  assert.doesNotMatch(JSON.stringify(good), /must-not-escape|tokenId/);
  for (const mutate of [
    (r) => (r.provider = "zai"),
    (r) => (r.version = 2),
    (r) => delete r.inventory,
    (r) => (r.inventory.windows[0].availableCount = 2),
    (r) => (r.inventory.windows[0].scope = "five_hour"),
    (r) => r.inventory.windows.push(r.inventory.windows[0]),
    (r) => (r.inventory.windows[0].resets[0].expiresAt = "yesterday"),
  ]) {
    const r = response();
    mutate(r);
    assert.equal(normalizeResetInventory("xai", r).code, "INVALID_RESPONSE");
  }
  assert.equal(normalizeResetInventory("xai", response("xai", 0)).windows[0].availableCount, 0);
  const failure = normalizeResetInventory("xai", {
    version: 1,
    provider: "xai",
    checkedAt: now,
    error: { code: "unknown-secret", message: "token-secret" },
  });
  assert.equal(failure.code, "INVALID_RESPONSE");
  assert.doesNotMatch(JSON.stringify(failure), /unknown-secret|token-secret/);
});

test("bridge issues only inventory query, supports synchronous reply, and aborts outstanding work", async () => {
  const calls = [];
  let request;
  const result = await fetchResetInventory(
    {
      emit: (event, p) => {
        calls.push(event);
        request = p;
        p.reply(response());
      },
    },
    "xai",
    new AbortController().signal,
  );
  assert.equal(result.windows[0].availableCount, 1);
  assert.deepEqual(calls, [RESET_INVENTORY_EVENT]);
  assert.equal(request.signal.aborted, true);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(
    (await fetchResetInventory({ emit: () => assert.fail("No dispatch") }, "xai", aborted.signal))
      .code,
    "CANCELLED",
  );
  const controller = new AbortController();
  const pending = fetchResetInventory(
    {
      emit: (_event, p) => {
        request = p;
      },
    },
    "xai",
    controller.signal,
  );
  controller.abort();
  assert.equal((await pending).code, "CANCELLED");
  assert.equal(request.signal.aborted, true);
  request.reply(response());
  assert.equal(
    (await fetchResetInventory(undefined, "xai", new AbortController().signal)).code,
    "CORE_UNAVAILABLE",
  );
  assert.equal(
    (await fetchResetInventory({ emit: () => {} }, "xai", new AbortController().signal, 1)).code,
    "CORE_UNAVAILABLE",
  );
});

test("machine query rejects unavailable accounts and aliases before reading inventory", async () => {
  const ctx = { model: { provider: "xai" }, cwd: "/fixture" };
  let calls = 0;
  const events = {
    emit: (_name, p) => {
      calls++;
      p.reply(response());
    },
  };
  const no = await queryResetInventory(ctx, events, "xai", new AbortController().signal, () => []);
  assert.equal(no.code, "NOT_ALLOWED");
  const alias = await queryResetInventory(
    ctx,
    events,
    "xai-2",
    new AbortController().signal,
    () => [{ provider: "xai-2", unsupportedReason: "unsupported" }],
  );
  assert.equal(alias.code, "UNSUPPORTED_PROVIDER");
  assert.equal(calls, 0);
  const yes = await queryResetInventory(ctx, events, "xai", new AbortController().signal, () => [
    { provider: "xai" },
  ]);
  assert.equal(yes.windows[0].availableCount, 1);
  assert.equal(calls, 1);
});

test("dashboard shows Grok count/expiry, ZCode sign-in, and independent windows without summing", () => {
  const row = {
    account: { provider: "xai", label: "Grok" },
    status: "ready",
    snapshot: {
      provider: "xai",
      fetchedAt: now,
      resetInventory: normalizeResetInventory("xai", response()),
    },
  };
  const cells = overviewCells(row, false, theme, undefined, now, 18);
  assert.equal(cells[3], "↺1");
  assert.match(cells[4], /1d 0h/);
  assert.match(renderTimeline([row], theme, now).join("\n"), /credit expires/);
  row.account.provider = "zai";
  row.snapshot.provider = "zai";
  row.snapshot.resetInventory = {
    provider: "zai",
    checkedAt: now,
    code: "AUTH_REQUIRED",
    error: "Sign in",
  };
  assert.equal(overviewCells(row, false, theme, undefined, now, 18)[3], "login");
  assert.equal(needsAttention(row), true);
  const r = response("zai");
  r.inventory.windows.push({ scope: "five_hour", availableCount: 1, resets: [{ expiresAt }] });
  row.snapshot.resetInventory = normalizeResetInventory("zai", r);
  assert.equal(overviewCells(row, false, theme, undefined, now, 18)[3], "multi");
  assert.equal(
    bankedResetFacts(row, now).count,
    undefined,
    "Never call two window entitlements two distinct cards",
  );
  assert.match(
    resetInventoryLines(row.snapshot.resetInventory).join("\n"),
    /Weekly resets: 1[\s\S]*5-hour resets: 1/,
  );
});

test("machine entrypoint exposes a read-only tool with no spend/login parameters", () => {
  const tools = [],
    events = [];
  resetInventoryExtension({ on: (name) => events.push(name), registerTool: (t) => tools.push(t) });
  assert.equal(tools[0].name, "subscription_resets");
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["provider"]);
  assert.deepEqual(events, ["session_shutdown"]);
  assert.match(tools[0].description, /Does not log in/);
});

test("malformed error members, invalid calendar dates and reversed validity fail closed", () => {
  for (const mutate of [
    (r) => (r.error = "bad"),
    (r) => (r.error = null),
    (r) => (r.error = { code: "AUTH_REQUIRED" }),
    (r) => (r.inventory.windows[0].resets[0].expiresAt = "2027-02-30T12:00:00.000Z"),
    (r) =>
      (r.inventory.windows[0].resets[0].validFrom = new Date(now + 2 * 86400000).toISOString()),
    (r) => (r.checkedAt = -1),
  ]) {
    const r = response();
    mutate(r);
    assert.equal(normalizeResetInventory("xai", r).code, "INVALID_RESPONSE");
  }
});

test("store preserves useful reset inventory and timeline during an independent quota failure", async () => {
  const account = {
    provider: "xai",
    label: "Grok",
    authenticated: true,
    models: [{ provider: "xai", id: "model" }],
  };
  const store = new LimitsDashboardStore(
    [account],
    async () => ({
      provider: "xai",
      fetchedAt: now,
      usageError: "Quota unavailable",
      resetInventory: normalizeResetInventory("xai", response()),
    }),
    () => {},
  );
  store.refresh();
  await store.waitForIdle();
  assert.equal(store.rows[0].status, "ready");
  assert.equal(needsAttention(store.rows[0]), true);
  assert.match(renderTimeline(store.rows, theme, now).join("\n"), /credit expires[\s\S]*Grok/);
  store.dispose();
});

test("tool executes the normalized scoped bus query and shutdown prevents new requests", async () => {
  let tool;
  const handlers = new Map(),
    calls = [];
  createResetInventoryExtension((ctx, events, provider, signal) =>
    queryResetInventory(ctx, events, provider, signal, () => [{ provider: "xai" }]),
  )({
    on: (name, handler) => handlers.set(name, handler),
    registerTool: (value) => (tool = value),
    events: {
      emit: (event, request) => {
        calls.push(event);
        request.reply(response());
      },
    },
  });
  const ctx = { model: { provider: "xai" }, cwd: "/fixture" };
  const result = await tool.execute("id", {}, new AbortController().signal, undefined, ctx);
  assert.deepEqual(calls, [RESET_INVENTORY_EVENT]);
  assert.equal(result.details.windows[0].availableCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /tokenId|must-not-escape/);
  handlers.get("session_shutdown")();
  const closed = await tool.execute("closed", {}, undefined, undefined, ctx);
  assert.equal(closed.details.code, "CANCELLED");
  assert.equal(calls.length, 1);
});
