import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  createSemanticCodeExtension,
  SCI_COMPOSITE_TOOL_NAMES,
} from "../extensions/semantic-code-intelligence.ts";
import { validExplorePayload } from "../src/explore-result-validator.ts";
import {
  assertSciSchemaCompatibility,
  PI_SCI_MCP_CLIENT_INFO,
  type SciBridge,
  SciMcpBridge,
} from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_SPECS } from "../src/tool-definitions.ts";
import { registerToolboxBundle } from "../src/toolboxBundle.ts";
import { fakeExploreDetails } from "./explore-test-fixtures.ts";

test("package, lock, and MCP client metadata share one companion identity", async () => {
  const [packageText, lockText] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  ]);
  const packageManifest = JSON.parse(packageText) as { name: string; version: string };
  const lock = JSON.parse(lockText) as {
    name: string;
    version: string;
    packages: Record<string, { name?: string; version?: string }>;
  };
  const packageClientName = packageManifest.name.replace(/^@[^/]+\//, "");

  assert.equal(lock.name, packageManifest.name);
  assert.equal(lock.version, packageManifest.version);
  assert.equal(lock.packages[""]?.name, packageManifest.name);
  assert.equal(lock.packages[""]?.version, packageManifest.version);
  assert.equal(PI_SCI_MCP_CLIENT_INFO.name, packageClientName);
  assert.equal(PI_SCI_MCP_CLIENT_INFO.version, packageManifest.version);
});

interface NativeToolResult {
  content: Array<{ type: string; text: string }>;
  details: {
    transport: string;
    truncated: boolean;
    producerResultSanitized: boolean;
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
  renderCall?: (...args: unknown[]) => { render(width: number): string[] };
  renderResult?: (...args: unknown[]) => { render(width: number): string[] };
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
  degraded: unknown;
  impact: {
    files: Array<Record<string, unknown>>;
    totalFiles: unknown;
    truncated: unknown;
  };
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
    limitations: [
      "Structural source analysis failed for one or more files; affected signals remain unknown.",
    ],
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
  const entryRenderers = new Map<string, (...args: unknown[]) => unknown>();
  const customEntries: Array<{ type: "custom"; customType: string; data: unknown }> = [];
  const pi = {
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    registerEntryRenderer(customType: string, renderer: (...args: unknown[]) => unknown) {
      entryRenderers.set(customType, renderer);
    },
    appendEntry(customType: string, data: unknown) {
      customEntries.push({ type: "custom", customType, data });
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
    entryRenderers,
    customEntries,
    async emit(event: string) {
      const ctx = {
        cwd: "/workspace/repo",
        sessionManager: { getBranch: () => customEntries },
      };
      for (const handler of handlers.get(event) ?? []) await handler({}, ctx);
    },
  };
}

function fakeBridge() {
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
  assert.match(schema.properties?.mode?.description ?? "", /selected normalized evidence/);
  assert.match(
    schema.properties?.mode?.description ?? "",
    /raw detail retained only.*expanded TUI/,
  );
  assert.match(tool.description, /concise decision projection/);
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
  detected.editRisk.reasons = [
    "Target-specific export evidence means downstream consumers may be affected.",
  ];
  Object.assign(detected.editRisk.analysis.structural, {
    analyzedFiles: 1,
    failedFiles: 0,
    sourceBytesRead: 100,
    sourceBytesAnalyzed: 100,
    astNodesInspected: 2,
    astWorkUnits: 6,
    targetOccurrencesObserved: 1,
    targetOccurrencesAnalyzed: 1,
    limitations: [],
  });
  detected.editRisk.signals.publicApi = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["An exact target occurrence participates directly in an export declaration."],
    provenance: ["ast.export_declaration"],
    namingFallback: {
      observed: true,
      confidence: "low",
      files: ["src/public-api.ts"],
      hiddenFiles: 0,
      reasons: [
        "A conventional public/api/index/export name matched, but no target-specific export was proved.",
      ],
      provenance: ["fallback.naming"],
    },
  };
  detected.impact.files.push({
    path: "src/public-api.ts",
    score: 1,
    reasons: ["reference"],
    signals: [],
  });
  detected.impact.totalFiles = 2;
  assert.equal(validExplorePayload(detected, "compact"), true);

  const graphDetectedWithFailedSourceAnalysis = structuredClone(packet) as MutableExplorePacket;
  graphDetectedWithFailedSourceAnalysis.editRisk.level = "high";
  graphDetectedWithFailedSourceAnalysis.editRisk.reasons = [
    "Target-specific export evidence means downstream consumers may be affected.",
  ];
  graphDetectedWithFailedSourceAnalysis.editRisk.signals.publicApi = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["The graph backend returned a target-matching export declaration."],
    provenance: ["graph.exports"],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(graphDetectedWithFailedSourceAnalysis, "compact"), true);

