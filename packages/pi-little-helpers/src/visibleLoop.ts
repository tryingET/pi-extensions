import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const VISIBLE_LOOP_COMMAND = "visible-loop";
export const VISIBLE_LOOP_CHILD_COMMAND = "visible-loop-child";
export const VISIBLE_LOOP_CHILD_COMPLETE_COMMAND = "visible-loop-child-complete";

const DEFAULT_PROMPT_VAULT_INSTRUCTIONS = [
  "Use Prompt Vault (`~/ai-society/core/prompt-vault`) like trigger folders.",
  "1) Select the single best-matching template for this task.",
  "- `vault_query(..., include_content:false)`",
  "2) Retrieve that template's full content.",
  "- `vault_retrieve(..., include_content:true)`",
  "3) Execute it as written.",
  "4) If the template has an OUTPUT FORMAT, follow it exactly.",
  "5) Do not reference unretrieved frameworks.",
  "6) If vault is unavailable, continue best-effort and say so.",
  "Use as many frameworks as necessary, and as few as possible.",
  "Grounding (one line at end):",
  "`grounding: template=<name>, vault_status=<ok|unavailable>`",
].join("\n");

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

export type VisibleLoopCommandParseResult =
  | { ok: true; loopCount: number; reportBack: VisibleLoopReportBack; parentPeerTarget?: string }
  | { ok: false; error: string; usage: string };

