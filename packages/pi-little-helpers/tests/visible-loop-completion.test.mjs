// summary: verifies adaptive and baseline completion recovery, persistence failure gates, fallbacks, and finalization.
// read_when:
//   - changing visible-loop completion acceptance, controller restoration, continuation fallback, or duplicate handling.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  DEFAULT_NEXUS_LOOP_PROMPTS,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  getVisibleLoopStatusPath,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopAgentStart,
  handleVisibleLoopMessageStart,
  resolveVisibleLoopAdaptiveControllerConfig,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { writeVisibleLoopControllerState } from "../src/visibleLoopState.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  observeLatestVisibleLoopMessage,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

async function driveDirectSinglePromptToCompletionCheckpoint({
  pi,
  ctx,
  env,
  userMessages,
  runnerOptions = {},
}) {
  const observe = () =>
    handleVisibleLoopMessageStart(
      { message: { role: "user", content: userMessages.at(-1).message } },
      ctx,
      env,
    );
  observe();
  handleVisibleLoopAgentStart(pi, ctx, env, runnerOptions);
  handleVisibleLoopAgentSettled(pi, ctx, env, runnerOptions);
  observe();
  handleVisibleLoopAgentStart(pi, ctx, env, runnerOptions);
}

async function driveGovernedDefaultToCompletionCheckpoint({ events, userMessages, ctx, suffix }) {
  const agentStart = events.get("agent_start")[0];
  const agentSettled = events.get("agent_settled")[0];
  const toolExecutionStart = events.get("tool_execution_start")[0];
  const toolExecutionEnd = events.get("tool_execution_end")[0];
  await observeLatestVisibleLoopMessage(events, userMessages, ctx);
  await agentStart({}, ctx);
  for (let completed = 0; completed < 2; completed += 1) {
    await agentSettled({}, ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, ctx);
    await agentStart({}, ctx);
  }
  const toolCallId = `completion-deep-review-${suffix}`;
  await toolExecutionStart(
    {
      toolCallId,
      toolName: "vault_execute_template",
      args: { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE },
    },
    ctx,
  );
  await toolExecutionEnd(
    {
      toolCallId,
      toolName: "vault_execute_template",
      isError: false,
      result: {
        details: {
          ok: true,
          templateName: "deep-review",
          executionSurface: "workflow_execute",
          handoffId: `handoff-${suffix}`,
          runId: `workflow-${suffix}`,
          status: "done",
        },
      },
    },
    ctx,
  );
  for (let completed = 2; completed < 6; completed += 1) {
    await agentSettled({}, ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, ctx);
    await agentStart({}, ctx);
  }
}

