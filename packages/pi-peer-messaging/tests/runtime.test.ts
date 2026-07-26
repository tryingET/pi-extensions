// ---
// summary: integration-tests broker startup, reconnection, addressing, delivery, presence, and ask failure modes
// read_when:
//   - changing managed runtime behavior or broker-backed messaging semantics
// ---
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPeerMessagingRuntime,
  type ManagedPeerMessagingRuntime,
  type PeerMessage,
  type PeerPresence,
} from "../index.ts";
import { PeerMessagingBroker } from "../src/broker.ts";
import { PeerMessagingClient } from "../src/client.ts";
import { resolvePeerMessagingPaths } from "../src/paths.ts";

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Timed out waiting for predicate.");
}

async function waitForBrokerShutdown(runtimeDir: string): Promise<void> {
  const paths = resolvePeerMessagingPaths({ runtimeDir });
  await waitFor(() => !fs.existsSync(paths.pidPath), 3_000);
}

function requireClientSocket(client: PeerMessagingClient): Socket {
  const socket = (client as unknown as { socket: Socket | null }).socket;
  assert.ok(socket);
  return socket;
}

function createMessage(text: string, options: { id?: string; replyTo?: string } = {}): PeerMessage {
  return {
    id: options.id ?? randomUUID(),
    timestamp: Date.now(),
    replyTo: options.replyTo,
    content: {
      text,
    },
  };
}

function waitForNextMessage(runtime: ManagedPeerMessagingRuntime): Promise<{
  from: PeerPresence;
  message: PeerMessage;
}> {
  return new Promise((resolve) => {
    const unsubscribe = runtime.onMessage((from, message) => {
      unsubscribe();
      resolve({ from, message });
    });
  });
}

async function disconnectAll(runtimes: ManagedPeerMessagingRuntime[]): Promise<void> {
  for (const runtime of runtimes.reverse()) {
    try {
      await runtime.disconnect();
    } catch {
      // Best-effort cleanup for tests.
    }
  }
}

