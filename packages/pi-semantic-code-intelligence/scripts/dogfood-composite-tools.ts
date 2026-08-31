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
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSemanticCodeExtension } from "../src/extension.ts";
import { SciMcpBridge } from "../src/mcp-bridge.ts";
import {
  isSnapshotRefV1,
  isWorkspaceRefV1,
  isWorkspaceStateRefV1,
} from "../src/nexus-workspace.ts";
import { SCI_COMPOSITE_TOOL_NAMES } from "../src/tool-definitions.ts";

// One preview door routes to both patch workflows: four registered doors cover five SCI workflows.
const PI_DOOR_COUNT = SCI_COMPOSITE_TOOL_NAMES.length - 1;

interface RenderComponent {
  render(width: number): string[];
}

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
    explorePresentation?: {
      modelBytes: number;
      operatorBytes: number;
      operatorDetailRetained: boolean;
      operatorDetailPersisted: boolean;
    };
  };
}

interface RegisteredTool {
  name: string;
  execute: (...args: unknown[]) => Promise<NativeToolResult>;
  renderCall?: (...args: unknown[]) => RenderComponent;
  renderResult?: (...args: unknown[]) => RenderComponent;
}

interface CapturedCustomEntry {
  customType: string;
  data: unknown;
}

type CapturedEntryRenderer = (...args: unknown[]) => RenderComponent | undefined;

interface InventoryEntry {
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  mode: number;
  sha256?: string;
  target?: string;
}

const workspace = await mkdtemp(path.join(tmpdir(), "pi-sci-dogfood-"));
const outsideWorkspace = await mkdtemp(path.join(tmpdir(), "pi-sci-outside-"));
const sourcePath = path.join(workspace, "src", "example.js");
const outsideSourcePath = path.join(outsideWorkspace, "outside.js");
const outsideLinkRelative = "src/outside-link.js";
const outsideLinkPath = path.join(workspace, outsideLinkRelative);
await mkdir(path.dirname(sourcePath), { recursive: true });
const original = 'export function greet(name) {\n  return "hi " + name;\n}\n';
await writeFile(sourcePath, original, "utf8");
await writeFile(outsideSourcePath, "export const outside = true;\n", "utf8");
await writeFile(path.join(workspace, ".gitignore"), ".ontology/\n", "utf8");
for (const args of [
  ["init", "-q"],
  ["config", "user.email", "pi-sci-dogfood@example.invalid"],
  ["config", "user.name", "Pi SCI Dogfood"],
  ["add", ".gitignore", "src/example.js"],
  ["commit", "-qm", "fixture"],
]) {
  const git = spawnSync("git", args, { cwd: workspace, stdio: "pipe" });
  if (git.status !== 0) throw new Error("failed to initialize bounded dogfood repository");
}
const beforeSourceInventory = await inventoryWorkspaceSource(workspace);

