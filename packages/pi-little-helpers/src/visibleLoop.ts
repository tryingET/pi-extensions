import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const VISIBLE_LOOP_COMMAND = "visible-loop";
export const NEXUS_LOOP_COMMAND = "nexus-loop";
export const VISIBLE_LOOP_CHILD_COMMAND = "visible-loop-child";
export const VISIBLE_LOOP_CHILD_COMPLETE_COMMAND = "visible-loop-child-complete";

const DEFAULT_PROMPT_VAULT_INSTRUCTIONS = [
  "Use Prompt Vault (`~/ai-society/core/prompt-vault`) like trigger folders.",
  "1) Select the single best-matching template for this task.",
  "- `vault_query(..., include_content:false)`",
  "2) Retrieve that template's full content.",
  "- `vault_retrieve(..., include_content:true)`",
  "3) Before executing it, check dispatch posture.",
  '- `vault_dispatch_check({ template_names: ["<name>"] })`',
  "- If posture is `text_ok`, execute it as written.",
  "- If posture requires orchestrator dispatch/gating, use that binding; do not bypass the gate with text-only interpretation.",
  "4) Execution means: inspect the current repo/state, apply the needed bounded fixes, run verification, and only then report. Do not stop after retrieving the template, quoting it, or filling its output format with a plan.",
  "5) If the template has an OUTPUT FORMAT, follow it exactly for the final answer, but make the fields reflect actual work performed, explicit deferrals, or hard blockers.",
  "6) Do not reference unretrieved frameworks.",
  "7) If vault is unavailable, continue best-effort and say so.",
  "Use as many frameworks as necessary, and as few as possible.",
  "Grounding (one line at end):",
  "`grounding: template=<name>, vault_status=<ok|unavailable>`",
].join("\n");

const DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT = [
  "Update @docs/project/product-posture.md before loop completion.",
  "",
  "Use the actual implementation, validation, docs, and bugfixes from this iteration.",
  "Treat product-posture as the next-iteration frontier map, not a changelog.",
  "",
  "Make the smallest truthful update that records:",
  "- what product maturity changed;",
  "- what proof/validation now exists;",
  "- what main gap remains;",
  "- any authority/provenance/source-owner boundary that became clearer;",
  "- what the next highest-leverage slice should understand before choosing work.",
  "",
  "If product-posture cannot be updated truthfully, stop and report the blocker.",
  "Do not send/allow the visible-loop completion signal until this posture refresh is done.",
  "Do not commit yet.",
].join("\n");

export const DEFAULT_NEXUS_LOOP_PROMPTS = [
  "/deep-review",
  "proceed with nexus implementation until completion and verification",
  [
    "fix any bugs / code smells / gaps or tech-debt left with atomic-completion",
    "",
    DEFAULT_PROMPT_VAULT_INSTRUCTIONS,
  ].join("\n"),
  "/commit",
] as const;

