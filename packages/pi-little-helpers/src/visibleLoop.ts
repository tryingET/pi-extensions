// summary: "orchestrates persisted visible-loop child sessions, prompt delivery, adaptive continuation, completion gates, and report-back"
// read_when:
//   - "changing visible-loop lifecycle, state recovery, prompt sequencing, completion checks, or intercom delivery"

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  renderSelfEvolutionExecutionMembrane,
  type SelfEvolutionCandidateCloseout,
  type SelfEvolutionExecutionEnvelope,
  validateSelfEvolutionCandidateCloseout,
} from "./selfEvolutionEnvelope.ts";
import { validatePersistedSelfEvolutionBinding } from "./selfEvolutionVerification.ts";
import { normalizeOptionalString, parseVisibleLoopCompletionArgs } from "./visibleLoopArgs.ts";
import {
  createVisibleLoopControllerState,
  decideVisibleLoopContinuation,
  validateVisibleLoopCompletionInvariants,
} from "./visibleLoopController.ts";
import { recordVisibleLoopControllerEvent as applyVisibleLoopControllerEvent } from "./visibleLoopControllerRuntime.ts";
import {
  getVisibleLoopCommandName,
  getVisibleLoopHumanLabel,
  getVisibleLoopIntercomEventPrefix,
  getVisibleLoopTitle,
  normalizeVisibleLoopCommandName,
} from "./visibleLoopProfiles.ts";
import {
  DEFAULT_VISIBLE_LOOP_PROMPTS,
  expandVisibleLoopPromptTemplate,
  renderVisibleLoopCommitDelegationPrompt,
  renderVisibleLoopCompletionPrompt,
  type VisibleLoopPromptExpansion,
} from "./visibleLoopPromptTemplates.ts";
import {
  appendVisibleLoopStatus,
  getVisibleLoopStateDir,
  getVisibleLoopStatusPath,
  hasVisibleLoopAlreadyCompleted,
  loadVisibleLoopControllerState,
  loadVisibleLoopRunConfig,
  readCompletedVisibleLoopIterations,
  writeVisibleLoopControllerState,
} from "./visibleLoopState.ts";
import {
  VISIBLE_LOOP_CHILD_COMMAND,
  type VisibleLoopAdaptiveControllerConfig,
  type VisibleLoopCommitDelegation,
  type VisibleLoopContinuationDecision,
  type VisibleLoopControllerState,
  type VisibleLoopProductPostureTarget,
  type VisibleLoopReportBack,
  type VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

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
export { parseVisibleLoopCommandArgs } from "./visibleLoopArgs.ts";
export { resolveVisibleLoopAdaptiveControllerConfig } from "./visibleLoopController.ts";
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
  listMissingVisibleLoopPromptTemplates,
  type VisibleLoopPromptExpansion,
} from "./visibleLoopPromptTemplates.ts";
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
  type VisibleLoopReportBack,
  type VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

type SendUserMessageOptions = { deliverAs?: "followUp" | "steer" };
type SendUserMessage = (message: string, options?: SendUserMessageOptions) => void;

export type ContinueVisibleLoopInNewSession = (input: {
  config: VisibleLoopRunConfig;
  configPath: string;
  completedIterations: number;
  nextIteration: number;
}) => Promise<void> | void;

export interface VisibleLoopChildRunnerOptions {
  continueInNewSession?: ContinueVisibleLoopInNewSession;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTimeoutMs?: number;
  candidateCloseout?: SelfEvolutionCandidateCloseout;
  persistControllerState?: typeof writeVisibleLoopControllerState;
}

type VisibleLoopContext = {
  cwd?: string;
  hasUI?: boolean;
  model?: { id?: string };
  ui?: {
    notify?(message: string, type?: string): void;
    setStatus?(key: string, value: unknown): void;
  };
  sessionManager?: {
    getSessionId?(): string;
    getSessionName?(): string | undefined;
    getCwd?(): string;
    getBranch?(): unknown;
  };
  hasPendingMessages?(): boolean;
};

type PeerMessagingRuntime = {
  send(request: {
    to: string;
    message: { id: string; timestamp: number; content: { text: string } };
  }): Promise<{ delivered: boolean; reason?: string }>;
  disconnect?(): Promise<void>;
};

