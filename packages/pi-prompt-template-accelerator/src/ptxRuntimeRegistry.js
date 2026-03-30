/**
 * PTX runtime registry integration.
 *
 * Registers prompt-template runtime ownership and observed model lifecycle state
 * in the shared global runtime registry so other extensions can discover what
 * PTX owns without assuming PTX already uses the active model for slot filling.
 */

import { getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";
import { getCommandPath, getCommandSource } from "./commandProvenance.js";

/** Capability IDs exposed by the PTX runtime registry bridge */
export const PTX_CAPABILITIES = {
  PROMPT_TEMPLATES: "ptx:prompt-templates",
  MODEL_LIFECYCLE: "ptx:model-lifecycle",
};

/** Owner ID for PTX runtime registry registrations */
export const PTX_REGISTRY_OWNER = "pi-prompt-template-accelerator";

/** Runtime IDs for PTX registry bridge components */
export const PTX_RUNTIME_IDS = {
  PROMPT_TEMPLATES: "prompt-template-runtime",
  MODEL_LIFECYCLE: "model-lifecycle",
};

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePromptCommand(command) {
  const name = normalizeText(command?.name);
  if (!name) return null;
  const path = getCommandPath(command);

  return {
    name,
    description: normalizeText(command?.description),
    path: path ?? null,
    prefillable: Boolean(path),
  };
}

function listPromptCommands(getCommands) {
  const commands = typeof getCommands === "function" ? getCommands() : [];
  if (!Array.isArray(commands)) return [];

  return commands
    .filter((command) => command && getCommandSource(command) === "prompt")
    .map(normalizePromptCommand)
    .filter(Boolean);
}

function normalizeLiveTriggerState(value) {
  const status = normalizeText(value?.status) ?? "pending";
  return {
    status,
    reason: normalizeText(value?.reason) ?? (status === "pending" ? "initializing" : undefined),
  };
}

function normalizeModelDescriptor(model) {
  if (!model || typeof model !== "object") return null;

  const descriptor = {
    id: normalizeText(model.id) ?? null,
    provider: normalizeText(model.provider) ?? null,
    label: normalizeText(model.label) ?? normalizeText(model.name) ?? null,
  };

  if (!descriptor.id && !descriptor.provider && !descriptor.label) return null;
  return descriptor;
}

export function createInitialPtxModelLifecycleState() {
  return {
    selectedModelId: null,
    selectedModel: null,
    selectionCount: 0,
    lastSelectedAt: null,
    usesSelectedModelForPrefill: false,
    suggestionMode: "deterministic-only",
  };
}

export function observePtxModelSelection(previousState, model) {
  const normalizedModel = normalizeModelDescriptor(model);

  return {
    selectedModelId: normalizedModel?.id ?? null,
    selectedModel: normalizedModel,
    selectionCount: Number(previousState?.selectionCount ?? 0) + 1,
    lastSelectedAt: new Date().toISOString(),
    usesSelectedModelForPrefill: false,
    suggestionMode: "deterministic-only",
  };
}

export function createPtxPromptTemplateAccessor(options) {
  const { getCommands, getLiveTriggerState, getModelLifecycleState } = options;

  return {
    listPromptCommands() {
      return listPromptCommands(getCommands);
    },
    listPrefillablePromptCommands() {
      return listPromptCommands(getCommands).filter((command) => command.prefillable);
    },
    getRuntimeState() {
      const promptCommands = listPromptCommands(getCommands);
      const liveTrigger = normalizeLiveTriggerState(
        typeof getLiveTriggerState === "function" ? getLiveTriggerState() : undefined,
      );
      const modelLifecycle =
        typeof getModelLifecycleState === "function"
          ? getModelLifecycleState()
          : createInitialPtxModelLifecycleState();

      return {
        owner: PTX_REGISTRY_OWNER,
        suggestionMode: "deterministic-only",
        usesSelectedModelForPrefill: false,
        promptCommandCount: promptCommands.length,
        prefillablePromptCommandCount: promptCommands.filter((command) => command.prefillable).length,
        liveTrigger,
        modelLifecycle,
      };
    },
    describeOwnership() {
      return {
        owner: PTX_REGISTRY_OWNER,
        owns: [
          "Prompt-template picker routing for $$ /...",
          "Deterministic prompt-template transform planning",
          "Prompt-command prefill diagnostics",
        ],
        excludes: [
          "Full /vault template browsing and retrieval",
          "LLM-backed slot filling",
          "Non-exported Prompt Vault template execution",
        ],
      };
    },
  };
}

export function createPtxModelLifecycleAccessor(options) {
  const { getModelLifecycleState } = options;

  return {
    getSelectedModelId() {
      return this.getLifecycleState().selectedModelId;
    },
    getSelectedModel() {
      return this.getLifecycleState().selectedModel;
    },
    getLifecycleState() {
      const state =
        typeof getModelLifecycleState === "function"
          ? getModelLifecycleState()
          : createInitialPtxModelLifecycleState();

      return {
        ...createInitialPtxModelLifecycleState(),
        ...(state && typeof state === "object" ? state : {}),
        usesSelectedModelForPrefill: false,
        suggestionMode: "deterministic-only",
      };
    },
    describePolicy() {
      return {
        suggestionMode: "deterministic-only",
        usesSelectedModelForPrefill: false,
        notes: [
          "PTX observes model_select events for runtime introspection only.",
          "PTX does not currently use the active model to generate slot suggestions.",
        ],
      };
    },
  };
}

export function registerPtxCapabilityBridges(options) {
  const registry = getGlobalRuntimeRegistry();
  const { getCommands, getLiveTriggerState, getModelLifecycleState } = options;

  const promptTemplateAccessor = createPtxPromptTemplateAccessor({
    getCommands,
    getLiveTriggerState,
    getModelLifecycleState,
  });
  registry.register(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES, promptTemplateAccessor, [
    {
      id: PTX_CAPABILITIES.PROMPT_TEMPLATES,
      description: "Prompt-template picker ownership and deterministic prefill runtime",
      metadata: {
        surfaces: ["$$ /...", "/ptx-select", "/ptx-debug-commands"],
        suggestionMode: "deterministic-only",
      },
    },
  ]);

  const modelLifecycleAccessor = createPtxModelLifecycleAccessor({ getModelLifecycleState });
  registry.register(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE, modelLifecycleAccessor, [
    {
      id: PTX_CAPABILITIES.MODEL_LIFECYCLE,
      description: "Observed model lifecycle state for PTX runtime introspection",
      metadata: {
        eventSource: "model_select",
        usesSelectedModelForPrefill: false,
      },
    },
  ]);
}

export function unregisterPtxCapabilityBridges() {
  const registry = getGlobalRuntimeRegistry();
  registry.unregister(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES);
  registry.unregister(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE);
}

export function getPtxPromptTemplateAccessor() {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.PROMPT_TEMPLATES);
  return entry?.instance;
}

export function getPtxModelLifecycleAccessor() {
  const registry = getGlobalRuntimeRegistry();
  const entry = registry.get(PTX_REGISTRY_OWNER, PTX_RUNTIME_IDS.MODEL_LIFECYCLE);
  return entry?.instance;
}
