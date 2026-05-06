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

function createHarness(options = {}) {
  const commands = new Map();
  const tools = new Map();
  const handlers = new Map();
  const allToolNames = new Set([
    ...ALWAYS_ACTIVE_TOOLS,
    "vault_insert",
    ...(options.registeredTools ?? []),
  ]);
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
      if (options.autoActivateRegisteredTools) {
        activeTools = [...new Set([...activeTools, definition.name])];
      }
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

test("session start enforces the standard always-active startup profile", async () => {
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

test("toolbox status reports unexpected eager catalog registrations", async () => {
  const harness = createHarness({
    registeredTools: ["autoresearch_runtime_status", "autoresearch_runtime_run"],
  });
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "status" });

  assert.match(
    result.content[0].text,
    /eager registration drift \(2\): autoresearch_runtime_run, autoresearch_runtime_status/,
  );
  assert.deepEqual(result.details.eagerRegistrationDrift, [
    "autoresearch_runtime_run",
    "autoresearch_runtime_status",
  ]);
});

test("toolbox status allows Prompt Vault inactive registrations as cognitive baseline", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "status" });

  assert.match(result.content[0].text, /eager registration drift \(0\): none/);
  assert.deepEqual(result.details.eagerRegistrationDrift, []);
});

test("toolbox doctor passes for the standard startup baseline", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "doctor" });

  assert.match(result.content[0].text, /toolbox doctor/);
  assert.match(result.content[0].text, /verdict: pass/);
  assert.match(result.content[0].text, /foundational baseline: ok/);
  assert.match(result.content[0].text, /eager registration drift \(0\): none/);
  assert.equal(result.details.ok, true);
  assert.deepEqual(result.details.recommendations, [
    "Standard startup profile is healthy; activate latent bundles only when the task needs them.",
  ]);
});

test("toolbox doctor fails on eager lazy-bundle registration drift", async () => {
  const harness = createHarness({
    registeredTools: ["autoresearch_runtime_status", "autoresearch_runtime_run"],
  });
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "doctor" });

  assert.match(result.content[0].text, /verdict: fail/);
  assert.match(
    result.content[0].text,
    /eager registration drift \(2\): autoresearch_runtime_run, autoresearch_runtime_status/,
  );
  assert.match(result.content[0].text, /duplicate\/settings suspects \(1\): autoresearch:/);
  assert.equal(result.details.ok, false);
  assert.deepEqual(result.details.eagerRegistrationDrift, [
    "autoresearch_runtime_run",
    "autoresearch_runtime_status",
  ]);
  assert.match(result.details.duplicateOrSettingsSuspects[0], /packages\/pi-autoresearch/);
});

test("toolbox doctor fails when active catalog tools have no explicit lease", async () => {
  const harness = createHarness({ registeredTools: ["ontology_inspect"] });
  harness.setActiveTools([...ALWAYS_ACTIVE_TOOLS, "ontology_inspect"]);
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, { action: "doctor" });

  assert.match(result.content[0].text, /verdict: fail/);
  assert.match(result.content[0].text, /unleased active catalog tools \(1\): ontology_inspect/);
  assert.deepEqual(result.details.unleasedActiveCatalogTools, ["ontology_inspect"]);
});

