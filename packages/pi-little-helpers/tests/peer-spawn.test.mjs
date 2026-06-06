import assert from "node:assert/strict";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  assertIntercomReportBackContract,
  createContext,
  createExecStub,
  extractPiArgs,
  extractShellCommand,
  registerExtension,
} from "./sidequest-harness.mjs";

test("/scoutpeer uses intercom report-back when the controller session id is available", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { commands } = registerExtension(extension);
  const harness = createContext({ cwd: "/repo" });

  await commands.get("scoutpeer").handler("Review loop cues", harness.ctx);

  const launchCall = execStub.calls.find(
    (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
  );
  assert.ok(launchCall);
  const prompt = extractPiArgs(launchCall.args).at(-1);
  assertIntercomReportBackContract(prompt, {
    peerPrefix: "scoutpeer",
    target: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
  });
  assert.doesNotMatch(prompt, /Manual report-back is requested/);
  assert.match(harness.notifications.at(-1).message, /watch with intercom/);
  assert.match(
    harness.notifications.at(-1).message,
    /intercom\(\{ action: "peer_watch", peerRunId: "scoutpeer-[^"]+", waitFor: "final" \}\)/,
  );
});

test("fork_peer_spawn launches a forked-context peer", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("fork_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "inherit this context" },
      undefined,
      undefined,
      createContext().ctx,
    );

  const piArgs = extractPiArgs(execStub.calls[1].args);
  assert.deepEqual(piArgs.slice(0, 3), ["pi", "--fork", "/sessions/main.jsonl"]);
  assert.equal(piArgs.at(-1), "inherit this context");
  assert.equal(result.details.sessionMode, "fork");
  assert.equal(result.details.canonicalTool, "fork_peer_spawn");
  assert.equal(result.details.reportBack, "manual");
});

test("fork_peer_spawn can request intercom report-back", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const target = "session-019e10d2-15f5-705a-aea4-01ba49d2bbac";
  const result = await tools.get("fork_peer_spawn").execute(
    "tool-call-1",
    {
      objective: "commit this finished work",
      reportBack: "intercom",
      parentPeerTarget: target,
    },
    undefined,
    undefined,
    createContext().ctx,
  );

  const piArgs = extractPiArgs(execStub.calls[1].args);
  assert.deepEqual(piArgs.slice(0, 3), ["pi", "--fork", "/sessions/main.jsonl"]);
  const prompt = piArgs.at(-1);
  assert.match(prompt, /# Visible Fork Peer Prompt/);
  assert.match(prompt, /## Objective\ncommit this finished work/);
  assertIntercomReportBackContract(prompt, { peerPrefix: "forkpeer", target });
  assert.equal(result.details.reportBack, "intercom");
  assert.equal(result.details.parentPeerTarget, target);
  assert.deepEqual(result.details.expectedMessages, ["PEER_ACK", "PEER_FINAL"]);
  assert.match(result.details.nextStep, /peer_watch/);
});

test("fork_peer_spawn requires exact parentPeerTarget for intercom report-back", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without an exact parent target");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("fork_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "report but no target", reportBack: "intercom" },
      undefined,
      undefined,
      createContext().ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "missing_parent_peer_target");
});

test("scout_peer_spawn launches a clean session even when the controller session has not been saved", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const sidequestSpawn = tools.get("scout_peer_spawn");
  const harness = createContext({ sessionFile: undefined });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    {
      objective: "inspect clean launch handling",
      parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
    },
    undefined,
    undefined,
    harness.ctx,
  );

  assert.equal(execStub.calls.length, 2);
  const piArgs = extractPiArgs(execStub.calls[1].args);
  assert.deepEqual(piArgs.slice(0, 4), ["pi", "--model", "openai/gpt-4o", "--thinking"]);
  assert.equal(piArgs[4], "medium");
  assert.equal(piArgs.includes("--fork"), false);
  assert.equal(result.details.ok, true);
  assert.equal(result.details.sessionMode, "clean");
  assert.equal(result.details.sourceSessionFile, undefined);
  assert.equal(result.details.enforcement, "prompt_contract");
});

test("scout_peer_spawn rejects a blank objective before probing Ghostty", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called for a blank objective");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const sidequestSpawn = tools.get("scout_peer_spawn");
  const harness = createContext();

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    { objective: "   " },
    undefined,
    undefined,
    harness.ctx,
  );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "blank_objective");
});

test("scout_peer_spawn requires exact parentPeerTarget for default intercom report-back", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without an exact parent target");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("scout_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "inspect without orphaning" },
      undefined,
      undefined,
      createContext().ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "missing_parent_peer_target");
  assert.match(result.details.nextStep, /intercom\(\{ action: "status" \}\)/);
});

test("scout_peer_spawn rejects ambiguous parentPeerTarget aliases before launch", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called with an ambiguous parent target");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("scout_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "inspect without orphaning", parentPeerTarget: "current" },
      undefined,
      undefined,
      createContext().ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "ambiguous_parent_peer_target");
  assert.equal(result.details.parentPeerTarget, "current");
  assert.match(result.details.nextStep, /intercom\(\{ action: "status" \}\)/);
});

