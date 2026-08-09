import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CapabilityRegistry } from "../src/capability-registry.ts";
import { KernelExecutionError } from "../src/kernel-client.ts";
import { KernelManager } from "../src/kernel-manager.ts";
import { PersistentPythonKernelClient } from "../src/persistent-python-client.ts";
import type { CapabilityEffect, KernelRunRequest } from "../src/types.ts";

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

// Gate 1: persistent python state persists across multiple evals in ONE worker,
// the worker PID is stable across evals, and no host state round-trip occurs.
test(
  "persistent python kernel keeps state and worker pid across evals (gate 1)",
  { skip: !pythonAvailable },
  async (t) => {
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    // eval #1: set state in-process and remember the python worker's own pid.
    const first = await client.run(
      request('import os\nstate["marker"] = 42\nstate["py_pid"] = os.getpid()\n"set"'),
    );
    assert.equal(first.value, "set");
    assert.equal(first.kernelReused, false);
    const brokerPid = client.workerPid();
    assert.ok(
      typeof brokerPid === "number" && brokerPid > 0,
      `expected a worker pid, got ${brokerPid}`,
    );

    // eval #2: read state back; marker persisted and the python pid is unchanged.
    const second = await client.run(
      request(
        'import os\n{"marker": state.get("marker"), "pid_stable": os.getpid() == state.get("py_pid")}',
      ),
    );
    assert.deepEqual(second.value, { marker: 42, pid_stable: true });
    assert.equal(second.kernelReused, true);
    assert.equal(client.workerPid(), brokerPid);

    // eval #3: state still in-process and the broker worker is still the same
    // process. (Imports are scoped per eval, like the disposable contract; only
    // the explicit `state` dict persists across evals.)
    const third = await client.run(request('state.get("marker")'));
    assert.equal(third.value, 42);
    assert.equal(client.workerPid(), brokerPid);
  },
);

// Gate 1 (no host round-trip): reset kills the long-lived worker, and because
// the host never retained a state copy, the respawned worker starts empty.
test(
  "persistent kernel reset drops in-process state with no host copy (gate 1)",
  { skip: !pythonAvailable },
  async (t) => {
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    await client.run(request('state["marker"] = 42\nstate["marker"]'));
    const beforePid = client.workerPid();
    assert.ok(beforePid && beforePid > 0);

    await client.reset();
    assert.equal(client.workerPid(), undefined); // worker stopped; no worker until next eval

    const after = await client.run(request("dict(state)"));
    assert.deepEqual(after.value, {}); // fresh worker; host had no state copy to replay
    assert.equal(after.kernelReused, false);
    assert.notEqual(client.workerPid(), beforePid); // respawned worker (new pid)
  },
);

// Gate 1 + end-to-end threading: engine:"persistent" routes python through the
// long-lived worker while javascript stays on the disposable path in Wave 1A.
test(
  "KernelManager engine:'persistent' threads python through the long-lived worker",
  { skip: !pythonAvailable },
  async (t) => {
    const manager = new KernelManager({
      registry: new CapabilityRegistry(),
      engine: "persistent",
    });
    t.after(() => manager.close());

    const first = await manager.run("python", request('state["n"] = 7\nstate["n"]'));
    assert.equal(first.value, 7);
    const second = await manager.run("python", request('state["n"] * 6'));
    assert.equal(second.value, 42); // python state persisted in the persistent worker
    assert.equal(second.kernelReused, true);

    // JavaScript remains disposable in the same manager (Wave 2 reuses context later).
    const js = await manager.run("javascript", request("return 2 + 2;"));
    assert.equal(js.value, 4);
  },
);

// Engine default: omitting engine keeps the disposable path (fresh worker per
// eval, host state round-trip), which is the rollback surface. The python pid
// therefore differs across evals and the host replays the prior pid into the
// next disposable worker.
test(
  "KernelManager defaults to the disposable engine (fresh worker per eval)",
  { skip: !pythonAvailable },
  async (t) => {
    const manager = new KernelManager({ registry: new CapabilityRegistry() });
    t.after(() => manager.close());

    await manager.run(
      "python",
      request('import os\nstate["first_pid"] = os.getpid()\nstate["first_pid"]'),
    );
    const second = await manager.run(
      "python",
      request('import os\n{"first": state["first_pid"], "current": os.getpid()}'),
    );
    const value = second.value as { first: number; current: number };
    assert.notEqual(value.first, value.current); // fresh worker each eval => disposable
  },
);

// Gate 3: cancellation reaches Python as KeyboardInterrupt. The worker settles
// the error frame instead of dying, so both the prior namespace and PIDs survive.
test(
  "persistent python SIGINT abort preserves state and worker pid (gate 3)",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const registry = new CapabilityRegistry([
      {
        name: "interrupt_probe",
        description: "Mark the interrupt test eval as started.",
        effect: "read",
        execute() {
          markStarted();
          return null;
        },
      },
    ]);
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    await client.run(request('import os\nstate["kept"] = "before"\nstate["py_pid"] = os.getpid()'));
    const brokerPid = client.workerPid();
    assert.ok(brokerPid && brokerPid > 0);

    const controller = new AbortController();
    const interrupted = client.run({
      ...request("tool.interrupt_probe()\nwhile True:\n  pass", 10_000),
      signal: controller.signal,
    });
    await started;
    await new Promise((resolve) => setTimeout(resolve, 25));
    controller.abort();

    await assert.rejects(interrupted, (error: unknown) => {
      assert.ok(error instanceof KernelExecutionError);
      assert.match(error.message, /aborted/);
      assert.match(error.partial.stderr, /KeyboardInterrupt/);
      return true;
    });
    assert.equal(client.workerPid(), brokerPid);

    const recovered = await client.run(
      request(
        'import os\n{"kept": state.get("kept"), "pid_stable": os.getpid() == state.get("py_pid")}',
      ),
    );
    assert.deepEqual(recovered.value, { kept: "before", pid_stable: true });
    assert.equal(recovered.kernelReused, true);
    assert.equal(client.workerPid(), brokerPid);
  },
);

