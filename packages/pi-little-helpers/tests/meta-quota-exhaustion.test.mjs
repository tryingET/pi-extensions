// summary: AK7405 observed Meta subscription exhaustion, reset metadata, and retry grouping.
// read_when: changing Muse quota detection or reset-window accounting.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  metaUsageFacts,
  readMetaUsageSummary,
  recordMetaAssistantMessage,
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
