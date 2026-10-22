// summary: pre-refactor characterization of provider decoration, output, concurrency and failures.
// read_when: changing the provider-keyed /limits snapshot enrichment table.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { createLimitsExtension } from "../extensions/limits.ts";

const now = Date.parse("2026-10-17T12:00:00Z");
const providers = [
  "anthropic",
  "github-copilot",
  "zai",
  "xai",
  "opencode-go",
  "openrouter",
  "meta",
  "openai-codex",
  "openai-codex-2",
];
const tick = () => new Promise((resolve) => setImmediate(resolve));
const theme = { fg: (_c, text) => text, bg: (_c, text) => text, bold: (text) => text };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const account = (provider) => ({
  provider,
  label: provider,
  authenticated: true,
  models: [{ provider, id: "test-model" }],
});
const snapshot = (provider) => ({
  provider,
  fetchedAt: now,
  usage: { windows: [{ label: "Week", remainingPercent: 70, resetAt: "2026-10-18T12:00:00Z" }] },
  credits: { availableCount: 0, credits: [] },
  facts: ["Provider fact"],
  notes: ["Provider note"],
});
const resets = (provider) => ({
  provider,
  checkedAt: now,
  windows: [
    { scope: "weekly", availableCount: 1, resets: [{ expiresAt: "2026-10-20T12:00:00Z" }] },
  ],
});
function harness(options = {}, selected = providers) {
  let command;
  const events = {},
    handlers = new Map(),
    calls = [];
  const sources = new Map(
    selected.map((provider) => [provider, Object.freeze(snapshot(provider))]),
  );
  const pi = {
    events,
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (_name, value) => {
      command = value;
    },
  };
  createLimitsExtension({
    accounts: () => selected.map(account),
    fetchProvider: async (bus, provider, signal) => {
      assert.equal(bus, events);
      calls.push({ kind: "usage", provider, signal });
      return sources.get(provider);
    },
    fetchResets: async (bus, provider, signal) => {
      assert.equal(bus, events);
      calls.push({ kind: "resets", provider, signal });
      return resets(provider);
    },
    fetchSnapshot: async (ctx) => {
      calls.push({ kind: "codex", provider: ctx.model.provider, signal: ctx.signal });
      return sources.get(ctx.model.provider);
    },
    metaFacts: () => {
      calls.push({ kind: "meta" });
      return ["Local ledger fact"];
    },
    recordMeta: () => assert.fail("reading limits must not write the ledger"),
    ...options,
  })(pi);
  return { command, handlers, calls, sources };
}
async function headless(h, action = "", provider = "meta", signal) {
  const logs = [],
    original = console.log;
  try {
    console.log = (text) => logs.push(text);
    await h.command.handler(action, {
      model: account(provider).models[0],
      modelRegistry: {},
      hasUI: false,
      mode: "print",
      signal,
    });
  } finally {
    console.log = original;
  }
  return logs;
}
async function dashboard(h, inspect) {
  let view, finish;
  const pending = h.command.handler("", {
    model: account("meta").models[0],
    modelRegistry: {},
    hasUI: true,
    mode: "tui",
    ui: {
      notify: () => assert.fail("unexpected notification"),
      setStatus() {},
      custom: (factory) =>
        new Promise((resolve) => {
          finish = resolve;
          view = factory(
            { requestRender() {}, terminal: { rows: 48 } },
            theme,
            new KeybindingsManager(TUI_KEYBINDINGS),
            resolve,
          );
        }),
    },
  });
  try {
    await tick();
    await view.store.waitForIdle();
    return await inspect(view);
  } finally {
    view?.dispose();
    finish?.();
    await pending;
  }
}

