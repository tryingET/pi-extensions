import assert from "node:assert/strict";
import test from "node:test";
import type {
  DeliveryResult,
  PeerAttachment,
  PeerMessage,
  PeerMessagingRuntime,
  PeerPresence,
  PeerRuntimeStatus,
} from "../index.ts";
import {
  createIntercomCompatibleAdapter,
  type IntercomIncomingMessage,
} from "../src/intercom-adapter.ts";

const SELF_PEER = {
  id: "self-session-12345678",
  name: "planner",
  addressLabel: "planner",
  cwd: "/repo/planner",
  model: "openai/gpt-4.1",
  pid: 1,
  startedAt: 1,
  lastActivity: 10,
  status: "idle",
} satisfies PeerPresence;

const WORKER_A = {
  id: "worker-session-aaaaaaaa",
  name: "worker",
  addressLabel: "worker",
  cwd: "/repo/worker-a",
  model: "openai/gpt-4.1",
  pid: 2,
  startedAt: 1,
  lastActivity: 10,
  status: "busy",
} satisfies PeerPresence;

const WORKER_B = {
  id: "worker-session-bbbbbbbb",
  name: "worker",
  addressLabel: "worker",
  cwd: "/repo/worker-b",
  model: "openai/gpt-4.1",
  pid: 3,
  startedAt: 1,
  lastActivity: 10,
  status: "idle",
} satisfies PeerPresence;

function createMessage(
  text: string,
  options: {
    id?: string;
    replyTo?: string;
    attachments?: PeerAttachment[];
    timestamp?: number;
  } = {},
): PeerMessage {
  return {
    id: options.id ?? `message-${text}`,
    timestamp: options.timestamp ?? 100,
    replyTo: options.replyTo,
    content: {
      text,
      attachments: options.attachments,
    },
  } satisfies PeerMessage;
}

class FakePeerMessagingRuntime implements PeerMessagingRuntime {
  readonly peers: PeerPresence[];
  readonly sendCalls: Array<{ to: string; message: PeerMessage }> = [];
  readonly askCalls: Array<{ to: string; message: PeerMessage; timeoutMs?: number }> = [];
  statusValue: PeerRuntimeStatus;
  sendResult: DeliveryResult = {
    delivered: true,
    messageId: "delivery-1",
  };
  askResult: PeerMessage = createMessage("All good.", { id: "reply-1", replyTo: "request-1" });

  constructor(peers: PeerPresence[]) {
    this.peers = peers;
    this.statusValue = {
      connected: true,
      selfId: peers[0]?.id,
      activePeerCount: peers.length,
    } satisfies PeerRuntimeStatus;
  }

  async listPeers(): Promise<PeerPresence[]> {
    return this.peers;
  }

  async send(request: { to: string; message: PeerMessage }): Promise<DeliveryResult> {
    this.sendCalls.push(request);
    return this.sendResult;
  }

  async ask(request: {
    to: string;
    message: PeerMessage;
    timeoutMs?: number;
  }): Promise<PeerMessage> {
    this.askCalls.push(request);
    return this.askResult;
  }

  async status(): Promise<PeerRuntimeStatus> {
    return this.statusValue;
  }
}

test("adapter delegates ask to the stable core and formats reply attachments", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  runtime.askResult = createMessage("Approved.", {
    id: "reply-22",
    replyTo: "request-22",
    attachments: [
      {
        type: "snippet",
        name: "review.ts",
        language: "typescript",
        content: "export const approved = true;",
      },
    ],
  });
  const adapter = createIntercomCompatibleAdapter({ now: () => 1_700_000_000_000 });

  const result = await adapter.execute(runtime, {
    action: "ask",
    to: "worker",
    message: "Should I ship this?",
    timeoutMs: 250,
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /\*\*Reply from worker:/);
  assert.match(result.content[0]?.text ?? "", /Approved\./);
  assert.match(result.content[0]?.text ?? "", /review\.ts/);
  assert.equal(runtime.askCalls.length, 1);
  assert.equal(runtime.askCalls[0]?.to, "worker");
  assert.equal(runtime.askCalls[0]?.message.content.text, "Should I ship this?");
  assert.equal(runtime.askCalls[0]?.timeoutMs, 250);
});