const bridge = new SciMcpBridge();
const tools = new Map<string, RegisteredTool>();
const shutdownHandlers: Array<() => Promise<void>> = [];
const customEntries: CapturedCustomEntry[] = [];
const entryRenderers = new Map<string, CapturedEntryRenderer>();
createSemanticCodeExtension({ bridgeFactory: () => bridge })({
  registerTool(tool: RegisteredTool) {
    tools.set(tool.name, tool);
  },
  registerEntryRenderer(customType: string, renderer: CapturedEntryRenderer) {
    entryRenderers.set(customType, renderer);
  },
  appendEntry(customType: string, data: unknown) {
    customEntries.push({ customType, data });
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
  const exploreArgs = {
    symbol: "greet",
    file: "src/example.js",
    depth: 1,
    limit: 20,
  };
  const explore = await execute("explore_symbol_impact", exploreArgs);
  const locate = await execute("locate_confirm_definition", {
    symbol: "greet",
    file: "src/example.js",
    precise: true,
  });
  const noDefinition = await execute("locate_confirm_definition", {
    symbol: "MissingForAk4863",
    file: "src/example.js",
    precise: true,
  });
  await symlink(outsideSourcePath, outsideLinkPath);
  const workspaceBoundaryFailure = await executeExpectingFailure("locate_confirm_definition", {
    symbol: "outside",
    file: outsideLinkRelative,
    precise: true,
  });
  await rm(outsideLinkPath, { force: true });
  const modified = original.replace('"hi " + name', '"hello " + name');
  const patch = unifiedPatch(original, modified, "src/example.js");
  // one preview door, both input modes
  const patchChecks = await execute("preview_patch_checks", {
    patch,
    commands: ["true"],
    timeoutSec: 30,
  });
  const structural = await execute("preview_patch_checks", {
    language: "javascript",
    pattern: "function greet($NAME) { $$$BODY }",
    rewrite: "function welcome($NAME) { $$$BODY }",
    paths: ["src/example.js"],
    commands: ["true"],
    timeoutSec: 30,
  });
  const after = await readFile(sourcePath, "utf8");
  const afterSourceInventory = await inventoryWorkspaceSource(workspace);
  const sourceInventoryUnchanged =
    JSON.stringify(afterSourceInventory) === JSON.stringify(beforeSourceInventory);
  const explorePayload = parseToolPayload(explore);
  const locatePayload = parseToolPayload(locate);
  const noDefinitionPayload = parseToolPayload(noDefinition);
  const patchChecksPayload = parseToolPayload(patchChecks);
  const structuralPayload = parseToolPayload(structural);
  const exploreDecision = record(explorePayload.decision);
  const explorePresentation = explore.details.explorePresentation;
  const exploreConfirmed =
    explorePayload.schema === "pi.sci_explore_model.v1" &&
    explorePayload.status === "confirmed" &&
    exploreDecision?.definitionConfirmed === true;
  const exploreOperatorDetailPersisted =
    explorePresentation?.operatorDetailRetained === true &&
    explorePresentation.operatorDetailPersisted === true &&
    customEntries.some((entry) => entry.customType === "pi-sci-explore-operator-v1");
  const exploreModelSmallerThanOperator =
    Number.isSafeInteger(explorePresentation?.modelBytes) &&
    Number.isSafeInteger(explorePresentation?.operatorBytes) &&
    Number(explorePresentation?.modelBytes) < Number(explorePresentation?.operatorBytes) &&
    !JSON.stringify(explore.details).includes('"packet"');
  const rendering = verifyExploreRendering(exploreArgs, explore);
  const locateDefinitionConfirmed = confirmedLocatePayload(locatePayload);
  const noDefinitionNonError =
    noDefinitionPayload.workflow === "locate_confirm_definition" &&
    noDefinitionPayload.ok === false &&
    Array.isArray(noDefinitionPayload.definitions) &&
    noDefinitionPayload.definitions.length === 0;
  const expectedWorkspaceBoundaryMessage =
    "SCI workflow locate_confirm_definition rejected the request (reason: outside_workspace). Use a repo-relative path in a Pi session started at the target repository root. A shell cd does not rebind this Pi session's workspace; start a target-root Pi session and retry. Producer diagnostics, paths, and stderr were withheld.";
  const workspaceBoundaryActionable =
    workspaceBoundaryFailure.threw &&
    workspaceBoundaryFailure.message === expectedWorkspaceBoundaryMessage;
  const workspaceBoundarySanitized =
    !workspaceBoundaryFailure.message.includes(outsideLinkRelative) &&
    !workspaceBoundaryFailure.message.includes(outsideSourcePath) &&
    !workspaceBoundaryFailure.message.includes(workspace) &&
    !workspaceBoundaryFailure.message.includes(
      "Requested path must stay within the configured workspace",
    ) &&
    !workspaceBoundaryFailure.message.includes(
      "Use a path within the configured workspace, expressed as a workspace-relative path or a contained absolute path.",
    );
  const patchChecksPassed = previewChecksPassed(patchChecksPayload, "patch_checks_in_snapshot");
  const structuralChecksPassed = previewChecksPassed(structuralPayload, "structural_patch_checks");
  const structuralBackendWithheld = !/"backend"\s*:/.test(
    String(structural.content[0]?.text ?? ""),
  );
  const nexusWorkspaceIds = [
    explorePayload.workspace,
    locatePayload.workspace,
    noDefinitionPayload.workspace,
    patchChecksPayload.workspace,
    structuralPayload.workspace,
  ]
    .filter(isWorkspaceRefV1)
    .map((reference) => reference.workspaceId);
  const nexusWorkspaceStable =
    nexusWorkspaceIds.length === 5 && new Set(nexusWorkspaceIds).size === 1;
  const nexusStateBound =
    isWorkspaceStateRefV1(explorePayload.state) &&
    isWorkspaceStateRefV1(locatePayload.state) &&
    explorePayload.state.workspaceId === locatePayload.state.workspaceId;
  const nexusSnapshotBound =
    isSnapshotRefV1(patchChecksPayload.snapshotRef) &&
    isSnapshotRefV1(structuralPayload.snapshotRef) &&
    patchChecksPayload.snapshotRef.revision === 1 &&
    structuralPayload.snapshotRef.revision === 1;

  const evidence = {
    schema: "pi.sci_composite_dogfood.v1",
    ok:
      tools.size === PI_DOOR_COUNT &&
      missing.length === 0 &&
      explore.details.workflow === "explore_symbol_impact" &&
      exploreConfirmed &&
      exploreOperatorDetailPersisted &&
      exploreModelSmallerThanOperator &&
      rendering.widthSafe &&
      rendering.callConcise &&
      rendering.collapsedConcise &&
      rendering.expandedReadable &&
      rendering.durableReadable &&
      locate.details.workflow === "locate_confirm_definition" &&
      locateDefinitionConfirmed &&
      noDefinitionNonError &&
      workspaceBoundaryActionable &&
      workspaceBoundarySanitized &&
      patchChecks.details.workflow === "patch_checks_in_snapshot" &&
      patchChecksPassed &&
      patchChecksPayload.applied !== true &&
      structural.details.workflow === "structural_patch_checks" &&
      structuralChecksPassed &&
      structuralPayload.applied === false &&
      structuralBackendWithheld &&
      nexusWorkspaceStable &&
      nexusStateBound &&
      nexusSnapshotBound &&
      after === original &&
      sourceInventoryUnchanged,
    transport: "mcp-stdio",
    elapsedMs: Date.now() - startedAt,
    nativeToolsRegistered: [...tools.keys()],
    advertisedCompositeTools: SCI_COMPOSITE_TOOL_NAMES.filter((name) => advertised.includes(name)),
    retainedCustomEntryTypes: customEntries.map((entry) => entry.customType),
    rendering,
    expectedProducerContract: {
      akTask: 4862,
      commit: "b4f3c96ed4fc77439390426393244362f14334b2",
      reason: "outside_workspace",
    },
    workspaceBoundary: {
      nexus: {
        workspaceStable: nexusWorkspaceStable,
        stateBound: nexusStateBound,
        exactSnapshotRefs: nexusSnapshotBound,
        workspaceId: nexusWorkspaceIds[0] ?? null,
      },
      workflow: "locate_confirm_definition",
      threw: workspaceBoundaryFailure.threw,
      actionable: workspaceBoundaryActionable,
      sanitized: workspaceBoundarySanitized,
      reason: "outside_workspace",
      inputPosture: "repo_relative_symlink",
      finalAuthority: "sci_realpath_containment",
    },
    sciCompositeCalls: [
      "explore_symbol_impact",
      "locate_confirm_definition",
      "patch_checks_in_snapshot",
      "structural_patch_checks",
    ],
    nativeFallbacks: [],
    rawShellAvoided: [
      "definition search plus AST map plus graph expansion",
      "fast lookup plus ambiguity detection plus precise retry",
      "snapshot creation plus patch staging plus checks",
      "structural search plus rewrite diff generation plus snapshot checks",
    ],
    sourceInventory: {
      before: beforeSourceInventory,
      after: afterSourceInventory,
      unchanged: sourceInventoryUnchanged,
      excludedRuntimeBoundary: ".ontology/",
    },
    assertions: {
      nativeRegistrationComplete: tools.size === PI_DOOR_COUNT,
      installedMcpContractComplete: missing.length === 0,
      exploreUsedSingleNativeCall: explore.details.utilization.sciCompositeCalls.length === 1,
      exploreConfirmed,
      exploreProjectionSchema: explorePayload.schema === "pi.sci_explore_model.v1",
      exploreOperatorDetailPersisted,
      exploreModelSmallerThanOperator,
      exploreRendererWidthSafe: rendering.widthSafe,
      exploreCallConcise: rendering.callConcise,
      exploreCollapsedConcise: rendering.collapsedConcise,
      exploreExpandedReadable: rendering.expandedReadable,
      exploreDurableEntryReadable: rendering.durableReadable,
      locateUsedSingleNativeCall: locate.details.utilization.sciCompositeCalls.length === 1,
      locateDefinitionConfirmed,
      noDefinitionNonError,
      workspaceBoundaryActionable,
      workspaceBoundarySanitized,
      patchChecksUsedSingleNativeCall:
        patchChecks.details.utilization.sciCompositeCalls.length === 1,
      patchChecksPassed,
      patchChecksRemainedPreviewOnly: patchChecksPayload.applied !== true,
      structuralUsedSingleNativeCall: structural.details.utilization.sciCompositeCalls.length === 1,
      structuralChecksPassed,
      structuralRemainedPreviewOnly: structuralPayload.applied === false,
      structuralBackendWithheld,
      nexusWorkspaceStable,
      nexusStateBound,
      nexusSnapshotBound,
      previewLeftWorkspaceUnchanged: after === original,
      allSourceOutsideOntologyUnchanged: sourceInventoryUnchanged,
    },
    calls: [explore, locate, noDefinition, patchChecks, structural].map(summarize),
  };

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.ok) process.exitCode = 1;
} finally {
  for (const handler of shutdownHandlers) await handler();
  await rm(workspace, { recursive: true, force: true });
  await rm(outsideWorkspace, { recursive: true, force: true });
}

function verifyExploreRendering(args: Record<string, unknown>, result: NativeToolResult) {
  const tool = tools.get("explore_symbol_impact");
  if (!tool?.renderCall || !tool.renderResult) {
    throw new Error("explore renderCall/renderResult were not registered");
  }
  const context = {
    toolCallId: "dogfood-explore_symbol_impact",
    lastComponent: undefined,
  };
  const call = tool.renderCall(args, {}, context);
  const collapsed = tool.renderResult(result, { expanded: false, isPartial: false }, {}, context);
  const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, {}, context);
  const operatorEntry = customEntries.find(
    (entry) => entry.customType === "pi-sci-explore-operator-v1",
  );
  const entryRenderer = entryRenderers.get("pi-sci-explore-operator-v1");
  const durable =
    operatorEntry && entryRenderer
      ? entryRenderer({ data: operatorEntry.data }, { expanded: true }, {})
      : undefined;
  if (!durable) throw new Error("durable explore operator renderer was unavailable");

  const components = [call, collapsed, expanded, durable];
  const widths = [8, 20, 80];
  const widthSafe = widths.every((width) =>
    components.every((component) => component.render(width).every((line) => line.length <= width)),
  );
  const callText = call.render(120).join("\n");
  const collapsedText = collapsed.render(120).join("\n");
  const expandedText = expanded.render(120).join("\n");
  const durableText = durable.render(120).join("\n");
  return {
    widths,
    widthSafe,
    callConcise: callText.includes("SCI explore_symbol_impact") && !callText.includes("{"),
    collapsedConcise:
      collapsedText.includes("SCI explore [compact]") && !collapsedText.includes("{"),
    expandedReadable:
      expandedText.includes("Model projection (sent to the model):") &&
      expandedText.includes(
        "Operator packet (validated, disclosure-sanitized, bounded, TUI-only):",
      ),
    durableReadable: durableText.includes("Validated sanitized producer packet:"),
    callPreview: callText.slice(0, 200),
    collapsedPreview: collapsedText.slice(0, 300),
  };
}

