// Test-only lifecycle signals. Deadlines detect a hung harness; elapsed time never proves success.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { createContext } from "./sidequest-harness.mjs";

export async function withDeadman(promise, label, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`test deadman: ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createObserverContext(options) {
  const context = createContext(options);
  const completion = Promise.withResolvers();
  const notify = context.ctx.ui.notify;
  context.ctx.ui.notify = (...args) => {
    notify(...args);
    completion.resolve();
  };
  return {
    ...context,
    observerSettled: (timeoutMs) =>
      withDeadman(completion.promise, "observer completion notification", timeoutMs),
  };
}

// Install before delivery, so a synchronous publication cannot be missed. Observe actual state
// writes, not a scheduler-sensitive polling budget. The caller still checks the state contents.
export async function afterStateChange(root, deliver, predicate) {
  const changed = Promise.withResolvers();
  const inspect = () => {
    try {
      if (predicate()) changed.resolve();
    } catch (error) {
      changed.reject(error);
    }
  };
  const watcher = watch(root, inspect);
  watcher.on("error", changed.reject);
  try {
    deliver();
    inspect();
    await withDeadman(changed.promise, "observer state publication");
  } finally {
    watcher.close();
  }
}

export function ownLaunchProcesses() {
  const children = [];
  return {
    children,
    spawnProcess(command, args, options) {
      assert.equal(options.detached, true);
      const child = spawn(command, args, options);
      const closed = new Promise((resolve) => child.once("close", resolve));
      children.push({ child, closed });
      return child;
    },
    async dispose() {
      for (const { child } of children) {
        // Kill only the exact ChildProcess we spawned, never a discovered/ambient PID.
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          child.ref();
          child.kill("SIGKILL");
        }
      }
      await withDeadman(Promise.all(children.map(({ closed }) => closed)), "owned child close");
    },
  };
}

export async function assertLaunchWhileAlive(result, child) {
  assert.equal(result.ok, true);
  assert.equal(result.effectDisposition, "settled");
  assert.ok(child?.pid, "launch must own a child");
  assert.equal(child.exitCode, null, "handshake must settle while the owned child is alive");
  assert.equal(child.signalCode, null, "owned child must not have exited on a signal");
  assert.equal(child.connected, true, "owned child must still accept a liveness challenge");
  const challenge = randomUUID();
  const reply = Promise.withResolvers();
  const onMessage = (message) => {
    if (message === challenge) reply.resolve();
  };
  const onExit = () => reply.reject(new Error("owned child exited before liveness reply"));
  child.on("message", onMessage);
  child.once("exit", onExit);
  try {
    child.send({ challenge }, (error) => {
      if (error) reply.reject(error);
    });
    await withDeadman(reply.promise, "owned child liveness reply");
  } finally {
    child.off("message", onMessage);
    child.off("exit", onExit);
  }
}
