// ---
// summary: tracks unresolved inbound messages and resolves unambiguous reply targets
// read_when:
//   - changing reply selection, pending-message ordering, or resolution errors
// ---
import type { PeerMessage, PeerPresence } from "./contracts.ts";
import { matchesPeerTarget } from "./intercom-peer-format.ts";
import type { PendingInboundMessage } from "./intercom-pending-inbox.ts";

export class ReplyTracker {
  private readonly pending = new Map<string, PendingInboundMessage>();

  recordIncomingMessage(from: PeerPresence, message: PeerMessage, receivedAt: number): void {
    if (message.replyTo) {
      return;
    }

    this.pending.set(message.id, {
      from,
      message,
      receivedAt,
    });
  }

  markReplied(messageId: string): void {
    this.pending.delete(messageId);
  }

  listPending(): PendingInboundMessage[] {
    return [...this.pending.values()].sort((left, right) => left.receivedAt - right.receivedAt);
  }

  resolveReplyTarget(input: { to?: string; replyTo?: string }): PendingInboundMessage {
    const pending = this.listPending();

    if (pending.length === 0) {
      throw new Error("No unresolved inbound messages to reply to.");
    }

    if (input.replyTo) {
      const match = pending.find((entry) => entry.message.id === input.replyTo);
      if (!match) {
        throw new Error(`No unresolved inbound message matched replyTo "${input.replyTo}".`);
      }
      if (input.to && !matchesPeerTarget(match.from, input.to)) {
        throw new Error(
          `The unresolved inbound message ${input.replyTo} does not belong to "${input.to}".`,
        );
      }

      return match;
    }

    if (input.to) {
      const target = input.to;
      const matches = pending.filter((entry) => matchesPeerTarget(entry.from, target));
      if (matches.length === 0) {
        throw new Error(`No unresolved inbound message matched "${target}".`);
      }
      if (matches.length > 1) {
        throw new Error(
          `Multiple unresolved inbound messages matched "${target}". Use replyTo or inspect pending first.`,
        );
      }

      const [match] = matches;
      if (!match) {
        throw new Error(`No unresolved inbound message matched "${target}".`);
      }

      return match;
    }

    if (pending.length > 1) {
      throw new Error(
        "Multiple unresolved inbound messages are pending. Use pending or provide to/replyTo.",
      );
    }

    const [onlyPendingMessage] = pending;
    if (!onlyPendingMessage) {
      throw new Error("No unresolved inbound messages to reply to.");
    }

    return onlyPendingMessage;
  }

  clear(): void {
    this.pending.clear();
  }
}
