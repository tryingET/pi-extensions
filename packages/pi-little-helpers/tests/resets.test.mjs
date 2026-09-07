// summary: general reset capability routing, honest unknowns, and confirmation/identity boundaries.
// read_when: changing /resets routing or banked-reset dashboard semantics.
import assert from "node:assert/strict";
import test from "node:test";
import { createCodexResetExtension } from "../extensions/codex-reset.ts";
import { renderAccountDetails } from "../lib/limits-dashboard-render.ts";
import { overviewCells, providerDetailLines } from "../lib/limits-runway.ts";
import { resetCapability, resetGuidance } from "../lib/reset-capabilities.ts";
import { managementOpenCommand, registerSubscriptionResets } from "../lib/reset-command.ts";

const theme = { fg: (_, text) => text, bold: (text) => text };
function harness(provider = "zai") {
  const commands = new Map(),
    events = new Map(),
    calls = [],
    notices = [],
    native = [];
  const config = { labels: new Map() };
  const ctx = {
    model: { provider },
    cwd: "/fixture",
    hasUI: true,
    ui: { notify: (text) => notices.push(text), confirm: async () => true },
  };
  const pi = {
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, handler) => events.set(name, handler),
    exec: async (...args) => {
      calls.push(args);
      return { code: 0 };
    },
  };
  registerSubscriptionResets(
    pi,
    async (action) => native.push(action),
    () => config,
  );
  return {
    commands,
    events,
    calls,
    notices,
    native,
    config,
    ctx,
    run: (args = "") => commands.get("resets").handler(args, ctx),
  };
}

test("capability catalog keeps native, sub-core read-only, and unsupported exact identities distinct", () => {
  for (const provider of ["openai-codex", "openai-codex-2"])
    assert.equal(resetCapability(provider).redemption, "native");
  for (const provider of ["zai", "xai"]) {
    assert.equal(resetCapability(provider).inventory, "sub-core");
    assert.equal(resetCapability(provider).redemption, "unsupported");
    assert.match(resetGuidance(provider).join("\n"), /Unknown.*not zero/);
  }
  for (const provider of ["xai-2", "zai-2", "anthropic", "openai-codex-fake", "__proto__"])
    assert.equal(resetCapability(provider).inventory, "unsupported");
});

test("default is read-only status; non-native use never calls native or browser actions", async () => {
  for (const provider of ["zai", "xai", "xai-2", "anthropic"]) {
    const h = harness(provider);
    await h.run();
    await h.run("status");
    await h.run("use");
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.native, []);
    assert.match(h.notices.at(-1), /no reset request was sent/);
  }
  const h = harness("openai-codex-2");
  await h.run();
  await h.run("use");
  assert.deepEqual(h.native, ["status", "use"]);
});

test("management is explicit, confirmed, static-URL only, and never a redeem action", async () => {
  const h = harness("xai");
  const confirmations = [];
  h.ctx.ui.confirm = async (...args) => {
    confirmations.push(args.join("\n"));
    return true;
  };
  await h.run("manage");
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].slice(0, 2), ["xdg-open", ["https://grok.com"]]);
  assert.match(confirmations[0], /Browser sign-in is not bound/);
  assert.doesNotMatch(confirmations[0], /console\.x\.ai/);
  assert.deepEqual(h.native, []);
  for (const [platform, command] of [
    ["linux", "xdg-open"],
    ["darwin", "open"],
    ["win32", "rundll32.exe"],
  ])
    assert.equal(managementOpenCommand("zai", platform).command, command);
  assert.throws(() => managementOpenCommand("https://evil.invalid"));
});

test("no implicit browser fallback for native, alias, or unsupported providers", async () => {
  for (const provider of ["openai-codex", "openai-codex-2", "xai-2", "zai-2", "anthropic"]) {
    const h = harness(provider);
    await h.run("manage");
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.native, []);
    assert.match(h.notices.at(-1), /No verified external management link/);
  }
});

test("headless manage only prints verified guidance; headless use never opens a browser", async () => {
  const h = harness();
  h.ctx.hasUI = false;
  const log = console.log;
  console.log = (text) => h.notices.push(text);
  try {
    await h.run("manage");
    await h.run("use");
  } finally {
    console.log = log;
  }
  assert.match(h.notices[0], /https:\/\/z.ai\/manage-apikey\/subscription/);
  assert.deepEqual(h.calls, []);
});

test("cancellation, config/provider drift, abort, and shutdown prevent browser dispatch", async () => {
  for (const change of [
    () => false,
    (h) => {
      h.ctx.model = { provider: "xai" };
      return true;
    },
    (h) => {
      h.config.allowed = new Set();
      return true;
    },
    (h) => {
      h.ctx.signal = AbortSignal.abort();
      return true;
    },
    (h) => {
      h.events.get("session_shutdown")();
      return true;
    },
  ]) {
    const h = harness();
    h.ctx.ui.confirm = async () => change(h);
    await h.run("manage");
    assert.deepEqual(h.calls, []);
  }
});

test("restrictions and malformed config fail closed before any action; invalid args do nothing", async () => {
  const h = harness("openai-codex");
  h.config.allowed = new Set();
  await h.run("use");
  assert.deepEqual(h.native, []);
  const other = harness();
  for (const args of ["use zai", "manage https://evil.invalid", "bogus"]) await other.run(args);
  assert.deepEqual(other.calls, []);
  assert.ok(other.notices.every((text) => text.startsWith("Usage:")));
});

test("overlapping management dialogs coalesce; exec failure is safely actionable", async () => {
  const h = harness();
  let finish;
  h.ctx.ui.confirm = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const first = h.run("manage");
  await h.run("manage");
  assert.match(h.notices[0], /already open/);
  finish(true);
  await first;
  assert.equal(h.calls.length, 1);
});

