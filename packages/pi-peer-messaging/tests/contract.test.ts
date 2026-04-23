import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPeerMessage,
  assertPeerPresence,
  createStubPeerMessagingRuntime,
  DEFAULT_ASK_TIMEOUT_MS,
  definePeerMessagingRuntime,
  PEER_ATTACHMENT_TYPES,
  PEER_MESSAGING_BOUNDARY,
  type PeerMessage,
  type PeerPresence,
} from "../index.ts";

const samplePresence = {
  id: "session-12345678",
  name: "planner",
  addressLabel: "planner",
  cwd: "/repo",
  model: "openai/gpt-4.1",
  pid: 4242,
  startedAt: 1_700_000_000_000,
  lastActivity: 1_700_000_010_000,
  status: "idle",
} satisfies PeerPresence;

const sampleMessage = {
  id: "message-123",
  timestamp: 1_700_000_010_000,
  content: {
    text: "Need a quick review?",
    attachments: [
      {
        type: "snippet",
        name: "review.ts",
        language: "typescript",
        content: "export function review() { return true; }",
      },
    ],
  },
} satisfies PeerMessage;

test("peer presence assertion accepts the decision-level stable shape", () => {
  assert.doesNotThrow(() => {
    assertPeerPresence(samplePresence);
  });
});

test("peer message assertion rejects attachment types outside the first stable contract", () => {
  assert.throws(() => {
    assertPeerMessage({
      ...sampleMessage,
      content: {
        text: sampleMessage.content.text,
        attachments: [
          {
            type: "image",
            name: "diagram.png",
            content: "<binary>",
          },
        ],
      },
    });
  }, /PeerAttachment.type/);
});

test("boundary metadata stays communication-only and adapter-neutral", () => {
  assert.deepEqual(PEER_ATTACHMENT_TYPES, ["file", "snippet", "context"]);
  assert.equal(DEFAULT_ASK_TIMEOUT_MS, 10 * 60 * 1000);
  assert.equal(PEER_MESSAGING_BOUNDARY.sameMachineOnly, true);
  assert.equal(PEER_MESSAGING_BOUNDARY.communicationOnly, true);
  assert.equal(PEER_MESSAGING_BOUNDARY.canonicalAuthority, false);
  assert.equal(PEER_MESSAGING_BOUNDARY.duplicateNameDelivery, "fail-closed");
  assert.equal(PEER_MESSAGING_BOUNDARY.askTimeoutBehavior, "bounded-default-applied");
  assert.equal(PEER_MESSAGING_BOUNDARY.oneInFlightAskPerSession, 1);
  assert.equal(PEER_MESSAGING_BOUNDARY.replyCorrelation, "explicit-replyTo");
  assert.equal(PEER_MESSAGING_BOUNDARY.runtimeFallbackAliasPersistence, "runtime-only");
  assert.equal(PEER_MESSAGING_BOUNDARY.runtimeFallbackAliasUse, "addressability-only");
  assert.deepEqual(PEER_MESSAGING_BOUNDARY.preferredAddressingOrder, [
    "session-id",
    "address-label",
  ]);
  assert.ok(PEER_MESSAGING_BOUNDARY.adapterSurface.includes("intercom"));
  assert.equal(Object.isFrozen(PEER_MESSAGING_BOUNDARY), true);
});

test("definePeerMessagingRuntime validates inputs and outputs around a compliant runtime", async () => {
  const runtime = definePeerMessagingRuntime({
    async listPeers() {
      return [samplePresence];
    },
    async send(request) {
      assert.equal(request.to, samplePresence.id);
      assert.equal(request.message.id, sampleMessage.id);
      return {
        delivered: true,
        messageId: request.message.id,
      };
    },
    async ask(request) {
      assert.equal(request.timeoutMs, DEFAULT_ASK_TIMEOUT_MS);
      return {
        id: "reply-1",
        timestamp: sampleMessage.timestamp + 1,
        replyTo: request.message.id,
        content: {
          text: "Yes — proceed.",
        },
      };
    },
    async status() {
      return {
        connected: true,
        selfId: samplePresence.id,
        activePeerCount: 2,
      };
    },
  });

  const peers = await runtime.listPeers();
  assert.deepEqual(peers, [samplePresence]);

  const delivery = await runtime.send({
    to: samplePresence.id,
    message: sampleMessage,
  });
  assert.deepEqual(delivery, {
    delivered: true,
    messageId: sampleMessage.id,
  });

  const reply = await runtime.ask({
    to: samplePresence.id,
    message: sampleMessage,
  });
  assert.equal(reply.replyTo, sampleMessage.id);

  const status = await runtime.status();
  assert.deepEqual(status, {
    connected: true,
    selfId: samplePresence.id,
    activePeerCount: 2,
  });
  assert.equal(Object.isFrozen(runtime), true);
});

test("createStubPeerMessagingRuntime exposes a disconnected status and clear not-implemented errors", async () => {
  const runtime = createStubPeerMessagingRuntime();

  await assert.rejects(runtime.listPeers(), /stable contract/);
  await assert.rejects(
    runtime.send({
      to: samplePresence.id,
      message: sampleMessage,
    }),
    /stable contract/,
  );
  await assert.rejects(
    runtime.ask({
      to: samplePresence.id,
      message: sampleMessage,
      timeoutMs: DEFAULT_ASK_TIMEOUT_MS,
    }),
    /stable contract/,
  );
  await assert.doesNotReject(runtime.status());
  assert.deepEqual(await runtime.status(), {
    connected: false,
    activePeerCount: 0,
  });
});