type PeerMessagingModule = {
  createPeerMessagingRuntime(options: {
    id: string;
    name?: string;
    cwd: string;
    model: string;
    packageRoot?: string;
  }): Promise<PeerMessagingRuntime>;
};

type CreateVisibleLoopPeerRuntime = (
  config: VisibleLoopRunConfig,
  ctx: VisibleLoopContext,
) => Promise<PeerMessagingRuntime> | PeerMessagingRuntime;

const DEFAULT_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS = 10_000;
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
  adaptiveController?: VisibleLoopAdaptiveControllerConfig;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
}): VisibleLoopRunConfig {
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
    ...(input.parentPeerTarget ? { parentPeerTarget: input.parentPeerTarget } : {}),
    ...(input.commitDelegation ? { commitDelegation: input.commitDelegation } : {}),
    ...(input.adaptiveController ? { adaptiveController: input.adaptiveController } : {}),
    productPostureTarget: resolveVisibleLoopProductPostureTarget(input.cwd),
    ...(input.selfEvolutionEnvelope ? { selfEvolutionEnvelope: input.selfEvolutionEnvelope } : {}),
    title: input.title ?? "Visible loop",
    createdAt: new Date().toISOString(),
  };
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

export async function startVisibleLoopChildRunner(
  configPathArg: string | undefined,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): Promise<void> {
  const configPath = normalizeOptionalString(configPathArg);
  if (!configPath) {
    ctx.ui?.notify?.(`Usage: /${VISIBLE_LOOP_CHILD_COMMAND} <config-path>`, "warning");
    return;
  }

  const configResult = loadVisibleLoopRunConfig(configPath, env);
  if (!configResult.ok) {
    ctx.ui?.notify?.(`visible-loop child failed: ${configResult.error}`, "error");
    return;
  }

  const config = configResult.config;
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
    ctx.ui?.notify?.("visible-loop child ignored: loop is already complete", "warning");
    return;
  }

  const controllerState = initialVisibleLoopControllerState(config, restoredIterations, env);
  if (config.adaptiveController && !controllerState) {
    ctx.ui?.notify?.("visible-loop child failed: adaptive controller state unavailable", "error");
    return;
  }

  const state: ActiveVisibleLoopState = {
    config,
    configPath,
    completedPromptCount: restoredIterations * getVisibleLoopCompletionTurnCount(config),
    completedIterations: restoredIterations,
    controllerState,
    sendUserMessage,
    peerRuntime: null,
    createPeerRuntime: runnerOptions.createPeerRuntime,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    persistControllerState: runnerOptions.persistControllerState ?? writeVisibleLoopControllerState,
    stopped: false,
    followupsQueuedForIteration: null,
    continueInNewSession: runnerOptions.continueInNewSession,
  };
  if (
    !recordVisibleLoopControllerEvent(
      state,
      { kind: "child_started", iteration: restoredIterations + 1 },
      env,
    )
  ) {
    ctx.ui?.notify?.("visible-loop adaptive controller failed during child start", "error");
    return;
  }
  appendVisibleLoopStatus(
    config,
    {
      event: "child_started",
      reportBack: config.reportBack,
      parentPeerTarget: config.parentPeerTarget ?? null,
      productPostureTarget: config.productPostureTarget ?? null,
    },
    env,
  );
  if (!persistActiveVisibleLoopState(state, ctx, env)) {
    ctx.ui?.notify?.("visible-loop adaptive controller state could not be persisted", "error");
    return;
  }

  activeVisibleLoop = state;
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
  queueVisibleLoopIteration(state, ctx, env);
}

export function handleVisibleLoopAgentStart(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped || state.followupsQueuedForIteration === state.completedIterations) {
    return;
  }

  state.followupsQueuedForIteration = state.completedIterations;
  persistActiveVisibleLoopState(state, ctx, env);
  queueVisibleLoopFollowups(state, ctx, env);
}

export function handleVisibleLoopAgentSettled(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped) return;

  state.completedPromptCount += 1;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "agent_settled_observed",
      source: "agent_settled",
      pendingMessages: Boolean(ctx.hasPendingMessages?.()),
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
      completionMode: "explicit_completion_prompt",
    },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);
}

