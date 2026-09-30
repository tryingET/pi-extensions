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
  isPeerAskNoReply,
  type ManagedPeerMessagingRuntime,
  type PeerMessage,
  type PeerPresence,
  peerAskOutcome,
} from "../index.ts";
import { PeerMessagingBroker } from "../src/broker.ts";
import { PeerMessagingClient } from "../src/client.ts";
import { resolvePeerMessagingPaths } from "../src/paths.ts";

// Compact mkdtemp prefixes keep real broker.sock paths within Linux sun_path
// under managed-job TMPDIR; each test still owns a distinct private directory.

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

// Creates named peers on a private broker and always disconnects them, even when an assertion fails,
// so a failure reports instead of hanging on open sockets.
async function withPeers<T>(
  names: string[],
  fn: (peer: (name: string) => ManagedPeerMessagingRuntime) => Promise<T>,
): Promise<T> {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  const peers: ManagedPeerMessagingRuntime[] = [];
  try {
    for (const name of names) {
      peers.push(
        await createPeerMessagingRuntime({
          name,
          cwd: `/repo/${name}`,
          model: "openai/gpt-4.1",
          runtimeDir,
          idleShutdownMs: 250,
        }),
      );
    }
    return await fn((name) => {
      const found = peers[names.indexOf(name)];
      assert.ok(found, `no peer named ${name}`);
      return found;
    });
  } finally {
    await disconnectAll([...peers]);
    await waitForBrokerShutdown(runtimeDir).catch(() => {});
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Asserts that `check` holds on every poll across `ms`: a fixed sleep could pass before the broker acts.
async function holdsThroughout(check: () => Promise<boolean>, message: string, ms = 600) {
  const deadline = Date.now() + ms;
  do {
    assert.ok(await check(), message);
    await delay(50);
  } while (Date.now() < deadline);
}

function replyToEverything(peer: ManagedPeerMessagingRuntime, received: PeerMessage[] = []) {
  return peer.onMessage((from, message) => {
    received.push(message);
    void peer.send({
      to: from.id,
      message: createMessage(`Re: ${message.content.text}`, { replyTo: message.id }),
    });
  });
}

test("createPeerMessagingRuntime auto-spawns the broker and exposes self presence", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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

    const question = createMessage("Need an answer.");
    await assert.rejects(
      planner.ask({
        to: "worker",
        message: question,
        timeoutMs: 1_000,
      }),
      (error: unknown) => {
        assert.ok(isPeerAskNoReply(error));
        assert.equal(error.reason, "timeout");
        assert.equal(error.messageId, question.id);
        assert.match(error.message, /No reply from "worker" within 1000ms/);
        return true;
      },
    );

    await disconnectAll([planner, worker]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("only one in-flight ask is allowed per local session", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
      timeoutMs: 1_000,
    });

    await firstDelivered;
    await assert.rejects(
      planner.ask({
        to: "worker",
        message: createMessage("Second question"),
        timeoutMs: 1_000,
      }),
      /Already waiting for a reply/,
    );
    await assert.rejects(firstAsk, /No reply from "worker" within 1000ms/);

    await disconnectAll([planner, worker]);
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("an ask that fails before sending releases the in-flight slot", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    replyToEverything(worker);

    await assert.rejects(
      planner.ask({ to: "nobody", message: createMessage("Anyone?"), timeoutMs: 1_000 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(peerAskOutcome(error), null, "an unresolved target is a send failure");
        return true;
      },
    );
    const question = createMessage("Still there?");
    const reply = await planner.ask({ to: "worker", message: question, timeoutMs: 1_000 });
    assert.equal(reply.replyTo, question.id);
  });
});

test("a timer that fires before the delivery ack rejects without an unhandled rejection", async () => {
  // Found in review: the rejection used to land before anything awaited it, crashing the process.
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await withPeers(["planner", "worker"], async (peer) => {
      const planner = peer("planner");
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await assert.rejects(
          planner.ask({ to: "worker", message: createMessage(`Quick ${attempt}`), timeoutMs: 1 }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            // Before the ack it is a send failure; after it, a typed no-reply. Never anything else.
            if (peerAskOutcome(error) !== "no_reply") {
              assert.match(error.message, /was not confirmed delivered within 1ms/);
            }
            return true;
          },
        );
      }
      await delay(100);
    });
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test("disconnect before the question is sent ends the ask and never re-registers the session", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    const askPromise = planner.ask({
      to: "worker",
      message: createMessage("Too late"),
      timeoutMs: 5_000,
    });
    const askOutcome = assert.rejects(askPromise, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(peerAskOutcome(error), null, "never delivered, so not a no-reply");
      assert.match(
        error.message,
        /PeerMessagingRuntime disconnected before the message to "worker" was delivered/,
      );
      return true;
    });
    await planner.disconnect();
    await askOutcome;

    await holdsThroughout(
      async () => !(await worker.listPeers()).some((peer) => peer.name === "planner"),
      "planner re-registered after disconnect",
    );
  });
});

