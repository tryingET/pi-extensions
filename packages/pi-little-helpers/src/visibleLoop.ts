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
  getVisibleLoopCommandName,
  getVisibleLoopHumanLabel,
  getVisibleLoopIntercomEventPrefix,
  getVisibleLoopTitle,
  normalizeVisibleLoopCommandName,
} from "./visibleLoopProfiles.ts";
import {
  DEFAULT_VISIBLE_LOOP_PROMPTS,
  expandVisibleLoopPromptTemplate,
  GOVERNED_DEEP_REVIEW_OBJECTIVE,
  GOVERNED_DEEP_REVIEW_PROMPT,
  renderVisibleLoopCommitDelegationPrompt,
  renderVisibleLoopCompletionPrompt,
  type VisibleLoopPromptExpansion,
} from "./visibleLoopPromptTemplates.ts";
import {
  appendVisibleLoopStatus,
  getVisibleLoopStateDir,
  hasVisibleLoopAlreadyCompleted,
  loadVisibleLoopRunConfig,
  readCompletedVisibleLoopIterations,
} from "./visibleLoopState.ts";
import {
  VISIBLE_LOOP_CHILD_COMMAND,
  type VisibleLoopCommitDelegation,
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

  const state: ActiveVisibleLoopState = {
    config,
    configPath,
    completedPromptCount: restoredIterations * getVisibleLoopCompletionTurnCount(config),
    completedIterations: restoredIterations,
    sendUserMessage,
    peerRuntime: null,
    createPeerRuntime: runnerOptions.createPeerRuntime,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    stopped: false,
    followupsQueuedForIteration: null,
    currentPromptIndex: 0,
    completionPromptQueued: false,
    pendingDeliveryPrompt: null,
    currentPromptObserved: false,
    currentPromptAgentStarted: false,
    governedDeepReviewToolCallId: null,
    governedDeepReviewSucceededIteration: null,
    continueInNewSession: runnerOptions.continueInNewSession,
  };
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
  persistActiveVisibleLoopState(state, ctx, env);

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

export function handleVisibleLoopMessageStart(
  event: { message?: unknown },
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = activeVisibleLoop;
  if (!state || state.stopped || !state.pendingDeliveryPrompt) return;
  const message = event.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return;
  const record = message as Record<string, unknown>;
  if (record.role !== "user") return;
  const content = record.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((item): item is { type: "text"; text: string } =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  !Array.isArray(item) &&
                  (item as Record<string, unknown>).type === "text" &&
                  typeof (item as Record<string, unknown>).text === "string",
              ),
            )
            .map((item) => item.text)
            .join("\n")
        : undefined;
  if (text !== state.pendingDeliveryPrompt) return;

  state.pendingDeliveryPrompt = null;
  state.currentPromptObserved = true;
  // Pi emits agent_start before the first user message_start for the run. Observing the
  // exact queued user text supplies the correlation that the earlier event lacks.
  state.currentPromptAgentStarted = true;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "prompt_delivery_observed",
      iteration: state.completedIterations + 1,
      promptIndex: state.completionPromptQueued
        ? getVisibleLoopPrompts(state.config).length + 1
        : state.currentPromptIndex + 1,
    },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);
}

export function handleVisibleLoopAgentStart(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  // Follow-ups are deliberately delivered one-at-a-time from agent_settled. A settled
  // event may advance only after the queued prompt has caused a new agent run to start.
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped || !state.currentPromptObserved) return;
  state.currentPromptAgentStarted = true;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "prompt_agent_started",
      iteration: state.completedIterations + 1,
      promptIndex: state.currentPromptIndex + 1,
    },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);
}

export function handleVisibleLoopToolExecutionStart(
  event: { toolCallId?: string; toolName?: string; args?: unknown },
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = activeVisibleLoop;
  if (!state || state.stopped || event.toolName !== "vault_execute_template") return;
  const prompts = getVisibleLoopPrompts(state.config);
  if (!isGovernedDeepReviewPrompt(state.config, prompts[state.currentPromptIndex])) return;
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
  state.governedDeepReviewToolCallId = event.toolCallId;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "governed_deep_review_tool_started",
      iteration: state.completedIterations + 1,
      promptIndex: state.currentPromptIndex + 1,
      toolCallId: event.toolCallId,
    },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);
}

