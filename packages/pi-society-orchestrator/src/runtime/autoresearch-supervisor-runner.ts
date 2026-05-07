import * as os from "node:os";
import * as path from "node:path";
import {
  type AutoresearchAutoplanPlanner,
  type AutoresearchLedgerLoadResult,
  type AutoresearchLedgerProjection,
  type AutoresearchOracleEvidencePacket,
  type AutoresearchRuntimeStatus,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchRuntimeStatus,
  type ExecuteAutoresearchCampaignStartResult,
  executeAutoresearchCampaignStart,
  type InspectAutoresearchFinalizationResult,
  inspectAutoresearchFinalization,
  loadAutoresearchLedger,
  projectAutoresearchLedgerEntries,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchSupervisorLedgerLike } from "../loops/autoresearch-supervisor.ts";
import { resolveAkPath } from "./ak.ts";
import { evaluateAutoresearchAkLifecycle } from "./autoresearch-ak-lifecycle.ts";
import {
  type AutoresearchAkProjectorResult,
  projectAutoresearchAkMilestone,
} from "./autoresearch-ak-projector.ts";

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");

type MaybePromise<T> = T | Promise<T>;

type TimerHandle = unknown;

export const AUTORESEARCH_LIVE_SUPERVISION_TYPE = "autoresearch_live_supervision" as const;
export const AUTORESEARCH_LIVE_SUPERVISION_VERSION = 1 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS = 30 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS = 5 as const;
export const AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS = 300 as const;

export type AutoresearchLiveSessionState = "running" | "blocked" | "stopped" | "completed";

export type AutoresearchLiveProjectionAction =
  | "recorded"
  | "already-projected"
  | "noop"
  | "blocked";

export type AutoresearchLiveLifecycleAction =
  | "none"
  | "completed_task"
  | "already_terminal"
  | "stopped"
  | "blocked";

export interface AutoresearchLiveSupervisionPolicyV1 {
  intervalSeconds: number;
  autoStopOnTerminal: true;
  lifecycleMode: "complete_on_verified_completion";
}

export interface AutoresearchLiveSupervisionSessionV1 {
  type: typeof AUTORESEARCH_LIVE_SUPERVISION_TYPE;
  version: typeof AUTORESEARCH_LIVE_SUPERVISION_VERSION;
  taskId: number;
  cwd: string;
  policy: AutoresearchLiveSupervisionPolicyV1;
  state: AutoresearchLiveSessionState;
  startedAt: number;
  lastPolledAt: number | null;
  pollCount: number;
  lastRuntimeState: string | null;
  lastProjectionAction: AutoresearchLiveProjectionAction | null;
  lastLifecycleAction: AutoresearchLiveLifecycleAction;
  lastSummary: string | null;
  lastError: string | null;
}

export interface AutoresearchLiveSupervisionRequest {
  taskId: number;
  cwd: string;
  intervalSeconds?: number;
  signal?: AbortSignal;
}

export interface AutoresearchLiveObservation {
  cwd: string;
  runtime: AutoresearchRuntimeStatus;
  ledgerLoad: AutoresearchLedgerLoadResult;
  ledger: AutoresearchSupervisorLedgerLike;
  finalization: InspectAutoresearchFinalizationResult;
  oracleEvidence: AutoresearchOracleEvidencePacket;
}

export interface AutoresearchLiveLifecycleInput {
  taskId: number;
  sessionKey: string;
  session: Readonly<AutoresearchLiveSupervisionSessionV1>;
  observation: AutoresearchLiveObservation;
  projector: AutoresearchAkProjectorResult;
  signal?: AbortSignal;
}

export interface AutoresearchLiveLifecycleOutcome {
  ok: boolean;
  action: AutoresearchLiveLifecycleAction;
  summary: string;
  error?: string;
}

export interface AutoresearchLivePollResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  observation: AutoresearchLiveObservation | null;
  projector: AutoresearchAkProjectorResult | null;
  lifecycle: AutoresearchLiveLifecycleOutcome | null;
  nextStep: string;
}

