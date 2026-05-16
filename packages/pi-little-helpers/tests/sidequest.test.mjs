import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createSidequestExtension,
  getGhosttySurfaceId,
  ghosttyVersionSupportsSurfaceId,
  resolveGhosttyBin,
} from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  handleVisibleLoopAgentEnd,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";

const LOCAL_GHOSTTY_WRAPPER_SUFFIX = "/.local/bin/ghostty-sidequest";
const LOCAL_GHOSTTY_BIN_SUFFIX = "/.local/opt/ghostty-sidequest/bin/ghostty";
const LOCAL_GHOSTTY_NEXT_BIN_SUFFIX = "/.local/opt/ghostty-sidequest-next/bin/ghostty";
const LOCAL_GHOSTTY_PREV_BIN_SUFFIX =
  "/.local/opt/ghostty-sidequest-prev-20260512T211350/bin/ghostty";
const LOCAL_GHOSTTY_BIN = `/home/tryinget${LOCAL_GHOSTTY_BIN_SUFFIX}`;
const LOCAL_GHOSTTY_NEXT_BIN = `/home/tryinget${LOCAL_GHOSTTY_NEXT_BIN_SUFFIX}`;
const LOCAL_GHOSTTY_PREV_BIN = `/home/tryinget${LOCAL_GHOSTTY_PREV_BIN_SUFFIX}`;

function isLocalGhosttyWrapper(path) {
  return path.endsWith(LOCAL_GHOSTTY_WRAPPER_SUFFIX);
}

function isLocalGhosttyBin(path) {
  return path.endsWith(LOCAL_GHOSTTY_BIN_SUFFIX);
}

function isAnyLocalSidequestGhosttyBin(path) {
  return (
    path.endsWith(LOCAL_GHOSTTY_BIN_SUFFIX) ||
    path.endsWith(LOCAL_GHOSTTY_NEXT_BIN_SUFFIX) ||
    path.endsWith(LOCAL_GHOSTTY_PREV_BIN_SUFFIX)
  );
}

function registerExtension(extension, { thinkingLevel = "medium" } = {}) {
  const commands = new Map();
  const tools = new Map();
  const events = new Map();
  const userMessages = [];

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
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    sendUserMessage(message, options) {
      userMessages.push({ message, options });
    },
  });

  return { commands, tools, events, userMessages };
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
        getSessionId() {
          return "019e10d2-15f5-705a-aea4-01ba49d2bbac";
        },
        getSessionName() {
          return "controller";
        },
        getCwd() {
          return cwd;
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

test("ghosttyVersionSupportsSurfaceId gates the 1.4+ surface-id action flag", () => {
  assert.equal(ghosttyVersionSupportsSurfaceId("Ghostty 1.3.2-dev+0000000"), false);
  assert.equal(ghosttyVersionSupportsSurfaceId("Ghostty 1.4.0"), true);
  assert.equal(ghosttyVersionSupportsSurfaceId("  - version: 2.0.0\n"), true);
  assert.equal(ghosttyVersionSupportsSurfaceId("not a version"), false);
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
  for (const currentSessionGhosttyBin of [
    LOCAL_GHOSTTY_BIN,
    LOCAL_GHOSTTY_NEXT_BIN,
    LOCAL_GHOSTTY_PREV_BIN,
  ]) {
    const resolved = resolveGhosttyBin({
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
      },
      currentSessionGhosttyBin,
      pathExists(path) {
        return (
          path === "/usr/bin/ghostty" ||
          isLocalGhosttyWrapper(path) ||
          isAnyLocalSidequestGhosttyBin(path)
        );
      },
    });

    assert.ok(isLocalGhosttyWrapper(resolved), currentSessionGhosttyBin);
  }
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
    registerTools: true,
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
  assert.match(extractShellCommand(launchArgs), /cd '\/repo'/);
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
    registerTools: true,
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
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
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
    registerTools: true,
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
      ["/usr/bin/ghostty", "+version"],
      ["/usr/bin/ghostty", "+new-tab"],
      ["/usr/bin/ghostty", "--working-directory=/repo"],
    ],
  );
  assert.ok(execStub.calls[2].args.includes("--surface-id=0x2b2826e0"));
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
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
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
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("stay in this window", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "+version"],
      ["/usr/bin/ghostty", "+new-tab"],
    ],
  );
  assert.ok(execStub.calls[2].args.includes("--surface-id=19"));
  assert.match(extractShellCommand(execStub.calls[2].args), /cd '\/repo'/);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
});

