#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
NPM_GLOBAL_ROOT="$(npm root -g)"

PACKAGE_NAME="$PACKAGE_NAME" NPM_GLOBAL_ROOT="$NPM_GLOBAL_ROOT" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageName = process.env.PACKAGE_NAME;
const npmGlobalRoot = process.env.NPM_GLOBAL_ROOT;
const packageDir = path.join(npmGlobalRoot, ...String(packageName).split("/"));
const packageJsonPath = path.join(packageDir, "package.json");
assert.ok(fs.existsSync(packageJsonPath), `Installed package.json missing: ${packageJsonPath}`);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const extensionEntry = pkg.pi?.extensions?.[0];
assert.equal(typeof extensionEntry, "string", "Installed package missing pi.extensions entry");

const extensionPath = path.join(packageDir, extensionEntry.replace(/^\.\//, ""));
assert.ok(fs.existsSync(extensionPath), `Installed extension entry missing: ${extensionPath}`);

const module = await import(pathToFileURL(extensionPath).href);
assert.equal(typeof module.default, "function", "Installed extension missing default export");

const tools = [];
const commands = [];
const events = [];
module.default({
  registerTool(tool) {
    tools.push(tool.name);
  },
  registerCommand(name) {
    commands.push(name);
  },
  on(event) {
    events.push(event);
  },
});

assert.ok(tools.includes("vault_schema_diagnostics"), "vault_schema_diagnostics not registered");
assert.ok(tools.includes("vault_query"), "vault_query not registered");
assert.ok(commands.includes("vault-check"), "vault-check command not registered");
assert.ok(events.includes("input"), "input handler not registered");
console.log("SUCCESS");
NODE
