import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVisibleLoopRunConfig,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopMessageStart,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { createContext } from "./sidequest-harness.mjs";

function observe(message, pi, ctx, env, options) {
  handleVisibleLoopMessageStart(
    { message: { role: "user", content: message } },
    pi,
    ctx,
    env,
    options,
  );
}

test("visible-loop reports submitted/pending separately and advances one frontier per settle", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-progress-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({
      cwd: `${stateHome}/repo`,
      sessionFile: "/sessions/progress.jsonl",
    });
    const userMessages = [];
    const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "manual",
      runId: "progress-one-frontier",
      prompts: ["alpha", "beta"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env);
    assert.equal(userMessages.length, 1);
    assert.ok(harness.widgets.at(-1).value[1].includes("submitted/pending 1"));
    assert.ok(harness.widgets.at(-1).value[1].includes("host queued 0"));

    observe(userMessages[0].message, pi, harness.ctx, env);
    assert.ok(harness.widgets.at(-1).value[1].includes("running 1"));
    handleVisibleLoopAgentSettled(pi, harness.ctx, env);
    assert.equal(userMessages.length, 2);
    assert.equal(userMessages[1].options?.deliverAs, "followUp");

    observe(userMessages[1].message, pi, harness.ctx, env);
    handleVisibleLoopAgentSettled(pi, harness.ctx, env);
    assert.equal(userMessages.length, 3, "only the completion frontier is now submitted");
    observe(userMessages[2].message, pi, harness.ctx, env);
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
    );
    assert.equal(outcome.accepted, true);

    const entries = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(entries.some((entry) => entry.completionMode === "single_executable_frontier"));
    assert.equal(
      entries.some((entry) => entry.hostQueuedCount > 0),
      false,
    );
    assert.equal(entries.filter((entry) => entry.event === "prompt_submitted").length, 2);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("nexus-loop labels remain canonical through single-frontier completion", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/nexus-loop-labels-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({
      cwd: `${stateHome}/repo`,
      sessionFile: "/sessions/nexus-label.jsonl",
    });
    const userMessages = [];
    const sent = [];
    const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      parentPeerTarget: "session-parent",
      commandName: "nexus-loop",
      runId: "nexus-loop-label-test",
      prompts: ["finish this nexus turn"],
      commitDelegation: { mode: "dispatch_subagent", promptTemplate: "commit" },
    });
    // The explicit delegation flag does not remove completion unless /commit is present.
    const configPath = writeVisibleLoopRunConfig(config, env);
    const options = {
      createPeerRuntime: () => ({
        send: async ({ message }) => {
          sent.push(message.content.text);
          return { delivered: true };
        },
        disconnect: async () => {},
      }),
    };
    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, options);
    observe(userMessages[0].message, pi, harness.ctx, env, options);
    handleVisibleLoopAgentSettled(pi, harness.ctx, env, options);
    observe(userMessages[1].message, pi, harness.ctx, env, options);
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
      options,
    );
    assert.equal(outcome.accepted, true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(sent, [
      "PEER_ACK peer_run_id=nexus-loop-label-test: nexus-loop started (1 iteration(s), 1 prompt(s) each)",
      "NEXUS_LOOP_ITERATION peer_run_id=nexus-loop-label-test: completed iteration 1/1",
      "PEER_FINAL peer_run_id=nexus-loop-label-test: nexus-loop complete after 1/1 iteration(s)",
    ]);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("intercom timeout does not weaken accepted completion or frontier ordering", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-timeout-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({
      cwd: `${stateHome}/repo`,
      sessionFile: "/sessions/timeout.jsonl",
    });
    const userMessages = [];
    const pi = { sendUserMessage: (message, options) => userMessages.push({ message, options }) };
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      parentPeerTarget: "session-parent",
      runId: "timeout-test",
      prompts: ["finish"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    let continuationCount = 0;
    const options = {
      createPeerRuntime: () => ({ send: () => new Promise(() => {}), disconnect: async () => {} }),
      continueInNewSession: () => {
        continuationCount += 1;
      },
      intercomSendTimeoutMs: 10,
    };
    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, options);
    observe(userMessages[0].message, pi, harness.ctx, env, options);
    handleVisibleLoopAgentSettled(pi, harness.ctx, env, options);
    observe(userMessages[1].message, pi, harness.ctx, env, options);
    const outcome = await startVisibleLoopChildCompleteRunner(
      `${configPath} --iteration 1`,
      pi,
      harness.ctx,
      env,
      options,
    );
    assert.equal(outcome.accepted, true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(continuationCount, 1);
    assert.ok(harness.notifications.some((entry) => entry.message.includes("timed out")));
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});
