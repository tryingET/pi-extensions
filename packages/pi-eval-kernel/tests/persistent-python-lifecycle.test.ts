import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CapabilityRegistry } from "../src/capability-registry.ts";
import { KernelManager } from "../src/kernel-manager.ts";
import { PersistentPythonKernelClient } from "../src/persistent-python-client.ts";
import type { CapabilityEffect, KernelRunRequest, KernelRunResult } from "../src/types.ts";

const effects = new Set<CapabilityEffect>(["read"]);
const pythonAvailable =
  process.platform !== "win32" && spawnSync("python3", ["--version"]).status === 0;

function request(code: string, timeoutMs = 5_000): KernelRunRequest {
  return {
    code,
    cwd: process.cwd(),
    timeoutMs,
    outputLimitBytes: 50 * 1024,
    allowedEffects: effects,
  };
}

function blockingRegistry(name: string): {
  registry: CapabilityRegistry;
  started: Promise<void>;
} {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const registry = new CapabilityRegistry([
    {
      name,
      description: "Hold an eval until lifecycle cancellation reaches the host capability.",
      effect: "read",
      execute(_input, context) {
        markStarted();
        return new Promise<never>((_resolve, reject) => {
          const onAbort = () => reject(new Error("lifecycle test capability aborted"));
          if (context.signal?.aborted) {
            onAbort();
            return;
          }
          context.signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    },
  ]);
  return { registry, started };
}

function observe(promise: Promise<KernelRunResult>): {
  state: { settled: boolean; result?: KernelRunResult; error?: unknown };
  done: Promise<void>;
} {
  const state: { settled: boolean; result?: KernelRunResult; error?: unknown } = {
    settled: false,
  };
  const done = promise.then(
    (result) => {
      state.settled = true;
      state.result = result;
    },
    (error: unknown) => {
      state.settled = true;
      state.error = error;
    },
  );
  return { state, done };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${description}.`);
}

function requireWorkerPid(client: PersistentPythonKernelClient): number {
  const pid = client.workerPid();
  assert.ok(pid && pid > 0, `expected a live broker pid, got ${pid}`);
  return pid;
}

test(
  "active reset waits for the captured run and exact broker retirement",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const { registry, started } = blockingRegistry("active_reset_probe");
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    const active = observe(client.run(request("tool.active_reset_probe()", 10_000)));
    await started;
    const retiredPid = requireWorkerPid(client);

    await client.reset();
    assert.equal(active.state.settled, true);
    await active.done;
    assert.match(String(active.state.error), /reset/);
    assert.equal(client.workerPid(), undefined);
    assert.equal(processIsAlive(retiredPid), false);

    const fresh = await client.run(request("41 + 1"));
    assert.equal(fresh.value, 42);
    assert.equal(fresh.kernelReused, false);
    assert.notEqual(client.workerPid(), retiredPid);
  },
);

test(
  "active close drains the captured run, retires its broker, and stays closed",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const { registry, started } = blockingRegistry("active_close_probe");
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());
    const active = observe(client.run(request("tool.active_close_probe()", 10_000)));
    await started;
    const retiredPid = requireWorkerPid(client);

    const queued = observe(client.run(request('"must-not-run"')));
    await client.close();
    assert.equal(active.state.settled, true);
    assert.equal(queued.state.settled, true);
    await Promise.all([active.done, queued.done]);
    assert.match(String(active.state.error), /closed/);
    assert.match(String(queued.state.error), /closed/);
    assert.equal(client.workerPid(), undefined);
    assert.equal(processIsAlive(retiredPid), false);
    await assert.rejects(client.run(request("1")), /closed/);
  },
);

test(
  "reset waits for its captured queue tail to reject every prior queued eval",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const { registry, started } = blockingRegistry("queue_drain_probe");
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    const active = observe(client.run(request("tool.queue_drain_probe()", 10_000)));
    await started;
    const queuedOne = observe(client.run(request('state["must_not_run"] = 1')));
    const queuedTwo = observe(client.run(request('state["must_not_run"] = 2')));

    await client.reset();
    assert.equal(active.state.settled, true);
    assert.equal(queuedOne.state.settled, true);
    assert.equal(queuedTwo.state.settled, true);
    await Promise.all([active.done, queuedOne.done, queuedTwo.done]);
    assert.match(String(queuedOne.state.error), /invalidated/);
    assert.match(String(queuedTwo.state.error), /invalidated/);

    const fresh = await client.run(request('state.get("must_not_run")'));
    assert.equal(fresh.value, null);
    assert.equal(fresh.kernelReused, false);
  },
);

test(
  "fatal protocol failure retires the active broker before a fresh respawn",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    await client.run(request('state["old"] = True'));
    const retiredPid = requireWorkerPid(client);
    await assert.rejects(
      client.run(
        request('import os, time\nos.write(1, b"outside-protocol\\n")\ntime.sleep(60)', 10_000),
      ),
      /protocol|exited/,
    );

    const fresh = await client.run(request('state.get("old")'));
    assert.equal(processIsAlive(retiredPid), false);
    assert.notEqual(client.workerPid(), retiredPid);
    assert.equal(fresh.value, null);
    assert.equal(fresh.kernelReused, false);
  },
);

test(
  "a second reset during retirement cannot spawn a stale generation",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const { registry, started } = blockingRegistry("stale_generation_probe");
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    const active = observe(client.run(request("tool.stale_generation_probe()", 10_000)));
    await started;
    const retiredPid = requireWorkerPid(client);
    const firstReset = client.reset();
    const stale = observe(client.run(request('"stale"')));
    const secondReset = client.reset();

    await Promise.all([firstReset, secondReset]);
    await Promise.all([active.done, stale.done]);
    assert.match(String(stale.state.error), /invalidated/);
    assert.equal(client.workerPid(), undefined);
    assert.equal(processIsAlive(retiredPid), false);

    const fresh = await client.run(request('"fresh"'));
    assert.equal(fresh.value, "fresh");
    assert.equal(fresh.kernelReused, false);
  },
);

test(
  "idle fatal transport output detaches and retires the old broker before respawn",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const directory = mkdtempSync(join(process.cwd(), ".persistent-python-idle-fatal-"));
    const gatePath = join(directory, "release");
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    const armed = await client.run(
      request(
        [
          "import os, signal, threading, time",
          "signal.signal(signal.SIGTERM, signal.SIG_IGN)",
          `gate_path = ${JSON.stringify(gatePath)}`,
          "def emit_idle_fatal():",
          "  while not os.path.exists(gate_path):",
          "    time.sleep(0.005)",
          '  os.write(1, b"idle-fatal\\n")',
          "threading.Thread(target=emit_idle_fatal, daemon=True).start()",
          '"armed"',
        ].join("\n"),
      ),
    );
    assert.equal(armed.value, "armed");
    const retiredPid = requireWorkerPid(client);

    writeFileSync(gatePath, "release\n", "utf8");
    await waitFor(() => client.workerPid() === undefined, "idle fatal worker detachment");

    // Queue replacement immediately after detach, while the broker's own
    // escalation still has to reap the SIGTERM-ignoring Python process.
    const fresh = await client.run(request('"fresh-after-idle-fatal"'));
    assert.equal(processIsAlive(retiredPid), false);
    assert.equal(fresh.value, "fresh-after-idle-fatal");
    assert.equal(fresh.kernelReused, false);
    assert.notEqual(client.workerPid(), retiredPid);
  },
);

test(
  "unexpected worker exit cannot overlap its fresh replacement",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    await client.run(request('state["old"] = 1'));
    const retiredPid = requireWorkerPid(client);
    await assert.rejects(client.run(request("import os\nos._exit(23)")), /exited/);

    const fresh = await client.run(request('state.get("old")'));
    assert.equal(processIsAlive(retiredPid), false);
    assert.notEqual(client.workerPid(), retiredPid);
    assert.equal(fresh.value, null);
    assert.equal(fresh.kernelReused, false);
  },
);

test("persistent engine rejects native win32 instead of spawning or downgrading", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  assert.ok(descriptor?.configurable, "process.platform must be configurable for this policy test");
  Object.defineProperty(process, "platform", { ...descriptor, value: "win32" });
  try {
    assert.throws(
      () =>
        new KernelManager({
          registry: new CapabilityRegistry(),
          engine: "persistent",
        }),
      /unsupported on native win32/,
    );
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
});
