export interface PtxNormalizedPromptCommand {
  name: string;
  description?: string;
  path: string | null;
  prefillable: boolean;
}

export interface PtxLiveTriggerState {
  status: string;
  reason?: string;
}

export interface PtxModelDescriptor {
  id: string | null;
  provider: string | null;
  label: string | null;
}

export interface PtxModelLifecycleState {
  selectedModelId: string | null;
  selectedModel: PtxModelDescriptor | null;
  selectionCount: number;
  lastSelectedAt: string | null;
  usesSelectedModelForPrefill: boolean;
  suggestionMode: string;
}

export interface PtxPromptTemplateAccessor {
  listPromptCommands(): PtxNormalizedPromptCommand[];
  listPrefillablePromptCommands(): PtxNormalizedPromptCommand[];
  getRuntimeState(): {
    owner: string;
    suggestionMode: string;
    usesSelectedModelForPrefill: boolean;
    promptCommandCount: number;
    prefillablePromptCommandCount: number;
    liveTrigger: PtxLiveTriggerState;
    modelLifecycle: PtxModelLifecycleState;
  };
  describeOwnership(): {
    owner: string;
    owns: string[];
    excludes: string[];
  };
}

export interface PtxModelLifecycleAccessor {
  getSelectedModelId(): string | null;
  getSelectedModel(): PtxModelDescriptor | null;
  getLifecycleState(): PtxModelLifecycleState;
  describePolicy(): {
    suggestionMode: string;
    usesSelectedModelForPrefill: boolean;
    notes: string[];
  };
}

export const PTX_CAPABILITIES: {
  readonly PROMPT_TEMPLATES: "ptx:prompt-templates";
  readonly MODEL_LIFECYCLE: "ptx:model-lifecycle";
};

export const PTX_REGISTRY_OWNER: "pi-prompt-template-accelerator";

export const PTX_RUNTIME_IDS: {
  readonly PROMPT_TEMPLATES: "prompt-template-runtime";
  readonly MODEL_LIFECYCLE: "model-lifecycle";
};

export function createInitialPtxModelLifecycleState(): PtxModelLifecycleState;
export function observePtxModelSelection(
  previousState: PtxModelLifecycleState | null | undefined,
  model: unknown,
): PtxModelLifecycleState;
export function registerPtxCapabilityBridges(options: {
  getCommands?: () => readonly unknown[];
  getLiveTriggerState?: () => unknown;
  getModelLifecycleState?: () => PtxModelLifecycleState;
}): void;
export function unregisterPtxCapabilityBridges(): void;
export function getPtxPromptTemplateAccessor(): PtxPromptTemplateAccessor | undefined;
export function getPtxModelLifecycleAccessor(): PtxModelLifecycleAccessor | undefined;
