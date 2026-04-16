import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoresearchSupervisorProjectionKey,
  createAutoresearchSupervisorMachine,
  observeAutoresearchSupervisor,
  transitionAutoresearchSupervisor,
} from "../src/loops/autoresearch-supervisor.ts";

function createRuntimeStatus(overrides = {}) {
  const currentSegment = {
    configured: true,
    name: "widget-speed",
    metricName: "total_ms",
    metricUnit: "ms",
    direction: "lower",
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
    runCount: 0,
    successfulRunCount: 0,
    baselineMetric: null,
    bestMetric: null,
    lastRunStatus: null,
    lastRunMetric: null,
    ...(overrides.currentSegment ?? {}),
  };

  const runtimeProjection = {
    state: "ready",
    source: "ledger",
    ledgerPath: "/tmp/campaign/autoresearch.events.jsonl",
    hasLedger: true,
    invalidLedgerLines: 0,
    eventCount: 1,
    replayedEventCount: 1,
    rejectedEvents: [],
    syncIssues: [],
    ...(overrides.runtimeProjection ?? {}),
  };

  return {
    ...overrides,
    cwd: Object.hasOwn(overrides, "cwd") ? overrides.cwd : "/tmp/campaign",
    currentSegment,
    runtimeProjection,
  };
}

function createInput({ runtime = {}, ledger = {} } = {}) {
  return {
    runtime: createRuntimeStatus(runtime),
    ledger: {
      context: {
        blockedReason: null,
        completionReason: null,
        ...(ledger.context ?? {}),
      },
      ...ledger,
    },
  };
}

test("supervisor machine observes projectable configured and monitoring states", () => {
  const idle = createAutoresearchSupervisorMachine();
  assert.equal(idle.state, "idle");
  assert.equal(idle.observationCount, 0);

  const configured = observeAutoresearchSupervisor(createInput(), idle);
  assert.equal(configured.state, "configured");
  assert.equal(configured.projectable, true);
  assert.equal(configured.milestone, "configured");
  assert.equal(configured.evidenceResult, "pass");
  assert.equal(configured.action, "project");
  assert.equal(configured.observationCount, 1);
  assert.equal(
    configured.projectionKey,
    [
      "configured",
      "segment:widget-speed",
      "metric:total_ms",
      "direction:lower",
      "benchmark:bash%20autoresearch.sh",
      "checks:bash%20autoresearch.checks.sh",
      "runs:0",
      "success:0",
      "last:none",
      "last_metric:none",
      "baseline:none",
      "best:none",
      "blocked:none",
      "completed:none",
    ].join("|"),
  );

  const monitoring = transitionAutoresearchSupervisor(configured, {
    type: "OBSERVE",
    input: createInput({
      runtime: {
        currentSegment: {
          runCount: 2,
          successfulRunCount: 1,
          baselineMetric: 111,
          bestMetric: 108,
          lastRunStatus: "keep",
          lastRunMetric: 108,
        },
        runtimeProjection: {
          state: "running_checks",
          eventCount: 6,
          replayedEventCount: 6,
        },
      },
    }),
  });

  assert.equal(monitoring.state, "monitoring");
  assert.equal(monitoring.projectable, false);
  assert.equal(monitoring.milestone, null);
  assert.equal(monitoring.action, "wait");
  assert.equal(monitoring.observationCount, 2);
  assert.match(monitoring.summary, /running_checks/);

  const reset = transitionAutoresearchSupervisor(monitoring, { type: "RESET" });
  assert.equal(reset.state, "idle");
  assert.equal(reset.observationCount, 0);
});

test("supervisor maps awaiting_decision to decision-required milestone", () => {
  const snapshot = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        currentSegment: {
          runCount: 3,
          successfulRunCount: 2,
          baselineMetric: 24.1,
          bestMetric: 18.4,
          lastRunStatus: "keep",
          lastRunMetric: 18.4,
        },
        runtimeProjection: {
          state: "awaiting_decision",
          eventCount: 11,
          replayedEventCount: 11,
        },
      },
    }),
  );

  assert.equal(snapshot.state, "decision_required");
  assert.equal(snapshot.projectable, true);
  assert.equal(snapshot.milestone, "decision-required");
  assert.equal(snapshot.evidenceResult, "pass");
  assert.match(snapshot.summary, /3 runs recorded/);
  assert.match(snapshot.summary, /best total_ms is 18.4 ms/);
  assert.match(snapshot.summary, /awaiting next bounded decision/);
  assert.ok(snapshot.projectionKey?.includes("runs:3"));
  assert.ok(snapshot.projectionKey?.includes("best:18.4"));
});

