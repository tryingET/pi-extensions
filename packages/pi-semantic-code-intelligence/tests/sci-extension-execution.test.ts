/**
summary: "SCI extension startup selection, composite MCP execution, failure containment, and evidence; split from extension.test.ts."
read_when:
  - "You change startup selection, composite MCP execution, failure containment, and evidence behavior."
*/
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SCI_COMPOSITE_TOOL_NAMES } from "../extensions/semantic-code-intelligence.ts";
import { type SciBridge, SciMcpBridge } from "../src/mcp-bridge.ts";
import { createHarness, exists, fakeBridge } from "./extension-test-helpers.ts";

test("registering and startup-selecting SCI reads does not spawn MCP before execution", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-sci-lazy-startup-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
  const workspace = path.join(tempRoot, "workspace");
  const marker = path.join(tempRoot, "spawned.marker");
  const command = path.join(tempRoot, "semantic-code-mcp-sentinel");
  const runtimeDir = path.join(workspace, ".ontology", "pi-mcp");
  await mkdir(workspace);
  await writeFile(
    command,
    '#!/bin/sh\nprintf "spawned" > "$SCI_SENTINEL_MARKER"\nprintf "secret /srv/private.ts" >&2\nexit 1\n',
    { mode: 0o700 },
  );

  const bridge = new SciMcpBridge({
    command,
    environment: { SCI_SENTINEL_MARKER: marker },
  });
  const harness = createHarness(bridge);
  const startupSelectedReads = ["explore_symbol_impact", "locate_confirm_definition"] as const;
  for (const name of startupSelectedReads) assert.ok(harness.tools.get(name));

  assert.equal(await exists(marker), false);
  assert.equal(await exists(runtimeDir), false);

  const tool = harness.tools.get("explore_symbol_impact");
  assert.ok(tool);
  await assert.rejects(
    tool.execute(
      "call-lazy-startup",
      { symbol: "ToolWorkflowRouter" },
      new AbortController().signal,
      undefined,
      { cwd: workspace },
    ),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /Backend diagnostics, paths, and stderr were withheld/);
      assert.doesNotMatch(message, /\/srv\/private|pi-sci-lazy-startup/);
      return true;
    },
  );
  await assert.rejects(bridge.advertisedToolNames(workspace), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /Could not start installed semantic-code-mcp for this workspace/);
    assert.doesNotMatch(message, /\/srv\/private|pi-sci-lazy-startup/);
    return true;
  });

  assert.equal(await exists(marker), true);
  assert.equal(await exists(runtimeDir), true);
  await bridge.close();
});

test("native tool execution delegates one composite MCP call and records utilization evidence", async () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const tool = harness.tools.get("explore_symbol_impact");
  assert.ok(tool);
  const result = await tool.execute(
    "call-1",
    { symbol: "ToolWorkflowRouter", depth: 1, mode: "debug" },
    new AbortController().signal,
    undefined,
    { cwd: "/workspace/repo" },
  );

  assert.deepEqual(fake.calls, [
    {
      name: "explore_symbol_impact",
      args: { symbol: "ToolWorkflowRouter", depth: 1, mode: "debug" },
      cwd: "/workspace/repo",
    },
  ]);
  const projected = JSON.parse(result.content[0].text);
  assert.equal(projected.schema, "pi.sci_explore_model.v1");
  assert.equal(projected.requestedMode, "debug");
  assert.equal(result.details.transport, "mcp-stdio");
  assert.equal("workspace" in result.details, false);
  assert.doesNotMatch(JSON.stringify(result.details), /\/workspace\/repo/);
  assert.deepEqual(result.details.utilization.sciCompositeCalls, ["explore_symbol_impact"]);
  assert.deepEqual(result.details.utilization.nativeFallbacks, []);
  assert.deepEqual(result.details.utilization.rawShellAvoided, [
    "definition lookup",
    "AST symbol map",
    "graph expansion",
  ]);
  const presentation = (
    result.details as unknown as {
      explorePresentation: {
        modelBytes: number;
        operatorBytes: number;
        operatorDetailRetained: boolean;
        operatorDetailPersisted: boolean;
      };
    }
  ).explorePresentation;
  assert.equal(presentation.modelBytes, Buffer.byteLength(result.content[0].text, "utf8"));
  assert.ok(presentation.operatorBytes > presentation.modelBytes);
  assert.equal(presentation.operatorDetailRetained, true);
  assert.equal(presentation.operatorDetailPersisted, true);
  assert.equal(harness.customEntries.length, 1);
  assert.doesNotMatch(JSON.stringify(result.details), /"packet"|shapeFailures|rawFragments/);
  assert.ok(tool.renderCall);
  assert.ok(tool.renderResult);
  const collapsed = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    {},
    { toolCallId: "call-1", lastComponent: undefined },
  );
  assert.ok(collapsed.render(20).every((line) => line.length <= 20));
  const entryRenderer = harness.entryRenderers.get("pi-sci-explore-operator-v1");
  assert.ok(entryRenderer);
  const durable = entryRenderer(
    { data: harness.customEntries[0]?.data },
    { expanded: true },
    {},
  ) as { render(width: number): string[] };
  assert.ok(durable.render(20).every((line) => line.length <= 20));
});

