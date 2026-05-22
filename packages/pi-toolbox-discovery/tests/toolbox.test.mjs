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
  "visible_loop_child_complete",
  "context_plan",
  "toolbox",
];

function catalogToolNames() {
  return CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools));
}

function createHarness(options = {}) {
  const commands = new Map();
  const tools = new Map();
  const handlers = new Map();
  const sentMessages = [];
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
    async sendMessage(message, options) {
      sentMessages.push({ message, options });
    },
  };
  toolboxDiscoveryExtension(pi);
  return {
    commands,
    tools,
    sentMessages,
    async runEvent(event) {
      for (const handler of handlers.get(event) ?? []) await handler({}, { ui: { notify() {} } });
    },
    setActiveTools(names) {
      activeTools = [...names];
    },
    get activeTools() {
      return activeTools;
    },
    clearSentMessages() {
      sentMessages.length = 0;
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

test("status action reports leases without throwing", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), { action: "status" });
  assert.match(result.content[0].text, /toolbox status/);
  assert.deepEqual(result.details.leases, []);
  assert.equal(Array.isArray(result.details.missingCatalogRegistrations), true);
});

test("doctor reports optional catalog registration gaps as warnings", async () => {
  const harness = createHarness({
    omitRegisteredTools: ["autoresearch_runtime_status", "autoresearch_runtime_run"],
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), { action: "doctor" });
  assert.match(result.content[0].text, /verdict: warn/);
  assert.match(
    result.content[0].text,
    /missing catalog registrations \(2\): autoresearch_runtime_run, autoresearch_runtime_status/,
  );
  assert.match(result.content[0].text, /missing registration groups \(1\): autoresearch:/);
  assert.match(result.content[0].text, /cannot register missing owner tools/);
  assert.match(result.content[0].text, /\/reload or start a fresh session/);
  assert.deepEqual(result.details.missingCatalogRegistrations, [
    "autoresearch_runtime_run",
    "autoresearch_runtime_status",
  ]);
  assert.equal(result.details.ok, true);
  assert.match(result.details.warnings[0], /catalog tools not registered/);
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

test("plan is active-set only and states next-request schema visibility", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "plan",
    bundle: "orchestrator",
    profile: "orchestrator-gated",
  });
  assert.match(result.content[0].text, /owner module imports: none/);
  assert.match(result.content[0].text, /activation effect: active-tool set only/);
  assert.match(result.content[0].text, /next provider request after activation/);
  assert.match(result.content[0].text, /cannot be changed retroactively/);
  assert.match(result.content[0].text, /autoresearch_self_hosting_supervision/);
  assert.match(result.content[0].text, /autoresearch_learning_kes_adapter/);
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
  assert.match(result.content[0].text, /cannot register missing owner tools/);
  assert.match(result.content[0].text, /\/reload or start a fresh session/);
  assert.deepEqual(result.details.missing, ["does_not_exist"]);
});

test("fails closed without partial activation when mixed explicit tools include missing tools", async () => {
  const harness = createHarness();
  const before = [...harness.activeTools];
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert", "does_not_exist"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.equal(result.details.ok, false);
  assert.deepEqual(result.details.missing, ["does_not_exist"]);
  assert.equal(harness.activeTools.includes("vault_insert"), false);
  assert.deepEqual(harness.activeTools, before);
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

test("catalog includes context-packer read profile", async () => {
  const contextPacker = CATALOG.find((bundle) => bundle.id === "context-packer");
  const read = contextPacker?.profiles.find((profile) => profile.id === "read");
  assert.ok(read);
  assert.deepEqual(read.tools, ["context_plan", "context_pack", "context_dogfood_evaluate"]);
  assert.equal(read.risk, "read");

  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    bundle: "context-packer",
  });
  assert.match(
    result.content[0].text,
    /Activated tools: context_plan, context_pack, context_dogfood_evaluate/,
  );
  assert.deepEqual(result.details.activatedNewTools, ["context_pack", "context_dogfood_evaluate"]);
  assert.equal(harness.activeTools.includes("context_plan"), true);
  assert.equal(harness.activeTools.includes("context_pack"), true);
  assert.equal(harness.activeTools.includes("context_dogfood_evaluate"), true);
});

test("catalog includes agent_vent as diagnostic companion to ASC", async () => {
  const agentVent = CATALOG.find((bundle) => bundle.id === "agent_vent");
  const profile = agentVent?.profiles.find((entry) => entry.id === "default");
  assert.ok(profile);
  assert.deepEqual(profile.tools, ["agent_vent"]);
  assert.equal(profile.risk, "diagnostic");
  assert.equal(profile.requiresExplicitUserIntent, false);
  assert.match(agentVent.ownerSemantics, /without moving vent state into self\/ASC/);

  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    bundle: "agent_vent",
  });
  assert.match(result.content[0].text, /Activated tools: agent_vent/);
  assert.deepEqual(result.details.activatedNewTools, ["agent_vent"]);
  assert.equal(harness.activeTools.includes("agent_vent"), true);

  const aliasResult = await executeToolbox(harness.tools.get("toolbox"), {
    action: "explain",
    bundle: "agent-vent",
  });
  assert.match(aliasResult.content[0].text, /agent_vent: Agent vent diagnostics/);
});

test("session_start clears stale leases and TTL keeps activation for one future turn", async () => {
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
  const activation = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.match(activation.content[0].text, /next provider\/model request/);
  assert.match(activation.content[0].text, /Continuation: queued a same-task provider turn/);
  assert.match(activation.content[0].text, /Cache impact:/);
  assert.equal(activation.details.schemaVisibility.nextProviderRequest, true);
  assert.equal(activation.details.schemaVisibility.retroactiveCurrentProviderRequest, false);
  assert.equal(activation.details.continuation.queued, true);
  await harness.runEvent("turn_start");
  assert.equal(harness.activeTools.includes("vault_insert"), true);
  await harness.runEvent("turn_start");
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("activation during a turn survives the next provider turn before TTL expiry", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");
  await harness.runEvent("turn_start");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test",
  });
  await harness.runEvent("turn_start");
  assert.equal(harness.activeTools.includes("vault_insert"), true);
  await harness.runEvent("turn_start");
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("activation queues same-task continuation when active tool set changes", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.equal(result.details.continuation.queued, true);
  assert.deepEqual(result.details.activatedNewTools, ["vault_insert"]);
  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].message.customType, "toolbox-activation-continuation");
  assert.match(harness.sentMessages[0].message.content, /Continue the previous objective/);
  assert.deepEqual(harness.sentMessages[0].message.details.activatedTools, ["vault_insert"]);
  assert.deepEqual(harness.sentMessages[0].options, { triggerTurn: true, deliverAs: "steer" });
});

test("activation does not queue continuation when active set is unchanged", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  harness.clearSentMessages();
  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.equal(result.details.continuation.queued, false);
  assert.equal(result.details.continuation.reason, "active-set-unchanged");
  assert.equal(harness.sentMessages.length, 0);
});

test("activation continuation can be disabled", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert"],
    autoContinue: false,
    riskAcknowledged: true,
    riskJustification: "test",
  });
  assert.equal(result.details.continuation.queued, false);
  assert.equal(result.details.continuation.reason, "disabled-by-request");
  assert.equal(harness.sentMessages.length, 0);
});