async function execute(name: string, params: Record<string, unknown>): Promise<NativeToolResult> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`native tool not registered: ${name}`);
  return tool.execute(`dogfood-${name}`, params, new AbortController().signal, undefined, {
    cwd: workspace,
  });
}

async function executeExpectingFailure(
  name: string,
  params: Record<string, unknown>,
): Promise<{ threw: boolean; message: string }> {
  try {
    await execute(name, params);
    return { threw: false, message: "" };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : String(error) };
  }
}

function summarize(result: NativeToolResult) {
  const payload = parseToolPayload(result);
  return {
    workflow: result.details.workflow,
    transport: result.details.transport,
    elapsedMs: result.details.elapsedMs,
    utilization: result.details.utilization,
    domainOk:
      result.details.workflow === "explore_symbol_impact"
        ? payload.status === "confirmed"
        : payload.ok,
    applied: payload.applied,
    modelBytes: result.details.explorePresentation?.modelBytes,
    operatorBytes: result.details.explorePresentation?.operatorBytes,
    outputPreview: String(result.content[0]?.text ?? "").slice(0, 500),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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

function confirmedLocatePayload(payload: Record<string, unknown>): boolean {
  if (payload.workflow !== "locate_confirm_definition" || payload.ok !== true) return false;
  if (!Array.isArray(payload.definitions) || payload.definitions.length === 0) return false;
  return payload.definitions.every((definition) => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) return false;
    const uri = (definition as Record<string, unknown>).uri;
    return (
      typeof uri === "string" &&
      uri.length > 0 &&
      !uri.startsWith("file://") &&
      !path.posix.isAbsolute(uri) &&
      !path.win32.isAbsolute(uri) &&
      !uri.split(/[\\/]/).includes("..")
    );
  });
}

