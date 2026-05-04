import assert from "node:assert/strict";
import test from "node:test";

import toolboxDiscoveryExtension, { CATALOG } from "../extensions/toolbox.ts";

const ALWAYS_ACTIVE_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "self",
  "interview",
  "dispatch_subagent",
  "intercom",
  "vault_query",
  "vault_retrieve",
  "vault_vocabulary",
  "vault_dispatch_check",
  "toolbox",
];

function createHarness() {
  const commands = new Map();
  const tools = new Map();
  const handlers = new Map();
  const allToolNames = new Set([...ALWAYS_ACTIVE_TOOLS, "vault_insert"]);
  let activeTools = [...ALWAYS_ACTIVE_TOOLS];

  const pi = {
    on(event, handler) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
    },
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
    async runEvent(event) {
      for (const handler of handlers.get(event) ?? []) {
        await handler({}, { ui: { notify() {} } });
      }
    },
    setActiveTools(names) {
      activeTools = [...names];
    },
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

test("session start enforces the minimal always-active startup profile", async () => {
  const harness = createHarness();
  harness.setActiveTools([
    "read",
    "bash",
    "edit",
    "write",
    "self",
    "interview",
    "toolbox",
    "vault_query",
  ]);

  await harness.runEvent("session_start");

  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("toolbox search returns catalog entries without changing active tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "search", query: "vault" });

  assert.match(result.content[0].text, /vault: Prompt Vault tools/);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("Prompt Vault read tools are part of the cognitive always-active set", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "deactivate",
    bundle: "vault",
    profile: "read",
  });

  assert.equal(harness.activeTools.includes("vault_query"), true);
  assert.equal(harness.activeTools.includes("vault_retrieve"), true);
  assert.equal(harness.activeTools.includes("vault_vocabulary"), true);
  assert.equal(harness.activeTools.includes("vault_dispatch_check"), true);
  assert.match(
    result.content[0].text,
    /Protected always-active tools retained: vault_query, vault_retrieve, vault_vocabulary, vault_dispatch_check/,
  );
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

test("toolbox lazily imports ontology read tools before activation", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "ontology",
    profile: "read",
  });

  assert.match(result.content[0].text, /Activated tools: ontology_inspect, ontology_proposal/);
  assert.match(result.content[0].text, /Lazy import attempts:/);
  assert.equal(harness.activeTools.includes("ontology_inspect"), true);
  assert.equal(harness.activeTools.includes("ontology_proposal"), true);
});

test("toolbox lazily imports designmd read tools before activation", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "designmd",
    profile: "read",
  });

  assert.match(result.content[0].text, /Activated tools: designmd_lint/);
  assert.match(result.content[0].text, /Lazy import attempts:/);
  assert.equal(harness.activeTools.includes("designmd_lint"), true);
  assert.equal(harness.activeTools.includes("designmd_readiness"), true);
});

test("toolbox lazily imports autoresearch read tools before activation", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "autoresearch",
    profile: "read",
  });

  assert.match(result.content[0].text, /Activated tools: autoresearch_runtime_status/);
  assert.match(result.content[0].text, /Lazy import attempts:/);
  assert.equal(harness.activeTools.includes("autoresearch_runtime_status"), true);
  assert.equal(harness.activeTools.includes("autoresearch_llamacpp_campaign"), true);
});

test("toolbox lazily imports orchestrator read tools before activation", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "orchestrator",
    profile: "read",
  });

  assert.match(result.content[0].text, /Activated tools: society_query/);
  assert.match(result.content[0].text, /Lazy import attempts:/);
  assert.equal(harness.activeTools.includes("society_query"), true);
  assert.equal(harness.activeTools.includes("ontology_context"), true);
});

test("toolbox lazily imports little-helpers peer-spawn tools before activation", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "peer-spawn",
    profile: "default",
    riskAcknowledged: true,
  });

  assert.match(result.content[0].text, /Activated tools: fork_peer_spawn/);
  assert.match(result.content[0].text, /Lazy import attempts:/);
  assert.equal(result.details.ok, true);
  assert.equal(harness.activeTools.includes("fork_peer_spawn"), true);
  assert.equal(harness.activeTools.includes("scout_peer_spawn"), true);
  assert.equal(harness.activeTools.includes("candidate_peer_spawn"), true);
});

test("toolbox deactivation preserves always-active tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, { action: "activate", tools: ["vault_insert"] });
  const result = await executeToolbox(toolbox, {
    action: "deactivate",
    tools: [
      "self",
      "interview",
      "dispatch_subagent",
      "intercom",
      "vault_query",
      "vault_retrieve",
      "vault_vocabulary",
      "vault_dispatch_check",
      "toolbox",
      "vault_insert",
    ],
  });

  assert.equal(harness.activeTools.includes("vault_insert"), false);
  assert.equal(harness.activeTools.includes("self"), true);
  assert.equal(harness.activeTools.includes("interview"), true);
  assert.equal(harness.activeTools.includes("dispatch_subagent"), true);
  assert.equal(harness.activeTools.includes("intercom"), true);
  assert.equal(harness.activeTools.includes("vault_query"), true);
  assert.equal(harness.activeTools.includes("vault_retrieve"), true);
  assert.equal(harness.activeTools.includes("vault_vocabulary"), true);
  assert.equal(harness.activeTools.includes("vault_dispatch_check"), true);
  assert.equal(harness.activeTools.includes("toolbox"), true);
  assert.match(
    result.content[0].text,
    /Protected always-active tools retained: self, interview, dispatch_subagent, intercom, vault_query, vault_retrieve, vault_vocabulary, vault_dispatch_check, toolbox/,
  );
});

test("toolbox TTL expires unpinned activations on later turns", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, { action: "activate", tools: ["vault_insert"], ttlTurns: 1 });
  assert.equal(harness.activeTools.includes("vault_insert"), true);

  await harness.runEvent("turn_start");

  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("toolbox can lazily import an owner bundle before activation", async () => {
  const moduleSource = `export default function(pi) {
    pi.registerTool({
      name: "lazy_test_tool",
      label: "Lazy Test Tool",
      description: "Registered by a lazy toolbox import",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; }
    });
  }`;
  const bundle = {
    id: "lazy-test",
    title: "Lazy test bundle",
    description: "Test-only lazy import bundle",
    ownerPackage: "test",
    ownerSemantics: "test-only",
    keywords: ["lazy-test"],
    lazyModules: [
      {
        specifier: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
        label: "test module",
      },
    ],
    profiles: [
      {
        id: "default",
        description: "Default lazy-test profile",
        tools: ["lazy_test_tool"],
        risk: "read",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: false,
      },
    ],
  };
  CATALOG.push(bundle);

  try {
    const harness = createHarness();
    const toolbox = harness.tools.get("toolbox");

    const result = await executeToolbox(toolbox, {
      action: "activate",
      bundle: "lazy-test",
    });

    assert.match(result.content[0].text, /Lazy import attempts: ok/);
    assert.equal(harness.activeTools.includes("lazy_test_tool"), true);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
  }
});
