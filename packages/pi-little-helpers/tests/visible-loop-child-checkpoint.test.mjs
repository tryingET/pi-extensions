import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
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
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands, events, userMessages } = registerExtension(extension);
    const repoRoot = `${stateHome}/repo`;
    const harness = createContext({ cwd: repoRoot });
    mkdirSync(`${harness.ctx.cwd}/.pi/prompts`, { recursive: true });
    mkdirSync(`${harness.ctx.cwd}/docs/project`, { recursive: true });
    writeFileSync(`${harness.ctx.cwd}/docs/project/product-posture.md`, "# posture\n", "utf8");
    writeFileSync(`${harness.ctx.cwd}/docs/project/vision.md`, "# vision\n", "utf8");
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/deep-review.md`,
      "EXPANDED DEEP REVIEW $ARGUMENTS\n",
      "utf8",
    );
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/commit.md`,
      "EXPANDED COMMIT $ARGUMENTS\n",
      "utf8",
    );

    await commands.get("visible-loop").handler("--count 2 --manual", harness.ctx);
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].options, undefined);

    const agentStart = events.get("agent_start")[0];
    await agentStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.equal(userMessages.length, 10);
    assert.equal(userMessages[1].message, "proceed");
    assert.notEqual(userMessages[4].message, "/deep-review");
    assert.match(userMessages[4].message, /DEEP REVIEW/);
    assert.match(userMessages[6].message, /Prompt Vault/);
    assert.match(userMessages[6].message, /Do not stop after retrieving the template/);
    assert.match(userMessages[7].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[7].message, /Default target: @docs\/project\/product-posture\.md/);
    assert.match(userMessages[7].message, /owning package's docs\/project\/product-posture\.md/);
    assert.match(userMessages[7].message, /next-iteration frontier map/);
    assert.notEqual(userMessages[8].message, "/commit");
    assert.match(userMessages[8].message, /commit orchestrator|EXPANDED COMMIT/i);
    assert.match(userMessages[9].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[9].message, /visible_loop_child_complete/);
    assert.match(userMessages[9].message, /product-posture refresh or \/commit prompt failed/);
    assert.match(
      userMessages[9].message,
      new RegExp(
        `${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/docs/project/product-posture\\.md`,
      ),
    );
    assert.match(userMessages[9].message, /Launch-recorded product-posture target: .*exists/);
    assert.match(
      userMessages[9].message,
      new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.deepEqual(
      userMessages.slice(1).map((entry) => entry.options),
      Array(9).fill({ deliverAs: "followUp" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(
      userMessages.length,
      10,
      "next iteration should not queue before explicit completion checkpoint runs",
    );
    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);

    const agentEnd = events.get("agent_settled")[0];
    await agentEnd({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      1,
      "agent_settled must not launch the next iteration before the completion tool runs",
    );

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(userMessages.length, 10);
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    assert.match(extractPiArgs(visibleLoopLaunches[1].args).at(-1), /^\/visible-loop-child /);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