export const DEFAULT_VISIBLE_LOOP_PROMPTS = [
  [
    "read @docs/project/vision.md and @docs/project/product-posture.md.",
    "",
    "From current repo state, identify the next highest-impact slice.",
    "Treat the apparent slice as a hypothesis until discovery confirms it.",
    "Reason from first principles and consider multi-order effects.",
    "",
    "Before implementation, produce a compact design membrane:",
    "",
    "1. CURRENT STATE",
    "- What exists now?",
    "- What is broken, missing, stale, misleading, or under-proven?",
    "- What evidence from files/tests/docs supports that?",
    "",
    "2. RECONSTRUCTED OBJECTIVE",
    "- What should actually be improved?",
    "- Why is this the highest-leverage next move?",
    "- What would done mean in observable terms?",
    "",
    "3. OWNER / AUTHORITY BOUNDARIES",
    "- What does this package/repo own?",
    "- What must remain external?",
    "- What would authority drift look like?",
    "",
    "4. DOMAIN / DATA / STATE MODEL",
    "- What are the core entities and lifecycle states?",
    "- What inputs, outputs, files, DBs, tools, subprocesses, or generated artifacts are involved?",
    "- What is canonical truth vs projection/cache/receipt/packet?",
    "",
    "5. TRUST / SECURITY MODEL",
    "- Which inputs are caller-controlled or untrusted?",
    "- What paths/processes/network/DBs can be read or written?",
    "- What path escape, symlink, TOCTOU, size/time, permission, stale-state, injection, or secret-leak risks exist?",
    "- What must be redacted?",
    "- What must fail closed?",
    "",
    "6. UX / AX / DX CONTRACT",
    "- What should the operator see?",
    "- What should the agent see?",
    "- What wording could imply false authority, false provenance, or false completion?",
    "- What exact next actions should be obvious?",
    "",
    "7. FAILURE / ROLLBACK MODEL",
    "- What partial writes or artifacts can occur?",
    "- How are failures surfaced?",
    "- How is the change reverted?",
    "- What is the point of no return?",
    "",
    "8. ADVERSARIAL TEST PLAN",
    "- Name the negative/adversarial tests required before done.",
    "- Include malicious input, missing/stale state, wrong owner surface, path escape, symlink/TOCTOU, huge input, permission failure, misleading provenance, and rollback/partial-write cases when relevant.",
    "",
    "Do not implement until the design membrane is explicit.",
    "",
    "Then implement the bounded complete change that satisfies the membrane.",
    "Do not optimize for smallest diff. Optimize for bounded completeness:",
    "- broad enough to satisfy the design membrane;",
    "- narrow enough to avoid unrelated ownership drift;",
    "- complete enough that known bugs/gaps are not left to later;",
    "- structural enough to remove root causes when patching symptoms would compound debt.",
    "",
    "Verify with normal tests, adversarial/negative tests from the membrane, docs/artifact checks if behavior changed, and dogfooding where relevant.",
    "",
    "Proceed until completed and validated.",
  ].join("\n"),
  "proceed",
  "proceed",
  "proceed",
  "/deep-review",
  "proceed with nexus implementation until completion and verification",
  [
    "fix any bugs / code smells / gaps or tech-debt left with atomic-completion",
    "",
    DEFAULT_PROMPT_VAULT_INSTRUCTIONS,
  ].join("\n"),
  DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT,
  "/commit",
] as const;

export type VisibleLoopReportBack = "intercom" | "manual" | "none";

export interface VisibleLoopRunConfig {
  schemaVersion: 1;
  runId: string;
  loopCount: number;
  cwd: string;
  prompts: string[];
  reportBack: VisibleLoopReportBack;
  parentPeerTarget?: string;
  title?: string;
  createdAt: string;
}

type SendUserMessageOptions = { deliverAs?: "followUp" | "steer" };
type SendUserMessage = (message: string, options?: SendUserMessageOptions) => void;

interface VisibleLoopPromptTemplate {
  name: string;
  content: string;
}

interface VisibleLoopPromptExpansion {
  ok: boolean;
  prompt: string;
  templateName?: string;
  error?: string;
}

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

export type VisibleLoopCommandParseResult =
  | { ok: true; loopCount: number; reportBack: VisibleLoopReportBack; parentPeerTarget?: string }
  | { ok: false; error: string; usage: string };

