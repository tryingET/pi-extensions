#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
NPM_GLOBAL_ROOT="$(npm root -g)"

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

PACKAGE_NAME="$PACKAGE_NAME" NPM_GLOBAL_ROOT="$NPM_GLOBAL_ROOT" "$TSX_BIN" --eval '
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const packageName = process.env.PACKAGE_NAME;
  const npmGlobalRoot = process.env.NPM_GLOBAL_ROOT;
  const packageDir = path.join(npmGlobalRoot, ...String(packageName).split("/"));
  const packageJsonPath = path.join(packageDir, "package.json");
  assert.ok(fs.existsSync(packageJsonPath), `Installed package.json missing: ${packageJsonPath}`);

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const sidequestEntry = pkg.pi?.extensions?.find((entry) => entry === "./extensions/sidequest.ts");
  assert.equal(typeof sidequestEntry, "string", "Installed package missing ./extensions/sidequest.ts entry");

  const sidequestPath = path.join(packageDir, sidequestEntry.replace(/^\.\//, ""));
  assert.ok(fs.existsSync(sidequestPath), `Installed sidequest extension missing: ${sidequestPath}`);

  const module = await import(pathToFileURL(sidequestPath).href);
  assert.equal(typeof module.default, "function", "Installed sidequest extension missing default export");
  assert.equal(typeof module.createSidequestExtension, "function", "Installed sidequest extension missing createSidequestExtension export");
  assert.equal(typeof module.resolveGhosttyBin, "function", "Installed sidequest extension missing resolveGhosttyBin export");
  assert.equal(typeof module.getGhosttySurfaceId, "function", "Installed sidequest extension missing getGhosttySurfaceId export");

  const execCalls = [];
  const notifications = [];
  const commands = new Map();

  const extension = module.createSidequestExtension({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    pathExists(candidatePath) {
      return candidatePath === "/usr/bin/ghostty";
    },
    async exec(command, args, options = {}) {
      execCalls.push({ command, args, options });
      if (args[0] === "+help") {
        return { code: 0, stdout: "Available actions:\n  +new-window\n" };
      }
      if (String(args[0] || "").startsWith("--working-directory=")) {
        return { code: 0, stdout: "" };
      }
      throw new Error(`Unexpected Ghostty invocation: ${command} ${args.join(" ")}`);
    },
  });

  extension({
    getThinkingLevel() {
      return "medium";
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  });

  const sidequest = commands.get("sidequest");
  assert.equal(typeof sidequest?.handler, "function", "Installed sidequest command was not registered");

  await sidequest.handler("release smoke", {
    cwd: "/repo",
    hasUI: true,
    model: { provider: "openai", id: "gpt-4o" },
    ui: {
      notify(message, type = "info") {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getSessionFile() {
        return "/sessions/release.jsonl";
      },
    },
  });

  assert.deepEqual(
    execCalls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "--working-directory=/repo"],
    ],
    "Installed sidequest runtime did not follow the expected fallback path",
  );
  assert.equal(notifications.length, 1, "Installed sidequest runtime did not notify exactly once");
  assert.equal(notifications[0].type, "success", "Installed sidequest runtime did not succeed");
  assert.match(notifications[0].message, /new Ghostty window/);
  assert.match(notifications[0].message, /does not support \+new-tab/);
  console.log("SUCCESS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'