  const externalAssignmentWithFailedSourceAnalysis = structuredClone(
    packet,
  ) as MutableExplorePacket;
  externalAssignmentWithFailedSourceAnalysis.editRisk.level = "high";
  externalAssignmentWithFailedSourceAnalysis.editRisk.reasons = [
    "Structural write evidence requires invariant review.",
  ];
  externalAssignmentWithFailedSourceAnalysis.editRisk.signals.state = {
    detected: true,
    status: "detected",
    confidence: "medium",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["An AST-validated target occurrence is an assignment."],
    provenance: ["reference.assignment"],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(externalAssignmentWithFailedSourceAnalysis, "compact"), true);

  const postReadParseFailure = structuredClone(packet) as MutableExplorePacket;
  Object.assign(postReadParseFailure.editRisk.analysis.structural, {
    sourceBytesRead: 100,
    sourceBytesAnalyzed: 100,
  });
  assert.equal(validExplorePayload(postReadParseFailure, "compact"), true);

  const truncatedStateReasons = structuredClone(detected) as MutableExplorePacket;
  truncatedStateReasons.editRisk.reasons = ["Structural write evidence requires invariant review."];
  truncatedStateReasons.editRisk.signals.publicApi = fakeRiskSignal();
  Object.assign(truncatedStateReasons.editRisk.analysis.structural, {
    astNodesInspected: 4,
    astWorkUnits: 12,
    symbolBodiesObserved: 1,
    symbolBodiesAnalyzed: 1,
    writeNodesObserved: 1,
    writeNodesAnalyzed: 1,
  });
  truncatedStateReasons.editRisk.signals.state = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: [
      "SCIP marks this target occurrence as a write access.",
      "The target occurrence is structurally on the written side of an assignment.",
      "The target occurrence is structurally updated.",
      "An AST-validated target occurrence is an assignment.",
    ],
    provenance: [
      "ast.definition_write",
      "ast.write_occurrence",
      "reference.assignment",
      "scip.roles.write",
    ],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(truncatedStateReasons, "compact"), true);

  const conservativeBreadthRisk = structuredClone(packet) as MutableExplorePacket;
  conservativeBreadthRisk.editRisk.level = "medium";
  conservativeBreadthRisk.editRisk.reasons = [];
  Object.assign(conservativeBreadthRisk.impact as Record<string, unknown>, {
    totalFiles: 4,
    truncated: true,
  });
  assert.equal(validExplorePayload(conservativeBreadthRisk, "compact"), true);

  const exhausted = structuredClone(packet) as MutableExplorePacket;
  Object.assign(exhausted.editRisk.analysis.structural, {
    observedFiles: 9,
    selectedFiles: 9,
    attemptedFiles: 9,
    analyzedFiles: 8,
    failedFiles: 0,
    totalBudgetRejectedFiles: 1,
    unattemptedFiles: 0,
    omittedFiles: 1,
    filesOmittedByTotalByteBudget: 1,
    observedCandidates: 9,
    selectedCandidates: 9,
    sourceBytesRead: 4_000_000,
    sourceBytesAnalyzed: 4_000_000,
    astNodesInspected: 8,
    astWorkUnits: 8,
    totalSourceByteBudgetExhausted: true,
    limitations: [
      "Structural source analysis reached its total byte budget; remaining signals remain unknown.",
      "Structural source files exceeded an analysis budget and were omitted deterministically.",
    ],
  });
  assert.equal(validExplorePayload(exhausted, "compact"), true);

  const mixedFailuresAcrossTwoFiles = structuredClone(packet) as MutableExplorePacket;
  Object.assign(mixedFailuresAcrossTwoFiles.editRisk.analysis.structural, {
    observedFiles: 2,
    selectedFiles: 2,
    attemptedFiles: 2,
    failedFiles: 2,
    observedCandidates: 2,
    selectedCandidates: 2,
    sourceBytesRead: 200,
    sourceBytesAnalyzed: 100,
  });
  assert.equal(validExplorePayload(mixedFailuresAcrossTwoFiles, "compact"), true);

  const lawfulPacketFitRemoval = mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
    value.impact.files = [];
    value.impact.totalFiles = 1;
    value.impact.truncated = true;
  });
  assert.equal(validExplorePayload(lawfulPacketFitRemoval, "compact"), true);

  const lawfulHiddenSignal = mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
    value.impact.totalFiles = 2;
    value.impact.truncated = true;
    value.editRisk.signals.publicApi.hiddenFiles = 1;
  });
  assert.equal(validExplorePayload(lawfulHiddenSignal, "compact"), true);

  const lawfulPostParseFailureOverlap = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      sourceBytesRead: 100,
      sourceBytesAnalyzed: 100,
    });
  });
  assert.equal(validExplorePayload(lawfulPostParseFailureOverlap, "compact"), true);

  const lawfulEarlyNodeBudgetHit = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      failedFiles: 0,
      sourceBytesRead: 100,
      sourceBytesAnalyzed: 100,
      astNodesInspected: 10_000,
      astNodeBudgetHits: 1,
      astWorkUnits: 10_000,
      astWorkBudgetHits: 1,
      limitations: [
        "Structural AST analysis reached a deterministic work budget; affected signals remain unknown.",
      ],
    });
  });
  assert.equal(validExplorePayload(lawfulEarlyNodeBudgetHit, "compact"), true);

  const lawfulWriteInspection = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      failedFiles: 0,
      sourceBytesRead: 1,
      sourceBytesAnalyzed: 1,
      astNodesInspected: 1,
      astWorkUnits: 2,
      writeNodesObserved: 1,
      writeNodesAnalyzed: 1,
      limitations: [],
    });
  });
  assert.equal(validExplorePayload(lawfulWriteInspection, "compact"), true);

  const degraded = mutatedPacket(packet, (value) => {
    value.degraded = true;
    value.editRisk.level = "high";
    value.editRisk.reasons = ["Impact evidence is degraded by failed or unusable evidence."];
  });
  assert.equal(validExplorePayload(degraded, "compact"), true);

  const invalidPackets = [
    mutatedPacket(packet, (value) => {
      value.impact.truncated = true;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.totalFiles = 2;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.totalFiles = 0;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.files.push(structuredClone(value.impact.files[0] as Record<string, unknown>));
      value.impact.totalFiles = 2;
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.editRisk.signals.publicApi.hiddenFiles = 1;
    }),
    mutatedPacket(lawfulPacketFitRemoval, (value) => {
      value.editRisk.signals.publicApi.files = [];
      value.editRisk.signals.publicApi.hiddenFiles = 1;
    }),
    mutatedPacket(lawfulPacketFitRemoval, (value) => {
      value.editRisk.signals.publicApi.namingFallback = {
        observed: true,
        confidence: "low",
        files: [],
        hiddenFiles: 1,
        reasons: [
          "A conventional public/api/index/export name matched, but no target-specific export was proved.",
        ],
        provenance: ["fallback.naming"],
      };
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.editRisk.signals.publicApi.files = ["src/forged.ts"];
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.impact.files = [];
      value.impact.truncated = true;
      Object.assign(value.editRisk.signals.publicApi, {
        files: ["src/target.ts"],
        hiddenFiles: 1,
      });
    }),
    mutatedPacket(lawfulHiddenSignal, (value) => {
      value.editRisk.signals.publicApi.files = ["src/target.ts", "src/target.ts"];
      value.editRisk.signals.publicApi.hiddenFiles = 0;
    }),
    mutatedPacket(detected, (value) => {
      const fallback = value.editRisk.signals.publicApi.namingFallback as Record<string, unknown>;
      fallback.files = ["src/forged.ts"];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(lawfulPostParseFailureOverlap, (value) => {
      value.editRisk.analysis.structural.astNodesInspected = 1;
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(lawfulWriteInspection, (value) => {
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 2,
        attemptedFiles: 2,
        analyzedFiles: 1,
        failedFiles: 1,
        oversizedFiles: 1,
        observedCandidates: 2,
        selectedCandidates: 2,
        sourceBytesRead: 1_048_576,
        sourceBytesAnalyzed: 1_048_576,
        limitations: [
          "Oversized structural source files were not read or parsed; affected signals remain unknown.",
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 65,
        selectedFiles: 64,
        attemptedFiles: 64,
        failedFiles: 64,
        omittedFiles: 1,
        filesOmittedByFileBudget: 1,
        observedCandidates: 1_064,
        selectedCandidates: 64,
        omittedCandidates: 1_000,
        candidatesOmittedByFileBudget: 1_000,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
          "Structural source files exceeded an analysis budget and were omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 1,
        attemptedFiles: 1,
        omittedFiles: 1,
        filesOmittedByFileBudget: 1,
        observedCandidates: 2,
        selectedCandidates: 1,
        omittedCandidates: 1,
        candidatesOmittedByFileBudget: 1,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
          "Structural source files exceeded an analysis budget and were omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedCandidates: 2,
        selectedCandidates: 1,
        omittedCandidates: 1,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 1,
        targetOccurrencesObserved: 1,
        omittedTargetOccurrences: 1,
        limitations: [
          "Structural AST evidence exceeded an item budget and was omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 3,
        targetOccurrencesObserved: 1,
        targetOccurrencesAnalyzed: 1,
        writeNodesObserved: 1,
        writeNodesAnalyzed: 1,
        importNodesObserved: 1,
        importNodesAnalyzed: 1,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        targetOccurrencesObserved: 1,
        targetOccurrencesAnalyzed: 1,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 1,
        targetOccurrencesObserved: 4_096,
        targetOccurrencesAnalyzed: 4_096,
        symbolBodiesObserved: 256,
        symbolBodiesAnalyzed: 256,
        writeNodesObserved: 4_096,
        writeNodesAnalyzed: 4_096,
        importNodesObserved: 1_024,
        importNodesAnalyzed: 1_024,
        limitations: [],
      });
    }),
    mutatedPacket(lawfulEarlyNodeBudgetHit, (value) => {
      value.editRisk.analysis.structural.astNodesInspected = 1;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.limitations = [];
    }),
    mutatedPacket(lawfulEarlyNodeBudgetHit, (value) => {
      value.editRisk.analysis.structural.limitations = [];
    }),
    mutatedPacket(degraded, (value) => {
      value.editRisk.reasons = ["Impact evidence is degraded by failed subcalls."];
    }),
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
      value.editRisk.level = "medium";
      value.editRisk.reasons = [];
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
      value.editRisk.level = "low";
      value.editRisk.reasons = [];
    }),
    mutatedPacket(detected, (value) => {
      Object.assign(value.editRisk.analysis.structural, fakeStructuralAnalysis());
    }),
    mutatedPacket(detected, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 0,
        sourceBytesAnalyzed: 0,
        astNodesInspected: 0,
        astWorkUnits: 0,
      });
    }),
    mutatedPacket(exhausted, (value) => {
      value.editRisk.analysis.structural.sourceBytesAnalyzed = 0;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 200,
        sourceBytesAnalyzed: 100,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 524_288,
        sourceBytesAnalyzed: 0,
      });
    }),
    mutatedPacket(mixedFailuresAcrossTwoFiles, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 1_000_000,
        sourceBytesAnalyzed: 300_000,
      });
    }),
    mutatedPacket(truncatedStateReasons, (value) => {
      value.editRisk.signals.state.reasons = Array.from(
        { length: 4 },
        () => "The target occurrence is structurally updated.",
      );
    }),
    mutatedPacket(truncatedStateReasons, (value) => {
      value.editRisk.signals.state.reasons = [
        "The target occurrence is structurally on the written side of an assignment.",
        "The target occurrence is structurally updated.",
        "An AST-validated target occurrence is an assignment.",
        "The target definition body contains a structural member or indexed write; shared-state aliasing is not proved.",
      ];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.signals.publicApi.provenance = ["fallback.naming"];
      value.editRisk.signals.publicApi.reasons = [
        "A conventional public/api/index/export name matched, but no target-specific export was proved.",
      ];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.signals.publicApi.reasons = ["forged structural reason"];
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 2,
        attemptedFiles: 1,
        unattemptedFiles: 1,
        omittedFiles: 1,
        filesOmittedByTotalByteBudget: 1,
        totalSourceByteBudgetExhausted: true,
      });
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
  const evidence = details.evidence as Record<string, unknown>;
  const definitions = evidence.definitions as Record<string, unknown>;
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
    if (count === 10) {
      assert.equal(parsed.schema, "pi.sci_explore_model.v1");
      assert.equal(parsed.status, "confirmed");
    } else {
      assert.equal(parsed.ok, false);
      assert.equal(parsed.status, "indeterminate");
    }
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
              workflow: "safe_write",
              ok: true,
              applied: false,
              next: "retry with apply:true and ALLOW_SNAPSHOT_APPLY=1",
              rollback: { command: "ALLOW_SNAPSHOT_APPLY=1 sci apply /workspace/repo" },
              validationPlan: {
                status: "checks_passed",
                apply: { enabled: true },
                rollback: { command: "sci apply --reverse /workspace/repo/.ontology/snapshot" },
              },
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

  assert.doesNotMatch(
    result.content[0].text,
    /ALLOW_SNAPSHOT_APPLY|apply:true|\/workspace\/repo|"apply":/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.details),
    /ALLOW_SNAPSHOT_APPLY|apply:true|\/workspace\/repo/,
  );
  assert.equal(JSON.parse(result.content[0].text).ok, true);
  assert.match(result.content[0].text, /mutation is unavailable through this native Pi surface/i);
});

