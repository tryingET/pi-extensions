import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AUTORESEARCH_RUNTIME_SNAPSHOT_FILE } from "@tryinget/pi-autoresearch/src/runtime.ts";
import { deriveAutoresearchAkMilestoneCandidate } from "../src/runtime/autoresearch-ak-projector.ts";
import {
  AutoresearchLiveSupervisionRunner,
  buildAutoresearchLiveSupervisionSessionKey,
  readAutoresearchLiveObservation,
  resolveAutoresearchLiveSupervisionPolicy,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

const NULL_LEDGER = {
  context: {
    blockedReason: null,
    completionReason: null,
  },
};

class FakeScheduler {
  #nextId = 1;
  #timers = new Map();

  setTimeout = (callback, delayMs) => {
    const id = this.#nextId++;
    this.#timers.set(id, { callback, delayMs });
    return id;
  };

  clearTimeout = (id) => {
    this.#timers.delete(id);
  };

  pendingCount() {
    return this.#timers.size;
  }

  nextDelayMs() {
    const [first] = this.#timers.values();
    return first?.delayMs ?? null;
  }

  async runNext() {
    const iterator = this.#timers.entries().next();
    assert.equal(iterator.done, false, "expected a scheduled timer");
    const [id, timer] = iterator.value;
    this.#timers.delete(id);
    await timer.callback();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createRuntimeStatus(overrides = {}) {
  const {
    currentSegment: currentSegmentOverrides = {},
    runtimeProjection: runtimeProjectionOverrides = {},
    ...rest
  } = overrides;
  const cwd = Object.hasOwn(rest, "cwd") ? rest.cwd : "/tmp/autoresearch-campaign";
  return {
    cwd,
    receiptPath: cwd ? path.join(cwd, "autoresearch.jsonl") : undefined,
    currentSegment: {
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
      ...currentSegmentOverrides,
    },
    runtimeProjection: {
      state: "ready",
      source: "ledger",
      ledgerPath: cwd ? path.join(cwd, "autoresearch.events.jsonl") : undefined,
      hasLedger: true,
      invalidLedgerLines: 0,
      eventCount: 1,
      replayedEventCount: 1,
      rejectedEvents: [],
      syncIssues: [],
      ...runtimeProjectionOverrides,
    },
    ...rest,
  };
}

function createFinalizationInspection(cwd, status) {
  return {
    cwd,
    status,
    plan: null,
    planStatus: {
      path: path.join(cwd, "autoresearch.finalization.json"),
      exists: false,
      reuse: "missing",
      discardedReason: null,
      sourceBranch: null,
      trunkRef: "main",
      baseRef: null,
      finalTree: null,
      runtimeKey: null,
    },
    git: null,
    planPath: path.join(cwd, "autoresearch.finalization.json"),
    nextStep: "No finalization plan is available yet.",
  };
}

function createNoopProjectorResult(runtime) {
  const candidate = deriveAutoresearchAkMilestoneCandidate({
    runtime,
    ledger: NULL_LEDGER,
  });
  assert.equal(candidate.kind, "noop");
  return {
    ok: true,
    action: "noop",
    candidate,
  };
}

function createRecordedProjectorResult(taskId, observation) {
  const candidate = deriveAutoresearchAkMilestoneCandidate({
    runtime: observation.runtime,
    ledger: observation.ledger,
  });
  assert.equal(candidate.kind, "projectable");
  return {
    ok: true,
    action: "recorded",
    candidate,
    task: {
      id: taskId,
      repo: observation.cwd,
      status: "pending",
    },
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve,
  };
}

test("policy resolver enforces bounded polling intervals", () => {
  assert.equal(resolveAutoresearchLiveSupervisionPolicy().intervalSeconds, 30);
  assert.throws(() => resolveAutoresearchLiveSupervisionPolicy(4), /between 5 and 300/);
  assert.throws(() => resolveAutoresearchLiveSupervisionPolicy(301), /between 5 and 300/);
});

test("readAutoresearchLiveObservation stays read-only and reuses the same runtime snapshot for finalization inspection", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-live-observe-"));
  const observation = await readAutoresearchLiveObservation({ cwd });

  assert.equal(observation.cwd, path.resolve(cwd));
  assert.equal(observation.runtime.cwd, path.resolve(cwd));
  assert.equal(observation.finalization.status, observation.runtime);
  assert.equal(observation.ledger.context.blockedReason, null);
  assert.equal(
    fs.existsSync(path.join(cwd, AUTORESEARCH_RUNTIME_SNAPSHOT_FILE)),
    false,
    "live observation must not persist autoresearch.runtime.json",
  );
});

test("runner keys sessions by exact taskId plus cwd and avoids duplicate timers on repeated start", async () => {
  const scheduler = new FakeScheduler();
  let observeCount = 0;

  const runner = new AutoresearchLiveSupervisionRunner({
    now: (() => {
      let current = 1_000;
      return () => current++;
    })(),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd, options) => {
      observeCount += 1;
      assert.equal(options.persistSnapshot, false);
      return createRuntimeStatus({
        cwd,
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 20,
          bestMetric: 19,
          lastRunStatus: "keep",
          lastRunMetric: 19,
        },
        runtimeProjection: {
          state: "running_checks",
          eventCount: 4,
          replayedEventCount: 4,
        },
      });
    },
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ observation }) => createNoopProjectorResult(observation.runtime),
  });

  const first = await runner.start({
    taskId: 1544,
    cwd: "/tmp/pi-orch-live/../pi-orch-live",
    intervalSeconds: 30,
  });
  assert.equal(first.reused, false);
  assert.equal(first.session.state, "running");
  assert.equal(
    first.sessionKey,
    buildAutoresearchLiveSupervisionSessionKey({ taskId: 1544, cwd: "/tmp/pi-orch-live" }),
  );
  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(scheduler.nextDelayMs(), 30_000);

  const second = await runner.start({
    taskId: 1544,
    cwd: "/tmp/pi-orch-live",
    intervalSeconds: 30,
  });
  assert.equal(second.reused, true);
  assert.equal(scheduler.pendingCount(), 1);

  const third = await runner.start({
    taskId: 1545,
    cwd: "/tmp/pi-orch-live",
    intervalSeconds: 30,
  });
  assert.equal(third.reused, false);
  assert.equal(scheduler.pendingCount(), 2);
  assert.equal(observeCount, 2);
});

