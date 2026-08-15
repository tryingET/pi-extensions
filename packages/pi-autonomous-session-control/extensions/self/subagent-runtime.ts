import { join } from "node:path";
import { createEdgeMonotonicId } from "./edge-contract-kernel.ts";
import {
  type DispatchEffectDisposition,
  normalizeEffectReceiptSessionName,
  writeDispatchEffectReceipt,
} from "./effect-receipt.ts";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import {
  formatSharedSubagentCapacityHolders,
  inspectSharedSubagentCapacity,
  reserveSharedSubagentCapacity,
} from "./subagent-capacity.ts";
import { cancelSubagentDispatch } from "./subagent-control.ts";
import {
  formatInvariantIssues,
  normalizeDispatchParams,
  validateDispatchParams,
  validateSubagentLifecycle,
} from "./subagent-edge-contract.ts";
import { resolveSubagentExtensionSelection } from "./subagent-extension-selection.ts";
import type { ResolvedSubagentModelSelection } from "./subagent-model-selection.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import { applyPromptEnvelope } from "./subagent-prompt-envelope.ts";
import {
  formatExtensionSelectionWarnings,
  formatSkillSelectionWarnings,
  getDispatchSubagentFailureKind,
  getDispatchSubagentStatusLabel,
  normalizeDispatchSubagentDisplayOutput,
  toDispatchSubagentStatus,
  truncateDispatchSubagentDisplayOutput,
} from "./subagent-runtime-display.ts";
import { normalizeModelProviderResult } from "./subagent-runtime-model.ts";
import type {
  AscExecutionRuntime,
  AscExecutionRuntimeOptions,
  DispatchSubagentExecutionResult,
  DispatchSubagentExecutionUpdate,
  DispatchSubagentProfile,
  DispatchSubagentRequest,
  SubagentModelContext,
  SubagentModelProviderResult,
} from "./subagent-runtime-types.ts";
import {
  writeCompletedSubagentStatus,
  writeRunningSubagentStatus,
} from "./subagent-spawn-status.ts";
import { buildDispatchTaskContract, buildDispatchUserPrompt } from "./subagent-task-contract.ts";

export type { DispatchEffectDisposition, DispatchEffectReceipt } from "./effect-receipt.ts";
export { getDispatchSubagentDisplayOutput } from "./subagent-runtime-display.ts";

function formatCacheMeasurement(usage: SubagentUsage | undefined): string {
  const cache = usage?.cache;
  if (!usage || !cache) return "";

  const first = cache.firstTurn;
  const aggregate = cache.aggregate;
  const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
  return `\nCache measurement: first prompt=${first.promptTokens} tokens, uncached=${first.uncachedTokens}, cache-read=${first.cacheReadTokens} (${percent(first.cacheReadRatio)}); run cache-read ratio=${percent(aggregate.cacheReadRatio)}, output=${usage.output} tokens, provider cost=${usage.cost.toFixed(6)}. Reasoning cost and result quality/overlap are not separately inferable from provider usage.`;
}

export function classifyDispatchEffectDisposition(params: {
  status: "done" | "error" | "timed_out" | "aborted" | "spawning" | "running";
  spawnAttempted: boolean;
  usesOwnedSpawner: boolean;
  rawChildSpawnIntent?: boolean;
}): DispatchEffectDisposition {
  if (params.status === "done") return "settled";
  if (!params.spawnAttempted) return "confirmed_no_effects";
  if (params.usesOwnedSpawner && params.rawChildSpawnIntent === false) {
    return "confirmed_no_effects";
  }
  return "effect_indeterminate";
}
export type {
  AscExecutionRuntime,
  AscExecutionRuntimeOptions,
  DispatchSubagentDetails,
  DispatchSubagentExecutionResult,
  DispatchSubagentExecutionUpdate,
  DispatchSubagentFailureKind,
  DispatchSubagentPreDispatchFailureAttestation,
  DispatchSubagentProfile,
  DispatchSubagentRequest,
  DispatchSubagentStatus,
  SubagentModelContext,
  SubagentModelProviderResult,
} from "./subagent-runtime-types.ts";