export interface AutoresearchLiveStartResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1;
  reused: boolean;
  poll: AutoresearchLivePollResult | null;
}

export interface AutoresearchLiveStartCampaignRequest extends AutoresearchLiveSupervisionRequest {
  objective: string;
  maxIterations?: number;
  maxWallClockMinutes?: number;
  benchmarkCommand?: string;
  checksCommand?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: "lower" | "higher";
  planner?: AutoresearchAutoplanPlanner;
  materializeDspxIntent?: boolean;
  runDspxProgramGen?: boolean;
  dspxProgramGenTimeoutSeconds?: number;
  dspxIntentPath?: string;
  dspxOutdir?: string;
  dspxBehaviorPath?: string;
}

export interface AutoresearchLiveStartCampaignResult {
  campaign: ExecuteAutoresearchCampaignStartResult;
  supervision: AutoresearchLiveStartResult;
}

export interface AutoresearchLiveStopResult {
  sessionKey: string;
  session: AutoresearchLiveSupervisionSessionV1 | null;
  stopped: boolean;
  nextStep: string;
}

export interface AutoresearchLiveSupervisionRunnerConfig {
  akPath?: string;
  societyDb?: string;
  now?: () => number;
  setTimeout?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  observeRuntime?: (
    cwd: string,
    options: { persistSnapshot: false },
  ) => MaybePromise<AutoresearchRuntimeStatus>;
  loadLedger?: (cwd: string) => MaybePromise<AutoresearchLedgerLoadResult>;
  projectLedgerEntries?: (
    entries: AutoresearchLedgerLoadResult["entries"],
  ) => MaybePromise<Pick<AutoresearchLedgerProjection, "context">>;
  inspectFinalization?: (input: {
    cwd: string;
    status: AutoresearchRuntimeStatus;
  }) => MaybePromise<InspectAutoresearchFinalizationResult>;
  observeOracleEvidence?: (cwd: string) => MaybePromise<AutoresearchOracleEvidencePacket>;
  projectMilestone?: (input: {
    taskId: number;
    observation: AutoresearchLiveObservation;
    akPath: string;
    societyDb: string;
    signal?: AbortSignal;
  }) => MaybePromise<AutoresearchAkProjectorResult>;
  evaluateLifecycle?: (
    input: AutoresearchLiveLifecycleInput,
  ) => MaybePromise<AutoresearchLiveLifecycleOutcome>;
  startCampaign?: typeof executeAutoresearchCampaignStart;
}

interface SessionIdentity {
  taskId: number;
  cwd: string;
  sessionKey: string;
}

interface SessionRecord {
  identity: SessionIdentity;
  persistent: boolean;
  keepRunning: boolean;
  session: AutoresearchLiveSupervisionSessionV1;
  timer: TimerHandle | null;
  inFlight: Promise<AutoresearchLivePollResult> | null;
}

export function buildAutoresearchLiveSupervisionSessionKey(input: {
  taskId: number;
  cwd: string;
}): string {
  return `${input.taskId}|${path.resolve(input.cwd)}`;
}

export function resolveAutoresearchLiveSupervisionPolicy(
  intervalSeconds?: number,
): AutoresearchLiveSupervisionPolicyV1 {
  const resolvedInterval =
    intervalSeconds ?? AUTORESEARCH_LIVE_SUPERVISION_DEFAULT_INTERVAL_SECONDS;

  if (
    !Number.isInteger(resolvedInterval) ||
    resolvedInterval < AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS ||
    resolvedInterval > AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS
  ) {
    throw new Error(
      `intervalSeconds must be an integer between ${AUTORESEARCH_LIVE_SUPERVISION_MIN_INTERVAL_SECONDS} and ${AUTORESEARCH_LIVE_SUPERVISION_MAX_INTERVAL_SECONDS}, received: ${String(intervalSeconds)}`,
    );
  }

  return {
    intervalSeconds: resolvedInterval,
    autoStopOnTerminal: true,
    lifecycleMode: "complete_on_verified_completion",
  };
}