test("createPeerMessagingRuntime auto-spawns the broker and exposes self presence", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-runtime-"));

  try {
    const runtime = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const status = await runtime.status();
    assert.equal(status.connected, true);
    assert.ok(status.selfId);

    const peers = await runtime.listPeers();
    assert.equal(peers.length, 1);
    assert.equal(peers[0]?.id, status.selfId);
    assert.equal(peers[0]?.name, "planner");
    assert.equal(peers[0]?.addressLabel, "planner");

    await runtime.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("registered clients retain transport error handling through close and reconnect", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-reset-"));
  const broker = new PeerMessagingBroker({
    runtimeDir,
    idleShutdownMs: 60_000,
  });
  const client = new PeerMessagingClient({ runtimeDir });
  const clientErrors: Error[] = [];

  client.on("error", (error: Error) => {
    clientErrors.push(error);
  });

  const registration = {
    name: "planner",
    cwd: "/repo/planner",
    model: "openai/gpt-4.1",
    pid: process.pid,
    startedAt: Date.now(),
  };

  try {
    await broker.start();
    const initialPresence = await client.connect(registration);
    const initialSocket = requireClientSocket(client);
    assert.ok(initialSocket.listenerCount("error") > 0);

    const disconnected = new Promise<Error>((resolve) => {
      client.once("disconnected", resolve);
    });
    const resetError = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });

    assert.doesNotThrow(() => {
      initialSocket.emit("error", resetError);
    });
    initialSocket.destroy();

    assert.equal(await disconnected, resetError);
    assert.deepEqual(clientErrors, [resetError]);
    assert.equal(initialSocket.listenerCount("error"), 0);
    assert.equal(client.isConnected(), false);
    assert.equal(client.sessionId, null);
    assert.equal(client.selfPresence, null);

    const reconnectedPresence = await client.connect(registration);
    assert.notEqual(reconnectedPresence.id, initialPresence.id);
    assert.equal(client.isConnected(), true);

    const reconnectedSocket = requireClientSocket(client);
    assert.ok(reconnectedSocket.listenerCount("error") > 0);
    await client.disconnect();
    assert.equal(reconnectedSocket.listenerCount("error"), 0);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // Best-effort cleanup for tests.
    }
    try {
      await broker.stop();
    } catch {
      // Best-effort cleanup for tests.
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("runtime can reuse a stable requested session id across reconnects", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-runtime-"));

  try {
    const runtime = await createPeerMessagingRuntime({
      id: "session-stable-controller",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const firstStatus = await runtime.status();
    assert.equal(firstStatus.selfId, "session-stable-controller");

    const firstPeers = await runtime.listPeers();
    assert.equal(firstPeers[0]?.id, "session-stable-controller");

    await runtime.disconnect();

    const reconnectedStatus = await runtime.status();
    assert.equal(reconnectedStatus.selfId, "session-stable-controller");

    await disconnectAll([runtime]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("unnamed sessions keep a runtime-only fallback alias until presence is updated", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-fallback-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const unnamed = await createPeerMessagingRuntime({
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
      status: "idle",
    });

    const beforeRename = await planner.listPeers();
    const unnamedPeer = beforeRename.find((peer) => peer.cwd === "/repo/worker");
    assert.ok(unnamedPeer);
    assert.equal(unnamedPeer?.name, undefined);
    assert.match(unnamedPeer?.addressLabel ?? "", /^peer-session-/);

    const updatedPresence = await unnamed.updatePresence({
      name: "worker",
      status: "busy",
    });
    assert.equal(updatedPresence.name, "worker");
    assert.equal(updatedPresence.addressLabel, "worker");
    assert.equal(updatedPresence.status, "busy");

    const afterRename = await planner.listPeers();
    const workerPeer = afterRename.find((peer) => peer.cwd === "/repo/worker");
    assert.equal(workerPeer?.name, "worker");
    assert.equal(workerPeer?.addressLabel, "worker");
    assert.equal(workerPeer?.status, "busy");

    await disconnectAll([planner, unnamed]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("runtime operations reconnect after the broker is terminated", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-reconnect-"));
  const paths = resolvePeerMessagingPaths({ runtimeDir });

  try {
    const runtime = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const initialStatus = await runtime.status();
    const initialPid = Number.parseInt(fs.readFileSync(paths.pidPath, "utf8").trim(), 10);
    process.kill(initialPid, "SIGTERM");
    await waitFor(() => !fs.existsSync(paths.pidPath), 3_000);

    const peers = await runtime.listPeers();
    const status = await runtime.status();

    assert.equal(status.connected, true);
    assert.ok(status.selfId);
    assert.equal(peers.length, 1);
    assert.notEqual(status.selfId, initialStatus.selfId);

    await runtime.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("updatePresence also reconnects after the broker is terminated", async () => {
  const runtimeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pi-peer-messaging-reconnect-presence-"),
  );
  const paths = resolvePeerMessagingPaths({ runtimeDir });

  try {
    const runtime = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
      status: "idle",
    });

    const initialPid = Number.parseInt(fs.readFileSync(paths.pidPath, "utf8").trim(), 10);
    process.kill(initialPid, "SIGTERM");
    await waitFor(() => !fs.existsSync(paths.pidPath), 3_000);

    const updated = await runtime.updatePresence({ status: "busy" });
    assert.equal(updated.status, "busy");

    const peers = await runtime.listPeers();
    assert.equal(peers.length, 1);
    assert.equal(peers[0]?.status, "busy");

    await runtime.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("send fails closed for duplicate names while exact session id targeting still works", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-duplicate-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const workerA = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker-a",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const workerB = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker-b",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const ambiguousDelivery = await planner.send({
      to: "worker",
      message: createMessage("ambiguous"),
    });
    assert.equal(ambiguousDelivery.delivered, false);
    assert.match(ambiguousDelivery.reason ?? "", /Multiple peers matched/);

    await assert.rejects(
      planner.ask({
        to: "worker",
        message: createMessage("ambiguous ask"),
        timeoutMs: 200,
      }),
      /Multiple peers matched/,
    );

    const receivedByWorkerA = waitForNextMessage(workerA);
    const peers = await planner.listPeers();
    const workerAPeer = peers.find((peer) => peer.cwd === "/repo/worker-a");
    assert.ok(workerAPeer);
    if (!workerAPeer) {
      throw new Error("expected a peer for /repo/worker-a");
    }

    const exactDelivery = await planner.send({
      to: workerAPeer.id,
      message: createMessage("exact target"),
    });
    assert.equal(exactDelivery.delivered, true);

    const inbound = await receivedByWorkerA;
    assert.equal(inbound.message.content.text, "exact target");
    assert.equal(inbound.from.name, "planner");

    await disconnectAll([planner, workerA, workerB]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask resolves from an explicit correlated reply", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-ask-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const unsubscribe = worker.onMessage((from, message) => {
      void worker.send({
        to: from.id,
        message: createMessage("All good.", { replyTo: message.id }),
      });
    });

    const request = createMessage("Need a review.");
    const reply = await planner.ask({
      to: "worker",
      message: request,
      timeoutMs: 1_000,
    });

    unsubscribe();
    assert.equal(reply.replyTo, request.id);
    assert.equal(reply.content.text, "All good.");

    await disconnectAll([planner, worker]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask times out when no correlated reply arrives", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-ask-timeout-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    await assert.rejects(
      planner.ask({
        to: "worker",
        message: createMessage("Need an answer."),
        timeoutMs: 150,
      }),
      /No reply from "worker" within 150ms/,
    );

    await disconnectAll([planner, worker]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("only one in-flight ask is allowed per local session", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-ask-guard-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const firstDelivered = waitForNextMessage(worker);
    const firstAsk = planner.ask({
      to: "worker",
      message: createMessage("First question"),
      timeoutMs: 200,
    });

    await firstDelivered;
    await assert.rejects(
      planner.ask({
        to: "worker",
        message: createMessage("Second question"),
        timeoutMs: 200,
      }),
      /Already waiting for a reply/,
    );
    await assert.rejects(firstAsk, /No reply from "worker" within 200ms/);

    await disconnectAll([planner, worker]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask rejects when the target disconnects before replying", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-ask-disconnect-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const unsubscribe = worker.onMessage(() => {
      unsubscribe();
      void worker.disconnect();
    });

    await assert.rejects(
      planner.ask({
        to: "worker",
        message: createMessage("Will you reply?"),
        timeoutMs: 1_000,
      }),
      /disconnected before replying|disconnected while waiting for reply/i,
    );

    await planner.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask rejects when the caller disconnects before a reply arrives", async () => {
  const runtimeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pi-peer-messaging-ask-local-disconnect-"),
  );

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const deliveredToWorker = waitForNextMessage(worker);
    const askPromise = planner.ask({
      to: "worker",
      message: createMessage("Will I disconnect?"),
      timeoutMs: 1_000,
    });
    const askOutcome = assert.rejects(
      askPromise,
      /PeerMessagingRuntime disconnected while waiting for reply/i,
    );

    await deliveredToWorker;
    await planner.disconnect();
    await askOutcome;

    await worker.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask fails closed when a matching replyTo arrives from the wrong peer", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-peer-messaging-ask-ambiguous-"));

  try {
    const planner = await createPeerMessagingRuntime({
      name: "planner",
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const worker = await createPeerMessagingRuntime({
      name: "worker",
      cwd: "/repo/worker",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    const intruder = await createPeerMessagingRuntime({
      name: "intruder",
      cwd: "/repo/intruder",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });

    const plannerStatus = await planner.status();
    assert.ok(plannerStatus.selfId);
    if (!plannerStatus.selfId) {
      throw new Error("expected planner selfId to be available");
    }
    const deliveredToWorker = waitForNextMessage(worker);
    const request = createMessage("Need the real worker.");
    const askPromise = planner.ask({
      to: "worker",
      message: request,
      timeoutMs: 1_000,
    });
    const askOutcome = assert.rejects(
      askPromise,
      /Received ambiguous reply for ask .* from unexpected peer/,
    );

    await deliveredToWorker;
    await intruder.send({
      to: plannerStatus.selfId,
      message: createMessage("Fake reply", { replyTo: request.id }),
    });

    await askOutcome;

    await disconnectAll([planner, worker, intruder]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});
