// summary: AK7405 observed Meta subscription exhaustion, reset metadata, and retry grouping.
// read_when: changing Muse quota detection or reset-window accounting.
import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  metaUsageFacts,
  readMetaUsageSummary,
  recordMetaAssistantMessage,
  recordMetaRunOutReset,
} from "../lib/meta-usage-ledger.ts";

// Real message timestamps and provider payloads pinned in AK evidence 16643.
const observed = [
  [1792209688614, 1792224644, "2026-10-17T08:10:44Z"],
  [1792220110523, 1792224644, "2026-10-17T08:10:44Z"],
  [1792234922036, 1792251957, "2026-10-17T15:45:57Z"],
  [1792270075919, 1792368000, "2026-10-19T00:00:00Z"],
  [1792330657886, 1792368000, "2026-10-19T00:00:00Z"],
];
const payload = (reset = observed[0][1], iso = observed[0][2]) => ({
  code: "rate_limit_exceeded",
  message: `Subscription quota exhausted. Your usage window resets at ${iso}.`,
  param: null,
  resets_at: reset,
  type: "rate_limit_error",
});
const errorText = (body = payload()) => `meta API error (429): ${JSON.stringify(body)}`;
const legacy = (ts) => ({ v: 1, ts, kind: "run-out", model: "muse-wonder-1.0" });
const correction = (ts, resetsAt) => ({ ...legacy(ts), kind: "run-out-reset", resetsAt });

test("source-bound corrections group legacy windows without changing any original bytes or totals", (t) => {
  const path = fixture(t);
  usage(path, observed[0][0] - 1, 100);
  const originalUsage = readFileSync(path, "utf8");
  writeFileSync(
    path,
    `${originalUsage + observed.map(([ts]) => JSON.stringify(legacy(ts))).join("\n")}\n`,
  );
  const before = readFileSync(path, "utf8");
  const beforeSummary = readMetaUsageSummary(path);
  assert.equal(beforeSummary.unresolvedRunOuts, 5);
  assert.match(metaUsageFacts(beforeSummary).join("\n"), /cycle boundaries are uncertain/);
  for (const [ts, reset, iso] of observed) {
    const source = failure(ts, errorText(payload(reset, iso)));
    assert.equal(recordMetaRunOutReset(source, path), true);
    assert.equal(recordMetaRunOutReset(source, path), false);
  }
  const after = readFileSync(path, "utf8");
  assert.ok(after.startsWith(before));
  assert.equal(after.slice(before.length).trim().split("\n").length, 5);
  const summary = readMetaUsageSummary(path);
  assert.deepEqual(summary.totals, beforeSummary.totals);
  assert.equal(summary.runOuts, 3);
  assert.equal(summary.unresolvedRunOuts, 0);
  assert.equal(summary.lastRunOut.ts, observed[3][0]);
  assert.equal(summary.lastRunOut.resetsAt, observed[3][1] * 1000);
  assert.doesNotMatch(metaUsageFacts(summary).join("\n"), /cycle boundaries are uncertain/);
  assert.doesNotMatch(after, /Subscription|errorMessage|rate_limit/);
});

test("correction writer refuses unmatched, conflicting or malformed source/ledger data", (t) => {
  const path = fixture(t);
  const ts = observed[0][0];
  const original = `${JSON.stringify(legacy(ts))}\n`;
  writeFileSync(path, original);
  for (const source of [
    failure(ts + 1),
    failure(ts, errorText(), { provider: "meta-2" }),
    failure(ts, errorText(), { model: "other" }),
    failure(ts, "429 Too many requests"),
    failure(ts, errorText({ ...payload(), resets_at: undefined })),
    failure(undefined),
  ]) {
    assert.throws(() => recordMetaRunOutReset(source, path));
    assert.equal(readFileSync(path, "utf8"), original);
  }
  assert.equal(recordMetaRunOutReset(failure(ts), path), true);
  const once = readFileSync(path, "utf8");
  assert.throws(
    () => recordMetaRunOutReset(failure(ts, errorText(payload(observed[2][1]))), path),
    /conflict/,
  );
  assert.equal(readFileSync(path, "utf8"), once);
  writeFileSync(path, original.trim());
  assert.throws(() => recordMetaRunOutReset(failure(ts), path), /complete/);
  writeFileSync(path, `${original}not-json\n`);
  assert.throws(() => recordMetaRunOutReset(failure(ts), path), /malformed/);
});

test("conflicting, duplicate and orphan corrections cannot create spend or run-outs", (t) => {
  const path = fixture(t);
  const ts = observed[0][0];
  const reset = observed[0][1] * 1000;
  const rows = [
    legacy(ts),
    correction(ts, reset),
    correction(ts, reset),
    correction(ts, reset + 1000),
    correction(ts + 1, reset),
  ];
  writeFileSync(path, `${rows.map(JSON.stringify).join("\n")}\n`);
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 1);
  assert.equal(summary.unresolvedRunOuts, 1);
  assert.equal(summary.lastRunOut.resetsAt, undefined);
  assert.equal(summary.totals.requests, 0);
  assert.equal(summary.lastTs, ts);
  // Existing stamped markers are not overwritten by retrospective metadata.
  writeFileSync(
    path,
    `${[{ ...legacy(ts), resetsAt: reset }, correction(ts, reset + 1000)]
      .map(JSON.stringify)
      .join("\n")}\n`,
  );
  assert.equal(readMetaUsageSummary(path).lastRunOut.resetsAt, reset);
  assert.throws(() => recordMetaRunOutReset(failure(ts), path), /conflict/);
});