export function parseVisibleLoopCommandArgs(
  args: string | undefined,
  commandName = VISIBLE_LOOP_COMMAND,
): VisibleLoopCommandParseResult {
  const usage = `Usage: /${commandName} [--count N|N] [--parentPeerTarget session-...] [--reportBack intercom|manual|none]`;
  const tokens = tokenizeArgs(args ?? "");
  let loopCount: number | undefined;
  let parentPeerTarget: string | undefined;
  let reportBack: VisibleLoopReportBack | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;

    if (token === "--count" || token === "-n") {
      index += 1;
      const value = tokens[index];
      const parsed = parseLoopCount(value);
      if (!parsed) return { ok: false, error: `Invalid loop count: ${value ?? ""}`, usage };
      loopCount = parsed;
      continue;
    }

    if (token.startsWith("--count=")) {
      const parsed = parseLoopCount(token.slice("--count=".length));
      if (!parsed) return { ok: false, error: `Invalid loop count: ${token}`, usage };
      loopCount = parsed;
      continue;
    }

    if (token === "--parentPeerTarget" || token === "--parent" || token === "--to") {
      index += 1;
      parentPeerTarget = normalizeOptionalString(tokens[index]);
      if (!parentPeerTarget) return { ok: false, error: "Missing parent peer target.", usage };
      continue;
    }

    if (token.startsWith("--parentPeerTarget=")) {
      parentPeerTarget = normalizeOptionalString(token.slice("--parentPeerTarget=".length));
      if (!parentPeerTarget) return { ok: false, error: "Missing parent peer target.", usage };
      continue;
    }

    if (token === "--reportBack" || token === "--report-back") {
      index += 1;
      const parsed = parseReportBack(tokens[index]);
      if (!parsed) return { ok: false, error: `Invalid reportBack: ${tokens[index] ?? ""}`, usage };
      reportBack = parsed;
      continue;
    }

    if (token.startsWith("--reportBack=") || token.startsWith("--report-back=")) {
      const raw = token.includes("--reportBack=")
        ? token.slice("--reportBack=".length)
        : token.slice("--report-back=".length);
      const parsed = parseReportBack(raw);
      if (!parsed) return { ok: false, error: `Invalid reportBack: ${raw}`, usage };
      reportBack = parsed;
      continue;
    }

    if (token === "--manual") {
      reportBack = "manual";
      continue;
    }

    if (token === "--none") {
      reportBack = "none";
      continue;
    }

    if (!token.startsWith("-") && loopCount === undefined) {
      const parsed = parseLoopCount(token);
      if (!parsed) return { ok: false, error: `Invalid loop count: ${token}`, usage };
      loopCount = parsed;
      continue;
    }

    return { ok: false, error: `Unknown argument: ${token}`, usage };
  }

  return {
    ok: true,
    loopCount: loopCount ?? 1,
    reportBack: reportBack ?? "intercom",
    parentPeerTarget,
  };
}

export function createVisibleLoopRunConfig(input: {
  loopCount: number;
  cwd: string;
  reportBack: VisibleLoopReportBack;
  parentPeerTarget?: string;
  prompts?: readonly string[];
  runId?: string;
  runIdPrefix?: string;
  title?: string;
}): VisibleLoopRunConfig {
  const runIdPrefix = normalizeRunIdPrefix(input.runIdPrefix ?? "visible-loop");
  return {
    schemaVersion: 1,
    runId: input.runId ?? `${runIdPrefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    loopCount: input.loopCount,
    cwd: input.cwd,
    prompts: [...(input.prompts ?? DEFAULT_VISIBLE_LOOP_PROMPTS)],
    reportBack: input.reportBack,
    ...(input.parentPeerTarget ? { parentPeerTarget: input.parentPeerTarget } : {}),
    title: input.title ?? "Visible loop",
    createdAt: new Date().toISOString(),
  };
}

function normalizeRunIdPrefix(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "visible-loop";
}

export function getVisibleLoopStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "pi-little-helpers", "visible-loop");
}

export function writeVisibleLoopRunConfig(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dir = getVisibleLoopStateDir(env);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${config.runId}.json`);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return path;
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
    continueInNewSession: runnerOptions.continueInNewSession,
  };
  appendVisibleLoopStatus(
    config,
    {
      event: "child_started",
      reportBack: config.reportBack,
      parentPeerTarget: config.parentPeerTarget ?? null,
    },
    env,
  );
  persistActiveVisibleLoopState(state, ctx, env);

  activeVisibleLoop = state;
  ctx.ui?.setStatus?.("visible-loop", `loop ${restoredIterations}/${config.loopCount}`);
  ctx.ui?.notify?.(
    `visible-loop started: iteration ${restoredIterations + 1}/${config.loopCount} (${config.prompts.length} prompt(s))`,
    "info",
  );

  if (restoredIterations === 0) {
    await sendVisibleLoopIntercom(
      state,
      ctx,
      `PEER_ACK peer_run_id=${config.runId}: visible-loop started (${config.loopCount} iteration(s), ${config.prompts.length} prompt(s) each)`,
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

export function handleVisibleLoopAgentEnd(
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
      event: "agent_end_observed",
      source: "agent_end",
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
  sendUserMessage: SendUserMessage;
  peerRuntime: PeerMessagingRuntime | null;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTail: Promise<void>;
  intercomSendTimeoutMs: number;
  stopped: boolean;
  followupsQueuedForIteration: number | null;
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
    `visible-loop queueing iteration ${iteration}/${state.config.loopCount}`,
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
  });
  const followups = [...realFollowups, completionPrompt];
  appendVisibleLoopStatus(
    state.config,
    {
      event: "followups_queued",
      iteration,
      promptFollowupCount: realFollowups.length,
      completionPromptQueued: true,
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
      state.sendUserMessage(expandedPrompt.prompt, { deliverAs: "followUp" });
    }, 150 * index);
  });
}

