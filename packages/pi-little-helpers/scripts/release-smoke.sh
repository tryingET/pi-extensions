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
  const packageParts = String(packageName).split("/").filter(Boolean);
  const candidatePackageDirs = [
    process.env.PI_CODING_AGENT_DIR
      ? path.join(process.env.PI_CODING_AGENT_DIR, "npm", "node_modules", ...packageParts)
      : undefined,
    path.join(process.cwd(), ".pi", "npm", "node_modules", ...packageParts),
    npmGlobalRoot ? path.join(npmGlobalRoot, ...packageParts) : undefined,
  ].filter(Boolean);
  const packageDir = candidatePackageDirs.find((candidate) =>
    fs.existsSync(path.join(candidate, "package.json")),
  );
  assert.ok(
    packageDir,
    `Installed package.json missing. Checked: ${candidatePackageDirs.join(", ")}`,
  );

  const packageJsonPath = path.join(packageDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const expectedExtensionEntries = [
    "./extensions/code-block-picker.ts",
    "./extensions/html-output-browser.ts",
    "./extensions/package-update-notify.ts",
    "./extensions/session-presence.ts",
    "./extensions/sidequest.ts",
    "./extensions/stash.ts",
  ];
  for (const expectedEntry of expectedExtensionEntries) {
    assert.ok(
      pkg.pi?.extensions?.includes(expectedEntry),
      `Installed package missing ${expectedEntry} entry`,
    );
    assert.ok(
      fs.existsSync(path.join(packageDir, expectedEntry.replace(/^\.\//, ""))),
      `Installed extension missing: ${expectedEntry}`,
    );
  }

  const sidequestEntry = "./extensions/sidequest.ts";
  const sidequestPath = path.join(packageDir, sidequestEntry.replace(/^\.\//, ""));

  const module = await import(pathToFileURL(sidequestPath).href);
  assert.equal(typeof module.default, "function", "Installed sidequest extension missing default export");
  assert.equal(typeof module.createSidequestExtension, "function", "Installed sidequest extension missing createSidequestExtension export");
  assert.equal(typeof module.resolveGhosttyBin, "function", "Installed sidequest extension missing resolveGhosttyBin export");
  assert.equal(typeof module.getGhosttySurfaceId, "function", "Installed sidequest extension missing getGhosttySurfaceId export");

  const execCalls = [];
  const notifications = [];
  const commands = new Map();
  const tools = new Map();

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
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  });

  const sidequest = commands.get("sidequest");
  assert.equal(typeof sidequest?.handler, "function", "Installed sidequest command was not registered");
  for (const expectedTool of ["fork_peer_spawn", "scout_peer_spawn", "candidate_peer_spawn"]) {
    assert.equal(typeof tools.get(expectedTool)?.execute, "function", `Installed ${expectedTool} tool was not registered`);
  }

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
  assert.equal(notifications[0].type, "info", "Installed sidequest runtime did not report the expected launch notice");
  assert.match(notifications[0].message, /new Ghostty window/);
  assert.match(notifications[0].message, /does not support \+new-tab/);
  console.log("SUCCESS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'