test("toolbox plan reports risk without importing owner modules", async () => {
  const moduleSource = `throw new Error("plan should not import this module");`;
  const bundle = {
    id: "plan-test",
    title: "Plan test bundle",
    description: "Test-only plan bundle",
    ownerPackage: "test",
    ownerSemantics: "test-only",
    keywords: ["plan-test"],
    lazyModules: [
      {
        specifier: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
        label: "test module",
      },
    ],
    profiles: [
      {
        id: "mutating",
        description: "Mutating profile",
        tools: ["plan_test_tool"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  };
  CATALOG.push(bundle);

  try {
    const harness = createHarness();
    const toolbox = harness.tools.get("toolbox");

    const result = await executeToolbox(toolbox, {
      action: "plan",
      bundle: "plan-test",
      profile: "mutating",
    });

    assert.match(result.content[0].text, /toolbox activation plan/);
    assert.match(result.content[0].text, /risks: mutating/);
    assert.match(result.content[0].text, /imports owner modules: no/);
    assert.equal(result.details.ok, true);
    assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
  }
});

test("toolbox plan reports peer-spawn static-schema caveat", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "plan",
    bundle: "peer-spawn",
    profile: "default",
  });

  assert.match(result.content[0].text, /toolbox activation plan/);
  assert.match(
    result.content[0].text,
    /caveat: Peer-spawn activation updates Pi's runtime active-tool registry only/,
  );
  assert.equal(result.details.ok, true);
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

test("toolbox refuses explicit risky tool activation without acknowledgement", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
  });

  assert.match(result.content[0].text, /Refusing to activate explicit-tools\/requested/);
  assert.match(result.content[0].text, /mutating/);
  assert.equal(result.details.ok, false);
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("toolbox treats non-catalog explicit tools as risk-acknowledged only", async () => {
  const harness = createHarness({ registeredTools: ["non_catalog_tool"] });
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["non_catalog_tool"],
  });

  assert.match(result.content[0].text, /Refusing to activate explicit-tools\/requested/);
  assert.match(result.content[0].text, /external-mutation/);
  assert.equal(result.details.ok, false);
  assert.equal(harness.activeTools.includes("non_catalog_tool"), false);
});

test("toolbox requires risk justification with acknowledgement", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
  });

  assert.match(result.content[0].text, /without riskAcknowledged=true, riskJustification/);
  assert.equal(result.details.ok, false);
  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("toolbox fails closed for missing explicit tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    tools: ["does_not_exist"],
    riskAcknowledged: true,
    riskJustification: "test missing explicit tool fail-closed behavior",
  });

  assert.match(result.content[0].text, /Cannot activate explicit-tools\/requested/);
  assert.match(result.content[0].text, /does_not_exist/);
  assert.match(result.content[0].text, /Explicit tool activation does not lazy-import bundles/);
  assert.equal(result.details.ok, false);
  assert.deepEqual(result.details.missing, ["does_not_exist"]);
  assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);
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

test("toolbox catalog includes orchestrator self-hosting supervision in gated profile", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "plan",
    bundle: "orchestrator",
    profile: "orchestrator-gated",
  });

  assert.match(result.content[0].text, /autoresearch_self_hosting_supervision/);
  assert.equal(result.details.ok, true);
  assert.equal(harness.activeTools.includes("autoresearch_self_hosting_supervision"), false);
});

test("toolbox keeps standard little-helpers peer-spawn tools active", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  const result = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "peer-spawn",
    profile: "default",
    riskAcknowledged: true,
    riskJustification: "test peer-spawn gated activation",
  });

  assert.match(result.content[0].text, /Activated tools: fork_peer_spawn/);
  assert.doesNotMatch(result.content[0].text, /Lazy import attempts:/);
  assert.equal(result.details.lazyImport.attempted, false);
  assert.match(
    result.content[0].text,
    /Caveat: Peer-spawn activation updates Pi's runtime active-tool registry only/,
  );
  assert.equal(result.details.ok, true);
  assert.deepEqual(result.details.caveats, [
    "Peer-spawn activation updates Pi's runtime active-tool registry only; API adapters with a static tool schema may need a schema refresh, /reload, or a fresh session before fork_peer_spawn/scout_peer_spawn/candidate_peer_spawn become callable.",
    "If an activated peer-spawn tool is still not callable, use the current interactive visible-peer command documented by pi-little-helpers, or restart with the peer-spawn tools present in the initial tool schema.",
  ]);
  assert.equal(harness.activeTools.includes("fork_peer_spawn"), true);
  assert.equal(harness.activeTools.includes("scout_peer_spawn"), true);
  assert.equal(harness.activeTools.includes("candidate_peer_spawn"), true);
});

