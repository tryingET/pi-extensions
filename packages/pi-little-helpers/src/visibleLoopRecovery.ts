import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { validatePersistedSelfEvolutionBinding } from "./selfEvolutionVerification.ts";
import { readVisibleLoopIterationLease } from "./visibleLoopContinuationClaim.ts";
import type { VisibleLoopTimerHandle, VisibleLoopTimerRuntime } from "./visibleLoopDelivery.ts";
import {
  failVisibleLoopPlan,
  getVisibleLoopRecoveryDisposition,
  parseVisibleLoopPlanProgress,
  type VisibleLoopPlanProgress,
} from "./visibleLoopPlan.ts";
import { getVisibleLoopHumanLabel } from "./visibleLoopProfiles.ts";
import {
  appendVisibleLoopStatus,
  getVisibleLoopStateDir,
  loadVisibleLoopRunConfig,
} from "./visibleLoopState.ts";
import type { VisibleLoopRunConfig } from "./visibleLoopTypes.ts";

export type VisibleLoopSnapshotReadResult =
  | { kind: "missing" }
  | { kind: "ok"; value: unknown }
  | { kind: "error"; error: string };

export function normalizeVisibleLoopOwnerSessionId(
  sessionId: string | undefined,
): string | undefined {
  const normalized = sessionId?.trim();
  return normalized || undefined;
}

function normalizeVisibleLoopSessionKey(sessionId: string | undefined): string | undefined {
  const ownerSessionId = normalizeVisibleLoopOwnerSessionId(sessionId);
  if (!ownerSessionId) return undefined;
  return `session-${createHash("sha256").update(ownerSessionId).digest("hex")}`;
}

export function getActiveVisibleLoopSnapshotPath(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const sessionKey = normalizeVisibleLoopSessionKey(sessionId);
  if (!sessionKey) return undefined;
  return join(getVisibleLoopStateDir(env), "active", `${sessionKey}.json`);
}

