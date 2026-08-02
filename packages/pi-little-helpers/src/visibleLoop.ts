// summary: "orchestrates persisted visible-loop child sessions, prompt delivery, adaptive continuation, completion gates, and report-back"
// read_when:
//   - "changing visible-loop lifecycle, state recovery, prompt sequencing, completion checks, or intercom delivery"

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  bindOwnerVisibleLoopGovernedPreflightToolCall,
  cancelOwnerVisibleLoopGovernedPreflight,
  forgetOwnerVisibleLoopGovernedPreflight,
  type RunVisibleLoopGovernedPreflight,
  runOwnerVisibleLoopGovernedPreflight,
  type VisibleLoopGovernedPreflightReceipt,
} from "./governedDeepReviewPreflight.ts";
import {
  renderSelfEvolutionExecutionMembrane,
  type SelfEvolutionCandidateCloseout,
  type SelfEvolutionExecutionEnvelope,
  validateSelfEvolutionCandidateCloseout,
} from "./selfEvolutionEnvelope.ts";
import { validatePersistedSelfEvolutionBinding } from "./selfEvolutionVerification.ts";
import { parseVisibleLoopChildArgs, parseVisibleLoopCompletionArgs } from "./visibleLoopArgs.ts";
import {
  admitVisibleLoopDelegatedCommit,
  beginVisibleLoopDelegatedCommit,
  completeVisibleLoopDelegatedCommit,
  createVisibleLoopDelegatedCommitRuntime,
  failVisibleLoopDelegatedCommitRuntime,
  hasVisibleLoopDelegatedCommitSuccess,
  isVisibleLoopDelegatedCommitFrontier,
  resetVisibleLoopDelegatedCommitRuntime,
  settleVisibleLoopDelegatedCommitExecution,
} from "./visibleLoopCommitDelegation.ts";
import {
  continueVisibleLoopAfterFinalizedIteration,
  readVisibleLoopContinuationStatusCursor,
  resolveVisibleLoopContinuationStartPollIntervalMs,
  resolveVisibleLoopContinuationStartTimeoutMs,
} from "./visibleLoopContinuation.ts";
import {
  bindVisibleLoopActivePlan,
  completeVisibleLoopIterationLease,
  enterVisibleLoopIterationLease,
  readVisibleLoopIterationLease,
} from "./visibleLoopContinuationClaim.ts";
import type { VisibleLoopLeaseOwner } from "./visibleLoopContinuationIdentity.ts";
import { createVisibleLoopChildStartProof } from "./visibleLoopContinuationProof.ts";
import {
  armVisibleLoopDeliveryAckWatchdog as armDeliveryAckWatchdog,
  claimVisibleLoopRuntimeGeneration,
  clearVisibleLoopDeliveryAckWatchdog,
  DEFAULT_VISIBLE_LOOP_TIMER,
  getVisibleLoopUserMessageText,
  ownsVisibleLoopRuntimeGeneration,
  resolveVisibleLoopDeliveryAckTimeoutMs,
  VISIBLE_LOOP_PROCESS_INCARNATION,
  type VisibleLoopTimerRuntime,
} from "./visibleLoopDelivery.ts";
import {
  beginVisibleLoopBarrierAttempt,
  beginVisibleLoopFrontierSubmission,
  completeVisibleLoopBarrierAttempt,
  createVisibleLoopPlanProgress,
  failVisibleLoopPlan,
  finalizeVisibleLoopPlan,
  getVisibleLoopCompletionTurnCount,
  getVisibleLoopPlanCounts,
  getVisibleLoopPrompts,
  hasVisibleLoopBarrierSuccess,
  labelVisibleLoopPlanStep,
  markVisibleLoopFrontierSubmitted,
  observeVisibleLoopPlanStep,
  renderVisibleLoopPlan,
  settleRunningVisibleLoopPlanStep,
  type VisibleLoopPlanStep,
  visibleLoopDelegatesCompletion,
} from "./visibleLoopPlan.ts";
import {
  getVisibleLoopCommandName,
  getVisibleLoopHumanLabel,
  getVisibleLoopIntercomEventPrefix,
  getVisibleLoopTitle,
  normalizeVisibleLoopCommandName,
} from "./visibleLoopProfiles.ts";
import {
  bindVisibleLoopExecutionPrompt,
  DEFAULT_VISIBLE_LOOP_PROMPTS,
  expandVisibleLoopPromptTemplate,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  GOVERNED_DEEP_REVIEW_PROMPT,
  renderVisibleLoopCommitDelegationPrompt,
  renderVisibleLoopCompletionPrompt,
  type VisibleLoopPromptExpansion,
} from "./visibleLoopPromptTemplates.ts";
import {
  type ActiveVisibleLoopState,
  type ContinueVisibleLoopInNewSession,
  type CreateVisibleLoopPeerRuntime,
  normalizeVisibleLoopOwnerSessionId,
  type PeerMessagingRuntime,
  persistActiveVisibleLoopState,
  removeActiveVisibleLoopState,
  restoreActiveVisibleLoopState as restorePersistedActiveVisibleLoopState,
  type SendUserMessage,
  type VisibleLoopContext,
} from "./visibleLoopRecovery.ts";
import {
  appendAuthoritativeVisibleLoopStatus,
  appendVisibleLoopStatus,
  claimVisibleLoopGovernedPreflightAttempt,
  hasVisibleLoopAlreadyCompleted,
  hasVisibleLoopGovernedPreflightFailed,
  loadVisibleLoopRunConfig,
  readCompletedVisibleLoopIterations,
  releaseVisibleLoopGovernedPreflightAttempt,
} from "./visibleLoopState.ts";
import type {
  VisibleLoopCommitDelegation,
  VisibleLoopExecutionBinding,
  VisibleLoopProductPostureTarget,
  VisibleLoopReportBack,
  VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

export type {
  RunVisibleLoopGovernedPreflight,
  VisibleLoopGovernedPreflightReceipt,
  VisibleLoopGovernedPreflightResult,
} from "./governedDeepReviewPreflight.ts";
export {
  bindSelfEvolutionOwnerArtifact,
  findSelfEvolutionExecutionEnvelope,
  parseSelfEvolutionExecutionEnvelope,
  renderSelfEvolutionCandidateCloseoutTemplate,
  renderSelfEvolutionExecutionMembrane,
  type SelfEvolutionCandidateCloseout,
  type SelfEvolutionExecutionEnvelope,
  validateSelfEvolutionCandidateCloseout,
} from "./selfEvolutionEnvelope.ts";
export { validatePersistedSelfEvolutionBinding } from "./selfEvolutionVerification.ts";
export {
  parseVisibleLoopChildArgs,
  parseVisibleLoopCommandArgs,
  renderVisibleLoopChildCommand,
} from "./visibleLoopArgs.ts";
export type {
  VisibleLoopTimerHandle,
  VisibleLoopTimerRuntime,
} from "./visibleLoopDelivery.ts";
export {
  DEFAULT_NEXUS_LOOP_PROFILE,
  DEFAULT_VISIBLE_LOOP_PROFILE,
  getVisibleLoopCommandName,
  getVisibleLoopHumanLabel,
  getVisibleLoopIntercomEventPrefix,
  getVisibleLoopTitle,
  type VisibleLoopCommandProfile,
} from "./visibleLoopProfiles.ts";
export {
  DEFAULT_NEXUS_LOOP_PROMPTS,
  DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT,
  DEFAULT_VISIBLE_LOOP_PROMPTS,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  GOVERNED_DEEP_REVIEW_PROMPT,
  listMissingVisibleLoopPromptTemplates,
  type VisibleLoopPromptExpansion,
} from "./visibleLoopPromptTemplates.ts";
export type { ContinueVisibleLoopInNewSession } from "./visibleLoopRecovery.ts";
export {
  getVisibleLoopStateDir,
  getVisibleLoopStatusPath,
  writeVisibleLoopRunConfig,
} from "./visibleLoopState.ts";
export {
  NEXUS_LOOP_COMMAND,
  VISIBLE_LOOP_CHILD_COMMAND,
  VISIBLE_LOOP_CHILD_COMPLETE_COMMAND,
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopCommandParseResult,
  type VisibleLoopCommitDelegation,
  type VisibleLoopExecutionBinding,
  type VisibleLoopReportBack,
  type VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

export interface VisibleLoopChildRunnerOptions {
  continueInNewSession?: ContinueVisibleLoopInNewSession;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTimeoutMs?: number;
  continuationStartTimeoutMs?: number;
  continuationStartPollIntervalMs?: number;
  readContinuationStatusCursor?: (config: VisibleLoopRunConfig, env: NodeJS.ProcessEnv) => number;
  deliveryAckTimeoutMs?: number;
  deliveryAckTimer?: VisibleLoopTimerRuntime;
  candidateCloseout?: SelfEvolutionCandidateCloseout;
  governedDeepReviewPreflight?: RunVisibleLoopGovernedPreflight;
}

type PeerMessagingModule = {
  createPeerMessagingRuntime(options: {
    id: string;
    name?: string;
    cwd: string;
    model: string;
    packageRoot?: string;
  }): Promise<PeerMessagingRuntime>;
};

const DEFAULT_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS = 10_000;
let visibleLoopRuntimeGeneration = claimVisibleLoopRuntimeGeneration();

function isCurrentVisibleLoopRuntime(): boolean {
  return ownsVisibleLoopRuntimeGeneration(visibleLoopRuntimeGeneration);
}
const MAX_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS = 120_000;
export function createVisibleLoopRunConfig(input: {
  loopCount: number;
  cwd: string;
  reportBack: VisibleLoopReportBack;
  parentPeerTarget?: string;
  commandName?: string;
  prompts?: readonly string[];
  runId?: string;
  runIdPrefix?: string;
  title?: string;
  commitDelegation?: VisibleLoopCommitDelegation;
  executionBinding: VisibleLoopExecutionBinding;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
}): VisibleLoopRunConfig {
  assertExecutionBindingEnvelopeConsistency(input.executionBinding, input.selfEvolutionEnvelope);
  const commandName = normalizeVisibleLoopCommandName(input.commandName ?? input.runIdPrefix);
  const runIdPrefix = normalizeRunIdPrefix(input.runIdPrefix ?? commandName ?? "visible-loop");
  return {
    schemaVersion: 1,
    runId: input.runId ?? `${runIdPrefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    loopCount: input.loopCount,
    cwd: input.cwd,
    ...(commandName ? { commandName } : {}),
    prompts: buildVisibleLoopPrompts(
      input.prompts ?? DEFAULT_VISIBLE_LOOP_PROMPTS,
      input.selfEvolutionEnvelope,
    ),
    reportBack: input.reportBack,
    executionBinding: input.executionBinding,
    ...(input.parentPeerTarget ? { parentPeerTarget: input.parentPeerTarget } : {}),
    ...(input.commitDelegation ? { commitDelegation: input.commitDelegation } : {}),
    productPostureTarget: resolveVisibleLoopProductPostureTarget(input.cwd),
    ...(input.selfEvolutionEnvelope ? { selfEvolutionEnvelope: input.selfEvolutionEnvelope } : {}),
    title: input.title ?? "Visible loop",
    createdAt: new Date().toISOString(),
  };
}

function assertExecutionBindingEnvelopeConsistency(
  binding: VisibleLoopExecutionBinding,
  envelope: SelfEvolutionExecutionEnvelope | undefined,
): void {
  if (binding.mode === "self_evolution_candidate") {
    if (!envelope || envelope.candidateId !== binding.candidateId) {
      throw new TypeError(
        "self-evolution candidate binding requires a matching selfEvolutionEnvelope",
      );
    }
    return;
  }
  if (envelope) {
    throw new TypeError("selfEvolutionEnvelope requires self_evolution_candidate binding mode");
  }
}

function buildVisibleLoopPrompts(
  prompts: readonly string[],
  envelope: SelfEvolutionExecutionEnvelope | undefined,
): string[] {
  const rendered = [...prompts];
  if (!envelope || rendered.length === 0) return rendered;
  rendered[0] = `${renderSelfEvolutionExecutionMembrane(envelope)}\n\n${rendered[0]}`;
  return rendered;
}

function resolveVisibleLoopProductPostureTarget(cwd: string): VisibleLoopProductPostureTarget {
  const productPosturePath = resolve(cwd, "docs", "project", "product-posture.md");
  const visionPath = resolve(cwd, "docs", "project", "vision.md");
  return {
    cwd,
    productPosturePath,
    productPostureExists: existsSync(productPosturePath),
    visionPath,
    visionExists: existsSync(visionPath),
  };
}

function normalizeRunIdPrefix(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "visible-loop";
}

export function resolveParentPeerTarget(ctx: VisibleLoopContext): string | undefined {
  const raw = ctx.sessionManager?.getSessionId?.()?.trim();
  if (!raw) return undefined;
  const normalized = raw.startsWith("session-") ? raw : `session-${raw}`;
  return normalized.replace(/[^a-zA-Z0-9-]/g, "-");
}

function getVisibleLoopLeaseOwner(ctx: VisibleLoopContext): VisibleLoopLeaseOwner | undefined {
  const sessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!sessionId) return undefined;
  return {
    sessionId,
    processId: process.pid,
    processIncarnation: VISIBLE_LOOP_PROCESS_INCARNATION,
  };
}

export async function startVisibleLoopChildRunner(
  configPathArg: string | undefined,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): Promise<void> {
  if (!isCurrentVisibleLoopRuntime()) return;
  const childArgs = parseVisibleLoopChildArgs(configPathArg);
  if (!childArgs.ok) {
    ctx.ui?.notify?.(`${childArgs.error}\n${childArgs.usage}`, "warning");
    return;
  }
  const { configPath, claimToken } = childArgs;

  const configResult = loadVisibleLoopRunConfig(configPath, env);
  if (!configResult.ok) {
    ctx.ui?.notify?.(`visible-loop child failed: ${configResult.error}`, "error");
    return;
  }

  const config = configResult.config;
  const pointerAtEntry = resolveActiveVisibleLoopPointer(ctx, env);
  if (pointerAtEntry.kind === "blocked") {
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} child ignored: another session owns the active visible-loop runtime`,
      "warning",
    );
    return;
  }
  if (pointerAtEntry.kind === "owned" && pointerAtEntry.state.config.runId !== config.runId) {
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} child ignored: this session already owns another active visible-loop run`,
      "warning",
    );
    return;
  }
  const candidateBinding = validatePersistedSelfEvolutionBinding(config.selfEvolutionEnvelope, {
    cwd: config.cwd,
    parentPeerTarget: config.parentPeerTarget,
  });
  if (!candidateBinding.ok) {
    ctx.ui?.notify?.(`visible-loop child failed: ${candidateBinding.error}`, "error");
    return;
  }
  const sendUserMessage = getSendUserMessage(pi);
  if (!sendUserMessage) {
    ctx.ui?.notify?.("visible-loop child failed: pi.sendUserMessage is unavailable", "error");
    return;
  }

  const restoredIterations = readCompletedVisibleLoopIterations(config, env);
  if (restoredIterations >= config.loopCount) {
    ctx.ui?.setWidget?.(`${getVisibleLoopCommandName(config)}-plan`, undefined);
    ctx.ui?.notify?.("visible-loop child ignored: loop is already complete", "warning");
    return;
  }

  let governedDeepReviewPreflight: VisibleLoopGovernedPreflightReceipt | undefined =
    pointerAtEntry.kind === "owned" ? pointerAtEntry.state.governedDeepReviewPreflight : undefined;
  let preflightPreparedHere = false;
  let governedDeepReviewAttemptNonce: string | undefined;
  let bindGovernedDeepReviewPreflightToolCall =
    pointerAtEntry.kind === "owned"
      ? pointerAtEntry.state.bindGovernedDeepReviewPreflightToolCall
      : undefined;
  const releaseGovernedDeepReviewAttempt = (): boolean => {
    if (!governedDeepReviewAttemptNonce) return true;
    const released = releaseVisibleLoopGovernedPreflightAttempt(
      config,
      governedDeepReviewAttemptNonce,
      env,
    );
    if (released) governedDeepReviewAttemptNonce = undefined;
    return released;
  };
  const cancelPreparedPreflight = (reason: string): boolean => {
    if (!preflightPreparedHere || !governedDeepReviewPreflight) return true;
    const cancelled = runnerOptions.governedDeepReviewPreflight
      ? runnerOptions.governedDeepReviewPreflight.cancel?.(governedDeepReviewPreflight.nonce) ===
        true
      : cancelOwnerVisibleLoopGovernedPreflight(governedDeepReviewPreflight.nonce);
    preflightPreparedHere = false;
    const attemptReleased = cancelled && releaseGovernedDeepReviewAttempt();
    if (!cancelled || !attemptReleased) {
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} preflight cleanup is unverified after ${reason}; reload before governed execution`,
        "error",
      );
    }
    return cancelled && attemptReleased;
  };
  const requiresGovernedDeepReviewPreflight = config.prompts.some((prompt) =>
    isGovernedDeepReviewPrompt(config, prompt),
  );
  if (requiresGovernedDeepReviewPreflight && !governedDeepReviewPreflight) {
    const preflightOwner = getVisibleLoopLeaseOwner(ctx);
    if (preflightOwner) {
      const leaseBeforePreflight = readVisibleLoopIterationLease(config.runId, env);
      if (!leaseBeforePreflight.ok) {
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(config)} child rejected before governed preflight: ${leaseBeforePreflight.error}`,
          "error",
        );
        return;
      }
      const lease = leaseBeforePreflight.value;
      const expectedIteration = restoredIterations + 1;
      const sameOwner = Boolean(
        lease &&
          lease.owner.sessionId === preflightOwner.sessionId &&
          lease.owner.processId === preflightOwner.processId &&
          lease.owner.processIncarnation === preflightOwner.processIncarnation,
      );
      const canEnterLease = lease
        ? (lease.status === "ACTIVE" &&
            lease.iteration === expectedIteration &&
            !claimToken &&
            sameOwner) ||
          (lease.status === "LAUNCHING" &&
            lease.iteration === expectedIteration &&
            claimToken === lease.claimToken) ||
          (lease.status === "FAILED" && lease.iteration === expectedIteration && !claimToken)
        : expectedIteration === 1 && !claimToken;
      if (!canEnterLease) {
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(config)} child rejected before governed preflight: the persisted iteration lease does not admit this session`,
          "error",
        );
        return;
      }
    }
    const nonce = randomUUID();
    const claimed = claimVisibleLoopGovernedPreflightAttempt(config, nonce, env);
    if (!claimed.ok) {
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} child rejected: this run config was invalidated or another governed deep-review preflight attempt is already authoritative (${claimed.error})`,
        "error",
      );
      return;
    }
    governedDeepReviewAttemptNonce = nonce;
    if (hasVisibleLoopGovernedPreflightFailed(config, env)) {
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} child rejected: this run config was invalidated by a prior governed deep-review preflight failure or indeterminate attempt`,
        "error",
      );
      return;
    }
    const armed = appendAuthoritativeVisibleLoopStatus(
      config,
      { event: "governed_deep_review_preflight_started", nonce },
      env,
    );
    if (!armed.ok) {
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review preflight could not be armed durably: ${armed.error}`,
        "error",
      );
      return;
    }
    const preflight = await (
      runnerOptions.governedDeepReviewPreflight ?? runOwnerVisibleLoopGovernedPreflight
    )({
      nonce,
      runId: config.runId,
      cwd: config.cwd,
      callerModuleUrl: import.meta.url,
    });
    if (!preflight.ok) {
      const invalidated = appendAuthoritativeVisibleLoopStatus(
        config,
        {
          event: "governed_deep_review_preflight_failed_closed",
          nonce,
          failureClass: preflight.failureClass ?? "unknown",
          reason: preflight.error,
          rollbackAttempted: preflight.rollbackAttempted ?? false,
          rollbackSucceeded: preflight.rollbackSucceeded ?? false,
        },
        env,
      );
      ctx.ui?.notify?.(
        invalidated.ok
          ? `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review preflight failed closed: ${preflight.error}`
          : `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review preflight failed closed and terminal invalidation could not persist (${invalidated.error}); the armed attempt blocks retry`,
        "error",
      );
      return;
    }
    governedDeepReviewPreflight = preflight.receipt;
    preflightPreparedHere = true;
    bindGovernedDeepReviewPreflightToolCall = runnerOptions.governedDeepReviewPreflight
      ? runnerOptions.governedDeepReviewPreflight.bindToolCall
      : bindOwnerVisibleLoopGovernedPreflightToolCall;
    if (!bindGovernedDeepReviewPreflightToolCall) {
      const rollbackSucceeded = cancelPreparedPreflight("missing exact tool-call binder");
      const invalidated = appendAuthoritativeVisibleLoopStatus(
        config,
        {
          event: "governed_deep_review_preflight_failed_closed",
          nonce,
          failureClass: "preflight_tool_call_binder_missing",
          reason: "Governed deep-review preflight owner provided no exact tool-call binder.",
          rollbackAttempted: true,
          rollbackSucceeded,
        },
        env,
      );
      ctx.ui?.notify?.(
        invalidated.ok
          ? `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review tool-call binding is unavailable`
          : `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review tool-call binding is unavailable and terminal invalidation could not persist (${invalidated.error}); the armed attempt blocks retry`,
        "error",
      );
      return;
    }
    const succeeded = appendAuthoritativeVisibleLoopStatus(
      config,
      {
        event: "governed_deep_review_preflight_succeeded",
        nonce: preflight.receipt.nonce,
        receiptDigest: preflight.receipt.receiptDigest,
        sourceRoot: preflight.receipt.sourceRoot,
        sourceCommit: preflight.receipt.sourceCommit,
        registryId: preflight.receipt.registryId,
        activatedTools: preflight.receipt.activatedTools,
      },
      env,
    );
    if (!succeeded.ok) {
      cancelPreparedPreflight("authoritative success persistence failure");
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} child failed before start: governed deep-review success could not persist authoritatively (${succeeded.error}); the armed attempt blocks retry`,
        "error",
      );
      return;
    }
  }

  const owner = getVisibleLoopLeaseOwner(ctx);
  if (!owner) {
    cancelPreparedPreflight("missing session identity");
    ctx.ui?.notify?.("visible-loop child failed: session identity is unavailable", "error");
    return;
  }
  const leaseEntry = enterVisibleLoopIterationLease({
    runId: config.runId,
    iteration: restoredIterations + 1,
    owner,
    ...(claimToken ? { claimToken } : {}),
    env,
  });
  if (!leaseEntry.ok) {
    cancelPreparedPreflight("iteration lease rejection");
    ctx.ui?.notify?.(`visible-loop child rejected: ${leaseEntry.error}`, "error");
    return;
  }

  const pointerAfterLease = resolveActiveVisibleLoopPointer(ctx, env);
  if (pointerAfterLease.kind === "blocked") {
    cancelPreparedPreflight("active runtime ownership change");
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} child ignored: active runtime ownership changed`,
      "warning",
    );
    return;
  }
  const existingState =
    (pointerAfterLease.kind === "owned" && pointerAfterLease.state.config.runId === config.runId
      ? pointerAfterLease.state
      : null) ??
    (pointerAfterLease.kind === "missing"
      ? restoreActiveVisibleLoopState(
          pi,
          ctx,
          env,
          runnerOptions,
          governedDeepReviewPreflight,
          bindGovernedDeepReviewPreflightToolCall,
        )
      : null);
  if (existingState?.config.runId === config.runId && !existingState.stopped) {
    const preparedPreflightTransferred = Boolean(
      preflightPreparedHere &&
        existingState.governedDeepReviewPreflight?.nonce === governedDeepReviewPreflight?.nonce,
    );
    if (!preparedPreflightTransferred && !cancelPreparedPreflight("existing-state recovery")) {
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} recovery failed closed: replacement preflight cleanup is unverified`,
        "error",
      );
      return;
    }
    const expectedIteration = restoredIterations + 1;
    const existingPlan = existingState.plan;
    const resumeBinding =
      leaseEntry.value === "resumed_owner" && existingPlan?.iteration === expectedIteration
        ? bindVisibleLoopActivePlan({
            runId: config.runId,
            iteration: expectedIteration,
            planId: existingPlan.planId,
            owner,
            env,
          })
        : { ok: false as const, error: "active snapshot does not match the resumed run lease" };
    if (!resumeBinding.ok) {
      if (preparedPreflightTransferred) cancelPreparedPreflight("recovery lease binding failure");
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(config)} recovery failed closed: ${resumeBinding.error}`,
        "error",
      );
      return;
    }
    if (!existingPlan) {
      if (preparedPreflightTransferred) cancelPreparedPreflight("missing recovery plan");
      return;
    }
    if (!installActiveVisibleLoopPointer(existingState, ctx, env)) {
      if (preparedPreflightTransferred) cancelPreparedPreflight("recovery pointer installation");
      return;
    }
    if (preparedPreflightTransferred) {
      preflightPreparedHere = false;
      if (!releaseGovernedDeepReviewAttempt()) {
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(config)} resumed with an unreleased preflight attempt claim; reload recovery will remain blocked`,
          "error",
        );
      }
    }
    renderVisibleLoopPlan(existingState, ctx);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} resumed without duplicate prompt submission`,
      "info",
    );
    if (!existingPlan.frontier) {
      submitNextVisibleLoopFrontier(existingState, ctx, env);
    } else {
      armVisibleLoopDeliveryAckWatchdog(existingState, ctx, env);
    }
    return;
  }
  const finalizedPriorIteration = Boolean(
    existingState?.plan?.lifecycle === "finalized" &&
      existingState.plan.iteration === restoredIterations,
  );
  if (
    leaseEntry.value === "resumed_owner" &&
    (!existingState || existingState.config.runId !== config.runId)
  ) {
    cancelPreparedPreflight("missing resumed-owner snapshot");
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} cannot restart automatically: active owner snapshot is unavailable`,
      "error",
    );
    return;
  }
  if ((existingState || lastVisibleLoopRecoveryFailure) && !finalizedPriorIteration) {
    cancelPreparedPreflight("failed active-state recovery");
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} cannot restart automatically: ${
        lastVisibleLoopRecoveryFailure ??
        existingState?.plan?.failureReason ??
        "prior plan failed closed"
      }`,
      "error",
    );
    return;
  }

  const state: ActiveVisibleLoopState = {
    ownerSessionId: owner.sessionId,
    config,
    configPath,
    completedPromptCount: restoredIterations * getVisibleLoopCompletionTurnCount(config),
    completedIterations: restoredIterations,
    sendUserMessage,
    peerRuntime: null,
    createPeerRuntime: runnerOptions.createPeerRuntime,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    continuationStartTimeoutMs: resolveVisibleLoopContinuationStartTimeoutMs(
      env,
      runnerOptions.continuationStartTimeoutMs,
    ),
    continuationStartPollIntervalMs: resolveVisibleLoopContinuationStartPollIntervalMs(
      runnerOptions.continuationStartPollIntervalMs,
    ),
    readContinuationStatusCursor:
      runnerOptions.readContinuationStatusCursor ?? readVisibleLoopContinuationStatusCursor,
    deliveryAckTimeoutMs: resolveVisibleLoopDeliveryAckTimeoutMs(env, runnerOptions),
    deliveryAckTimer: runnerOptions.deliveryAckTimer ?? DEFAULT_VISIBLE_LOOP_TIMER,
    deliveryAckWatchdog: null,
    stopped: false,
    plan: null,
    hostProcessId: process.pid,
    hostProcessIncarnation: VISIBLE_LOOP_PROCESS_INCARNATION,
    continueInNewSession: runnerOptions.continueInNewSession,
    governedDeepReviewPreflight,
    delegatedCommit: createVisibleLoopDelegatedCommitRuntime(),
    continuationStartProof: null,
  };
  state.bindGovernedDeepReviewPreflightToolCall = bindGovernedDeepReviewPreflightToolCall;
  const initialPersistence = persistVisibleLoopStateAndRetireFailedOwner(state, ctx, env);
  if (!initialPersistence.ok) {
    cancelPreparedPreflight("active-state persistence failure");
    state.stopped = true;
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} stopped: active-state persistence failed: ${initialPersistence.error}`,
      "error",
    );
    return;
  }

  if (!installActiveVisibleLoopPointer(state, ctx, env)) {
    cancelPreparedPreflight("active runtime pointer installation failure");
    state.stopped = true;
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} stopped: active runtime pointer ownership changed`,
      "error",
    );
    return;
  }
  preflightPreparedHere = false;
  if (!releaseGovernedDeepReviewAttempt()) {
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(config)} started with an unreleased preflight attempt claim; reload recovery will remain blocked`,
      "error",
    );
  }
  const statusKey = getVisibleLoopCommandName(config);
  const loopLabel = getVisibleLoopHumanLabel(config);
  ctx.ui?.setStatus?.(statusKey, `loop ${restoredIterations}/${config.loopCount}`);
  ctx.ui?.notify?.(
    `${loopLabel} started: iteration ${restoredIterations + 1}/${config.loopCount} (${config.prompts.length} prompt(s))`,
    "info",
  );

  if (restoredIterations === 0) {
    await sendVisibleLoopIntercom(
      state,
      ctx,
      `PEER_ACK peer_run_id=${config.runId}: ${loopLabel} started (${config.loopCount} iteration(s), ${config.prompts.length} prompt(s) each)`,
      env,
    );
  }
  queueVisibleLoopIteration(state, ctx, env, () => {
    if (state.stopped || !state.plan) return false;
    const activeLease = readVisibleLoopIterationLease(config.runId, env);
    const continuationStartProof =
      claimToken && activeLease.ok && activeLease.value
        ? createVisibleLoopChildStartProof(state, claimToken, activeLease.value)
        : null;
    if (claimToken && !continuationStartProof) {
      stopVisibleLoopPlanFailedClosed(
        state,
        ctx,
        env,
        "continuation child could not bind its exact consumed launch claim to the ACTIVE frontier",
        "continuation child-start identity is unavailable",
      );
      return false;
    }
    state.continuationStartProof = continuationStartProof;
    if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) return false;
    const childStarted = appendAuthoritativeVisibleLoopStatus(
      config,
      {
        event: "child_started",
        iteration: restoredIterations + 1,
        reportBack: config.reportBack,
        parentPeerTarget: config.parentPeerTarget ?? null,
        productPostureTarget: config.productPostureTarget ?? null,
        proof: continuationStartProof,
      },
      env,
    );
    if (!childStarted.ok) {
      stopVisibleLoopPlanFailedClosed(
        state,
        ctx,
        env,
        `authoritative child-start proof persistence failed: ${childStarted.error}`,
        "authoritative continuation child-start proof could not be persisted",
      );
      return false;
    }
    return true;
  });
}

