// summary: verifies child prompt sequencing, explicit completion checkpoints, adaptive receipts, and next-iteration launch.
// read_when:
//   - changing visible-loop child queues, completion checkpoint delivery, controller persistence, or iteration continuation.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  GOVERNED_DEEP_REVIEW_PROMPT,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopMessageStart,
  handleVisibleLoopToolExecutionEnd,
  handleVisibleLoopToolExecutionStart,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { readVisibleLoopIterationLease } from "../src/visibleLoopContinuationClaim.ts";
import {
  hasVisibleLoopBarrierSuccess,
  parseVisibleLoopPlanProgress,
} from "../src/visibleLoopPlan.ts";
import { getActiveVisibleLoopSnapshotPath } from "../src/visibleLoopRecovery.ts";
import {
  createContext,
  createGovernedDeepReviewPreflightStub,
  getLatestGovernedDeepReviewPreflightReceipt,
  observeVisibleLoopMessageAt,
  registerExtension,
} from "./sidequest-harness.mjs";

function vaultStart(toolCallId) {
  return {
    toolCallId,
    toolName: "vault_execute_template",
    args: { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE },
  };
}

function vaultSuccess(toolCallId) {
  return {
    toolCallId,
    toolName: "vault_execute_template",
    result: {
      details: {
        ok: true,
        templateName: "deep-review",
        executionSurface: "workflow_execute",
        handoffId: `handoff-${toolCallId}`,
        runId: `run-${toolCallId}`,
        status: "done",
        preflightNonce: getLatestGovernedDeepReviewPreflightReceipt().nonce,
        preflightReceiptDigest: getLatestGovernedDeepReviewPreflightReceipt().receiptDigest,
        preflightRegistryId: getLatestGovernedDeepReviewPreflightReceipt().registryId,
      },
    },
    isError: false,
  };
}

