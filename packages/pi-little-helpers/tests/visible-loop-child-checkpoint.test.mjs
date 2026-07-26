// summary: verifies child prompt sequencing, explicit completion checkpoints, adaptive receipts, and next-iteration launch.
// read_when:
//   - changing visible-loop child queues, completion checkpoint delivery, controller persistence, or iteration continuation.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  DEFAULT_NEXUS_LOOP_PROMPTS,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  observeLatestVisibleLoopMessage,
  registerExtension,
} from "./sidequest-harness.mjs";

test("visible-loop child queues an explicit completion checkpoint before launching next iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-child-state-`);
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
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
        PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
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
    mkdirSync(`${harness.ctx.cwd}/.pi/prompts`, { recursive: true });
    mkdirSync(`${harness.ctx.cwd}/docs/project`, { recursive: true });
    writeFileSync(`${harness.ctx.cwd}/docs/project/product-posture.md`, "# posture\n", "utf8");
    writeFileSync(`${harness.ctx.cwd}/docs/project/vision.md`, "# vision\n", "utf8");
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/commit.md`,
      "EXPANDED COMMIT $ARGUMENTS\n",
      "utf8",
    );

    await commands
      .get("visible-loop")
      .handler('--count 2 --manual --objective "checkpoint bounded slice"', harness.ctx);
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);

    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].options, undefined);
    assert.match(userMessages[0].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[0].message, /operator objective "checkpoint bounded slice"/);

    const agentStart = events.get("agent_start")[0];
    const agentSettled = events.get("agent_settled")[0];
    const toolExecutionStart = events.get("tool_execution_start")[0];
    const toolExecutionEnd = events.get("tool_execution_end")[0];
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await agentStart({}, harness.ctx);
    for (let completed = 0; completed < 2; completed += 1) {
      await agentSettled({}, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }
    await toolExecutionStart(
      {
        toolCallId: "checkpoint-deep-review",
        toolName: "vault_execute_template",
        args: { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE },
      },
      harness.ctx,
    );
    await toolExecutionEnd(
      {
        toolCallId: "checkpoint-deep-review",
        toolName: "vault_execute_template",
        isError: false,
        result: {
          details: {
            ok: true,
            templateName: "deep-review",
            executionSurface: "workflow_execute",
            handoffId: "checkpoint-handoff",
            runId: "checkpoint-workflow",
            status: "done",
          },
        },
      },
      harness.ctx,
    );
    for (let completed = 2; completed < 6; completed += 1) {
      await agentSettled({}, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }

    assert.equal(userMessages.length, 7);
    for (const message of userMessages) {
      assert.match(message.message, /EXECUTION BINDING — FAIL CLOSED/);
    }
    assert.match(
      userMessages[1].message,
      /Audit the current implementation against the original design membrane/,
    );
    assert.match(userMessages[1].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.notEqual(userMessages[2].message, "/deep-review");
    assert.match(userMessages[2].message, /Governed deep-review execution step/);
    assert.match(userMessages[2].message, /vault_execute_template/);
    assert.match(userMessages[2].message, /must not choose product direction/);
    assert.match(userMessages[3].message, /Prompt Vault/);
    assert.match(userMessages[3].message, /Do not stop after retrieving the template/);
    assert.match(userMessages[4].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[4].message, /Default target: @docs\/project\/product-posture\.md/);
    assert.match(userMessages[4].message, /owning package's docs\/project\/product-posture\.md/);
    assert.match(userMessages[4].message, /next-iteration frontier map/);
    assert.notEqual(userMessages[5].message, "/commit");
    assert.match(userMessages[5].message, /commit orchestrator|EXPANDED COMMIT/i);
    assert.match(userMessages[6].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[6].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[6].message, /visible_loop_child_complete/);
    assert.match(userMessages[6].message, /product-posture refresh or \/commit prompt failed/);
    assert.match(userMessages[6].message, /Adaptive controller mode is active/);
    assert.match(userMessages[6].message, /host-recorded prompt-delivery/);
    assert.match(
      userMessages[6].message,
      new RegExp(
        `${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/docs/project/product-posture\\.md`,
      ),
    );
    assert.match(userMessages[6].message, /Launch-recorded product-posture target: .*exists/);
    assert.match(
      userMessages[6].message,
      new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.ok(userMessages.every((entry) => entry.options === undefined));
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(
      userMessages.length,
      7,
      "next iteration should not queue before explicit completion checkpoint runs",
    );
    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(userMessages.length, 7);
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    assert.match(extractPiArgs(visibleLoopLaunches[1].args).at(-1), /^\/visible-loop-child /);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const statusEntries = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some((entry) => entry.event === "adaptive_completion_invariants_passed"),
    );
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "adaptive_continuation_decided" &&
          entry.decision?.method === "new_session",
      ),
    );

    const controllerStatePath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.controller.json`;
    const firstIterationCost = JSON.parse(readFileSync(controllerStatePath, "utf8")).weightedCost;
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const restoredCost = JSON.parse(readFileSync(controllerStatePath, "utf8")).weightedCost;
    assert.ok(restoredCost > firstIterationCost, "new child must retain and extend run cost");
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await agentStart({}, harness.ctx);
    for (let completed = 0; completed < 2; completed += 1) {
      await agentSettled({}, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }
    await toolExecutionStart(
      {
        toolCallId: "checkpoint-deep-review-2",
        toolName: "vault_execute_template",
        args: { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE },
      },
      harness.ctx,
    );
    await toolExecutionEnd(
      {
        toolCallId: "checkpoint-deep-review-2",
        toolName: "vault_execute_template",
        isError: false,
        result: {
          details: {
            ok: true,
            templateName: "deep-review",
            executionSurface: "workflow_execute",
            handoffId: "checkpoint-handoff-2",
            runId: "checkpoint-workflow-2",
            status: "done",
          },
        },
      },
      harness.ctx,
    );
    for (let completed = 2; completed < 6; completed += 1) {
      await agentSettled({}, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await agentStart({}, harness.ctx);
    }
    const finalResult = await tools
      .get("visible_loop_child_complete")
      .execute("adaptive-final", { configPath, iteration: 2 }, null, null, harness.ctx);
    assert.equal(finalResult.details.accepted, true, finalResult.details.reason);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const finalEntries = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(finalEntries.some((entry) => entry.event === "loop_completed"));
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("governed deep-review with no verified workflow receipt stops before Nexus", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-deep-review-missing-receipt-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "missing receipt test" },
      prompts: DEFAULT_NEXUS_LOOP_PROMPTS,
      runId: "visible-loop-missing-deep-review-receipt",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    await events.get("agent_settled")[0]({}, harness.ctx);

    assert.equal(userMessages.length, 1, "Nexus must remain withheld without a receipt");
    assert.match(harness.notifications.at(-1).message, /governed deep-review did not complete/);
    const completion = await tools
      .get("visible_loop_child_complete")
      .execute("missing-receipt", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("a duplicate governed deep-review execution fails closed", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-deep-review-duplicate-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "duplicate review test" },
      prompts: DEFAULT_NEXUS_LOOP_PROMPTS,
      runId: "visible-loop-duplicate-deep-review",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    const start = events.get("tool_execution_start")[0];
    const args = { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE };
    await start(
      { toolCallId: "first-review", toolName: "vault_execute_template", args },
      harness.ctx,
    );
    await start(
      { toolCallId: "second-review", toolName: "vault_execute_template", args },
      harness.ctx,
    );

    assert.match(harness.notifications.at(-1).message, /duplicate governed deep-review/);
    const completion = await tools
      .get("visible_loop_child_complete")
      .execute("duplicate-review", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("a duplicate governed deep-review end receipt fails closed", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-deep-review-duplicate-receipt-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "duplicate receipt test" },
      prompts: DEFAULT_NEXUS_LOOP_PROMPTS,
      runId: "visible-loop-duplicate-deep-review-receipt",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    const start = events.get("tool_execution_start")[0];
    const end = events.get("tool_execution_end")[0];
    await start(
      {
        toolCallId: "duplicate-receipt-review",
        toolName: "vault_execute_template",
        args: { template_name: "deep-review", objective: GOVERNED_DEEP_REVIEW_OBJECTIVE },
      },
      harness.ctx,
    );
    const receipt = {
      toolCallId: "duplicate-receipt-review",
      toolName: "vault_execute_template",
      isError: false,
      result: {
        details: {
          ok: true,
          templateName: "deep-review",
          executionSurface: "workflow_execute",
          handoffId: "duplicate-receipt-handoff",
          status: "done",
        },
      },
    };
    await end(receipt, harness.ctx);
    await end(receipt, harness.ctx);

    assert.match(harness.notifications.at(-1).message, /duplicate governed deep-review receipt/);
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 1, "duplicate receipt must not release Nexus");
    const completion = await tools
      .get("visible_loop_child_complete")
      .execute("duplicate-receipt", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(completion.details.accepted, false);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("raw deep-review slash prompts are rejected even when a local file exists", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-raw-deep-review-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, userMessages } = registerExtension(extension);
    const repo = `${stateHome}/repo`;
    const harness = createContext({ cwd: repo });
    mkdirSync(`${repo}/.pi/prompts`, { recursive: true });
    writeFileSync(`${repo}/.pi/prompts/deep-review.md`, "RAW REVIEW MUST NOT EXECUTE\n", "utf8");
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: repo,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "raw review rejection" },
      prompts: ["CANDIDATE EXECUTION MEMBRANE\n\n/deep-review", "must not run"],
      runId: "visible-loop-raw-deep-review",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);

    assert.equal(userMessages.length, 0);
    assert.match(harness.notifications.at(-1).message, /raw \/deep-review.*forbidden/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
