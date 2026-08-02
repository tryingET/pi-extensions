// summary: correlates one visible-loop delegated commit request with its exact host receipt.
// read_when:
//   - changing delegated commit dispatch admission, executed policy validation, persistence, or completion gates.

import { isDeepStrictEqual } from "node:util";
import {
  readVisibleLoopAscSettlementReceipt,
  type VisibleLoopAscSettlementReceipt,
} from "./visibleLoopCommitDelegationReceipt.ts";
import { getVisibleLoopPrompts } from "./visibleLoopPlan.ts";
import { getVisibleLoopCommandName, getVisibleLoopTitle } from "./visibleLoopProfiles.ts";
import {
  bindVisibleLoopExecutionPrompt,
  createVisibleLoopCommitDelegationDispatchRequest,
  expandVisibleLoopPromptTemplate,
  renderVisibleLoopCommitDelegationPrompt,
  type VisibleLoopCommitDelegationDispatchRequest,
} from "./visibleLoopPromptTemplates.ts";
import type { ActiveVisibleLoopState } from "./visibleLoopRecovery.ts";

export interface VisibleLoopDelegatedCommitFrontierBinding {
  runId: string;
  planId: string;
  iteration: number;
  promptIndex: number;
}

export interface VisibleLoopDelegatedCommitExecutionPolicy {
  timeout: number;
  /** null means the field was omitted from the actual host request. */
  allowUnlimited: boolean | null;
}

export type VisibleLoopDelegatedCommitPhase =
  | "idle"
  | "started"
  | "admitted"
  | "settled"
  | "succeeded"
  | "failed_closed";

export interface VisibleLoopDelegatedCommitRuntime {
  phase: VisibleLoopDelegatedCommitPhase;
  frontier: VisibleLoopDelegatedCommitFrontierBinding | null;
  toolCallId: string | null;
  admittedToolCallId: string | null;
  settledToolCallId: string | null;
  completedToolCallId: string | null;
  admittedExecutionPolicy: VisibleLoopDelegatedCommitExecutionPolicy | null;
  settledExecutionPolicy: VisibleLoopDelegatedCommitExecutionPolicy | null;
  receipt: VisibleLoopAscSettlementReceipt | null;
  succeededIteration: number | null;
}

export function createVisibleLoopDelegatedCommitRuntime(): VisibleLoopDelegatedCommitRuntime {
  return {
    phase: "idle",
    frontier: null,
    toolCallId: null,
    admittedToolCallId: null,
    settledToolCallId: null,
    completedToolCallId: null,
    admittedExecutionPolicy: null,
    settledExecutionPolicy: null,
    receipt: null,
    succeededIteration: null,
  };
}

export function resetVisibleLoopDelegatedCommitRuntime(state: ActiveVisibleLoopState): void {
  state.delegatedCommit = createVisibleLoopDelegatedCommitRuntime();
}

export function failVisibleLoopDelegatedCommitRuntime(state: ActiveVisibleLoopState): void {
  // Preserve correlation evidence. A failed/indeterminate dispatch must never become retryable by
  // clearing its frontier or tool-call identity, including across a same-process extension reload.
  state.delegatedCommit.phase = "failed_closed";
  state.delegatedCommit.succeededIteration = null;
}

export function isVisibleLoopDelegatedCommitFrontier(state: ActiveVisibleLoopState): boolean {
  const delegation = state.config.commitDelegation;
  const plan = state.plan;
  const frontier = plan?.frontier;
  if (!delegation || !plan || frontier?.state !== "running") return false;
  const step = plan.steps[frontier.stepIndex];
  const prompt = getVisibleLoopPrompts(state.config)[frontier.stepIndex];
  return Boolean(
    step?.kind === "prompt" && prompt?.trim().split(/\s+/u)[0] === `/${delegation.promptTemplate}`,
  );
}

export function getVisibleLoopDelegatedCommitFrontierBinding(
  state: ActiveVisibleLoopState,
): VisibleLoopDelegatedCommitFrontierBinding | null {
  const plan = state.plan;
  const frontier = plan?.frontier;
  if (!isVisibleLoopDelegatedCommitFrontier(state) || !plan || !frontier) return null;
  return {
    runId: state.config.runId,
    planId: plan.planId,
    iteration: plan.iteration,
    promptIndex: frontier.stepIndex + 1,
  };
}