export function handleVisibleLoopToolExecutionEnd(
  event: {
    toolCallId?: string;
    toolName?: string;
    result?: { details?: unknown };
    isError?: boolean;
  },
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = activeVisibleLoop;
  if (!state || state.stopped || event.toolName !== "vault_execute_template") return;
  const prompts = getVisibleLoopPrompts(state.config);
  if (!isGovernedDeepReviewPrompt(state.config, prompts[state.currentPromptIndex])) return;
  if (
    typeof event.toolCallId !== "string" ||
    event.toolCallId !== state.governedDeepReviewToolCallId
  ) {
    return;
  }
  state.governedDeepReviewToolCallId = null;
  const details = event.result?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return;
  const record = details as Record<string, unknown>;
  if (
    event.isError !== true &&
    record.ok === true &&
    record.templateName === "deep-review" &&
    record.executionSurface === "workflow_execute" &&
    typeof record.handoffId === "string" &&
    record.handoffId.trim() &&
    record.status === "done"
  ) {
    state.governedDeepReviewSucceededIteration = state.completedIterations + 1;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "governed_deep_review_succeeded",
        iteration: state.completedIterations + 1,
        promptIndex: state.currentPromptIndex + 1,
        handoffId: record.handoffId,
        runId: record.runId ?? null,
      },
      env,
    );
    persistActiveVisibleLoopState(state, ctx, env);
  }
}

export function handleVisibleLoopAgentSettled(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): void {
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!state || state.stopped) return;
  if (!state.currentPromptAgentStarted) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "agent_settled_ignored",
        reason: "queued prompt has not started an agent run",
        iteration: state.completedIterations + 1,
        promptIndex: state.currentPromptIndex + 1,
      },
      env,
    );
    return;
  }

  state.currentPromptAgentStarted = false;
  state.completedPromptCount += 1;
  appendVisibleLoopStatus(
    state.config,
    {
      event: "agent_settled_observed",
      source: "agent_settled",
      pendingMessages: Boolean(ctx.hasPendingMessages?.()),
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
      currentPromptIndex: state.currentPromptIndex + 1,
      completionMode: "sequential_explicit_completion_prompt",
    },
    env,
  );

  const prompts = getVisibleLoopPrompts(state.config);
  const iteration = state.completedIterations + 1;
  const completedPrompt = prompts[state.currentPromptIndex];
  if (
    isGovernedDeepReviewPrompt(state.config, completedPrompt) &&
    state.governedDeepReviewSucceededIteration !== iteration
  ) {
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "governed_deep_review_failed_closed",
        iteration,
        promptIndex: state.currentPromptIndex + 1,
        reason: "missing successful vault_execute_template workflow receipt",
      },
      env,
    );
    persistActiveVisibleLoopState(state, ctx, env);
    ctx.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} stopped: governed deep-review did not complete successfully`,
      "error",
    );
    return;
  }

  if (state.currentPromptIndex + 1 < prompts.length) {
    queueVisibleLoopPromptAtIndex(state, ctx, state.currentPromptIndex + 1, env);
    return;
  }

  if (visibleLoopDelegatesCompletion(state.config, prompts.slice(1))) {
    appendVisibleLoopStatus(
      state.config,
      { event: "delegated_completion_awaited", iteration },
      env,
    );
    persistActiveVisibleLoopState(state, ctx, env);
    return;
  }

  if (!state.completionPromptQueued) {
    state.completionPromptQueued = true;
    state.currentPromptObserved = false;
    state.currentPromptAgentStarted = false;
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
    state.pendingDeliveryPrompt = completionPrompt;
    appendVisibleLoopStatus(
      state.config,
      { event: "completion_prompt_queued", iteration, promptIndex: prompts.length + 1 },
      env,
    );
    try {
      state.sendUserMessage(completionPrompt);
    } catch (error) {
      state.stopped = true;
      appendVisibleLoopStatus(
        state.config,
        {
          event: "prompt_delivery_failed_closed",
          iteration,
          promptIndex: prompts.length + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        env,
      );
      persistActiveVisibleLoopState(state, ctx, env);
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(state.config)} stopped: completion prompt delivery failed`,
        "error",
      );
    }
    return;
  }

  state.stopped = true;
  appendVisibleLoopStatus(
    state.config,
    { event: "completion_checkpoint_failed_closed", iteration },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);
  ctx.ui?.notify?.(
    `${getVisibleLoopHumanLabel(state.config)} stopped: completion checkpoint settled without acceptance`,
    "error",
  );
}

