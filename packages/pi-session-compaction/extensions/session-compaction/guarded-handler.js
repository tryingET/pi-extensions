/**
summary: "Wraps custom compaction with bounded inputs, exact records, validation, and fallback."
read_when:
  - "Changing P0 compaction hardening, deterministic degradation, or final packet assembly."
*/
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBudgetConfig, planCompactionBudget } from "./budget.js";
import { buildDeterministicCompactionSummary } from "./deterministic-summary.js";
import {
  collectExecutionReceipts,
  extractPreviousExecutionReceipts,
  renderExecutionReceiptsBlock,
  renderFileActivityBlock,
} from "./execution-receipts.js";
import { collectFilesTouched } from "./files-touched.js";
import {
  DEFAULT_CONFIG,
  loadConfig,
  parseCompactInstructions,
  runSessionCompaction,
  stripManagedSummaryBlocks,
} from "./handler.js";
import { completeWithHostModelRegistry } from "./host-completion.js";
import {
  detailsForHardening,
  inputTokenSplit,
  isTurnPrefixContext,
  sanitizeCompletionContext,
} from "./guarded-handler-budget.js";
import {
  ESSENTIAL_PROMPTS_HEADING,
  ESSENTIAL_PROMPTS_TYPE,
  lastAssistantRecords,
  LAST_ASSISTANT_HEADING,
  LAST_ASSISTANT_TYPE,
  promptRecords,
} from "./guarded-handler-records.js";
import {
  estimateMessagesChars,
  sanitizeBranchEntries,
  selectMessagesWithinBudget,
} from "./history-normalizer.js";
import { buildManagedBlock, stripManagedBlocks } from "./managed-block-codec.js";
import {
  repairAndValidateSummary,
  validateCompactionSummary,
} from "./summary-validator.js";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
function messagesFromPreparation(event) {
  return [
    ...(event?.preparation?.messagesToSummarize ?? []),
    ...(event?.preparation?.turnPrefixMessages ?? []),
  ];
}

function cleanPreviousSummary(value) {
  const withoutV2 = stripManagedBlocks(value) ?? value;
  return stripManagedSummaryBlocks(withoutV2);
}

