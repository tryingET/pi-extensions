/**
 * summary: "builds fixture-based compatibility reports for prompt loading and execution-plan outputs."
 * read_when:
 *   - "checking successor behavior against pi-prompt-template-model compatibility expectations."
 */
/**
 * Pure compatibility canary helpers for prompt-template-model replacement work.
 *
 * The canary compares monorepo prompt-template-execution outputs against
 * explicit fixture expectations derived from the external pi-prompt-template-model
 * behavior. It does not import or run the external package live.
 */
import assert from "node:assert/strict";

import { buildPromptCommandDescription } from "./loader.js";

export const COMPAT_CANARY_KIND = "pi-prompt-template-execution/compat-canary/v1";

function modelRef(model) {
  return model ? `${model.provider}/${model.id}` : undefined;
}

function sortedDiagnosticsByCode(diagnostics = []) {
  return [...diagnostics]
    .map((diagnostic) => diagnostic?.code ?? "unknown")
    .sort((left, right) => left.localeCompare(right));
}

export function summarizeLoadedPrompt(prompt) {
  return {
    name: prompt.name,
    description: prompt.description,
    commandDescription: buildPromptCommandDescription(prompt),
    models: prompt.models ?? [],
    restore: prompt.restore,
    thinking: prompt.thinking,
    skill: prompt.skill,
    source: prompt.source,
    subdir: prompt.subdir,
  };
}

export function summarizePromptLoadResult(loadResult) {
  const prompts = loadResult?.prompts instanceof Map ? loadResult.prompts : new Map();
  return {
    claimed: [...prompts.keys()].sort(),
    prompts: [...prompts.values()]
      .map(summarizeLoadedPrompt)
      .sort((left, right) => left.name.localeCompare(right.name)),
    diagnosticCodes: sortedDiagnosticsByCode(loadResult?.diagnostics ?? []),
  };
}

export function summarizeExecutionPlan(plan) {
  if (!plan) return { kind: "no_available_model" };
  if (plan.message) {
    return {
      kind: "aborted",
      message: plan.message,
      warning: plan.warning,
    };
  }

  return {
    kind: "ready",
    promptName: plan.promptName,
    selectedModel: modelRef(plan.selectedModel?.model),
    alreadyActive: plan.selectedModel?.alreadyActive,
    restore: plan.restore,
    switchModel: plan.actions?.switchModel
      ? {
          from: modelRef(plan.actions.switchModel.from),
          to: modelRef(plan.actions.switchModel.to),
        }
      : undefined,
    restoreModel: modelRef(plan.actions?.restoreModel),
    thinking: plan.thinking,
    content: plan.content,
  };
}

function compareExact(name, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    return { name, ok: true, actual, expected };
  } catch (error) {
    return {
      name,
      ok: false,
      actual,
      expected,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildCompatibilityCanaryReport(input = {}) {
  const comparisons = [];

  if (input.loadResult || input.expectedLoadSummary) {
    comparisons.push(
      compareExact(
        "prompt-loading",
        summarizePromptLoadResult(input.loadResult),
        input.expectedLoadSummary,
      ),
    );
  }

  for (const [name, plan] of Object.entries(input.executionPlans ?? {})) {
    comparisons.push(
      compareExact(
        `execution-plan:${name}`,
        summarizeExecutionPlan(plan),
        input.expectedExecutionPlans?.[name],
      ),
    );
  }

  return {
    kind: COMPAT_CANARY_KIND,
    liveMutation: false,
    externalPackage: input.externalPackage ?? "npm:pi-prompt-template-model",
    comparisons,
    ok: comparisons.every((comparison) => comparison.ok),
    notes: [
      "fixture comparison only: the external package is not loaded or registered live",
      "slash-command cutover remains blocked until no-double-registration proof and operator approval",
    ],
  };
}
