import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type AutoresearchControlStateV1,
  type AutoresearchRuntimeSnapshotInput,
  loadAutoresearchRuntimeControlState,
  persistAutoresearchRuntimeSnapshot,
  resolveAutoresearchRuntimeSnapshotPath,
} from "../src/core/resume.ts";
import type { AutoresearchRunDecisionSummary } from "../src/core/runtime.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-resume-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function createDecisionSummary(
  timestamp: number,
  overrides: Partial<AutoresearchRunDecisionSummary> = {},
): AutoresearchRunDecisionSummary {
  return {
    kind: "next_hypothesis",
    templateName: "pi-autoresearch-next-hypothesis",
    status: "finalize_candidate",
    mappedDecision: "finalize",
    blockingReason: null,
    failureStage: null,
    stateRead: "The latest bounded run is finalize-worthy.",
    nextHypothesis: "Stop iterating and prepare finalization.",
    targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
    expectedPrimaryEffect: "The runtime should hold for a finalize decision.",
    timestamp,
    ...overrides,
  };
}

function createSnapshotInput(
  cwd: string,
  overrides: {
    machine?: Partial<AutoresearchRuntimeSnapshotInput["machine"]>;
    segment?: Partial<AutoresearchRuntimeSnapshotInput["segment"]>;
    decision?: Partial<AutoresearchRuntimeSnapshotInput["decision"]>;
  } = {},
): AutoresearchRuntimeSnapshotInput {
  return {
    cwd,
    phase: "bounded_runtime_kernel",
    projectionSource: "ledger",
    machine: {
      state: "ready",
      resumeState: null,
      blockedReason: null,
      completionReason: null,
      ...overrides.machine,
    },
    segment: {
      name: "widget-speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "bash autoresearch.sh",
      checksCommand: "bash autoresearch.checks.sh",
      runCount: 3,
      successfulRunCount: 3,
      baselineMetric: 120,
      bestMetric: 101,
      lastRunStatus: "candidate",
      lastRunMetric: 101,
      ...overrides.segment,
    },
    decision: {
      availability: "available_last_used_successfully",
      lastPostRunDecision: createDecisionSummary(30),
      ...overrides.decision,
    },
  };
}

function createControl(
  overrides: Partial<AutoresearchControlStateV1> = {},
): AutoresearchControlStateV1 {
  return {
    kind: "continue",
    allowedActions: ["continue", "stop"],
    reason: "operator approved another bounded run",
    selectedAt: 42,
    ...overrides,
  };
}

test("resume loader reuses a saved legal control overlay when the runtime posture matches", () =>
  withTempDir((cwd) => {
    const current = createSnapshotInput(cwd, {
      machine: {
        state: "finalize_candidate",
        resumeState: "finalize_candidate",
      },
      decision: {
        lastPostRunDecision: createDecisionSummary(55),
      },
    });

    persistAutoresearchRuntimeSnapshot({
      cwd,
      current,
      control: createControl({
        kind: "finalize",
        allowedActions: ["continue", "finalize", "stop"],
        reason: "operator chose finalization as the next phase",
        selectedAt: 123,
      }),
      updatedAt: 999,
    });

    const result = loadAutoresearchRuntimeControlState({ cwd, current });
    assert.equal(result.snapshotStatus.reuse, "reused");
    assert.equal(result.control.kind, "finalize");
    assert.deepEqual(result.control.allowedActions, ["continue", "finalize", "stop"]);
    assert.equal(result.control.reason, "operator chose finalization as the next phase");
    assert.equal(result.control.selectedAt, 123);
    assert.equal(result.snapshot?.segment.name, "widget-speed");
    assert.equal(
      readFileSync(resolveAutoresearchRuntimeSnapshotPath(cwd), "utf8").includes(
        '"type": "runtime_snapshot"',
      ),
      true,
    );
  }));