export function handleVisibleLoopMessageStart(
  event: { message?: unknown },
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime()) return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped || !state.plan) return;
  const text = getVisibleLoopUserMessageText(event.message);
  if (!text) return;
  const observation = observeVisibleLoopPlanStep(state.plan, text);
  if (!observation || !observation.changed) return;
  clearVisibleLoopDeliveryAckWatchdog(state, state.plan.planId, observation.step.index);

  appendVisibleLoopStatus(
    state.config,
    {
      event: "prompt_delivery_observed",
      iteration: state.plan.iteration,
      promptIndex: observation.step.index + 1,
      ...getVisibleLoopPlanCounts(state.plan),
    },
    env,
  );
  persistAndRenderVisibleLoopPlan(state, ctx, env);
}

export function handleVisibleLoopAgentStart(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime()) return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (state?.plan) renderVisibleLoopPlan(state, ctx);
}

function stopVisibleLoopForDelegatedCommitFailure(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  reason: string,
  event: string,
  toolCallId?: string,
): void {
  clearVisibleLoopDeliveryAckWatchdog(state);
  state.stopped = true;
  failVisibleLoopDelegatedCommitRuntime(state);
  if (state.plan) failVisibleLoopPlan(state.plan, `delegated commit ${reason}`);
  appendVisibleLoopStatus(
    state.config,
    {
      event,
      iteration: state.plan?.iteration ?? null,
      promptIndex: state.plan?.frontier ? state.plan.frontier.stepIndex + 1 : null,
      toolCallId: toolCallId ?? null,
      reason,
      effectDisposition: "indeterminate_unless_asc_receipt_proves_otherwise",
    },
    env,
  );
  // Keep the exact stopped runtime pointer in-process so a same-iteration retry is blocked.
  persistActiveVisibleLoopState(state, ctx, env);
  renderVisibleLoopPlan(state, ctx);
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} stopped: delegated commit ${reason}`,
    "error",
  );
}

export function handleVisibleLoopToolCall(
  event: { toolCallId?: string; toolName?: string; input?: unknown },
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): { block: true; reason: string } | undefined {
  if (!isCurrentVisibleLoopRuntime() || event.toolName !== "dispatch_subagent") return undefined;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state) {
    return lastVisibleLoopRecoveryFailure
      ? {
          block: true,
          reason:
            "visible-loop blocked delegated commit because active-state recovery failed closed",
        }
      : undefined;
  }
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return undefined;
  const outcome = admitVisibleLoopDelegatedCommit(state, event);
  if (outcome === "ignored") return undefined;
  if (outcome === "rejected") {
    if (!state.stopped) {
      stopVisibleLoopForDelegatedCommitFailure(
        state,
        ctx,
        env,
        "request correlation failed",
        "commit_delegation_tool_call_blocked",
        event.toolCallId,
      );
    }
    return {
      block: true,
      reason: "visible-loop blocked an uncorrelated or duplicate delegated commit dispatch",
    };
  }
  appendVisibleLoopStatus(
    state.config,
    {
      event: "commit_delegation_tool_call_admitted",
      iteration: state.plan?.iteration ?? null,
      promptIndex: state.plan?.frontier ? state.plan.frontier.stepIndex + 1 : null,
      toolCallId: event.toolCallId,
    },
    env,
  );
  const persisted = persistActiveVisibleLoopState(state, ctx, env);
  if (!persisted.ok) {
    stopVisibleLoopForDelegatedCommitFailure(
      state,
      ctx,
      env,
      `controller persistence failed: ${persisted.error}`,
      "commit_delegation_persistence_failed_closed",
      event.toolCallId,
    );
    return {
      block: true,
      reason: "visible-loop blocked delegated commit because controller persistence failed",
    };
  }
  return undefined;
}

export function handleVisibleLoopToolExecutionStart(
  event: { toolCallId?: string; toolName?: string; args?: unknown },
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime()) return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || !state.plan) return;
  if (event.toolName === "dispatch_subagent") {
    if (state.stopped) return;
    const outcome = beginVisibleLoopDelegatedCommit(state, event);
    if (outcome.kind === "ignored") return;
    if (outcome.kind === "rejected") {
      stopVisibleLoopForDelegatedCommitFailure(
        state,
        ctx,
        env,
        outcome.reason,
        outcome.reason === "duplicate dispatch rejected"
          ? "commit_delegation_duplicate_call_rejected"
          : "commit_delegation_request_rejected",
        event.toolCallId,
      );
      return;
    }
    appendVisibleLoopStatus(
      state.config,
      {
        event: "commit_delegation_tool_started",
        iteration: state.plan.iteration,
        promptIndex: state.plan.frontier ? state.plan.frontier.stepIndex + 1 : null,
        toolCallId: outcome.toolCallId,
      },
      env,
    );
    const persisted = persistActiveVisibleLoopState(state, ctx, env);
    if (!persisted.ok) {
      stopVisibleLoopForDelegatedCommitFailure(
        state,
        ctx,
        env,
        `controller persistence failed: ${persisted.error}`,
        "commit_delegation_persistence_failed_closed",
        outcome.toolCallId,
      );
    }
    return;
  }
  if (state.stopped || event.toolName !== "vault_execute_template") return;
  const frontier = state.plan.frontier;
  const runningStep = frontier ? state.plan.steps[frontier.stepIndex] : undefined;
  if (frontier?.state !== "running" || !runningStep?.governedBarrier) return;
  const args = event.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return;
  const record = args as Record<string, unknown>;
  if (
    typeof event.toolCallId !== "string" ||
    !event.toolCallId.trim() ||
    record.template_name !== "deep-review" ||
    record.objective !== GOVERNED_DEEP_REVIEW_OBJECTIVE
  ) {
    return;
  }
  const outcome = beginVisibleLoopBarrierAttempt(state.plan, runningStep.index, event.toolCallId);
  if (outcome === "duplicate_call") {
    clearVisibleLoopDeliveryAckWatchdog(state);
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "governed_deep_review_duplicate_failed_closed",
        iteration: state.plan.iteration,
        promptIndex: runningStep.index + 1,
        toolCallId: event.toolCallId,
      },
      env,
    );
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} stopped: duplicate governed deep-review call`,
      "error",
    );
    return;
  }
  if (outcome !== "started") return;
  const preflightReceipt = state.governedDeepReviewPreflight;
  if (
    !preflightReceipt ||
    !state.bindGovernedDeepReviewPreflightToolCall?.(preflightReceipt.nonce, event.toolCallId)
  ) {
    clearVisibleLoopDeliveryAckWatchdog(state);
    failVisibleLoopPlan(
      state.plan,
      "governed deep-review tool call did not bind to the exact owner preflight",
    );
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "governed_deep_review_tool_binding_failed_closed",
        iteration: state.plan.iteration,
        promptIndex: runningStep.index + 1,
        toolCallId: event.toolCallId,
      },
      env,
    );
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} stopped: governed deep-review tool call did not match its preflight`,
      "error",
    );
    return;
  }
  appendVisibleLoopStatus(
    state.config,
    {
      event: "governed_deep_review_tool_started",
      iteration: state.plan.iteration,
      promptIndex: runningStep.index + 1,
      toolCallId: event.toolCallId,
    },
    env,
  );
  persistAndRenderVisibleLoopPlan(state, ctx, env);
}

export function handleVisibleLoopToolResult(
  event: {
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    details?: unknown;
  },
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime() || event.toolName !== "dispatch_subagent") return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped || !state.plan) return;
  const outcome = settleVisibleLoopDelegatedCommitExecution(state, event);
  if (outcome.kind === "ignored") return;
  if (outcome.kind !== "settled") {
    const failure =
      outcome.kind === "execution_policy_drift"
        ? {
            reason: "actual executed timeout/allowUnlimited policy drifted after admission",
            event: "commit_delegation_execution_policy_drift_failed_closed",
          }
        : outcome.kind === "duplicate_settlement"
          ? {
              reason: "duplicate execution settlement rejected",
              event: "commit_delegation_duplicate_settlement_rejected",
            }
          : {
              reason: "uncorrelated execution settlement rejected",
              event: "commit_delegation_uncorrelated_settlement_rejected",
            };
    stopVisibleLoopForDelegatedCommitFailure(
      state,
      ctx,
      env,
      failure.reason,
      failure.event,
      event.toolCallId,
    );
    return;
  }
  appendVisibleLoopStatus(
    state.config,
    {
      event: "commit_delegation_execution_policy_settled",
      iteration: state.plan.iteration,
      promptIndex: state.plan.frontier ? state.plan.frontier.stepIndex + 1 : null,
      toolCallId: event.toolCallId,
      timeout: outcome.policy.timeout,
      allowUnlimited: outcome.policy.allowUnlimited,
    },
    env,
  );
  const persisted = persistActiveVisibleLoopState(state, ctx, env);
  if (!persisted.ok) {
    stopVisibleLoopForDelegatedCommitFailure(
      state,
      ctx,
      env,
      `controller persistence failed: ${persisted.error}`,
      "commit_delegation_persistence_failed_closed",
      event.toolCallId,
    );
  }
}

export function handleVisibleLoopToolExecutionEnd(
  event: {
    toolCallId?: string;
    toolName?: string;
    result?: { details?: unknown };
    isError?: boolean;
  },
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime()) return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || !state.plan) return;
  if (event.toolName === "dispatch_subagent") {
    if (state.stopped) return;
    const outcome = completeVisibleLoopDelegatedCommit(state, event);
    if (outcome.kind === "ignored") return;
    if (outcome.kind !== "succeeded") {
      const failure =
        outcome.kind === "duplicate_receipt"
          ? {
              reason: "duplicate receipt rejected",
              event: "commit_delegation_duplicate_receipt_rejected",
            }
          : outcome.kind === "uncorrelated_result"
            ? {
                reason: "uncorrelated result rejected",
                event: "commit_delegation_uncorrelated_result_rejected",
              }
            : {
                reason: "did not return an exact settled ASC receipt",
                event: "commit_delegation_failed_closed",
              };
      stopVisibleLoopForDelegatedCommitFailure(
        state,
        ctx,
        env,
        failure.reason,
        failure.event,
        event.toolCallId,
      );
      return;
    }
    appendVisibleLoopStatus(
      state.config,
      {
        event: "commit_delegation_succeeded",
        iteration: state.plan.iteration,
        promptIndex: state.plan.frontier ? state.plan.frontier.stepIndex + 1 : null,
        toolCallId: event.toolCallId,
        dispatchId: outcome.receipt.dispatchId,
        attemptId: outcome.receipt.attemptId,
        effectCorrelationId: outcome.receipt.consumerCorrelationId,
        sessionName: outcome.receipt.sessionName,
        recordedAt: outcome.receipt.recordedAt,
        receiptPath: outcome.receipt.receiptPath,
        receiptDigest: outcome.receipt.receiptDigest,
        effectDisposition: "settled",
      },
      env,
    );
    const persisted = persistActiveVisibleLoopState(state, ctx, env);
    if (!persisted.ok) {
      stopVisibleLoopForDelegatedCommitFailure(
        state,
        ctx,
        env,
        `controller persistence failed: ${persisted.error}`,
        "commit_delegation_persistence_failed_closed",
        event.toolCallId,
      );
    }
    return;
  }
  if (state.stopped || event.toolName !== "vault_execute_template") return;
  const frontier = state.plan.frontier;
  if (frontier?.state !== "running" || typeof event.toolCallId !== "string") return;
  const details = event.result?.details;
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  const expectedPreflight = state.governedDeepReviewPreflight;
  const validReceipt = Boolean(
    event.isError !== true &&
      record?.ok === true &&
      record.templateName === "deep-review" &&
      record.executionSurface === "workflow_execute" &&
      typeof record.handoffId === "string" &&
      record.handoffId.trim() &&
      record.status === "done" &&
      expectedPreflight &&
      record.preflightNonce === expectedPreflight.nonce &&
      record.preflightReceiptDigest === expectedPreflight.receiptDigest &&
      record.preflightRegistryId === expectedPreflight.registryId,
  );
  const outcome = completeVisibleLoopBarrierAttempt(
    state.plan,
    frontier.stepIndex,
    event.toolCallId,
    validReceipt
      ? {
          ok: true,
          handoffId: String(record?.handoffId),
          ...(typeof record?.runId === "string" ? { runId: record.runId } : {}),
        }
      : { ok: false, reason: "missing successful vault_execute_template workflow receipt" },
  );
  if (outcome === "ignored") return;
  if (expectedPreflight) {
    if (!validReceipt) cancelOwnerVisibleLoopGovernedPreflight(expectedPreflight.nonce);
    forgetOwnerVisibleLoopGovernedPreflight(expectedPreflight.nonce);
  }
  if (outcome === "failed_closed") {
    clearVisibleLoopDeliveryAckWatchdog(state);
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "governed_deep_review_failed_closed",
        iteration: state.plan.iteration,
        promptIndex: frontier.stepIndex + 1,
        reason: state.plan.failureReason,
      },
      env,
    );
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    return;
  }
  appendVisibleLoopStatus(
    state.config,
    {
      event: "governed_deep_review_succeeded",
      iteration: state.plan.iteration,
      promptIndex: frontier.stepIndex + 1,
      handoffId: record?.handoffId,
      workflowRunId: record?.runId ?? null,
      preflightNonce: record?.preflightNonce ?? null,
      preflightReceiptDigest: record?.preflightReceiptDigest ?? null,
    },
    env,
  );
  persistAndRenderVisibleLoopPlan(state, ctx, env);
}

export function handleVisibleLoopAgentSettled(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  if (!isCurrentVisibleLoopRuntime()) return;
  const state = getOrRestoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped || !state.plan) return;
  const settledStep = settleRunningVisibleLoopPlanStep(state.plan);
  if (!settledStep) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "agent_settled_ignored",
        reason: "no exact correlated visible-loop frontier is running",
        iteration: state.plan.iteration,
        ...getVisibleLoopPlanCounts(state.plan),
      },
      env,
    );
    return;
  }

  state.completedPromptCount =
    state.completedIterations * state.plan.steps.length + state.plan.settledCount;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "agent_settled_observed",
      source: "agent_settled",
      pendingMessages: Boolean(ctx.hasPendingMessages?.()),
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
      promptIndex: settledStep.index + 1,
      completionMode: "single_executable_frontier_with_explicit_completion_prompt",
      ...getVisibleLoopPlanCounts(state.plan),
    },
    env,
  );

  if (settledStep.governedBarrier && !hasVisibleLoopBarrierSuccess(state.plan, settledStep.index)) {
    stopVisibleLoopPlanFailedClosed(
      state,
      ctx,
      env,
      "missing successful vault_execute_template workflow receipt",
      "governed deep-review did not complete successfully",
    );
    return;
  }
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) return;
  if (state.plan.settledCount < state.plan.steps.length) {
    submitNextVisibleLoopFrontier(state, ctx, env);
    return;
  }

  stopVisibleLoopPlanFailedClosed(
    state,
    ctx,
    env,
    "completion checkpoint settled without accepted completion",
    "completion checkpoint settled without acceptance",
  );
}

let activeVisibleLoop: ActiveVisibleLoopState | null = null;
let lastVisibleLoopRecoveryFailure: string | null = null;

type ActiveVisibleLoopPointerResolution =
  | { kind: "missing" }
  | { kind: "blocked" }
  | { kind: "owned"; state: ActiveVisibleLoopState };

function contextOwnsActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): boolean {
  const currentSessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!currentSessionId || currentSessionId !== state.ownerSessionId) return false;
  const lease = readVisibleLoopIterationLease(state.config.runId, env);
  return Boolean(
    lease.ok &&
      lease.value?.status === "ACTIVE" &&
      lease.value.owner.sessionId === state.ownerSessionId &&
      lease.value.owner.processId === state.hostProcessId &&
      lease.value.owner.processIncarnation === state.hostProcessIncarnation,
  );
}

function resolveActiveVisibleLoopPointer(
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): ActiveVisibleLoopPointerResolution {
  const candidate = activeVisibleLoop;
  if (!candidate) return { kind: "missing" };
  if (!contextOwnsActiveVisibleLoopState(candidate, ctx, env)) return { kind: "blocked" };
  return { kind: "owned", state: candidate };
}

function installActiveVisibleLoopPointer(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): boolean {
  if (!contextOwnsActiveVisibleLoopState(state, ctx, env)) return false;
  const existing = activeVisibleLoop;
  if (existing && existing !== state && !contextOwnsActiveVisibleLoopState(existing, ctx, env)) {
    return false;
  }
  activeVisibleLoop = state;
  return true;
}

function clearOwnedActiveVisibleLoopPointer(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): boolean {
  const resolved = resolveActiveVisibleLoopPointer(ctx, env);
  if (resolved.kind !== "owned" || resolved.state !== state) return false;
  activeVisibleLoop = null;
  return true;
}

function retireActiveVisibleLoopPointer(state: ActiveVisibleLoopState): void {
  if (activeVisibleLoop === state) activeVisibleLoop = null;
}

function getOrRestoreActiveVisibleLoopState(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  runnerOptions: VisibleLoopChildRunnerOptions,
): ActiveVisibleLoopState | null {
  const resolved = resolveActiveVisibleLoopPointer(ctx, env);
  if (resolved.kind === "owned") return resolved.state;
  if (resolved.kind === "blocked") return null;
  return restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
}

/** Test/reload harness hook: production reload naturally recreates module memory. */
export function resetVisibleLoopRuntimeForRecoveryTest(): void {
  visibleLoopRuntimeGeneration = claimVisibleLoopRuntimeGeneration();
  if (activeVisibleLoop) clearVisibleLoopDeliveryAckWatchdog(activeVisibleLoop);
  activeVisibleLoop = null;
  lastVisibleLoopRecoveryFailure = null;
}

function restoreActiveVisibleLoopState(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
  freshGovernedDeepReviewPreflight?: VisibleLoopGovernedPreflightReceipt,
  bindGovernedDeepReviewPreflightToolCall?: (nonce: string, toolCallId: string) => boolean,
): ActiveVisibleLoopState | null {
  const result = restorePersistedActiveVisibleLoopState(ctx, env, {
    sendUserMessage: getSendUserMessage(pi),
    createPeerRuntime: runnerOptions.createPeerRuntime,
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    continuationStartTimeoutMs: resolveVisibleLoopContinuationStartTimeoutMs(
      env,
      runnerOptions.continuationStartTimeoutMs,
    ),
    continuationStartPollIntervalMs: resolveVisibleLoopContinuationStartPollIntervalMs(
      runnerOptions.continuationStartPollIntervalMs,
    ),
    readContinuationStatusCursor:
      runnerOptions.readContinuationStatusCursor ?? readVisibleLoopContinuationStatusCursor,
    deliveryAckTimeoutMs: resolveVisibleLoopDeliveryAckTimeoutMs(env, runnerOptions),
    deliveryAckTimer: runnerOptions.deliveryAckTimer ?? DEFAULT_VISIBLE_LOOP_TIMER,
    continueInNewSession: runnerOptions.continueInNewSession,
    processIncarnation: VISIBLE_LOOP_PROCESS_INCARNATION,
    freshGovernedDeepReviewPreflight,
    bindGovernedDeepReviewPreflightToolCall,
    setActiveState(state) {
      installActiveVisibleLoopPointer(state, ctx, env);
    },
    persistAndRender(state) {
      return persistAndRenderVisibleLoopPlan(state, ctx, env);
    },
    armDeliveryAckWatchdog(state) {
      armVisibleLoopDeliveryAckWatchdog(state, ctx, env);
    },
  });
  lastVisibleLoopRecoveryFailure = result.failure;
  if (!result.state) return null;
  const resolved = resolveActiveVisibleLoopPointer(ctx, env);
  return resolved.kind === "owned" && resolved.state === result.state ? result.state : null;
}

function queueVisibleLoopIteration(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  afterFrontierSubmitted?: () => boolean,
): void {
  const prompts = getVisibleLoopPrompts(state.config);
  if (prompts.length === 0) {
    state.stopped = true;
    ctx.ui?.notify?.("visible-loop stopped: no prompts configured", "error");
    return;
  }

  const iteration = state.completedIterations + 1;
  resetVisibleLoopDelegatedCommitRuntime(state);
  const steps: VisibleLoopPlanStep[] = [];
  for (const [promptIndex, prompt] of prompts.entries()) {
    const expandedPrompt = expandVisibleLoopPromptTemplate(prompt, state.config.cwd);
    if (!expandedPrompt.ok) {
      stopVisibleLoopForPromptExpansionFailure(
        state,
        ctx,
        expandedPrompt,
        iteration,
        promptIndex + 1,
        env,
      );
      return;
    }
    const deliveryPrompt = maybeRenderDelegatedVisibleLoopPrompt(
      state,
      ctx,
      expandedPrompt,
      iteration,
      promptIndex + 1,
      env,
    );
    if (!deliveryPrompt) return;
    steps.push({
      index: steps.length,
      prompt: bindVisibleLoopExecutionPrompt(deliveryPrompt, state.config.executionBinding),
      label: labelVisibleLoopPlanStep(expandedPrompt, deliveryPrompt),
      kind: "prompt",
      governedBarrier: isGovernedDeepReviewPrompt(state.config, prompt),
    });
  }

  if (!visibleLoopDelegatesCompletion(state.config, prompts.slice(1))) {
    const completionPrompt = renderVisibleLoopCompletionPrompt({
      configPath: state.configPath,
      iteration,
      promptCount: prompts.length,
      productPosturePath: state.config.productPostureTarget?.productPosturePath,
      productPostureExists: state.config.productPostureTarget?.productPostureExists,
      visionPath: state.config.productPostureTarget?.visionPath,
      visionExists: state.config.productPostureTarget?.visionExists,
      selfEvolutionEnvelope: state.config.selfEvolutionEnvelope,
    });
    steps.push({
      index: steps.length,
      prompt: bindVisibleLoopExecutionPrompt(completionPrompt, state.config.executionBinding),
      label: "Explicit completion checkpoint",
      kind: "completion",
      governedBarrier: false,
    });
  }

  state.plan = createVisibleLoopPlanProgress(
    steps,
    iteration,
    `${state.config.runId}:${iteration}:${randomUUID()}`,
  );
  const owner = getVisibleLoopLeaseOwner(ctx);
  const planBinding = owner
    ? bindVisibleLoopActivePlan({
        runId: state.config.runId,
        iteration,
        planId: state.plan.planId,
        owner,
        env,
      })
    : { ok: false as const, error: "visible-loop session identity is unavailable" };
  if (!planBinding.ok) {
    failVisibleLoopPlan(state.plan, planBinding.error);
    state.stopped = true;
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} stopped: ${planBinding.error}`,
      "error",
    );
    return;
  }
  appendVisibleLoopStatus(
    state.config,
    {
      event: "iteration_planned",
      iteration,
      planId: state.plan.planId,
      sourcePromptCount: prompts.length,
      completionCommand: true,
      completionMode: "single_executable_frontier",
      ...getVisibleLoopPlanCounts(state.plan),
    },
    env,
  );
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) return;
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} planned iteration ${iteration}/${state.config.loopCount}; exactly one frontier step is executable`,
    "info",
  );
  submitNextVisibleLoopFrontier(state, ctx, env, afterFrontierSubmitted);
}

function submitNextVisibleLoopFrontier(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  afterFrontierSubmitted?: () => boolean,
): void {
  const plan = state.plan;
  if (!plan || state.stopped) return;
  const step = beginVisibleLoopFrontierSubmission(plan);
  if (!step) return;
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) return;
  const nativeFollowUp = step.index > 0;
  try {
    state.sendUserMessage(step.prompt, nativeFollowUp ? { deliverAs: "followUp" } : undefined);
  } catch (error) {
    stopVisibleLoopPlanFailedClosed(
      state,
      ctx,
      env,
      `prompt submission failed: ${error instanceof Error ? error.message : String(error)}`,
      "prompt submission failed",
    );
    return;
  }
  if (!markVisibleLoopFrontierSubmitted(plan)) {
    stopVisibleLoopPlanFailedClosed(
      state,
      ctx,
      env,
      "prompt submission state transition failed",
      "prompt submission state transition failed",
    );
    return;
  }
  if (afterFrontierSubmitted && !afterFrontierSubmitted()) return;
  appendVisibleLoopStatus(
    state.config,
    {
      event: step.kind === "completion" ? "completion_prompt_submitted" : "prompt_submitted",
      iteration: plan.iteration,
      planId: plan.planId,
      promptIndex: step.index + 1,
      deliveryMode: nativeFollowUp ? "pi_native_followUp" : "immediate_initial",
      deliveryAcknowledged: false,
      ...getVisibleLoopPlanCounts(plan),
    },
    env,
  );
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) {
    state.stopped = true;
    failVisibleLoopPlan(
      plan,
      "prompt submission effect is indeterminate after persistence failure",
    );
    renderVisibleLoopPlan(state, ctx);
    return;
  }
  armVisibleLoopDeliveryAckWatchdog(state, ctx, env);
}

function armVisibleLoopDeliveryAckWatchdog(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): void {
  armDeliveryAckWatchdog(
    state,
    ctx,
    env,
    () => {
      const resolved = resolveActiveVisibleLoopPointer(ctx, env);
      return resolved.kind === "owned" && resolved.state === state;
    },
    (reason, operatorMessage) =>
      stopVisibleLoopPlanFailedClosed(state, ctx, env, reason, operatorMessage),
  );
}

function persistVisibleLoopStateAndRetireFailedOwner(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): ReturnType<typeof persistActiveVisibleLoopState> {
  const persisted = persistActiveVisibleLoopState(state, ctx, env);
  if (persisted.ok && state.stopped && state.plan?.lifecycle === "failed_closed") {
    clearVisibleLoopDeliveryAckWatchdog(state);
    retireActiveVisibleLoopPointer(state);
  }
  return persisted;
}

function persistAndRenderVisibleLoopPlan(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): boolean {
  const persisted = persistVisibleLoopStateAndRetireFailedOwner(state, ctx, env);
  renderVisibleLoopPlan(state, ctx);
  if (persisted.ok) return true;
  clearVisibleLoopDeliveryAckWatchdog(state);
  state.stopped = true;
  if (state.plan)
    failVisibleLoopPlan(state.plan, `active-state persistence failed: ${persisted.error}`);
  appendVisibleLoopStatus(
    state.config,
    { event: "active_state_persistence_failed_closed", error: persisted.error },
    env,
  );
  persistVisibleLoopStateAndRetireFailedOwner(state, ctx, env);
  renderVisibleLoopPlan(state, ctx);
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} stopped: active-state persistence failed: ${persisted.error}`,
    "error",
  );
  return false;
}

