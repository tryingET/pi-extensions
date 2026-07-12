// ---
// summary: tests intercom extension registration, lifecycle concurrency, delegation, and inbound delivery
// read_when:
//   - changing the pi extension hooks, runtime factory, or registered intercom tool
// ---
import assert from "node:assert/strict";
import test from "node:test";

import {
  type IntercomExtensionAPI,
  type IntercomExtensionContext,
  type IntercomRegisteredTool,
  registerPeerMessagingIntercomExtension,
} from "../extensions/intercom.ts";
import type {
  DeliveryResult,
  ManagedPeerMessagingRuntime,
  PeerMessage,
  PeerPresence,
  PeerRuntimeStatus,
} from "../index.ts";

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

const WORKER_PEER = {
  id: "worker-session-abcdef12",
  name: "worker",
  addressLabel: "worker",
  cwd: "/repo/worker",
  model: "openai/gpt-4.1",
  pid: 2,
  startedAt: 1,
  lastActivity: 10,
  status: "busy",
} satisfies PeerPresence;

function createMessage(
  text: string,
  options: {
    id?: string;
    replyTo?: string;
    timestamp?: number;
  } = {},
): PeerMessage {
  return {
    id: options.id ?? `message-${text}`,
    timestamp: options.timestamp ?? 100,
    replyTo: options.replyTo,
    content: {
      text,
    },
  } satisfies PeerMessage;
}

class FakeManagedRuntime implements ManagedPeerMessagingRuntime {
  readonly sendCalls: Array<{ to: string; message: PeerMessage }> = [];
  readonly askCalls: Array<{ to: string; message: PeerMessage; timeoutMs?: number }> = [];
  readonly updatePresenceCalls: Array<Record<string, unknown>> = [];
  readonly peers: PeerPresence[] = [SELF_PEER, WORKER_PEER];
  readonly paths = {
    runtimeDir: "/tmp/pi-peer-messaging-test",
    socketPath: "/tmp/pi-peer-messaging-test/broker.sock",
    pidPath: "/tmp/pi-peer-messaging-test/broker.pid",
    spawnLockPath: "/tmp/pi-peer-messaging-test/broker.spawn.lock",
  };
  private listener: ((from: PeerPresence, message: PeerMessage) => void) | null = null;
  disconnected = false;

  async listPeers(): Promise<PeerPresence[]> {
    return this.peers;
  }

  async send(request: { to: string; message: PeerMessage }): Promise<DeliveryResult> {
    this.sendCalls.push(request);
    return {
      delivered: true,
      messageId: request.message.id,
    } satisfies DeliveryResult;
  }

  async ask(request: {
    to: string;
    message: PeerMessage;
    timeoutMs?: number;
  }): Promise<PeerMessage> {
    this.askCalls.push(request);
    return createMessage("Here is the answer.", {
      id: "reply-1",
      replyTo: request.message.id,
    });
  }

