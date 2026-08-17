/**
summary: "Wraps custom compaction with bounded inputs, structured continuity, exact recall anchors, validation, and fallback."
read_when:
  - "Changing compaction hardening, P1 provider integration, continuity state, quality telemetry, or final packet assembly."
*/
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBudgetConfig, planCompactionBudget } from "./budget.js";
import { collectCurrentWorktreeState } from "./context-provider.js";
import { buildContinuityRecords, renderContinuityStateBlock } from "./continuity-state.js";
import { buildDeterministicCompactionSummary } from "./deterministic-summary.js";
import { buildEvidenceAnchors, renderEvidenceAnchorsBlock } from "./evidence-anchors.js";
import {
  collectExecutionReceipts,
  extractPreviousExecutionReceipts,
  renderExecutionReceiptsBlock,
  renderFileActivityBlock,
} from "./execution-receipts.js";
import { collectFilesTouched } from "./files-touched.js";
import {
  detailsForHardening,
  inputTokenSplit,
  isTurnPrefixContext,
  sanitizeCompletionContext,
} from "./guarded-handler-budget.js";
import {
  ESSENTIAL_PROMPTS_HEADING,
  ESSENTIAL_PROMPTS_TYPE,
  LAST_ASSISTANT_HEADING,
  LAST_ASSISTANT_TYPE,
  lastAssistantRecords,
  promptRecords,
} from "./guarded-handler-records.js";
import {
  DEFAULT_CONFIG,
  loadCompactionPromptContract,
  loadConfig,
  parseCompactInstructions,
  runSessionCompaction,
  stripManagedSummaryBlocks,
} from "./handler.js";
import {
  estimateMessagesChars,
  sanitizeBranchEntries,
  selectMessagesWithinBudget,
} from "./history-normalizer.js";
import { completeWithHostModelRegistry } from "./host-completion.js";
import { buildManagedBlock, stripManagedBlocks } from "./managed-block-codec.js";
import { recordCompactionQuality } from "./quality-telemetry.js";
import { sanitizeDisplayText } from "./redaction.js";
import { repairAndValidateSummary, validateCompactionSummary } from "./summary-validator.js";

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

function verifiedWorktreePromptContext(worktree) {
  if (!worktree?.ok || !worktree?.verified || !worktree.state) {
    return [
      "## Verified read-only worktree snapshot",
      "- Unavailable from pi-context-packer's stable git-worktree provider.",
      "- Do not infer clean/dirty state from historical tool calls; mark it unverified instead.",
    ].join("\n");
  }
  const state = worktree.state;
  const branch = sanitizeDisplayText(state.branch, { maxChars: 240 }).text || "unknown";
  const paths = sanitizeDisplayText(
    (state.changedPaths ?? [])
      .slice(0, 12)
      .map((entry) => `${entry.status} ${entry.path}`)
      .join(", "),
    { maxChars: 2_400 },
  ).text;
  return [
    "## Verified read-only worktree snapshot",
    "This live snapshot is source-owned Git metadata supplied by pi-context-packer's stable provider API. Prefer it over historical file-touch inference for current worktree claims.",
    `- Branch: ${branch}${state.detached ? " (detached)" : ""}`,
    `- Clean: ${state.clean === true}`,
    `- Counts: staged=${state.counts?.staged ?? 0}; unstaged=${state.counts?.unstaged ?? 0}; untracked=${state.counts?.untracked ?? 0}; conflicted=${state.counts?.conflicted ?? 0}`,
    ...(paths ? [`- Changed paths (bounded): ${paths}`] : []),
    ...((state.omittedPathCount ?? 0) > 0
      ? [`- ${state.omittedPathCount} additional path(s) omitted by provider bounds.`]
      : []),
    "- Non-authorization: this snapshot did not stage, reset, commit, checkout, or mutate the worktree.",
  ].join("\n");
}

function p1ManagedBudgets(plan) {
  const total = Math.max(0, plan.managed.totalChars);
  // Scale every managed block to the managed envelope (shares sum to 1.0) while each
  // floor stays large enough that at least one full record with its framing survives;
  // floors are additionally capped by the envelope for very tight budgets.
  const share = (fraction, floor) =>
    Math.min(
      plan.finalSummaryChars,
      Math.max(Math.min(floor, total), Math.floor(total * fraction)),
    );
  return {
    continuityChars: share(0.24, 640),
    anchorsChars: share(0.16, 560),
    promptsChars: share(0.2, 640),
    receiptsChars: share(0.14, 640),
    lastAssistantChars: share(0.12, 480),
    filesChars: share(0.14, 480),
  };
}

function blockStats(blocks) {
  return blocks.reduce(
    (stats, block) => {
      stats.omitted += block?.omittedCount ?? 0;
      stats.redactions += block?.redactionCount ?? 0;
      stats.truncated += block?.truncatedCount ?? 0;
      return stats;
    },
    { omitted: 0, redactions: 0, truncated: 0 },
  );
}