export function getExpectedVisibleLoopCommitDelegationRequest(
  state: ActiveVisibleLoopState,
): VisibleLoopCommitDelegationDispatchRequest | null {
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return null;
  const delegation = state.config.commitDelegation;
  const plan = state.plan;
  const frontier = plan?.frontier;
  if (!delegation || !plan || !frontier) return null;

  const step = plan.steps[frontier.stepIndex];
  const prompt = getVisibleLoopPrompts(state.config)[frontier.stepIndex];
  if (!step || prompt === undefined) return null;
  const expansion = expandVisibleLoopPromptTemplate(prompt, state.config.cwd);
  if (!expansion.ok || expansion.templateName !== delegation.promptTemplate) return null;

  const input = {
    commitPrompt: expansion.prompt,
    configPath: state.configPath,
    cwd: state.config.cwd,
    runId: state.config.runId,
    iteration: plan.iteration,
    promptIndex: frontier.stepIndex + 1,
    commandName: getVisibleLoopCommandName(state.config),
    title: getVisibleLoopTitle(state.config),
    selfEvolutionEnvelope: state.config.selfEvolutionEnvelope,
  };
  const expectedPrompt = bindVisibleLoopExecutionPrompt(
    renderVisibleLoopCommitDelegationPrompt(input),
    state.config.executionBinding,
  );
  if (step.prompt !== expectedPrompt) return null;
  return createVisibleLoopCommitDelegationDispatchRequest(input);
}

type ExecutionPolicyReadResult =
  | { ok: true; value: VisibleLoopDelegatedCommitExecutionPolicy }
  | { ok: false };

function readVisibleLoopDelegatedCommitExecutionPolicy(value: unknown): ExecutionPolicyReadResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const record = value as Record<string, unknown>;
  if (typeof record.timeout !== "number" || !Number.isFinite(record.timeout)) {
    return { ok: false };
  }
  const hasAllowUnlimited = Object.hasOwn(record, "allowUnlimited");
  if (hasAllowUnlimited && typeof record.allowUnlimited !== "boolean") return { ok: false };
  return {
    ok: true,
    value: {
      timeout: record.timeout,
      allowUnlimited: hasAllowUnlimited ? Boolean(record.allowUnlimited) : null,
    },
  };
}

export function getExpectedVisibleLoopDelegatedCommitExecutionPolicy(
  state: ActiveVisibleLoopState,
): VisibleLoopDelegatedCommitExecutionPolicy | null {
  const request = getExpectedVisibleLoopCommitDelegationRequest(state);
  if (!request) return null;
  const policy = readVisibleLoopDelegatedCommitExecutionPolicy(request);
  return policy.ok ? policy.value : null;
}

function matchesCurrentVisibleLoopDelegatedCommitFrontier(
  state: ActiveVisibleLoopState,
  binding: VisibleLoopDelegatedCommitFrontierBinding | null,
): boolean {
  const expected = getVisibleLoopDelegatedCommitFrontierBinding(state);
  return Boolean(expected && binding && isDeepStrictEqual(binding, expected));
}

export type VisibleLoopDelegatedCommitStartOutcome =
  | { kind: "ignored" }
  | { kind: "started"; toolCallId: string }
  | { kind: "rejected"; reason: "request correlation failed" | "duplicate dispatch rejected" };

export function beginVisibleLoopDelegatedCommit(
  state: ActiveVisibleLoopState,
  event: { toolCallId?: string; args?: unknown },
): VisibleLoopDelegatedCommitStartOutcome {
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return { kind: "ignored" };
  const expectedRequest = getExpectedVisibleLoopCommitDelegationRequest(state);
  const frontier = getVisibleLoopDelegatedCommitFrontierBinding(state);
  const toolCallId = event.toolCallId?.trim();
  if (
    !expectedRequest ||
    !frontier ||
    !toolCallId ||
    !isDeepStrictEqual(event.args, expectedRequest)
  ) {
    return { kind: "rejected", reason: "request correlation failed" };
  }
  const runtime = state.delegatedCommit;
  if (
    runtime.phase !== "idle" ||
    runtime.frontier !== null ||
    runtime.toolCallId !== null ||
    runtime.admittedToolCallId !== null ||
    runtime.settledToolCallId !== null ||
    runtime.completedToolCallId !== null ||
    runtime.admittedExecutionPolicy !== null ||
    runtime.settledExecutionPolicy !== null ||
    runtime.receipt !== null ||
    runtime.succeededIteration !== null
  ) {
    return { kind: "rejected", reason: "duplicate dispatch rejected" };
  }
  runtime.phase = "started";
  runtime.frontier = frontier;
  runtime.toolCallId = toolCallId;
  return { kind: "started", toolCallId };
}

export function admitVisibleLoopDelegatedCommit(
  state: ActiveVisibleLoopState,
  event: { toolCallId?: string; input?: unknown },
): "ignored" | "admitted" | "rejected" {
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return "ignored";
  const expectedRequest = getExpectedVisibleLoopCommitDelegationRequest(state);
  const expectedPolicy = getExpectedVisibleLoopDelegatedCommitExecutionPolicy(state);
  const runtime = state.delegatedCommit;
  if (
    state.stopped ||
    runtime.phase !== "started" ||
    !matchesCurrentVisibleLoopDelegatedCommitFrontier(state, runtime.frontier) ||
    !expectedRequest ||
    !expectedPolicy ||
    !event.toolCallId ||
    event.toolCallId !== runtime.toolCallId ||
    runtime.admittedToolCallId !== null ||
    !isDeepStrictEqual(event.input, expectedRequest)
  ) {
    return "rejected";
  }
  runtime.phase = "admitted";
  runtime.admittedToolCallId = event.toolCallId;
  runtime.admittedExecutionPolicy = { ...expectedPolicy };
  return "admitted";
}

