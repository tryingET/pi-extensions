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

test("designmd guided run tool exposes full Watch Mode lifecycle orchestration", () => {
  const harness = createHarness();
  const summaries = registerToolboxBundle(harness.pi, { profile: "mutating" });

  assert.equal(
    summaries.some((summary) => summary.name === "designmd_session_guided_run"),
    true,
  );
  const guidedRunTool = harness.tools.get("designmd_session_guided_run");
  assert.equal(typeof guidedRunTool?.execute, "function");
  assert.match(guidedRunTool.description, /Guided Design Run loop/);
  assert.equal(Boolean(guidedRunTool.parameters?.properties?.laneId), true);
  assert.equal(Boolean(guidedRunTool.parameters?.properties?.materialize), true);
});

test("designmd Penpot MCP bridge tool exposes bounded update selectors", () => {
  const harness = createHarness();
  registerToolboxBundle(harness.pi, { profile: "mutating" });

  const bridgeTool = harness.tools.get("designmd_penpot_mcp_bridge");
  assert.equal(typeof bridgeTool?.execute, "function");
  assert.match(bridgeTool.description, /updateLatest\/updateBoardId/);
  assert.equal(Boolean(bridgeTool.parameters?.properties?.updateLatest), true);
  assert.equal(Boolean(bridgeTool.parameters?.properties?.updateBoardId), true);
});

test("designmd Penpot MCP bridge tool rejects ambiguous update selectors", async () => {
  const harness = createHarness();
  registerToolboxBundle(harness.pi, { profile: "mutating" });

  const bridgeTool = harness.tools.get("designmd_penpot_mcp_bridge");
  const result = await bridgeTool.execute("tool-call", {
    bridgePath: "bridge.json",
    updateLatest: true,
    updateBoardId: "board-123",
  });

  assert.equal(result.details.ok, false);
  assert.match(result.content[0].text, /either updateLatest or updateBoardId/);
});
