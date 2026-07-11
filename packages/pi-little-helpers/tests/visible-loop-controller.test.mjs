import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  assertControllerState,
  createVisibleLoopControllerState,
  decideVisibleLoopContinuation,
  resolveVisibleLoopAdaptiveControllerConfig,
  transitionVisibleLoopController,
  validateVisibleLoopCompletionInvariants,
} from "../src/visibleLoopController.ts";
import {
  getVisibleLoopControllerStatePath,
  loadVisibleLoopControllerState,
  writeVisibleLoopControllerState,
} from "../src/visibleLoopState.ts";

function enabledConfig(overrides = {}) {
  const config = resolveVisibleLoopAdaptiveControllerConfig({
    PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
    ...overrides,
  });
  assert.ok(config);
  return config;
}

function deliverIteration(config, promptCount = 3) {
  let state = createVisibleLoopControllerState();
  state = transitionVisibleLoopController(config, state, {
    kind: "child_started",
    iteration: 1,
  }).state;
  state = transitionVisibleLoopController(config, state, {
    kind: "initial_prompt_delivered",
    iteration: 1,
    promptIndex: 1,
  }).state;
  for (let promptIndex = 2; promptIndex <= promptCount; promptIndex += 1) {
    state = transitionVisibleLoopController(config, state, {
      kind: "followup_prompt_delivered",
      iteration: 1,
      promptIndex,
    }).state;
  }
  state = transitionVisibleLoopController(config, state, {
    kind: "completion_checkpoint_delivered",
    iteration: 1,
  }).state;
  return state;
}

test("adaptive controller remains opt-in and bounds configured cost", () => {
  assert.equal(resolveVisibleLoopAdaptiveControllerConfig({}), undefined);
  assert.equal(
    resolveVisibleLoopAdaptiveControllerConfig({
      PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "true",
    }),
    undefined,
  );
  assert.equal(enabledConfig().maxWeightedCost, 100);
  assert.equal(enabledConfig({ PI_VISIBLE_LOOP_MAX_WEIGHTED_COST: "17" }).maxWeightedCost, 17);
  assert.equal(enabledConfig({ PI_VISIBLE_LOOP_MAX_WEIGHTED_COST: "NaN" }).maxWeightedCost, 100);
});