function previewChecksPassed(payload: Record<string, unknown>, workflow: string): boolean {
  if (payload.workflow !== workflow || payload.ok !== true || payload.applied === true)
    return false;
  if (workflow === "structural_patch_checks" && payload.applied !== false) return false;
  if (workflow === "structural_patch_checks") {
    if (!isWorkspaceRefV1(payload.workspace) || !isSnapshotRefV1(payload.snapshotRef)) return false;
    const checks = payload.checks;
    return (
      Boolean(checks) &&
      typeof checks === "object" &&
      !Array.isArray(checks) &&
      (checks as Record<string, unknown>).ok === true
    );
  }
  const validationPlan = payload.validationPlan;
  if (isSnapshotRefV1(payload.snapshotRef)) {
    const checks = record(payload.checks);
    return isWorkspaceRefV1(payload.workspace) && checks?.ok === true;
  }
  return (
    Boolean(validationPlan) &&
    typeof validationPlan === "object" &&
    !Array.isArray(validationPlan) &&
    (validationPlan as Record<string, unknown>).status === "checks_passed"
  );
}

async function inventoryWorkspaceSource(root: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];

  async function visit(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(root, relativeDir);
    const names = (await readdir(absoluteDir)).sort();
    for (const name of names) {
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      if (
        relativePath === ".ontology" ||
        relativePath.startsWith(".ontology/") ||
        relativePath === ".git" ||
        relativePath.startsWith(".git/")
      ) {
        continue;
      }
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
