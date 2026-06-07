import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME } from "../src/core/decisions.ts";
import { resolveAutoresearchRuntimeSnapshotPath } from "../src/core/resume.ts";
import {
  appendReceipt,
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlan,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  executeAutoresearchResumeApply,
  formatAutoresearchResumeApplyPlan,
  formatAutoresearchResumeApplyResult,
  formatAutoresearchResumePlan,
  setAutoresearchRuntimeControl,
} from "../src/core/runtime.ts";

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
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

test("buildAutoresearchRuntimeStatus only persists snapshots when explicitly requested", () =>
  withTempDir((cwd) => {
    const runtimeSnapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);

    const readOnlyStatus = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(readOnlyStatus.runtimeSnapshot.reuse, "missing");
    assert.equal(existsSync(runtimeSnapshotPath), false);

    const persistedStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    assert.equal(persistedStatus.runtimeSnapshot.reuse, "missing");
    assert.equal(existsSync(runtimeSnapshotPath), true);

    const reusedStatus = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(reusedStatus.runtimeSnapshot.reuse, "reused");
  }));

test("resume plan is read-only and requires a reusable runtime snapshot", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-plan",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );

    const missingSnapshotPlan = buildAutoresearchResumePlan(cwd);
    assert.equal(missingSnapshotPlan.packetKind, "autoresearch.resume_plan.v1");
    assert.equal(missingSnapshotPlan.reusable, false);
    assert.match(
      missingSnapshotPlan.blockingReasons.join("\n"),
      /runtime snapshot is not reusable/,
    );
    assert.match(formatAutoresearchResumePlan(missingSnapshotPlan), /Read-only/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const reusablePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(reusablePlan.reusable, true);
    assert.equal(reusablePlan.snapshotReuse, "reused");
    assert.equal(reusablePlan.blockingReasons.length, 0);
    assert.match(reusablePlan.wouldRun ?? "", /autoresearch_runtime_loop/);
    assert.match(formatAutoresearchResumePlan(reusablePlan), /resume_plan\.v1/);
  }));

test("resume apply plan is plan-only and never authorizes execution", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-apply-plan",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );

    const missingSnapshotPlan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(missingSnapshotPlan.packetKind, "autoresearch.resume_apply_plan.v1");
    assert.equal(missingSnapshotPlan.action, "plan_only");
    assert.equal(missingSnapshotPlan.executionAuthorized, false);
    assert.equal(missingSnapshotPlan.planReady, false);
    assert.equal(missingSnapshotPlan.futureForegroundCall, null);
    assert.match(missingSnapshotPlan.blockedReasons.join("\n"), /resume_plan is not reusable/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const readyPlan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(readyPlan.planReady, true);
    assert.equal(readyPlan.executionAuthorized, false);
    assert.equal(readyPlan.executorAvailable, true);
    assert.match(readyPlan.futureForegroundCall ?? "", /autoresearch_runtime_resume_apply/);
    assert.match(readyPlan.futureExecutorContract, /callable foreground resume executor exists/);
    assert.match(formatAutoresearchResumeApplyPlan(readyPlan), /Plan-only proposal/);
    assert.match(formatAutoresearchResumeApplyPlan(readyPlan), /execution authorized: no/);
    assert.match(
      formatAutoresearchResumeApplyPlan(readyPlan),
      /autoresearch_runtime_resume_apply is the only callable executor/,
    );
  }));

test("resume apply executor requires exact keys, budgets, and foreground confirmation", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=90"'].join("\n"),
    );
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-apply",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const plan = buildAutoresearchResumeApplyPlan(cwd);
    assert.equal(plan.planReady, true);
    assert.ok(plan.resumePlan.segmentKey);
    assert.ok(plan.resumePlan.runtimeKey);

    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN",
      }),
      /operatorConfirmation must exactly equal/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 0,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /maxIterations must be a positive integer/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: plan.resumePlan.segmentKey,
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 0,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /maxWallClockMinutes must be a positive number/,
    );
    await assert.rejects(
      executeAutoresearchResumeApply({
        cwd,
        segmentKey: "wrong",
        runtimeKey: plan.resumePlan.runtimeKey,
        maxIterations: 1,
        maxWallClockMinutes: 1,
        operatorConfirmation: "RUN FOREGROUND RESUME",
      }),
      /segmentKey does not match/,
    );

    const result = await executeAutoresearchResumeApply({
      cwd,
      segmentKey: plan.resumePlan.segmentKey,
      runtimeKey: plan.resumePlan.runtimeKey,
      maxIterations: 1,
      maxWallClockMinutes: 1,
      operatorConfirmation: "RUN FOREGROUND RESUME",
    });
    assert.equal(result.action, "resume_apply");
    assert.equal(result.executionAuthorized, true);
    assert.equal(result.loopResult.completedIterations, 1);
    assert.equal(result.loopResult.peerMode, "off");
    assert.match(formatAutoresearchResumeApplyResult(result), /PI-AUTORESEARCH RESUME APPLY/);
    assert.match(formatAutoresearchResumeApplyResult(result), /foreground tool call/);
  });
});