interface ActiveVisibleLoopState {
  config: VisibleLoopRunConfig;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  controllerState?: VisibleLoopControllerState;
  sendUserMessage: SendUserMessage;
  peerRuntime: PeerMessagingRuntime | null;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTail: Promise<void>;
  intercomSendTimeoutMs: number;
  persistControllerState: typeof writeVisibleLoopControllerState;
  stopped: boolean;
  followupsQueuedForIteration: number | null;
  continueInNewSession?: ContinueVisibleLoopInNewSession;
}

let activeVisibleLoop: ActiveVisibleLoopState | null = null;

function initialVisibleLoopControllerState(
  config: VisibleLoopRunConfig,
  _completedIterations: number,
  env: NodeJS.ProcessEnv,
): VisibleLoopControllerState | undefined {
  if (!config.adaptiveController) return undefined;
  const restored = loadVisibleLoopControllerState(config, env);
  if (restored.ok) return restored.state;
  if (
    restored.error === "controller state file does not exist" &&
    !existsSync(getVisibleLoopStatusPath(config, env))
  ) {
    return createVisibleLoopControllerState();
  }
  return undefined;
}

function restoreRequiredVisibleLoopControllerState(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv,
): VisibleLoopControllerState | undefined {
  if (!config.adaptiveController) return undefined;
  const restored = loadVisibleLoopControllerState(config, env);
  if (!restored.ok) throw new TypeError(restored.error);
  return restored.state;
}

function recordVisibleLoopControllerEvent(
  state: ActiveVisibleLoopState,
  event: Parameters<typeof applyVisibleLoopControllerEvent>[1],
  env: NodeJS.ProcessEnv,
): boolean {
  return applyVisibleLoopControllerEvent(state, event, env, appendVisibleLoopStatus);
}

interface PersistedActiveVisibleLoopState {
  schemaVersion: 1;
  runId: string;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  followupsQueuedForIteration: number | null;
  stopped: boolean;
}

function getVisibleLoopSessionKey(ctx: VisibleLoopContext): string | undefined {
  const raw = ctx.sessionManager?.getSessionId?.()?.trim();
  if (!raw) return undefined;
  const normalized = raw.startsWith("session-") ? raw : `session-${raw}`;
  return normalized.replace(/[^a-zA-Z0-9-]/g, "-");
}

function getActiveVisibleLoopStatePath(
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const sessionKey = getVisibleLoopSessionKey(ctx);
  if (!sessionKey) return undefined;
  return join(getVisibleLoopStateDir(env), "active", `${sessionKey}.json`);
}

function persistActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    if (state.config.adaptiveController && state.controllerState) {
      state.persistControllerState(state.config, state.controllerState, env);
    }
  } catch (error) {
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "adaptive_controller_persistence_failed",
        reason: error instanceof Error ? error.message : String(error),
      },
      env,
    );
    return false;
  }
  const path = getActiveVisibleLoopStatePath(ctx, env);
  if (!path) return true;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const persisted: PersistedActiveVisibleLoopState = {
      schemaVersion: 1,
      runId: state.config.runId,
      configPath: state.configPath,
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
      followupsQueuedForIteration: state.followupsQueuedForIteration,
      stopped: state.stopped,
    };
    writeFileSync(path, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  } catch {
    // Session-local active-state persistence is diagnostic only.
  }
  return true;
}