test("concurrent start calls for the same key reuse one live session", async () => {
  const scheduler = new FakeScheduler();
  const deferred = createDeferred();
  let projectorCalls = 0;

  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) =>
      createRuntimeStatus({
        cwd,
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 20,
          bestMetric: 19,
          lastRunStatus: "keep",
          lastRunMetric: 19,
        },
        runtimeProjection: {
          state: "running_checks",
          eventCount: 4,
          replayedEventCount: 4,
        },
      }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ observation }) => {
      projectorCalls += 1;
      await deferred.promise;
      return createNoopProjectorResult(observation.runtime);
    },
  });

  const firstStart = runner.start({ taskId: 1544, cwd: "/tmp/concurrent-start" });
  assert.equal(runner.listSessions().length, 1);

  const secondStart = runner.start({ taskId: 1544, cwd: "/tmp/concurrent-start" });
  deferred.resolve();

  const [first, second] = await Promise.all([firstStart, secondStart]);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(projectorCalls, 1);
  assert.equal(scheduler.pendingCount(), 1);
});

test("observe performs a read-only one-shot poll without creating a background session", async () => {
  const scheduler = new FakeScheduler();
  let projectorCalls = 0;
  let lifecycleCalls = 0;
  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) =>
      createRuntimeStatus({
        cwd,
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 20,
          bestMetric: 19,
          lastRunStatus: "keep",
          lastRunMetric: 19,
        },
        runtimeProjection: {
          state: "running_checks",
          eventCount: 4,
          replayedEventCount: 4,
        },
      }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ observation }) => {
      projectorCalls += 1;
      return createNoopProjectorResult(observation.runtime);
    },
    evaluateLifecycle: async () => {
      lifecycleCalls += 1;
      return { ok: true, action: "none", summary: "should not run" };
    },
  });

  const result = await runner.observe({ taskId: 1544, cwd: "/tmp/observe-once" });
  assert.equal(result.session.state, "running");
  assert.equal(result.projector, null);
  assert.equal(result.lifecycle, null);
  assert.equal(projectorCalls, 0);
  assert.equal(lifecycleCalls, 0);
  assert.equal(scheduler.pendingCount(), 0);
  assert.equal(runner.getSession({ taskId: 1544, cwd: "/tmp/observe-once" }), null);
});