function stopVisibleLoopPlanFailedClosed(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  reason: string,
  operatorMessage: string,
): void {
  clearVisibleLoopDeliveryAckWatchdog(state);
  state.stopped = true;
  if (state.plan) failVisibleLoopPlan(state.plan, reason);
  appendVisibleLoopStatus(
    state.config,
    { event: "visible_loop_failed_closed", reason, iteration: state.plan?.iteration ?? null },
    env,
  );
  persistVisibleLoopStateAndRetireFailedOwner(state, ctx, env);
  renderVisibleLoopPlan(state, ctx);
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} stopped: ${operatorMessage}`,
    "error",
  );
}

function maybeRenderDelegatedVisibleLoopPrompt(
  state: ActiveVisibleLoopState,
  _ctx: VisibleLoopContext | undefined,
  expansion: VisibleLoopPromptExpansion,
  iteration: number,
  promptIndex: number,
  env: NodeJS.ProcessEnv,
): string | null {
  const delegation = state.config.commitDelegation;
  if (!delegation || expansion.templateName !== delegation.promptTemplate) {
    return expansion.prompt;
  }

  appendVisibleLoopStatus(
    state.config,
    {
      event: "commit_delegation_planned",
      iteration,
      promptIndex,
      promptTemplate: expansion.templateName,
      delegateTool: "dispatch_subagent",
    },
    env,
  );
  return renderVisibleLoopCommitDelegationPrompt({
    commitPrompt: expansion.prompt,
    configPath: state.configPath,
    cwd: state.config.cwd,
    runId: state.config.runId,
    iteration,
    promptIndex,
    commandName: getVisibleLoopCommandName(state.config),
    title: getVisibleLoopTitle(state.config),
    selfEvolutionEnvelope: state.config.selfEvolutionEnvelope,
  });
}

function stopVisibleLoopForPromptExpansionFailure(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext | undefined,
  expansion: VisibleLoopPromptExpansion,
  iteration: number,
  promptIndex: number,
  env: NodeJS.ProcessEnv,
): void {
  clearVisibleLoopDeliveryAckWatchdog(state);
  state.stopped = true;
  const detail = expansion.error ?? "prompt template expansion failed";
  appendVisibleLoopStatus(
    state.config,
    {
      event: "prompt_template_unresolved",
      iteration,
      promptIndex,
      prompt: expansion.prompt,
      templateName: expansion.templateName ?? null,
      error: detail,
      expansionScope: "project-and-global-prompt-dirs",
    },
    env,
  );
  ctx?.ui?.notify?.(`${getVisibleLoopHumanLabel(state.config)} stopped: ${detail}`, "error");
}

function completeVisibleLoopIteration(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  source: "agent_settled" | "completion_command",
  expectedIteration?: number,
): { accepted: true } | { accepted: false; reason: string } {
  if (state.stopped) {
    const reason = "loop already stopped";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        completedIterations: state.completedIterations,
      },
      env,
    );
    return { accepted: false, reason };
  }

  const nextIteration = state.completedIterations + 1;
  const plan = state.plan;
  if (!plan || plan.steps.length === 0) {
    const reason = "durable visible-loop plan state is missing";
    appendVisibleLoopStatus(
      state.config,
      { event: "completion_ignored", source, reason, nextIteration },
      env,
    );
    return { accepted: false, reason };
  }
  const promptCount = plan.steps.length;
  if (expectedIteration !== undefined && expectedIteration !== nextIteration) {
    const reason = "stale or out-of-order iteration";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration,
        nextIteration,
        completedIterations: state.completedIterations,
      },
      env,
    );
    return { accepted: false, reason };
  }

  const missingBarrier = plan.steps.find(
    (step) => step.governedBarrier && !hasVisibleLoopBarrierSuccess(plan, step.index),
  );
  if (missingBarrier) {
    const reason = "governed deep-review workflow receipt is missing";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        nextIteration,
        promptIndex: missingBarrier.index + 1,
      },
      env,
    );
    return { accepted: false, reason };
  }

  const delegatedCompletion = visibleLoopDelegatesCompletion(
    state.config,
    getVisibleLoopPrompts(state.config).slice(1),
  );
  if (delegatedCompletion && !hasVisibleLoopDelegatedCommitSuccess(state, nextIteration)) {
    const reason = "delegated commit settled ASC receipt is missing";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        nextIteration,
        delegatedCommitSucceededIteration: state.delegatedCommit.succeededIteration,
      },
      env,
    );
    return { accepted: false, reason };
  }

  const terminalIndex = plan.steps.length - 1;
  if (
    plan.lifecycle !== "active" ||
    plan.iteration !== nextIteration ||
    plan.frontier?.state !== "running" ||
    plan.frontier.stepIndex !== terminalIndex ||
    plan.settledCount !== terminalIndex
  ) {
    const reason =
      "governed visible-loop prompt sequence has not reached its exact completion frontier";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        nextIteration,
        planIteration: plan.iteration,
        terminalPromptIndex: terminalIndex + 1,
        ...getVisibleLoopPlanCounts(plan),
      },
      env,
    );
    return { accepted: false, reason };
  }

  clearVisibleLoopDeliveryAckWatchdog(state);
  finalizeVisibleLoopPlan(plan);
  state.stopped = true;
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) {
    return { accepted: false, reason: "failed to durably finalize the visible-loop plan" };
  }
  const completedPromptCount = Math.max(state.completedPromptCount, nextIteration * promptCount);
  if (nextIteration >= state.config.loopCount) {
    if (!clearOwnedActiveVisibleLoopPointer(state, ctx, env)) {
      return { accepted: false, reason: "active visible-loop owner changed before completion" };
    }
    const owner = getVisibleLoopLeaseOwner(ctx);
    const completedLease = owner
      ? completeVisibleLoopIterationLease({
          runId: state.config.runId,
          iteration: nextIteration,
          planId: plan.planId,
          owner,
          env,
        })
      : { ok: false as const, error: "visible-loop session identity is unavailable" };
    if (!completedLease.ok) {
      failVisibleLoopPlan(plan, `final lease transition failed: ${completedLease.error}`);
      persistAndRenderVisibleLoopPlan(state, ctx, env);
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(state.config)} completion failed closed: ${completedLease.error}`,
        "error",
      );
      return { accepted: false, reason: "final visible-loop lease transition failed" };
    }
  }
  const authoritative = appendAuthoritativeVisibleLoopStatus(
    state.config,
    {
      event: "iteration_completed",
      source,
      planId: plan.planId,
      completedPromptCount,
      completedIterations: nextIteration,
    },
    env,
  );
  if (!authoritative.ok) {
    failVisibleLoopPlan(
      plan,
      `authoritative completion persistence failed: ${authoritative.error}`,
    );
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} completion failed closed: ${authoritative.error}`,
      "error",
    );
    return { accepted: false, reason: "authoritative iteration-completion persistence failed" };
  }

  state.completedIterations = nextIteration;
  state.completedPromptCount = completedPromptCount;
  if (!persistAndRenderVisibleLoopPlan(state, ctx, env)) {
    return {
      accepted: false,
      reason: "completed iteration could not persist finalized active state",
    };
  }
  ctx.ui?.setStatus?.(
    getVisibleLoopCommandName(state.config),
    `loop ${state.completedIterations}/${state.config.loopCount}`,
  );

  const progressReport = enqueueVisibleLoopIntercom(
    state,
    ctx,
    `${getVisibleLoopIntercomEventPrefix(state.config)}_ITERATION peer_run_id=${state.config.runId}: completed iteration ${state.completedIterations}/${state.config.loopCount}`,
    env,
  );

  if (state.completedIterations >= state.config.loopCount) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "loop_completed",
        source,
        planId: plan.planId,
        completedPromptCount: state.completedPromptCount,
        completedIterations: state.completedIterations,
      },
      env,
    );
    void progressReport
      .then(() =>
        enqueueVisibleLoopIntercom(
          state,
          ctx,
          `PEER_FINAL peer_run_id=${state.config.runId}: ${getVisibleLoopHumanLabel(state.config)} complete after ${state.completedIterations}/${state.config.loopCount} iteration(s)`,
          env,
        ),
      )
      .finally(async () => {
        await disconnectVisibleLoopPeerRuntime(state.peerRuntime);
        if (removeActiveVisibleLoopState(state, ctx, env)) {
          ctx.ui?.setStatus?.(getVisibleLoopCommandName(state.config), undefined);
          ctx.ui?.setWidget?.(`${getVisibleLoopCommandName(state.config)}-plan`, undefined);
        }
      });
    return { accepted: true };
  }

  const continuation = continueVisibleLoopAfterFinalizedIteration(
    state,
    plan,
    ctx,
    env,
    progressReport,
    {
      getActiveState: () => {
        const resolved = resolveActiveVisibleLoopPointer(ctx, env);
        return resolved.kind === "owned" ? resolved.state : null;
      },
      isCurrentRuntime: isCurrentVisibleLoopRuntime,
      clearActiveState: () => {
        clearOwnedActiveVisibleLoopPointer(state, ctx, env);
      },
      queueIteration: (continuationState) => queueVisibleLoopIteration(continuationState, ctx, env),
    },
  );
  if (!continuation.ok) {
    failVisibleLoopPlan(plan, `continuation lease transition failed: ${continuation.error}`);
    persistAndRenderVisibleLoopPlan(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} completion failed closed: ${continuation.error}`,
      "error",
    );
    return { accepted: false, reason: "continuation lease transition failed" };
  }
  return { accepted: true };
}

