// ---
// summary: the one in-flight ask record of a peer-messaging runtime, and how a lost reply path is classified
// read_when:
//   - changing ask timeouts, cancellation, delivery confirmation, or no-reply classification
// ---
import type { PeerMessagingClient } from "./client.ts";
import { PeerAskNoReplyError, type PeerAskNoReplyReason, type PeerMessage } from "./contracts.ts";

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