test("sidequest omits surface-id for Ghostty builds before the action flag exists", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.3.2-dev+0000000\n" };
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
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("avoid unsupported surface flag", harness.ctx);

  const launchCall = execStub.calls.find(
    (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
  );
  assert.ok(launchCall);
  assert.ok(!launchCall.args.some((arg) => arg.startsWith("--surface-id=")));
});

test("sidequest refuses to launch when the current Pi session has not been saved", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without a saved session file");
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
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext({ sessionFile: undefined });

  await sidequest.handler("needs a real session", harness.ctx);

  assert.equal(execStub.calls.length, 0);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "error");
  assert.match(harness.notifications[0].message, /needs a saved Pi session/i);
});

test("sidequest defaults to slash commands, visible-loop, and standard peer-spawn tools", () => {
  const extension = createSidequestExtension();
  const { commands, tools } = registerExtension(extension);

  assert.ok(commands.has("sidequest"));
  assert.equal(commands.has("forkpeer"), false);
  assert.ok(commands.has("scoutpeer"));
  assert.equal(commands.has("candidatepeer"), false);
  assert.ok(commands.has("parallelquest"));
  assert.ok(commands.has("visible-loop"));
  assert.ok(commands.has("visible-loop-child"));
  assert.ok(commands.has("visible-loop-child-complete"));
  assert.ok(tools.has("fork_peer_spawn"));
  assert.ok(tools.has("scout_peer_spawn"));
  assert.ok(tools.has("candidate_peer_spawn"));
});

test("sidequest can suppress commands while registering toolbox peer tools", () => {
  const extension = createSidequestExtension({ registerCommands: false, registerTools: true });
  const { commands, tools } = registerExtension(extension);

  assert.equal(commands.has("sidequest"), false);
  assert.ok(tools.has("fork_peer_spawn"));
  assert.equal(tools.has("sidequest_spawn"), false);
  assert.ok(tools.has("scout_peer_spawn"));
  assert.ok(tools.has("candidate_peer_spawn"));
  assert.equal(tools.has("parallelquest_spawn"), false);
});

