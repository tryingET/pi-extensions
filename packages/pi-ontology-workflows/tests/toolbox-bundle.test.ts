// summary: "Validates the ontology toolbox bundle identity, lazy profile summaries, tools, and command registration."
// read_when:
//   - "Changing ontology toolbox activation contracts or registered surfaces."

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

test("ontology toolbox bundle exposes the package-owned lazy activation contract", () => {
  assert.equal(id, "ontology");
  assert.equal(version, 1);
  assert.equal(typeof registerToolboxBundle, "function");
});

test("ontology toolbox bundle registers ontology tools and reports requested summaries", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi as never, {
    profile: "read",
    requestedTools: ["ontology_inspect", "ontology_proposal"],
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    ["ontology_inspect", "ontology_proposal"],
  );
  assert.equal(harness.tools.has("ontology_inspect"), true);
  assert.equal(harness.tools.has("ontology_proposal"), true);
  assert.equal(harness.tools.has("ontology_change"), true);
  assert.equal(harness.commands.has("ontology-status"), true);
});
