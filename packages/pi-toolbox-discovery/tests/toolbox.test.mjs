// ---
// summary: tests toolbox registration, discovery, risk gating, active-set verification, leases, and continuation behavior.
// read_when:
//   - changing toolbox catalog actions or runtime safety guarantees.
// ---
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
  "loop_execute",
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
  const notifications = [];
  const omittedTools = new Set(options.omitRegisteredTools ?? []);
  const allToolNames = new Set(
    [
      ...ALWAYS_ACTIVE_TOOLS,
      ...(options.includeCatalogTools === false ? [] : catalogToolNames()),
      ...(options.registeredTools ?? []),
    ].filter((tool) => !omittedTools.has(tool)),
  );
  let activeTools = [...ALWAYS_ACTIVE_TOOLS];
  let getAllToolsCallCount = 0;
  let setActiveToolsCallCount = 0;
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
      getAllToolsCallCount += 1;
      const outcome = options.getAllToolsBehavior?.({ call: getAllToolsCallCount });
      if (outcome?.throw) throw new Error("injected getAllTools failure");
      return [...allToolNames].map((name) => ({
        name,
        description: `${name} description`,
        parameters: {},
      }));
    },
    setActiveTools(names) {
      setActiveToolsCallCount += 1;
      const requested = [...names];
      const outcome = options.setActiveToolsBehavior?.({
        call: setActiveToolsCallCount,
        requested,
        activeTools: [...activeTools],
      });
      if (outcome?.activeTools) activeTools = [...outcome.activeTools];
      else if (!outcome?.noOp) activeTools = requested;
      if (outcome?.throw) throw new Error("injected setActiveTools failure");
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
    notifications,
    async runEvent(event) {
      for (const handler of handlers.get(event) ?? []) {
        await handler(
          {},
          {
            ui: {
              notify(message, level) {
                notifications.push({ message, level });
              },
            },
          },
        );
      }
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
    get setActiveToolsCallCount() {
      return setActiveToolsCallCount;
    },
    get getAllToolsCallCount() {
      return getAllToolsCallCount;
    },
  };
}

async function executeToolbox(tool, params) {
  return tool.execute("tool-call-1", params, new AbortController().signal);
}

test("toolbox registers command and discovery tool", () => {
  const harness = createHarness();
  assert.equal(typeof harness.commands.get("toolbox")?.handler, "function");
  const toolbox = harness.tools.get("toolbox");
  assert.equal(typeof toolbox?.execute, "function");
  assert.match(toolbox.promptGuidelines.join("\n"), /self returns a diagnostic candidate/);
  assert.match(toolbox.promptGuidelines.join("\n"), /action=preview before action=record/);
});

test("session start enforces standard active profile", async () => {
  const harness = createHarness();
  harness.setActiveTools(["read", "bash", "toolbox", "vault_query"]);
  await harness.runEvent("session_start");
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("recommend suggests matching bundles without changing active tools", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "recommend",
    query: "need ontology inspection",
  });

  assert.match(result.content[0].text, /Toolbox recommendations/);
  assert.match(result.content[0].text, /ontology\/read/);
  assert.match(result.content[0].text, /active tool set unchanged/);
  assert.match(
    result.content[0].text,
    /toolbox\(\{ action: "activate", bundle: "ontology", profile: "read" \}\)/,
  );
  assert.equal(result.details.mutatesActiveSet, false);
  assert.equal(result.details.recommendations[0].bundle, "ontology");
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
});

test("recommend returns no match for unrelated task text", async () => {
  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "recommend",
    query: "what tool should I use for banana submarine unrelated frobnicate",
  });

  assert.match(result.content[0].text, /No toolbox recommendation matched/);
  assert.deepEqual(result.details.recommendations, []);
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

test("doctor reports leases whose tools are no longer active", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test leased inactive diagnosis",
  });
  harness.setActiveTools(ALWAYS_ACTIVE_TOOLS);

  const result = await executeToolbox(toolbox, { action: "doctor" });
  assert.equal(result.details.ok, false);
  assert.deepEqual(result.details.leasedInactiveTools, ["vault_insert"]);
  assert.match(result.content[0].text, /leased inactive tools \(1\): vault_insert/);
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
  assert.match(result.content[0].text, /advisory risk declaration, not proof of operator consent/);
  assert.equal(result.details.acknowledgementSemantics, "caller-declaration-not-operator-consent");
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
  assert.equal(result.details.acknowledgementSemantics, "caller-declaration-not-operator-consent");
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