test("visible-loop writes config and launches one clean Ghostty tab with the child command", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-state-`);
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
    assert.equal(config.prompts.length, 7);
    assert.match(
      config.prompts[0],
      /^read @docs\/project\/vision\.md and @docs\/project\/product-posture\.md\./,
    );
    assert.match(config.prompts[0], /design membrane/);
    assert.match(config.prompts[0], /TRUST \/ SECURITY MODEL/);
    assert.match(config.prompts[0], /ADVERSARIAL TEST PLAN/);
    assert.match(config.prompts[0], /Do not optimize for smallest diff/);
    assert.match(config.prompts[0], /Proceed until completed and validated\./);
    assert.doesNotMatch(config.prompts[0], /Prompt Vault/);
    assert.equal(config.prompts[1], "proceed");
    assert.equal(config.prompts[4], "/deep-review");
    assert.match(config.prompts[6], /fix any bugs/);
    assert.match(config.prompts[6], /Prompt Vault/);
    assert.match(
      config.prompts[6],
      /Execution means: inspect the current repo\/state, apply the needed bounded fixes, run verification/,
    );
    assert.match(config.prompts[6], /Do not stop after retrieving the template/);
    assert.match(harness.notifications.at(-1).message, /Opened visible-loop/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

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
    writeFileSync(
      `${harness.ctx.cwd}/.pi/prompts/deep-review.md`,
      "EXPANDED DEEP REVIEW $ARGUMENTS\n",
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
    await new Promise((resolve) => setTimeout(resolve, 1100));

    assert.equal(userMessages.length, 8);
    assert.equal(userMessages[1].message, "proceed");
    assert.notEqual(userMessages[4].message, "/deep-review");
    assert.match(userMessages[4].message, /DEEP REVIEW/);
    assert.match(userMessages[6].message, /Prompt Vault/);
    assert.match(userMessages[6].message, /Do not stop after retrieving the template/);
    assert.match(userMessages[7].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[7].message, /visible_loop_child_complete/);
    assert.match(
      userMessages[7].message,
      new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.deepEqual(
      userMessages.slice(1).map((entry) => entry.options),
      Array(7).fill({ deliverAs: "followUp" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(
      userMessages.length,
      8,
      "next iteration should not queue before explicit completion checkpoint runs",
    );
    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);

    const agentEnd = events.get("agent_end")[0];
    await agentEnd({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      1,
      "agent_end must not launch the next iteration before the completion tool runs",
    );

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));
    assert.equal(userMessages.length, 8);
    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 2);
    assert.match(extractPiArgs(visibleLoopLaunches[1].args).at(-1), /^\/visible-loop-child /);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop waits for explicit checkpoint after nonsense prompts before launching next iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-nonsense-state-`);
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
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "manual",
      runId: "visible-loop-nonsense-test",
      prompts: [
        "nonsense prompt alpha: count the purple spoons",
        "nonsense prompt beta: report the imaginary aardvark",
        "nonsense prompt gamma: close the banana loop",
      ],
    });
    const configPath = writeVisibleLoopRunConfig(config, {
      ...process.env,
      XDG_STATE_HOME: stateHome,
    });

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.deepEqual(
      userMessages.map((entry) => entry.message),
      ["nonsense prompt alpha: count the purple spoons"],
    );

    await events.get("agent_start")[0]({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.deepEqual(
      userMessages.map((entry) => entry.message),
      [
        "nonsense prompt alpha: count the purple spoons",
        "nonsense prompt beta: report the imaginary aardvark",
        "nonsense prompt gamma: close the banana loop",
        userMessages[3].message,
      ],
    );
    assert.match(userMessages[3].message, /Visible-loop internal completion checkpoint/);
    assert.match(userMessages[3].message, /visible_loop_child_complete/);
    assert.deepEqual(
      userMessages.slice(1).map((entry) => entry.options),
      [{ deliverAs: "followUp" }, { deliverAs: "followUp" }, { deliverAs: "followUp" }],
    );

    let visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      0,
      "nonsense loop must not launch iteration 2 before explicit completion",
    );

    const agentEnd = events.get("agent_end")[0];
    await agentEnd({}, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(
      visibleLoopLaunches.length,
      0,
      "agent_end must not launch iteration 2 before the checkpoint command/tool completes",
    );

    await commands
      .get("visible-loop-child-complete")
      .handler(`${configPath} --iteration 1`, harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    visibleLoopLaunches = execStub.calls.filter(
      (call) => call.command === "/usr/bin/ghostty" && call.args.includes("sidequest-pi"),
    );
    assert.equal(visibleLoopLaunches.length, 1);
    assert.match(extractPiArgs(visibleLoopLaunches[0].args).at(-1), /^\/visible-loop-child /);

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_queued" &&
          entry.iteration === 1 &&
          entry.promptCount === 1 &&
          entry.sourcePromptCount === 3 &&
          entry.queuedFollowupCount === 3 &&
          entry.completionMode === "explicit_completion_prompt",
      ),
    );
    assert.ok(statusEntries.some((entry) => entry.event === "completion_prompt_queued"));
    assert.ok(statusEntries.some((entry) => entry.event === "agent_end_observed"));
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_completed" &&
          entry.source === "completion_command" &&
          entry.completedPromptCount === 1 &&
          entry.completedIterations === 1,
      ),
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop intercom timeout does not block prompt queue or next iteration", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-intercom-timeout-state-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const userMessages = [];
    const notifications = [];
    const pi = {
      sendUserMessage(message, options) {
        userMessages.push({ message, options });
      },
    };
    const ctx = {
      ...harness.ctx,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
        setStatus() {},
      },
    };
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      parentPeerTarget: "session-parent-timeout-test",
      runId: "visible-loop-intercom-timeout-test",
      prompts: ["finish this turn"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    let continuationCount = 0;
    let disconnectCount = 0;

    await startVisibleLoopChildRunner(configPath, pi, ctx, env, {
      createPeerRuntime: () => ({
        send: () => new Promise(() => {}),
        disconnect: async () => {
          disconnectCount += 1;
          throw new Error("disconnect cleanup failed");
        },
      }),
      continueInNewSession: () => {
        continuationCount += 1;
      },
      intercomSendTimeoutMs: 15,
    });

    assert.deepEqual(
      userMessages.map((entry) => entry.message),
      ["finish this turn"],
      "ACK report-back timeout must not prevent the child from receiving its first prompt",
    );

    handleVisibleLoopAgentEnd(pi, ctx, env);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      continuationCount,
      0,
      "agent_end must not launch the next visible-loop iteration before explicit completion",
    );

    await startVisibleLoopChildCompleteRunner(`${configPath} --iteration 1`, pi, ctx, env);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      continuationCount,
      1,
      "progress report timeout must not prevent launching the next visible-loop iteration after explicit completion",
    );
    assert.ok(disconnectCount >= 2);
    assert.ok(
      notifications.some((entry) => entry.message.includes("intercom send timed out")),
      "operator should see bounded intercom timeout diagnostics",
    );

    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const statusEntries = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(
      statusEntries.filter((entry) => entry.event === "intercom_send_timed_out").length,
      2,
    );
    assert.ok(
      statusEntries.some(
        (entry) =>
          entry.event === "iteration_completed" &&
          entry.source === "completion_command" &&
          entry.completedIterations === 1,
      ),
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop manual completion command advances non-final iterations", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-command-next-state-`);
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
    const { commands, userMessages } = registerExtension(extension);
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
    assert.match(config.prompts.at(-1), /Prompt Vault/);
    await commands.get("visible-loop-child-complete").handler("", harness.ctx);
    await new Promise((resolve) => setTimeout(resolve, 360));

    assert.equal(userMessages.length, 1);
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
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop manual completion command finalizes", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-command-state-`);
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
    const { commands, tools, userMessages } = registerExtension(extension);
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
    assert.match(config.prompts.at(-1), /Prompt Vault/);
    assert.doesNotMatch(config.prompts.at(-1), /visible_loop_child_complete/);
    assert.equal(commands.has("visible-loop-child-complete"), true);
    assert.equal(tools.has("visible_loop_child_complete"), false);
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
    rmSync(stateHome, { recursive: true, force: true });
  }
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
  assert.match(
    piArgs.at(-1),
    /Report to the exact parent target: session-019e10d2-15f5-705a-aea4-01ba49d2bbac/,
  );
  assert.match(piArgs.at(-1), /Message budget: at most PEER_ACK and PEER_FINAL/);
  assert.match(piArgs.at(-1), /PEER_ACK peer_run_id=scoutpeer-[^:]+: \.\.\./);
  assert.match(piArgs.at(-1), /PEER_FINAL peer_run_id=scoutpeer-[^:]+: \.\.\./);
  assert.match(piArgs.at(-1), /Do not send both a final report and a separate final DoD report/);
  assert.match(piArgs.at(-1), /After sending `PEER_FINAL`, stop/);
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

