import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SciBridge, SciBridgeCallResult } from "../src/mcp-bridge.ts";
import {
  bindNexusArgs,
  localSciBridgeError,
  NEXUS_WORKSPACE_ENTRY_TYPE,
  NEXUS_WORKSPACE_MISMATCH_MESSAGE,
  nextPinnedNexusWorkspace,
  parseNexusHandshake,
  renderNexusWorkspaceEntry,
  restoreNexusWorkspaceEntry,
  type SnapshotRefV1,
  type WorkspacePathRefV1,
  type WorkspaceRefV1,
  type WorkspaceStateRefV1,
} from "../src/nexus-workspace.ts";
import type { SciCompositeToolName } from "../src/tool-definitions.ts";
import { createHarness, fakeEditRisk } from "./extension-test-helpers.ts";

const workspace: WorkspaceRefV1 = {
  schema: "semantic-code-intelligence.workspace_ref.v1",
  workspaceId: "wsp_0123456789abcdef0123456789abcdef",
};
const state: WorkspaceStateRefV1 = {
  schema: "semantic-code-intelligence.workspace_state_ref.v1",
  workspaceId: workspace.workspaceId,
  digest: `sha256:${"1".repeat(64)}`,
};
const pathRef: WorkspacePathRefV1 = {
  schema: "semantic-code-intelligence.workspace_path_ref.v1",
  workspaceId: workspace.workspaceId,
  path: "src/target.ts",
};
const snapshotRef: SnapshotRefV1 = {
  schema: "semantic-code-intelligence.snapshot_ref.v1",
  workspaceId: workspace.workspaceId,
  snapshotId: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  baseDigest: `sha256:${"2".repeat(64)}`,
  overlayDigest: `sha256:${"3".repeat(64)}`,
};

function result(payload: Record<string, unknown>): SciBridgeCallResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function requiredTool(harness: ReturnType<typeof createHarness>, name: string) {
  const tool = harness.tools.get(name);
  assert.ok(tool);
  return tool;
}

function payloadFor(name: SciCompositeToolName, args: Record<string, unknown>) {
  switch (name) {
    case "explore_symbol_impact":
      return {
        schemaVersion: 1,
        workflow: name,
        ok: true,
        symbol: String(args.symbol ?? "Target"),
        status: "confirmed",
        degraded: false,
        workspace,
        state,
        definition: { path: pathRef.path, pathRef, line: 1, kind: "function" },
        definitions: { count: 1 },
        impact: {
          files: [
            { path: pathRef.path, pathRef, score: 120, reasons: ["definition"], signals: [] },
          ],
          totalFiles: 1,
          truncated: false,
        },
        editRisk: fakeEditRisk(),
        nextReads: [{ path: pathRef.path, pathRef, reason: "Start at the confirmed definition." }],
        limitations: [],
        details: "mode: standard",
      };
    case "locate_confirm_definition":
      return {
        workflow: name,
        ok: true,
        symbol: String(args.symbol ?? "Target"),
        decision: "fast",
        attempts: [{ mode: "fast", count: 1 }],
        definitions: [{ uri: pathRef.path, pathRef }],
        workspace,
        state,
      };
    case "patch_checks_in_snapshot":
      return {
        workflow: name,
        ok: true,
        workspace,
        snapshot: snapshotRef.snapshotId,
        snapshotRef,
        stage: { accepted: true, snapshotRef },
        checks: { ok: true },
      };
    case "structural_patch_checks":
      return {
        workflow: name,
        ok: true,
        workspace,
        snapshot: snapshotRef.snapshotId,
        snapshotRef,
        applied: false,
        checks: { ok: true },
      };
    case "rename_safely":
      return {
        workflow: name,
        ok: true,
        workspace,
        snapshot: snapshotRef.snapshotId,
        snapshotRef,
        filesAffected: 1,
        totalEdits: 1,
      };
  }
}