test("preview-only output rejects applied state and recursive apply instructions", async () => {
  const payloads = [
    { workflow: "safe_write", ok: true, applied: true },
    {
      workflow: "safe_write",
      ok: true,
      applied: false,
      validationPlan: { status: "checks_passed" },
      nested: { instructions: "apply the snapshot now" },
    },
  ];

  for (const payload of payloads) {
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const safeWrite = createHarness(bridge).tools.get("safe_write");
    assert.ok(safeWrite);
    const result = await safeWrite.execute("call-preview-invalid", {}, undefined, undefined, {
      cwd: "/workspace/repo",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
    assert.doesNotMatch(result.content[0].text, /ALLOW_SNAPSHOT_APPLY|applied.true/);
  }
});

test("contained file URIs become relative while outside paths and diagnostics fail closed", async () => {
  const workspace = "/workspace/repo";
  const payloads: Array<{
    payload: Record<string, unknown>;
    accepted: boolean;
    expectedUri?: string;
  }> = [
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: pathToFileURL(path.join(workspace, "src/target.ts")).href }],
      },
      accepted: true,
      expectedUri: "src/target.ts",
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: pathToFileURL("/srv/private/target.ts").href }],
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        stderr: "compiler details",
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        nested: { cwd: workspace },
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        backend: "ast-grep",
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend wrote /srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "inspect file:///srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend wrote [/srv/private/target.ts]",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        nested: { "/srv/private/target.ts": "hidden key" },
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: "../../srv/private/target.ts" }],
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend%20wrote%20%2Fsrv%2Fprivate%2Ftarget.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend%252520wrote%252520%25252Fsrv%25252Fprivate%25252Ftarget.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "snapshot:////srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "safe_write",
        ok: true,
        applied: false,
        validationPlan: { status: "checks_passed" },
      },
      accepted: false,
    },
  ];

  for (const { payload, accepted, expectedUri } of payloads) {
    if (payload.workflow === "locate_confirm_definition") {
      payload.symbol ??= "Target";
      payload.decision ??= "fast";
      payload.definitions ??= [{ uri: pathToFileURL(path.join(workspace, "src/default.ts")).href }];
    }
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const locate = createHarness(bridge).tools.get("locate_confirm_definition");
    assert.ok(locate);
    const result = await locate.execute("call-disclosure", {}, undefined, undefined, {
      cwd: workspace,
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, accepted);
    assert.doesNotMatch(result.content[0].text, /\/workspace\/repo|\/srv\/private|stderr/);
    if (accepted) {
      if (expectedUri) assert.equal(parsed.definitions[0].uri, expectedUri);
      assert.equal(result.details.producerResultSanitized, true);
    } else {
      assert.equal(parsed.status, "indeterminate");
    }
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
      tool: "safe_write",
      payload: { workflow: "safe_write", ok: true, applied: false, validationPlan: {} },
    },
    {
      tool: "structural_patch_checks",
      payload: { workflow: "structural_patch_checks", ok: true, applied: false },
    },
    {
      tool: "patch_checks_in_snapshot",
      payload: { workflow: "patch_checks_in_snapshot", ok: true },
    },
    {
      tool: "rename_safely",
      payload: { workflow: "rename_safely", ok: true },
    },
  ];

  for (const { tool: toolName, payload } of cases) {
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
    const result = await tool.execute("call-incomplete", {}, undefined, undefined, {
      cwd: "/workspace/repo",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
  }
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
