import { randomUUID } from "node:crypto";

import type {
  DeliveryResult,
  PeerAttachment,
  PeerMessage,
  PeerMessagingRuntime,
  PeerPresence,
  PeerRuntimeStatus,
} from "./contracts.ts";
import {
  formatPendingInboundLine,
  formatPendingInboundSummary,
  type PendingInboundMessage,
  pendingInboundDetails,
} from "./intercom-pending-inbox.ts";

export const INTERCOM_TOOL_NAME = "intercom";
const PENDING_PREVIEW_LENGTH = 80;

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

type PeerProtocolKind =
  | "PEER_ACK"
  | "PEER_FINAL"
  | "QUEST_ACK"
  | "QUEST_FINAL"
  | "VISIBLE_LOOP_ITERATION";

type PeerProtocolPhase = "ack" | "final" | "progress" | "unknown";

type PeerProtocolVocabulary = "peer" | "quest" | "unknown";

type PeerProtocolState = "no_messages" | "ack_received" | "final_received" | "protocol_violation";

interface ParsedPeerProtocolMessage {
  runId: string;
  kind: PeerProtocolKind | "UNKNOWN";
  phase: PeerProtocolPhase;
  vocabulary: PeerProtocolVocabulary;
  token: "peer_run_id" | "quest_id" | null;
}

interface PeerProtocolMessage {
  kind: PeerProtocolKind | "UNKNOWN";
  phase: PeerProtocolPhase;
  vocabulary: PeerProtocolVocabulary;
  token: "peer_run_id" | "quest_id" | null;
  peerRunId: string;
  from: PeerPresence;
  message: PeerMessage;
  receivedAt: number;
  preview: string;
}

interface PeerProtocolSnapshot {
  peerRunId: string;
  questId: string;
  vocabulary: PeerProtocolVocabulary;
  state: PeerProtocolState;
  ackCount: number;
  finalCount: number;
  progressCount: number;
  duplicateAckCount: number;
  duplicateFinalCount: number;
  violationCount: number;
  messages: PeerProtocolMessage[];
}

interface IntercomIdentityProof {
  status: "verified" | "unavailable" | "mismatch";
  selfId?: string;
  exactPeerTarget?: string;
  selfPresence?: PeerPresence;
  activePeerCount: number;
  communicationOnly: true;
  canonicalAuthority: false;
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
  now: number,
): string {
  const name = peer.name?.trim() || peer.addressLabel || "Unnamed session";
  const label = duplicateNames.has(name.toLowerCase()) ? formatPeerTarget(peer) : name;
  const tags = [
    peer.id === selfId ? "self" : undefined,
    peer.id !== selfId && peer.cwd === currentCwd ? "same cwd" : undefined,
    peer.status,
    `last seen ${formatElapsedSeconds(peer.lastActivity, now)}`,
  ].filter((tag): tag is string => Boolean(tag));
  const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

  return `• ${label} — ${peer.cwd} (${peer.model})${suffix}\n  id: ${peer.id}`;
}