export function readActiveVisibleLoopSnapshot(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): VisibleLoopSnapshotReadResult {
  const path = getActiveVisibleLoopSnapshotPath(sessionId, env);
  if (!path) return { kind: "error", error: "visible-loop session id is unavailable" };
  if (!existsSync(path)) return { kind: "missing" };
  try {
    return { kind: "ok", value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch (error) {
    return { kind: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeActiveVisibleLoopSnapshot(
  sessionId: string | undefined,
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: string } {
  const path = getActiveVisibleLoopSnapshotPath(sessionId, env);
  if (!path) return { ok: false, error: "visible-loop session id is unavailable" };
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporaryPath, serialized, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const snapshotDescriptor = openSync(temporaryPath, "r");
    try {
      fsyncSync(snapshotDescriptor);
    } finally {
      closeSync(snapshotDescriptor);
    }
    renameSync(temporaryPath, path);
    const directoryDescriptor = openSync(directory, "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    if (readFileSync(path, "utf8") !== serialized) {
      throw new Error("visible-loop active snapshot read-back drift");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function removeActiveVisibleLoopSnapshot(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = getActiveVisibleLoopSnapshotPath(sessionId, env);
  if (!path) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // Cleanup is best-effort after a finalized plan; stale finalized state cannot execute.
  }
}

export type SendUserMessageOptions = { deliverAs?: "followUp" | "steer" };
export type SendUserMessage = (message: string, options?: SendUserMessageOptions) => void;

export type ContinueVisibleLoopInNewSession = (input: {
  config: VisibleLoopRunConfig;
  configPath: string;
  completedIterations: number;
  nextIteration: number;
  claimToken: string;
}) => Promise<void> | void;

export type VisibleLoopContext = {
  cwd?: string;
  hasUI?: boolean;
  model?: { id?: string };
  ui?: {
    notify?(message: string, type?: string): void;
    setStatus?(key: string, value: unknown): void;
    setWidget?(key: string, value: string[] | undefined, options?: { placement?: string }): void;
  };
  sessionManager?: {
    getSessionId?(): string;
    getSessionName?(): string | undefined;
    getCwd?(): string;
    getBranch?(): unknown;
  };
  hasPendingMessages?(): boolean;
};

export type PeerMessagingRuntime = {
  send(request: {
    to: string;
    message: { id: string; timestamp: number; content: { text: string } };
  }): Promise<{ delivered: boolean; reason?: string }>;
  disconnect?(): Promise<void>;
};

export type CreateVisibleLoopPeerRuntime = (
  config: VisibleLoopRunConfig,
  ctx: VisibleLoopContext,
) => Promise<PeerMessagingRuntime> | PeerMessagingRuntime;

export interface ActiveVisibleLoopState {
  ownerSessionId: string;
  config: VisibleLoopRunConfig;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  sendUserMessage: SendUserMessage;
  peerRuntime: PeerMessagingRuntime | null;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTail: Promise<void>;
  intercomSendTimeoutMs: number;
  deliveryAckTimeoutMs: number;
  deliveryAckTimer: VisibleLoopTimerRuntime;
  deliveryAckWatchdog: {
    planId: string;
    stepIndex: number;
    handle: VisibleLoopTimerHandle;
  } | null;
  stopped: boolean;
  plan: VisibleLoopPlanProgress | null;
  hostProcessId: number;
  hostProcessIncarnation: string;
  continueInNewSession?: ContinueVisibleLoopInNewSession;
}

export interface PersistedActiveVisibleLoopState {
  schemaVersion: 5;
  ownerSessionId: string;
  runId: string;
  configPath: string;
  completedPromptCount: number;
  completedIterations: number;
  plan: VisibleLoopPlanProgress | null;
  hostProcessId: number;
  hostProcessIncarnation: string;
  stopped: boolean;
}

export function serializeActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
): PersistedActiveVisibleLoopState {
  return {
    schemaVersion: 5,
    ownerSessionId: state.ownerSessionId,
    runId: state.config.runId,
    configPath: state.configPath,
    completedPromptCount: state.completedPromptCount,
    completedIterations: state.completedIterations,
    plan: state.plan,
    hostProcessId: state.hostProcessId,
    hostProcessIncarnation: state.hostProcessIncarnation,
    stopped: state.stopped,
  };
}

export function persistActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: string } {
  const currentSessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!currentSessionId || currentSessionId !== state.ownerSessionId) {
    return { ok: false, error: "visible-loop active-state owner session mismatch" };
  }
  const persisted = serializeActiveVisibleLoopState(state);
  return writeActiveVisibleLoopSnapshot(state.ownerSessionId, persisted, env);
}

export function removeActiveVisibleLoopState(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const currentSessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!currentSessionId || currentSessionId !== state.ownerSessionId || !state.plan) return false;
  const lease = readVisibleLoopIterationLease(state.config.runId, env);
  if (
    !lease.ok ||
    lease.value?.status !== "COMPLETED" ||
    lease.value.planId !== state.plan.planId ||
    lease.value.owner.sessionId !== state.ownerSessionId ||
    lease.value.owner.processId !== state.hostProcessId ||
    lease.value.owner.processIncarnation !== state.hostProcessIncarnation
  ) {
    return false;
  }
  const snapshot = readActiveVisibleLoopSnapshot(state.ownerSessionId, env);
  if (snapshot.kind !== "ok" || !snapshot.value || typeof snapshot.value !== "object") {
    return false;
  }
  const persisted = snapshot.value as Partial<PersistedActiveVisibleLoopState>;
  if (
    persisted.schemaVersion !== 5 ||
    persisted.ownerSessionId !== state.ownerSessionId ||
    persisted.runId !== state.config.runId ||
    persisted.hostProcessId !== state.hostProcessId ||
    persisted.hostProcessIncarnation !== state.hostProcessIncarnation ||
    persisted.plan?.planId !== state.plan.planId
  ) {
    return false;
  }
  removeActiveVisibleLoopSnapshot(state.ownerSessionId, env);
  return true;
}

export interface RestoreActiveVisibleLoopDependencies {
  sendUserMessage: SendUserMessage | undefined;
  createPeerRuntime?: CreateVisibleLoopPeerRuntime;
  intercomSendTimeoutMs: number;
  deliveryAckTimeoutMs: number;
  deliveryAckTimer: VisibleLoopTimerRuntime;
  continueInNewSession?: ContinueVisibleLoopInNewSession;
  processIncarnation: string;
  setActiveState(state: ActiveVisibleLoopState): void;
  persistAndRender(state: ActiveVisibleLoopState): boolean;
  armDeliveryAckWatchdog(state: ActiveVisibleLoopState): void;
}

export type RestoreActiveVisibleLoopResult = {
  state: ActiveVisibleLoopState | null;
  failure: string | null;
};

export function restoreActiveVisibleLoopState(
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  dependencies: RestoreActiveVisibleLoopDependencies,
): RestoreActiveVisibleLoopResult {
  const currentSessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!currentSessionId) {
    return { state: null, failure: "visible-loop session id is unavailable" };
  }
  const snapshot = readActiveVisibleLoopSnapshot(currentSessionId, env);
  if (snapshot.kind === "missing") return { state: null, failure: null };
  if (snapshot.kind === "error") {
    ctx.ui?.notify?.(`visible-loop recovery failed closed: ${snapshot.error}`, "error");
    return { state: null, failure: snapshot.error };
  }
  if (!dependencies.sendUserMessage) {
    return {
      state: null,
      failure: "pi.sendUserMessage is unavailable during recovery",
    };
  }

  try {
    const persisted = snapshot.value as Partial<PersistedActiveVisibleLoopState>;
    if (
      persisted.schemaVersion !== 5 ||
      persisted.ownerSessionId !== currentSessionId ||
      typeof persisted.configPath !== "string" ||
      typeof persisted.runId !== "string" ||
      !Number.isInteger(persisted.hostProcessId) ||
      typeof persisted.hostProcessIncarnation !== "string" ||
      !persisted.hostProcessIncarnation
    ) {
      throw new Error("active visible-loop snapshot schema is invalid");
    }
    const configResult = loadVisibleLoopRunConfig(persisted.configPath, env);
    if (!configResult.ok) throw new Error(configResult.error);
    if (configResult.config.runId !== persisted.runId) {
      throw new Error("active snapshot run id does not match its config");
    }
    const lease = readVisibleLoopIterationLease(configResult.config.runId, env);
    if (
      !lease.ok ||
      !lease.value ||
      lease.value.status !== "ACTIVE" ||
      lease.value.owner.sessionId !== currentSessionId ||
      lease.value.owner.processId !== Number(persisted.hostProcessId) ||
      lease.value.owner.processIncarnation !== persisted.hostProcessIncarnation
    ) {
      const reason =
        persisted.hostProcessIncarnation !== dependencies.processIncarnation
          ? "fresh host restart does not own the exact ACTIVE run lease snapshot"
          : "active snapshot owner does not match the ACTIVE run lease";
      throw new Error(lease.ok ? reason : lease.error);
    }
    const candidateBinding = validatePersistedSelfEvolutionBinding(
      configResult.config.selfEvolutionEnvelope,
      {
        cwd: configResult.config.cwd,
        parentPeerTarget: configResult.config.parentPeerTarget,
      },
    );
    if (!candidateBinding.ok) throw new Error(candidateBinding.error);
    const plan = parseVisibleLoopPlanProgress(persisted.plan);
    if (!plan) throw new Error("active visible-loop plan is invalid");
    const completedIterations = Number.isInteger(persisted.completedIterations)
      ? Number(persisted.completedIterations)
      : -1;
    if (
      completedIterations < 0 ||
      (plan.lifecycle === "active" && plan.iteration !== completedIterations + 1) ||
      (plan.lifecycle === "finalized" && plan.iteration !== completedIterations)
    ) {
      throw new Error("active visible-loop plan iteration binding is invalid");
    }
    const stopped = Boolean(persisted.stopped);
    const state: ActiveVisibleLoopState = {
      ownerSessionId: currentSessionId,
      config: configResult.config,
      configPath: persisted.configPath,
      completedPromptCount: Number.isInteger(persisted.completedPromptCount)
        ? Number(persisted.completedPromptCount)
        : 0,
      completedIterations,
      sendUserMessage: dependencies.sendUserMessage,
      peerRuntime: null,
      createPeerRuntime: dependencies.createPeerRuntime,
      intercomSendTail: Promise.resolve(),
      intercomSendTimeoutMs: dependencies.intercomSendTimeoutMs,
      deliveryAckTimeoutMs: dependencies.deliveryAckTimeoutMs,
      deliveryAckTimer: dependencies.deliveryAckTimer,
      deliveryAckWatchdog: null,
      stopped,
      plan,
      hostProcessId: Number(persisted.hostProcessId),
      hostProcessIncarnation: persisted.hostProcessIncarnation,
      continueInNewSession: dependencies.continueInNewSession,
    };
    const recovery = getVisibleLoopRecoveryDisposition(
      plan,
      state.hostProcessIncarnation === dependencies.processIncarnation,
    );
    if (recovery.disposition === "fail_closed") {
      failVisibleLoopPlan(plan, recovery.reason);
      state.stopped = true;
      dependencies.persistAndRender(state);
      appendVisibleLoopStatus(
        state.config,
        { event: "active_state_recovery_failed_closed", reason: recovery.reason },
        env,
      );
      ctx.ui?.notify?.(
        `${getVisibleLoopHumanLabel(state.config)} recovery failed closed: ${recovery.reason}`,
        "error",
      );
      return { state: null, failure: recovery.reason };
    }
    dependencies.setActiveState(state);
    appendVisibleLoopStatus(
      state.config,
      {
        event: "active_state_restored",
        recoveryDisposition: recovery.disposition,
        completedPromptCount: state.completedPromptCount,
        completedIterations: state.completedIterations,
      },
      env,
    );
    dependencies.armDeliveryAckWatchdog(state);
    return { state, failure: null };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    ctx.ui?.notify?.(`visible-loop recovery failed closed: ${failure}`, "error");
    return { state: null, failure };
  }
}
