import assert from "node:assert/strict";
import test from "node:test";
import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
import { resetBroker } from "@tryinget/pi-trigger-adapter";
import { resetGlobalRuntimeRegistry } from "../../pi-interaction/pi-runtime-registry/src/runtimeRegistry.js";
import ptxExtension from "../extensions/ptx.ts";
import {
  getPtxModelLifecycleAccessor,
  getPtxPromptTemplateAccessor,
  PTX_REGISTRY_OWNER,
  PTX_RUNTIME_IDS,
} from "../src/ptxRuntimeRegistry.js";

test("ptxExtension registers runtime ownership, tracks model_select, and unregisters on shutdown", async () => {
  resetGlobalRuntimeRegistry();
  resetBroker();

  const handlers = new Map<string, Array<(event?: any, ctx?: any) => unknown>>();
  const commands = [
    {
      name: "implementation-planning",
      source: "prompt",
      description: "Draft an implementation plan",
      path: "/tmp/implementation-planning.md",
    },
  ];

  const pi = {
    on(eventName: string, handler: (event?: any, ctx?: any) => unknown) {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler);
      handlers.set(eventName, existing);
    },
    registerCommand() {
      // Not needed for runtime registry verification.
    },
    getCommands() {
      return commands;
    },
    async exec() {
      return { code: 1, stdout: "", stderr: "" };
    },
  };

  ptxExtension(pi as any);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const promptAccessor = getPtxPromptTemplateAccessor();
  assert.ok(promptAccessor);
  assert.equal(promptAccessor?.getRuntimeState().promptCommandCount, 1);

  const modelAccessor = getPtxModelLifecycleAccessor();
  assert.ok(modelAccessor);
  assert.equal(modelAccessor?.getSelectedModelId(), null);

  const modelSelectHandlers = handlers.get("model_select") ?? [];
  assert.equal(modelSelectHandlers.length, 1);
  modelSelectHandlers[0]({ model: { id: "openai/gpt-5.3-codex-spark", provider: "openai" } });

  assert.equal(modelAccessor?.getSelectedModelId(), "openai/gpt-5.3-codex-spark");
  assert.equal(modelAccessor?.getSelectedModel()?.provider, "openai");
  assert.equal(modelAccessor?.getLifecycleState().selectionCount, 1);

  const sessionShutdownHandlers = handlers.get("session_shutdown") ?? [];
  assert.equal(sessionShutdownHandlers.length, 1);
  sessionShutdownHandlers[0]();

  const registry = getGlobalRuntimeRegistry();
  assert.equal(registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES), undefined);
  assert.equal(registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE), undefined);

  resetBroker();
});
