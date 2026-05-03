import assert from "node:assert/strict";
import test from "node:test";

import { id, registerToolboxBundle, version } from "../src/toolboxBundle.ts";

function createHarness() {
  const tools = new Map();
  const commands = new Map();

  return {
    tools,
    commands,
    pi: {
      registerTool(definition) {
        tools.set(definition.name, definition);
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
    },
  };
}

test("designmd toolbox bundle exposes the package-owned lazy activation contract", () => {
  assert.equal(id, "designmd");
  assert.equal(version, 1);
  assert.equal(typeof registerToolboxBundle, "function");
});

test("designmd toolbox bundle registers designmd tools and reports requested summaries", () => {
  const harness = createHarness();

  const summaries = registerToolboxBundle(harness.pi, {
    profile: "read",
    requestedTools: ["designmd_lint", "designmd_readiness"],
  });

  assert.deepEqual(
    summaries.map((summary) => summary.name),
    ["designmd_lint", "designmd_readiness"],
  );
  assert.equal(harness.tools.has("designmd_lint"), true);
  assert.equal(harness.tools.has("designmd_readiness"), true);
  assert.equal(harness.tools.has("designmd_openpencil_export"), true);
  assert.equal(harness.commands.has("designmd"), true);
});
