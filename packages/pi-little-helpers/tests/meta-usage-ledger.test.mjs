// summary: local Muse usage ledger accumulation, run-out cycles, and /limits facts wiring.
// read_when: changing Meta ledger accounting, run-out detection, or meta facts display.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLimitsExtension } from "../extensions/limits.ts";
import metaUsageLedgerExtension, {
  createMetaUsageLedgerExtension,
} from "../extensions/meta-usage-ledger.ts";
import {
  metaUsageFacts,
  readMetaUsageSummary,
  recordMetaAssistantMessage,
  summarizeMetaEntries,
} from "../lib/meta-usage-ledger.ts";

const dir = () => mkdtempSync(join(tmpdir(), "meta-ledger-"));
const message = (over = {}) => ({
  role: "assistant",
  provider: "meta",
  model: "muse-spark-1.3",
  stopReason: "stop",
  timestamp: Date.parse("2026-10-16T10:00:00Z"),
  usage: {
    input: 1000,
    output: 200,
    cacheRead: 500,
    cacheWrite: 0,
    reasoning: 50,
    totalTokens: 1700,
    cost: { total: 0.01 },
  },
  ...over,
});

test("records only meta assistant usage and aggregates totals per model", () => {
  const path = join(dir(), "ledger.jsonl");
  assert.equal(recordMetaAssistantMessage(message(), path), true);
  assert.equal(
    recordMetaAssistantMessage(
      message({
        model: "muse-spark-1.3-contributor",
        usage: { input: 10, output: 5, totalTokens: 15, cost: { total: 0.001 } },
      }),
      path,
    ),
    true,
  );
  assert.equal(recordMetaAssistantMessage(message({ provider: "anthropic" }), path), false);
  assert.equal(recordMetaAssistantMessage(message({ role: "user" }), path), false);
  assert.equal(recordMetaAssistantMessage(message({ provider: "meta-2" }), path), false);

  const summary = readMetaUsageSummary(path);
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.input, 1010);
  assert.equal(summary.totals.cacheRead, 500);
  assert.equal(summary.totals.totalTokens, 1715);
  assert.ok(Math.abs(summary.totals.costUsd - 0.011) < 1e-9);
  assert.equal(summary.perModel[0].model, "muse-spark-1.3");
  assert.equal(summary.runOuts, 0);
  const facts = metaUsageFacts(summary).join("\n");
  assert.match(facts, /since 2026-10-16/);
  assert.match(facts, /2 requests/);
  assert.match(facts, /API-equivalent/);
  assert.match(facts, /muse-spark-1\.3-contributor/);
});

test("facts keep a single sub-cent request readable", () => {
  const path = join(dir(), "ledger.jsonl");
  recordMetaAssistantMessage(
    message({ usage: { input: 100, output: 5, totalTokens: 105, cost: { total: 0.0029 } } }),
    path,
  );
  const facts = metaUsageFacts(readMetaUsageSummary(path)).join("\n");
  assert.match(facts, /1 request ·/);
  assert.match(facts, /\$0\.0029/);
});

test("zero-usage and malformed state never manufacture spend", () => {
  const path = join(dir(), "ledger.jsonl");
  assert.equal(
    recordMetaAssistantMessage(
      message({ usage: { input: 0, output: 0, totalTokens: 0, cost: { total: 0 } } }),
      path,
    ),
    false,
  );
  writeFileSync(path, 'not json\n{"v":2}\n{"v":1,"kind":"usage","ts":"x"}\n');
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.totals.requests, 0);
  assert.match(metaUsageFacts(summary)[0], /none recorded yet/);
  assert.match(metaUsageFacts(readMetaUsageSummary(join(dir(), "missing.jsonl")))[0], /none/);
});