test("host-recorded delivery receipts satisfy bounded completion invariants", () => {
  const config = enabledConfig();
  const state = deliverIteration(config);

  const result = validateVisibleLoopCompletionInvariants({
    state,
    iteration: 1,
    promptCount: 3,
    delegatedCompletion: false,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.proofIds : [], [
    "iteration:1:prompt:1:delivered",
    "iteration:1:prompt:2:delivered",
    "iteration:1:prompt:3:delivered",
    "iteration:1:completion-checkpoint:delivered",
  ]);
  assert.ok(state.weightedCost > 0);
});

test("delivery failure invalidates completion proofs and fails closed", () => {
  const config = enabledConfig();
  let state = deliverIteration(config);
  state = transitionVisibleLoopController(config, state, {
    kind: "prompt_delivery_failed",
    iteration: 1,
    promptIndex: 2,
    reason: "template drift\nsecret-shaped detail omitted",
  }).state;

  const result = validateVisibleLoopCompletionInvariants({
    state,
    iteration: 1,
    promptCount: 3,
    delegatedCompletion: false,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.ok ? [] : result.invalidatedProofIds, [
    "iteration:1:prompt:1:delivered",
    "iteration:1:prompt:2:delivered",
    "iteration:1:prompt:3:delivered",
    "iteration:1:completion-checkpoint:delivered",
  ]);
  assert.ok(state.invalidations.every((item) => !item.reason.includes("\n")));
});

test("restored controller state rejects malformed or forged proof entries", () => {
  const valid = deliverIteration(enabledConfig(), 1);
  assert.doesNotThrow(() => assertControllerState(valid));

  assert.throws(
    () => assertControllerState({ ...valid, proofs: [null] }),
    /controller proof must be an object/,
  );
  assert.throws(
    () =>
      assertControllerState({
        ...valid,
        proofs: [{ ...valid.proofs[0], id: "iteration:1:prompt:99:delivered" }],
      }),
    /proof id is inconsistent/,
  );
  assert.throws(
    () =>
      assertControllerState({
        ...valid,
        invalidations: [
          { proofId: "iteration:99:prompt:1:delivered", reason: "stale", eventSequence: 1 },
        ],
      }),
    /controller invalidation is invalid/,
  );
});

test("controller state paths reject run-id traversal", () => {
  assert.throws(
    () =>
      getVisibleLoopControllerStatePath("../escape", {
        XDG_STATE_HOME: "/tmp/visible-loop-controller-traversal-test",
      }),
    /safe visible-loop identifier/,
  );
});

test("run-level controller state preserves cumulative weighted cost", () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-controller-state-`);
  try {
    const adaptiveController = enabledConfig();
    const config = {
      schemaVersion: 1,
      runId: "visible-loop-controller-cost-test",
      loopCount: 2,
      cwd: "/repo",
      prompts: ["one"],
      reportBack: "manual",
      adaptiveController,
      createdAt: "2026-07-11T00:00:00.000Z",
    };
    const state = deliverIteration(adaptiveController, 1);
    writeVisibleLoopControllerState(config, state, { XDG_STATE_HOME: stateHome });

    const restored = loadVisibleLoopControllerState(config, { XDG_STATE_HOME: stateHome });

    assert.equal(restored.ok, true);
    assert.equal(restored.ok ? restored.state.weightedCost : -1, state.weightedCost);
    assert.deepEqual(restored.ok ? restored.state.proofs : [], state.proofs);

    writeFileSync(
      getVisibleLoopControllerStatePath(config, { XDG_STATE_HOME: stateHome }),
      JSON.stringify({ ...state, proofs: [null] }),
    );
    const malformed = loadVisibleLoopControllerState(config, { XDG_STATE_HOME: stateHome });
    assert.equal(malformed.ok, false);
    assert.match(malformed.ok ? "" : malformed.error, /controller proof must be an object/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("delegated completion requires its host-recorded request receipt", () => {
  const config = enabledConfig();
  let state = deliverIteration(config, 2);

  const missing = validateVisibleLoopCompletionInvariants({
    state,
    iteration: 1,
    promptCount: 2,
    delegatedCompletion: true,
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.ok ? [] : missing.missingProofIds, [
    "iteration:1:delegated-completion:requested",
  ]);

  state = transitionVisibleLoopController(config, state, {
    kind: "delegated_completion_requested",
    iteration: 1,
  }).state;
  const accepted = validateVisibleLoopCompletionInvariants({
    state,
    iteration: 1,
    promptCount: 2,
    delegatedCompletion: true,
  });
  assert.equal(accepted.ok, true);
});

test("HTN continuation is deterministic and falls back when cost exceeds budget", () => {
  assert.deepEqual(
    decideVisibleLoopContinuation({
      completedIterations: 2,
      loopCount: 2,
      weightedCost: 999,
      maxWeightedCost: 10,
      hasNewSessionContinuation: true,
    }),
    { method: "complete", reason: "loop_count_reached" },
  );
  assert.deepEqual(
    decideVisibleLoopContinuation({
      completedIterations: 1,
      loopCount: 2,
      weightedCost: 5,
      maxWeightedCost: 10,
      hasNewSessionContinuation: true,
    }),
    { method: "new_session", reason: "fresh_proof_within_budget" },
  );
  assert.deepEqual(
    decideVisibleLoopContinuation({
      completedIterations: 1,
      loopCount: 2,
      weightedCost: 11,
      maxWeightedCost: 10,
      hasNewSessionContinuation: true,
    }),
    { method: "baseline_fallback", reason: "budget_exceeded" },
  );
  assert.deepEqual(
    decideVisibleLoopContinuation({
      completedIterations: 1,
      loopCount: 2,
      weightedCost: 100_001,
      maxWeightedCost: 100_000,
      hasNewSessionContinuation: false,
    }),
    { method: "baseline_fallback", reason: "budget_exceeded" },
  );
});
