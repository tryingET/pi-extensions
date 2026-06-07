import type { ResolvedSubagentModelSelection } from "./subagent-model-selection.ts";
import type { SubagentModelProviderResult } from "./subagent-runtime-types.ts";

export function normalizeModelProviderResult(
  result: SubagentModelProviderResult,
): ResolvedSubagentModelSelection {
  if (typeof result === "string") {
    const model = result.trim();
    if (model.length === 0) {
      throw new Error("model provider returned an empty model string");
    }

    return {
      requestedModel: model,
      effectiveModel: model,
      source: "custom",
    };
  }

  const effectiveModel = result.effectiveModel.trim();
  const requestedModel = (result.requestedModel ?? effectiveModel).trim();

  if (effectiveModel.length === 0) {
    throw new Error("model provider returned an empty effective model string");
  }

  if (requestedModel.length === 0) {
    throw new Error("model provider returned an empty requested model string");
  }

  return {
    requestedModel,
    effectiveModel,
    source: result.source,
    warning: result.warning,
  };
}