test("all seven provider families and Codex retain snapshots and headless/TUI rendering", async (t) => {
  // Output hashes captured from 58b4e0fce before extraction, with the same fixed clock.
  t.mock.method(Date, "now", () => now);
  const h = harness();
  const logs = await headless(h);
  assert.equal(digest(logs), "8088aa65ab2202ec84feb401761ca64a77055cb7d0ba85c2be9fd4435e48cca9");
  assert.deepEqual(
    h.calls
      .filter((c) => c.kind === "resets")
      .map((c) => c.provider)
      .sort(),
    ["xai", "zai"],
  );
  assert.equal(h.calls.filter((c) => c.kind === "meta").length, 1);
  for (const call of h.calls.filter((c) => c.kind === "resets")) {
    assert.equal(
      call.signal,
      h.calls.find((c) => c.kind === "usage" && c.provider === call.provider).signal,
    );
  }
  const rendered = await dashboard(harness(), (view) => {
    for (const row of view.store.rows) {
      const expected = snapshot(row.account.provider);
      if (["xai", "zai"].includes(expected.provider))
        expected.resetInventory = resets(expected.provider);
      if (expected.provider === "meta") expected.facts.push("Local ledger fact");
      assert.deepEqual(row.snapshot, expected);
    }
    const frames = [];
    for (const width of [40, 100, 160]) {
      frames.push(view.render(width));
      view.handleInput("g");
      const visited = [];
      for (let index = 0; index < providers.length; index++) {
        visited.push(view.selected().account.provider);
        view.handleInput("\r");
        frames.push(view.render(width));
        view.handleInput("\u001b");
        view.handleInput("j");
      }
      assert.deepEqual(visited.sort(), [...providers].sort());
      view.handleInput("t");
      frames.push(view.render(width));
      view.handleInput("t");
    }
    return frames;
  });
  assert.equal(
    digest(rendered),
    "1370058bd23461dcacd39dafd3281595616a52b91f96f5c09d10a3a9fe54ed3f",
  );
  for (const source of h.sources.values()) assert.deepEqual(source, snapshot(source.provider));
});

for (const provider of ["xai", "zai"]) {
  test(`${provider} starts usage and reset inventory in parallel and waits for both`, async () => {
    let finishUsage, finishResets;
    const calls = [];
    const h = harness(
      {
        fetchProvider: (_events, identity, signal) => {
          calls.push({ identity, signal });
          return new Promise((resolve) => {
            finishUsage = resolve;
          });
        },
        fetchResets: (_events, identity, signal) => {
          calls.push({ identity, signal });
          return new Promise((resolve) => {
            finishResets = resolve;
          });
        },
      },
      [provider],
    );
    let done = false;
    const pending = headless(h, "current", provider).then((logs) => {
      done = true;
      return logs;
    });
    await tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].signal, calls[1].signal);
    assert.ok(calls.every((call) => call.identity === provider));
    finishUsage(snapshot(provider));
    await tick();
    assert.equal(done, false);
    finishResets(resets(provider));
    assert.match((await pending)[0], /Weekly resets: 1/);
  });

  test(`${provider} retains partial reset errors and propagates rejected decoration`, async () => {
    const h = harness(
      { fetchResets: async () => ({ provider, checkedAt: now, error: "Reset unavailable" }) },
      [provider],
    );
    assert.match((await headless(h, "current", provider))[0], /Reset unavailable/);
    const rejected = harness(
      {
        fetchResets: async () => {
          throw new Error("reset failed");
        },
      },
      [provider],
    );
    assert.deepEqual(await headless(rejected, "current", provider), [
      "Unable to read limits for the selected subscription. Check /login and try again.",
    ]);
  });
}

test("Meta ledger facts are read only after successful usage and never mutate source facts", async () => {
  let resolveUsage,
    reads = 0;
  const source = Object.freeze({ ...snapshot("meta"), facts: Object.freeze(["Existing fact"]) });
  const h = harness(
    {
      fetchProvider: () =>
        new Promise((resolve) => {
          resolveUsage = resolve;
        }),
      metaFacts: () => {
        reads++;
        return ["Ledger fact"];
      },
    },
    ["meta"],
  );
  const pending = headless(h, "current");
  await tick();
  assert.equal(reads, 0);
  resolveUsage(source);
  assert.match((await pending)[0], /Existing fact[\s\S]*Ledger fact/);
  assert.equal(reads, 1);
  assert.deepEqual(source.facts, ["Existing fact"]);
  const rejected = harness(
    {
      fetchProvider: async () => {
        throw new Error("usage failed");
      },
      metaFacts: () => {
        reads++;
        return ["Unexpected ledger read"];
      },
    },
    ["meta"],
  );
  await headless(rejected, "current");
  assert.equal(reads, 1, "failed usage must not read ledger");
});

test("already aborted reads do not fetch or enrich", async () => {
  const h = harness();
  await headless(h, "current", "xai", AbortSignal.abort());
  assert.deepEqual(h.calls, []);
});

test("unlisted providers use the undecorated fallback, including inherited object names", async () => {
  for (const provider of ["future-provider", "constructor", "toString"]) {
    const h = harness({}, [provider]);
    await dashboard(h, (view) => {
      assert.deepEqual(view.store.rows[0].snapshot, snapshot(provider));
      assert.notEqual(view.store.rows[0].snapshot, h.sources.get(provider));
    });
    assert.deepEqual(
      h.calls.map((call) => call.kind),
      ["usage"],
    );
  }
});
