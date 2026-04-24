import {
  modelSelectionInternals,
  PREFERRED_PROVIDERS,
  parseModelSpecList,
  parseProviderModel,
  resolveModelAuth,
  resolveModelReference,
  selectModelCandidate,
} from "@tryinget/pi-model-selection";

export {
  parseModelSpecList,
  parseProviderModel,
  resolveModelAuth,
  resolveModelReference,
  selectModelCandidate,
};

const CURRENT_PRESET_SENTINEL = "current";
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

const { getModelCandidates, modelDisplayRef, modelSpecMatches, orderMatchesByProviderPreference } =
  modelSelectionInternals;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeLookupKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeThinkingLevel(value) {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized && THINKING_LEVELS.has(normalized) ? normalized : undefined;
}

export function toReasoningLevel(level) {
  const normalized = normalizeThinkingLevel(level);
  return normalized && normalized !== "off" ? normalized : undefined;
}

export function getEffectiveThinkingLevel(branchEntries = []) {
  let thinkingLevel = "off";

  for (const entry of Array.isArray(branchEntries) ? branchEntries : []) {
    if (entry?.type !== "thinking_level_change") continue;
    const parsed = normalizeThinkingLevel(entry.thinkingLevel);
    if (parsed) thinkingLevel = parsed;
  }

  return thinkingLevel;
}

function normalizePresetKey(value) {
  return normalizeLookupKey(value);
}

export function resolvePresetMatch(presets = {}, query = "") {
  const trimmedQuery = normalizeText(query);
  if (!trimmedQuery || !isObject(presets)) {
    return { kind: "unmatched" };
  }

  const presetNames = Object.keys(presets);
  const exactCaseSensitive = presetNames.filter((name) => name === trimmedQuery);
  if (exactCaseSensitive.length === 1) {
    return {
      kind: "matched",
      name: exactCaseSensitive[0],
      preset: presets[exactCaseSensitive[0]],
    };
  }

  let sawAmbiguity = exactCaseSensitive.length > 1;
  const lowerQuery = trimmedQuery.toLowerCase();

  const exactCaseInsensitive = presetNames.filter((name) => name.toLowerCase() === lowerQuery);
  if (exactCaseInsensitive.length === 1) {
    return {
      kind: "matched",
      name: exactCaseInsensitive[0],
      preset: presets[exactCaseInsensitive[0]],
    };
  }
  sawAmbiguity ||= exactCaseInsensitive.length > 1;

  const prefixMatches = presetNames.filter((name) => name.toLowerCase().startsWith(lowerQuery));
  if (prefixMatches.length === 1) {
    return {
      kind: "matched",
      name: prefixMatches[0],
      preset: presets[prefixMatches[0]],
    };
  }
  sawAmbiguity ||= prefixMatches.length > 1;

  const normalizedQuery = normalizePresetKey(trimmedQuery);
  const substringMatches = normalizedQuery
    ? presetNames.filter((name) => normalizePresetKey(name).includes(normalizedQuery))
    : [];
  if (substringMatches.length === 1) {
    return {
      kind: "matched",
      name: substringMatches[0],
      preset: presets[substringMatches[0]],
    };
  }
  sawAmbiguity ||= substringMatches.length > 1;

  return { kind: sawAmbiguity ? "ambiguous" : "unmatched" };
}

function validatePresetConfig(presetName, preset) {
  if (!isObject(preset)) {
    throw new Error(`Preset '${presetName}' must be an object`);
  }
  if (!normalizeText(preset.model)) {
    throw new Error(`Preset '${presetName}' must define a model`);
  }

  const modelSpecs = parseModelSpecList(preset.model);
  const thinkingLevels = normalizeThinkingLevels(presetName, preset.thinkingLevel);
  if (
    thinkingLevels &&
    thinkingLevels.length !== 1 &&
    thinkingLevels.length !== modelSpecs.length
  ) {
    throw new Error(
      `Preset '${presetName}' thinkingLevel list must contain one level or match the number of model specs`,
    );
  }

  return {
    model: modelSpecs.join(", "),
    modelSpecs,
    thinkingLevels,
  };
}