function formatElapsedSeconds(timestamp: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return `${elapsedSeconds}s ago`;
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

function truncatePreview(value: string, maxLength: number = PENDING_PREVIEW_LENGTH): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

function phaseForProtocolKind(kind: PeerProtocolKind | "UNKNOWN"): PeerProtocolPhase {
  if (kind === "PEER_ACK" || kind === "QUEST_ACK") {
    return "ack";
  }

  if (kind === "PEER_FINAL" || kind === "QUEST_FINAL") {
    return "final";
  }

  return "unknown";
}

function parsePeerProtocolMessage(text: string): ParsedPeerProtocolMessage | undefined {
  const canonical = text.match(/\b(PEER_ACK|PEER_FINAL)\s+peer_run_id=([^\s:]+)\s*:/);
  if (canonical?.[1] && canonical[2]) {
    const kind = canonical[1] as "PEER_ACK" | "PEER_FINAL";
    return {
      runId: canonical[2],
      kind,
      phase: phaseForProtocolKind(kind),
      vocabulary: "peer",
      token: "peer_run_id",
    };
  }

  const legacy = text.match(/\b(QUEST_ACK|QUEST_FINAL)\s+quest_id=([^\s:]+)\s*:/);
  if (legacy?.[1] && legacy[2]) {
    const kind = legacy[1] as "QUEST_ACK" | "QUEST_FINAL";
    return {
      runId: legacy[2],
      kind,
      phase: phaseForProtocolKind(kind),
      vocabulary: "quest",
      token: "quest_id",
    };
  }

  const visibleLoopProgress = text.match(/\b(VISIBLE_LOOP_ITERATION)\s+peer_run_id=([^\s:]+)\s*:/);
  if (visibleLoopProgress?.[1] && visibleLoopProgress[2]) {
    return {
      runId: visibleLoopProgress[2],
      kind: "VISIBLE_LOOP_ITERATION",
      phase: "progress",
      vocabulary: "peer",
      token: "peer_run_id",
    };
  }

  const unknown = text.match(/\b([A-Z][A-Z_]+)\s+(peer_run_id|quest_id)=([^\s:]+)\s*:/);
  if (unknown?.[2] && unknown[3]) {
    return {
      runId: unknown[3],
      kind: "UNKNOWN",
      phase: "unknown",
      vocabulary: unknown[2] === "peer_run_id" ? "peer" : "quest",
      token: unknown[2] as "peer_run_id" | "quest_id",
    };
  }

  return undefined;
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

class PeerProtocolLedger {
  private readonly messagesByRunId = new Map<string, PeerProtocolMessage[]>();

  recordIncomingMessage(from: PeerPresence, message: PeerMessage, receivedAt: number): void {
    const parsed = parsePeerProtocolMessage(message.content.text);
    if (!parsed) {
      return;
    }

    const entry = {
      kind: parsed.kind,
      phase: parsed.phase,
      vocabulary: parsed.vocabulary,
      token: parsed.token,
      peerRunId: parsed.runId,
      from,
      message,
      receivedAt,
      preview: truncatePreview(message.content.text),
    } satisfies PeerProtocolMessage;

    const existing = this.messagesByRunId.get(parsed.runId) ?? [];
    existing.push(entry);
    existing.sort((left, right) => left.receivedAt - right.receivedAt);
    this.messagesByRunId.set(parsed.runId, existing);
  }

  snapshot(peerRunId: string, vocabulary: "peer" | "quest"): PeerProtocolSnapshot {
    const messages = [...(this.messagesByRunId.get(peerRunId) ?? [])].filter(
      (message) => message.vocabulary === vocabulary,
    );
    const ackCount = messages.filter((message) => message.phase === "ack").length;
    const finalCount = messages.filter((message) => message.phase === "final").length;
    const progressCount = messages.filter((message) => message.phase === "progress").length;
    const violationCount = messages.filter((message) => message.phase === "unknown").length;
    const state: PeerProtocolState = violationCount
      ? "protocol_violation"
      : finalCount > 0
        ? "final_received"
        : ackCount > 0
          ? "ack_received"
          : "no_messages";

    return {
      peerRunId,
      questId: peerRunId,
      vocabulary,
      state,
      ackCount,
      finalCount,
      progressCount,
      duplicateAckCount: Math.max(0, ackCount - 1),
      duplicateFinalCount: Math.max(0, finalCount - 1),
      violationCount,
      messages,
    } satisfies PeerProtocolSnapshot;
  }

  clear(): void {
    this.messagesByRunId.clear();
  }
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

  private formatPeerProtocolSnapshot(
    snapshot: PeerProtocolSnapshot,
    vocabulary: "peer" | "quest",
  ): string {
    const rows = snapshot.messages.length
      ? snapshot.messages
          .map(
            (message) =>
              `- ${message.kind} from ${formatPeerTarget(message.from)} id=${message.message.id}: ${message.preview}`,
          )
          .join("\n")
      : "- none";

    const label = vocabulary === "peer" ? "Peer run" : "Quest";

    return [
      `${label} ${snapshot.peerRunId}: ${snapshot.state}`,
      `ACK=${snapshot.ackCount} FINAL=${snapshot.finalCount} PROGRESS=${snapshot.progressCount} duplicateACK=${snapshot.duplicateAckCount} duplicateFINAL=${snapshot.duplicateFinalCount} violations=${snapshot.violationCount}`,
      "Messages:",
      rows,
    ].join("\n");
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
    return textResult(this.formatPeerProtocolSnapshot(snapshot, vocabulary), {
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
        return textResult(this.formatPeerProtocolSnapshot(snapshot, vocabulary), {
          details: { ...snapshot, timedOut: false, waitFor },
        });
      }

      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) {
        return textResult(
          `Timed out waiting for ${waitFor} on ${resolved.runId}.\n${this.formatPeerProtocolSnapshot(snapshot, vocabulary)}`,
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
      const duplicateNames = duplicateSessionNames(peers);
      const now = this.now();
      const pendingMessages = this.replyTracker.listPending();
      const pendingSummary = formatPendingInboundSummary(pendingMessages, now);

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
          now,
        )}`;
        const otherSection =
          otherSessions.length === 0
            ? "**Other sessions:**\nNo other sessions connected."
            : `**Other sessions:**\n${otherSessions
                .map((peer) =>
                  formatSessionListRow(
                    peer,
                    currentSession.cwd,
                    status.selfId,
                    duplicateNames,
                    now,
                  ),
                )
                .join("\n")}`;

        return textResult(`${currentSection}\n\n${otherSection}\n\n${pendingSummary}`, {
          details: {
            pendingInboundCount: pendingMessages.length,
            pendingInboundMessages: pendingInboundDetails(pendingMessages, now),
          },
        });
      }

      if (peers.length === 0) {
        return textResult("No peer sessions connected.");
      }

      const currentCwd = peers[0]?.cwd ?? "unknown";
      return textResult(
        `**Peer sessions:**\n${peers
          .map((peer) => formatSessionListRow(peer, currentCwd, undefined, duplicateNames, now))
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
      const identityProof = this.buildIdentityProof(status, peers);
      const now = this.now();
      const pendingMessages = this.replyTracker.listPending();
      return textResult(this.formatStatus(status, identityProof, pendingMessages, now), {
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

  private buildIdentityProof(
    status: PeerRuntimeStatus,
    peers: PeerPresence[],
  ): IntercomIdentityProof {
    const selfPresence = status.selfId
      ? peers.find((peer) => peer.id === status.selfId)
      : undefined;
    const proofStatus: IntercomIdentityProof["status"] = !status.selfId
      ? "unavailable"
      : selfPresence
        ? "verified"
        : "mismatch";

    return {
      status: proofStatus,
      selfId: status.selfId,
      exactPeerTarget: status.selfId,
      selfPresence,
      activePeerCount: status.activePeerCount,
      communicationOnly: true,
      canonicalAuthority: false,
    } satisfies IntercomIdentityProof;
  }

  private formatStatus(
    status: PeerRuntimeStatus,
    identityProof: IntercomIdentityProof,
    pendingMessages: PendingInboundMessage[],
    now: number,
  ): string {
    const selfPresence = identityProof.selfPresence;
    const selfPresenceLine = selfPresence
      ? `Self presence: ${formatPeerTarget(selfPresence, { includeShortId: false })} — ${selfPresence.cwd} (${selfPresence.model}) pid=${selfPresence.pid}`
      : "Self presence: unavailable";

    return [
      "**Intercom Status:**",
      `Connected: ${status.connected ? "Yes" : "No"}`,
      `Session ID: ${status.selfId ?? "unavailable"}`,
      `Active sessions: ${status.activePeerCount}`,
      formatPendingInboundSummary(pendingMessages, now),
      `Identity proof: ${identityProof.status}`,
      `Exact peer target: ${identityProof.exactPeerTarget ?? "unavailable"}`,
      selfPresenceLine,
      "Boundary: communication-only; not durable authority, evidence, or completion truth.",
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
