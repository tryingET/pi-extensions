// summary: "intercom report-back delivery for visible-loop child sessions: serialized sends, retries, timeouts, and peer runtime creation"
// read_when:
//   - "changing intercom send policy, timeout resolution, peer messaging runtime loading, or report-back delivery events"

import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getVisibleLoopCommandName } from "./visibleLoopProfiles.ts";
import type {
  ActiveVisibleLoopState,
  CreateVisibleLoopPeerRuntime,
  PeerMessagingRuntime,
  VisibleLoopContext,
} from "./visibleLoopRecovery.ts";
import { appendVisibleLoopStatus } from "./visibleLoopState.ts";
import type { VisibleLoopRunConfig } from "./visibleLoopTypes.ts";

export const DEFAULT_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS = 10000;
export const MAX_VISIBLE_LOOP_INTERCOM_SEND_TIMEOUT_MS = 120000;

type PeerMessagingModule = {
  createPeerMessagingRuntime(options: {
    id: string;
    name?: string;
    cwd: string;
    model: string;
    packageRoot?: string;
  }): Promise<PeerMessagingRuntime>;
};

export function enqueueVisibleLoopIntercom(
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

export async function disconnectVisibleLoopPeerRuntime(
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

export function resolveVisibleLoopIntercomSendTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  options: { intercomSendTimeoutMs?: number } = {},
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

export async function sendVisibleLoopIntercom(
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
