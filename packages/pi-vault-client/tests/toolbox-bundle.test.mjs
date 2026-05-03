import assert from "node:assert/strict";
import test from "node:test";

import { id, registerToolboxBundle, version } from "../src/toolboxBundle.js";

function createHarness() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();

  return {
    tools,
    commands,
    handlers,
    pi: {
      on(event, handler) {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      },
      registerTool(definition) {
        tools.set(definition.name, definition);
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
    },
  };
}

test("vault toolbox bundle exposes the package-owned lazy activation contract", () => {
  assert.equal(id, "vault");
  assert.equal(version, 1);
  assert.equal(typeof registerToolboxBundle, "function");
});

test("vault toolbox bundle registers vault tools and reports requested summaries", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi, {
    profile: "read",
    requestedTools: ["vault_query", "vault_retrieve"],
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    ["vault_query", "vault_retrieve"],
  );
  assert.equal(harness.tools.has("vault_schema_diagnostics"), true);
  assert.equal(harness.commands.has("vault"), true);
});
