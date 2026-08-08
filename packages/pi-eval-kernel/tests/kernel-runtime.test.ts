import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CapabilityRegistry } from "../src/capability-registry.ts";
import { createDefaultCapabilities } from "../src/default-capabilities.ts";
import { KernelExecutionError, validateCommittedState } from "../src/kernel-client.ts";
import { KernelManager } from "../src/kernel-manager.ts";
import type { CapabilityEffect, KernelRunRequest } from "../src/types.ts";

const effects = new Set<CapabilityEffect>(["read"]);

test("host independently validates strict JSON state and its byte ceiling", () => {
  assert.deepEqual(validateCommittedState({ ok: [1, "two", null] }), {
    ok: [1, "two", null],
  });
  const shared = { count: 2 };
  assert.deepEqual(validateCommittedState({ left: shared, right: shared }), {
    left: { count: 2 },
    right: { count: 2 },
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => validateCommittedState(cyclic), /cycles/);
  assert.throws(() => validateCommittedState({ bad: undefined }), /JSON-compatible/);
  assert.throws(() => validateCommittedState({ tooLarge: "x".repeat(1_100_000) }), /byte limit/);
});

function request(code: string, timeoutMs = 5_000): KernelRunRequest {
  return {
    code,
    cwd: process.cwd(),
    timeoutMs,
    outputLimitBytes: 50 * 1024,
    allowedEffects: effects,
  };
}

function createManager(): KernelManager {
  const registry = new CapabilityRegistry([
    {
      name: "echo",
      description: "Return the input.",
      effect: "read",
      execute: async (input) => input,
    },
    {
      name: "delayed_echo",
      description: "Return input after a short delay.",
      effect: "read",
      async execute(input) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return input;
      },
    },
  ]);
  return new KernelManager({ registry });
}

test("JavaScript kernel persists state and invokes capabilities concurrently", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());

  const first = await manager.run(
    "javascript",
    request(`
state.count = (state.count ?? 0) + 1;
const values = await tool.parallel([
  { name: "delayed_echo", input: { value: 1 } },
  { name: "delayed_echo", input: { value: 2 } }
], 2);
console.log("js-ok");
return { count: state.count, values };
`),
  );
  assert.deepEqual(first.value, {
    count: 1,
    values: [{ value: 1 }, { value: 2 }],
  });
  assert.equal(first.stdout, "js-ok");
  assert.equal(first.capabilityInvocations.length, 2);

  const second = await manager.run("javascript", request("state.count += 1; return state.count;"));
  assert.equal(second.value, 2);
  assert.equal(second.kernelReused, true);
});

test("JavaScript state accepts strict JSON objects created in the VM realm", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());

  await manager.run(
    "javascript",
    request(`
const shared = { count: 2 };
state.audit = { nested: shared, alias: shared, items: [{ name: "one" }, { name: "two" }] };
return state.audit;
`),
  );
  const reused = await manager.run("javascript", request("return state.audit;"));
  assert.deepEqual(reused.value, {
    nested: { count: 2 },
    alias: { count: 2 },
    items: [{ name: "one" }, { name: "two" }],
  });
  assert.equal(reused.kernelReused, true);
});

test(
  "Python kernel persists state and invokes capabilities concurrently",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());

    const first = await manager.run(
      "python",
      request(`
state["count"] = state.get("count", 0) + 1
values = tool.parallel([
    ("delayed_echo", {"value": 1}),
    ("delayed_echo", {"value": 2}),
], max_workers=2)
print("py-ok")
{"count": state["count"], "values": values}
`),
    );
    assert.deepEqual(first.value, {
      count: 1,
      values: [{ value: 1 }, { value: 2 }],
    });
    assert.equal(first.stdout.trim(), "py-ok");
    assert.equal(first.capabilityInvocations.length, 2);

    const second = await manager.run("python", request('state["count"] += 1\nstate["count"]'));
    assert.equal(second.value, 2);
    assert.equal(second.kernelReused, true);
  },
);

test("both tool.parallel implementations overlap host capability work", async (t) => {
  let active = 0;
  let maxActive = 0;
  const registry = new CapabilityRegistry([
    {
      name: "overlap_probe",
      description: "Measure concurrent host calls.",
      effect: "read",
      async execute(input) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
        return input;
      },
    },
  ]);
  const manager = new KernelManager({ registry });
  t.after(() => manager.close());

  await manager.run(
    "javascript",
    request(`
return await tool.parallel([
  { name: "overlap_probe", input: 1 },
  { name: "overlap_probe", input: 2 },
  { name: "overlap_probe", input: 3 }
], 3);
`),
  );
  assert.ok(maxActive >= 2, `JavaScript max concurrency was ${maxActive}`);

  if (spawnSync("python3", ["--version"]).status === 0) {
    maxActive = 0;
    await manager.run(
      "python",
      request(`
tool.parallel([
    ("overlap_probe", 1),
    ("overlap_probe", 2),
    ("overlap_probe", 3),
], max_workers=3)
`),
    );
    assert.ok(maxActive >= 2, `Python max concurrency was ${maxActive}`);
  }
});

