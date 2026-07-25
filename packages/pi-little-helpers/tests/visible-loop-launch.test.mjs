// summary: verifies visible-loop and nexus-loop launch configs, prompt queues, slash bridging, and delegated commit prompts.
// read_when:
//   - changing loop command launch, config defaults, prompt expansion, adaptive budgets, or commit delegation.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import { parseVisibleLoopCommandArgs } from "../src/visibleLoop.ts";
import {
  assertLoopValidationGuidance,
  createContext,
  createExecStub,
  escapeRegExp,
  extractPiArgs,
  isLocalGhosttyBin,
  isLocalGhosttyWrapper,
  LOCAL_GHOSTTY_BIN,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

function assertImplementationVerificationFocus(prompt) {
  assert.match(prompt, /Verification expectation/);
  assert.match(prompt, /Keep the main work focus on the bounded implementation/);
  assert.doesNotMatch(prompt, /Repo loop validation guidance/);
  assert.doesNotMatch(prompt, /Typical phases/);
  assert.doesNotMatch(prompt, /loop-doctor/);
  assert.doesNotMatch(prompt, /loop-impact-plan/);
  assert.doesNotMatch(prompt, /loop-landing-check/);
}

test("visible-loop launch arguments require exactly one explicit execution binding", () => {
  const missing = parseVisibleLoopCommandArgs("--count 1");
  assert.equal(missing.ok, false);
  assert.match(missing.error, /requires one explicit execution binding/);
  assert.match(missing.error, /Run direction-to-execution/);

  const conflicting = parseVisibleLoopCommandArgs('--task AK-4187 --objective "different slice"');
  assert.equal(conflicting.ok, false);
  assert.match(conflicting.error, /Choose exactly one execution binding/);

  const duplicate = parseVisibleLoopCommandArgs("--task AK-4187 --task=9999");
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /Choose exactly one execution binding/);

  const optionAsObjective = parseVisibleLoopCommandArgs("--objective --manual");
  assert.equal(optionAsObjective.ok, false);
  assert.match(optionAsObjective.error, /Missing or invalid objective/);

  const unterminated = parseVisibleLoopCommandArgs('--objective "unterminated');
  assert.equal(unterminated.ok, false);
  assert.match(unterminated.error, /Unterminated quoted argument/);

  assert.deepEqual(parseVisibleLoopCommandArgs("--task AK-4187"), {
    ok: true,
    loopCount: 1,
    reportBack: "intercom",
    parentPeerTarget: undefined,
    taskId: 4187,
  });
});

