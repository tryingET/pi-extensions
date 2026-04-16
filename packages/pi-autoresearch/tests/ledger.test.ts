import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendLedgerEvent,
  createLedgerEventEntry,
  loadAutoresearchLedger,
  parseLedgerLine,
  projectAutoresearchLedger,
  projectAutoresearchLedgerEntries,
  resolveAutoresearchLedgerPath,
  serializeLedgerEntry,
} from "../src/core/ledger.ts";
import { campaignEvents } from "../src/machine/events.ts";

type TempDirFn = (cwd: string) => Promise<void> | void;

async function withTempDir(fn: TempDirFn): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-ledger-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("ledger entries round-trip through serialization and parsing", () => {
  const entry = createLedgerEventEntry(
    campaignEvents.configureSegment({
      name: "widget-speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "bash autoresearch.sh",
      checksCommand: "bash autoresearch.checks.sh",
    }),
    10,
  );

  assert.deepEqual(parseLedgerLine(serializeLedgerEntry(entry)), entry);
});

test("ledger loader counts invalid lines while preserving valid events", async () => {
  await withTempDir((cwd) => {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.configureSegment({
          name: "widget-speed",
          metricName: "total_ms",
          metricUnit: "ms",
          direction: "lower",
          benchmarkCommand: "bash autoresearch.sh",
          checksCommand: "bash autoresearch.checks.sh",
        }),
        1,
      ),
    );

    const ledgerPath = resolveAutoresearchLedgerPath(cwd);
    const contents = readFileSync(ledgerPath, "utf8");
    assert.match(contents, /CONFIGURE_SEGMENT/);

    const corrupted = `${contents}{"type":"event","version":1,"recordedAt":2,"event":{"type":"NOPE"}}\nnot-json\n`;
    writeFileSync(ledgerPath, corrupted, "utf8");

    const loaded = loadAutoresearchLedger(cwd);
    assert.equal(loaded.entries.length, 1);
    assert.equal(loaded.invalidLineCount, 2);
  });
});

test("ledger projector replays append-only events into the campaign machine", () => {
  const entries = [
    createLedgerEventEntry(
      campaignEvents.configureSegment({
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
      }),
      1,
    ),
    createLedgerEventEntry(campaignEvents.startRun({ description: "baseline" }), 2),
    createLedgerEventEntry(
      campaignEvents.benchmarkSucceeded({ metric: 152, requiresChecks: true }),
      3,
    ),
    createLedgerEventEntry(campaignEvents.checksSucceeded(), 4),
    createLedgerEventEntry(campaignEvents.receiptRecorded({ status: "baseline", metric: 152 }), 5),
    createLedgerEventEntry(campaignEvents.decideNextAction("iterate"), 6),
    createLedgerEventEntry(
      campaignEvents.startRun({ description: "candidate", checksCommand: null }),
      7,
    ),
    createLedgerEventEntry(campaignEvents.benchmarkSucceeded({ metric: 140 }), 8),
    createLedgerEventEntry(campaignEvents.receiptRecorded({ status: "candidate", metric: 140 }), 9),
    createLedgerEventEntry(campaignEvents.decideNextAction("finalize", "ship it"), 10),
  ];

  const projection = projectAutoresearchLedgerEntries(entries);

  assert.equal(projection.state, "finalize_candidate");
  assert.equal(projection.eventCount, entries.length);
  assert.equal(projection.replayedEventCount, entries.length);
  assert.deepEqual(projection.rejectedEvents, []);
  assert.equal(projection.context.runCount, 2);
  assert.equal(projection.context.successfulRunCount, 2);
  assert.equal(projection.context.baselineMetric, 152);
  assert.equal(projection.context.bestMetric, 140);
  assert.equal(projection.context.lastDecision, "finalize");
});

test("ledger projector reports rejected out-of-order events", () => {
  const projection = projectAutoresearchLedgerEntries([
    createLedgerEventEntry(campaignEvents.checksSucceeded(), 1),
    createLedgerEventEntry(
      campaignEvents.configureSegment({
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
      }),
      2,
    ),
  ]);

  assert.equal(projection.state, "ready");
  assert.equal(projection.eventCount, 2);
  assert.equal(projection.replayedEventCount, 1);
  assert.equal(projection.rejectedEvents.length, 1);
  assert.equal(projection.rejectedEvents[0]?.event.type, "CHECKS_SUCCEEDED");
  assert.match(
    projection.rejectedEvents[0]?.reason ?? "",
    /not valid from state segment_unconfigured/,
  );
});

test("ledger status helper loads from disk and projects the current machine truth", async () => {
  await withTempDir((cwd) => {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.configureSegment({
          name: "widget-speed",
          metricName: "total_ms",
          metricUnit: "ms",
          direction: "lower",
          benchmarkCommand: "bash autoresearch.sh",
          checksCommand: "bash autoresearch.checks.sh",
        }),
        1,
      ),
    );
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(campaignEvents.startRun({ description: "baseline" }), 2),
    );
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(campaignEvents.benchmarkFailed("benchmark crashed"), 3),
    );
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(campaignEvents.receiptRecorded({ status: "crash", metric: null }), 4),
    );

    const status = projectAutoresearchLedger(cwd);

    assert.equal(status.hasLedger, true);
    assert.equal(status.ledgerPath, resolveAutoresearchLedgerPath(cwd));
    assert.equal(status.invalidLineCount, 0);
    assert.equal(status.replayedEventCount, 4);
    assert.deepEqual(status.rejectedEvents, []);
    assert.equal(status.state, "awaiting_decision");
    assert.equal(status.context.runCount, 1);
    assert.equal(status.context.successfulRunCount, 0);
    assert.equal(status.context.lastRunStatus, "crash");
    assert.equal(status.context.lastRunMetric, null);
  });
});