function renderVisibleLoopCompletionPrompt(input: {
  configPath: string;
  iteration: number;
  promptCount: number;
}): string {
  return [
    "Visible-loop internal completion checkpoint.",
    "All real prompts for this iteration have now been delivered as prior follow-up turns.",
    "Do not do new implementation, review, or planning work in this checkpoint turn.",
    "If and only if the immediately previous real prompt turn is complete, call the `visible_loop_child_complete` tool with exactly:",
    `- configPath: ${JSON.stringify(input.configPath)}`,
    `- iteration: ${input.iteration}`,
    "Do not call the tool before the previous prompt turn is complete.",
    "Do not call the tool if any configured product-posture refresh or /commit prompt failed, stopped for clarification, or left validation/commit incomplete.",
    `Context: this checkpoint follows ${input.promptCount} real prompt(s) in the current visible-loop iteration.`,
  ].join("\n");
}

function expandVisibleLoopPromptTemplate(prompt: string, cwd: string): VisibleLoopPromptExpansion {
  const templateName = getVisibleLoopSlashTemplateName(prompt);
  if (!templateName) return { ok: true, prompt };
  const resolved = resolveVisibleLoopPromptTemplate(prompt, cwd);
  if (!resolved) {
    return {
      ok: false,
      prompt,
      templateName,
      error: `prompt template /${templateName} is not available to visible-loop expansion`,
    };
  }
  return { ok: true, prompt: resolved.content, templateName: resolved.name };
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
  ctx?.ui?.notify?.(`visible-loop stopped: ${detail}`, "error");
}

export function listMissingVisibleLoopPromptTemplates(
  prompts: readonly string[],
  cwd: string,
): string[] {
  const templates = loadVisibleLoopPromptTemplates(cwd);
  const templateNames = new Set(templates.map((template) => template.name));
  return uniqueStrings(
    prompts
      .map((prompt) => getVisibleLoopSlashTemplateName(prompt))
      .filter((name): name is string => name !== null)
      .filter((name) => !templateNames.has(name)),
  );
}

function resolveVisibleLoopPromptTemplate(
  prompt: string,
  cwd: string,
): { name: string; content: string } | null {
  const templateName = getVisibleLoopSlashTemplateName(prompt);
  if (!templateName) return null;
  const templates = loadVisibleLoopPromptTemplates(cwd);
  if (templates.length === 0) return null;

  const spaceIndex = prompt.indexOf(" ");
  const argsString = spaceIndex === -1 ? "" : prompt.slice(spaceIndex + 1);
  const template = templates.find((candidate) => candidate.name === templateName);
  if (!template) return null;

  return {
    name: template.name,
    content: substituteVisibleLoopPromptArgs(
      template.content,
      parseVisibleLoopPromptArgs(argsString),
    ),
  };
}