test("handshake validation and binding preserve opaque workspace lineage", () => {
  const handshake = parseNexusHandshake(
    result({ workspace, snapshot: snapshotRef.snapshotId, snapshotRef }),
  );
  assert.deepEqual(handshake.workspace, workspace);
  assert.deepEqual(bindNexusArgs({ symbol: "Target" }, handshake), {
    symbol: "Target",
    workspace,
  });

  assert.throws(() =>
    parseNexusHandshake(
      result({
        workspace,
        snapshotRef: { ...snapshotRef, workspaceId: "wsp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      }),
    ),
  );
});

test("all four Pi doors inject one workspace and preserve NEXUS result references", async () => {
  const calls: Array<{ name: SciCompositeToolName; args: Record<string, unknown>; cwd: string }> =
    [];
  const bridge: SciBridge = {
    async bindArgs(_name, args) {
      return { ...args, workspace };
    },
    async callTool(name, args, cwd) {
      calls.push({ name, args, cwd });
      return result(payloadFor(name, args));
    },
    async advertisedToolNames() {
      return [
        "explore_symbol_impact",
        "locate_confirm_definition",
        "patch_checks_in_snapshot",
        "structural_patch_checks",
        "rename_safely",
      ];
    },
    async close() {},
  };
  const harness = createHarness(bridge);

  const explored = await requiredTool(harness, "explore_symbol_impact").execute(
    "nexus-explore",
    { symbol: "Target" },
    undefined,
    undefined,
    {
      cwd: "/workspace/repo",
    },
  );
  const exploreModel = JSON.parse(explored.content[0].text);
  assert.deepEqual(exploreModel.workspace, workspace);
  assert.deepEqual(exploreModel.state, state);
  assert.deepEqual(exploreModel.definition.pathRef, pathRef);

  const located = await requiredTool(harness, "locate_confirm_definition").execute(
    "nexus-locate",
    { symbol: "Target", state },
    undefined,
    undefined,
    {
      cwd: "/workspace/repo",
    },
  );
  assert.deepEqual(JSON.parse(located.content[0].text).workspace, workspace);

  const patch = await requiredTool(harness, "preview_patch_checks").execute(
    "nexus-patch",
    { patch: "diff --git a/a b/a" },
    undefined,
    undefined,
    {
      cwd: "/workspace/repo",
    },
  );
  assert.deepEqual(JSON.parse(patch.content[0].text).snapshotRef, snapshotRef);

  const structural = await requiredTool(harness, "preview_patch_checks").execute(
    "nexus-structural",
    { language: "ts", pattern: "const $A = $B", rewrite: "let $A = $B" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  assert.deepEqual(JSON.parse(structural.content[0].text).workspace, workspace);

  const renamed = await requiredTool(harness, "rename_safely").execute(
    "nexus-rename",
    { oldName: "old", newName: "next" },
    undefined,
    undefined,
    {
      cwd: "/workspace/repo",
    },
  );
  assert.deepEqual(JSON.parse(renamed.content[0].text).snapshotRef, snapshotRef);

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.deepEqual(call.args.workspace, workspace);
    assert.equal(call.cwd, "/workspace/repo");
  }
});

test("forged NEXUS result references fail closed before model projection", async () => {
  const bridge: SciBridge = {
    async bindArgs(_name, args) {
      return { ...args, workspace };
    },
    async callTool() {
      return result({
        ...payloadFor("locate_confirm_definition", { symbol: "Target" }),
        workspace: { ...workspace, workspaceId: "/srv/private" },
      });
    },
    async advertisedToolNames() {
      return ["locate_confirm_definition"];
    },
    async close() {},
  };
  const harness = createHarness(bridge);
  const output = await requiredTool(harness, "locate_confirm_definition").execute(
    "forged",
    { symbol: "Target" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  const parsed = JSON.parse(output.content[0].text);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "indeterminate");
  assert.doesNotMatch(output.content[0].text, /\/srv\/private/);
});

test("session restore helpers keep opaque workspace lineage and reject drift", () => {
  const entry = { schema: "pi.sci_nexus_workspace.v1" as const, workspace };
  assert.deepEqual(
    restoreNexusWorkspaceEntry([
      { type: "message" },
      { type: "custom", customType: NEXUS_WORKSPACE_ENTRY_TYPE, data: entry },
    ]),
    entry,
  );
  assert.equal(nextPinnedNexusWorkspace(undefined, workspace)?.persist, true);
  assert.equal(nextPinnedNexusWorkspace(workspace, workspace)?.persist, false);
  assert.throws(
    () =>
      nextPinnedNexusWorkspace(workspace, {
        ...workspace,
        workspaceId: "wsp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    { message: NEXUS_WORKSPACE_MISMATCH_MESSAGE },
  );
  assert.equal(
    localSciBridgeError(new Error("SCI NEXUS handshake returned an invalid reference contract"))
      ?.message,
    "SCI NEXUS handshake returned an invalid reference contract",
  );
  assert.equal(localSciBridgeError(new Error("boom")), undefined);
  assert.deepEqual(renderNexusWorkspaceEntry(entry, false).render(80), [
    "SCI NEXUS workspace bound",
  ]);
});

test("opaque workspace ref persists TUI-only and restores without duplicating", async () => {
  const bridge: SciBridge = {
    async bindArgs(_name, args) {
      return { ...args, workspace };
    },
    async callTool(name, args) {
      return result(payloadFor(name, args));
    },
    async advertisedToolNames() {
      return ["locate_confirm_definition"];
    },
    async close() {},
  };
  const harness = createHarness(bridge);
  await requiredTool(harness, "locate_confirm_definition").execute(
    "nexus-persist",
    { symbol: "Target" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  const persisted = harness.customEntries.filter(
    (entry) => entry.customType === NEXUS_WORKSPACE_ENTRY_TYPE,
  );
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0]?.data, { schema: "pi.sci_nexus_workspace.v1", workspace });

  const session = SessionManager.inMemory("/workspace/repo");
  session.appendCustomEntry(NEXUS_WORKSPACE_ENTRY_TYPE, persisted[0]?.data);
  assert.match(JSON.stringify(session.getEntries()), /wsp_0123456789abcdef0123456789abcdef/);
  assert.doesNotMatch(
    JSON.stringify(session.buildSessionContext()),
    /wsp_0123456789abcdef0123456789abcdef/,
  );

  await harness.emit("session_start");
  await requiredTool(harness, "locate_confirm_definition").execute(
    "nexus-restore",
    { symbol: "Target" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  assert.equal(
    harness.customEntries.filter((entry) => entry.customType === NEXUS_WORKSPACE_ENTRY_TYPE).length,
    1,
  );
});

test("session-restored workspace identity mismatch fails closed", async () => {
  let current = workspace;
  const bridge: SciBridge = {
    async bindArgs(_name, args) {
      return { ...args, workspace: current };
    },
    async callTool(name, args) {
      return result(payloadFor(name, args));
    },
    async advertisedToolNames() {
      return ["locate_confirm_definition"];
    },
    async close() {},
  };
  const harness = createHarness(bridge);
  await requiredTool(harness, "locate_confirm_definition").execute(
    "nexus-first",
    { symbol: "Target" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  await harness.emit("session_start");
  current = {
    schema: "semantic-code-intelligence.workspace_ref.v1",
    workspaceId: "wsp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  await assert.rejects(
    () =>
      requiredTool(harness, "locate_confirm_definition").execute(
        "nexus-mismatch",
        { symbol: "Target" },
        undefined,
        undefined,
        { cwd: "/workspace/repo" },
      ),
    { message: NEXUS_WORKSPACE_MISMATCH_MESSAGE },
  );
});