test("activation verifies host readback and rolls back partial application before leases or continuation", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call, activeTools }) {
      if (call === 1) return { activeTools: [...activeTools, "vault_insert"] };
      return undefined;
    },
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert", "vault_update"],
    riskAcknowledged: true,
    riskJustification: "test verified rollback",
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.failureClass, "active_set_mismatch");
  assert.equal(result.details.mutation.rollbackSucceeded, true);
  assert.equal(result.details.leasesChanged, false);
  assert.equal(result.details.continuation.queued, false);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
  assert.equal(harness.sentMessages.length, 0);
  const status = await executeToolbox(harness.tools.get("toolbox"), { action: "status" });
  assert.deepEqual(status.details.leases, []);
});

test("activation reports degraded truth when partial application and rollback both fail", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call, activeTools }) {
      if (call === 1) return { activeTools: [...activeTools, "vault_insert"] };
      return { noOp: true };
    },
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert", "vault_update"],
    riskAcknowledged: true,
    riskJustification: "test degraded rollback",
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.mutation.rollbackAttempted, true);
  assert.equal(result.details.mutation.rollbackSucceeded, false);
  assert.equal(result.details.activeTools.includes("vault_insert"), true);
  assert.equal(result.details.continuation.queued, false);
  assert.equal(harness.sentMessages.length, 0);
});

test("activation rolls back when the host mutates then throws", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call, activeTools }) {
      if (call === 1) {
        return { activeTools: [...activeTools, "vault_insert"], throw: true };
      }
      return undefined;
    },
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test thrown mutation",
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.failureClass, "set_active_tools_threw");
  assert.equal(result.details.mutation.rollbackSucceeded, true);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
  assert.equal(harness.sentMessages.length, 0);
});

test("activation accepts host ordering differences after semantic set verification", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ requested }) {
      return { activeTools: [...requested].reverse() };
    },
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test semantic ordering",
  });

  assert.equal(result.details.ok, true);
  assert.equal(result.details.activeSetMutation.ok, true);
  assert.equal(harness.activeTools.includes("vault_insert"), true);
});

test("activation continuation includes baseline-only tools repaired by the verified mutation", async () => {
  const harness = createHarness();
  harness.setActiveTools(ALWAYS_ACTIVE_TOOLS.filter((tool) => tool !== "loop_execute"));
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["context_plan"],
  });

  assert.equal(result.details.ok, true);
  assert.deepEqual(result.details.requestedNewTools, []);
  assert.deepEqual(result.details.activatedNewTools, ["loop_execute"]);
  assert.equal(result.details.continuation.queued, true);
  assert.deepEqual(harness.sentMessages[0].message.details.activatedTools, ["loop_execute"]);
});

test("activation returns the retained pinned lease rather than a shorter proposal", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    pin: true,
    riskAcknowledged: true,
    riskJustification: "test pinned lease",
  });
  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test shorter proposal",
  });

  assert.equal(result.details.leases[0].pinned, true);
  assert.equal(result.details.leases[0].expiresAtTurn, undefined);
});

test("activation fails closed when registered-tool truth cannot be read", async () => {
  const harness = createHarness({
    getAllToolsBehavior() {
      return { throw: true };
    },
  });
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test registration lookup",
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.failureClass, "registered_tool_snapshot_failed");
  assert.equal(harness.setActiveToolsCallCount, 0);
  assert.equal(harness.sentMessages.length, 0);
});

test("failed deactivation preserves active tools and lease bookkeeping", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call }) {
      return call === 2 ? { noOp: true } : undefined;
    },
  });
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test deactivation",
  });
  const result = await executeToolbox(toolbox, {
    action: "deactivate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test deactivation",
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.leasesChanged, false);
  assert.equal(harness.activeTools.includes("vault_insert"), true);
  const status = await executeToolbox(toolbox, { action: "status" });
  assert.match(status.details.leases[0], /vault_insert/);
});