test("aborting an ask cancels it and frees the slot", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    const controller = new AbortController();
    const firstDelivered = waitForNextMessage(worker);
    const cancelled = planner.ask({
      to: "worker",
      message: createMessage("Never mind"),
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    await firstDelivered;
    controller.abort();
    await assert.rejects(cancelled, (error: unknown) => {
      assert.equal(peerAskOutcome(error), "cancelled");
      return true;
    });

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await assert.rejects(
      planner.ask({ to: "worker", message: createMessage("No"), signal: alreadyAborted.signal }),
      (error: unknown) => peerAskOutcome(error) === "cancelled",
    );

    const halfSignal = { aborted: false, addEventListener() {} } as unknown as AbortSignal;
    await assert.rejects(
      planner.ask({ to: "worker", message: createMessage("Odd"), signal: halfSignal }),
      /must be an AbortSignal/,
    );

    replyToEverything(worker);
    const question = createMessage("Now?");
    const reply = await planner.ask({ to: "worker", message: question, timeoutMs: 1_000 });
    assert.equal(reply.replyTo, question.id);
  });
});

test("a timeout beyond the timer limit waits instead of expiring at once", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const controller = new AbortController();
    let settled = false;
    const pending = planner
      .ask({
        to: "worker",
        message: createMessage("Take your time"),
        timeoutMs: 1e10,
        signal: controller.signal,
      })
      .finally(() => {
        settled = true;
      });
    await delay(200);
    assert.equal(settled, false);
    controller.abort();
    await assert.rejects(pending, (error: unknown) => peerAskOutcome(error) === "cancelled");
  });
});

test("a session that re-registers under the same id stays visible to peers", async () => {
  // Found in review: the replaced socket's close removed the new registration, so replies could
  // no longer be routed to a session that reconnected.
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  const runtimes: ManagedPeerMessagingRuntime[] = [];
  try {
    const options = {
      cwd: "/repo/planner",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    };
    runtimes.push(await createPeerMessagingRuntime({ ...options, name: "observer" }));
    runtimes.push(
      await createPeerMessagingRuntime({ ...options, name: "planner", id: "fixed-session" }),
    );
    runtimes.push(
      await createPeerMessagingRuntime({ ...options, name: "planner", id: "fixed-session" }),
    );
    const [observer] = runtimes;
    assert.ok(observer);
    // The broker prefixes requested ids with "session-".
    await holdsThroughout(
      async () => (await observer.listPeers()).some((peer) => peer.id === "session-fixed-session"),
      "re-registered session vanished",
    );
  } finally {
    await disconnectAll(runtimes);
    await waitForBrokerShutdown(runtimeDir).catch(() => {});
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("parallel asks cannot displace the in-flight ask: extras fail fast, the first gets its reply", async () => {
  // AK5928: one agent turn issued three asks in the same tick. All passed the in-flight guard before
  // any registered its reply slot, each overwrote the last, and two asks never settled.
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    const received: PeerMessage[] = [];
    replyToEverything(worker, received);

    const questions = ["First", "Second", "Third"].map((text) => createMessage(text));
    let bound: ReturnType<typeof setTimeout> | undefined;
    const outcomes = await Promise.race([
      Promise.allSettled(
        questions.map((message) => planner.ask({ to: "worker", message, timeoutMs: 2_000 })),
      ),
      new Promise<never>((_, reject) => {
        bound = setTimeout(() => reject(new Error("an ask never settled")), 5_000);
      }),
    ]).finally(() => clearTimeout(bound));

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["fulfilled", "rejected", "rejected"],
    );
    const [first, ...refused] = outcomes;
    assert.equal(first?.status === "fulfilled" && first.value.replyTo, questions[0]?.id);
    for (const outcome of refused) {
      const reason = outcome.status === "rejected" ? outcome.reason : undefined;
      assert.equal(peerAskOutcome(reason), "ask_in_flight");
      assert.match((reason as Error).message, /Already waiting for a reply/);
    }

    // Refused asks never reach the peer; only the admitted question was sent.
    await delay(100);
    assert.deepEqual(
      received.map((message) => message.id),
      [questions[0]?.id],
    );
  });
});

test("ask rejects when the target disconnects before replying", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
      (error: unknown) => {
        assert.ok(isPeerAskNoReply(error));
        assert.equal(error.reason, "peer_disconnected");
        assert.match(
          error.message,
          /disconnected before replying|disconnected while waiting for reply/i,
        );
        return true;
      },
    );

    await planner.disconnect();
    await waitForBrokerShutdown(runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("ask rejects when the caller disconnects before a reply arrives", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
    // Whether the broker's ack reached the planner first is timing; both outcomes are correct and typed.
    const askOutcome = assert.rejects(askPromise, (error: unknown) => {
      assert.ok(error instanceof Error);
      if (isPeerAskNoReply(error)) {
        assert.equal(error.reason, "runtime_disconnected");
        assert.match(error.message, /PeerMessagingRuntime disconnected while waiting for reply/);
      } else {
        assert.match(
          error.message,
          /PeerMessagingRuntime disconnected before the message to "worker" was delivered/,
        );
      }
      return true;
    });

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
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));

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