function isGovernedDeepReviewPrompt(
  config: VisibleLoopRunConfig,
  prompt: string | undefined,
): boolean {
  if (!prompt) return false;
  const normalized = prompt.trim();
  if (normalized === GOVERNED_DEEP_REVIEW_PROMPT) return true;
  if (!config.selfEvolutionEnvelope) return false;
  return (
    normalized ===
    `${renderSelfEvolutionExecutionMembrane(config.selfEvolutionEnvelope)}\n\n${GOVERNED_DEEP_REVIEW_PROMPT}`
  );
}

function enqueueVisibleLoopIntercom(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const nextSend = state.intercomSendTail
    .catch(() => undefined)
    .then(() => sendVisibleLoopIntercom(state, ctx, text, env));
  state.intercomSendTail = nextSend;
  return nextSend;
}

async function disconnectVisibleLoopPeerRuntime(
  runtime: PeerMessagingRuntime | null | undefined,
): Promise<void> {
  try {
    await runtime?.disconnect?.();
  } catch {
    // Report-back cleanup is best-effort; never block loop cleanup or continuation on it.
  }
}

function isRecoverableVisibleLoopIntercomFailure(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("disconnected") ||
    normalized.includes("not connected") ||
    normalized.includes("socket is not writable") ||
    normalized.includes("timed out")
  );
}

function resolveVisibleLoopIntercomSendTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  options: Pick<VisibleLoopChildRunnerOptions, "intercomSendTimeoutMs"> = {},
): number {
  const configured =
    typeof options.intercomSendTimeoutMs === "number"
      ? options.intercomSendTimeoutMs
      : Number.parseInt(env.PI_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS;
  }
  return Math.min(Math.floor(configured), MAX_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS);
}

class VisibleLoopIntercomSendTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`intercom send timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
    this.name = "VisibleLoopIntercomSendTimeoutError";
  }
}

function withVisibleLoopTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new VisibleLoopIntercomSendTimeoutError(timeoutMs));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

async function sendVisibleLoopIntercom(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (state.config.reportBack !== "intercom" || !state.config.parentPeerTarget) {
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const runtime =
        state.peerRuntime ??
        (await createVisibleLoopPeerRuntime(state.config, ctx, state.createPeerRuntime));
      state.peerRuntime = runtime;
      const result = await withVisibleLoopTimeout(
        runtime.send({
          to: state.config.parentPeerTarget,
          message: {
            id: `${state.config.runId}-${randomUUID()}`,
            timestamp: Date.now(),
            content: { text },
          },
        }),
        state.intercomSendTimeoutMs,
      );
      if (result.delivered) {
        appendVisibleLoopStatus(state.config, { event: "intercom_delivered", text }, env);
        return;
      }

      const reason = result.reason ?? "not delivered";
      if (attempt === 1 && isRecoverableVisibleLoopIntercomFailure(reason)) {
        appendVisibleLoopStatus(
          state.config,
          { event: "intercom_send_retrying", text, reason },
          env,
        );
        await disconnectVisibleLoopPeerRuntime(runtime);
        if (state.peerRuntime === runtime) state.peerRuntime = null;
        continue;
      }

      appendVisibleLoopStatus(state.config, { event: "intercom_send_failed", text, reason }, env);
      ctx.ui?.notify?.(`visible-loop intercom send failed: ${reason}`, "warning");
      return;
    } catch (error) {
      const runtime = state.peerRuntime;
      if (error instanceof VisibleLoopIntercomSendTimeoutError) {
        appendVisibleLoopStatus(
          state.config,
          { event: "intercom_send_timed_out", text, timeoutMs: error.timeoutMs },
          env,
        );
        ctx.ui?.notify?.(
          `visible-loop intercom send timed out after ${error.timeoutMs}ms`,
          "warning",
        );
        await disconnectVisibleLoopPeerRuntime(runtime);
        if (state.peerRuntime === runtime) state.peerRuntime = null;
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      appendVisibleLoopStatus(
        state.config,
        { event: "intercom_unavailable", text, error: message },
        env,
      );
      ctx.ui?.notify?.(`visible-loop intercom unavailable: ${message}`, "warning");
      return;
    }
  }
}

async function createVisibleLoopPeerRuntime(
  config: VisibleLoopRunConfig,
  ctx: VisibleLoopContext,
  factory?: CreateVisibleLoopPeerRuntime,
): Promise<PeerMessagingRuntime> {
  if (factory) return factory(config, ctx);
  const module = await loadPeerMessagingModule();
  return module.createPeerMessagingRuntime({
    id: config.runId,
    name: getVisibleLoopCommandName(config),
    cwd: config.cwd || ctx.cwd || process.cwd(),
    model: ctx.model?.id?.trim() || "unknown",
  });
}

async function loadPeerMessagingModule(): Promise<PeerMessagingModule> {
  const siblingPeerMessagingPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../pi-peer-messaging/index.ts",
  );
  const attempts = ["@tryinget/pi-peer-messaging", pathToFileURL(siblingPeerMessagingPath).href];
  const errors: string[] = [];

  for (const specifier of attempts) {
    try {
      const loaded = (await import(specifier)) as Partial<PeerMessagingModule>;
      if (typeof loaded.createPeerMessagingRuntime === "function") {
        return loaded as PeerMessagingModule;
      }
      errors.push(`${specifier}: missing createPeerMessagingRuntime`);
    } catch (error) {
      errors.push(`${specifier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

export interface VisibleLoopCompletionOutcome {
  ok: boolean;
  accepted: boolean;
  reason: string;
  runId?: string;
  candidateId?: string;
  completedIterations?: number;
}

function rejectedCompletion(
  reason: string,
  config?: VisibleLoopRunConfig,
): VisibleLoopCompletionOutcome {
  return {
    ok: false,
    accepted: false,
    reason,
    ...(config ? { runId: config.runId } : {}),
    ...(config?.selfEvolutionEnvelope
      ? { candidateId: config.selfEvolutionEnvelope.candidateId }
      : {}),
  };
}

function candidateCloseoutAllowsCompletion(
  config: VisibleLoopRunConfig,
  closeout: SelfEvolutionCandidateCloseout | undefined,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): { ok: true; closeout?: SelfEvolutionCandidateCloseout } | { ok: false; error: string } {
  const validation = validateSelfEvolutionCandidateCloseout(
    config.selfEvolutionEnvelope,
    closeout,
    {
      branchEntries: ctx.sessionManager?.getBranch?.(),
      cwd: config.cwd,
      notBefore: Date.parse(config.createdAt),
      parentPeerTarget: config.parentPeerTarget,
    },
  );
  if (!validation.ok) {
    appendVisibleLoopStatus(
      config,
      {
        event: "completion_ignored",
        source: "candidate_closeout_gate",
        reason: validation.error,
        candidateId: config.selfEvolutionEnvelope?.candidateId ?? null,
      },
      env,
    );
    ctx.ui?.notify?.(`visible-loop completion ignored: ${validation.error}`, "warning");
    return { ok: false, error: validation.error };
  }
  return validation.closeout ? { ok: true, closeout: validation.closeout } : { ok: true };
}

function recordCandidateCloseoutAccepted(
  config: VisibleLoopRunConfig,
  closeout: SelfEvolutionCandidateCloseout | undefined,
  env: NodeJS.ProcessEnv,
): void {
  if (!closeout) return;
  appendVisibleLoopStatus(
    config,
    {
      event: "candidate_closeout_accepted",
      candidateId: closeout.candidateId,
      closeout,
    },
    env,
  );
}

export async function startVisibleLoopChildCompleteRunner(
  args: string | undefined,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): Promise<VisibleLoopCompletionOutcome> {
  if (!isCurrentVisibleLoopRuntime()) {
    return rejectedCompletion("stale visible-loop runtime callback");
  }
  const parsed = parseVisibleLoopCompletionArgs(args);
  if (!parsed.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${parsed.error}`, "warning");
    return rejectedCompletion(parsed.error);
  }

  const pointer = resolveActiveVisibleLoopPointer(ctx, env);
  if (pointer.kind === "blocked") {
    return rejectedCompletion("active visible-loop state belongs to another session");
  }
  const existingState =
    pointer.kind === "owned"
      ? pointer.state
      : restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!parsed.configPath) {
    if (!existingState) {
      const reason = "missing config path and no active visible-loop state";
      ctx.ui?.notify?.(`visible-loop completion ignored: ${reason}`, "warning");
      return rejectedCompletion(reason);
    }
    const gate = candidateCloseoutAllowsCompletion(
      existingState.config,
      runnerOptions.candidateCloseout,
      ctx,
      env,
    );
    if (!gate.ok) return rejectedCompletion(gate.error, existingState.config);
    const completion = completeVisibleLoopIteration(
      existingState,
      ctx,
      env,
      "completion_command",
      parsed.iteration ?? existingState.completedIterations + 1,
    );
    if (!completion.accepted) {
      return rejectedCompletion(completion.reason, existingState.config);
    }
    recordCandidateCloseoutAccepted(existingState.config, gate.closeout, env);
    return {
      ok: true,
      accepted: true,
      reason: "iteration completion accepted",
      runId: existingState.config.runId,
      candidateId: existingState.config.selfEvolutionEnvelope?.candidateId,
      completedIterations: existingState.completedIterations,
    };
  }

  const configResult = loadVisibleLoopRunConfig(parsed.configPath, env);
  if (!configResult.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${configResult.error}`, "warning");
    return rejectedCompletion(configResult.error);
  }
  const candidateBinding = validatePersistedSelfEvolutionBinding(
    configResult.config.selfEvolutionEnvelope,
    {
      cwd: configResult.config.cwd,
      parentPeerTarget: configResult.config.parentPeerTarget,
    },
  );
  if (!candidateBinding.ok) {
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "candidate_binding_gate",
        reason: candidateBinding.error,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.(`visible-loop completion ignored: ${candidateBinding.error}`, "warning");
    return rejectedCompletion(candidateBinding.error, configResult.config);
  }

  if (
    pointer.kind === "missing" &&
    !existingState &&
    hasVisibleLoopAlreadyCompleted(configResult.config, env)
  ) {
    const reason = "loop already completed";
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    return rejectedCompletion(reason, configResult.config);
  }

  const state = existingState;
  if (!state) {
    const reason = "active state unavailable";
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.(`visible-loop completion ignored: ${reason}`, "warning");
    return rejectedCompletion(reason, configResult.config);
  }

  if (state.config.runId !== configResult.config.runId) {
    const reason = "active state runId mismatch";
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason,
        activeRunId: state.config.runId,
        requestedRunId: configResult.config.runId,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.("visible-loop completion ignored: active run mismatch", "warning");
    return rejectedCompletion(reason, configResult.config);
  }

  const gate = candidateCloseoutAllowsCompletion(
    state.config,
    runnerOptions.candidateCloseout,
    ctx,
    env,
  );
  if (!gate.ok) return rejectedCompletion(gate.error, state.config);
  const completion = completeVisibleLoopIteration(
    state,
    ctx,
    env,
    "completion_command",
    parsed.iteration ?? state.completedIterations + 1,
  );
  if (!completion.accepted) return rejectedCompletion(completion.reason, state.config);
  recordCandidateCloseoutAccepted(state.config, gate.closeout, env);
  return {
    ok: true,
    accepted: true,
    reason: "iteration completion accepted",
    runId: state.config.runId,
    candidateId: state.config.selfEvolutionEnvelope?.candidateId,
    completedIterations: state.completedIterations,
  };
}

function getSendUserMessage(pi: ExtensionAPI): SendUserMessage | undefined {
  const candidate = (pi as unknown as { sendUserMessage?: SendUserMessage }).sendUserMessage;
  return typeof candidate === "function" ? candidate.bind(pi) : undefined;
}
