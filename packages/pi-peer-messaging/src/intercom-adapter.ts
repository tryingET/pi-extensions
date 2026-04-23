import { randomUUID } from "node:crypto";

import type {
  DeliveryResult,
  PeerAttachment,
  PeerMessage,
  PeerMessagingRuntime,
  PeerPresence,
  PeerRuntimeStatus,
} from "./contracts.ts";

export const INTERCOM_TOOL_NAME = "intercom";
const PENDING_PREVIEW_LENGTH = 80;

export interface IntercomToolRequest {
  action: string;
  to?: string;
  message?: string;
  attachments?: PeerAttachment[];
  replyTo?: string;
  timeoutMs?: number;
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

interface PendingInboundMessage {
  from: PeerPresence;
  message: PeerMessage;
  receivedAt: number;
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function escapeToolString(value: string): string {
  return JSON.stringify(value);
}

function formatAttachment(attachment: PeerAttachment): string {
  if (attachment.language) {
    return `\n\n---\n📎 ${attachment.name}\n\`\`\`${attachment.language}\n${attachment.content}\n\`\`\``;
  }

  return `\n\n---\n📎 ${attachment.name}\n${attachment.content}`;
}

function formatAttachments(attachments: PeerAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }

  return attachments.map((attachment) => formatAttachment(attachment)).join("");
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

function duplicateSessionNames(peers: PeerPresence[]): Set<string> {
  const counts = new Map<string, number>();

  for (const peer of peers) {
    const name = peer.name?.trim().toLowerCase();
    if (!name) {
      continue;
    }

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
}

function formatPeerTarget(peer: PeerPresence, options: { includeShortId?: boolean } = {}): string {
  const base = peer.name?.trim() || peer.addressLabel || peer.id;
  if (options.includeShortId === false) {
    return base;
  }

  return `${base} (${shortSessionId(peer.id)})`;
}

function formatExactTargetCandidate(peer: PeerPresence): string {
  return `${formatPeerTarget(peer)} → ${peer.id}`;
}

function formatSessionListRow(
  peer: PeerPresence,
  currentCwd: string,
  selfId: string | undefined,
  duplicateNames: Set<string>,
): string {
  const name = peer.name?.trim() || peer.addressLabel || "Unnamed session";
  const label = duplicateNames.has(name.toLowerCase()) ? formatPeerTarget(peer) : name;
  const tags = [
    peer.id === selfId ? "self" : undefined,
    peer.id !== selfId && peer.cwd === currentCwd ? "same cwd" : undefined,
    peer.status,
  ].filter((tag): tag is string => Boolean(tag));
  const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

  return `• ${label} — ${peer.cwd} (${peer.model})${suffix}\n  id: ${peer.id}`;
}

function matchesPeerTarget(peer: PeerPresence, target: string): boolean {
  if (peer.id === target) {
    return true;
  }

  const normalizedTarget = target.trim().toLowerCase();
  return (
    peer.addressLabel.trim().toLowerCase() === normalizedTarget ||
    peer.name?.trim().toLowerCase() === normalizedTarget
  );
}

function buildAmbiguousTargetReason(to: string, peers: PeerPresence[], fallback: string): string {
  const matchingPeers = peers.filter((peer) => matchesPeerTarget(peer, to));
  if (matchingPeers.length === 0) {
    return fallback;
  }

  return `${fallback} Matching peers: ${matchingPeers.map((peer) => formatExactTargetCandidate(peer)).join("; ")}`;
}

function isAmbiguousTargetReason(reason: string | undefined): boolean {
  return typeof reason === "string" && reason.includes("Multiple peers matched");
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

class ReplyTracker {
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

export class IntercomCompatibleAdapter {
  private readonly now: () => number;
  private readonly onIncomingMessage?: (entry: IntercomIncomingMessage) => void;
  private readonly replyTracker = new ReplyTracker();

  constructor(options: IntercomAdapterOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.onIncomingMessage = options.onIncomingMessage;
  }

  clear(): void {
    this.replyTracker.clear();
  }

  handleIncomingMessage(from: PeerPresence, message: PeerMessage): void {
    const receivedAt = this.now();
    this.replyTracker.recordIncomingMessage(from, message, receivedAt);

    const entry = {
      from,
      message,
      replyCommand: message.replyTo
        ? undefined
        : `intercom({ action: "reply", to: ${escapeToolString(from.id)}, replyTo: ${escapeToolString(message.id)}, message: "..." })`,
      bodyText: `${message.content.text}${formatAttachments(message.content.attachments)}`,
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
      case "status":
        return this.status(runtime);
      default:
        return textResult(`Unknown action: ${request.action}`, { isError: true });
    }
  }

  private async list(runtime: PeerMessagingRuntime): Promise<IntercomToolResponse> {
    try {
      const status = await runtime.status();
      const peers = await runtime.listPeers();
      const duplicateNames = duplicateSessionNames(peers);

      if (status.selfId) {
        const currentSession = peers.find((peer) => peer.id === status.selfId);
        const otherSessions = peers.filter((peer) => peer.id !== status.selfId);

        if (!currentSession) {
          return textResult("Current session is missing from the peer session list.", {
            isError: true,
          });
        }

        const currentSection = `**Current session:**\n${formatSessionListRow(
          currentSession,
          currentSession.cwd,
          status.selfId,
          duplicateNames,
        )}`;
        const otherSection =
          otherSessions.length === 0
            ? "**Other sessions:**\nNo other sessions connected."
            : `**Other sessions:**\n${otherSessions
                .map((peer) =>
                  formatSessionListRow(peer, currentSession.cwd, status.selfId, duplicateNames),
                )
                .join("\n")}`;

        return textResult(`${currentSection}\n\n${otherSection}`);
      }

      if (peers.length === 0) {
        return textResult("No peer sessions connected.");
      }

      const currentCwd = peers[0]?.cwd ?? "unknown";
      return textResult(
        `**Peer sessions:**\n${peers
          .map((peer) => formatSessionListRow(peer, currentCwd, undefined, duplicateNames))
          .join("\n")}`,
      );
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
    const lines = pendingMessages.map((entry) => {
      const preview = entry.message.content.text
        .replace(/\s+/g, " ")
        .slice(0, PENDING_PREVIEW_LENGTH);
      const elapsedSeconds = Math.max(0, Math.floor((now - entry.receivedAt) / 1000));
      return `- ${formatPeerTarget(entry.from)} · ${entry.message.id} · ${elapsedSeconds}s ago · ${preview}`;
    });

    return textResult(`**Pending inbound messages:**\n${lines.join("\n")}`);
  }

  private async status(runtime: PeerMessagingRuntime): Promise<IntercomToolResponse> {
    try {
      const status = await runtime.status();
      return textResult(this.formatStatus(status));
    } catch (error) {
      return textResult(`Failed to get status: ${this.getErrorMessage(error)}`, { isError: true });
    }
  }

  private formatStatus(status: PeerRuntimeStatus): string {
    return [
      "**Intercom Status:**",
      `Connected: ${status.connected ? "Yes" : "No"}`,
      `Session ID: ${status.selfId ?? "unavailable"}`,
      `Active sessions: ${status.activePeerCount}`,
    ].join("\n");
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
