// summary: verifies explicit child progress gates, nexus intercom labels, and timeout-tolerant iteration continuation.
// read_when:
//   - changing visible-loop settled handling, progress report messages, completion commands, or intercom timeouts.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  handleVisibleLoopAgentSettled,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  registerExtension,
} from "./sidequest-harness.mjs";

test("visible-loop child rejects an unbound persisted config before prompt delivery", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-unbound-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const stateDir = `${stateHome}/pi-little-helpers/visible-loop`;
    mkdirSync(stateDir, { recursive: true });
    const configPath = `${stateDir}/visible-loop-unbound-test.json`;
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "visible-loop-unbound-test",
        loopCount: 1,
        cwd: `${stateHome}/repo`,
        prompts: ["must not run"],
        reportBack: "manual",
        createdAt: new Date().toISOString(),
      })}\n`,
    );
    const userMessages = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const harness = createContext({ cwd: `${stateHome}/repo` });

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env);

    assert.equal(userMessages.length, 0);
    assert.match(harness.notifications.at(-1).message, /executionBinding is required/);
    assert.match(harness.notifications.at(-1).message, /--task, --objective, or --candidate/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop child rejects candidate binding without its matching envelope", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-candidate-mismatch-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const stateDir = `${stateHome}/pi-little-helpers/visible-loop`;
    mkdirSync(stateDir, { recursive: true });
    const configPath = `${stateDir}/visible-loop-candidate-mismatch-test.json`;
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "visible-loop-candidate-mismatch-test",
        loopCount: 1,
        cwd: `${stateHome}/repo`,
        prompts: ["must not run"],
        reportBack: "manual",
        executionBinding: {
          mode: "self_evolution_candidate",
          candidateId: "evolution-missing-envelope",
        },
        createdAt: new Date().toISOString(),
      })}\n`,
    );
    const userMessages = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const harness = createContext({ cwd: `${stateHome}/repo` });

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env);

    assert.equal(userMessages.length, 0);
    assert.match(harness.notifications.at(-1).message, /requires a matching selfEvolutionEnvelope/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop config creation is no-replace", () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-no-replace-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: `${stateHome}/repo`,
      reportBack: "manual",
      executionBinding: { mode: "operator_objective", objective: "no replace test" },
      runId: "visible-loop-no-replace-test",
      prompts: ["bounded work"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const original = readFileSync(configPath, "utf8");

    assert.throws(() => writeVisibleLoopRunConfig(config, env), /EEXIST/);
    assert.equal(readFileSync(configPath, "utf8"), original);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop waits for explicit checkpoint after nonsense prompts before launching next iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-nonsense-state-`);
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
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands, events, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "manual",
      executionBinding: { mode: "operator_objective", objective: "nonsense queue test" },
      runId: "visible-loop-nonsense-test",
      prompts: [
        "nonsense prompt alpha: count the purple spoons",
        "nonsense prompt beta: report the imaginary aardvark",
        "nonsense prompt gamma: close the banana loop",
      ],
    });
    const configPath = writeVisibleLoopRunConfig(config, {
      ...process.env,
      XDG_STATE_HOME: stateHome,
    });

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(userMessages.length, 1);
    assert.match(userMessages[0].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[0].message, /nonsense prompt alpha: count the purple spoons/);

    await events.get("agent_start")[0]({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(userMessages.length, 4);
    for (const message of userMessages) {
      assert.match(message.message, /EXECUTION BINDING — FAIL CLOSED/);
    }
    assert.match(userMessages[0].message, /nonsense prompt alpha: count the purple spoons/);
    assert.match(userMessages[1].message, /nonsense prompt beta: report the imaginary aardvark/);
    assert.match(userMessages[2].message, /nonsense prompt gamma: close the banana loop/);
    assert.match(userMessages[3].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[3].message, /visible_loop_child_complete/);
    assert.deepEqual(
      userMessages.slice(1).map((entry) => entry.options),
      [{ deliverAs: "followUp" }, { deliverAs: "followUp" }, { deliverAs: "followUp" }],
    );

    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      0,
      "nonsense loop must not launch iteration 2 before explicit completion",
    );

    const agentEnd = events.get("agent_settled")[0];
    await agentEnd({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      0,
      "agent_settled must not launch iteration 2 before the checkpoint command/tool completes",
    );

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);
    assert.match(extractPiArgs(visibleLoopLaunches[0].args).at(-1), /^\/visible-loop-child /);

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_queued" &&
          entry.iteration === 1 &&
          entry.promptCount === 1 &&
          entry.sourcePromptCount === 3 &&
          entry.queuedFollowupCount === 3 &&
          entry.completionMode === "explicit_completion_prompt",
      ),
    );
    assert.ok(statusEntries.some((entry) => entry.event === "completion_prompt_queued"));
    assert.ok(statusEntries.some((entry) => entry.event === "agent_settled_observed"));
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_completed" &&
          entry.source === "completion_command" &&
          entry.completedPromptCount === 1 &&
          entry.completedIterations === 1,
      ),
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("nexus-loop child uses nexus-loop labels for intercom progress", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/nexus-loop-label-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const userMessages = [];
    const sentMessages = [];
    const statusUpdates = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const ctx = {
      ...harness.ctx,
      ui: {
        notify() {},
        setStatus(key, value) {
          statusUpdates.push({ key, value });
        },
      },
    };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      executionBinding: { mode: "operator_objective", objective: "nexus label test" },
      parentPeerTarget: "session-parent-nexus-label-test",
      runId: "nexus-loop-label-test",
      runIdPrefix: "nexus-loop",
      commandName: "nexus-loop",
      title: "Nexus loop",
      prompts: ["finish this nexus turn"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await startVisibleLoopChildRunner(configPath, pi, ctx, env, {
      createPeerRuntime: () => ({
        async send(request) {
          sentMessages.push(request.message.content.text);
          return { delivered: true };
        },
      }),
    });

    assert.equal(userMessages.length, 1);
    assert.match(userMessages[0].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[0].message, /finish this nexus turn/);

    await startVisibleLoopChildCompleteRunner(`${configPath} --iteration 1`, pi, ctx, env);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.deepEqual(sentMessages, [
      "PEER_ACK peer_run_id=nexus-loop-label-test: nexus-loop started (1 iteration(s), 1 prompt(s) each)",
      "NEXUS_LOOP_ITERATION peer_run_id=nexus-loop-label-test: completed iteration 1/1",
      "PEER_FINAL peer_run_id=nexus-loop-label-test: nexus-loop complete after 1/1 iteration(s)",
    ]);
    assert.ok(statusUpdates.some((entry) => entry.key === "nexus-loop"));
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop intercom timeout does not block prompt queue or next iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-intercom-timeout-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const userMessages = [];
    const notifications = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const ctx = {
      ...harness.ctx,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
        setStatus() {},
      },
    };
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      executionBinding: { mode: "operator_objective", objective: "intercom timeout test" },
      parentPeerTarget: "session-parent-timeout-test",
      runId: "visible-loop-intercom-timeout-test",
      prompts: ["finish this turn"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    let continuationCount = 0;
    let disconnectCount = 0;

    await startVisibleLoopChildRunner(configPath, pi, ctx, env, {
      createPeerRuntime: () => ({
        send: () => new Promise(() => {}),
        disconnect: async () => {
          disconnectCount += 1;
          throw new Error("disconnect cleanup failed");
        },
      }),
      continueInNewSession: () => {
        continuationCount += 1;
      },
      intercomSendTimeoutMs: 15,
    });

    assert.equal(
      userMessages.length,
      1,
      "ACK report-back timeout must not prevent the child from receiving its first prompt",
    );
    assert.match(userMessages[0].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[0].message, /finish this turn/);

    handleVisibleLoopAgentSettled(pi, ctx, env);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      continuationCount,
      0,
      "agent_settled must not launch the next visible-loop iteration before explicit completion",
    );

    await startVisibleLoopChildCompleteRunner(`${configPath} --iteration 1`, pi, ctx, env);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      continuationCount,
      1,
      "progress report timeout must not prevent launching the next visible-loop iteration after explicit completion",
    );
    assert.ok(disconnectCount >= 2);
    assert.ok(
      notifications.some((entry) => entry.message.includes("intercom send timed out")),
      "operator should see bounded intercom timeout diagnostics",
    );

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(
      statusEntries.filter((entry) => entry.event === "intercom_send_timed_out").length,
      2,
    );
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_completed" &&
          entry.source === "completion_command" &&
          entry.completedIterations === 1,
      ),
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