// A result without worker evidence that SIGINT reached this eval is fail-closed:
// keep the queue blocked until worker death, then run the queued eval fresh.
test(
  "unconfirmed persistent SIGINT cannot leak into the next queued eval",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const registry = new CapabilityRegistry([
      {
        name: "near_complete",
        description: "Coordinate an eval that deliberately ignores SIGINT.",
        effect: "read",
        async execute() {
          markStarted();
          await new Promise((resolve) => setTimeout(resolve, 75));
          return null;
        },
      },
    ]);
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    await client.run(request('state["marker"] = "must-not-cross"'));
    const beforePid = client.workerPid();
    assert.ok(beforePid && beforePid > 0);

    const controller = new AbortController();
    const interrupted = client.run({
      ...request(
        'import signal\nsignal.signal(signal.SIGINT, signal.SIG_IGN)\ntool.near_complete()\n"natural-finish"',
        10_000,
      ),
      signal: controller.signal,
    });
    await started;
    controller.abort();
    const queued = client.run(request('{"marker": state.get("marker"), "next": "clean"}'));

    await assert.rejects(interrupted, /aborted/);
    const next = await queued;
    assert.deepEqual(next.value, { marker: null, next: "clean" });
    assert.equal(next.kernelReused, false);
    assert.notEqual(client.workerPid(), beforePid);
  },
);

// SIGINT can unwind ToolBridge.call while its host capability is still pending.
// Repeat on one worker and inspect worker internals to prove every call is removed.
test(
  "repeated pending-capability interrupts clean pending calls and preserve state",
  { skip: !pythonAvailable, timeout: 15_000 },
  async (t) => {
    let markStarted: () => void = () => {};
    const registry = new CapabilityRegistry([
      {
        name: "pending_probe",
        description: "Remain pending briefly while Python receives SIGINT.",
        effect: "read",
        async execute() {
          markStarted();
          await new Promise((resolve) => setTimeout(resolve, 500));
          return null;
        },
      },
    ]);
    const client = new PersistentPythonKernelClient({ registry });
    t.after(() => client.close());

    await client.run(request('import os\nstate["py_pid"] = os.getpid()'));
    const brokerPid = client.workerPid();
    assert.ok(brokerPid && brokerPid > 0);

    for (let iteration = 1; iteration <= 2; iteration += 1) {
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const controller = new AbortController();
      const interrupted = client.run({
        ...request(
          'state["interrupt_count"] = state.get("interrupt_count", 0) + 1\ntool.pending_probe()',
          10_000,
        ),
        signal: controller.signal,
      });
      await started;
      controller.abort();
      await assert.rejects(interrupted, (error: unknown) => {
        assert.ok(error instanceof KernelExecutionError);
        assert.match(error.partial.stderr, /KeyboardInterrupt/);
        return true;
      });

      const inspected = await client.run(
        request(
          'import __main__, os\n{"pending": len(__main__.PENDING), "count": state.get("interrupt_count"), "pid_stable": os.getpid() == state.get("py_pid")}',
        ),
      );
      assert.deepEqual(inspected.value, {
        pending: 0,
        count: iteration,
        pid_stable: true,
      });
      assert.equal(client.workerPid(), brokerPid);
    }
  },
);
// Robustness: code that ignores both SIGINT and SIGTERM forces the complete
// escalation through SIGKILL. The next eval retains Wave 1A fresh respawn.
test(
  "persistent kernel timeout terminates the worker and the next eval respawns",
  { skip: !pythonAvailable },
  async (t) => {
    const client = new PersistentPythonKernelClient({ registry: new CapabilityRegistry() });
    t.after(() => client.close());

    await client.run(request('state["kept"] = 1\nstate["kept"]'));
    const beforePid = client.workerPid();
    assert.ok(beforePid && beforePid > 0);

    await assert.rejects(
      client.run(
        request(
          "import signal\nsignal.signal(signal.SIGINT, signal.SIG_IGN)\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\nwhile True:\n  pass",
          150,
        ),
      ),
      /timed out/,
    );
    assert.equal(client.workerPid(), undefined); // worker stopped by the timeout

    const after = await client.run(request('state.get("kept")'));
    assert.equal(after.value, null); // fresh worker; host had no state copy
    assert.equal(after.kernelReused, false);
    assert.notEqual(client.workerPid(), beforePid); // respawned worker

    // A result frame can precede a stuck finalization handshake. Once user code
    // has finished, arm termination without delivering a late SIGINT to idle Python.
    await client.run(request('state["finalize_kept"] = 2'));
    const finalizePid = client.workerPid();
    await assert.rejects(
      client.run(
        request(
          'import __main__, time\n__main__.FINALIZE_EVENT.wait = lambda: time.sleep(60)\n"result-sent"',
          150,
        ),
      ),
      /timed out/,
    );
    assert.equal(client.workerPid(), undefined);

    const afterFinalizeStall = await client.run(request('state.get("finalize_kept")'));
    assert.equal(afterFinalizeStall.value, null);
    assert.equal(afterFinalizeStall.kernelReused, false);
    assert.notEqual(client.workerPid(), finalizePid);
  },
);