function createCandidatePeerExecStub({ repoRoot = "/repo", dirty = "" } = {}) {
  const calls = [];

  return {
    calls,
    exec: async (command, args, options = {}) => {
      calls.push({ command, args, options });

      if (command === "git") {
        const gitArgs = args.slice(2);
        if (gitArgs.join(" ") === "rev-parse --show-toplevel") {
          return { code: 0, stdout: `${repoRoot}\n` };
        }
        if (gitArgs.join(" ") === "status --porcelain") {
          return { code: 0, stdout: dirty };
        }
        if (gitArgs[0] === "worktree" && gitArgs[1] === "add") {
          return { code: 0, stdout: "Preparing worktree" };
        }
      }

      if (command === "/usr/bin/ghostty" && args[0] === "+help") {
        return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+version") {
        return { code: 0, stdout: "Ghostty 1.4.0\n" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+new-tab") {
        return { code: 0, stdout: "" };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function withTempDir(fn) {
  const dir = mkdtempSync(`${tmpdir()}/pi-candidatepeer-test-`);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("candidate_peer_spawn staggers concurrent Ghostty launches", async () => {
  await withTempDir(async (stateHome) => {
    const baseExecStub = createCandidatePeerExecStub();
    const launchTimes = [];
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "30",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec(command, args, options) {
        if (command === "/usr/bin/ghostty" && args[0] === "+new-tab") {
          launchTimes.push(Date.now());
        }
        return baseExecStub.exec(command, args, options);
      },
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const candidatePeerSpawn = tools.get("candidate_peer_spawn");
    const context = createContext({ cwd: "/repo" }).ctx;

    const [first, second] = await Promise.all([
      candidatePeerSpawn.execute(
        "tool-call-1",
        {
          objective: "try candidate one",
          cwd: "/repo",
          parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
          branchName: "candidatepeer/stagger-one",
          workspaceName: "stagger-one",
        },
        undefined,
        undefined,
        context,
      ),
      candidatePeerSpawn.execute(
        "tool-call-2",
        {
          objective: "try candidate two",
          cwd: "/repo",
          parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
          branchName: "candidatepeer/stagger-two",
          workspaceName: "stagger-two",
        },
        undefined,
        undefined,
        context,
      ),
    ]);

    assert.equal(first.details.ok, true);
    assert.equal(second.details.ok, true);
    assert.equal(launchTimes.length, 2);
    assert.ok(
      launchTimes[1] - launchTimes[0] >= 20,
      `expected staggered launches, got ${launchTimes.join(", ")}`,
    );
  });
});

test("/parallelquest launches a human candidate peer worktree", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub();
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "22",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("parallelquest").handler("Try a workspace candidate", harness.ctx);

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.ok(worktreeCall);
    assert.deepEqual(worktreeCall.args.slice(5), [
      "-b",
      "candidatepeer/try-a-workspace-candidate",
      "HEAD",
    ]);

    const launchCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
    );
    assert.ok(launchCall);
    assert.match(
      extractShellCommand(launchCall.args),
      /PI_SESSION_PRESENCE_TITLE_BASE='Parallelquest: Try a workspace candidate'/,
    );
    assert.match(harness.notifications.at(-1)?.message ?? "", /Opened parallelquest/);
  });
});

test("candidate_peer_spawn rejects a blank objective before git or Ghostty", async () => {
  const execStub = createCandidatePeerExecStub();
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
  const { tools } = registerExtension(extension);
  const candidatePeerSpawn = tools.get("candidate_peer_spawn");

  const blankResult = await candidatePeerSpawn.execute(
    "tool-call-1",
    { objective: "  " },
    undefined,
    undefined,
    createContext().ctx,
  );
  assert.equal(blankResult.isError, true);
  assert.equal(blankResult.details.error, "blank_objective");

  assert.equal(execStub.calls.length, 0);
});

test("candidate_peer_spawn reportBack none makes intercom disabled explicit", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension, { thinkingLevel: "high" });

    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try manual-only candidate lane",
        cwd: "/repo",
        reportBack: "none",
        branchName: "candidatepeer/manual-only",
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
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
});