test("resume plan blocks stale snapshots and explicit operator gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-gates",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 90,
        description: "new run after saved snapshot",
        timestamp: 3,
      }),
    );
    const stalePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(stalePlan.reusable, false);
    assert.equal(stalePlan.snapshotReuse, "runtime_mismatch");
    assert.match(stalePlan.blockingReasons.join("\n"), /runtime snapshot is not reusable/);

    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    setAutoresearchRuntimeControl({
      cwd,
      decision: "continue",
      reason: "reviewed foreground continuation",
      selectedAt: 4,
    });
    const continuePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(continuePlan.reusable, true);
    assert.equal(continuePlan.controlState, "continue");
    assert.match(continuePlan.wouldRun ?? "", /maxIterations: <explicit>/);

    setAutoresearchRuntimeControl({
      cwd,
      decision: "stop",
      reason: "operator interrupt",
      selectedAt: 5,
    });
    const stopPlan = buildAutoresearchResumePlan(cwd);
    assert.equal(stopPlan.reusable, false);
    assert.equal(stopPlan.controlState, "stop");
    assert.match(stopPlan.blockingReasons.join("\n"), /operator control state is stop/);
  }));

test("resume plan blocks rebaseline and finalize control gates", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-decision-gates",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 120,
        description: "candidate requiring rebaseline",
        timestamp: 2,
        decision: {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "rebaseline_needed",
          mappedDecision: "rebaseline",
          blockingReason: null,
          failureStage: null,
          stateRead: "The baseline moved.",
          nextHypothesis: "Rebaseline before another candidate run.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          expectedPrimaryEffect: "The resume plan must block ordinary continuation.",
          timestamp: 2,
        },
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const awaitingRebaselinePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(awaitingRebaselinePlan.reusable, false);
    assert.equal(awaitingRebaselinePlan.machineState, "rebaseline_needed");
    assert.equal(awaitingRebaselinePlan.controlState, "awaiting_operator");
    assert.match(
      awaitingRebaselinePlan.blockingReasons.join("\n"),
      /machine state is rebaseline_needed/,
    );
    assert.match(
      awaitingRebaselinePlan.blockingReasons.join("\n"),
      /awaiting explicit operator control/,
    );

    setAutoresearchRuntimeControl({
      cwd,
      decision: "rebaseline",
      reason: "accept rebaseline gate",
      selectedAt: 3,
    });
    const selectedRebaselinePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(selectedRebaselinePlan.reusable, false);
    assert.equal(selectedRebaselinePlan.controlState, "rebaseline");
    assert.match(
      selectedRebaselinePlan.blockingReasons.join("\n"),
      /operator control state is rebaseline/,
    );
  }));

test("resume plan blocks finalize gates before any resume executor", () =>
  withTempDir((cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "resume-finalize-gate",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
        createdAt: 1,
        benchmarkCommand: "bash autoresearch.sh",
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 80,
        description: "candidate ready to finalize",
        timestamp: 2,
        decision: {
          kind: "next_hypothesis",
          templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
          status: "finalize_candidate",
          mappedDecision: "finalize",
          blockingReason: null,
          failureStage: null,
          stateRead: "The segment is stable.",
          nextHypothesis: "Prepare finalization instead of another run.",
          targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
          expectedPrimaryEffect: "The resume plan must block ordinary continuation.",
          timestamp: 2,
        },
      }),
    );
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
    const awaitingFinalizePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(awaitingFinalizePlan.reusable, false);
    assert.equal(awaitingFinalizePlan.machineState, "finalize_candidate");
    assert.equal(awaitingFinalizePlan.controlState, "awaiting_operator");
    assert.match(
      awaitingFinalizePlan.blockingReasons.join("\n"),
      /machine state is finalize_candidate/,
    );
    assert.match(
      awaitingFinalizePlan.blockingReasons.join("\n"),
      /awaiting explicit operator control/,
    );

    setAutoresearchRuntimeControl({
      cwd,
      decision: "finalize",
      reason: "accept finalization gate",
      selectedAt: 3,
    });
    const selectedFinalizePlan = buildAutoresearchResumePlan(cwd);
    assert.equal(selectedFinalizePlan.reusable, false);
    assert.equal(selectedFinalizePlan.controlState, "finalize");
    assert.match(
      selectedFinalizePlan.blockingReasons.join("\n"),
      /operator control state is finalize/,
    );
  }));
