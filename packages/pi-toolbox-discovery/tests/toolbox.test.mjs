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
  "fork_peer_spawn",
  "scout_peer_spawn",
  "candidate_peer_spawn",
  "toolbox",
];

function catalogToolNames() {
  return CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools));
}

function createHarness(options = {}) {
  const commands = new Map();
  const tools = new Map();
  const handlers = new Map();
  const omittedTools = new Set(options.omitRegisteredTools ?? []);
  const allToolNames = new Set(
    [
      ...ALWAYS_ACTIVE_TOOLS,
      ...(options.includeCatalogTools === false ? [] : catalogToolNames()),
      ...(options.registeredTools ?? []),
    ].filter((tool) => !omittedTools.has(tool)),
  );
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
      for (const handler of handlers.get(event) ?? []) await handler({}, { ui: { notify() {} } });
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

test("toolbox registers command and discovery tool", () => {
  const harness = createHarness();
  assert.equal(typeof harness.commands.get("toolbox")?.handler, "function");
  assert.equal(typeof harness.tools.get("toolbox")?.execute, "function");
});

test("session start enforces standard active profile", async () => {
  const harness = createHarness();
  harness.setActiveTools(["read", "bash", "toolbox", "vault_query"]);
  await harness.runEvent("session_start");
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("search does not change active tools", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "search",
    query: "vault",
  });
  assert.match(result.content[0].text, /vault: Prompt Vault tools/);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("doctor reports startup registration gaps", async () => {
  const harness = createHarness({
    omitRegisteredTools: ["autoresearch_runtime_status", "autoresearch_runtime_run"],
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), { action: "doctor" });
  assert.match(result.content[0].text, /verdict: fail/);
  assert.match(
    result.content[0].text,
    /missing catalog registrations \(2\): autoresearch_runtime_run, autoresearch_runtime_status/,
  );
  assert.match(result.content[0].text, /missing registration groups \(1\): autoresearch:/);
  assert.deepEqual(result.details.missingCatalogRegistrations, [
    "autoresearch_runtime_run",
    "autoresearch_runtime_status",
  ]);
});

test("doctor passes for complete startup registration", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), { action: "doctor" });
  assert.match(result.content[0].text, /verdict: pass/);
  assert.match(result.content[0].text, /missing catalog registrations \(0\): none/);
  assert.deepEqual(result.details.recommendations, [
    "Standard startup profile is healthy; activate registered latent tools only when the task needs them.",
  ]);
});

test("plan is active-set only and imports no owner modules", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "plan",
    bundle: "orchestrator",
    profile: "orchestrator-gated",
  });
  assert.match(result.content[0].text, /owner module imports: none/);
  assert.match(result.content[0].text, /activation effect: active-tool set only/);
  assert.match(result.content[0].text, /autoresearch_self_hosting_supervision/);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("risk gates mutating activation", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    bundle: "vault",
    profile: "mutating",
  });
  assert.match(result.content[0].text, /Refusing to activate vault\/mutating/);
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("activates registered mutating tools after acknowledgement", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    bundle: "vault",
    profile: "mutating",
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.match(
    result.content[0].text,
    /Activated tools: vault_insert, vault_update, vault_rate, prompt_eval/,
  );
  assert.equal(harness.activeTools.includes("vault_insert"), true);
});

test("fails closed for missing explicit tools", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["does_not_exist"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.match(result.content[0].text, /not registered in this Pi session: does_not_exist/);
  assert.match(result.content[0].text, /tool schema once at startup/);
  assert.deepEqual(result.details.missing, ["does_not_exist"]);
});

test("activates only requested profile tools", async () => {
  const bundle = {
    id: "profile-test",
    title: "Profile test",
    description: "test",
    ownerPackage: "test",
    ownerSemantics: "test",
    keywords: [],
    profiles: [
      {
        id: "read",
        description: "read",
        tools: ["profile_read_tool"],
        risk: "read",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description: "mutating",
        tools: ["profile_write_tool"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  };
  CATALOG.push(bundle);
  try {
    const harness = createHarness();
    const result = await executeToolbox(harness.tools.get("toolbox"), {
      action: "activate",
      bundle: "profile-test",
      profile: "read",
    });
    assert.match(result.content[0].text, /Activated tools: profile_read_tool/);
    assert.equal(harness.activeTools.includes("profile_read_tool"), true);
    assert.equal(harness.activeTools.includes("profile_write_tool"), false);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
  }
});

test("catalog includes autoresearch foreground resume executor", () => {
  const autoresearch = CATALOG.find((bundle) => bundle.id === "autoresearch");
  const mutating = autoresearch?.profiles.find((profile) => profile.id === "mutating");
  assert.ok(mutating);
  assert.equal(mutating.tools.includes("autoresearch_runtime_resume_apply"), true);
});

test("session_start clears stale leases and TTL expires activations", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.equal(harness.activeTools.includes("vault_insert"), true);
  await harness.runEvent("session_start");
  assert.equal(harness.activeTools.includes("vault_insert"), false);
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test",
  });
  await harness.runEvent("turn_start");
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});
