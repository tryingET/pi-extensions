import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  assertLoopValidationGuidance,
  createContext,
  createExecStub,
  escapeRegExp,
  extractPiArgs,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

test("visible-loop writes config and launches one clean Ghostty tab with the child command", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-state-`);
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
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("visible-loop").handler("--count 2", harness.ctx);

    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.ok(ghosttyCall);
    assert.equal(ghosttyCall.args[0], "+new-tab");
    const piArgs = extractPiArgs(ghosttyCall.args);
    assert.equal(piArgs[0], "pi");
    assert.match(piArgs.at(-1), /^\/visible-loop-child /);
    const configPath = piArgs.at(-1).replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.loopCount, 2);
    assert.equal(config.cwd, "/repo");
    assert.equal(config.reportBack, "intercom");
    assert.equal(config.parentPeerTarget, "session-019e10d2-15f5-705a-aea4-01ba49d2bbac");
    assert.equal(config.commitDelegation, undefined);
    assert.equal(config.prompts.length, 9);
    assert.match(
      config.prompts[0],
      /^read @docs\/project\/vision\.md and @docs\/project\/product-posture\.md\./,
    );
    assert.match(config.prompts[0], /Treat product-posture as an active work artifact/);
    assert.match(config.prompts[0], /owning package's docs\/project\/product-posture\.md/);
    assert.match(config.prompts[0], /Which product-posture file owns this loop's frontier update/);
    assert.match(config.prompts[0], /design membrane/);
    assert.match(config.prompts[0], /TRUST \/ SECURITY MODEL/);
    assert.match(config.prompts[0], /ADVERSARIAL TEST PLAN/);
    assert.match(config.prompts[0], /Do not optimize for smallest diff/);
    assertLoopValidationGuidance(config.prompts[0]);
    assert.match(config.prompts[0], /Proceed until completed and validated\./);
    assert.doesNotMatch(config.prompts[0], /Prompt Vault/);
    assert.equal(config.prompts[1], "proceed");
    assert.equal(config.prompts[4], "/deep-review");
    assert.match(
      config.prompts[5],
      /proceed with nexus implementation until completion and verification/,
    );
    assertLoopValidationGuidance(config.prompts[5]);
    assert.match(config.prompts[6], /fix any bugs/);
    assert.match(config.prompts[6], /Prompt Vault/);
    assert.match(
      config.prompts[6],
      /Execution means: inspect the current repo\/state, apply the needed bounded fixes, run verification/,
    );
    assert.match(config.prompts[6], /Do not stop after retrieving the template/);
    assert.match(config.prompts[7], /Update the owning product-posture\.md before loop completion/);
    assert.match(config.prompts[7], /Default target: @docs\/project\/product-posture\.md/);
    assert.match(config.prompts[7], /owning package's docs\/project\/product-posture\.md/);
    assert.match(config.prompts[7], /next-iteration frontier map/);
    assert.match(config.prompts[7], /Do not commit yet/);
    assert.equal(config.prompts[8], "/commit");
    assert.match(harness.notifications.at(-1).message, /Opened visible-loop/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("nexus-loop writes a focused command-aware config and launches the shared child runner", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/nexus-loop-state-`);
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
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/deep-review.md`,
      "EXPANDED DEEP REVIEW LOCAL_SENTINEL $ARGUMENTS\n",
      "utf8",
    );
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/commit.md`,
      "EXPANDED COMMIT LOCAL_SENTINEL $ARGUMENTS\n",
      "utf8",
    );

    await commands.get("nexus-loop").handler("--count 3 --manual", harness.ctx);

    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.ok(ghosttyCall);
    const piArgs = extractPiArgs(ghosttyCall.args);
    assert.match(piArgs.at(-1), /^\/visible-loop-child /);
    const configPath = piArgs.at(-1).replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.match(config.runId, /^nexus-loop-/);
    assert.equal(config.title, "Nexus loop");
    assert.equal(config.loopCount, 3);
    assert.equal(config.cwd, repoRoot);
    assert.equal(config.reportBack, "manual");
    assert.deepEqual(config.commitDelegation, {
      mode: "dispatch_subagent",
      promptTemplate: "commit",
    });
    assert.equal(config.commandName, "nexus-loop");
    assert.equal(config.prompts.length, 5);
    assert.equal(config.prompts[0], "/deep-review");
    assert.match(
      config.prompts[1],
      /proceed with nexus implementation until completion and verification/,
    );
    assertLoopValidationGuidance(config.prompts[1]);
    assert.match(config.prompts[2], /fix any bugs/);
    assert.match(config.prompts[2], /atomic-completion/);
    assert.match(config.prompts[2], /Prompt Vault/);
    assert.match(config.prompts[2], /vault_query\(\.\.\., include_content:false\)/);
    assert.match(config.prompts[2], /vault_retrieve\(\.\.\., include_content:true\)/);
    assert.match(config.prompts[2], /vault_dispatch_check/);
    assert.match(config.prompts[3], /Update the owning product-posture\.md before loop completion/);
    assert.match(config.prompts[3], /Do not commit yet/);
    assert.equal(config.prompts[4], "/commit");
    assert.match(harness.notifications.at(-1).message, /Opened nexus-loop/);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].message, "EXPANDED DEEP REVIEW LOCAL_SENTINEL ");

    const agentStart = events.get("agent_start")[0];
    await agentStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 800));

    assert.equal(userMessages.length, 5);
    assert.match(
      userMessages[1].message,
      /proceed with nexus implementation until completion and verification/,
    );
    assertLoopValidationGuidance(userMessages[1].message);
    assert.match(userMessages[2].message, /fix any bugs/);
    assert.match(userMessages[3].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[4].message, /Nexus loop commit delegation step/);
    assert.match(userMessages[4].message, /dispatch_subagent/);
    assert.match(
      userMessages[4].message,
      /Do not run the commit workflow in this loop child session/,
    );
    assert.match(userMessages[4].message, /Call `dispatch_subagent` exactly once/);
    assert.match(
      userMessages[4].message,
      /The configured `\/commit` prompt has already been resolved/,
    );
    assert.match(userMessages[4].message, /EXPANDED COMMIT LOCAL_SENTINEL/);
    assert.match(userMessages[4].message, /"profile": "minimal"/);
    assert.match(userMessages[4].message, /"tools": "read,bash"/);
    assert.match(userMessages[4].message, /"prompt_name": "nexus-loop-commit-delegation"/);
    assert.match(userMessages[4].message, /"prompt_source": "pi-little-helpers"/);
    assert.match(userMessages[4].message, /Nexus loop delegated commit workflow/);
    assertLoopValidationGuidance(userMessages[4].message);
    assert.match(userMessages[4].message, new RegExp(escapeRegExp(`cwd: ${repoRoot}`)));
    assert.match(
      userMessages[4].message,
      new RegExp(escapeRegExp(`nexus-loop run id: ${config.runId}`)),
    );
    assert.match(
      userMessages[4].message,
      /Do not perform new implementation work or broaden scope/,
    );
    assert.match(userMessages[4].message, /State validation commands run and results/);
    assert.doesNotMatch(userMessages[4].message, /peer_watch/);
    assert.match(userMessages[4].message, /visible_loop_child_complete/);
    assert.match(userMessages[4].message, new RegExp(escapeRegExp(configPath)));
    assert.doesNotMatch(userMessages[4].message, /^\/commit$/m);
    assert.doesNotMatch(userMessages[4].message, /Visible-loop internal completion checkpoint/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop can delegate commit with --delegate-commit", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-delegate-commit-state-`);
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

    await commands.get("visible-loop").handler("--count 2 --manual --delegate-commit", harness.ctx);

    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.ok(ghosttyCall);
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.match(config.runId, /^visible-loop-/);
    assert.deepEqual(config.commitDelegation, {
      mode: "dispatch_subagent",
      promptTemplate: "commit",
    });
    assert.equal(config.prompts.length, 9);
    assert.equal(config.prompts[8], "/commit");

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    const agentStart = events.get("agent_start")[0];
    await agentStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.equal(userMessages.length, 9);
    assert.match(userMessages[7].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[8].message, /Visible loop commit delegation step/);
    assert.match(userMessages[8].message, /dispatch_subagent/);
    assert.match(userMessages[8].message, /EXPANDED COMMIT/);
    assert.match(userMessages[8].message, /"profile": "minimal"/);
    assert.match(userMessages[8].message, /"tools": "read,bash"/);
    assert.match(userMessages[8].message, /"prompt_name": "visible-loop-commit-delegation"/);
    assert.match(userMessages[8].message, /"prompt_source": "pi-little-helpers"/);
    assert.match(userMessages[8].message, /Visible loop delegated commit workflow/);
    assertLoopValidationGuidance(userMessages[8].message);
    assert.match(userMessages[8].message, new RegExp(escapeRegExp(`cwd: ${repoRoot}`)));
    assert.match(
      userMessages[8].message,
      new RegExp(escapeRegExp(`visible-loop run id: ${config.runId}`)),
    );
    assert.match(
      userMessages[8].message,
      /Do not perform new implementation work or broaden scope/,
    );
    assert.match(userMessages[8].message, /State validation commands run and results/);
    assert.doesNotMatch(userMessages[8].message, /peer_watch/);
    assert.match(userMessages[8].message, /visible_loop_child_complete/);
    assert.match(userMessages[8].message, new RegExp(escapeRegExp(configPath)));
    assert.doesNotMatch(userMessages[8].message, /^\/commit$/m);
    assert.doesNotMatch(userMessages[8].message, /Visible-loop internal completion checkpoint/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("nexus-loop fails closed before launch when required slash prompt templates are missing", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/nexus-loop-missing-prompts-state-`);
  const originalHome = process.env.HOME;
  try {
    const fakeHome = `${stateHome}/home`;
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    const execStub = createExecStub(({ command }) => {
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
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });

    await commands.get("nexus-loop").handler("--count 1 --manual", harness.ctx);

    assert.equal(execStub.calls.length, 0);
    assert.match(harness.notifications.at(-1).message, /missing required prompt template/);
    assert.match(harness.notifications.at(-1).message, /\/deep-review/);
    assert.match(harness.notifications.at(-1).message, /\/commit/);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(stateHome, { recursive: true, force: true });
  }
});
