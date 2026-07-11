import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import snapshotEditExtension from "../extensions/snapshot-edit.ts";

function createMockPi({ conflictingReadOwner } = {}) {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const flags = new Map();
  const catalog = new Map([
    [
      "read",
      {
        name: "read",
        sourceInfo: { source: conflictingReadOwner ?? "builtin", path: "<builtin:read>" },
      },
    ],
    ["edit", { name: "edit", sourceInfo: { source: "builtin", path: "<builtin:edit>" } }],
  ]);
  let activeTools = ["read", "edit"];
  const api = {
    registerTool(tool) {
      tools.set(tool.name, tool);
      catalog.set(tool.name, {
        name: tool.name,
        sourceInfo: { source: "pi-snapshot-edit", path: "extensions/snapshot-edit.ts" },
      });
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerFlag(name, flag) {
      flags.set(name, flag);
    },
    getFlag() {
      return false;
    },
    getAllTools() {
      return [...catalog.values()];
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(next) {
      activeTools = [...next];
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
  };
  return { api, tools, commands, handlers, flags, getActiveTools: () => activeTools };
}

test("extension registers host-compatible namespaced tools and edits duplicate lines", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);

  assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit"]);
  assert.equal(pi.commands.has("snapshot-edit"), true);
  assert.equal(pi.flags.has("snapshot-edit-override"), true);
  assert.equal(pi.handlers.has("session_shutdown"), true);
  assert.match(pi.tools.get("snapshot_edit").promptSnippet, /line-range edits/);

  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-extension-"));
  const path = join(directory, "duplicate.txt");
  await writeFile(path, "same\nsame\n", "utf8");
  const context = { cwd: directory };
  try {
    const readResult = await pi.tools
      .get("snapshot_read")
      .execute("read-call", { path: "duplicate.txt" }, undefined, undefined, context);
    const base = readResult.details.revision;
    assert.equal(base, "amber");

    const editResult = await pi.tools.get("snapshot_edit").execute(
      "edit-call",
      {
        path: "duplicate.txt",
        base,
        edits: [{ op: "replace", startLine: 2, endLine: 2, newText: "changed" }],
      },
      undefined,
      undefined,
      context,
    );
    assert.equal(editResult.details.baseRevision, "amber");
    assert.equal(await readFile(path, "utf8"), "same\nchanged\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit override command replaces standard names and preserves snapshot semantics", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });

  assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit", "read", "edit"]);
  assert.deepEqual(pi.getActiveTools(), ["read", "edit"]);
  assert.equal(typeof pi.tools.get("read").renderResult, "function");
  assert.equal(typeof pi.tools.get("edit").renderResult, "function");

  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-override-"));
  const path = join(directory, "duplicate.txt");
  await writeFile(path, "repeat\nrepeat\n", "utf8");
  const context = { cwd: directory };
  try {
    const readResult = await pi.tools
      .get("read")
      .execute("standard-read", { path: "duplicate.txt" }, undefined, undefined, context);
    const editArguments = {
      path: "duplicate.txt",
      base: readResult.details.revision,
      edits: [{ op: "replace", startLine: 2, endLine: 2, newText: "selected" }],
    };
    const prepared = pi.tools.get("edit").prepareArguments(editArguments);
    assert.deepEqual(prepared, editArguments);
    await pi.tools.get("edit").execute("standard-edit", prepared, undefined, undefined, context);
    assert.equal(await readFile(path, "utf8"), "repeat\nselected\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("standard read override fails closed for images instead of bypassing host authority", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-image-"));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(join(directory, "pixel.png"), png);
  try {
    await assert.rejects(
      pi.tools
        .get("read")
        .execute("image-read", { path: "pixel.png" }, undefined, undefined, { cwd: directory }),
      /Binary file is not supported/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("startup override waits for initialized session runtime", async () => {
  const previous = process.env.PI_SNAPSHOT_EDIT_OVERRIDE;
  process.env.PI_SNAPSHOT_EDIT_OVERRIDE = "1";
  try {
    const pi = createMockPi();
    snapshotEditExtension(pi.api);
    assert.equal(pi.tools.has("read"), false);
    await pi.handlers.get("session_start")();
    assert.equal(pi.tools.has("read"), true);
    assert.equal(pi.tools.has("edit"), true);
  } finally {
    if (previous === undefined) delete process.env.PI_SNAPSHOT_EDIT_OVERRIDE;
    else process.env.PI_SNAPSHOT_EDIT_OVERRIDE = previous;
  }
});

test("override refuses to displace a non-built-in read owner", async () => {
  const pi = createMockPi({ conflictingReadOwner: "ssh-extension" });
  snapshotEditExtension(pi.api);
  await assert.rejects(
    pi.commands.get("snapshot-edit").handler("override", { hasUI: false }),
    /non-built-in owners.*read:ssh-extension/,
  );
  assert.equal(pi.tools.has("read"), false);
  assert.equal(pi.tools.has("edit"), false);
});

test("legacy exact-text calls are converted into a deterministic reread diagnostic", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
  const editTool = pi.tools.get("edit");
  const prepared = editTool.prepareArguments({
    path: "example.ts",
    edits: [{ oldText: "duplicate", newText: "changed" }],
  });
  await assert.rejects(
    editTool.execute("legacy", prepared, undefined, undefined, { cwd: process.cwd() }),
    /retired exact-text schema.*Call read again/,
  );
});
