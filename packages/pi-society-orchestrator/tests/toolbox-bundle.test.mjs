import assert from "node:assert/strict";
import test from "node:test";

import { id, registerToolboxBundle, version } from "../src/toolboxBundle.ts";

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

test("orchestrator toolbox bundle exposes the package-owned lazy activation contract", () => {
  assert.equal(id, "orchestrator");
  assert.equal(version, 1);
  assert.equal(typeof registerToolboxBundle, "function");
});

test("orchestrator toolbox bundle registers orchestrator tools and reports requested summaries", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi, {
    profile: "read",
    requestedTools: ["society_query", "ontology_context"],
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    ["society_query", "ontology_context"],
  );
  assert.equal(harness.tools.has("society_query"), true);
  assert.equal(harness.tools.has("ontology_context"), true);
  assert.equal(harness.tools.has("workflow_execute"), true);
  assert.equal(harness.tools.has("loop_execute"), true);
  assert.equal(harness.commands.has("runtime-status"), true);
});

test("orchestrator-gated toolbox profile includes the autoresearch learning KES adapter", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi, {
    profile: "orchestrator-gated",
    requestedTools: ["autoresearch_learning_kes_adapter"],
  });

  assert.deepEqual(summaries, [
    {
      name: "autoresearch_learning_kes_adapter",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
  ]);
  assert.equal(harness.tools.has("autoresearch_learning_kes_adapter"), true);
});
