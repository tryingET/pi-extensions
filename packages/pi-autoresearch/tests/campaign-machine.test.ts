import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createActor } from "xstate";
import {
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
} from "../src/core/runtime.ts";
import {
  campaignMachine,
  createCampaignMachineInputFromRuntimeStatus,
} from "../src/machine/campaign.ts";
import {
  type CampaignSegmentConfig,
  campaignEvents,
  isCampaignDecision,
} from "../src/machine/events.ts";

const configuredSegment: CampaignSegmentConfig = {
  name: "widget-speed",
  metricName: "total_ms",
  metricUnit: "ms",
  direction: "lower",
  benchmarkCommand: "bash autoresearch.sh",
  checksCommand: "bash autoresearch.checks.sh",
};

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-campaign-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeExecutable(cwd: string, name: string, content: string): void {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

test("campaign event helpers build the typed event model", () => {
  assert.equal(isCampaignDecision("iterate"), true);
  assert.equal(isCampaignDecision("pause"), false);

  assert.deepEqual(campaignEvents.configureSegment(configuredSegment), {
    type: "CONFIGURE_SEGMENT",
    segment: configuredSegment,
  });
  assert.deepEqual(campaignEvents.benchmarkSucceeded({ metric: 91 }), {
    type: "BENCHMARK_SUCCEEDED",
    metric: 91,
    requiresChecks: false,
  });
  assert.deepEqual(campaignEvents.decideNextAction("finalize", "ship the best candidate"), {
    type: "DECIDE_NEXT_ACTION",
    decision: "finalize",
    reason: "ship the best candidate",
  });
});

test("campaign machine starts in segment_unconfigured when hydrated without a config", () => {
  const actor = createActor(campaignMachine, { input: undefined }).start();

  assert.equal(actor.getSnapshot().value, "segment_unconfigured");

  actor.send(campaignEvents.configureSegment(configuredSegment));
  assert.equal(actor.getSnapshot().value, "ready");
  assert.deepEqual(actor.getSnapshot().context.segment, configuredSegment);
});

test("campaign machine models benchmark, checks, receipt recording, and finalize flow", () => {
  const actor = createActor(campaignMachine, {
    input: {
      segment: configuredSegment,
    },
  }).start();

  assert.equal(actor.getSnapshot().value, "ready");

  actor.send(campaignEvents.startRun({ description: "baseline run" }));
  assert.equal(actor.getSnapshot().value, "running_benchmark");

  actor.send(campaignEvents.benchmarkSucceeded({ metric: 152, requiresChecks: true }));
  assert.equal(actor.getSnapshot().value, "running_checks");
  assert.equal(actor.getSnapshot().context.activeRun?.metric, 152);

  actor.send(campaignEvents.checksSucceeded());
  assert.equal(actor.getSnapshot().value, "recording_receipt");
  assert.equal(actor.getSnapshot().context.activeRun?.checksPassed, true);

  actor.send(campaignEvents.receiptRecorded({ status: "baseline", metric: 152 }));
  assert.equal(actor.getSnapshot().value, "awaiting_decision");
  assert.equal(actor.getSnapshot().context.runCount, 1);
  assert.equal(actor.getSnapshot().context.successfulRunCount, 1);
  assert.equal(actor.getSnapshot().context.baselineMetric, 152);
  assert.equal(actor.getSnapshot().context.bestMetric, 152);

  actor.send(campaignEvents.decideNextAction("iterate"));
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.lastDecision, "iterate");

  actor.send(campaignEvents.startRun({ description: "candidate run", checksCommand: null }));
  actor.send(campaignEvents.benchmarkSucceeded({ metric: 140 }));
  assert.equal(actor.getSnapshot().value, "recording_receipt");

  actor.send(campaignEvents.receiptRecorded({ status: "candidate", metric: 140 }));
  assert.equal(actor.getSnapshot().value, "awaiting_decision");
  assert.equal(actor.getSnapshot().context.bestMetric, 140);

  actor.send(campaignEvents.decideNextAction("finalize", "ship the fastest candidate"));
  assert.equal(actor.getSnapshot().value, "finalize_candidate");

  actor.send(campaignEvents.acceptFinalize("ship the fastest candidate"));
  assert.equal(actor.getSnapshot().value, "completed");
  assert.equal(actor.getSnapshot().context.completionReason, "ship the fastest candidate");
});

test("campaign machine resumes active run substates after unblock", () => {
  const actor = createActor(campaignMachine, {
    input: {
      segment: configuredSegment,
    },
  }).start();

  actor.send(campaignEvents.startRun({ description: "candidate run" }));
  actor.send(campaignEvents.benchmarkSucceeded({ metric: 97, requiresChecks: true }));
  assert.equal(actor.getSnapshot().value, "running_checks");

  actor.send(campaignEvents.block("pause for operator review"));
  assert.equal(actor.getSnapshot().value, "blocked");
  assert.equal(actor.getSnapshot().context.activeRun?.metric, 97);

  actor.send(campaignEvents.unblock());
  assert.equal(actor.getSnapshot().value, "running_checks");
  assert.equal(actor.getSnapshot().context.blockedReason, null);
  assert.equal(actor.getSnapshot().context.activeRun?.metric, 97);

  actor.send(campaignEvents.checksSucceeded());
  assert.equal(actor.getSnapshot().value, "recording_receipt");
});

test("campaign machine supports rebaseline and block recovery", () => {
  const actor = createActor(campaignMachine, {
    input: {
      segment: configuredSegment,
      runCount: 1,
      successfulRunCount: 1,
      baselineMetric: 100,
      bestMetric: 100,
      lastRunStatus: "baseline",
      lastRunMetric: 100,
    },
  }).start();

  actor.send(campaignEvents.startRun({ description: "candidate run" }));
  actor.send(campaignEvents.benchmarkSucceeded({ metric: 95 }));
  actor.send(campaignEvents.receiptRecorded({ status: "candidate", metric: 95 }));
  assert.equal(actor.getSnapshot().value, "awaiting_decision");

  actor.send(campaignEvents.decideNextAction("rebaseline", "accept new noise floor"));
  assert.equal(actor.getSnapshot().value, "rebaseline_needed");

  actor.send(campaignEvents.acceptRebaseline());
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.baselineMetric, 95);

  actor.send(campaignEvents.block("waiting for operator review"));
  assert.equal(actor.getSnapshot().value, "blocked");
  assert.equal(actor.getSnapshot().context.blockedReason, "waiting for operator review");

  actor.send(campaignEvents.unblock());
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.blockedReason, null);
});

test("campaign machine input builder maps bounded runtime status into a configured ready state", async () => {
  await withTempDir((cwd) => {
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=111"'].join("\n"),
    );

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 111,
        description: "baseline",
        timestamp: 2,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    const input = createCampaignMachineInputFromRuntimeStatus(status, {
      awaitingDecision: true,
    });
    const actor = createActor(campaignMachine, { input }).start();

    assert.deepEqual(input.segment, {
      name: "widget-speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "bash autoresearch.sh",
      checksCommand: "bash autoresearch.checks.sh",
    });
    assert.equal(actor.getSnapshot().value, "awaiting_decision");
    assert.equal(actor.getSnapshot().context.baselineMetric, 111);
    assert.equal(actor.getSnapshot().context.bestMetric, 111);
    assert.equal(actor.getSnapshot().context.runCount, 1);
  });
});