test("non-string ledger kinds never manufacture usage and block maintenance", (t) => {
  const path = fixture(t);
  const ts = observed[0][0];
  for (const kind of [["usage"], ["run-out"], ["run-out-reset"], null, 1, {}]) {
    const text = `${JSON.stringify(legacy(ts))}\n${JSON.stringify({ ...correction(ts, observed[0][1] * 1000), kind, totals: { totalTokens: 99, costUsd: 2 } })}\n`;
    writeFileSync(path, text);
    const summary = readMetaUsageSummary(path);
    assert.equal(summary.totals.requests, 0);
    assert.equal(summary.totals.totalTokens, 0);
    assert.equal(summary.runOuts, 1);
    assert.throws(() => recordMetaRunOutReset(failure(ts), path), /malformed/);
    assert.equal(readFileSync(path, "utf8"), text);
  }
});

test("usage appended between correction read and append is preserved", (t) => {
  const path = fixture(t);
  const ts = observed[0][0];
  const original = `${JSON.stringify(legacy(ts))}\n`;
  writeFileSync(path, original);
  const read = fs.readFileSync;
  let intervened = false;
  // Deterministically interleave a real producer append after the read snapshot.
  // No write mocks: both producers use their real O_APPEND path.
  fs.readFileSync = (...args) => {
    const snapshot = read(...args);
    fs.readFileSync = read;
    syncBuiltinESMExports();
    assert.equal(args[0], path);
    usage(path, ts + 1, 7);
    intervened = true;
    return snapshot;
  };
  syncBuiltinESMExports();
  try {
    assert.equal(recordMetaRunOutReset(failure(ts), path), true);
  } finally {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  }
  assert.equal(intervened, true);
  const lines = readFileSync(path, "utf8");
  assert.ok(lines.startsWith(original));
  assert.deepEqual(
    lines
      .trim()
      .split("\n")
      .map(JSON.parse)
      .map((entry) => entry.kind),
    ["run-out", "usage", "run-out-reset"],
  );
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.totals.requests, 1);
  assert.equal(summary.totals.totalTokens, 7);
  assert.equal(summary.runOuts, 1);
  assert.equal(summary.lastRunOut.since.totalTokens, 7);
});

const failure = (timestamp, errorMessage = errorText(), extra = {}) => ({
  role: "assistant",
  provider: "meta",
  model: "muse-wonder-1.0",
  stopReason: "error",
  timestamp,
  errorMessage,
  ...extra,
});
const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "meta-quota-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, "ledger.jsonl");
};
const usage = (path, timestamp, tokens) =>
  recordMetaAssistantMessage(
    failure(timestamp, undefined, {
      stopReason: "stop",
      usage: { input: tokens, totalTokens: tokens, cost: { total: tokens / 1000 } },
    }),
    path,
  );

test("five observed failures retain reset metadata but close only three windows", (t) => {
  const path = fixture(t);
  usage(path, observed[0][0] - 1, 100);
  for (const [i, [ts, reset, iso]] of observed.entries()) {
    if (i === 2) usage(path, ts - 1, 200);
    if (i === 3) usage(path, ts - 1, 300);
    assert.equal(
      recordMetaAssistantMessage(failure(ts, errorText(payload(reset, iso))), path),
      true,
    );
  }
  usage(path, observed[4][0] + 1, 7);
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 3);
  assert.equal(summary.totals.requests, 4);
  assert.equal(summary.totals.totalTokens, 607);
  assert.equal(summary.lastRunOut.ts, observed[3][0]);
  assert.equal(summary.lastRunOut.resetsAt, 1792368000000);
  assert.equal(summary.lastRunOut.cycle.totalTokens, 300);
  assert.equal(summary.lastRunOut.since.totalTokens, 7);
  const lines = readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
  const markers = lines.filter((line) => line.kind === "run-out");
  assert.equal(markers.length, 5); // Append-only facts; grouping happens on read, also after restart.
  assert.deepEqual(markers[0], {
    v: 1,
    ts: observed[0][0],
    kind: "run-out",
    model: "muse-wonder-1.0",
    resetsAt: 1792224644000,
  });
  assert.doesNotMatch(readFileSync(path, "utf8"), /Subscription|errorMessage|rate_limit/);
  assert.match(
    metaUsageFacts(summary).join("\n"),
    /Provider-reported reset: 2026-10-19T00:00:00\.000Z \(not a live availability check\)/,
  );
});