function restoreActiveVisibleLoopState(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): ActiveVisibleLoopState | null {
  const path = getActiveVisibleLoopStatePath(ctx, env);
  if (!path || !existsSync(path)) return null;
  const sendUserMessage = getSendUserMessage(pi);
  if (!sendUserMessage) return null;

  try {
    const persisted = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<PersistedActiveVisibleLoopState>;
    if (persisted.schemaVersion !== 1 || !persisted.configPath) return null;
    const configResult = loadVisibleLoopRunConfig(persisted.configPath, env);
    if (!configResult.ok) return null;
    const candidateBinding = validatePersistedSelfEvolutionBinding(
      configResult.config.selfEvolutionEnvelope,
      {
        cwd: configResult.config.cwd,
        parentPeerTarget: configResult.config.parentPeerTarget,
      },
    );
    if (!candidateBinding.ok) return null;
    const state: ActiveVisibleLoopState = {
      config: configResult.config,
      configPath: persisted.configPath,
      completedPromptCount: Number.isInteger(persisted.completedPromptCount)
        ? Number(persisted.completedPromptCount)
        : 0,
      completedIterations: Number.isInteger(persisted.completedIterations)
        ? Number(persisted.completedIterations)
        : 0,
      controllerState: restoreRequiredVisibleLoopControllerState(configResult.config, env),
      sendUserMessage,
      peerRuntime: null,
      createPeerRuntime: runnerOptions.createPeerRuntime,
      intercomSendTail: Promise.resolve(),
      intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
      persistControllerState:
        runnerOptions.persistControllerState ?? writeVisibleLoopControllerState,
      stopped: Boolean(persisted.stopped),
      followupsQueuedForIteration:
        typeof persisted.followupsQueuedForIteration === "number"
          ? persisted.followupsQueuedForIteration
          : null,
      continueInNewSession: runnerOptions.continueInNewSession,
    };
    activeVisibleLoop = state;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "active_state_restored",
        completedPromptCount: state.completedPromptCount,
        completedIterations: state.completedIterations,
      },
      env,
    );
    return state;
  } catch {
    return null;
  }
}

function removeActiveVisibleLoopState(
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = getActiveVisibleLoopStatePath(ctx, env);
  if (!path) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // Diagnostic persistence only; ignore cleanup failures.
  }
}

