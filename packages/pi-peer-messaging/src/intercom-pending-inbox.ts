import type { PeerMessage, PeerPresence } from "./contracts.ts";

const PENDING_PREVIEW_LENGTH = 80;

export interface PendingInboundMessage {
  from: PeerPresence;
  message: PeerMessage;
  receivedAt: number;
}

export interface PendingInboundMessageDetails {
  fromId: string;
  fromLabel: string;
  messageId: string;
  receivedAt: number;
  ageMs: number;
  preview: string;
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function formatPeerTarget(peer: PeerPresence, options: { includeShortId?: boolean } = {}): string {
  const base = peer.name?.trim() || peer.addressLabel || peer.id;
  if (options.includeShortId === false) {
    return base;
  }

  return `${base} (${shortSessionId(peer.id)})`;
}

function truncatePreview(value: string, maxLength: number = PENDING_PREVIEW_LENGTH): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

function formatElapsedSeconds(timestamp: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return `${elapsedSeconds}s ago`;
}

export function formatPendingInboundLine(entry: PendingInboundMessage, now: number): string {
  return `${formatPeerTarget(entry.from)} · ${entry.message.id} · ${formatElapsedSeconds(entry.receivedAt, now)} · ${truncatePreview(entry.message.content.text)}`;
}

export function formatPendingInboundSummary(
  pendingMessages: PendingInboundMessage[],
  now: number,
  maxEntries = 3,
): string {
  if (pendingMessages.length === 0) {
    return "Pending inbound messages: 0";
  }

  const visible = pendingMessages
    .slice(0, maxEntries)
    .map((entry) => `- ${formatPendingInboundLine(entry, now)}`)
    .join("\n");
  const hiddenCount = pendingMessages.length - maxEntries;
  const hiddenLine =
    hiddenCount > 0 ? `\n- … ${hiddenCount} more; run intercom({ action: "pending" })` : "";
  return `Pending inbound messages: ${pendingMessages.length}\n${visible}${hiddenLine}`;
}

export function pendingInboundDetails(
  pendingMessages: PendingInboundMessage[],
  now: number,
): PendingInboundMessageDetails[] {
  return pendingMessages.map((entry) => ({
    fromId: entry.from.id,
    fromLabel: formatPeerTarget(entry.from, { includeShortId: false }),
    messageId: entry.message.id,
    receivedAt: entry.receivedAt,
    ageMs: Math.max(0, now - entry.receivedAt),
    preview: truncatePreview(entry.message.content.text),
  }));
}