function getVisibleLoopSlashTemplateName(prompt: string): string | null {
  if (!prompt.startsWith("/")) return null;
  const spaceIndex = prompt.indexOf(" ");
  const templateName = spaceIndex === -1 ? prompt.slice(1) : prompt.slice(1, spaceIndex);
  return templateName.trim() || null;
}

function loadVisibleLoopPromptTemplates(cwd: string): VisibleLoopPromptTemplate[] {
  // Extension-originated pi.sendUserMessage deliberately bypasses Pi command handling and
  // prompt-template expansion. The public extension API does not expose the active package,
  // settings, or CLI prompt-template list, so visible-loop performs the safe subset it can
  // resolve itself: the default project and global prompt directories documented by Pi.
  // Unresolved slash templates fail closed instead of being sent as misleading literal text.
  const dirs = [join(cwd, ".pi", "prompts"), join(homedir(), ".pi", "agent", "prompts")];
  const templates: VisibleLoopPromptTemplate[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    try {
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith(".md")) continue;
        const name = entry.replace(/\.md$/, "");
        if (seen.has(name)) continue;
        const path = join(dir, entry);
        const stats = statSync(path);
        if (!stats.isFile()) continue;
        seen.add(name);
        templates.push({
          name,
          content: stripVisibleLoopFrontmatter(readFileSync(path, "utf8")).trim(),
        });
      }
    } catch {
      // Prompt expansion is best-effort for ordinary visible-loop prompts.
    }
  }
  return templates;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function stripVisibleLoopFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  return end === -1 ? content : content.slice(end + "\n---\n".length);
}

function parseVisibleLoopPromptArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of argsString) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args;
}

function substituteVisibleLoopPromptArgs(content: string, args: string[]): string {
  let result = content;
  result = result.replace(/\$(\d+)/g, (_, num) => args[Number.parseInt(num, 10) - 1] ?? "");
  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    const start = Math.max(0, Number.parseInt(startStr, 10) - 1);
    if (lengthStr) return args.slice(start, start + Number.parseInt(lengthStr, 10)).join(" ");
    return args.slice(start).join(" ");
  });
  const allArgs = args.join(" ");
  result = result.replace(/\$ARGUMENTS/g, allArgs);
  result = result.replace(/\$@/g, allArgs);
  return result;
}

function completeVisibleLoopIteration(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  source: "agent_end" | "completion_command",
  expectedIteration?: number,
): void {
  if (state.stopped) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason: "loop already stopped",
        expectedIteration: expectedIteration ?? null,
        completedIterations: state.completedIterations,
      },
      env,
    );
    return;
  }

  const promptCount = getVisibleLoopCompletionTurnCount(state.config);
  const nextIteration = state.completedIterations + 1;
  if (expectedIteration !== undefined && expectedIteration !== nextIteration) {
    appendVisibleLoopStatus(
      state.config,
      {
        event: "completion_ignored",
        source,
        reason: "stale or out-of-order iteration",
        expectedIteration,
        nextIteration,
        completedIterations: state.completedIterations,
      },
      env,
    );
    return;
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
    "visible-loop",
    `loop ${state.completedIterations}/${state.config.loopCount}`,
  );

  const progressReport = enqueueVisibleLoopIntercom(
    state,
    ctx,
    `VISIBLE_LOOP_ITERATION peer_run_id=${state.config.runId}: completed iteration ${state.completedIterations}/${state.config.loopCount}`,
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
          `PEER_FINAL peer_run_id=${state.config.runId}: visible-loop complete after ${state.completedIterations}/${state.config.loopCount} iteration(s)`,
          env,
        ),
      )
      .finally(async () => {
        await disconnectVisibleLoopPeerRuntime(state.peerRuntime);
        removeActiveVisibleLoopState(ctx, env);
        if (activeVisibleLoop === state) activeVisibleLoop = null;
        ctx.ui?.setStatus?.("visible-loop", undefined);
      });
    return;
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
        ctx.ui?.setStatus?.("visible-loop", undefined);
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
          `visible-loop failed to launch iteration ${nextIteration}/${state.config.loopCount}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "error",
        );
      });
    return;
  }

  void progressReport.finally(() => {
    setTimeout(() => {
      if (activeVisibleLoop === state && !state.stopped) {
        queueVisibleLoopIteration(state, ctx, env);
      }
    }, 250);
  });
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
    sendUserMessage,
    peerRuntime: null,
    intercomSendTail: Promise.resolve(),
    intercomSendTimeoutMs: resolveVisibleLoopIntercomSendTimeoutMs(env, runnerOptions),
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
    name: "visible-loop",
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

export function getVisibleLoopStatusPath(
  configOrRunId: Pick<VisibleLoopRunConfig, "runId"> | string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const runId = typeof configOrRunId === "string" ? configOrRunId : configOrRunId.runId;
  return join(getVisibleLoopStateDir(env), `${runId}.status.jsonl`);
}

function appendVisibleLoopStatus(
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    mkdirSync(getVisibleLoopStateDir(env), { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      runId: config.runId,
      ...event,
    };
    writeFileSync(getVisibleLoopStatusPath(config, env), `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  } catch {
    // Status sidecar is diagnostic only. Never break the visible loop for it.
  }
}

