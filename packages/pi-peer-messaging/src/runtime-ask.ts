// ---
// summary: the one in-flight ask of a peer-messaging runtime: its record, how it settles, and how a lost reply path is classified
// read_when:
//   - changing ask timeouts, cancellation, delivery confirmation, reply matching, or no-reply classification
// ---
import type { PeerMessagingClient } from "./client.ts";
import {
  DEFAULT_ASK_TIMEOUT_MS,
  PeerAskCancelledError,
  PeerAskInFlightError,
  PeerAskNoReplyError,
  type PeerAskNoReplyReason,
  type PeerMessage,
  type PeerPresence,
} from "./contracts.ts";

// setTimeout fires at once for delays above this, so longer asks are capped to it.
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** The one ask this session may have in flight, from the moment ask() is called until it settles. */
export interface ActiveAsk {
  readonly messageId: string;
  readonly targetInput: string;
  // As requested; the timer itself is capped at MAX_TIMER_DELAY_MS.
  readonly timeoutMs: number;
  // Set once the target is resolved and the question is sent on `client`.
  targetId: string | null;
  client: PeerMessagingClient | null;
  // Set synchronously from the broker's ack; only then is a missing answer "no reply".
  delivered: boolean;
  readonly resolve: (reply: PeerMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
  readonly detachAbort: () => void;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * An ask that lost its reply path. After the broker confirmed delivery this is a typed no-reply;
 * before that the question may never have been sent, so it is a send failure.
 */
export function lostAskError(
  ask: ActiveAsk,
  reason: PeerAskNoReplyReason,
  runtimeDetail = "PeerMessagingRuntime disconnected",
): Error {
  const target = `"${ask.targetInput}"`;
  if (ask.delivered) {
    const text =
      reason === "timeout"
        ? `No reply from ${target} within ${ask.timeoutMs}ms.`
        : reason === "peer_disconnected"
          ? `Peer ${target} disconnected before replying.`
          : `${runtimeDetail} while waiting for reply.`;
    return new PeerAskNoReplyError(reason, ask.messageId, text);
  }
  return new Error(
    reason === "timeout"
      ? `Message to ${target} was not confirmed delivered within ${ask.timeoutMs}ms.`
      : reason === "peer_disconnected"
        ? `Peer ${target} disconnected before the message was delivered.`
        : `${runtimeDetail} before the message to ${target} was delivered.`,
  );
}

export interface AskRequest {
  to: string;
  message: PeerMessage;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Holds the one ask a session may have in flight, and settles it exactly once. */
export class AskTracker {
  current: ActiveAsk | null = null;

  /**
   * Records the ask and starts its timer before anything is awaited: asks started in the same tick
   * cannot all pass the in-flight check (AK5928), and disconnect or abort can end this one at any
   * point. `send` starts the delivery; the result settles with the reply or the failure.
   */
  start(request: AskRequest, send: (ask: ActiveAsk) => void): Promise<PeerMessage> {
    if (this.current) {
      throw new PeerAskInFlightError();
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS;
    let resolve!: (reply: PeerMessage) => void;
    let reject!: (error: Error) => void;
    const outcome = new Promise<PeerMessage>((resolveOutcome, rejectOutcome) => {
      resolve = resolveOutcome;
      reject = rejectOutcome;
    });
    // The caller awaits `outcome`; this only keeps an early rejection from counting as unhandled.
    outcome.catch(() => {});

    const signal = request.signal;
    const onAbort = () => {
      this.finish(ask, { error: new PeerAskCancelledError(request.message.id) });
    };
    const ask: ActiveAsk = {
      messageId: request.message.id,
      targetInput: request.to,
      timeoutMs,
      targetId: null,
      client: null,
      delivered: false,
      resolve,
      reject,
      timeout: setTimeout(
        () => {
          this.finish(ask, { error: lostAskError(ask, "timeout") });
        },
        Math.min(timeoutMs, MAX_TIMER_DELAY_MS),
      ),
      detachAbort: () => signal?.removeEventListener("abort", onAbort),
    };
    this.current = ask;
    try {
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }
    } catch (error) {
      this.finish(ask, { error: toError(error) });
      return outcome;
    }

    send(ask);
    return outcome;
  }

  /** Settles `ask` once; later outcomes for an ask that already ended are ignored. */
  finish(ask: ActiveAsk, outcome: { reply: PeerMessage } | { error: Error }): void {
    if (this.current !== ask) {
      return;
    }
    this.current = null;
    clearTimeout(ask.timeout);
    if ("reply" in outcome) {
      ask.resolve(outcome.reply);
    } else {
      ask.reject(outcome.error);
    }
    try {
      ask.detachAbort();
    } catch {
      // A signal without a working removeEventListener has nothing to detach; the ask is settled.
    }
  }

  /** Fails the ask in flight, when `lost` says this took its reply path away. */
  lose(
    reason: PeerAskNoReplyReason,
    lost: (ask: ActiveAsk) => boolean = () => true,
    runtimeDetail?: string,
  ): void {
    const ask = this.current;
    if (ask && lost(ask)) {
      this.finish(ask, { error: lostAskError(ask, reason, runtimeDetail) });
    }
  }

  /** Settles the ask in flight if `message` answers it; false when it is not a reply to it. */
  takeReply(from: PeerPresence, message: PeerMessage): boolean {
    const ask = this.current;
    // Before the question is sent (targetId null) nothing can be replying to it yet.
    if (!ask?.targetId || message.replyTo !== ask.messageId) {
      return false;
    }
    if (from.id !== ask.targetId) {
      this.finish(ask, {
        error: new Error(
          `Received ambiguous reply for ask ${ask.messageId} from unexpected peer ${from.id}.`,
        ),
      });
      return true;
    }
    this.finish(ask, { reply: message });
    return true;
  }
}