export type VisibleLoopDelegatedCommitSettlementOutcome =
  | { kind: "ignored" }
  | { kind: "duplicate_settlement" }
  | { kind: "uncorrelated_result" }
  | { kind: "execution_policy_drift" }
  | { kind: "settled"; policy: VisibleLoopDelegatedCommitExecutionPolicy };

/**
 * Bind the actual post-tool_call input after host execution. This event observes mutations made by
 * later tool_call handlers, unlike admission. The binding is persisted before tool_execution_end.
 */
export function settleVisibleLoopDelegatedCommitExecution(
  state: ActiveVisibleLoopState,
  event: { toolCallId?: string; input?: unknown; details?: unknown },
): VisibleLoopDelegatedCommitSettlementOutcome {
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return { kind: "ignored" };
  const expectedRequest = getExpectedVisibleLoopCommitDelegationRequest(state);
  const expectedPolicy = getExpectedVisibleLoopDelegatedCommitExecutionPolicy(state);
  const runtime = state.delegatedCommit;
  if (event.toolCallId && event.toolCallId === runtime.settledToolCallId) {
    return { kind: "duplicate_settlement" };
  }
  if (
    runtime.phase !== "admitted" ||
    !matchesCurrentVisibleLoopDelegatedCommitFrontier(state, runtime.frontier) ||
    !expectedRequest ||
    !expectedPolicy ||
    !event.toolCallId ||
    event.toolCallId !== runtime.toolCallId ||
    event.toolCallId !== runtime.admittedToolCallId
  ) {
    return { kind: "uncorrelated_result" };
  }
  const actualPolicy = readVisibleLoopDelegatedCommitExecutionPolicy(event.input);
  const details = event.details;
  const detailsRecord =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (
    !actualPolicy.ok ||
    !isDeepStrictEqual(event.input, expectedRequest) ||
    !isDeepStrictEqual(actualPolicy.value, runtime.admittedExecutionPolicy) ||
    !isDeepStrictEqual(actualPolicy.value, expectedPolicy) ||
    detailsRecord?.executionTimeoutSeconds !== expectedPolicy.timeout
  ) {
    return { kind: "execution_policy_drift" };
  }
  runtime.phase = "settled";
  runtime.settledToolCallId = event.toolCallId;
  runtime.settledExecutionPolicy = { ...actualPolicy.value };
  return { kind: "settled", policy: actualPolicy.value };
}

export type VisibleLoopDelegatedCommitEndOutcome =
  | { kind: "ignored" }
  | { kind: "duplicate_receipt" }
  | { kind: "uncorrelated_result" }
  | { kind: "invalid_receipt" }
  | { kind: "succeeded"; receipt: VisibleLoopAscSettlementReceipt };

export function completeVisibleLoopDelegatedCommit(
  state: ActiveVisibleLoopState,
  event: { toolCallId?: string; result?: { details?: unknown }; isError?: boolean },
): VisibleLoopDelegatedCommitEndOutcome {
  if (!isVisibleLoopDelegatedCommitFrontier(state)) return { kind: "ignored" };
  const expectedPolicy = getExpectedVisibleLoopDelegatedCommitExecutionPolicy(state);
  const runtime = state.delegatedCommit;
  if (event.toolCallId && event.toolCallId === runtime.completedToolCallId) {
    return { kind: "duplicate_receipt" };
  }
  if (
    runtime.phase !== "settled" ||
    !matchesCurrentVisibleLoopDelegatedCommitFrontier(state, runtime.frontier) ||
    !expectedPolicy ||
    !event.toolCallId ||
    event.toolCallId !== runtime.toolCallId ||
    event.toolCallId !== runtime.admittedToolCallId ||
    event.toolCallId !== runtime.settledToolCallId ||
    !isDeepStrictEqual(runtime.admittedExecutionPolicy, expectedPolicy) ||
    !isDeepStrictEqual(runtime.settledExecutionPolicy, expectedPolicy)
  ) {
    return { kind: "uncorrelated_result" };
  }
  const details = event.result?.details;
  const detailsRecord =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (detailsRecord?.executionTimeoutSeconds !== expectedPolicy.timeout) {
    return { kind: "invalid_receipt" };
  }
  const receipt = readVisibleLoopAscSettlementReceipt(event);
  if (!receipt) return { kind: "invalid_receipt" };
  runtime.phase = "succeeded";
  runtime.completedToolCallId = event.toolCallId;
  runtime.receipt = receipt;
  runtime.succeededIteration = state.plan?.iteration ?? null;
  return { kind: "succeeded", receipt };
}

export function hasVisibleLoopDelegatedCommitSuccess(
  state: ActiveVisibleLoopState,
  iteration: number,
): boolean {
  return (
    state.delegatedCommit.phase === "succeeded" &&
    state.delegatedCommit.receipt !== null &&
    state.delegatedCommit.succeededIteration === iteration
  );
}