test("candidate_peer_spawn requires exact parentPeerTarget for default intercom report-back", async () => {
  const execStub = createCandidatePeerExecStub();
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
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "missing_parent_peer_target");
});

test("candidate_peer_spawn rejects ambiguous parentPeerTarget aliases before git or launch", async () => {
  const execStub = createCandidatePeerExecStub();
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
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning", parentPeerTarget: "current" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "ambiguous_parent_peer_target");
  assert.equal(result.details.parentPeerTarget, "current");
});

test("candidate_peer_spawn rejects non-session-id parentPeerTarget before git or launch", async () => {
  const execStub = createCandidatePeerExecStub();
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
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning", parentPeerTarget: "steve" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "not_exact_session_id");
  assert.equal(result.details.parentPeerTarget, "steve");
});

test("candidate_peer_spawn fails closed when requireCleanParent sees dirty parent state", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: " M src/file.ts\n" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "try a bounded fix",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        requireCleanParent: true,
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    assert.equal(result.isError, true);
    assert.equal(result.details.error, "worktree_prepare_failed");
    assert.equal(result.details.parentDirty, true);
    assert.match(result.details.reason, /requireCleanParent/);
    assert.equal(
      execStub.calls.some((call) => call.args.includes("worktree")),
      false,
    );
  });
});

