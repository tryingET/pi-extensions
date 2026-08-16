import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSemanticCodeExtension,
  SCI_COMPOSITE_TOOL_NAMES,
} from "../extensions/semantic-code-intelligence.ts";
import { validExplorePayload } from "../src/explore-result-validator.ts";
import { assertSciSchemaCompatibility, type SciBridge, SciMcpBridge } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_SPECS } from "../src/tool-definitions.ts";
import { registerToolboxBundle } from "../src/toolboxBundle.ts";

interface NativeToolResult {
  content: Array<{ type: string; text: string }>;
  details: {
    transport: string;
    truncated: boolean;
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
  enum?: unknown[];
  description?: string;
  items?: SchemaFixture;
  maxItems?: number;
};

type MutableExplorePacket = Record<string, unknown> & {
  editRisk: {
    level: unknown;
    reasons: unknown;
    signals: {
      publicApi: Record<string, unknown>;
      state: Record<string, unknown>;
      registry: Record<string, unknown>;
      tests: Record<string, unknown>;
    };
    analysis: { structural: Record<string, unknown> };
  };
};

function mutatedPacket(
  packet: Record<string, unknown>,
  mutate: (value: MutableExplorePacket) => void,
): MutableExplorePacket {
  const value = structuredClone(packet) as MutableExplorePacket;
  mutate(value);
  return value;
}

function fakeRiskSignal() {
  return {
    detected: false,
    status: "unknown",
    confidence: "unknown",
    files: [],
    hiddenFiles: 0,
    reasons: ["No supported structural evidence proved this signal."],
    provenance: [],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
}

function fakeStructuralAnalysis() {
  return {
    fileBudget: 64,
    candidateBudgetPerFile: 256,
    sourceFileByteBudget: 524_288,
    totalSourceByteBudget: 4_194_304,
    parseTimeoutMicros: 100_000,
    astNodeBudgetPerFile: 100_000,
    astWorkUnitBudgetPerFile: 10_000,
    targetOccurrenceBudgetPerFile: 4_096,
    symbolBodyBudgetPerFile: 256,
    writeNodeBudgetPerFile: 4_096,
    importNodeBudgetPerFile: 1_024,
    observedFiles: 1,
    selectedFiles: 1,
    attemptedFiles: 1,
    analyzedFiles: 0,
    failedFiles: 1,
    oversizedFiles: 0,
    omittedFiles: 0,
    filesOmittedByFileBudget: 0,
    filesOmittedByTotalByteBudget: 0,
    totalBudgetRejectedFiles: 0,
    unattemptedFiles: 0,
    observedCandidates: 1,
    selectedCandidates: 1,
    omittedCandidates: 0,
    candidatesOmittedByFileBudget: 0,
    rejectedCandidates: 0,
    sourceBytesRead: 0,
    sourceBytesAnalyzed: 0,
    totalSourceByteBudgetExhausted: false,
    astNodesInspected: 0,
    astNodeBudgetHits: 0,
    astWorkUnits: 0,
    astWorkBudgetHits: 0,
    targetOccurrencesObserved: 0,
    targetOccurrencesAnalyzed: 0,
    omittedTargetOccurrences: 0,
    symbolBodiesObserved: 0,
    symbolBodiesAnalyzed: 0,
    omittedSymbolBodies: 0,
    writeNodesObserved: 0,
    writeNodesAnalyzed: 0,
    omittedWriteNodes: 0,
    importNodesObserved: 0,
    importNodesAnalyzed: 0,
    omittedImportNodes: 0,
    limitations: ["Structural source analysis failed for one or more files."],
  };
}

function fakeEditRisk() {
  return {
    level: "unknown",
    reasons: ["No supported structural evidence established a low semantic edit risk."],
    signals: {
      publicApi: fakeRiskSignal(),
      state: fakeRiskSignal(),
      registry: fakeRiskSignal(),
      tests: fakeRiskSignal(),
    },
    analysis: { structural: fakeStructuralAnalysis() },
  };
}

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
  function fakeExploreDetails(mode: "standard" | "debug") {
    const section = {
      count: 0,
      emitted: 0,
      omitted: 0,
      truncated: false,
      items: [],
      shapeFailures: { invalid: 0, outsideWorkspace: 0 },
    };
    const provenance = {
      present: false,
      sources: [],
      fields: [],
      fieldCount: 0,
      fieldCountExact: true,
      fieldsTruncated: false,
    };
    const details = {
      schemaVersion: 1,
      mode,
      definitions: section,
      declarations: section,
      references: section,
      graph: {
        hasImpactEvidence: false,
        edges: { exports: section, callers: section, imports: section, callees: section },
      },
      provenance: { definitionLookup: provenance, symbolMap: provenance, graph: provenance },
      counts: {},
      omissions: [],
      limitations: [],
      disclosure: {
        packetByteBudget: 49_152,
        byteBudget: mode === "debug" ? 36_864 : 24_576,
        emittedBytes: 0,
        itemBudgetPerSection: 12,
        analyzedItemBudgetPerSection: 4_096,
        textCharacterBudget: 200,
        truncated: false,
        byteTruncated: false,
        omittedItems: 0,
        omittedRawFragments: 0,
        truncatedRawFragments: 0,
        packetOmissions: { impactFiles: 0, nextReads: 0, limitations: 0 },
      },
      ...(mode === "debug"
        ? {
            diagnostics: {
              timingsMs: {},
              subcalls: [],
              redaction: {
                policy: "bounded",
                absolutePaths: "redacted",
                secrets: "redacted",
                environment: "redacted",
                stackTraces: "redacted",
                connectionCredentials: "redacted",
              },
              rawFragmentBudgetBytes: 768,
            },
          }
        : {}),
    };
    for (let index = 0; index < 4; index++) {
      details.disclosure.emittedBytes = Buffer.byteLength(JSON.stringify(details), "utf8");
    }
    return details;
  }

  const calls: Array<{ name: string; args: Record<string, unknown>; cwd: string }> = [];
  let closes = 0;
  const bridge: SciBridge = {
    async callTool(name, args, cwd) {
      calls.push({ name, args, cwd });
      const payload =
        name === "explore_symbol_impact"
          ? {
              schemaVersion: 1,
              workflow: name,
              ok: true,
              symbol: String(args.symbol ?? "Target"),
              status: "confirmed",
              degraded: false,
              definition: { path: "src/target.ts", line: 1, kind: "function" },
              definitions: { count: 1 },
              impact: {
                files: [
                  { path: "src/target.ts", score: 120, reasons: ["definition"], signals: [] },
                ],
                totalFiles: 1,
                truncated: false,
              },
              editRisk: fakeEditRisk(),
              nextReads: [{ path: "src/target.ts", reason: "Start at the confirmed definition." }],
              limitations: [],
              details:
                args.mode === "standard" || args.mode === "debug"
                  ? fakeExploreDetails(args.mode)
                  : "mode: standard",
            }
          : { ok: true, workflow: name };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
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

test("explore_symbol_impact advertises all progressive disclosure modes", () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const tool = harness.tools.get("explore_symbol_impact");
  assert.ok(tool);
  const schema = tool.parameters as SchemaFixture;

  assert.deepEqual(schema.properties?.mode?.enum, ["compact", "standard", "debug"]);
  assert.equal(schema.properties?.mode?.default, "compact");
  assert.match(schema.properties?.mode?.description ?? "", /normalized bounded evidence/);
  assert.match(tool.description, /24 KiB/);
  assert.match(tool.description, /48 KiB/);
});

test("native validator accepts structural risk evidence and rejects forged nested receipts", async () => {
  const fake = fakeBridge();
  const result = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target" },
    "/workspace",
  );
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.equal(typeof text, "string");
  const packet = JSON.parse(String(text)) as Record<string, unknown>;
  assert.equal(validExplorePayload(packet, "compact"), true);

  const detected = structuredClone(packet) as MutableExplorePacket;
  detected.editRisk.level = "high";
  detected.editRisk.reasons = ["Target-specific export evidence may affect consumers."];
  detected.editRisk.signals.publicApi = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["The target declaration is exported."],
    provenance: ["ast.export_declaration"],
    namingFallback: {
      observed: true,
      confidence: "low",
      files: ["src/public-api.ts"],
      hiddenFiles: 0,
      reasons: ["A conventional public API name matched without structural proof."],
      provenance: ["fallback.naming"],
    },
  };
  assert.equal(validExplorePayload(detected, "compact"), true);

  const invalidPackets = [
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.status = "detected";
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.confidence = "low";
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.unbounded = [];
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.astWorkUnitBudgetPerFile = 200_000;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.observedCandidates = 2;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.sourceBytesRead = 4_194_305;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.limitations = Array.from({ length: 9 }, () => "x");
      return value;
    })(),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = ["high"];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.files = ["src/forged.ts"];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = "high";
      value.editRisk.reasons = ["forged"];
      Object.assign(value.editRisk.signals.publicApi, {
        detected: true,
        status: "detected",
        confidence: "high",
        files: [],
        hiddenFiles: 0,
        reasons: ["forged"],
        provenance: ["ast.export_declaration"],
      });
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.namingFallback = {
        observed: true,
        confidence: "low",
        files: [],
        hiddenFiles: 0,
        reasons: ["forged"],
        provenance: ["fallback.naming"],
      };
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.reasons = [""];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.level = "low";
      value.editRisk.reasons = [];
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 65,
        selectedFiles: 65,
        attemptedFiles: 1,
        unattemptedFiles: 64,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 1,
        unattemptedFiles: 3,
        observedCandidates: 1_025,
        selectedCandidates: 1_025,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 4,
        analyzedFiles: 4,
        failedFiles: 0,
        sourceBytesRead: 2_097_153,
        sourceBytesAnalyzed: 2_097_153,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 4,
        analyzedFiles: 4,
        failedFiles: 0,
        targetOccurrencesObserved: 16_385,
        targetOccurrencesAnalyzed: 16_385,
      });
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.failedFiles = 0;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.observedFiles = 2;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.astNodeBudgetHits = 1;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.astWorkBudgetHits = 1;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedCandidates: Number.MAX_SAFE_INTEGER + 1,
        selectedCandidates: Number.MAX_SAFE_INTEGER + 1,
        omittedCandidates: 1,
      });
    }),
  ];
  for (const invalid of invalidPackets)
    assert.equal(validExplorePayload(invalid, "compact"), false);
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
  assert.match(result.content[0].text, /explore_symbol_impact/);
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
    const tool = createHarness(bridge).tools.get("explore_symbol_impact");
    assert.ok(tool);
    const result = await tool.execute("call-bounded", { symbol: "Target" }, undefined, undefined, {
      cwd: "/srv/private",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
    assert.doesNotMatch(result.content[0].text, /\/srv\/private|xoxb-secret|x{1000}/);
    assert.equal("workspace" in result.details, false);
  }
});