export async function runGuardedSessionCompaction(event, ctx, deps = {}) {
  const startedAt = Date.now();
  const baseHandler = deps.baseHandler ?? runSessionCompaction;
  const baseLoadConfig = deps.loadConfig ?? loadConfig;
  const baseLoadPrompt = deps.loadCompactionPrompt ?? loadCompactionPromptContract;
  const complete =
    deps.complete ??
    ((model, context, options) => completeWithHostModelRegistry(ctx, model, context, options));
  const collectFilesTouchedImpl = deps.collectFilesTouched ?? collectFilesTouched;
  const trackedCommands =
    typeof deps.getTrackedCommands === "function"
      ? deps.getTrackedCommands()
      : (deps.trackedCommands ?? []);
  const parsedInstructions = parseCompactInstructions(event?.customInstructions);
  const explicitPreset = parsedInstructions.usesPresetDirective === true;
  const originalHistory = event?.preparation?.messagesToSummarize ?? [];
  const originalTurnPrefix = event?.preparation?.turnPrefixMessages ?? [];
  const summarizedMessages = messagesFromPreparation(event);
  const sourceChars = estimateMessagesChars(summarizedMessages);
  const historyChars = estimateMessagesChars(originalHistory);
  const turnPrefixChars = estimateMessagesChars(originalTurnPrefix);

  let worktree;
  try {
    worktree = await collectCurrentWorktreeState(
      { cwd: ctx?.cwd, signal: event?.signal, maxPaths: 24 },
      deps,
    );
  } catch (error) {
    if (isAbortError(error) || event?.signal?.aborted) return { cancel: true };
    worktree = { ok: false, verified: false, omissions: [{ reason: "unavailable" }] };
  }

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
    return complete(model, sanitizedContext, { ...options, maxTokens: callTokens });
  };

  let baseResult;
  let baseError;
  try {
    baseResult = await baseHandler(hardenedEvent, ctx, {
      ...deps,
      complete: wrappedComplete,
      collectFilesTouched: collectFilesTouchedImpl,
      loadConfig: async () => forcedConfig,
      loadCompactionPrompt: async (extensionDir) =>
        `${await baseLoadPrompt(extensionDir)}\n\n${verifiedWorktreePromptContext(worktree)}`,
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
  const assistantRecords =
    baseConfig.includeLastAssistantMessage === false
      ? []
      : lastAssistantRecords({ previousSummary, messages: summarizedMessages });
  const omittedMessageCount = historySelection.omittedCount + turnPrefixSelection.omittedCount;
  const continuityRecords = buildContinuityRecords({
    previousSummary,
    messages: summarizedMessages,
    receipts,
    worktree,
  });
  const evidenceAnchors = buildEvidenceAnchors({
    messages: summarizedMessages,
    receipts,
    worktree,
    compactedMessageCount: summarizedMessages.length,
    omittedMessageCount,
  });
  const managedBudgets = p1ManagedBudgets(plan);
  const continuityBlock = renderContinuityStateBlock(continuityRecords, {
    maxItems: 32,
    maxChars: managedBudgets.continuityChars,
    maxRecordChars: Math.max(500, Math.floor(managedBudgets.continuityChars / 2)),
  });
  const evidenceBlock = renderEvidenceAnchorsBlock(evidenceAnchors, {
    maxItems: 18,
    maxChars: managedBudgets.anchorsChars,
    maxRecordChars: Math.max(400, Math.floor(managedBudgets.anchorsChars / 2)),
  });
  const promptBlock = buildManagedBlock({
    type: ESSENTIAL_PROMPTS_TYPE,
    heading: ESSENTIAL_PROMPTS_HEADING,
    records: prompts,
    maxItems: plan.managed.maxPromptItems,
    maxChars: managedBudgets.promptsChars,
    maxRecordChars: Math.max(500, managedBudgets.promptsChars),
  });
  const lastAssistantBlock = buildManagedBlock({
    type: LAST_ASSISTANT_TYPE,
    heading: LAST_ASSISTANT_HEADING,
    records: assistantRecords,
    maxItems: 1,
    maxChars: managedBudgets.lastAssistantChars,
    maxRecordChars: Math.max(500, managedBudgets.lastAssistantChars),
  });
  const receiptBlock = renderExecutionReceiptsBlock(receipts, {
    maxItems: plan.managed.maxReceiptItems,
    maxChars: managedBudgets.receiptsChars,
    maxRecordChars: Math.max(500, Math.floor(managedBudgets.receiptsChars / 2)),
  });
  const fileBlock = renderFileActivityBlock(files, {
    maxItems: plan.managed.maxFileLines,
    maxChars: managedBudgets.filesChars,
  });
  const fallbackBody = buildDeterministicCompactionSummary({
    messages: summarizedMessages,
    previousSummary: previousBody,
    focusText: parsedInstructions.focusText ?? previousBody,
    receipts: currentReceipts,
    files,
    worktree,
    cwd: ctx?.cwd,
    isSplitTurn: event?.preparation?.isSplitTurn,
    compactedMessageCount: summarizedMessages.length,
    omittedMessageCount,
  });
  const modelBody = baseResult?.compaction?.summary;
  const modelBodyValidation = modelBody
    ? validateCompactionSummary(cleanPreviousSummary(modelBody), { maxChars: plan.bodyChars })
    : undefined;

  if (explicitPreset && modelBodyValidation?.ok !== true) {
    notify(ctx, "Explicit preset compaction cancelled because the model output was invalid.");
    return { cancel: true };
  }

  // A block whose budget dropped every record renders only framing; carry no such
  // empty block into assembly — selection space is precious and a framing-only block
  // would count as present without preserving any exact record.
  // In the fallback path the deterministic body is itself the self-contained exact
  // packet, so continuity/evidence records yield to prompts/receipts; in the model
  // path (small summarized body) they stay the top-priority durable records.
  const preferModelBody = modelBodyValidation?.ok === true;
  const anchorPriority = (modelPriority, fallbackPriority) =>
    preferModelBody ? modelPriority : fallbackPriority;
  const assembly = repairAndValidateSummary({
    modelBody,
    fallbackBody,
    managedBlocks: [
      ...(continuityBlock.records.length > 0
        ? [
            {
              ...continuityBlock,
              required: preferModelBody,
              priority: anchorPriority(120, 60),
            },
          ]
        : []),
      ...(evidenceBlock.records.length > 0
        ? [
            {
              ...evidenceBlock,
              required: preferModelBody,
              priority: anchorPriority(115, 55),
            },
          ]
        : []),
      ...(promptBlock.records.length > 0
        ? [{ ...promptBlock, required: true, priority: 100 }]
        : []),
      ...(receiptBlock.records.length > 0
        ? [
            {
              ...receiptBlock,
              required: currentReceipts.some((receipt) => receipt.status === "failed"),
              priority: 90,
            },
          ]
        : []),
      ...(lastAssistantBlock.records.length > 0
        ? [{ ...lastAssistantBlock, required: false, priority: 80 }]
        : []),
      ...(fileBlock.records.length > 0 ? [{ ...fileBlock, required: false, priority: 70 }] : []),
    ],
    maxChars: plan.finalSummaryChars,
  });

  if (!assembly.validation.ok) {
    notify(
      ctx,
      `Guarded compaction produced an invalid bounded packet: ${assembly.validation.errors.join("; ")}`,
    );
    if (explicitPreset) return { cancel: true };
  }

  const mode = baseResult?.compaction
    ? assembly.mode
    : baseError
      ? "deterministic_fallback_after_error"
      : "deterministic_fallback_after_empty_result";
  const allBlocks = [
    continuityBlock,
    evidenceBlock,
    promptBlock,
    lastAssistantBlock,
    receiptBlock,
    fileBlock,
  ];
  const managedStats = blockStats(allBlocks);
  const hardening = {
    ...detailsForHardening({
      mode,
      plan,
      historySelection,
      turnPrefixSelection,
      branchSanitization: sanitizedBranch.stats,
      continuityBlock,
      evidenceBlock,
      promptBlock,
      lastAssistantBlock,
      receiptBlock,
      fileBlock,
      worktree,
      assembly,
    }),
    p1: {
      providerApi: worktree?.providerApi ?? "@tryinget/pi-context-packer/api:v1",
      worktreeVerified: worktree?.verified === true,
      continuityRecordCount: continuityBlock.records.length,
      evidenceAnchorCount: evidenceBlock.records.length,
      recallSurface: "session_compaction_recall",
      omittedManagedRecords: managedStats.omitted,
    },
  };

  await (deps.recordQualityTelemetry ?? recordCompactionQuality)(
    {
      mode,
      validationOk: assembly.validation.ok,
      fallback: !String(mode).startsWith("model"),
      repaired: /repair|emergency/iu.test(String(mode)),
      splitTurn: event?.preparation?.isSplitTurn === true,
      summaryChars: assembly.summary.length,
      compactedMessages: summarizedMessages.length,
      selectedMessages: historySelection.messages.length + turnPrefixSelection.messages.length,
      omittedMessages: omittedMessageCount,
      omittedManagedRecords: managedStats.omitted,
      omittedManagedBlocks: assembly.omittedManagedBlocks?.length ?? 0,
      continuityRecords: continuityBlock.records.length,
      evidenceAnchors: evidenceBlock.records.length,
      redactions:
        sanitizedBranch.stats.redactionCount +
        managedStats.redactions +
        (worktree?.measurement?.redactions ?? 0),
      truncatedRecords: sanitizedBranch.stats.truncatedCount + managedStats.truncated,
      inputTokenBudget: plan.inputTokens,
      finalTokenBudget: plan.finalSummaryTokens,
      worktreeVerified: worktree?.verified === true,
      durationMs: Date.now() - startedAt,
    },
    ctx,
    deps,
  );

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
