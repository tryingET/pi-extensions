#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSemanticCodeExtension } from "../src/extension.ts";
import { SciMcpBridge } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_NAMES } from "../src/tool-definitions.ts";

interface NativeToolResult {
  content: Array<{ type: string; text: string }>;
  details: {
    workflow: string;
    transport: string;
    elapsedMs: number;
    utilization: {
      sciCompositeCalls: string[];
      nativeFallbacks: string[];
      rawShellAvoided: string[];
    };
  };
}

interface RegisteredTool {
  name: string;
  execute: (...args: unknown[]) => Promise<NativeToolResult>;
}

interface InventoryEntry {
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  mode: number;
  sha256?: string;
  target?: string;
}

const workspace = await mkdtemp(path.join(tmpdir(), "pi-sci-dogfood-"));
const sourcePath = path.join(workspace, "src", "example.js");
await mkdir(path.dirname(sourcePath), { recursive: true });
const original = 'export function greet(name) {\n  return "hi " + name;\n}\n';
await writeFile(sourcePath, original, "utf8");
const beforeSourceInventory = await inventoryWorkspaceSource(workspace);

const bridge = new SciMcpBridge();
const tools = new Map<string, RegisteredTool>();
const shutdownHandlers: Array<() => Promise<void>> = [];
createSemanticCodeExtension({ bridgeFactory: () => bridge })({
  registerTool(tool: RegisteredTool) {
    tools.set(tool.name, tool);
  },
  on(event: string, handler: () => Promise<void>) {
    if (event === "session_shutdown") shutdownHandlers.push(handler);
  },
} as never);

const startedAt = Date.now();
try {
  const advertised = await bridge.advertisedToolNames(workspace);
  const missing = SCI_COMPOSITE_TOOL_NAMES.filter((name) => !advertised.includes(name));
  if (missing.length > 0) throw new Error(`installed MCP missing: ${missing.join(", ")}`);

  const explore = await execute("explore_symbol_impact", {
    symbol: "greet",
    file: "src/example.js",
    depth: 1,
    limit: 20,
  });
  const locate = await execute("locate_confirm_definition", {
    symbol: "greet",
    file: "src/example.js",
    precise: true,
  });

  const modified = original.replace('"hi " + name', '"hello " + name');
  const patch = unifiedPatch(original, modified, "src/example.js");
  const safeWrite = await execute("safe_write", {
    patch,
    commands: ["true"],
    timeoutSec: 30,
    brief: true,
  });
  const after = await readFile(sourcePath, "utf8");
  const afterSourceInventory = await inventoryWorkspaceSource(workspace);
  const sourceInventoryUnchanged =
    JSON.stringify(afterSourceInventory) === JSON.stringify(beforeSourceInventory);
  const safeWritePayload = parseToolPayload(safeWrite);

  const evidence = {
    schema: "pi.sci_composite_dogfood.v1",
    ok:
      tools.size === SCI_COMPOSITE_TOOL_NAMES.length &&
      missing.length === 0 &&
      explore.details.workflow === "explore_symbol_impact" &&
      locate.details.workflow === "locate_confirm_definition" &&
      safeWrite.details.workflow === "safe_write" &&
      safeWritePayload.ok === true &&
      safeWritePayload.applied === false &&
      after === original &&
      sourceInventoryUnchanged,
    transport: "mcp-stdio",
    elapsedMs: Date.now() - startedAt,
    nativeToolsRegistered: [...tools.keys()],
    advertisedCompositeTools: SCI_COMPOSITE_TOOL_NAMES.filter((name) => advertised.includes(name)),
    sciCompositeCalls: ["explore_symbol_impact", "locate_confirm_definition", "safe_write"],
    nativeFallbacks: [],
    rawShellAvoided: [
      "definition search plus AST map plus graph expansion",
      "fast lookup plus ambiguity detection plus precise retry",
      "snapshot creation plus patch staging plus checks plus rollback evidence",
    ],
    sourceInventory: {
      before: beforeSourceInventory,
      after: afterSourceInventory,
      unchanged: sourceInventoryUnchanged,
      excludedRuntimeBoundary: ".ontology/",
    },
    assertions: {
      nativeRegistrationComplete: tools.size === SCI_COMPOSITE_TOOL_NAMES.length,
      installedMcpContractComplete: missing.length === 0,
      exploreUsedSingleNativeCall: explore.details.utilization.sciCompositeCalls.length === 1,
      locateUsedSingleNativeCall: locate.details.utilization.sciCompositeCalls.length === 1,
      safeWriteUsedSingleNativeCall: safeWrite.details.utilization.sciCompositeCalls.length === 1,
      safeWriteChecksPassed: safeWritePayload.ok === true,
      safeWriteRemainedPreviewOnly: safeWritePayload.applied === false,
      previewLeftWorkspaceUnchanged: after === original,
      allSourceOutsideOntologyUnchanged: sourceInventoryUnchanged,
    },
    calls: [summarize(explore), summarize(locate), summarize(safeWrite)],
  };

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.ok) process.exitCode = 1;
} finally {
  for (const handler of shutdownHandlers) await handler();
  await rm(workspace, { recursive: true, force: true });
}

async function execute(name: string, params: Record<string, unknown>): Promise<NativeToolResult> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`native tool not registered: ${name}`);
  return tool.execute(`dogfood-${name}`, params, new AbortController().signal, undefined, {
    cwd: workspace,
  });
}

function summarize(result: NativeToolResult) {
  const payload = parseToolPayload(result);
  return {
    workflow: result.details.workflow,
    transport: result.details.transport,
    elapsedMs: result.details.elapsedMs,
    utilization: result.details.utilization,
    domainOk: payload.ok,
    applied: payload.applied,
    outputPreview: String(result.content[0]?.text ?? "").slice(0, 500),
  };
}

function parseToolPayload(result: NativeToolResult): Record<string, unknown> {
  const text = result.content[0]?.text;
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function inventoryWorkspaceSource(root: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];

  async function visit(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(root, relativeDir);
    const names = (await readdir(absoluteDir)).sort();
    for (const name of names) {
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      if (relativePath === ".ontology" || relativePath.startsWith(".ontology/")) continue;
      const absolutePath = path.join(root, relativePath);
      const stat = await lstat(absolutePath);
      const mode = stat.mode & 0o7777;
      if (stat.isDirectory()) {
        entries.push({ path: `${relativePath}/`, type: "directory", mode });
        await visit(relativePath);
      } else if (stat.isFile()) {
        const content = await readFile(absolutePath);
        entries.push({
          path: relativePath,
          type: "file",
          mode,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      } else if (stat.isSymbolicLink()) {
        entries.push({
          path: relativePath,
          type: "symlink",
          mode,
          target: await readlink(absolutePath),
        });
      } else {
        entries.push({ path: relativePath, type: "other", mode });
      }
    }
  }

  await visit("");
  return entries;
}

function unifiedPatch(originalText: string, modifiedText: string, target: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-sci-diff-"));
  try {
    const before = path.join(dir, "before");
    const after = path.join(dir, "after");
    writeFileSync(before, originalText, "utf8");
    writeFileSync(after, modifiedText, "utf8");
    const diff = spawnSync(
      "diff",
      ["-u", "--label", `a/${target}`, "--label", `b/${target}`, before, after],
      { encoding: "utf8" },
    );
    if (diff.status !== 1 || !diff.stdout) throw new Error(`diff failed: ${diff.stderr}`);
    return `diff --git a/${target} b/${target}\n${diff.stdout}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
