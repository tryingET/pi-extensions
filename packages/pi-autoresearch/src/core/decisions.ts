import type { CampaignDecision } from "../machine/events.ts";
import {
  buildFinalizeDecisionContext,
  buildNextHypothesisDecisionContext,
  buildSetupDecisionContext,
} from "./decisions-context.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionError,
  type AutoresearchDecisionExecutionContext,
  type AutoresearchDecisionFailureStage,
  type AutoresearchDecisionKind,
  type AutoresearchDecisionPromptExecutionResult,
  type AutoresearchDecisionRuntime,
  type AutoresearchDecisionRuntimeOptions,
  type AutoresearchDecisionTemplateName,
  type AutoresearchPreparedDecisionPrompt,
  type NextHypothesisDecisionOutcome,
  type NextHypothesisDecisionStatus,
  type PreparedPromptPlaneCandidate,
  type VaultPromptPlaneRuntime,
} from "./decisions-model.ts";
import {
  parseFinalizeDecisionOutput,
  parseNextHypothesisDecisionOutput,
  parseSetupDecisionOutput,
} from "./decisions-parser.ts";

export {
  buildFinalizeDecisionContext,
  buildNextHypothesisDecisionContext,
  buildSetupDecisionContext,
} from "./decisions-context.ts";
export type {
  AutoresearchDecisionError,
  AutoresearchDecisionExecutionContext,
  AutoresearchDecisionFailureStage,
  AutoresearchDecisionKind,
  AutoresearchDecisionPromptExecutionResult,
  AutoresearchDecisionPromptExecutor,
  AutoresearchDecisionRuntime,
  AutoresearchDecisionRuntimeOptions,
  AutoresearchDecisionTemplateName,
  AutoresearchPreparedDecisionPrompt,
  FinalizeDecisionGroup,
  FinalizeDecisionOutcome,
  FinalizeDecisionPacket,
  FinalizeDecisionResult,
  FinalizeDecisionStatus,
  NextHypothesisDecisionOutcome,
  NextHypothesisDecisionPacket,
  NextHypothesisDecisionResult,
  NextHypothesisDecisionStatus,
  SetupDecisionChecksRequired,
  SetupDecisionOutcome,
  SetupDecisionPacket,
  SetupDecisionPrimaryMetric,
  SetupDecisionResult,
  SetupDecisionStatus,
} from "./decisions-model.ts";
export {
  AUTORESEARCH_DECISION_TEMPLATE_NAMES,
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
} from "./decisions-model.ts";
export {
  parseFinalizeDecisionOutput,
  parseNextHypothesisDecisionOutput,
  parseSetupDecisionOutput,
} from "./decisions-parser.ts";

let defaultPromptPlaneRuntimePromise: Promise<VaultPromptPlaneRuntime> | null = null;

export function mapNextHypothesisStatusToCampaignDecision(
  status: NextHypothesisDecisionStatus,
): CampaignDecision {
  switch (status) {
    case "ready":
      return "iterate";
    case "rebaseline_needed":
      return "rebaseline";
    case "finalize_candidate":
      return "finalize";
    case "blocked":
      return "block";
  }
}

export function mapNextHypothesisOutcomeToCampaignDecision(
  outcome: NextHypothesisDecisionOutcome,
): CampaignDecision {
  return mapNextHypothesisStatusToCampaignDecision(outcome.status);
}

export function createAutoresearchDecisionRuntime(
  options: AutoresearchDecisionRuntimeOptions = {},
): AutoresearchDecisionRuntime {
  return {
    async runSetup(packet, ctx) {
      return await runDecisionStep({
        kind: "setup",
        templateName: AUTORESEARCH_SETUP_TEMPLATE_NAME,
        packetContext: buildSetupDecisionContext(packet),
        parseOutput: parseSetupDecisionOutput,
        ctx,
        options,
      });
    },

    async runNextHypothesis(packet, ctx) {
      return await runDecisionStep({
        kind: "next_hypothesis",
        templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
        packetContext: buildNextHypothesisDecisionContext(packet),
        parseOutput: parseNextHypothesisDecisionOutput,
        ctx,
        options,
      });
    },

    async runFinalize(packet, ctx) {
      return await runDecisionStep({
        kind: "finalize",
        templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
        packetContext: buildFinalizeDecisionContext(packet),
        parseOutput: parseFinalizeDecisionOutput,
        ctx,
        options,
      });
    },
  };
}