export function resolveAutoresearchLiveSupervisionIdentity(
  input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
): SessionIdentity {
  if (!Number.isInteger(input.taskId) || input.taskId <= 0) {
    throw new Error(`taskId must be a positive integer, received: ${String(input.taskId)}`);
  }

  if (typeof input.cwd !== "string" || input.cwd.trim().length === 0) {
    throw new Error("cwd is required for live autoresearch supervision");
  }

  const cwd = path.resolve(input.cwd);
  return {
    taskId: input.taskId,
    cwd,
    sessionKey: buildAutoresearchLiveSupervisionSessionKey({
      taskId: input.taskId,
      cwd,
    }),
  };
}

function resolveStartCampaignPositiveIntegerBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer, received: ${String(value)}`);
  }
  return resolved;
}

function resolveStartCampaignPositiveNumberBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number, received: ${String(value)}`);
  }
  return resolved;
}

export async function readAutoresearchLiveObservation(
  input: { cwd: string },
  config: Pick<
    AutoresearchLiveSupervisionRunnerConfig,
    | "observeRuntime"
    | "loadLedger"
    | "projectLedgerEntries"
    | "inspectFinalization"
    | "observeOracleEvidence"
  > = {},
): Promise<AutoresearchLiveObservation> {
  const cwd = path.resolve(input.cwd);
  const runtime = await (config.observeRuntime || buildAutoresearchRuntimeStatus)(cwd, {
    persistSnapshot: false,
  });
  const ledgerLoad = await (config.loadLedger || loadAutoresearchLedger)(cwd);
  const ledgerProjection = await (config.projectLedgerEntries || projectAutoresearchLedgerEntries)(
    ledgerLoad.entries,
  );
  const ledger = toSupervisorLedgerLike(ledgerProjection);
  const finalization = await (config.inspectFinalization || inspectAutoresearchFinalization)({
    cwd,
    status: runtime,
  });
  const oracleEvidence = await (
    config.observeOracleEvidence || buildAutoresearchOracleEvidencePacket
  )(cwd);

  return {
    cwd,
    runtime,
    ledgerLoad,
    ledger,
    finalization,
    oracleEvidence,
  };
}

export class AutoresearchLiveSupervisionRunner {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly setTimeoutImpl: (
    callback: () => void | Promise<void>,
    delayMs: number,
  ) => unknown;
  private readonly clearTimeoutImpl: (handle: unknown) => void;
  private readonly config: AutoresearchLiveSupervisionRunnerConfig;

  constructor(config: AutoresearchLiveSupervisionRunnerConfig = {}) {
    this.config = config;
    this.now = config.now || (() => Date.now());
    this.setTimeoutImpl =
      config.setTimeout ||
      ((callback, delayMs) => globalThis.setTimeout(() => void callback(), delayMs));
    this.clearTimeoutImpl =
      config.clearTimeout || ((handle) => globalThis.clearTimeout(handle as NodeJS.Timeout));
  }

  async observe(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLivePollResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (existing && existing.session.state === "running") {
      return this.runPoll(existing, { signal: input.signal, reschedule: false });
    }

    const policy = resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    const record = this.createRecord(identity, policy, false);
    return this.runPoll(record, { signal: input.signal, reschedule: false });
  }

  async start(input: AutoresearchLiveSupervisionRequest): Promise<AutoresearchLiveStartResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (existing && existing.session.state === "running") {
      return {
        sessionKey: identity.sessionKey,
        session: cloneSession(existing.session),
        reused: true,
        poll: null,
      };
    }

    const policy = resolveAutoresearchLiveSupervisionPolicy(input.intervalSeconds);
    const record = this.createRecord(identity, policy, true);
    this.sessions.set(identity.sessionKey, record);