test("adaptive restart rejects missing controller state after run history exists", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-adaptive-missing-state-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const adaptiveController = resolveVisibleLoopAdaptiveControllerConfig({
      PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
    });
    assert.ok(adaptiveController);
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: "/repo",
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "adaptive restart test" },
      prompts: ["bounded work"],
      adaptiveController,
      runId: "visible-loop-adaptive-missing-state",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    writeFileSync(
      getVisibleLoopStatusPath(config, env),
      `${JSON.stringify({ event: "child_started", runId: config.runId })}\n`,
    );
    const userMessages = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const harness = createContext({ cwd: "/repo" });

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env);

    assert.equal(userMessages.length, 0);
    assert.match(harness.notifications.at(-1).message, /controller state unavailable/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("active-state restore rejects mismatched run identity", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-restore-run-id-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const pi = { sendUserMessage() {} };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "restore run identity" },
      prompts: ["bounded work"],
      runId: "visible-loop-restore-run-id",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const activePath = `${stateHome}/pi-little-helpers/visible-loop/active/session-019e10d2-15f5-705a-aea4-01ba49d2bbac.json`;
    mkdirSync(activePath.slice(0, activePath.lastIndexOf("/")), { recursive: true });
    writeFileSync(
      activePath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "different-run-id",
        configPath,
        completedPromptCount: 0,
        completedIterations: 0,
        followupsQueuedForIteration: null,
        currentPromptIndex: 0,
        completionPromptQueued: false,
        stopped: false,
      })}\n`,
    );

    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(outcome.accepted, true);
    const status = readFileSync(getVisibleLoopStatusPath(config, env), "utf8");
    assert.match(status, /active_state_recreated/);
    assert.doesNotMatch(status, /active_state_restored/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("active-state restore does not trust a forged governed-review success marker", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-restore-forged-review-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const pi = { sendUserMessage() {} };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "forged review marker" },
      prompts: DEFAULT_NEXUS_LOOP_PROMPTS,
      runId: "visible-loop-forged-review-marker",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const activePath = `${stateHome}/pi-little-helpers/visible-loop/active/session-019e10d2-15f5-705a-aea4-01ba49d2bbac.json`;
    mkdirSync(activePath.slice(0, activePath.lastIndexOf("/")), { recursive: true });
    writeFileSync(
      activePath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: config.runId,
        configPath,
        completedPromptCount: config.prompts.length,
        completedIterations: 0,
        followupsQueuedForIteration: 0,
        currentPromptIndex: config.prompts.length - 1,
        completionPromptQueued: true,
        governedDeepReviewSucceededIteration: 1,
        stopped: false,
      })}\n`,
    );

    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
    );

    assert.equal(outcome.accepted, false);
    assert.match(outcome.reason, /governed deep-review workflow receipt is missing/);
    const status = readFileSync(getVisibleLoopStatusPath(config, env), "utf8");
    assert.match(status, /active_state_restored/);
    assert.doesNotMatch(status, /iteration_completed/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("adaptive completion fails closed when controller persistence fails", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-adaptive-persist-failure-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const adaptiveController = resolveVisibleLoopAdaptiveControllerConfig({
      PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
    });
    assert.ok(adaptiveController);
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: "/repo",
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "persistence failure test" },
      prompts: ["bounded work"],
      adaptiveController,
      runId: "visible-loop-adaptive-persist-failure",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const userMessages = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const harness = createContext({ cwd: "/repo" });
    let continuationCalls = 0;
    const continueInNewSession = async () => {
      continuationCalls += 1;
    };
    let failPersistence = false;
    const persistControllerState = (inputConfig, state, inputEnv) => {
      if (failPersistence) throw new Error("synthetic persistence failure");
      writeVisibleLoopControllerState(inputConfig, state, inputEnv);
    };

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, {
      continueInNewSession,
      persistControllerState,
    });
    await driveDirectSinglePromptToCompletionCheckpoint({
      pi,
      ctx: harness.ctx,
      env,
      userMessages,
      runnerOptions: { continueInNewSession, persistControllerState },
    });
    failPersistence = true;
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
      { continueInNewSession, persistControllerState },
    );

    assert.equal(outcome.accepted, false);
    assert.equal(outcome.reason, "adaptive controller state persistence failed");
    assert.equal(continuationCalls, 0);
    const status = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    );
    assert.match(status, /adaptive_controller_persistence_failed/);
    assert.doesNotMatch(status, /"event":"iteration_completed"/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("adaptive continuation launch failure falls back to a full same-session iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-adaptive-fallback-state-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const adaptiveController = resolveVisibleLoopAdaptiveControllerConfig({
      PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
    });
    assert.ok(adaptiveController);
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: "/repo",
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "fallback test" },
      prompts: ["bounded work"],
      adaptiveController,
      runId: "visible-loop-adaptive-fallback",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const userMessages = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const harness = createContext({ cwd: "/repo" });
    harness.ctx.sessionManager = undefined;
    const rejectContinuation = async () => {
      throw new Error("synthetic launch failure");
    };

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, {
      continueInNewSession: rejectContinuation,
    });
    await driveDirectSinglePromptToCompletionCheckpoint({
      pi,
      ctx: harness.ctx,
      env,
      userMessages,
      runnerOptions: { continueInNewSession: rejectContinuation },
    });
    assert.equal(
      existsSync(`${stateHome}/pi-little-helpers/visible-loop/${config.runId}.controller.json`),
      true,
    );
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
      { continueInNewSession: rejectContinuation },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(outcome.accepted, true);
    assert.equal(outcome.continuationDecision?.method, "new_session");
    assert.equal(userMessages.length, 3);
    assert.match(userMessages[2].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[2].message, /bounded work/);
    const statusEntries = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some((entry) => entry.event === "next_iteration_same_session_fallback"),
    );
    await driveDirectSinglePromptToCompletionCheckpoint({
      pi,
      ctx: harness.ctx,
      env,
      userMessages,
      runnerOptions: { continueInNewSession: rejectContinuation },
    });
    const finalOutcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 2`,
      pi,
      harness.ctx,
      env,
      { continueInNewSession: rejectContinuation },
    );
    assert.equal(finalOutcome.accepted, true);
    assert.equal(finalOutcome.continuationDecision?.method, "complete");
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("baseline rollback manual completion advances non-final iterations", async () => {
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
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
        PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "0",
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
      .handler('--count 2 --manual --objective "baseline continuation"', harness.ctx);
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
    await driveGovernedDefaultToCompletionCheckpoint({
      events,
      userMessages,
      ctx: harness.ctx,
      suffix: "baseline-next",
    });
    await commands.get("visible-loop-child-complete").handler("", harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    assert.equal(userMessages.length, 7);
    const visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    assert.match(extractPiArgs(visibleLoopLaunches[1].args).at(-1), /^\/visible-loop-child /);

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
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("baseline rollback manual completion finalizes", async () => {
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
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
        PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "0",
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
      .handler('--count 1 --manual --objective "baseline completion"', harness.ctx);
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
    await driveGovernedDefaultToCompletionCheckpoint({
      events,
      userMessages,
      ctx: harness.ctx,
      suffix: "baseline-final",
    });
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
    assert.equal(
      existsSync(
        `${stateHome}/pi-little-helpers/visible-loop/active/session-019e10d2-15f5-705a-aea4-01ba49d2bbac.json`,
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
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop completion recreates continuation after active state is unavailable", async () => {
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
      executionBinding: { mode: "operator_objective", objective: "continuation recreation" },
      runId: "visible-loop-recreate-continuation-test",
      prompts: ["finish this turn"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    let continuationCount = 0;

    await startVisibleLoopChildCompleteRunner(`${configPath} --iteration 1`, pi, harness.ctx, env, {
      continueInNewSession: ({ nextIteration }) => {
        continuationCount += 1;
        assert.equal(nextIteration, 2);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(continuationCount, 1);
    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(statusEntries.some((entry) => entry.event === "active_state_recreated"));
    assert.ok(
      statusEntries.some(
        (entry) => entry.event === "next_iteration_launch_requested" && entry.nextIteration === 2,
      ),
    );
    assert.ok(
      statusEntries.some(
        (entry) => entry.event === "next_iteration_launch_dispatched" && entry.nextIteration === 2,
      ),
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("direct completion cannot bypass a membrane-prefixed raw deep-review prompt", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-direct-raw-review-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const pi = { sendUserMessage() {} };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "direct raw review bypass" },
      prompts: ["CANDIDATE EXECUTION MEMBRANE\n\n/deep-review"],
      runId: "visible-loop-direct-raw-review",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
    );

    assert.equal(outcome.accepted, false);
    assert.match(outcome.reason, /raw \/deep-review prompt execution is forbidden/);
    const status = readFileSync(getVisibleLoopStatusPath(config, env), "utf8");
    assert.doesNotMatch(status, /iteration_completed/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