test("subscription exhaustion stamps run-out cycles without storing raw error text", () => {
  const path = join(dir(), "ledger.jsonl");
  const spend = (ts, tokens, cost) =>
    recordMetaAssistantMessage(
      message({
        timestamp: ts,
        usage: { input: tokens, output: 0, totalTokens: tokens, cost: { total: cost } },
      }),
      path,
    );
  spend(Date.parse("2026-10-16T10:00:00Z"), 1000, 1);
  // A non-quota error records no marker and leaks no provider text into the file.
  assert.equal(
    recordMetaAssistantMessage(
      message({
        stopReason: "error",
        errorMessage: "SECRET upstream detail",
        usage: { totalTokens: 0, cost: { total: 0 } },
      }),
      path,
    ),
    false,
  );
  spend(Date.parse("2026-10-17T10:00:00Z"), 2000, 2);
  assert.equal(
    recordMetaAssistantMessage(
      message({
        stopReason: "error",
        errorMessage:
          'meta API error (429): {"code":"rate_limit_exceeded","type":"rate_limit_error","message":"Subscription quota exhausted.","resets_at":1792368000}',
        timestamp: Date.parse("2026-10-18T10:00:00Z"),
        usage: { totalTokens: 0, cost: { total: 0 } },
      }),
      path,
    ),
    true,
  );
  spend(Date.parse("2026-10-19T10:00:00Z"), 500, 0.5);

  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 1);
  assert.equal(summary.lastRunOut.cycle.totalTokens, 3000);
  assert.equal(summary.lastRunOut.cycle.costUsd, 3);
  assert.equal(summary.lastRunOut.since.totalTokens, 500);
  const facts = metaUsageFacts(summary).join("\n");
  assert.match(facts, /Ran out 2026-10-18: that cycle used 3\.0K tokens · ≈ \$3\.00/);
  assert.match(facts, /Since then: 500 tokens/);
  assert.doesNotMatch(readFileSync(path, "utf8"), /SECRET|429|quota/);
});

test("ledger extension records finalized messages with only a message_end hook", () => {
  const seen = [];
  const handlers = new Map();
  createMetaUsageLedgerExtension((value) => seen.push(value))({
    on: (name, handler) => handlers.set(name, handler),
  });
  assert.deepEqual([...handlers.keys()], ["message_end"]);
  const finalized = message();
  assert.equal(handlers.get("message_end")({ type: "message_end", message: finalized }), undefined);
  assert.deepEqual(seen, [finalized]);

  const defaults = new Map();
  metaUsageLedgerExtension({ on: (name, handler) => defaults.set(name, handler) });
  assert.deepEqual([...defaults.keys()], ["message_end"]);
});

test("ledger write failures never escape the message_end hook", (t) => {
  const root = dir();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blocked = join(root, "not-a-directory");
  writeFileSync(blocked, "blocked");
  const handlers = new Map();
  createMetaUsageLedgerExtension((value) =>
    recordMetaAssistantMessage(value, join(blocked, "ledger.jsonl")),
  )({ on: (name, handler) => handlers.set(name, handler) });
  assert.doesNotThrow(() =>
    handlers.get("message_end")({ type: "message_end", message: message() }),
  );
});

test("limits has no recording hook; loading both extensions writes exactly once", (t) => {
  const root = dir();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "ledger.jsonl");
  const handlers = [];
  let command;
  const pi = {
    on: (name, handler) => handlers.push({ name, handler }),
    registerCommand: (name, value) => {
      assert.equal(name, "limits");
      command = value;
    },
  };
  createLimitsExtension()(pi);
  assert.ok(command);
  assert.equal(
    handlers.some(({ name }) => name === "message_end"),
    false,
  );
  createMetaUsageLedgerExtension((value) => recordMetaAssistantMessage(value, path))(pi);
  const messageHandlers = handlers.filter(({ name }) => name === "message_end");
  assert.equal(messageHandlers.length, 1);
  for (const { handler } of messageHandlers) {
    handler({ type: "message_end", message: message() });
    handler({ type: "message_end", message: message({ provider: "anthropic" }) });
    handler({ type: "message_end", message: message({ role: "user" }) });
    handler({ type: "message_end", message: message({ usage: { totalTokens: 0 } }) });
    handler({
      type: "message_end",
      message: message({ stopReason: "error", errorMessage: "quota exceeded", usage: null }),
    });
  }
  const entries = readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    entries.map(({ v, kind }) => ({ v, kind })),
    [
      { v: 1, kind: "usage" },
      { v: 1, kind: "run-out" },
    ],
  );
  assert.equal(readMetaUsageSummary(path).totals.requests, 1);
});