test("native explore validation rejects nested unknown fields and false budget receipts", async () => {
  const fake = fakeBridge();
  const base = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target", mode: "standard" },
    "/workspace/repo",
  );
  const textItem = base.content?.find(
    (item) => item && typeof item === "object" && "text" in item && typeof item.text === "string",
  );
  assert.ok(textItem && typeof textItem === "object" && "text" in textItem);
  const packet = JSON.parse(String(textItem.text)) as Record<string, unknown>;
  const details = packet.details as Record<string, unknown>;
  const definitions = details.definitions as Record<string, unknown>;
  const disclosure = details.disclosure as Record<string, unknown>;
  definitions.raw = "unrestricted backend";
  disclosure.byteBudget = 50_000;
  disclosure.emittedBytes = 1;

  const bridge: SciBridge = {
    async callTool() {
      return { content: [{ type: "text", text: JSON.stringify(packet) }] };
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {},
  };
  const tool = createHarness(bridge).tools.get("explore_symbol_impact");
  assert.ok(tool);
  const result = await tool.execute(
    "call-nested-invalid",
    { symbol: "Target", mode: "standard" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "indeterminate");
  assert.doesNotMatch(result.content[0].text, /unrestricted backend/);
});

test("native explore validation accepts ten next reads and rejects eleven", async () => {
  const fake = fakeBridge();
  const base = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target" },
    "/workspace/repo",
  );
  const textItem = base.content?.find(
    (item) => item && typeof item === "object" && "text" in item && typeof item.text === "string",
  );
  assert.ok(textItem && typeof textItem === "object" && "text" in textItem);
  const packet = JSON.parse(String(textItem.text)) as Record<string, unknown>;

  for (const count of [10, 11]) {
    packet.nextReads = Array.from({ length: count }, (_, index) => ({
      path: `src/target-${index}.ts`,
      reason: "Bounded read",
    }));
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(packet) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const tool = createHarness(bridge).tools.get("explore_symbol_impact");
    assert.ok(tool);
    const result = await tool.execute(
      "call-next-reads",
      { symbol: "Target" },
      undefined,
      undefined,
      {
        cwd: "/workspace/repo",
      },
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, count === 10);
    if (count === 11) assert.equal(parsed.status, "indeterminate");
  }
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