test("toolbox does not retry fallback lazy imports after capability tools are registered", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, {
    action: "activate",
    bundle: "peer-spawn",
    profile: "default",
    riskAcknowledged: true,
    riskJustification: "test peer-spawn gated activation",
  });
  await executeToolbox(toolbox, {
    action: "deactivate",
    tools: ["fork_peer_spawn", "scout_peer_spawn", "candidate_peer_spawn"],
  });
  const secondActivation = await executeToolbox(toolbox, {
    action: "activate",
    bundle: "peer-spawn",
    profile: "default",
    riskAcknowledged: true,
    riskJustification: "test peer-spawn gated activation rerun",
  });
  const status = await executeToolbox(toolbox, { action: "status" });

  assert.match(secondActivation.content[0].text, /Activated tools: fork_peer_spawn/);
  assert.doesNotMatch(secondActivation.content[0].text, /Lazy import attempts:/);
  assert.doesNotMatch(status.content[0].text, /peer-spawn:failed/);
});

test("toolbox deactivation preserves always-active tools", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test explicit mutating deactivation path",
  });
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

test("toolbox session_start clears stale leases and lazy import records", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    riskAcknowledged: true,
    riskJustification: "test session start lease clearing",
  });
  assert.equal(harness.activeTools.includes("vault_insert"), true);

  await harness.runEvent("session_start");
  const status = await executeToolbox(toolbox, { action: "status" });

  assert.equal(harness.activeTools.includes("vault_insert"), false);
  assert.match(status.content[0].text, /active leases \(0\): none/);
  assert.match(status.content[0].text, /recent lazy imports \(0\): none/);
});

test("toolbox TTL expires unpinned activations on later turns", async () => {
  const harness = createHarness();
  const toolbox = harness.tools.get("toolbox");

  await executeToolbox(toolbox, {
    action: "activate",
    tools: ["vault_insert"],
    ttlTurns: 1,
    riskAcknowledged: true,
    riskJustification: "test explicit mutating ttl expiration",
  });
  assert.equal(harness.activeTools.includes("vault_insert"), true);

  await harness.runEvent("turn_start");

  assert.equal(harness.activeTools.includes("vault_insert"), false);
});