import { resolveSubagentResume } from "./subagent-resume.ts";
import {
  createSubagentState,
  reserveSubagentExecutionSlot,
  type SubagentState,
} from "./subagent-session.ts";
import { reserveExactSessionName, reserveUniqueSessionName } from "./subagent-session-name.ts";
import {
  resolveSubagentSkillSelection,
  SubagentSkillSelectionError,
} from "./subagent-skill-selection.ts";
import {
  formatSubagentEnvPolicyIssues,
  resolveDefaultSubagentTimeoutMs,
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  type SubagentUsage,
  spawnSubagent,
  validateSubagentRequestEnv,
} from "./subagent-spawn.ts";

function withImmediateConfirmedNoEffects(
  result: DispatchSubagentExecutionResult,
): DispatchSubagentExecutionResult {
  const failureKind = result.details.failureKind;
  if (!failureKind) {
    return {
      ...result,
      details: {
        ...result.details,
        effectDisposition: "effect_indeterminate",
      },
    };
  }
  return {
    ...result,
    details: {
      ...result.details,
      effectDisposition: "confirmed_no_effects",
      preDispatchFailure: {
        schema: "asc.dispatch_pre_dispatch_failure.v1",
        phase: "pre_dispatch",
        identityAllocated: false,
        spawnAttempted: false,
        effectDisposition: "confirmed_no_effects",
        failureKind,
      },
    },
  };
}

function attachConfirmedNoEffectsReceipt(params: {
  sessionsDir: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
  effectCorrelationId?: string;
  result: DispatchSubagentExecutionResult;
}): DispatchSubagentExecutionResult {
  const sessionName = normalizeEffectReceiptSessionName(params.sessionName);
  try {
    const effectReceipt = writeDispatchEffectReceipt({
      sessionsDir: params.sessionsDir,
      sessionName,
      dispatchId: params.dispatchId,
      attemptId: params.attemptId,
      consumerCorrelationId: params.effectCorrelationId,
      disposition: "confirmed_no_effects",
    });
    return {
      ...params.result,
      details: {
        ...params.result.details,
        dispatchId: params.dispatchId,
        attemptId: params.attemptId,
        sessionName,
        effectCorrelationId: effectReceipt.consumerCorrelationId,
        effectReceipt,
        effectDisposition: "confirmed_no_effects",
      },
    };
  } catch {
    return {
      ...params.result,
      ok: false,
      text: `${params.result.text}\n\nASC effect receipt could not be persisted; execution effects remain indeterminate.`,
      details: {
        ...params.result.details,
        dispatchId: params.dispatchId,
        attemptId: params.attemptId,
        sessionName,
        effectCorrelationId: params.effectCorrelationId,
        status: "error",
        failureKind: "effect_receipt_write_failed",
        effectDisposition: "effect_indeterminate",
      },
    };
  }
}

