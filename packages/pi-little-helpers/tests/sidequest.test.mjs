import assert from "node:assert/strict";
import test from "node:test";

import {
  createSidequestExtension,
  getGhosttySurfaceId,
  resolveGhosttyBin,
} from "../extensions/sidequest.ts";

const LOCAL_GHOSTTY_WRAPPER_SUFFIX = "/.local/bin/ghostty-sidequest";
const LOCAL_GHOSTTY_BIN_SUFFIX = "/.local/opt/ghostty-sidequest/bin/ghostty";
const LOCAL_GHOSTTY_BIN = `/home/tryinget${LOCAL_GHOSTTY_BIN_SUFFIX}`;

function isLocalGhosttyWrapper(path) {
  return path.endsWith(LOCAL_GHOSTTY_WRAPPER_SUFFIX);
}

function isLocalGhosttyBin(path) {
  return path.endsWith(LOCAL_GHOSTTY_BIN_SUFFIX);
}

function registerExtension(extension, { thinkingLevel = "medium" } = {}) {
  const commands = new Map();
  const tools = new Map();

  extension({
    getThinkingLevel() {
      return thinkingLevel;
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  });

  return { commands, tools };
}

function createContext(options = {}) {
  const cwd = options.cwd ?? "/repo";
  const sessionFile = Object.hasOwn(options, "sessionFile")
    ? options.sessionFile
    : "/sessions/main.jsonl";
  const model = options.model ?? { provider: "openai", id: "gpt-4o" };
  const notifications = [];

  return {
    notifications,
    ctx: {
      cwd,
      hasUI: true,
      model,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
      },
      sessionManager: {
        getSessionFile() {
          return sessionFile;
        },
      },
    },
  };
}

function createExecStub(handler) {
  const calls = [];

  return {
    calls,
    exec: async (command, args, options = {}) => {
      calls.push({ command, args, options });
      return handler({ command, args, options, calls });
    },
  };
}

function extractPiArgs(ghosttyArgs) {
  const marker = ghosttyArgs.indexOf("sidequest-pi");
  assert.notEqual(marker, -1, "expected sidequest-pi marker in Ghostty args");
  return ghosttyArgs.slice(marker + 1);
}

function extractShellCommand(ghosttyArgs) {
  const shellIndex = ghosttyArgs.indexOf("-lc");
  assert.notEqual(shellIndex, -1, "expected -lc shell invocation in Ghostty args");
  return ghosttyArgs[shellIndex + 1];
}

test("getGhosttySurfaceId only accepts Ghostty surface id formats", () => {
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "17" }), "17");
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "0x2b2826e0" }), "0x2b2826e0");
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "surface-17" }), undefined);
  assert.equal(getGhosttySurfaceId({}), undefined);
});

test("resolveGhosttyBin prefers the current stock Ghostty session binary over the sidequest wrapper", () => {
  const resolved = resolveGhosttyBin({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });

  assert.equal(resolved, "/usr/bin/ghostty");
});

test("resolveGhosttyBin uses the sidequest wrapper when the current session already runs in the sidequest fork", () => {
  const resolved = resolveGhosttyBin({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });

  assert.ok(isLocalGhosttyWrapper(resolved));
});

test("resolveGhosttyBin falls back to the local wrapper before the raw local Ghostty binary", () => {
  const resolved = resolveGhosttyBin({
    env: {},
    pathExists(path) {
      return isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });

  assert.ok(isLocalGhosttyWrapper(resolved));
});

test("sidequest opens a new Ghostty window when the current Ghostty session lacks +new-tab", async () => {
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
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("trace this failure", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "--working-directory=/repo"],
    ],
  );

  const launchArgs = execStub.calls[1].args;
  assert.ok(!launchArgs.some((arg) => arg.startsWith("--surface-id=")));
  assert.ok(!launchArgs.some((arg) => arg.startsWith("--title=")));
  assert.match(
    extractShellCommand(launchArgs),
    /PI_SESSION_PRESENCE_TITLE_BASE='Sidequest: trace this failure'/,
  );
  assert.deepEqual(extractPiArgs(launchArgs), [
    "pi",
    "--fork",
    "/sessions/main.jsonl",
    "--model",
    "openai/gpt-4o",
    "--thinking",
    "medium",
    "trace this failure",
  ]);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /new Ghostty window/);
  assert.match(harness.notifications[0].message, /does not support \+new-tab/);
});

test("sidequest uses the Ghostty sidequest wrapper to open a same-window tab even when GHOSTTY_SURFACE_ID is absent", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("missing surface id", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      [execStub.calls[0].command, "+help"],
      [execStub.calls[1].command, "+new-tab"],
    ],
  );
  assert.ok(isLocalGhosttyWrapper(execStub.calls[0].command));
  assert.ok(!execStub.calls[1].args.some((arg) => arg.startsWith("--surface-id=")));
  assert.ok(!execStub.calls[1].args.some((arg) => arg.startsWith("--title=")));
  assert.match(
    extractShellCommand(execStub.calls[1].args),
    /PI_SESSION_PRESENCE_TITLE_BASE='Sidequest: missing surface id'/,
  );
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
});

