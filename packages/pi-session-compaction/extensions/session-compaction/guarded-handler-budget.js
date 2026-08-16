/**
summary: "Allocates guarded compaction call budgets and reports hardening details."
read_when:
  - "Changing split-call allocation, completion packet caps, or hardening diagnostics."
*/
import { fitTextToTokenBudget } from "./budget.js";
import { sanitizeDisplayText } from "./redaction.js";

export function inputTokenSplit(totalTokens, historyChars, turnPrefixChars) {
  if (turnPrefixChars <= 0) {
    return { historyTokens: totalTokens, turnPrefixTokens: 0 };
  }
  const totalChars = Math.max(1, historyChars + turnPrefixChars);
  const minimum = Math.min(128, Math.max(1, Math.floor(totalTokens / 2)));
  let historyTokens = Math.round((totalTokens * historyChars) / totalChars);
  historyTokens = Math.max(minimum, Math.min(totalTokens - minimum, historyTokens));
  return {
    historyTokens,
    turnPrefixTokens: totalTokens - historyTokens,
  };
}

function contextText(context) {
  return (context?.messages ?? [])
    .flatMap((message) =>
      Array.isArray(message?.content)
        ? message.content
            .filter((part) => part?.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
        : [],
    )
    .join("\n");
}

export function isTurnPrefixContext(context) {
  const text = contextText(context);
  return (
    text.includes("Summarize only this early split-turn context") ||
    text.includes("## Split-turn instructions")
  );
}

export function sanitizeCompletionContext(context, model, maxOutputTokens, plan) {
  const system = sanitizeDisplayText(context?.systemPrompt ?? "", {
    maxChars: 16_000,
  }).text;
  const contextWindow = Number.isFinite(model?.contextWindow)
    ? model.contextWindow
    : plan.inputTokens + maxOutputTokens + plan.config.contextSafetyTokens;
  const availableTokens = Math.max(
    256,
    Math.min(
      plan.inputTokens,
      contextWindow - maxOutputTokens - plan.config.contextSafetyTokens,
    ),
  );
  const systemFit = fitTextToTokenBudget(system, Math.min(availableTokens, 4_000), {
    charsPerToken: plan.calibration.charsPerToken,
    preserveTailFraction: 0.1,
  });
  const remainingTokens = Math.max(
    128,
    availableTokens - Math.ceil(systemFit.text.length / plan.calibration.charsPerToken),
  );
  const messages = (context?.messages ?? []).map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const text = message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    const sanitized = sanitizeDisplayText(text).text;
    const fitted = fitTextToTokenBudget(sanitized, remainingTokens, {
      charsPerToken: plan.calibration.charsPerToken,
      preserveTailFraction: 0.35,
    });
    return {
      ...message,
      content: [{ type: "text", text: fitted.text }],
    };
  });
  return {
    ...context,
    systemPrompt: systemFit.text,
    messages,
  };
}

export function detailsForHardening({
  mode,
  plan,
  historySelection,
  turnPrefixSelection,
  branchSanitization,
  promptBlock,
  lastAssistantBlock,
  receiptBlock,
  fileBlock,
  assembly,
}) {
  return {
    version: 1,
    mode,
    budget: {
      finalSummaryTokens: plan.finalSummaryTokens,
      finalSummaryChars: plan.finalSummaryChars,
      inputTokens: plan.inputTokens,
      bodyTokens: plan.bodyTokens,
      split: plan.split,
      charsPerToken: plan.calibration.charsPerToken,
      calibrationMode: plan.calibration.mode,
    },
    history: {
      selected: historySelection.messages.length,
      omitted: historySelection.omittedCount,
      turnPrefixSelected: turnPrefixSelection.messages.length,
      turnPrefixOmitted: turnPrefixSelection.omittedCount,
      omittedThinkingChars:
        historySelection.sanitization.omittedThinkingChars +
        turnPrefixSelection.sanitization.omittedThinkingChars +
        branchSanitization.omittedThinkingChars,
      redactions:
        historySelection.sanitization.redactionCount +
        turnPrefixSelection.sanitization.redactionCount +
        branchSanitization.redactionCount,
    },
    managed: {
      selectedBlocks: assembly.selectedManagedBlocks,
      omittedBlocks: assembly.omittedManagedBlocks,
      omittedRecords:
        promptBlock.omittedCount +
        lastAssistantBlock.omittedCount +
        receiptBlock.omittedCount +
        fileBlock.omittedCount,
      redactions:
        promptBlock.redactionCount +
        lastAssistantBlock.redactionCount +
        receiptBlock.redactionCount +
        fileBlock.redactionCount,
      truncatedRecords:
        promptBlock.truncatedCount +
        lastAssistantBlock.truncatedCount +
        receiptBlock.truncatedCount +
        fileBlock.truncatedCount,
    },
    validation: assembly.validation,
  };
}
