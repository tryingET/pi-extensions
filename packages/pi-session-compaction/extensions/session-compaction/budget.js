/**
summary: "Plans one bounded compaction budget across model input, output, and exact records."
read_when:
  - "Changing token calibration, split-turn allocation, history selection, or final caps."
*/

export const DEFAULT_CHARS_PER_TOKEN = 4;
export const MIN_CHARS_PER_TOKEN = 2;
export const MAX_CHARS_PER_TOKEN = 6;

export const DEFAULT_BUDGET_CONFIG = Object.freeze({
  inputFloorTokens: 2_000,
  inputCeilingTokens: 24_000,
  inputTokensPerMessage: 160,
  contextSafetyTokens: 1_024,
  managedFraction: 0.36,
  managedMaxTokens: 1_200,
  minimumBodyTokens: 192,
  minimumSplitCallTokens: 96,
  preserveRecentMessages: 12,
  maxPromptItems: 12,
  maxReceiptItems: 16,
  maxFileLines: 60,
  promptManagedFraction: 0.34,
  lastAssistantManagedFraction: 0.24,
  filesManagedFraction: 0.2,
  receiptsManagedFraction: 0.22,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function parseBudgetConfig(value = {}) {
  if (value === undefined) return { ...DEFAULT_BUDGET_CONFIG };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid pi-session-compaction config: budgets must be an object");
  }

  const out = { ...DEFAULT_BUDGET_CONFIG };
  for (const key of [
    "inputFloorTokens",
    "inputCeilingTokens",
    "inputTokensPerMessage",
    "contextSafetyTokens",
    "managedMaxTokens",
    "minimumBodyTokens",
    "minimumSplitCallTokens",
    "preserveRecentMessages",
    "maxPromptItems",
    "maxReceiptItems",
    "maxFileLines",
  ]) {
    if (value[key] === undefined) continue;
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      throw new Error(
        `Invalid pi-session-compaction config: budgets.${key} must be a non-negative integer`,
      );
    }
    out[key] = value[key];
  }

  for (const key of [
    "managedFraction",
    "promptManagedFraction",
    "lastAssistantManagedFraction",
    "filesManagedFraction",
    "receiptsManagedFraction",
  ]) {
    if (value[key] === undefined) continue;
    if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1) {
      throw new Error(
        `Invalid pi-session-compaction config: budgets.${key} must be between 0 and 1`,
      );
    }
    out[key] = value[key];
  }

  if (out.inputFloorTokens > out.inputCeilingTokens) {
    throw new Error(
      "Invalid pi-session-compaction config: budgets.inputFloorTokens must not exceed inputCeilingTokens",
    );
  }
  const managedFractions =
    out.promptManagedFraction +
    out.lastAssistantManagedFraction +
    out.filesManagedFraction +
    out.receiptsManagedFraction;
  if (Math.abs(managedFractions - 1) > 0.001) {
    throw new Error(
      "Invalid pi-session-compaction config: managed-record fractions must sum to 1",
    );
  }
  return out;
}

export function calibrateCharsPerToken(sourceChars, sourceTokens) {
  if (
    !Number.isFinite(sourceChars) ||
    sourceChars <= 0 ||
    !Number.isFinite(sourceTokens) ||
    sourceTokens <= 0
  ) {
    return {
      mode: "heuristic",
      charsPerToken: DEFAULT_CHARS_PER_TOKEN,
    };
  }
  const rawCharsPerToken = sourceChars / sourceTokens;
  if (!Number.isFinite(rawCharsPerToken) || rawCharsPerToken <= 0) {
    return {
      mode: "heuristic",
      charsPerToken: DEFAULT_CHARS_PER_TOKEN,
    };
  }
  return {
    mode: "calibrated",
    charsPerToken: clamp(rawCharsPerToken, MIN_CHARS_PER_TOKEN, MAX_CHARS_PER_TOKEN),
    rawCharsPerToken,
    sourceChars,
    sourceTokens,
  };
}

export function estimateTextTokens(text, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
  const chars = typeof text === "string" ? text.length : String(text ?? "").length;
  return Math.ceil(chars / clamp(charsPerToken, MIN_CHARS_PER_TOKEN, MAX_CHARS_PER_TOKEN));
}

export function tokenBudgetToChars(tokens, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
  return Math.max(
    0,
    Math.floor(tokens * clamp(charsPerToken, MIN_CHARS_PER_TOKEN, MAX_CHARS_PER_TOKEN)),
  );
}