export async function startVisibleLoopChildCompleteRunner(
  args: string | undefined,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
  runnerOptions: VisibleLoopChildRunnerOptions = {},
): Promise<void> {
  const parsed = parseVisibleLoopCompletionArgs(args);
  if (!parsed.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${parsed.error}`, "warning");
    return;
  }

  const existingState =
    activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env, runnerOptions);
  if (!parsed.configPath) {
    if (!existingState) {
      ctx.ui?.notify?.(
        "visible-loop completion ignored: missing config path and no active visible-loop state",
        "warning",
      );
      return;
    }
    completeVisibleLoopIteration(
      existingState,
      ctx,
      env,
      "completion_command",
      parsed.iteration ?? existingState.completedIterations + 1,
    );
    return;
  }

  const configResult = loadVisibleLoopRunConfig(parsed.configPath, env);
  if (!configResult.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${configResult.error}`, "warning");
    return;
  }

  if (
    !activeVisibleLoop &&
    !existingState &&
    hasVisibleLoopAlreadyCompleted(configResult.config, env)
  ) {
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason: "loop already completed",
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    return;
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
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason: "active state unavailable",
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.("visible-loop completion ignored: active state unavailable", "warning");
    return;
  }

  if (state.config.runId !== configResult.config.runId) {
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_command",
        reason: "active state runId mismatch",
        activeRunId: state.config.runId,
        requestedRunId: configResult.config.runId,
        iteration: parsed.iteration ?? null,
      },
      env,
    );
    ctx.ui?.notify?.("visible-loop completion ignored: active run mismatch", "warning");
    return;
  }

  completeVisibleLoopIteration(
    state,
    ctx,
    env,
    "completion_command",
    parsed.iteration ?? state.completedIterations + 1,
  );
}

