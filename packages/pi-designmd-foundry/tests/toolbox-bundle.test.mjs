import assert from "node:assert/strict";
import test from "node:test";

import { _test } from "../extensions/designmd.ts";
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

test("designmd browser-agent handoff is included in the mutating toolbox profile", () => {
  const harness = createHarness();
  const summaries = registerToolboxBundle(harness.pi, { profile: "mutating" });
  assert.equal(
    summaries.some((summary) => summary.name === "designmd_session_browser_agent_handoff"),
    true,
  );
});

test("designmd Penpot MCP bridge tool rejects malformed maxNodes", async () => {
  const harness = createHarness();
  registerToolboxBundle(harness.pi, { profile: "mutating" });
  const bridgeTool = harness.tools.get("designmd_penpot_mcp_bridge");

  for (const maxNodes of [0, 1.5, _test.MAX_PENPOT_BRIDGE_NODES + 1]) {
    const result = await bridgeTool.execute("tool-call", { bridgePath: "bridge.json", maxNodes });
    assert.equal(result.details.ok, false);
    assert.match(result.content[0].text, /positive integer/);
  }
  assert.equal(bridgeTool.parameters.properties.maxNodes.minimum, 1);
  assert.equal(bridgeTool.parameters.properties.maxNodes.maximum, _test.MAX_PENPOT_BRIDGE_NODES);
});

test("designmd export results fail closed when the requested artifact is absent", () => {
  const result = _test.requireExportArtifact(
    {
      ok: true,
      command: "designmd",
      args: [],
      cwd: "/tmp",
      status: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
      error: undefined,
    },
    `/tmp/designmd-missing-${process.pid}.svg`,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /without creating required artifact/);
});

test("Watch Mode requests carry a bounded timeout signal", async () => {
  const originalFetch = globalThis.fetch;
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert.deepEqual(await _test.postJson("http://example.invalid", null, "GET"), {});
    assert.equal(signal instanceof AbortSignal, true);
    assert.equal(signal.aborted, false);
    assert.equal(_test.WATCH_FETCH_TIMEOUT_MS, 5_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("designmd visual-dossier Pi critique tool is read-profile handoff only", () => {
  const harness = createHarness();
  const summaries = registerToolboxBundle(harness.pi, { profile: "read" });

  assert.equal(
    summaries.some((summary) => summary.name === "designmd_visual_dossier_pi_critique"),
    true,
  );
  const critiqueTool = harness.tools.get("designmd_visual_dossier_pi_critique");
  assert.equal(typeof critiqueTool?.execute, "function");
  assert.match(critiqueTool.description, /review evidence\/handoff only/);
  assert.match(critiqueTool.description, /cannot accept dossier guidance/);
  assert.equal(Boolean(critiqueTool.parameters?.properties?.sourceId), true);
  assert.equal(Boolean(critiqueTool.parameters?.properties?.dossierId), true);
  assert.equal(Boolean(critiqueTool.parameters?.properties?.markdown), true);
});
