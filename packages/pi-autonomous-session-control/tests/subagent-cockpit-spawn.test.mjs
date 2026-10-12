import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { COCKPIT_CHANNEL_ENV, readChannel } from "../extensions/self/subagent-cockpit-channel.ts";
import { spawnSubagentWithSpawn } from "../extensions/self/subagent-spawn.ts";
import { resolveCockpitChildExtensionPath } from "../extensions/self/subagent-spawn-args.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

function childProcess() {
  const child = new EventEmitter();
  for (const stream of ["stdout", "stderr"]) {
    child[stream] = new EventEmitter();
    child[stream].setEncoding = () => undefined;
  }
  child.pid = process.pid;
  child.kill = () => true;
  return child;
}

test("owned spawn explicitly loads native extension without changing print/JSON v2 protocol", async () => {
  const f = fixture();
  try {
    const child = childProcess();
    let captured;
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "child",
        dispatchId: "dispatch-1",
        attemptId: "spawn-attempt",
        objective: "fixture",
        tools: "read",
        sessionFile: f.binding.sessionFile,
        parentSessionKey: f.binding.parentSessionKey,
        parentRepoRoot: f.root,
        extensionSources: ["/explicit-extension.ts"],
      },
      "fake/model",
      { cwd: f.root },
      f.state,
      (command, args, options) => {
        captured = { command, args, options };
        return child;
      },
    );
    assert.match(captured.args[0], /subagent-pi-json-filter-v2\.ts$/);
    const extensions = captured.args.flatMap((arg, i) =>
      arg === "--extension" ? [captured.args[i + 1]] : [],
    );
    assert.deepEqual(extensions, ["/explicit-extension.ts", resolveCockpitChildExtensionPath()]);
    const dir = captured.options.env[COCKPIT_CHANNEL_ENV];
    assert.equal(readChannel(dir).attemptId, "spawn-attempt");
    assert.equal(readChannel(dir).phase, "starting");
    child.stdout.emit(
      "data",
      '{"type":"raw_child_spawn_intent"}\n{"type":"transport_ready","settlementMode":"agent_settled","piVersion":"1.1.0"}\n',
    );
    child.stdout.emit(
      "data",
      '{"type":"assistant_message_end","text":"done","stopReason":"stop"}\n{"type":"agent_settled"}\n',
    );
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(readChannel(dir).phase, "closed");
    assert.equal(f.state.activeCount, 0);
    assert.equal(f.state.completedCount, 1);
  } finally {
    f.cleanup();
  }
});

test("legacy/incomplete identity spawn does not inherit a parent's private channel", async () => {
  const f = fixture(),
    previous = process.env[COCKPIT_CHANNEL_ENV];
  process.env[COCKPIT_CHANNEL_ENV] = f.dir;
  try {
    const child = childProcess();
    let captured;
    const resultPromise = spawnSubagentWithSpawn(
      { name: "legacy", objective: "fixture", tools: "read", sessionFile: null },
      "fake/model",
      { cwd: f.root },
      f.state,
      (_command, args, options) => {
        captured = { args, options };
        return child;
      },
    );
    assert.equal(captured.options.env[COCKPIT_CHANNEL_ENV], "");
    assert.equal(captured.args.includes(resolveCockpitChildExtensionPath()), false);
    child.emit("close", 1);
    await resultPromise;
    assert.equal(readChannel(f.dir).phase, "starting");
  } finally {
    if (previous === undefined) delete process.env[COCKPIT_CHANNEL_ENV];
    else process.env[COCKPIT_CHANNEL_ENV] = previous;
    f.cleanup();
  }
});

test("native extension source and packed paths follow helper topology", () => {
  assert.equal(
    resolveCockpitChildExtensionPath("file:///checkout/extensions/self/subagent-spawn-args.ts"),
    "/checkout/extensions/self/subagent-cockpit-child.ts",
  );
  assert.equal(
    resolveCockpitChildExtensionPath("file:///package/dist/extensions/self/subagent-spawn-args.js"),
    "/package/dist/extensions/self/subagent-cockpit-child.js",
  );
  assert.equal(
    resolveCockpitChildExtensionPath(
      "file:///x/node_modules/asc/extensions/self/subagent-spawn-args.ts",
    ),
    "/x/node_modules/asc/dist/extensions/self/subagent-cockpit-child.js",
  );
});
