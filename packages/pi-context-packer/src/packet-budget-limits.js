/**
summary: "Share pure packet headroom limits between planning and final rendering."
read_when:
  - "Changing output byte ceilings, reserves or host headroom."
*/
import { compactSessionContextUsage } from "./session-context.js";

export const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;

export function outputLimits(budget = {}, env = {}) {
  const configured = nonnegative(budget.maxTokens) ? budget.maxTokens : 40_000;
  const reserve = nonnegative(budget.reserveTokens) ? budget.reserveTokens : 0;
  const usage = compactSessionContextUsage(env.contextUsage);
  const remaining = nonnegative(env.remainingInputTokens)
    ? env.remainingInputTokens
    : nonnegative(usage.tokens) && nonnegative(usage.windowTokens)
      ? Math.max(0, usage.windowTokens - usage.tokens)
      : null;
  const tokens = Math.max(0, Math.min(configured, remaining ?? configured) - reserve);
  // An estimate is not a tokenizer guarantee. The independently enforced byte cap is exact.
  const exactCounter = typeof env.countTokens === "function" ? env.countTokens : null;
  const maxBytes = Math.min(
    nonnegative(budget.maxBytes) ? budget.maxBytes : configured * 4,
    exactCounter ? Number.MAX_SAFE_INTEGER : tokens * 2,
  );
  return { tokens, maxBytes, remaining, reserve, exactCounter };
}