    const poll = await this.runPoll(record, { signal: input.signal, reschedule: true });
    return {
      sessionKey: identity.sessionKey,
      session: poll.session,
      reused: false,
      poll,
    };
  }

  async startCampaign(
    input: AutoresearchLiveStartCampaignRequest,
  ): Promise<AutoresearchLiveStartCampaignResult> {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const campaignObjective = input.objective.trim();
    if (campaignObjective.length === 0) {
      throw new Error("start_campaign requires a non-empty objective.");
    }

    const maxIterations = resolveStartCampaignPositiveIntegerBudget(
      "maxIterations",
      input.maxIterations,
      3,
    );
    const maxWallClockMinutes = resolveStartCampaignPositiveNumberBudget(
      "maxWallClockMinutes",
      input.maxWallClockMinutes,
      30,
    );

    const campaign = await (this.config.startCampaign || executeAutoresearchCampaignStart)({
      cwd: identity.cwd,
      objective: campaignObjective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations,
      maxWallClockMinutes,
      peerMode: "plan",
      benchmarkCommand: input.benchmarkCommand,
      checksCommand: input.checksCommand,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      direction: input.direction,
      planner: input.planner,
      materializeDspxIntent: input.materializeDspxIntent,
      runDspxProgramGen: input.runDspxProgramGen,
      dspxProgramGenTimeoutSeconds: input.dspxProgramGenTimeoutSeconds,
      dspxIntentPath: input.dspxIntentPath,
      dspxOutdir: input.dspxOutdir,
      dspxBehaviorPath: input.dspxBehaviorPath,
      signal: input.signal,
    });

    const supervision = await this.start(input);
    return { campaign, supervision };
  }

  stop(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveStopResult {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const existing = this.sessions.get(identity.sessionKey);

    if (!existing) {
      return {
        sessionKey: identity.sessionKey,
        session: null,
        stopped: false,
        nextStep: "No live supervision session is active for this task/cwd pair.",
      };
    }

    existing.keepRunning = false;
    this.cancelTimer(existing);
    existing.session = {
      ...existing.session,
      state: "stopped",
      lastLifecycleAction: "stopped",
      lastSummary: "Live supervision stopped by operator.",
      lastError: null,
    };

    return {
      sessionKey: identity.sessionKey,
      session: cloneSession(existing.session),
      stopped: true,
      nextStep: "Live supervision is stopped. Start it again to resume polling.",
    };
  }

  getSession(
    input: Pick<AutoresearchLiveSupervisionRequest, "taskId" | "cwd">,
  ): AutoresearchLiveSupervisionSessionV1 | null {
    const identity = resolveAutoresearchLiveSupervisionIdentity(input);
    const session = this.sessions.get(identity.sessionKey)?.session;
    return session ? cloneSession(session) : null;
  }

  listSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return [...this.sessions.values()].map((record) => cloneSession(record.session));
  }

  listActiveSessions(): AutoresearchLiveSupervisionSessionV1[] {
    return this.listSessions().filter((session) => session.state === "running");
  }

  dispose(): void {
    for (const record of this.sessions.values()) {
      record.keepRunning = false;
      this.cancelTimer(record);
      if (record.session.state === "running") {
        record.session = {
          ...record.session,
          state: "stopped",
          lastLifecycleAction: "stopped",
          lastSummary: "Live supervision stopped because the runner was disposed.",
          lastError: null,
        };
      }
    }
  }

  private createRecord(
    identity: SessionIdentity,
    policy: AutoresearchLiveSupervisionPolicyV1,
    persistent: boolean,
  ): SessionRecord {
    return {
      identity,
      persistent,
      keepRunning: persistent,
      session: {
        type: AUTORESEARCH_LIVE_SUPERVISION_TYPE,
        version: AUTORESEARCH_LIVE_SUPERVISION_VERSION,
        taskId: identity.taskId,
        cwd: identity.cwd,
        policy: { ...policy },
        state: persistent ? "running" : "stopped",
        startedAt: this.now(),
        lastPolledAt: null,
        pollCount: 0,
        lastRuntimeState: null,
        lastProjectionAction: null,
        lastLifecycleAction: "none",
        lastSummary: null,
        lastError: null,
      },
      timer: null,
      inFlight: null,
    };
  }

  private runPoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    if (record.inFlight) {
      return record.inFlight;
    }

    const promise = this.executePoll(record, options).finally(() => {
      if (record.inFlight === promise) {
        record.inFlight = null;
      }
    });

    record.inFlight = promise;
    return promise;
  }

  private async executePoll(
    record: SessionRecord,
    options: { signal?: AbortSignal; reschedule: boolean },
  ): Promise<AutoresearchLivePollResult> {
    this.cancelTimer(record);

    try {
      const observation = await readAutoresearchLiveObservation(
        { cwd: record.identity.cwd },
        {
          observeRuntime: this.config.observeRuntime,
          loadLedger: this.config.loadLedger,
          projectLedgerEntries: this.config.projectLedgerEntries,
          inspectFinalization: this.config.inspectFinalization,
          observeOracleEvidence: this.config.observeOracleEvidence,
        },
      );

      const projector = await this.projectMilestone(
        record.identity.taskId,
        observation,
        options.signal,
      );
      const lifecycle = isBlockedProjectorResult(projector)
        ? blockedLifecycleOutcome(projector.error || projector.candidate.reason)
        : await this.evaluateLifecycle(record, observation, projector, options.signal);

      const session = this.applyPollOutcome(record, observation, projector, lifecycle);
      if (
        record.persistent &&
        options.reschedule &&
        record.keepRunning &&
        session.state === "running"
      ) {
        this.scheduleNext(record);
      }

      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation,
        projector,
        lifecycle,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const session = this.applyUnexpectedFailure(record, message);
      return {
        sessionKey: record.identity.sessionKey,
        session: cloneSession(session),
        observation: null,
        projector: null,
        lifecycle: null,
        nextStep: describeAutoresearchLiveNextStep(session),
      };
    }
  }

  private applyPollOutcome(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    lifecycle: AutoresearchLiveLifecycleOutcome,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested = record.persistent && !record.keepRunning;
    const nextState = stopRequested ? "stopped" : deriveSessionState(projector, lifecycle);
    const lifecycleAction = stopRequested ? "stopped" : lifecycle.action;
    const summary = stopRequested
      ? "Live supervision stopped by operator."
      : deriveSessionSummary(projector, lifecycle);
    const error = stopRequested ? null : deriveSessionError(projector, lifecycle, nextState);

    if (nextState !== "running") {
      record.keepRunning = false;
    }

    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: nextState,
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastRuntimeState: observation.runtime.runtimeProjection.state,
      lastProjectionAction: projector.action,
      lastLifecycleAction: lifecycleAction,
      lastSummary: summary,
      lastError: error,
    };

    record.session = nextSession;
    return nextSession;
  }

  private applyUnexpectedFailure(
    record: SessionRecord,
    message: string,
  ): AutoresearchLiveSupervisionSessionV1 {
    const stopRequested =
      record.persistent && (record.session.state === "stopped" || !record.keepRunning);
    record.keepRunning = false;
    const nextSession: AutoresearchLiveSupervisionSessionV1 = {
      ...record.session,
      state: stopRequested ? "stopped" : "blocked",
      lastPolledAt: this.now(),
      pollCount: record.session.pollCount + 1,
      lastProjectionAction: "blocked",
      lastLifecycleAction: stopRequested ? "stopped" : "blocked",
      lastSummary: stopRequested ? "Live supervision stopped by operator." : message,
      lastError: stopRequested ? null : message,
    };

    record.session = nextSession;
    return nextSession;
  }

  private async projectMilestone(
    taskId: number,
    observation: AutoresearchLiveObservation,
    signal?: AbortSignal,
  ): Promise<AutoresearchAkProjectorResult> {
    if (this.config.projectMilestone) {
      return this.config.projectMilestone({
        taskId,
        observation,
        akPath: this.resolveAkPathForCwd(observation.cwd),
        societyDb: this.resolveSocietyDbPath(),
        signal,
      });
    }

    return projectAutoresearchAkMilestone({
      taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      runtime: observation.runtime,
      ledger: observation.ledger,
      signal,
    });
  }

  private async evaluateLifecycle(
    record: SessionRecord,
    observation: AutoresearchLiveObservation,
    projector: AutoresearchAkProjectorResult,
    signal?: AbortSignal,
  ): Promise<AutoresearchLiveLifecycleOutcome> {
    if (this.config.evaluateLifecycle) {
      return this.config.evaluateLifecycle({
        taskId: record.identity.taskId,
        sessionKey: record.identity.sessionKey,
        session: cloneSession(record.session),
        observation,
        projector,
        signal,
      });
    }

    return evaluateAutoresearchAkLifecycle({
      taskId: record.identity.taskId,
      akPath: this.resolveAkPathForCwd(observation.cwd),
      societyDb: this.resolveSocietyDbPath(),
      observation,
      projector,
      signal,
    });
  }

  private scheduleNext(record: SessionRecord): void {
    this.cancelTimer(record);
    record.timer = this.setTimeoutImpl(
      () => this.runPoll(record, { reschedule: true }).then(() => undefined),
      record.session.policy.intervalSeconds * 1000,
    );
  }

  private cancelTimer(record: SessionRecord): void {
    if (!record.timer) {
      return;
    }

    this.clearTimeoutImpl(record.timer);
    record.timer = null;
  }

  private resolveAkPathForCwd(cwd: string): string {
    return this.config.akPath || resolveAkPath({ cwd });
  }

  private resolveSocietyDbPath(): string {
    return this.config.societyDb || DEFAULT_SOCIETY_DB;
  }
}