function normalizeThinkingLevels(presetName, value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Preset '${presetName}' has invalid thinkingLevel '${value}'`);
  }

  const levels = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (levels.length === 0) {
    throw new Error(`Preset '${presetName}' has empty thinkingLevel`);
  }

  const normalized = levels.map((level) => normalizeThinkingLevel(level));
  const invalidIndex = normalized.findIndex((level) => !level);
  if (invalidIndex >= 0) {
    throw new Error(`Preset '${presetName}' has invalid thinkingLevel '${levels[invalidIndex]}'`);
  }

  return normalized;
}

function resolveRequestedPreset(config = {}, presetQuery) {
  const presets = isObject(config.presets) ? config.presets : {};
  const query =
    normalizeText(presetQuery) ?? normalizeText(config.defaultPreset) ?? CURRENT_PRESET_SENTINEL;

  if (query === CURRENT_PRESET_SENTINEL) {
    return { kind: "current" };
  }

  const match = resolvePresetMatch(presets, query);
  if (match.kind === "ambiguous") {
    throw new Error(`Preset '${query}' is ambiguous`);
  }
  if (match.kind !== "matched" || !match.name || !match.preset) {
    throw new Error(`Preset '${query}' was not found`);
  }

  return {
    kind: "preset",
    name: match.name,
    preset: validatePresetConfig(match.name, match.preset),
  };
}

async function attachAuth(ctx, model) {
  const auth = await resolveModelAuth(ctx, model);
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  return auth;
}

function thinkingLevelForSelectedSpec(preset, selectedModel) {
  if (!preset.thinkingLevels) return undefined;
  if (preset.thinkingLevels.length === 1) return preset.thinkingLevels[0];

  const selectedIndex = preset.modelSpecs.findIndex((spec) =>
    modelSpecMatches(spec, selectedModel),
  );
  return selectedIndex >= 0 ? preset.thinkingLevels[selectedIndex] : preset.thinkingLevels[0];
}

export async function resolveSummarizerModel(ctx, options = {}) {
  const requested = resolveRequestedPreset(options.config, options.presetQuery);
  const warnings = [];

  if (requested.kind === "current") {
    if (!ctx?.model) {
      throw new Error("No active session model is available for compaction");
    }

    const auth = await attachAuth(ctx, ctx.model);
    const effectiveThinkingLevel = getEffectiveThinkingLevel(options.branchEntries);
    return {
      source: "current",
      model: ctx.model,
      apiKey: auth.apiKey,
      headers: auth.headers,
      reasoningLevel: ctx.model.reasoning ? effectiveThinkingLevel : undefined,
      warnings,
    };
  }

  const selected = await selectModelCandidate(requested.preset.modelSpecs, ctx?.model, ctx);
  if (!selected) {
    throw new Error(`No available model from: ${requested.preset.modelSpecs.join(", ")}`);
  }

  const reasoningLevel = toReasoningLevel(
    thinkingLevelForSelectedSpec(requested.preset, selected.model),
  );
  if (reasoningLevel && !selected.model.reasoning) {
    throw new Error(
      `Preset '${requested.name}' requires reasoning level '${reasoningLevel}' but ${modelDisplayRef(selected.model)} does not support reasoning`,
    );
  }

  const auth = await attachAuth(ctx, selected.model);
  return {
    source: "preset",
    presetName: requested.name,
    model: selected.model,
    alreadyActive: selected.alreadyActive,
    apiKey: auth.apiKey,
    headers: auth.headers,
    reasoningLevel,
    warnings,
  };
}

export const modelResolverInternals = {
  CURRENT_PRESET_SENTINEL,
  PREFERRED_PROVIDERS,
  getModelCandidates,
  modelDisplayRef,
  modelSpecMatches,
  orderMatchesByProviderPreference,
};