test("candidate_peer_spawn rejects worktree paths inside the parent checkout", async () => {
  const execStub = createCandidatePeerExecStub();
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
  const { tools } = registerExtension(extension);
  const result = await tools.get("candidate_peer_spawn").execute(
    "tool-call-1",
    {
      objective: "try a bounded fix",
      cwd: "/repo",
      parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
      workspaceRoot: "/repo/tmp-quests",
    },
    undefined,
    undefined,
    createContext({ cwd: "/repo" }).ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.details.error, "worktree_prepare_failed");
  assert.match(result.details.reason, /must not be inside the parent checkout/);
});

test("candidate_peer_spawn creates an isolated worktree, launches via shared Ghostty path, and prompts boundaries", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: " M pending-parent-change.ts\n" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension, { thinkingLevel: "high" });
    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try bounded runner guard",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: "candidatepeer/Runner Guard!",
        workspaceName: "../Runner Guard Workspace",
        filesInScope: ["src/runner.ts", "tests/runner.test.mjs"],
        offLimits: [".env", "parent checkout"],
        constraints: ["run focused test only"],
        dod: ["Report diff summary"],
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.ok(worktreeCall);
    assert.deepEqual(worktreeCall.args.slice(2, 5), [
      "worktree",
      "add",
      result.details.worktreePath,
    ]);
    assert.deepEqual(worktreeCall.args.slice(5), ["-b", "candidatepeer/runner-guard", "HEAD"]);
    assert.ok(result.details.worktreePath.startsWith(`${stateHome}/pi-quests/worktrees/`));
    assert.ok(result.details.worktreePath.endsWith("/runner-guard-workspace"));

    const launchCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
    );
    assert.ok(launchCall);
    assert.ok(launchCall.args.includes("--surface-id=21"));
    assert.ok(launchCall.args.includes(`--working-directory=${result.details.worktreePath}`));
    assert.match(
      extractShellCommand(launchCall.args),
      /PI_SESSION_PRESENCE_TITLE_BASE='Candidatepeer: Try bounded runner guard'/,
    );

    const piArgs = extractPiArgs(launchCall.args);
    assert.deepEqual(piArgs.slice(0, 5), ["pi", "--model", "openai/gpt-4o", "--thinking", "high"]);
    assert.equal(piArgs.includes("--fork"), false);
    const prompt = piArgs.at(-1);
    assert.match(prompt, /Visible Candidate Peer Prompt/);
    assert.match(prompt, /spawned candidate peer/i);
    assert.match(prompt, /not the controller session/i);
    assert.match(prompt, /## BOOT PROTOCOL \/ FIRST ACTION REQUIRED/);
    assert.match(prompt, /Only allowed pre-ACK tool: `intercom`/);
    assert.match(
      prompt,
      /PEER_ACK peer_run_id=candidatepeer-[^:]+: spawned candidate peer started/,
    );
    assert.match(prompt, /ACK_FAILED/);
    assert.ok(
      prompt.indexOf("## BOOT PROTOCOL / FIRST ACTION REQUIRED") < prompt.indexOf("## Objective"),
    );
    assert.match(prompt, /Parent\/controller cwd: \/repo/);
    assert.match(prompt, new RegExp(`Your worktree cwd: ${result.details.worktreePath}`));
    assert.match(prompt, /Branch: candidatepeer\/runner-guard/);
    assert.match(prompt, /Base: HEAD/);
    assert.match(prompt, /Dirty-parent warning:/);
    assert.match(prompt, /All mutations must stay inside your worktree/);
    assert.match(prompt, /Do not merge, push, open PRs, mutate AK/);
    assert.match(prompt, /- src\/runner\.ts/);
    assert.match(prompt, /- tests\/runner\.test\.mjs/);
    assert.match(prompt, /- \.env/);
    assert.match(prompt, /- parent checkout/);
    assert.match(prompt, /- run focused test only/);
    assert.match(prompt, /Report diff summary/);
    assert.match(
      prompt,
      /Report to the exact parent target: session-019e10d2-15f5-705a-aea4-01ba49d2bbac/,
    );
    assert.match(prompt, /Message budget: at most PEER_ACK and PEER_FINAL/);
    assert.match(prompt, /PEER_ACK peer_run_id=candidatepeer-[^:]+: \.\.\./);
    assert.match(prompt, /PEER_FINAL peer_run_id=candidatepeer-[^:]+: \.\.\./);
    assert.match(prompt, /Do not send both a final report and a separate final DoD report/);
    assert.match(prompt, /After sending `PEER_FINAL`, stop/);
    assert.match(
      prompt,
      /intercom\(\{ action: "send", to: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac", message: "PEER_ACK peer_run_id=candidatepeer-[^:]+: \.\.\." \}\)/,
    );
    assert.doesNotMatch(prompt, /Manual report-back is requested/);
    assert.doesNotMatch(prompt, /visible report in this sidequest session/);
    assert.match(prompt, /Do not spawn more quest agents unless explicitly instructed/);

    assert.equal(result.details.ok, true);
    assert.equal(result.details.tool, "candidate_peer_spawn");
    assert.equal(result.details.launchMode, "tab");
    assert.equal(result.details.parentCwd, "/repo");
    assert.equal(result.details.branchName, "candidatepeer/runner-guard");
    assert.equal(result.details.baseRef, "HEAD");
    assert.equal(result.details.reportBack, "intercom");
    assert.match(result.details.peerRunId, /^candidatepeer-/);
    assert.equal(result.details.questId, result.details.peerRunId);
    assert.deepEqual(result.details.expectedMessages, ["PEER_ACK", "PEER_FINAL"]);
    assert.equal(result.details.parentDirty, true);
    assert.match(result.details.parentDirtyWarning, /uncommitted changes/);
    assert.equal(result.details.reusedExisting, false);
    assert.equal(result.details.sessionMode, "clean");
    assert.equal(result.details.sourceSessionFile, undefined);
    assert.equal(result.details.titleBase, "Candidatepeer: Try bounded runner guard");
    assert.equal(
      result.details.registryPath,
      `${stateHome}/pi-quests/peer-registry/${result.details.peerRunId}.json`,
    );
    assert.equal(
      result.details.archiveDir,
      `${stateHome}/pi-quests/archives/${result.details.peerRunId}`,
    );
    assert.equal(result.details.cleanupPacket.commands[0].id, "archive-metadata-and-diff");
    assert.equal(result.details.cleanupPacket.commands[0].destructive, false);
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /rev-parse --show-toplevel\)" = "\$worktree_path"/,
    );
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /rev-parse --abbrev-ref HEAD\)" = "\$branch_name"/,
    );
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /show-ref --verify --quiet "refs\/heads\/\$branch_name"/,
    );
    assert.equal(result.details.cleanupPacket.commands[1].id, "remove-worktree");
    assert.equal(result.details.cleanupPacket.commands[1].destructive, true);
    assert.equal(result.details.cleanupPacket.commands[2].id, "delete-candidate-branch");
    assert.equal(result.details.cleanupPacket.commands[2].destructive, true);
    assert.ok(existsSync(result.details.registryPath));
    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.equal(registry.schemaVersion, 1);
    assert.equal(registry.peerRunId, result.details.peerRunId);
    assert.equal(registry.repoRoot, "/repo");
    assert.equal(registry.worktreePath, result.details.worktreePath);
    assert.equal(registry.branchName, "candidatepeer/runner-guard");
    assert.deepEqual(registry.naming, result.details.naming);
    assert.equal(registry.naming.branchName, "candidatepeer/runner-guard");
    assert.equal(registry.naming.workspaceName, "runner-guard-workspace");
    assert.equal(registry.naming.branchNameClamped, false);
    assert.equal(registry.naming.workspaceNameClamped, false);
    assert.equal(registry.parentPeerTarget, "session-019e10d2-15f5-705a-aea4-01ba49d2bbac");
    assert.deepEqual(registry.filesInScope, ["src/runner.ts", "tests/runner.test.mjs"]);
    assert.equal(registry.launch.status, "launched");
    assert.equal(registry.launch.launchMode, "tab");
    assert.match(
      registry.cleanupPacket.manualPreconditions.join("\n"),
      /Archive commands must complete successfully/,
    );
    assert.match(result.details.nextStep, /registry metadata, cleanup packet/);
    assert.match(result.content[0]?.text ?? "", /Peer run id: candidatepeer-/);
    assert.match(result.content[0]?.text ?? "", /Expected intercom messages: PEER_ACK, PEER_FINAL/);
    assert.match(result.content[0]?.text ?? "", /peer_watch/);
  });
});

