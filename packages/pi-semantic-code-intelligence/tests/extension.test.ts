import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSemanticCodeExtension,
  SCI_COMPOSITE_TOOL_NAMES,
} from "../extensions/semantic-code-intelligence.ts";
import { assertSciSchemaCompatibility, type SciBridge, SciMcpBridge } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_SPECS } from "../src/tool-definitions.ts";
import { registerToolboxBundle } from "../src/toolboxBundle.ts";

interface NativeToolResult {
  content: Array<{ type: string; text: string }>;
  details: {
    transport: string;
    utilization: {
      sciCompositeCalls: string[];
      nativeFallbacks: string[];
      rawShellAvoided: string[];
    };
  };
}

interface RegisteredTool {
  name: string;
  description: string;
  parameters: unknown;
  promptGuidelines: string[];
  execute: (...args: unknown[]) => Promise<NativeToolResult>;
}

type EventHandler = (...args: unknown[]) => unknown;

type SchemaFixture = {
  type?: string;
  properties?: Record<string, SchemaFixture>;
  required?: string[];
  default?: unknown;
  items?: SchemaFixture;
  maxItems?: number;
};

function createHarness(bridge: SciBridge) {
  const tools = new Map<string, RegisteredTool>();
  const handlers = new Map<string, EventHandler[]>();
  const pi = {
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    on(event: string, handler: EventHandler) {
      const entries = handlers.get(event) ?? [];
      entries.push(handler);
      handlers.set(event, entries);
    },
  };
  createSemanticCodeExtension({ bridgeFactory: () => bridge })(pi as never);
  return {
    pi,
    tools,
    async emit(event: string) {
      for (const handler of handlers.get(event) ?? []) await handler({}, {});
    },
  };
}

function fakeBridge() {
  const calls: Array<{ name: string; args: Record<string, unknown>; cwd: string }> = [];
  let closes = 0;
  const bridge: SciBridge = {
    async callTool(name, args, cwd) {
      calls.push({ name, args, cwd });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, workflow: name }) }] };
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {
      closes += 1;
    },
  };
  return {
    bridge,
    calls,
    get closes() {
      return closes;
    },
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("registers the six composite workflows as native Pi tools with preferred routing", () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);

  assert.deepEqual([...harness.tools.keys()], [...SCI_COMPOSITE_TOOL_NAMES]);
  for (const name of SCI_COMPOSITE_TOOL_NAMES) {
    const tool = harness.tools.get(name);
    assert.ok(tool);
    assert.match(tool.description, /PREFERRED/);
    assert.ok(tool.parameters);
    assert.ok(tool.promptGuidelines.some((entry: string) => entry.includes(name)));
  }
});

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
  await writeFile(command, '#!/bin/sh\nprintf "spawned" > "$SCI_SENTINEL_MARKER"\nexit 1\n', {
    mode: 0o700,
  });

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
    /Could not start installed semantic-code-mcp/,
  );

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
    { symbol: "ToolWorkflowRouter", depth: 1 },
    new AbortController().signal,
    undefined,
    { cwd: "/workspace/repo" },
  );

  assert.deepEqual(fake.calls, [
    {
      name: "explore_symbol_impact",
      args: { symbol: "ToolWorkflowRouter", depth: 1 },
      cwd: "/workspace/repo",
    },
  ]);
  assert.match(result.content[0].text, /explore_symbol_impact/);
  assert.equal(result.details.transport, "mcp-stdio");
  assert.deepEqual(result.details.utilization.sciCompositeCalls, ["explore_symbol_impact"]);
  assert.deepEqual(result.details.utilization.nativeFallbacks, []);
  assert.deepEqual(result.details.utilization.rawShellAvoided, [
    "definition lookup",
    "AST symbol map",
    "graph expansion",
  ]);
});

test("session shutdown closes the long-lived MCP bridge", async () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  await harness.emit("session_shutdown");
  assert.equal(fake.closes, 1);
});

test("preview-only Pi tools reject apply before reaching SCI", async () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const safeWrite = harness.tools.get("safe_write");
  assert.ok(safeWrite);

  await assert.rejects(
    safeWrite.execute(
      "call-apply",
      { patch: "diff --git a/a b/a", apply: true },
      new AbortController().signal,
      undefined,
      { cwd: "/workspace/repo" },
    ),
    /safe_write is preview-only in Pi/,
  );
  assert.deepEqual(fake.calls, []);
});

test("preview-only results remove raw producer apply instructions from content and details", async () => {
  const bridge: SciBridge = {
    async callTool() {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              applied: false,
              next: "retry with apply:true and ALLOW_SNAPSHOT_APPLY=1",
              rollback: { command: "ALLOW_SNAPSHOT_APPLY=1 sci apply" },
              validationPlan: { rollback: { command: "sci apply --reverse" } },
            }),
          },
        ],
      };
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {},
  };
  const safeWrite = createHarness(bridge).tools.get("safe_write");
  assert.ok(safeWrite);
  const result = await safeWrite.execute(
    "call-preview",
    { patch: "diff --git a/a b/a" },
    new AbortController().signal,
    undefined,
    { cwd: "/workspace/repo" },
  );

  assert.doesNotMatch(result.content[0].text, /ALLOW_SNAPSHOT_APPLY|apply:true/);
  assert.doesNotMatch(JSON.stringify(result.details), /ALLOW_SNAPSHOT_APPLY|apply:true/);
  assert.match(result.content[0].text, /apply is unavailable through this native Pi surface/);
});

test("fails closed when installed SCI schemas drift from the registered Pi subset", () => {
  const advertised = SCI_COMPOSITE_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    inputSchema: structuredClone(spec.parameters) as SchemaFixture,
  }));
  assert.doesNotThrow(() => assertSciSchemaCompatibility(advertised));

  const safeWrite = advertised.find((tool) => tool.name === "safe_write");
  assert.ok(safeWrite?.inputSchema.properties?.brief);
  safeWrite.inputSchema.properties.brief.default = true;
  assert.throws(
    () => assertSciSchemaCompatibility(advertised),
    /safe_write\.brief: default differs/,
  );

  const nestedDrift = SCI_COMPOSITE_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    inputSchema: structuredClone(spec.parameters) as SchemaFixture,
  }));
  const patchChecks = nestedDrift.find((tool) => tool.name === "patch_checks_in_snapshot");
  assert.ok(patchChecks?.inputSchema.properties?.commands?.items);
  patchChecks.inputSchema.properties.commands.items.type = "number";
  assert.throws(
    () => assertSciSchemaCompatibility(nestedDrift),
    /patch_checks_in_snapshot\.commands\.items: type differs/,
  );
});

test("toolbox bundle exposes read and risk-gated mutating profiles", () => {
  const readFake = fakeBridge();
  const readHarness = createHarness(readFake.bridge);
  const read = registerToolboxBundle(readHarness.pi as never, { profile: "read" });
  assert.deepEqual(
    read.map((entry) => entry.name),
    ["explore_symbol_impact", "locate_confirm_definition"],
  );
  assert.ok(read.every((entry) => entry.risk === "read"));

  const mutatingFake = fakeBridge();
  const mutatingHarness = createHarness(mutatingFake.bridge);
  const mutating = registerToolboxBundle(mutatingHarness.pi as never, { profile: "mutating" });
  assert.deepEqual(
    mutating.map((entry) => entry.name),
    ["patch_checks_in_snapshot", "structural_patch_checks", "rename_safely", "safe_write"],
  );
  assert.ok(mutating.every((entry) => entry.risk === "mutating"));
});