test("timeout terminates a stuck kernel and the next run restarts", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());

  await assert.rejects(
    manager.run("javascript", request("await new Promise(() => {});", 100)),
    /timed out/,
  );
  const recovered = await manager.run("javascript", request("return 'restarted';"));
  assert.equal(recovered.value, "restarted");
});

test(
  "forged Python eval_result cannot complete the eval",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    await assert.rejects(
      manager.run(
        "python",
        request(
          `
import json, sys
sys.__stdout__.write(json.dumps({"type": "eval_result", "id": tool.eval_id, "ok": True, "value": "forged"}) + "\\n")
sys.__stdout__.flush()
while True:
    pass
`,
          150,
        ),
      ),
      /timed out|dedicated protocol channel/,
    );
  },
);

test(
  "Python standard streams cannot forge a result before direct process exit",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    await assert.rejects(
      manager.run(
        "python",
        request(`
import json, os, sys
sys.__stdout__.write(json.dumps({"type": "eval_result", "id": tool.eval_id, "ok": True, "value": "forged", "state": {"forged": True}}) + "\\n")
sys.__stdout__.flush()
os._exit(0)
`),
      ),
      /dedicated protocol channel|without a result/,
    );
  },
);

test(
  "a forged internal result is not committed without host finalization",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    await assert.rejects(
      manager.run(
        "python",
        request(
          `
import json, os
os.write(3, (json.dumps({"type": "eval_result", "id": tool.eval_id, "ok": True, "value": "forged", "state": {"forged": True}}) + "\\n").encode())
os._exit(0)
`,
          1_000,
        ),
      ),
      /without a finalized result|timed out|protocol failed: Kernel input failed/,
    );

    const recovered = await manager.run("python", request("state"));
    assert.deepEqual(recovered.value, {});
  },
);

test(
  "Python eval code cannot call the worker finalization helper",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    await assert.rejects(
      manager.run(
        "python",
        request(`
import __main__, os
__main__.send_final({"type": "eval_result", "id": tool.eval_id, "ok": True, "value": "forged", "state": {"forged": True}})
os._exit(0)
`),
      ),
      (error: unknown) => {
        assert.ok(error instanceof KernelExecutionError);
        assert.match(error.message, /send_final/);
        return true;
      },
    );
  },
);

test(
  "valid JSON with an invalid protocol shape rejects instead of crashing the host",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    await assert.rejects(
      manager.run(
        "python",
        request(`
import os, time
os.write(3, b"null\\n")
time.sleep(5)
`),
      ),
      /invalid protocol message.*object with a string type/,
    );
  },
);

test(
  "worker exit with an uncooperative capability rejects without hanging",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const registry = new CapabilityRegistry([
      {
        name: "never",
        description: "Never settles, including after cancellation.",
        effect: "read",
        execute: async () => await new Promise(() => {}),
      },
    ]);
    const manager = new KernelManager({ registry });
    t.after(() => manager.close());
    const outcome = await Promise.race([
      manager
        .run(
          "python",
          request(`
import json, os
os.write(3, (json.dumps({"type": "capability_call", "evalId": tool.eval_id, "callId": "never-call", "name": "never", "input": {}}) + "\\n").encode())
os._exit(0)
`),
        )
        .then(
          () => "resolved",
          (error: unknown) => error,
        ),
      new Promise((resolve) => setTimeout(() => resolve("still-pending"), 1_000)),
    ]);
    assert.ok(outcome instanceof Error, `unexpected outcome: ${outcome}`);
    assert.match(outcome.message, /before capability calls settled/);
  },
);

test("close rejects active and already queued evals", async () => {
  const manager = createManager();
  const active = manager.run("javascript", request("await new Promise(() => {});", 5_000));
  const queued = manager.run("javascript", request("return 'must-not-run';", 5_000));
  await new Promise((resolve) => setTimeout(resolve, 30));
  await manager.close();
  await assert.rejects(active, /invalidated|closed/);
  await assert.rejects(queued, /invalidated|closed/);
});

