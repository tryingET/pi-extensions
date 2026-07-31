#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
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
  echo "release smoke requires a repo-local tsx binary" >&2
  exit 1
fi

# The tarball correctly declares Pi runtime packages as peers. Supply the release
# harness with the same pinned host packages used by this package without adding
# them to the publish artifact or operator-global npm state.
HOST_PEER_ROOT="$ROOT_DIR/node_modules/@earendil-works"
ISOLATED_PEER_ROOT="$PI_CODING_AGENT_DIR/npm/node_modules/@earendil-works"
mkdir -p "$ISOLATED_PEER_ROOT"
for peer in pi-ai pi-coding-agent pi-tui; do
  if [[ ! -d "$HOST_PEER_ROOT/$peer" ]]; then
    echo "release smoke host peer missing: $HOST_PEER_ROOT/$peer" >&2
    exit 1
  fi
  ln -sfn "$HOST_PEER_ROOT/$peer" "$ISOLATED_PEER_ROOT/$peer"
done

PACKAGE_NAME="$PACKAGE_NAME" PACKAGE_VERSION="$PACKAGE_VERSION" env -u PI_MODE -u PI_MODES "$TSX_BIN" --eval '
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const packageName = String(process.env.PACKAGE_NAME);
  const packageParts = packageName.split("/").filter(Boolean);
  const packageDir = path.join(
    process.env.PI_CODING_AGENT_DIR,
    "npm",
    "node_modules",
    ...packageParts,
  );
  assert.ok(
    fs.existsSync(path.join(packageDir, "package.json")),
    `isolated installed package missing: ${packageDir}`,
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  assert.equal(pkg.name, packageName);
  assert.equal(pkg.version, process.env.PACKAGE_VERSION, "installed smoke artifact version mismatch");
  assert.ok(pkg.pi?.extensions?.includes("./extensions/mode.ts"));

  const extensionPath = path.join(packageDir, "extensions", "mode.ts");
  assert.ok(fs.existsSync(extensionPath), `installed extension missing: ${extensionPath}`);
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?release-smoke=${Date.now()}`);
  assert.equal(typeof extensionModule.default, "function");

  const modesDir = path.join(process.env.PI_CODING_AGENT_DIR, "modes");
  fs.mkdirSync(modesDir, { recursive: true });
  fs.writeFileSync(
    path.join(modesDir, "builder.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "builder",
      label: "Builder",
      promptStrategy: "replace_base",
      systemPrompt: "BUILDER BASE",
    }),
  );
  fs.writeFileSync(
    path.join(modesDir, "exact.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "exact",
      label: "Exact",
      promptStrategy: "replace_final",
      systemPrompt: "  EXACT FINAL\\n",
    }),
  );
  fs.writeFileSync(
    path.join(modesDir, "needs-review.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "needs-review",
      label: "Needs Review",
      promptStrategy: "append",
      systemPrompt: "NEEDS REVIEW",
      requires: ["review"],
    }),
  );

  const commands = new Map();
  const handlers = new Map();
  const entries = [];
  const api = {
    registerEntryRenderer() {},
    registerCommand(name, definition) { commands.set(name, definition); },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) || []), handler]); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
  };
  extensionModule.default(api);
  for (const name of ["mode", "mode-status", "mode-preview", "mode-reapprove", "mode-policy", "mode-new", "mode-edit", "mode-delete"]) {
    assert.equal(typeof commands.get(name)?.handler, "function", `command /${name} not registered`);
  }
  assert.equal(typeof handlers.get("session_start")?.[0], "function");
  assert.equal(typeof handlers.get("before_agent_start")?.[0], "function");

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-modes-release-smoke-"));
  try {
  const context = (branch) => ({
    mode: "rpc",
    hasUI: false,
    cwd,
    isProjectTrusted: () => false,
    sessionManager: { getBranch: () => branch },
    getSystemPromptOptions: () => ({ cwd, selectedTools: ["read"] }),
    getSystemPrompt: () => "HOST",
    ui: {},
  });

  const legacyBranch = [{ type: "custom", customType: "pi-mode-state.v1", data: { key: "review" } }];
  const legacyContext = context(legacyBranch);
  legacyContext.sessionManager.getBranch = () => [...legacyBranch, ...entries];
  await handlers.get("session_start")[0]({ reason: "reload" }, legacyContext);
  const migrated = entries.at(-1);
  assert.ok(migrated, "legacy migration did not append state");
  assert.notEqual(migrated.customType, "pi-mode-state.v1", "legacy migration did not advance state schema");
  assert.equal(migrated.customType, "pi-mode-state.v3", "legacy migration did not reach fingerprinted v3");
  assert.match(JSON.stringify(migrated.data), /review/, "legacy append slot was not preserved");

  await commands.get("mode").handler(
    "set builder --overlay review --overlay explain",
    legacyContext,
  );
  assert.equal(entries.at(-1).customType, "pi-mode-state.v3");
  const composed = await handlers.get("before_agent_start")[0](
    {
      systemPrompt: "HOST",
      systemPromptOptions: {
        cwd,
        selectedTools: ["read"],
        appendSystemPrompt: "APPEND",
        contextFiles: [{ path: `${cwd}/AGENTS.md`, content: "CONTEXT" }],
      },
    },
    legacyContext,
  );
  assert.match(composed.systemPrompt, /^BUILDER BASE/);
  assert.match(composed.systemPrompt, /APPEND/);
  assert.match(composed.systemPrompt, /CONTEXT/);
  assert.ok(composed.systemPrompt.indexOf("overlay 1: Review") < composed.systemPrompt.indexOf("overlay 2: Explain"));

  await commands.get("mode").handler("save smoke-composition", legacyContext);
  assert.ok(
    fs.existsSync(
      path.join(process.env.PI_CODING_AGENT_DIR, "mode-presets", "smoke-composition.json"),
    ),
  );
  let exportedLine = "";
  const originalConsoleLog = console.log;
  console.log = (value) => { exportedLine = String(value); };
  try {
    await commands.get("mode").handler("export smoke-composition", legacyContext);
  } finally {
    console.log = originalConsoleLog;
  }
  const exported = JSON.parse(exportedLine);
  assert.equal(exported.preset.key, "smoke-composition");
  assert.equal("scope" in exported.preset, false);
  assert.equal("path" in exported.preset, false);
  fs.rmSync(
    path.join(process.env.PI_CODING_AGENT_DIR, "mode-presets", "smoke-composition.json"),
  );
  await commands.get("mode").handler(
    `import smoke-composition --data ${exported.encoded}`,
    legacyContext,
  );
  await commands.get("mode").handler("off", legacyContext);
  await commands.get("mode").handler("use smoke-composition", legacyContext);
  assert.deepEqual(entries.at(-1).data.overlayKeys, ["review", "explain"]);

  fs.writeFileSync(
    path.join(modesDir, "builder.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "builder",
      label: "Builder",
      promptStrategy: "replace_base",
      systemPrompt: "BUILDER CHANGED",
    }),
  );
  const drifted = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.equal(drifted.systemPrompt, "HOST", "default drift policy must block to native host");
  await commands.get("mode-policy").handler("block", legacyContext);
  const blockedAfterPolicyWrite = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.equal(
    blockedAfterPolicyWrite.systemPrompt,
    "HOST",
    "writing block policy must not silently reapprove drift",
  );
  await commands.get("mode-reapprove").handler("", legacyContext);
  const reapproved = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.match(reapproved.systemPrompt, /^BUILDER CHANGED/);
  await commands.get("mode").handler("set builder", legacyContext);

  fs.writeFileSync(
    path.join(modesDir, "builder.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "builder",
      label: "Builder",
      promptStrategy: "replace_final",
      systemPrompt: "BUILDER EXACT",
    }),
  );
  await commands.get("mode-policy").handler("allow", legacyContext);
  const exactBlockedUnderAllow = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.equal(
    exactBlockedUnderAllow.systemPrompt,
    "HOST",
    "drift policy must never bypass replace_final acknowledgement",
  );
  await assert.rejects(
    () => commands.get("mode").handler("builder", legacyContext),
    /requires --confirm-exact/,
    "same-key strategy drift to replace_final must require acknowledgement",
  );
  await commands.get("mode").handler("builder --confirm-exact", legacyContext);
  const sameKeyExact = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.equal(sameKeyExact.systemPrompt, "BUILDER EXACT");

  await commands.get("mode").handler("off", legacyContext);
  await assert.rejects(
    () => commands.get("mode").handler("+needs-review", legacyContext),
    /requires selected mode/,
  );
  await assert.rejects(
    () => commands.get("mode").handler("exact", legacyContext),
    /requires --confirm-exact/,
  );
  await commands.get("mode").handler("exact --confirm-exact", legacyContext);
  const directExact = await handlers.get("before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    legacyContext,
  );
  assert.equal(directExact.systemPrompt, "  EXACT FINAL\\n");

  await assert.rejects(
    () => commands.get("mode").handler("-missing", legacyContext),
    /not an append overlay/,
    "headless semantic errors must reject",
  );

  const exactEntries = [];
  const exactBranch = [{ type: "custom", customType: "pi-mode-state.v1", data: { key: "exact" } }];
  const exactContext = context(exactBranch);
  const exactApi = {
    registerEntryRenderer() {},
    registerCommand() {},
    on(name, handler) { handlers.set(`exact:${name}`, [handler]); },
    appendEntry(customType, data) { exactEntries.push({ type: "custom", customType, data }); },
  };
  extensionModule.default(exactApi);
  exactContext.sessionManager.getBranch = () => [...exactBranch, ...exactEntries];
  await handlers.get("exact:session_start")[0]({ reason: "reload" }, exactContext);
  const exactResult = await handlers.get("exact:before_agent_start")[0](
    { systemPrompt: "HOST", systemPromptOptions: { cwd, selectedTools: ["read"] } },
    exactContext,
  );
  assert.equal(exactResult.systemPrompt, "  EXACT FINAL\\n");

    console.log("pi-modes installed-artifact runtime smoke OK");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'
