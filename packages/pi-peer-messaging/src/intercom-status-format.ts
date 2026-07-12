// ---
// summary: builds intercom identity proofs and renders session-list and status responses
// read_when:
//   - changing intercom status output, identity evidence, or session listings
// ---
import type { PeerPresence, PeerRuntimeStatus } from "./contracts.ts";
import {
  duplicateSessionNames,
  formatPeerTarget,
  formatSessionListRow,
} from "./intercom-peer-format.ts";
import {
  formatPendingInboundSummary,
  type PendingInboundMessage,
  pendingInboundDetails,
} from "./intercom-pending-inbox.ts";

export interface IntercomIdentityProof {
  status: "verified" | "unavailable" | "mismatch";
  selfId?: string;
  exactPeerTarget?: string;
  selfPresence?: PeerPresence;
  activePeerCount: number;
  communicationOnly: true;
  canonicalAuthority: false;
}

export interface FormattedIntercomText {
  text: string;
  isError?: boolean;
  details?: Record<string, unknown>;
}

export function buildIdentityProof(
  status: PeerRuntimeStatus,
  peers: PeerPresence[],
): IntercomIdentityProof {
  const selfPresence = status.selfId ? peers.find((peer) => peer.id === status.selfId) : undefined;
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

export function formatIntercomStatus(
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

export function formatIntercomSessionList(
  status: PeerRuntimeStatus,
  peers: PeerPresence[],
  pendingMessages: PendingInboundMessage[],
  now: number,
): FormattedIntercomText {
  const duplicateNames = duplicateSessionNames(peers);
  const pendingSummary = formatPendingInboundSummary(pendingMessages, now);
  const pendingDetails = {
    pendingInboundCount: pendingMessages.length,
    pendingInboundMessages: pendingInboundDetails(pendingMessages, now),
  };

  if (status.selfId) {
    const currentSession = peers.find((peer) => peer.id === status.selfId);
    const otherSessions = peers.filter((peer) => peer.id !== status.selfId);

    if (!currentSession) {
      return {
        text: "Current session is missing from the peer session list.",
        isError: true,
      } satisfies FormattedIntercomText;
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
              formatSessionListRow(peer, currentSession.cwd, status.selfId, duplicateNames, now),
            )
            .join("\n")}`;

    return {
      text: `${currentSection}\n\n${otherSection}\n\n${pendingSummary}`,
      details: pendingDetails,
    } satisfies FormattedIntercomText;
  }

  if (peers.length === 0) {
    return { text: "No peer sessions connected." } satisfies FormattedIntercomText;
  }

  const currentCwd = peers[0]?.cwd ?? "unknown";
  return {
    text: `**Peer sessions:**\n${peers
      .map((peer) => formatSessionListRow(peer, currentCwd, undefined, duplicateNames, now))
      .join("\n")}`,
  } satisfies FormattedIntercomText;
}