interface ActiveVisibleLoopState {
  config: VisibleLoopRunConfig;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  sendUserMessage: SendUserMessage;
  peerRuntime: PeerMessagingRuntime | null;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTail: Promise<void>;
  intercomSendTimeoutMs: number;
  stopped: boolean;
  followupsQueuedForIteration: number | null;
  currentPromptIndex: number;
  completionPromptQueued: boolean;
  pendingDeliveryPrompt: string | null;
  currentPromptObserved: boolean;
  currentPromptAgentStarted: boolean;
  governedDeepReviewToolCallId: string | null;
  governedDeepReviewSucceededIteration: number | null;
  continueInNewSession?: ContinueVisibleLoopInNewSession;
}

let activeVisibleLoop: ActiveVisibleLoopState | null = null;

interface PersistedActiveVisibleLoopState {
  schemaVersion: 1;
  runId: string;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  followupsQueuedForIteration: number | null;
  currentPromptIndex?: number;
  completionPromptQueued?: boolean;
  governedDeepReviewSucceededIteration?: number | null;
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
): void {
  const path = getActiveVisibleLoopStatePath(ctx, env);
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const persisted: PersistedActiveVisibleLoopState = {
      schemaVersion: 1,
      runId: state.config.runId,
      configPath: state.configPath,
      completedPromptCount: state.completedPromptCount,
      completedIterations: state.completedIterations,
      followupsQueuedForIteration: state.followupsQueuedForIteration,
      currentPromptIndex: state.currentPromptIndex,
      completionPromptQueued: state.completionPromptQueued,
      governedDeepReviewSucceededIteration: state.governedDeepReviewSucceededIteration,
      stopped: state.stopped,
    };
    writeFileSync(path, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  } catch {
    // Diagnostic persistence only; keep visible loop running.
  }
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
      sendUserMessage,
      peerRuntime: null,
      createPeerRuntime: runnerOptions.createPeerRuntime,
      intercomSendTail: Promise.resolve(),
      intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
      stopped: Boolean(persisted.stopped),
      followupsQueuedForIteration:
        typeof persisted.followupsQueuedForIteration === "number"
          ? persisted.followupsQueuedForIteration
          : null,
      currentPromptIndex: Number.isInteger(persisted.currentPromptIndex)
        ? Number(persisted.currentPromptIndex)
        : 0,
      completionPromptQueued: Boolean(persisted.completionPromptQueued),
      pendingDeliveryPrompt: null,
      currentPromptObserved: false,
      currentPromptAgentStarted: false,
      governedDeepReviewToolCallId: null,
      governedDeepReviewSucceededIteration: Number.isInteger(
        persisted.governedDeepReviewSucceededIteration,
      )
        ? Number(persisted.governedDeepReviewSucceededIteration)
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
  state.currentPromptIndex = 0;
  state.completionPromptQueued = false;
  state.pendingDeliveryPrompt = null;
  state.currentPromptObserved = false;
  state.currentPromptAgentStarted = false;
  state.governedDeepReviewToolCallId = null;
  state.governedDeepReviewSucceededIteration = null;
  queueVisibleLoopPromptAtIndex(state, ctx, 0, env);
}