test("resume loader falls back cleanly when no snapshot exists yet", () =>
  withTempDir((cwd) => {
    const current = createSnapshotInput(cwd, {
      machine: {
        state: "ready",
        resumeState: null,
      },
    });

    const result = loadAutoresearchRuntimeControlState({ cwd, current });

    assert.equal(result.snapshot, null);
    assert.equal(result.snapshotStatus.exists, false);
    assert.equal(result.snapshotStatus.reuse, "missing");
    assert.match(result.snapshotStatus.path ?? "", /autoresearch\.runtime\.json$/);
    assert.equal(result.control.kind, "none");
    assert.deepEqual(result.control.allowedActions, ["continue", "stop"]);
    assert.equal(result.control.selectedAt, null);
  }));

test("resume loader rejects a saved snapshot when the configured segment fingerprint changes", () =>
  withTempDir((cwd) => {
    const saved = createSnapshotInput(cwd);
    persistAutoresearchRuntimeSnapshot({ cwd, current: saved });

    const current = createSnapshotInput(cwd, {
      segment: {
        benchmarkCommand: "node ./scripts/benchmark.mjs",
      },
    });
    const result = loadAutoresearchRuntimeControlState({ cwd, current });

    assert.equal(result.snapshotStatus.reuse, "segment_mismatch");
    assert.equal(
      result.snapshotStatus.discardedReason,
      "snapshot segment fingerprint no longer matches the configured segment",
    );
    assert.equal(result.control.kind, "none");
    assert.deepEqual(result.control.allowedActions, ["continue", "stop"]);
  }));

test("resume loader fails closed when the saved snapshot claims a later machine state", () =>
  withTempDir((cwd) => {
    const saved = createSnapshotInput(cwd, {
      machine: {
        state: "finalize_candidate",
        resumeState: "finalize_candidate",
      },
    });
    persistAutoresearchRuntimeSnapshot({
      cwd,
      current: saved,
      control: createControl({
        kind: "finalize",
        allowedActions: ["continue", "finalize", "stop"],
      }),
    });

    const current = createSnapshotInput(cwd, {
      machine: {
        state: "ready",
        resumeState: null,
      },
    });
    const result = loadAutoresearchRuntimeControlState({ cwd, current });

    assert.equal(result.snapshotStatus.reuse, "state_ahead");
    assert.match(result.snapshotStatus.discardedReason ?? "", /snapshot state finalize_candidate/);
    assert.equal(result.control.kind, "none");
    assert.deepEqual(result.control.allowedActions, ["continue", "stop"]);
  }));

test("resume loader rejects saved control kinds that are illegal for the current posture", () =>
  withTempDir((cwd) => {
    const current = createSnapshotInput(cwd, {
      machine: {
        state: "rebaseline_needed",
        resumeState: "rebaseline_needed",
      },
      decision: {
        lastPostRunDecision: createDecisionSummary(60, {
          status: "rebaseline_needed",
          mappedDecision: "rebaseline",
          nextHypothesis: "Rebaseline before another bounded run.",
        }),
      },
    });

    persistAutoresearchRuntimeSnapshot({
      cwd,
      current,
      control: createControl({
        kind: "continue",
        allowedActions: ["continue", "stop"],
        reason: "stale continue selection",
      }),
    });

    const result = loadAutoresearchRuntimeControlState({ cwd, current });
    assert.equal(result.snapshotStatus.reuse, "illegal_control");
    assert.match(result.snapshotStatus.discardedReason ?? "", /snapshot control kind continue/);
    assert.equal(result.control.kind, "awaiting_operator");
    assert.deepEqual(result.control.allowedActions, ["rebaseline", "stop"]);
  }));

test("resume loader reports unreadable snapshot files and falls back to derived control", () =>
  withTempDir((cwd) => {
    writeFileSync(resolveAutoresearchRuntimeSnapshotPath(cwd), "{not valid json\n", "utf8");

    const current = createSnapshotInput(cwd);
    const result = loadAutoresearchRuntimeControlState({ cwd, current });

    assert.equal(result.snapshotStatus.reuse, "parse_failed");
    assert.match(result.snapshotStatus.discardedReason ?? "", /Expected property name/);
    assert.equal(result.control.kind, "none");
    assert.deepEqual(result.control.allowedActions, ["continue", "stop"]);
  }));