test("scout_peer_spawn rejects non-session-id parentPeerTarget before launch", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called with a non-session parent target");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("scout_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "inspect without orphaning", parentPeerTarget: "main" },
      undefined,
      undefined,
      createContext().ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "not_exact_session_id");
  assert.equal(result.details.parentPeerTarget, "main");
});

test("scout_peer_spawn uses the same Ghostty window fallback launch path and returns structured details", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension, { thinkingLevel: "high" });
  const sidequestSpawn = tools.get("scout_peer_spawn");
  const harness = createContext({ cwd: "/controller" });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    {
      role: "reviewer",
      objective: "Review the retry plan for sidequest fallback",
      cwd: "/requested-cwd",
      reportBack: "intercom",
      parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
    },
    undefined,
    undefined,
    harness.ctx,
  );

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "--working-directory=/requested-cwd"],
    ],
  );

  const launchArgs = execStub.calls[1].args;
  assert.match(
    extractShellCommand(launchArgs),
    /PI_SESSION_PRESENCE_TITLE_BASE='Scoutpeer: Review the retry plan for sidequest fallback'/,
  );
  const piArgs = extractPiArgs(launchArgs);
  assert.deepEqual(piArgs.slice(0, 4), ["pi", "--model", "openai/gpt-4o", "--thinking"]);
  assert.equal(piArgs[4], "high");
  assert.equal(piArgs.includes("--fork"), false);
  assert.match(piArgs.at(-1), /Visible Scout Peer Prompt/);
  assert.match(piArgs.at(-1), /spawned scout peer/);
  assert.match(piArgs.at(-1), /## BOOT PROTOCOL \/ FIRST ACTION REQUIRED/);
  assert.match(piArgs.at(-1), /Only allowed pre-ACK tool: `intercom`/);
  assert.match(piArgs.at(-1), /ACK_FAILED/);
  assert.ok(
    piArgs.at(-1).indexOf("## BOOT PROTOCOL / FIRST ACTION REQUIRED") <
      piArgs.at(-1).indexOf("## Objective"),
  );
  assert.match(piArgs.at(-1), /Role\nreviewer/);
  assert.match(piArgs.at(-1), /Message budget: at most PEER_ACK and PEER_FINAL/);
  assertIntercomReportBackContract(piArgs.at(-1), {
    peerPrefix: "scoutpeer",
    target: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
  });
  assert.match(
    piArgs.at(-1),
    /intercom\(\{ action: "send", to: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac", message: "PEER_ACK peer_run_id=scoutpeer-[^:]+: \.\.\." \}\)/,
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.tool, "scout_peer_spawn");
  assert.equal(result.details.launchMode, "window");
  assert.equal(result.details.cwd, "/requested-cwd");
  assert.equal(result.details.sessionMode, "clean");
  assert.equal(result.details.sourceSessionFile, undefined);
  assert.equal(result.details.titleBase, "Scoutpeer: Review the retry plan for sidequest fallback");
  assert.equal(result.details.role, "reviewer");
  assert.equal(result.details.enforcement, "prompt_contract");
  assert.equal(result.details.promptSummary, "Review the retry plan for sidequest fallback");
  assert.equal(result.details.reportBack, "intercom");
  assert.match(result.details.peerRunId, /^scoutpeer-/);
  assert.equal(result.details.questId, result.details.peerRunId);
  assert.deepEqual(result.details.expectedMessages, ["PEER_ACK", "PEER_FINAL"]);
  assert.match(result.details.nextStep, /Watch the visible scout peer tab\/window/);
  assert.match(result.content[0]?.text ?? "", /Peer run id: scoutpeer-/);
  assert.match(result.content[0]?.text ?? "", /Expected intercom messages: PEER_ACK, PEER_FINAL/);
  assert.match(result.content[0]?.text ?? "", /peer_watch/);
});

test("scout_peer_spawn reportBack none makes intercom disabled explicit", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
    }
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "19",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension, { thinkingLevel: "high" });

  const result = await tools.get("scout_peer_spawn").execute(
    "tool-call-1",
    {
      objective: "Inspect manually without intercom",
      reportBack: "none",
    },
    undefined,
    undefined,
    createContext({ cwd: "/controller" }).ctx,
  );

  const launchCall = execStub.calls.find(
    (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
  );
  assert.ok(launchCall);
  const prompt = extractPiArgs(launchCall.args).at(-1);
  assert.match(prompt, /No intercom boot ACK is required because reportBack is none/);
  assert.match(prompt, /No automatic report-back is requested/);
  assert.doesNotMatch(prompt, /Only allowed pre-ACK tool: `intercom`/);

  assert.equal(result.details.reportBack, "none");
  assert.deepEqual(result.details.expectedMessages, []);
  assert.match(result.details.nextStep, /Intercom report-back is disabled/);
  assert.match(result.details.nextStep, /peer_watch will have nothing to watch/);
  assert.match(result.content[0]?.text ?? "", /Expected intercom messages: none/);
  assert.match(result.content[0]?.text ?? "", /PEER_ACK\/PEER_FINAL disabled/);
  assert.doesNotMatch(result.content[0]?.text ?? "", /peer_watch", peerRunId/);
});