export async function executeDispatchSubagentRequest(options: {
  request: DispatchSubagentRequest;
  state: SubagentState;
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult;
  ctx: SubagentModelContext;
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void;
  signal?: AbortSignal;
  spawner?: SubagentSpawner;
}): Promise<DispatchSubagentExecutionResult> {
  const normalizedParams = normalizeDispatchParams(options.request);
  const {
    profile,
    objective,
    tools,
    systemPrompt,
    name,
    resumeDispatchId,
    thinking,
    startupTimeout,
    allowUnlimited,
    deliverable,
    acceptanceCriteria,
    constraints,
    evidenceRequired,
    mutationPolicy,
    stopConditions,
    allowedPaths,
    forbiddenPaths,
    timeout,
    extensions,
    env,
    skillProfile,
    noSkills,
    skills,
    prompt_name,
    prompt_content,
    prompt_tags,
    prompt_source,
    effectCorrelationId,
  } = normalizedParams;

  const invariants = validateDispatchParams(normalizedParams);

  if (!invariants.ok) {
    return withImmediateConfirmedNoEffects({
      ok: false,
      text: formatInvariantIssues("Invalid dispatch_subagent input", invariants),
      details: {
        reason: "invariant_failed",
        failureKind: "invariant_failed",
        invariants: invariants.issues,
        status: "error",
      },
    });
  }

  if (
    timeout === 0 &&
    (allowUnlimited !== true ||
      process.env.PI_SUBAGENT_ALLOW_UNLIMITED_TIMEOUT?.trim().toLowerCase() !== "true")
  ) {
    return withImmediateConfirmedNoEffects({
      ok: false,
      text: "Unlimited subagent execution is disabled. timeout=0 requires allowUnlimited=true and PI_SUBAGENT_ALLOW_UNLIMITED_TIMEOUT=true.",
      details: {
        reason: "unlimited_timeout_policy_failed",
        failureKind: "invariant_failed",
        status: "error",
      },
    });
  }

  const envPolicy = validateSubagentRequestEnv(env);

  if (!envPolicy.ok) {
    const output = formatSubagentEnvPolicyIssues(envPolicy.issues);
    return withImmediateConfirmedNoEffects({
      ok: false,
      text: output,
      details: {
        reason: "env_policy_failed",
        failureKind: "env_policy_failed",
        invariants: envPolicy.issues,
        status: "error",
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
      },
    });
  }

  const safeObjective = objective as string;
  const parentSessionKey = getContextSessionKey(options.ctx);
  const parentRepoRoot = getContextRepoRoot(options.ctx);
  const resume = resumeDispatchId
    ? resolveSubagentResume({
        sessionsDir: options.state.sessionsDir,
        dispatchId: resumeDispatchId,
        parentSessionKey,
        parentRepoRoot,
      })
    : undefined;
  if (resume && !resume.ok) {
    return withImmediateConfirmedNoEffects({
      ok: false,
      text: `Subagent resume rejected: ${resume.error}`,
      details: {
        reason: "resume_rejected",
        failureKind: "invariant_failed",
        resumeDispatchId,
        status: "error",
      },
    });
  }
  const dispatchId = resume?.ok ? resume.value.dispatchId : createEdgeMonotonicId("dispatch");
  const attemptId = createEdgeMonotonicId("attempt");
  const failBeforeSpawn = (
    result: DispatchSubagentExecutionResult,
  ): DispatchSubagentExecutionResult =>
    attachConfirmedNoEffectsReceipt({
      sessionsDir: options.state.sessionsDir,
      sessionName: name || profile,
      dispatchId,
      attemptId,
      effectCorrelationId,
      result,
    });
  const profileDef = SUBAGENT_PROFILES[profile];
  if (!profileDef && profile !== "custom") {
    return failBeforeSpawn({
      ok: false,
      text: `Unknown profile: ${profile}. Available: ${Object.keys(SUBAGENT_PROFILES).join(", ")}, custom`,
      details: {
        reason: "unknown_profile",
        failureKind: "unknown_profile",
        status: "error",
      },
    });
  }

  const executionSlot = reserveSubagentExecutionSlot(options.state);
  if (!executionSlot) {
    return failBeforeSpawn({
      ok: false,
      text: `Maximum concurrent subagents reached (${options.state.maxConcurrent}). Wait for existing subagents to complete.`,
      details: {
        reason: "rate_limited",
        failureKind: "rate_limited",
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
        status: "error",
      },
    });
  }

  const taskContract = buildDispatchTaskContract({
    objective: safeObjective,
    deliverable,
    acceptanceCriteria,
    constraints,
    evidenceRequired,
    mutationPolicy,
    stopConditions,
    allowedPaths,
    forbiddenPaths,
  });
  const sharedCapacityLease = reserveSharedSubagentCapacity(
    options.state.sessionsDir,
    options.state.maxConcurrent,
    {
      leaseMetadata: {
        dispatchId,
        attemptId,
        sessionName: name || profile,
      },
    },
  );
  if (!sharedCapacityLease) {
    const capacityHolders = inspectSharedSubagentCapacity(
      options.state.sessionsDir,
      options.state.maxConcurrent,
    );
    executionSlot.release();
    return failBeforeSpawn({
      ok: false,
      text: `Shared ASC subagent capacity for this repository session root is full (${options.state.maxConcurrent}). Blocking holders: ${formatSharedSubagentCapacityHolders(capacityHolders)}`,
      details: {
        reason: "rate_limited",
        failureKind: "rate_limited",
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
        capacityScope: "repository_sessions_dir",
        capacityHolders,
        status: "error",
      },
    });
  }
  const releaseExecutionReservations = (completed = false) => {
    sharedCapacityLease.release();
    executionSlot.release({ completed });
  };

  const baseSystemPrompt = systemPrompt || profileDef?.systemPrompt;
  const promptEnvelope = applyPromptEnvelope(baseSystemPrompt, {
    prompt_name,
    prompt_content,
    prompt_tags,
    prompt_source,
  });
  // Pi's host prompt, project context, and tool schema remain the stable prefix.
  // Role, prompt-envelope content, and task-specific data are sent afterwards
  // in the initial user message so sibling children can reuse that prefix.
  const effectiveUserPrompt = buildDispatchUserPrompt(promptEnvelope.systemPrompt, taskContract);

  const reservationsEnabled =
    process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES?.trim().toLowerCase() !== "false";
  const useFileLockReservation =
    reservationsEnabled &&
    process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES?.trim().toLowerCase() !== "false";

  const spawner = options.spawner ?? spawnSubagent;
  let selectedModel: ResolvedSubagentModelSelection;
  try {
    selectedModel = normalizeModelProviderResult(options.modelProvider(options.ctx));
  } catch (error) {
    releaseExecutionReservations();
    const message = error instanceof Error ? error.message : String(error);
    const output = `Model selection failed before subagent spawn: ${message}`;
    return failBeforeSpawn({
      ok: false,
      text: `✗ [${profile}] error before spawn\n\n${output}`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        status: "error",
        reason: "model_selection_failed",
        failureKind: "model_selection_failed",
        elapsed: 0,
        fullOutput: output,
        displayOutput: output,
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
      },
    });
  }
  const extensionSelection = resolveSubagentExtensionSelection({
    requestedExtensions: extensions,
    effectiveModel: selectedModel.effectiveModel,
    ctx: options.ctx,
  });

  if (extensionSelection.missingRequired.length > 0) {
    releaseExecutionReservations();
    return failBeforeSpawn({
      ok: false,
      text: [
        "Subagent child runtime is missing required extension bootstrap.",
        ...extensionSelection.missingRequired.map((item) => `- ${item}`),
      ].join("\n"),
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        requestedModel: selectedModel.requestedModel,
        effectiveModel: selectedModel.effectiveModel,
        modelSelectionSource: selectedModel.source,
        modelSelectionWarning: selectedModel.warning,
        loadedExtensions: extensionSelection.extensions,
        extensionWarnings: extensionSelection.warnings,
        status: "error",
        failureKind: "extension_bootstrap_missing",
      },
    });
  }

  let skillSelection: Awaited<ReturnType<typeof resolveSubagentSkillSelection>>;
  try {
    skillSelection = await resolveSubagentSkillSelection({
      requestedSkillProfile: skillProfile,
      requestedNoSkills: noSkills,
      requestedSkills: skills,
      ctx: options.ctx,
    });
  } catch (error) {
    releaseExecutionReservations();
    const message = error instanceof Error ? error.message : String(error);
    return failBeforeSpawn({
      ok: false,
      text: `Subagent child runtime skill-profile resolution failed: ${message}`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        requestedModel: selectedModel.requestedModel,
        effectiveModel: selectedModel.effectiveModel,
        modelSelectionSource: selectedModel.source,
        modelSelectionWarning: selectedModel.warning,
        status: "error",
        reason:
          error instanceof SubagentSkillSelectionError ? error.reason : "skill_profile_failed",
        failureKind: "skill_profile_failed",
      },
    });
  }

  let sessionReservation:
    | {
        sessionName: string;
        release: () => void;
      }
    | undefined;
  let result: SubagentResult = {
    output: "Subagent execution did not start.",
    exitCode: 1,
    elapsed: 0,
    status: "error",
  };
  let sessionFile: string | undefined;
  let activeDef: SubagentDef | undefined;
  let spawnAttempted = false;
  const attemptCreatedAt = new Date().toISOString();
  const runtimeOwnsStatusProjection = spawner !== spawnSubagent;
  let progressSequence = 0;
  const timeoutMs = typeof timeout === "number" ? timeout * 1000 : undefined;
  const executionTimeoutSeconds = (timeoutMs ?? resolveDefaultSubagentTimeoutMs()) / 1000;
  const startupTimeoutMs = (startupTimeout ?? 30) * 1000;
  const configuredThinking = thinking ?? profileDef?.thinking ?? "medium";
  try {
    sessionReservation = resume?.ok
      ? reserveExactSessionName(
          resume.value.sessionName,
          options.state.sessionsDir,
          options.state.reservedSessionNames,
          {
            useInMemoryReservation: reservationsEnabled,
            useFileLockReservation,
          },
        )
      : reserveUniqueSessionName(
          name || profile,
          options.state.sessionsDir,
          options.state.reservedSessionNames,
          {
            useInMemoryReservation: reservationsEnabled,
            useFileLockReservation,
          },
        );

    sessionFile = resume?.ok
      ? resume.value.sessionFile
      : join(options.state.sessionsDir, `${sessionReservation.sessionName}.jsonl`);

    const def: SubagentDef = {
      name: sessionReservation.sessionName,
      dispatchId,
      attemptId,
      objective: safeObjective,
      userPrompt: effectiveUserPrompt,
      tools: tools || profileDef?.tools || "read,bash",
      profile: profile as string,
      sessionFile,
      timeout: timeoutMs,
      startupTimeout: startupTimeoutMs,
      thinking: configuredThinking,
      resumed: Boolean(resume?.ok),
      taskContract: taskContract as unknown as Record<string, unknown>,
      executionSlotReserved: true,
      parentSessionKey,
      parentRepoRoot,
      extensionSources: extensionSelection.extensions,
      noSkills: skillSelection.noSkills,
      skillSources: skillSelection.skillSources,
      env: envPolicy.env,
    };
    activeDef = def;

    options.onUpdate?.({
      text: `Dispatching ${profile} subagent...`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        dispatchId,
        attemptId,
        sessionName: sessionReservation.sessionName,
        sessionFile,
        resumed: Boolean(resume?.ok),
        resumeDispatchId,
        configuredThinking,
        startupTimeoutSeconds: startupTimeoutMs / 1000,
        executionTimeoutSeconds,
        taskContract,
        progressSequence: ++progressSequence,
        progressPhase: "spawning",
        status: "spawning",
        ...(selectedModel.warning
          ? {
              requestedModel: selectedModel.requestedModel,
              effectiveModel: selectedModel.effectiveModel,
              modelSelectionSource: selectedModel.source,
              modelSelectionWarning: selectedModel.warning,
            }
          : {}),
        ...(extensionSelection.extensions.length > 0
          ? { loadedExtensions: extensionSelection.extensions }
          : {}),
        ...(extensionSelection.warnings.length > 0
          ? { extensionWarnings: extensionSelection.warnings }
          : {}),
        ...(skillSelection.skillProfile ? { skillProfile: skillSelection.skillProfile } : {}),
        ...(skillSelection.loadedSkills.length > 0
          ? { loadedSkills: skillSelection.loadedSkills }
          : {}),
        ...(skillSelection.librarySkills.length > 0
          ? { librarySkills: skillSelection.librarySkills }
          : {}),
        ...(skillSelection.skillWarnings.length > 0
          ? { skillWarnings: skillSelection.skillWarnings }
          : {}),
        ...(skillSelection.skillRegistry ? { skillRegistry: skillSelection.skillRegistry } : {}),
      },
    });

    if (runtimeOwnsStatusProjection) {
      writeRunningSubagentStatus({
        state: options.state,
        def,
        createdAt: attemptCreatedAt,
        childPid: process.pid,
        model: selectedModel.effectiveModel,
        cancelSupported: false,
      });
    }
    sharedCapacityLease.markSpawnCommitted();
    spawnAttempted = true;
    result = await spawner(
      def,
      selectedModel.effectiveModel,
      options.ctx,
      options.state,
      options.signal,
      (progress) => {
        options.onUpdate?.({
          text: `[${profile}] ${progress.phase} (${Math.round(progress.elapsedMs / 1000)}s)${
            progress.latestTool ? ` tool=${progress.latestTool}` : ""
          }`,
          details: {
            profile: profile as DispatchSubagentProfile,
            objective: safeObjective,
            dispatchId,
            attemptId,
            sessionName: sessionReservation?.sessionName,
            sessionFile,
            resumed: Boolean(resume?.ok),
            configuredThinking,
            startupTimeoutSeconds: startupTimeoutMs / 1000,
            executionTimeoutSeconds,
            taskContract,
            usage: progress.usage,
            progressSequence: ++progressSequence,
            progressPhase: progress.phase,
            lastActivityAt: progress.lastActivityAt,
            latestTool: progress.latestTool,
            status: progress.phase === "spawning" ? "spawning" : "running",
          },
        });
      },
    );
  } catch (error) {
    result = {
      output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
      elapsed: 0,
      status: "error",
    };
  } finally {
    if (runtimeOwnsStatusProjection && activeDef && spawnAttempted && result) {
      writeCompletedSubagentStatus({
        state: options.state,
        def: activeDef,
        result,
        createdAt: attemptCreatedAt,
        pid: process.pid,
        model: selectedModel.effectiveModel,
      });
    }
    await skillSelection.cleanup?.().catch(() => undefined);
    sessionReservation?.release();
    releaseExecutionReservations(spawnAttempted);
  }

  const lifecycleInvariants = validateSubagentLifecycle(options.state);

  if (!lifecycleInvariants.ok) {
    return {
      ok: false,
      text: formatInvariantIssues("Subagent lifecycle invariant failed", lifecycleInvariants),
      details: {
        reason: "invariant_failed",
        failureKind: "invariant_failed",
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        invariants: lifecycleInvariants.issues,
        status: "error",
      },
    };
  }

  const displayOutput = normalizeDispatchSubagentDisplayOutput(result);
  const truncated = truncateDispatchSubagentDisplayOutput(displayOutput, 8000);

  const status = toDispatchSubagentStatus(result.status);
  const modelSelectionWarning = selectedModel.warning
    ? `\nModel selection note: ${selectedModel.warning}`
    : "";
  const extensionSelectionWarning = formatExtensionSelectionWarnings(extensionSelection);
  const skillSelectionWarning = formatSkillSelectionWarnings(skillSelection);
  const promptWarning = promptEnvelope.prompt_warning
    ? `\nPrompt envelope warning: ${promptEnvelope.prompt_warning}`
    : "";
  const executionFailureKind = getDispatchSubagentFailureKind({
    status,
    timeoutPhase: result.timeoutPhase,
    executionState: result.executionState,
  });
  // ASC owns this attestation. Persist it before returning so consumers never
  // have to infer effect truth from status, exit code, or output.
  let effectReceipt: ReturnType<typeof writeDispatchEffectReceipt> | undefined;
  let receiptWriteFailed = false;
  try {
    effectReceipt = writeDispatchEffectReceipt({
      sessionsDir: options.state.sessionsDir,
      sessionName: sessionReservation?.sessionName ?? activeDef?.name ?? "unknown",
      dispatchId,
      attemptId,
      consumerCorrelationId: effectCorrelationId,
      disposition: classifyDispatchEffectDisposition({
        status,
        spawnAttempted,
        usesOwnedSpawner: spawner === spawnSubagent,
        rawChildSpawnIntent: result.executionState?.transport.rawChildSpawnIntent,
      }),
    });
  } catch {
    receiptWriteFailed = true;
  }
  const reportedStatus = receiptWriteFailed ? "error" : status;
  const failureKind = receiptWriteFailed ? "effect_receipt_write_failed" : executionFailureKind;
  const icon = reportedStatus === "done" ? "✓" : "✗";
  const summary = `${icon} [${profile}] ${getDispatchSubagentStatusLabel(reportedStatus)} in ${Math.round(result.elapsed / 1000)}s`;
  // This continuation capability must be in model-visible content, not only
  // result details (which Pi retains for rendering/state but does not send to
  // the model). Keep it before child output so truncation cannot hide it.
  const continuationHandle = `\nDispatch ID: ${dispatchId}\nResume this child with resumeDispatchId=${JSON.stringify(dispatchId)}.`;
  const receiptWarning = receiptWriteFailed
    ? "\nASC effect receipt could not be persisted; execution effects remain indeterminate."
    : "";
  const cacheMeasurement = formatCacheMeasurement(result.usage);

  return {
    ok: reportedStatus === "done",
    text: `${summary}${continuationHandle}${modelSelectionWarning}${extensionSelectionWarning}${skillSelectionWarning}${promptWarning}${receiptWarning}${cacheMeasurement}\n\n${truncated}`,
    details: {
      profile: profile as DispatchSubagentProfile,
      objective: safeObjective,
      dispatchId,
      attemptId,
      sessionName: sessionReservation?.sessionName,
      sessionFile,
      resumed: Boolean(resume?.ok),
      resumeDispatchId,
      configuredThinking,
      startupTimeoutSeconds: startupTimeoutMs / 1000,
      executionTimeoutSeconds,
      timeoutPhase: result.timeoutPhase,
      taskContract,
      usage: result.usage,
      progressSequence: ++progressSequence,
      progressPhase: "completed",
      lastActivityAt: Date.now(),
      elapsed: result.elapsed,
      exitCode: result.exitCode,
      fullOutput: result.output,
      displayOutput,
      stderr: result.stderr,
      outputTruncated: result.outputTruncated,
      timedOut: result.timedOut,
      aborted: result.aborted,
      assistantStopReason: result.assistantStopReason,
      assistantErrorMessage: result.assistantErrorMessage,
      executionState: result.executionState,
      requestedModel: selectedModel.requestedModel,
      effectiveModel: selectedModel.effectiveModel,
      modelSelectionSource: selectedModel.source,
      modelSelectionWarning: selectedModel.warning,
      loadedExtensions: extensionSelection.extensions,
      extensionWarnings: extensionSelection.warnings,
      skillProfile: skillSelection.skillProfile,
      loadedSkills: skillSelection.loadedSkills,
      librarySkills: skillSelection.librarySkills,
      skillWarnings: skillSelection.skillWarnings,
      skillRegistry: skillSelection.skillRegistry,
      prompt_name: promptEnvelope.prompt_name,
      prompt_source: promptEnvelope.prompt_source,
      prompt_tags: promptEnvelope.prompt_tags,
      prompt_applied: promptEnvelope.prompt_applied,
      prompt_warning: promptEnvelope.prompt_warning,
      status: reportedStatus,
      failureKind,
      effectCorrelationId: effectReceipt?.consumerCorrelationId ?? effectCorrelationId,
      effectReceipt,
    },
  };
}

export function createAscExecutionRuntime(
  options: AscExecutionRuntimeOptions,
): AscExecutionRuntime {
  if (options.state && options.state.sessionsDir !== options.sessionsDir) {
    throw new Error(
      `AscExecutionRuntime state.sessionsDir (${options.state.sessionsDir}) must match options.sessionsDir (${options.sessionsDir}).`,
    );
  }

  const state =
    options.state ??
    createSubagentState(options.sessionsDir, { maxConcurrent: options.maxConcurrent });

  return {
    state,
    cancel(dispatchId, ctx, reason) {
      return cancelSubagentDispatch({
        state,
        dispatchId,
        requestedBy: getContextSessionKey(ctx) ?? "runtime:unknown",
        reason,
        parentRepoRoot: getContextRepoRoot(ctx),
      });
    },
    execute(request, ctx, onUpdate, signal) {
      return executeDispatchSubagentRequest({
        request,
        state,
        modelProvider: options.modelProvider,
        ctx,
        onUpdate,
        signal,
        spawner: options.spawner,
      });
    },
  };
}