function deriveSessionState(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): AutoresearchLiveSessionState {
  if (isBlockedProjectorResult(projector) || !lifecycle.ok || lifecycle.action === "blocked") {
    return "blocked";
  }

  if (lifecycle.action === "completed_task" || lifecycle.action === "already_terminal") {
    return "completed";
  }

  return "running";
}

function deriveSessionSummary(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
): string {
  if (
    lifecycle.summary.trim().length > 0 &&
    (lifecycle.action !== "none" || lifecycle.summary !== projector.candidate.reason)
  ) {
    return lifecycle.summary;
  }

  return projector.candidate.reason;
}

function deriveSessionError(
  projector: AutoresearchAkProjectorResult,
  lifecycle: AutoresearchLiveLifecycleOutcome,
  state: AutoresearchLiveSessionState,
): string | null {
  if (state !== "blocked") {
    return null;
  }

  return lifecycle.error || projector.error || lifecycle.summary || projector.candidate.reason;
}

function blockedLifecycleOutcome(reason: string): AutoresearchLiveLifecycleOutcome {
  return {
    ok: false,
    action: "blocked",
    summary: reason,
    error: reason,
  };
}

function isBlockedProjectorResult(projector: AutoresearchAkProjectorResult): boolean {
  return projector.action === "blocked" || projector.ok === false;
}

