// summary: freezes sidequest's public registration, schemas, flags, messages, and import-time Pi binary behavior before file splitting.
// read_when:
//   - splitting sidequest.ts or changing sidequest commands, tools, schemas, registration flags, or environment behavior.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function register(options = {}, piOverrides = {}) {
  const tools = [];
  const commands = [];
  const events = [];
  const busEvents = [];
  const pi = {
    getThinkingLevel() {
      return "medium";
    },
    events: {
      on(name) {
        busEvents.push(name);
        return () => {};
      },
      emit() {},
    },
    on(name) {
      events.push(name);
    },
    registerTool(definition) {
      tools.push(definition);
    },
    registerCommand(name, definition) {
      commands.push([name, definition]);
    },
    ...piOverrides,
  };
  createSidequestExtension(options)(pi);
  return { tools, commands, events, busEvents, pi };
}

const COMMANDS = [
  [
    "fresh-handoff",
    "Generate a self-contained handoff and auto-submit it in a fresh clean Ghostty Pi session",
  ],
  ["sidequest", "Fork the current Pi session into a visible Ghostty peer"],
  ["scoutpeer", "Launch a clean visible read-only scout/review peer in the current workspace"],
  [
    "parallelquest",
    "Launch a one-shot candidate peer only after owner authorization for the exact repository and objective; blocked admission must not be retried unchanged",
  ],
  [
    "visible-loop",
    "Launch a visible Ghostty Pi tab that runs the default prompt sequence for N iterations",
  ],
  [
    "nexus-loop",
    "Launch a visible Ghostty Pi tab that loops deep-review, nexus implementation, atomic-completion, and commit",
  ],
  ["visible-loop-child", "Internal helper for visible-loop launched child sessions"],
  ["visible-loop-child-complete", "Internal helper that advances a visible-loop child iteration"],
];

const TOOL_CONTRACTS = [
  [
    "visible_loop_child_complete",
    ["configPath", "iteration", "candidateCloseout"],
    ["configPath", "iteration"],
    "dbd200917e6b0a6e55cac659122f5b0a4c4d985e2875456b9bf45b7bf2cb3c3b",
    "04587d91e2c0f1fb05d4356d865dafe69808d9a38870f87e268915735bd8f129",
  ],
  [
    "fork_peer_spawn",
    ["objective", "cwd", "reportBack", "parentPeerTarget"],
    ["objective"],
    "91de8a4206dee38ab44e49f3bba4357177cb4581373299844427dee514c6634a",
    "db3e1592d276d20b34a6981d4b8a447d6a00f6084f71dd951a80083de7e40235",
  ],
  [
    "scout_peer_spawn",
    ["role", "objective", "cwd", "reportBack", "parentPeerTarget", "context", "dod"],
    ["objective"],
    "80255cc05071dc7d0b15cd2d3d417f618dfbebb4539288003971a68e93ced22e",
    "5fe13249fc7237e518fcae55bfb69ca0303f9d4f2bb9536b57ee499d6d346e6f",
  ],
  [
    "fresh_handoff_spawn",
    ["goal", "cwd"],
    [],
    "cbdad1d200939124550a48383401a495d41587166d139ef264d98bed42e17226",
    "7850d82fc694456bd27528b7198652a3b394cd994c6fa7aee327d02f8b42c8e4",
  ],
  [
    "candidate_peer_spawn",
    [
      "objective",
      "cwd",
      "baseRef",
      "branchName",
      "workspaceRoot",
      "workspaceName",
      "filesInScope",
      "offLimits",
      "constraints",
      "dod",
      "reportBack",
      "parentPeerTarget",
      "requireCleanParent",
      "reuseExisting",
    ],
    ["objective"],
    "99b9c0ef0840535b2f331dc85cb31d312defca78aeabb385b2d956eda2421e23",
    "1e046ff10678fcd4255521542f6af9f3f601fc2597b61be7c6e40df77c5dabe1",
  ],
  [
    "candidate_peer_cleanup",
    ["peerRunIds", "execute", "closeVisibleResources", "integrationCloseoutStatus"],
    ["peerRunIds"],
    "2b3675f30b08b7f9fc443f72232360e6457df815e1789cc09ac72ef5b7f70cde",
    "2c49595e435cc04ae1f902008d6a3ce2db3eb37295b2daf14ea36a12558e93ca",
  ],
  [
    "candidate_peer_closeout",
    [
      "action",
      "peerRunIds",
      "repoRoot",
      "overdueAfterMs",
      "taskId",
      "integrationCloseout",
      "cleanupTrigger",
    ],
    ["action"],
    "d5560e1e0f7768256fb073daa54ccb32417d24a091fff56848dbe557acb61375",
    "54a9b4c219c7bdd28d8332bb13043ba0a5f2916c4ce2ca067fb22491402d55f9",
  ],
];

const BASE_EVENTS = [
  "session_start",
  "session_shutdown",
  "input",
  "agent_start",
  "message_start",
  "tool_execution_start",
  "tool_call",
  "tool_result",
  "tool_execution_end",
  "agent_settled",
];
const EVENTS = [...BASE_EVENTS, "tool_result"];

