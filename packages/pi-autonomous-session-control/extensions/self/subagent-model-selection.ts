export const DEFAULT_SUBAGENT_MODEL = "openai-codex/gpt-5.4";

export type SubagentModelSelectionSource = "env_override" | "session" | "default" | "custom";

export interface ResolvedSubagentModelSelection {
  requestedModel: string;
  effectiveModel: string;
  source: SubagentModelSelectionSource;
  warning?: string;
}

export function resolveSubagentModelSelection(ctx?: {
  model?: {
    provider?: unknown;
    id?: unknown;
  };
}): ResolvedSubagentModelSelection {
  const fromEnv = process.env.PI_SUBAGENT_MODEL?.trim();
  if (fromEnv) {
    return normalizeSubagentModelForChild(fromEnv, "env_override");
  }

  const provider = typeof ctx?.model?.provider === "string" ? ctx.model.provider.trim() : "";
  const modelId = typeof ctx?.model?.id === "string" ? ctx.model.id.trim() : "";
  if (provider.length > 0 && modelId.length > 0) {
    return normalizeSubagentModelForChild(`${provider}/${modelId}`, "session");
  }

  return normalizeSubagentModelForChild(DEFAULT_SUBAGENT_MODEL, "default");
}

export function resolveSubagentModel(ctx?: {
  model?: {
    provider?: unknown;
    id?: unknown;
  };
}): string {
  return resolveSubagentModelSelection(ctx).effectiveModel;
}

function normalizeSubagentModelForChild(
  requestedModel: string,
  source: SubagentModelSelectionSource,
): ResolvedSubagentModelSelection {
  const trimmedRequestedModel = requestedModel.trim();
  return {
    requestedModel: trimmedRequestedModel,
    effectiveModel: trimmedRequestedModel,
    source,
  };
}
