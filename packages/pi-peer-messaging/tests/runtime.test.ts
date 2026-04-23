import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPeerMessagingRuntime } from "../index.ts";
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

    await unnamed.disconnect();
    await planner.disconnect();
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