test("ordinary 429s and other errors do not manufacture subscription exhaustion", (t) => {
  const path = fixture(t);
  const errors = [
    "429 Too many requests",
    "rate limit",
    "quota",
    "insufficient balance",
    "HTTP 429: quota exceeded for this subscription",
    errorText({ ...payload(), message: "Request rate exceeded. Try again later." }),
    errorText({ ...payload(), code: "other_error" }),
    errorText({ ...payload(), type: "other_error" }),
    errorText({ ...payload(), message: "Not Subscription quota exhausted." }),
    errorText().replace("(429)", "(500)"),
    "meta API error (429): {broken json",
    "Subscription quota exhausted.",
  ];
  for (const error of errors) {
    assert.equal(recordMetaAssistantMessage(failure(observed[0][0], error), path), false, error);
  }
  for (const extra of [{ provider: "meta-2" }, { role: "user" }, { stopReason: "stop" }]) {
    assert.equal(
      recordMetaAssistantMessage(failure(observed[0][0], errorText(), extra), path),
      false,
    );
  }
  // Non-quota failures can still carry real spend.
  recordMetaAssistantMessage(
    failure(observed[0][0], errors[0], { usage: { totalTokens: 3 } }),
    path,
  );
  assert.equal(readMetaUsageSummary(path).runOuts, 0);
  assert.equal(readMetaUsageSummary(path).totals.totalTokens, 3);
});

test("invalid reset fields never crash rendering or manufacture a reset date", (t) => {
  const path = fixture(t);
  for (const resets_at of [undefined, null, "1792224644", -1, 0, 1.5, 1e30]) {
    assert.equal(
      recordMetaAssistantMessage(
        failure(observed[0][0], errorText({ ...payload(), resets_at })),
        path,
      ),
      true,
    );
    const summary = readMetaUsageSummary(path);
    assert.equal(summary.lastRunOut.resetsAt, undefined);
    assert.doesNotMatch(metaUsageFacts(summary).join("\n"), /Provider-reported reset/);
    const last = JSON.parse(readFileSync(path, "utf8").trim().split("\n").at(-1));
    assert.equal(last.resetsAt, undefined);
  }
  // Explicitly missing field (the helper default otherwise supplies a timestamp).
  const { resets_at: _reset, ...missing } = payload();
  recordMetaAssistantMessage(failure(observed[0][0], errorText(missing)), path);
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.lastRunOut.resetsAt, undefined);
  assert.doesNotMatch(metaUsageFacts(summary).join("\n"), /Provider-reported reset/);
  assert.match(metaUsageFacts(summary).join("\n"), /Ran out/); // zero successful requests still show failure
});

test("duplicate windows do not discard intervening usage or replace newer windows", (t) => {
  const path = fixture(t);
  usage(path, 1, 100);
  recordMetaAssistantMessage(failure(2), path);
  usage(path, 3, 50);
  recordMetaAssistantMessage(failure(4), path);
  const next = errorText(payload(observed[2][1], observed[2][2]));
  recordMetaAssistantMessage(failure(5, next), path);
  usage(path, 6, 7);
  recordMetaAssistantMessage(failure(7), path); // delayed retry for the first window
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 2);
  assert.equal(summary.lastRunOut.ts, 5);
  assert.equal(summary.lastRunOut.cycle.totalTokens, 50);
  assert.equal(summary.lastRunOut.since.totalTokens, 7);
  assert.equal(summary.totals.totalTokens, 157);
});

test("reset-window grouping is model-scoped", (t) => {
  const path = fixture(t);
  usage(path, 1, 100);
  recordMetaAssistantMessage(failure(2), path);
  usage(path, 3, 50);
  recordMetaAssistantMessage(failure(4, errorText(), { model: "muse-other" }), path);
  recordMetaAssistantMessage(failure(5), path);
  recordMetaAssistantMessage(failure(6, errorText(), { model: "muse-other" }), path);
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 2);
  assert.equal(summary.lastRunOut.ts, 4);
  assert.equal(summary.lastRunOut.cycle.totalTokens, 50);
});

test("out-of-range legacy timestamps cannot break facts rendering", (t) => {
  const path = fixture(t);
  writeFileSync(
    path,
    JSON.stringify({ v: 1, ts: 1e30, kind: "run-out", model: "muse-wonder-1.0" }),
  );
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 0);
  assert.doesNotThrow(() => metaUsageFacts(summary));
});

test("legacy markers stay readable without inventing missing reset windows", (t) => {
  const path = fixture(t);
  const marker = { v: 1, ts: observed[0][0], kind: "run-out", model: "muse-wonder-1.0" };
  writeFileSync(
    path,
    [marker, { ...marker, ts: observed[1][0], resetsAt: 1e30 }].map(JSON.stringify).join("\n") +
      "\n",
  );
  const summary = readMetaUsageSummary(path);
  assert.equal(summary.runOuts, 2);
  assert.equal(summary.lastRunOut.resetsAt, undefined);
  assert.doesNotThrow(() => metaUsageFacts(summary));
  assert.doesNotMatch(metaUsageFacts(summary).join("\n"), /Provider-reported reset/);
});
