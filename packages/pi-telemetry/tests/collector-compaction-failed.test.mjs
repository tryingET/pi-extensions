/**
 * Tests for causal compaction correlation (ADR 2026-08-24-pi-0.84.x-adoption P0-A):
 * session_compact_failed handling, composite (sessionId, compactionSeq) keying,
 * the terminal-state machine, recoverable classification, and orphan flagging.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetryCollector } from "../src/collector.ts";
import { CAUSAL_SCHEMA_REV } from "../src/events.ts";

function harness() {
  const recorded = [];
  let t = 1_000;
  const collector = createTelemetryCollector({
    dir: "/tmp/unused",
    now: () => {
      t += 10;
      return t;
    },
    append: async (_dir, event) => {
      recorded.push(event);
    },
  });
  return { collector, recorded };
}

const begin = (collector, extra = {}) =>
  collector.handle({
    type: "session_before_compact",
    reason: "threshold",
    willRetry: false,
    ...extra,
  });

test("begin→compact resolves success with seq and rev stamped", () => {
  const { collector, recorded } = harness();
  begin(collector);
  collector.handle({
    type: "session_compact",
    reason: "threshold",
    willRetry: false,
    fromExtension: false,
  });

  const beginEvent = recorded.find((e) => e.kind === "compaction_begin");
  const end = recorded.find((e) => e.kind === "compaction");
  assert.equal(beginEvent.compactionSeq, 1);
  assert.equal(beginEvent.rev, CAUSAL_SCHEMA_REV);
  assert.equal(end.compactionSeq, 1);
  assert.equal(end.rev, CAUSAL_SCHEMA_REV);
  assert.equal(end.retriedAfterFailure, undefined);
});

test("begin→failed records causal failure with cause, reason, and seq", () => {
  const { collector, recorded } = harness();
  begin(collector);
  collector.handle({
    type: "session_compact_failed",
    reason: "overflow",
    errorMessage: "provider exploded with code 500",
    aborted: false,
    willRetry: false,
    fromExtension: false,
  });

  const failure = recorded.find((e) => e.kind === "compaction_failure");
  assert.ok(failure);
  assert.equal(failure.stage, "host");
  assert.equal(failure.reason, "overflow");
  assert.equal(failure.aborted, false);
  assert.equal(failure.orphan, false);
  assert.equal(failure.compactionSeq, 1);
  assert.equal(failure.recoverable, undefined);
  assert.equal(failure.errorSignature, "provider exploded with code N");
});

test("aborted + willRetry is classified recoverable; abort without error text gets explicit signature", () => {
  const { collector, recorded } = harness();
  begin(collector);
  collector.handle({
    type: "session_compact_failed",
    reason: "threshold",
    aborted: true,
    willRetry: true,
    fromExtension: false,
  });

  const failure = recorded.find((e) => e.kind === "compaction_failure");
  assert.equal(failure.recoverable, true);
  assert.equal(failure.aborted, true);
  assert.equal(failure.errorSignature, "aborted without error text");
});

test("failed→retry→success yields canonical success-after-retry; failed record stays history", () => {
  const { collector, recorded } = harness();
  begin(collector); // seq 1
  collector.handle({
    type: "session_compact_failed",
    reason: "overflow",
    errorMessage: "boom",
    aborted: false,
    willRetry: true,
  });
  begin(collector); // seq 2
  collector.handle({
    type: "session_compact",
    reason: "threshold",
    willRetry: false,
    fromExtension: false,
  });

  const failures = recorded.filter((e) => e.kind === "compaction_failure");
  const successes = recorded.filter((e) => e.kind === "compaction");
  assert.equal(failures.length, 1);
  assert.equal(successes.length, 1);
  assert.equal(successes[0].compactionSeq, 2);
  assert.equal(successes[0].retriedAfterFailure, true);
});

test("orphan failed (no prior begin) flagged orphan without compactionSeq", () => {
  const { collector, recorded } = harness();
  collector.handle({
    type: "session_compact_failed",
    reason: "manual",
    errorMessage: "late load",
    aborted: false,
    willRetry: false,
  });

  const failure = recorded.find((e) => e.kind === "compaction_failure");
  assert.equal(failure.orphan, true);
  assert.equal(failure.compactionSeq, undefined);
});

test("seq resets when sessionId changes; uniqueness preserved by composite key", () => {
  let sid = "session-a";
  let t2 = 1_000;
  const recorded = [];
  const collector = createTelemetryCollector({
    dir: "/tmp/unused",
    now: () => {
      t2 += 10;
      return t2;
    },
    sessionId: () => sid,
    append: async (_dir, event) => {
      recorded.push(event);
    },
  });

  begin(collector); // session-a seq 1
  begin(collector); // session-a seq 2
  sid = "session-b";
  begin(collector); // session-b seq 1 (reset)

  const begins = recorded.filter((e) => e.kind === "compaction_begin");
  assert.deepEqual(
    begins.map((e) => [e.sessionId, e.compactionSeq]),
    [
      ["session-a", 1],
      ["session-a", 2],
      ["session-b", 1],
    ],
  );
});