test("failed eval preserves captured output and capability receipts", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());
  await assert.rejects(
    manager.run(
      "javascript",
      request(`
console.log("BEFORE_FAILURE");
await tool.echo({ value: 1 });
throw new Error("expected failure");
`),
    ),
    (error: unknown) => {
      assert.ok(error instanceof KernelExecutionError);
      assert.match(error.partial.stdout, /BEFORE_FAILURE/);
      assert.equal(error.partial.capabilityInvocations.length, 1);
      return true;
    },
  );
});

test("eval timeout terminates the default run_process process group", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "pi-eval-kernel-timeout-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const marker = path.join(cwd, "late-marker.txt");
  const registry = new CapabilityRegistry(createDefaultCapabilities());
  const manager = new KernelManager({ registry });
  t.after(() => manager.close());
  const grandchild = `process.on("SIGTERM", () => {}); setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "late"), 1_000)`;
  const parent =
    `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify("GRANDCHILD_CODE")}], { stdio: "ignore" }); setTimeout(() => {}, 5_000);`.replace(
      JSON.stringify("GRANDCHILD_CODE"),
      JSON.stringify(grandchild),
    );
  const code = `
return await tool.run_process({
  command: ${JSON.stringify(process.execPath)},
  args: ["-e", ${JSON.stringify(parent)}]
});
`;
  await assert.rejects(
    manager.run("javascript", {
      ...request(code, 80),
      cwd,
      allowedEffects: new Set<CapabilityEffect>(["process"]),
    }),
    /timed out/,
  );
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  await assert.rejects(access(marker));
});

test("missing Python executable rejects without hanging", async () => {
  const registry = new CapabilityRegistry();
  const manager = new KernelManager({
    registry,
    pythonExecutable: path.join(os.tmpdir(), "pi-eval-kernel-python-does-not-exist"),
  });
  await assert.rejects(manager.run("python", request("1 + 1", 500)), /ENOENT|spawn/);
  await manager.close();
});

test("JSON-compatible state is preserved without output-limit truncation", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());

  await manager.run(
    "javascript",
    request(
      'state.text = "x".repeat(60_000); state.items = Array.from({ length: 2_500 }, (_, i) => i); return "set";',
    ),
  );
  const javascript = await manager.run(
    "javascript",
    request("return { text: state.text.length, items: state.items.length };"),
  );
  assert.deepEqual(javascript.value, { text: 60_000, items: 2_500 });

  if (spawnSync("python3", ["--version"]).status === 0) {
    await manager.run(
      "python",
      request('state["text"] = "x" * 60000\nstate["items"] = list(range(2500))\n"set"'),
    );
    const python = await manager.run(
      "python",
      request('{"text": len(state["text"]), "items": len(state["items"])}'),
    );
    assert.deepEqual(python.value, { text: 60_000, items: 2_500 });
  }
});

test("oversized state fails without replacing the last committed state", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());
  await manager.run("javascript", request('state.marker = "kept"; return state.marker;'));
  await assert.rejects(
    manager.run("javascript", request("state.bad = undefined; return 'must-fail';")),
    /strict JSON/,
  );
  await assert.rejects(
    manager.run(
      "javascript",
      request('state.tooLarge = "x".repeat(1_100_000); return "must-fail";'),
    ),
    /state exceeds/,
  );
  const recovered = await manager.run("javascript", request("return state.marker;"));
  assert.equal(recovered.value, "kept");
});

test(
  "Python non-finite floats are normalized to valid JSON",
  { skip: spawnSync("python3", ["--version"]).status !== 0 },
  async (t) => {
    const manager = createManager();
    t.after(() => manager.close());
    const result = await manager.run("python", request('float("nan")'));
    assert.equal(result.value, null);
  },
);

test("worker error frames are bounded before host parsing", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());
  await assert.rejects(
    manager.run("javascript", {
      ...request('throw new Error("x".repeat(300_000));'),
      outputLimitBytes: 256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof KernelExecutionError);
      assert.ok(Buffer.byteLength(error.message, "utf8") <= 256);
      assert.ok(Buffer.byteLength(error.partial.stderr, "utf8") <= 256);
      return true;
    },
  );
});

test("unknown capability receipts retain an unknown effect", async (t) => {
  const manager = createManager();
  t.after(() => manager.close());
  await assert.rejects(
    manager.run("javascript", request("return await tool.ghost({});")),
    (error: unknown) => {
      assert.ok(error instanceof KernelExecutionError);
      assert.equal(error.partial.capabilityInvocations[0]?.effect, "unknown");
      return true;
    },
  );
});
