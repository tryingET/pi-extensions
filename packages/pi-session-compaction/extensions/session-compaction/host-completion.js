/**
 * Translate the package's normalized thinking level to Pi's public,
 * API-specific ModelRegistry.complete() options. Request routing and
 * authentication remain entirely inside the host registry.
 */
const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
const GOOGLE_BUDGETS = {
  "2.5-pro": { minimal: 128, low: 2048, medium: 8192, high: 32768 },
  "2.5-flash-lite": { minimal: 512, low: 2048, medium: 8192, high: 24576 },
  "2.5-flash": { minimal: 128, low: 2048, medium: 8192, high: 24576 },
};

function clampThinkingLevel(model, requested) {
  const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const supported = !model?.reasoning
    ? ["off"]
    : levels.filter((level) => {
        const mapped = model?.thinkingLevelMap?.[level];
        if (mapped === null) return false;
        return level !== "xhigh" && level !== "max" ? true : mapped !== undefined;
      });
  if (supported.includes(requested)) return requested;
  const index = levels.indexOf(requested);
  if (index === -1) return supported[0] ?? "off";
  // Match Pi's public model-capability semantics: prefer the next supported
  // higher level before falling back to a lower level.
  for (let candidate = index; candidate < levels.length; candidate += 1) {
    if (supported.includes(levels[candidate])) return levels[candidate];
  }
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if (supported.includes(levels[candidate])) return levels[candidate];
  }
  return supported[0] ?? "off";
}

function baseReasoningLevel(model, reasoning) {
  if (!THINKING_LEVELS.includes(reasoning)) {
    throw new Error(`Unsupported normalized thinking level '${String(reasoning)}'`);
  }
  if (!model?.reasoning) {
    throw new Error(
      `Model '${model?.provider ?? "unknown"}/${model?.id ?? "unknown"}' does not support requested thinking level '${reasoning}'`,
    );
  }
  const clamped = clampThinkingLevel(model, reasoning);
  if (clamped === "off") {
    throw new Error(
      `Model '${model?.provider ?? "unknown"}/${model?.id ?? "unknown"}' cannot honor requested thinking level '${reasoning}'`,
    );
  }
  return clamped;
}

function anthropicOptions(model, reasoning, options) {
  const level = baseReasoningLevel(model, reasoning);
  if (model?.compat?.forceAdaptiveThinking !== true) {
    throw new Error(
      "Pi host API 'anthropic-messages' requires context-aware thinking-budget translation that is not exposed to extensions; refusing custom reasoning compaction",
    );
  }
  const mapped = model?.thinkingLevelMap?.[level];
  const effort =
    typeof mapped === "string"
      ? mapped
      : level === "minimal" || level === "low"
        ? "low"
        : level === "medium"
          ? "medium"
          : "high";
  return { ...options, thinkingEnabled: true, effort };
}

function bedrockOptions(model, reasoning, options) {
  const level = baseReasoningLevel(model, reasoning);
  const identity = `${model?.id ?? ""} ${model?.name ?? ""}`.toLowerCase();
  const normalizedIdentity = identity.replace(/[\s_.:]+/g, "-");
  const isClaude =
    identity.includes("anthropic.claude") ||
    identity.includes("anthropic/claude") ||
    identity.includes("claude");
  const supportsAdaptiveThinking =
    normalizedIdentity.includes("opus-4-6") ||
    normalizedIdentity.includes("opus-4-7") ||
    normalizedIdentity.includes("opus-4-8") ||
    normalizedIdentity.includes("opus-5") ||
    normalizedIdentity.includes("sonnet-4-6") ||
    normalizedIdentity.includes("sonnet-5") ||
    normalizedIdentity.includes("fable-5");
  if (isClaude && !supportsAdaptiveThinking) {
    throw new Error(
      "Pi host API 'bedrock-converse-stream' requires context-aware thinking-budget translation for non-adaptive Claude models; refusing custom reasoning compaction",
    );
  }
  return { ...options, reasoning: level };
}