test("candidate_peer_spawn clamps long safe names with hashes and records cleanup metadata", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const longBranchTail = `lane-${"branch-segment-".repeat(12)}`;
    const longWorkspace = `workspace-${"segment-".repeat(14)}`;

    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try long safe names",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: `candidatepeer/${longBranchTail}`,
        workspaceName: longWorkspace,
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    const branchHash = createHash("sha1")
      .update(`candidatepeer/${longBranchTail.replace(/-$/, "")}`)
      .digest("hex")
      .slice(0, 10);
    const workspaceHash = createHash("sha1")
      .update(longWorkspace.replace(/-$/, ""))
      .digest("hex")
      .slice(0, 10);

    assert.equal(result.details.ok, true);
    assert.equal(result.details.branchName.length, 96);
    assert.match(result.details.branchName, new RegExp(`-${branchHash}$`));
    assert.equal(result.details.naming.branchNameClamped, true);
    assert.equal(result.details.naming.workspaceName.length, 80);
    assert.match(result.details.naming.workspaceName, new RegExp(`-${workspaceHash}$`));
    assert.equal(result.details.naming.workspaceNameClamped, true);
    assert.equal(result.details.naming.requestedBranchName, `candidatepeer/${longBranchTail}`);
    assert.equal(result.details.naming.requestedWorkspaceName, longWorkspace);
    assert.equal(
      result.details.worktreePath.endsWith(`/${result.details.naming.workspaceName}`),
      true,
    );

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.deepEqual(worktreeCall.args.slice(5), ["-b", result.details.branchName, "HEAD"]);

    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.deepEqual(registry.naming, result.details.naming);
    assert.equal(registry.cleanupPacket.commands[1].args.at(-1), result.details.worktreePath);
    assert.equal(registry.cleanupPacket.commands[2].args.at(-1), result.details.branchName);
  });
});
