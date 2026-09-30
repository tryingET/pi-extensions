// ---
// summary: connection-lifecycle races of the managed runtime: work started before disconnect(), retries on a still-open connection, and connects interrupted by disconnect() (AK6242)
// read_when:
//   - changing how the runtime connects, retries, re-registers or disconnects
// ---
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPeerMessagingRuntime } from "../index.ts";
import { createMessage, delay, disconnectAll, holdsThroughout, withPeers } from "./peer-harness.ts";

function brokerPid(runtime: { getPaths(): { pidPath: string } }): number {
  return Number.parseInt(fs.readFileSync(runtime.getPaths().pidPath, "utf8").trim(), 10);
}

test("an operation started before disconnect() never registers the session again after it", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    // Both calls start in the same tick: the send is already under way when disconnect() runs.
    const pending = planner.send({ to: "worker", message: createMessage("late") });
    await planner.disconnect();
    const result = await pending;
    assert.equal(result.delivered, false);
    await holdsThroughout(
      async () => !(await worker.listPeers()).some((presence) => presence.name === "planner"),
      "planner registered again after disconnect()",
    );
  });
});

test("a retry on a connection that is still open re-registers in place, leaving no ghost", async () => {
  await withPeers(["planner", "worker"], async (peer) => {
    const planner = peer("planner");
    const worker = peer("worker");
    const plannerId = (await planner.status()).selfId;
    const pid = brokerPid(planner);
    // A paused broker lets planner's listing time out (3 s) while its socket stays open, which is
    // the recoverable error that triggers a retry.
    process.kill(pid, "SIGSTOP");
    try {
      const listing = planner.listPeers();
      await delay(3_500);
      process.kill(pid, "SIGCONT");
      await listing;
    } finally {
      process.kill(pid, "SIGCONT");
    }
    const planners = (await worker.listPeers()).filter((presence) => presence.name === "planner");
    assert.equal(planners.length, 1, "one registration, not the old one plus a new one");
    assert.equal(planners[0]?.id, plannerId, "the same session id, replaced in place");
    const status = await planner.status();
    assert.equal(status.connected, true);
    assert.equal(status.selfId, plannerId);
  });
});

test("status() after a retry reports the connection that answered", async () => {
  await withPeers(["planner"], async (peer) => {
    const planner = peer("planner");
    // Killed in the same tick as the call: status() still sees the old connection as open when it
    // starts, and its listing fails over to a new broker.
    process.kill(brokerPid(planner), "SIGKILL");
    const status = await planner.status();
    assert.equal(status.connected, true, "not the dead connection it started with");
    const peers = await planner.listPeers();
    assert.equal(peers.find((presence) => presence.id === status.selfId)?.name, "planner");
  });
});

// The eviction needs the interrupted connect's register to reach the broker after the next one's,
// which cannot be forced from outside; this guards the ordering that prevents it (disconnect() waits
// for the interrupted connect, and the next connect waits for disconnect()).
test("a connect interrupted by disconnect() cannot evict the next connection under the same id", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  const runtimes: Awaited<ReturnType<typeof createPeerMessagingRuntime>>[] = [];
  try {
    // Created inside the try, so a failure here still disconnects what exists.
    const runtime = await createPeerMessagingRuntime({
      id: "session-stable-evict",
      name: "stable",
      cwd: "/repo/stable",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    runtimes.push(runtime);
    const observer = await createPeerMessagingRuntime({
      name: "observer",
      cwd: "/repo/observer",
      model: "openai/gpt-4.1",
      runtimeDir,
      idleShutdownMs: 250,
    });
    runtimes.push(observer);
    for (let round = 0; round < 8; round += 1) {
      await runtime.disconnect();
      // A connect starts, is interrupted by disconnect(), and the next operation connects again.
      let settled = false;
      const interrupted = runtime
        .status()
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      await runtime.disconnect();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, true, "disconnect() returned while the connect it interrupted went on");
      const current = await runtime.status();
      await interrupted;
      assert.equal(current.selfId, "session-stable-evict");
      await holdsThroughout(
        async () =>
          (await observer.listPeers()).some((presence) => presence.id === "session-stable-evict"),
        `round ${round}: the new connection was evicted by the interrupted one`,
        300,
      );
    }
  } finally {
    await disconnectAll(runtimes);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});