export function parseVisibleLoopCommandArgs(
  args: string | undefined,
): VisibleLoopCommandParseResult {
  const usage = `Usage: /${VISIBLE_LOOP_COMMAND} [--count N|N] [--parentPeerTarget session-...] [--reportBack intercom|manual|none]`;
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
}): VisibleLoopRunConfig {
  return {
    schemaVersion: 1,
    runId: input.runId ?? `visible-loop-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    loopCount: input.loopCount,
    cwd: input.cwd,
    prompts: [...(input.prompts ?? DEFAULT_VISIBLE_LOOP_PROMPTS)],
    reportBack: input.reportBack,
    ...(input.parentPeerTarget ? { parentPeerTarget: input.parentPeerTarget } : {}),
    title: "Visible loop",
    createdAt: new Date().toISOString(),
  };
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

  const state: ActiveVisibleLoopState = {
    config,
    configPath,
    completedPromptCount: 0,
    completedIterations: 0,
    sendUserMessage,
    peerRuntime: null,
    stopped: false,
    followupsQueuedForIteration: null,
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
  ctx.ui?.setStatus?.("visible-loop", `loop 0/${config.loopCount}`);
  ctx.ui?.notify?.(
    `visible-loop started: ${config.loopCount} iteration(s), ${config.prompts.length} prompt(s) each`,
    "info",
  );

  await sendVisibleLoopIntercom(
    state,
    ctx,
    `PEER_ACK peer_run_id=${config.runId}: visible-loop started (${config.loopCount} iteration(s), ${config.prompts.length} prompt(s) each)`,
    env,
  );
  queueVisibleLoopIteration(state, ctx, env);
}

export function handleVisibleLoopAgentStart(
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env);
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
): void {
  const state = activeVisibleLoop ?? restoreActiveVisibleLoopState(pi, ctx, env);
  if (!state || state.stopped) return;

  state.completedPromptCount += 1;
  const promptCount = state.config.prompts.length;
  if (promptCount <= 0) return;

  const completedInIteration = state.completedPromptCount % promptCount;
  if (completedInIteration !== 0) {
    ctx.ui?.setStatus?.(
      "visible-loop",
      `loop ${state.completedIterations}/${state.config.loopCount} step ${completedInIteration}/${promptCount}`,
    );
    appendVisibleLoopStatus(
      state.config,
      {
        event: "prompt_completed",
        source: "agent_end",
        completedPromptCount: state.completedPromptCount,
        completedIterations: state.completedIterations,
        completedInIteration,
      },
      env,
    );
    persistActiveVisibleLoopState(state, ctx, env);
    return;
  }

  completeVisibleLoopIteration(state, ctx, env, "agent_end");
}

interface ActiveVisibleLoopState {
  config: VisibleLoopRunConfig;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  sendUserMessage: SendUserMessage;
  peerRuntime: PeerMessagingRuntime | null;
  stopped: boolean;
  followupsQueuedForIteration: number | null;
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
      stopped: Boolean(persisted.stopped),
      followupsQueuedForIteration:
        typeof persisted.followupsQueuedForIteration === "number"
          ? persisted.followupsQueuedForIteration
          : null,
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
  const prompts = state.config.prompts.map((prompt) => prompt.trim()).filter(Boolean);
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
      promptCount: prompts.length,
      completionSentinel: true,
    },
    env,
  );
  state.followupsQueuedForIteration = null;
  persistActiveVisibleLoopState(state, ctx, env);
  state.sendUserMessage(prompts[0]);
  setTimeout(() => {
    if (
      activeVisibleLoop === state &&
      !state.stopped &&
      state.followupsQueuedForIteration !== state.completedIterations
    ) {
      state.followupsQueuedForIteration = state.completedIterations;
      persistActiveVisibleLoopState(state, ctx, env);
      queueVisibleLoopFollowups(state, ctx, env);
    }
  }, 1000);
}

function queueVisibleLoopFollowups(
  state: ActiveVisibleLoopState,
  _ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const prompts = state.config.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  const iteration = state.completedIterations + 1;
  const completionPrompt = buildVisibleLoopCompletionPrompt(state, iteration);
  const followups = [...prompts.slice(1), completionPrompt];
  appendVisibleLoopStatus(
    state.config,
    {
      event: "followups_queued",
      iteration,
      promptFollowupCount: Math.max(0, prompts.length - 1),
      completionSentinel: true,
    },
    env,
  );
  followups.forEach((prompt, index) => {
    setTimeout(() => {
      if (activeVisibleLoop !== state || state.stopped) return;
      state.sendUserMessage(prompt, { deliverAs: "followUp" });
    }, 150 * index);
  });
}

function buildVisibleLoopCompletionPrompt(
  state: ActiveVisibleLoopState,
  iteration: number,
): string {
  const fallbackCommand = `/${VISIBLE_LOOP_CHILD_COMPLETE_COMMAND} ${quoteCommandArg(
    state.configPath,
  )} --iteration ${iteration}`;
  const isFinalIteration = iteration >= state.config.loopCount;
  const progressMessage = `VISIBLE_LOOP_ITERATION peer_run_id=${state.config.runId}: completed iteration ${iteration}/${state.config.loopCount}`;
  const finalMessage = `PEER_FINAL peer_run_id=${state.config.runId}: visible-loop complete after ${iteration}/${state.config.loopCount} iteration(s)`;
  return [
    "VISIBLE-LOOP INTERNAL COMPLETION SENTINEL.",
    `The requested visible-loop prompt sequence has reached iteration ${iteration}/${state.config.loopCount}.`,
    "Do not continue implementation work from this sentinel.",
    isFinalIteration
      ? "Report final completion to the parent/controller now."
      : "Report iteration progress to the parent/controller now, then call the visible_loop_child_complete tool so the next iteration can queue.",
    "Use the intercom tool if available with this exact canonical message:",
    isFinalIteration ? finalMessage : progressMessage,
    isFinalIteration
      ? "The PEER_FINAL line must include `peer_run_id=` exactly as shown so peer_watch can recognize it."
      : "Do not send PEER_FINAL for a non-final iteration.",
    "Then call the model tool `visible_loop_child_complete` with:",
    `configPath: ${state.configPath}`,
    `iteration: ${iteration}`,
    "Do not run `/visible-loop-child-complete` in bash; it is not a shell executable.",
    `If the tool is unavailable in this session, report that visibly and include this Pi slash-command fallback for the human/operator only: ${fallbackCommand}`,
  ].join("\n");
}

function completeVisibleLoopIteration(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  source: "agent_end" | "completion_sentinel",
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

  const promptCount = state.config.prompts.length;
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

  void sendVisibleLoopIntercom(
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
    void sendVisibleLoopIntercom(
      state,
      ctx,
      `PEER_FINAL peer_run_id=${state.config.runId}: visible-loop complete after ${state.completedIterations}/${state.config.loopCount} iteration(s)`,
      env,
    ).finally(async () => {
      await state.peerRuntime?.disconnect?.();
      removeActiveVisibleLoopState(ctx, env);
      if (activeVisibleLoop === state) activeVisibleLoop = null;
      ctx.ui?.setStatus?.("visible-loop", undefined);
    });
    return;
  }

  persistActiveVisibleLoopState(state, ctx, env);

  setTimeout(() => {
    if (activeVisibleLoop === state && !state.stopped) {
      queueVisibleLoopIteration(state, ctx, env);
    }
  }, 250);
}

function recreateActiveVisibleLoopState(
  config: VisibleLoopRunConfig,
  configPath: string,
  pi: ExtensionAPI,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
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
    stopped: false,
    followupsQueuedForIteration: null,
  };
  activeVisibleLoop = state;
  appendVisibleLoopStatus(
    config,
    {
      event: "active_state_recreated",
      reason: "completion_sentinel_without_active_state",
      sessionKey: getVisibleLoopSessionKey(ctx) ?? null,
    },
    env,
  );
  return state;
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

  try {
    const runtime = state.peerRuntime ?? (await createVisibleLoopPeerRuntime(state.config, ctx));
    state.peerRuntime = runtime;
    const result = await runtime.send({
      to: state.config.parentPeerTarget,
      message: {
        id: `${state.config.runId}-${randomUUID()}`,
        timestamp: Date.now(),
        content: { text },
      },
    });
    if (!result.delivered) {
      const reason = result.reason ?? "not delivered";
      appendVisibleLoopStatus(state.config, { event: "intercom_send_failed", text, reason }, env);
      ctx.ui?.notify?.(`visible-loop intercom send failed: ${reason}`, "warning");
      return;
    }
    appendVisibleLoopStatus(state.config, { event: "intercom_delivered", text }, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendVisibleLoopStatus(
      state.config,
      { event: "intercom_unavailable", text, error: message },
      env,
    );
    ctx.ui?.notify?.(`visible-loop intercom unavailable: ${message}`, "warning");
  }
}

async function createVisibleLoopPeerRuntime(
  config: VisibleLoopRunConfig,
  ctx: VisibleLoopContext,
): Promise<PeerMessagingRuntime> {
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
): Promise<void> {
  const parsed = parseVisibleLoopCompletionArgs(args);
  if (!parsed.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${parsed.error}`, "warning");
    return;
  }

  const configResult = loadVisibleLoopRunConfig(parsed.configPath, env);
  if (!configResult.ok) {
    ctx.ui?.notify?.(`visible-loop completion ignored: ${configResult.error}`, "warning");
    return;
  }

  if (!activeVisibleLoop && hasVisibleLoopAlreadyCompleted(configResult.config, env)) {
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_sentinel",
        reason: "loop already completed",
        iteration: parsed.iteration,
      },
      env,
    );
    return;
  }

  const state =
    activeVisibleLoop ??
    restoreActiveVisibleLoopState(pi, ctx, env) ??
    recreateActiveVisibleLoopState(configResult.config, parsed.configPath, pi, ctx, env);
  if (!state) {
    appendVisibleLoopStatus(
      configResult.config,
      {
        event: "completion_ignored",
        source: "completion_sentinel",
        reason: "active state unavailable",
        iteration: parsed.iteration,
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
        source: "completion_sentinel",
        reason: "active state runId mismatch",
        activeRunId: state.config.runId,
        requestedRunId: configResult.config.runId,
        iteration: parsed.iteration,
      },
      env,
    );
    ctx.ui?.notify?.("visible-loop completion ignored: active run mismatch", "warning");
    return;
  }

  completeVisibleLoopIteration(state, ctx, env, "completion_sentinel", parsed.iteration);
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
): { ok: true; configPath: string; iteration: number } | { ok: false; error: string } {
  const tokens = tokenizeArgs(args ?? "");
  const configPath = normalizeOptionalString(tokens[0]);
  if (!configPath) return { ok: false, error: "missing config path" };

  let iteration: number | undefined;
  for (let index = 1; index < tokens.length; index += 1) {
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
    return { ok: false, error: `unknown argument: ${token ?? ""}` };
  }

  if (!iteration) return { ok: false, error: "missing iteration" };
  return { ok: true, configPath, iteration };
}

function quoteCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
