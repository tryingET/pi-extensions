// ---
// summary: parses model references and selects authenticated candidates with provider-aware fallback ordering.
// read_when:
//   - changing model resolution, authentication compatibility, or fallback selection behavior.
// ---
export const PREFERRED_PROVIDERS = ["openai-codex", "anthropic", "github-copilot", "openrouter"];

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getModelRegistryModels(modelRegistry) {
  if (typeof modelRegistry?.getAll !== "function") return [];
  const models = modelRegistry.getAll();
  return Array.isArray(models) ? models.filter(Boolean) : [];
}

function getAvailableRegistryModels(modelRegistry) {
  if (typeof modelRegistry?.getAvailable !== "function") return undefined;
  const models = modelRegistry.getAvailable();
  return Array.isArray(models) ? models.filter(Boolean) : undefined;
}

function modelProvider(model) {
  return normalizeText(model?.provider);
}

function modelId(model) {
  return normalizeText(model?.id);
}

function modelDisplayRef(model) {
  const provider = modelProvider(model);
  const id = modelId(model);
  if (provider && id) return `${provider}/${id}`;
  return id ?? provider ?? "<unknown-model>";
}

function sameModel(a, b) {
  return Boolean(a && b && modelProvider(a) === modelProvider(b) && modelId(a) === modelId(b));
}

function modelSpecMatches(modelSpec, model) {
  const spec = normalizeText(modelSpec);
  if (!spec || !model) return false;

  const slashIndex = spec.indexOf("/");
  if (slashIndex !== -1) {
    const provider = spec.slice(0, slashIndex);
    const id = spec.slice(slashIndex + 1);
    return provider === modelProvider(model) && id === modelId(model);
  }

  return spec === modelId(model);
}

function orderMatchesByProviderPreference(models) {
  const prioritized = [];
  const seen = new Set();

  for (const provider of PREFERRED_PROVIDERS) {
    for (const model of models) {
      const key = modelDisplayRef(model);
      if (modelProvider(model) === provider && !seen.has(key)) {
        prioritized.push(model);
        seen.add(key);
      }
    }
  }

  for (const model of models) {
    const key = modelDisplayRef(model);
    if (!seen.has(key)) {
      prioritized.push(model);
      seen.add(key);
    }
  }

  return prioritized;
}

function isValidModelSelectionSpec(spec) {
  if (!spec || spec.includes("*") || /\s/.test(spec)) return false;

  const segments = spec.split("/");
  if (segments.length === 1) return true;
  if (segments.length !== 2) return false;
  return segments[0].length > 0 && segments[1].length > 0;
}

export function parseProviderModel(value) {
  const raw = normalizeText(value);
  if (!raw) {
    throw new Error("Invalid model reference: expected provider/modelId");
  }

  const separatorIndex = raw.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    throw new Error(`Invalid model reference '${raw}'. Expected provider/modelId`);
  }

  const provider = raw.slice(0, separatorIndex).trim();
  const modelId = raw.slice(separatorIndex + 1).trim();
  if (!provider || !modelId || modelId.includes("/")) {
    throw new Error(`Invalid model reference '${raw}'. Expected provider/modelId`);
  }

  return { provider, modelId };
}

export function parseModelSpecList(value) {
  const raw = normalizeText(value);
  if (!raw) {
    throw new Error("Model spec list must be a non-empty string");
  }

  const specs = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (specs.length === 0) {
    throw new Error("Model spec list must contain at least one model");
  }

  const invalidSpec = specs.find((spec) => !isValidModelSelectionSpec(spec));
  if (invalidSpec) {
    throw new Error(`Invalid model spec '${invalidSpec}'. Expected modelId or provider/modelId`);
  }

  return specs;
}

function getModelCandidates(modelSpec, registry) {
  const spec = normalizeText(modelSpec);
  if (!spec) return [];

  const slashIndex = spec.indexOf("/");
  if (slashIndex !== -1) {
    let parsed;
    try {
      parsed = parseProviderModel(spec);
    } catch {
      return [];
    }

    if (typeof registry?.find === "function") {
      const found = registry.find(parsed.provider, parsed.modelId);
      return found ? [found] : [];
    }

    return getModelRegistryModels(registry).filter(
      (model) => modelProvider(model) === parsed.provider && modelId(model) === parsed.modelId,
    );
  }

  const allMatches = getModelRegistryModels(registry).filter((model) => modelId(model) === spec);
  if (allMatches.length <= 1) return allMatches;
  return orderMatchesByProviderPreference(allMatches);
}

export async function resolveModelAuth(ctx, model) {
  const registry = ctx?.modelRegistry;

  if (typeof registry?.getApiKeyAndHeaders === "function") {
    const result = await registry.getApiKeyAndHeaders(model);
    if (result?.ok === false) return result;
    return {
      ok: true,
      apiKey: result?.apiKey,
      headers: result?.headers ?? model?.headers,
      ...(result?.env ? { env: result.env } : {}),
    };
  }

  if (typeof registry?.getApiKey === "function") {
    const apiKey = await registry.getApiKey(model);
    return {
      ok: true,
      apiKey,
      headers: model?.headers,
    };
  }

  return {
    ok: false,
    error: "Model registry does not expose getApiKeyAndHeaders or getApiKey",
  };
}

async function hasUsableAuth(model, ctx) {
  const registry = ctx?.modelRegistry;
  const availableModels = getAvailableRegistryModels(registry);
  if (availableModels?.some((candidate) => sameModel(candidate, model))) return true;

  if (typeof registry?.isUsingOAuth === "function" && !registry.isUsingOAuth(model)) {
    return false;
  }

  const auth = await resolveModelAuth(ctx, model);
  return auth.ok && Boolean(auth.apiKey || auth.headers || auth.env);
}

export async function selectModelCandidate(modelSpecs, currentModel, ctx) {
  const specs = Array.isArray(modelSpecs) ? modelSpecs : parseModelSpecList(modelSpecs);

  if (currentModel && specs.some((spec) => modelSpecMatches(spec, currentModel))) {
    return { model: currentModel, alreadyActive: true };
  }

  for (const spec of specs) {
    for (const model of getModelCandidates(spec, ctx?.modelRegistry)) {
      if (await hasUsableAuth(model, ctx)) {
        return { model, alreadyActive: false };
      }
    }
  }

  return undefined;
}

export function resolveModelReference(ctx, reference) {
  const specs = parseModelSpecList(reference);
  if (specs.length !== 1) {
    throw new Error(`Model reference '${reference}' contains multiple fallback specs`);
  }

  const candidates = getModelCandidates(specs[0], ctx?.modelRegistry);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(
      `Model reference '${reference}' is ambiguous: ${candidates.map(modelDisplayRef).join(", ")}`,
    );
  }
  throw new Error(`Model reference '${reference}' did not match any registered model`);
}

export const modelSelectionInternals = {
  getModelCandidates,
  modelDisplayRef,
  modelSpecMatches,
  orderMatchesByProviderPreference,
};