async function runDecisionStep<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
  Result,
>(input: {
  kind: Kind;
  templateName: TemplateName;
  packetContext: string;
  parseOutput: (output: string) => Result;
  ctx: AutoresearchDecisionExecutionContext;
  options: AutoresearchDecisionRuntimeOptions;
}): Promise<Result | AutoresearchDecisionError<Kind, TemplateName>> {
  input.ctx.signal?.throwIfAborted();
  const cwd = asNonEmptyString(input.ctx.cwd);
  if (!cwd) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "prompt_plane",
      "Decision execution requires a cwd so Prompt Vault company resolution stays truthful.",
    );
  }

  const runtimeResult = await getPromptPlaneRuntime(input.options);
  input.ctx.signal?.throwIfAborted();
  if (!runtimeResult.ok) {
    return createDecisionError(input.kind, input.templateName, "prompt_plane", runtimeResult.error);
  }

  let preparedCandidate: PreparedPromptPlaneCandidate;
  try {
    input.ctx.signal?.throwIfAborted();
    preparedCandidate = await runtimeResult.value.prepareSelection(
      {
        query: input.templateName,
        context: input.packetContext,
      },
      {
        cwd,
        currentCompany: asNonEmptyString(input.ctx.currentCompany) ?? undefined,
      },
    );
    input.ctx.signal?.throwIfAborted();
  } catch (error) {
    input.ctx.signal?.throwIfAborted();
    return createDecisionError(
      input.kind,
      input.templateName,
      "prompt_plane",
      describeError(error),
    );
  }

  const preparedPrompt = normalizePreparedPrompt(
    input.kind,
    input.templateName,
    preparedCandidate,
    input.packetContext,
    input.ctx,
  );
  if (!preparedPrompt.ok) {
    return preparedPrompt.error;
  }

  const executor = input.options.executePreparedPrompt;
  if (!executor) {
    return createDecisionError(
      input.kind,
      input.templateName,
      "executor",
      `No decision executor configured for ${input.templateName}; use the lawful owner route or land an orchestrator execution binding before treating this Prompt Vault template as executed.`,
    );
  }

  let rawOutput: string;
  try {
    input.ctx.signal?.throwIfAborted();
    const executorOutput = await executor(preparedPrompt.value);
    input.ctx.signal?.throwIfAborted();
    rawOutput = normalizeExecutorOutput(executorOutput);
  } catch (error) {
    input.ctx.signal?.throwIfAborted();
    return createDecisionError(input.kind, input.templateName, "executor", describeError(error));
  }

  try {
    input.ctx.signal?.throwIfAborted();
    return input.parseOutput(rawOutput);
  } catch (error) {
    input.ctx.signal?.throwIfAborted();
    return createDecisionError(
      input.kind,
      input.templateName,
      "parse",
      describeError(error),
      rawOutput,
    );
  }
}

async function getPromptPlaneRuntime(
  options: AutoresearchDecisionRuntimeOptions,
): Promise<{ ok: true; value: VaultPromptPlaneRuntime } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      value: await (options.loadPromptPlaneRuntime ?? loadDefaultPromptPlaneRuntime)(),
    };
  } catch (error) {
    return {
      ok: false,
      error: describeError(error),
    };
  }
}

async function loadDefaultPromptPlaneRuntime(): Promise<VaultPromptPlaneRuntime> {
  try {
    defaultPromptPlaneRuntimePromise ??= (async () => {
      const promptPlaneModule = await loadModuleBySpecifier(
        AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
      );
      const createRuntime = getCreatePromptPlaneRuntime(promptPlaneModule);
      return createRuntime();
    })();

    return await defaultPromptPlaneRuntimePromise;
  } catch (error) {
    defaultPromptPlaneRuntimePromise = null;
    throw error;
  }
}

async function loadModuleBySpecifier(specifier: string): Promise<unknown> {
  return await import(specifier);
}

function getCreatePromptPlaneRuntime(moduleValue: unknown): () => VaultPromptPlaneRuntime {
  const candidate = asRecord(moduleValue);
  if (!candidate || typeof candidate.createVaultPromptPlaneRuntime !== "function") {
    throw new Error(
      `Prompt-plane module ${AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER} does not expose createVaultPromptPlaneRuntime().`,
    );
  }

  return candidate.createVaultPromptPlaneRuntime as () => VaultPromptPlaneRuntime;
}

