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

const guardModule = await import(pathToFileURL(path.join(packageDir, "src/dispatchGuard.js")).href);
assert.equal(typeof guardModule.guardPreparedText, "function", "Installed dispatch guard missing");
assert.equal(
  typeof guardModule.dispatchAuthorizedExecution,
  "function",
  "Installed durable dispatch adapter missing",
);
assert.equal(typeof guardModule.createDispatchHandoffStore, "function", "Installed handoff store missing");
assert.equal(
  typeof guardModule.createDispatchActivationPolicy,
  "function",
  "Installed activation policy missing",
);

const runtimeModule = await import(pathToFileURL(path.join(packageDir, "src/dispatchRuntime.js")).href);
const promptPlaneModule = await import(pathToFileURL(path.join(packageDir, "src/promptPlane.js")).href);
const safeTemplate = {
  id: 1,
  version: 1,
  name: "safe",
  description: "safe",
  content: "safe bytes",
  render_engine: "none",
  artifact_kind: "procedure",
  control_mode: "one_shot",
  formalization_level: "structured",
  owner_company: "software",
  visibility_companies: ["software"],
  controlled_vocabulary: null,
  status: "active",
  export_to_pi: true,
};
const loopTemplate = {
  ...safeTemplate,
  id: 2,
  name: "ooda",
  content: "loop bytes",
  control_mode: "loop",
  formalization_level: "workflow",
};
const rows = [safeTemplate, loopTemplate];
const fakeRuntime = {
  resolveCurrentCompanyContext() {
    return { company: "software", source: "installed-smoke" };
  },
  getTemplateDetailed(name) {
    return { ok: true, value: rows.find((item) => item.name === name) ?? null };
  },
  searchTemplatesDetailed(query) {
    return { ok: true, value: rows.filter((item) => item.name.includes(query)) };
  },
  queryTemplatesDetailed() {
    return { ok: true, value: rows };
  },
  escapeSql(value) {
    return String(value).replaceAll("'", "''");
  },
  buildVisibilityPredicate() {
    return "TRUE";
  },
  queryVaultJsonDetailed(sql) {
    return {
      ok: true,
      value: { rows: rows.filter((item) => String(sql).includes(`'${item.name}'`)) },
    };
  },
  parseTemplateRows() {
    return rows;
  },
};
const dispatchRuntime = runtimeModule.createVaultDispatchRuntime({ runtime: fakeRuntime });
const promptPlane = promptPlaneModule.createVaultPromptPlaneRuntime({
  runtime: fakeRuntime,
  dispatchRuntime,
});
const v1Safe = await promptPlane.prepareSelection(
  { query: "safe" },
  { currentCompany: "software" },
);
assert.equal(
  v1Safe.ok,
  true,
  `Installed V1 text-safe preparation failed: ${JSON.stringify(v1Safe)}`,
);
assert.equal(v1Safe.prepared_text, "safe bytes", "Installed V1 changed sealed text");
const v1Loop = await promptPlane.prepareSelection(
  { query: "ooda" },
  { currentCompany: "software" },
);
assert.equal(v1Loop.ok, false, "Installed V1 exposed gated execution");
assert.equal(v1Loop.prepared_text, undefined, "Installed V1 exposed gated raw text");
const v2Loop = await promptPlane.prepareSelectionV2(
  { query: "ooda" },
  { currentCompany: "software" },
);
assert.equal(v2Loop.status, "dispatch_required", "Installed V2 did not require dispatch");
assert.equal(v2Loop.prepared_text, undefined, "Installed V2 exposed gated raw text");
const smokeDir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "pi-vault-installed-"));
const receiptPath = path.join(smokeDir, "handoffs.jsonl");
const receiptStore = guardModule.createDispatchHandoffStore({ filePath: receiptPath });
const disabled = await guardModule.dispatchAuthorizedExecution({
  runtime: dispatchRuntime,
  authorizationId: v2Loop.authorization.authorizationId,
  intendedExecutor: "loop_execute",
  activation: guardModule.createDispatchActivationPolicy(false),
  receiptStore,
  execute: async ({ handoffId }) => ({ accepted: true, handoffId }),
});
assert.equal(disabled.ok, false, "Installed disabled posture executed gated work");
let executed = false;
const enabled = await guardModule.dispatchAuthorizedExecution({
  runtime: dispatchRuntime,
  authorizationId: v2Loop.authorization.authorizationId,
  intendedExecutor: "loop_execute",
  activation: guardModule.createDispatchActivationPolicy(true),
  receiptStore,
  execute: async ({ handoffId }) => {
    executed = fs.readFileSync(receiptPath, "utf8").includes(handoffId);
    return { accepted: true, handoffId, runId: "installed-smoke" };
  },
});
assert.equal(enabled.ok, true, "Installed enabled dispatch failed");
assert.equal(executed, true, "Installed executor ran before durable handoff persistence");
const rollbackAuthorization = dispatchRuntime.authorizePreparedExecution({
  templates: [loopTemplate],
  primaryTemplateName: "ooda",
  finalPreparedText: "loop bytes",
  surface: "orchestrator_adapter",
  currentCompany: "software",
});
const rolledBack = await guardModule.dispatchAuthorizedExecution({
  runtime: dispatchRuntime,
  authorizationId: rollbackAuthorization.authorizationId,
  intendedExecutor: "loop_execute",
  activation: guardModule.createDispatchActivationPolicy(false),
  receiptStore,
  execute: async ({ handoffId }) => ({ accepted: true, handoffId }),
});
assert.equal(rolledBack.ok, false, "Installed rollback restored gated execution");
fs.rmSync(smokeDir, { recursive: true, force: true });

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