test("failed TTL deactivation retains leases and emits a warning", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call }) {
      return call === 2 ? { noOp: true } : undefined;
    },
  });
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test ttl rollback",
  });
  await harness.runEvent("turn_start");
  await harness.runEvent("turn_start");

  assert.equal(harness.activeTools.includes("vault_insert"), true);
  const status = await executeToolbox(toolbox, { action: "status" });
  assert.match(status.details.leases[0], /vault_insert/);
  assert.match(harness.notifications[0].message, /expired leases remain tracked/);
});

test("failed startup baseline verification preserves leases and warns", async () => {
  const harness = createHarness({
    setActiveToolsBehavior({ call }) {
      return call === 2 ? { noOp: true } : undefined;
    },
  });
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test startup rollback",
  });
  await harness.runEvent("session_start");

  assert.equal(harness.activeTools.includes("vault_insert"), true);
  const status = await executeToolbox(toolbox, { action: "status" });
  assert.match(status.details.leases[0], /vault_insert/);
  assert.match(harness.notifications[0].message, /prior lease bookkeeping was preserved/);
});

test("startup registration lookup failure preserves leases and warns without mutation", async () => {
  const harness = createHarness({
    getAllToolsBehavior({ call }) {
      return call === 2 ? { throw: true } : undefined;
    },
  });
  const toolbox = harness.tools.get("toolbox");
  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test startup registration lookup",
  });
  const mutationCallsBeforeStartup = harness.setActiveToolsCallCount;
  await harness.runEvent("session_start");

  assert.equal(harness.setActiveToolsCallCount, mutationCallsBeforeStartup);
  assert.equal(harness.activeTools.includes("vault_insert"), true);
  const status = await executeToolbox(toolbox, { action: "status" });
  assert.match(status.details.leases[0], /vault_insert/);
  assert.match(harness.notifications[0].message, /registered_tool_snapshot_failed/);
});

test("deactivation restores a missing registered always-active baseline tool", async () => {
  const harness = createHarness();
  harness.setActiveTools(ALWAYS_ACTIVE_TOOLS.filter((tool) => tool !== "toolbox"));
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "deactivate",
    tools: ["toolbox"],
  });

  assert.equal(result.details.ok, true);
  assert.equal(harness.activeTools.includes("toolbox"), true);
  assert.deepEqual(result.details.protectedTools, ["toolbox"]);
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
  assert.deepEqual(read.tools, [
    "context_plan",
    "context_pack",
    "context_dogfood_evaluate",
    "context_dogfood_summarize",
  ]);
  assert.equal(read.risk, "read");

  const harness = createHarness();
  const result = await executeToolbox(harness.tools.get("toolbox"), {
    action: "activate",
    bundle: "context-packer",
  });
  assert.match(
    result.content[0].text,
    /Activated tools: context_plan, context_pack, context_dogfood_evaluate, context_dogfood_summarize/,
  );
  assert.deepEqual(result.details.activatedNewTools, [
    "context_pack",
    "context_dogfood_evaluate",
    "context_dogfood_summarize",
  ]);
  assert.equal(harness.activeTools.includes("context_plan"), true);
  assert.equal(harness.activeTools.includes("context_pack"), true);
  assert.equal(harness.activeTools.includes("context_dogfood_evaluate"), true);
  assert.equal(harness.activeTools.includes("context_dogfood_summarize"), true);
});

test("catalog includes agent_vent as diagnostic companion to ASC", async () => {
  const agentVent = CATALOG.find((bundle) => bundle.id === "agent_vent");
  const profile = agentVent?.profiles.find((entry) => entry.id === "default");
  assert.ok(profile);
  assert.deepEqual(profile.tools, ["agent_vent"]);
  assert.equal(profile.risk, "diagnostic");
  assert.equal(profile.requiresExplicitUserIntent, false);
  assert.match(profile.description, /use preview before record for self diagnostic candidates/);
  assert.match(agentVent.ownerSemantics, /self diagnostic candidates/);
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
  assert.match(aliasResult.content[0].text, /Unknown toolbox bundle: agent-vent/);
  assert.equal(aliasResult.details.ok, false);
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
