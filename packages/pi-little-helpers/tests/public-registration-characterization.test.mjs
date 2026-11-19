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
    "Generate a self-contained handoff and auto-submit it in a fresh clean Ghostty Pi session. Unscoped child cwd receives company provenance automatically; session mode is not a company switch",
  ],
  [
    "sidequest",
    "Fork the current Pi session into a visible Ghostty peer. Unscoped child cwd receives company provenance automatically",
  ],
  [
    "scoutpeer",
    "Launch a clean visible read-only scout/review peer in the current workspace. Unscoped child cwd receives company provenance automatically",
  ],
  [
    "parallelquest",
    "Launch a one-shot candidate peer only after owner authorization for the exact repository and objective; blocked admission must not be retried unchanged. Isolated worktrees receive controller company provenance automatically",
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
    "5c4643ec4adad7f697892073f3a1bd22b6c7be109768dd93845b6e2788fdd9f2",
    "039891a127dd5f36e0c8d3d38559e197aa69866d4993f1ea3603e614ebe43562",
  ],
  [
    "scout_peer_spawn",
    ["role", "objective", "cwd", "reportBack", "parentPeerTarget", "context", "dod"],
    ["objective"],
    "b23ec324cb73ccd87207c93684c1ff308d6c140a71dd3993a59e9a8a12468376",
    "7cd01f270aaf0207bf15614e794ed972eecddb989208e79db6362ca0738a32e6",
  ],
  [
    "fresh_handoff_spawn",
    ["goal", "cwd"],
    [],
    "0f586f46f9850885e700f1509caf77d3ff102a9ceb2faa0f8040b2879306e994",
    "ee869778ea223bd11b0571c0a7ab6352849665246db34445e6f3bd0329e1e9ef",
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
    "7db5a29f31b982694901393dd9ec3476701cbfbb086d91f1eb8702c760463c05",
    "329b636e9c3f93a0921d9671b3991977cb19b8c42c743eceecc7a6fb1db6a055",
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
const TAB_HOST_EVENTS = ["session_start", "session_shutdown"];
const EVENTS = [...TAB_HOST_EVENTS, ...BASE_EVENTS, "tool_result"];

test("sidequest freezes exact public registration names, descriptions, schemas, and hooks", () => {
  const harness = register();

  assert.deepEqual(
    harness.commands.map(([name, command]) => [name, command.description]),
    COMMANDS,
  );
  assert.deepEqual(harness.events, EVENTS);
  assert.deepEqual(harness.busEvents, [
    "asc:subagent-observer:diagnose:v1",
    "asc:execution-observation:v1",
  ]);
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
  assert.deepEqual(toolsOnly.events, [...BASE_EVENTS.slice(3), "tool_result"]);
  assert.deepEqual(toolsOnly.busEvents, []);

  const commandsOnly = register({ registerCommands: true, registerTools: false });
  assert.deepEqual(
    commandsOnly.commands.map(([name]) => name),
    COMMANDS.map(([name]) => name),
  );
  assert.deepEqual(commandsOnly.tools, []);
  assert.deepEqual(commandsOnly.events, [...TAB_HOST_EVENTS, ...BASE_EVENTS]);
  assert.deepEqual(commandsOnly.busEvents, [
    "asc:subagent-observer:diagnose:v1",
    "asc:execution-observation:v1",
  ]);

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
      env: { TERM_PROGRAM: "xterm", GHOSTTY_BIN_DIR: "/usr/bin", GHOSTTY_SURFACE_ID: "19" },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
        if (args[0] === "+version") return { code: 0, stdout: "Ghostty 1.4.0\n" };
        if (args[0]?.startsWith("--working-directory=")) return { code: 0, stdout: "" };
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
    const launch = calls.find(
      ({ args }) => args[0]?.startsWith("--working-directory=") && args.includes("sidequest-pi"),
    );
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