test("unbound visible-loop command creates no config or Ghostty launch", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-unbound-launch-state-`);
  try {
    const execStub = createExecStub(({ command }) => {
      throw new Error(`unexpected command ${command}`);
    });
    const extension = createSidequestExtension({
      registerTools: true,
      env: { XDG_STATE_HOME: stateHome },
      exec: execStub.exec,
      pathExists() {
        return false;
      },
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("visible-loop").handler("--count 1", harness.ctx);
    await commands.get("visible-loop").handler("--objective --manual", harness.ctx);
    await commands.get("visible-loop").handler('--objective "unterminated', harness.ctx);

    assert.equal(execStub.calls.length, 0);
    assert.ok(
      harness.notifications.some((entry) =>
        /requires one explicit execution binding/.test(entry.message),
      ),
    );
    assert.ok(
      harness.notifications.some((entry) => /Missing or invalid objective/.test(entry.message)),
    );
    assert.ok(
      harness.notifications.some((entry) => /Unterminated quoted argument/.test(entry.message)),
    );
    assert.equal(existsSync(`${stateHome}/pi-little-helpers/visible-loop`), false);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("deferred AK task binding fails before config or Ghostty launch", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-deferred-task-state-`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (command === "ak" && args.slice(0, 2).join(" ") === "task show") {
        return {
          code: 0,
          stdout: JSON.stringify({
            id: 4187,
            repo: "/repo",
            status: "pending",
            active_deferral: { kind: "until_decision" },
          }),
          stderr: "",
        };
      }
      throw new Error(`unexpected command ${command}`);
    });
    const extension = createSidequestExtension({
      registerTools: true,
      env: { XDG_STATE_HOME: stateHome },
      exec: execStub.exec,
      pathExists() {
        return false;
      },
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("visible-loop").handler("--task 4187", harness.ctx);

    assert.equal(execStub.calls.filter((call) => call.command === "/usr/bin/ghostty").length, 0);
    assert.match(harness.notifications.at(-1).message, /AK task #4187 is actively deferred/);
    assert.equal(existsSync(`${stateHome}/pi-little-helpers/visible-loop`), false);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop writes config and launches one clean Ghostty tab with the child command", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-state-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (command === "ak" && args.slice(0, 2).join(" ") === "task show") {
        return {
          code: 0,
          stdout: JSON.stringify({
            id: 4187,
            repo: "/repo",
            status: "pending",
            active_deferral: null,
          }),
          stderr: "",
        };
      }
      if (command === "ak" && args.slice(0, 2).join(" ") === "task ready") {
        return { code: 0, stdout: JSON.stringify([{ id: 4187 }]), stderr: "" };
      }
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

    await commands.get("visible-loop").handler("--count 2 --task AK-4187", harness.ctx);

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
    assert.deepEqual(config.executionBinding, { mode: "ak_task", taskId: 4187 });
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.equal(config.parentPeerTarget, "session-019e10d2-15f5-705a-aea4-01ba49d2bbac");
    assert.equal(config.commitDelegation, undefined);
    assert.equal(config.adaptiveController.mode, "adaptive-v1");
    assert.equal(config.adaptiveController.maxWeightedCost, 100);
    assert.deepEqual(config.productPostureTarget, {
      cwd: "/repo",
      productPosturePath: "/repo/docs/project/product-posture.md",
      productPostureExists: false,
      visionPath: "/repo/docs/project/vision.md",
      visionExists: false,
    });
    assert.equal(config.prompts.length, 6);
    assert.match(
      config.prompts[0],
      /^read @docs\/project\/vision\.md and @docs\/project\/product-posture\.md\./,
    );
    assert.match(config.prompts[0], /Treat product-posture as an active work artifact/);
    assert.match(config.prompts[0], /Use the explicit execution binding supplied by the loop/);
    assert.doesNotMatch(config.prompts[0], /identify the next highest-impact slice/);
    assert.match(config.prompts[0], /owning package's docs\/project\/product-posture\.md/);
    assert.match(config.prompts[0], /config records cwd-level product-posture\/vision paths/);
    assert.match(config.prompts[0], /Which product-posture file owns this loop's frontier update/);
    assert.match(config.prompts[0], /design membrane/);
    assert.match(config.prompts[0], /TRUST \/ SECURITY MODEL/);
    assert.match(config.prompts[0], /ADVERSARIAL TEST PLAN/);
    assert.match(config.prompts[0], /Do not optimize for smallest diff/);
    assertImplementationVerificationFocus(config.prompts[0]);
    assert.match(config.prompts[0], /Proceed until completed and validated\./);
    assert.doesNotMatch(config.prompts[0], /Prompt Vault/);
    assert.match(
      config.prompts[1],
      /Audit the current implementation against the original design membrane/,
    );
    assert.match(config.prompts[1], /do not select or begin another product slice/);
    assert.match(config.prompts[1], /rerun only the invalidated focused proof/);
    assert.equal(config.prompts[2], "/deep-review");
    assert.match(config.prompts[3], /highest-leverage Nexus implementation/);
    assert.match(config.prompts[3], /one independent read-only review/);
    assert.match(config.prompts[3], /atomic-completion pass/);
    assertImplementationVerificationFocus(config.prompts[3]);
    assert.match(config.prompts[3], /Prompt Vault/);
    assert.match(
      config.prompts[3],
      /Execution means: inspect the current repo\/state, apply the needed bounded fixes, run verification/,
    );
    assert.match(config.prompts[3], /Do not stop after retrieving the template/);
    assert.match(config.prompts[4], /Update the owning product-posture\.md before loop completion/);
    assert.match(config.prompts[4], /Default target: @docs\/project\/product-posture\.md/);
    assert.match(config.prompts[4], /owning package's docs\/project\/product-posture\.md/);
    assert.match(config.prompts[4], /next-iteration frontier map/);
    assert.match(config.prompts[4], /Do not commit yet/);
    assert.equal(config.prompts[5], "/commit");
    assert.match(harness.notifications.at(-1).message, /Opened visible-loop/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop targets the controller Ghostty process instead of the sidequest broker", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-controller-dbus-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  try {
    const execStub = createExecStub(({ command, args }) => {
      if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
        return { code: 0, stdout: "Usage: ghostty +new-tab", stderr: "" };
      }
      if (isLocalGhosttyWrapper(command) && args[0] === "+version") {
        return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1", stderr: "" };
      }
      if (command === "busctl" && args[1] === "list") {
        return {
          code: 0,
          stdout:
            ":1.42 111 ghostty user :1.42 user@1000.service - -\n" +
            "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
        };
      }
      if (command === "busctl" && args[1] === "call") {
        return { code: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command ${command} ${args.join(" ")}`);
    });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_SURFACE_ID: "0x1234",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
      currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
      exec: execStub.exec,
      pathExists(path) {
        return isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
      },
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands
      .get("visible-loop")
      .handler('--count 1 --objective "target controller tab"', harness.ctx);

    const activation = execStub.calls.find(
      ({ command, args }) => command === "busctl" && args[1] === "call",
    );
    assert.ok(activation);
    assert.equal(activation.args[2], ":1.42");
    assert.equal(activation.args[9], "(tas)");
    assert.equal(activation.args[10], "4660");
    assert.ok(activation.args.includes("sidequest-pi"));
    const childCommand = extractPiArgs(activation.args).find((arg) =>
      arg.startsWith("/visible-loop-child "),
    );
    assert.match(childCommand, /^\/visible-loop-child /);
    const configPath = childCommand.replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.loopCount, 1);
    assert.equal(config.cwd, "/repo");
    assert.ok(
      !execStub.calls.some(
        ({ command, args }) => isLocalGhosttyWrapper(command) && args[0] === "+new-tab",
      ),
    );
    assert.match(harness.notifications.at(-1).message, /targeted controller Ghostty process 111/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop launch persists an explicitly configured adaptive controller budget", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-adaptive-state-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
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
        PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER: "1",
        PI_VISIBLE_LOOP_MAX_WEIGHTED_COST: "23",
      },
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands
      .get("visible-loop")
      .handler('--count 1 --objective "persist adaptive budget"', harness.ctx);

    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    const configPath = extractPiArgs(ghosttyCall.args)
      .at(-1)
      .replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.adaptiveController.mode, "adaptive-v1");
    assert.equal(config.adaptiveController.maxWeightedCost, 23);
    assert.equal(config.adaptiveController.weights.prompt_delivery_failed, 8);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("extension-originated sendUserMessage slash input can launch visible-loop", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-extension-input-state-`);
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
    const { events } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });
    const inputHandler = events.get("input")?.[0];
    assert.ok(inputHandler);

    const result = await inputHandler(
      {
        text: '/visible-loop --count 2 --delegate-commit --objective "bounded extension slice"',
        source: "extension",
      },
      harness.ctx,
    );

    assert.deepEqual(result, { action: "handled" });
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.ok(ghosttyCall);
    const piArgs = extractPiArgs(ghosttyCall.args);
    assert.match(piArgs.at(-1), /^\/visible-loop-child /);
    const configPath = piArgs.at(-1).replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.loopCount, 2);
    assert.deepEqual(config.executionBinding, {
      mode: "operator_objective",
      objective: "bounded extension slice",
    });
    assert.deepEqual(config.commitDelegation, {
      mode: "dispatch_subagent",
      promptTemplate: "commit",
    });
    assert.match(harness.notifications.at(-1).message, /Opened visible-loop/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("extension-originated sendUserMessage slash input can launch nexus-loop", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/nexus-loop-extension-input-state-`);
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
    const { events } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });
    const inputHandler = events.get("input")?.[0];
    assert.ok(inputHandler);

    const result = await inputHandler(
      {
        text: '/nexus-loop --count 1 --objective "harden bounded extension slice"',
        source: "extension",
      },
      harness.ctx,
    );

    assert.deepEqual(result, { action: "handled" });
    const ghosttyCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.ok(ghosttyCall);
    const piArgs = extractPiArgs(ghosttyCall.args);
    assert.match(piArgs.at(-1), /^\/visible-loop-child /);
    const configPath = piArgs.at(-1).replace(/^\/visible-loop-child\s+/, "");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.commandName, "nexus-loop");
    assert.equal(config.title, "Nexus loop");
    assert.equal(config.loopCount, 1);
    assert.deepEqual(config.commitDelegation, {
      mode: "dispatch_subagent",
      promptTemplate: "commit",
    });
    assert.match(harness.notifications.at(-1).message, /Opened nexus-loop/);
  } finally {
    restoreHome();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("extension-originated slash bridge ignores non-extension visible-loop text", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-interactive-input-state-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  try {
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
    const { events } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });
    const inputHandler = events.get("input")?.[0];
    assert.ok(inputHandler);

    const result = await inputHandler(
      { text: "/visible-loop --count 2", source: "interactive" },
      harness.ctx,
    );

    assert.deepEqual(result, { action: "continue" });
    assert.equal(execStub.calls.length, 0);
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
    mkdirSync(`${harness.ctx.cwd}/docs/project`, { recursive: true });
    writeFileSync(`${harness.ctx.cwd}/docs/project/product-posture.md`, "# posture\n", "utf8");
    writeFileSync(`${harness.ctx.cwd}/docs/project/vision.md`, "# vision\n", "utf8");
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

    await commands
      .get("nexus-loop")
      .handler('--count 3 --manual --objective "harden release seam"', harness.ctx);

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
    assert.deepEqual(config.executionBinding, {
      mode: "operator_objective",
      objective: "harden release seam",
    });
    assert.deepEqual(config.commitDelegation, {
      mode: "dispatch_subagent",
      promptTemplate: "commit",
    });
    assert.deepEqual(config.productPostureTarget, {
      cwd: repoRoot,
      productPosturePath: `${repoRoot}/docs/project/product-posture.md`,
      productPostureExists: true,
      visionPath: `${repoRoot}/docs/project/vision.md`,
      visionExists: true,
    });
    assert.equal(config.commandName, "nexus-loop");
    assert.equal(config.prompts.length, 4);
    assert.equal(config.prompts[0], "/deep-review");
    assert.match(config.prompts[1], /highest-leverage Nexus implementation/);
    assert.match(config.prompts[1], /one independent read-only review/);
    assert.match(config.prompts[1], /atomic-completion pass/);
    assertImplementationVerificationFocus(config.prompts[1]);
    assert.match(config.prompts[1], /Prompt Vault/);
    assert.match(config.prompts[1], /vault_query\(\.\.\., include_content:false\)/);
    assert.match(config.prompts[1], /vault_retrieve\(\.\.\., include_content:true\)/);
    assert.match(config.prompts[1], /vault_dispatch_check/);
    assert.match(config.prompts[2], /Update the owning product-posture\.md before loop completion/);
    assert.match(config.prompts[2], /Do not commit yet/);
    assert.equal(config.prompts[3], "/commit");
    assert.match(harness.notifications.at(-1).message, /Opened nexus-loop/);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.match(userMessages[0].message, /EXECUTION BINDING — FAIL CLOSED/);
    assert.match(userMessages[0].message, /EXPANDED DEEP REVIEW LOCAL_SENTINEL/);

    const agentStart = events.get("agent_start")[0];
    await agentStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 800));

    assert.equal(userMessages.length, 4);
    for (const message of userMessages) {
      assert.match(message.message, /EXECUTION BINDING — FAIL CLOSED/);
    }
    assert.match(userMessages[1].message, /highest-leverage Nexus implementation/);
    assert.match(userMessages[1].message, /atomic-completion pass/);
    assertImplementationVerificationFocus(userMessages[1].message);
    assert.match(userMessages[2].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[3].message, /Nexus loop commit delegation step/);
    assert.match(userMessages[3].message, /dispatch_subagent/);
    assert.match(
      userMessages[3].message,
      /Do not run the commit workflow in this loop child session/,
    );
    assert.match(userMessages[3].message, /Call `dispatch_subagent` exactly once/);
    assert.match(
      userMessages[3].message,
      /The configured `\/commit` prompt has already been resolved/,
    );
    assert.match(userMessages[3].message, /EXPANDED COMMIT LOCAL_SENTINEL/);
    assert.match(userMessages[3].message, /"profile": "minimal"/);
    assert.match(userMessages[3].message, /"tools": "read,bash"/);
    assert.match(userMessages[3].message, /"prompt_name": "nexus-loop-commit-delegation"/);
    assert.match(userMessages[3].message, /"prompt_source": "pi-little-helpers"/);
    assert.match(userMessages[3].message, /Nexus loop delegated commit workflow/);
    assertLoopValidationGuidance(userMessages[3].message);
    assert.match(userMessages[3].message, new RegExp(escapeRegExp(`cwd: ${repoRoot}`)));
    assert.match(
      userMessages[3].message,
      new RegExp(escapeRegExp(`nexus-loop run id: ${config.runId}`)),
    );
    assert.match(
      userMessages[3].message,
      /Do not perform new implementation work or broaden scope/,
    );
    assert.match(userMessages[3].message, /State validation commands run and results/);
    assert.doesNotMatch(userMessages[3].message, /peer_watch/);
    assert.match(userMessages[3].message, /visible_loop_child_complete/);
    assert.match(userMessages[3].message, new RegExp(escapeRegExp(configPath)));
    assert.doesNotMatch(userMessages[3].message, /^\/commit$/m);
    assert.doesNotMatch(userMessages[3].message, /Visible-loop internal completion checkpoint/);
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

    await commands
      .get("visible-loop")
      .handler(
        '--count 2 --manual --delegate-commit --objective "delegate bounded commit"',
        harness.ctx,
      );

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
    assert.equal(config.prompts.length, 6);
    assert.equal(config.prompts[5], "/commit");

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    const agentStart = events.get("agent_start")[0];
    await agentStart({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.equal(userMessages.length, 6);
    assert.match(userMessages[4].message, /Update the owning product-posture\.md/);
    assert.match(userMessages[5].message, /Visible loop commit delegation step/);
    assert.match(userMessages[5].message, /dispatch_subagent/);
    assert.match(userMessages[5].message, /EXPANDED COMMIT/);
    assert.match(userMessages[5].message, /"profile": "minimal"/);
    assert.match(userMessages[5].message, /"tools": "read,bash"/);
    assert.match(userMessages[5].message, /"prompt_name": "visible-loop-commit-delegation"/);
    assert.match(userMessages[5].message, /"prompt_source": "pi-little-helpers"/);
    assert.match(userMessages[5].message, /Visible loop delegated commit workflow/);
    assertLoopValidationGuidance(userMessages[5].message);
    assert.match(userMessages[5].message, new RegExp(escapeRegExp(`cwd: ${repoRoot}`)));
    assert.match(
      userMessages[5].message,
      new RegExp(escapeRegExp(`visible-loop run id: ${config.runId}`)),
    );
    assert.match(
      userMessages[5].message,
      /Do not perform new implementation work or broaden scope/,
    );
    assert.match(userMessages[5].message, /State validation commands run and results/);
    assert.doesNotMatch(userMessages[5].message, /peer_watch/);
    assert.match(userMessages[5].message, /visible_loop_child_complete/);
    assert.match(userMessages[5].message, new RegExp(escapeRegExp(configPath)));
    assert.doesNotMatch(userMessages[5].message, /^\/commit$/m);
    assert.doesNotMatch(userMessages[5].message, /Visible-loop internal completion checkpoint/);
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

    await commands
      .get("nexus-loop")
      .handler('--count 1 --manual --objective "missing prompt test"', harness.ctx);

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