test("native tool failures withhold backend paths, stderr, and producer diagnostics", async () => {
  const cases: SciBridge[] = [
    {
      async callTool() {
        throw new Error("backend stack at /srv/private.ts with xoxb-secret-value-123456");
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    },
    {
      async callTool() {
        return {
          isError: true,
          content: [{ type: "text", text: '{"error":"/srv/private.ts xoxb-secret-value-123456"}' }],
        };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    },
  ];

  for (const bridge of cases) {
    const tool = createHarness(bridge).tools.get("explore_symbol_impact");
    assert.ok(tool);
    await assert.rejects(
      tool.execute("call-error", { symbol: "Target" }, undefined, undefined, {
        cwd: "/srv/private",
      }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.doesNotMatch(message, /\/srv\/private|xoxb-secret|backend stack/);
        assert.match(message, /withheld/);
        return true;
      },
    );
  }
});

test("native tool returns valid fail-closed JSON for malformed and oversized producer content", async () => {
  const payloads = [
    "not-json /srv/private.ts xoxb-secret-value-123456",
    "null",
    "42",
    "[]",
    "{}",
    JSON.stringify({ workflow: "wrong_workflow", ok: true, status: "confirmed" }),
    JSON.stringify({ workflow: "explore_symbol_impact", ok: true }),
    JSON.stringify({
      schemaVersion: 1,
      workflow: "explore_symbol_impact",
      ok: true,
      symbol: "Target",
      status: "confirmed",
      degraded: false,
      nextReads: [],
      limitations: [],
    }),
    JSON.stringify({
      schemaVersion: 999,
      workflow: "explore_symbol_impact",
      ok: true,
      symbol: "Target",
      status: "confirmed",
      degraded: false,
      error: "backend at /srv/private.ts Bearer abcDEF123456789xyz",
      nextReads: [],
      limitations: [],
    }),
    JSON.stringify({
      workflow: "explore_symbol_impact",
      ok: true,
      status: "confirmed",
      details: { raw: "x".repeat(100_000) },
    }),
  ];
  for (const text of payloads) {
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const harness = createHarness(bridge);
    const tool = harness.tools.get("explore_symbol_impact");
    assert.ok(tool);
    const result = await tool.execute("call-bounded", { symbol: "Target" }, undefined, undefined, {
      cwd: "/srv/private",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
    assert.doesNotMatch(result.content[0].text, /\/srv\/private|xoxb-secret|x{1000}/);
    assert.equal("workspace" in result.details, false);
    assert.equal(harness.customEntries.length, 0);
    assert.doesNotMatch(JSON.stringify(result.details), /"packet"/);
  }
});

test("successful producer results require workflow-specific evidence", async () => {
  const cases = [
    {
      tool: "locate_confirm_definition",
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        symbol: "Target",
        decision: "fast",
        definitions: [],
      },
    },
    {
      tool: "locate_confirm_definition",
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        symbol: "Target",
        decision: "fast",
        definitions: [42],
      },
    },
    {
      tool: "preview_patch_checks",
      input: { patch: "diff --git a/a b/a" },
      payload: {
        workflow: "patch_checks_in_snapshot",
        ok: true,
        applied: false,
        validationPlan: {},
      },
    },
    {
      tool: "preview_patch_checks",
      input: { language: "typescript", pattern: "a", rewrite: "b" },
      payload: { workflow: "structural_patch_checks", ok: true, applied: false },
    },
    {
      tool: "preview_patch_checks",
      input: { patch: "diff --git a/a b/a" },
      payload: { workflow: "patch_checks_in_snapshot", ok: true },
    },
    {
      tool: "rename_safely",
      payload: { workflow: "rename_safely", ok: true },
    },
  ];

  for (const { tool: toolName, payload, input } of cases) {
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const tool = createHarness(bridge).tools.get(toolName);
    assert.ok(tool);
    const result = await tool.execute("call-incomplete", input ?? {}, undefined, undefined, {
      cwd: "/workspace/repo",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
  }
});
