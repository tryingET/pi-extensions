import type { PeerMessage, PeerPresence } from "./contracts.ts";
import { formatPeerTarget, truncatePreview } from "./intercom-peer-format.ts";

export type PeerProtocolKind =
  | "PEER_ACK"
  | "PEER_FINAL"
  | "QUEST_ACK"
  | "QUEST_FINAL"
  | "VISIBLE_LOOP_ITERATION";

export type PeerProtocolPhase = "ack" | "final" | "progress" | "unknown";

export type PeerProtocolVocabulary = "peer" | "quest" | "unknown";

export type PeerProtocolState =
  | "no_messages"
  | "ack_received"
  | "final_received"
  | "protocol_violation";

interface ParsedPeerProtocolMessage {
  runId: string;
  kind: PeerProtocolKind | "UNKNOWN";
  phase: PeerProtocolPhase;
  vocabulary: PeerProtocolVocabulary;
  token: "peer_run_id" | "quest_id" | null;
}

export interface PeerProtocolMessage {
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

export interface PeerProtocolSnapshot {
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

export class PeerProtocolLedger {
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

export function formatPeerProtocolSnapshot(
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
