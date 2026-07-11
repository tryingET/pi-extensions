const finiteNumberForKeys = (value, keys) => {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
};

export const compactSessionContextUsage = (usage) => {
  const tokens = finiteNumberForKeys(usage, ["tokens", "totalTokens", "usedTokens", "inputTokens"]);
  const windowTokens = finiteNumberForKeys(usage, [
    "windowTokens",
    "contextWindow",
    "maxTokens",
    "limitTokens",
  ]);
  const contextPressureRatio = tokens && windowTokens ? tokens / windowTokens : undefined;
  return {
    tokens: tokens ?? null,
    windowTokens: windowTokens ?? null,
    contextPressureRatio: contextPressureRatio ?? null,
    rawUsageOmitted: Boolean(usage),
  };
};

export const hasHighSessionContextPressure = (usage) => {
  const { tokens, contextPressureRatio } = compactSessionContextUsage(usage);
  return Boolean(
    (contextPressureRatio !== null && contextPressureRatio >= 0.8) ||
      (tokens !== null && tokens >= 120_000),
  );
};
