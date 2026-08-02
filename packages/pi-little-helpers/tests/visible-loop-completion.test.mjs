// summary: verifies adaptive and baseline completion recovery, persistence failure gates, fallbacks, and finalization.
// read_when:
//   - changing visible-loop completion acceptance, controller restoration, continuation fallback, or duplicate handling.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  getVisibleLoopStatusPath,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopMessageStart,
  parseVisibleLoopChildArgs,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { readVisibleLoopIterationLease } from "../src/visibleLoopContinuationClaim.ts";
import { getActiveVisibleLoopSnapshotPath } from "../src/visibleLoopRecovery.ts";
import {
  createContext,
  createExecStub,
  createGovernedDeepReviewPreflightStub,
  extractPiArgs,
  getLatestGovernedDeepReviewPreflightReceipt,
  observeVisibleLoopMessageAt,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

async function settleVisibleLoopPromptSequence(events, config, userMessages, ctx) {
  const agentSettled = events.get("agent_settled")[0];
  const toolExecutionStart = events.get("tool_execution_start")[0];
  const toolExecutionEnd = events.get("tool_execution_end")[0];
  for (let index = 0; index < config.prompts.length + 1; index += 1) {
    await observeVisibleLoopMessageAt(events, userMessages, index, ctx);
    const prompt = userMessages[index].message;
    if (prompt.includes("Governed deep-review execution step.")) {
      await toolExecutionStart(
        {
          toolCallId: "vault-completion-test",
          toolName: "vault_execute_template",
          args: {
            template_name: "deep-review",
            objective: GOVERNED_DEEP_REVIEW_OBJECTIVE,
          },
        },
        ctx,
      );
      await toolExecutionEnd(
        {
          toolCallId: "vault-completion-test",
          toolName: "vault_execute_template",
          isError: false,
          result: {
            details: {
              ok: true,
              templateName: "deep-review",
              executionSurface: "workflow_execute",
              handoffId: "handoff-completion-test",
              status: "done",
              preflightNonce: getLatestGovernedDeepReviewPreflightReceipt().nonce,
              preflightReceiptDigest: getLatestGovernedDeepReviewPreflightReceipt().receiptDigest,
              preflightRegistryId: getLatestGovernedDeepReviewPreflightReceipt().registryId,
            },
          },
        },
        ctx,
      );
    }
    if (index < config.prompts.length) await agentSettled({}, ctx);
  }
}

async function reachMinimalCompletionFrontier(runId, options) {
  const stateHome = mkdtempSync(`${tmpdir()}/${runId}-`);
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  const harness = createContext({ cwd: `${stateHome}/repo` });
  const userMessages = [];
  const pi = { sendUserMessage: (message, delivery) => userMessages.push({ message, delivery }) };
  const config = createVisibleLoopRunConfig({
    loopCount: 2,
    cwd: harness.ctx.cwd,
    reportBack: "manual",
    runId,
    executionBinding: { mode: "operator_objective", objective: "continuation proof" },
    prompts: ["finish"],
  });
  const configPath = writeVisibleLoopRunConfig(config, env);
  await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, options);
  handleVisibleLoopMessageStart(
    { message: { role: "user", content: userMessages[0].message } },
    pi,
    harness.ctx,
    env,
    options,
  );
  handleVisibleLoopAgentSettled(pi, harness.ctx, env, options);
  handleVisibleLoopMessageStart(
    { message: { role: "user", content: userMessages[1].message } },
    pi,
    harness.ctx,
    env,
    options,
  );
  return { stateHome, env, harness, pi, config, configPath };
}