function queueVisibleLoopPromptAtIndex(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext | undefined,
  promptIndex: number,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (activeVisibleLoop !== state || state.stopped) return;
  const prompts = getVisibleLoopPrompts(state.config);
  const prompt = prompts[promptIndex];
  if (prompt === undefined) return;
  const iteration = state.completedIterations + 1;
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
  state.currentPromptIndex = promptIndex;
  state.pendingDeliveryPrompt = deliveryPrompt;
  state.currentPromptObserved = false;
  state.currentPromptAgentStarted = false;
  state.governedDeepReviewToolCallId = null;
  appendVisibleLoopStatus(
    state.config,
    {
      event: promptIndex === 0 ? "initial_prompt_queued" : "followup_prompt_queued",
      iteration,
      promptIndex: promptIndex + 1,
      promptCount: prompts.length,
      deliveryMode: "sequential_after_agent_settled",
    },
    env,
  );
  try {
    state.sendUserMessage(deliveryPrompt);
  } catch (error) {
    state.stopped = true;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "prompt_delivery_failed_closed",
        iteration,
        promptIndex: promptIndex + 1,
        error: error instanceof Error ? error.message : String(error),
      },
      env,
    );
    if (ctx) persistActiveVisibleLoopState(state, ctx, env);
    ctx?.ui?.notify?.(
      `${getVisibleLoopHumanLabel(state.config)} stopped: queued prompt delivery failed`,
      "error",
    );
  }
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

  const prompts = getVisibleLoopPrompts(state.config);
  const hasGovernedDeepReview = prompts.some((prompt) =>
    isGovernedDeepReviewPrompt(state.config, prompt),
  );
  if (hasGovernedDeepReview && state.governedDeepReviewSucceededIteration !== nextIteration) {
    const reason = "governed deep-review workflow receipt is missing";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        nextIteration,
      },
      env,
    );
    return { accepted: false, reason };
  }

  if (hasGovernedDeepReview && !hasReachedVisibleLoopCompletionCheckpoint(state, prompts)) {
    const reason =
      "governed visible-loop prompt sequence has not reached its completion checkpoint";
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason,
        expectedIteration: expectedIteration ?? null,
        nextIteration,
        currentPromptIndex: state.currentPromptIndex + 1,
        promptCount: prompts.length,
        completionPromptQueued: state.completionPromptQueued,
      },
      env,
    );
    return { accepted: false, reason };
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
    return { accepted: true };
  }

  persistActiveVisibleLoopState(state, ctx, env);

  if (state.continueInNewSession) {
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
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(state.config)} failed to launch iteration ${nextIteration}/${state.config.loopCount}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "error",
        );
      });
    return { accepted: true };
  }

  void progressReport.finally(() => {
    setTimeout(() => {
      if (activeVisibleLoop === state && !state.stopped) {
        queueVisibleLoopIteration(state, ctx, env);
      }
    }, 250);
  });
  return { accepted: true };
}

function getVisibleLoopCompletionTurnCount(_config: VisibleLoopRunConfig): number {
  return 1;
}

function getVisibleLoopPrompts(config: VisibleLoopRunConfig): string[] {
  return config.prompts.map((prompt) => prompt.trim()).filter(Boolean);
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

function hasReachedVisibleLoopCompletionCheckpoint(
  state: ActiveVisibleLoopState,
  prompts: string[],
): boolean {
  if (
    prompts.length === 0 ||
    state.currentPromptIndex !== prompts.length - 1 ||
    !state.currentPromptAgentStarted
  ) {
    return false;
  }
  if (visibleLoopDelegatesCompletion(state.config, prompts.slice(1))) return true;
  return state.completionPromptQueued;
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
    sendUserMessage,
    peerRuntime: null,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
    stopped: false,
    followupsQueuedForIteration: null,
    currentPromptIndex: 0,
    completionPromptQueued: false,
    pendingDeliveryPrompt: null,
    currentPromptObserved: false,
    currentPromptAgentStarted: false,
    governedDeepReviewToolCallId: null,
    governedDeepReviewSucceededIteration: null,
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
  };
}

function getSendUserMessage(pi: ExtensionAPI): SendUserMessage | undefined {
  const candidate = (pi as unknown as { sendUserMessage?: SendUserMessage }).sendUserMessage;
  return typeof candidate === "function" ? candidate.bind(pi) : undefined;
}
