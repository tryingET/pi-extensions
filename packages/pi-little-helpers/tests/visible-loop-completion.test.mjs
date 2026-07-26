import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  parseVisibleLoopChildArgs,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildCompleteRunner,
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
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands, events, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("visible-loop").handler("--count 2 --manual", harness.ctx);
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

    await commands.get("visible-loop").handler("--count 1 --manual", harness.ctx);
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