test("supervisor maps rebaseline-needed to skip evidence", () => {
  const snapshot = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        currentSegment: {
          runCount: 2,
          successfulRunCount: 2,
          baselineMetric: 10,
          bestMetric: 9,
          lastRunStatus: "candidate",
          lastRunMetric: 9,
        },
        runtimeProjection: {
          state: "rebaseline_needed",
          eventCount: 8,
          replayedEventCount: 8,
        },
      },
    }),
  );

  assert.equal(snapshot.state, "rebaseline_needed");
  assert.equal(snapshot.milestone, "rebaseline-needed");
  assert.equal(snapshot.evidenceResult, "skip");
  assert.equal(snapshot.action, "project");
  assert.match(snapshot.summary, /needs rebaseline/);
  assert.match(snapshot.summary, /total_ms is 9 ms/);
});

test("supervisor maps finalize candidate to pass milestone", () => {
  const snapshot = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        currentSegment: {
          runCount: 4,
          successfulRunCount: 3,
          baselineMetric: 120,
          bestMetric: 91,
          lastRunStatus: "keep",
          lastRunMetric: 91,
        },
        runtimeProjection: {
          state: "finalize_candidate",
          eventCount: 14,
          replayedEventCount: 14,
        },
      },
    }),
  );

  assert.equal(snapshot.state, "finalize_candidate");
  assert.equal(snapshot.milestone, "finalize-candidate");
  assert.equal(snapshot.evidenceResult, "pass");
  assert.match(snapshot.summary, /ready for finalization/);
  assert.match(snapshot.summary, /best total_ms is 91 ms/);
});

test("supervisor maps blocked and completed states using ledger reasons", () => {
  const blocked = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          state: "blocked",
          eventCount: 9,
          replayedEventCount: 9,
        },
      },
      ledger: {
        context: {
          blockedReason: "waiting for operator review",
        },
      },
    }),
  );

  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.milestone, "blocked");
  assert.equal(blocked.evidenceResult, "fail");
  assert.match(blocked.summary, /waiting for operator review/);
  assert.ok(blocked.projectionKey?.includes("blocked:waiting%20for%20operator%20review"));

  const completed = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          state: "completed",
          eventCount: 12,
          replayedEventCount: 12,
        },
      },
      ledger: {
        context: {
          completionReason: "ship the fastest candidate",
        },
      },
    }),
  );

  assert.equal(completed.state, "completed");
  assert.equal(completed.milestone, "completed");
  assert.equal(completed.evidenceResult, "pass");
  assert.match(completed.summary, /ship the fastest candidate/);
  assert.ok(completed.projectionKey?.includes("completed:ship%20the%20fastest%20candidate"));
});

test("supervisor fails closed on invalid ledger lines and rejected replay events", () => {
  const invalidLines = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          invalidLedgerLines: 2,
        },
      },
    }),
  );

  assert.equal(invalidLines.state, "projection_blocked");
  assert.equal(invalidLines.projectable, false);
  assert.equal(invalidLines.action, "fail_closed");
  assert.equal(invalidLines.projectionBlockedReason, "event ledger has 2 invalid line(s)");
  assert.match(invalidLines.summary, /cannot project a milestone/);

  const rejected = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          rejectedEvents: [{ reason: "Event START_RUN is not valid from state ready" }],
        },
      },
    }),
  );

  assert.equal(rejected.state, "projection_blocked");
  assert.equal(rejected.projectionBlockedReason, "event ledger replay rejected 1 event(s)");
});

test("supervisor fails closed when projectable milestones lack campaign identity or cwd", () => {
  const missingIdentity = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        currentSegment: {
          name: null,
        },
      },
    }),
  );

  assert.equal(missingIdentity.state, "projection_blocked");
  assert.equal(
    missingIdentity.projectionBlockedReason,
    "current bounded segment identity is incomplete",
  );

  const missingCwd = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        cwd: undefined,
        runtimeProjection: {
          state: "awaiting_decision",
        },
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 10,
          bestMetric: 10,
          lastRunStatus: "baseline",
          lastRunMetric: 10,
        },
      },
    }),
  );

  assert.equal(missingCwd.state, "projection_blocked");
  assert.equal(
    missingCwd.projectionBlockedReason,
    "runtime cwd is required for milestone projection",
  );
});

test("projection key builder returns null for non-projectable snapshots", () => {
  const snapshot = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          state: "running_benchmark",
        },
      },
    }),
  );

  assert.equal(snapshot.projectionKey, null);
  assert.equal(buildAutoresearchSupervisorProjectionKey(snapshot), null);
});

test("supervisor fails closed on unsupported runtime states", () => {
  const snapshot = observeAutoresearchSupervisor(
    createInput({
      runtime: {
        runtimeProjection: {
          state: "mystery_state",
        },
      },
    }),
  );

  assert.equal(snapshot.state, "projection_blocked");
  assert.equal(
    snapshot.projectionBlockedReason,
    "unsupported autoresearch runtime state: mystery_state",
  );
});