test("sidequest retries a new Ghostty window when live same-window tab attach fails", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+new-tab") {
      return {
        code: 1,
        stderr: "warning(gtk_ghostty_application): new-tab: unable to create tab",
      };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "0x2b2826e0",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("open the fallback", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "+new-tab"],
      ["/usr/bin/ghostty", "--working-directory=/repo"],
    ],
  );
  assert.ok(execStub.calls[1].args.includes("--surface-id=0x2b2826e0"));
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /new Ghostty window/);
  assert.match(harness.notifications[0].message, /same-window tab launch failed/i);
});

test("sidequest keeps the launch in the current Ghostty tab when live tab attach succeeds", async () => {
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
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("stay in this window", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "+new-tab"],
    ],
  );
  assert.ok(execStub.calls[1].args.includes("--surface-id=19"));
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
});

test("sidequest refuses to launch when the current Pi session has not been saved", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without a saved session file");
  });

  const extension = createSidequestExtension({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext({ sessionFile: undefined });

  await sidequest.handler("needs a real session", harness.ctx);

  assert.equal(execStub.calls.length, 0);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "error");
  assert.match(harness.notifications[0].message, /needs a saved Pi session/i);
});

test("sidequest_spawn registers as an LLM-callable tool while manual sidequest stays registered", () => {
  const extension = createSidequestExtension();
  const { commands, tools } = registerExtension(extension);

  assert.ok(commands.has("sidequest"));
  assert.ok(tools.has("sidequest_spawn"));
});

test("sidequest_spawn refuses to launch when the current Pi session has not been saved", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without a saved session file");
  });

  const extension = createSidequestExtension({
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
  const sidequestSpawn = tools.get("sidequest_spawn");
  const harness = createContext({ sessionFile: undefined });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    { objective: "inspect missing session handling" },
    undefined,
    undefined,
    harness.ctx,
  );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "missing_session_file");
  assert.equal(result.details.enforcement, "prompt_contract");
});

test("sidequest_spawn rejects a blank objective before probing Ghostty", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called for a blank objective");
  });

  const extension = createSidequestExtension({
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
  const sidequestSpawn = tools.get("sidequest_spawn");
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

test("sidequest_spawn uses the same Ghostty window fallback launch path and returns structured details", async () => {
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
  const sidequestSpawn = tools.get("sidequest_spawn");
  const harness = createContext({ cwd: "/controller" });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    {
      role: "reviewer",
      objective: "Review the retry plan for sidequest fallback",
      cwd: "/requested-cwd",
      reportBack: "intercom",
      parentPeerTarget: "controller-session-123",
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
    /PI_SESSION_PRESENCE_TITLE_BASE='Sidequest: Review the retry plan for sidequest fallback'/,
  );
  const piArgs = extractPiArgs(launchArgs);
  assert.deepEqual(piArgs.slice(0, 6), [
    "pi",
    "--fork",
    "/sessions/main.jsonl",
    "--model",
    "openai/gpt-4o",
    "--thinking",
  ]);
  assert.equal(piArgs[6], "high");
  assert.match(piArgs.at(-1), /Visible Sidequest Agent Prompt/);
  assert.match(piArgs.at(-1), /Role\nreviewer/);
  assert.match(piArgs.at(-1), /Report to the exact parent target: controller-session-123/);

  assert.equal(result.details.ok, true);
  assert.equal(result.details.tool, "sidequest_spawn");
  assert.equal(result.details.launchMode, "window");
  assert.equal(result.details.cwd, "/requested-cwd");
  assert.equal(result.details.sessionFile, "/sessions/main.jsonl");
  assert.equal(result.details.titleBase, "Sidequest: Review the retry plan for sidequest fallback");
  assert.equal(result.details.role, "reviewer");
  assert.equal(result.details.enforcement, "prompt_contract");
  assert.equal(result.details.promptSummary, "Review the retry plan for sidequest fallback");
  assert.equal(result.details.reportBack, "intercom");
  assert.match(result.details.nextStep, /Watch the visible sidequest tab\/window/);
});

test("sidequest_spawn generated prompt includes read-only policy, context, boundaries, tools, and DoD", async () => {
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
  const sidequestSpawn = tools.get("sidequest_spawn");
  const harness = createContext({ cwd: "/repo" });

  const result = await sidequestSpawn.execute(
    "tool-call-1",
    {
      objective: "Inspect why benchmark artifacts disagree",
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
      reportBack: "manual",
    },
    undefined,
    undefined,
    harness.ctx,
  );

  const prompt = extractPiArgs(execStub.calls[1].args).at(-1);

  assert.match(prompt, /visible sidequest agent launched in a forked Pi session/i);
  assert.match(prompt, /not the controller session/i);
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
    /You are in the controller’s working tree\. This sidequest is read-only for controller-spawned use\. Do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services\./,
  );
  assert.match(prompt, /Enforcement level: prompt_contract/);
  assert.match(prompt, /`read` and bounded `bash`/);
  assert.match(prompt, /`dispatch_subagent` for one focused helper/);
  assert.match(prompt, /`workflow_execute` for a small explicit plan/);
  assert.match(prompt, /`intercom` for reporting back/);
  assert.match(prompt, /Do not spawn more quest agents unless explicitly instructed/);
  assert.match(prompt, /Manual report-back is requested/);
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
    /Do not implement candidate changes here; isolated mutation belongs later in `parallelquest_spawn`/,
  );

  assert.equal(result.details.launchMode, "tab");
  assert.equal(result.details.enforcement, "prompt_contract");
});