test("general and legacy native commands share the in-flight lock and safe default", async () => {
  const h = harness("openai-codex-2");
  let finish;
  let reads = 0,
    writes = 0;
  h.ctx.ui.setStatus = () => {};
  createCodexResetExtension({
    loadAccountConfig: () => h.config,
    resolveTarget: async () => ({ provider: "openai-codex-2", accountId: "acct-test" }),
    fetchCredits: async () => {
      reads++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    consumeCredit: async () => {
      writes++;
      throw new Error("Unexpected redemption");
    },
  })({
    registerCommand: (name, command) => h.commands.set(name, command),
    on: () => {},
    appendEntry: () => {},
  });
  const first = h.commands.get("resets").handler("", h.ctx);
  await new Promise((resolve) => setImmediate(resolve));
  await h.commands.get("codex-reset").handler("use", h.ctx);
  assert.match(h.notices.at(-1), /already running/);
  finish({ availableCount: 1, credits: [] });
  await first;
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test("dashboard separates native counts, unverified banks, and unsupported adapters", () => {
  const row = (provider) => ({
    account: { provider, label: provider },
    status: "ready",
    snapshot: { provider, fetchedAt: Date.now(), usage: { windows: [] } },
  });
  for (const provider of ["zai", "xai"]) {
    const r = row(provider);
    assert.deepEqual(overviewCells(r, false, theme, undefined, Date.now(), 18).slice(3), [
      "?",
      "unknown",
    ]);
    assert.match(
      providerDetailLines(r.snapshot, theme, Date.now()).join("\n"),
      /BANKED RESETS · read-only inventory/,
    );
    delete r.snapshot;
    assert.match(
      renderAccountDetails(r, theme, false, Date.now()).join("\n"),
      /BANKED RESETS · read-only inventory/,
    );
  }
  assert.deepEqual(
    overviewCells(row("anthropic"), false, theme, undefined, Date.now(), 18).slice(3),
    ["n/s", "n/s"],
  );
  for (const count of [0, 2]) {
    const r = row("openai-codex");
    r.snapshot.credits = { availableCount: count, credits: [] };
    assert.equal(overviewCells(r, false, theme, undefined, Date.now(), 18)[3], `↺${count}`);
  }
});

test("error-only snapshots are failed checks, not old quota data", () => {
  const r = {
    account: { provider: "xai", label: "Grok" },
    status: "error",
    snapshot: { provider: "xai", fetchedAt: Date.now(), usageError: "Unavailable" },
  };
  const cells = overviewCells(r, false, theme, undefined, Date.now(), 18);
  assert.match(cells[0], /! Grok/);
  assert.doesNotMatch(cells[0], /old/);
});

test("an unresolved native reset blocks a new spend through another alias of the same account", async () => {
  const h = harness("openai-codex");
  const entries = [],
    handlers = new Map(),
    requests = [];
  let next = 0;
  h.ctx.ui.setStatus = () => {};
  let confirms = [true, false];
  h.ctx.ui.confirm = async () => confirms.shift() ?? true;
  h.ctx.sessionManager = { getEntries: () => entries };
  createCodexResetExtension({
    loadAccountConfig: () => h.config,
    resolveTarget: async (ctx) => ({ provider: ctx.model.provider, accountId: "same-account" }),
    fetchCredits: async () => ({ availableCount: 3, credits: [] }),
    requirePersisted: () => {},
    createRequestId: () => `request-${++next}`,
    consumeCredit: async (_ctx, requestId) => {
      requests.push(requestId);
      throw new Error("Lost response");
    },
  })({
    registerCommand: (name, command) => h.commands.set(name, command),
    on: (name, handler) => handlers.set(name, handler),
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  });
  await h.commands.get("resets").handler("use", h.ctx);
  assert.deepEqual(requests, ["request-1"]);
  h.ctx.model = { provider: "openai-codex-2" };
  for (const restored of [false, true]) {
    if (restored) handlers.get("session_start")({}, h.ctx);
    await h.commands.get("codex-reset").handler("use", h.ctx);
    assert.deepEqual(requests, ["request-1"]);
    assert.equal(next, 1);
    assert.match(h.notices.at(-1), /unresolved reset under openai-codex/);
  }
  h.ctx.model = { provider: "openai-codex" };
  confirms = [true, false];
  await h.commands.get("resets").handler("use", h.ctx);
  assert.deepEqual(requests, ["request-1", "request-1"]);
});

test("malformed policy and failed browser execution return static errors without native effects", async () => {
  const commands = new Map(),
    calls = [],
    notices = [];
  const ctx = {
    model: { provider: "zai" },
    cwd: "/fixture",
    hasUI: true,
    ui: { notify: (text) => notices.push(text), confirm: async () => true },
  };
  const pi = {
    on: () => {},
    registerCommand: (name, command) => commands.set(name, command),
    exec: async () => {
      calls.push("open");
      return { code: 1, stderr: "SECRET" };
    },
  };
  registerSubscriptionResets(
    pi,
    async () => assert.fail("native call"),
    () => {
      throw new Error("SECRET");
    },
  );
  await commands.get("resets").handler("manage", ctx);
  assert.deepEqual(calls, []);
  assert.doesNotMatch(notices.at(-1), /SECRET/);
  registerSubscriptionResets(
    pi,
    async () => assert.fail("native call"),
    () => ({ labels: new Map() }),
  );
  await commands.get("resets").handler("manage", ctx);
  assert.deepEqual(calls, ["open"]);
  assert.match(notices.at(-1), /Could not open the browser/);
  assert.doesNotMatch(notices.at(-1), /SECRET/);
});
