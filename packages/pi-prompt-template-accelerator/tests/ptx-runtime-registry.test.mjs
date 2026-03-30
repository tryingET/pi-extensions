import assert from "node:assert/strict";
import test from "node:test";
import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
import { resetGlobalRuntimeRegistry } from "../../pi-interaction/pi-runtime-registry/src/runtimeRegistry.js";
import {
  createInitialPtxModelLifecycleState,
  getPtxModelLifecycleAccessor,
  getPtxPromptTemplateAccessor,
  observePtxModelSelection,
  PTX_CAPABILITIES,
  PTX_REGISTRY_OWNER,
  PTX_RUNTIME_IDS,
  registerPtxCapabilityBridges,
  unregisterPtxCapabilityBridges,
} from "../src/ptxRuntimeRegistry.js";

test("registerPtxCapabilityBridges exposes prompt-template ownership and observed model lifecycle", () => {
  resetGlobalRuntimeRegistry();

  const commands = [
    {
      name: "implementation-planning",
      source: "prompt",
      description: "Draft an implementation plan",
      path: "/tmp/implementation-planning.md",
    },
    {
      name: "missing-path",
      source: "prompt",
      description: "Prompt command without template path",
    },
    {
      name: "vault",
      source: "extension",
      description: "Vault command",
    },
  ];

  let liveTriggerState = {
    status: "registered",
    reason: "registered",
  };
  let modelLifecycleState = createInitialPtxModelLifecycleState();

  registerPtxCapabilityBridges({
    getCommands: () => commands,
    getLiveTriggerState: () => liveTriggerState,
    getModelLifecycleState: () => modelLifecycleState,
  });

  const registry = getGlobalRuntimeRegistry();

  const promptEntry = registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES);
  assert.ok(promptEntry);
  assert.deepEqual(
    promptEntry?.capabilities.map((capability) => capability.id),
    [PTX_CAPABILITIES.PROMPT_TEMPLATES],
  );

  const modelEntry = registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE);
  assert.ok(modelEntry);
  assert.deepEqual(
    modelEntry?.capabilities.map((capability) => capability.id),
    [PTX_CAPABILITIES.MODEL_LIFECYCLE],
  );

  assert.equal(registry.findByCapability(PTX_CAPABILITIES.PROMPT_TEMPLATES).length, 1);
  assert.equal(registry.findByCapability(PTX_CAPABILITIES.MODEL_LIFECYCLE).length, 1);

  const promptAccessor = getPtxPromptTemplateAccessor();
  assert.ok(promptAccessor);
  assert.equal(promptAccessor?.listPromptCommands().length, 2);
  assert.equal(promptAccessor?.listPrefillablePromptCommands().length, 1);
  assert.equal(promptAccessor?.getRuntimeState().promptCommandCount, 2);
  assert.equal(promptAccessor?.getRuntimeState().prefillablePromptCommandCount, 1);
  assert.equal(promptAccessor?.getRuntimeState().liveTrigger.status, "registered");
  assert.equal(promptAccessor?.getRuntimeState().usesSelectedModelForPrefill, false);
  assert.match(promptAccessor?.describeOwnership().owns.join(" ") ?? "", /deterministic/i);
  assert.match(promptAccessor?.describeOwnership().excludes.join(" ") ?? "", /vault/i);

  const modelAccessor = getPtxModelLifecycleAccessor();
  assert.ok(modelAccessor);
  assert.equal(modelAccessor?.getSelectedModelId(), null);
  assert.equal(modelAccessor?.getLifecycleState().selectionCount, 0);
  assert.equal(modelAccessor?.getLifecycleState().usesSelectedModelForPrefill, false);
  assert.match(modelAccessor?.describePolicy().notes.join(" ") ?? "", /does not currently use the active model/i);

  modelLifecycleState = observePtxModelSelection(modelLifecycleState, {
    id: "openai/gpt-5.3-codex",
    provider: "openai",
    label: "GPT-5.3 Codex",
  });

  assert.equal(modelAccessor?.getSelectedModelId(), "openai/gpt-5.3-codex");
  assert.equal(modelAccessor?.getSelectedModel()?.provider, "openai");
  assert.equal(modelAccessor?.getLifecycleState().selectionCount, 1);

  liveTriggerState = {
    status: "unavailable",
    reason: "trigger-surface-unavailable",
  };
  assert.equal(promptAccessor?.getRuntimeState().liveTrigger.reason, "trigger-surface-unavailable");
});

test("registerPtxCapabilityBridges supports sourceInfo-only prompt command metadata", () => {
  resetGlobalRuntimeRegistry();

  registerPtxCapabilityBridges({
    getCommands: () => [
      {
        name: "implementation-planning",
        description: "Draft an implementation plan",
        sourceInfo: {
          source: "prompt",
          path: "/tmp/implementation-planning.md",
        },
      },
      {
        name: "vault",
        description: "Vault command",
        sourceInfo: {
          source: "extension",
        },
      },
    ],
    getLiveTriggerState: () => ({ status: "registered", reason: "registered" }),
    getModelLifecycleState: () => createInitialPtxModelLifecycleState(),
  });

  const promptAccessor = getPtxPromptTemplateAccessor();
  assert.ok(promptAccessor);
  assert.equal(promptAccessor?.listPromptCommands().length, 1);
  assert.equal(promptAccessor?.listPromptCommands()[0].path, "/tmp/implementation-planning.md");
  assert.equal(promptAccessor?.listPrefillablePromptCommands().length, 1);

  unregisterPtxCapabilityBridges();
});

test("unregisterPtxCapabilityBridges removes PTX registry entries", () => {
  resetGlobalRuntimeRegistry();

  registerPtxCapabilityBridges({
    getCommands: () => [],
    getLiveTriggerState: () => ({ status: "pending", reason: "initializing" }),
    getModelLifecycleState: () => createInitialPtxModelLifecycleState(),
  });

  unregisterPtxCapabilityBridges();

  const registry = getGlobalRuntimeRegistry();
  assert.equal(registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES), undefined);
  assert.equal(registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE), undefined);
});