test("adapter surfaces duplicate-name ambiguity with exact session ids", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A, WORKER_B]);
  runtime.sendResult = {
    delivered: false,
    messageId: "delivery-ambiguous",
    reason: 'Multiple peers matched "worker". Use the exact session id instead.',
  } satisfies DeliveryResult;
  const adapter = createIntercomCompatibleAdapter();

  const result = await adapter.execute(runtime, {
    action: "send",
    to: "worker",
    message: "Need an answer.",
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Multiple peers matched "worker"/);
  assert.match(result.content[0]?.text ?? "", /worker \(worker-s\) → worker-session-aaaaaaaa/);
  assert.match(result.content[0]?.text ?? "", /worker \(worker-s\) → worker-session-bbbbbbbb/);
});

test("adapter tracks inbound messages for pending and reply compatibility", async () => {
  const received: IntercomIncomingMessage[] = [];
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter({
    now: () => 2_000,
    onIncomingMessage: (entry) => {
      received.push(entry);
    },
  });
  const inboundMessage = createMessage("Need your review.", { id: "ask-1", timestamp: 1_500 });

  adapter.handleIncomingMessage(WORKER_A, inboundMessage);

  assert.equal(received.length, 1);
  assert.match(received[0]?.replyCommand ?? "", /action: "reply"/);
  assert.match(received[0]?.replyCommand ?? "", /replyTo: "ask-1"/);

  const pending = await adapter.execute(runtime, { action: "pending" });
  assert.equal(pending.isError, undefined);
  assert.match(pending.content[0]?.text ?? "", /Pending inbound messages/);
  assert.match(pending.content[0]?.text ?? "", /Need your review\./);

  const reply = await adapter.execute(runtime, {
    action: "reply",
    message: "On it.",
  });

  assert.equal(reply.isError, undefined);
  assert.equal(runtime.sendCalls.length, 1);
  assert.equal(runtime.sendCalls[0]?.to, WORKER_A.id);
  assert.equal(runtime.sendCalls[0]?.message.replyTo, inboundMessage.id);
  assert.equal(runtime.sendCalls[0]?.message.content.text, "On it.");

  const pendingAfterReply = await adapter.execute(runtime, { action: "pending" });
  assert.equal(pendingAfterReply.isError, undefined);
  assert.match(pendingAfterReply.content[0]?.text ?? "", /No unresolved inbound messages/);
});

test("adapter lists current and other sessions without redefining the core", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter();

  const result = await adapter.execute(runtime, { action: "list" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /\*\*Current session:/);
  assert.match(result.content[0]?.text ?? "", /planner/);
  assert.match(result.content[0]?.text ?? "", /worker/);
  assert.match(result.content[0]?.text ?? "", /id: worker-session-aaaaaaaa/);
});

test("adapter classifies quest protocol messages by quest id", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter({ now: () => 2_000 });

  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("QUEST_ACK quest_id=quest-123: started", { id: "ack-1" }),
  );
  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("QUEST_FINAL quest_id=quest-123: done", { id: "final-1" }),
  );

  const result = await adapter.execute(runtime, { action: "quest_status", questId: "quest-123" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Quest quest-123: final_received/);
  assert.equal(result.details?.state, "final_received");
  assert.equal(result.details?.ackCount, 1);
  assert.equal(result.details?.finalCount, 1);
  assert.equal(result.details?.duplicateFinalCount, 0);
});

test("adapter classifies canonical peer protocol messages by peer run id", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter({ now: () => 2_000 });

  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("PEER_ACK peer_run_id=peer-123: started", { id: "peer-ack-1" }),
  );
  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("PEER_FINAL peer_run_id=peer-123: done", { id: "peer-final-1" }),
  );

  const result = await adapter.execute(runtime, { action: "peer_status", peerRunId: "peer-123" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Peer run peer-123: final_received/);
  assert.equal(result.details?.peerRunId, "peer-123");
  assert.equal(result.details?.questId, "peer-123");
  assert.equal(result.details?.state, "final_received");
  assert.equal(result.details?.ackCount, 1);
  assert.equal(result.details?.finalCount, 1);
});