test("unchanged polls stay bounded and do not spam milestone writes", async () => {
  const scheduler = new FakeScheduler();
  const seenProjectionKeys = new Set();
  let writeCount = 0;

  const runner = new AutoresearchLiveSupervisionRunner({
    now: (() => {
      let current = 2_000;
      return () => current++;
    })(),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) => createRuntimeStatus({ cwd }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ taskId, observation }) => {
      const candidate = deriveAutoresearchAkMilestoneCandidate({
        runtime: observation.runtime,
        ledger: observation.ledger,
      });
      assert.equal(candidate.kind, "projectable");
      const projectionKey = candidate.payload.details.projection_key;
      const task = {
        id: taskId,
        repo: observation.cwd,
        status: "pending",
      };

      if (seenProjectionKeys.has(projectionKey)) {
        return {
          ok: true,
          action: "already-projected",
          candidate,
          task,
          existingEvidenceId: 41,
        };
      }

      seenProjectionKeys.add(projectionKey);
      writeCount += 1;
      return {
        ok: true,
        action: "recorded",
        candidate,
        task,
      };
    },
  });

  const started = await runner.start({ taskId: 1544, cwd: "/tmp/stable-campaign" });
  assert.equal(started.session.lastProjectionAction, "recorded");
  assert.equal(started.session.pollCount, 1);
  assert.equal(writeCount, 1);
  assert.equal(scheduler.pendingCount(), 1);

  await scheduler.runNext();

  const session = runner.getSession({ taskId: 1544, cwd: "/tmp/stable-campaign" });
  assert.equal(writeCount, 1, "unchanged projection keys must not trigger another write");
  assert.equal(session?.lastProjectionAction, "already-projected");
  assert.equal(session?.pollCount, 2);
  assert.equal(session?.state, "running");
  assert.equal(scheduler.pendingCount(), 1);
});

test("stop during an in-flight poll leaves the session stopped and unscheduled", async () => {
  const scheduler = new FakeScheduler();
  const deferred = createDeferred();
  let observeEntered = false;

  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) => {
      observeEntered = true;
      await deferred.promise;
      return createRuntimeStatus({ cwd });
    },
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ taskId, observation }) =>
      createRecordedProjectorResult(taskId, observation),
  });

  const startPromise = runner.start({ taskId: 1544, cwd: "/tmp/stop-race" });
  assert.equal(observeEntered, true);

  const stopped = runner.stop({ taskId: 1544, cwd: "/tmp/stop-race" });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.session?.state, "stopped");

  deferred.resolve();
  const started = await startPromise;
  assert.equal(started.session.state, "stopped");
  assert.equal(runner.getSession({ taskId: 1544, cwd: "/tmp/stop-race" })?.state, "stopped");
  assert.equal(scheduler.pendingCount(), 0);
});

test("dispose cancels future ticks for active sessions", async () => {
  const scheduler = new FakeScheduler();

  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) =>
      createRuntimeStatus({
        cwd,
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 20,
          bestMetric: 19,
          lastRunStatus: "keep",
          lastRunMetric: 19,
        },
        runtimeProjection: {
          state: "running_checks",
          eventCount: 4,
          replayedEventCount: 4,
        },
      }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ observation }) => createNoopProjectorResult(observation.runtime),
  });

  const started = await runner.start({ taskId: 1544, cwd: "/tmp/dispose-session" });
  assert.equal(started.session.state, "running");
  assert.equal(scheduler.pendingCount(), 1);

  runner.dispose();
  assert.equal(scheduler.pendingCount(), 0);
  assert.equal(runner.getSession({ taskId: 1544, cwd: "/tmp/dispose-session" })?.state, "stopped");
});

test("blocked projector preflight stops the live session fail-closed", async () => {
  const scheduler = new FakeScheduler();

  const runner = new AutoresearchLiveSupervisionRunner({
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    observeRuntime: async (cwd) => createRuntimeStatus({ cwd }),
    loadLedger: async () => ({ entries: [], invalidLineCount: 0 }),
    projectLedgerEntries: async () => ({
      context: { blockedReason: null, completionReason: null },
    }),
    inspectFinalization: async ({ cwd, status }) => createFinalizationInspection(cwd, status),
    projectMilestone: async ({ observation }) => {
      const candidate = deriveAutoresearchAkMilestoneCandidate({
        runtime: observation.runtime,
        ledger: observation.ledger,
      });
      assert.equal(candidate.kind, "projectable");
      return {
        ok: false,
        action: "blocked",
        candidate,
        error: `campaign cwd ${observation.cwd} is outside anchored task repo /tmp/other-repo`,
      };
    },
  });

  const started = await runner.start({ taskId: 1544, cwd: "/tmp/fail-closed-campaign" });
  assert.equal(started.session.state, "blocked");
  assert.equal(started.session.lastProjectionAction, "blocked");
  assert.equal(
    started.session.lastError,
    "campaign cwd /tmp/fail-closed-campaign is outside anchored task repo /tmp/other-repo",
  );
  assert.equal(scheduler.pendingCount(), 0);
  assert.deepEqual(runner.listActiveSessions(), []);
});