function normalizePreparedPrompt<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
>(
  kind: Kind,
  templateName: TemplateName,
  candidate: PreparedPromptPlaneCandidate,
  packetContext: string,
  ctx: AutoresearchDecisionExecutionContext,
):
  | { ok: true; value: AutoresearchPreparedDecisionPrompt }
  | { ok: false; error: AutoresearchDecisionError<Kind, TemplateName> } {
  if (!candidate.ok || candidate.status !== "ready") {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        candidate.blocking_reason ?? `Prompt preparation for ${templateName} was not ready.`,
      ),
    };
  }

  if (candidate.selection_mode !== "exact") {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation for ${templateName} must resolve via exact-template selection, not ${candidate.selection_mode ?? "unknown"}.`,
      ),
    };
  }

  if (!candidate.template || candidate.template.name !== templateName) {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation resolved ${candidate.template?.name ?? "(unknown template)"} instead of exact template ${templateName}.`,
      ),
    };
  }

  const preparedText = asNonEmptyString(candidate.prepared_text);
  if (!preparedText) {
    return {
      ok: false,
      error: createDecisionError(
        kind,
        templateName,
        "prompt_plane",
        `Prompt preparation for ${templateName} returned no prepared text.`,
      ),
    };
  }

  return {
    ok: true,
    value: {
      kind,
      templateName,
      cwd: ctx.cwd,
      currentCompany: asNonEmptyString(ctx.currentCompany) ?? undefined,
      model: asNonEmptyString(ctx.model) ?? undefined,
      signal: ctx.signal,
      packetContext,
      preparedText,
      selectionMode: "exact",
      template: candidate.template,
    },
  };
}

function normalizeExecutorOutput(
  result: AutoresearchDecisionPromptExecutionResult | string,
): string {
  if (typeof result === "string") {
    const text = result.trim();
    if (!text) {
      throw new Error("Decision executor returned an empty string.");
    }
    return text;
  }

  const text = asNonEmptyString(result.outputText);
  if (!text) {
    throw new Error("Decision executor must return a non-empty outputText string.");
  }
  return text;
}

function createDecisionError<
  Kind extends AutoresearchDecisionKind,
  TemplateName extends AutoresearchDecisionTemplateName,
>(
  kind: Kind,
  templateName: TemplateName,
  failureStage: AutoresearchDecisionFailureStage,
  blockingReason: string,
  rawOutput?: string,
): AutoresearchDecisionError<Kind, TemplateName> {
  const guidance = getDecisionBindingGuidance(templateName);
  return {
    kind,
    templateName,
    status: "blocked",
    failureStage,
    blockingReason,
    lawfulOwnerRoute: guidance.lawfulOwnerRoute,
    missingBindingAction: guidance.missingBindingAction,
    recoverySteps: guidance.recoverySteps,
    rawOutput,
  };
}

function getDecisionBindingGuidance(templateName: AutoresearchDecisionTemplateName): {
  lawfulOwnerRoute: string;
  missingBindingAction: string;
  recoverySteps: string[];
} {
  const route = getLawfulOwnerRoute(templateName);
  return {
    lawfulOwnerRoute: route,
    missingBindingAction:
      "Do not interpret Prompt Vault prose manually; either use the package-owned owner route or first land an explicit orchestrator execution binding for this template.",
    recoverySteps: [
      `Use ${route} for the current run when the package-owned surface is sufficient.`,
      "If governed Prompt Vault execution is required, route through the prompt-plane/orchestrator owner and add the missing executable binding as its own bounded slice.",
      "After the binding lands, rerun the same pi-autoresearch decision action and preserve this blocked result as process evidence rather than execution evidence.",
    ],
  };
}

function getLawfulOwnerRoute(templateName: AutoresearchDecisionTemplateName): string {
  switch (templateName) {
    case AUTORESEARCH_SETUP_TEMPLATE_NAME:
      return 'autoresearch_runtime_status({ action: "setup", ... }) or autoresearch_campaign_start({ setupMode: "prompt_vault_setup", ... })';
    case AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME:
      return "autoresearch_runtime_run({ liveDecision: { ... } }) or autoresearch_runtime_loop({ decisionGoal: ... })";
    case AUTORESEARCH_FINALIZE_TEMPLATE_NAME:
      return 'autoresearch_runtime_status({ action: "finalize", ... }) or autoresearch_runtime_finalize(...)';
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
