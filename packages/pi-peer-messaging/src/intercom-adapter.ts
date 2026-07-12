// ---
// summary: adapts intercom actions onto the stable peer-messaging runtime and tracks inbound protocol state
// read_when:
//   - changing intercom actions, replies, pending messages, or peer protocol supervision
// ---
import { randomUUID } from "node:crypto";

import type {
  DeliveryResult,
  PeerAttachment,
  PeerMessage,
  PeerMessagingRuntime,
  PeerPresence,
} from "./contracts.ts";
import {
  buildAmbiguousTargetReason,
  escapeToolString,
  formatAttachments,
  formatMessageBody,
  formatPeerTarget,
  isAmbiguousTargetReason,
} from "./intercom-peer-format.ts";
import { formatPendingInboundLine, pendingInboundDetails } from "./intercom-pending-inbox.ts";
import {
  formatPeerProtocolSnapshot,
  PeerProtocolLedger,
  type PeerProtocolSnapshot,
} from "./intercom-protocol-ledger.ts";
import { ReplyTracker } from "./intercom-reply-tracker.ts";
import {
  buildIdentityProof,
  formatIntercomSessionList,
  formatIntercomStatus,
} from "./intercom-status-format.ts";

export const INTERCOM_TOOL_NAME = "intercom";
export interface IntercomToolRequest {
  action: string;
  to?: string;
  message?: string;
  attachments?: PeerAttachment[];
  replyTo?: string;
  timeoutMs?: number;
  peerRunId?: string;
  questId?: string;
  waitFor?: "ack" | "final" | "both";
}

export interface IntercomIncomingMessage {
  from: PeerPresence;
  message: PeerMessage;
  replyCommand?: string;
  bodyText: string;
}

export interface IntercomToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  details?: Record<string, unknown>;
}

export interface IntercomAdapterOptions {
  now?: () => number;
  onIncomingMessage?: (entry: IntercomIncomingMessage) => void;
}

function createPeerMessage(
  text: string,
  options: {
    attachments?: PeerAttachment[];
    replyTo?: string;
    now: () => number;
  },
): PeerMessage {
  return {
    id: randomUUID(),
    timestamp: options.now(),
    replyTo: options.replyTo,
    content: {
      text,
      attachments: options.attachments,
    },
  } satisfies PeerMessage;
}

function textResult(
  text: string,
  options: { isError?: boolean; details?: Record<string, unknown> } = {},
): IntercomToolResponse {
  return {
    content: [{ type: "text", text }],
    isError: options.isError,
    details: options.details,
  } satisfies IntercomToolResponse;
}

export class IntercomCompatibleAdapter {
  private readonly now: () => number;
  private readonly onIncomingMessage?: (entry: IntercomIncomingMessage) => void;
  private readonly replyTracker = new ReplyTracker();
  private readonly peerProtocolLedger = new PeerProtocolLedger();
  private readonly peerProtocolWaiters = new Set<() => void>();

  constructor(options: IntercomAdapterOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.onIncomingMessage = options.onIncomingMessage;
  }

  clear(): void {
    this.replyTracker.clear();
    this.peerProtocolLedger.clear();
  }

  handleIncomingMessage(from: PeerPresence, message: PeerMessage): void {
    const receivedAt = this.now();
    this.replyTracker.recordIncomingMessage(from, message, receivedAt);
    this.peerProtocolLedger.recordIncomingMessage(from, message, receivedAt);
    this.notifyPeerProtocolWaiters();

    const entry = {
      from,
      message,
      replyCommand: message.replyTo
        ? undefined
        : `intercom({ action: "reply", to: ${escapeToolString(from.id)}, replyTo: ${escapeToolString(message.id)}, message: "..." })`,
      bodyText: formatMessageBody(message),
    } satisfies IntercomIncomingMessage;

    this.onIncomingMessage?.(entry);
  }

  async execute(
    runtime: PeerMessagingRuntime,
    request: IntercomToolRequest,
  ): Promise<IntercomToolResponse> {
    switch (request.action) {
      case "list":
        return this.list(runtime);
      case "send":
        return this.send(runtime, request);
      case "ask":
        return this.ask(runtime, request);
      case "reply":
        return this.reply(runtime, request);
      case "pending":
        return this.pending();
      case "peer_status":
        return this.peerProtocolStatus(request, "peer");
      case "peer_watch":
        return this.peerProtocolWatch(request, "peer");
      case "quest_status":
        return this.peerProtocolStatus(request, "quest");
      case "quest_watch":
        return this.peerProtocolWatch(request, "quest");
      case "status":
        return this.status(runtime);
      default:
        return textResult(`Unknown action: ${request.action}`, { isError: true });
    }
  }

  private notifyPeerProtocolWaiters(): void {
    const waiters = [...this.peerProtocolWaiters];
    this.peerProtocolWaiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }

  private resolvePeerProtocolRunId(
    request: IntercomToolRequest,
    vocabulary: "peer" | "quest",
  ): { runId?: string; error?: string } {
    const peerRunId = request.peerRunId?.trim();
    const questId = request.questId?.trim();

    if (vocabulary === "peer") {
      if (peerRunId) return { runId: peerRunId };
      if (questId) return { runId: questId };
      return { error: "Missing 'peerRunId' parameter" };
    }

    if (questId) return { runId: questId };
    if (peerRunId) return { runId: peerRunId };
    return { error: "Missing 'questId' parameter" };
  }

  private peerProtocolStatus(
    request: IntercomToolRequest,
    vocabulary: "peer" | "quest",
  ): IntercomToolResponse {
    const resolved = this.resolvePeerProtocolRunId(request, vocabulary);
    if (!resolved.runId) {
      return textResult(resolved.error ?? "Missing peer protocol run id", { isError: true });
    }

    const snapshot = this.peerProtocolLedger.snapshot(resolved.runId, vocabulary);
    return textResult(formatPeerProtocolSnapshot(snapshot, vocabulary), {
      details: { ...snapshot },
    });
  }

  private peerProtocolWatchConditionMet(
    snapshot: PeerProtocolSnapshot,
    waitFor: "ack" | "final" | "both",
  ): boolean {
    if (snapshot.state === "protocol_violation") return true;
    if (waitFor === "ack") return snapshot.ackCount > 0;
    if (waitFor === "final") return snapshot.finalCount > 0;
    return snapshot.ackCount > 0 && snapshot.finalCount > 0;
  }

