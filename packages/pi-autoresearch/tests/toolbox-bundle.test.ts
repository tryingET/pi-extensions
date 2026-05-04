import assert from "node:assert/strict";
import test from "node:test";

import { id, registerToolboxBundle, version } from "../src/toolboxBundle.ts";

function createHarness() {
  const tools = new Map<string, { name: string }>();
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