function queueVisibleLoopIteration(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const prompts = getVisibleLoopPrompts(state.config);
  if (prompts.length === 0) {
    state.stopped = true;
    ctx.ui?.notify?.("visible-loop stopped: no prompts configured", "error");
    return;
  }

  const iteration = state.completedIterations + 1;
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} queueing iteration ${iteration}/${state.config.loopCount}`,
    "info",
  );
  appendVisibleLoopStatus(
    state.config,
    {
      event: "iteration_queued",
      iteration,
      promptCount: getVisibleLoopCompletionTurnCount(state.config),
      sourcePromptCount: prompts.length,
      queuedFollowupCount: prompts.length,
      completionCommand: true,
      completionMode: "explicit_completion_prompt",
    },
    env,
  );
  state.followupsQueuedForIteration = null;
  persistActiveVisibleLoopState(state, ctx, env);
  appendVisibleLoopStatus(
    state.config,
    {
      event: "initial_prompt_queued",
      iteration,
      promptIndex: 1,
      promptCount: prompts.length,
    },
    env,
  );
  const initialPrompt = expandVisibleLoopPromptTemplate(prompts[0], state.config.cwd);
  if (!initialPrompt.ok) {
    stopVisibleLoopForPromptExpansionFailure(state, ctx, initialPrompt, iteration, 1, env);
    return;
  }
  state.sendUserMessage(initialPrompt.prompt);
  if (
    !recordVisibleLoopControllerEvent(
      state,
      { kind: "initial_prompt_delivered", iteration, promptIndex: 1 },
      env,
    )
  ) {
    ctx.ui?.notify?.("visible-loop adaptive controller rejected initial prompt delivery", "error");
    return;
  }
  persistActiveVisibleLoopState(state, ctx, env);
  const queuedCompletedIterations = state.completedIterations;
  setTimeout(() => {
    if (
      activeVisibleLoop === state &&
      !state.stopped &&
      state.completedIterations === queuedCompletedIterations &&
      state.followupsQueuedForIteration !== queuedCompletedIterations
    ) {
      state.followupsQueuedForIteration = queuedCompletedIterations;
      persistActiveVisibleLoopState(state, ctx, env);
      queueVisibleLoopFollowups(state, ctx, env);
    }
  }, 1000);
}

function queueVisibleLoopFollowups(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const prompts = getVisibleLoopPrompts(state.config);
  const iteration = state.completedIterations + 1;
  const realFollowups = prompts.slice(1);
  const completionPrompt = renderVisibleLoopCompletionPrompt({
    configPath: state.configPath,
    iteration,
    promptCount: prompts.length,
    productPosturePath: state.config.productPostureTarget?.productPosturePath,
    productPostureExists: state.config.productPostureTarget?.productPostureExists,
    visionPath: state.config.productPostureTarget?.visionPath,
    visionExists: state.config.productPostureTarget?.visionExists,
    adaptiveController: Boolean(state.config.adaptiveController),
    selfEvolutionEnvelope: state.config.selfEvolutionEnvelope,
  });
  const delegatesCompletion = visibleLoopDelegatesCompletion(state.config, realFollowups);
  const followups = delegatesCompletion ? [...realFollowups] : [...realFollowups, completionPrompt];
  appendVisibleLoopStatus(
    state.config,
    {
      event: "followups_queued",
      iteration,
      promptFollowupCount: realFollowups.length,
      completionPromptQueued: !delegatesCompletion,
      delegatedCompletion: delegatesCompletion,
      completionCommand: true,
    },
    env,
  );

  followups.forEach((prompt, index) => {
    setTimeout(() => {
      if (activeVisibleLoop !== state || state.stopped) return;
      const isCompletionPrompt = index >= realFollowups.length;
      appendVisibleLoopStatus(
        state.config,
        {
          event: isCompletionPrompt ? "completion_prompt_queued" : "followup_prompt_queued",
          iteration,
          promptIndex: isCompletionPrompt ? prompts.length + 1 : index + 2,
          promptCount: prompts.length,
        },
        env,
      );
      if (isCompletionPrompt) {
        state.sendUserMessage(prompt, { deliverAs: "followUp" });
        recordVisibleLoopControllerEvent(
          state,
          { kind: "completion_checkpoint_delivered", iteration },
          env,
        );
        persistActiveVisibleLoopState(state, ctx ?? {}, env);
        return;
      }
      const expandedPrompt = expandVisibleLoopPromptTemplate(prompt, state.config.cwd);
      if (!expandedPrompt.ok) {
        stopVisibleLoopForPromptExpansionFailure(
          state,
          ctx,
          expandedPrompt,
          iteration,
          index + 2,
          env,
        );
        return;
      }
      const deliveryPrompt = maybeRenderDelegatedVisibleLoopPrompt(
        state,
        ctx,
        expandedPrompt,
        iteration,
        index + 2,
        env,
      );
      if (!deliveryPrompt) return;
      state.sendUserMessage(deliveryPrompt, { deliverAs: "followUp" });
      if (
        !recordVisibleLoopControllerEvent(
          state,
          { kind: "followup_prompt_delivered", iteration, promptIndex: index + 2 },
          env,
        )
      ) {
        ctx?.ui?.notify?.("visible-loop adaptive controller rejected followup delivery", "error");
        return;
      }
      if (
        state.config.commitDelegation &&
        expandedPrompt.templateName === state.config.commitDelegation.promptTemplate
      ) {
        recordVisibleLoopControllerEvent(
          state,
          { kind: "delegated_completion_requested", iteration },
          env,
        );
      }
      persistActiveVisibleLoopState(state, ctx ?? {}, env);
    }, 150 * index);
  });
}

function visibleLoopDelegatesCompletion(
  config: VisibleLoopRunConfig,
  realFollowups: string[],
): boolean {
  const delegation = config.commitDelegation;
  if (!delegation) return false;
  const delegatedSlash = `/${delegation.promptTemplate}`;
  return realFollowups.some((prompt) => prompt.trim().split(/\s+/u)[0] === delegatedSlash);
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
      event: "commit_delegation_prompt_queued",
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
  state.stopped = true;
  const detail = expansion.error ?? "prompt template expansion failed";
  recordVisibleLoopControllerEvent(
    state,
    { kind: "prompt_delivery_failed", iteration, promptIndex, reason: detail },
    env,
  );
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
):
  | { accepted: true; continuationDecision?: VisibleLoopContinuationDecision }
  | { accepted: false; reason: string } {
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

  const promptCount = getVisibleLoopCompletionTurnCount(state.config);
  const nextIteration = state.completedIterations + 1;
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

  if (
    !recordVisibleLoopControllerEvent(
      state,
      { kind: "completion_requested", iteration: nextIteration },
      env,
    )
  ) {
    return { accepted: false, reason: "adaptive controller rejected completion request" };
  }
  if (state.config.adaptiveController) {
    if (!state.controllerState) {
      return { accepted: false, reason: "adaptive controller state unavailable" };
    }
    const prompts = getVisibleLoopPrompts(state.config);
    const invariant = validateVisibleLoopCompletionInvariants({
      state: state.controllerState,
      iteration: nextIteration,
      promptCount: prompts.length,
      delegatedCompletion: visibleLoopDelegatesCompletion(state.config, prompts.slice(1)),
    });
    if (!invariant.ok) {
      const reason = `${invariant.error}: missing=${invariant.missingProofIds.join(",") || "none"}; invalidated=${invariant.invalidatedProofIds.join(",") || "none"}`;
      appendVisibleLoopStatus(
        state.config,
        {
          event: "adaptive_completion_rejected",
          iteration: nextIteration,
          reason,
          missingProofIds: invariant.missingProofIds,
          invalidatedProofIds: invariant.invalidatedProofIds,
        },
        env,
      );
      persistActiveVisibleLoopState(state, ctx, env);
      return { accepted: false, reason };
    }
    appendVisibleLoopStatus(
      state.config,
      {
        event: "adaptive_completion_invariants_passed",
        iteration: nextIteration,
        proofIds: invariant.proofIds,
        authority: "diagnostic_transport_proof_only_non_authoritative",
      },
      env,
    );
  }

  if (
    !recordVisibleLoopControllerEvent(
      state,
      { kind: "iteration_completed", iteration: nextIteration },
      env,
    )
  ) {
    return { accepted: false, reason: "adaptive controller rejected iteration completion" };
  }
  if (state.config.adaptiveController && !persistActiveVisibleLoopState(state, ctx, env)) {
    return { accepted: false, reason: "adaptive controller state persistence failed" };
  }

  state.completedIterations = nextIteration;
  state.completedPromptCount = Math.max(state.completedPromptCount, nextIteration * promptCount);
  appendVisibleLoopStatus(
    state.config,
    {
      event: "iteration_completed",
      source,
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
    },
    env,
  );
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

  const continuationDecision = state.config.adaptiveController
    ? decideVisibleLoopContinuation({
        completedIterations: state.completedIterations,
        loopCount: state.config.loopCount,
        weightedCost: state.controllerState?.weightedCost ?? Number.POSITIVE_INFINITY,
        maxWeightedCost: state.config.adaptiveController.maxWeightedCost,
        hasNewSessionContinuation: Boolean(state.continueInNewSession),
      })
    : undefined;
  if (continuationDecision) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "adaptive_continuation_decided",
        completedIterations: state.completedIterations,
        decision: continuationDecision,
        weightedCost: state.controllerState?.weightedCost ?? null,
      },
      env,
    );
  }

  if (state.completedIterations >= state.config.loopCount) {
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "loop_completed",
        source,
        completedPromptCount: state.completedPromptCount,
        completedIterations: state.completedIterations,
      },
      env,
    );
    persistActiveVisibleLoopState(state, ctx, env);
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
        removeActiveVisibleLoopState(ctx, env);
        if (activeVisibleLoop === state) activeVisibleLoop = null;
        ctx.ui?.setStatus?.(getVisibleLoopCommandName(state.config), undefined);
      });
    return { accepted: true, ...(continuationDecision ? { continuationDecision } : {}) };
  }

  persistActiveVisibleLoopState(state, ctx, env);

  const useNewSession = continuationDecision
    ? continuationDecision.method === "new_session" ||
      (continuationDecision.method === "baseline_fallback" && Boolean(state.continueInNewSession))
    : Boolean(state.continueInNewSession);
  if (useNewSession && state.continueInNewSession) {
    const nextIteration = state.completedIterations + 1;
    state.stopped = true;
    persistActiveVisibleLoopState(state, ctx, env);
    void progressReport
      .then(() => {
        appendVisibleLoopStatus(
          state.config,
          { event: "next_iteration_launch_requested", nextIteration },
          env,
        );
        return Promise.resolve(
          state.continueInNewSession?.({
            config: state.config,
            configPath: state.configPath,
            completedIterations: state.completedIterations,
            nextIteration,
          }),
        );
      })
      .then(() => {
        appendVisibleLoopStatus(
          state.config,
          { event: "next_iteration_launch_dispatched", nextIteration },
          env,
        );
        removeActiveVisibleLoopState(ctx, env);
        if (activeVisibleLoop === state) activeVisibleLoop = null;
        ctx.ui?.setStatus?.(getVisibleLoopCommandName(state.config), undefined);
      })
      .catch((error) => {
        state.stopped = false;
        recordVisibleLoopControllerEvent(
          state,
          {
            kind: "continuation_failed",
            iteration: nextIteration,
            reason: error instanceof Error ? error.message : String(error),
          },
          env,
        );
        persistActiveVisibleLoopState(state, ctx, env);
        appendVisibleLoopStatus(
          state.config,
          {
            event: "next_iteration_spawn_failed",
            nextIteration,
            error: error instanceof Error ? error.message : String(error),
          },
          env,
        );
        if (state.config.adaptiveController) {
          ctx.ui?.notify?.(
            `${getVisibleLoopHumanLabel(state.config)} failed to launch iteration ${nextIteration}/${state.config.loopCount}; continuing in the current session: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "warning",
          );
          if (!state.stopped && activeVisibleLoop === state) {
            appendVisibleLoopStatus(
              state.config,
              { event: "next_iteration_same_session_fallback", nextIteration },
              env,
            );
            queueVisibleLoopIteration(state, ctx, env);
          }
        } else {
          ctx.ui?.notify?.(
            `${getVisibleLoopHumanLabel(state.config)} failed to launch iteration ${nextIteration}/${state.config.loopCount}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error",
          );
        }
      });
    return { accepted: true, ...(continuationDecision ? { continuationDecision } : {}) };
  }

  void progressReport.finally(() => {
    setTimeout(() => {
      if (activeVisibleLoop === state && !state.stopped) {
        queueVisibleLoopIteration(state, ctx, env);
      }
    }, 250);
  });
  return { accepted: true, ...(continuationDecision ? { continuationDecision } : {}) };
}

function getVisibleLoopCompletionTurnCount(_config: VisibleLoopRunConfig): number {
  return 1;
}

function getVisibleLoopPrompts(config: VisibleLoopRunConfig): string[] {
  return config.prompts.map((prompt) => prompt.trim()).filter(Boolean);
}

function recreateActiveVisibleLoopState(
  config: VisibleLoopRunConfig,
  configPath: string,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): ActiveVisibleLoopState | null {
  const sendUserMessage = getSendUserMessage(pi);
  if (!sendUserMessage) return null;
  const state: ActiveVisibleLoopState = {
    config,
    configPath,
    completedPromptCount: 0,
    completedIterations: 0,
    controllerState: config.adaptiveController ? createVisibleLoopControllerState() : undefined,
    sendUserMessage,
    peerRuntime: null,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    persistControllerState: runnerOptions.persistControllerState ?? writeVisibleLoopControllerState,
    stopped: false,
    followupsQueuedForIteration: null,
    createPeerRuntime: runnerOptions.createPeerRuntime,
    continueInNewSession: runnerOptions.continueInNewSession,
  };
  activeVisibleLoop = state;
  appendVisibleLoopStatus(
    config,
    {
      event: "active_state_recreated",
      reason: "completion_command_without_active_state",
      sessionKey: getVisibleLoopSessionKey(ctx) ?? null,
    },
    env,
  );
  return state;
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
    timer.unref?.();
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
  continuationDecision?: VisibleLoopContinuationDecision;
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
  const parsed = parseVisibleLoopCompletionArgs(args);
  if (!parsed.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${parsed.error}`, "warning");
    return rejectedCompletion(parsed.error);
  }

  const existingState =
    activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
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
      ...(completion.continuationDecision
        ? { continuationDecision: completion.continuationDecision }
        : {}),
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
    !activeVisibleLoop &&
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

  if (configResult.config.adaptiveController && !existingState) {
    const reason = "adaptive active controller state unavailable";
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "adaptive_controller_gate",
        reason,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.(`visible-loop completion ignored: ${reason}`, "warning");
    return rejectedCompletion(reason, configResult.config);
  }

  const state =
    existingState ??
    recreateActiveVisibleLoopState(
      configResult.config,
      parsed.configPath,
      pi,
      ctx,
      env,
      runnerOptions,
    );
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
    ...(completion.continuationDecision
      ? { continuationDecision: completion.continuationDecision }
      : {}),
  };
}

function getSendUserMessage(pi: ExtensionAPI): SendUserMessage | undefined {
  const candidate = (pi as unknown as { sendUserMessage?: SendUserMessage }).sendUserMessage;
  return typeof candidate === "function" ? candidate.bind(pi) : undefined;
}