test("sidequest freezes exact public registration names, descriptions, schemas, and hooks", () => {
  const harness = register();

  assert.deepEqual(
    harness.commands.map(([name, command]) => [name, command.description]),
    COMMANDS,
  );
  assert.deepEqual(harness.events, EVENTS);
  assert.deepEqual(harness.busEvents, ["asc:execution-observation:v1"]);
  assert.deepEqual(
    harness.tools.map((tool) => [
      tool.name,
      Object.keys(tool.parameters.properties ?? {}),
      tool.parameters.required ?? [],
      sha256(tool.parameters),
      sha256({
        label: tool.label,
        description: tool.description,
        promptSnippet: tool.promptSnippet,
        promptGuidelines: tool.promptGuidelines,
      }),
    ]),
    TOOL_CONTRACTS,
  );
  assert.ok(harness.tools.every((tool) => typeof tool.execute === "function"));
  assert.ok(harness.commands.every(([, command]) => typeof command.handler === "function"));
  assert.deepEqual(
    harness.tools.map((tool) => [
      tool.name,
      typeof tool.renderCall === "function",
      typeof tool.renderResult === "function",
    ]),
    TOOL_CONTRACTS.map(([name]) => [name, false, false]),
  );
});

test("sidequest registration flags preserve command, tool, observer, and completion-tool boundaries", () => {
  const toolsOnly = register({ registerCommands: false, registerTools: true });
  assert.deepEqual(toolsOnly.commands, []);
  assert.deepEqual(
    toolsOnly.tools.map((tool) => tool.name),
    TOOL_CONTRACTS.slice(1).map(([name]) => name),
  );
  assert.deepEqual(toolsOnly.events, EVENTS.slice(3));
  assert.deepEqual(toolsOnly.busEvents, []);

  const commandsOnly = register({ registerCommands: true, registerTools: false });
  assert.deepEqual(
    commandsOnly.commands.map(([name]) => name),
    COMMANDS.map(([name]) => name),
  );
  assert.deepEqual(commandsOnly.tools, []);
  assert.deepEqual(commandsOnly.events, BASE_EVENTS);
  assert.deepEqual(commandsOnly.busEvents, ["asc:execution-observation:v1"]);

  const neither = register({ registerCommands: false, registerTools: false });
  assert.deepEqual(neither.commands, []);
  assert.deepEqual(neither.tools, []);
  assert.deepEqual(neither.events, BASE_EVENTS.slice(3));
  assert.deepEqual(neither.busEvents, []);
});

test("sidequest preserves the exact missing-prompt and ephemeral-session messages", async () => {
  const harness = register();
  const commands = new Map(harness.commands);
  const notifications = [];
  const ctx = {
    cwd: "/repo",
    hasUI: true,
    model: { provider: "openai", id: "gpt-4o" },
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getSessionFile() {
        return undefined;
      },
      getSessionId() {
        return "session-characterization";
      },
      getBranch() {
        return [];
      },
    },
  };

  await commands.get("sidequest").handler("", ctx);
  await commands.get("sidequest").handler("inspect registration", ctx);
  assert.deepEqual(notifications, [
    { message: 'Usage: /sidequest "what you want to explore"', type: "warning" },
    {
      message: "sidequest needs a saved Pi session. Current session looks ephemeral/no-session.",
      type: "error",
    },
  ]);
});

test("sidequest keeps PI_SIDEQUEST_PI_BIN as an import-time fallback", async () => {
  const previous = process.env.PI_SIDEQUEST_PI_BIN;
  try {
    process.env.PI_SIDEQUEST_PI_BIN = "pi-from-import-environment";
    const freshModule = await import("../extensions/sidequest.ts?import-env-characterization");
    process.env.PI_SIDEQUEST_PI_BIN = "pi-after-import-environment";

    const calls = [];
    const extension = freshModule.createSidequestExtension({
      env: { TERM_PROGRAM: "ghostty", GHOSTTY_BIN_DIR: "/usr/bin", GHOSTTY_SURFACE_ID: "19" },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
        if (args[0] === "+version") return { code: 0, stdout: "Ghostty 1.4.0\n" };
        if (args[0] === "+new-tab") return { code: 0, stdout: "" };
        throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
      },
    });
    const commands = new Map();
    extension({
      getThinkingLevel() {
        return "medium";
      },
      events: {
        on() {
          return () => {};
        },
        emit() {},
      },
      on() {},
      registerTool() {},
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
    });
    const ctx = {
      cwd: "/repo",
      hasUI: true,
      model: { provider: "openai", id: "gpt-4o" },
      ui: { notify() {} },
      sessionManager: {
        getSessionFile() {
          return "/sessions/main.jsonl";
        },
        getSessionId() {
          return "session-characterization";
        },
        getBranch() {
          return [];
        },
      },
    };

    await commands.get("sidequest").handler("characterize import fallback", ctx);
    const launch = calls.find(({ args }) => args[0] === "+new-tab");
    assert.ok(launch);
    const marker = launch.args.indexOf("sidequest-pi");
    assert.notEqual(marker, -1);
    assert.equal(launch.args[marker + 1], "pi-from-import-environment");
    assert.equal(process.env.PI_SIDEQUEST_PI_BIN, "pi-after-import-environment");
  } finally {
    if (previous === undefined) delete process.env.PI_SIDEQUEST_PI_BIN;
    else process.env.PI_SIDEQUEST_PI_BIN = previous;
  }
});

test("sidequest propagates a host malformed-schema rejection unchanged", () => {
  const hostError = new TypeError("host rejected malformed fork_peer_spawn schema");
  assert.throws(
    () =>
      register(
        {},
        {
          registerTool(tool) {
            if (tool.name === "fork_peer_spawn") throw hostError;
          },
        },
      ),
    (error) => error === hostError,
  );
});
