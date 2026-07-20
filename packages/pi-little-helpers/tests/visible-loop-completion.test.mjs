import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  startVisibleLoopChildCompleteRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  observeLatestVisibleLoopMessage,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

async function settleVisibleLoopPromptSequence(events, config, userMessages, ctx) {
  const agentStart = events.get("agent_start")[0];
  const settled = events.get("agent_settled")[0];
  const toolExecutionStart = events.get("tool_execution_start")[0];
  const toolExecutionEnd = events.get("tool_execution_end")[0];
  for (const prompt of config.prompts) {
    await observeLatestVisibleLoopMessage(events, userMessages, ctx);
    await agentStart({}, ctx);
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
            },
          },
        },
        ctx,
      );
    }
    await settled({}, ctx);
  }
  await observeLatestVisibleLoopMessage(events, userMessages, ctx);
  await agentStart({}, ctx);
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