function googleOptions(model, reasoning, options) {
  const level = baseReasoningLevel(model, reasoning);
  if (!level) return { ...options, thinking: { enabled: false } };
  const id = String(model?.id ?? "").toLowerCase();
  const isPro = /gemini-3(?:\.\d+)?-pro/.test(id);
  const isFlash =
    /gemini-3(?:\.\d+)?-flash/.test(id) ||
    id === "gemini-flash-latest" ||
    id === "gemini-flash-lite-latest";
  const isGemma4 = model?.api === "google-generative-ai" && /gemma-?4/.test(id);
  if (isPro || isFlash || isGemma4) {
    const levelMap = isPro
      ? { minimal: "LOW", low: "LOW", medium: "HIGH", high: "HIGH" }
      : isGemma4
        ? { minimal: "MINIMAL", low: "MINIMAL", medium: "HIGH", high: "HIGH" }
        : { minimal: "MINIMAL", low: "LOW", medium: "MEDIUM", high: "HIGH" };
    return { ...options, thinking: { enabled: true, level: levelMap[level] ?? "HIGH" } };
  }
  const budgetLevel = level === "xhigh" || level === "max" ? "high" : level;
  const entry = Object.entries(GOOGLE_BUDGETS).find(([fragment]) => id.includes(fragment));
  const budget =
    model?.api === "google-vertex" && id.includes("2.5-flash")
      ? GOOGLE_BUDGETS["2.5-flash"][budgetLevel]
      : entry?.[1]?.[budgetLevel];
  return {
    ...options,
    thinking: { enabled: true, budgetTokens: budget ?? -1 },
  };
}

/**
 * Admit only request controls owned by this package. A denylist would let a new
 * host routing/authentication override cross this boundary unnoticed.
 */
export function toHostCompletionOptions(model, options = {}) {
  const hostOptions = {
    ...(Number.isFinite(options.maxTokens) ? { maxTokens: options.maxTokens } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
  const { reasoning } = options;
  if (!reasoning) return hostOptions;

  const level = baseReasoningLevel(model, reasoning);
  switch (model?.api) {
    case "openai-completions":
    case "openai-responses":
    case "openai-codex-responses":
    case "azure-openai-responses":
      return { ...hostOptions, ...(level ? { reasoningEffort: level } : {}) };
    case "anthropic-messages":
      return anthropicOptions(model, reasoning, hostOptions);
    case "google-generative-ai":
    case "google-vertex":
      return googleOptions(model, reasoning, hostOptions);
    case "bedrock-converse-stream":
      return bedrockOptions(model, reasoning, hostOptions);
    case "pi-messages":
      return { ...hostOptions, reasoning: level };
    case "mistral-conversations": {
      const id = String(model?.id ?? "");
      const usesEffort =
        id === "mistral-small-2603" || id === "mistral-small-latest" || id === "mistral-medium-3.5";
      return {
        ...hostOptions,
        ...(level
          ? usesEffort
            ? { reasoningEffort: model?.thinkingLevelMap?.[level] ?? "high" }
            : { promptMode: "reasoning" }
          : {}),
      };
    }
    default:
      throw new Error(
        `Pi host API '${model?.api ?? "unknown"}' has no verified normalized-thinking mapping`,
      );
  }
}

/**
 * Public extension-facing completion seam. The host owns provider registration,
 * authentication, request transforms, and protocol dispatch.
 */
export async function completeWithHostModelRegistry(ctx, model, context, options = {}) {
  const registry = ctx?.modelRegistry;
  if (typeof registry?.complete !== "function") {
    throw new Error(
      "Pi host model registry does not expose complete; pi-session-compaction requires Pi >= 0.84.0",
    );
  }
  return registry.complete(model, context, toHostCompletionOptions(model, options));
}
