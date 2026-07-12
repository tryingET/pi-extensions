// ---
// summary: formats peer identities, targets, attachments, message bodies, and ambiguity diagnostics
// read_when:
//   - changing user-visible peer labels or intercom message formatting
// ---
import type { PeerAttachment, PeerMessage, PeerPresence } from "./contracts.ts";

const PENDING_PREVIEW_LENGTH = 80;

export function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

export function escapeToolString(value: string): string {
  return JSON.stringify(value);
}

function formatAttachment(attachment: PeerAttachment): string {
  if (attachment.language) {
    return `\n\n---\n📎 ${attachment.name}\n\`\`\`${attachment.language}\n${attachment.content}\n\`\`\``;
  }

  return `\n\n---\n📎 ${attachment.name}\n${attachment.content}`;
}

export function formatAttachments(attachments: PeerAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }

  return attachments.map((attachment) => formatAttachment(attachment)).join("");
}

export function duplicateSessionNames(peers: PeerPresence[]): Set<string> {
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

export function formatPeerTarget(
  peer: PeerPresence,
  options: { includeShortId?: boolean } = {},
): string {
  const base = peer.name?.trim() || peer.addressLabel || peer.id;
  if (options.includeShortId === false) {
    return base;
  }

  return `${base} (${shortSessionId(peer.id)})`;
}

export function formatExactTargetCandidate(peer: PeerPresence): string {
  return `${formatPeerTarget(peer)} → ${peer.id}`;
}

export function formatSessionListRow(
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

export function formatElapsedSeconds(timestamp: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return `${elapsedSeconds}s ago`;
}

export function matchesPeerTarget(peer: PeerPresence, target: string): boolean {
  if (peer.id === target) {
    return true;
  }

  const normalizedTarget = target.trim().toLowerCase();
  return (
    peer.addressLabel.trim().toLowerCase() === normalizedTarget ||
    peer.name?.trim().toLowerCase() === normalizedTarget
  );
}

export function buildAmbiguousTargetReason(
  to: string,
  peers: PeerPresence[],
  fallback: string,
): string {
  const matchingPeers = peers.filter((peer) => matchesPeerTarget(peer, to));
  if (matchingPeers.length === 0) {
    return fallback;
  }

  return `${fallback} Matching peers: ${matchingPeers.map((peer) => formatExactTargetCandidate(peer)).join("; ")}`;
}

export function isAmbiguousTargetReason(reason: string | undefined): boolean {
  return typeof reason === "string" && reason.includes("Multiple peers matched");
}

export function truncatePreview(value: string, maxLength: number = PENDING_PREVIEW_LENGTH): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

export function formatMessageBody(message: PeerMessage): string {
  return `${message.content.text}${formatAttachments(message.content.attachments)}`;
}
