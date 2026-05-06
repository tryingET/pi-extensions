import assert from "node:assert/strict";
import test from "node:test";

import { id, registerToolboxBundle, version } from "../src/toolboxBundle.ts";

function createHarness() {
  const tools = new Map<
    string,
    { name: string; execute?: (...args: unknown[]) => Promise<unknown> | unknown }
  >();
  const commands = new Map<string, unknown>();
  const handlers = new Map<string, unknown[]>();

  return {
    tools,
    commands,
    handlers,
    pi: {
      on(event: string, handler: unknown) {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      },
      registerTool(definition: { name: string }) {
        tools.set(definition.name, definition);
      },
      registerCommand(name: string, definition: unknown) {
        commands.set(name, definition);
      },
    },
  };
}

test("autoresearch toolbox bundle exposes the package-owned lazy activation contract", () => {
  assert.equal(id, "autoresearch");
  assert.equal(version, 1);
  assert.equal(typeof registerToolboxBundle, "function");
});

test("autoresearch toolbox bundle registers autoresearch tools and reports requested summaries", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi as never, {
    profile: "read",
    requestedTools: ["autoresearch_runtime_status", "autoresearch_llamacpp_campaign"],
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    ["autoresearch_runtime_status", "autoresearch_llamacpp_campaign"],
  );
  assert.equal(harness.tools.has("autoresearch_runtime_status"), true);
  assert.equal(harness.tools.has("autoresearch_runtime_run"), true);
  assert.equal(harness.tools.has("autoresearch_llamacpp_campaign"), true);
  assert.equal(harness.commands.has("autoresearch"), true);
});

test("autoresearch mutating toolbox profile includes foreground resume executor", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi as never, {
    profile: "mutating",
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    [
      "autoresearch_runtime_run",
      "autoresearch_runtime_autoplan",
      "autoresearch_runtime_setup",
      "autoresearch_campaign_start",
      "autoresearch_runtime_loop",
      "autoresearch_runtime_resume_apply",
      "autoresearch_self_hosting_run",
    ],
  );
  assert.equal(harness.tools.has("autoresearch_runtime_resume_apply"), true);
});

test("autoresearch read toolbox profile mechanically rejects mutating actions", async () => {
  const harness = createHarness();

  registerToolboxBundle(harness.pi as never, {
    profile: "read",
    requestedTools: ["autoresearch_runtime_control", "autoresearch_runtime_run"],
  });

  const controlTool = harness.tools.get("autoresearch_runtime_control");
  const runTool = harness.tools.get("autoresearch_runtime_run");
  assert.ok(controlTool?.execute);
  assert.ok(runTool?.execute);

  await assert.rejects(
    () =>
      Promise.resolve(
        controlTool.execute?.(
          "read-control-set",
          { cwd: process.cwd(), action: "set", decision: "stop" },
          undefined,
          undefined,
          { cwd: process.cwd() },
        ),
      ),
    /read profile/,
  );

  await assert.rejects(
    () =>
      Promise.resolve(
        runTool.execute?.(
          "read-run",
          { cwd: process.cwd(), description: "should not run from read profile" },
          undefined,
          undefined,
          { cwd: process.cwd() },
        ),
      ),
    /read profile/,
  );
});
