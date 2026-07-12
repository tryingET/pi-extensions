#!/usr/bin/env bash
# ---
# summary: smoke-tests the installed intercom extension inside an isolated pi package environment
# read_when:
#   - checking release artifacts or installed extension behavior
# ---
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required so release smoke cannot touch global npm packages}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
LEGACY_NODE_MODULES="$(NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" npm root -g)"
MANAGED_NODE_MODULES="$PI_CODING_AGENT_DIR/npm/node_modules"

TSX_BIN=""
for candidate in \
  "$ROOT_DIR/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT"/packages/*/node_modules/.bin/tsx \
  "$MONOREPO_ROOT"/packages/*/*/node_modules/.bin/tsx; do
  if [[ -x "$candidate" ]]; then
    TSX_BIN="$candidate"
    break
  fi
done

if [[ -z "$TSX_BIN" ]]; then
  echo "release smoke requires a repo-local tsx binary to import installed TypeScript extension entries" >&2
  exit 1
fi

PACKAGE_NAME="$PACKAGE_NAME" LEGACY_NODE_MODULES="$LEGACY_NODE_MODULES" MANAGED_NODE_MODULES="$MANAGED_NODE_MODULES" NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" "$TSX_BIN" --eval '
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const packageName = process.env.PACKAGE_NAME;
  const allowedRoots = [process.env.NPM_CONFIG_PREFIX, process.env.PI_CODING_AGENT_DIR]
    .filter(Boolean)
    .map((root) => path.resolve(root));
  const candidates = [process.env.MANAGED_NODE_MODULES, process.env.LEGACY_NODE_MODULES]
    .filter(Boolean)
    .map((nodeModulesRoot) => path.join(nodeModulesRoot, packageName));
  const isInsideAllowedRoot = (candidate) => {
    const resolved = path.resolve(candidate);
    return allowedRoots.some((root) => {
      const relativePath = path.relative(root, resolved);
      return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    });
  };
  const packageDir = candidates.find((candidate) =>
    isInsideAllowedRoot(candidate) && fs.existsSync(path.join(candidate, "package.json")),
  );
  assert.ok(packageDir, `Installed package root not found. Checked: ${candidates.join(", ")}`);
  const packageJsonPath = path.join(packageDir, "package.json");

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const extensionEntry = pkg.pi?.extensions?.find((entry) => entry === "./extensions/intercom.ts");
  assert.equal(typeof extensionEntry, "string", "Installed package missing ./extensions/intercom.ts entry");

  const extensionPath = path.join(packageDir, extensionEntry.replace(/^\.\//, ""));
  assert.ok(fs.existsSync(extensionPath), `Installed intercom extension missing: ${extensionPath}`);

  const module = await import(pathToFileURL(extensionPath).href);
  assert.equal(typeof module.default, "function", "Installed intercom extension missing default export");
  assert.equal(
    typeof module.registerPeerMessagingIntercomExtension,
    "function",
    "Installed intercom extension missing registerPeerMessagingIntercomExtension export",
  );

  const peers = [
    {
      id: "planner-session-11111111",
      name: "planner",
      addressLabel: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4o",
      pid: 1,
      startedAt: 1,
      lastActivity: 1,
      status: "idle",
    },
    {
      id: "worker-session-22222222",
      name: "worker",
      addressLabel: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4o",
      pid: 2,
      startedAt: 1,
      lastActivity: 1,
      status: "busy",
    },
  ];

  const runtime = {
    updates: [],
    sent: [],
    listener: null,
    async listPeers() {
      return peers;
    },
    async send(request) {
      this.sent.push(request);
      return {
        delivered: true,
        messageId: request.message.id,
      };
    },
    async ask(request) {
      return {
        id: "reply-1",
        timestamp: 123,
        replyTo: request.message.id,
        content: {
          text: "All good.",
        },
      };
    },
    async status() {
      return {
        connected: true,
        selfId: peers[0].id,
        activePeerCount: peers.length,
      };
    },
    async disconnect() {},
    async updatePresence(updates) {
      this.updates.push(updates);
      return {
        ...peers[0],
        ...updates,
      };
    },
    getPaths() {
      return {
        runtimeDir: "/tmp/pi-peer-messaging-release-smoke",
        socketPath: "/tmp/pi-peer-messaging-release-smoke/broker.sock",
        pidPath: "/tmp/pi-peer-messaging-release-smoke/broker.pid",
        spawnLockPath: "/tmp/pi-peer-messaging-release-smoke/broker.spawn.lock",
      };
    },
    onMessage(listener) {
      this.listener = listener;
      return () => {
        if (this.listener === listener) {
          this.listener = null;
        }
      };
    },
    emitMessage(from, message) {
      this.listener?.(from, message);
    },
  };

  const tools = new Map();
  const events = new Map();
  const messages = [];
  module.registerPeerMessagingIntercomExtension(
    {
      on(event, handler) {
        events.set(event, handler);
      },
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      sendMessage(message, options) {
        messages.push({ message, options });
      },
    },
    {
      runtimeFactory: async () => runtime,
      now: () => 1_700_000_000_000,
    },
  );

  assert.ok(tools.has("intercom"), "intercom tool not registered");
  assert.ok(events.has("session_start"), "session_start hook not registered");
  assert.ok(events.has("session_shutdown"), "session_shutdown hook not registered");

  const ctx = {
    cwd: "/repo/planner",
    model: { id: "openai/gpt-4o" },
    sessionManager: {
      getCwd() {
        return "/repo/planner";
      },
      getSessionId() {
        return "planner-session-11111111";
      },
      getSessionName() {
        return "planner";
      },
    },
  };

  await events.get("session_start")({}, ctx);
  assert.equal(runtime.updates.length, 1, "session_start did not update presence once");

  const tool = tools.get("intercom");
  const statusResult = await tool.execute("tool-1", { action: "status" }, undefined, undefined, ctx);
  assert.equal(statusResult.isError, undefined, "status returned an unexpected error");
  assert.match(statusResult.content[0]?.text ?? "", /Connected: Yes/);
  assert.match(statusResult.content[0]?.text ?? "", /Active sessions: 2/);

  runtime.emitMessage(peers[1], {
    id: "ask-1",
    timestamp: 1_700_000_000_050,
    content: {
      text: "Need your review.",
    },
  });
  assert.equal(messages.length, 1, "incoming message did not surface through sendMessage");
  assert.match(messages[0].message.content, /Need your review\./);
  assert.match(messages[0].message.content, /action: "reply"/);

  console.log("SUCCESS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'
