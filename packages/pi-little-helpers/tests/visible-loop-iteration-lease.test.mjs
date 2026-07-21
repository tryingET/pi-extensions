import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  parseVisibleLoopChildArgs,
  renderVisibleLoopChildCommand,
} from "../src/visibleLoopArgs.ts";
import {
  advanceLocalVisibleLoopIteration,
  bindVisibleLoopActivePlan,
  completeVisibleLoopIterationLease,
  enterVisibleLoopIterationLease,
  failVisibleLoopIterationLaunch,
  getVisibleLoopIterationLeasePath,
  launchNextVisibleLoopIteration,
  readVisibleLoopIterationLease,
} from "../src/visibleLoopContinuationClaim.ts";

const OWNER_A = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  processId: process.pid,
  processIncarnation: "incarnation-a",
};
const OWNER_B = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  processId: process.pid,
  processIncarnation: "incarnation-b",
};
const OWNER_C = {
  sessionId: "33333333-3333-4333-8333-333333333333",
  processId: process.pid,
  processIncarnation: "incarnation-c",
};

function fixture(runId) {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-lease-`);
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  return {
    runId,
    env,
    cleanup() {
      rmSync(stateHome, { recursive: true, force: true });
    },
  };
}

function activePlanOne(run) {
  const entered = enterVisibleLoopIterationLease({
    runId: run.runId,
    iteration: 1,
    owner: OWNER_A,
    env: run.env,
  });
  assert.equal(entered.ok, true);
  const bound = bindVisibleLoopActivePlan({
    runId: run.runId,
    iteration: 1,
    planId: "plan-one",
    owner: OWNER_A,
    env: run.env,
  });
  assert.equal(bound.ok, true);
}

test("two distinct sessions cannot both enter iteration 2 and a consumed token cannot replay", () => {
  const run = fixture("cross-session-iteration-two");
  try {
    activePlanOne(run);
    const launching = launchNextVisibleLoopIteration({
      runId: run.runId,
      completedIteration: 1,
      originatingPlanId: "plan-one",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(launching.ok, true);
    assert.match(launching.value, /^[A-Za-z0-9_-]{32,128}$/u);

    const winner = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_B,
      claimToken: launching.value,
      env: run.env,
    });
    assert.deepEqual(winner.ok && winner.value, "consumed_launch");

    const replay = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_C,
      claimToken: launching.value,
      env: run.env,
    });
    assert.equal(replay.ok, false, "the token is single-consumption");
    const secondStart = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_C,
      env: run.env,
    });
    assert.equal(secondStart.ok, false, "a different session cannot enter ACTIVE iteration 2");

    const observed = readVisibleLoopIterationLease(run.runId, run.env);
    assert.equal(observed.ok, true);
    assert.equal(observed.value.status, "ACTIVE");
    assert.equal(observed.value.iteration, 2);
    assert.deepEqual(observed.value.owner, OWNER_B);
    assert.equal(
      statSync(getVisibleLoopIterationLeasePath(run.runId, run.env)).mode & 0o777,
      0o600,
    );
  } finally {
    run.cleanup();
  }
});

test("FAILED launch permits exactly one explicit tokenless recovery", () => {
  const run = fixture("single-failed-recovery");
  try {
    activePlanOne(run);
    const launching = launchNextVisibleLoopIteration({
      runId: run.runId,
      completedIteration: 1,
      originatingPlanId: "plan-one",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(launching.ok, true);
    const failed = failVisibleLoopIterationLaunch({
      runId: run.runId,
      nextIteration: 2,
      originatingPlanId: "plan-one",
      claimToken: launching.value,
      owner: OWNER_A,
      failureReason: "Ghostty fixture rejected launch",
      env: run.env,
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.value.status, "FAILED");

    const winner = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_B,
      env: run.env,
    });
    assert.deepEqual(winner.ok && winner.value, "recovered_failure");
    const loser = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_C,
      env: run.env,
    });
    assert.equal(loser.ok, false);
    const tokenReplay = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 2,
      owner: OWNER_C,
      claimToken: launching.value,
      env: run.env,
    });
    assert.equal(tokenReplay.ok, false);
  } finally {
    run.cleanup();
  }
});

test("same-session local continuation advances ACTIVE directly before the next plan binds", () => {
  const run = fixture("local-active-advance");
  try {
    activePlanOne(run);
    const advanced = advanceLocalVisibleLoopIteration({
      runId: run.runId,
      iteration: 1,
      planId: "plan-one",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(advanced.ok, true);
    assert.equal(advanced.value.status, "ACTIVE");
    assert.equal(advanced.value.iteration, 2);
    assert.equal(advanced.value.planId, null);
    const bound = bindVisibleLoopActivePlan({
      runId: run.runId,
      iteration: 2,
      planId: "plan-two",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(bound.ok, true);
    assert.equal(bound.value.planId, "plan-two");
  } finally {
    run.cleanup();
  }
});

test("final completion closes the run lease permanently", () => {
  const run = fixture("completed-lease-tombstone");
  try {
    activePlanOne(run);
    const completed = completeVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 1,
      planId: "plan-one",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(completed.ok, true);
    assert.equal(completed.value.status, "COMPLETED");

    for (const owner of [OWNER_A, OWNER_B]) {
      const restart = enterVisibleLoopIterationLease({
        runId: run.runId,
        iteration: 1,
        owner,
        env: run.env,
      });
      assert.equal(restart.ok, false);
    }
    const observed = readVisibleLoopIterationLease(run.runId, run.env);
    assert.equal(observed.ok, true);
    assert.equal(observed.value.status, "COMPLETED");
    assert.equal(observed.value.planId, "plan-one");
  } finally {
    run.cleanup();
  }
});

test("invalid candidate state fails before rename and preserves the prior valid lease", () => {
  const run = fixture("prewrite-validation");
  try {
    const entered = enterVisibleLoopIterationLease({
      runId: run.runId,
      iteration: 1,
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(entered.ok, true);
    const invalid = bindVisibleLoopActivePlan({
      runId: run.runId,
      iteration: 1,
      planId: "",
      owner: OWNER_A,
      env: run.env,
    });
    assert.equal(invalid.ok, false);
    const observed = readVisibleLoopIterationLease(run.runId, run.env);
    assert.equal(observed.ok, true);
    assert.equal(observed.value.status, "ACTIVE");
    assert.equal(observed.value.planId, null);
  } finally {
    run.cleanup();
  }
});

test("child continuation command round-trips quoted paths and an explicit claim flag", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-claim";
  const configPath = "/tmp/visible loop/state's config.json";
  const command = renderVisibleLoopChildCommand(configPath, token);
  assert.match(command, /^\/visible-loop-child /u);
  assert.match(command, / --claim-token /u);
  const parsed = parseVisibleLoopChildArgs(command.replace(/^\/visible-loop-child\s+/u, ""));
  assert.deepEqual(parsed, { ok: true, configPath, claimToken: token });
  assert.equal(parseVisibleLoopChildArgs(`${configPath} --claim-token short`).ok, false);
  assert.equal(parseVisibleLoopChildArgs(`"unterminated`).ok, false);
  assert.throws(
    () => renderVisibleLoopChildCommand("/tmp/control\npath.json", token),
    /invalid visible-loop child config path/u,
  );
});