function allocateSplitTokens(totalTokens, historyWeight, prefixWeight, minimumPerCall) {
  if (prefixWeight <= 0) return { historyTokens: totalTokens, turnPrefixTokens: 0 };
  if (totalTokens <= minimumPerCall * 2) {
    const historyTokens = Math.max(1, Math.floor(totalTokens / 2));
    return {
      historyTokens,
      turnPrefixTokens: Math.max(1, totalTokens - historyTokens),
    };
  }
  const denominator = Math.max(1, historyWeight + prefixWeight);
  let historyTokens = Math.round((totalTokens * historyWeight) / denominator);
  historyTokens = clamp(historyTokens, minimumPerCall, totalTokens - minimumPerCall);
  return {
    historyTokens,
    turnPrefixTokens: totalTokens - historyTokens,
  };
}

export function planCompactionBudget(input = {}) {
  const config = parseBudgetConfig(input.config);
  const reserveTokens = positiveInteger(input.reserveTokens, 1_200);
  const contextWindow = positiveInteger(input.contextWindow, 200_000);
  const messageCount = Math.max(0, Math.floor(finiteNumber(input.messageCount, 0)));
  const sourceChars = Math.max(0, finiteNumber(input.sourceChars, 0));
  const calibration = calibrateCharsPerToken(sourceChars, input.sourceTokens);

  const managedTarget = Math.min(
    config.managedMaxTokens,
    Math.round(reserveTokens * config.managedFraction),
  );
  const managedTokens = clamp(
    managedTarget,
    0,
    Math.max(0, reserveTokens - Math.min(config.minimumBodyTokens, reserveTokens)),
  );
  const bodyTokens = Math.max(1, reserveTokens - managedTokens);
  const availableInputTokens = Math.max(
    256,
    contextWindow - reserveTokens - config.contextSafetyTokens,
  );
  const scaledInputTokens = clamp(
    Math.max(config.inputFloorTokens, messageCount * config.inputTokensPerMessage),
    Math.min(config.inputFloorTokens, availableInputTokens),
    Math.min(config.inputCeilingTokens, availableInputTokens),
  );

  const split = allocateSplitTokens(
    bodyTokens,
    Math.max(1, finiteNumber(input.historyChars, sourceChars)),
    Math.max(0, finiteNumber(input.turnPrefixChars, 0)),
    Math.min(config.minimumSplitCallTokens, Math.max(1, Math.floor(bodyTokens / 2))),
  );
  const managedChars = tokenBudgetToChars(managedTokens, calibration.charsPerToken);
  const managed = {
    totalTokens: managedTokens,
    totalChars: managedChars,
    promptsChars: Math.floor(managedChars * config.promptManagedFraction),
    lastAssistantChars: Math.floor(
      managedChars * config.lastAssistantManagedFraction,
    ),
    filesChars: Math.floor(managedChars * config.filesManagedFraction),
    receiptsChars: Math.floor(managedChars * config.receiptsManagedFraction),
    maxPromptItems: config.maxPromptItems,
    maxReceiptItems: config.maxReceiptItems,
    maxFileLines: config.maxFileLines,
  };

  return {
    config,
    calibration,
    reserveTokens,
    finalSummaryTokens: reserveTokens,
    finalSummaryChars: tokenBudgetToChars(reserveTokens, calibration.charsPerToken),
    bodyTokens,
    bodyChars: tokenBudgetToChars(bodyTokens, calibration.charsPerToken),
    inputTokens: scaledInputTokens,
    inputChars: tokenBudgetToChars(scaledInputTokens, calibration.charsPerToken),
    split,
    managed,
  };
}

export function fitTextToTokenBudget(text, maxTokens, options = {}) {
  const normalized = typeof text === "string" ? text : String(text ?? "");
  const charsPerToken = finiteNumber(options.charsPerToken, DEFAULT_CHARS_PER_TOKEN);
  const maxChars = tokenBudgetToChars(Math.max(0, maxTokens), charsPerToken);
  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false,
      originalChars: normalized.length,
      maxChars,
    };
  }
  if (maxChars <= 0) {
    return {
      text: "",
      truncated: normalized.length > 0,
      originalChars: normalized.length,
      maxChars,
    };
  }

  const marker = options.marker ?? `\n\n[... truncated to ${maxTokens} token budget ...]\n\n`;
  if (marker.length >= maxChars) {
    return {
      text: marker.slice(0, maxChars),
      truncated: true,
      originalChars: normalized.length,
      maxChars,
    };
  }
  const available = maxChars - marker.length;
  const preserveTailFraction = clamp(finiteNumber(options.preserveTailFraction, 0.3), 0, 1);
  const tailChars = Math.floor(available * preserveTailFraction);
  const headChars = available - tailChars;
  return {
    text: `${normalized.slice(0, headChars)}${marker}${normalized.slice(
      normalized.length - tailChars,
    )}`,
    truncated: true,
    originalChars: normalized.length,
    maxChars,
  };
}