test("toolbox activation does not keep owner auto-activated tools outside the requested profile", async () => {
  const moduleSource = `export default function(pi) {
    for (const name of ["lazy_profile_read", "lazy_profile_mutating"]) {
      pi.registerTool({
        name,
        label: name,
        description: "Registered by a lazy toolbox import",
        parameters: { type: "object", additionalProperties: false, properties: {} },
        async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; }
      });
    }
  }`;
  const bundle = {
    id: "lazy-profile-test",
    title: "Lazy profile test bundle",
    description: "Test-only lazy import bundle with extra registered tools",
    ownerPackage: "test",
    ownerSemantics: "test-only",
    keywords: ["lazy-profile-test"],
    lazyModules: [
      {
        specifier: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
        label: "test module",
      },
    ],
    profiles: [
      {
        id: "read",
        description: "Read profile",
        tools: ["lazy_profile_read"],
        risk: "read",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description: "Mutating profile",
        tools: ["lazy_profile_mutating"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  };
  CATALOG.push(bundle);

  try {
    const harness = createHarness({ autoActivateRegisteredTools: true });
    const toolbox = harness.tools.get("toolbox");

    const result = await executeToolbox(toolbox, {
      action: "activate",
      bundle: "lazy-profile-test",
      profile: "read",
    });

    assert.match(result.content[0].text, /Activated tools: lazy_profile_read/);
    assert.equal(harness.activeTools.includes("lazy_profile_read"), true);
    assert.equal(harness.activeTools.includes("lazy_profile_mutating"), false);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
  }
});

test("toolbox re-invokes lazy owner bundles for profile upgrades", async () => {
  const callKey = `__toolbox_profile_calls_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const moduleSource = `export default function(pi, context) {
    globalThis[${JSON.stringify(callKey)}] = globalThis[${JSON.stringify(callKey)}] || [];
    globalThis[${JSON.stringify(callKey)}].push(context.profile);
    pi.registerTool({
      name: context.profile === "mutating" ? "lazy_upgrade_write" : "lazy_upgrade_read",
      label: "Lazy Upgrade Tool",
      description: "Registered by profile-specific lazy toolbox import",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; }
    });
  }`;
  const bundle = {
    id: "lazy-upgrade-test",
    title: "Lazy upgrade test bundle",
    description: "Test-only profile upgrade lazy import bundle",
    ownerPackage: "test",
    ownerSemantics: "test-only",
    keywords: ["lazy-upgrade-test"],
    lazyModules: [
      {
        specifier: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
        label: "test module",
      },
    ],
    profiles: [
      {
        id: "read",
        description: "Read profile",
        tools: ["lazy_upgrade_read"],
        risk: "read",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description: "Mutating profile",
        tools: ["lazy_upgrade_write"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  };
  CATALOG.push(bundle);

  try {
    const harness = createHarness();
    const toolbox = harness.tools.get("toolbox");

    await executeToolbox(toolbox, {
      action: "activate",
      bundle: "lazy-upgrade-test",
      profile: "read",
    });
    await executeToolbox(toolbox, {
      action: "activate",
      bundle: "lazy-upgrade-test",
      profile: "mutating",
      riskAcknowledged: true,
      riskJustification: "test profile upgrade invocation",
    });

    assert.deepEqual(globalThis[callKey], ["read", "mutating"]);
    assert.equal(harness.activeTools.includes("lazy_upgrade_write"), true);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
    delete globalThis[callKey];
  }
});

test("toolbox activation restores pre-import active tools when lazy import is incomplete", async () => {
  const moduleSource = `export default function(pi) {
    for (const name of ["lazy_partial_registered", "lazy_partial_extra"]) {
      pi.registerTool({
        name,
        label: name,
        description: "Registered by a partial lazy toolbox import",
        parameters: { type: "object", additionalProperties: false, properties: {} },
        async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; }
      });
    }
  }`;
  const bundle = {
    id: "lazy-partial-test",
    title: "Lazy partial test bundle",
    description: "Test-only incomplete lazy import bundle",
    ownerPackage: "test",
    ownerSemantics: "test-only",
    keywords: ["lazy-partial-test"],
    lazyModules: [
      {
        specifier: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
        label: "test module",
      },
    ],
    profiles: [
      {
        id: "default",
        description: "Default partial profile",
        tools: ["lazy_partial_registered", "lazy_partial_missing"],
        risk: "read",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: false,
      },
    ],
  };
  CATALOG.push(bundle);

  try {
    const harness = createHarness({ autoActivateRegisteredTools: true });
    const toolbox = harness.tools.get("toolbox");

    const result = await executeToolbox(toolbox, {
      action: "activate",
      bundle: "lazy-partial-test",
    });

    assert.match(result.content[0].text, /missing registered tools after lazy import/);
    assert.match(result.content[0].text, /Restored active tools to the pre-import baseline/);
    assert.equal(result.details.ok, false);
    assert.deepEqual(result.details.missing, ["lazy_partial_missing"]);
    assert.deepEqual(harness.activeTools, ALWAYS_ACTIVE_TOOLS);

    const doctor = await executeToolbox(toolbox, { action: "doctor" });
    assert.match(doctor.content[0].text, /partial lazy imports \(1\): lazy-partial-test\/default/);
    assert.equal(doctor.details.ok, false);
    assert.deepEqual(doctor.details.partialLazyImports, [
      "lazy-partial-test/default: lazy_partial_registered (partial registration: lazy_partial_registered)",
    ]);
  } finally {
    CATALOG.splice(CATALOG.indexOf(bundle), 1);
  }
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
