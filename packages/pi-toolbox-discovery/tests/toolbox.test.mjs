import assert from "node:assert/strict";
import test from "node:test";

import toolboxDiscoveryExtension from "../extensions/toolbox.ts";

function createHarness() {
  const commands = new Map();
  const tools = new Map();
  const allToolNames = new Set([
    "read",
    "bash",
    "edit",
    "write",
    "self",
    "interview",
    "toolbox",
    "vault_query",
    "vault_retrieve",
    "vault_insert",
  ]);
  let activeTools = ["read", "bash", "edit", "write", "self", "interview", "toolbox"];

  const pi = {
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
      allToolNames.add(definition.name);
    },
    getActiveTools() {
      return [...activeTools];
    },
    getAllTools() {
      return [...allToolNames].map((name) => ({
        name,
        description: `${name} description`,
        parameters: {},
      }));
    },
    setActiveTools(names) {
      activeTools = [...names];
    },
  };

  toolboxDiscoveryExtension(pi);
  return {
    commands,
    tools,
    get activeTools() {
      return activeTools;
    },
  };
}

async function executeToolbox(tool, params) {
  return tool.execute("tool-call-1", params, new AbortController().signal);
}

test("toolbox registers a command and model-callable discovery tool", () => {
  const harness = createHarness();
  assert.equal(typeof harness.commands.get("toolbox")?.handler, "function");
  assert.equal(typeof harness.tools.get("toolbox")?.execute, "function");
});

test("toolbox search returns catalog entries without changing active tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "search", query: "vault" });

  assert.match(result.content[0].text, /vault: Prompt Vault tools/);
  assert.deepEqual(harness.activeTools, [
    "read",
    "bash",
    "edit",
    "write",
    "self",
    "interview",
    "toolbox",
  ]);
});

test("toolbox activates only already registered read-profile tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "vault",
    profile: "read",
  });

  assert.match(result.content[0].text, /Activated tools: vault_query, vault_retrieve/);
  assert.match(result.content[0].text, /Not registered in this session:/);
  assert.ok(harness.activeTools.includes("vault_query"));
  assert.ok(harness.activeTools.includes("vault_retrieve"));
});

test("toolbox refuses risky activation without acknowledgement", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "vault",
    profile: "mutating",
  });

  assert.match(result.content[0].text, /Refusing to activate vault\/mutating/);
  assert.equal(result.details.ok, false);
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("toolbox deactivation preserves always-active tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, { action: "activate", tools: ["vault_query"] });
  const result = await executeToolbox(toolbox, {
    action: "deactivate",
    tools: ["self", "interview", "vault_query"],
  });

  assert.equal(harness.activeTools.includes("vault_query"), false);
  assert.equal(harness.activeTools.includes("self"), true);
  assert.equal(harness.activeTools.includes("interview"), true);
  assert.match(result.content[0].text, /Protected always-active tools retained: self, interview/);
});