test("ledger extension is manifest-registered and included in the package", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const entry = "./extensions/meta-usage-ledger.ts";
  assert.equal(manifest.pi.extensions.filter((path) => path === entry).length, 1);
  assert.ok(manifest.files.includes(entry.slice(2)));
  assert.equal(manifest.exports[entry], entry);
});

test("headless /limits merges local ledger facts into the Meta detail only", async () => {
  let command;
  const account = {
    provider: "meta",
    label: "Meta Muse",
    authenticated: true,
    models: [{ provider: "meta", id: "muse-spark-1.3" }],
  };
  createLimitsExtension({
    accounts: () => [account],
    fetchProvider: async (_events, provider) => ({
      provider,
      fetchedAt: Date.now(),
      source: "sub-core",
      usage: { windows: [] },
      notes: [],
    }),
    metaFacts: () => ["LEDGER FACT LINE"],
  })({
    on() {},
    registerCommand: (_name, value) => {
      command = value;
    },
  });
  const logs = [];
  const original = console.log;
  try {
    console.log = (line) => logs.push(line);
    await command.handler("", {
      model: { provider: "anthropic", id: "claude-test" },
      modelRegistry: {},
      hasUI: false,
      mode: "print",
    });
  } finally {
    console.log = original;
  }
  assert.match(logs[0], /Limits — meta/);
  assert.match(logs[0], /LEDGER FACT LINE/);
});

test("ledger lines are versioned usage entries carrying no message content", () => {
  const path = join(dir(), "meta-usage-ledger.jsonl");
  recordMetaAssistantMessage(message(), path);
  const [line] = readFileSync(path, "utf8").trim().split("\n");
  const entry = JSON.parse(line);
  assert.equal(entry.v, 1);
  assert.equal(entry.kind, "usage");
  assert.equal(entry.model, "muse-spark-1.3");
  assert.equal(entry.totals.requests, 1);
  rmSync(path, { force: true });
});

const usageEntry = (ts, tokens, cost = 0, model = "muse-spark-1.3") => ({
  ts,
  kind: "usage",
  model,
  totals: {
    requests: 1,
    input: tokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: tokens,
    costUsd: cost,
  },
});
const runOutEntry = (ts) => ({ ts, kind: "run-out", model: "muse-spark-1.3" });

test("summarizeMetaEntries: empty input is an explicit empty summary", () => {
  const summary = summarizeMetaEntries([]);
  assert.equal(summary.totals.requests, 0);
  assert.equal(summary.firstTs, undefined);
  assert.equal(summary.runOuts, 0);
  assert.equal(summary.lastRunOut, undefined);
  assert.match(metaUsageFacts(summary)[0], /none recorded yet/);
});

test("summarizeMetaEntries: each run-out closes its cycle and the next starts empty", () => {
  const summary = summarizeMetaEntries([
    usageEntry(10, 100, 1),
    runOutEntry(20),
    usageEntry(30, 40, 0.4),
    usageEntry(40, 60, 0.6),
    runOutEntry(50),
    usageEntry(60, 7, 0.07),
  ]);
  assert.equal(summary.runOuts, 2);
  assert.equal(summary.totals.totalTokens, 207);
  // The reported cycle belongs to the LAST run-out, not the first.
  assert.equal(summary.lastRunOut.ts, 50);
  assert.equal(summary.lastRunOut.cycle.totalTokens, 100);
  assert.equal(summary.lastRunOut.cycle.costUsd, 1);
  assert.equal(summary.lastRunOut.since.totalTokens, 7);
  assert.equal(summary.perModel.length, 1);
});

test("summarizeMetaEntries: first/last timestamps are bounds, cycle math follows entry order", () => {
  const summary = summarizeMetaEntries([usageEntry(300, 3), runOutEntry(200), usageEntry(100, 1)]);
  assert.equal(summary.firstTs, 100);
  assert.equal(summary.lastTs, 300);
  // Entries are consumed in the given (append) order even when timestamps
  // are out of order: the marker closes the 3-token cycle, then 1 accrues.
  assert.equal(summary.lastRunOut.cycle.totalTokens, 3);
  assert.equal(summary.lastRunOut.since.totalTokens, 1);
});
