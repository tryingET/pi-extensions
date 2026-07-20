import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import { GOVERNED_DEEP_REVIEW_OBJECTIVE, GOVERNED_DEEP_REVIEW_PROMPT } from "../src/visibleLoop.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  observeLatestVisibleLoopMessage,
  registerExtension,
} from "./sidequest-harness.mjs";

function vaultStart({
  toolCallId = "vault-deep-review-call-1",
  objective = GOVERNED_DEEP_REVIEW_OBJECTIVE,
} = {}) {
  return {
    toolCallId,
    toolName: "vault_execute_template",
    args: {
      template_name: "deep-review",
      objective,
    },
  };
}

function vaultSuccess({ toolCallId = "vault-deep-review-call-1", isError = false } = {}) {
  return {
    toolCallId,
    toolName: "vault_execute_template",
    isError,
    result: {
      details: {
        ok: true,
        templateName: "deep-review",
        executionSurface: "workflow_execute",
        handoffId: "handoff-test-1",
        runId: "workflow-test-1",
        status: "done",
      },
    },
  };
}

test("visible-loop child delivers sequentially and gates completion on governed deep-review", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-child-state-`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (command === "/usr/bin/ghostty" && args[0] === "+help") {
        return { code: 0, stdout: "Usage: ghostty +new-tab", stderr: "" };
      }
      if (command === "/usr/bin/ghostty") return { code: 0, stdout: "", stderr: "" };
      throw new Error(`unexpected command ${command}`);
    });
    const extension = createSidequestExtension({
      registerTools: true,
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
    const repoRoot = `${stateHome}/repo`;
    const harness = createContext({ cwd: repoRoot });
    mkdirSync(`${repoRoot}/.pi/prompts`, { recursive: true });
    mkdirSync(`${repoRoot}/docs/project`, { recursive: true });
    writeFileSync(`${repoRoot}/docs/project/product-posture.md`, "# posture\n", "utf8");
    writeFileSync(`${repoRoot}/docs/project/vision.md`, "# vision\n", "utf8");
    writeFileSync(`${repoRoot}/.pi/prompts/commit.md`, "EXPANDED COMMIT $ARGUMENTS\n", "utf8");

    await commands.get("visible-loop").handler("--count 2 --manual", harness.ctx);
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    assert.equal(userMessages.length, 1);

    const agentStart = events.get("agent_start")[0];
    const agentSettled = events.get("agent_settled")[0];
    const toolExecutionStart = events.get("tool_execution_start")[0];
    const toolExecutionEnd = events.get("tool_execution_end")[0];
    await agentStart({}, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    assert.equal(userMessages.length, 1, "agent_start must not prequeue follow-ups");

    for (let completed = 0; completed < 4; completed += 1) {
      await agentSettled({}, harness.ctx);
      assert.equal(userMessages.length, completed + 2);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }
    assert.match(userMessages[4].message, /Governed deep-review execution step/);
    assert.match(userMessages[4].message, /vault_execute_template/);
    assert.doesNotMatch(userMessages[4].message, /^\/deep-review$/);

    await toolExecutionStart(
      vaultStart({ toolCallId: "wrong-objective", objective: "Perform a shallow review" }),
      harness.ctx,
    );
    await toolExecutionEnd(vaultSuccess({ toolCallId: "wrong-objective" }), harness.ctx);
    const wrongObjectiveCompletion = await tools
      .get("visible_loop_child_complete")
      .execute("wrong-objective", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(wrongObjectiveCompletion.details.accepted, false);
    assert.match(wrongObjectiveCompletion.details.reason, /workflow receipt is missing/);

    await toolExecutionStart(vaultStart({ toolCallId: "error-marked" }), harness.ctx);
    await toolExecutionEnd(
      vaultSuccess({ toolCallId: "error-marked", isError: true }),
      harness.ctx,
    );
    const errorMarkedCompletion = await tools
      .get("visible_loop_child_complete")
      .execute("error-marked", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(errorMarkedCompletion.details.accepted, false);
    assert.match(errorMarkedCompletion.details.reason, /workflow receipt is missing/);

    await toolExecutionStart(vaultStart(), harness.ctx);
    await toolExecutionEnd(vaultSuccess(), harness.ctx);
    const prematureCompletion = await tools
      .get("visible_loop_child_complete")
      .execute("premature-completion", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(prematureCompletion.details.accepted, false);
    assert.match(prematureCompletion.details.reason, /prompt sequence has not reached/);
    assert.equal(userMessages.length, 5, "Nexus prompts must remain sequentially withheld");
    for (let completed = 4; completed < 9; completed += 1) {
      await agentSettled({}, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }

    assert.equal(userMessages.length, 10);
    assert.match(userMessages[6].message, /Prompt Vault/);
    assert.match(userMessages[7].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[8].message, /commit orchestrator|EXPANDED COMMIT/i);
    assert.match(userMessages[9].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[9].message, /visible_loop_child_complete/);
    assert.ok(userMessages.every((entry) => entry.options === undefined));

    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    assert.match(extractPiArgs(visibleLoopLaunches[1].args).at(-1), /^\/visible-loop-child /);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop stops before Nexus when governed deep-review has no success receipt", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-deep-review-fail-state-`);
  try {
    const extension = createSidequestExtension({
      registerTools: true,
      env: { XDG_STATE_HOME: stateHome },
    });
    const { commands, events, userMessages } = registerExtension(extension);
    const repoRoot = `${stateHome}/repo`;
    const harness = createContext({ cwd: repoRoot });
    mkdirSync(`${repoRoot}/.pi/prompts`, { recursive: true });
    writeFileSync(`${repoRoot}/.pi/prompts/commit.md`, "COMMIT\n", "utf8");

    const configDir = `${stateHome}/pi-little-helpers/visible-loop`;
    mkdirSync(configDir, { recursive: true });
    const configPath = `${configDir}/visible-loop-fail-test.json`;
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "visible-loop-fail-test",
        loopCount: 1,
        cwd: repoRoot,
        prompts: ["first", GOVERNED_DEEP_REVIEW_PROMPT, "must-not-run"],
        reportBack: "none",
        createdAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    const agentStart = events.get("agent_start")[0];
    const settled = events.get("agent_settled")[0];
    await settled({}, harness.ctx);
    assert.equal(userMessages.length, 1, "an unrelated settled event must not advance the queue");
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await agentStart({}, harness.ctx);
    await settled({}, harness.ctx);
    assert.equal(userMessages.length, 2);
    assert.match(userMessages[1].message, /Governed deep-review/);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await agentStart({}, harness.ctx);
    await settled({}, harness.ctx);
    assert.equal(userMessages.length, 2, "Nexus follow-up must remain withheld");
    assert.match(harness.notifications.at(-1).message, /governed deep-review did not complete/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