function loadVisibleLoopRunConfig(
  configPath: string,
  env: NodeJS.ProcessEnv,
): { ok: true; config: VisibleLoopRunConfig } | { ok: false; error: string } {
  const resolvedPath = resolve(configPath);
  const stateDir = resolve(getVisibleLoopStateDir(env));
  if (!isPathInsideOrEqual(stateDir, resolvedPath)) {
    return { ok: false, error: "config path is outside visible-loop state directory" };
  }

  if (!existsSync(resolvedPath)) {
    return { ok: false, error: "config file does not exist" };
  }

  try {
    const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
    return { ok: true, config: assertVisibleLoopRunConfig(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function hasVisibleLoopAlreadyCompleted(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const statusPath = getVisibleLoopStatusPath(config, env);
  if (!existsSync(statusPath)) return false;
  try {
    return readFileSync(statusPath, "utf8")
      .split("\n")
      .some((line) => {
        if (!line.trim()) return false;
        try {
          const entry = JSON.parse(line) as { event?: unknown };
          return entry.event === "loop_completed";
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

function readCompletedVisibleLoopIterations(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const statusPath = getVisibleLoopStatusPath(config, env);
  if (!existsSync(statusPath)) return 0;
  try {
    return readFileSync(statusPath, "utf8")
      .split("\n")
      .reduce((maxCompleted, line) => {
        if (!line.trim()) return maxCompleted;
        try {
          const entry = JSON.parse(line) as { event?: unknown; completedIterations?: unknown };
          if (entry.event !== "iteration_completed" && entry.event !== "loop_completed") {
            return maxCompleted;
          }
          const completed = Number(entry.completedIterations);
          return Number.isInteger(completed) && completed > maxCompleted ? completed : maxCompleted;
        } catch {
          return maxCompleted;
        }
      }, 0);
  } catch {
    return 0;
  }
}

function assertVisibleLoopRunConfig(value: unknown): VisibleLoopRunConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("VisibleLoopRunConfig must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new TypeError("Unsupported visible-loop schemaVersion.");
  const runId = requireNonEmptyString(record.runId, "runId");
  const loopCount = requirePositiveInteger(record.loopCount, "loopCount");
  const cwd = requireNonEmptyString(record.cwd, "cwd");
  const prompts = Array.isArray(record.prompts)
    ? record.prompts.map((prompt, index) => requireNonEmptyString(prompt, `prompts[${index}]`))
    : undefined;
  if (!prompts || prompts.length === 0) throw new TypeError("prompts must be a non-empty array.");
  const reportBack = parseReportBack(String(record.reportBack ?? "manual"));
  if (!reportBack) throw new TypeError("reportBack must be intercom, manual, or none.");
  const parentPeerTarget = normalizeOptionalString(record.parentPeerTarget);
  const title = normalizeOptionalString(record.title);
  const createdAt = requireNonEmptyString(record.createdAt, "createdAt");

  return {
    schemaVersion: 1,
    runId,
    loopCount,
    cwd,
    prompts,
    reportBack,
    ...(parentPeerTarget ? { parentPeerTarget } : {}),
    ...(title ? { title } : {}),
    createdAt,
  };
}

function getSendUserMessage(pi: ExtensionAPI): SendUserMessage | undefined {
  const candidate = (pi as unknown as { sendUserMessage?: SendUserMessage }).sendUserMessage;
  return typeof candidate === "function" ? candidate.bind(pi) : undefined;
}

function parseLoopCount(value: string | undefined): number | undefined {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 100) return undefined;
  return numberValue;
}

function parseReportBack(value: string | undefined): VisibleLoopReportBack | undefined {
  if (value === "intercom" || value === "manual" || value === "none") return value;
  return undefined;
}

function parseVisibleLoopCompletionArgs(
  args: string | undefined,
): { ok: true; configPath?: string; iteration?: number } | { ok: false; error: string } {
  const tokens = tokenizeArgs(args ?? "");
  let configPath: string | undefined;
  let iteration: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--iteration") {
      index += 1;
      iteration = parseLoopCount(tokens[index]);
      if (!iteration) return { ok: false, error: `invalid iteration: ${tokens[index] ?? ""}` };
      continue;
    }
    if (token?.startsWith("--iteration=")) {
      iteration = parseLoopCount(token.slice("--iteration=".length));
      if (!iteration) return { ok: false, error: `invalid iteration: ${token}` };
      continue;
    }
    if (!token?.startsWith("-") && !configPath) {
      configPath = normalizeOptionalString(token);
      continue;
    }
    return { ok: false, error: `unknown argument: ${token ?? ""}` };
  }

  return { ok: true, ...(configPath ? { configPath } : {}), ...(iteration ? { iteration } : {}) };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError(`${label} must be an integer between 1 and 100.`);
  }
  return value;
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function isPathInsideOrEqual(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  if (normalizedParent === normalizedChild) return true;
  const rel = relative(normalizedParent, normalizedChild);
  return Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}