function toSupervisorLedgerLike(
  projection: Pick<AutoresearchLedgerProjection, "context"> | null | undefined,
): AutoresearchSupervisorLedgerLike {
  return {
    context: {
      blockedReason: projection?.context.blockedReason ?? null,
      completionReason: projection?.context.completionReason ?? null,
    },
  };
}

function cloneSession(
  session: AutoresearchLiveSupervisionSessionV1,
): AutoresearchLiveSupervisionSessionV1 {
  return {
    ...session,
    policy: { ...session.policy },
  };
}

export function describeAutoresearchLiveNextStep(
  session: Pick<
    AutoresearchLiveSupervisionSessionV1,
    "state" | "lastProjectionAction" | "lastLifecycleAction"
  >,
): string {
  switch (session.state) {
    case "running":
      switch (session.lastProjectionAction) {
        case "recorded":
          return "Milestone evidence was recorded. Continue monitoring until the runtime changes again.";
        case "already-projected":
          return "No new durable change was detected. Continue monitoring.";
        case "noop":
        case null:
          return "No coarse milestone is ready yet. Continue monitoring.";
        case "blocked":
          return "Resolve the blocking error, then restart live supervision.";
      }
      return "Continue monitoring the live supervision session.";
    case "blocked":
      return "Resolve the blocking error, then start a new live supervision session.";
    case "completed":
      return "Live supervision reached a terminal state. No further polling is scheduled.";
    case "stopped":
      return "Live supervision is stopped. Start it again to resume polling.";
  }
}
