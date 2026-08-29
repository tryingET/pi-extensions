/**
summary: "SCI extension shared test fixtures; split from extension.test.ts."
read_when:
  - "You change shared test fixtures behavior."
*/
import { access } from "node:fs/promises";
import { createSemanticCodeExtension } from "../extensions/semantic-code-intelligence.ts";
import type { SciBridge } from "../src/mcp-bridge.ts";
import { fakeExploreDetails } from "./explore-test-fixtures.ts";

export interface NativeToolResult {
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

export interface RegisteredTool {
  name: string;
  description: string;
  parameters: unknown;
  promptGuidelines: string[];
  execute: (...args: unknown[]) => Promise<NativeToolResult>;
  renderCall?: (...args: unknown[]) => { render(width: number): string[] };
  renderResult?: (...args: unknown[]) => { render(width: number): string[] };
}

export type EventHandler = (...args: unknown[]) => unknown;

export type SchemaFixture = {
  type?: string;
  properties?: Record<string, SchemaFixture>;
  required?: string[];
  default?: unknown;
  enum?: unknown[];
  description?: string;
  items?: SchemaFixture;
  maxItems?: number;
};

export type MutableExplorePacket = Record<string, unknown> & {
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

export function mutatedPacket(
  packet: Record<string, unknown>,
  mutate: (value: MutableExplorePacket) => void,
): MutableExplorePacket {
  const value = structuredClone(packet) as MutableExplorePacket;
  mutate(value);
  return value;
}

export function fakeRiskSignal() {
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

export function fakeStructuralAnalysis() {
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

export function fakeEditRisk() {
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

export function createHarness(bridge: SciBridge) {
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

export function fakeBridge() {
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

export async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export const PI_DOOR_NAMES = [
  "explore_symbol_impact",
  "locate_confirm_definition",
  "preview_patch_checks",
  "rename_safely",
] as const;