function setup(prompts, options = {}) {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-frontier-`);
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  const extension = createSidequestExtension({
    env,
    governedDeepReviewPreflight: createGovernedDeepReviewPreflightStub(),
    ...(options.extensionOptions ?? {}),
  });
  const registered = registerExtension(extension);
  const harness = createContext({
    cwd: `${stateHome}/repo`,
    sessionFile: "/sessions/frontier.jsonl",
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
  });
  const config = createVisibleLoopRunConfig({
    loopCount: options.loopCount ?? 1,
    cwd: harness.ctx.cwd,
    reportBack: "manual",
    runId: options.runId ?? `frontier-${Date.now()}-${Math.random()}`,
    executionBinding: {
      mode: "operator_objective",
      objective: options.objective ?? "frontier checkpoint test",
    },
    prompts,
  });
  const configPath = writeVisibleLoopRunConfig(config, env);
  return { stateHome, env, registered, harness, config, configPath };
}

async function observeAndSettle(setupResult, index, beforeSettle) {
  const { events, userMessages } = setupResult.registered;
  await observeVisibleLoopMessageAt(events, userMessages, index, setupResult.harness.ctx);
  if (beforeSettle) await beforeSettle();
  await events.get("agent_settled")[0]({}, setupResult.harness.ctx);
}

function createFakeTimer() {
  const pending = new Set();
  let unrefCount = 0;
  const runtime = {
    setTimeout(callback, timeoutMs) {
      const handle = {
        callback,
        timeoutMs,
        unref() {
          unrefCount += 1;
        },
      };
      pending.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
  };
  return {
    runtime,
    get pendingCount() {
      return pending.size;
    },
    get unrefCount() {
      return unrefCount;
    },
    fireNext() {
      const handle = pending.values().next().value;
      assert.ok(handle, "expected a pending fake timer");
      pending.delete(handle);
      handle.callback();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function getActiveSnapshotPath(run) {
  const activeDir = `${run.stateHome}/pi-little-helpers/visible-loop/active`;
  const [snapshotName] = readdirSync(activeDir);
  return snapshotName ? `${activeDir}/${snapshotName}` : null;
}

function readActiveSnapshot(run) {
  const path = getActiveSnapshotPath(run);
  assert.ok(path, "expected an active visible-loop snapshot");
  return JSON.parse(readFileSync(path, "utf8"));
}

function readStatusEntries(run) {
  const path = `${run.stateHome}/pi-little-helpers/visible-loop/${run.config.runId}.status.jsonl`;
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function readRunLease(run) {
  const result = readVisibleLoopIterationLease(run.config.runId, run.env);
  assert.equal(result.ok, true);
  assert.ok(result.value);
  return result.value;
}

async function completeFirstIteration(run, pi, options, userMessages) {
  await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env, options);
  handleVisibleLoopMessageStart(
    { message: { role: "user", content: userMessages[0].message } },
    pi,
    run.harness.ctx,
    run.env,
    options,
  );
  handleVisibleLoopAgentSettled(pi, run.harness.ctx, run.env, options);
  handleVisibleLoopMessageStart(
    { message: { role: "user", content: userMessages[1].message } },
    pi,
    run.harness.ctx,
    run.env,
    options,
  );
  const completed = await startVisibleLoopChildCompleteRunner(
    `${run.configPath} --iteration 1`,
    pi,
    run.harness.ctx,
    run.env,
    options,
  );
  assert.equal(completed.accepted, true);
}

test("persisted successful barriers require an exact non-empty handoff", () => {
  const persisted = {
    planId: "corrupt-review-plan",
    iteration: 1,
    lifecycle: "active",
    steps: [
      {
        index: 0,
        prompt: GOVERNED_DEEP_REVIEW_PROMPT,
        label: "Governed deep-review",
        kind: "prompt",
        governedBarrier: true,
      },
    ],
    settledCount: 0,
    frontier: { stepIndex: 0, state: "running" },
    barrierAttempts: [{ stepIndex: 0, toolCallId: "review-call", status: "succeeded" }],
  };

  assert.equal(parseVisibleLoopPlanProgress(persisted), null);
  assert.equal(
    parseVisibleLoopPlanProgress({
      ...persisted,
      barrierAttempts: [
        { stepIndex: 0, toolCallId: "review-call", status: "succeeded", handoffId: "   " },
      ],
    }),
    null,
  );
  const valid = parseVisibleLoopPlanProgress({
    ...persisted,
    barrierAttempts: [
      {
        stepIndex: 0,
        toolCallId: " review-call ",
        status: "succeeded",
        handoffId: " handoff-1 ",
      },
    ],
  });
  assert.ok(valid);
  assert.equal(valid.barrierAttempts[0].handoffId, "handoff-1");
  assert.equal(hasVisibleLoopBarrierSuccess(valid, 0), true);
});

test("followUpMode=all cannot skip a duplicate-text frontier or complete early", async () => {
  const run = setup(["same prompt", "same prompt", GOVERNED_DEEP_REVIEW_PROMPT, "after review"]);
  try {
    const { commands, events, tools, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1, "only one executable frontier is submitted");
    assert.ok(run.harness.widgets.at(-1).value.some((line) => line.includes("planned 5")));
    assert.ok(
      run.harness.widgets.at(-1).value.some((line) => line.includes("submitted/pending 1")),
    );
    assert.ok(run.harness.widgets.at(-1).value.some((line) => line.includes("host queued 0")));

    // Model followUpMode=all delivering multiple user starts before one assistant settles.
    await observeVisibleLoopMessageAt(events, userMessages, 0, run.harness.ctx);
    await observeVisibleLoopMessageAt(events, userMessages, 0, run.harness.ctx);
    await events.get("message_start")[0](
      { message: { role: "user", content: GOVERNED_DEEP_REVIEW_PROMPT } },
      run.harness.ctx,
    );
    assert.equal(userMessages.length, 1);
    await events.get("agent_settled")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 2);
    assert.match(userMessages[1].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.ok(userMessages[1].message.endsWith("same prompt"));
    assert.equal(userMessages[1].options?.deliverAs, "followUp");

    await events.get("agent_settled")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 2, "settled without exact message_start cannot advance");
    await observeAndSettle(run, 1);
    assert.equal(userMessages.length, 3);
    assert.match(userMessages[2].message, /Governed deep-review execution step/);

    await observeVisibleLoopMessageAt(events, userMessages, 2, run.harness.ctx);
    await events.get("tool_execution_start")[0](vaultStart("review-1"), run.harness.ctx);
    await events.get("tool_execution_end")[0](vaultSuccess("review-1"), run.harness.ctx);
    assert.equal(userMessages.length, 3, "receipt alone does not release downstream work");
    const reviewSuccess = readStatusEntries(run).find(
      (entry) => entry.event === "governed_deep_review_succeeded",
    );
    assert.equal(reviewSuccess.runId, run.config.runId, "status keeps visible-loop run identity");
    assert.equal(reviewSuccess.workflowRunId, "run-review-1");
    await events.get("agent_settled")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 4);
    assert.match(userMessages[3].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.ok(userMessages[3].message.endsWith("after review"));

    await observeAndSettle(run, 3);
    assert.equal(userMessages.length, 5);
    assert.match(userMessages[4].message, /Visible-loop internal completion checkpoint/);
    await observeVisibleLoopMessageAt(events, userMessages, 4, run.harness.ctx);
    const completion = await tools
      .get("visible_loop_child_complete")
      .execute(
        "complete",
        { configPath: run.configPath, iteration: 1 },
        null,
        null,
        run.harness.ctx,
      );
    assert.equal(completion.details.accepted, true);
    assert.ok(
      run.harness.widgets.some((entry) => entry.value?.[0]?.includes("finalized")),
      "completion finalizes the exact iteration plan",
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(run.harness.widgets.at(-1).value, undefined, "final completion clears the widget");
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("a second governed deep-review call fails closed and cannot satisfy the barrier", async () => {
  const run = setup([GOVERNED_DEEP_REVIEW_PROMPT, "must-not-run"]);
  try {
    const { commands, events, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    await observeVisibleLoopMessageAt(events, userMessages, 0, run.harness.ctx);
    await events.get("tool_execution_start")[0](vaultStart("call-a"), run.harness.ctx);
    await events.get("tool_execution_start")[0](vaultStart("call-b"), run.harness.ctx);
    await events.get("tool_execution_end")[0](vaultSuccess("call-a"), run.harness.ctx);
    await events.get("agent_settled")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.ok(
      run.harness.notifications.some((entry) => entry.message.includes("duplicate governed")),
    );
    assert.ok(run.harness.widgets.at(-1).value[0].includes("failed closed"));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("cross-session events cannot observe, settle, submit, or complete the active owner's frontier", async () => {
  const run = setup([GOVERNED_DEEP_REVIEW_PROMPT, "after review"]);
  const sessionB = createContext({
    cwd: run.harness.ctx.cwd,
    sessionFile: "/sessions/frontier-b.jsonl",
    sessionId: "session-b",
  });
  try {
    assert.notEqual(
      getActiveVisibleLoopSnapshotPath("session-a/b", run.env),
      getActiveVisibleLoopSnapshotPath("session-a-b", run.env),
      "distinct exact session owners cannot collide on one snapshot path",
    );
    const { commands, events, tools, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.equal(
      readActiveSnapshot(run).ownerSessionId,
      run.harness.ctx.sessionManager.getSessionId(),
    );
    assert.equal(readRunLease(run).owner.sessionId, run.harness.ctx.sessionManager.getSessionId());

    await observeVisibleLoopMessageAt(events, userMessages, 0, run.harness.ctx);
    const activePath = getActiveSnapshotPath(run);
    const statusPath = `${run.stateHome}/pi-little-helpers/visible-loop/${run.config.runId}.status.jsonl`;
    const snapshotBeforeForeignEvents = readFileSync(activePath, "utf8");
    const statusBeforeForeignEvents = readFileSync(statusPath, "utf8");

    await commands.get("visible-loop-child").handler(run.configPath, sessionB.ctx);

    await events.get("agent_start")[0]({}, sessionB.ctx);
    await events.get("tool_execution_start")[0](vaultStart("foreign-review"), sessionB.ctx);
    await events.get("tool_execution_end")[0](vaultSuccess("foreign-review"), sessionB.ctx);
    await events.get("agent_settled")[0]({}, sessionB.ctx);
    const foreignCompletion = await tools
      .get("visible_loop_child_complete")
      .execute(
        "foreign-completion",
        { configPath: run.configPath, iteration: 1 },
        null,
        null,
        sessionB.ctx,
      );

    assert.equal(foreignCompletion.details.accepted, false);
    assert.match(foreignCompletion.details.reason, /belongs to another session/);
    assert.equal(userMessages.length, 1, "session B cannot submit A's next frontier");
    assert.equal(sessionB.widgets.length, 0, "session B cannot render A's plan");
    assert.ok(
      sessionB.notifications.some((entry) => entry.message.includes("another session owns")),
      "session B cannot overwrite A's active pointer",
    );
    assert.equal(readFileSync(activePath, "utf8"), snapshotBeforeForeignEvents);
    assert.equal(readFileSync(statusPath, "utf8"), statusBeforeForeignEvents);
    assert.equal(readRunLease(run).status, "ACTIVE");
    assert.equal(readRunLease(run).owner.sessionId, run.harness.ctx.sessionManager.getSessionId());

    await events.get("tool_execution_start")[0](vaultStart("owner-review"), run.harness.ctx);
    await events.get("tool_execution_end")[0](vaultSuccess("owner-review"), run.harness.ctx);
    await events.get("agent_settled")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 2, "session A still owns and advances its exact frontier");
    assert.match(userMessages[1].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.ok(userMessages[1].message.endsWith("after review"));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("same-session reload resumes without replay while fresh restart and indeterminate effects fail closed", async () => {
  // Non-governed recovery remains available without a fresh owner capability.
  const run = setup(["alpha", "beta"]);
  try {
    const { commands, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1);

    resetVisibleLoopRuntimeForRecoveryTest();
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1, "same-process reload does not duplicate pending delivery");
    assert.ok(run.harness.notifications.at(-1).message.includes("resumed without duplicate"));

    const activeDir = `${run.stateHome}/pi-little-helpers/visible-loop/active`;
    const activePath = `${activeDir}/${readdirSync(activeDir)[0]}`;
    const persisted = JSON.parse(readFileSync(activePath, "utf8"));
    const processIncarnation = persisted.hostProcessIncarnation;
    assert.equal(persisted.hostProcessId, process.pid);
    assert.equal(typeof processIncarnation, "string");
    persisted.hostProcessId = process.pid;
    persisted.hostProcessIncarnation = `${processIncarnation}-different-incarnation`;
    writeFileSync(activePath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
    resetVisibleLoopRuntimeForRecoveryTest();
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.ok(
      run.harness.notifications.some((entry) => entry.message.includes("fresh host restart")),
    );

    persisted.hostProcessId = process.pid;
    persisted.hostProcessIncarnation = processIncarnation;
    persisted.stopped = false;
    persisted.plan.lifecycle = "active";
    persisted.plan.failureReason = undefined;
    persisted.plan.frontier.state = "submitting";
    writeFileSync(activePath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
    resetVisibleLoopRuntimeForRecoveryTest();
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.ok(run.harness.notifications.some((entry) => entry.message.includes("indeterminate")));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("persisted governed state cannot recover from a missing receipt or without fresh owner preflight", async () => {
  const run = setup([GOVERNED_DEEP_REVIEW_PROMPT, "after review"], {
    runId: "governed-recovery-fresh-owner",
  });
  try {
    const { commands, events, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    const activePath = getActiveSnapshotPath(run);
    assert.ok(activePath);
    const persisted = JSON.parse(readFileSync(activePath, "utf8"));
    delete persisted.governedDeepReviewPreflight;
    writeFileSync(activePath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

    resetVisibleLoopRuntimeForRecoveryTest();
    await events.get("agent_start")[0]({}, run.harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.ok(
      run.harness.notifications.some((entry) =>
        entry.message.includes("cannot authorize recovery without a fresh owner preflight"),
      ),
    );

    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    assert.equal(userMessages.length, 1, "fresh preflight recovery does not replay the prompt");
    assert.ok(run.harness.notifications.at(-1).message.includes("resumed without duplicate"));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("recovery rejects a transitional finalized snapshot before its completed iteration is bound", async () => {
  const run = setup(["work"], { loopCount: 2, runId: "transitional-finalized-snapshot" });
  const userMessages = [];
  const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
  try {
    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env);
    const activePath = getActiveSnapshotPath(run);
    assert.ok(activePath);
    const transitional = readActiveSnapshot(run);
    transitional.stopped = true;
    transitional.plan.lifecycle = "finalized";
    transitional.plan.settledCount = transitional.plan.steps.length;
    transitional.plan.frontier = null;
    writeFileSync(activePath, `${JSON.stringify(transitional, null, 2)}\n`, "utf8");

    const statusPath = `${run.stateHome}/pi-little-helpers/visible-loop/${run.config.runId}.status.jsonl`;
    const existingStatus = readFileSync(statusPath, "utf8");
    writeFileSync(
      statusPath,
      `${existingStatus}${JSON.stringify({ event: "iteration_completed", completedIterations: 1 })}\n`,
      "utf8",
    );
    resetVisibleLoopRuntimeForRecoveryTest();

    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env);
    assert.equal(userMessages.length, 1, "transitional state cannot start iteration 2 locally");
    assert.ok(
      run.harness.notifications.some((entry) =>
        entry.message.includes("entering iteration 2 from ACTIVE(1)"),
      ),
    );
    assert.equal(readActiveSnapshot(run).completedIterations, 0);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

const retiredFailureScenarios = [
  {
    id: "deep-review-tool-failure",
    prompts: [GOVERNED_DEEP_REVIEW_PROMPT],
    async trigger({ run, pi, options, messages }) {
      handleVisibleLoopMessageStart(
        { message: { role: "user", content: messages[0].message } },
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      handleVisibleLoopToolExecutionStart(
        vaultStart("failed-review"),
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      handleVisibleLoopToolExecutionEnd(
        {
          toolCallId: "failed-review",
          toolName: "vault_execute_template",
          result: { details: { ok: false } },
          isError: true,
        },
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
    },
  },
  {
    id: "duplicate-deep-review-call",
    prompts: [GOVERNED_DEEP_REVIEW_PROMPT],
    async trigger({ run, pi, options, messages }) {
      handleVisibleLoopMessageStart(
        { message: { role: "user", content: messages[0].message } },
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      handleVisibleLoopToolExecutionStart(
        vaultStart("review-a"),
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      handleVisibleLoopToolExecutionStart(
        vaultStart("review-b"),
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
    },
  },
  {
    id: "missing-deep-review-receipt-on-settle",
    prompts: [GOVERNED_DEEP_REVIEW_PROMPT],
    async trigger({ run, pi, options, messages }) {
      handleVisibleLoopMessageStart(
        { message: { role: "user", content: messages[0].message } },
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      handleVisibleLoopAgentSettled(pi, run.harness.ctx, run.env, options);
    },
  },
  {
    id: "delivery-watchdog-timeout",
    prompts: ["work"],
    async trigger({ timer }) {
      timer.fireNext();
    },
  },
];

for (const scenario of retiredFailureScenarios) {
  test(`${scenario.id} retires only its process pointer after durable failure`, async () => {
    const failedSessionId = `failed-owner-${scenario.id}`;
    const failedRun = setup(scenario.prompts, {
      runId: `retired-${scenario.id}`,
      sessionId: failedSessionId,
    });
    const unrelatedSessionId = `unrelated-${scenario.id}`;
    const unrelatedRun = setup(["unrelated work"], {
      runId: `unrelated-after-${scenario.id}`,
      sessionId: unrelatedSessionId,
    });
    const timer = createFakeTimer();
    const failedMessages = [];
    const failedPi = {
      sendUserMessage: (message, options) => failedMessages.push({ message, options }),
    };
    const failedOptions = {
      deliveryAckTimeoutMs: 7,
      deliveryAckTimer: timer.runtime,
      governedDeepReviewPreflight: createGovernedDeepReviewPreflightStub(),
    };
    const unrelatedMessages = [];
    const unrelatedPi = {
      sendUserMessage: (message, options) => unrelatedMessages.push({ message, options }),
    };
    try {
      await startVisibleLoopChildRunner(
        failedRun.configPath,
        failedPi,
        failedRun.harness.ctx,
        failedRun.env,
        failedOptions,
      );
      await scenario.trigger({
        run: failedRun,
        pi: failedPi,
        options: failedOptions,
        messages: failedMessages,
        timer,
      });

      const failedSnapshotPath = getActiveVisibleLoopSnapshotPath(failedSessionId, failedRun.env);
      assert.ok(failedSnapshotPath);
      const failedSnapshot = JSON.parse(readFileSync(failedSnapshotPath, "utf8"));
      assert.equal(failedSnapshot.stopped, true);
      assert.equal(failedSnapshot.plan.lifecycle, "failed_closed");
      const failedLease = readRunLease(failedRun);
      assert.equal(failedLease.status, "ACTIVE");
      assert.equal(failedLease.planId, failedSnapshot.plan.planId);

      await startVisibleLoopChildRunner(
        failedRun.configPath,
        failedPi,
        failedRun.harness.ctx,
        failedRun.env,
        failedOptions,
      );
      assert.equal(failedMessages.length, 1, "the failed owner cannot silently restart");
      assert.ok(
        failedRun.harness.notifications.some((entry) =>
          entry.message.includes("cannot restart automatically"),
        ),
      );
      assert.deepEqual(
        readRunLease(failedRun),
        failedLease,
        "the failed run lease remains durable",
      );
      const failedSnapshotAfterRecovery = readFileSync(failedSnapshotPath, "utf8");

      await startVisibleLoopChildRunner(
        unrelatedRun.configPath,
        unrelatedPi,
        unrelatedRun.harness.ctx,
        unrelatedRun.env,
      );
      assert.equal(unrelatedMessages.length, 1, "the unrelated session starts in the same process");
      const unrelatedLease = readRunLease(unrelatedRun);
      assert.equal(unrelatedLease.owner.sessionId, unrelatedSessionId);
      const unrelatedSnapshot = JSON.stringify(readActiveSnapshot(unrelatedRun));

      handleVisibleLoopAgentSettled(failedPi, failedRun.harness.ctx, failedRun.env, failedOptions);
      assert.equal(failedMessages.length, 1, "callbacks for the retired state do nothing");
      assert.equal(readFileSync(failedSnapshotPath, "utf8"), failedSnapshotAfterRecovery);
      assert.deepEqual(readRunLease(failedRun), failedLease);
      assert.equal(unrelatedMessages.length, 1);
      assert.equal(JSON.stringify(readActiveSnapshot(unrelatedRun)), unrelatedSnapshot);
      assert.deepEqual(readRunLease(unrelatedRun), unrelatedLease);
    } finally {
      resetVisibleLoopRuntimeForRecoveryTest();
      rmSync(failedRun.stateHome, { recursive: true, force: true });
      rmSync(unrelatedRun.stateHome, { recursive: true, force: true });
    }
  });
}

test("submitted frontier watchdog fails closed and exact observation cancels it", async () => {
  const timedOutRun = setup(["work"]);
  const fakeTimer = createFakeTimer();
  const timedOutMessages = [];
  const timedOutPi = {
    sendUserMessage: (message, options) => timedOutMessages.push({ message, options }),
  };
  const timedOutOptions = {
    deliveryAckTimeoutMs: 7,
    deliveryAckTimer: fakeTimer.runtime,
  };
  try {
    await startVisibleLoopChildRunner(
      timedOutRun.configPath,
      timedOutPi,
      timedOutRun.harness.ctx,
      timedOutRun.env,
      timedOutOptions,
    );
    assert.equal(fakeTimer.pendingCount, 1);
    assert.equal(fakeTimer.unrefCount, 1, "delivery watchdog must not keep the process alive");
    fakeTimer.fireNext();
    assert.ok(
      timedOutRun.harness.notifications.some((entry) =>
        entry.message.includes("prompt delivery was not observed within 7ms"),
      ),
    );
    const activeDir = `${timedOutRun.stateHome}/pi-little-helpers/visible-loop/active`;
    const activePath = `${activeDir}/${readdirSync(activeDir)[0]}`;
    const persisted = JSON.parse(readFileSync(activePath, "utf8"));
    assert.equal(persisted.stopped, true);
    assert.equal(persisted.plan.lifecycle, "failed_closed");
    assert.match(persisted.plan.failureReason, /acknowledgement timed out after 7ms/);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(timedOutRun.stateHome, { recursive: true, force: true });
  }

  const observedRun = setup(["work"]);
  const observedTimer = createFakeTimer();
  const observedMessages = [];
  const observedPi = {
    sendUserMessage: (message, options) => observedMessages.push({ message, options }),
  };
  const observedOptions = {
    deliveryAckTimeoutMs: 7,
    deliveryAckTimer: observedTimer.runtime,
  };
  try {
    await startVisibleLoopChildRunner(
      observedRun.configPath,
      observedPi,
      observedRun.harness.ctx,
      observedRun.env,
      observedOptions,
    );
    assert.equal(observedTimer.pendingCount, 1);
    handleVisibleLoopMessageStart(
      { message: { role: "user", content: observedMessages[0].message } },
      observedPi,
      observedRun.harness.ctx,
      observedRun.env,
      observedOptions,
    );
    assert.equal(observedTimer.pendingCount, 0, "exact message_start cancels the watchdog");

    handleVisibleLoopAgentSettled(
      observedPi,
      observedRun.harness.ctx,
      observedRun.env,
      observedOptions,
    );
    assert.equal(observedTimer.pendingCount, 1, "the next exact frontier gets its own watchdog");
    resetVisibleLoopRuntimeForRecoveryTest();
    assert.equal(observedTimer.pendingCount, 0, "runtime reset clears the active watchdog");
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(observedRun.stateHome, { recursive: true, force: true });
  }
});

test("cache-distinct same-process reload retains incarnation and stale watchdog loses CAS", async () => {
  const run = setup(["alpha", "beta"], { runId: "reload-incarnation-watchdog" });
  const oldTimer = createFakeTimer();
  const newTimer = createFakeTimer();
  const userMessages = [];
  const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
  const oldOptions = { deliveryAckTimeoutMs: 7, deliveryAckTimer: oldTimer.runtime };
  let reloaded;
  try {
    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env, oldOptions);
    assert.equal(oldTimer.pendingCount, 1);

    reloaded = await import(`../src/visibleLoop.ts?reload=${Date.now()}-${Math.random()}`);
    const newOptions = { deliveryAckTimeoutMs: 7, deliveryAckTimer: newTimer.runtime };
    await reloaded.startVisibleLoopChildRunner(
      run.configPath,
      pi,
      run.harness.ctx,
      run.env,
      newOptions,
    );
    assert.equal(userMessages.length, 1, "reload does not replay the submitted frontier");
    assert.equal(newTimer.pendingCount, 1, "restoration rearms the submitted frontier");

    reloaded.handleVisibleLoopMessageStart(
      { message: { role: "user", content: userMessages[0].message } },
      pi,
      run.harness.ctx,
      run.env,
      newOptions,
    );
    reloaded.handleVisibleLoopAgentSettled(pi, run.harness.ctx, run.env, newOptions);
    assert.equal(userMessages.length, 2);
    handleVisibleLoopMessageStart(
      { message: { role: "user", content: userMessages[0].message } },
      pi,
      run.harness.ctx,
      run.env,
      oldOptions,
    );
    handleVisibleLoopAgentSettled(pi, run.harness.ctx, run.env, oldOptions);
    assert.equal(
      userMessages.length,
      2,
      "stale reload handlers cannot duplicate the next frontier",
    );
    const activeDir = `${run.stateHome}/pi-little-helpers/visible-loop/active`;
    const activePath = `${activeDir}/${readdirSync(activeDir)[0]}`;
    const beforeOldTimeout = JSON.parse(readFileSync(activePath, "utf8"));
    assert.equal(beforeOldTimeout.plan.frontier.stepIndex, 1);

    oldTimer.fireNext();
    const afterOldTimeout = JSON.parse(readFileSync(activePath, "utf8"));
    assert.equal(afterOldTimeout.hostProcessIncarnation, beforeOldTimeout.hostProcessIncarnation);
    assert.equal(afterOldTimeout.plan.planId, beforeOldTimeout.plan.planId);
    assert.equal(afterOldTimeout.plan.frontier.stepIndex, 1);
    assert.equal(afterOldTimeout.plan.lifecycle, "active");
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("run lease blocks tokenless recovery while one irreversible spawn is launching", async () => {
  const run = setup(["work"], { loopCount: 2, runId: "continuation-launch-lease" });
  const userMessages = [];
  const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
  const continuation = deferred();
  const continuationStarted = deferred();
  let launchInput;
  let spawnCount = 0;
  const options = {
    continueInNewSession: (input) => {
      launchInput = input;
      spawnCount += 1;
      continuationStarted.resolve();
      return continuation.promise;
    },
  };
  try {
    await completeFirstIteration(run, pi, options, userMessages);
    await continuationStarted.promise;
    const launching = readRunLease(run);
    assert.equal(launching.status, "LAUNCHING");
    assert.equal(launching.iteration, 2);
    assert.equal(launching.originatingPlanId, readActiveSnapshot(run).plan.planId);
    assert.equal(launching.claimToken, launchInput.claimToken);
    assert.equal(spawnCount, 1);

    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env, options);
    assert.equal(userMessages.length, 2, "tokenless start cannot consume LAUNCHING");
    assert.equal(spawnCount, 1);
    assert.match(run.harness.notifications.at(-1).message, /lease rejects session/);

    continuation.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      readRunLease(run).status,
      "LAUNCHING",
      "spawn success awaits child token consumption",
    );
    assert.ok(getActiveSnapshotPath(run), "per-session recovery snapshot is retained");
    const statuses = readStatusEntries(run);
    assert.equal(
      statuses.filter((entry) => entry.event === "next_iteration_launch_requested").length,
      1,
    );
    assert.equal(
      statuses.filter((entry) => entry.event === "next_iteration_launch_dispatched").length,
      1,
    );
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("matching launch failure permits one tokenless recovery without another spawn", async () => {
  const run = setup(["work"], { loopCount: 2, runId: "continuation-failure-recovery" });
  const userMessages = [];
  const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
  const continuation = deferred();
  const continuationStarted = deferred();
  let spawnCount = 0;
  const options = {
    continueInNewSession: () => {
      spawnCount += 1;
      continuationStarted.resolve();
      return continuation.promise;
    },
  };
  try {
    await completeFirstIteration(run, pi, options, userMessages);
    await continuationStarted.promise;
    const launching = readRunLease(run);
    continuation.reject(new Error("matching launch rejected"));
    await new Promise((resolve) => setImmediate(resolve));

    const failed = readRunLease(run);
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.iteration, 2);
    assert.equal(failed.claimToken, launching.claimToken);
    assert.match(failed.failureReason, /matching launch rejected/);

    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env, options);
    assert.equal(userMessages.length, 3, "matching failure releases one explicit recovery");
    assert.equal(spawnCount, 1, "explicit recovery does not call the spawn seam");
    assert.equal(readRunLease(run).status, "ACTIVE");
    assert.equal(readRunLease(run).iteration, 2);
    const recovered = readActiveSnapshot(run);
    assert.equal(recovered.plan.iteration, 2);
    assert.equal(recovered.plan.lifecycle, "active");

    await startVisibleLoopChildRunner(run.configPath, pi, run.harness.ctx, run.env, options);
    assert.equal(userMessages.length, 3, "the owning session resumes without duplicate submission");
    assert.equal(spawnCount, 1);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});

for (const continuationOutcome of ["resolved", "rejected"]) {
  test(`late ${continuationOutcome} spawn callback cannot transition a consumed run lease`, async () => {
    const run = setup(["work"], { loopCount: 2, runId: `claim-cas-${continuationOutcome}` });
    const userMessages = [];
    const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
    const continuation = deferred();
    const continuationStarted = deferred();
    let launchInput;
    const options = {
      continueInNewSession: (input) => {
        launchInput = input;
        continuationStarted.resolve();
        return continuation.promise;
      },
    };
    try {
      await completeFirstIteration(run, pi, options, userMessages);
      await continuationStarted.promise;
      await startVisibleLoopChildRunner(
        `${run.configPath} --claim-token ${launchInput.claimToken}`,
        pi,
        run.harness.ctx,
        run.env,
        options,
      );
      assert.equal(readRunLease(run).status, "ACTIVE");
      assert.equal(readRunLease(run).iteration, 2);

      if (continuationOutcome === "resolved") continuation.resolve();
      else continuation.reject(new Error("late nonmatching rejection"));
      await new Promise((resolve) => setImmediate(resolve));

      const after = readRunLease(run);
      assert.equal(after.status, "ACTIVE");
      assert.equal(after.iteration, 2);
      const statuses = readStatusEntries(run);
      assert.ok(
        statuses.some(
          (entry) =>
            entry.event === "stale_continuation_ignored" && entry.phase === continuationOutcome,
        ),
      );
      assert.equal(
        statuses.some((entry) => entry.event === "next_iteration_launch_dispatched"),
        false,
      );
      assert.equal(
        statuses.some((entry) => entry.event === "next_iteration_spawn_failed"),
        false,
      );
    } finally {
      resetVisibleLoopRuntimeForRecoveryTest();
      rmSync(run.stateHome, { recursive: true, force: true });
    }
  });
}

test("authoritative iteration completion status failure is rejected", async () => {
  const run = setup(["finish"]);
  try {
    const { commands, events, tools, userMessages } = run.registered;
    await commands.get("visible-loop-child").handler(run.configPath, run.harness.ctx);
    await observeAndSettle(run, 0);
    await observeVisibleLoopMessageAt(events, userMessages, 1, run.harness.ctx);

    const statusPath = `${run.stateHome}/pi-little-helpers/visible-loop/${run.config.runId}.status.jsonl`;
    writeFileSync(statusPath, '{"partial":', "utf8");
    const result = await tools
      .get("visible_loop_child_complete")
      .execute(
        "complete",
        { configPath: run.configPath, iteration: 1 },
        null,
        null,
        run.harness.ctx,
      );
    assert.equal(result.details.accepted, false);
    assert.match(result.details.reason, /authoritative iteration-completion persistence failed/);
    assert.equal(readRunLease(run).status, "COMPLETED", "terminal lease remains fail-closed");
    assert.ok(run.harness.widgets.at(-1).value[0].includes("failed closed"));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(run.stateHome, { recursive: true, force: true });
  }
});