  async status(): Promise<PeerRuntimeStatus> {
    return {
      connected: true,
      selfId: SELF_PEER.id,
      activePeerCount: this.peers.length,
    } satisfies PeerRuntimeStatus;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  async updatePresence(updates: Record<string, unknown>): Promise<PeerPresence> {
    this.updatePresenceCalls.push(updates);
    return {
      ...SELF_PEER,
      name: (updates.name as string | undefined) ?? SELF_PEER.name,
      model: (updates.model as string | undefined) ?? SELF_PEER.model,
      lastActivity: (updates.lastActivity as number | undefined) ?? SELF_PEER.lastActivity,
    } satisfies PeerPresence;
  }

  getPaths() {
    return this.paths;
  }

  onMessage(listener: (from: PeerPresence, message: PeerMessage) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  emitMessage(from: PeerPresence, message: PeerMessage): void {
    this.listener?.(from, message);
  }
}

function createContext(): IntercomExtensionContext {
  return {
    cwd: "/repo/planner",
    model: { id: "openai/gpt-4.1" },
    sessionManager: {
      getCwd: () => "/repo/planner",
      getSessionId: () => "pi-session-1",
      getSessionName: () => "planner",
    },
  } satisfies IntercomExtensionContext;
}

function createHarness() {
  const runtime = new FakeManagedRuntime();
  const eventHandlers = new Map<
    string,
    (event: unknown, ctx?: IntercomExtensionContext) => unknown
  >();
  const tools = new Map<string, IntercomRegisteredTool>();
  const sentMessages: Array<{
    message: { customType?: string; content: string; display?: boolean; details?: unknown };
    options?: { triggerTurn?: boolean; deliverAs?: "followUp" };
  }> = [];

  const api: IntercomExtensionAPI = {
    on(event, handler) {
      eventHandlers.set(event, handler);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendMessage(message, options) {
      sentMessages.push({ message, options });
    },
  };

  registerPeerMessagingIntercomExtension(api, {
    runtimeFactory: async () => runtime,
    now: () => 1_700_000_000_000,
  });

  return { runtime, eventHandlers, tools, sentMessages };
}

test("extension registers lifecycle hooks and syncs presence on session start", async () => {
  const harness = createHarness();
  const sessionStart = harness.eventHandlers.get("session_start");
  assert.ok(sessionStart);

  await sessionStart?.({}, createContext());

  assert.ok(harness.tools.has("intercom"));
  assert.equal(harness.runtime.updatePresenceCalls.length, 1);
  assert.equal(harness.runtime.updatePresenceCalls[0]?.name, "planner");
  assert.equal(harness.runtime.updatePresenceCalls[0]?.model, "openai/gpt-4.1");
});

test("extension tool delegates send and ask to the adapter over the stable core", async () => {
  const harness = createHarness();
  const tool = harness.tools.get("intercom");
  assert.ok(tool);
  const ctx = createContext();

  const sendResult = await tool?.execute(
    "tool-send",
    {
      action: "send",
      to: "worker",
      message: "Please review the diff.",
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(sendResult?.isError, undefined);
  assert.equal(harness.runtime.sendCalls.length, 1);
  assert.equal(harness.runtime.sendCalls[0]?.to, "worker");
  assert.equal(harness.runtime.sendCalls[0]?.message.content.text, "Please review the diff.");

  const askResult = await tool?.execute(
    "tool-ask",
    {
      action: "ask",
      to: "worker",
      message: "What did you find?",
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(askResult?.isError, undefined);
  assert.equal(harness.runtime.askCalls.length, 1);
  assert.equal(harness.runtime.askCalls[0]?.to, "worker");
  assert.equal(harness.runtime.askCalls[0]?.message.content.text, "What did you find?");
  assert.match(askResult?.content[0]?.text ?? "", /Reply from worker/);
});

test("extension surfaces incoming messages with an exact reply hint", async () => {
  const harness = createHarness();
  const sessionStart = harness.eventHandlers.get("session_start");
  assert.ok(sessionStart);

  await sessionStart?.({}, createContext());
  harness.runtime.emitMessage(
    WORKER_PEER,
    createMessage("Need your decision.", {
      id: "ask-9",
      timestamp: 1_700_000_000_100,
    }),
  );

  assert.equal(harness.sentMessages.length, 1);
  assert.match(harness.sentMessages[0]?.message.content ?? "", /From worker \(worker-s\)/);
  assert.match(harness.sentMessages[0]?.message.content ?? "", /action: "reply"/);
  assert.match(harness.sentMessages[0]?.message.content ?? "", /replyTo: "ask-9"/);
  assert.equal(harness.sentMessages[0]?.options?.triggerTurn, true);
});

test("concurrent startup and tool execution share one deferred runtime initialization", async () => {
  const runtime = new FakeManagedRuntime();
  const eventHandlers = new Map<
    string,
    (event: unknown, ctx?: IntercomExtensionContext) => unknown
  >();
  const tools = new Map<string, IntercomRegisteredTool>();
  let resolveRuntime: ((runtime: ManagedPeerMessagingRuntime) => void) | undefined;
  const deferredRuntime = new Promise<ManagedPeerMessagingRuntime>((resolve) => {
    resolveRuntime = resolve;
  });
  let factoryCalls = 0;

  registerPeerMessagingIntercomExtension(
    {
      on: (event, handler) => eventHandlers.set(event, handler),
      registerTool: (tool) => tools.set(tool.name, tool),
      sendMessage: () => {},
    },
    {
      runtimeFactory: async () => {
        factoryCalls += 1;
        return deferredRuntime;
      },
    },
  );

  const ctx = createContext();
  const startup = eventHandlers.get("session_start")?.({}, ctx);
  const toolCall = tools
    .get("intercom")
    ?.execute("concurrent-list", { action: "list" }, undefined, undefined, ctx);
  await Promise.resolve();
  assert.equal(factoryCalls, 1);

  resolveRuntime?.(runtime);
  await Promise.all([startup, toolCall]);
  assert.equal(runtime.updatePresenceCalls.length, 2);
});

test("shutdown during deferred initialization disconnects the eventual runtime without leaking it", async () => {
  const runtime = new FakeManagedRuntime();
  const eventHandlers = new Map<
    string,
    (event: unknown, ctx?: IntercomExtensionContext) => unknown
  >();
  let resolveRuntime: ((runtime: ManagedPeerMessagingRuntime) => void) | undefined;
  const deferredRuntime = new Promise<ManagedPeerMessagingRuntime>((resolve) => {
    resolveRuntime = resolve;
  });

  registerPeerMessagingIntercomExtension(
    {
      on: (event, handler) => eventHandlers.set(event, handler),
      registerTool: () => {},
      sendMessage: () => {},
    },
    { runtimeFactory: async () => deferredRuntime },
  );

  const startup = eventHandlers.get("session_start")?.({}, createContext());
  await Promise.resolve();
  const shutdown = eventHandlers.get("session_shutdown")?.({}, createContext());
  resolveRuntime?.(runtime);

  await Promise.all([startup, shutdown]);
  assert.equal(runtime.disconnected, true);
});

test("extension clears runtime state on session shutdown", async () => {
  const harness = createHarness();
  const sessionShutdown = harness.eventHandlers.get("session_shutdown");
  assert.ok(sessionShutdown);

  await harness.eventHandlers.get("session_start")?.({}, createContext());
  await sessionShutdown?.({}, createContext());

  assert.equal(harness.runtime.disconnected, true);
});