  private async peerProtocolWatch(
    request: IntercomToolRequest,
    vocabulary: "peer" | "quest",
  ): Promise<IntercomToolResponse> {
    const resolved = this.resolvePeerProtocolRunId(request, vocabulary);
    if (!resolved.runId) {
      return textResult(resolved.error ?? "Missing peer protocol run id", { isError: true });
    }

    const waitFor = request.waitFor ?? "final";
    const timeoutMs = request.timeoutMs ?? 30_000;
    const deadline = this.now() + timeoutMs;

    while (true) {
      const snapshot = this.peerProtocolLedger.snapshot(resolved.runId, vocabulary);
      if (this.peerProtocolWatchConditionMet(snapshot, waitFor)) {
        return textResult(formatPeerProtocolSnapshot(snapshot, vocabulary), {
          details: { ...snapshot, timedOut: false, waitFor },
        });
      }

      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) {
        return textResult(
          `Timed out waiting for ${waitFor} on ${resolved.runId}.\n${formatPeerProtocolSnapshot(snapshot, vocabulary)}`,
          {
            isError: true,
            details: { ...snapshot, timedOut: true, waitFor },
          },
        );
      }

      await new Promise<void>((resolve) => {
        let waiter: (() => void) | undefined;
        const timer = setTimeout(
          () => {
            if (waiter) this.peerProtocolWaiters.delete(waiter);
            resolve();
          },
          Math.min(remainingMs, 250),
        );
        waiter = () => {
          clearTimeout(timer);
          resolve();
        };
        this.peerProtocolWaiters.add(waiter);
      });
    }
  }

  private async list(runtime: PeerMessagingRuntime): Promise<IntercomToolResponse> {
    try {
      const status = await runtime.status();
      const peers = await runtime.listPeers();
      const pendingMessages = this.replyTracker.listPending();
      const formatted = formatIntercomSessionList(status, peers, pendingMessages, this.now());
      return textResult(formatted.text, {
        isError: formatted.isError,
        details: formatted.details,
      });
    } catch (error) {
      return textResult(`Failed to list sessions: ${this.getErrorMessage(error)}`, {
        isError: true,
      });
    }
  }

  private async send(
    runtime: PeerMessagingRuntime,
    request: IntercomToolRequest,
  ): Promise<IntercomToolResponse> {
    if (!request.to || !request.message) {
      return textResult("Missing 'to' or 'message' parameter", { isError: true });
    }

    try {
      const delivery = await runtime.send({
        to: request.to,
        message: createPeerMessage(request.message, {
          attachments: request.attachments,
          replyTo: request.replyTo,
          now: this.now,
        }),
      });

      if (!delivery.delivered) {
        const reason = await this.resolveDeliveryFailureReason(runtime, request.to, delivery);
        const targetLabel = request.replyTo ? "Reply" : "Message";
        return textResult(`${targetLabel} to "${request.to}" was not delivered: ${reason}`, {
          isError: true,
          details: {
            delivered: false,
            messageId: delivery.messageId,
            reason,
          },
        });
      }

      const successText = request.replyTo
        ? `Reply sent to ${request.to}`
        : `Message sent to ${request.to}`;
      return textResult(successText, {
        details: {
          delivered: true,
          messageId: delivery.messageId,
          replyTo: request.replyTo,
        },
      });
    } catch (error) {
      return textResult(`Failed to send: ${this.getErrorMessage(error)}`, { isError: true });
    }
  }

  private async ask(
    runtime: PeerMessagingRuntime,
    request: IntercomToolRequest,
  ): Promise<IntercomToolResponse> {
    if (!request.to || !request.message) {
      return textResult("Missing 'to' or 'message' parameter", { isError: true });
    }

    try {
      const outboundMessage = createPeerMessage(request.message, {
        attachments: request.attachments,
        replyTo: request.replyTo,
        now: this.now,
      });
      const reply = await runtime.ask({
        to: request.to,
        message: outboundMessage,
        timeoutMs: request.timeoutMs,
      });
      const replyText = `${reply.content.text}${formatAttachments(reply.content.attachments)}`;

      return textResult(`**Reply from ${request.to}:**\n${replyText}`, {
        details: {
          messageId: reply.id,
          replyTo: reply.replyTo,
          timestamp: reply.timestamp,
        },
      });
    } catch (error) {
      const reason = await this.resolveActionFailureReason(runtime, request.to, error);
      return textResult(`Failed: ${reason}`, { isError: true });
    }
  }

  private async reply(
    runtime: PeerMessagingRuntime,
    request: IntercomToolRequest,
  ): Promise<IntercomToolResponse> {
    if (!request.message) {
      return textResult("Missing 'message' parameter", { isError: true });
    }

    try {
      const target = this.replyTracker.resolveReplyTarget({
        to: request.to,
        replyTo: request.replyTo,
      });
      const delivery = await runtime.send({
        to: target.from.id,
        message: createPeerMessage(request.message, {
          replyTo: target.message.id,
          now: this.now,
        }),
      });

      if (!delivery.delivered) {
        const reason = await this.resolveDeliveryFailureReason(runtime, target.from.id, delivery);
        return textResult(
          `Reply to "${formatPeerTarget(target.from, { includeShortId: false })}" was not delivered: ${reason}`,
          {
            isError: true,
            details: {
              delivered: false,
              messageId: delivery.messageId,
              reason,
              replyTo: target.message.id,
            },
          },
        );
      }

      this.replyTracker.markReplied(target.message.id);
      return textResult(
        `Reply sent to ${formatPeerTarget(target.from, { includeShortId: false })}`,
        {
          details: {
            delivered: true,
            messageId: delivery.messageId,
            replyTo: target.message.id,
          },
        },
      );
    } catch (error) {
      return textResult(`Failed to reply: ${this.getErrorMessage(error)}`, { isError: true });
    }
  }

  private pending(): IntercomToolResponse {
    const pendingMessages = this.replyTracker.listPending();
    if (pendingMessages.length === 0) {
      return textResult("No unresolved inbound messages.");
    }

    const now = this.now();
    const lines = pendingMessages.map((entry) => `- ${formatPendingInboundLine(entry, now)}`);

    return textResult(`**Pending inbound messages:**\n${lines.join("\n")}`, {
      details: {
        pendingInboundCount: pendingMessages.length,
        pendingInboundMessages: pendingInboundDetails(pendingMessages, now),
      },
    });
  }

  private async status(runtime: PeerMessagingRuntime): Promise<IntercomToolResponse> {
    try {
      const status = await runtime.status();
      const peers = await runtime.listPeers();
      const identityProof = buildIdentityProof(status, peers);
      const now = this.now();
      const pendingMessages = this.replyTracker.listPending();
      return textResult(formatIntercomStatus(status, identityProof, pendingMessages, now), {
        details: {
          ...status,
          identityProof,
          pendingInboundCount: pendingMessages.length,
          pendingInboundMessages: pendingInboundDetails(pendingMessages, now),
        },
      });
    } catch (error) {
      return textResult(`Failed to get status: ${this.getErrorMessage(error)}`, { isError: true });
    }
  }

  private async resolveDeliveryFailureReason(
    runtime: PeerMessagingRuntime,
    to: string,
    delivery: DeliveryResult,
  ): Promise<string> {
    if (!isAmbiguousTargetReason(delivery.reason)) {
      return delivery.reason ?? "Session may not exist or has disconnected.";
    }

    try {
      const peers = await runtime.listPeers();
      return buildAmbiguousTargetReason(
        to,
        peers,
        delivery.reason ?? `Multiple peers matched "${to}". Use the exact session id instead.`,
      );
    } catch {
      return delivery.reason ?? "Session may not exist or has disconnected.";
    }
  }

  private async resolveActionFailureReason(
    runtime: PeerMessagingRuntime,
    to: string,
    error: unknown,
  ): Promise<string> {
    const message = this.getErrorMessage(error);
    if (!isAmbiguousTargetReason(message)) {
      return message;
    }

    try {
      const peers = await runtime.listPeers();
      return buildAmbiguousTargetReason(to, peers, message);
    } catch {
      return message;
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export function createIntercomCompatibleAdapter(
  options: IntercomAdapterOptions = {},
): IntercomCompatibleAdapter {
  return new IntercomCompatibleAdapter(options);
}