test("adapter keeps peer protocol state after the inbound reply is resolved", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter({ now: () => 2_000 });
  const ack = createMessage("PEER_ACK peer_run_id=peer-ledger: started", { id: "peer-ledger-ack" });

  adapter.handleIncomingMessage(WORKER_A, ack);

  const reply = await adapter.execute(runtime, {
    action: "reply",
    replyTo: ack.id,
    message: "Ack seen.",
  });
  assert.equal(reply.isError, undefined);

  const pendingAfterReply = await adapter.execute(runtime, { action: "pending" });
  assert.match(pendingAfterReply.content[0]?.text ?? "", /No unresolved inbound messages/);

  const status = await adapter.execute(runtime, {
    action: "peer_status",
    peerRunId: "peer-ledger",
  });

  assert.equal(status.isError, undefined);
  assert.equal(status.details?.state, "ack_received");
  assert.equal(status.details?.ackCount, 1);
  assert.match(status.content[0]?.text ?? "", /PEER_ACK/);
});

test("adapter reports quest protocol duplicates and violations", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter({ now: () => 2_000 });

  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("QUEST_ACK quest_id=quest-dup: started", { id: "ack-1" }),
  );
  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("QUEST_ACK quest_id=quest-dup: duplicate", { id: "ack-2" }),
  );
  adapter.handleIncomingMessage(
    WORKER_A,
    createMessage("QUEST_NOTE quest_id=quest-dup: extra chatter", { id: "note-1" }),
  );

  const result = await adapter.execute(runtime, { action: "quest_status", questId: "quest-dup" });

  assert.equal(result.details?.state, "protocol_violation");
  assert.equal(result.details?.ackCount, 2);
  assert.equal(result.details?.duplicateAckCount, 1);
  assert.equal(result.details?.violationCount, 1);
});

test("adapter peer_watch waits for final while legacy quest_watch remains compatible", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter();

  const peerWatch = adapter.execute(runtime, {
    action: "peer_watch",
    peerRunId: "peer-watch",
    waitFor: "final",
    timeoutMs: 1_000,
  });

  setTimeout(() => {
    adapter.handleIncomingMessage(
      WORKER_A,
      createMessage("PEER_ACK peer_run_id=peer-watch: started", { id: "peer-ack-1" }),
    );
  }, 10);
  setTimeout(() => {
    adapter.handleIncomingMessage(
      WORKER_A,
      createMessage("PEER_FINAL peer_run_id=peer-watch: done", { id: "peer-final-1" }),
    );
  }, 20);

  const peerResult = await peerWatch;

  assert.equal(peerResult.isError, undefined);
  assert.equal(peerResult.details?.state, "final_received");
  assert.equal(peerResult.details?.timedOut, false);
  assert.match(peerResult.content[0]?.text ?? "", /Peer run peer-watch: final_received/);

  const legacyTimeout = await adapter.execute(runtime, {
    action: "quest_watch",
    questId: "missing-quest",
    waitFor: "ack",
    timeoutMs: 1,
  });

  assert.equal(legacyTimeout.isError, true);
  assert.equal(legacyTimeout.details?.state, "no_messages");
  assert.equal(legacyTimeout.details?.timedOut, true);
});

test("adapter quest_watch waits for final and times out when absent", async () => {
  const runtime = new FakePeerMessagingRuntime([SELF_PEER, WORKER_A]);
  const adapter = createIntercomCompatibleAdapter();

  const watch = adapter.execute(runtime, {
    action: "quest_watch",
    questId: "quest-watch",
    waitFor: "final",
    timeoutMs: 1_000,
  });

  setTimeout(() => {
    adapter.handleIncomingMessage(
      WORKER_A,
      createMessage("QUEST_ACK quest_id=quest-watch: started", { id: "ack-1" }),
    );
  }, 10);
  setTimeout(() => {
    adapter.handleIncomingMessage(
      WORKER_A,
      createMessage("QUEST_FINAL quest_id=quest-watch: done", { id: "final-1" }),
    );
  }, 20);

  const result = await watch;

  assert.equal(result.isError, undefined);
  assert.equal(result.details?.state, "final_received");
  assert.equal(result.details?.timedOut, false);

  const timeout = await adapter.execute(runtime, {
    action: "quest_watch",
    questId: "missing-quest",
    waitFor: "ack",
    timeoutMs: 1,
  });

  assert.equal(timeout.isError, true);
  assert.equal(timeout.details?.state, "no_messages");
  assert.equal(timeout.details?.timedOut, true);
});