test("scout_peer_spawn generated prompt includes read-only policy, context, boundaries, tools, and DoD", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "19",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const sidequestSpawn = tools.get("scout_peer_spawn");
  const harness = createContext({ cwd: "/repo" });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    {
      objective: "Inspect why benchmark artifacts disagree",
      parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
      context: {
        campaignGoal: "Improve benchmark accuracy",
        primaryMetric: "overall_accuracy",
        currentBest: "0.82",
        blocker: "timeout in retry lane",
        filesInScope: ["src/runner.ts", "tests/runner.test.mjs"],
        offLimits: [".env", "governance/work-items.json"],
        constraints: ["no mutation", "bounded bash only"],
        artifactsToRead: ["runtime/runs/latest", "logs/retry.log"],
        currentFindings: ["first retry hangs", "second retry exits"],
      },
      dod: ["Compare both artifact directories", "Recommend one next controller action"],
    },
    undefined,
    undefined,
    harness.ctx,
  );

  const launchCall = execStub.calls.find(
    (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
  );
  assert.ok(launchCall);
  assert.match(extractShellCommand(launchCall.args), /cd '\/repo'/);
  const prompt = extractPiArgs(launchCall.args).at(-1);

  assert.match(prompt, /visible scout peer launched in a clean Pi session/i);
  assert.match(prompt, /spawned scout peer/i);
  assert.match(prompt, /not the controller session/i);
  assert.match(prompt, /## BOOT PROTOCOL \/ FIRST ACTION REQUIRED/);
  assert.match(prompt, /Only allowed pre-ACK tool: `intercom`/);
  assert.match(prompt, /PEER_ACK peer_run_id=scoutpeer-[^:]+: spawned scout peer started/);
  assert.match(prompt, /ACK_FAILED/);
  assert.ok(
    prompt.indexOf("## BOOT PROTOCOL / FIRST ACTION REQUIRED") < prompt.indexOf("## Objective"),
  );
  assert.match(prompt, /Role\nscout/);
  assert.match(prompt, /Inspect why benchmark artifacts disagree/);
  assert.match(prompt, /Campaign goal: Improve benchmark accuracy/);
  assert.match(prompt, /Primary metric: overall_accuracy/);
  assert.match(prompt, /Current best: 0\.82/);
  assert.match(prompt, /Blocker: timeout in retry lane/);
  assert.match(prompt, /- runtime\/runs\/latest/);
  assert.match(prompt, /- logs\/retry\.log/);
  assert.match(prompt, /- src\/runner\.ts/);
  assert.match(prompt, /- tests\/runner\.test\.mjs/);
  assert.match(prompt, /- \.env/);
  assert.match(prompt, /- governance\/work-items\.json/);
  assert.match(prompt, /- no mutation/);
  assert.match(prompt, /- bounded bash only/);
  assert.match(prompt, /- first retry hangs/);
  assert.match(prompt, /- second retry exits/);
  assert.match(
    prompt,
    /You are in the controller’s working tree\. This scout peer is read-only for controller-spawned use\. Do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services\./,
  );
  assert.match(prompt, /Enforcement level: prompt_contract/);
  assert.match(prompt, /`read` and bounded `bash`/);
  assert.match(prompt, /`dispatch_subagent` for one focused helper/);
  assert.match(prompt, /`workflow_execute` for a small explicit plan/);
  assert.match(prompt, /`intercom` for reporting back/);
  assert.match(prompt, /Do not spawn more quest agents unless explicitly instructed/);
  assert.match(
    prompt,
    /Report to the exact parent target: session-019e10d2-15f5-705a-aea4-01ba49d2bbac/,
  );
  assert.doesNotMatch(prompt, /Manual report-back is requested/);
  assert.match(prompt, /1\. Answer or recommendation/);
  assert.match(prompt, /2\. Evidence inspected — exact files, artifacts, commands/);
  assert.match(prompt, /3\. Most likely root cause or key finding/);
  assert.match(prompt, /4\. One concrete next experiment or controller action/);
  assert.match(prompt, /5\. Expected impact/);
  assert.match(prompt, /6\. Risks and rollback notes/);
  assert.match(prompt, /7\. What not to try again/);
  assert.match(prompt, /- Compare both artifact directories/);
  assert.match(prompt, /- Recommend one next controller action/);
  assert.match(
    prompt,
    /Do not implement candidate changes here; isolated mutation belongs later in `candidate_peer_spawn`/,
  );

  assert.equal(result.details.launchMode, "tab");
  assert.equal(result.details.enforcement, "prompt_contract");
  assert.equal(result.details.reportBack, "intercom");
});
