import { randomUUID } from "node:crypto";
import type { ActiveVisibleLoopState, VisibleLoopContext } from "./visibleLoopRecovery.ts";
import {
  normalizeVisibleLoopOwnerSessionId,
  readActiveVisibleLoopSnapshot,
} from "./visibleLoopRecovery.ts";
import { appendVisibleLoopStatus } from "./visibleLoopState.ts";

const DEFAULT_VISIBLE_LOOP_DELIVERY_ACK_TIMEOUT_MS = 30_000;
const MAX_VISIBLE_LOOP_DELIVERY_ACK_TIMEOUT_MS = 300_000;
const VISIBLE_LOOP_PROCESS_INCARNATION_SYMBOL = Symbol.for(
  "@tryinget/pi-little-helpers/visible-loop-process-incarnation",
);
const VISIBLE_LOOP_RUNTIME_GENERATION_SYMBOL = Symbol.for(
  "@tryinget/pi-little-helpers/visible-loop-runtime-generation",
);
const processGlobal = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
const existingProcessIncarnation = processGlobal[VISIBLE_LOOP_PROCESS_INCARNATION_SYMBOL];

export const VISIBLE_LOOP_PROCESS_INCARNATION =
  typeof existingProcessIncarnation === "string" && existingProcessIncarnation
    ? existingProcessIncarnation
    : randomUUID();
processGlobal[VISIBLE_LOOP_PROCESS_INCARNATION_SYMBOL] = VISIBLE_LOOP_PROCESS_INCARNATION;

export function claimVisibleLoopRuntimeGeneration(): string {
  const generation = randomUUID();
  processGlobal[VISIBLE_LOOP_RUNTIME_GENERATION_SYMBOL] = generation;
  return generation;
}

export function ownsVisibleLoopRuntimeGeneration(generation: string): boolean {
  return processGlobal[VISIBLE_LOOP_RUNTIME_GENERATION_SYMBOL] === generation;
}

export interface VisibleLoopTimerHandle {
  unref?(): void;
}

export interface VisibleLoopTimerRuntime {
  setTimeout(callback: () => void, timeoutMs: number): VisibleLoopTimerHandle;
  clearTimeout(handle: VisibleLoopTimerHandle): void;
}

export const DEFAULT_VISIBLE_LOOP_TIMER: VisibleLoopTimerRuntime = {
  setTimeout(callback, timeoutMs) {
    return setTimeout(callback, timeoutMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function resolveVisibleLoopDeliveryAckTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  options: { deliveryAckTimeoutMs?: number } = {},
): number {
  const configured =
    typeof options.deliveryAckTimeoutMs === "number"
      ? options.deliveryAckTimeoutMs
      : Number.parseInt(env.PI_VISIBLE_LOOP_DELIVERY_ACK_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_VISIBLE_LOOP_DELIVERY_ACK_TIMEOUT_MS;
  }
  return Math.min(Math.floor(configured), MAX_VISIBLE_LOOP_DELIVERY_ACK_TIMEOUT_MS);
}

export function clearVisibleLoopDeliveryAckWatchdog(
  state: ActiveVisibleLoopState,
  planId?: string,
  stepIndex?: number,
): void {
  const watchdog = state.deliveryAckWatchdog;
  if (!watchdog) return;
  if (planId !== undefined && watchdog.planId !== planId) return;
  if (stepIndex !== undefined && watchdog.stepIndex !== stepIndex) return;
  state.deliveryAckTimer.clearTimeout(watchdog.handle);
  state.deliveryAckWatchdog = null;
}

function persistedSnapshotOwnsSubmittedFrontier(
  state: ActiveVisibleLoopState,
  planId: string,
  stepIndex: number,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
): boolean {
  const currentSessionId = normalizeVisibleLoopOwnerSessionId(ctx.sessionManager?.getSessionId?.());
  if (!currentSessionId || currentSessionId !== state.ownerSessionId) return false;
  const snapshot = readActiveVisibleLoopSnapshot(state.ownerSessionId, env);
  if (snapshot.kind !== "ok" || !snapshot.value || typeof snapshot.value !== "object") {
    return false;
  }
  const persisted = snapshot.value as {
    ownerSessionId?: unknown;
    runId?: unknown;
    hostProcessIncarnation?: unknown;
    stopped?: unknown;
    plan?: {
      planId?: unknown;
      lifecycle?: unknown;
      frontier?: { state?: unknown; stepIndex?: unknown } | null;
    } | null;
  };
  const persistedPlan = persisted.plan;
  const persistedFrontier = persistedPlan?.frontier;
  return (
    persisted.ownerSessionId === state.ownerSessionId &&
    persisted.runId === state.config.runId &&
    persisted.hostProcessIncarnation === state.hostProcessIncarnation &&
    persisted.stopped === false &&
    persistedPlan?.planId === planId &&
    persistedPlan.lifecycle === "active" &&
    persistedFrontier?.state === "submitted" &&
    persistedFrontier.stepIndex === stepIndex
  );
}

export function armVisibleLoopDeliveryAckWatchdog(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  ownsActiveState: () => boolean,
  stopFailedClosed: (reason: string, operatorMessage: string) => void,
): void {
  const plan = state.plan;
  const frontier = plan?.frontier;
  if (!plan || state.stopped || frontier?.state !== "submitted") return;
  if (
    state.deliveryAckWatchdog?.planId === plan.planId &&
    state.deliveryAckWatchdog.stepIndex === frontier.stepIndex
  ) {
    return;
  }
  clearVisibleLoopDeliveryAckWatchdog(state);
  const planId = plan.planId;
  const stepIndex = frontier.stepIndex;
  const handle = state.deliveryAckTimer.setTimeout(() => {
    const watchdog = state.deliveryAckWatchdog;
    if (watchdog?.planId === planId && watchdog.stepIndex === stepIndex) {
      state.deliveryAckWatchdog = null;
    }
    const currentPlan = state.plan;
    if (
      !ownsActiveState() ||
      state.stopped ||
      currentPlan?.planId !== planId ||
      currentPlan.lifecycle !== "active" ||
      currentPlan.frontier?.state !== "submitted" ||
      currentPlan.frontier.stepIndex !== stepIndex ||
      !persistedSnapshotOwnsSubmittedFrontier(state, planId, stepIndex, ctx, env)
    ) {
      return;
    }
    appendVisibleLoopStatus(
      state.config,
      {
        event: "prompt_delivery_ack_timed_out",
        iteration: currentPlan.iteration,
        planId,
        promptIndex: stepIndex + 1,
        timeoutMs: state.deliveryAckTimeoutMs,
      },
      env,
    );
    stopFailedClosed(
      `prompt delivery acknowledgement timed out after ${state.deliveryAckTimeoutMs}ms`,
      `prompt delivery was not observed within ${state.deliveryAckTimeoutMs}ms`,
    );
  }, state.deliveryAckTimeoutMs);
  state.deliveryAckWatchdog = { planId, stepIndex, handle };
  handle.unref?.();
}

export function getVisibleLoopUserMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined;
  const record = message as Record<string, unknown>;
  if (record.role !== "user") return undefined;
  const content = record.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
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
    .join("\n");
}