async function loadHardeningBudgetConfig(extensionDir = EXTENSION_DIR) {
  try {
    const raw = await readFile(path.join(extensionDir, "config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parseBudgetConfig(parsed?.budgets);
  } catch {
    return parseBudgetConfig();
  }
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    /aborted|abort|cancelled/iu.test(error instanceof Error ? error.message : String(error))
  );
}

function notify(ctx, message, level = "warning") {
  if (ctx?.hasUI && typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

export async function runGuardedSessionCompaction(event, ctx, deps = {}) {
  const baseHandler = deps.baseHandler ?? runSessionCompaction;
  const baseLoadConfig = deps.loadConfig ?? loadConfig;
  const complete =
    deps.complete ??
    ((model, context, options) => completeWithHostModelRegistry(ctx, model, context, options));
  const collectFilesTouchedImpl = deps.collectFilesTouched ?? collectFilesTouched;
  const trackedCommands =
    typeof deps.getTrackedCommands === "function"
      ? deps.getTrackedCommands()
      : deps.trackedCommands ?? [];
  const parsedInstructions = parseCompactInstructions(event?.customInstructions);
  const explicitPreset = parsedInstructions.usesPresetDirective === true;
  const originalHistory = event?.preparation?.messagesToSummarize ?? [];
  const originalTurnPrefix = event?.preparation?.turnPrefixMessages ?? [];
  const summarizedMessages = messagesFromPreparation(event);
  const sourceChars = estimateMessagesChars(summarizedMessages);
  const historyChars = estimateMessagesChars(originalHistory);
  const turnPrefixChars = estimateMessagesChars(originalTurnPrefix);
  let baseConfig;
  try {
    baseConfig = await baseLoadConfig(EXTENSION_DIR);
  } catch (error) {
    baseConfig = structuredClone(DEFAULT_CONFIG);
    notify(
      ctx,
      `Invalid compaction config ignored by the guarded fallback: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const budgetConfig = deps.budgetConfig
    ? parseBudgetConfig(deps.budgetConfig)
    : await loadHardeningBudgetConfig(EXTENSION_DIR);
  const plan = planCompactionBudget({
    config: budgetConfig,
    reserveTokens: event?.preparation?.settings?.reserveTokens,
    contextWindow: ctx?.model?.contextWindow,
    messageCount: summarizedMessages.length,
    sourceChars,
    sourceTokens: event?.preparation?.tokensBefore,
    historyChars,
    turnPrefixChars,
  });
  const splitInput = inputTokenSplit(plan.inputTokens, historyChars, turnPrefixChars);
  const selectionOptions = {
    charsPerToken: plan.calibration.charsPerToken,
    preserveRecentMessages: plan.config.preserveRecentMessages,
  };
  const historySelection = selectMessagesWithinBudget(
    originalHistory,
    splitInput.historyTokens,
    selectionOptions,
  );
  const turnPrefixSelection = selectMessagesWithinBudget(
    originalTurnPrefix,
    splitInput.turnPrefixTokens,
    selectionOptions,
  );
  const sanitizedBranch = sanitizeBranchEntries(event?.branchEntries ?? [], selectionOptions);
  const previousSummary = event?.preparation?.previousSummary;
  const previousBody = cleanPreviousSummary(previousSummary);
  const hardenedEvent = {
    ...event,
    branchEntries: sanitizedBranch.entries,
    preparation: {
      ...event.preparation,
      messagesToSummarize: historySelection.messages,
      turnPrefixMessages: turnPrefixSelection.messages,
      previousSummary: previousBody,
      settings: {
        ...event.preparation.settings,
        reserveTokens: Math.max(
          plan.split.historyTokens,
          plan.split.turnPrefixTokens,
          plan.config.minimumSplitCallTokens,
        ),
      },
    },
  };
  const forcedConfig = {
    ...baseConfig,
    includeFilesTouched: false,
    includeLastAssistantMessage: false,
  };
  const wrappedComplete = async (model, context, options = {}) => {
    const callTokens = isTurnPrefixContext(context)
      ? Math.max(1, plan.split.turnPrefixTokens)
      : Math.max(1, plan.split.historyTokens);
    const sanitizedContext = sanitizeCompletionContext(context, model, callTokens, plan);
    return complete(model, sanitizedContext, {
      ...options,
      maxTokens: callTokens,
    });
  };

  let baseResult;
  let baseError;
  try {
    baseResult = await baseHandler(hardenedEvent, ctx, {
      ...deps,
      complete: wrappedComplete,
      collectFilesTouched: collectFilesTouchedImpl,
      loadConfig: async () => forcedConfig,
      getTrackedCommands: () => trackedCommands,
    });
  } catch (error) {
    baseError = error;
  }

  if (baseResult?.cancel === true || event?.signal?.aborted || isAbortError(baseError)) {
    return { cancel: true };
  }
  if ((baseError || !baseResult?.compaction) && explicitPreset) {
    notify(
      ctx,
      `Explicit preset compaction cancelled after guarded failure: ${
        baseError instanceof Error ? baseError.message : "no valid custom summary"
      }`,
    );
    return { cancel: true };
  }

  const originalBranch = event?.branchEntries ?? [];
  const currentReceipts = collectExecutionReceipts(originalBranch);
  const previousReceipts = extractPreviousExecutionReceipts(previousSummary);
  const receipts = [...previousReceipts, ...currentReceipts];
  let files = [];
  if (baseConfig.includeFilesTouched !== false) {
    try {
      files = collectFilesTouchedImpl(originalBranch, ctx?.cwd);
    } catch (error) {
      notify(
        ctx,
        `Observed file activity could not be collected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const prompts = promptRecords({
    previousSummary,
    messages: summarizedMessages,
    trackedCommands,
    customInstructions: event?.customInstructions,
  });
  const assistantRecords = baseConfig.includeLastAssistantMessage === false
    ? []
    : lastAssistantRecords({
        previousSummary,
        messages: summarizedMessages,
      });
  const promptBlockBudget = Math.min(
    plan.finalSummaryChars,
    Math.max(plan.managed.promptsChars, 1_200),
  );
  const receiptBlockBudget = Math.min(
    plan.finalSummaryChars,
    Math.max(plan.managed.receiptsChars, 900),
  );
  const lastAssistantBlockBudget = Math.min(
    plan.finalSummaryChars,
    Math.max(plan.managed.lastAssistantChars, 600),
  );
  const fileBlockBudget = Math.min(
    plan.finalSummaryChars,
    Math.max(plan.managed.filesChars, 600),
  );
  const promptBlock = buildManagedBlock({
    type: ESSENTIAL_PROMPTS_TYPE,
    heading: ESSENTIAL_PROMPTS_HEADING,
    records: prompts,
    maxItems: plan.managed.maxPromptItems,
    maxChars: promptBlockBudget,
    maxRecordChars: Math.max(500, promptBlockBudget),
  });
  const lastAssistantBlock = buildManagedBlock({
    type: LAST_ASSISTANT_TYPE,
    heading: LAST_ASSISTANT_HEADING,
    records: assistantRecords,
    maxItems: 1,
    maxChars: lastAssistantBlockBudget,
    maxRecordChars: Math.max(500, lastAssistantBlockBudget),
  });
  const receiptBlock = renderExecutionReceiptsBlock(receipts, {
    maxItems: plan.managed.maxReceiptItems,
    maxChars: receiptBlockBudget,
    maxRecordChars: Math.max(500, Math.floor(receiptBlockBudget / 2)),
  });
  const fileBlock = renderFileActivityBlock(files, {
    maxItems: plan.managed.maxFileLines,
    maxChars: fileBlockBudget,
  });
  const fallbackBody = buildDeterministicCompactionSummary({
    messages: summarizedMessages,
    previousSummary: previousBody,
    focusText: parsedInstructions.focusText ?? previousBody,
    receipts: currentReceipts,
    files,
    cwd: ctx?.cwd,
    isSplitTurn: event?.preparation?.isSplitTurn,
    omittedMessageCount:
      historySelection.omittedCount + turnPrefixSelection.omittedCount,
  });
  const modelBody = baseResult?.compaction?.summary;
  const modelBodyValidation = modelBody
    ? validateCompactionSummary(cleanPreviousSummary(modelBody), {
        maxChars: plan.bodyChars,
      })
    : undefined;

  if (explicitPreset && modelBodyValidation?.ok !== true) {
    notify(ctx, "Explicit preset compaction cancelled because the model output was invalid.");
    return { cancel: true };
  }

  const assembly = repairAndValidateSummary({
    modelBody,
    fallbackBody,
    managedBlocks: [
      ...(prompts.length > 0
        ? [{ ...promptBlock, required: true, priority: 100 }]
        : []),
      ...(receipts.length > 0
        ? [
            {
              ...receiptBlock,
              required: currentReceipts.some((receipt) => receipt.status === "failed"),
              priority: 90,
            },
          ]
        : []),
      ...(assistantRecords.length > 0
        ? [{ ...lastAssistantBlock, required: false, priority: 80 }]
        : []),
      ...(files.length > 0
        ? [{ ...fileBlock, required: false, priority: 70 }]
        : []),
    ],
    maxChars: plan.finalSummaryChars,
  });

  if (!assembly.validation.ok) {
    notify(
      ctx,
      `Guarded compaction produced an invalid bounded packet: ${assembly.validation.errors.join(
        "; ",
      )}`,
    );
    if (explicitPreset) return { cancel: true };
  }

  const mode = baseResult?.compaction
    ? assembly.mode
    : baseError
      ? "deterministic_fallback_after_error"
      : "deterministic_fallback_after_empty_result";
  const hardening = detailsForHardening({
    mode,
    plan,
    historySelection,
    turnPrefixSelection,
    branchSanitization: sanitizedBranch.stats,
    promptBlock,
    lastAssistantBlock,
    receiptBlock,
    fileBlock,
    assembly,
  });

  return {
    compaction: {
      ...(baseResult?.compaction ?? {}),
      summary: assembly.summary,
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      details: {
        ...(baseResult?.compaction?.details ?? {}),
        hardening,
      },
    },
  };
}