test("visible-loop manual completion command advances non-final iterations", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-command-next-state-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (command === "/usr/bin/ghostty" && args[0] === "+help") {
        return { code: 0, stdout: "Usage: ghostty +new-tab", stderr: "" };
      }
      if (command === "/usr/bin/ghostty") {
        return { code: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command ${command}`);
    });
    const extension = createSidequestExtension({
      registerTools: false,
      governedDeepReviewPreflight: createGovernedDeepReviewPreflightStub(),
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
        PI_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS: "25",
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands, events, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands
      .get("visible-loop")
      .handler('--count 2 --manual --objective "manual continuation test"', harness.ctx);
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(userMessages.length, 1);
    assert.match(config.prompts.at(-3), /Prompt Vault/);
    assert.match(config.prompts.at(-2), /product-posture\.md/);
    assert.equal(config.prompts.at(-1), "/commit");
    await settleVisibleLoopPromptSequence(events, config, userMessages, harness.ctx);
    assert.match(userMessages.at(-1).message, /Visible-loop internal completion checkpoint/);
    await commands.get("visible-loop-child-complete").handler("", harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    assert.equal(userMessages.length, config.prompts.length + 1);
    const visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    const continuationCommand = extractPiArgs(visibleLoopLaunches[1].args).at(-1);
    assert.match(continuationCommand, /^\/visible-loop-child /);
    assert.match(continuationCommand, / --claim-token [A-Za-z0-9_-]{32,128}$/u);
    const continuationArgs = parseVisibleLoopChildArgs(
      continuationCommand.replace(/^\/visible-loop-child\s+/u, ""),
    );
    assert.equal(continuationArgs.ok, true);
    assert.equal(continuationArgs.configPath, configPath);
    assert.match(continuationArgs.claimToken, /^[A-Za-z0-9_-]{32,128}$/u);

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_completed" &&
          entry.source === "completion_command" &&
          entry.completedIterations === 1,
      ),
    );
    assert.equal(
      statusEntries.some((entry) => entry.event === "loop_completed"),
      false,
    );
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop manual completion command finalizes", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-command-state-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (command === "/usr/bin/ghostty" && args[0] === "+help") {
        return { code: 0, stdout: "Usage: ghostty +new-tab", stderr: "" };
      }
      if (command === "/usr/bin/ghostty") {
        return { code: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command ${command}`);
    });
    const extension = createSidequestExtension({
      registerTools: false,
      governedDeepReviewPreflight: createGovernedDeepReviewPreflightStub(),
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands
      .get("visible-loop")
      .handler('--count 1 --manual --objective "manual completion test"', harness.ctx);
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(userMessages.length, 1);
    assert.match(config.prompts.at(-3), /Prompt Vault/);
    assert.match(config.prompts.at(-2), /product-posture\.md/);
    assert.equal(config.prompts.at(-1), "/commit");
    assert.doesNotMatch(config.prompts.at(-1), /visible_loop_child_complete/);
    assert.equal(commands.has("visible-loop-child-complete"), true);
    assert.equal(tools.has("visible_loop_child_complete"), false);
    await settleVisibleLoopPromptSequence(events, config, userMessages, harness.ctx);
    assert.match(userMessages.at(-1).message, /Visible-loop internal completion checkpoint/);
    await commands.get("visible-loop-child-complete").handler("", harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 80));

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some(
        (entry) => entry.event === "iteration_completed" && entry.source === "completion_command",
      ),
    );
    assert.ok(
      statusEntries.some(
        (entry) => entry.event === "loop_completed" && entry.source === "completion_command",
      ),
    );
    const completedLease = readVisibleLoopIterationLease(config.runId, {
      ...process.env,
      XDG_STATE_HOME: stateHome,
    });
    assert.equal(completedLease.ok, true);
    assert.equal(completedLease.value.status, "COMPLETED");
    assert.equal(completedLease.value.iteration, 1);
    assert.equal(
      existsSync(
        getActiveVisibleLoopSnapshotPath(harness.ctx.sessionManager.getSessionId(), {
          ...process.env,
          XDG_STATE_HOME: stateHome,
        }),
      ),
      false,
    );

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    const afterDuplicateEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      afterDuplicateEntries.some(
        (entry) =>
          entry.event === "completion_ignored" &&
          entry.source === "completion_command" &&
          entry.reason === "loop already completed",
      ),
    );
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop completion fails closed when durable active plan state is unavailable", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-recreate-continuation-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const pi = {
      sendUserMessage() {},
    };
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "manual",
      runId: "visible-loop-recreate-continuation-test",
      executionBinding: { mode: "operator_objective", objective: "recreate test" },
      prompts: ["finish this turn"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    let continuationCount = 0;

    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
      {
        continueInNewSession: () => {
          continuationCount += 1;
        },
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(outcome.accepted, false);
    assert.match(outcome.reason, /active state unavailable/);
    assert.equal(continuationCount, 0);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("continuation success requires the exact claimed child ACTIVE frontier proof", async () => {
  let run;
  let childHarness;
  let reloaded;
  const childMessages = [];
  const childPi = {
    sendUserMessage(message, delivery) {
      childMessages.push({ message, delivery });
    },
  };
  const options = {
    continuationStartTimeoutMs: 100,
    continuationStartPollIntervalMs: 5,
    continueInNewSession: async ({ config, configPath, claimToken }) => {
      childHarness = createContext({
        cwd: config.cwd,
        sessionId: "019e10d2-15f5-705a-aea4-01ba49d2bbad",
      });
      await startVisibleLoopChildRunner(
        `${configPath} --claim-token ${claimToken}`,
        childPi,
        childHarness.ctx,
        run.env,
        options,
      );
    },
  };
  try {
    run = await reachMinimalCompletionFrontier("continuation-exact-proof", options);
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${run.configPath} --iteration 1`,
      run.pi,
      run.harness.ctx,
      run.env,
      options,
    );
    assert.equal(outcome.accepted, true);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const entries = readFileSync(getVisibleLoopStatusPath(run.config, run.env), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const confirmed = entries.find(
      (entry) => entry.event === "next_iteration_child_start_confirmed",
    );
    assert.equal(confirmed.proof.schema, "pi.visible-loop-child-start.v1");
    assert.equal(confirmed.proof.runId, run.config.runId);
    assert.equal(confirmed.proof.iteration, 2);
    assert.equal(confirmed.proof.launchClaim.claimToken, confirmed.claimToken);
    assert.equal(confirmed.proof.launchClaim.originatingPlanId, confirmed.planId);
    assert.equal(
      confirmed.proof.childOwner.sessionId,
      childHarness.ctx.sessionManager.getSessionId(),
    );
    const activeLease = readVisibleLoopIterationLease(run.config.runId, run.env);
    assert.equal(activeLease.ok, true);
    assert.equal(activeLease.value.status, "ACTIVE");
    assert.deepEqual(activeLease.value.owner, confirmed.proof.childOwner);
    assert.deepEqual(activeLease.value.launchClaim, confirmed.proof.launchClaim);
    assert.equal(activeLease.value.planId, confirmed.proof.activePlanId);
    const childSnapshot = JSON.parse(
      readFileSync(
        getActiveVisibleLoopSnapshotPath(childHarness.ctx.sessionManager.getSessionId(), run.env),
        "utf8",
      ),
    );
    assert.deepEqual(childSnapshot.continuationStartProof, confirmed.proof);
    const dispatched = entries.find((entry) => entry.event === "next_iteration_launch_dispatched");
    assert.deepEqual(dispatched.proof, confirmed.proof);

    const messageCountBeforeReload = childMessages.length;
    reloaded = await import(
      `../src/visibleLoop.ts?claimed-child-reload=${Date.now()}-${Math.random()}`
    );
    await reloaded.startVisibleLoopChildRunner(
      run.configPath,
      childPi,
      childHarness.ctx,
      run.env,
      options,
    );
    assert.equal(childMessages.length, messageCountBeforeReload);
    const restoredSnapshot = JSON.parse(
      readFileSync(
        getActiveVisibleLoopSnapshotPath(childHarness.ctx.sessionManager.getSessionId(), run.env),
        "utf8",
      ),
    );
    assert.deepEqual(restoredSnapshot.continuationStartProof, confirmed.proof);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    resetVisibleLoopRuntimeForRecoveryTest();
    if (run) rmSync(run.stateHome, { recursive: true, force: true });
  }
});

test("a forged three-field child_started record cannot prove a continuation launch", async () => {
  let run;
  const options = {
    continuationStartTimeoutMs: 25,
    continuationStartPollIntervalMs: 5,
    continueInNewSession: ({ config, nextIteration }) => {
      writeFileSync(
        getVisibleLoopStatusPath(config, run.env),
        `${JSON.stringify({
          event: "child_started",
          runId: config.runId,
          iteration: nextIteration,
        })}\n`,
        { flag: "a" },
      );
    },
  };
  try {
    run = await reachMinimalCompletionFrontier("continuation-mismatched-proof", options);
    writeFileSync(
      getVisibleLoopStatusPath(run.config, run.env),
      `${JSON.stringify({ event: "child_started", runId: run.config.runId, iteration: 2 })}\n`,
      { flag: "a" },
    );
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${run.configPath} --iteration 1`,
      run.pi,
      run.harness.ctx,
      run.env,
      options,
    );
    assert.equal(outcome.accepted, true, "iteration completion remains separately accepted");
    await new Promise((resolve) => setTimeout(resolve, 70));

    const entries = readFileSync(getVisibleLoopStatusPath(run.config, run.env), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      entries.some(
        (entry) =>
          entry.event === "next_iteration_child_start_unconfirmed" &&
          entry.failurePhase === "child_start_timeout",
      ),
    );
    assert.equal(
      entries.some((entry) => entry.event === "next_iteration_child_start_confirmed"),
      false,
    );
    assert.equal(
      entries.some((entry) => entry.event === "next_iteration_launch_dispatched"),
      false,
    );
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    if (run) rmSync(run.stateHome, { recursive: true, force: true });
  }
});
